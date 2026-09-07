/**
 * 이카ount ERP Playwright 봇 — 재고현황 엑셀 다운로드 → Supabase ecount_items
 *
 * 로컬: npx tsx scripts/ecountBot.ts
 * GitHub Actions: .github/workflows/sync-inventory.yml
 *
 * 환경변수:
 *   ECOUNT_COM_CODE, ECOUNT_ID, ECOUNT_PW  — 웹 로그인
 *   ECOUNT_STOCK_MENU_URL (권장)           — 재고현황 화면 URL (브라우저 주소창 복사)
 *   ECOUNT_STOCK_MENU_DEPTH1/2 (선택)      — 메뉴 CSS selector (URL 없을 때)
 *   ECOUNT_STOCK_DOWNLOAD_ONLY=1           — Phase1: 엑셀 다운로드·검증만 (Supabase 업로드 생략)
 *   ECOUNT_STOCK_SEARCH_ONLY=1             — 검색(F8)→결과까지만 (Excel 생략)
 *   ECOUNT_BOT_TARGET=lot                  — 로트/시리얼 봇(legacy) 실행
 *   ECOUNT_BOT_TARGET=ledger               — 재고수불부 (ECOUNT_LEDGER_PROD_CD 필수)
 */
import * as fs from "fs";
import * as path from "path";
import * as XLSX from "xlsx";
import { chromium, type Page } from "playwright";
import { parseEcountStockExcel } from "../src/lib/ecountStockExcelParser";
import { uploadEcountStockRows } from "../src/lib/ecountStockExcelUpload";
import { resolveEcountBotCredentials } from "../src/lib/ecountBotConfig";
import { loginEcountWeb } from "./ecountLogin";
import { navigateToStockReport, runStockSearchAfterNavigate } from "./ecountNavigateStock";
import { clickExcelDownload, findVisibleExcelButton, isStockResultsReady } from "./ecountExcel";

const envPath = fs.existsSync(".env.local") ? ".env.local" : ".env";
require("dotenv").config({ path: envPath });

const DOWNLOAD_DIR = path.join(process.cwd(), "downloads");
const STOCK_FILE = path.join(DOWNLOAD_DIR, "ecount_stock.xlsx");
const STALE_LOT_FILE = path.join(DOWNLOAD_DIR, "ecount_inventory.xlsx");

function isStockDownloadOnly(): boolean {
  return (process.env.ECOUNT_STOCK_DOWNLOAD_ONLY || "").trim() === "1";
}

function isStockEntryOnly(): boolean {
  return (process.env.ECOUNT_STOCK_ENTRY_ONLY || "").trim() === "1";
}

function isStockSearchOnly(): boolean {
  return (process.env.ECOUNT_STOCK_SEARCH_ONLY || "").trim() === "1";
}

async function saveDebugScreenshot(page: Page, name: string) {
  if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
  const file = path.join(DOWNLOAD_DIR, name);
  await page.screenshot({ path: file, fullPage: true }).catch(() => {});
  console.log(`📸 디버그 스크린샷: ${file}`);
}

async function loginEcount(
  page: Page,
  creds: { com_code: string; login_id: string; login_pw: string }
) {
  await loginEcountWeb(page, creds);
}

/** 이번 실행 오염 방지: 재고현황 결과/로트 잔존 파일만 제거 (스크린샷 유지) */
function prepareStockDownloadWorkspace() {
  if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

  for (const f of [STOCK_FILE, STALE_LOT_FILE]) {
    if (fs.existsSync(f)) {
      fs.unlinkSync(f);
      console.log(`[STOCK] 기존 파일 삭제: ${path.resolve(f)}`);
    }
  }

  // 이전 실행 tmp 잔존 정리
  for (const name of fs.readdirSync(DOWNLOAD_DIR)) {
    if (/^tmp-stock-.*\.xlsx$/i.test(name)) {
      const p = path.join(DOWNLOAD_DIR, name);
      fs.unlinkSync(p);
      console.log(`[STOCK] tmp 파일 삭제: ${path.resolve(p)}`);
    }
  }
}

function findHeaderRow(rows: unknown[][]): { index: number; headers: string[] } {
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const headers = (rows[i] as unknown[]).map((c) => String(c ?? "").trim());
    const joined = headers.join("|");
    if (/품목코드|PROD_CD|Item Code/i.test(joined)) {
      return { index: i, headers };
    }
  }
  // fallback: first non-empty row
  for (let i = 0; i < Math.min(rows.length, 5); i++) {
    const headers = (rows[i] as unknown[]).map((c) => String(c ?? "").trim());
    if (headers.some((h) => h)) return { index: i, headers };
  }
  return { index: -1, headers: [] };
}

/**
 * 이번 실행에서 Playwright download로 받은 재고현황 Excel만 검증.
 * 시리얼/로트 시트·컬럼이면 실패.
 */
function verifyStockExcelFile(filePath: string): {
  size: number;
  sheets: string[];
  headers: string[];
  dataRows: number;
} {
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) {
    throw new Error(`[STOCK] Excel 파일 없음 (이번 다운로드 결과 아님): ${abs}`);
  }

  const size = fs.statSync(abs).size;
  if (size <= 0) {
    throw new Error(`[STOCK] Excel 파일 크기 0: ${abs}`);
  }

  const workbook = XLSX.read(fs.readFileSync(abs), { type: "buffer" });
  const sheets = workbook.SheetNames || [];
  if (sheets.length === 0) {
    throw new Error(`[STOCK] Excel에 시트가 없습니다: ${abs}`);
  }

  const sheetName = sheets[0];
  const sheet = workbook.Sheets[sheetName];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  const { index: headerRow, headers } = findHeaderRow(rows);

  console.log("[STOCK EXCEL DEBUG]");
  console.log(`download path=${abs}`);
  console.log(`file size=${size}`);
  console.log(`sheet names=${sheets.join(" | ")}`);
  console.log(`header row=${headerRow}`);
  console.log(`headers=${headers.join(" | ")}`);

  // 시리얼/로트 파일 거부
  const sheetBlob = sheets.join(" ");
  if (/시리얼|로트No|로트\s*No|Serial|Lot/i.test(sheetBlob)) {
    throw new Error(
      `[STOCK] 재고현황 Excel이 아님 — sheet="${sheetName}". (시리얼/로트 내역 파일은 DOWNLOAD_OK 불가)`
    );
  }
  const headerBlob = headers.join("|");
  if (/시리얼\s*\/?\s*로트|연결전표|유효기한|전표구분/i.test(headerBlob) && !/품목코드/i.test(headerBlob)) {
    throw new Error(`[STOCK] 재고현황 컬럼 없음 — 시리얼/로트 형식 headers=${headerBlob}`);
  }

  if (headerRow < 0 || !/품목코드/i.test(headerBlob)) {
    throw new Error(
      `[STOCK] 재고현황 헤더(품목코드) 없음. sheet=${sheetName} headers=${headerBlob || "(empty)"}`
    );
  }

  const hasName = /품목명/i.test(headerBlob);
  const hasQty = /재고수량|실재고|^수량$/i.test(headerBlob.replace(/\s+/g, ""));
  if (!hasName) {
    console.warn("[STOCK EXCEL DEBUG] 경고: 품목명 컬럼이 헤더에서 명확히 보이지 않음");
  }
  if (!hasQty) {
    throw new Error(`[STOCK] 재고수량 컬럼 없음. headers=${headerBlob}`);
  }

  const dataRows = rows
    .slice(headerRow + 1)
    .filter((r) => Array.isArray(r) && r.some((c) => String(c ?? "").trim() !== "")).length;
  if (dataRows < 1) {
    throw new Error(`[STOCK] 재고현황 데이터 행이 없습니다: ${abs}`);
  }

  // parser가 기대하는 최소 구조도 통과하는지 (업로드는 하지 않음)
  try {
    const parsed = parseEcountStockExcel(fs.readFileSync(abs));
    console.log(`[STOCK] parser smoke rows=${parsed.rows.length} skipped=${parsed.skippedRows}`);
    if (parsed.rows.length < 1) {
      throw new Error("parser가 유효 행 0건");
    }
  } catch (e) {
    throw new Error(
      `[STOCK] 재고현황 Excel 파서 검증 실패: ${e instanceof Error ? e.message : e}`
    );
  }

  console.log("[STOCK] 재고현황 Excel 검증 완료");
  console.log(`[STOCK] 데이터 행 수=${dataRows}`);
  console.log(`📁 경로: ${abs}`);
  console.log(`📦 파일 크기: ${size} bytes`);
  console.log(`📑 Sheet: ${sheets.join(", ")}`);

  return { size, sheets, headers, dataRows };
}

async function downloadExcelFromFrames(page: Page, finalPath: string) {
  console.log("4. 엑셀 다운로드 버튼 탐색...");
  prepareStockDownloadWorkspace();

  const runId = `${Date.now()}-${process.pid}`;
  const tempPath = path.join(DOWNLOAD_DIR, `tmp-stock-${runId}.xlsx`);

  for (let attempt = 0; attempt < 4; attempt++) {
    if (!(await isStockResultsReady(page))) {
      console.log(`   → 결과 화면 아님 — 검색(F8) 재시도 (${attempt + 1}/4)`);
      await runStockSearchAfterNavigate(page);
    }

    // 매 시도 전 temp/최종 파일 제거 — 이전 시도 잔존으로 성공 판정 금지
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    if (fs.existsSync(finalPath)) fs.unlinkSync(finalPath);

    try {
      const dl = await clickExcelDownload(page, tempPath);
      if (!dl.fromDownloadEvent) {
        throw new Error("Playwright download 이벤트 없이 파일을 저장하려 함");
      }
      if (!fs.existsSync(tempPath) || fs.statSync(tempPath).size <= 0) {
        throw new Error(`download 이벤트 후 파일 없음/0bytes: ${tempPath}`);
      }

      // 검증은 temp에서 — 통과 후만 ecount_stock.xlsx 로 이동
      verifyStockExcelFile(tempPath);
      fs.renameSync(tempPath, finalPath);
      console.log(`[STOCK] 최종 저장: ${path.resolve(finalPath)}`);
      return;
    } catch (err) {
      console.warn(`   Excel 클릭/검증 실패 (${attempt + 1}/4):`, err instanceof Error ? err.message : err);
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    }

    for (const frame of page.frames()) {
      await frame.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {});
    }
    await page.waitForTimeout(5000);
  }

  const found = await findVisibleExcelButton(page);
  const ready = await isStockResultsReady(page);
  console.log(`   frames=${page.frames().length}, excel=${found ? "found" : "none"}, ready=${ready}, url=${page.url()}`);

  throw new Error(
    "엑셀 다운로드 실패. Playwright download 이벤트 + 재고현황(품목코드/재고수량) 검증을 통과하지 못했습니다."
  );
}

async function uploadStockExcelFile(filePath: string) {
  console.log("5. 엑셀 파싱 및 Supabase 업로드...");
  const buffer = fs.readFileSync(filePath);
  const parsed = parseEcountStockExcel(buffer);
  console.log(`   파싱 ${parsed.rows.length}건 (스킵 ${parsed.skippedRows}행)`);
  const upload = await uploadEcountStockRows(parsed.rows);
  if (!upload.success) throw new Error(upload.error || "업로드 실패");
  console.log(`🎉 DB 반영 완료: ${upload.count}건 (${upload.synced_at})`);
  return upload;
}

/** 재고현황 엑셀 → ecount_items (소수점 포함) */
export async function runEcountStockBot() {
  const downloadOnly = isStockDownloadOnly();
  const entryOnly = isStockEntryOnly();
  const searchOnly = isStockSearchOnly();
  console.log(
    `\n🤖 이카ount 재고현황 엑셀 봇 시작${
      entryOnly
        ? " [Phase1-2 ENTRY_ONLY]"
        : searchOnly
          ? " [Phase1 SEARCH_ONLY]"
          : downloadOnly
            ? " [Phase1 DOWNLOAD_ONLY]"
            : ""
    }\n`
  );

  // 시작 시 오염 파일 제거 (SEARCH_ONLY여도 artifact 혼동 방지)
  prepareStockDownloadWorkspace();

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    acceptDownloads: true,
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();

  try {
    const creds = await resolveEcountBotCredentials();
    if (!creds) {
      throw new Error(
        "이카ount 로그인 정보 없음. /admin/ecount-bot 에서 회사코드·ID·비밀번호를 저장하거나 GitHub Secrets(ECOUNT_*)를 설정하세요."
      );
    }
    console.log(`   로그인 정보: ${creds.source === "database" ? "워크스페이스 DB" : "환경변수"}`);

    await loginEcount(page, creds);
    await navigateToStockReport(page, {
      stock_menu_url: creds.stock_menu_url,
      stock_menu_depth1: creds.stock_menu_depth1,
      stock_menu_depth2: creds.stock_menu_depth2,
    });

    if (entryOnly) {
      console.log("🎯 Phase1-2 ENTRY_OK — Excel/Supabase 단계 생략");
      return { ok: true, entryOnly: true as const };
    }

    if (searchOnly) {
      console.log("🎯 Phase1 SEARCH_OK — Excel/Supabase 단계 생략");
      return { ok: true, searchOnly: true as const };
    }

    await downloadExcelFromFrames(page, STOCK_FILE);

    if (downloadOnly) {
      console.log("🎯 DOWNLOAD_OK");
      return { ok: true, path: STOCK_FILE, downloadOnly: true as const };
    }

    return await uploadStockExcelFile(STOCK_FILE);
  } catch (err) {
    await saveDebugScreenshot(page, "ecount-bot-error.png");
    await saveDebugScreenshot(page, "ecount-stock-failure.png");
    console.error(`   [STOCK] 실패 url=${page.url().slice(0, 160)}`);
    console.error(`   [STOCK] frames=${page.frames().length}`);
    throw err;
  } finally {
    await browser.close();
  }
}

/** legacy: 시리얼/로트 엑셀 → ecount_inventory */
async function runEcountLotBot() {
  const { runEcountLotBotLegacy } = await import("./ecountBotLot");
  return runEcountLotBotLegacy();
}

async function main() {
  const target = (process.env.ECOUNT_BOT_TARGET || "stock").toLowerCase();
  if (target === "lot") {
    await runEcountLotBot();
  } else if (target === "ledger") {
    const { runEcountLedgerBot } = await import("./ecountLedgerBot");
    await runEcountLedgerBot();
  } else if (target === "ledger_bulk") {
    const { runEcountLedgerBulkBot } = await import("./ecountLedgerBot");
    await runEcountLedgerBulkBot();
  } else {
    await runEcountStockBot();
  }
}

main().catch((e) => {
  console.error("❌ 봇 실패:", e?.message || e);
  process.exit(1);
});

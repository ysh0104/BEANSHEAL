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

function isStockDownloadOnly(): boolean {
  return (process.env.ECOUNT_STOCK_DOWNLOAD_ONLY || "").trim() === "1";
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

/** Phase1: 다운로드된 엑셀 파일 존재·크기·시트·행수 검증 */
function verifyStockExcelFile(filePath: string): {
  size: number;
  sheets: string[];
  dataRows: number;
} {
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) {
    throw new Error(`[STOCK] Excel 파일 없음: ${abs}`);
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

  const sheet = workbook.Sheets[sheets[0]];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  const dataRows = rows.filter((r) => Array.isArray(r) && r.some((c) => String(c ?? "").trim() !== "")).length;
  if (dataRows < 1) {
    throw new Error(`[STOCK] Excel에 데이터 행이 없습니다: ${abs}`);
  }

  console.log("✅ [STOCK] Excel 저장 성공");
  console.log(`📁 경로: ${abs}`);
  console.log(`📦 파일 크기: ${size} bytes`);
  console.log(`📑 Sheet: ${sheets.join(", ")}`);
  console.log(`📊 데이터 행 수: ${dataRows}`);

  return { size, sheets, dataRows };
}

async function downloadExcelFromFrames(page: Page, saveAs: string) {
  console.log("4. 엑셀 다운로드 버튼 탐색...");
  if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

  for (let attempt = 0; attempt < 4; attempt++) {
    if (!(await isStockResultsReady(page))) {
      console.log(`   → 결과 화면 아님 — 검색(F8) 재시도 (${attempt + 1}/4)`);
      await runStockSearchAfterNavigate(page);
    }

    try {
      await clickExcelDownload(page, saveAs);
      console.log(`✅ 엑셀 저장: ${saveAs}`);
      return;
    } catch (err) {
      console.warn(`   Excel 클릭 실패 (${attempt + 1}/4):`, err instanceof Error ? err.message : err);
    }

    for (const frame of page.frames()) {
      await frame.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {});
    }
    await page.waitForTimeout(5000);
  }

  const found = await findVisibleExcelButton(page);
  const ready = await isStockResultsReady(page);
  console.log(`   frames=${page.frames().length}, excel=${found ? "found" : "none"}, ready=${ready}, url=${page.url()}`);

  throw new Error("엑셀 다운로드 실패. 검색(F8) 후 결과 화면(품목코드+Excel)까지 이동하지 못했습니다.");
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
  console.log(`\n🤖 이카ount 재고현황 엑셀 봇 시작${downloadOnly ? " [Phase1 DOWNLOAD_ONLY]" : ""}\n`);
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
    await downloadExcelFromFrames(page, STOCK_FILE);
    verifyStockExcelFile(STOCK_FILE);

    if (downloadOnly) {
      console.log("🎯 Phase1 DOWNLOAD_OK — Supabase 업로드 생략");
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

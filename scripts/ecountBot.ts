/**
 * 이카ount ERP Playwright 봇 — 재고현황 엑셀 다운로드 → Supabase ecount_items
 *
 * 로컬: npx tsx scripts/ecountBot.ts
 * GitHub Actions: .github/workflows/sync-inventory.yml
 *
 * 환경변수:
 *   ECOUNT_COM_CODE, ECOUNT_ID, ECOUNT_PW  — 웹 로그인
 *   ECOUNT_STOCK_MENU_DEPTH1/2 (선택)      — 메뉴 CSS selector (못 찾을 때)
 *   ECOUNT_BOT_TARGET=lot                  — 로트/시리얼 봇(legacy) 실행
 */
import * as fs from "fs";
import * as path from "path";
import { chromium, type Page } from "playwright";
import { parseEcountStockExcel } from "../src/lib/ecountStockExcelParser";
import { uploadEcountStockRows } from "../src/lib/ecountStockExcelUpload";
import { resolveEcountBotCredentials } from "../src/lib/ecountBotConfig";
import { loginEcountWeb } from "./ecountLogin";

const envPath = fs.existsSync(".env.local") ? ".env.local" : ".env";
require("dotenv").config({ path: envPath });

const DOWNLOAD_DIR = path.join(process.cwd(), "downloads");
const STOCK_FILE = path.join(DOWNLOAD_DIR, "ecount_stock.xlsx");

async function clickInAnyFrame(page: Page, selector: string): Promise<boolean> {
  for (const frame of page.frames()) {
    const loc = frame.locator(selector).first();
    try {
      if ((await loc.count()) > 0 && (await loc.isVisible())) {
        await loc.click();
        return true;
      }
    } catch {
      /* frame 접근 불가 */
    }
  }
  return false;
}

async function clickTextInAnyFrame(page: Page, pattern: RegExp | string): Promise<boolean> {
  for (const frame of page.frames()) {
    const loc = frame.locator("a, span, li, div, button").filter({ hasText: pattern }).first();
    try {
      if ((await loc.count()) > 0 && (await loc.isVisible())) {
        await loc.click();
        return true;
      }
    } catch {
      /* skip */
    }
  }
  return false;
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

async function dismissPopups(page: Page) {
  for (const pattern of [/확인/, /닫기/, /오늘 하루/, /close/i]) {
    try {
      await clickTextInAnyFrame(page, pattern);
      await page.waitForTimeout(500);
    } catch {
      /* ignore */
    }
  }
}

async function openStockBalanceReport(
  page: Page,
  menu?: { stock_menu_depth1?: string; stock_menu_depth2?: string }
) {
  const d1 = menu?.stock_menu_depth1 || process.env.ECOUNT_STOCK_MENU_DEPTH1;
  const d2 = menu?.stock_menu_depth2 || process.env.ECOUNT_STOCK_MENU_DEPTH2;

  console.log("2. 재고현황 메뉴 이동...");
  await dismissPopups(page);

  if (d1 && d2) {
    if (!(await clickInAnyFrame(page, d1))) throw new Error(`메뉴 클릭 실패: ${d1}`);
    await page.waitForTimeout(2000);
    if (!(await clickInAnyFrame(page, d2))) throw new Error(`메뉴 클릭 실패: ${d2}`);
  } else {
    // 마이페이지 → 상단 ERP 메뉴바 「재고(1)」 클릭 후 하위 「재고현황」
    const openedStockModule =
      (await clickTextInAnyFrame(page, /재고\s*\(1\)|재고\s*\(I\)|재고Ⅰ|재고Ⅱ/)) ||
      (await clickTextInAnyFrame(page, /^재고$/));

    if (!openedStockModule) {
      console.log("   → 상단 재고 메뉴 미발견, 메뉴 트리 ID 시도...");
      await clickInAnyFrame(page, "#link_depth1_MENUTREE_000782");
      await clickInAnyFrame(page, "#link_depth1_MENUTREE_000783");
    }

    await page.waitForTimeout(2500);
    await dismissPopups(page);

    if (!(await clickTextInAnyFrame(page, /재고현황/))) {
      await clickTextInAnyFrame(page, /재고수불부|재고\s*현황/);
      await page.waitForTimeout(1500);
      await clickTextInAnyFrame(page, /재고현황/);
    }
  }

  await page.waitForTimeout(2000);
  await clickTextInAnyFrame(page, /^조회$|^검색$|^Search$|F8/i);
  console.log("3. 데이터 로딩 대기 (20초)...");
  await page.waitForTimeout(20000);
}

async function downloadExcelFromFrames(page: Page, saveAs: string) {
  console.log("4. 엑셀 다운로드 버튼 탐색...");
  const selectors = [
    "#outputExcel",
    '[id*="outputExcel"]',
    "#btnExcel",
    '[id*="btnExcel"]',
    '[title*="엑셀"]',
    '[title*="Excel"]',
    'button:has-text("엑셀")',
    'a:has-text("엑셀")',
    'span:has-text("엑셀")',
    'img[alt*="엑셀"]',
    'img[alt*="excel" i]',
  ];

  for (let attempt = 0; attempt < 3; attempt++) {
    for (const frame of page.frames()) {
      for (const sel of selectors) {
        const btn = frame.locator(sel).first();
        try {
          if ((await btn.count()) > 0 && (await btn.isVisible())) {
            const [download] = await Promise.all([
              page.waitForEvent("download", { timeout: 90000 }),
              btn.click(),
            ]);
            if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
            await download.saveAs(saveAs);
            console.log(`✅ 엑셀 저장: ${saveAs}`);
            return;
          }
        } catch {
          /* retry */
        }
      }
    }
    console.log(`   엑셀 버튼 재탐색 (${attempt + 1}/3)...`);
    await page.waitForTimeout(5000);
  }

  throw new Error("엑셀 다운로드 버튼을 찾지 못했습니다. /admin/ecount-bot 에서 메뉴 selector를 설정하세요.");
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
  console.log("\n🤖 이카ount 재고현황 엑셀 봇 시작\n");
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
    await openStockBalanceReport(page, creds);
    await downloadExcelFromFrames(page, STOCK_FILE);
    return await uploadStockExcelFile(STOCK_FILE);
  } catch (err) {
    await saveDebugScreenshot(page, "ecount-bot-error.png");
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
  } else {
    await runEcountStockBot();
  }
}

main().catch((e) => {
  console.error("❌ 봇 실패:", e?.message || e);
  process.exit(1);
});

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

async function loginEcount(page: Page) {
  if (!process.env.ECOUNT_COM_CODE || !process.env.ECOUNT_ID || !process.env.ECOUNT_PW) {
    throw new Error("ECOUNT_COM_CODE, ECOUNT_ID, ECOUNT_PW 환경변수가 필요합니다.");
  }

  console.log("1. 이카ount 로그인...");
  await page.goto("https://login.ecount.com/Login/", { waitUntil: "domcontentloaded" });
  await page.fill('input[name="com_code"]', process.env.ECOUNT_COM_CODE);
  await page.fill('input[name="id"]', process.env.ECOUNT_ID);
  await page.fill('input[name="passwd"]', process.env.ECOUNT_PW);
  await page.press('input[name="passwd"]', "Enter");
  await page.waitForURL(/.*(OnetLogin\/Main|view\/erp).*/, { timeout: 45000 });
  console.log("✅ 로그인 성공");
  await page.waitForTimeout(3000);
}

async function openStockBalanceReport(page: Page) {
  const d1 = process.env.ECOUNT_STOCK_MENU_DEPTH1;
  const d2 = process.env.ECOUNT_STOCK_MENU_DEPTH2;

  console.log("2. 재고현황 메뉴 이동...");
  if (d1 && d2) {
    if (!(await clickInAnyFrame(page, d1))) throw new Error(`메뉴 클릭 실패: ${d1}`);
    await page.waitForTimeout(2000);
    if (!(await clickInAnyFrame(page, d2))) throw new Error(`메뉴 클릭 실패: ${d2}`);
  } else if (await clickTextInAnyFrame(page, /재고현황/)) {
    console.log("   → '재고현황' 텍스트 메뉴 클릭");
  } else {
    await clickTextInAnyFrame(page, /^재고$/);
    await page.waitForTimeout(2000);
    if (!(await clickTextInAnyFrame(page, /재고현황/))) {
      throw new Error(
        "재고현황 메뉴를 찾지 못했습니다. GitHub Secrets에 ECOUNT_STOCK_MENU_DEPTH1/2 를 설정하세요. (docs/ecount-bot-setup.md 참고)"
      );
    }
  }

  await page.waitForTimeout(2000);
  await clickTextInAnyFrame(page, /^조회$|^검색$|^Search$/i);
  console.log("3. 데이터 로딩 대기 (12초)...");
  await page.waitForTimeout(12000);
}

async function downloadExcelFromFrames(page: Page, saveAs: string) {
  console.log("4. 엑셀 다운로드 버튼 탐색...");
  for (const frame of page.frames()) {
    for (const sel of ["#outputExcel", '[id*="outputExcel"]', 'button:has-text("엑셀")', 'a:has-text("엑셀")']) {
      const btn = frame.locator(sel).first();
      try {
        if ((await btn.count()) > 0 && (await btn.isVisible())) {
          const [download] = await Promise.all([
            page.waitForEvent("download", { timeout: 60000 }),
            btn.click(),
          ]);
          if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
          await download.saveAs(saveAs);
          console.log(`✅ 엑셀 저장: ${saveAs}`);
          return;
        }
      } catch {
        /* 다음 selector 시도 */
      }
    }
  }
  throw new Error("엑셀 다운로드 버튼(#outputExcel)을 찾지 못했습니다.");
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
    await loginEcount(page);
    await openStockBalanceReport(page);
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

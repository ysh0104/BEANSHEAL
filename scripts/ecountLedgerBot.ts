/**
 * 재고수불부 봇 — ecountBot.ts(재고현황) 미러
 *
 * 로컬: ECOUNT_BOT_TARGET=ledger_bulk npx tsx scripts/ecountBot.ts
 */
import * as fs from "fs";
import * as path from "path";
import { chromium, type Page } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { resolveEcountBotCredentials } from "../src/lib/ecountBotConfig";
import { getLedgerBotDateRange, getLedgerDateRange } from "../src/lib/ecountLedgerDateRange";
import { parseEcountLedgerExcel, parseEcountLedgerExcelBulk } from "../src/lib/ecountLedgerExcelParser";
import { uploadEcountLedgerBotBatch, uploadEcountLedgerRows } from "../src/lib/ecountLedgerUpload";
import { upsertLedgerBulkMeta } from "../src/lib/ledgerSyncStatus";
import { loginEcountWeb } from "./ecountLogin";
import { navigateToLedgerReport, runLedgerSearchAfterNavigate } from "./ecountNavigateLedger";
import {
  clickLedgerExcelDownload,
  findVisibleExcelButton,
  isLedgerResultsTableReady,
} from "./ecountExcel";

const DOWNLOAD_DIR = path.join(process.cwd(), "downloads");

export type LedgerItemOpts = {
  stock_menu_url?: string | null;
  ledger_menu_url?: string | null;
  stock_menu_depth1?: string | null;
  stock_menu_depth2?: string | null;
  period_from: string;
  period_to: string;
  prod_cd?: string;
  prod_nm?: string;
  results_wait_sec?: number;
};

function browserContext() {
  return {
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    acceptDownloads: true,
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  };
}

async function saveDebugScreenshot(page: Page, name: string) {
  if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
  const file = path.join(DOWNLOAD_DIR, name);
  await page.screenshot({ path: file, fullPage: true }).catch(() => {});
  console.log(`📸 ${file}`);
}

async function downloadLedgerExcel(page: Page, saveAs: string, navOpts: LedgerItemOpts) {
  console.log("4. 엑셀 다운로드...");
  if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

  for (let attempt = 0; attempt < 4; attempt++) {
    if (!(await isLedgerResultsTableReady(page))) {
      console.log(`   → 결과 아님 — 검색 재시도 (${attempt + 1}/4)`);
      await runLedgerSearchAfterNavigate(page, navOpts);
    }

    try {
      await clickLedgerExcelDownload(page, saveAs);
      console.log(`✅ 엑셀 저장: ${saveAs}`);
      return;
    } catch (err) {
      console.warn(`   Excel 실패 (${attempt + 1}/4):`, err instanceof Error ? err.message : err);
    }

    await page.waitForTimeout(5000);
  }

  const found = await findVisibleExcelButton(page);
  const ready = await isLedgerResultsTableReady(page);
  console.log(`   excel=${found ? "found" : "none"}, ready=${ready}, url=${page.url()}`);
  throw new Error("재고수불부 엑셀 다운로드 실패");
}

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !key) return null;
  return createClient(url, key);
}

/** 전체 품목 일괄 동기화 */
export async function runEcountLedgerBulkBot() {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Supabase service role 미설정");

  const { from: period_from, to: period_to } = getLedgerBotDateRange();
  console.log(`\n🤖 재고수불부 일괄 봇 (${period_from} ~ ${period_to})\n`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext(browserContext());
  const page = await context.newPage();
  const saveAs = path.join(DOWNLOAD_DIR, "ecount_ledger_all.xlsx");

  try {
    const creds = await resolveEcountBotCredentials();
    if (!creds) throw new Error("이카ount 로그인 정보 없음");

    console.log(`   로그인: ${creds.source === "database" ? "DB" : "env"}`);
    await loginEcountWeb(page, creds);

    const navOpts: LedgerItemOpts = {
      stock_menu_url: creds.stock_menu_url,
      ledger_menu_url: creds.ledger_menu_url,
      stock_menu_depth1: creds.stock_menu_depth1,
      stock_menu_depth2: creds.stock_menu_depth2,
      period_from,
      period_to,
      results_wait_sec: 300,
    };

    await navigateToLedgerReport(page, navOpts);
    await downloadLedgerExcel(page, saveAs, navOpts);

    console.log("5. 파싱 및 업로드...");
    const bulk = parseEcountLedgerExcelBulk(fs.readFileSync(saveAs));
    console.log(`   ${bulk.items.length}품목, ${bulk.total_rows}행`);

    const upload = await uploadEcountLedgerBotBatch({ period_from, period_to, items: bulk.items });
    if (!upload.success) throw new Error(upload.error || "업로드 실패");

    await upsertLedgerBulkMeta(period_from, period_to);
    console.log(`🎉 완료: ${upload.item_count}품목, ${upload.row_count}행`);
    return { ok: upload.item_count || 0, row_count: upload.row_count || 0 };
  } catch (err) {
    await saveDebugScreenshot(page, "ecount-ledger-bulk-error.png");
    throw err;
  } finally {
    await browser.close();
  }
}

/** 단일 품목 (ECOUNT_LEDGER_PROD_CD) */
export async function runEcountLedgerBot() {
  const prod_cd = (process.env.ECOUNT_LEDGER_PROD_CD || "").trim();
  if (!prod_cd) throw new Error("ECOUNT_LEDGER_PROD_CD 필요");

  const prod_nm = (process.env.ECOUNT_LEDGER_PROD_NM || "").trim();
  let period_from = (process.env.ECOUNT_LEDGER_FROM || "").trim();
  let period_to = (process.env.ECOUNT_LEDGER_TO || "").trim();

  if (!period_from || !period_to) {
    const supabase = getSupabase();
    let hasPrior = false;
    if (supabase) {
      const { data } = await supabase
        .from("ecount_ledger_sync_meta")
        .select("prod_cd")
        .eq("prod_cd", prod_cd)
        .maybeSingle();
      hasPrior = !!data;
    }
    const range = getLedgerDateRange(hasPrior);
    period_from = range.from;
    period_to = range.to;
  }

  console.log(`\n🤖 재고수불부: ${prod_cd} (${period_from} ~ ${period_to})\n`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext(browserContext());
  const page = await context.newPage();
  const saveAs = path.join(DOWNLOAD_DIR, `ecount_ledger_${prod_cd}.xlsx`);

  try {
    const creds = await resolveEcountBotCredentials();
    if (!creds) throw new Error("로그인 정보 없음");
    await loginEcountWeb(page, creds);

    const navOpts: LedgerItemOpts = {
      stock_menu_url: creds.stock_menu_url,
      ledger_menu_url: creds.ledger_menu_url,
      stock_menu_depth1: creds.stock_menu_depth1,
      stock_menu_depth2: creds.stock_menu_depth2,
      period_from,
      period_to,
      prod_cd,
      prod_nm,
    };

    await navigateToLedgerReport(page, navOpts);
    await downloadLedgerExcel(page, saveAs, navOpts);

    const parsed = parseEcountLedgerExcel(fs.readFileSync(saveAs), prod_cd);
    const upload = await uploadEcountLedgerRows({
      prod_cd,
      prod_nm: prod_nm || parsed.prod_nm,
      period_from,
      period_to,
      rows: parsed.rows,
    });
    if (!upload.success) throw new Error(upload.error);
    console.log(`🎉 ${prod_cd}: ${upload.count}행`);
  } catch (err) {
    await saveDebugScreenshot(page, `ecount-ledger-${prod_cd}-error.png`);
    throw err;
  } finally {
    await browser.close();
  }
}

import type { Page } from "playwright";
import * as fs from "fs";
import * as path from "path";
import { createClient } from "@supabase/supabase-js";
import { resolveEcountBotCredentials } from "../src/lib/ecountBotConfig";
import { getLedgerDateRange } from "../src/lib/ecountLedgerDateRange";
import { parseEcountLedgerExcel } from "../src/lib/ecountLedgerExcelParser";
import { uploadEcountLedgerRows } from "../src/lib/ecountLedgerUpload";
import { LEDGER_BULK_META_CD, upsertLedgerBulkMeta } from "../src/lib/ledgerSyncStatus";
import { loginEcountWeb } from "./ecountLogin";
import {
  navigateToLedgerReport,
  downloadLedgerExcel,
  runLedgerSearchAfterNavigate,
} from "./ecountNavigateLedger";
import { dismissEcountPopups } from "./ecountNavigateStock";
import { isLedgerResultsReady } from "./ecountExcel";

const DOWNLOAD_DIR = path.join(process.cwd(), "downloads");

export type LedgerItemOpts = {
  stock_menu_url?: string | null;
  period_from: string;
  period_to: string;
  prod_cd: string;
  prod_nm?: string;
};

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !key) return null;
  return createClient(url, key);
}

async function hasPriorLedgerSync(prodCd: string): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;
  const { data } = await supabase
    .from("ecount_ledger_sync_meta")
    .select("prod_cd")
    .eq("prod_cd", prodCd)
    .maybeSingle();
  return !!data;
}

async function saveDebugScreenshot(page: Page, name: string) {
  if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
  const file = path.join(DOWNLOAD_DIR, name);
  await page.screenshot({ path: file, fullPage: true }).catch(() => {});
  console.log(`📸 디버그 스크린샷: ${file}`);
}

/** 단일 품목 재고수불부 동기화 (브라우저 세션 내) */
export async function syncLedgerItemInSession(
  page: Page,
  navOpts: LedgerItemOpts,
  opts: { isFirstInSession?: boolean } = {}
): Promise<{ success: boolean; count: number; error?: string }> {
  const { prod_cd, prod_nm } = navOpts;
  const saveAs = path.join(DOWNLOAD_DIR, `ecount_ledger_${prod_cd}.xlsx`);

  if (opts.isFirstInSession) {
    await navigateToLedgerReport(page, navOpts);
  } else {
    await dismissEcountPopups(page);
    await runLedgerSearchAfterNavigate(page, navOpts);
  }

  let parsed: ReturnType<typeof parseEcountLedgerExcel> | null = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    if (!(await isLedgerResultsReady(page))) {
      await runLedgerSearchAfterNavigate(page, navOpts);
    }
    try {
      if (fs.existsSync(saveAs)) fs.unlinkSync(saveAs);
      await downloadLedgerExcel(page, saveAs);
      const buffer = fs.readFileSync(saveAs);
      parsed = parseEcountLedgerExcel(buffer, prod_cd);
      if (parsed.rows.length > 0) break;
    } catch (err) {
      console.warn(`   [${prod_cd}] 재시도 ${attempt + 1}/3:`, err instanceof Error ? err.message : err);
      await dismissEcountPopups(page);
      await runLedgerSearchAfterNavigate(page, navOpts);
    }
  }

  if (!parsed || parsed.rows.length === 0) {
    return { success: false, count: 0, error: "엑셀 파싱 실패 또는 수불 내역 없음" };
  }

  const upload = await uploadEcountLedgerRows({
    prod_cd,
    prod_nm: prod_nm || parsed.prod_nm,
    period_from: navOpts.period_from,
    period_to: navOpts.period_to,
    rows: parsed.rows,
  });

  if (!upload.success) return { success: false, count: 0, error: upload.error };
  return { success: true, count: upload.count || 0 };
}

/** 단일 품목 (환경변수 ECOUNT_LEDGER_PROD_CD) */
export async function runEcountLedgerBot() {
  const prod_cd = (process.env.ECOUNT_LEDGER_PROD_CD || "").trim();
  if (!prod_cd) throw new Error("ECOUNT_LEDGER_PROD_CD 환경변수가 필요합니다.");

  const prod_nm = (process.env.ECOUNT_LEDGER_PROD_NM || "").trim();
  const prior = await hasPriorLedgerSync(prod_cd);

  let period_from = (process.env.ECOUNT_LEDGER_FROM || "").trim();
  let period_to = (process.env.ECOUNT_LEDGER_TO || "").trim();
  if (!period_from || !period_to) {
    const range = getLedgerDateRange(prior);
    period_from = range.from;
    period_to = range.to;
  }

  console.log(`\n🤖 재고수불부 봇: ${prod_cd} (${period_from} ~ ${period_to})\n`);

  const browser = await (await import("playwright")).chromium.launch({ headless: true });
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
    if (!creds) throw new Error("이카ount 로그인 정보 없음");

    await loginEcountWeb(page, creds);
    const result = await syncLedgerItemInSession(
      page,
      {
        stock_menu_url: creds.stock_menu_url,
        period_from,
        period_to,
        prod_cd,
        prod_nm,
      },
      { isFirstInSession: true }
    );

    if (!result.success) throw new Error(result.error || "동기화 실패");
    console.log(`🎉 재고수불부 반영: ${prod_cd} ${result.count}행`);
    return result;
  } catch (err) {
    await saveDebugScreenshot(page, `ecount-ledger-${prod_cd}-error.png`);
    throw err;
  } finally {
    await browser.close();
  }
}

type StockItem = { prod_cd: string; prod_nm: string; total_qty: number };

async function loadBulkLedgerItems(): Promise<StockItem[]> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Supabase service role 미설정");

  const { data, error } = await supabase
    .from("ecount_items")
    .select("prod_cd, prod_nm, total_qty")
    .gt("total_qty", 0)
    .order("prod_cd", { ascending: true });

  if (error) throw new Error(error.message);
  return (data || []) as StockItem[];
}

/** 재고 > 0 품목 일괄 재고수불부 동기화 */
export async function runEcountLedgerBulkBot() {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Supabase service role 미설정");

  const { data: bulkMeta } = await supabase
    .from("ecount_ledger_sync_meta")
    .select("first_synced_at")
    .eq("prod_cd", LEDGER_BULK_META_CD)
    .maybeSingle();

  const hasPriorBulk = !!bulkMeta?.first_synced_at;
  const { from: period_from, to: period_to } = getLedgerDateRange(hasPriorBulk);

  const items = await loadBulkLedgerItems();
  if (items.length === 0) throw new Error("동기화할 재고 품목이 없습니다 (재고현황 먼저 동기화하세요).");

  console.log(`\n🤖 재고수불부 일괄 봇: ${items.length}건 (${period_from} ~ ${period_to})\n`);

  const browser = await (await import("playwright")).chromium.launch({ headless: true });
  const context = await browser.newContext({
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    acceptDownloads: true,
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();

  let ok = 0;
  let fail = 0;
  const failures: string[] = [];

  try {
    const creds = await resolveEcountBotCredentials();
    if (!creds) throw new Error("이카ount 로그인 정보 없음");

    await loginEcountWeb(page, creds);

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      console.log(`\n[${i + 1}/${items.length}] ${item.prod_cd} ${item.prod_nm}`);

      try {
        const result = await syncLedgerItemInSession(
          page,
          {
            stock_menu_url: creds.stock_menu_url,
            period_from,
            period_to,
            prod_cd: item.prod_cd,
            prod_nm: item.prod_nm,
          },
          { isFirstInSession: i === 0 }
        );

        if (result.success) {
          ok += 1;
          console.log(`   ✓ ${result.count}행 반영`);
        } else {
          fail += 1;
          failures.push(`${item.prod_cd}: ${result.error}`);
          console.warn(`   ✗ ${result.error}`);
        }
      } catch (e) {
        fail += 1;
        const msg = e instanceof Error ? e.message : "오류";
        failures.push(`${item.prod_cd}: ${msg}`);
        console.warn(`   ✗ ${msg}`);
        await saveDebugScreenshot(page, `ecount-ledger-bulk-${item.prod_cd}.png`);
      }

      await page.waitForTimeout(800);
    }

    await upsertLedgerBulkMeta(period_from, period_to);

    console.log(`\n🎉 일괄 완료: 성공 ${ok} / 실패 ${fail} (총 ${items.length})`);
    if (failures.length > 0) {
      console.log("실패 목록:", failures.slice(0, 20).join("\n"));
    }

    if (ok === 0) throw new Error(`전체 실패 (${failures[0] || "알 수 없음"})`);
    return { ok, fail, total: items.length, failures };
  } catch (err) {
    await saveDebugScreenshot(page, "ecount-ledger-bulk-error.png");
    throw err;
  } finally {
    await browser.close();
  }
}

import type { Page } from "playwright";
import * as fs from "fs";
import * as path from "path";
import { createClient } from "@supabase/supabase-js";
import { resolveEcountBotCredentials } from "../src/lib/ecountBotConfig";
import { getLedgerBotDateRange, getLedgerDateRange } from "../src/lib/ecountLedgerDateRange";
import { parseEcountLedgerExcel, parseEcountLedgerExcelBulk } from "../src/lib/ecountLedgerExcelParser";
import { uploadEcountLedgerBotBatch, uploadEcountLedgerRows } from "../src/lib/ecountLedgerUpload";
import { LEDGER_BULK_META_CD, upsertLedgerBulkMeta } from "../src/lib/ledgerSyncStatus";
import { loginEcountWeb } from "./ecountLogin";
import {
  navigateToLedgerReport,
  downloadLedgerExcel,
  runLedgerSearchAfterNavigate,
  dismissLedgerItemRedesignModal,
} from "./ecountNavigateLedger";
import { dismissEcountPopups } from "./ecountNavigateStock";
import { isLedgerResultsReady, isLedgerResultsTableReady, waitForLedgerResultsReady } from "./ecountExcel";

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

async function downloadAndParseLedger(
  page: Page,
  navOpts: LedgerItemOpts,
  saveAs: string,
  opts: { bulk?: boolean; isFirstInSession?: boolean } = {}
): Promise<{ buffer: Buffer; bulk: ReturnType<typeof parseEcountLedgerExcelBulk> | null; single: ReturnType<typeof parseEcountLedgerExcel> | null }> {
  const { prod_cd } = navOpts;

  if (opts.isFirstInSession) {
    await navigateToLedgerReport(page, navOpts);
  }

  let lastErr: unknown;

  for (let attempt = 0; attempt < 2; attempt++) {
    const waitSec = navOpts.results_wait_sec ?? (navOpts.prod_cd ? 90 : 300);
    if (!(await isLedgerResultsTableReady(page)) && !(await isLedgerResultsReady(page))) {
      console.log(`   → 결과 대기 (${attempt + 1}/2)...`);
      await waitForLedgerResultsReady(page, Math.min(waitSec, 120), {
        dismissModal: () => dismissLedgerItemRedesignModal(page),
      });
    }

    try {
      if (fs.existsSync(saveAs)) fs.unlinkSync(saveAs);
      await downloadLedgerExcel(page, saveAs);
      const buffer = fs.readFileSync(saveAs);

      if (opts.bulk) {
        const bulk = parseEcountLedgerExcelBulk(buffer);
        if (bulk.items.length > 0 && bulk.total_rows > 0) {
          return { buffer, bulk, single: null };
        }
        throw new Error("파싱된 품목/행이 없습니다.");
      }

      const parsed = parseEcountLedgerExcel(buffer, prod_cd);
      if (parsed.rows.length > 0) {
        return { buffer, bulk: null, single: parsed };
      }
      throw new Error("파싱 0행");
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`   Excel/파싱 재시도 ${attempt + 1}/2:`, msg);

      if (attempt === 0 && (msg === "LEDGER_TABLE_NOT_READY" || msg === "LEDGER_SEARCH_LOADING")) {
        await dismissLedgerItemRedesignModal(page);
        await dismissEcountPopups(page);
        continue;
      }

      if (attempt === 0) {
        await dismissLedgerItemRedesignModal(page);
        await dismissEcountPopups(page);
        await runLedgerSearchAfterNavigate(page, navOpts);
      }
    }
  }

  throw lastErr instanceof Error
    ? lastErr
    : new Error("재고수불부 엑셀 파싱 실패 — GitHub 아티팩트 스크린샷을 확인하세요.");
}

/** 단일 품목 재고수불부 동기화 (브라우저 세션 내, prod_cd 지정 시) */
export async function syncLedgerItemInSession(
  page: Page,
  navOpts: LedgerItemOpts,
  opts: { isFirstInSession?: boolean } = {}
): Promise<{ success: boolean; count: number; error?: string }> {
  const { prod_cd, prod_nm } = navOpts;
  if (!prod_cd) {
    return { success: false, count: 0, error: "품목코드가 필요합니다." };
  }

  const saveAs = path.join(DOWNLOAD_DIR, `ecount_ledger_${prod_cd}.xlsx`);

  try {
    const { single } = await downloadAndParseLedger(page, navOpts, saveAs, {
      isFirstInSession: opts.isFirstInSession,
    });
    if (!single) return { success: false, count: 0, error: "엑셀 파싱 실패" };

    const upload = await uploadEcountLedgerRows({
      prod_cd,
      prod_nm: prod_nm || single.prod_nm,
      period_from: navOpts.period_from,
      period_to: navOpts.period_to,
      rows: single.rows,
    });

    if (!upload.success) return { success: false, count: 0, error: upload.error };
    return { success: true, count: upload.count || 0 };
  } catch (err) {
    return {
      success: false,
      count: 0,
      error: err instanceof Error ? err.message : "동기화 실패",
    };
  }
}

/** 단일 품목 (환경변수 ECOUNT_LEDGER_PROD_CD — 레거시) */
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
        ledger_menu_url: creds.ledger_menu_url,
        stock_menu_depth1: creds.stock_menu_depth1,
        stock_menu_depth2: creds.stock_menu_depth2,
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

/** 전체 품목 재고수불부 — 품목코드 없이 한 번에 엑셀 다운로드 */
export async function runEcountLedgerBulkBot() {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Supabase service role 미설정");

  const { from: period_from, to: period_to } = getLedgerBotDateRange();

  console.log(`\n🤖 재고수불부 일괄 봇: 전체 품목 (${period_from} ~ ${period_to})\n`);
  console.log("   · 조회 기간: 전월 1일 ~ 오늘");
  console.log("   · 생산불출/창고이동포함 체크");
  console.log("   · 조회품목 재지정 알림 → 취소\n");

  const browser = await (await import("playwright")).chromium.launch({ headless: true });
  const context = await browser.newContext({
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    acceptDownloads: true,
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();
  const saveAs = path.join(DOWNLOAD_DIR, "ecount_ledger_all.xlsx");

  try {
    const creds = await resolveEcountBotCredentials();
    if (!creds) throw new Error("이카ount 로그인 정보 없음");

    await loginEcountWeb(page, creds);

    const { bulk } = await downloadAndParseLedger(
      page,
      {
        stock_menu_url: creds.stock_menu_url,
        ledger_menu_url: creds.ledger_menu_url,
        stock_menu_depth1: creds.stock_menu_depth1,
        stock_menu_depth2: creds.stock_menu_depth2,
        period_from,
        period_to,
        results_wait_sec: 300,
      },
      saveAs,
      { bulk: true, isFirstInSession: true }
    );

    if (!bulk) throw new Error("일괄 파싱 실패");

    console.log(`   파싱: ${bulk.items.length}품목, ${bulk.total_rows}행`);

    const upload = await uploadEcountLedgerBotBatch({
      period_from,
      period_to,
      items: bulk.items,
    });

    if (!upload.success) throw new Error(upload.error || "업로드 실패");

    await upsertLedgerBulkMeta(period_from, period_to);

    console.log(
      `\n🎉 일괄 완료: ${upload.item_count}품목, ${upload.row_count}행 (${upload.synced_at})`
    );
    return {
      ok: upload.item_count || 0,
      fail: 0,
      total: upload.item_count || 0,
      row_count: upload.row_count || 0,
      failures: [] as string[],
    };
  } catch (err) {
    await saveDebugScreenshot(page, "ecount-ledger-bulk-error.png");
    throw err;
  } finally {
    await browser.close();
  }
}

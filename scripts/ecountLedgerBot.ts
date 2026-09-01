/**
 * 이카ount 재고수불부 — 품목별 엑셀 다운 → Supabase
 *
 * 환경변수:
 *   ECOUNT_LEDGER_PROD_CD (필수)
 *   ECOUNT_LEDGER_PROD_NM (선택)
 *   ECOUNT_LEDGER_FROM / ECOUNT_LEDGER_TO (선택, 없으면 DB 메타 기준 자동)
 */
import * as fs from "fs";
import * as path from "path";
import { chromium, type Page } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { resolveEcountBotCredentials } from "../src/lib/ecountBotConfig";
import { getLedgerDateRange } from "../src/lib/ecountLedgerDateRange";
import { parseEcountLedgerExcel } from "../src/lib/ecountLedgerExcelParser";
import { uploadEcountLedgerRows } from "../src/lib/ecountLedgerUpload";
import { loginEcountWeb } from "./ecountLogin";
import {
  navigateToLedgerReport,
  downloadLedgerExcel,
  runLedgerSearchAfterNavigate,
} from "./ecountNavigateLedger";
import { dismissEcountPopups } from "./ecountNavigateStock";
import { isLedgerResultsReady } from "./ecountExcel";

const envPath = fs.existsSync(".env.local") ? ".env.local" : ".env";
require("dotenv").config({ path: envPath });

const DOWNLOAD_DIR = path.join(process.cwd(), "downloads");

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

  console.log(`\n🤖 재고수불부 봇: ${prod_cd} (${period_from} ~ ${period_to}, prior=${prior})\n`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    acceptDownloads: true,
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();
  const saveAs = path.join(DOWNLOAD_DIR, `ecount_ledger_${prod_cd}.xlsx`);

  try {
    const creds = await resolveEcountBotCredentials();
    if (!creds) {
      throw new Error("이카ount 로그인 정보 없음 (/admin/ecount-bot 또는 GitHub Secrets)");
    }

    const navOpts = {
      stock_menu_url: creds.stock_menu_url,
      period_from,
      period_to,
      prod_cd,
    };

    await loginEcountWeb(page, creds);
    await navigateToLedgerReport(page, navOpts);

    let parsed: ReturnType<typeof parseEcountLedgerExcel> | null = null;

    for (let attempt = 0; attempt < 4; attempt++) {
      if (!(await isLedgerResultsReady(page))) {
        console.log(`   → 재고수불부 결과 화면 재확인 (${attempt + 1}/4)`);
        await runLedgerSearchAfterNavigate(page, navOpts);
      }

      try {
        if (fs.existsSync(saveAs)) fs.unlinkSync(saveAs);
        await downloadLedgerExcel(page, saveAs);
        const buffer = fs.readFileSync(saveAs);
        parsed = parseEcountLedgerExcel(buffer, prod_cd);
        if (parsed.rows.length > 0) break;
        console.warn(`   ⚠ 파싱 0행 — 재시도 (${attempt + 1}/4)`);
      } catch (err) {
        console.warn(`   Excel/파싱 재시도 ${attempt + 1}/4:`, err instanceof Error ? err.message : err);
        await dismissEcountPopups(page);
        await runLedgerSearchAfterNavigate(page, navOpts);
      }
    }

    if (!parsed || parsed.rows.length === 0) {
      throw new Error("재고수불부 엑셀 파싱 실패 — 재고수불부 화면(일자·입고·출고)인지 GitHub 아티팩트 스크린샷을 확인하세요.");
    }

    console.log(`   파싱 ${parsed.rows.length}행 (품목: ${parsed.prod_nm || prod_nm || prod_cd})`);

    const upload = await uploadEcountLedgerRows({
      prod_cd,
      prod_nm: prod_nm || parsed.prod_nm,
      period_from,
      period_to,
      rows: parsed.rows,
    });

    if (!upload.success) throw new Error(upload.error || "DB 업로드 실패");
    console.log(`🎉 재고수불부 반영: ${upload.count}행 (${upload.synced_at})`);
    return upload;
  } catch (err) {
    await saveDebugScreenshot(page, `ecount-ledger-${prod_cd}-error.png`);
    throw err;
  } finally {
    await browser.close();
  }
}

if (require.main === module) {
  runEcountLedgerBot().catch((e) => {
    console.error("❌ 재고수불부 봇 실패:", e?.message || e);
    process.exit(1);
  });
}

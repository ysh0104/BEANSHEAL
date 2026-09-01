/**
 * 재고수불부 네비게이션 — ecountNavigateStock.ts 미러
 * 재고 I → 출력물(URL) → 「재고수불부」 클릭 → 기간·검색
 */
import type { Page } from "playwright";
import {
  applyMenuHashFromSaved,
  buildProgramMenuUrl,
  parseStockMenuUrl,
  resolveErpNavigationTarget,
} from "../src/lib/ecountStockMenuUrl";
import { dismissEcountPopups } from "./ecountNavigateStock";
import {
  isLedgerResultsReady,
  isLedgerSearchForm,
  SEARCH_BTN_PATTERN,
  waitForLedgerResultsReady,
} from "./ecountExcel";

const OUTPUT_FOLDER_PRG_ID = "C000035";

async function clickInAnyFrame(page: Page, selector: string): Promise<boolean> {
  for (const frame of page.frames()) {
    const loc = frame.locator(selector).first();
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

/** 출력물 폴더 → 「재고수불부」 (openStockReportProgram 미러) */
async function openLedgerReportProgram(page: Page): Promise<boolean> {
  if (await isLedgerResultsReady(page)) {
    console.log("   ✓ 재고수불부 결과 화면");
    return true;
  }
  if (await isLedgerSearchForm(page)) {
    console.log("   ✓ 재고수불부 검색 조건 화면");
    return true;
  }

  console.log("   → 「재고수불부」 보고서 클릭...");

  const ledgerPrgId = process.env.ECOUNT_LEDGER_PRG_ID?.trim();
  if (ledgerPrgId) {
    for (const sel of [`#link_prg_${ledgerPrgId}`, `[id*="${ledgerPrgId}"]`, `a[onclick*="${ledgerPrgId}"]`]) {
      if (await clickInAnyFrame(page, sel)) {
        console.log(`   ✓ prgId: ${ledgerPrgId}`);
        await page.waitForTimeout(4000);
        if ((await isLedgerResultsReady(page)) || (await isLedgerSearchForm(page))) return true;
      }
    }
  }

  for (const frame of page.frames()) {
    const links = frame.locator("a").filter({ hasText: /^재고\s*수불부$/ });
    const count = await links.count();
    for (let i = count - 1; i >= 0; i--) {
      try {
        const link = links.nth(i);
        if (!(await link.isVisible())) continue;
        await link.click();
        console.log("   ✓ 사이드바 재고수불부");
        await page.waitForTimeout(4000);
        if ((await isLedgerResultsReady(page)) || (await isLedgerSearchForm(page))) return true;
        break;
      } catch {
        /* next */
      }
    }
  }

  for (const frame of page.frames()) {
    try {
      const contentLinks = frame
        .locator('#contents a, .contents a, [class*="content"] a, main a')
        .filter({ hasText: /^재고\s*수불부$/ });
      if ((await contentLinks.count()) > 0) {
        await contentLinks.first().click();
        console.log("   ✓ 본문 재고수불부");
        await page.waitForTimeout(4000);
        if ((await isLedgerResultsReady(page)) || (await isLedgerSearchForm(page))) return true;
      }
    } catch {
      /* skip */
    }
  }

  if (await clickTextInAnyFrame(page, /^재고\s*수불부$/)) {
    await page.waitForTimeout(4000);
    return (await isLedgerResultsReady(page)) || (await isLedgerSearchForm(page));
  }

  return false;
}

async function gotoFolderViaHash(page: Page, savedUrl: string): Promise<boolean> {
  const folderUrl = buildProgramMenuUrl(savedUrl, OUTPUT_FOLDER_PRG_ID);
  const target = applyMenuHashFromSaved(page.url(), folderUrl);
  if (!target) return false;
  console.log(`   → ERP hash: ${target.slice(0, 120)}...`);
  await page.goto(target, { waitUntil: "networkidle", timeout: 90000 });
  await page.waitForTimeout(3000);
  return true;
}

async function clickMenuIdsFromUrl(page: Page, savedUrl: string): Promise<boolean> {
  const parsed = parseStockMenuUrl(savedUrl);
  if (!parsed) return false;
  const selectors = [parsed.depth1Selector, parsed.depth2Selector].filter(Boolean) as string[];
  if (selectors.length === 0) return false;

  console.log(`   → 메뉴 ID: ${selectors.join(" → ")}`);
  for (const sel of selectors) {
    if (!(await clickInAnyFrame(page, sel))) return false;
    await page.waitForTimeout(2000);
  }
  return true;
}

async function fillDateRange(page: Page, from: string, to: string): Promise<void> {
  console.log(`   → 기간: ${from} ~ ${to}`);
  for (const frame of page.frames()) {
    try {
      const inputs = frame.locator('input[type="text"]:visible');
      const n = await inputs.count();
      const dateInputs: ReturnType<Page["locator"]>[] = [];
      for (let i = 0; i < n; i++) {
        const el = inputs.nth(i);
        const val = await el.inputValue().catch(() => "");
        if (/\d{4}[\/.\-]\d{1,2}/.test(val) || val === "") dateInputs.push(el);
      }
      if (dateInputs.length >= 2) {
        await dateInputs[0].fill(from);
        await dateInputs[1].fill(to);
        return;
      }
    } catch {
      /* skip */
    }
  }
}

async function ensureProductionTransferIncluded(page: Page): Promise<void> {
  for (const frame of page.frames()) {
    const etcTab = frame.locator('a, button, span, li').filter({ hasText: /^기타$/ }).first();
    try {
      if ((await etcTab.count()) > 0 && (await etcTab.isVisible())) {
        await etcTab.click({ force: true });
        await page.waitForTimeout(600);
        break;
      }
    } catch {
      /* skip */
    }
  }

  for (const frame of page.frames()) {
    try {
      const label = frame.locator("label, span, td").filter({ hasText: /생산불출.*창고이동.*포함/ }).first();
      if ((await label.count()) === 0 || !(await label.isVisible())) continue;
      const cb = label.locator('xpath=ancestor::tr[1]//input[@type="checkbox"]').first();
      if ((await cb.count()) > 0 && !(await cb.isChecked())) {
        await cb.click({ force: true });
        console.log("   ✓ 생산불출/창고이동포함");
      }
      return;
    } catch {
      /* skip */
    }
  }
}

export async function dismissLedgerItemRedesignModal(page: Page): Promise<boolean> {
  for (const frame of page.frames()) {
    try {
      const hint = frame.locator("text=/조회품목을 재지정|품목개수가 많을 경우/").first();
      if ((await hint.count()) === 0 || !(await hint.isVisible())) continue;
      const cancel = frame.locator('button, a, span').filter({ hasText: /^취소$/ }).first();
      if ((await cancel.count()) > 0 && (await cancel.isVisible())) {
        await cancel.click({ force: true });
        console.log("   ✓ 조회품목 재지정 → 취소");
        await page.waitForTimeout(1500);
        return true;
      }
    } catch {
      /* skip */
    }
  }
  return false;
}

async function clickSearch(page: Page): Promise<void> {
  console.log("   → 검색(F8)...");
  for (const frame of page.frames()) {
    const btn = frame.getByText(SEARCH_BTN_PATTERN).first();
    try {
      if ((await btn.count()) > 0 && (await btn.isVisible())) {
        await btn.click({ force: true });
        console.log("   ✓ 검색 클릭");
        return;
      }
    } catch {
      /* next */
    }
  }
  await page.keyboard.press("F8").catch(() => {});
  await page.keyboard.press("F3").catch(() => {});
}

export type LedgerNavOptions = {
  stock_menu_url?: string | null;
  ledger_menu_url?: string | null;
  stock_menu_depth1?: string | null;
  stock_menu_depth2?: string | null;
  period_from: string;
  period_to: string;
  prod_cd?: string;
  results_wait_sec?: number;
};

async function runLedgerSearch(page: Page, opts: LedgerNavOptions) {
  if (await isLedgerResultsReady(page)) {
    console.log("   ✓ 결과 있음 — 검색 생략");
    return;
  }

  if (!(await isLedgerSearchForm(page))) {
    console.log("   → 검색 화면 아님 — 재고수불부 재클릭");
    await openLedgerReportProgram(page);
    await page.waitForTimeout(2000);
  }

  await fillDateRange(page, opts.period_from, opts.period_to);
  await ensureProductionTransferIncluded(page);

  if (opts.prod_cd?.trim()) {
    console.log(`   → 품목코드: ${opts.prod_cd}`);
    for (const frame of page.frames()) {
      const input = frame.locator('input[type="text"]').filter({ has: frame.locator("text=/품목코드/") }).first();
      try {
        if ((await input.count()) > 0) {
          await input.fill(opts.prod_cd);
          break;
        }
      } catch {
        /* skip */
      }
    }
  } else {
    console.log("   → 품목코드: (전체)");
  }

  await clickSearch(page);

  for (let i = 0; i < 15; i++) {
    if (await dismissLedgerItemRedesignModal(page)) break;
    await page.waitForTimeout(1000);
  }

  console.log("3. 검색 결과 대기...");
  const waitSec = opts.results_wait_sec ?? (opts.prod_cd ? 90 : 300);
  if (!(await waitForLedgerResultsReady(page, waitSec))) {
    console.warn(`   ⚠ 결과 ${waitSec}초 내 미확인`);
  }
}

/** 재고수불부 화면 → 검색 (navigateToStockReport 미러) */
export async function navigateToLedgerReport(page: Page, opts: LedgerNavOptions) {
  console.log("2. 재고수불부 화면 이동...");
  await dismissEcountPopups(page);

  const menuUrl = (
    opts.ledger_menu_url ||
    opts.stock_menu_url ||
    process.env.ECOUNT_LEDGER_MENU_URL ||
    process.env.ECOUNT_STOCK_MENU_URL ||
    ""
  ).trim();

  if (menuUrl) {
    const parsed = parseStockMenuUrl(menuUrl);
    console.log(`   → URL: ${(parsed?.normalized || menuUrl).slice(0, 90)}...`);

    let opened = (await gotoFolderViaHash(page, menuUrl)) || (await clickMenuIdsFromUrl(page, menuUrl));
    if (!opened) {
      const folderUrl = buildProgramMenuUrl(menuUrl, OUTPUT_FOLDER_PRG_ID);
      const direct = resolveErpNavigationTarget(page.url(), folderUrl) || folderUrl;
      await page.goto(direct, { waitUntil: "networkidle", timeout: 90000 });
    }

    await dismissEcountPopups(page);
    console.log(`   현재 URL: ${page.url()}`);

    if (!(await openLedgerReportProgram(page))) {
      throw new Error(
        "재고수불부 클릭 실패. /admin/ecount-bot 에 출력물 URL 저장 또는 ECOUNT_LEDGER_MENU_URL 설정."
      );
    }

    await runLedgerSearch(page, opts);
    return;
  }

  const d1 = opts.stock_menu_depth1 || process.env.ECOUNT_STOCK_MENU_DEPTH1;
  const d2 = opts.stock_menu_depth2 || process.env.ECOUNT_STOCK_MENU_DEPTH2;

  if (d1 && d2) {
    if (!(await clickInAnyFrame(page, d1))) throw new Error(`메뉴 실패: ${d1}`);
    await page.waitForTimeout(2000);
    if (!(await clickInAnyFrame(page, d2))) throw new Error(`메뉴 실패: ${d2}`);
  } else {
    await clickInAnyFrame(page, "#link_depth1_MENUTREE_000004");
    await page.waitForTimeout(2000);
    await clickInAnyFrame(page, "#link_depth2_MENUTREE_000035");
  }

  await page.waitForTimeout(2000);
  await dismissEcountPopups(page);
  if (!(await openLedgerReportProgram(page))) {
    throw new Error("재고수불부 메뉴 이동 실패. /admin/ecount-bot 에 URL 저장.");
  }
  await runLedgerSearch(page, opts);
}

export async function runLedgerSearchAfterNavigate(page: Page, opts: LedgerNavOptions) {
  await dismissEcountPopups(page);
  await dismissLedgerItemRedesignModal(page);
  await runLedgerSearch(page, opts);
}

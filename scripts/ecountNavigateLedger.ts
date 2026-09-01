/**
 * 재고수불부 네비게이션 — ecountNavigateStock.ts 미러
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
  waitForLedgerSearchForm,
} from "./ecountExcel";

const OUTPUT_FOLDER_PRG_ID = "C000035";
const LEDGER_PRG_CANDIDATES = [
  process.env.ECOUNT_LEDGER_PRG_ID?.trim(),
  "C000036",
  "C000037",
  "C000034",
].filter(Boolean) as string[];

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

async function tryDirectLedgerUrl(page: Page, menuUrl: string): Promise<boolean> {
  for (const prgId of [...new Set(LEDGER_PRG_CANDIDATES)]) {
    const ledgerUrl = buildProgramMenuUrl(menuUrl, prgId);
    const target = applyMenuHashFromSaved(page.url(), ledgerUrl);
    if (!target) continue;
    console.log(`   → 재고수불부 URL 직접: ${prgId}`);
    try {
      await page.goto(target, { waitUntil: "networkidle", timeout: 90000 });
      await page.waitForTimeout(3000);
      await dismissEcountPopups(page);
      if (await waitForLedgerSearchForm(page, 20)) return true;
    } catch {
      /* next prgId */
    }
  }
  return false;
}

async function clickLedgerContentCards(page: Page, waitSec = 25): Promise<boolean> {
  for (const frame of page.frames()) {
    try {
      const cards = frame
        .locator('#contents a, .contents a, [class*="content"] a, main a, [class*="program"] a, [class*="tile"] a, [class*="list"] a')
        .filter({ hasText: /^재고\s*수불부$/ });
      const n = await cards.count();
      for (let i = 0; i < n; i++) {
        const card = cards.nth(i);
        if (!(await card.isVisible())) continue;
        await card.click({ force: true });
        console.log("   ✓ 본문 카드 재고수불부");
        if (await waitForLedgerSearchForm(page, waitSec)) return true;
      }
    } catch {
      /* skip */
    }
  }
  return false;
}

/** 출력물 목록 → 「재고수불부」 (본문 카드 → prgId → 사이드바) */
async function openLedgerReportProgram(page: Page): Promise<boolean> {
  if (await isLedgerSearchForm(page) || (await isLedgerResultsReady(page))) {
    console.log("   ✓ 재고수불부 화면 준비됨");
    return true;
  }

  console.log("   → 「재고수불부」 클릭...");

  // 1) 본문 카드 (출력물 목록 prgId=C000035 일 때)
  if (await clickLedgerContentCards(page, 25)) return true;

  // 2) prgId 링크
  for (const prgId of [...new Set(LEDGER_PRG_CANDIDATES)]) {
    for (const sel of [`#link_prg_${prgId}`, `[id*="${prgId}"]`, `a[onclick*="${prgId}"]`]) {
      if (await clickInAnyFrame(page, sel)) {
        console.log(`   ✓ prgId 링크: ${prgId}`);
        if (await waitForLedgerSearchForm(page, 20)) return true;
      }
    }
  }

  // 3) 사이드바 (마지막 visible 1회)
  for (const frame of page.frames()) {
    const links = frame.locator("a").filter({ hasText: /^재고\s*수불부$/ });
    const count = await links.count();
    for (let i = count - 1; i >= 0; i--) {
      try {
        const link = links.nth(i);
        if (!(await link.isVisible())) continue;
        await link.click({ force: true });
        console.log("   ✓ 사이드바 재고수불부");
        if (await waitForLedgerSearchForm(page, 25)) return true;
        // 사이드바는 선택만 되고 본문 카드 클릭이 필요한 경우
        if (await clickLedgerContentCards(page, 20)) return true;
        break;
      } catch {
        /* next */
      }
    }
  }

  if (await clickTextInAnyFrame(page, /^재고\s*수불부$/)) {
    return await waitForLedgerSearchForm(page, 20);
  }

  return (await isLedgerSearchForm(page)) || (await isLedgerResultsReady(page));
}

async function gotoFolderViaHash(page: Page, savedUrl: string): Promise<boolean> {
  const folderUrl = buildProgramMenuUrl(savedUrl, OUTPUT_FOLDER_PRG_ID);
  const target = applyMenuHashFromSaved(page.url(), folderUrl);
  if (!target) return false;
  console.log(`   → 출력물 폴더: ${target.slice(0, 120)}...`);
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
    console.log("   → 검색 화면 대기/재클릭...");
    await openLedgerReportProgram(page);
    await waitForLedgerSearchForm(page, 15);
  }

  await fillDateRange(page, opts.period_from, opts.period_to);
  await ensureProductionTransferIncluded(page);

  if (opts.prod_cd?.trim()) {
    console.log(`   → 품목코드: ${opts.prod_cd}`);
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
    console.log(`   → URL: ${menuUrl.slice(0, 90)}...`);

    await gotoFolderViaHash(page, menuUrl).catch(() => clickMenuIdsFromUrl(page, menuUrl));
    await dismissEcountPopups(page);
    console.log(`   현재 URL: ${page.url()}`);

    // A) prgId URL 직접 → B) 출력물 폴더에서 카드/사이드바 클릭
    let ready = await tryDirectLedgerUrl(page, menuUrl);
    if (!ready) {
      await gotoFolderViaHash(page, menuUrl);
      await dismissEcountPopups(page);
      ready = await openLedgerReportProgram(page);
    }

    if (!ready) {
      await gotoFolderViaHash(page, menuUrl);
      await dismissEcountPopups(page);
      ready = await openLedgerReportProgram(page);
    }

    if (!ready && !(await isLedgerSearchForm(page))) {
      const hash = page.url().split("#")[1] || "";
      const prgId = new URLSearchParams(hash).get("prgId");
      console.warn(`   ⚠ 진입 실패 — prgId=${prgId || "(none)"}, url=${page.url().slice(0, 100)}`);
      throw new Error(
        "재고수불부 화면 진입 실패. GitHub Secret ECOUNT_LEDGER_PRG_ID(재고수불부 prgId) 설정을 확인하세요."
      );
    }

    await runLedgerSearch(page, opts);
    return;
  }

  await clickInAnyFrame(page, "#link_depth1_MENUTREE_000004");
  await page.waitForTimeout(2000);
  await clickInAnyFrame(page, "#link_depth2_MENUTREE_000035");
  await page.waitForTimeout(2000);
  await dismissEcountPopups(page);

  if (!(await openLedgerReportProgram(page)) && !(await isLedgerSearchForm(page))) {
    throw new Error("재고수불부 메뉴 이동 실패. /admin/ecount-bot 에 URL 저장.");
  }
  await runLedgerSearch(page, opts);
}

export async function runLedgerSearchAfterNavigate(page: Page, opts: LedgerNavOptions) {
  await dismissEcountPopups(page);
  await dismissLedgerItemRedesignModal(page);
  await runLedgerSearch(page, opts);
}

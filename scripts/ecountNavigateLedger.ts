/**
 * 재고수불부 네비게이션
 */
import type { Locator, Page } from "playwright";
import {
  applyMenuHashFromSaved,
  buildProgramMenuUrl,
  parseStockMenuUrl,
} from "../src/lib/ecountStockMenuUrl";
import { dismissEcountPopups } from "./ecountNavigateStock";
import {
  findLedgerFrames,
  getPagePrgId,
  isKnownLedgerPrgId,
  isLedgerResultsTableReady,
  isLedgerScreenReady,
  isLedgerSearchForm,
  isOnStockReportPage,
  isReportsListingPage,
  SEARCH_BTN_PATTERN,
  waitForLedgerResultsReady,
  waitForLedgerSearchForm,
} from "./ecountExcel";

const OUTPUT_FOLDER_PRG_ID = "C000035";
const LEDGER_PRG_CANDIDATES = [
  process.env.ECOUNT_LEDGER_PRG_ID?.trim(),
  "E040702",
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

async function tryClickLedgerLink(page: Page, link: Locator, label: string): Promise<boolean> {
  try {
    if (!(await link.isVisible())) return false;
    await link.scrollIntoViewIfNeeded().catch(() => {});
    await link.click({ force: true });
    console.log(`   ✓ ${label}`);
    await page.waitForTimeout(8000);
    await dismissEcountPopups(page);
    if (await waitForLedgerSearchForm(page, 30)) return true;
    await link.evaluate((el: HTMLElement) => el.click());
    await page.waitForTimeout(8000);
    await dismissEcountPopups(page);
    return await waitForLedgerSearchForm(page, 30);
  } catch {
    return false;
  }
}

async function clickLedgerFromReportsListing(page: Page): Promise<boolean> {
  const onListing =
    (await isReportsListingPage(page)) ||
    (await page.locator("text=재고수불부").count()) > 0;
  if (!onListing) return false;

  console.log("   → 출력물 목록에서 재고수불부 클릭...");

  const contentSelectors = [
    "#contents a",
    ".contents a",
    '[class*="content"] a',
    '[class*="program"] a',
    '[class*="wrapper"] a',
    "main a",
  ].join(", ");

  const sidebarSelectors = [
    "#sideTab a",
    '[class*="side"] a',
    '[class*="tree"] a',
    '[class*="menu-tree"] a',
    "nav a",
  ].join(", ");

  for (const frame of page.frames()) {
    const contentLinks = frame.locator(contentSelectors).filter({ hasText: /^재고\s*수불부$/ });
    const contentCount = await contentLinks.count();
    for (let i = 0; i < contentCount; i++) {
      if (await tryClickLedgerLink(page, contentLinks.nth(i), `본문 카드 (${i + 1}/${contentCount})`)) {
        return true;
      }
    }

    const sidebarLinks = frame.locator(sidebarSelectors).filter({ hasText: /^재고\s*수불부$/ });
    const sideCount = await sidebarLinks.count();
    for (let i = 0; i < sideCount; i++) {
      if (await tryClickLedgerLink(page, sidebarLinks.nth(i), `좌측 메뉴 (${i + 1}/${sideCount})`)) {
        return true;
      }
    }

    const genericLinks = frame
      .locator('a, span, li, div[role="link"], div[role="button"]')
      .filter({ hasText: /^재고\s*수불부$/ });
    const genericCount = await genericLinks.count();
    for (let i = 0; i < genericCount; i++) {
      if (await tryClickLedgerLink(page, genericLinks.nth(i), `재고수불부 (${i + 1}/${genericCount})`)) {
        return true;
      }
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
      await page.waitForTimeout(5000);
      await dismissEcountPopups(page);
      if (await waitForLedgerSearchForm(page, 35)) return true;
    } catch {
      /* next prgId */
    }
  }
  return false;
}

async function openLedgerReportProgram(page: Page): Promise<boolean> {
  if (await isLedgerScreenReady(page)) {
    console.log("   ✓ 재고수불부 화면 준비됨");
    return true;
  }

  if (await isReportsListingPage(page)) {
    if (await clickLedgerFromReportsListing(page)) return true;
  }

  console.log("   → 「재고수불부」 클릭...");

  for (const prgId of [...new Set(LEDGER_PRG_CANDIDATES)]) {
    for (const sel of [`#link_prg_${prgId}`, `[id*="${prgId}"]`, `a[onclick*="${prgId}"]`, `a[href*="${prgId}"]`]) {
      if (await clickInAnyFrame(page, sel)) {
        console.log(`   ✓ prgId 링크: ${prgId}`);
        await page.waitForTimeout(8000);
        if (await waitForLedgerSearchForm(page, 30)) return true;
      }
    }
  }

  for (const frame of page.frames()) {
    const links = frame.locator("a").filter({ hasText: /^재고\s*수불부$/ });
    const count = await links.count();
    for (let i = count - 1; i >= 0; i--) {
      if (await tryClickLedgerLink(page, links.nth(i), `사이드바 (${i + 1}/${count})`)) return true;
    }
  }

  if (await clickTextInAnyFrame(page, /^재고\s*수불부$/)) {
    await page.waitForTimeout(8000);
    return await waitForLedgerSearchForm(page, 30);
  }

  return await isLedgerScreenReady(page);
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

async function gotoLedgerDirect(page: Page, menuUrl: string): Promise<boolean> {
  const ledgerPrgId = process.env.ECOUNT_LEDGER_PRG_ID?.trim() || "E040702";
  const ledgerUrl = buildProgramMenuUrl(menuUrl, ledgerPrgId);
  const target = applyMenuHashFromSaved(page.url(), ledgerUrl);
  if (!target) return false;
  console.log(`   → 재고수불부 직접 이동: ${ledgerPrgId}`);
  await page.goto(target, { waitUntil: "networkidle", timeout: 90000 });
  await page.waitForTimeout(5000);
  await dismissEcountPopups(page);
  return waitForLedgerSearchForm(page, 40);
}

/** 재고현황(C000650)에 있으면 재고수불부(E040702)로 복귀 */
async function ensureOnLedgerScreen(page: Page, menuUrl: string): Promise<void> {
  if (await isOnStockReportPage(page)) {
    console.warn(`   ⚠ 재고현황 화면 — 재고수불부로 재이동 (prgId=${getPagePrgId(page)})`);
    if (menuUrl && (await gotoLedgerDirect(page, menuUrl))) return;
    await openLedgerReportProgram(page);
    await waitForLedgerSearchForm(page, 30);
    return;
  }

  if (!(await isLedgerSearchForm(page)) && !(await isLedgerResultsTableReady(page))) {
    if (menuUrl && (await gotoLedgerDirect(page, menuUrl))) return;
    await openLedgerReportProgram(page);
    await waitForLedgerSearchForm(page, 30);
  }
}

async function fillDateRange(page: Page, from: string, to: string): Promise<void> {
  console.log(`   → 기간: ${from} ~ ${to}`);
  const ledgerFrames = await findLedgerFrames(page);
  for (const frame of ledgerFrames) {
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
  const ledgerFrames = await findLedgerFrames(page);
  for (const frame of ledgerFrames) {
    const etcTab = frame.locator('a, button, span, li').filter({ hasText: /^기타$/ }).first();
    try {
      if ((await etcTab.count()) > 0 && (await etcTab.isVisible())) {
        await etcTab.click({ force: true });
        await page.waitForTimeout(800);
        break;
      }
    } catch {
      /* skip */
    }
  }

  for (const frame of ledgerFrames) {
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
  console.log("   → 검색(F8) — 재고수불부 프레임만...");
  const ledgerFrames = await findLedgerFrames(page);

  for (const frame of ledgerFrames) {
    const btn = frame.getByText(SEARCH_BTN_PATTERN).first();
    try {
      if ((await btn.count()) > 0 && (await btn.isVisible())) {
        await frame.locator("body").click({ position: { x: 30, y: 30 }, force: true }).catch(() => {});
        await btn.scrollIntoViewIfNeeded().catch(() => {});
        await btn.click({ force: true });
        console.log("   ✓ 재고수불부 프레임 검색 클릭");
        return;
      }
    } catch {
      /* next */
    }
  }

  for (const frame of ledgerFrames) {
    try {
      await frame.locator("body").click({ position: { x: 30, y: 30 }, force: true });
      await page.keyboard.press("F8");
      console.log("   ✓ 재고수불부 프레임 포커스 + F8");
      return;
    } catch {
      /* next */
    }
  }

  throw new Error("재고수불부 검색 버튼을 찾지 못했습니다.");
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
  const menuUrl = (
    opts.ledger_menu_url ||
    opts.stock_menu_url ||
    process.env.ECOUNT_LEDGER_MENU_URL ||
    process.env.ECOUNT_STOCK_MENU_URL ||
    ""
  ).trim();

  if (await isLedgerResultsTableReady(page)) {
    console.log("   ✓ 결과 테이블 있음 — 검색 생략");
    return;
  }

  await ensureOnLedgerScreen(page, menuUrl);

  if (!(await isLedgerSearchForm(page))) {
    console.log("   → 검색 화면 대기/재클릭...");
    if (menuUrl) await gotoLedgerDirect(page, menuUrl);
    else await openLedgerReportProgram(page);
    await waitForLedgerSearchForm(page, 30);
  }

  if (!(await isLedgerSearchForm(page))) {
    throw new Error("재고수불부 검색 조건 화면을 찾지 못했습니다.");
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
    if (await isOnStockReportPage(page)) {
      throw new Error("WRONG_REPORT: 검색 후 재고현황 화면으로 이동했습니다.");
    }
    console.warn(`   ⚠ 결과 ${waitSec}초 내 미확인`);
  }
}

function isNavigationReady(page: Page): Promise<boolean> {
  return isLedgerScreenReady(page);
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

    if (!ready) {
      const prgId = getPagePrgId(page);
      if (isKnownLedgerPrgId(prgId) && !(await isReportsListingPage(page)) && !(await isOnStockReportPage(page))) {
        console.log(`   ✓ prgId=${prgId} — URL 기준 진입, 검색 화면 대기`);
        ready = await waitForLedgerSearchForm(page, 40);
      }
    }

    if (!ready && !(await isNavigationReady(page))) {
      const prgId = getPagePrgId(page);
      console.warn(`   ⚠ 진입 실패 — prgId=${prgId || "(none)"}, url=${page.url().slice(0, 100)}`);
      throw new Error(
        "재고수불부 화면 진입 실패. /admin/ecount-bot 출력물 URL 또는 ECOUNT_LEDGER_PRG_ID(E040702 등) 확인."
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

  if (!(await openLedgerReportProgram(page)) && !(await isNavigationReady(page))) {
    throw new Error("재고수불부 메뉴 이동 실패. /admin/ecount-bot 에 URL 저장.");
  }
  await runLedgerSearch(page, opts);
}

export async function runLedgerSearchAfterNavigate(page: Page, opts: LedgerNavOptions) {
  await dismissEcountPopups(page);
  await dismissLedgerItemRedesignModal(page);
  await runLedgerSearch(page, opts);
}

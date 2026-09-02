/**
 * 재고수불부 네비게이션 — 재고현황(ecountNavigateStock)과 동일 패턴
 * 출력물 폴더(hash) → 재고수불부 카드/prgId → 검색 → 알림 취소 → 결과 대기
 */
import type { Page } from "playwright";
import {
  applyMenuHashFromSaved,
  parseStockMenuUrl,
  resolveErpNavigationTarget,
  stripPrgIdFromMenuUrl,
} from "../src/lib/ecountStockMenuUrl";
import { gotoEcountPage } from "./ecountErpGoto";
import { dismissEcountPopups } from "./ecountNavigateStock";
import {
  clickLedgerSearch,
  dismissBulkItemModal,
  ensureProductionTransferIncluded,
  isLedgerExcelReady,
  isLedgerSearchScreen,
  waitAndDismissBulkItemModal,
  waitForLedgerResults,
  waitForLedgerSearchScreen,
} from "./ecountLedgerScreen";

function ledgerPrgId(): string {
  return process.env.ECOUNT_LEDGER_PRG_ID?.trim() || "E040702";
}

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

function resolveMenuUrl(opts: LedgerNavOptions): string {
  return (
    opts.ledger_menu_url ||
    opts.stock_menu_url ||
    process.env.ECOUNT_LEDGER_MENU_URL ||
    process.env.ECOUNT_STOCK_MENU_URL ||
    ""
  ).trim();
}

async function gotoOutputFolderViaHash(page: Page, menuUrl: string): Promise<boolean> {
  const folderUrl = stripPrgIdFromMenuUrl(menuUrl);
  const target = applyMenuHashFromSaved(page.url(), folderUrl);
  if (!target) return false;
  await gotoEcountPage(page, target, "출력물 폴더");
  return true;
}

async function clickMenuIdsFromUrl(page: Page, savedUrl: string): Promise<boolean> {
  const parsed = parseStockMenuUrl(savedUrl);
  if (!parsed) return false;
  const selectors = [parsed.depth1Selector, parsed.depth2Selector].filter(Boolean) as string[];
  if (selectors.length === 0) return false;

  console.log(`   → 메뉴 ID 클릭: ${selectors.join(" → ")}`);
  for (const sel of selectors) {
    if (!(await clickInAnyFrame(page, sel))) {
      console.warn(`   ⚠ 클릭 실패: ${sel}`);
      return false;
    }
    await page.waitForTimeout(1500);
  }
  return true;
}

/** 출력물 폴더 → 「재고수불부」 프로그램 열기 (재고현황 openStockReportProgram 과 동일 구조) */
async function openLedgerReportProgram(page: Page): Promise<boolean> {
  if (await isLedgerSearchScreen(page)) {
    console.log("   ✓ 재고수불부 검색 조건 화면");
    return true;
  }
  if (await isLedgerExcelReady(page)) {
    console.log("   ✓ 재고수불부 결과 화면");
    return true;
  }

  const prgId = ledgerPrgId();
  console.log(`   → 「재고수불부」 열기 (prgId=${prgId})...`);

  const prgSelectors = [
    `#link_prg_${prgId}`,
    `[id*="${prgId}"]`,
    `a[onclick*="${prgId}"]`,
    `a[href*="${prgId}"]`,
  ];
  for (const sel of prgSelectors) {
    if (await clickInAnyFrame(page, sel)) {
      console.log(`   ✓ prgId 링크: ${sel}`);
      await page.waitForTimeout(3000);
      if (await waitForLedgerSearchScreen(page, 12)) return true;
    }
  }

  for (const frame of page.frames()) {
    const cards = frame
      .locator('#contents a, .contents a, [class*="content"] a, [class*="program"] a, main a')
      .filter({ hasText: /^재고\s*수불부$/ });
    const n = await cards.count();
    for (let i = 0; i < n; i++) {
      const card = cards.nth(i);
      try {
        if (!(await card.isVisible())) continue;
        await card.scrollIntoViewIfNeeded().catch(() => {});
        await card.click({ force: true });
        console.log(`   ✓ 본문 카드 (${i + 1}/${n})`);
        await page.waitForTimeout(3000);
        await dismissEcountPopups(page);
        if (await waitForLedgerSearchScreen(page, 12)) return true;
      } catch {
        /* next */
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
        console.log(`   ✓ 사이드바 재고수불부 (${i + 1}/${count})`);
        await page.waitForTimeout(3000);
        if (await waitForLedgerSearchScreen(page, 12)) return true;
      } catch {
        /* next */
      }
    }
  }

  if (await clickTextInAnyFrame(page, /^재고\s*수불부$/)) {
    await page.waitForTimeout(3000);
    return (await isLedgerSearchScreen(page)) || (await isLedgerExcelReady(page));
  }

  return false;
}

async function openLedgerSearchScreen(page: Page, menuUrl: string): Promise<void> {
  if (await isLedgerSearchScreen(page)) {
    console.log("   ✓ 재고수불부 검색 화면 이미 열림");
    return;
  }
  if (await isLedgerExcelReady(page)) {
    console.log("   ✓ 재고수불부 결과 화면 이미 열림");
    return;
  }

  if (menuUrl) {
    const parsed = parseStockMenuUrl(menuUrl);
    console.log(`   → 저장된 URL (정규화): ${(parsed?.normalized || menuUrl).slice(0, 90)}...`);

    let opened =
      (await gotoOutputFolderViaHash(page, menuUrl)) || (await clickMenuIdsFromUrl(page, menuUrl));

    if (!opened && parsed?.normalized) {
      const direct = resolveErpNavigationTarget(page.url(), stripPrgIdFromMenuUrl(parsed.normalized));
      if (direct) {
        await gotoEcountPage(page, direct, "출력물 폴더(직접)");
        opened = true;
      }
    }

    if (!opened) {
      throw new Error("출력물 폴더 이동 실패. /admin/ecount-bot 에서 재고현황 URL을 저장하세요.");
    }

    await dismissEcountPopups(page);
    console.log(`   현재 URL: ${page.url().slice(0, 100)}...`);

    if (!(await openLedgerReportProgram(page))) {
      throw new Error("재고수불부 프로그램 열기 실패. 출력물 폴더에서 「재고수불부」 카드를 찾지 못했습니다.");
    }
    return;
  }

  console.log("   → 메뉴 URL 없음 — 사이드바 탐색...");
  await clickInAnyFrame(page, "#link_depth1_MENUTREE_000004");
  await page.waitForTimeout(1500);
  await clickInAnyFrame(page, "#link_depth2_MENUTREE_000035");
  await page.waitForTimeout(1500);
  await dismissEcountPopups(page);

  if (!(await openLedgerReportProgram(page))) {
    throw new Error("재고수불부 검색 화면 진입 실패. /admin/ecount-bot 출력물 URL 확인.");
  }
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

export async function runLedgerSearch(page: Page, opts: LedgerNavOptions) {
  const menuUrl = resolveMenuUrl(opts);

  console.log("   → 재고수불부 검색 화면 진입...");
  await openLedgerSearchScreen(page, menuUrl);

  if (!(await isLedgerSearchScreen(page))) {
    throw new Error("재고수불부 검색 조건 화면을 찾지 못했습니다.");
  }

  console.log("   → 기간: Ecount 기본값(전월+금월) 유지");
  await ensureProductionTransferIncluded(page);

  if (opts.prod_cd?.trim()) {
    console.log(`   → 품목코드: ${opts.prod_cd} (미구현 — 전체 조회)`);
  }

  await clickLedgerSearch(page);
  await waitAndDismissBulkItemModal(page, 20);

  const waitSec = opts.results_wait_sec ?? (opts.prod_cd ? 120 : 600);
  if (!(await waitForLedgerResults(page, waitSec))) {
    console.warn(`   ⚠ 결과 ${waitSec}초 내 미확인 — 다운로드 시도 예정`);
  }
}

export async function navigateToLedgerReport(page: Page, opts: LedgerNavOptions) {
  console.log("2. 재고수불부 화면 이동...");
  await dismissEcountPopups(page);

  const menuUrl = resolveMenuUrl(opts);
  if (!menuUrl) {
    console.warn("   ⚠ 메뉴 URL 없음 — 사이드바 자동 탐색 시도");
  } else {
    console.log(`   → 메뉴 URL: ${menuUrl.slice(0, 90)}...`);
  }

  await runLedgerSearch(page, opts);
}

export async function runLedgerSearchAfterNavigate(page: Page, opts: LedgerNavOptions) {
  await dismissEcountPopups(page);
  await dismissBulkItemModal(page);
  await runLedgerSearch(page, opts);
}

export { dismissBulkItemModal as dismissLedgerItemRedesignModal };

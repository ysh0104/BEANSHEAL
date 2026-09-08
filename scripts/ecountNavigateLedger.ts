/**
 * 재고수불부 네비게이션
 *
 * 실제 사용자 동선:
 *   재고 I → 출력물 CLICK → 재고수불부 CLICK
 *   → 생산불출/창고이동포함 체크 → 검색 버튼 클릭 → ESC → 결과 대기
 *
 * stock cascade(재고현황)와 동일 메뉴 패턴을 ledger에서 복제 구현.
 * stock 파일은 수정하지 않음.
 */
import type { Frame, Locator, Page } from "playwright";
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
  ensureProductionTransferIncluded,
  isLedgerExcelReady,
  isLedgerSearchScreen,
  pressLedgerEscapeAfterSearch,
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

/** stock cascade와 동일: exact/regex로 visible 메뉴 locator 탐색 */
async function findVisibleMenuLocator(
  page: Page,
  patterns: RegExp[],
  opts?: { exactTexts?: string[]; timeoutMs?: number }
): Promise<{ loc: Locator; frame: Frame } | null> {
  const timeoutMs = opts?.timeoutMs ?? 8000;
  const exactTexts = opts?.exactTexts ?? [];
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    for (const frame of page.frames()) {
      for (const text of exactTexts) {
        const loc = frame.getByText(text, { exact: true }).first();
        try {
          if ((await loc.count()) > 0 && (await loc.isVisible())) {
            return { loc, frame };
          }
        } catch {
          /* next */
        }
      }
      for (const pattern of patterns) {
        const loc = frame.locator("a, span, li, div, button, td").filter({ hasText: pattern }).first();
        try {
          if ((await loc.count()) > 0 && (await loc.isVisible())) {
            return { loc, frame };
          }
        } catch {
          /* next */
        }
      }
    }
    await page.waitForTimeout(300);
  }
  return null;
}

async function waitVisibleMenu(
  page: Page,
  patterns: RegExp[],
  exactTexts: string[],
  label: string,
  timeoutMs: number
): Promise<{ loc: Locator; frame: Frame }> {
  const found = await findVisibleMenuLocator(page, patterns, { exactTexts, timeoutMs });
  if (!found) {
    throw new Error(`[LEDGER NAV] ${label} visible 대기 실패 (${timeoutMs}ms)`);
  }
  return found;
}

/** 재고 I 열기: click 우선, 실패 시 hover — 출력물이 보이면 성공 (stock과 동일 패턴) */
async function openInventoryTopMenuForLedger(page: Page): Promise<void> {
  console.log("   → [LEDGER NAV] 재고 I 메뉴 열기");

  const top = await findVisibleMenuLocator(
    page,
    [/^재고\s*I$/, /^재고\s*Ⅰ$/, /^재고\s*\(1\)$/, /재고\s*I/, /재고\s*Ⅰ/],
    { exactTexts: ["재고 I", "재고 Ⅰ", "재고I", "재고Ⅰ", "재고 (1)", "재고(1)"], timeoutMs: 12000 }
  );

  const target =
    top ||
    (await findVisibleMenuLocator(page, [/^재고\s*I/, /^재고\s*Ⅰ/, /재고\s*\(1\)/], { timeoutMs: 5000 }));

  if (!target) {
    const idSelectors = [
      "#link_depth1_MENUTREE_000004",
      "#link_depth1_MENUTREE_000782",
      "#link_depth1_MENUTREE_000783",
    ];
    for (const sel of idSelectors) {
      if (await clickInAnyFrame(page, sel)) {
        console.log(`   ✓ 재고 I (id ${sel})`);
        await page.waitForTimeout(800);
        return;
      }
    }
    throw new Error("[LEDGER NAV] 재고 I 메뉴를 찾지 못했습니다.");
  }

  try {
    await target.loc.scrollIntoViewIfNeeded().catch(() => {});
    await target.loc.click({ force: true });
    console.log("   ✓ 재고 I 클릭");
  } catch (e) {
    console.warn(`   ⚠ 재고 I 클릭 실패: ${e instanceof Error ? e.message : e}`);
  }

  let outputVisible = await findVisibleMenuLocator(page, [/^출력물$/], {
    exactTexts: ["출력물"],
    timeoutMs: 2500,
  });

  if (!outputVisible) {
    console.log("   → 재고 I click 후 출력물 미표시 → hover 재시도");
    try {
      await target.loc.hover({ force: true });
      await page.waitForTimeout(600);
    } catch {
      /* skip */
    }
    outputVisible = await findVisibleMenuLocator(page, [/^출력물$/], {
      exactTexts: ["출력물"],
      timeoutMs: 4000,
    });
  }

  if (!outputVisible) {
    throw new Error("[LEDGER NAV] 재고 I 열기 후 출력물 메뉴가 나타나지 않았습니다.");
  }
  console.log("   ✓ 출력물 메뉴 표시 확인");
}

/**
 * cascade: 재고 I → 출력물 CLICK → 재고수불부 CLICK
 * (stock의 재고현황 cascade와 동일 구조, 마지막만 재고수불부)
 */
async function openLedgerViaCascadeMenu(page: Page): Promise<boolean> {
  await dismissEcountPopups(page);

  if (await isLedgerSearchScreen(page)) {
    console.log("   ✓ 재고수불부 검색 화면 이미 열림");
    return true;
  }
  if (await isLedgerExcelReady(page)) {
    console.log("   ✓ 재고수불부 결과 화면 이미 열림");
    return true;
  }

  await openInventoryTopMenuForLedger(page);

  console.log("   → [LEDGER NAV] 출력물 클릭");
  const outputMenu = await waitVisibleMenu(page, [/^출력물$/], ["출력물"], "출력물", 10000);
  await outputMenu.loc.scrollIntoViewIfNeeded().catch(() => {});
  await outputMenu.loc.click({ force: true });
  console.log("   ✓ 출력물 클릭");
  await page.waitForTimeout(800);

  console.log("   → [LEDGER NAV] 재고수불부 메뉴 표시 확인");
  const ledgerMenu = await waitVisibleMenu(
    page,
    [/^재고\s*수불부$/, /^재고수불부$/],
    ["재고수불부", "재고 수불부"],
    "재고수불부",
    12000
  );
  await ledgerMenu.loc.scrollIntoViewIfNeeded().catch(() => {});
  await ledgerMenu.loc.click({ force: true });
  console.log("   ✓ 재고수불부 클릭");
  await page.waitForTimeout(1000);
  await dismissEcountPopups(page);

  if (await waitForLedgerSearchScreen(page, 25)) {
    console.log("   ✓ 재고수불부 검색 화면 진입 (cascade)");
    return true;
  }

  console.warn("   ⚠ cascade 후 재고수불부 검색 화면 미확인");
  return false;
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

  console.log(`   → 메뉴 ID 클릭(폴백): ${selectors.join(" → ")}`);
  for (const sel of selectors) {
    if (!(await clickInAnyFrame(page, sel))) {
      console.warn(`   ⚠ 클릭 실패: ${sel}`);
      return false;
    }
    await page.waitForTimeout(1500);
  }
  return true;
}

/** cascade 실패 시에만: 출력물 폴더 → 「재고수불부」 프로그램 열기 */
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
  console.log(`   → 「재고수불부」 열기 폴백 (prgId=${prgId})...`);

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

async function openLedgerViaSavedUrlFallback(page: Page, menuUrl: string): Promise<boolean> {
  console.log("   → [LEDGER NAV] cascade 실패 — URL/폴더 폴백 시도");
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

  if (!opened) return false;

  await dismissEcountPopups(page);
  return openLedgerReportProgram(page);
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

  console.log("   → [LEDGER NAV] cascade: 재고 I → 출력물 → 재고수불부");
  let opened = false;
  try {
    opened = await openLedgerViaCascadeMenu(page);
  } catch (e) {
    console.warn(`   ⚠ cascade 실패: ${e instanceof Error ? e.message : e}`);
  }

  if (!opened && menuUrl) {
    opened = await openLedgerViaSavedUrlFallback(page, menuUrl);
  }

  if (!opened && !menuUrl) {
    console.log("   → 메뉴 URL 없음 — depth id 폴백...");
    await clickInAnyFrame(page, "#link_depth1_MENUTREE_000004");
    await page.waitForTimeout(1500);
    await clickInAnyFrame(page, "#link_depth2_MENUTREE_000035");
    await page.waitForTimeout(1500);
    await dismissEcountPopups(page);
    opened = await openLedgerReportProgram(page);
  }

  if (!opened) {
    throw new Error(
      "재고수불부 검색 화면 진입 실패. cascade(재고 I→출력물→재고수불부) 및 URL 폴백을 확인하세요."
    );
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
  prod_nm?: string;
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

  console.log("   [진단] clickLedgerSearch 직전 (navigate)");
  console.log(
    `   [진단] navigate page.url=${page.url()} frames=${page.frames().length} contextPages=${page.context().pages().length}`
  );

  // 사람 UX: 검색 버튼 클릭 → ESC (F8 폴백·취소 클릭 사용 안 함)
  const searchFrame = await clickLedgerSearch(page);
  await page.waitForTimeout(800);
  await pressLedgerEscapeAfterSearch(page, searchFrame);

  console.log("   [진단] 검색+ESC 직후 (navigate)");
  console.log(
    `   [진단] navigate page.url=${page.url()} frames=${page.frames().length} contextPages=${page.context().pages().length}`
  );

  const waitSec = opts.results_wait_sec ?? (opts.prod_cd ? 120 : 600);
  console.log("   → 검색 결과 대기");
  if (!(await waitForLedgerResults(page, waitSec))) {
    console.warn(`   ⚠ 결과 ${waitSec}초 내 미확인 — 다운로드 시도 예정`);
  }
}

export async function navigateToLedgerReport(page: Page, opts: LedgerNavOptions) {
  console.log("2. 재고수불부 화면 이동...");
  await dismissEcountPopups(page);

  const menuUrl = resolveMenuUrl(opts);
  if (!menuUrl) {
    console.warn("   ⚠ 메뉴 URL 없음 — cascade 우선, 실패 시 depth 폴백");
  } else {
    console.log(`   → 메뉴 URL(폴백용): ${menuUrl.slice(0, 90)}...`);
  }

  await runLedgerSearch(page, opts);
}

export async function runLedgerSearchAfterNavigate(page: Page, opts: LedgerNavOptions) {
  await dismissEcountPopups(page);
  // 취소 클릭 경로 사용하지 않음 — 검색→ESC 재실행
  await runLedgerSearch(page, opts);
}

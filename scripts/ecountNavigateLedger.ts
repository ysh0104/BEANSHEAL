/**
 * 재고수불부 네비게이션 — 단순 흐름
 * 출력물 폴더 → 재고수불부 카드 → (기간 유지) → 기타/생산불출 체크 → 검색 → 알림 취소 → 결과 대기
 */
import type { Page } from "playwright";
import {
  applyMenuHashFromSaved,
  buildProgramMenuUrl,
  parseStockMenuUrl,
} from "../src/lib/ecountStockMenuUrl";
import { dismissEcountPopups } from "./ecountNavigateStock";
import {
  clickLedgerSearch,
  dismissBulkItemModal,
  ensureProductionTransferIncluded,
  isLedgerExcelReady,
  isLedgerSearchScreen,
  waitForLedgerResults,
  waitForLedgerSearchScreen,
} from "./ecountLedgerScreen";

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

function resolveMenuUrl(opts: LedgerNavOptions): string {
  return (
    opts.ledger_menu_url ||
    opts.stock_menu_url ||
    process.env.ECOUNT_LEDGER_MENU_URL ||
    process.env.ECOUNT_STOCK_MENU_URL ||
    ""
  ).trim();
}

async function gotoOutputFolder(page: Page, menuUrl: string): Promise<void> {
  const folderUrl = buildProgramMenuUrl(menuUrl, OUTPUT_FOLDER_PRG_ID);
  const target = applyMenuHashFromSaved(page.url(), folderUrl);
  if (!target) throw new Error("출력물 폴더 URL 생성 실패");

  console.log(`   → 출력물 폴더: ${target.slice(0, 100)}...`);
  await page.goto(target, { waitUntil: "networkidle", timeout: 90000 });
  await page.waitForTimeout(2500);
  await dismissEcountPopups(page);
}

async function clickMenuIdsFromUrl(page: Page, savedUrl: string): Promise<boolean> {
  const parsed = parseStockMenuUrl(savedUrl);
  if (!parsed) return false;
  const selectors = [parsed.depth1Selector, parsed.depth2Selector].filter(Boolean) as string[];
  if (selectors.length === 0) return false;

  for (const sel of selectors) {
    if (!(await clickInAnyFrame(page, sel))) return false;
    await page.waitForTimeout(1500);
  }
  return true;
}

/** 출력물 목록 → 본문 「재고수불부」 카드 클릭 */
async function clickLedgerCard(page: Page): Promise<boolean> {
  console.log("   → 「재고수불부」 카드 클릭...");

  const contentSelectors =
    '#contents a, .contents a, [class*="content"] a, [class*="program"] a, main a';

  for (const frame of page.frames()) {
    const cards = frame.locator(contentSelectors).filter({ hasText: /^재고\s*수불부$/ });
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
        if (await waitForLedgerSearchScreen(page, 20)) return true;
      } catch {
        /* next */
      }
    }
  }

  return await isLedgerSearchScreen(page);
}

async function openLedgerSearchScreen(page: Page, menuUrl: string): Promise<void> {
  if (await isLedgerSearchScreen(page) || (await isLedgerExcelReady(page))) return;

  if (menuUrl) {
    await gotoOutputFolder(page, menuUrl).catch(() => clickMenuIdsFromUrl(page, menuUrl));
    if (await clickLedgerCard(page)) return;
    await gotoOutputFolder(page, menuUrl);
    if (await clickLedgerCard(page)) return;
  }

  await clickInAnyFrame(page, "#link_depth1_MENUTREE_000004");
  await page.waitForTimeout(1500);
  await clickInAnyFrame(page, "#link_depth2_MENUTREE_000035");
  await page.waitForTimeout(1500);
  await dismissEcountPopups(page);
  if (await clickLedgerCard(page)) return;

  if (!(await waitForLedgerSearchScreen(page, 15))) {
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

/** 검색 실행 (기간은 Ecount 기본값 전월+금월 유지) */
export async function runLedgerSearch(page: Page, opts: LedgerNavOptions) {
  const menuUrl = resolveMenuUrl(opts);

  if (await isLedgerExcelReady(page)) {
    console.log("   ✓ 결과 있음 — 검색 생략");
    return;
  }

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

  console.log("   → 품목 재지정 알림 대기 (취소 클릭)...");
  for (let i = 0; i < 30; i++) {
    if (await dismissBulkItemModal(page)) break;
    await page.waitForTimeout(500);
  }

  const waitSec = opts.results_wait_sec ?? (opts.prod_cd ? 120 : 600);
  if (!(await waitForLedgerResults(page, waitSec))) {
    console.warn(`   ⚠ Excel 버튼 ${waitSec}초 내 미확인 — 다운로드 시도 예정`);
  }
}

export async function navigateToLedgerReport(page: Page, opts: LedgerNavOptions) {
  console.log("2. 재고수불부 화면 이동...");
  await dismissEcountPopups(page);

  const menuUrl = resolveMenuUrl(opts);
  if (menuUrl) {
    console.log(`   → 메뉴 URL: ${menuUrl.slice(0, 90)}...`);
  }

  await runLedgerSearch(page, opts);
}

export async function runLedgerSearchAfterNavigate(page: Page, opts: LedgerNavOptions) {
  await dismissEcountPopups(page);
  await dismissBulkItemModal(page);
  await runLedgerSearch(page, opts);
}

// 하위 호환
export { dismissBulkItemModal as dismissLedgerItemRedesignModal };

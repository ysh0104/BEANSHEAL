/**
 * 재고수불부 봇 네비게이션 — 재고현황 봇(ecountNavigateStock.ts)과 동일 패턴
 * 흐름: 저장 URL → 출력물 폴더 → 사이드바 「재고수불부」 클릭 → 검색 → Excel
 */
import type { Page } from "playwright";
import {
  applyMenuHashFromSaved,
  parseStockMenuUrl,
  resolveErpNavigationTarget,
  stripPrgIdFromMenuUrl,
} from "../src/lib/ecountStockMenuUrl";
import { dismissEcountPopups } from "./ecountNavigateStock";
import {
  isLedgerResultsReady,
  isLedgerResultsTableReady,
  isLedgerSearchForm,
  SEARCH_BTN_PATTERN,
  waitForLedgerResultsReady,
} from "./ecountExcel";

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

async function isLedgerScreenReady(page: Page): Promise<boolean> {
  return (await isLedgerSearchForm(page)) || (await isLedgerResultsReady(page)) || (await isLedgerResultsTableReady(page));
}

/** 출력물 폴더 → 「재고수불부」 보고서 (재고현황 openStockReportProgram 과 동일 구조) */
async function openLedgerReportProgram(page: Page, prgId?: string | null): Promise<boolean> {
  if (await isLedgerScreenReady(page)) {
    console.log("   ✓ 재고수불부 화면 준비됨");
    return true;
  }

  console.log("   → 출력물 메뉴에서 「재고수불부」 보고서 클릭...");

  const prgIds = [prgId, process.env.ECOUNT_LEDGER_PRG_ID?.trim()].filter(Boolean) as string[];
  for (const id of [...new Set(prgIds)]) {
    for (const sel of [`#link_prg_${id}`, `[id*="${id}"]`, `a[onclick*="${id}"]`, `a[href*="${id}"]`]) {
      if (await clickInAnyFrame(page, sel)) {
        console.log(`   ✓ prgId 링크: ${id}`);
        await page.waitForTimeout(4000);
        if (await isLedgerScreenReady(page)) return true;
      }
    }
  }

  // 사이드바 leaf — 마지막 visible 1회만 (무한 재클릭 방지)
  for (const frame of page.frames()) {
    const links = frame.locator("a").filter({ hasText: /^재고\s*수불부$/ });
    const count = await links.count();
    for (let i = count - 1; i >= 0; i--) {
      try {
        const link = links.nth(i);
        if (!(await link.isVisible())) continue;
        await link.click();
        console.log("   ✓ 사이드바 재고수불부 클릭");
        await page.waitForTimeout(4000);
        if (await isLedgerScreenReady(page)) return true;
        break;
      } catch {
        /* next */
      }
    }
  }

  // 본문 카드 — 첫 링크 1회만
  for (const frame of page.frames()) {
    try {
      const contentLinks = frame
        .locator('#contents a, .contents a, [class*="content"] a, main a')
        .filter({ hasText: /^재고\s*수불부$/ });
      if ((await contentLinks.count()) > 0) {
        await contentLinks.first().click();
        console.log("   ✓ 본문 재고수불부 링크 클릭");
        await page.waitForTimeout(4000);
        if (await isLedgerScreenReady(page)) return true;
      }
    } catch {
      /* skip */
    }
  }

  if (await clickTextInAnyFrame(page, /^재고\s*수불부$/)) {
    await page.waitForTimeout(4000);
    return await isLedgerScreenReady(page);
  }

  return false;
}

async function gotoLedgerViaHash(page: Page, savedUrl: string): Promise<boolean> {
  const target = applyMenuHashFromSaved(page.url(), savedUrl);
  if (!target) return false;
  console.log(`   → ERP hash 네비게이션: ${target.slice(0, 120)}...`);
  await page.goto(target, { waitUntil: "networkidle", timeout: 90000 });
  await page.waitForTimeout(3000);
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
    await page.waitForTimeout(2000);
  }
  return true;
}

async function fillInputNearLabel(page: Page, labelPattern: RegExp, value: string): Promise<boolean> {
  for (const frame of page.frames()) {
    try {
      const labels = frame.locator("label, th, td, span, div").filter({ hasText: labelPattern });
      const count = await labels.count();
      for (let i = 0; i < count; i++) {
        const label = labels.nth(i);
        const container = label.locator("xpath=ancestor::tr[1] | ancestor::div[contains(@class,'row')][1]").first();
        const input = container.locator('input[type="text"], input:not([type="hidden"])').first();
        if ((await input.count()) > 0 && (await input.isVisible())) {
          await input.click({ force: true });
          await input.fill(value);
          return true;
        }
      }
    } catch {
      /* continue */
    }
  }
  return false;
}

async function fillDateRange(page: Page, from: string, to: string): Promise<void> {
  console.log(`   → 기간 설정: ${from} ~ ${to}`);

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
        await dateInputs[0].click({ force: true });
        await dateInputs[0].fill(from);
        await dateInputs[1].click({ force: true });
        await dateInputs[1].fill(to);
        return;
      }
    } catch {
      /* next */
    }
  }

  await fillInputNearLabel(page, /시작|from/i, from);
  await fillInputNearLabel(page, /종료|to/i, to);
}

async function ensureProductionTransferIncluded(page: Page): Promise<void> {
  for (const frame of page.frames()) {
    try {
      const etcTab = frame.locator('a, button, span, li, div[role="tab"]').filter({ hasText: /^기타$/ }).first();
      if ((await etcTab.count()) > 0 && (await etcTab.isVisible())) {
        await etcTab.click({ force: true });
        await page.waitForTimeout(800);
        console.log("   ✓ 기타 탭 클릭");
        break;
      }
    } catch {
      /* skip */
    }
  }

  const labelPattern = /생산불출.*창고이동.*포함/;
  for (const frame of page.frames()) {
    try {
      const label = frame.locator("label, span, td, div").filter({ hasText: labelPattern }).first();
      if ((await label.count()) === 0 || !(await label.isVisible())) continue;

      const container = label
        .locator("xpath=ancestor::tr[1] | ancestor::label[1] | ancestor::div[contains(@class,'row')][1]")
        .first();
      const checkbox = container.locator('input[type="checkbox"]').first();
      if ((await checkbox.count()) > 0) {
        if (!(await checkbox.isChecked())) {
          await checkbox.click({ force: true });
          console.log("   ✓ 생산불출/창고이동포함 체크");
        }
        return;
      }
      await label.click({ force: true });
      console.log("   ✓ 생산불출/창고이동포함 (라벨 클릭)");
      return;
    } catch {
      /* next */
    }
  }
  console.warn("   ⚠ 생산불출/창고이동포함 체크박스 미발견 (기본값으로 계속)");
}

/** 품목 많을 때 알림 — 취소(전체 조회 계속) */
export async function dismissLedgerItemRedesignModal(page: Page): Promise<boolean> {
  for (const frame of page.frames()) {
    try {
      const hint = frame.locator("text=/조회품목을 재지정|품목개수가 많을 경우/").first();
      if ((await hint.count()) === 0 || !(await hint.isVisible())) continue;

      const cancelBtn = frame.locator('button, a, span, div[role="button"]').filter({ hasText: /^취소$/ }).first();
      if ((await cancelBtn.count()) > 0 && (await cancelBtn.isVisible())) {
        await cancelBtn.click({ force: true });
        console.log("   ✓ 조회품목 재지정 알림 → 취소");
        await page.waitForTimeout(2000);
        return true;
      }
    } catch {
      /* next */
    }
  }
  return false;
}

async function waitAndDismissLedgerModal(page: Page, maxSec = 15): Promise<void> {
  for (let i = 0; i < maxSec; i++) {
    if (await dismissLedgerItemRedesignModal(page)) return;
    await page.waitForTimeout(1000);
  }
}

async function fillProdCode(page: Page, prodCd: string): Promise<void> {
  if (!prodCd.trim()) {
    console.log("   → 품목코드: (비움 — 전체 품목 조회)");
    return;
  }
  console.log(`   → 품목코드: ${prodCd}`);

  for (const frame of page.frames()) {
    try {
      const codeLabel = frame.locator("text=/품목코드/").first();
      if ((await codeLabel.count()) > 0) {
        const row = codeLabel.locator("xpath=ancestor::tr[1]").first();
        const input = row.locator('input[type="text"]').first();
        if ((await input.count()) > 0 && (await input.isVisible())) {
          await input.fill(prodCd);
          return;
        }
      }
    } catch {
      /* skip */
    }
  }
  await fillInputNearLabel(page, /품목코드/, prodCd);
}

async function clickSearch(page: Page): Promise<void> {
  console.log("   → 검색 실행...");

  for (const frame of page.frames()) {
    const btn = frame.getByText(SEARCH_BTN_PATTERN).first();
    try {
      if ((await btn.count()) > 0 && (await btn.isVisible())) {
        await btn.scrollIntoViewIfNeeded().catch(() => {});
        await btn.click({ force: true });
        console.log("   ✓ 검색 버튼 클릭");
        return;
      }
    } catch {
      /* next */
    }
  }

  for (const frame of page.frames()) {
    try {
      if ((await frame.locator("text=/품목코드|조회기간/").count()) > 0) {
        await frame.locator("body").click({ position: { x: 20, y: 20 }, force: true }).catch(() => {});
        break;
      }
    } catch {
      /* skip */
    }
  }
  await page.keyboard.press("F8").catch(() => {});
  await page.keyboard.press("F3").catch(() => {});
  console.log("   ✓ F8/F3 키 입력");
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
  if (await isLedgerResultsReady(page) || (await isLedgerResultsTableReady(page))) {
    console.log("   ✓ 재고수불부 결과 — 검색 생략");
    return;
  }

  if (!(await isLedgerSearchForm(page))) {
    console.log("   → 검색 조건 화면 아님 — 재고수불부 재클릭");
    await openLedgerReportProgram(page, process.env.ECOUNT_LEDGER_PRG_ID?.trim());
    await page.waitForTimeout(2000);
    if (!(await isLedgerSearchForm(page))) {
      throw new Error("재고수불부 검색 조건 화면 진입 실패");
    }
  }

  await fillDateRange(page, opts.period_from, opts.period_to);
  await ensureProductionTransferIncluded(page);
  await fillProdCode(page, opts.prod_cd || "");
  await clickSearch(page);
  await waitAndDismissLedgerModal(page);

  console.log("   → 검색 결과 로딩 대기...");
  const waitSec = opts.results_wait_sec ?? (opts.prod_cd ? 90 : 300);
  if (
    !(await waitForLedgerResultsReady(page, waitSec, {
      dismissModal: () => dismissLedgerItemRedesignModal(page),
    }))
  ) {
    console.warn(`   ⚠ 재고수불부 결과 ${waitSec}초 내 미확인`);
  }
}

/** 재고수불부 화면까지 이동 + 검색 (재고현황 navigateToStockReport 와 동일 구조) */
export async function navigateToLedgerReport(page: Page, opts: LedgerNavOptions) {
  console.log("2. 재고수불부 화면 이동...");
  await dismissEcountPopups(page);

  const rawUrl = (
    opts.ledger_menu_url ||
    opts.stock_menu_url ||
    process.env.ECOUNT_LEDGER_MENU_URL ||
    process.env.ECOUNT_STOCK_MENU_URL ||
    ""
  ).trim();

  if (rawUrl) {
    const parsed = parseStockMenuUrl(rawUrl);
    // 출력물 폴더 URL (재고현황 prgId 제거 → 재고 I > 출력물 목록)
    const folderUrl = stripPrgIdFromMenuUrl(rawUrl);
    console.log(`   → 저장된 URL: ${(parsed?.normalized || rawUrl).slice(0, 90)}...`);

    let opened = (await gotoLedgerViaHash(page, folderUrl)) || (await clickMenuIdsFromUrl(page, folderUrl));

    if (!opened) {
      const direct = resolveErpNavigationTarget(page.url(), folderUrl) || folderUrl;
      console.log("   → ERP URL 직접 이동...");
      await page.goto(direct, { waitUntil: "networkidle", timeout: 90000 });
      opened = true;
    }

    if (!opened) {
      throw new Error("저장된 URL로 출력물 폴더 이동 실패");
    }

    await dismissEcountPopups(page);
    console.log(`   현재 URL: ${page.url()}`);

    if (!(await openLedgerReportProgram(page, process.env.ECOUNT_LEDGER_PRG_ID?.trim()))) {
      throw new Error(
        "재고수불부 보고서 클릭 실패. PC에서 재고 I → 출력물 → 재고수불부 화면 URL을 ECOUNT_LEDGER_MENU_URL에 저장하세요."
      );
    }

    await runLedgerSearch(page, opts);
    return;
  }

  const d1 = opts.stock_menu_depth1 || process.env.ECOUNT_STOCK_MENU_DEPTH1;
  const d2 = opts.stock_menu_depth2 || process.env.ECOUNT_STOCK_MENU_DEPTH2;

  if (d1 && d2) {
    if (!(await clickInAnyFrame(page, d1))) throw new Error(`메뉴 클릭 실패: ${d1}`);
    await page.waitForTimeout(2000);
    if (!(await clickInAnyFrame(page, d2))) throw new Error(`메뉴 클릭 실패: ${d2}`);
  } else {
    await clickInAnyFrame(page, "#link_depth1_MENUTREE_000004");
    await page.waitForTimeout(2000);
    await clickInAnyFrame(page, "#link_depth2_MENUTREE_000035");
  }

  await page.waitForTimeout(2000);
  await dismissEcountPopups(page);

  if (!(await openLedgerReportProgram(page, process.env.ECOUNT_LEDGER_PRG_ID?.trim()))) {
    throw new Error("재고수불부 메뉴 자동 이동 실패. /admin/ecount-bot 에 재고현황 URL을 저장하세요.");
  }

  await runLedgerSearch(page, opts);
  console.log(`   현재 URL: ${page.url()}`);
}

/** 다운로드 단계 검색 재시도 (재고 runStockSearchAfterNavigate 와 동일) */
export async function runLedgerSearchAfterNavigate(page: Page, opts: LedgerNavOptions) {
  await dismissEcountPopups(page);
  await dismissLedgerItemRedesignModal(page);
  await runLedgerSearch(page, opts);
}

export async function downloadLedgerExcel(page: Page, saveAs: string) {
  const { clickLedgerExcelDownload } = await import("./ecountExcel");
  console.log("4. 재고수불부 엑셀 다운로드...");
  await clickLedgerExcelDownload(page, saveAs);
  console.log(`✅ 엑셀 저장: ${saveAs}`);
}

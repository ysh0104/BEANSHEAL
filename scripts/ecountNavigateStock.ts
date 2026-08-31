import type { Page } from "playwright";
import { parseStockMenuUrl } from "../src/lib/ecountStockMenuUrl";
import { isStockResultsReady, isStockSearchForm, waitForStockResultsReady } from "./ecountExcel";

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

/** 출력물 메뉴판 → 실제 「재고현황」 보고서 열기 (URL hash만으로는 폴더까지만 열림) */
async function openStockReportProgram(page: Page, prgId?: string | null): Promise<boolean> {
  if (await isStockResultsReady(page)) {
    console.log("   ✓ 재고 결과 화면 준비됨");
    return true;
  }
  if (await isStockSearchForm(page)) {
    console.log("   ✓ 재고현황 검색 조건 화면 (검색 F8 필요)");
    return true;
  }

  console.log("   → 출력물 메뉴에서 「재고현황」 보고서 클릭...");

  if (prgId) {
    const prgSelectors = [
      `#link_prg_${prgId}`,
      `[id*="${prgId}"]`,
      `a[onclick*="${prgId}"]`,
      `a[href*="${prgId}"]`,
    ];
    for (const sel of prgSelectors) {
      if (await clickInAnyFrame(page, sel)) {
        console.log(`   ✓ prgId 링크: ${prgId}`);
        await page.waitForTimeout(4000);
        if (await isStockResultsReady(page) || (await isStockSearchForm(page))) return true;
      }
    }
  }

  // 왼쪽 사이드바 leaf — 「재고현황」 링크 (마지막 visible 우선)
  for (const frame of page.frames()) {
    const links = frame.locator("a").filter({ hasText: /^재고현황$/ });
    const count = await links.count();
    for (let i = count - 1; i >= 0; i--) {
      try {
        const link = links.nth(i);
        if (await link.isVisible()) {
          await link.click();
          console.log(`   ✓ 사이드바 재고현황 클릭 (${i + 1}/${count})`);
          await page.waitForTimeout(4000);
          if (await isStockResultsReady(page) || (await isStockSearchForm(page))) return true;
        }
      } catch {
        /* try next */
      }
    }
  }

  // 출력물 본문 — 재고현황 링크 (사이드바 제외, 본문 영역 우선)
  for (const frame of page.frames()) {
    try {
      const contentLinks = frame.locator('#contents a, .contents a, [class*="content"] a, main a').filter({
        hasText: /^재고현황$/,
      });
      if ((await contentLinks.count()) > 0) {
        await contentLinks.first().click();
        console.log("   ✓ 본문 재고현황 링크 클릭");
        await page.waitForTimeout(4000);
        if (await isStockResultsReady(page) || (await isStockSearchForm(page))) return true;
      }
    } catch {
      /* skip */
    }
  }

  if (await clickTextInAnyFrame(page, /^재고현황$/)) {
    await page.waitForTimeout(4000);
    return (await isStockResultsReady(page)) || (await isStockSearchForm(page));
  }

  return false;
}

async function clickSearchButton(page: Page): Promise<boolean> {
  console.log("   → 검색(F8) 실행...");

  for (const frame of page.frames()) {
    const locators = [
      frame.getByText(/검색\s*\(F8\)/i).first(),
      frame.locator('button, a, span, div[role="button"]').filter({ hasText: /검색\s*\(F8\)/i }).first(),
    ];
    for (const btn of locators) {
      try {
        if ((await btn.count()) > 0 && (await btn.isVisible())) {
          await btn.scrollIntoViewIfNeeded().catch(() => {});
          await btn.click({ force: true });
          console.log("   ✓ 검색(F8) 클릭");
          return true;
        }
      } catch {
        /* next */
      }
    }
  }

  // 보고서 iframe에 포커스 후 F8
  for (const frame of page.frames()) {
    try {
      if ((await frame.locator("text=기준일자").count()) > 0) {
        await frame.locator("body").click({ position: { x: 20, y: 20 }, force: true }).catch(() => {});
        break;
      }
    } catch {
      /* skip */
    }
  }
  await page.keyboard.press("F8").catch(() => {});
  console.log("   ✓ F8 키 입력");
  return true;
}

/** 검색(F8) 실행 후 결과 테이블 대기 */
async function runStockSearch(page: Page) {
  if (await isStockResultsReady(page)) {
    console.log("   ✓ 재고 결과 테이블 확인 — 검색 생략");
    return;
  }

  if (!(await isStockSearchForm(page))) {
    console.log("   → 검색 조건 화면 아님 — 재고현황 메뉴 재클릭");
    await openStockReportProgram(page, "C000035");
    await page.waitForTimeout(2000);
  }

  await clickSearchButton(page);
  console.log("3. 검색 결과 로딩 대기...");

  if (!(await waitForStockResultsReady(page, 60))) {
    console.warn("   ⚠ 재고 결과 화면 60초 내 미확인 — 다운로드 재시도 예정");
  }
}

export async function dismissEcountPopups(page: Page) {
  await page.keyboard.press("Escape").catch(() => {});
  for (const pattern of [/확인/, /닫기/, /오늘 하루/, /close/i]) {
    await clickTextInAnyFrame(page, pattern);
    await page.waitForTimeout(400);
  }
}

async function tryMenuSearch(page: Page, keyword: string): Promise<boolean> {
  const selectors = [
    'input[placeholder*="메뉴"]',
    'input[placeholder*="Menu"]',
    "#txtMenuSearch",
    "#menuSearch",
    'input[type="search"]',
  ];
  for (const frame of page.frames()) {
    for (const sel of selectors) {
      const input = frame.locator(sel).first();
      try {
        if ((await input.count()) > 0 && (await input.isVisible())) {
          await input.fill(keyword);
          await input.press("Enter");
          await page.waitForTimeout(4000);
          console.log(`   ✓ 메뉴 검색: ${keyword} (${sel})`);
          return true;
        }
      } catch {
        /* continue */
      }
    }
  }
  return false;
}

export type StockNavOptions = {
  stock_menu_url?: string | null;
  stock_menu_depth1?: string | null;
  stock_menu_depth2?: string | null;
};

/** 로그인 직후 현재 세션 URL에 hash만 적용 (ec_req_sid는 세션마다 다름) */
async function gotoStockViaHash(page: Page, savedUrl: string): Promise<boolean> {
  const parsed = parseStockMenuUrl(savedUrl);
  if (!parsed?.hash) return false;

  const current = new URL(page.url());
  current.hash = parsed.hash;
  const target = current.toString();
  console.log(`   → hash 네비게이션: ${target.slice(0, 100)}...`);
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

/** 재고현황(엑셀 다운로드) 화면까지 이동 */
export async function navigateToStockReport(page: Page, opts: StockNavOptions = {}) {
  console.log("2. 재고현황 화면 이동...");
  await dismissEcountPopups(page);

  const menuUrl = (opts.stock_menu_url || process.env.ECOUNT_STOCK_MENU_URL || "").trim();
  if (menuUrl) {
    const parsed = parseStockMenuUrl(menuUrl);
    console.log(`   → 저장된 URL (정규화): ${(parsed?.normalized || menuUrl).slice(0, 90)}...`);

    let opened =
      (await gotoStockViaHash(page, menuUrl)) ||
      (await clickMenuIdsFromUrl(page, menuUrl));

    if (!opened && parsed?.normalized && !parsed.normalized.includes("ec_req_sid")) {
      console.log("   → 정규화 URL 직접 이동 시도...");
      await page.goto(parsed.normalized, { waitUntil: "networkidle", timeout: 90000 });
      opened = true;
    }

    if (!opened) {
      throw new Error("저장된 재고현황 URL로 화면 이동 실패");
    }

    await dismissEcountPopups(page);
    console.log(`   현재 URL: ${page.url()}`);

    if (!(await openStockReportProgram(page, parsed?.prgId))) {
      console.warn("   ⚠ 재고현황 보고서 자동 클릭 실패 — 조회만 시도");
    }

    await runStockSearch(page);
    return;
  }

  const d1 = opts.stock_menu_depth1 || process.env.ECOUNT_STOCK_MENU_DEPTH1;
  const d2 = opts.stock_menu_depth2 || process.env.ECOUNT_STOCK_MENU_DEPTH2;

  if (d1 && d2) {
    if (!(await clickInAnyFrame(page, d1))) throw new Error(`메뉴 클릭 실패: ${d1}`);
    await page.waitForTimeout(2000);
    if (!(await clickInAnyFrame(page, d2))) throw new Error(`메뉴 클릭 실패: ${d2}`);
  } else if (await tryMenuSearch(page, "재고현황")) {
    /* ok */
  } else {
    const topClicked =
      (await clickTextInAnyFrame(page, /^재고\s*I$/)) ||
      (await clickTextInAnyFrame(page, /^재고\s*Ⅰ$/)) ||
      (await clickTextInAnyFrame(page, /재고\s*\(1\)/));

    if (!topClicked) {
      await clickInAnyFrame(page, "#link_depth1_MENUTREE_000004");
      await clickInAnyFrame(page, "#link_depth1_MENUTREE_000782");
      await clickInAnyFrame(page, "#link_depth1_MENUTREE_000783");
    }

    await page.waitForTimeout(2500);
    await dismissEcountPopups(page);

    if (!(await clickTextInAnyFrame(page, /재고현황/))) {
      if (!(await clickInAnyFrame(page, "#link_depth2_MENUTREE_000035"))) {
        throw new Error(
          "재고현황 메뉴 자동 이동 실패. PC에서 재고현황 화면 주소(URL)를 복사해 /admin/ecount-bot → 재고현황 URL 에 저장하세요."
        );
      }
    }
  }

  await page.waitForTimeout(2000);
  await dismissEcountPopups(page);
  await openStockReportProgram(page, "C000035");
  await runStockSearch(page);
  console.log(`   현재 URL: ${page.url()}`);
}

/** 다운로드 단계에서 검색(F8) 재시도용 */
export async function runStockSearchAfterNavigate(page: Page) {
  await dismissEcountPopups(page);
  await runStockSearch(page);
}

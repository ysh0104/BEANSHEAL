import type { Page } from "playwright";

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

/** 재고현황(엑셀 다운로드) 화면까지 이동 */
export async function navigateToStockReport(page: Page, opts: StockNavOptions = {}) {
  console.log("2. 재고현황 화면 이동...");
  await dismissEcountPopups(page);

  const menuUrl = (opts.stock_menu_url || process.env.ECOUNT_STOCK_MENU_URL || "").trim();
  if (menuUrl) {
    console.log(`   → 저장된 URL로 이동: ${menuUrl.slice(0, 80)}...`);
    await page.goto(menuUrl, { waitUntil: "networkidle", timeout: 90000 });
    await page.waitForTimeout(3000);
    await dismissEcountPopups(page);
    console.log(`   현재 URL: ${page.url()}`);
    await clickTextInAnyFrame(page, /^조회$|^검색$|F8/i);
    await page.waitForTimeout(15000);
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
      await clickInAnyFrame(page, "#link_depth1_MENUTREE_000782");
      await clickInAnyFrame(page, "#link_depth1_MENUTREE_000783");
    }

    await page.waitForTimeout(2500);
    await dismissEcountPopups(page);

    if (!(await clickTextInAnyFrame(page, /재고현황/))) {
      throw new Error(
        "재고현황 메뉴 자동 이동 실패. PC에서 재고현황 화면 주소(URL)를 복사해 /admin/ecount-bot → 재고현황 URL 에 저장하세요."
      );
    }
  }

  await page.waitForTimeout(2000);
  await dismissEcountPopups(page);
  await clickTextInAnyFrame(page, /^조회$|^검색$|F8/i);
  console.log("3. 데이터 로딩 대기 (20초)...");
  console.log(`   현재 URL: ${page.url()}`);
  await page.waitForTimeout(20000);
}

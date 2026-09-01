import type { Frame, Locator, Page } from "playwright";

const EXCEL_SELECTORS = [
  "#outputExcel",
  '[id*="outputExcel"]',
  "#btnExcel",
  '[id*="btnExcel"]',
  '[title*="엑셀"]',
  '[title*="Excel"]',
];

/** 재고현황 검색 조건 화면 (기준일자 + 검색 F8) */
export async function isStockSearchForm(page: Page): Promise<boolean> {
  for (const frame of page.frames()) {
    try {
      const searchBtn = frame.getByText(/검색\s*\(F8\)/i).first();
      const dateLabel = frame.locator("text=기준일자").first();
      if ((await searchBtn.count()) > 0 && (await searchBtn.isVisible()) && (await dateLabel.count()) > 0) {
        return true;
      }
    } catch {
      /* skip */
    }
  }
  return false;
}

/** 검색 완료 후 결과 테이블 + Excel (검색 F8 화면과 구분) */
export async function isStockResultsReady(page: Page): Promise<boolean> {
  if (await isStockSearchForm(page)) return false;

  for (const frame of page.frames()) {
    try {
      const itemCode = frame.locator("text=품목코드").first();
      const qty = frame.locator("text=재고수량").first();
      if ((await itemCode.count()) === 0 || !(await itemCode.isVisible())) continue;
      if ((await qty.count()) === 0 || !(await qty.isVisible())) continue;

      for (const sel of EXCEL_SELECTORS) {
        const excel = frame.locator(sel).first();
        if ((await excel.count()) > 0 && (await excel.isVisible())) {
          const box = await excel.boundingBox();
          if (box && box.width > 2 && box.height > 2) return true;
        }
      }
      const excelText = frame.getByText(/^Excel$/i).first();
      if ((await excelText.count()) > 0 && (await excelText.isVisible())) return true;
    } catch {
      /* skip */
    }
  }
  return false;
}

async function findExcelInResultsFrame(page: Page): Promise<{ frame: Frame; locator: Locator } | null> {
  for (const frame of page.frames()) {
    try {
      const itemCode = frame.locator("text=품목코드").first();
      if ((await itemCode.count()) === 0 || !(await itemCode.isVisible())) continue;

      for (const sel of EXCEL_SELECTORS) {
        const loc = frame.locator(sel).first();
        if ((await loc.count()) > 0) {
          await loc.scrollIntoViewIfNeeded().catch(() => {});
          if (await loc.isVisible()) return { frame, locator: loc };
        }
      }
      const textBtn = frame.getByText(/^Excel$/i).first();
      if ((await textBtn.count()) > 0 && (await textBtn.isVisible())) {
        return { frame, locator: textBtn };
      }
    } catch {
      /* skip */
    }
  }
  return null;
}

/** Excel 버튼이 보이는지 (느슨한 체크 — 검색 생략 판단에는 isStockResultsReady 사용) */
export async function findVisibleExcelButton(page: Page): Promise<{ frame: Frame; locator: Locator } | null> {
  const inResults = await findExcelInResultsFrame(page);
  if (inResults) return inResults;

  for (const frame of page.frames()) {
    for (const sel of EXCEL_SELECTORS) {
      try {
        const loc = frame.locator(sel).first();
        if ((await loc.count()) === 0) continue;
        if (!(await loc.isVisible())) continue;
        const box = await loc.boundingBox();
        if (!box || box.width < 2 || box.height < 2) continue;
        return { frame, locator: loc };
      } catch {
        /* next */
      }
    }
  }
  return null;
}

export async function hasVisibleExcelButton(page: Page): Promise<boolean> {
  return (await findVisibleExcelButton(page)) !== null;
}

export async function clickExcelDownload(page: Page, saveAs: string): Promise<void> {
  const targets: Locator[] = [];

  const inResults = await findExcelInResultsFrame(page);
  if (inResults) targets.push(inResults.locator);

  const visible = await findVisibleExcelButton(page);
  if (visible && !targets.includes(visible.locator)) targets.push(visible.locator);

  for (const frame of page.frames()) {
    const legacy = frame.locator("#outputExcel").first();
    if ((await legacy.count()) > 0 && !targets.some((t) => t === legacy)) {
      targets.push(legacy);
    }
  }

  let lastErr: unknown;
  for (const btn of targets) {
    try {
      await btn.scrollIntoViewIfNeeded().catch(() => {});
      const [download] = await Promise.all([
        page.waitForEvent("download", { timeout: 90000 }),
        btn.click({ force: true }),
      ]);
      await download.saveAs(saveAs);
      return;
    } catch (e) {
      lastErr = e;
      try {
        const [download] = await Promise.all([
          page.waitForEvent("download", { timeout: 90000 }),
          btn.evaluate((el: HTMLElement) => el.click()),
        ]);
        await download.saveAs(saveAs);
        return;
      } catch (e2) {
        lastErr = e2;
      }
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error("EXCEL_CLICK_FAILED");
}

export async function waitForStockResultsReady(page: Page, maxSec = 60): Promise<boolean> {
  const steps = Math.ceil(maxSec / 5);
  for (let i = 0; i < steps; i++) {
    if (await isStockResultsReady(page)) {
      console.log(`   ✓ 재고 결과 화면 확인 (${(i + 1) * 5}초)`);
      return true;
    }
    await page.waitForTimeout(5000);
  }
  return false;
}

const SEARCH_BTN_PATTERN = /(?:검색|Search)\s*\(F\d+\)/i;

/** 출력물 목록(재고수불부·재고현황 링크 카드) 화면 */
export async function isReportsListingPage(page: Page): Promise<boolean> {
  for (const frame of page.frames()) {
    try {
      const folderTitle = frame.getByText(/^출력물$/).first();
      const hasTitle = (await folderTitle.count()) > 0 && (await folderTitle.isVisible());
      if (!hasTitle) continue;

      const ledgerInContent = frame
        .locator('#contents a, .contents a, [class*="content"] a, main a')
        .filter({ hasText: /^재고\s*수불부$/ });
      if ((await ledgerInContent.count()) > 0) return true;
    } catch {
      /* skip */
    }
  }
  return false;
}

/** 재고수불부 프로그램 화면 (검색/결과) — 제목 기준 */
export async function isLedgerProgramPage(page: Page): Promise<boolean> {
  if (await isReportsListingPage(page)) return false;
  if (await isStockResultsReady(page) || (await isStockSearchForm(page))) return false;

  for (const frame of page.frames()) {
    try {
      const title = frame.getByText(/^재고\s*수불부$/).first();
      if ((await title.count()) === 0 || !(await title.isVisible())) continue;

      const searchBtn = frame.getByText(SEARCH_BTN_PATTERN).first();
      if ((await searchBtn.count()) > 0 && (await searchBtn.isVisible())) return true;

      if (await isLedgerResultsTableReady(page)) return true;
    } catch {
      /* skip */
    }
  }
  return false;
}

/** 재고수불부 결과 테이블 (일자·거래처명·적요·입고 등 — Excel 버튼 불필요) */
export async function isLedgerResultsTableReady(page: Page): Promise<boolean> {
  if (await isReportsListingPage(page)) return false;
  if (await isStockResultsReady(page) || (await isStockSearchForm(page))) return false;

  for (const frame of page.frames()) {
    try {
      const partner = frame.getByText("거래처명", { exact: true }).first();
      const remarks = frame.getByText("적요", { exact: true }).first();
      const inQty = frame.getByText(/입고수량/).first();
      const opening = frame.getByText(/전일재고/).first();

      const hasPartner = (await partner.count()) > 0 && (await partner.isVisible());
      const hasRemarks = (await remarks.count()) > 0 && (await remarks.isVisible());
      const hasInQty = (await inQty.count()) > 0 && (await inQty.isVisible());
      const hasOpening = (await opening.count()) > 0 && (await opening.isVisible());

      if (hasOpening) return true;
      if (hasPartner && (hasRemarks || hasInQty)) return true;
    } catch {
      /* skip */
    }
  }
  return false;
}

/** 재고수불부 검색 조건 화면 */
export async function isLedgerSearchForm(page: Page): Promise<boolean> {
  if (await isLedgerResultsTableReady(page)) return false;
  if (await isStockResultsReady(page)) return false;

  for (const frame of page.frames()) {
    try {
      const searchBtn = frame.getByText(/검색\s*\(F8\)/i).first();
      if ((await searchBtn.count()) === 0 || !(await searchBtn.isVisible())) continue;

      const stockDate = frame.locator("text=기준일자").first();
      if ((await stockDate.count()) > 0 && (await stockDate.isVisible())) continue;

      const stockQty = frame.locator("text=재고수량").first();
      if ((await stockQty.count()) > 0 && (await stockQty.isVisible())) continue;

      const periodHint = frame.locator("text=/조회기간|기간|품목코드/").first();
      if ((await periodHint.count()) > 0 && (await periodHint.isVisible())) return true;

      const dateInputs = frame.locator('input[type="text"]');
      if ((await dateInputs.count()) >= 2) return true;
    } catch {
      /* skip */
    }
  }
  return false;
}

/** 재고수불부 결과 (테이블 + Excel) */
export async function isLedgerResultsReady(page: Page): Promise<boolean> {
  if (!(await isLedgerResultsTableReady(page))) return false;

  for (const frame of page.frames()) {
    try {
      for (const sel of EXCEL_SELECTORS) {
        const excel = frame.locator(sel).first();
        if ((await excel.count()) > 0 && (await excel.isVisible())) {
          const box = await excel.boundingBox();
          if (box && box.width > 2 && box.height > 2) return true;
        }
      }
      const excelText = frame.getByText(/^Excel$/i).first();
      if ((await excelText.count()) > 0 && (await excelText.isVisible())) return true;
    } catch {
      /* skip */
    }
  }
  return false;
}

async function findExcelInLedgerResultsFrame(page: Page): Promise<{ frame: Frame; locator: Locator } | null> {
  if (!(await isLedgerResultsTableReady(page))) return null;

  for (const frame of page.frames()) {
    try {
      for (const sel of EXCEL_SELECTORS) {
        const loc = frame.locator(sel).first();
        if ((await loc.count()) > 0) {
          await loc.scrollIntoViewIfNeeded().catch(() => {});
          if (await loc.isVisible()) return { frame, locator: loc };
        }
      }
      const textBtn = frame.getByText(/^Excel$/i).first();
      if ((await textBtn.count()) > 0 && (await textBtn.isVisible())) {
        return { frame, locator: textBtn };
      }
    } catch {
      /* skip */
    }
  }
  return null;
}

export async function clickLedgerExcelDownload(page: Page, saveAs: string): Promise<void> {
  if (await isStockResultsReady(page)) {
    throw new Error("WRONG_REPORT: 재고현황 화면입니다. 재고수불부로 이동 후 다시 시도하세요.");
  }

  if (!(await isLedgerResultsTableReady(page))) {
    throw new Error("LEDGER_TABLE_NOT_READY");
  }

  for (const frame of page.frames()) {
    await frame.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
  }
  await page.waitForTimeout(1500);

  const targets: Locator[] = [];
  const inLedger = await findExcelInLedgerResultsFrame(page);
  if (inLedger) targets.push(inLedger.locator);

  const visible = await findVisibleExcelButton(page);
  if (visible && !targets.some((t) => t === visible.locator)) {
    if (!(await isStockResultsReady(page))) targets.push(visible.locator);
  }

  for (const frame of page.frames()) {
    const legacy = frame.locator("#outputExcel").first();
    if ((await legacy.count()) > 0 && !targets.includes(legacy)) {
      targets.push(legacy);
    }
  }

  let lastErr: unknown;
  for (const btn of targets) {
    try {
      await btn.scrollIntoViewIfNeeded().catch(() => {});
      const [download] = await Promise.all([
        page.waitForEvent("download", { timeout: 90000 }),
        btn.click({ force: true }),
      ]);
      await download.saveAs(saveAs);
      return;
    } catch (e) {
      lastErr = e;
      try {
        const [download] = await Promise.all([
          page.waitForEvent("download", { timeout: 90000 }),
          btn.evaluate((el: HTMLElement) => el.click()),
        ]);
        await download.saveAs(saveAs);
        return;
      } catch (e2) {
        lastErr = e2;
      }
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error("LEDGER_EXCEL_CLICK_FAILED");
}

export async function waitForLedgerResultsReady(page: Page, maxSec = 90): Promise<boolean> {
  const steps = Math.ceil(maxSec / 3);
  for (let i = 0; i < steps; i++) {
    if (await isLedgerResultsTableReady(page)) {
      console.log(`   ✓ 재고수불부 결과 테이블 확인 (${(i + 1) * 3}초)`);
      return true;
    }
    await page.waitForTimeout(3000);
  }
  return false;
}

/** @deprecated use waitForStockResultsReady */
export async function waitForExcelButton(page: Page, maxSec = 60): Promise<boolean> {
  return waitForStockResultsReady(page, maxSec);
}

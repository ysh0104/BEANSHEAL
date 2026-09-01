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

/** 재고수불부 검색 조건 화면 (일자/기간 + 검색 F8, 품목코드·재고수량 헤더 없음) */
export async function isLedgerSearchForm(page: Page): Promise<boolean> {
  if (await isStockResultsReady(page)) return false;
  for (const frame of page.frames()) {
    try {
      const searchBtn = frame.getByText(/검색\s*\(F8\)/i).first();
      if ((await searchBtn.count()) === 0 || !(await searchBtn.isVisible())) continue;
      const stockQty = frame.locator("text=재고수량").first();
      if ((await stockQty.count()) > 0 && (await stockQty.isVisible())) continue;
      const periodHint = frame.locator("text=/기간|일자|조회기간/").first();
      if ((await periodHint.count()) > 0) return true;
      const dateInputs = frame.locator('input[type="text"]');
      if ((await dateInputs.count()) >= 2) return true;
    } catch {
      /* skip */
    }
  }
  return false;
}

/** 재고수불부 결과 (일자 + 입고/출고 컬럼 + Excel) */
export async function isLedgerResultsReady(page: Page): Promise<boolean> {
  if (await isStockResultsReady(page)) return false;

  for (const frame of page.frames()) {
    try {
      const dateCol = frame.locator("text=일자").first();
      const inCol = frame.locator("text=/입고/").first();
      const outCol = frame.locator("text=/출고/").first();
      if ((await dateCol.count()) === 0 || !(await dateCol.isVisible())) continue;
      if ((await inCol.count()) === 0 && (await outCol.count()) === 0) continue;

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
  for (const frame of page.frames()) {
    try {
      const dateCol = frame.locator("text=일자").first();
      if ((await dateCol.count()) === 0 || !(await dateCol.isVisible())) continue;

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

  const targets: Locator[] = [];
  const inLedger = await findExcelInLedgerResultsFrame(page);
  if (inLedger) targets.push(inLedger.locator);

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
  const steps = Math.ceil(maxSec / 5);
  for (let i = 0; i < steps; i++) {
    if (await isLedgerResultsReady(page)) {
      console.log(`   ✓ 재고수불부 결과 화면 확인 (${(i + 1) * 5}초)`);
      return true;
    }
    await page.waitForTimeout(5000);
  }
  return false;
}

/** @deprecated use waitForStockResultsReady */
export async function waitForExcelButton(page: Page, maxSec = 60): Promise<boolean> {
  return waitForStockResultsReady(page, maxSec);
}

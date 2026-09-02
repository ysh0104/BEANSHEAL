import type { Frame, Locator, Page } from "playwright";

const EXCEL_SELECTORS = [
  "#outputExcel",
  '[id*="outputExcel"]',
  "#btnExcel",
  '[id*="btnExcel"]',
  '[title*="엑셀"]',
  '[title*="Excel"]',
];

/** 재고현황 검색 조건 — 재고수불부(기준일자+검색 동일)와 제목으로 구분 */
export async function isStockSearchForm(page: Page): Promise<boolean> {
  if (isKnownLedgerPrgId(getPagePrgId(page))) return false;
  for (const frame of page.frames()) {
    if (await frameHasVisibleLedgerTitle(frame)) return false;
  }

  for (const frame of page.frames()) {
    if (await isStockSearchFormInFrame(frame)) return true;
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

const SEARCH_BTN_PATTERN = /(?:검색|Search|조회)\s*\(F\d+\)/i;

export { SEARCH_BTN_PATTERN };

const OUTPUT_FOLDER_PRG_IDS = new Set(["C000035"]);

export function getPagePrgId(page: Page): string | null {
  try {
    const hash = page.url().split("#")[1] || "";
    return new URLSearchParams(hash).get("prgId");
  } catch {
    return null;
  }
}

/** E040702 등 재고수불부 프로그램 prgId (출력물 폴더 C000035 제외) */
export function isKnownLedgerPrgId(prgId: string | null | undefined): boolean {
  if (!prgId || OUTPUT_FOLDER_PRG_IDS.has(prgId)) return false;
  const configured = process.env.ECOUNT_LEDGER_PRG_ID?.trim();
  if (configured && prgId.toUpperCase() === configured.toUpperCase()) return true;
  if (/^E\d+/i.test(prgId)) return true;
  if (/^C00003[46789]/i.test(prgId)) return true;
  return false;
}

/** C000650 등 재고현황 프로그램 prgId */
export function isKnownStockPrgId(prgId: string | null | undefined): boolean {
  if (!prgId) return false;
  const configured = process.env.ECOUNT_STOCK_PRG_ID?.trim();
  if (configured && prgId.toUpperCase() === configured.toUpperCase()) return true;
  if (/^C00065/i.test(prgId)) return true;
  if (/^C00003[012]/i.test(prgId) && prgId !== "C000035") return true;
  return false;
}

export async function isOnStockReportPage(page: Page): Promise<boolean> {
  const prgId = getPagePrgId(page);
  if (isKnownLedgerPrgId(prgId)) {
    if (await isLedgerSearchForm(page) || (await isLedgerResultsTableReady(page))) return false;
    return false;
  }
  if (await isStockResultsReady(page)) return true;
  if (await isLedgerSearchForm(page)) return false;
  if (await isStockSearchForm(page)) return true;
  return isKnownStockPrgId(prgId);
}

async function frameHasVisibleLedgerTitle(frame: Frame): Promise<boolean> {
  try {
    const title = frame.getByText(/^재고\s*수불부$/).first();
    return (await title.count()) > 0 && (await title.isVisible());
  } catch {
    return false;
  }
}

async function frameHasVisibleStockTitle(frame: Frame): Promise<boolean> {
  try {
    const title = frame.getByText(/^재고현황$/).first();
    return (await title.count()) > 0 && (await title.isVisible());
  } catch {
    return false;
  }
}

/** 재고수불부 검색 iframe — 제목 「재고수불부」+ 기준일자/검색(F8) */
async function isLedgerSearchFormInFrame(frame: Frame): Promise<boolean> {
  try {
    if (!(await frameHasVisibleLedgerTitle(frame))) return false;
    const searchBtn = frame.getByText(SEARCH_BTN_PATTERN).first();
    const dateLabel = frame.locator("text=기준일자").first();
    const hasSearch = (await searchBtn.count()) > 0 && (await searchBtn.isVisible());
    const hasDate = (await dateLabel.count()) > 0 && (await dateLabel.isVisible());
    return hasSearch || hasDate;
  } catch {
    return false;
  }
}

/** 재고현황 검색 iframe — 재고수불부 제목이 없을 때만 */
async function isStockSearchFormInFrame(frame: Frame): Promise<boolean> {
  try {
    if (await frameHasVisibleLedgerTitle(frame)) return false;

    const searchBtn = frame.getByText(/검색\s*\(F8\)/i).first();
    const dateLabel = frame.locator("text=기준일자").first();
    const hasSearch = (await searchBtn.count()) > 0 && (await searchBtn.isVisible());
    const hasDate = (await dateLabel.count()) > 0 && (await dateLabel.isVisible());

    if (await frameHasVisibleStockTitle(frame) && hasSearch) return true;
    return hasDate && hasSearch;
  } catch {
    return false;
  }
}

async function isStockFrame(frame: Frame): Promise<boolean> {
  try {
    if (await frameHasVisibleLedgerTitle(frame)) return false;
    if (await frameHasVisibleStockTitle(frame)) return true;
    const stockQty = frame.locator("text=재고수량").first();
    if ((await stockQty.count()) > 0 && (await stockQty.isVisible())) return true;
    return await isStockSearchFormInFrame(frame);
  } catch {
    return false;
  }
}

/** 재고수불부 검색/결과 iframe */
export async function findLedgerFrames(page: Page): Promise<Frame[]> {
  const frames: Frame[] = [];
  for (const frame of page.frames()) {
    try {
      if (await isStockFrame(frame)) continue;

      if (await isLedgerSearchFormInFrame(frame)) {
        frames.push(frame);
        continue;
      }

      const title = frame.getByText(/^재고\s*수불부$/).first();
      const warehouse = frame.locator("text=창고").first();
      const searchBtn = frame.getByText(SEARCH_BTN_PATTERN).first();
      const dateLabel = frame.locator("text=기준일자").first();
      const ledgerHeader = frame.locator("text=/거래처명|적요|입고수량|전일재고/").first();

      const hasTitle = (await title.count()) > 0 && (await title.isVisible());
      const hasWarehouse = (await warehouse.count()) > 0 && (await warehouse.isVisible());
      const hasSearch = (await searchBtn.count()) > 0 && (await searchBtn.isVisible());
      const hasDate = (await dateLabel.count()) > 0 && (await dateLabel.isVisible());
      const hasHeader = (await ledgerHeader.count()) > 0 && (await ledgerHeader.isVisible());

      if (hasTitle) {
        frames.push(frame);
        continue;
      }
      if (hasWarehouse && hasDate && hasSearch) {
        frames.push(frame);
        continue;
      }
      if (hasHeader) frames.push(frame);
    } catch {
      /* skip */
    }
  }
  return frames;
}

/** 출력물 목록(재고수불부·재고현황 카드) 화면 */
export async function isReportsListingPage(page: Page): Promise<boolean> {
  for (const frame of page.frames()) {
    try {
      const folderTitle = frame.getByText(/^출력물$/).first();
      const hasTitle = (await folderTitle.count()) > 0 && (await folderTitle.isVisible());

      const ledgerInContent = frame
        .locator('#contents a, .contents a, [class*="content"] a, main a, [class*="program"] a')
        .filter({ hasText: /^재고\s*수불부$/ });
      const stockInContent = frame
        .locator('#contents a, .contents a, [class*="content"] a, main a, [class*="program"] a')
        .filter({ hasText: /^재고현황$/ });

      const hasLedger = (await ledgerInContent.count()) > 0;
      const hasStock = (await stockInContent.count()) > 0;

      if (hasTitle && hasLedger) return true;
      if (hasLedger && hasStock) return true;
    } catch {
      /* skip */
    }
  }
  return false;
}

/** 재고수불부 프로그램 화면 (검색/결과) — 탭 제목 기준 */
export async function isLedgerProgramPage(page: Page): Promise<boolean> {
  if (await isReportsListingPage(page)) return false;
  if (await isOnStockReportPage(page)) return false;

  const ledgerFrames = await findLedgerFrames(page);
  return ledgerFrames.length > 0;
}

/** 검색 실행 후 로딩 중 (재네비게이션 방지) */
export async function isLedgerSearchLoading(page: Page): Promise<boolean> {
  if (await isReportsListingPage(page)) return false;
  if (await isStockResultsReady(page) || (await isStockSearchForm(page))) return false;

  for (const frame of page.frames()) {
    try {
      const loadingHints = [
        frame.locator("text=/조회\\s*중|로딩|Loading|처리\\s*중/").first(),
        frame.locator('[class*="loading"], [class*="spinner"], [class*="progress"]').first(),
      ];
      for (const hint of loadingHints) {
        if ((await hint.count()) > 0 && (await hint.isVisible())) return true;
      }
    } catch {
      /* skip */
    }
  }
  return false;
}

async function countVisibleLedgerHeaderCells(frame: Frame): Promise<number> {
  const headerPatterns: (string | RegExp)[] = [
    "거래처명",
    "적요",
    /입고수량/,
    /출고수량/,
    /전일재고/,
    /^일자$/,
    "품목코드",
    "품목명",
  ];
  let hits = 0;
  for (const pattern of headerPatterns) {
    try {
      const cell =
        typeof pattern === "string" ? frame.getByText(pattern, { exact: true }).first() : frame.getByText(pattern).first();
      if ((await cell.count()) > 0 && (await cell.isVisible())) hits++;
    } catch {
      /* skip */
    }
  }
  return hits;
}

/** 재고현황 결과 — isStockResultsReady와 분리(순환 호출 방지) */
async function isStockResultsPageShallow(page: Page): Promise<boolean> {
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

/** 재고수불부 결과 — isLedgerResultsTableReady와 분리(순환 호출 방지) */
async function isLedgerResultsPageShallow(page: Page): Promise<boolean> {
  if (await isReportsListingPage(page)) return false;

  for (const frame of page.frames()) {
    try {
      if (await isStockFrame(frame)) continue;

      const headerHits = await countVisibleLedgerHeaderCells(frame);
      if (headerHits >= 2) return true;

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

async function hasVisibleLedgerExcel(page: Page): Promise<boolean> {
  if (await isStockResultsPageShallow(page)) return false;

  const scanFrames = async (frames: Frame[]) => {
    for (const frame of frames) {
      try {
        if (await isStockFrame(frame)) continue;
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
  };

  const ledgerFrames = await findLedgerFrames(page);
  if (await scanFrames(ledgerFrames)) return true;

  if (isKnownLedgerPrgId(getPagePrgId(page))) {
    const nonStock = [];
    for (const frame of page.frames()) {
      if (!(await isStockFrame(frame))) nonStock.push(frame);
    }
    if (await scanFrames(nonStock)) return true;
  }

  const visible = await findVisibleExcelButton(page);
  return visible !== null && !(await isStockResultsPageShallow(page));
}

/** 재고수불부 결과 테이블 또는 Excel 버튼 */
export async function isLedgerResultsTableReady(page: Page): Promise<boolean> {
  if (await isReportsListingPage(page)) return false;
  if (await isStockResultsPageShallow(page)) return false;
  if (await isLedgerResultsPageShallow(page)) return true;

  for (const frame of page.frames()) {
    try {
      const headerHits = await countVisibleLedgerHeaderCells(frame);
      if (headerHits >= 2) return true;

      const title = frame.getByText(/^재고\s*수불부$/).first();
      const dateRow = frame.locator("text=/\\d{4}\\/\\d{2}\\/\\d{2}/").first();
      const monthTotal = frame.locator("text=/\\d{4}\\/\\d{2}\\s*계/").first();
      const itemBlock = frame.locator("text=/\\[\\s*\\d{5,}\\s*\\]/").first();

      if ((await title.count()) > 0 && (await title.isVisible())) {
        if (
          ((await dateRow.count()) > 0 && (await dateRow.isVisible())) ||
          ((await monthTotal.count()) > 0 && (await monthTotal.isVisible())) ||
          ((await itemBlock.count()) > 0 && (await itemBlock.isVisible()))
        ) {
          return true;
        }
      }

      if (headerHits >= 1) {
        const dataRow = frame.locator("td, [class*='grid'] div").filter({ hasText: /^\d{4}\/\d{2}\/\d{2}/ }).first();
        if ((await dataRow.count()) > 0 && (await dataRow.isVisible())) return true;
      }
    } catch {
      /* skip */
    }
  }
  return false;
}

/** 재고수불부 검색 조건 화면 */
export async function isLedgerSearchForm(page: Page): Promise<boolean> {
  if (await isReportsListingPage(page)) return false;
  if (await isLedgerResultsPageShallow(page)) return false;

  for (const frame of page.frames()) {
    if (await isLedgerSearchFormInFrame(frame)) return true;
  }

  const ledgerFrames = await findLedgerFrames(page);
  for (const frame of ledgerFrames) {
    try {
      const searchBtn = frame.getByText(SEARCH_BTN_PATTERN).first();
      const dateLabel = frame.locator("text=기준일자").first();
      const hasSearch = (await searchBtn.count()) > 0 && (await searchBtn.isVisible());
      const hasDate = (await dateLabel.count()) > 0 && (await dateLabel.isVisible());
      if (hasSearch && hasDate) return true;
    } catch {
      /* skip */
    }
  }

  return false;
}

export async function isLedgerScreenReady(page: Page): Promise<boolean> {
  return (
    (await isLedgerProgramPage(page)) ||
    (await isLedgerSearchForm(page)) ||
    (await isLedgerResultsTableReady(page))
  );
}

export async function waitForLedgerSearchForm(page: Page, maxSec = 45): Promise<boolean> {
  const steps = Math.ceil(maxSec / 3);
  for (let i = 0; i < steps; i++) {
    if (await isLedgerScreenReady(page)) {
      console.log(`   ✓ 재고수불부 화면 (${(i + 1) * 3}초)`);
      return true;
    }

    const prgId = getPagePrgId(page);
    if (isKnownLedgerPrgId(prgId) && i >= 2) {
      if (await isLedgerSearchForm(page)) {
        console.log(`   ✓ 재고수불부 검색 화면 (prgId=${prgId}, ${(i + 1) * 3}초)`);
        return true;
      }
    }

    if (prgId && prgId !== "C000035" && i > 0 && i % 2 === 0) {
      console.log(`   … prgId=${prgId} 로딩 (${(i + 1) * 3}초)`);
    }

    await page.waitForTimeout(3000);
  }
  return (await isLedgerSearchForm(page)) || (await isLedgerResultsTableReady(page));
}

/** 재고수불부 결과 (테이블 + Excel) */
export async function isLedgerResultsReady(page: Page): Promise<boolean> {
  const tableReady = await isLedgerResultsTableReady(page);
  const excelReady = await hasVisibleLedgerExcel(page);
  if (tableReady && excelReady) return true;
  if (excelReady && (await isLedgerProgramPage(page))) return true;
  return false;
}

async function findExcelInLedgerResultsFrame(page: Page): Promise<{ frame: Frame; locator: Locator } | null> {
  if (await isStockResultsReady(page)) return null;

  const ledgerFrames = await findLedgerFrames(page);
  const framesToScan = ledgerFrames.length > 0 ? ledgerFrames : page.frames();

  for (const frame of framesToScan) {
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
  if (await isOnStockReportPage(page)) {
    throw new Error("WRONG_REPORT: 재고현황 화면입니다.");
  }

  const tableReady = await isLedgerResultsTableReady(page);
  const excelVisible = await hasVisibleLedgerExcel(page);
  if (!tableReady && !excelVisible) {
    if (await isLedgerSearchLoading(page)) {
      throw new Error("LEDGER_SEARCH_LOADING");
    }
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

  throw lastErr instanceof Error ? lastErr : new Error("EXCEL_CLICK_FAILED");
}

export async function waitForLedgerResultsReady(page: Page, maxSec = 90): Promise<boolean> {
  const steps = Math.ceil(maxSec / 5);
  for (let i = 0; i < steps; i++) {
    if (await isOnStockReportPage(page)) {
      console.warn(`   ⚠ 재고현황으로 전환됨 (prgId=${getPagePrgId(page)}) — 결과 대기 중단`);
      return false;
    }
    if (await isLedgerResultsTableReady(page)) {
      const viaExcel = await hasVisibleLedgerExcel(page);
      console.log(`   ✓ 재고수불부 결과 확인 (${(i + 1) * 5}초${viaExcel ? ", Excel" : ""})`);
      return true;
    }
    if (await isLedgerSearchLoading(page)) {
      console.log(`   … 조회 중 (${(i + 1) * 5}초)`);
    } else if (i > 0 && i % 6 === 0) {
      console.log(`   … 결과 대기 (${(i + 1) * 5}초 / ${maxSec}초)`);
    }
    await page.waitForTimeout(5000);
  }
  return await isLedgerResultsTableReady(page);
}

/** @deprecated use waitForStockResultsReady */
export async function waitForExcelButton(page: Page, maxSec = 60): Promise<boolean> {
  return waitForStockResultsReady(page, maxSec);
}

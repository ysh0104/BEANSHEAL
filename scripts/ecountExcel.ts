import type { Frame, Locator, Page } from "playwright";

const EXCEL_SELECTORS = [
  "#outputExcel",
  '[id*="outputExcel"]',
  "#btnExcel",
  '[id*="btnExcel"]',
  '[title*="엑셀"]',
  '[title*="Excel"]',
];

/** Excel 버튼이 실제로 보이는지 (hidden DOM 제외) */
export async function findVisibleExcelButton(page: Page): Promise<{ frame: Frame; locator: Locator } | null> {
  for (const frame of page.frames()) {
    for (const sel of EXCEL_SELECTORS) {
      try {
        const loc = frame.locator(sel).first();
        if ((await loc.count()) === 0) continue;
        await loc.scrollIntoViewIfNeeded().catch(() => {});
        if (!(await loc.isVisible())) continue;
        const box = await loc.boundingBox();
        if (!box || box.width < 2 || box.height < 2) continue;
        return { frame, locator: loc };
      } catch {
        /* next */
      }
    }
    try {
      const textBtn = frame.getByText(/^Excel$/i).first();
      if ((await textBtn.count()) > 0 && (await textBtn.isVisible())) {
        await textBtn.scrollIntoViewIfNeeded().catch(() => {});
        return { frame, locator: textBtn };
      }
    } catch {
      /* next */
    }
  }
  return null;
}

export async function hasVisibleExcelButton(page: Page): Promise<boolean> {
  return (await findVisibleExcelButton(page)) !== null;
}

export async function clickExcelDownload(page: Page, saveAs: string): Promise<void> {
  const found = await findVisibleExcelButton(page);
  if (!found) throw new Error("EXCEL_BUTTON_NOT_FOUND");

  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 90000 }),
    found.locator.click({ force: true }),
  ]);
  await download.saveAs(saveAs);
}

/** 검색(F8) 후 Excel 버튼 나타날 때까지 대기 */
export async function waitForExcelButton(page: Page, maxSec = 60): Promise<boolean> {
  const steps = Math.ceil(maxSec / 5);
  for (let i = 0; i < steps; i++) {
    if (await hasVisibleExcelButton(page)) {
      console.log(`   ✓ Excel 버튼 확인 (${(i + 1) * 5}초)`);
      return true;
    }
    await page.waitForTimeout(5000);
  }
  return false;
}

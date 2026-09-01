/**
 * 재고수불부 화면 전용 — 재고현황(ecountExcel)과 분리
 */
import type { Frame, Locator, Page } from "playwright";

const SEARCH_BTN = /(?:검색|Search|조회)\s*\(F\d+\)/i;
const EXCEL_SELECTORS = [
  "#outputExcel",
  '[id*="outputExcel"]',
  "#btnExcel",
  '[id*="btnExcel"]',
  '[title*="엑셀"]',
  '[title*="Excel"]',
];

export async function findLedgerFrames(page: Page): Promise<Frame[]> {
  const frames: Frame[] = [];
  for (const frame of page.frames()) {
    try {
      const title = frame.getByText(/^재고\s*수불부$/).first();
      if ((await title.count()) > 0 && (await title.isVisible())) {
        frames.push(frame);
      }
    } catch {
      /* skip */
    }
  }
  return frames;
}

/** 「재고수불부」 제목 + 검색(F8) 또는 기준일자 */
export async function isLedgerSearchScreen(page: Page): Promise<boolean> {
  for (const frame of await findLedgerFrames(page)) {
    try {
      const searchBtn = frame.getByText(SEARCH_BTN).first();
      const dateLabel = frame.locator("text=기준일자").first();
      const hasSearch = (await searchBtn.count()) > 0 && (await searchBtn.isVisible());
      const hasDate = (await dateLabel.count()) > 0 && (await dateLabel.isVisible());
      if (hasSearch || hasDate) return true;
    } catch {
      /* skip */
    }
  }
  return false;
}

export async function waitForLedgerSearchScreen(page: Page, maxSec = 25): Promise<boolean> {
  const steps = Math.ceil(maxSec / 2);
  for (let i = 0; i < steps; i++) {
    if (await isLedgerSearchScreen(page)) {
      console.log(`   ✓ 재고수불부 검색 화면 (${(i + 1) * 2}초)`);
      return true;
    }
    await page.waitForTimeout(2000);
  }
  return false;
}

/** 기타 탭 → 생산불출/창고이동포함 체크 */
export async function ensureProductionTransferIncluded(page: Page): Promise<void> {
  const frames = await findLedgerFrames(page);
  if (frames.length === 0) return;

  for (const frame of frames) {
    const etcTab = frame.locator('a, button, span, li, div[role="tab"]').filter({ hasText: /^기타$/ }).first();
    try {
      if ((await etcTab.count()) > 0 && (await etcTab.isVisible())) {
        await etcTab.click({ force: true });
        await page.waitForTimeout(800);
        console.log("   ✓ 기타 탭");
        break;
      }
    } catch {
      /* skip */
    }
  }

  for (const frame of frames) {
    try {
      const label = frame
        .locator("label, span, td, div")
        .filter({ hasText: /생산불출.*창고이동.*포함/ })
        .first();
      if ((await label.count()) === 0 || !(await label.isVisible())) continue;

      const cb = label.locator('xpath=ancestor::tr[1]//input[@type="checkbox"]').first();
      if ((await cb.count()) === 0) continue;

      if (!(await cb.isChecked())) {
        await cb.click({ force: true });
        console.log("   ✓ 생산불출/창고이동포함 체크");
      } else {
        console.log("   ✓ 생산불출/창고이동포함 (이미 체크됨)");
      }
      return;
    } catch {
      /* skip */
    }
  }
}

/** 「품목개수가 많을 경우…」 알림 → 취소 (확인 누르면 품목 재지정으로 빠짐) */
export async function dismissBulkItemModal(page: Page): Promise<boolean> {
  for (const frame of page.frames()) {
    try {
      const hint = frame.locator("text=/조회품목을 재지정|품목개수가 많을 경우/").first();
      if ((await hint.count()) === 0 || !(await hint.isVisible())) continue;

      const cancel = frame
        .locator('button, a, span, div[role="button"]')
        .filter({ hasText: /^취소$/ })
        .first();
      if ((await cancel.count()) > 0 && (await cancel.isVisible())) {
        await cancel.click({ force: true });
        console.log("   ✓ 품목 재지정 알림 → 취소");
        await page.waitForTimeout(1000);
        return true;
      }
    } catch {
      /* skip */
    }
  }
  return false;
}

export async function clickLedgerSearch(page: Page): Promise<void> {
  console.log("   → 검색(F8)...");
  const frames = await findLedgerFrames(page);

  for (const frame of frames) {
    const locators = [
      frame.getByText(SEARCH_BTN).first(),
      frame.locator('button, a, span, div[role="button"]').filter({ hasText: SEARCH_BTN }).first(),
    ];
    for (const btn of locators) {
      try {
        if ((await btn.count()) > 0 && (await btn.isVisible())) {
          await frame.locator("body").click({ position: { x: 40, y: 40 }, force: true }).catch(() => {});
          await btn.scrollIntoViewIfNeeded().catch(() => {});
          await btn.click({ force: true });
          console.log("   ✓ 검색(F8) 클릭");
          return;
        }
      } catch {
        /* next */
      }
    }
  }

  for (const frame of frames) {
    try {
      await frame.locator("body").click({ position: { x: 40, y: 40 }, force: true });
      await page.keyboard.press("F8");
      console.log("   ✓ F8 키 입력");
      return;
    } catch {
      /* next */
    }
  }

  throw new Error("재고수불부 검색 버튼을 찾지 못했습니다.");
}

async function findLedgerExcelButton(page: Page): Promise<Locator | null> {
  const frames = await findLedgerFrames(page);
  const scan = frames.length > 0 ? frames : page.frames();

  for (const frame of scan) {
    try {
      const stockQty = frame.locator("text=재고수량").first();
      if ((await stockQty.count()) > 0 && (await stockQty.isVisible())) continue;

      for (const sel of EXCEL_SELECTORS) {
        const loc = frame.locator(sel).first();
        if ((await loc.count()) > 0 && (await loc.isVisible())) {
          const box = await loc.boundingBox();
          if (box && box.width > 2 && box.height > 2) return loc;
        }
      }
      const textBtn = frame.getByText(/^Excel$/i).first();
      if ((await textBtn.count()) > 0 && (await textBtn.isVisible())) return textBtn;
    } catch {
      /* skip */
    }
  }
  return null;
}

export async function isLedgerExcelReady(page: Page): Promise<boolean> {
  return (await findLedgerExcelButton(page)) !== null;
}

/** 검색 후 결과 대기 — 대기 중에도 품목 재지정 알림 취소 반복 */
export async function waitForLedgerResults(page: Page, maxSec = 600): Promise<boolean> {
  console.log(`3. 검색 결과 대기 (최대 ${maxSec}초)...`);
  const steps = Math.ceil(maxSec / 5);

  for (let i = 0; i < steps; i++) {
    await dismissBulkItemModal(page);

    if (await isLedgerExcelReady(page)) {
      console.log(`   ✓ Excel 버튼 확인 (${(i + 1) * 5}초)`);
      return true;
    }

    const loading = await page
      .locator("text=/조회\\s*중|로딩|Loading|처리\\s*중/")
      .first()
      .isVisible()
      .catch(() => false);
    if (loading) {
      console.log(`   … 조회 중 (${(i + 1) * 5}초)`);
    } else if (i > 0 && i % 6 === 0) {
      console.log(`   … 결과 대기 (${(i + 1) * 5}초 / ${maxSec}초)`);
    }

    await page.waitForTimeout(5000);
  }

  return await isLedgerExcelReady(page);
}

export async function clickLedgerExcelDownload(page: Page, saveAs: string): Promise<void> {
  const btn = await findLedgerExcelButton(page);
  if (!btn) throw new Error("LEDGER_EXCEL_NOT_FOUND");

  await btn.scrollIntoViewIfNeeded().catch(() => {});
  try {
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 120000 }),
      btn.click({ force: true }),
    ]);
    await download.saveAs(saveAs);
    return;
  } catch (e) {
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 120000 }),
      btn.evaluate((el: HTMLElement) => el.click()),
    ]);
    await download.saveAs(saveAs);
  }
}

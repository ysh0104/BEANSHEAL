/**
 * 재고수불부 화면 전용 — ecountExcel과 완전 분리 (순환 호출·무한 대기 방지)
 */
import type { Frame, Locator, Page } from "playwright";

const SEARCH_BTN = /(?:검색|Search|조회)\s*\(F\d+\)/i;
const BULK_ITEM_HINT = /조회품목을\s*재지정|품목개수가\s*많을\s*경우/;
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
      const stockQty = frame.locator("text=재고수량").first();
      if ((await stockQty.count()) > 0 && (await stockQty.isVisible())) continue;

      const title = frame.getByText(/^재고\s*수불부$/).first();
      const date = frame.locator("text=기준일자").first();
      const search = frame.getByText(SEARCH_BTN).first();
      const header = frame.locator("text=/거래처명|입고수량|전일재고|출고수량/").first();

      const hasTitle = (await title.count()) > 0 && (await title.isVisible());
      const hasDate = (await date.count()) > 0 && (await date.isVisible());
      const hasSearch = (await search.count()) > 0 && (await search.isVisible());
      const hasHeader = (await header.count()) > 0 && (await header.isVisible());

      if (hasTitle || hasHeader || (hasDate && hasSearch)) frames.push(frame);
    } catch {
      /* skip */
    }
  }
  return frames;
}

/** 「재고수불부」 검색 조건 화면 */
export async function isLedgerSearchScreen(page: Page): Promise<boolean> {
  for (const frame of await findLedgerFrames(page)) {
    try {
      const search = frame.getByText(SEARCH_BTN).first();
      const date = frame.locator("text=기준일자").first();
      const hasSearch = (await search.count()) > 0 && (await search.isVisible());
      const hasDate = (await date.count()) > 0 && (await date.isVisible());
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
  if (frames.length === 0) {
    for (const frame of page.frames()) frames.push(frame);
  }

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

async function isBulkItemModalVisible(page: Page): Promise<boolean> {
  for (const ctx of [page, ...page.frames()]) {
    if (await hasBulkItemModal(ctx)) return true;
  }
  return false;
}

async function hasBulkItemModal(ctx: Page | Frame): Promise<boolean> {
  const hint = ctx.getByText(BULK_ITEM_HINT).first();
  if ((await hint.count()) > 0 && (await hint.isVisible())) return true;

  const titled = ctx
    .locator('[role="dialog"], .ui-dialog, .modal, .layer_popup, [class*="dialog"]')
    .filter({ hasText: /알림/ })
    .filter({ hasText: BULK_ITEM_HINT })
    .first();
  return (await titled.count()) > 0 && (await titled.isVisible());
}

async function clickBulkItemCancelInContext(ctx: Page | Frame): Promise<boolean> {
  const dialog = ctx
    .locator('[role="dialog"], .ui-dialog, .modal, .layer_popup, [class*="dialog"], [class*="layer"]')
    .filter({ hasText: BULK_ITEM_HINT })
    .first();

  if ((await dialog.count()) > 0 && (await dialog.isVisible())) {
    const cancels = dialog.locator("button, a, input[type='button'], span, div").filter({ hasText: /취소/ });
    const n = await cancels.count();
    for (let i = n - 1; i >= 0; i--) {
      const btn = cancels.nth(i);
      try {
        if (!(await btn.isVisible())) continue;
        const text = ((await btn.innerText()) || "").trim();
        if (text !== "취소") continue;
        await btn.click({ force: true });
        return true;
      } catch {
        /* next */
      }
    }
  }

  const cancel = ctx.getByText("취소", { exact: true }).first();
  if ((await cancel.count()) > 0 && (await cancel.isVisible())) {
    await cancel.click({ force: true });
    return true;
  }

  return false;
}

async function clickBulkItemCancelViaEvaluate(page: Page): Promise<boolean> {
  for (const frame of page.frames()) {
    try {
      const clicked = await frame.evaluate(() => {
        const hintRe = /조회품목을\s*재지정|품목개수가\s*많을\s*경우/;
        const roots = Array.from(
          document.querySelectorAll(
            '.ui-dialog, [role="dialog"], .modal, .layer_popup, .popup, [class*="dialog"], [class*="layer"]'
          )
        );
        roots.push(document.body);

        for (const root of roots) {
          const text = root.textContent || "";
          if (!hintRe.test(text)) continue;

          const candidates = Array.from(root.querySelectorAll("button, a, input[type='button'], span, div"));
          const cancels: HTMLElement[] = [];
          for (const el of candidates) {
            const t = (el.textContent || "").trim();
            if (t !== "취소") continue;
            const html = el as HTMLElement;
            if (html.offsetParent === null && getComputedStyle(html).display === "none") continue;
            cancels.push(html);
          }
          if (cancels.length > 0) {
            cancels[cancels.length - 1].click();
            return true;
          }
        }
        return false;
      });
      if (clicked) return true;
    } catch {
      /* skip */
    }
  }
  return false;
}

export async function dismissBulkItemModal(page: Page): Promise<boolean> {
  if (!(await isBulkItemModalVisible(page))) return false;

  const contexts: Array<Page | Frame> = [page, ...page.frames()];
  for (const ctx of contexts) {
    try {
      if (!(await hasBulkItemModal(ctx))) continue;
      if (await clickBulkItemCancelInContext(ctx)) {
        console.log("   ✓ 품목 재지정 알림 → 취소");
        await page.waitForTimeout(800);
        return true;
      }
    } catch {
      /* skip */
    }
  }

  if (await clickBulkItemCancelViaEvaluate(page)) {
    console.log("   ✓ 품목 재지정 알림 → 취소 (evaluate)");
    await page.waitForTimeout(800);
    return true;
  }

  return false;
}

export async function waitAndDismissBulkItemModal(page: Page, maxSec = 20): Promise<boolean> {
  const steps = Math.ceil(maxSec / 0.5);
  for (let i = 0; i < steps; i++) {
    if (await dismissBulkItemModal(page)) return true;
    await page.waitForTimeout(500);
  }

  if (await isBulkItemModalVisible(page)) {
    console.warn("   ⚠ 품목 재지정 알림 취소 실패 — 조회가 진행되지 않을 수 있음");
    return false;
  }

  console.log("   → 품목 재지정 알림 없음 (바로 조회)");
  return true;
}

export async function clickLedgerSearch(page: Page): Promise<void> {
  console.log("   → 검색(F8)...");
  const frames = await findLedgerFrames(page);
  const scan = frames.length > 0 ? frames : page.frames();

  for (const frame of scan) {
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
          await page.waitForTimeout(1000);
          return;
        }
      } catch {
        /* next */
      }
    }
  }

  for (const frame of scan) {
    try {
      await frame.locator("body").click({ position: { x: 40, y: 40 }, force: true });
      await page.keyboard.press("F8");
      console.log("   ✓ F8 키 입력");
      await page.waitForTimeout(1000);
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

export async function waitForLedgerResults(page: Page, maxSec = 600): Promise<boolean> {
  console.log(`3. 검색 결과 대기 (최대 ${maxSec}초)...`);
  const intervalSec = 2;
  const steps = Math.ceil(maxSec / intervalSec);

  for (let i = 0; i < steps; i++) {
    const elapsed = (i + 1) * intervalSec;

    if (await isBulkItemModalVisible(page)) {
      await dismissBulkItemModal(page);
      if (i > 0 && i % 5 === 0) {
        console.log(`   … 품목 재지정 알림 처리 중 (${elapsed}초)`);
      }
      await page.waitForTimeout(intervalSec * 1000);
      continue;
    }

    if (await isLedgerExcelReady(page)) {
      console.log(`   ✓ 결과 확인 (${elapsed}초)`);
      return true;
    }

    const loading = await page
      .locator("text=/조회\\s*중|로딩|Loading|처리\\s*중/")
      .first()
      .isVisible()
      .catch(() => false);
    if (loading) {
      console.log(`   … 조회 중 (${elapsed}초)`);
    } else if (elapsed >= 10 && elapsed % 10 === 0) {
      console.log(`   … 결과 대기 (${elapsed}초 / ${maxSec}초)`);
    }

    await page.waitForTimeout(intervalSec * 1000);
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
  } catch {
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 120000 }),
      btn.evaluate((el: HTMLElement) => el.click()),
    ]);
    await download.saveAs(saveAs);
  }
}

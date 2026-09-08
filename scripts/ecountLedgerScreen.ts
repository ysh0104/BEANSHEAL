/**
 * 재고수불부 화면 전용 — ecountExcel과 완전 분리 (순환 호출·무한 대기 방지)
 */
import * as fs from "fs";
import * as path from "path";
import type { Dialog, Frame, Locator, Page } from "playwright";

const SEARCH_BTN = /(?:검색|Search|조회)\s*\(F\d+\)/i;
/** 검색(F8) 후 확인 팝업 — 실제 ECOUNT: "조회할 자료가 많아 오래 걸릴 수 있습니다..." (+ 기존 품목 재지정 알림) */
const LEDGER_CONFIRM_POPUP_HINT =
  /조회할\s*자료가\s*많아|오래\s*걸릴\s*수\s*있습니다|조회품목을\s*재지정|품목개수가\s*많을\s*경우/;
const EXCEL_SELECTORS = [
  "#outputExcel",
  '[id*="outputExcel"]',
  "#btnExcel",
  '[id*="btnExcel"]',
  '[title*="엑셀"]',
  '[title*="Excel"]',
];
const LEDGER_POPUP_CANDIDATE_SELECTOR =
  '[role="dialog"], .ui-dialog, .modal, .layer_popup, [class*="dialog"], [class*="layer"], [class*="popup"]';
const LEDGER_AFTER_F8_SCREENSHOT = path.join("downloads", "ecount-ledger-after-f8.png");

function ensureLedgerDownloadsDir(): string {
  const dir = path.resolve("downloads");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function logLedgerFrameList(page: Page, label: string): void {
  const frames = page.frames();
  console.log(`   [진단] ${label} page.url=${page.url()} frame count=${frames.length}`);
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    console.log(
      `   [진단] ${label} frame[${i}] name=${JSON.stringify(frame.name())} url=${frame.url()}`
    );
  }
}

function logLedgerContextPages(page: Page, label: string): void {
  try {
    const pages = page.context().pages();
    console.log(`   [진단] ${label} context.pages().length=${pages.length}`);
    for (let i = 0; i < pages.length; i++) {
      const p = pages[i];
      let url = "(unavailable)";
      let closed = true;
      try {
        closed = p.isClosed();
        url = closed ? "(closed)" : p.url();
      } catch (err) {
        url = `error:${err instanceof Error ? err.message : String(err)}`;
      }
      console.log(`   [진단] ${label} page[${i}] url=${url} isClosed=${closed}`);
    }
  } catch (err) {
    console.log(
      `   [진단] ${label} context.pages() 예외: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/** 검색 중 native dialog: 메시지만 로그 후 dismiss (사람 ESC/취소에 해당, accept 금지) */
function attachLedgerNativeDialogProbe(page: Page): () => void {
  const onDialog = (dialog: Dialog) => {
    console.log(
      `   [진단] native dialog type=${dialog.type()} message=${JSON.stringify(dialog.message())}`
    );
    void dialog.dismiss().then(
      () => console.log("   ✓ native dialog dismiss (ESC/취소 대응)"),
      (err) =>
        console.log(
          `   [진단] native dialog dismiss 예외: ${err instanceof Error ? err.message : String(err)}`
        )
    );
  };
  page.on("dialog", onDialog);
  return () => page.off("dialog", onDialog);
}

/** 검색/ESC 직후: page / iframe 팝업 위치 확인용 스캔 (클릭 없음) */
async function logLedgerPostF8Diagnostics(page: Page): Promise<void> {
  const frames = page.frames();
  console.log(`   [진단] F8 직후 frame count: ${frames.length}`);

  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    console.log(`   [진단] frame[${i}] name=${JSON.stringify(frame.name())} url=${frame.url()}`);

    try {
      const bodyText = ((await frame.locator("body").innerText().catch(() => "")) || "").replace(
        /\s+/g,
        " "
      );
      const hasManyData = bodyText.includes("조회할 자료가 많아");
      const hasMayTakeLong = bodyText.includes("오래 걸릴 수 있습니다");
      console.log(
        `   [진단] frame[${i}] body includes "조회할 자료가 많아"=${hasManyData} "오래 걸릴 수 있습니다"=${hasMayTakeLong}`
      );

      const cancelExact = frame.getByText("취소", { exact: true });
      const cancelTotal = await cancelExact.count();
      let cancelVisible = 0;
      for (let c = 0; c < cancelTotal; c++) {
        try {
          if (await cancelExact.nth(c).isVisible()) cancelVisible += 1;
        } catch (err) {
          console.log(
            `   [진단] frame[${i}] exact "취소"[${c}] isVisible 예외: ${
              err instanceof Error ? err.message : String(err)
            }`
          );
        }
      }
      console.log(
        `   [진단] frame[${i}] exact "취소" total=${cancelTotal} visible=${cancelVisible}`
      );

      const popupCandidates = frame.locator(LEDGER_POPUP_CANDIDATE_SELECTOR);
      const popupCount = await popupCandidates.count();
      console.log(`   [진단] frame[${i}] dialog/layer/popup count=${popupCount}`);
    } catch (err) {
      console.log(
        `   [진단] frame[${i}] 팝업 후보 스캔 예외: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  try {
    const shotPath = path.resolve(LEDGER_AFTER_F8_SCREENSHOT);
    ensureLedgerDownloadsDir();
    await page.screenshot({ path: shotPath, fullPage: true });
    console.log(`   [진단] F8 직후 스크린샷 저장: ${LEDGER_AFTER_F8_SCREENSHOT}`);
  } catch (err) {
    console.log(
      `   [진단] F8 직후 스크린샷 예외: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

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

/** 기타 탭 → 생산불출/창고이동포함 체크 (미발견·미체크 시 Error) */
export async function ensureProductionTransferIncluded(page: Page): Promise<void> {
  const frames = await findLedgerFrames(page);
  if (frames.length === 0) {
    for (const frame of page.frames()) frames.push(frame);
  }

  let etcTabClicked = false;
  for (const frame of frames) {
    const etcTab = frame.locator('a, button, span, li, div[role="tab"]').filter({ hasText: /^기타$/ }).first();
    try {
      if ((await etcTab.count()) > 0 && (await etcTab.isVisible())) {
        await etcTab.click({ force: true });
        await page.waitForTimeout(800);
        console.log("   ✓ 기타 탭");
        etcTabClicked = true;
        break;
      }
    } catch (err) {
      throw new Error(
        `재고수불부 「기타」 탭 클릭 실패: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
  if (!etcTabClicked) {
    throw new Error('재고수불부 「기타」 탭을 찾지 못했습니다.');
  }

  let sawLabel = false;
  for (const frame of frames) {
    const label = frame
      .locator("label, span, td, div")
      .filter({ hasText: /생산불출.*창고이동.*포함/ })
      .first();
    try {
      if ((await label.count()) === 0 || !(await label.isVisible())) continue;
    } catch {
      continue;
    }
    sawLabel = true;

    const cb = label.locator('xpath=ancestor::tr[1]//input[@type="checkbox"]').first();
    if ((await cb.count()) === 0) {
      continue;
    }

    let alreadyChecked: boolean;
    try {
      alreadyChecked = await cb.isChecked();
    } catch (err) {
      throw new Error(
        `생산불출/창고이동포함 checkbox 상태 확인 실패: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }

    if (alreadyChecked) {
      console.log("   ✓ 생산불출/창고이동포함 (이미 체크됨)");
    } else {
      await cb.click({ force: true });
      console.log("   ✓ 생산불출/창고이동포함 체크");
      await page.waitForTimeout(300);
    }

    let verified: boolean;
    try {
      verified = await cb.isChecked();
    } catch (err) {
      throw new Error(
        `생산불출/창고이동포함 checkbox 재확인 실패: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
    if (!verified) {
      throw new Error("생산불출/창고이동포함 checkbox가 체크되지 않았습니다.");
    }
    return;
  }

  if (!sawLabel) {
    throw new Error('「생산불출/창고이동포함」 label을 찾지 못했습니다.');
  }
  throw new Error("「생산불출/창고이동포함」 checkbox를 찾지 못했습니다.");
}

async function isLedgerConfirmPopupVisible(page: Page): Promise<boolean> {
  for (const ctx of [page, ...page.frames()]) {
    if (await hasLedgerConfirmPopup(ctx)) return true;
  }
  return false;
}

async function hasLedgerConfirmPopup(ctx: Page | Frame): Promise<boolean> {
  const hint = ctx.getByText(LEDGER_CONFIRM_POPUP_HINT).first();
  try {
    if ((await hint.count()) > 0 && (await hint.isVisible())) return true;
  } catch {
    /* skip */
  }

  const dialogs = ctx.locator(
    '[role="dialog"], .ui-dialog, .modal, .layer_popup, [class*="dialog"], [class*="layer"], [class*="popup"]'
  );
  try {
    const n = Math.min(await dialogs.count(), 12);
    for (let i = 0; i < n; i++) {
      const d = dialogs.nth(i);
      if (!(await d.isVisible().catch(() => false))) continue;
      const text = ((await d.innerText().catch(() => "")) || "").replace(/\s+/g, " ");
      if (LEDGER_CONFIRM_POPUP_HINT.test(text)) return true;
    }
  } catch {
    /* skip */
  }
  return false;
}

async function clickCancelInLedgerConfirmPopup(ctx: Page | Frame): Promise<boolean> {
  const dialogCandidates = ctx.locator(
    '[role="dialog"], .ui-dialog, .modal, .layer_popup, [class*="dialog"], [class*="layer"], [class*="popup"]'
  );

  try {
    const n = Math.min(await dialogCandidates.count(), 12);
    for (let i = 0; i < n; i++) {
      const dialog = dialogCandidates.nth(i);
      try {
        if (!(await dialog.isVisible())) continue;
        const text = ((await dialog.innerText().catch(() => "")) || "").replace(/\s+/g, " ");
        if (!LEDGER_CONFIRM_POPUP_HINT.test(text)) continue;

        const cancels = dialog.locator("button, a, input[type='button'], span, div").filter({ hasText: /^취소$/ });
        const cn = await cancels.count();
        for (let j = cn - 1; j >= 0; j--) {
          const btn = cancels.nth(j);
          if (!(await btn.isVisible())) continue;
          const t = ((await btn.innerText()) || "").trim();
          if (t !== "취소") continue;
          await btn.click({ force: true });
          return true;
        }
      } catch {
        /* next dialog */
      }
    }
  } catch {
    /* skip */
  }

  // 힌트 텍스트 근처의 exact "취소"
  try {
    const hint = ctx.getByText(LEDGER_CONFIRM_POPUP_HINT).first();
    if ((await hint.count()) > 0 && (await hint.isVisible())) {
      const nearby = ctx.locator("button, a, input[type='button']").filter({ hasText: /^취소$/ });
      const cn = await nearby.count();
      for (let j = cn - 1; j >= 0; j--) {
        const btn = nearby.nth(j);
        if (!(await btn.isVisible())) continue;
        if (((await btn.innerText()) || "").trim() !== "취소") continue;
        await btn.click({ force: true });
        return true;
      }
    }
  } catch {
    /* skip */
  }

  return false;
}

async function clickLedgerConfirmCancelViaEvaluate(page: Page): Promise<boolean> {
  for (const frame of page.frames()) {
    try {
      const clicked = await frame.evaluate(() => {
        const hintRe =
          /조회할\s*자료가\s*많아|오래\s*걸릴\s*수\s*있습니다|조회품목을\s*재지정|품목개수가\s*많을\s*경우/;
        const roots = Array.from(
          document.querySelectorAll(
            '.ui-dialog, [role="dialog"], .modal, .layer_popup, .popup, [class*="dialog"], [class*="layer"], [class*="popup"]'
          )
        );
        roots.push(document.body);

        for (const root of roots) {
          const text = (root.textContent || "").replace(/\s+/g, " ");
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

/** 검색(F8) 후 조회 확인/품목 재지정 팝업 → 「취소」(정상 UX, 실패로 취급하지 않음) */
export async function dismissBulkItemModal(page: Page): Promise<boolean> {
  if (!(await isLedgerConfirmPopupVisible(page))) return false;

  console.log("   → 조회 확인 팝업 감지");

  const contexts: Array<Page | Frame> = [page, ...page.frames()];
  for (const ctx of contexts) {
    try {
      if (!(await hasLedgerConfirmPopup(ctx))) continue;
      if (await clickCancelInLedgerConfirmPopup(ctx)) {
        console.log('   ✓ "취소" 클릭');
        await page.waitForTimeout(800);
        return true;
      }
    } catch {
      /* skip */
    }
  }

  if (await clickLedgerConfirmCancelViaEvaluate(page)) {
    console.log('   ✓ "취소" 클릭 (evaluate)');
    await page.waitForTimeout(800);
    return true;
  }

  console.warn("   ⚠ 조회 확인 팝업은 보이나 「취소」 클릭 실패 — 결과 대기에서 재시도");
  return false;
}

export async function waitAndDismissBulkItemModal(page: Page, maxSec = 30): Promise<boolean> {
  console.log("   → 조회 확인 팝업 대기...");
  const steps = Math.ceil(maxSec / 0.5);
  for (let i = 0; i < steps; i++) {
    if (await dismissBulkItemModal(page)) return true;
    await page.waitForTimeout(500);
  }

  if (await isLedgerConfirmPopupVisible(page)) {
    console.warn("   ⚠ 조회 확인 팝업 취소 미완료 — 봇은 계속 진행(결과 대기에서 재시도)");
    return false;
  }

  console.log("   → 조회 확인 팝업 미감지 (결과 대기에서 재확인)");
  return true;
}

export async function clickLedgerSearch(page: Page): Promise<Frame> {
  console.log("   → 검색 버튼 클릭");
  const frames = await findLedgerFrames(page);
  const scan = frames.length > 0 ? frames : page.frames();

  console.log("   [진단] 검색 직전 상태");
  logLedgerFrameList(page, "search-pre");
  logLedgerContextPages(page, "search-pre");

  const detachDialogProbe = attachLedgerNativeDialogProbe(page);

  try {
    for (const frame of scan) {
      const locators = [
        frame.getByText(SEARCH_BTN).first(),
        frame.locator('button, a, span, div[role="button"]').filter({ hasText: SEARCH_BTN }).first(),
        frame.getByText(/^검색$/).first(),
        frame.locator('button, a, span, div[role="button"]').filter({ hasText: /^검색$/ }).first(),
      ];
      for (const btn of locators) {
        try {
          if ((await btn.count()) > 0 && (await btn.isVisible())) {
            await frame.locator("body").click({ position: { x: 40, y: 40 }, force: true }).catch(() => {});
            await btn.scrollIntoViewIfNeeded().catch(() => {});
            await btn.click({ force: true });
            console.log("   ✓ 검색 버튼 클릭");
            // F8 전역 폴백 사용 금지 — 대시보드 이탈 방지
            return frame;
          }
        } catch {
          /* next */
        }
      }
    }
  } finally {
    detachDialogProbe();
  }

  throw new Error(
    "재고수불부 검색 버튼을 찾지 못했습니다. F8 폴백은 사용하지 않습니다 — 화면의 「검색」 버튼을 확인하세요."
  );
}

/**
 * 검색 직후 사람 UX와 동일하게 Escape 전송.
 * DOM 「취소」 클릭 대신 ESC 사용.
 */
export async function pressLedgerEscapeAfterSearch(page: Page, searchFrame?: Frame | null): Promise<void> {
  console.log("   → 검색 후 ESC");
  const frame = searchFrame && !searchFrame.isDetached() ? searchFrame : null;

  try {
    if (frame) {
      await frame.locator("body").click({ position: { x: 40, y: 40 }, force: true }).catch(() => {});
    } else {
      await page.locator("body").click({ position: { x: 40, y: 40 }, force: true }).catch(() => {});
    }
  } catch {
    /* focus best-effort */
  }

  await page.keyboard.press("Escape");
  console.log("   ✓ ESC 입력");

  // 기존 팝업/frame 진단 스냅샷 유지 (동작 변경 없음)
  await page.waitForTimeout(500);
  await logLedgerPostF8Diagnostics(page);
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
  console.log("   → 검색 결과 대기");
  console.log(`3. 검색 결과 대기 (최대 ${maxSec}초)...`);
  const intervalSec = 2;
  const steps = Math.ceil(maxSec / intervalSec);

  for (let i = 0; i < steps; i++) {
    const elapsed = (i + 1) * intervalSec;

    // 확인 메시지가 남아 있으면 「취소」클릭 대신 ESC (사람 UX)
    if (await isLedgerConfirmPopupVisible(page)) {
      console.log("   → 결과 대기 중 확인 메시지 감지 — ESC 재시도");
      await page.keyboard.press("Escape");
      console.log("   ✓ ESC 입력");
      if (i > 0 && i % 5 === 0) {
        console.log(`   … 조회 확인 ESC 처리 중 (${elapsed}초)`);
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

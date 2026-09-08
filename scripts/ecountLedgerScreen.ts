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
const LEDGER_POST_F8_CHECKPOINTS_SEC = [1, 3, 5, 10, 20, 30] as const;
const LEDGER_POST_F8_KEYWORDS = [
  "조회할 자료가 많아",
  "오래 걸릴 수 있습니다",
  "취소",
  "재고수불부",
  "검색",
  "엑셀",
] as const;

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

/** F8 직전: native dialog 메시지만 로그 (dismiss/accept 하지 않음 — 위치 진단용) */
function attachLedgerNativeDialogProbe(page: Page): () => void {
  const onDialog = (dialog: Dialog) => {
    console.log(
      `   [진단] native dialog type=${dialog.type()} message=${JSON.stringify(dialog.message())}`
    );
    // 진단 단계: accept/dismiss 호출하지 않음
  };
  page.on("dialog", onDialog);
  return () => page.off("dialog", onDialog);
}

/**
 * F8 직후 ~30초: navigation / new page / frame 수·URL 변화 이벤트 로그
 * (클릭·dismiss 없음)
 */
function attachLedgerPostF8ChangeProbes(page: Page): () => void {
  const context = page.context();
  let lastMainUrl = page.url();
  let lastFrameCount = page.frames().length;
  let lastPagesCount = context.pages().length;
  const startedAt = Date.now();
  const elapsedLabel = () => `+${Math.round((Date.now() - startedAt) / 100) / 10}s`;

  const onFrameNavigated = (frame: Frame) => {
    try {
      console.log(
        `   [진단][${elapsedLabel()}] page.framenavigated name=${JSON.stringify(frame.name())} url=${frame.url()} mainUrl=${page.isClosed() ? "(closed)" : page.url()}`
      );
    } catch (err) {
      console.log(
        `   [진단][${elapsedLabel()}] page.framenavigated 로그 예외: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  };

  const wirePageEvents = (p: Page, tag: string) => {
    const onPageFrameNavigated = (frame: Frame) => {
      try {
        console.log(
          `   [진단][${elapsedLabel()}] ${tag}.framenavigated name=${JSON.stringify(frame.name())} url=${frame.url()}`
        );
      } catch (err) {
        console.log(
          `   [진단][${elapsedLabel()}] ${tag}.framenavigated 예외: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      }
    };
    p.on("framenavigated", onPageFrameNavigated);
    return () => p.off("framenavigated", onPageFrameNavigated);
  };

  const pageCleanups: Array<() => void> = [];

  const onNewPage = (p: Page) => {
    console.log(`   [진단][${elapsedLabel()}] popup/new page 발생 url=${p.url()}`);
    pageCleanups.push(wirePageEvents(p, "newpage"));
    p.on("close", () => {
      console.log(`   [진단][${elapsedLabel()}] page closed (was url probe)`);
    });
  };

  // main page: page.framenavigated covers all frames in this page
  page.on("framenavigated", onFrameNavigated);
  context.on("page", onNewPage);

  const pollId = setInterval(() => {
    try {
      if (page.isClosed()) {
        console.log(`   [진단][${elapsedLabel()}] main page isClosed=true`);
        return;
      }
      const url = page.url();
      if (url !== lastMainUrl) {
        console.log(`   [진단][${elapsedLabel()}] target/page URL 변화: ${lastMainUrl} → ${url}`);
        lastMainUrl = url;
      }
      const frameCount = page.frames().length;
      if (frameCount !== lastFrameCount) {
        console.log(
          `   [진단][${elapsedLabel()}] frame 수 변화: ${lastFrameCount} → ${frameCount}`
        );
        lastFrameCount = frameCount;
        logLedgerFrameList(page, `frame-change@${elapsedLabel()}`);
      }
      const pagesCount = context.pages().length;
      if (pagesCount !== lastPagesCount) {
        console.log(
          `   [진단][${elapsedLabel()}] context pages 수 변화: ${lastPagesCount} → ${pagesCount}`
        );
        lastPagesCount = pagesCount;
        logLedgerContextPages(page, `pages-change@${elapsedLabel()}`);
      } else {
        logLedgerContextPages(page, `pages-poll@${elapsedLabel()}`);
      }
    } catch (err) {
      console.log(
        `   [진단][${elapsedLabel()}] change-poll 예외: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }, 2000);

  return () => {
    clearInterval(pollId);
    page.off("framenavigated", onFrameNavigated);
    context.off("page", onNewPage);
    for (const cleanup of pageCleanups) cleanup();
  };
}

async function readFrameBodyPreview(frame: Frame): Promise<{ len: number; head: string; text: string }> {
  try {
    const raw = ((await frame.locator("body").innerText().catch(() => "")) || "").replace(/\s+/g, " ").trim();
    return { len: raw.length, head: raw.slice(0, 300), text: raw };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { len: -1, head: `error:${msg}`, text: "" };
  }
}

async function logLedgerKeywordHits(pages: Page[], label: string): Promise<void> {
  for (const keyword of LEDGER_POST_F8_KEYWORDS) {
    const hits: string[] = [];
    for (let pi = 0; pi < pages.length; pi++) {
      const p = pages[pi];
      if (p.isClosed()) continue;
      let frames: Frame[] = [];
      try {
        frames = p.frames();
      } catch {
        continue;
      }
      for (let fi = 0; fi < frames.length; fi++) {
        try {
          const { text } = await readFrameBodyPreview(frames[fi]);
          if (text.includes(keyword)) hits.push(`page[${pi}].frame[${fi}]`);
        } catch (err) {
          console.log(
            `   [진단] ${label} keyword 스캔 예외 page[${pi}] frame[${fi}]: ${
              err instanceof Error ? err.message : String(err)
            }`
          );
        }
      }
    }
    console.log(
      `   [진단] ${label} keyword ${JSON.stringify(keyword)} hits=${hits.length ? hits.join(", ") : "(none)"}`
    );
  }
}

async function logLedgerTimelineCheckpoint(page: Page, sec: number): Promise<void> {
  const label = `F8+${sec}s`;
  console.log(`   [진단] ===== checkpoint ${label} =====`);
  logLedgerContextPages(page, label);

  const pages = page.context().pages();
  for (let pi = 0; pi < pages.length; pi++) {
    const p = pages[pi];
    if (p.isClosed()) {
      console.log(`   [진단] ${label} page[${pi}] isClosed=true (skip frames)`);
      continue;
    }
    let frames: Frame[] = [];
    try {
      frames = p.frames();
      console.log(`   [진단] ${label} page[${pi}] url=${p.url()} frame count=${frames.length}`);
    } catch (err) {
      console.log(
        `   [진단] ${label} page[${pi}] frames 예외: ${err instanceof Error ? err.message : String(err)}`
      );
      continue;
    }
    for (let fi = 0; fi < frames.length; fi++) {
      const frame = frames[fi];
      try {
        const preview = await readFrameBodyPreview(frame);
        console.log(
          `   [진단] ${label} page[${pi}].frame[${fi}] name=${JSON.stringify(frame.name())} url=${frame.url()} bodyLen=${preview.len} bodyHead=${JSON.stringify(preview.head)}`
        );
      } catch (err) {
        console.log(
          `   [진단] ${label} page[${pi}].frame[${fi}] 예외: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      }
    }
  }

  await logLedgerKeywordHits(pages, label);

  try {
    ensureLedgerDownloadsDir();
    const shotRel = path.join("downloads", `ecount-ledger-debug-${sec}s.png`);
    const shotPath = path.resolve(shotRel);
    if (page.isClosed()) {
      console.log(`   [진단] ${label} 스크린샷 생략 (main page closed)`);
    } else {
      await page.screenshot({ path: shotPath, fullPage: true });
      console.log(`   [진단] ${label} 스크린샷 저장: ${shotRel}`);
    }
  } catch (err) {
    console.log(
      `   [진단] ${label} 스크린샷 예외: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/** F8 직후 ~30초 타임라인 진단 (기존 after-f8 스냅샷 포함, 클릭 없음) */
async function runLedgerPostF8TimelineDiagnostics(page: Page): Promise<void> {
  const detachChangeProbes = attachLedgerPostF8ChangeProbes(page);
  const startedAt = Date.now();
  try {
    console.log("   [진단] F8 직후 30초 변화 감시 시작");
    logLedgerContextPages(page, "F8+0s");
    logLedgerFrameList(page, "F8+0s");

    for (const sec of LEDGER_POST_F8_CHECKPOINTS_SEC) {
      const waitMs = sec * 1000 - (Date.now() - startedAt);
      if (waitMs > 0) await page.waitForTimeout(waitMs);
      await logLedgerTimelineCheckpoint(page, sec);
      if (sec === 1) {
        // 기존 F8 직후 진단(팝업 후보·after-f8.png) 유지
        await logLedgerPostF8Diagnostics(page);
      }
    }
    console.log("   [진단] F8 직후 30초 변화 감시 종료");
  } finally {
    detachChangeProbes();
  }
}

/** F8 직후: page / iframe / native dialog 중 팝업 위치 확인용 스캔 (클릭 없음) */
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

export async function clickLedgerSearch(page: Page): Promise<void> {
  console.log("   → 검색(F8) 실행");
  const frames = await findLedgerFrames(page);
  const scan = frames.length > 0 ? frames : page.frames();

  console.log("   [진단] F8 직전 상태");
  logLedgerFrameList(page, "F8-pre");
  logLedgerContextPages(page, "F8-pre");

  const detachDialogProbe = attachLedgerNativeDialogProbe(page);

  try {
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
            await runLedgerPostF8TimelineDiagnostics(page);
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
        await runLedgerPostF8TimelineDiagnostics(page);
        return;
      } catch {
        /* next */
      }
    }
  } finally {
    detachDialogProbe();
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
  console.log("   → 검색 결과 대기");
  console.log(`3. 검색 결과 대기 (최대 ${maxSec}초)...`);
  const intervalSec = 2;
  const steps = Math.ceil(maxSec / intervalSec);

  for (let i = 0; i < steps; i++) {
    const elapsed = (i + 1) * intervalSec;

    if (await isLedgerConfirmPopupVisible(page)) {
      await dismissBulkItemModal(page);
      if (i > 0 && i % 5 === 0) {
        console.log(`   … 조회 확인 팝업 처리 중 (${elapsed}초)`);
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

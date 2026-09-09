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
const LEDGER_DOM_PROBE_DIR = "downloads";

function ensureLedgerDownloadsDir(): string {
  const dir = path.resolve("downloads");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * F8 / ESC / ESC+Ns 시점 DOM 스냅샷 (string evaluate — __name 방지).
 * 결과 selector 추측 없이 실제 화면만 기록.
 */
const LEDGER_DOM_PROBE_JS = `(function () {
  function clip(s, n) {
    return String(s || "").replace(/\\s+/g, " ").trim().slice(0, n);
  }
  var main = document.querySelector("#mainPage");
  var mainText = "";
  var bodyText = "";
  try {
    bodyText = clip(document.body && document.body.innerText ? document.body.innerText : "", 400);
  } catch (e) {
    bodyText = "";
  }
  if (main) {
    try {
      mainText = clip(main.innerText || main.textContent || "", 300);
    } catch (e2) {
      mainText = "";
    }
  }
  var scanText = mainText + " " + bodyText;
  var hasLedger = /재고\\s*수불부|재고수불부/.test(scanText);
  var hasExcel = /엑셀|Excel/i.test(scanText);
  var resultHints = {
    titleLedger: /재고\\s*수불부|재고수불부/.test(mainText || bodyText.slice(0, 120)),
    prodCd: /품목코드/.test(scanText),
    prodNm: /품목명/.test(scanText),
    dateCol: /일자/.test(scanText),
    inbound: /입고/.test(scanText),
    outbound: /출고/.test(scanText),
    stockQty: /재고수량|재고\\s*수량/.test(scanText),
    baseDate: /기준일자/.test(scanText),
    confirmPopup: /조회할\\s*자료가\\s*많아|오래\\s*걸릴\\s*수\\s*있습니다/.test(scanText)
  };

  var tableCount = 0;
  var gridCount = 0;
  try {
    tableCount = document.querySelectorAll("table").length;
    gridCount = document.querySelectorAll(
      "[class*='grid'], [class*='Grid'], [id*='grid'], [id*='Grid'], .ag-root, .handsontable"
    ).length;
  } catch (e3) {}

  var candidates = [];
  try {
    var nodes = document.querySelectorAll("button, a, input, [role='button']");
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var visible = false;
      try {
        visible = !!(el.offsetWidth || el.offsetHeight || (el.getClientRects && el.getClientRects().length));
      } catch (e4) {
        visible = false;
      }
      if (!visible) continue;
      var text = "";
      try {
        if (el.tagName === "INPUT") {
          text = clip(el.value || el.getAttribute("value") || el.getAttribute("title") || el.id || "", 40);
        } else {
          text = clip(el.innerText || el.textContent || el.getAttribute("title") || "", 40);
        }
      } catch (e5) {
        text = "";
      }
      if (!text) continue;
      candidates.push({
        tag: el.tagName || "",
        id: el.id || "",
        text: text,
        className: String(el.className || "").slice(0, 60)
      });
      if (candidates.length >= 25) break;
    }
  } catch (e6) {}

  return {
    hasMainPage: !!main,
    mainText: mainText,
    bodyText: bodyText,
    hasLedger: hasLedger,
    hasExcel: hasExcel,
    resultHints: resultHints,
    tableCount: tableCount,
    gridCount: gridCount,
    candidates: candidates
  };
})()`;

type LedgerDomProbeHit = {
  hasMainPage: boolean;
  mainText: string;
  bodyText: string;
  hasLedger: boolean;
  hasExcel: boolean;
  resultHints: Record<string, boolean>;
  tableCount: number;
  gridCount: number;
  candidates: Array<{ tag: string; id: string; text: string; className: string }>;
};

/**
 * ESC 직후 전용 DOM 스냅샷 (string evaluate).
 * mainText 2000 / bodyText 3000 / button·input 상세.
 */
const LEDGER_ESC_FRAME_PROBE_JS = `(function () {
  function clip(s, n) {
    return String(s || "").replace(/\\s+/g, " ").trim().slice(0, n);
  }
  function visible(el) {
    try {
      return !!(el.offsetWidth || el.offsetHeight || (el.getClientRects && el.getClientRects().length));
    } catch (e) {
      return false;
    }
  }
  var main = document.querySelector("#mainPage");
  var mainText = "";
  var bodyText = "";
  try {
    bodyText = clip(document.body && document.body.innerText ? document.body.innerText : "", 3000);
  } catch (e) {
    bodyText = "";
  }
  if (main) {
    try {
      mainText = clip(main.innerText || main.textContent || "", 2000);
    } catch (e2) {
      mainText = "";
    }
  }
  var scan = mainText + " " + bodyText;
  var buttons = [];
  try {
    var btns = document.querySelectorAll("button, [role='button'], a.btn, input[type='button'], input[type='submit']");
    for (var i = 0; i < btns.length; i++) {
      var b = btns[i];
      if (!visible(b)) continue;
      var btext = "";
      try {
        if (b.tagName === "INPUT") btext = clip(b.value || b.getAttribute("title") || "", 60);
        else btext = clip(b.innerText || b.textContent || b.getAttribute("title") || "", 60);
      } catch (e3) {
        btext = "";
      }
      buttons.push({
        tag: b.tagName || "",
        id: b.id || "",
        text: btext,
        className: String(b.className || "").slice(0, 80)
      });
      if (buttons.length >= 40) break;
    }
  } catch (e4) {}

  var inputs = [];
  try {
    var inps = document.querySelectorAll("input, textarea, select");
    for (var j = 0; j < inps.length; j++) {
      var inp = inps[j];
      if (!visible(inp)) continue;
      inputs.push({
        tag: inp.tagName || "",
        type: inp.getAttribute("type") || "",
        id: inp.id || "",
        name: inp.getAttribute("name") || "",
        placeholder: clip(inp.getAttribute("placeholder") || "", 40),
        value: clip(inp.value || "", 40)
      });
      if (inputs.length >= 40) break;
    }
  } catch (e5) {}

  var tableCount = 0;
  var iframeCount = 0;
  try {
    tableCount = document.querySelectorAll("table").length;
    iframeCount = document.querySelectorAll("iframe").length;
  } catch (e6) {}

  return {
    mainPageCount: main ? 1 : 0,
    mainText: mainText,
    bodyText: bodyText,
    bodyTextShort: clip(bodyText, 1000),
    hasLedger: /재고\\s*수불부|재고수불부/.test(scan),
    hasSearch: /검색/.test(scan),
    hasExcel: /엑셀|Excel/i.test(scan),
    tableCount: tableCount,
    iframeCount: iframeCount,
    buttons: buttons,
    inputs: inputs
  };
})()`;

type LedgerEscFrameProbe = {
  mainPageCount: number;
  mainText: string;
  bodyText: string;
  bodyTextShort: string;
  hasLedger: boolean;
  hasSearch: boolean;
  hasExcel: boolean;
  tableCount: number;
  iframeCount: number;
  buttons: Array<{ tag: string; id: string; text: string; className: string }>;
  inputs: Array<{
    tag: string;
    type: string;
    id: string;
    name: string;
    placeholder: string;
    value: string;
  }>;
};

const ESC_SHOT_BY_LABEL: Record<string, string> = {
  "esc-500ms": path.join("downloads", "ecount-ledger-after-esc-500ms.png"),
  "esc-1s": path.join("downloads", "ecount-ledger-after-esc-1s.png"),
  "esc-2s": path.join("downloads", "ecount-ledger-after-esc-2s.png"),
  "esc-5s": path.join("downloads", "ecount-ledger-after-esc-5s.png"),
};

/** ESC 직후 전용 진단 — URL/frame/#mainPage/body/controls/screenshot */
async function logLedgerEscAfterSnapshot(page: Page, label: string, shotPath?: string): Promise<void> {
  const url = page.url();
  const hash = url.includes("#") ? url.slice(url.indexOf("#") + 1) : "(none)";
  let urlPrg: string | null = null;
  try {
    urlPrg = parseUrlPrgId(url);
  } catch {
    urlPrg = null;
  }

  const frames = page.frames();
  console.log(`   [진단][esc-timeline] ===== ${label} =====`);
  console.log(`   [진단][esc-timeline] ${label} page.url=${url}`);
  console.log(`   [진단][esc-timeline] ${label} hash=${hash.slice(0, 200)}`);
  console.log(`   [진단][esc-timeline] ${label} prgId=${urlPrg || "(none)"}`);
  console.log(`   [진단][esc-timeline] ${label} frameCount=${frames.length}`);

  let anyMain = false;
  let bestMain = "";
  let bestBody = "";
  let hasLedger = false;
  let hasSearch = false;
  let hasExcel = false;
  let tableTotal = 0;
  let iframeTotal = 0;
  const allButtons: LedgerEscFrameProbe["buttons"] = [];
  const allInputs: LedgerEscFrameProbe["inputs"] = [];

  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    let probe: LedgerEscFrameProbe | null = null;
    try {
      probe = (await frame.evaluate(LEDGER_ESC_FRAME_PROBE_JS)) as LedgerEscFrameProbe;
    } catch (err) {
      console.log(
        JSON.stringify({
          type: "ledger_esc_frame_error",
          label,
          frameIndex: i,
          frameName: frame.name(),
          frameUrl: frame.url().slice(0, 180),
          error: err instanceof Error ? err.message : String(err),
        })
      );
      continue;
    }

    if (probe.mainPageCount > 0) anyMain = true;
    if ((probe.mainText || "").length > bestMain.length) bestMain = probe.mainText || "";
    if ((probe.bodyText || "").length > bestBody.length) bestBody = probe.bodyText || "";
    if (probe.hasLedger) hasLedger = true;
    if (probe.hasSearch) hasSearch = true;
    if (probe.hasExcel) hasExcel = true;
    tableTotal += probe.tableCount || 0;
    iframeTotal += probe.iframeCount || 0;
    for (const b of probe.buttons || []) {
      if (allButtons.length < 50) allButtons.push(b);
    }
    for (const inp of probe.inputs || []) {
      if (allInputs.length < 50) allInputs.push(inp);
    }

    // Playwright locator 교차 확인 (#mainPage count)
    let mainLocatorCount = -1;
    try {
      mainLocatorCount = await frame.locator("#mainPage").count();
    } catch {
      mainLocatorCount = -1;
    }

    console.log(
      JSON.stringify({
        type: "ledger_esc_frame",
        label,
        frameIndex: i,
        frameName: frame.name(),
        frameUrl: frame.url().slice(0, 200),
        mainPageCountEvaluate: probe.mainPageCount,
        mainPageCountLocator: mainLocatorCount,
        hasLedger: probe.hasLedger,
        hasSearch: probe.hasSearch,
        hasExcel: probe.hasExcel,
        tableCount: probe.tableCount,
        iframeCount: probe.iframeCount,
        buttonCount: (probe.buttons || []).length,
        inputCount: (probe.inputs || []).length,
        bodyText1000: (probe.bodyTextShort || probe.bodyText || "").slice(0, 1000),
        mainText2000: (probe.mainText || "").slice(0, 2000),
      })
    );
  }

  console.log(`   [진단][esc-timeline] ${label} #mainPage존재=${anyMain}`);
  console.log(
    `   [진단][esc-timeline] ${label} #mainPage.innerText(앞2000)=${JSON.stringify(bestMain.slice(0, 2000))}`
  );
  console.log(
    `   [진단][esc-timeline] ${label} body.innerText(앞3000)=${JSON.stringify(bestBody.slice(0, 3000))}`
  );
  console.log(`   [진단][esc-timeline] ${label} 재고수불부=${hasLedger} 검색=${hasSearch} Excel/엑셀=${hasExcel}`);
  console.log(
    `   [진단][esc-timeline] ${label} tableCount=${tableTotal} iframeCount=${iframeTotal} visibleButtons=${allButtons.length} visibleInputs=${allInputs.length}`
  );
  console.log(
    JSON.stringify({
      type: "ledger_esc_summary",
      label,
      url,
      hash: hash.slice(0, 200),
      prgId: urlPrg || "(none)",
      frameCount: frames.length,
      hasMainPage: anyMain,
      hasLedger,
      hasSearch,
      hasExcel,
      tableCount: tableTotal,
      iframeCount: iframeTotal,
      buttons: allButtons.slice(0, 30),
      inputs: allInputs.slice(0, 30),
      mainText2000: bestMain.slice(0, 2000),
      bodyText3000: bestBody.slice(0, 3000),
    })
  );

  if (shotPath) {
    try {
      ensureLedgerDownloadsDir();
      await page.screenshot({ path: path.resolve(shotPath), fullPage: true });
      console.log(`   [진단][esc-timeline] ${label} screenshot=${shotPath}`);
    } catch (err) {
      console.log(
        `   [진단][esc-timeline] ${label} screenshot 예외: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
}

function attachLedgerEscEventProbes(page: Page): () => void {
  const onFrameNav = (frame: Frame) => {
    console.log(
      JSON.stringify({
        type: "ledger_esc_event",
        event: "framenavigated",
        frameName: frame.name(),
        frameUrl: frame.url().slice(0, 200),
        pageUrl: page.url().slice(0, 200),
        frameCount: page.frames().length,
      })
    );
  };
  const onFrameAttach = (frame: Frame) => {
    console.log(
      JSON.stringify({
        type: "ledger_esc_event",
        event: "frameattached",
        frameName: frame.name(),
        frameUrl: frame.url().slice(0, 200),
        frameCount: page.frames().length,
      })
    );
  };
  const onFrameDetach = (frame: Frame) => {
    console.log(
      JSON.stringify({
        type: "ledger_esc_event",
        event: "framedetached",
        frameName: frame.name(),
        frameUrl: frame.url().slice(0, 200),
        frameCount: page.frames().length,
      })
    );
  };
  const onPopup = (popup: Page) => {
    console.log(
      JSON.stringify({
        type: "ledger_esc_event",
        event: "popup",
        popupUrl: popup.url().slice(0, 200),
        pageUrl: page.url().slice(0, 200),
      })
    );
  };
  const onPageError = (err: Error) => {
    console.log(
      JSON.stringify({
        type: "ledger_esc_event",
        event: "pageerror",
        message: err.message,
        pageUrl: page.url().slice(0, 200),
      })
    );
  };
  const onConsole = (msg: { type: () => string; text: () => string }) => {
    const t = msg.type();
    if (t !== "error" && t !== "warning") return;
    console.log(
      JSON.stringify({
        type: "ledger_esc_event",
        event: "console",
        level: t,
        text: String(msg.text() || "").slice(0, 240),
      })
    );
  };

  page.on("framenavigated", onFrameNav);
  page.on("frameattached", onFrameAttach);
  page.on("framedetached", onFrameDetach);
  page.on("popup", onPopup);
  page.on("pageerror", onPageError);
  page.on("console", onConsole);

  return () => {
    page.off("framenavigated", onFrameNav);
    page.off("frameattached", onFrameAttach);
    page.off("framedetached", onFrameDetach);
    page.off("popup", onPopup);
    page.off("pageerror", onPageError);
    page.off("console", onConsole);
  };
}

/** F8/ESC 타임라인용 — URL·#mainPage·결과 힌트·screenshot (동작 변경 없음) */
async function logLedgerResultDomProbe(page: Page, label: string): Promise<void> {
  const url = page.url();
  let hash = "(none)";
  let urlPrg: string | null = null;
  try {
    hash = url.includes("#") ? url.slice(url.indexOf("#") + 1) : "(none)";
    urlPrg = parseUrlPrgId(url);
  } catch {
    /* keep */
  }

  const frameCount = page.frames().length;
  const merged: LedgerDomProbeHit = {
    hasMainPage: false,
    mainText: "",
    bodyText: "",
    hasLedger: false,
    hasExcel: false,
    resultHints: {},
    tableCount: 0,
    gridCount: 0,
    candidates: [],
  };

  for (let fi = 0; fi < page.frames().length; fi++) {
    const frame = page.frames()[fi];
    try {
      const hit = (await frame.evaluate(LEDGER_DOM_PROBE_JS)) as LedgerDomProbeHit;
      if (hit.hasMainPage) merged.hasMainPage = true;
      if ((hit.mainText || "").length > merged.mainText.length) merged.mainText = hit.mainText;
      if ((hit.bodyText || "").length > merged.bodyText.length) merged.bodyText = hit.bodyText;
      if (hit.hasLedger) merged.hasLedger = true;
      if (hit.hasExcel) merged.hasExcel = true;
      merged.tableCount += hit.tableCount || 0;
      merged.gridCount += hit.gridCount || 0;
      for (const [k, v] of Object.entries(hit.resultHints || {})) {
        if (v) merged.resultHints[k] = true;
      }
      for (const c of hit.candidates || []) {
        if (merged.candidates.length < 30) merged.candidates.push(c);
      }
      console.log(
        JSON.stringify({
          type: "ledger_dom_probe_frame",
          label,
          frameIndex: fi,
          frameName: frame.name(),
          frameUrl: frame.url().slice(0, 160),
          hasMainPage: hit.hasMainPage,
          hasLedger: hit.hasLedger,
          hasExcel: hit.hasExcel,
          tableCount: hit.tableCount,
          gridCount: hit.gridCount,
          resultHints: hit.resultHints,
          mainText: (hit.mainText || "").slice(0, 160),
          bodyText: (hit.bodyText || "").slice(0, 160),
        })
      );
    } catch (err) {
      console.log(
        JSON.stringify({
          type: "ledger_dom_probe_frame_error",
          label,
          frameIndex: fi,
          error: err instanceof Error ? err.message : String(err),
        })
      );
    }
  }

  console.log(
    JSON.stringify({
      type: "ledger_dom_probe",
      label,
      url: url.slice(0, 200),
      hash: hash.slice(0, 160),
      urlPrg: urlPrg || "(none)",
      frameCount,
      hasMainPage: merged.hasMainPage,
      hasLedger: merged.hasLedger,
      hasExcel: merged.hasExcel,
      tableCount: merged.tableCount,
      gridCount: merged.gridCount,
      resultHints: merged.resultHints,
      mainText: merged.mainText.slice(0, 200),
      bodyText: merged.bodyText.slice(0, 200),
      candidates: merged.candidates.slice(0, 20),
    })
  );

  try {
    ensureLedgerDownloadsDir();
    const safe = label.replace(/[^a-zA-Z0-9._-]+/g, "_");
    const shotRel = path.join(LEDGER_DOM_PROBE_DIR, `ledger-dom-probe-${safe}.png`);
    await page.screenshot({ path: path.resolve(shotRel), fullPage: true });
    console.log(`   [진단][dom-probe] screenshot=${shotRel}`);
  } catch (err) {
    console.log(
      `   [진단][dom-probe] screenshot 예외 label=${label}: ${err instanceof Error ? err.message : String(err)}`
    );
  }
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
      // #mainPage 기준 — 사이드바 텍스트로 오인하지 않음 (문자열 evaluate: __name 방지)
      const mainMeta = await frame
        .evaluate(FIND_LEDGER_FRAME_META_JS)
        .catch(() => ({ hasMain: false, head: "", isDaily: false, isLedger: false })) as {
        hasMain: boolean;
        head: string;
        isDaily: boolean;
        isLedger: boolean;
      };

      if (mainMeta.isDaily && !mainMeta.isLedger) continue;

      // 결과 화면의 「재고수량」만 제외 — 사이드바 텍스트로 frame 스킵 금지
      const stockQty = frame.locator("#mainPage").locator("text=재고수량").first();
      if ((await stockQty.count()) > 0 && (await stockQty.isVisible().catch(() => false))) continue;

      if (!mainMeta.hasMain || !mainMeta.isLedger) continue;

      const search = frame.locator("#mainPage").getByText(SEARCH_BTN).first();
      const date = frame.locator("#mainPage").locator("text=기준일자").first();
      const hasSearch = (await search.count()) > 0 && (await search.isVisible().catch(() => false));
      const hasDate = (await date.count()) > 0 && (await date.isVisible().catch(() => false));
      if (hasSearch || hasDate || mainMeta.isLedger) frames.push(frame);
    } catch {
      /* skip */
    }
  }
  return frames;
}

export function expectedLedgerPrgId(): string {
  // leaf 메뉴 링크 힌트(#link_prg_E040702 등). 실제 브라우저 URL의 prgId와 다를 수 있음.
  return (process.env.ECOUNT_LEDGER_PRG_ID || "E040702").trim().toUpperCase();
}

/**
 * 실제 사용자 화면의 URL 셸 — 출력물(재고수불부 포함) 컨텍스트.
 * 검색 전/후 모두 prgId=C000035 로 유지되는 것이 확인됨 (E040702로 바뀌지 않음).
 */
export function ledgerOutputFolderPrgId(): string {
  return (process.env.ECOUNT_LEDGER_FOLDER_PRG_ID || "C000035").trim().toUpperCase();
}

export function isLedgerOutputFolderUrl(prgId: string | null | undefined): boolean {
  return !!prgId && prgId.toUpperCase() === ledgerOutputFolderPrgId();
}

/**
 * 사이드바/URL hash가 아닌 실제 메인 viewer 기준 program 컨텍스트
 * - viewerPrgIds: #script_target / #mainPage / [data-viewer-id] 내부 PRG_ID만
 * - urlPrgId: 브라우저 hash (leaf 클릭 후 E040702; 출력물 폴더는 C000035)
 * - urlDepth: hash depth (leaf=4, 출력물 셸=2)
 *
 * IMPORTANT: frame.evaluate 는 반드시 순수 JS 문자열로 전달.
 * tsx/esbuild 가 함수에 __name helper 를 주입하면 ECOUNT 페이지에서
 * ReferenceError 가 나고, catch 로 삼켜져 mainTitle="" / viewerPrg=[] 로 오판한다.
 */
export type LedgerProgramProbe = {
  url: string;
  urlPrgId: string | null;
  urlDepth: string | null;
  viewerPrgIds: string[];
  viewerIds: string[];
  ecpageIds: string[];
  mainTitle: string;
  titleHints: string[];
  bodyHint: string;
  hasRejectDailyStock: boolean;
  hasLedgerTitle: boolean;
};

/** Playwright evaluate 용 순수 JS — TS transpile helper(__name) 주입 방지 */
const PROBE_LEDGER_PROGRAM_JS = `(function () {
  var prg = {};
  var viewers = [];
  var ecpages = [];
  var titles = [];
  var mainTitleLocal = "";

  function addPrg(id) {
    if (!id) return;
    prg[String(id).toUpperCase()] = true;
  }

  function scanHtml(html) {
    if (!html) return;
    var re = /["']?PRG_ID["']?\\s*[:=]\\s*["']([A-Z]\\d{5,})["']/gi;
    var m;
    var n = 0;
    while ((m = re.exec(html)) !== null) {
      addPrg(m[1]);
      n++;
      if (n >= 20) break;
    }
  }

  function scanProgramId(html) {
    if (!html) return;
    var re = /["']programID["']\\s*:\\s*["']([A-Z]\\d{5,})["']/gi;
    var m;
    var n = 0;
    while ((m = re.exec(html)) !== null) {
      addPrg(m[1]);
      n++;
      if (n >= 20) break;
    }
  }

  var scriptTarget = document.querySelector("#script_target");
  if (scriptTarget) {
    var stHtml = scriptTarget.innerHTML || "";
    scanHtml(stHtml);
    scanProgramId(stHtml);
  }

  var roots = document.querySelectorAll("[data-viewer-id], #mainPage");
  for (var ri = 0; ri < roots.length; ri++) {
    var root = roots[ri];
    var vid = root.getAttribute("data-viewer-id");
    if (vid) viewers.push(vid);
    var epid = root.getAttribute("data-ecpageid");
    if (epid) ecpages.push(epid);
    var rootHtml = root.innerHTML || "";
    scanHtml(rootHtml);
    scanProgramId(rootHtml);
    var inputs = root.querySelectorAll('input[name="PRG_ID"], input[id*="PRG_ID"]');
    for (var ii = 0; ii < inputs.length; ii++) {
      var v = String(inputs[ii].value || "").trim();
      if (v) addPrg(v);
    }
  }

  var main = document.querySelector("#mainPage");
  if (main) {
    var titleEl = main.querySelector(".wrapper-title, .wrapper-toolbar .pull-left, .page-title, h1, h2") || main;
    mainTitleLocal = String(titleEl.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 100);
    var head = String(main.innerText || "").replace(/\\s+/g, " ").trim().slice(0, 120);
    if (/일별\\s*재고\\s*현황/.test(head) || head.indexOf("일별재고현황") === 0) titles.push("일별재고현황");
    if (/재고\\s*수불부/.test(head.slice(0, 80))) titles.push("재고수불부");
  }

  var body = "";
  try {
    body = String(document.body && document.body.innerText ? document.body.innerText : "")
      .replace(/\\s+/g, " ")
      .trim()
      .slice(0, 240);
  } catch (e) {
    body = "";
  }

  var prgList = [];
  for (var k in prg) {
    if (Object.prototype.hasOwnProperty.call(prg, k)) prgList.push(k);
  }

  return {
    prg: prgList,
    viewers: viewers,
    ecpages: ecpages,
    titles: titles,
    mainTitle: mainTitleLocal,
    body: body
  };
})()`;

const FIND_LEDGER_FRAME_META_JS = `(function () {
  var main = document.querySelector("#mainPage");
  if (!main) return { hasMain: false, head: "", isDaily: false, isLedger: false };
  var head = String(main.innerText || "").replace(/\\s+/g, " ").trim().slice(0, 160);
  return {
    hasMain: true,
    head: head,
    isDaily: /일별\\s*재고\\s*현황/.test(head) || head.indexOf("일별재고현황") === 0,
    isLedger: /재고\\s*수불부/.test(head.slice(0, 80))
  };
})()`;

const LEDGER_VIEWER_ROOT_OK_JS = `(function () {
  var main = document.querySelector("#mainPage");
  if (!main) return false;
  var head = String(main.innerText || "").replace(/\\s+/g, " ").trim().slice(0, 120);
  if (/일별\\s*재고\\s*현황|일별재고현황/.test(head)) return false;
  return /재고\\s*수불부|재고수불부/.test(head);
})()`;

/**
 * 검색 화면 성공 판정용 — 실제 DOM만 읽음 (probe.mainTitle/viewerPrg 미사용).
 * CI ~3초: #mainPage text = "재고수불부 Search(F3) Option 도움말 …"
 */
const DOM_LEDGER_SEARCH_SCREEN_JS = `(function () {
  var main = document.querySelector("#mainPage");
  if (!main) {
    return { hasMainPage: false, hasLedgerText: false, hasSearchTitle: false, head: "" };
  }
  var raw = "";
  try {
    raw = String(main.innerText || main.textContent || "");
  } catch (e) {
    raw = String(main.textContent || "");
  }
  var text = raw.replace(/\\s+/g, " ").trim();
  var head = text.slice(0, 160);
  if (/일별\\s*재고\\s*현황|일별재고현황/.test(head)) {
    return { hasMainPage: true, hasLedgerText: false, hasSearchTitle: false, head: head };
  }
  var hasLedgerText = /재고\\s*수불부|재고수불부/.test(text);
  var hasSearchTitle =
    /재고\\s*수불부\\s*Search\\s*\\(F3\\)/i.test(text) ||
    /재고수불부\\s*Search\\s*\\(F3\\)/i.test(text);
  return {
    hasMainPage: true,
    hasLedgerText: hasLedgerText,
    hasSearchTitle: hasSearchTitle,
    head: head
  };
})()`;

type DomLedgerSearchHit = {
  hasMainPage: boolean;
  hasLedgerText: boolean;
  hasSearchTitle: boolean;
  head: string;
};

function parseUrlPrgId(url: string): string | null {
  try {
    const hash = url.includes("#") ? url.slice(url.indexOf("#") + 1) : "";
    const params = new URLSearchParams(hash);
    const rawPrg = params.get("prgId");
    return rawPrg ? decodeURIComponent(rawPrg).toUpperCase() : null;
  } catch {
    try {
      const m = url.match(/prgId=([^&#]+)/i);
      return m ? decodeURIComponent(m[1]).toUpperCase() : null;
    } catch {
      return null;
    }
  }
}

/** 실제 DOM 기준으로 재고수불부 검색 화면인지 판정 (probe 변수 비의존) */
async function readDomLedgerSearchScreen(page: Page): Promise<{
  urlPrgId: string | null;
  hit: DomLedgerSearchHit | null;
}> {
  const urlPrgId = parseUrlPrgId(page.url());
  let best: DomLedgerSearchHit | null = null;

  for (const frame of page.frames()) {
    try {
      const hit = (await frame.evaluate(DOM_LEDGER_SEARCH_SCREEN_JS)) as DomLedgerSearchHit;
      if (!hit?.hasMainPage) continue;
      if (!best || (hit.hasLedgerText && !best.hasLedgerText) || hit.head.length > (best.head?.length || 0)) {
        best = hit;
      }
      if (hit.hasLedgerText || hit.hasSearchTitle) {
        return { urlPrgId, hit };
      }
    } catch {
      /* cross-origin or detached */
    }
  }

  return { urlPrgId, hit: best };
}

export async function probeLedgerProgramContext(page: Page): Promise<LedgerProgramProbe> {
  const url = page.url();
  let urlPrgId: string | null = null;
  let urlDepth: string | null = null;
  try {
    const hash = url.includes("#") ? url.slice(url.indexOf("#") + 1) : "";
    const params = new URLSearchParams(hash);
    const rawPrg = params.get("prgId");
    urlPrgId = rawPrg ? decodeURIComponent(rawPrg).toUpperCase() : null;
    urlDepth = params.get("depth");
  } catch {
    try {
      const m = url.match(/prgId=([^&#]+)/i);
      urlPrgId = m ? decodeURIComponent(m[1]).toUpperCase() : null;
    } catch {
      urlPrgId = null;
    }
  }

  const viewerPrgIds = new Set<string>();
  const viewerIds = new Set<string>();
  const ecpageIds = new Set<string>();
  const titleHints = new Set<string>();
  let mainTitle = "";
  let bodyHint = "";
  let hasRejectDailyStock = false;
  let hasLedgerTitle = false;

  for (const frame of page.frames()) {
    try {
      const data = (await frame.evaluate(PROBE_LEDGER_PROGRAM_JS)) as {
        prg: string[];
        viewers: string[];
        ecpages: string[];
        titles: string[];
        mainTitle: string;
        body: string;
      };

      for (const id of data.prg) viewerPrgIds.add(id.toUpperCase());
      for (const v of data.viewers) viewerIds.add(v);
      for (const e of data.ecpages) ecpageIds.add(e);
      for (const t of data.titles) titleHints.add(t);
      if (data.mainTitle && data.mainTitle.length > mainTitle.length) mainTitle = data.mainTitle;
      if (data.body && data.body.length > bodyHint.length) bodyHint = data.body;
      if (data.titles.includes("일별재고현황")) hasRejectDailyStock = true;
      if (data.titles.includes("재고수불부")) hasLedgerTitle = true;
    } catch {
      /* cross-origin or detached */
    }
  }

  // mainTitle 문자열로도 reject/ledger 보강
  if (/일별\s*재고\s*현황|일별재고현황/.test(mainTitle)) hasRejectDailyStock = true;
  if (/재고\s*수불부|재고수불부/.test(mainTitle)) hasLedgerTitle = true;

  return {
    url,
    urlPrgId,
    urlDepth,
    viewerPrgIds: Array.from(viewerPrgIds),
    viewerIds: Array.from(viewerIds),
    ecpageIds: Array.from(ecpageIds),
    mainTitle,
    titleHints: Array.from(titleHints),
    bodyHint,
    hasRejectDailyStock,
    hasLedgerTitle,
  };
}

function logLedgerProgramProbe(probe: LedgerProgramProbe, label: string): void {
  console.log(
    `   [진단][program] ${label} urlPrg=${probe.urlPrgId || "(none)"} depth=${probe.urlDepth || "(none)"} viewerPrg=[${probe.viewerPrgIds.join(",")}] viewers=[${probe.viewerIds.slice(0, 5).join(",")}] ecpage=[${probe.ecpageIds.slice(0, 5).join(",")}] mainTitle=${JSON.stringify(probe.mainTitle.slice(0, 60))} titles=[${probe.titleHints.join(",")}]`
  );
  console.log(`   [진단][program] ${label} url=${probe.url.slice(0, 160)}`);
}

/**
 * 재고수불부 화면이 로드됐는지 — 실제 DOM 기준 (probe.mainTitle/viewerPrg 비의존).
 *
 * 성공 (CI ~3초):
 * - #mainPage 존재
 * - #mainPage innerText/textContent 에 「재고수불부」 (예: "재고수불부 Search(F3) Option 도움말")
 * - URL prgId=E040702
 *
 * 거부: E040206 / C000650 / 일별재고현황 텍스트
 */
export async function isExpectedLedgerProgramLoaded(page: Page): Promise<boolean> {
  const { urlPrgId, hit } = await readDomLedgerSearchScreen(page);
  const leafPrg = expectedLedgerPrgId();

  if (urlPrgId === "E040206" || urlPrgId === "C000650") return false;
  if (!hit?.hasMainPage) return false;
  if (!hit.hasLedgerText && !hit.hasSearchTitle) return false;

  // 권장 성공: DOM 「재고수불부」 + URL E040702
  if (urlPrgId === leafPrg) return true;

  // Search(F3) 제목이면 검색 화면으로 인정 (URL 셸 변형 대비, C000035 강제 이동 없음)
  if (hit.hasSearchTitle) return true;

  return false;
}

/**
 * 「재고수불부」 검색 조건 화면 — DOM 직접 판정.
 * "재고수불부 Search(F3) Option 도움말" 정상 인정.
 */
export async function isLedgerSearchScreen(page: Page): Promise<boolean> {
  return isExpectedLedgerProgramLoaded(page);
}

/**
 * 재고수불부 검색 화면 대기 — 성공 여부는 DOM 판정만 사용.
 * probe는 진단 로그용.
 */
export async function waitForLedgerSearchScreen(page: Page, maxSec = 25): Promise<boolean> {
  const leafPrg = expectedLedgerPrgId();
  const steps = Math.ceil(maxSec / 2);
  for (let i = 0; i < steps; i++) {
    const elapsed = (i + 1) * 2;
    const dom = await readDomLedgerSearchScreen(page);
    const head = dom.hit?.head?.slice(0, 80) || "";
    console.log(
      `   [진단][dom] +${elapsed}s urlPrg=${dom.urlPrgId || "(none)"} hasMain=${!!dom.hit?.hasMainPage} hasLedger=${!!dom.hit?.hasLedgerText} searchTitle=${!!dom.hit?.hasSearchTitle} head=${JSON.stringify(head)}`
    );

    if (dom.urlPrgId === "E040206") {
      console.log(`   … URL=E040206(일별재고현황) — 재고수불부 교체 대기 (${elapsed}초)`);
    } else if (dom.urlPrgId === leafPrg && !dom.hit?.hasLedgerText && !dom.hit?.hasSearchTitle) {
      console.log(`   … URL leaf ${leafPrg} — #mainPage 「재고수불부」 DOM 대기 (${elapsed}초)`);
    }

    if (await isLedgerSearchScreen(page)) {
      console.log(
        `   ✓ 재고수불부 검색 화면 (${elapsed}초) urlPrg=${dom.urlPrgId || "(none)"} head=${JSON.stringify(head)}`
      );
      return true;
    }
    await page.waitForTimeout(2000);
  }

  const finalDom = await readDomLedgerSearchScreen(page);
  console.warn(
    `   ⚠ 재고수불부 검색 화면 미확인 (urlPrg=${finalDom.urlPrgId} hasMain=${!!finalDom.hit?.hasMainPage} hasLedger=${!!finalDom.hit?.hasLedgerText} head=${JSON.stringify(finalDom.hit?.head || "")})`
  );
  return false;
}

/** 재고수불부 검색 화면 로드 필수 — 실패 시 Error + DOM 진단 */
export async function assertLedgerProgramSearchScreen(page: Page, maxSec = 25): Promise<void> {
  if (await waitForLedgerSearchScreen(page, maxSec)) return;

  const dom = await readDomLedgerSearchScreen(page);
  throw new Error(
    `재고수불부 화면 미로드 (${maxSec}초). ` +
      `urlPrg=${dom.urlPrgId || "(none)"} ` +
      `hasMainPage=${!!dom.hit?.hasMainPage} hasLedgerText=${!!dom.hit?.hasLedgerText} ` +
      `hasSearchTitle=${!!dom.hit?.hasSearchTitle} ` +
      `head=${JSON.stringify(dom.hit?.head || "")} ` +
      `(기대: #mainPage 에 재고수불부 + urlPrg=${expectedLedgerPrgId()})`
  );
}

const PRODUCTION_TRANSFER_HINT = /생산\s*불출.*창고\s*이동.*포함|생산불출\s*\/\s*창고이동\s*포함/;
/**
 * 임시 테스트: true면 「기타」 탭 클릭·생산불출 checkbox를 모두 건너뛴다.
 * (기본 검색 → ESC → 결과 → Excel → parser 검증용)
 */
const SKIP_ETC_AND_PRODUCTION_TRANSFER = true;
/** @deprecated SKIP_ETC_AND_PRODUCTION_TRANSFER 사용 — checkbox만 스킵할 때 */
const SKIP_PRODUCTION_TRANSFER_CHECKBOX = true;
const ETC_DIAG_KEYWORDS = ["생산불출", "창고이동", "생산불출/창고이동포함", "포함"] as const;
/** 전역/사이드 메뉴 chrome — 「기타」 탭 탐색에서 제외 */
const ECOUNT_MENU_CHROME_SELECTOR =
  '#menuAreaAddon, #leftMenu, #menu, .left-menu, .wrapper-local-nav, #bookmarkBar, #bookmarkBarFrame, .wrapper-gnb, #header, #nav, .lnb, [class*="side-menu"], [id*="MENUTREE"]';

function clipHtml(raw: string, max = 280): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, max);
}

type EtcExactCandidate = {
  frameIndex: number;
  frameName: string;
  frameUrl: string;
  inMainPage: boolean;
  inMenuChrome: boolean;
  isMenuNavLink: boolean;
  visible: boolean;
  tag: string;
  id: string;
  className: string;
  role: string;
  href: string;
  text: string;
  tabContext: string;
  outerHTML: string;
  parentHTML: string;
};

/** E040702 #mainPage / data-viewer 루트 locator */
async function getLedgerViewerRoots(
  page: Page
): Promise<Array<{ frame: Frame; root: Locator; frameIndex: number }>> {
  const out: Array<{ frame: Frame; root: Locator; frameIndex: number }> = [];
  const frames = page.frames();
  for (let fi = 0; fi < frames.length; fi++) {
    const frame = frames[fi];
    try {
      const ok = (await frame.evaluate(LEDGER_VIEWER_ROOT_OK_JS)) as boolean;
      if (!ok) continue;
      const root = frame.locator("#mainPage").first();
      if ((await root.count()) === 0) continue;
      out.push({ frame, root, frameIndex: fi });
    } catch {
      /* skip */
    }
  }
  return out;
}

/** 클릭 전/후 재고수불부 화면 검증 — E040206/C000650이면 즉시 실패 */
async function assertActiveLedgerProgramPhase(page: Page, phase: string): Promise<LedgerProgramProbe> {
  const folderPrg = ledgerOutputFolderPrgId();
  const probe = await probeLedgerProgramContext(page);
  logLedgerProgramProbe(probe, phase);

  const drifted =
    probe.urlPrgId === "E040206" ||
    probe.urlPrgId === "C000650" ||
    probe.viewerPrgIds.includes("E040206") ||
    probe.hasRejectDailyStock;

  if (drifted) {
    throw new Error(
      `[${phase}] 재고수불부가 아님 — 잘못된 「기타」/메뉴 클릭 의심. ` +
        `urlPrg=${probe.urlPrgId || "(none)"} depth=${probe.urlDepth || "(none)"} ` +
        `viewerPrg=[${probe.viewerPrgIds.join(",")}] ` +
        `mainTitle=${JSON.stringify(probe.mainTitle)} titles=[${probe.titleHints.join(",")}] url=${probe.url.slice(0, 160)}`
    );
  }

  if (!(await isExpectedLedgerProgramLoaded(page))) {
    throw new Error(
      `[${phase}] 재고수불부 active 미확인 (기대 URL 셸=${folderPrg} 또는 leaf=${expectedLedgerPrgId()} + #mainPage 제목). ` +
        `urlPrg=${probe.urlPrgId || "(none)"} depth=${probe.urlDepth || "(none)"} ` +
        `viewerPrg=[${probe.viewerPrgIds.join(",")}] mainTitle=${JSON.stringify(probe.mainTitle)}`
    );
  }
  return probe;
}

/**
 * exact text "기타" 후보 진단 — mainPage 내부 vs 전역 메뉴 구분.
 * 추측 selector 금지: 클릭 전 반드시 이 로그로 근거를 남긴다.
 */
async function diagnoseExactEtcTabCandidates(page: Page): Promise<EtcExactCandidate[]> {
  const expected = expectedLedgerPrgId();
  const probe = await probeLedgerProgramContext(page);
  logLedgerProgramProbe(probe, "기타-후보진단-전");
  console.log(
    `   [진단][기타탭] expected=${expected} activeOk=${await isExpectedLedgerProgramLoaded(page)}`
  );

  const all: EtcExactCandidate[] = [];
  const frames = page.frames();

  for (let fi = 0; fi < frames.length; fi++) {
    const frame = frames[fi];
    try {
      const found = await frame.evaluate((menuSel) => {
        const rows: Array<{
          inMainPage: boolean;
          inMenuChrome: boolean;
          isMenuNavLink: boolean;
          visible: boolean;
          tag: string;
          id: string;
          className: string;
          role: string;
          href: string;
          text: string;
          tabContext: string;
          outerHTML: string;
          parentHTML: string;
        }> = [];

        const nodes = Array.from(
          document.querySelectorAll('a, button, span, li, div, [role="tab"]')
        );
        for (const node of nodes) {
          const el = node as HTMLElement;
          const text = (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
          if (text !== "기타") continue;

          const inMainPage = !!el.closest("#mainPage, [data-viewer-id]");
          const inMenuChrome = !!el.closest(menuSel);
          const href =
            (el as HTMLAnchorElement).getAttribute?.("href") ||
            el.closest("a")?.getAttribute("href") ||
            "";
          const isMenuNavLink =
            /menuType=|MENUTREE_|[#&?]prgId=/i.test(href) ||
            !!el.closest('a[href*="menuType"], a[href*="MENUTREE"], a[href*="prgId="]');

          const tabRoot =
            el.closest('[role="tablist"], .nav-tabs, ul.nav-tabs, .wrapper-tab, [class*="tab-"]') ||
            null;
          const tabContext = tabRoot
            ? `${tabRoot.tagName}.${(tabRoot.className || "").toString().slice(0, 80)} role=${tabRoot.getAttribute("role") || ""}`
            : "";

          const visible = !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
          rows.push({
            inMainPage,
            inMenuChrome,
            isMenuNavLink,
            visible,
            tag: el.tagName,
            id: el.id || "",
            className: (el.className || "").toString().slice(0, 120),
            role: el.getAttribute("role") || "",
            href: href.slice(0, 160),
            text,
            tabContext,
            outerHTML: (el.outerHTML || "").replace(/\s+/g, " ").trim().slice(0, 280),
            parentHTML: (el.parentElement?.outerHTML || "").replace(/\s+/g, " ").trim().slice(0, 280),
          });
          if (rows.length >= 40) break;
        }
        return rows;
      }, ECOUNT_MENU_CHROME_SELECTOR);

      for (const row of found) {
        const cand: EtcExactCandidate = {
          frameIndex: fi,
          frameName: frame.name(),
          frameUrl: frame.url(),
          ...row,
        };
        all.push(cand);
        const kind =
          cand.inMainPage && !cand.inMenuChrome && !cand.isMenuNavLink
            ? "REPORT"
            : cand.inMenuChrome || cand.isMenuNavLink
              ? "MENU"
              : "OTHER";
        console.log(
          `   [진단][기타탭] ${kind} frame[${fi}] <${cand.tag}> id=${JSON.stringify(cand.id)} class=${JSON.stringify(cand.className)} role=${JSON.stringify(cand.role)} visible=${cand.visible} inMain=${cand.inMainPage} inMenu=${cand.inMenuChrome} menuNav=${cand.isMenuNavLink} href=${JSON.stringify(cand.href)} tabCtx=${JSON.stringify(cand.tabContext)}`
        );
        console.log(
          `   [진단][기타탭]   outerHTML=${JSON.stringify(cand.outerHTML)} parentHTML=${JSON.stringify(cand.parentHTML)}`
        );
      }
    } catch (err) {
      console.log(
        `   [진단][기타탭] frame[${fi}] 스캔 예외: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  const reportN = all.filter((c) => c.inMainPage && !c.inMenuChrome && !c.isMenuNavLink).length;
  const menuN = all.filter((c) => c.inMenuChrome || c.isMenuNavLink).length;
  console.log(
    `   [진단][기타탭] 요약 total=${all.length} report내부후보=${reportN} 메뉴후보=${menuN}`
  );
  return all;
}

/**
 * 기타 탭 클릭 직후 — page의 모든 frame DOM 구조 진단
 * (findLedgerFrames 필터 없이 page.frames() 전체)
 */
async function diagnoseLedgerEtcTabDom(page: Page): Promise<void> {
  const allFrames = page.frames();
  console.log(`   [진단][기타] page.url=${page.url()}`);
  console.log(`   [진단][기타] 전체 frame count=${allFrames.length}`);

  for (let fi = 0; fi < allFrames.length; fi++) {
    const frame = allFrames[fi];
    const name = frame.name();
    const url = frame.url();
    console.log(`   [진단][기타] frame[${fi}] name=${JSON.stringify(name)} url=${url}`);

    try {
      const checkboxCount = await frame.locator('input[type="checkbox"]').count();
      const labelCount = await frame.locator("label").count();
      console.log(
        `   [진단][기타] frame[${fi}] checkbox=${checkboxCount} label=${labelCount}`
      );

      // 키워드별 텍스트 요소
      for (const kw of ["생산불출", "창고이동", "포함"] as const) {
        try {
          const nodes = frame.locator("body *").filter({ hasText: kw });
          const n = await nodes.count();
          console.log(`   [진단][기타] frame[${fi}] text~"${kw}" elements=${n}`);
          const show = Math.min(n, 5);
          for (let i = 0; i < show; i++) {
            const el = nodes.nth(i);
            try {
              const snap = await el.evaluate((node) => {
                const html = (node as HTMLElement).outerHTML || "";
                const parent = (node as HTMLElement).parentElement;
                const parentHtml = parent?.outerHTML || "";
                const grand = parent?.parentElement;
                const grandHtml = grand?.outerHTML || "";
                return {
                  tag: (node as HTMLElement).tagName,
                  text: ((node as HTMLElement).innerText || node.textContent || "")
                    .replace(/\s+/g, " ")
                    .trim()
                    .slice(0, 120),
                  html,
                  parentHtml,
                  grandHtml,
                };
              });
              console.log(
                `   [진단][기타] frame[${fi}] "${kw}"[${i}] <${snap.tag}> text=${JSON.stringify(snap.text)}`
              );
              console.log(`   [진단][기타]   outerHTML=${JSON.stringify(clipHtml(snap.html))}`);
              console.log(`   [진단][기타]   parentHTML=${JSON.stringify(clipHtml(snap.parentHtml))}`);
              console.log(`   [진단][기타]   ancestorHTML=${JSON.stringify(clipHtml(snap.grandHtml))}`);
            } catch (err) {
              console.log(
                `   [진단][기타] frame[${fi}] "${kw}"[${i}] 예외: ${
                  err instanceof Error ? err.message : String(err)
                }`
              );
            }
          }
        } catch (err) {
          console.log(
            `   [진단][기타] frame[${fi}] keyword "${kw}" 스캔 예외: ${
              err instanceof Error ? err.message : String(err)
            }`
          );
        }
      }

      // checkbox 상세
      const boxes = frame.locator('input[type="checkbox"]');
      const boxN = Math.min(checkboxCount, 40);
      for (let i = 0; i < boxN; i++) {
        try {
          const info = await boxes.nth(i).evaluate((el: HTMLInputElement) => {
            let near = "";
            try {
              if (el.id) {
                const lab = el.ownerDocument.querySelector(`label[for="${el.id}"]`);
                if (lab) near = (lab.textContent || "").replace(/\s+/g, " ").trim();
              }
              if (!near) {
                const pl = el.closest("label");
                if (pl) near = (pl.textContent || "").replace(/\s+/g, " ").trim();
              }
              if (!near) {
                const row = el.closest("tr, li, td, div");
                if (row) near = (row.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120);
              }
            } catch {
              /* ignore */
            }
            return {
              id: el.id || "",
              name: el.name || "",
              value: el.value || "",
              checked: el.checked,
              visible: !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length),
              near: near.slice(0, 120),
              outer: (el.outerHTML || "").slice(0, 200),
            };
          });
          console.log(
            `   [진단][기타] frame[${fi}] cb[${i}] id=${JSON.stringify(info.id)} name=${JSON.stringify(info.name)} value=${JSON.stringify(info.value)} checked=${info.checked} visible=${info.visible} near=${JSON.stringify(info.near)} outer=${JSON.stringify(info.outer)}`
          );
        } catch (err) {
          console.log(
            `   [진단][기타] frame[${fi}] cb[${i}] 예외: ${
              err instanceof Error ? err.message : String(err)
            }`
          );
        }
      }
    } catch (err) {
      console.log(
        `   [진단][기타] frame[${fi}] 스캔 예외: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // page 전역 문자열 검색 (모든 frame)
  console.log("   [진단][기타] === page 전역 문자열 검색 ===");
  for (const needle of ETC_DIAG_KEYWORDS) {
    let hits = 0;
    for (let fi = 0; fi < allFrames.length; fi++) {
      const frame = allFrames[fi];
      try {
        const found = await frame.evaluate((q) => {
          const out: Array<{ tag: string; text: string; html: string; parentHtml: string }> = [];
          const walk = document.body ? Array.from(document.body.querySelectorAll("*")) : [];
          for (const el of walk) {
            const t = (el.textContent || "").replace(/\s+/g, " ");
            // 직접 텍스트가 너무 긴 컨테이너는 스킵 — leaf에 가깝게
            if (!t.includes(q)) continue;
            const own = ((el as HTMLElement).innerText || el.textContent || "").replace(/\s+/g, " ").trim();
            if (!own.includes(q)) continue;
            if (own.length > 200 && el.children.length > 3) continue;
            out.push({
              tag: el.tagName,
              text: own.slice(0, 120),
              html: (el as HTMLElement).outerHTML.slice(0, 280),
              parentHtml: (el.parentElement?.outerHTML || "").slice(0, 280),
            });
            if (out.length >= 5) break;
          }
          return out;
        }, needle);
        for (const hit of found) {
          hits += 1;
          console.log(
            `   [진단][기타] HIT "${needle}" frame[${fi}] name=${JSON.stringify(frame.name())} url=${frame.url()}`
          );
          console.log(
            `   [진단][기타]   <${hit.tag}> text=${JSON.stringify(hit.text)} outerHTML=${JSON.stringify(clipHtml(hit.html))} parentHTML=${JSON.stringify(clipHtml(hit.parentHtml))}`
          );
        }
      } catch (err) {
        console.log(
          `   [진단][기타] 전역검색 "${needle}" frame[${fi}] 예외: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      }
    }
    console.log(`   [진단][기타] 전역검색 "${needle}" totalHits(logged≤5/frame)=${hits}`);
  }
}

/** 기타 탭 영역(또는 frame)의 checkbox 목록을 디버그 로그로 출력 */
async function dumpLedgerEtcCheckboxes(frames: Frame[]): Promise<void> {
  console.log("   [진단] 기타 탭 영역 checkbox 목록:");
  for (let fi = 0; fi < frames.length; fi++) {
    const frame = frames[fi];
    try {
      const boxes = frame.locator('input[type="checkbox"]');
      const total = await boxes.count();
      console.log(
        `   [진단] frame[${fi}] name=${JSON.stringify(frame.name())} url=${frame.url().slice(0, 100)} checkbox count=${total}`
      );
      const n = Math.min(total, 40);
      for (let i = 0; i < n; i++) {
        const cb = boxes.nth(i);
        try {
          const info = await cb.evaluate((el: HTMLInputElement) => {
            const id = el.id || "";
            const name = el.name || "";
            const value = el.value || "";
            const checked = el.checked;
            const visible = !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
            let labelText = "";
            if (id) {
              const lab = el.ownerDocument.querySelector(`label[for="${id}"]`);
              if (lab) labelText = (lab.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80);
            }
            if (!labelText) {
              const parentLab = el.closest("label");
              if (parentLab) labelText = (parentLab.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80);
            }
            if (!labelText) {
              const row = el.closest("tr, li, div, td");
              if (row) labelText = (row.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80);
            }
            return { id, name, value, checked, visible, labelText };
          });
          console.log(
            `   [진단]   cb[${i}] id=${JSON.stringify(info.id)} name=${JSON.stringify(info.name)} value=${JSON.stringify(info.value)} checked=${info.checked} visible=${info.visible} nearText=${JSON.stringify(info.labelText)}`
          );
        } catch (err) {
          console.log(
            `   [진단]   cb[${i}] 읽기 실패: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
    } catch (err) {
      console.log(
        `   [진단] frame[${fi}] checkbox dump 예외: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
}

/** 힌트 텍스트 근처에서 실제 checkbox locator 찾기 — root(#mainPage) 내부만 */
async function findProductionTransferCheckbox(root: Locator): Promise<Locator | null> {
  const textNodes = root.locator("label, span, td, div, a, p, li").filter({ hasText: PRODUCTION_TRANSFER_HINT });
  const textCount = Math.min(await textNodes.count(), 20);

  for (let i = 0; i < textCount; i++) {
    const textEl = textNodes.nth(i);
    try {
      if (!(await textEl.isVisible().catch(() => false))) continue;
    } catch {
      continue;
    }

    // 1) label[for] → #id checkbox
    try {
      const forId = await textEl.evaluate((el) => {
        const lab =
          el.tagName === "LABEL" ? (el as HTMLLabelElement) : (el.closest("label") as HTMLLabelElement | null);
        return lab?.htmlFor || lab?.getAttribute("for") || "";
      });
      if (forId) {
        const byId = root.locator(`input[type="checkbox"][id="${forId}"]`);
        if ((await byId.count()) > 0) return byId.first();
      }
    } catch {
      /* next strategy */
    }

    // 2) 같은 label 내부 checkbox
    const inLabel = textEl.locator('xpath=ancestor-or-self::label[1]//input[@type="checkbox"]').first();
    if ((await inLabel.count()) > 0) return inLabel;

    // 3) 같은 tr / li / row 컨테이너
    for (const xpath of [
      'xpath=ancestor::tr[1]//input[@type="checkbox"]',
      'xpath=ancestor::li[1]//input[@type="checkbox"]',
      'xpath=ancestor::*[contains(@class,"check") or contains(@class,"form") or contains(@class,"item")][1]//input[@type="checkbox"]',
      'xpath=ancestor::td[1]//input[@type="checkbox"]',
      'xpath=ancestor::div[1]//input[@type="checkbox"]',
      'xpath=preceding::input[@type="checkbox"][1]',
      'xpath=following::input[@type="checkbox"][1]',
    ]) {
      const cand = textEl.locator(xpath).first();
      try {
        if ((await cand.count()) > 0) return cand;
      } catch {
        /* next xpath */
      }
    }

    // 4) evaluate: 텍스트 노드 기준으로 가장 가까운 checkbox
    try {
      const handle = await textEl.evaluateHandle((el) => {
        const matchHint = (s: string) => /생산\s*불출.*창고\s*이동.*포함|생산불출\s*\/\s*창고이동\s*포함/.test(s);
        let node: HTMLElement | null = el as HTMLElement;
        for (let depth = 0; depth < 8 && node; depth++) {
          const boxes = Array.from(node.querySelectorAll('input[type="checkbox"]')) as HTMLInputElement[];
          if (boxes.length === 1) return boxes[0];
          if (boxes.length > 1) {
            for (const b of boxes) {
              const row = b.closest("tr, li, label, div") || b.parentElement;
              const t = (row?.textContent || "").replace(/\s+/g, " ");
              if (matchHint(t)) return b;
            }
            return boxes[0];
          }
          node = node.parentElement;
        }
        const id = (el as HTMLElement).closest("label")?.getAttribute("for");
        if (id) {
          const byId = el.ownerDocument.getElementById(id);
          if (byId && byId instanceof HTMLInputElement && byId.type === "checkbox") return byId;
        }
        return null;
      });
      const element = handle.asElement();
      if (element) {
        const meta = await element.evaluate((el: HTMLInputElement) => ({
          id: el.id,
          name: el.name,
          value: el.value,
        }));
        await handle.dispose().catch(() => {});
        if (meta.id) {
          const byId = root.locator(`input[type="checkbox"][id="${meta.id}"]`);
          if ((await byId.count()) > 0) return byId.first();
        }
        if (meta.name) {
          const loc = root.locator(`input[type="checkbox"][name="${meta.name}"]`);
          if ((await loc.count()) > 0) {
            if (meta.value) {
              const byVal = root.locator(
                `input[type="checkbox"][name="${meta.name}"][value="${meta.value}"]`
              );
              if ((await byVal.count()) > 0) return byVal.first();
            }
            return loc.first();
          }
        }
      } else {
        await handle.dispose().catch(() => {});
      }
    } catch {
      /* next text node */
    }
  }

  // 5) root 내부 checkbox 중 nearText가 힌트와 일치
  try {
    const boxes = root.locator('input[type="checkbox"]');
    const n = Math.min(await boxes.count(), 40);
    for (let i = 0; i < n; i++) {
      const cb = boxes.nth(i);
      const near = await cb.evaluate((el: HTMLInputElement) => {
        const parts: string[] = [];
        if (el.id) {
          const lab = el.ownerDocument.querySelector(`label[for="${el.id}"]`);
          if (lab) parts.push(lab.textContent || "");
        }
        const parentLab = el.closest("label");
        if (parentLab) parts.push(parentLab.textContent || "");
        const row = el.closest("tr, li, td, div");
        if (row) parts.push(row.textContent || "");
        return parts.join(" ").replace(/\s+/g, " ");
      });
      if (PRODUCTION_TRANSFER_HINT.test(near)) return cb;
    }
  } catch {
    /* none */
  }

  return null;
}

/** E040702 viewer(#mainPage) 내부의 실제 「기타」 탭만 클릭 */
async function clickLedgerEtcTabInViewer(page: Page): Promise<void> {
  const candidates = await diagnoseExactEtcTabCandidates(page);
  const reportCandidates = candidates.filter(
    (c) => c.inMainPage && !c.inMenuChrome && !c.isMenuNavLink && c.visible
  );

  if (reportCandidates.length === 0) {
    console.log(
      `   [진단][기타탭] REPORT visible 후보 없음 — menu=${candidates.filter((c) => c.inMenuChrome || c.isMenuNavLink).length}`
    );
    throw new Error(
      '재고수불부(#mainPage) 내부에서 visible 「기타」 탭을 찾지 못했습니다. (전역 메뉴 「기타」는 클릭하지 않음)'
    );
  }

  // 우선순위: role=tab → tablist/nav-tabs 컨텍스트 → 그 외 mainPage exact
  const ranked = [...reportCandidates].sort((a, b) => {
    const score = (c: EtcExactCandidate) => {
      let s = 0;
      if (c.role === "tab") s += 100;
      if (/tablist|nav-tabs|wrapper-tab/i.test(c.tabContext)) s += 50;
      if (/^(A|BUTTON)$/i.test(c.tag)) s += 10;
      if (c.id) s += 5;
      return s;
    };
    return score(b) - score(a);
  });

  const pick = ranked[0];
  console.log(
    `   [진단][기타탭] 클릭 대상 REPORT frame[${pick.frameIndex}] <${pick.tag}> id=${JSON.stringify(pick.id)} role=${JSON.stringify(pick.role)} class=${JSON.stringify(pick.className)} tabCtx=${JSON.stringify(pick.tabContext)} outerHTML=${JSON.stringify(pick.outerHTML)}`
  );

  const frame = page.frames()[pick.frameIndex];
  if (!frame) {
    throw new Error(`재고수불부 「기타」 탭 frame[${pick.frameIndex}] 없음`);
  }

  const main = frame.locator("#mainPage").first();
  let target: Locator | null = null;

  // 1) tab role (DOM 근거 우선)
  const byRole = main.getByRole("tab", { name: "기타", exact: true });
  if ((await byRole.count()) > 0) {
    for (let i = 0; i < Math.min(await byRole.count(), 5); i++) {
      const el = byRole.nth(i);
      if (await el.isVisible().catch(() => false)) {
        target = el;
        console.log("   [진단][기타탭] locator=getByRole(tab,{name:기타,exact})");
        break;
      }
    }
  }

  // 2) tablist / nav-tabs 내부 exact
  if (!target) {
    const inTabs = main
      .locator('[role="tablist"], .nav-tabs, ul.nav-tabs, .wrapper-tab')
      .getByText("기타", { exact: true });
    const n = Math.min(await inTabs.count(), 8);
    for (let i = 0; i < n; i++) {
      const el = inTabs.nth(i);
      if (!(await el.isVisible().catch(() => false))) continue;
      const bad = await el.evaluate((node, menuSel) => {
        const he = node as HTMLElement;
        if (he.closest(menuSel)) return true;
        const href =
          (he as HTMLAnchorElement).getAttribute?.("href") ||
          he.closest("a")?.getAttribute("href") ||
          "";
        return /menuType=|MENUTREE_|[#&?]prgId=/i.test(href);
      }, ECOUNT_MENU_CHROME_SELECTOR);
      if (bad) continue;
      target = el;
      console.log('   [진단][기타탭] locator=#mainPage tablist/nav-tabs getByText("기타",exact)');
      break;
    }
  }

  // 3) #mainPage exact text — 메뉴 링크 제외
  if (!target) {
    const exact = main.getByText("기타", { exact: true });
    const n = Math.min(await exact.count(), 12);
    for (let i = 0; i < n; i++) {
      const el = exact.nth(i);
      if (!(await el.isVisible().catch(() => false))) continue;
      const meta = await el.evaluate((node, menuSel) => {
        const he = node as HTMLElement;
        const inMenu = !!he.closest(menuSel);
        const href =
          (he as HTMLAnchorElement).getAttribute?.("href") ||
          he.closest("a")?.getAttribute("href") ||
          "";
        const menuNav = /menuType=|MENUTREE_|[#&?]prgId=/i.test(href);
        return {
          inMenu,
          menuNav,
          tag: he.tagName,
          role: he.getAttribute("role") || "",
          href: href.slice(0, 120),
        };
      }, ECOUNT_MENU_CHROME_SELECTOR);
      if (meta.inMenu || meta.menuNav) {
        console.log(
          `   [진단][기타탭] mainPage exact[${i}] 스킵 (menu/nav) <${meta.tag}> href=${JSON.stringify(meta.href)}`
        );
        continue;
      }
      target = el;
      console.log(
        `   [진단][기타탭] locator=#mainPage getByText("기타",exact)[${i}] <${meta.tag}> role=${JSON.stringify(meta.role)}`
      );
      break;
    }
  }

  if (!target) {
    throw new Error(
      '재고수불부 #mainPage 내부 「기타」 탭 locator를 확정하지 못했습니다. (메뉴 「기타」 제외)'
    );
  }

  await target.scrollIntoViewIfNeeded().catch(() => {});
  await target.click({ force: true });
  await page.waitForTimeout(800);
  console.log("   ✓ 기타 탭 (#mainPage / E040702 viewer 내부)");
}

/** 기타 탭 → 생산불출/창고이동포함 체크 (미발견·미체크 시 Error) */
export async function ensureProductionTransferIncluded(page: Page): Promise<void> {
  // 임시: 「기타」/생산불출 완전 스킵 — 기본 검색·다운로드 검증 경로
  if (SKIP_ETC_AND_PRODUCTION_TRANSFER) {
    console.log(
      "   ⏭ 「기타」 탭·생산불출/창고이동포함 완전 스킵 (임시) — ensureProductionTransferIncluded no-op"
    );
    return;
  }

  // 1) 클릭 전: 반드시 E040702
  await assertActiveLedgerProgramPhase(page, "기타클릭-전");

  // 2) E040702 viewer 내부 「기타」만 클릭 (전역 getByText 금지)
  try {
    await clickLedgerEtcTabInViewer(page);
  } catch (err) {
    const probe = await probeLedgerProgramContext(page);
    logLedgerProgramProbe(probe, "기타클릭-실패");
    throw err instanceof Error
      ? err
      : new Error(`재고수불부 「기타」 탭 클릭 실패: ${String(err)}`);
  }

  // 3) 클릭 후: E040702 유지 — E040206/C000650이면 즉시 실패
  await assertActiveLedgerProgramPhase(page, "기타클릭-후");

  // 임시: 「생산불출/창고이동포함」 checkbox는 제외 — 「기타」 탭 + PRG 유지만 검증
  if (SKIP_PRODUCTION_TRANSFER_CHECKBOX) {
    console.log(
      "   ⏭ 생산불출/창고이동포함 체크 스킵 (임시) — 「기타」 탭 클릭 및 E040702 유지 확인만 진행"
    );
    return;
  }

  // 4) PRG 유지 확인 후에만 checkbox 탐색 — #mainPage 내부만
  await page.waitForTimeout(400);
  const viewerRoots = await getLedgerViewerRoots(page);
  console.log(`   [진단][기타] checkbox 탐색 viewer(#mainPage) count=${viewerRoots.length}`);

  if (viewerRoots.length === 0) {
    try {
      await diagnoseLedgerEtcTabDom(page);
    } catch {
      /* ignore */
    }
    throw new Error(
      "「생산불출/창고이동포함」 탐색 전 E040702 #mainPage를 찾지 못했습니다."
    );
  }

  try {
    await diagnoseLedgerEtcTabDom(page);
  } catch (err) {
    console.log(
      `   [진단][기타] diagnoseLedgerEtcTabDom 예외: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  let sawHintText = false;
  for (const { root } of viewerRoots) {
    try {
      const hint = root.getByText(PRODUCTION_TRANSFER_HINT).first();
      if ((await hint.count()) > 0) {
        sawHintText = true;
        break;
      }
    } catch {
      /* next */
    }
  }

  for (const { root, frameIndex } of viewerRoots) {
    const cb = await findProductionTransferCheckbox(root);
    if (!cb) continue;

    console.log(`   [진단][기타] checkbox 후보 frame[${frameIndex}] #mainPage 내부`);

    let alreadyChecked: boolean;
    try {
      alreadyChecked = await cb.isChecked();
    } catch (err) {
      await dumpLedgerEtcCheckboxes(viewerRoots.map((v) => v.frame));
      throw new Error(
        `생산불출/창고이동포함 checkbox 상태 확인 실패: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }

    if (alreadyChecked) {
      console.log("   ✓ 생산불출/창고이동포함 (이미 체크됨)");
    } else {
      await cb.scrollIntoViewIfNeeded().catch(() => {});
      await cb.click({ force: true });
      console.log("   ✓ 생산불출/창고이동포함 체크");
      await page.waitForTimeout(300);
    }

    let verified: boolean;
    try {
      verified = await cb.isChecked();
    } catch (err) {
      await dumpLedgerEtcCheckboxes(viewerRoots.map((v) => v.frame));
      throw new Error(
        `생산불출/창고이동포함 checkbox 재확인 실패: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
    if (!verified) {
      await dumpLedgerEtcCheckboxes(viewerRoots.map((v) => v.frame));
      throw new Error("생산불출/창고이동포함 checkbox가 체크되지 않았습니다.");
    }

    // 체크 후에도 E040702 유지
    await assertActiveLedgerProgramPhase(page, "checkbox처리-후");
    return;
  }

  await dumpLedgerEtcCheckboxes(viewerRoots.map((v) => v.frame));
  try {
    await diagnoseLedgerEtcTabDom(page);
  } catch {
    /* ignore */
  }
  if (!sawHintText) {
    throw new Error(
      '「생산불출/창고이동포함」 텍스트/label을 #mainPage에서 찾지 못했습니다. (기타 탭 DOM 진단 로그 참고)'
    );
  }
  throw new Error(
    "「생산불출/창고이동포함」 checkbox를 #mainPage에서 찾지 못했습니다. (기타 탭 DOM 진단 로그 참고)"
  );
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

/**
 * 재고수불부 검색 실행 — 사람 UX와 동일하게 F8 키 사용.
 * 검색 버튼 selector/DOM 탐색은 사용하지 않음.
 * F8 직후 잘못된 화면이면 즉시 실패. 검색이 시작되지 않아도 실패 (ESC로 화면 파괴 방지).
 */
const DISPATCH_F8_JS = `(function () {
  var main = document.querySelector("#mainPage");
  var focused = "";
  try {
    if (main) {
      if (typeof main.focus === "function") main.focus();
      var inp = main.querySelector("input:not([type='hidden']), textarea, select");
      if (inp && typeof inp.focus === "function") {
        inp.focus();
        focused = (inp.tagName || "") + "#" + (inp.id || "") + "." + String(inp.className || "").slice(0, 40);
      }
    }
  } catch (e) {
    focused = "focus-error";
  }

  function fire(target, type) {
    try {
      var ev = new KeyboardEvent(type, {
        key: "F8",
        code: "F8",
        keyCode: 119,
        which: 119,
        bubbles: true,
        cancelable: true,
        view: window
      });
      // some browsers ignore keyCode in ctor — force
      try {
        Object.defineProperty(ev, "keyCode", { get: function () { return 119; } });
        Object.defineProperty(ev, "which", { get: function () { return 119; } });
      } catch (e2) {}
      target.dispatchEvent(ev);
      return true;
    } catch (e3) {
      return false;
    }
  }

  var targets = [];
  if (document.activeElement) targets.push(document.activeElement);
  if (main) targets.push(main);
  targets.push(document);
  targets.push(window);

  var fired = 0;
  for (var i = 0; i < targets.length; i++) {
    if (fire(targets[i], "keydown")) fired++;
    fire(targets[i], "keyup");
  }

  // ECOUNT jQuery hotkey 경로 (있을 때만)
  var jq = false;
  try {
    var $ = window.jQuery || window.$;
    if ($ && typeof $.fn !== "undefined") {
      jq = true;
      $(document).trigger({ type: "keydown", keyCode: 119, which: 119, key: "F8" });
      $(document).trigger({ type: "keyup", keyCode: 119, which: 119, key: "F8" });
    }
  } catch (e4) {}

  return { focused: focused, fired: fired, jq: jq };
})()`;

const F8_POST_STATE_JS = `(function () {
  var main = document.querySelector("#mainPage");
  var body = "";
  var head = "";
  try {
    body = String(document.body && document.body.innerText ? document.body.innerText : "")
      .replace(/\\s+/g, " ")
      .trim()
      .slice(0, 500);
  } catch (e) {
    body = "";
  }
  if (main) {
    try {
      head = String(main.innerText || main.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 200);
    } catch (e2) {
      head = "";
    }
  }
  var hasConfirm =
    /조회할\\s*자료가\\s*많아/.test(body) ||
    /오래\\s*걸릴\\s*수\\s*있습니다/.test(body);
  var hasResults =
    /품목코드/.test(head) ||
    /기초재고/.test(head) ||
    (/입고/.test(head) && /출고/.test(head));
  var stillSearchForm =
    /기준일자/.test(head) &&
    (/단가표시/.test(head) || /전월\\+금월/.test(head) || /창고/.test(head));
  var hasLedger = /재고\\s*수불부|재고수불부/.test(head) || /재고\\s*수불부|재고수불부/.test(body.slice(0, 200));
  var isDaily = /일별\\s*재고\\s*현황|일별재고현황/.test(head);
  return {
    hasMain: !!main,
    head: head,
    hasConfirm: hasConfirm,
    hasResults: hasResults,
    stillSearchForm: stillSearchForm,
    hasLedger: hasLedger,
    isDaily: isDaily
  };
})()`;

export async function clickLedgerSearch(page: Page): Promise<Frame> {
  console.log("   → 검색 실행 (F8 키)");

  console.log("   [진단] F8 직전 상태");
  logLedgerFrameList(page, "f8-pre");
  logLedgerContextPages(page, "f8-pre");
  const preDom = await readDomLedgerSearchScreen(page);
  console.log(
    `   [진단][f8-pre] url=${page.url().slice(0, 160)} urlPrg=${preDom.urlPrgId || "(none)"} hasMain=${!!preDom.hit?.hasMainPage} head=${JSON.stringify((preDom.hit?.head || "").slice(0, 80))}`
  );

  const frames = await findLedgerFrames(page);
  const focusFrame = frames[0] || page.mainFrame();

  const detachDialogProbe = attachLedgerNativeDialogProbe(page);
  try {
    // 1) frame 내부에서 input 포커스 + keyCode 119(F8) 디스패치 (버튼 DOM 탐색 없음)
    try {
      const dispatched = (await focusFrame.evaluate(DISPATCH_F8_JS)) as {
        focused: string;
        fired: number;
        jq: boolean;
      };
      console.log(
        `   [진단][f8-dispatch] focused=${JSON.stringify(dispatched.focused)} fired=${dispatched.fired} jq=${dispatched.jq}`
      );
    } catch (err) {
      console.log(
        `   [진단][f8-dispatch] evaluate 예외: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    // 2) Playwright 키보드 F8 (페이지 포커스 보조)
    await page.keyboard.press("F8");
    console.log("   ✓ F8 입력 (dispatch + keyboard)");
    await page.waitForTimeout(2000);
  } finally {
    detachDialogProbe();
  }

  // F8 직후 URL / hash / #mainPage / frame / 화면 텍스트 진단
  const url = page.url();
  const urlPrgId = parseUrlPrgId(url);
  let postState: {
    hasMain: boolean;
    head: string;
    hasConfirm: boolean;
    hasResults: boolean;
    stillSearchForm: boolean;
    hasLedger: boolean;
    isDaily: boolean;
  } = {
    hasMain: false,
    head: "",
    hasConfirm: false,
    hasResults: false,
    stillSearchForm: false,
    hasLedger: false,
    isDaily: false,
  };
  try {
    postState = (await focusFrame.evaluate(F8_POST_STATE_JS)) as typeof postState;
  } catch {
    try {
      postState = (await page.mainFrame().evaluate(F8_POST_STATE_JS)) as typeof postState;
    } catch {
      /* keep defaults */
    }
  }

  console.log(`   [진단][f8-post] url=${url.slice(0, 180)}`);
  console.log(
    `   [진단][f8-post] hash=${url.includes("#") ? url.slice(url.indexOf("#") + 1).slice(0, 120) : "(none)"} urlPrg=${urlPrgId || "(none)"}`
  );
  console.log(
    `   [진단][f8-post] hasMain=${postState.hasMain} hasLedger=${postState.hasLedger} stillSearchForm=${postState.stillSearchForm} hasConfirm=${postState.hasConfirm} hasResults=${postState.hasResults} isDaily=${postState.isDaily} head=${JSON.stringify(postState.head.slice(0, 100))}`
  );
  logLedgerFrameList(page, "f8-post");
  await logLedgerPostF8Diagnostics(page);
  await logLedgerResultDomProbe(page, "f8");

  const head = postState.head || "";

  // 잘못된 화면으로 이탈하면 즉시 실패
  if (
    urlPrgId === "E040206" ||
    urlPrgId === "C000650" ||
    postState.isDaily ||
    /일별\s*재고\s*현황|일별재고현황/.test(head)
  ) {
    throw new Error(
      `F8 직후 잘못된 화면 — urlPrg=${urlPrgId || "(none)"} head=${JSON.stringify(head.slice(0, 120))} ` +
        `(기대: 재고수불부 유지, urlPrg=${expectedLedgerPrgId()})`
    );
  }

  // 진단 단계: 검색 폼 그대로여도 ESC 타임라인 진단을 위해 진행 (경고만)
  if (postState.stillSearchForm && !postState.hasConfirm && !postState.hasResults) {
    console.warn(
      `   ⚠ F8 후에도 검색 폼 그대로(검색 미시작 가능) — ESC DOM 진단 계속 urlPrg=${urlPrgId || "(none)"} head=${JSON.stringify(head.slice(0, 100))}`
    );
  }

  // 재고수불부 컨텍스트 상실
  const stillLedger =
    postState.hasLedger ||
    postState.hasConfirm ||
    postState.hasResults ||
    urlPrgId === expectedLedgerPrgId();
  if (!stillLedger) {
    throw new Error(
      `F8 직후 재고수불부 화면 이탈 — urlPrg=${urlPrgId || "(none)"} head=${JSON.stringify(head.slice(0, 120))}`
    );
  }

  console.log(
    `   ✓ F8 후 재고수불부 컨텍스트 유지 (urlPrg=${urlPrgId || "(none)"} confirm=${postState.hasConfirm} results=${postState.hasResults} stillSearchForm=${postState.stillSearchForm})`
  );
  return focusFrame.isDetached() ? page.mainFrame() : focusFrame;
}

/**
 * 검색 직후 사람 UX와 동일하게 Escape 전송.
 * ESC 키 입력 자체는 변경하지 않음 — 직후 0.5/1/2/5초 DOM·frame·URL 진단만 추가.
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

  const detachEscEvents = attachLedgerEscEventProbes(page);
  try {
    await page.keyboard.press("Escape");
    console.log("   ✓ ESC 입력");

    // ESC 직후 타임라인만 관찰 (검색/ESC/결과대기 로직 변경 없음)
    const timeline: Array<{ waitMs: number; label: string; shot: string }> = [
      { waitMs: 500, label: "esc-500ms", shot: ESC_SHOT_BY_LABEL["esc-500ms"] },
      { waitMs: 500, label: "esc-1s", shot: ESC_SHOT_BY_LABEL["esc-1s"] },
      { waitMs: 1000, label: "esc-2s", shot: ESC_SHOT_BY_LABEL["esc-2s"] },
      { waitMs: 3000, label: "esc-5s", shot: ESC_SHOT_BY_LABEL["esc-5s"] },
    ];
    for (const step of timeline) {
      await page.waitForTimeout(step.waitMs);
      await logLedgerEscAfterSnapshot(page, step.label, step.shot);
    }
  } finally {
    detachEscEvents();
  }

  // 기존 팝업/frame 진단 스냅샷 유지
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
      const probe = await probeLedgerProgramContext(page);
      logLedgerProgramProbe(probe, `결과확인-${elapsed}s`);
      const folderPrg = ledgerOutputFolderPrgId();

      if (
        probe.hasRejectDailyStock ||
        probe.urlPrgId === "E040206" ||
        probe.urlPrgId === "C000650" ||
        probe.viewerPrgIds.includes("E040206")
      ) {
        throw new Error(
          `검색 결과가 재고수불부가 아님 (일별재고현황/메뉴 이탈 의심). ` +
            `urlPrg=${probe.urlPrgId || "(none)"} depth=${probe.urlDepth || "(none)"} ` +
            `viewerPrg=[${probe.viewerPrgIds.join(",")}] mainTitle=${JSON.stringify(probe.mainTitle)}`
        );
      }

      const hasLedgerTitle =
        probe.hasLedgerTitle || /재고\s*수불부|재고수불부/.test(probe.mainTitle);
      if (!hasLedgerTitle) {
        throw new Error(
          `Excel은 보이나 #mainPage 「재고수불부」 제목 미확인. ` +
            `urlPrg=${probe.urlPrgId || "(none)"} mainTitle=${JSON.stringify(probe.mainTitle)}`
        );
      }

      // 실제 UX: 검색 후에도 URL 셸 C000035 유지
      if (isLedgerOutputFolderUrl(probe.urlPrgId) || probe.urlPrgId === expectedLedgerPrgId()) {
        console.log(
          `   ✓ URL 셸 유지 urlPrg=${probe.urlPrgId || "(none)"} depth=${probe.urlDepth || "(none)"}`
        );
      } else if (probe.urlPrgId) {
        console.warn(
          `   ⚠ 결과 화면 urlPrg=${probe.urlPrgId} (기대 셸=${folderPrg}) — 제목은 재고수불부, 계속 진행`
        );
      }

      console.log(
        `   ✓ 재고수불부 결과 확인 (${elapsed}초) excelReady urlPrg=${probe.urlPrgId || "(none)"} depth=${probe.urlDepth || "(none)"} mainTitle=${JSON.stringify(probe.mainTitle.slice(0, 40))}`
      );
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

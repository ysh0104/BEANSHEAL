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
      const bodyText = ((await frame.locator("body").innerText().catch(() => "")) || "").replace(/\s+/g, " ");
      // 일별재고현황(E040206) 전용 화면은 ledger frame으로 취급하지 않음
      if (/일별\s*재고\s*현황/.test(bodyText) && !/재고\s*수불부/.test(bodyText)) continue;

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

      // 제목 「재고수불부」 또는 (헤더 + 검색) — 날짜/검색만으로는 일별재고현황과 혼동
      if (hasTitle || (hasHeader && hasSearch) || (hasTitle && (hasDate || hasSearch))) {
        frames.push(frame);
      }
    } catch {
      /* skip */
    }
  }
  return frames;
}

export function expectedLedgerPrgId(): string {
  return (process.env.ECOUNT_LEDGER_PRG_ID || "E040702").trim().toUpperCase();
}

/** 사이드바 메뉴 링크를 제외한 활성 viewer/program 컨텍스트 */
export type LedgerProgramProbe = {
  url: string;
  urlPrgId: string | null;
  activePrgIds: string[];
  viewerIds: string[];
  ecpageIds: string[];
  titleHints: string[];
  bodyHint: string;
  hasRejectDailyStock: boolean;
  hasLedgerTitle: boolean;
};

export async function probeLedgerProgramContext(page: Page): Promise<LedgerProgramProbe> {
  const url = page.url();
  let urlPrgId: string | null = null;
  try {
    const m = url.match(/prgId=([^&#]+)/i);
    urlPrgId = m ? decodeURIComponent(m[1]).toUpperCase() : null;
  } catch {
    urlPrgId = null;
  }

  const activePrgIds = new Set<string>();
  const viewerIds = new Set<string>();
  const ecpageIds = new Set<string>();
  const titleHints = new Set<string>();
  let bodyHint = "";
  let hasRejectDailyStock = false;
  let hasLedgerTitle = false;

  if (urlPrgId) activePrgIds.add(urlPrgId);

  for (const frame of page.frames()) {
    try {
      const data = await frame.evaluate(() => {
        const prg = new Set<string>();
        const viewers: string[] = [];
        const ecpages: string[] = [];
        const titles: string[] = [];

        const inSidebar = (el: Element) =>
          !!(
            el.closest(
              '#leftMenu, #menu, .left-menu, [id*="MENUTREE"], #nav, .lnb, [class*="side-menu"], [id*="tree"]'
            ) || (el.id && /^link_prg_/i.test(el.id))
          );

        const roots = Array.from(
          document.querySelectorAll(
            '[data-viewer-id], [data-ecpageid], [id*="script_target"], [id*="mainPage"], [class*="mainPage"], [class*="viewer"], #contents, .contents'
          )
        ).filter((el) => !inSidebar(el));

        const scanHtml = (html: string) => {
          const re = /PRG_ID["'\s:=]+([A-Z]\d{5,})/gi;
          let m: RegExpExecArray | null;
          while ((m = re.exec(html)) !== null) {
            prg.add(m[1].toUpperCase());
            if (prg.size >= 30) break;
          }
        };

        for (const root of roots) {
          const vid = root.getAttribute("data-viewer-id");
          if (vid) viewers.push(vid);
          const epid = root.getAttribute("data-ecpageid");
          if (epid) ecpages.push(epid);

          scanHtml(root.innerHTML || "");
          root.querySelectorAll('input[name="PRG_ID"], input[id*="PRG_ID"], [name*="PRG_ID"]').forEach((inp) => {
            const v = ((inp as HTMLInputElement).value || inp.getAttribute("value") || "").trim();
            if (v) prg.add(v.toUpperCase());
          });

          const t = ((root as HTMLElement).innerText || "").replace(/\s+/g, " ").trim().slice(0, 200);
          if (/재고\s*수불부/.test(t)) titles.push("재고수불부");
          if (/일별\s*재고\s*현황/.test(t)) titles.push("일별재고현황");
        }

        // main document fallback (still exclude pure sidebar-only matches)
        if (roots.length === 0 && document.body) {
          scanHtml(document.body.innerHTML.slice(0, 400000));
        }

        const body = (document.body?.innerText || "").replace(/\s+/g, " ").trim().slice(0, 240);
        return {
          prg: Array.from(prg),
          viewers,
          ecpages,
          titles,
          body,
        };
      });

      for (const id of data.prg) activePrgIds.add(id.toUpperCase());
      for (const v of data.viewers) viewerIds.add(v);
      for (const e of data.ecpages) ecpageIds.add(e);
      for (const t of data.titles) titleHints.add(t);
      if (data.body && data.body.length > bodyHint.length) bodyHint = data.body;
      if (data.titles.includes("일별재고현황") || /일별\s*재고\s*현황/.test(data.body)) {
        hasRejectDailyStock = true;
      }
      if (data.titles.includes("재고수불부") || /재고\s*수불부/.test(data.body)) {
        hasLedgerTitle = true;
      }
    } catch {
      /* cross-origin or detached */
    }
  }

  return {
    url,
    urlPrgId,
    activePrgIds: Array.from(activePrgIds),
    viewerIds: Array.from(viewerIds),
    ecpageIds: Array.from(ecpageIds),
    titleHints: Array.from(titleHints),
    bodyHint,
    hasRejectDailyStock,
    hasLedgerTitle,
  };
}

function logLedgerProgramProbe(probe: LedgerProgramProbe, label: string): void {
  console.log(
    `   [진단][program] ${label} urlPrg=${probe.urlPrgId || "(none)"} activePrg=[${probe.activePrgIds.join(",")}] viewers=[${probe.viewerIds.slice(0, 5).join(",")}] ecpage=[${probe.ecpageIds.slice(0, 5).join(",")}] titles=[${probe.titleHints.join(",")}]`
  );
  console.log(`   [진단][program] ${label} url=${probe.url.slice(0, 120)}`);
  if (probe.bodyHint) {
    console.log(`   [진단][program] ${label} bodyHint=${JSON.stringify(probe.bodyHint.slice(0, 180))}`);
  }
}

/** 활성 viewer에 기대 prgId(E040702)가 로드됐는지 — 사이드바 링크만으로는 true 되지 않음 */
export async function isExpectedLedgerProgramLoaded(page: Page): Promise<boolean> {
  const expected = expectedLedgerPrgId();
  const probe = await probeLedgerProgramContext(page);

  const hasExpected =
    probe.activePrgIds.includes(expected) ||
    probe.urlPrgId === expected ||
    probe.ecpageIds.some((id) => id.toUpperCase().includes(expected));

  // 일별재고현황(E040206)만 활성인 경우 절대 성공 아님
  if (probe.activePrgIds.includes("E040206") && !hasExpected) return false;
  if (probe.hasRejectDailyStock && !hasExpected) return false;
  if (!hasExpected) return false;

  // 기대 prg가 있어도 제목이 일별재고현황만이면 거부
  if (probe.titleHints.includes("일별재고현황") && !probe.titleHints.includes("재고수불부") && !probe.hasLedgerTitle) {
    return false;
  }

  return true;
}

async function hasLedgerSearchUi(page: Page): Promise<boolean> {
  for (const frame of await findLedgerFrames(page)) {
    try {
      const title = frame.getByText(/^재고\s*수불부$/).first();
      const search = frame.getByText(SEARCH_BTN).first();
      const date = frame.locator("text=기준일자").first();
      const hasTitle = (await title.count()) > 0 && (await title.isVisible());
      const hasSearch = (await search.count()) > 0 && (await search.isVisible());
      const hasDate = (await date.count()) > 0 && (await date.isVisible());
      if (hasTitle && (hasSearch || hasDate)) return true;
      if (hasTitle) return true;
    } catch {
      /* skip */
    }
  }
  return false;
}

/** 「재고수불부」 검색 조건 화면 — UI + 실제 program ID(E040702) 모두 필요 */
export async function isLedgerSearchScreen(page: Page): Promise<boolean> {
  if (!(await isExpectedLedgerProgramLoaded(page))) return false;
  return hasLedgerSearchUi(page);
}

/**
 * E040702 검색 화면 대기.
 * SPA로 E040206이 먼저 보이다가 교체될 수 있으므로 즉시 성공하지 않음.
 * 실패 시 false (호출측에서 throw + probe 로그 사용)
 */
export async function waitForLedgerSearchScreen(page: Page, maxSec = 25): Promise<boolean> {
  const expected = expectedLedgerPrgId();
  const steps = Math.ceil(maxSec / 2);
  for (let i = 0; i < steps; i++) {
    const elapsed = (i + 1) * 2;
    const probe = await probeLedgerProgramContext(page);
    logLedgerProgramProbe(probe, `+${elapsed}s`);

    if (probe.activePrgIds.includes("E040206") || probe.hasRejectDailyStock) {
      console.log(`   … 일별재고현황(E040206) 감지 — ${expected} 교체 대기 (${elapsed}초)`);
    }

    if (await isLedgerSearchScreen(page)) {
      console.log(`   ✓ 재고수불부 검색 화면 (${elapsed}초) prgId=${expected}`);
      return true;
    }
    await page.waitForTimeout(2000);
  }

  const finalProbe = await probeLedgerProgramContext(page);
  logLedgerProgramProbe(finalProbe, "timeout");
  console.warn(
    `   ⚠ ${expected} 검색 화면 미확인 (activePrg=[${finalProbe.activePrgIds.join(",")}] titles=[${finalProbe.titleHints.join(",")}])`
  );
  return false;
}

/** E040702 로드 필수 — 실패 시 Error + 진단 로그 */
export async function assertLedgerProgramSearchScreen(page: Page, maxSec = 25): Promise<void> {
  const expected = expectedLedgerPrgId();
  if (await waitForLedgerSearchScreen(page, maxSec)) return;

  const probe = await probeLedgerProgramContext(page);
  logLedgerProgramProbe(probe, "assert-fail");
  throw new Error(
    `재고수불부(${expected}) 화면 미로드 (${maxSec}초). ` +
      `urlPrg=${probe.urlPrgId || "(none)"} activePrg=[${probe.activePrgIds.join(",")}] ` +
      `viewers=[${probe.viewerIds.slice(0, 8).join(",")}] ecpage=[${probe.ecpageIds.slice(0, 8).join(",")}] ` +
      `titles=[${probe.titleHints.join(",")}] body=${JSON.stringify(probe.bodyHint.slice(0, 120))}`
  );
}

const PRODUCTION_TRANSFER_HINT = /생산\s*불출.*창고\s*이동.*포함|생산불출\s*\/\s*창고이동\s*포함/;
const ETC_DIAG_KEYWORDS = ["생산불출", "창고이동", "생산불출/창고이동포함", "포함"] as const;

function clipHtml(raw: string, max = 280): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, max);
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

/** 힌트 텍스트 근처에서 실제 checkbox locator 찾기 */
async function findProductionTransferCheckbox(frame: Frame): Promise<Locator | null> {
  const textNodes = frame.locator("label, span, td, div, a, p, li").filter({ hasText: PRODUCTION_TRANSFER_HINT });
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
        const byId = frame.locator(`input[type="checkbox"][id="${forId}"]`);
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
            // 같은 컨테이너 텍스트에 힌트가 있는 checkbox 우선
            for (const b of boxes) {
              const row = b.closest("tr, li, label, div") || b.parentElement;
              const t = (row?.textContent || "").replace(/\s+/g, " ");
              if (matchHint(t)) return b;
            }
            return boxes[0];
          }
          node = node.parentElement;
        }
        // label[for]
        const id = (el as HTMLElement).closest("label")?.getAttribute("for");
        if (id) {
          const byId = el.ownerDocument.getElementById(id);
          if (byId && byId instanceof HTMLInputElement && byId.type === "checkbox") return byId;
        }
        return null;
      });
      const element = handle.asElement();
      if (element) {
        // convert ElementHandle to Locator via evaluate id/name
        const meta = await element.evaluate((el: HTMLInputElement) => ({
          id: el.id,
          name: el.name,
          value: el.value,
        }));
        await handle.dispose().catch(() => {});
        if (meta.id) {
          const loc = frame.locator(`input[type="checkbox"]#${meta.id}`);
          if ((await loc.count()) > 0) return loc.first();
        }
        if (meta.name) {
          const loc = frame.locator(`input[type="checkbox"][name="${meta.name}"]`);
          if ((await loc.count()) > 0) {
            // name이 여러 개면 value로 좁힘
            if (meta.value) {
              const byVal = frame.locator(
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

  // 5) frame 전체 checkbox 중 nearText가 힌트와 일치
  try {
    const boxes = frame.locator('input[type="checkbox"]');
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

  // 탭 전환 후 DOM 반영 — 전체 frame 진단 (findLedgerFrames 필터 없음)
  await page.waitForTimeout(500);
  try {
    await diagnoseLedgerEtcTabDom(page);
  } catch (err) {
    console.log(
      `   [진단][기타] diagnoseLedgerEtcTabDom 예외: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // 탐색/클릭은 page 전체 frame 대상 (ledger frame 필터만 쓰면 기타 패널 iframe을 놓칠 수 있음)
  const searchFrames = page.frames();
  console.log(`   [진단][기타] checkbox 탐색 대상 frame count=${searchFrames.length}`);

  let sawHintText = false;
  for (const frame of searchFrames) {
    try {
      const hint = frame.getByText(PRODUCTION_TRANSFER_HINT).first();
      if ((await hint.count()) > 0) {
        sawHintText = true;
        break;
      }
    } catch {
      /* next */
    }
  }

  for (const frame of searchFrames) {
    const cb = await findProductionTransferCheckbox(frame);
    if (!cb) continue;

    let alreadyChecked: boolean;
    try {
      alreadyChecked = await cb.isChecked();
    } catch (err) {
      await dumpLedgerEtcCheckboxes(searchFrames);
      try {
        await diagnoseLedgerEtcTabDom(page);
      } catch {
        /* already diagnosed */
      }
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
      await dumpLedgerEtcCheckboxes(searchFrames);
      try {
        await diagnoseLedgerEtcTabDom(page);
      } catch {
        /* ignore */
      }
      throw new Error(
        `생산불출/창고이동포함 checkbox 재확인 실패: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
    if (!verified) {
      await dumpLedgerEtcCheckboxes(searchFrames);
      try {
        await diagnoseLedgerEtcTabDom(page);
      } catch {
        /* ignore */
      }
      throw new Error("생산불출/창고이동포함 checkbox가 체크되지 않았습니다.");
    }
    return;
  }

  await dumpLedgerEtcCheckboxes(searchFrames);
  try {
    await diagnoseLedgerEtcTabDom(page);
  } catch {
    /* ignore */
  }
  if (!sawHintText) {
    throw new Error(
      '「생산불출/창고이동포함」 텍스트/label을 찾지 못했습니다. (기타 탭 frame DOM 진단 로그 참고)'
    );
  }
  throw new Error(
    "「생산불출/창고이동포함」 checkbox를 찾지 못했습니다. (기타 탭 frame DOM 진단 로그 참고)"
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

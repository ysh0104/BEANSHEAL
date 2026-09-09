/**
 * 재고수불부 네비게이션
 *
 * 실제 사용자 동선:
 *   재고 I → 출력물 CLICK → 재고수불부 CLICK (#link_depth4_MENUTREE_000215, href*=E040702)
 *   → (임시: 「기타」/생산불출 스킵) → 검색 버튼 클릭 → ESC → 결과 대기 → Excel
 *
 * DOM 확정:
 *   - 출력물 URL 셸: C000035 (leaf 선택에 사용하지 않음)
 *   - 재고수불부 leaf: #link_depth4_MENUTREE_000215 / prgId=E040702 / depth=4
 *
 * stock cascade(재고현황)와 동일 메뉴 패턴을 ledger에서 복제 구현.
 * stock 파일은 수정하지 않음.
 */
import type { Frame, Locator, Page } from "playwright";
import {
  applyMenuHashFromSaved,
  parseStockMenuUrl,
  resolveErpNavigationTarget,
  stripPrgIdFromMenuUrl,
} from "../src/lib/ecountStockMenuUrl";
import { gotoEcountPage } from "./ecountErpGoto";
import { dismissEcountPopups } from "./ecountNavigateStock";
import {
  assertLedgerProgramSearchScreen,
  clickLedgerSearch,
  expectedLedgerPrgId,
  isLedgerExcelReady,
  isLedgerSearchScreen,
  ledgerOutputFolderPrgId,
  pressLedgerEscapeAfterSearch,
  waitForLedgerResults,
} from "./ecountLedgerScreen";

function ledgerPrgId(): string {
  // 재고수불부 leaf href prgId (DOM 확정: E040702)
  return process.env.ECOUNT_LEDGER_PRG_ID?.trim() || "E040702";
}

async function clickInAnyFrame(page: Page, selector: string): Promise<boolean> {
  for (const frame of page.frames()) {
    const loc = frame.locator(selector).first();
    try {
      if ((await loc.count()) > 0 && (await loc.isVisible())) {
        await loc.click();
        return true;
      }
    } catch {
      /* skip */
    }
  }
  return false;
}

function resolveMenuUrl(opts: LedgerNavOptions): string {
  return (
    opts.ledger_menu_url ||
    opts.stock_menu_url ||
    process.env.ECOUNT_LEDGER_MENU_URL ||
    process.env.ECOUNT_STOCK_MENU_URL ||
    ""
  ).trim();
}

/** stock cascade와 동일: exact/regex로 visible 메뉴 locator 탐색 */
async function findVisibleMenuLocator(
  page: Page,
  patterns: RegExp[],
  opts?: { exactTexts?: string[]; timeoutMs?: number }
): Promise<{ loc: Locator; frame: Frame } | null> {
  const timeoutMs = opts?.timeoutMs ?? 8000;
  const exactTexts = opts?.exactTexts ?? [];
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    for (const frame of page.frames()) {
      for (const text of exactTexts) {
        const loc = frame.getByText(text, { exact: true }).first();
        try {
          if ((await loc.count()) > 0 && (await loc.isVisible())) {
            return { loc, frame };
          }
        } catch {
          /* next */
        }
      }
      for (const pattern of patterns) {
        const loc = frame.locator("a, span, li, div, button, td").filter({ hasText: pattern }).first();
        try {
          if ((await loc.count()) > 0 && (await loc.isVisible())) {
            return { loc, frame };
          }
        } catch {
          /* next */
        }
      }
    }
    await page.waitForTimeout(300);
  }
  return null;
}

async function waitVisibleMenu(
  page: Page,
  patterns: RegExp[],
  exactTexts: string[],
  label: string,
  timeoutMs: number
): Promise<{ loc: Locator; frame: Frame }> {
  const found = await findVisibleMenuLocator(page, patterns, { exactTexts, timeoutMs });
  if (!found) {
    throw new Error(`[LEDGER NAV] ${label} visible 대기 실패 (${timeoutMs}ms)`);
  }
  return found;
}

/** 재고 I 열기: click 우선, 실패 시 hover — 출력물이 보이면 성공 (stock과 동일 패턴) */
export async function openInventoryTopMenuForLedger(page: Page): Promise<void> {
  console.log("   → [LEDGER NAV] 재고 I 메뉴 열기");

  const top = await findVisibleMenuLocator(
    page,
    [/^재고\s*I$/, /^재고\s*Ⅰ$/, /^재고\s*\(1\)$/, /재고\s*I/, /재고\s*Ⅰ/],
    { exactTexts: ["재고 I", "재고 Ⅰ", "재고I", "재고Ⅰ", "재고 (1)", "재고(1)"], timeoutMs: 12000 }
  );

  const target =
    top ||
    (await findVisibleMenuLocator(page, [/^재고\s*I/, /^재고\s*Ⅰ/, /재고\s*\(1\)/], { timeoutMs: 5000 }));

  if (!target) {
    const idSelectors = [
      "#link_depth1_MENUTREE_000004",
      "#link_depth1_MENUTREE_000782",
      "#link_depth1_MENUTREE_000783",
    ];
    for (const sel of idSelectors) {
      if (await clickInAnyFrame(page, sel)) {
        console.log(`   ✓ 재고 I (id ${sel})`);
        await page.waitForTimeout(800);
        return;
      }
    }
    throw new Error("[LEDGER NAV] 재고 I 메뉴를 찾지 못했습니다.");
  }

  try {
    await target.loc.scrollIntoViewIfNeeded().catch(() => {});
    await target.loc.click({ force: true });
    console.log("   ✓ 재고 I 클릭");
  } catch (e) {
    console.warn(`   ⚠ 재고 I 클릭 실패: ${e instanceof Error ? e.message : e}`);
  }

  let outputVisible = await findVisibleMenuLocator(page, [/^출력물$/], {
    exactTexts: ["출력물"],
    timeoutMs: 2500,
  });

  if (!outputVisible) {
    console.log("   → 재고 I click 후 출력물 미표시 → hover 재시도");
    try {
      await target.loc.hover({ force: true });
      await page.waitForTimeout(600);
    } catch {
      /* skip */
    }
    outputVisible = await findVisibleMenuLocator(page, [/^출력물$/], {
      exactTexts: ["출력물"],
      timeoutMs: 4000,
    });
  }

  if (!outputVisible) {
    throw new Error("[LEDGER NAV] 재고 I 열기 후 출력물 메뉴가 나타나지 않았습니다.");
  }
  console.log("   ✓ 출력물 메뉴 표시 확인");
}

/**
 * 출력물 화면 왼쪽 트리: 「재고현황」 그룹이 접혀 있으면 펼침
 */
export async function ensureStockStatusGroupExpanded(page: Page): Promise<void> {
  console.log("   → [LEDGER NAV] 재고현황 그룹 확인");
  const deadline = Date.now() + 10000;
  let sawGroup = false;

  while (Date.now() < deadline) {
    for (const frame of page.frames()) {
      const groups = frame.locator("a, span, li, div, button, td, label").filter({ hasText: /^재고\s*현황$/ });
      const n = Math.min(await groups.count(), 20);
      for (let i = 0; i < n; i++) {
        const el = groups.nth(i);
        try {
          if (!(await el.isVisible())) continue;
          const text = ((await el.innerText().catch(() => "")) || "").replace(/\s+/g, " ").trim();
          if (text !== "재고현황" && text !== "재고 현황") continue;
          sawGroup = true;

          // 이미 leaf 「재고수불부」가 보이면 그룹은 펼쳐진 상태
          const leafVisible = await frame
            .locator("a")
            .filter({ hasText: /^재고\s*수불부$/ })
            .first()
            .isVisible()
            .catch(() => false);
          if (leafVisible) {
            console.log("   ✓ [LEDGER NAV] 재고현황 그룹 이미 펼쳐짐");
            return;
          }

          await el.scrollIntoViewIfNeeded().catch(() => {});
          await el.click({ force: true });
          console.log("   ✓ [LEDGER NAV] 재고현황 그룹 펼침");
          await page.waitForTimeout(500);
          return;
        } catch {
          /* next */
        }
      }
    }
    await page.waitForTimeout(300);
  }

  if (!sawGroup) {
    console.warn("   ⚠ [LEDGER NAV] 재고현황 그룹 미확인 — leaf 직접 탐색 계속");
  }
}

function isExactLedgerLeafText(raw: string): boolean {
  const t = raw.replace(/\s+/g, " ").trim();
  return t === "재고수불부" || t === "재고 수불부";
}

async function isClickableLedgerLeaf(loc: Locator): Promise<boolean> {
  try {
    if (!(await loc.isVisible())) return false;
    const box = await loc.boundingBox();
    if (!box || box.width < 2 || box.height < 2) return false;
    return true;
  } catch {
    return false;
  }
}

/** DOM 확정: 실제 재고수불부 leaf (진단 결과) */
const LEDGER_LEAF_DEPTH4_ID = "link_depth4_MENUTREE_000215";

function extractHashParam(raw: string, key: string): string {
  try {
    const hash = raw.includes("#") ? raw.slice(raw.indexOf("#") + 1) : raw.replace(/^[?#]/, "");
    return new URLSearchParams(hash).get(key) || "";
  } catch {
    const m = raw.match(new RegExp(`[?&#]${key}=([^&#]*)`, "i"));
    return m ? decodeURIComponent(m[1]) : "";
  }
}

async function readLedgerLeafMeta(loc: Locator): Promise<{ id: string; href: string; text: string }> {
  // Playwright ElementHandle evaluate에 TS helper가 섞이지 않도록 속성 API 우선
  const id = ((await loc.getAttribute("id").catch(() => "")) || "").trim();
  const href = ((await loc.getAttribute("href").catch(() => "")) || "").trim();
  const text = ((await loc.innerText().catch(() => "")) || "").replace(/\s+/g, " ").trim();
  return { id, href, text };
}

function isConfirmedLedgerLeaf(meta: { id: string; href: string; text: string }, leafPrg: string): boolean {
  if (!isExactLedgerLeafText(meta.text)) return false;
  if (!meta.href.includes(leafPrg)) return false;
  return true;
}

/** 클릭 직후 URL/hash/frame/#mainPage 진단 (selector 추측 전환 금지) */
async function logLedgerPostLeafClickState(page: Page, label: string): Promise<void> {
  const url = page.url();
  let urlPrg = "";
  let urlDepth = "";
  let urlMenuSeq = "";
  try {
    const hash = url.includes("#") ? url.slice(url.indexOf("#") + 1) : "";
    const params = new URLSearchParams(hash);
    urlPrg = (params.get("prgId") || "").toUpperCase();
    urlDepth = params.get("depth") || "";
    urlMenuSeq = params.get("menuSeq") || "";
  } catch {
    urlPrg = extractHashParam(url, "prgId").toUpperCase();
    urlDepth = extractHashParam(url, "depth");
    urlMenuSeq = extractHashParam(url, "menuSeq");
  }

  console.log(
    JSON.stringify({
      type: "ledger_post_leaf_click",
      label,
      url: url.slice(0, 220),
      urlPrg,
      urlDepth,
      urlMenuSeq,
      frameCount: page.frames().length,
    })
  );

  const frames = page.frames();
  for (let i = 0; i < Math.min(frames.length, 8); i++) {
    const frame = frames[i];
    let mainMeta: { hasMain: boolean; head: string; title: string } = {
      hasMain: false,
      head: "",
      title: "",
    };
    try {
      // 순수 JS 문자열 — __name helper 주입 방지
      mainMeta = (await frame.evaluate(`(function () {
        var main = document.querySelector("#mainPage");
        if (!main) return { hasMain: false, head: "", title: "" };
        var head = String(main.innerText || "").replace(/\\s+/g, " ").trim().slice(0, 120);
        var titleEl = main.querySelector(".wrapper-title, .wrapper-toolbar .pull-left, .page-title, h1, h2");
        var title = titleEl
          ? String(titleEl.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 80)
          : "";
        return { hasMain: true, head: head, title: title };
      })()`)) as typeof mainMeta;
    } catch (err) {
      console.log(
        JSON.stringify({
          type: "ledger_post_leaf_frame_error",
          frameIndex: i,
          error: err instanceof Error ? err.message : String(err),
        })
      );
      continue;
    }
    console.log(
      JSON.stringify({
        type: "ledger_post_leaf_frame",
        label,
        frameIndex: i,
        frameName: frame.name(),
        frameUrl: frame.url().slice(0, 160),
        hasMainPage: mainMeta.hasMain,
        mainTitle: mainMeta.title,
        mainHead: mainMeta.head,
      })
    );
  }
}

/**
 * 실제 DOM 확정 leaf 탐색.
 * 1순위: #link_depth4_MENUTREE_000215 (text=재고수불부, href*=E040702)
 * C000035 anchor 탐색 없음 (C000035는 출력물 URL 셸).
 */
async function findLedgerSidebarLeaf(
  page: Page
): Promise<{ loc: Locator; how: string; meta: { id: string; href: string; text: string } } | null> {
  const leafPrg = ledgerPrgId();
  console.log(
    `   → [LEDGER NAV] 재고수불부 leaf 탐색 (확정 DOM: #${LEDGER_LEAF_DEPTH4_ID}, href*=${leafPrg})`
  );

  const selectors = [
    `#${LEDGER_LEAF_DEPTH4_ID}`,
    `#link_prg_${leafPrg}`,
    `a[href*="${leafPrg}"]`,
  ];

  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) {
    for (const frame of page.frames()) {
      for (const sel of selectors) {
        try {
          const candidates = frame.locator(sel);
          const n = Math.min(await candidates.count(), 8);
          for (let i = 0; i < n; i++) {
            const loc = candidates.nth(i);
            if (!(await isClickableLedgerLeaf(loc))) continue;
            const meta = await readLedgerLeafMeta(loc);
            if (!isConfirmedLedgerLeaf(meta, leafPrg)) {
              console.log(
                `   [진단][leaf] skip ${sel} text=${JSON.stringify(meta.text)} href=${JSON.stringify(meta.href.slice(0, 120))}`
              );
              continue;
            }
            const how = `${sel} id=${meta.id || "(none)"}`;
            return { loc, how, meta };
          }
        } catch {
          /* next */
        }
      }
    }
    await page.waitForTimeout(300);
  }

  return null;
}

/**
 * cascade: 재고 I → 출력물 CLICK → (재고현황 그룹) → 재고수불부 leaf CLICK
 * leaf DOM 확정: #link_depth4_MENUTREE_000215 (href*=E040702)
 * C000035는 출력물 URL 셸 — leaf 선택에 사용하지 않음
 */
async function openLedgerViaCascadeMenu(page: Page): Promise<boolean> {
  await dismissEcountPopups(page);

  if (await isLedgerSearchScreen(page)) {
    console.log(
      `   ✓ 재고수불부 검색 화면 이미 열림 (leafPrg=${expectedLedgerPrgId()}, URL 셸 참고=${ledgerOutputFolderPrgId()})`
    );
    return true;
  }
  if (await isLedgerExcelReady(page)) {
    console.log("   ✓ 재고수불부 결과 화면 이미 열림");
    return true;
  }

  await openInventoryTopMenuForLedger(page);

  console.log("   → [LEDGER NAV] 출력물 클릭");
  const outputMenu = await waitVisibleMenu(page, [/^출력물$/], ["출력물"], "출력물", 10000);
  await outputMenu.loc.scrollIntoViewIfNeeded().catch(() => {});
  await outputMenu.loc.click({ force: true });
  console.log("   ✓ 출력물 클릭");
  await page.waitForTimeout(800);

  await ensureStockStatusGroupExpanded(page);

  const leaf = await findLedgerSidebarLeaf(page);
  if (!leaf) {
    console.warn(
      `   ⚠ [LEDGER NAV] 확정 leaf #${LEDGER_LEAF_DEPTH4_ID} (text=재고수불부, href*=${ledgerPrgId()}) 미발견`
    );
    return false;
  }

  await leaf.loc.scrollIntoViewIfNeeded().catch(() => {});
  if (!(await isClickableLedgerLeaf(leaf.loc))) {
    console.warn(`   ⚠ [LEDGER NAV] 재고수불부 leaf 클릭 불가: ${leaf.how}`);
    return false;
  }

  console.log(
    JSON.stringify({
      type: "ledger_leaf_click_pre",
      how: leaf.how,
      id: leaf.meta.id,
      href: leaf.meta.href,
      innerText: leaf.meta.text,
      prgId: extractHashParam(leaf.meta.href, "prgId"),
      menuSeq: extractHashParam(leaf.meta.href, "menuSeq"),
      depth: extractHashParam(leaf.meta.href, "depth"),
    })
  );
  console.log(`   ✓ [LEDGER NAV] 재고수불부 leaf 선택: ${leaf.how}`);
  console.log(
    `   [진단][leaf] 클릭 전 id=${leaf.meta.id} text=${JSON.stringify(leaf.meta.text)} href=${JSON.stringify(leaf.meta.href)}`
  );

  const urlBefore = page.url();
  await leaf.loc.click({ force: true });
  console.log("   ✓ 재고수불부 클릭");
  await page.waitForTimeout(1500);
  await dismissEcountPopups(page);
  await logLedgerPostLeafClickState(page, "click+1.5s");
  console.log(
    JSON.stringify({
      type: "ledger_leaf_click_url_delta",
      before: urlBefore.slice(0, 180),
      after: page.url().slice(0, 180),
    })
  );

  try {
    await assertLedgerProgramSearchScreen(page, 25);
  } catch (err) {
    // leaf는 확정 DOM으로 클릭함 — selector 추측 전환 금지, 로딩/viewer 진단만
    console.warn(
      `   ⚠ 확정 leaf 클릭 후에도 검색 화면 미확인 — leaf 선택이 아니라 로딩/viewer 문제 가능`
    );
    await logLedgerPostLeafClickState(page, "assert-fail");
    throw err;
  }

  console.log(
    `   ✓ 재고수불부 검색 화면 진입 (cascade) leaf=#${LEDGER_LEAF_DEPTH4_ID} leafPrg=${expectedLedgerPrgId()}`
  );
  return true;
}

async function gotoOutputFolderViaHash(page: Page, menuUrl: string): Promise<boolean> {
  const folderUrl = stripPrgIdFromMenuUrl(menuUrl);
  const target = applyMenuHashFromSaved(page.url(), folderUrl);
  if (!target) return false;
  await gotoEcountPage(page, target, "출력물 폴더");
  return true;
}

async function clickMenuIdsFromUrl(page: Page, savedUrl: string): Promise<boolean> {
  const parsed = parseStockMenuUrl(savedUrl);
  if (!parsed) return false;
  const selectors = [parsed.depth1Selector, parsed.depth2Selector].filter(Boolean) as string[];
  if (selectors.length === 0) return false;

  console.log(`   → 메뉴 ID 클릭(폴백): ${selectors.join(" → ")}`);
  for (const sel of selectors) {
    if (!(await clickInAnyFrame(page, sel))) {
      console.warn(`   ⚠ 클릭 실패: ${sel}`);
      return false;
    }
    await page.waitForTimeout(1500);
  }
  return true;
}

/** cascade 실패 시에만: 출력물 폴더 후 확정 leaf 재클릭 */
async function openLedgerReportProgram(page: Page): Promise<boolean> {
  if (await isLedgerSearchScreen(page)) {
    console.log("   ✓ 재고수불부 검색 조건 화면");
    return true;
  }
  if (await isLedgerExcelReady(page)) {
    console.log("   ✓ 재고수불부 결과 화면");
    return true;
  }

  const leafPrg = ledgerPrgId();
  console.log(
    `   → 「재고수불부」 열기 폴백 (확정 DOM #${LEDGER_LEAF_DEPTH4_ID}, href*=${leafPrg})`
  );

  const leaf = await findLedgerSidebarLeaf(page);
  if (!leaf) {
    console.warn(`   ⚠ 폴백에서도 확정 leaf #${LEDGER_LEAF_DEPTH4_ID} 미발견`);
    return false;
  }

  console.log(
    JSON.stringify({
      type: "ledger_leaf_click_pre_fallback",
      how: leaf.how,
      id: leaf.meta.id,
      href: leaf.meta.href,
      innerText: leaf.meta.text,
    })
  );
  await leaf.loc.scrollIntoViewIfNeeded().catch(() => {});
  await leaf.loc.click({ force: true });
  console.log(`   ✓ 폴백 leaf 클릭: ${leaf.how}`);
  await page.waitForTimeout(3000);
  await dismissEcountPopups(page);
  await logLedgerPostLeafClickState(page, "fallback-click+3s");

  try {
    await assertLedgerProgramSearchScreen(page, 12);
    return true;
  } catch (err) {
    console.warn(
      `   ⚠ 확정 leaf 폴백 클릭 후에도 viewer 미확인 — selector 변경 없이 로딩 진단만 남김: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    await logLedgerPostLeafClickState(page, "fallback-assert-fail");
    return false;
  }
}

async function openLedgerViaSavedUrlFallback(page: Page, menuUrl: string): Promise<boolean> {
  console.log("   → [LEDGER NAV] cascade 실패 — URL/폴더 폴백 시도");
  const parsed = parseStockMenuUrl(menuUrl);
  console.log(`   → 저장된 URL (정규화): ${(parsed?.normalized || menuUrl).slice(0, 90)}...`);

  let opened =
    (await gotoOutputFolderViaHash(page, menuUrl)) || (await clickMenuIdsFromUrl(page, menuUrl));

  if (!opened && parsed?.normalized) {
    const direct = resolveErpNavigationTarget(page.url(), stripPrgIdFromMenuUrl(parsed.normalized));
    if (direct) {
      await gotoEcountPage(page, direct, "출력물 폴더(직접)");
      opened = true;
    }
  }

  if (!opened) return false;

  await dismissEcountPopups(page);
  return openLedgerReportProgram(page);
}

async function openLedgerSearchScreen(page: Page, menuUrl: string): Promise<void> {
  if (await isLedgerSearchScreen(page)) {
    console.log("   ✓ 재고수불부 검색 화면 이미 열림");
    return;
  }
  if (await isLedgerExcelReady(page)) {
    console.log("   ✓ 재고수불부 결과 화면 이미 열림");
    return;
  }

  console.log("   → [LEDGER NAV] cascade: 재고 I → 출력물 → 재고수불부");
  let opened = false;
  try {
    opened = await openLedgerViaCascadeMenu(page);
  } catch (e) {
    console.warn(`   ⚠ cascade 실패: ${e instanceof Error ? e.message : e}`);
  }

  if (!opened && menuUrl) {
    opened = await openLedgerViaSavedUrlFallback(page, menuUrl);
  }

  if (!opened && !menuUrl) {
    console.log("   → 메뉴 URL 없음 — depth id 폴백...");
    await clickInAnyFrame(page, "#link_depth1_MENUTREE_000004");
    await page.waitForTimeout(1500);
    await clickInAnyFrame(page, "#link_depth2_MENUTREE_000035");
    await page.waitForTimeout(1500);
    await dismissEcountPopups(page);
    opened = await openLedgerReportProgram(page);
  }

  if (!opened) {
    throw new Error(
      "재고수불부 검색 화면 진입 실패. cascade(재고 I→출력물→재고수불부) 및 URL 폴백을 확인하세요."
    );
  }
}

export type LedgerNavOptions = {
  stock_menu_url?: string | null;
  ledger_menu_url?: string | null;
  stock_menu_depth1?: string | null;
  stock_menu_depth2?: string | null;
  period_from: string;
  period_to: string;
  prod_cd?: string;
  prod_nm?: string;
  results_wait_sec?: number;
};

export async function runLedgerSearch(page: Page, opts: LedgerNavOptions) {
  const menuUrl = resolveMenuUrl(opts);

  console.log("   → 재고수불부 검색 화면 진입...");
  await openLedgerSearchScreen(page, menuUrl);

  // 재고수불부 검색 화면 재확인 — 통과 전에는 검색 진입 금지
  await assertLedgerProgramSearchScreen(page, 25);
  console.log(
    `   ✓ 재고수불부 검색 화면 확인 (leaf=#${LEDGER_LEAF_DEPTH4_ID}, leafPrg=${expectedLedgerPrgId()}) — 「기타」/생산불출 스킵, 바로 검색`
  );

  console.log("   → 기간: Ecount 기본값(전월+금월) 유지");
  // 임시 테스트: 「기타」 탭 / 「생산불출/창고이동포함」 체크 완전 제외
  // (기본 검색 → ESC → 결과 → Excel → parser 연결 확인용)
  console.log(
    "   ⏭ 「기타」 탭·생산불출/창고이동포함 체크 스킵 (임시) — 기본 검색/다운로드만 검증"
  );

  if (opts.prod_cd?.trim()) {
    console.log(`   → 품목코드: ${opts.prod_cd} (미구현 — 전체 조회)`);
  }

  console.log("   [진단] clickLedgerSearch 직전 (navigate)");
  console.log(
    `   [진단] navigate page.url=${page.url()} frames=${page.frames().length} contextPages=${page.context().pages().length}`
  );

  // 사람 UX: 검색 버튼 클릭 → ESC (F8 폴백·취소 클릭 사용 안 함)
  const searchFrame = await clickLedgerSearch(page);
  await page.waitForTimeout(800);
  await pressLedgerEscapeAfterSearch(page, searchFrame);

  console.log("   [진단] 검색+ESC 직후 (navigate)");
  console.log(
    `   [진단] navigate page.url=${page.url()} frames=${page.frames().length} contextPages=${page.context().pages().length}`
  );

  const waitSec = opts.results_wait_sec ?? (opts.prod_cd ? 120 : 600);
  console.log("   → 검색 결과 대기");
  if (!(await waitForLedgerResults(page, waitSec))) {
    console.warn(`   ⚠ 결과 ${waitSec}초 내 미확인 — 다운로드 시도 예정`);
  }
}

export async function navigateToLedgerReport(page: Page, opts: LedgerNavOptions) {
  console.log("2. 재고수불부 화면 이동...");
  await dismissEcountPopups(page);

  const menuUrl = resolveMenuUrl(opts);
  if (!menuUrl) {
    console.warn("   ⚠ 메뉴 URL 없음 — cascade 우선, 실패 시 depth 폴백");
  } else {
    console.log(`   → 메뉴 URL(폴백용): ${menuUrl.slice(0, 90)}...`);
  }

  await runLedgerSearch(page, opts);
}

export async function runLedgerSearchAfterNavigate(page: Page, opts: LedgerNavOptions) {
  await dismissEcountPopups(page);
  // 취소 클릭 경로 사용하지 않음 — 검색→ESC 재실행
  await runLedgerSearch(page, opts);
}

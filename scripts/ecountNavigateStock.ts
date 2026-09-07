/**
 * 재고현황 네비게이션
 *
 * 실제 메뉴 동선 (확인됨):
 *   재고 I (click|hover) → 출력물 표시 → 출력물 CLICK → 재고현황 표시 → 재고현황 CLICK → report
 *
 * 출력물에 hover 하지 않음. 재고현황은 출력물 클릭 이후에만 탐색.
 * C000650 등 prgId는 DOM에서 발견된 경우에만 로그 (하드코딩 금지).
 */
import * as fs from "fs";
import * as path from "path";
import type { Frame, Locator, Page } from "playwright";
import { parseStockMenuUrl, applyMenuHashFromSaved, resolveErpNavigationTarget } from "../src/lib/ecountStockMenuUrl";
import { isStockResultsReady, isStockSearchForm } from "./ecountExcel";
import { gotoEcountPage } from "./ecountErpGoto";

const DOWNLOAD_DIR = path.join(process.cwd(), "downloads");

type DomAttrInfo = {
  tag: string;
  id: string;
  className: string;
  href: string;
  onclick: string;
  text: string;
  outer: string;
  prgId: string;
  menuSeq: string;
};

function ensureDownloadDir() {
  if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
}

async function saveStockScreenshot(page: Page, name: string) {
  ensureDownloadDir();
  const file = path.join(DOWNLOAD_DIR, name);
  await page.screenshot({ path: file, fullPage: true }).catch(() => {});
  console.log(`   📸 ${file}`);
}

function redactUrl(raw: string): string {
  try {
    const u = new URL(raw);
    if (u.searchParams.has("ec_req_sid")) u.searchParams.set("ec_req_sid", "***");
    return u.toString().slice(0, 180);
  } catch {
    return raw.replace(/ec_req_sid=[^&#]*/gi, "ec_req_sid=***").slice(0, 180);
  }
}

function extractPrgId(...parts: string[]): string {
  for (const p of parts) {
    const m =
      p.match(/prgId[=:]?\s*([A-Za-z0-9_]+)/i) ||
      p.match(/link_prg_([A-Za-z0-9_]+)/i) ||
      p.match(/\b(C\d{5,}|E\d{5,})\b/);
    if (m?.[1]) return m[1];
  }
  return "";
}

function extractMenuSeq(...parts: string[]): string {
  for (const p of parts) {
    const m = p.match(/menuSeq[=:]?\s*(MENUTREE_\d+)/i) || p.match(/#(link_depth2_)?(MENUTREE_\d+)/i);
    if (m) return m[2] || m[1] || "";
  }
  return "";
}

async function logFrameList(page: Page, label: string) {
  const frames = page.frames();
  console.log(`[STOCK DEBUG] ${label}`);
  console.log(`url=${redactUrl(page.url())}`);
  console.log(`frames=${frames.length}`);
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    let name = "";
    try {
      name = f.name() || "";
    } catch {
      name = "";
    }
    let furl = "";
    try {
      furl = f.url();
    } catch {
      furl = "(unavailable)";
    }
    console.log(`[STOCK DEBUG] frame list index=${i} name=${name || "(none)"} url=${redactUrl(furl)}`);
  }
}

async function describeLocator(loc: Locator): Promise<DomAttrInfo | null> {
  try {
    const info = await loc.evaluate((node) => {
      const html = node as HTMLElement;
      return {
        tag: html.tagName.toLowerCase(),
        id: html.id || "",
        className: String(html.className || "").slice(0, 160),
        href: (html as HTMLAnchorElement).href || html.getAttribute("href") || "",
        onclick: html.getAttribute("onclick") || "",
        text: ((html.innerText || html.textContent || "").replace(/\s+/g, " ").trim()).slice(0, 60),
        outer: html.outerHTML.slice(0, 600),
      };
    });
    return {
      ...info,
      prgId: extractPrgId(info.id, info.href, info.onclick, info.outer),
      menuSeq: extractMenuSeq(info.id, info.href, info.onclick, info.outer),
    };
  } catch {
    return null;
  }
}

function logElementDebug(label: string, desc: DomAttrInfo | null) {
  if (!desc) {
    console.log(`[STOCK DEBUG] ${label}: (describe failed)`);
    return;
  }
  console.log(
    `[STOCK DEBUG] ${label}: tag=${desc.tag} id=${desc.id || "(none)"} class=${desc.className || "(none)"} href=${(desc.href || "(none)").slice(0, 140)} onclick=${(desc.onclick || "(none)").slice(0, 140)} prgId=${desc.prgId || "(none)"} menuSeq=${desc.menuSeq || "(none)"} text=${desc.text || "(none)"}`
  );
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

async function clickTextInAnyFrame(page: Page, pattern: RegExp | string): Promise<boolean> {
  for (const frame of page.frames()) {
    const loc = frame.locator("a, span, li, div, button").filter({ hasText: pattern }).first();
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

type SearchBtnProbe = {
  frameIndex: number;
  frameName: string;
  frameUrl: string;
  tag: string;
  id: string;
  className: string;
  text: string;
  aria: string;
  title: string;
  onclick: string;
  visible: boolean;
  enabled: boolean;
  box: { x: number; y: number; width: number; height: number } | null;
};

function frameMeta(page: Page, frame: Frame): { index: number; name: string; url: string } {
  const frames = page.frames();
  const index = frames.indexOf(frame);
  let name = "";
  try {
    name = frame.name() || "";
  } catch {
    name = "";
  }
  let url = "";
  try {
    url = frame.url();
  } catch {
    url = "(unavailable)";
  }
  return { index, name, url };
}

/** DOM evaluate로 재고현황 검색 화면 여부 (★ 재고현황 / 기준일자 / 검색(F8)) */
async function frameLooksLikeStockSearch(frame: Frame): Promise<boolean> {
  try {
    return await frame.evaluate(() => {
      const bodyText = (document.body?.innerText || "").replace(/\s+/g, " ");
      if (/재고\s*수불부/.test(bodyText) && !/재고\s*현황/.test(bodyText)) return false;
      const hasStockTitle = /재고\s*현황/.test(bodyText);
      const hasDate = bodyText.includes("기준일자");
      const hasSearch = /검색\s*\(\s*F8\s*\)/i.test(bodyText);
      return (hasStockTitle && (hasDate || hasSearch)) || (hasDate && hasSearch);
    });
  } catch {
    return false;
  }
}

/** 검색 결과: 품목코드 + 품목명 + 재고수량 (검색 폼의 '품목'만으로는 부족) */
async function frameLooksLikeStockResults(frame: Frame): Promise<boolean> {
  try {
    return await frame.evaluate(() => {
      const bodyText = (document.body?.innerText || "").replace(/\s+/g, " ");
      if (/재고\s*수불부/.test(bodyText) && !/품목코드/.test(bodyText)) return false;
      return bodyText.includes("품목코드") && bodyText.includes("품목명") && bodyText.includes("재고수량");
    });
  } catch {
    return false;
  }
}

async function findStockReportFrames(page: Page): Promise<Frame[]> {
  const out: Frame[] = [];
  for (const frame of page.frames()) {
    if ((await frameLooksLikeStockResults(frame)) || (await frameLooksLikeStockSearch(frame))) {
      out.push(frame);
    }
  }
  return out;
}

async function waitForStockScreen(page: Page, maxSec = 30): Promise<"search" | "results" | null> {
  const steps = Math.ceil(maxSec / 2);
  for (let i = 0; i < steps; i++) {
    for (const frame of page.frames()) {
      if (await frameLooksLikeStockResults(frame)) return "results";
    }
    for (const frame of page.frames()) {
      if (await frameLooksLikeStockSearch(frame)) return "search";
    }
    if (await isStockResultsReady(page)) return "results";
    if (await isStockSearchForm(page)) return "search";
    await page.waitForTimeout(2000);
  }
  return null;
}

async function logAllFramesDebug(page: Page) {
  const frames = page.frames();
  console.log(`[STOCK SEARCH DEBUG]`);
  console.log(`frame count=${frames.length}`);
  for (let i = 0; i < frames.length; i++) {
    const meta = frameMeta(page, frames[i]);
    console.log(`[STOCK SEARCH DEBUG] index=${i} name=${meta.name || "(none)"} url=${redactUrl(meta.url)}`);
  }
}

/** 각 frame에서 검색(F8) 후보를 DOM으로 수집 */
async function probeSearchButtonsInFrame(
  page: Page,
  frame: Frame
): Promise<SearchBtnProbe[]> {
  const meta = frameMeta(page, frame);
  try {
    const raw = await frame.evaluate(() => {
      const nodes = Array.from(
        document.querySelectorAll("button, a, span, div, li, input, label, td, [role='button']")
      );
      const out: Array<{
        tag: string;
        id: string;
        className: string;
        text: string;
        aria: string;
        title: string;
        onclick: string;
        visible: boolean;
        enabled: boolean;
        box: { x: number; y: number; width: number; height: number } | null;
      }> = [];

      for (const node of nodes) {
        const html = node as HTMLElement;
        const text = (html.innerText || html.textContent || "").replace(/\s+/g, " ").trim();
        if (!/검색\s*\(\s*F8\s*\)/i.test(text)) continue;
        // 너무 큰 컨테이너는 스킵 (버튼 자체만)
        if (text.length > 40) continue;

        const style = window.getComputedStyle(html);
        const rect = html.getBoundingClientRect();
        const visible =
          style.visibility !== "hidden" &&
          style.display !== "none" &&
          rect.width > 1 &&
          rect.height > 1;
        const enabled = !(html as HTMLButtonElement).disabled && html.getAttribute("aria-disabled") !== "true";

        out.push({
          tag: html.tagName.toLowerCase(),
          id: html.id || "",
          className: String(html.className || "").slice(0, 160),
          text: text.slice(0, 40),
          aria: html.getAttribute("aria-label") || "",
          title: html.getAttribute("title") || "",
          onclick: (html.getAttribute("onclick") || "").slice(0, 160),
          visible,
          enabled,
          box: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        });
      }
      return out.slice(0, 15);
    });

    return raw.map((r) => ({
      frameIndex: meta.index,
      frameName: meta.name,
      frameUrl: meta.url,
      ...r,
    }));
  } catch {
    return [];
  }
}

async function dumpSearchRelatedVisible(page: Page) {
  console.log("[STOCK SEARCH DEBUG] 검색(F8) 관련 visible 후보 (실패 진단)");
  for (const frame of page.frames()) {
    const probes = await probeSearchButtonsInFrame(page, frame);
    for (const p of probes) {
      console.log(
        `[STOCK SEARCH DEBUG] tag=${p.tag} id=${p.id || "(none)"} class=${p.className || "(none)"} text=${p.text} aria=${p.aria || "(none)"} title=${p.title || "(none)"} onclick=${p.onclick || "(none)"} frameIndex=${p.frameIndex}`
      );
    }
  }
}

async function findBestSearchButton(
  page: Page
): Promise<{ frame: Frame; locator: Locator; probe: SearchBtnProbe } | null> {
  for (const frame of page.frames()) {
    if (!(await frameLooksLikeStockSearch(frame)) && !(await frameLooksLikeStockResults(frame))) {
      // report frame이 아니어도 검색 버튼 텍스트가 있으면 후보로 둠
      const any = await probeSearchButtonsInFrame(page, frame);
      if (any.length === 0) continue;
    }

    const probes = await probeSearchButtonsInFrame(page, frame);
    const preferred = probes.find((p) => p.visible && p.enabled && p.box && /검색\s*\(\s*F8\s*\)/i.test(p.text));
    const fallback = probes.find((p) => p.visible && p.box);
    const probe = preferred || fallback;
    if (!probe) continue;

    // 실제 locator: id 우선, 없으면 텍스트 버튼
    let locator: Locator | null = null;
    if (probe.id) {
      const safeId = probe.id.replace(/([ !"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, "\\$1");
      locator = frame.locator(`#${safeId}`).first();
    }
    if (!locator || (await locator.count()) === 0) {
      locator = frame
        .locator("button, a, span, div[role='button'], input[type='button'], [role='button']")
        .filter({ hasText: /검색\s*\(\s*F8\s*\)/i })
        .first();
    }

    try {
      if ((await locator.count()) === 0) continue;
      return { frame, locator, probe };
    } catch {
      continue;
    }
  }
  return null;
}

function isExactMenuText(text: string, keywords: string[]): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  return keywords.some((k) => t === k || t === k.replace(/\s/g, ""));
}

/**
 * 메뉴 텍스트로 visible locator 찾기.
 * exactOnly=true 이면 짧은 exact 매칭만 (출력물/재고현황 cascade용).
 */
async function findVisibleMenuLocator(
  page: Page,
  patterns: RegExp[],
  opts: { exactTexts?: string[]; timeoutMs?: number } = {}
): Promise<{ loc: Locator; desc: DomAttrInfo | null } | null> {
  const timeoutMs = opts.timeoutMs ?? 8000;
  const started = Date.now();
  const selectors = "a, span, li, div, button, td, label";

  while (Date.now() - started < timeoutMs) {
    for (const frame of page.frames()) {
      for (const pattern of patterns) {
        try {
          const nodes = frame.locator(selectors).filter({ hasText: pattern });
          const n = Math.min(await nodes.count(), 30);
          for (let i = 0; i < n; i++) {
            const el = nodes.nth(i);
            try {
              if (!(await el.isVisible())) continue;
              const desc = await describeLocator(el);
              if (!desc) continue;
              if (opts.exactTexts && opts.exactTexts.length > 0) {
                if (!isExactMenuText(desc.text, opts.exactTexts)) continue;
              }
              return { loc: el, desc };
            } catch {
              /* next */
            }
          }
        } catch {
          /* next pattern/frame */
        }
      }
    }
    await page.waitForTimeout(400);
  }
  return null;
}

async function waitVisibleMenu(
  page: Page,
  patterns: RegExp[],
  exactTexts: string[],
  label: string,
  timeoutMs = 10000
): Promise<{ loc: Locator; desc: DomAttrInfo | null }> {
  const found = await findVisibleMenuLocator(page, patterns, { exactTexts, timeoutMs });
  if (!found) {
    await logFrameList(page, `${label} 미표시`);
    throw new Error(`[STOCK NAV] ${label} visible 대기 실패 (${timeoutMs}ms)`);
  }
  return found;
}

/** 재고 I 열기: click 우선, 실패 시 hover — 출력물이 보이면 성공 */
async function openInventoryTopMenu(page: Page): Promise<void> {
  console.log("[STOCK NAV] 재고 I 메뉴 열기");
  await logFrameList(page, "before 재고 I");

  const top = await findVisibleMenuLocator(
    page,
    [/^재고\s*I$/, /^재고\s*Ⅰ$/, /^재고\s*\(1\)$/, /재고\s*I/, /재고\s*Ⅰ/],
    { exactTexts: ["재고 I", "재고 Ⅰ", "재고I", "재고Ⅰ", "재고 (1)", "재고(1)"], timeoutMs: 12000 }
  );

  // exact 실패 시 느슨한 매칭 (상단 depth1)
  const target =
    top ||
    (await findVisibleMenuLocator(page, [/^재고\s*I/, /^재고\s*Ⅰ/, /재고\s*\(1\)/], { timeoutMs: 5000 }));

  if (!target) {
    // 알려진 depth1 id 폴백 (텍스트 미매칭 시)
    const idSelectors = [
      "#link_depth1_MENUTREE_000004",
      "#link_depth1_MENUTREE_000782",
      "#link_depth1_MENUTREE_000783",
    ];
    for (const sel of idSelectors) {
      for (const frame of page.frames()) {
        const loc = frame.locator(sel).first();
        try {
          if ((await loc.count()) > 0 && (await loc.isVisible())) {
            const desc = await describeLocator(loc);
            logElementDebug("재고 I candidate (id)", desc);
            await loc.click({ force: true });
            console.log(`[STOCK DEBUG] 재고 I opened via click selector=${sel}`);
            await page.waitForTimeout(800);
            return;
          }
        } catch {
          /* next */
        }
      }
    }
    await saveStockScreenshot(page, "stock-nav-no-inventory-i.png");
    throw new Error("[STOCK NAV] 재고 I 메뉴 element를 찾지 못했습니다.");
  }

  logElementDebug("재고 I element", target.desc);

  // 1) click 시도
  try {
    await target.loc.scrollIntoViewIfNeeded().catch(() => {});
    await target.loc.click({ force: true });
    console.log("[STOCK DEBUG] 재고 I action=click");
  } catch (e) {
    console.warn(`[STOCK DEBUG] 재고 I click 실패: ${e instanceof Error ? e.message : e}`);
  }

  // 출력물이 바로 보이는지 짧게 확인
  let outputVisible = await findVisibleMenuLocator(page, [/^출력물$/], {
    exactTexts: ["출력물"],
    timeoutMs: 2500,
  });

  if (!outputVisible) {
    // 2) hover 재시도
    console.log("[STOCK DEBUG] 재고 I click 후 출력물 미표시 → hover 재시도");
    try {
      await target.loc.hover({ force: true });
      console.log("[STOCK DEBUG] 재고 I action=hover");
      await page.waitForTimeout(600);
    } catch (e) {
      console.warn(`[STOCK DEBUG] 재고 I hover 실패: ${e instanceof Error ? e.message : e}`);
    }
    outputVisible = await findVisibleMenuLocator(page, [/^출력물$/], {
      exactTexts: ["출력물"],
      timeoutMs: 4000,
    });
  }

  if (!outputVisible) {
    await saveStockScreenshot(page, "stock-nav-no-output-after-inventory-i.png");
    await logFrameList(page, "재고 I 열기 후 출력물 미표시");
    throw new Error("[STOCK NAV] 재고 I 열기 후 출력물 메뉴가 나타나지 않았습니다.");
  }

  // 여기서는 표시만 확인 — 클릭은 다음 단계에서
  logElementDebug("출력물 (after 재고 I open)", outputVisible.desc);
}

/**
 * cascade: 재고 I → 출력물 CLICK → 재고현황 CLICK → report
 * 재고현황은 출력물 클릭 이후에만 탐색한다.
 */
async function openStockViaCascadeMenu(page: Page): Promise<boolean> {
  await dismissEcountPopups(page);

  // 이미 report면 성공
  const already = await waitForStockScreen(page, 2);
  if (already) {
    console.log(`[STOCK NAV] 재고현황 report 진입 확인 (already ${already})`);
    await logFrameList(page, "already on report");
    return true;
  }

  await openInventoryTopMenu(page);

  console.log("[STOCK NAV] 출력물 메뉴 표시 확인");
  const outputMenu = await waitVisibleMenu(page, [/^출력물$/], ["출력물"], "출력물", 10000);
  logElementDebug("출력물 element", outputMenu.desc);
  await logFrameList(page, "출력물 visible");

  console.log("[STOCK NAV] 출력물 클릭");
  // IMPORTANT: 출력물은 hover가 아니라 CLICK
  await outputMenu.loc.scrollIntoViewIfNeeded().catch(() => {});
  await outputMenu.loc.click({ force: true });
  console.log("[STOCK DEBUG] 출력물 action=click (hover 금지)");
  await page.waitForTimeout(800);
  await saveStockScreenshot(page, "stock-nav-after-output-click.png");
  await logFrameList(page, "after 출력물 click");

  // 재고현황은 출력물 클릭 이후에만 찾음 (처음부터 DOM 탐색 금지)
  console.log("[STOCK NAV] 재고현황 메뉴 표시 확인");
  const stockMenu = await waitVisibleMenu(
    page,
    [/^재고\s*현황$/, /^재고현황$/],
    ["재고현황", "재고 현황"],
    "재고현황",
    12000
  );
  logElementDebug("재고현황 element (post 출력물 click)", stockMenu.desc);
  if (stockMenu.desc?.prgId) {
    console.log(`[STOCK DEBUG] DOM에서 확인한 stock prgId=${stockMenu.desc.prgId}`);
  } else {
    console.log("[STOCK DEBUG] 재고현황 element에서 prgId 미발견 (추정값 사용 안 함)");
  }
  await logFrameList(page, "재고현황 visible");

  console.log("[STOCK NAV] 재고현황 클릭");
  const beforeFrames = page.frames().length;
  await stockMenu.loc.scrollIntoViewIfNeeded().catch(() => {});
  await stockMenu.loc.click({ force: true });
  logElementDebug("재고현황 clicked", stockMenu.desc);
  await page.waitForTimeout(1000);

  // frame 변화 관찰
  const started = Date.now();
  let last = beforeFrames;
  while (Date.now() - started < 6000) {
    const now = page.frames().length;
    if (now !== last) {
      console.log(`[STOCK DEBUG] frame count changed ${last} → ${now} (+${Date.now() - started}ms)`);
      last = now;
      await logFrameList(page, "after 재고현황 click (frame change)");
    }
    await page.waitForTimeout(400);
  }

  await saveStockScreenshot(page, "stock-nav-after-stock-click.png");
  await logFrameList(page, "after 재고현황 click");

  // DOM evaluate 기반 감지 (★ 재고현황 / 검색(F8) — Playwright text locator 실패 대비)
  const screen = await waitForStockScreen(page, 25);
  const searchBtnReady = (await findBestSearchButton(page)) !== null;
  const urlHasReport =
    /depth=3/i.test(page.url()) &&
    !!stockMenu.desc?.prgId &&
    page.url().includes(`prgId=${stockMenu.desc.prgId}`);

  if (screen || searchBtnReady || urlHasReport) {
    console.log("[STOCK NAV] 재고현황 report 진입 확인");
    console.log(`[STOCK DEBUG] report kind=${screen || (searchBtnReady ? "search-btn" : "url-prgId")}`);
    console.log(`prgId=${stockMenu.desc?.prgId || "(from-dom-none)"}`);
    console.log(`url=${redactUrl(page.url())}`);
    const reportFrames = await findStockReportFrames(page);
    console.log(`[STOCK DEBUG] report frames=${reportFrames.length}`);
    for (let i = 0; i < reportFrames.length; i++) {
      try {
        console.log(`[STOCK DEBUG] report frame[${i}] url=${redactUrl(reportFrames[i].url())}`);
      } catch {
        /* skip */
      }
    }
    return true;
  }

  await saveStockScreenshot(page, "stock-nav-report-not-opened.png");
  console.warn("[STOCK NAV] 재고현황 click 후 report iframe 미확인");
  return false;
}

/** 레거시: 저장된 URL/hash 폴더 진입 (cascade 실패 시만) */
async function openStockViaSavedUrl(page: Page, menuUrl: string): Promise<boolean> {
  console.log("[STOCK DEBUG] cascade 실패 — saved URL 폴백 시도");
  const parsed = parseStockMenuUrl(menuUrl);
  console.log(`   → 저장된 URL (정규화): ${(parsed?.normalized || menuUrl).slice(0, 90)}...`);

  let opened =
    (await gotoStockViaHash(page, menuUrl)) || (await clickMenuIdsFromUrl(page, menuUrl));

  if (!opened && parsed?.normalized && !parsed.normalized.includes("ec_req_sid")) {
    const direct = resolveErpNavigationTarget(page.url(), parsed.normalized) || parsed.normalized;
    await gotoEcountPage(page, direct, "정규화 URL 직접 이동");
    opened = true;
  }
  if (!opened) return false;

  await dismissEcountPopups(page);
  await logFrameList(page, "after saved URL (folder)");

  // URL 폴더 도착 후 — 본문에서 재고현황 카드만 시도 (처음부터 사이드바 탐색 금지에 가깝게)
  for (const frame of page.frames()) {
    try {
      const contentLinks = frame
        .locator('#contents a, .contents a, [class*="content"] a, [class*="program"] a, main a')
        .filter({ hasText: /^재고\s*현황$/ });
      const n = await contentLinks.count();
      for (let i = 0; i < n; i++) {
        const card = contentLinks.nth(i);
        if (!(await card.isVisible())) continue;
        const desc = await describeLocator(card);
        logElementDebug(`URL fallback content card ${i + 1}/${n}`, desc);
        await card.click({ force: true });
        const screen = await waitForStockScreen(page, 12);
        if (screen) {
          console.log("[STOCK NAV] 재고현황 report 진입 확인 (URL fallback)");
          return true;
        }
      }
    } catch {
      /* skip */
    }
  }
  return false;
}

/**
 * 재고현황 report frame에서 실제 「검색(F8)」 버튼 element 클릭.
 * page.keyboard.press("F8") / frame F8 fallback 사용 금지.
 */
async function clickSearchButton(page: Page): Promise<boolean> {
  console.log("[STOCK] 검색(F8) 실행 시작");
  await logAllFramesDebug(page);

  let found = await findBestSearchButton(page);
  if (!found) {
    // report frame 로딩 대기 후 재시도
    for (let i = 0; i < 10 && !found; i++) {
      await page.waitForTimeout(1000);
      found = await findBestSearchButton(page);
    }
  }

  if (!found) {
    await dumpSearchRelatedVisible(page);
    await saveStockScreenshot(page, "stock-search-failed.png");
    throw new Error("[STOCK] 재고현황 report frame에서 검색(F8) 버튼을 찾지 못했습니다.");
  }

  const { frame, locator, probe } = found;
  console.log("[STOCK SEARCH DEBUG]");
  console.log(`tag=${probe.tag}`);
  console.log(`id=${probe.id || "(none)"}`);
  console.log(`class=${probe.className || "(none)"}`);
  console.log(`text=${probe.text}`);
  console.log(`aria=${probe.aria || "(none)"}`);
  console.log(`title=${probe.title || "(none)"}`);
  console.log(`onclick=${probe.onclick || "(none)"}`);
  console.log(`[STOCK SEARCH DEBUG] frame index=${probe.frameIndex}`);
  console.log(`[STOCK SEARCH DEBUG] frame name=${probe.frameName || "(none)"}`);
  console.log(`[STOCK SEARCH DEBUG] frame URL=${redactUrl(probe.frameUrl)}`);

  console.log("[STOCK] 검색(F8) 버튼 발견");

  const visible = await locator.isVisible().catch(() => probe.visible);
  const enabled = await locator.isEnabled().catch(() => probe.enabled);
  const box = (await locator.boundingBox().catch(() => null)) || probe.box;
  if (!visible) {
    await saveStockScreenshot(page, "stock-search-failed.png");
    throw new Error("[STOCK] 검색(F8) 버튼이 visible 이 아닙니다.");
  }
  if (!enabled) {
    await saveStockScreenshot(page, "stock-search-failed.png");
    throw new Error("[STOCK] 검색(F8) 버튼이 enabled 가 아닙니다.");
  }
  if (!box || box.width < 1 || box.height < 1) {
    await saveStockScreenshot(page, "stock-search-failed.png");
    throw new Error("[STOCK] 검색(F8) 버튼 boundingBox 없음.");
  }

  const urlBefore = page.url();
  console.log("[STOCK] 검색(F8) 클릭 시작");
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  try {
    await locator.click({ timeout: 10000 });
  } catch {
    // 드롭다운 화살표가 붙은 split button — 왼쪽(텍스트) 영역 클릭
    await locator.click({
      force: true,
      position: { x: Math.max(8, Math.min(40, box.width * 0.3)), y: box.height / 2 },
    });
  }
  console.log("[STOCK] 검색(F8) 클릭 완료");
  console.log("[STOCK] 검색(F8) 실행 완료");
  console.log(`[STOCK SEARCH DEBUG] click frame index=${probe.frameIndex} name=${probe.frameName || "(none)"}`);
  void frame;
  console.log(`[STOCK SEARCH DEBUG] url before=${redactUrl(urlBefore)}`);
  console.log(`[STOCK SEARCH DEBUG] url after=${redactUrl(page.url())}`);
  return true;
}

async function waitForStockSearchResults(page: Page, maxSec = 90): Promise<Frame | null> {
  const steps = Math.ceil(maxSec / 2);
  for (let i = 0; i < steps; i++) {
    for (const frame of page.frames()) {
      if (await frameLooksLikeStockResults(frame)) return frame;
    }
    // 보조: ecountExcel 결과 감지 (품목코드+재고수량)
    if (await isStockResultsReady(page)) {
      const frames = await findStockReportFrames(page);
      return frames[0] || page.mainFrame();
    }
    await page.waitForTimeout(2000);
  }
  return null;
}

async function runStockSearch(page: Page) {
  // 이미 결과면 성공
  const already = await waitForStockSearchResults(page, 2);
  if (already) {
    const meta = frameMeta(page, already);
    console.log("[STOCK] 검색 결과 화면 감지 완료 (검색 생략)");
    console.log(`[STOCK] 결과 frame=${meta.index} name=${meta.name || "(none)"}`);
    console.log(`[STOCK] 결과 URL=${redactUrl(meta.url)}`);
    return;
  }

  const urlBefore = page.url();
  await clickSearchButton(page);
  console.log("3. 검색 결과 로딩 대기...");

  const resultFrame = await waitForStockSearchResults(page, 90);
  if (resultFrame) {
    const meta = frameMeta(page, resultFrame);
    console.log("[STOCK] 검색 결과 화면 감지 완료");
    console.log(`[STOCK] 결과 frame=${meta.index} name=${meta.name || "(none)"}`);
    console.log(`[STOCK] 결과 URL=${redactUrl(meta.url)}`);
    return;
  }

  console.log(`[STOCK SEARCH DEBUG] 클릭 전 URL=${redactUrl(urlBefore)}`);
  console.log(`[STOCK SEARCH DEBUG] 클릭 후 URL=${redactUrl(page.url())}`);
  await logAllFramesDebug(page);
  await dumpSearchRelatedVisible(page);
  await saveStockScreenshot(page, "stock-search-failed.png");
  throw new Error("[STOCK] 검색 결과 화면 미확인 (품목코드/품목명/재고수량 영역 없음)");
}

export async function dismissEcountPopups(page: Page) {
  await page.keyboard.press("Escape").catch(() => {});

  for (const frame of page.frames()) {
    try {
      const redesign = frame.locator("text=/조회품목을 재지정|품목개수가 많을 경우/").first();
      if ((await redesign.count()) > 0 && (await redesign.isVisible())) {
        return;
      }
    } catch {
      /* skip */
    }
  }

  for (const pattern of [/확인/, /닫기/, /오늘 하루/, /close/i]) {
    await clickTextInAnyFrame(page, pattern);
    await page.waitForTimeout(400);
  }
}

export type StockNavOptions = {
  stock_menu_url?: string | null;
  stock_menu_depth1?: string | null;
  stock_menu_depth2?: string | null;
};

async function gotoStockViaHash(page: Page, savedUrl: string): Promise<boolean> {
  const target = applyMenuHashFromSaved(page.url(), savedUrl);
  if (!target) return false;
  await gotoEcountPage(page, target, "ERP hash 네비게이션");
  return true;
}

async function clickMenuIdsFromUrl(page: Page, savedUrl: string): Promise<boolean> {
  const parsed = parseStockMenuUrl(savedUrl);
  if (!parsed) return false;

  const selectors = [parsed.depth1Selector, parsed.depth2Selector].filter(Boolean) as string[];
  if (selectors.length === 0) return false;

  console.log(`   → 메뉴 ID 클릭: ${selectors.join(" → ")}`);
  for (const sel of selectors) {
    if (!(await clickInAnyFrame(page, sel))) {
      console.warn(`   ⚠ 클릭 실패: ${sel}`);
      return false;
    }
    await page.waitForTimeout(2000);
  }
  return true;
}

function isEntryOnly(): boolean {
  return (process.env.ECOUNT_STOCK_ENTRY_ONLY || "").trim() === "1";
}

function isSearchOnly(): boolean {
  return (process.env.ECOUNT_STOCK_SEARCH_ONLY || "").trim() === "1";
}

/** 재고현황(엑셀 다운로드) 화면까지 이동 — cascade 메뉴 우선 */
export async function navigateToStockReport(page: Page, opts: StockNavOptions = {}) {
  console.log("2. 재고현황 화면 이동...");
  console.log("[STOCK] 재고현황 페이지 진입 시작 (cascade: 재고 I → 출력물 CLICK → 재고현황 CLICK)");
  await dismissEcountPopups(page);
  await logFrameList(page, "navigate start");

  // depth1/depth2 셀렉터가 명시되면 cascade 전에 사용 (관리자 설정)
  const d1 = opts.stock_menu_depth1 || process.env.ECOUNT_STOCK_MENU_DEPTH1;
  const d2 = opts.stock_menu_depth2 || process.env.ECOUNT_STOCK_MENU_DEPTH2;
  if (d1 && d2) {
    console.log(`[STOCK DEBUG] using configured depth selectors ${d1} → ${d2}`);
    if (!(await clickInAnyFrame(page, d1))) throw new Error(`메뉴 클릭 실패: ${d1}`);
    await page.waitForTimeout(2000);
    if (!(await clickInAnyFrame(page, d2))) throw new Error(`메뉴 클릭 실패: ${d2}`);
    await page.waitForTimeout(2000);
    const screen = await waitForStockScreen(page, 15);
    if (screen) {
      console.log("[STOCK NAV] 재고현황 report 진입 확인 (depth selectors)");
      if (isEntryOnly()) {
        console.log("🎯 Phase1-2 ENTRY_OK — 검색/Excel 생략 (ECOUNT_STOCK_ENTRY_ONLY=1)");
        return;
      }
      await runStockSearch(page);
      if (isSearchOnly()) {
        console.log("🎯 Phase1 SEARCH_OK — Excel/Supabase 생략 (ECOUNT_STOCK_SEARCH_ONLY=1)");
      }
      return;
    }
  }

  // PRIMARY: 실제 메뉴 cascade
  let opened = false;
  try {
    opened = await openStockViaCascadeMenu(page);
  } catch (e) {
    console.warn(`[STOCK NAV] cascade 실패: ${e instanceof Error ? e.message : e}`);
    await saveStockScreenshot(page, "stock-nav-cascade-failed.png");
  }

  // cascade가 false여도 이미 검색(F8) 버튼이 있으면 성공으로 간주 (URL 폴백으로 화면 파괴 금지)
  if (!opened && (await findBestSearchButton(page))) {
    console.log("[STOCK NAV] 재고현황 report 진입 확인 (검색 버튼 DOM)");
    opened = true;
  }

  // SECONDARY: saved URL (출력물 폴더) — cascade 실패 시에만
  if (!opened) {
    const menuUrl = (opts.stock_menu_url || process.env.ECOUNT_STOCK_MENU_URL || "").trim();
    if (menuUrl) {
      opened = await openStockViaSavedUrl(page, menuUrl);
    }
  }

  if (!opened) {
    await saveStockScreenshot(page, "stock-entry-failed.png");
    await logFrameList(page, "보고서 진입 실패");
    throw new Error(
      "재고현황 report 진입 실패. [STOCK NAV] 로그에서 재고 I → 출력물 CLICK → 재고현황 CLICK 단계를 확인하세요."
    );
  }

  if (isEntryOnly()) {
    console.log("🎯 Phase1-2 ENTRY_OK — 검색/Excel 생략 (ECOUNT_STOCK_ENTRY_ONLY=1)");
    return;
  }

  await runStockSearch(page);
  console.log(`   현재 URL: ${redactUrl(page.url())}`);

  if (isSearchOnly()) {
    console.log("🎯 Phase1 SEARCH_OK — Excel/Supabase 생략 (ECOUNT_STOCK_SEARCH_ONLY=1)");
  }
}

export async function runStockSearchAfterNavigate(page: Page) {
  await dismissEcountPopups(page);
  await runStockSearch(page);
}

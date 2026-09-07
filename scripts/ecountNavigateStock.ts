/**
 * 재고현황 네비게이션
 *
 * Phase1-2: 출력물 폴더에서 실제 「재고현황」 report program / iframe 식별이 목표.
 * C000650 등 prgId는 DOM에서 발견된 경우에만 사용 (하드코딩 금지).
 */
import * as fs from "fs";
import * as path from "path";
import type { Frame, Locator, Page } from "playwright";
import { parseStockMenuUrl, applyMenuHashFromSaved, resolveErpNavigationTarget } from "../src/lib/ecountStockMenuUrl";
import { isStockResultsReady, isStockSearchForm, waitForStockResultsReady } from "./ecountExcel";
import { gotoEcountPage } from "./ecountErpGoto";

const DOWNLOAD_DIR = path.join(process.cwd(), "downloads");

type StockElementInfo = {
  area: "sidebar" | "content" | "other";
  tag: string;
  id: string;
  className: string;
  href: string;
  onclick: string;
  text: string;
  prgId: string;
  menuSeq: string;
};

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

async function collectStockElements(page: Page): Promise<StockElementInfo[]> {
  const results: StockElementInfo[] = [];

  for (const frame of page.frames()) {
    try {
      const nodes = frame.locator("a, button, span, div, li, td").filter({ hasText: /재고\s*현황/ });
      const n = Math.min(await nodes.count(), 40);
      for (let i = 0; i < n; i++) {
        const el = nodes.nth(i);
        try {
          if (!(await el.isVisible())) continue;
          const info = await el.evaluate((node) => {
            const html = node as HTMLElement;
            const text = (html.innerText || html.textContent || "").replace(/\s+/g, " ").trim();
            if (text !== "재고현황" && !/^재고\s*현황$/.test(text)) {
              // 주변 카드/부모일 수 있음 — exact만 우선, 짧으면 허용
              if (text.length > 20 || !text.includes("재고현황")) return null;
            }
            return {
              tag: html.tagName.toLowerCase(),
              id: html.id || "",
              className: String(html.className || "").slice(0, 120),
              href: (html as HTMLAnchorElement).href || html.getAttribute("href") || "",
              onclick: html.getAttribute("onclick") || "",
              text: text.slice(0, 40),
              outer: html.outerHTML.slice(0, 500),
            };
          });
          if (!info) continue;

          const id = info.id;
          const href = info.href;
          const onclick = info.onclick;
          const area: StockElementInfo["area"] = /link_depth|sidebar|left|menu|tree/i.test(
            `${id} ${info.className} ${href}`
          )
            ? "sidebar"
            : /content|contents|program|card|main/i.test(`${id} ${info.className}`)
              ? "content"
              : "other";

          results.push({
            area,
            tag: info.tag,
            id,
            className: info.className,
            href,
            onclick,
            text: info.text,
            prgId: extractPrgId(id, href, onclick, info.outer),
            menuSeq: extractMenuSeq(id, href, onclick, info.outer),
          });
        } catch {
          /* next */
        }
      }
    } catch {
      /* next frame */
    }
  }

  return results;
}

async function dumpStockElements(page: Page): Promise<StockElementInfo[]> {
  const items = await collectStockElements(page);
  console.log(`[STOCK DEBUG] before stock click`);
  console.log(`visible stock elements=${items.length}`);
  for (const it of items) {
    console.log(
      `[STOCK DEBUG] 재고현황 element: area=${it.area} tag=${it.tag} id=${it.id || "(none)"} href=${(it.href || "(none)").slice(0, 100)} onclick=${(it.onclick || "(none)").slice(0, 100)} prgId=${it.prgId || "(none)"} menuSeq=${it.menuSeq || "(none)"} text=${it.text}`
    );
  }

  ensureDownloadDir();
  const htmlPath = path.join(DOWNLOAD_DIR, "stock-elements.html");
  const safe = items
    .map(
      (it, idx) =>
        `<!-- ${idx} area=${it.area} prgId=${it.prgId} -->\n` +
        `<div data-area="${it.area}" data-tag="${it.tag}" data-id="${it.id}" data-prgid="${it.prgId}">` +
        `${it.tag} id=${it.id} href=${it.href.slice(0, 200)} onclick=${it.onclick.slice(0, 200)} text=${it.text}` +
        `</div>`
    )
    .join("\n");
  fs.writeFileSync(htmlPath, `<!doctype html><meta charset="utf-8"><title>stock-elements</title>\n${safe}\n`, "utf8");
  console.log(`   📄 ${htmlPath}`);
  return items;
}

async function discoverStockPrgIdFromDom(page: Page, items: StockElementInfo[]): Promise<string | null> {
  const fromItems = items.map((i) => i.prgId).filter((p) => p && p !== "C000035");
  if (fromItems.length > 0) return fromItems[0];

  for (const frame of page.frames()) {
    try {
      const found = await frame.evaluate(() => {
        const nodes = Array.from(document.querySelectorAll("a, button, span, div, li"));
        for (const n of nodes) {
          const t = (n.textContent || "").replace(/\s+/g, " ").trim();
          if (t !== "재고현황") continue;
          const blob = `${n.id} ${(n as HTMLElement).getAttribute("href") || ""} ${(n as HTMLElement).getAttribute("onclick") || ""} ${n.outerHTML}`;
          const m = blob.match(/prgId[=:]?\s*([A-Za-z0-9_]+)/i) || blob.match(/link_prg_([A-Za-z0-9_]+)/i);
          if (m?.[1] && m[1] !== "C000035") return m[1];
        }
        return null;
      });
      if (found) return found;
    } catch {
      /* skip */
    }
  }
  return null;
}

async function waitForFrameChanges(page: Page, beforeCount: number, maxMs = 5000): Promise<void> {
  const started = Date.now();
  let last = beforeCount;
  while (Date.now() - started < maxMs) {
    const now = page.frames().length;
    if (now !== last) {
      console.log(`[STOCK DEBUG] frame count changed ${last} → ${now} (+${Date.now() - started}ms)`);
      await logFrameList(page, "after stock click (frame change)");
      last = now;
    }
    await page.waitForTimeout(500);
  }
}

/** 재고현황 검색/결과 iframe — 수불부 제목 제외 */
async function findStockReportFrames(page: Page): Promise<Frame[]> {
  const out: Frame[] = [];
  for (const frame of page.frames()) {
    try {
      const ledgerTitle = frame.getByText(/^재고\s*수불부$/).first();
      if ((await ledgerTitle.count()) > 0 && (await ledgerTitle.isVisible())) continue;

      const stockTitle = frame.getByText(/^재고현황$/).first();
      const dateLabel = frame.locator("text=기준일자").first();
      const searchBtn = frame.getByText(/검색\s*\(F8\)/i).first();
      const itemCode = frame.locator("text=품목코드").first();

      const hasTitle = (await stockTitle.count()) > 0 && (await stockTitle.isVisible());
      const hasDate = (await dateLabel.count()) > 0 && (await dateLabel.isVisible());
      const hasSearch = (await searchBtn.count()) > 0 && (await searchBtn.isVisible());
      const hasItem = (await itemCode.count()) > 0 && (await itemCode.isVisible());

      if ((hasTitle && (hasDate || hasSearch || hasItem)) || (hasDate && hasSearch) || (hasItem && hasSearch)) {
        out.push(frame);
      }
    } catch {
      /* skip */
    }
  }
  return out;
}

async function waitForStockScreen(page: Page, maxSec = 30): Promise<"search" | "results" | null> {
  const steps = Math.ceil(maxSec / 2);
  for (let i = 0; i < steps; i++) {
    if (await isStockResultsReady(page)) return "results";
    if (await isStockSearchForm(page)) return "search";
    // report frame 느슨한 감지 (제목+기준일자만)
    const frames = await findStockReportFrames(page);
    if (frames.length > 0) {
      if (await isStockResultsReady(page)) return "results";
      return "search";
    }
    await page.waitForTimeout(2000);
  }
  return null;
}

async function describeLocator(loc: Locator): Promise<StockElementInfo | null> {
  try {
    const info = await loc.evaluate((node) => {
      const html = node as HTMLElement;
      return {
        tag: html.tagName.toLowerCase(),
        id: html.id || "",
        className: String(html.className || "").slice(0, 120),
        href: (html as HTMLAnchorElement).href || html.getAttribute("href") || "",
        onclick: html.getAttribute("onclick") || "",
        text: ((html.innerText || html.textContent || "").replace(/\s+/g, " ").trim()).slice(0, 40),
        outer: html.outerHTML.slice(0, 500),
      };
    });
    return {
      area: "other",
      tag: info.tag,
      id: info.id,
      className: info.className,
      href: info.href,
      onclick: info.onclick,
      text: info.text,
      prgId: extractPrgId(info.id, info.href, info.onclick, info.outer),
      menuSeq: extractMenuSeq(info.id, info.href, info.onclick, info.outer),
    };
  } catch {
    return null;
  }
}

async function clickStockCandidate(
  page: Page,
  loc: Locator,
  label: string
): Promise<{ ok: boolean; prgId: string }> {
  const before = page.frames().length;
  const desc = await describeLocator(loc);
  console.log(`[STOCK DEBUG] clicked element label=${label}`);
  if (desc) {
    console.log(
      `[STOCK DEBUG] clicked element tag=${desc.tag} id=${desc.id || "(none)"} href=${(desc.href || "(none)").slice(0, 120)} onclick=${(desc.onclick || "(none)").slice(0, 120)} prgId=${desc.prgId || "(none)"}`
    );
  }

  await saveStockScreenshot(page, "stock-before-click.png");
  await loc.scrollIntoViewIfNeeded().catch(() => {});
  await loc.click({ force: true });
  await waitForFrameChanges(page, before, 5000);
  await saveStockScreenshot(page, "stock-after-click.png");
  await logFrameList(page, "after stock click");

  const screen = await waitForStockScreen(page, 12);
  if (screen) {
    const prg =
      desc?.prgId ||
      (() => {
        try {
          return new URLSearchParams((page.url().split("#")[1] || "")).get("prgId") || "";
        } catch {
          return "";
        }
      })();
    console.log(`[STOCK DEBUG] 재고현황 report 확인`);
    console.log(`prgId=${prg || "(unknown)"}`);
    console.log(`frameUrl=${redactUrl(page.url())}`);
    console.log(`frame detected=true (${screen})`);
    return { ok: true, prgId: prg };
  }
  return { ok: false, prgId: desc?.prgId || "" };
}

/** 출력물 메뉴판 → 실제 「재고현황」 보고서 열기 */
async function openStockReportProgram(page: Page, prgId?: string | null): Promise<boolean> {
  if (await isStockResultsReady(page)) {
    console.log("   ✓ 재고 결과 화면 준비됨");
    console.log(`[STOCK DEBUG] 재고현황 report 확인`);
    console.log(`prgId=${prgId || "(already-open)"}`);
    console.log(`frame detected=true (results)`);
    return true;
  }
  if (await isStockSearchForm(page)) {
    console.log("   ✓ 재고현황 검색 조건 화면 (검색 F8 필요)");
    console.log(`[STOCK DEBUG] 재고현황 report 확인`);
    console.log(`prgId=${prgId || "(already-open)"}`);
    console.log(`frame detected=true (search)`);
    return true;
  }

  console.log("   → 출력물 메뉴에서 「재고현황」 보고서 클릭...");
  await logFrameList(page, "after output folder");
  const items = await dumpStockElements(page);
  const discovered = (await discoverStockPrgIdFromDom(page, items)) || null;
  if (discovered) {
    console.log(`[STOCK DEBUG] DOM에서 발견한 stock prgId=${discovered}`);
  }
  const effectivePrg = (prgId && prgId !== "C000035" ? prgId : null) || discovered;

  // 1) DOM에서 찾은 prgId 링크 우선 (하드코딩 아님)
  if (effectivePrg) {
    const prgSelectors = [
      `#link_prg_${effectivePrg}`,
      `[id*="link_prg_${effectivePrg}"]`,
      `a[onclick*="${effectivePrg}"]`,
      `a[href*="${effectivePrg}"]`,
      `[id*="${effectivePrg}"]`,
    ];
    for (const sel of prgSelectors) {
      for (const frame of page.frames()) {
        const loc = frame.locator(sel).first();
        try {
          if ((await loc.count()) === 0 || !(await loc.isVisible())) continue;
          const clicked = await clickStockCandidate(page, loc, `prgId:${sel}`);
          if (clicked.ok) return true;
        } catch {
          /* next */
        }
      }
    }
  }

  // 2) 본문 카드 우선 (sidebar 제외)
  for (const frame of page.frames()) {
    try {
      const contentLinks = frame
        .locator('#contents a, .contents a, [class*="content"] a, [class*="program"] a, main a')
        .filter({ hasText: /^재고\s*현황$/ });
      const n = await contentLinks.count();
      console.log(`[STOCK DEBUG] stock report candidates contentCards=${n}`);
      for (let i = 0; i < n; i++) {
        const card = contentLinks.nth(i);
        if (!(await card.isVisible())) continue;
        const clicked = await clickStockCandidate(page, card, `content-card:${i + 1}/${n}`);
        if (clicked.ok) return true;
      }
    } catch {
      /* skip */
    }
  }

  // 3) sidebar leaf — 마지막 수단 (잘못된 메뉴로 빠질 수 있음)
  for (const frame of page.frames()) {
    const links = frame.locator("a").filter({ hasText: /^재고\s*현황$/ });
    const count = await links.count();
    console.log(`[STOCK DEBUG] stock report candidates sidebarLinks=${count}`);
    for (let i = count - 1; i >= 0; i--) {
      try {
        const link = links.nth(i);
        if (!(await link.isVisible())) continue;
        // depth2 menu tree는 폴더일 수 있어 prg 링크가 아니면 스킵 권장 — 그래도 시도하되 로그 남김
        const clicked = await clickStockCandidate(page, link, `sidebar:${i + 1}/${count}`);
        if (clicked.ok) return true;
      } catch {
        /* next */
      }
    }
  }

  console.log(`[STOCK DEBUG] stock report candidates none-opened`);
  return false;
}

async function clickSearchButton(page: Page): Promise<boolean> {
  console.log("[STOCK] 검색(F8) 실행 시작");

  const reportFrames = await findStockReportFrames(page);
  const scan = reportFrames.length > 0 ? reportFrames : page.frames();
  if (reportFrames.length > 0) {
    console.log(`   [STOCK] 재고현황 report frame ${reportFrames.length}개에서 검색 시도`);
  }

  for (const frame of scan) {
    const locators = [
      frame.getByText(/검색\s*\(F8\)/i).first(),
      frame.locator('button, a, span, div[role="button"]').filter({ hasText: /검색\s*\(F8\)/i }).first(),
    ];
    for (const btn of locators) {
      try {
        if ((await btn.count()) > 0 && (await btn.isVisible())) {
          await frame.locator("body").click({ position: { x: 20, y: 20 }, force: true }).catch(() => {});
          await btn.scrollIntoViewIfNeeded().catch(() => {});
          await btn.click({ force: true });
          console.log("   ✓ 검색(F8) 클릭");
          return true;
        }
      } catch {
        /* next */
      }
    }
  }

  for (const frame of scan) {
    try {
      if ((await frame.locator("text=기준일자").count()) > 0) {
        await frame.locator("body").click({ position: { x: 20, y: 20 }, force: true }).catch(() => {});
        await page.keyboard.press("F8");
        console.log("   ✓ F8 키 입력 (재고현황 frame)");
        return true;
      }
    } catch {
      /* skip */
    }
  }

  await page.keyboard.press("F8").catch(() => {});
  console.log("   ✓ F8 키 입력 (page fallback)");
  return true;
}

async function runStockSearch(page: Page) {
  if (await isStockResultsReady(page)) {
    console.log("[STOCK] 검색 결과 화면 감지 완료 (검색 생략)");
    return;
  }

  if (!(await isStockSearchForm(page))) {
    console.log("   → 검색 조건 화면 아님 — 재고현황 메뉴 재클릭");
    await openStockReportProgram(page, null);
    await page.waitForTimeout(2000);
  }

  await clickSearchButton(page);
  console.log("3. 검색 결과 로딩 대기...");

  if (await waitForStockResultsReady(page, 60)) {
    console.log("[STOCK] 검색 결과 화면 감지 완료");
  } else {
    console.warn("   ⚠ 재고 결과 화면 60초 내 미확인 — 다운로드 재시도 예정");
    await logFrameList(page, "검색 후 결과 미확인");
  }
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

async function tryMenuSearch(page: Page, keyword: string): Promise<boolean> {
  const selectors = [
    'input[placeholder*="메뉴"]',
    'input[placeholder*="Menu"]',
    "#txtMenuSearch",
    "#menuSearch",
    'input[type="search"]',
  ];
  for (const frame of page.frames()) {
    for (const sel of selectors) {
      const input = frame.locator(sel).first();
      try {
        if ((await input.count()) > 0 && (await input.isVisible())) {
          await input.fill(keyword);
          await input.press("Enter");
          await page.waitForTimeout(4000);
          console.log(`   ✓ 메뉴 검색: ${keyword} (${sel})`);
          return true;
        }
      } catch {
        /* continue */
      }
    }
  }
  return false;
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

/** 재고현황(엑셀 다운로드) 화면까지 이동 */
export async function navigateToStockReport(page: Page, opts: StockNavOptions = {}) {
  console.log("2. 재고현황 화면 이동...");
  console.log("[STOCK] 재고현황 페이지 진입 시작");
  await dismissEcountPopups(page);

  const menuUrl = (opts.stock_menu_url || process.env.ECOUNT_STOCK_MENU_URL || "").trim();
  if (menuUrl) {
    const parsed = parseStockMenuUrl(menuUrl);
    console.log(`   → 저장된 URL (정규화): ${(parsed?.normalized || menuUrl).slice(0, 90)}...`);

    let opened =
      (await gotoStockViaHash(page, menuUrl)) ||
      (await clickMenuIdsFromUrl(page, menuUrl));

    if (!opened && parsed?.normalized && !parsed.normalized.includes("ec_req_sid")) {
      const direct = resolveErpNavigationTarget(page.url(), parsed.normalized) || parsed.normalized;
      await gotoEcountPage(page, direct, "정규화 URL 직접 이동");
      opened = true;
    }

    if (!opened) {
      await logFrameList(page, "메뉴 URL 이동 실패");
      throw new Error("저장된 재고현황 URL로 화면 이동 실패");
    }

    await dismissEcountPopups(page);
    console.log(`   현재 URL: ${redactUrl(page.url())}`);
    await logFrameList(page, "after output folder");

    // 출력물 폴더 prgId(C000035)로는 보고서가 안 열림 — DOM에서 실제 report 식별
    const openPrgId = parsed?.prgId && parsed.prgId !== "C000035" ? parsed.prgId : null;
    const openedReport = await openStockReportProgram(page, openPrgId);
    if (!openedReport) {
      await saveStockScreenshot(page, "stock-entry-failed.png");
      await logFrameList(page, "보고서 클릭 실패");
      throw new Error(
        "재고현황 report program을 열지 못했습니다. downloads/stock-elements.html 과 [STOCK DEBUG] 로그의 prgId/요소를 확인하세요."
      );
    }

    if (isEntryOnly()) {
      console.log("🎯 Phase1-2 ENTRY_OK — 검색/Excel 생략 (ECOUNT_STOCK_ENTRY_ONLY=1)");
      return;
    }

    await runStockSearch(page);
    return;
  }

  const d1 = opts.stock_menu_depth1 || process.env.ECOUNT_STOCK_MENU_DEPTH1;
  const d2 = opts.stock_menu_depth2 || process.env.ECOUNT_STOCK_MENU_DEPTH2;

  if (d1 && d2) {
    if (!(await clickInAnyFrame(page, d1))) throw new Error(`메뉴 클릭 실패: ${d1}`);
    await page.waitForTimeout(2000);
    if (!(await clickInAnyFrame(page, d2))) throw new Error(`메뉴 클릭 실패: ${d2}`);
  } else if (await tryMenuSearch(page, "재고현황")) {
    /* ok */
  } else {
    const topClicked =
      (await clickTextInAnyFrame(page, /^재고\s*I$/)) ||
      (await clickTextInAnyFrame(page, /^재고\s*Ⅰ$/)) ||
      (await clickTextInAnyFrame(page, /재고\s*\(1\)/));

    if (!topClicked) {
      await clickInAnyFrame(page, "#link_depth1_MENUTREE_000004");
      await clickInAnyFrame(page, "#link_depth1_MENUTREE_000782");
      await clickInAnyFrame(page, "#link_depth1_MENUTREE_000783");
    }

    await page.waitForTimeout(2500);
    await dismissEcountPopups(page);

    if (!(await clickTextInAnyFrame(page, /재고현황/))) {
      if (!(await clickInAnyFrame(page, "#link_depth2_MENUTREE_000035"))) {
        await logFrameList(page, "메뉴 자동 이동 실패");
        throw new Error(
          "재고현황 메뉴 자동 이동 실패. PC에서 재고현황 화면 주소(URL)를 복사해 /admin/ecount-bot → 재고현황 URL 에 저장하세요."
        );
      }
    }
  }

  await page.waitForTimeout(2000);
  await dismissEcountPopups(page);
  if (!(await openStockReportProgram(page, null))) {
    await saveStockScreenshot(page, "stock-entry-failed.png");
    throw new Error("재고현황 report program을 열지 못했습니다.");
  }

  if (isEntryOnly()) {
    console.log("🎯 Phase1-2 ENTRY_OK — 검색/Excel 생략 (ECOUNT_STOCK_ENTRY_ONLY=1)");
    return;
  }

  await runStockSearch(page);
  console.log(`   현재 URL: ${redactUrl(page.url())}`);
}

export async function runStockSearchAfterNavigate(page: Page) {
  await dismissEcountPopups(page);
  await runStockSearch(page);
}

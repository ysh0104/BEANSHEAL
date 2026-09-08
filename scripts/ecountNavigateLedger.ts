/**
 * 재고수불부 네비게이션
 *
 * 실제 사용자 동선:
 *   재고 I → 출력물 CLICK → 재고수불부 CLICK
 *   → (임시: 「기타」/생산불출 스킵) → 검색 버튼 클릭 → ESC → 결과 대기 → Excel
 *
 * URL: 검색 전후 모두 prgId=C000035 depth=2 (출력물 셸).
 * E040702는 사이드바 leaf 링크 힌트일 뿐 URL 필수값이 아님.
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
  // 사이드바 leaf (#link_prg_*) 탐색 힌트 — URL prgId(C000035)와 별개
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

type LedgerLeafCandidate = {
  frameIndex: number;
  text: string;
  id: string;
  href: string;
  onclick: string;
  prgId: string;
  menuSeq: string;
  groupSeq: string;
  depth: string;
  className: string;
  inLocalNav: boolean;
  visible: boolean;
  source: "exact-text" | "leaf-prg-href";
  outerHTML: string;
};

function extractHashParam(raw: string, key: string): string {
  try {
    const hash = raw.includes("#") ? raw.slice(raw.indexOf("#") + 1) : raw.replace(/^[?#]/, "");
    return new URLSearchParams(hash).get(key) || "";
  } catch {
    const m = raw.match(new RegExp(`[?&#]${key}=([^&#]*)`, "i"));
    return m ? decodeURIComponent(m[1]) : "";
  }
}

function scoreLedgerLeafCandidate(c: LedgerLeafCandidate, folderPrg: string, leafPrg: string): number {
  let s = 0;
  if (isExactLedgerLeafText(c.text)) s += 100;
  if (c.prgId.toUpperCase() === folderPrg.toUpperCase()) s += 80; // 실제 UX URL 셸
  if (c.depth === "2") s += 40;
  if (c.inLocalNav) s += 20;
  if (c.visible) s += 10;
  // E040702 href는 이 환경에서 빈 viewer(mainTitle="")로 떨어짐 — 사람 경로와 불일치
  if (c.prgId.toUpperCase() === leafPrg.toUpperCase()) s -= 120;
  if (/E040206|C000650/i.test(c.prgId)) s -= 200;
  return s;
}

/** 재고수불부 leaf DOM 후보 진단 — exact text vs E040702 href 구분 */
async function diagnoseLedgerLeafCandidates(
  page: Page,
  opts?: { verbose?: boolean }
): Promise<LedgerLeafCandidate[]> {
  const leafPrg = ledgerPrgId();
  const folderPrg = ledgerOutputFolderPrgId();
  const verbose = opts?.verbose !== false;
  const all: LedgerLeafCandidate[] = [];
  const frames = page.frames();

  for (let fi = 0; fi < frames.length; fi++) {
    const frame = frames[fi];
    try {
      const rows = await frame.evaluate(
        ({ leafPrg: lp, folderPrg: fp }) => {
          const out: Array<{
            text: string;
            id: string;
            href: string;
            onclick: string;
            prgId: string;
            menuSeq: string;
            groupSeq: string;
            depth: string;
            className: string;
            inLocalNav: boolean;
            visible: boolean;
            source: "exact-text" | "leaf-prg-href";
            outerHTML: string;
          }> = [];

          const parseParam = (raw: string, key: string) => {
            try {
              const hash = raw.includes("#") ? raw.slice(raw.indexOf("#") + 1) : raw;
              return new URLSearchParams(hash.replace(/^\?/, "")).get(key) || "";
            } catch {
              const m = raw.match(new RegExp(`[?&#]${key}=([^&#]*)`, "i"));
              return m ? decodeURIComponent(m[1]) : "";
            }
          };

          const pushEl = (el: Element, source: "exact-text" | "leaf-prg-href") => {
            const he = el as HTMLElement;
            const text = (he.innerText || he.textContent || "").replace(/\s+/g, " ").trim();
            const href = he.getAttribute("href") || "";
            const onclick = he.getAttribute("onclick") || "";
            const blob = `${href} ${onclick} ${he.id || ""}`;
            const prgId = (parseParam(href, "prgId") || parseParam(blob, "prgId") || "").toUpperCase();
            out.push({
              text: text.slice(0, 80),
              id: he.id || "",
              href: href.slice(0, 220),
              onclick: onclick.slice(0, 160),
              prgId,
              menuSeq: parseParam(href, "menuSeq") || parseParam(blob, "menuSeq"),
              groupSeq: parseParam(href, "groupSeq") || parseParam(blob, "groupSeq"),
              depth: parseParam(href, "depth") || parseParam(blob, "depth"),
              className: String(he.className || "").slice(0, 100),
              inLocalNav: !!he.closest(
                '#menuAreaAddon, .wrapper-local-nav, #local-menu-section, [id*="MENUTREE"], .left-menu, #leftMenu'
              ),
              visible: !!(he.offsetWidth || he.offsetHeight || he.getClientRects().length),
              source,
              outerHTML: (he.outerHTML || "").replace(/\s+/g, " ").trim().slice(0, 280),
            });
          };

          for (const a of Array.from(document.querySelectorAll("a"))) {
            const text = ((a as HTMLElement).innerText || a.textContent || "").replace(/\s+/g, " ").trim();
            if (text === "재고수불부" || text === "재고 수불부") {
              pushEl(a, "exact-text");
            }
          }

          const prgSel = [
            `#link_prg_${lp}`,
            `a[href*="${lp}"]`,
            `a[onclick*="${lp}"]`,
            `a[href*="${fp}"]`,
          ];
          for (const sel of prgSel) {
            try {
              for (const el of Array.from(document.querySelectorAll(sel))) {
                pushEl(el, "leaf-prg-href");
              }
            } catch {
              /* invalid sel */
            }
          }

          const seen = new Set<string>();
          return out.filter((r) => {
            const k = `${r.source}|${r.id}|${r.href}|${r.text}`;
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
          });
        },
        { leafPrg, folderPrg }
      );

      for (const row of rows) {
        all.push({ frameIndex: fi, ...row });
      }
    } catch (err) {
      if (verbose) {
        console.log(
          `   [진단][leaf] frame[${fi}] 스캔 예외: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  }

  if (verbose) {
    console.log(`   [진단][leaf] 후보 total=${all.length} folderPrg=${folderPrg} leafPrgHint=${leafPrg}`);
    for (const c of all.slice(0, 30)) {
      const score = scoreLedgerLeafCandidate(c, folderPrg, leafPrg);
      console.log(
        `   [진단][leaf] score=${score} src=${c.source} frame[${c.frameIndex}] text=${JSON.stringify(c.text)} id=${JSON.stringify(c.id)} prgId=${c.prgId || "(none)"} menuSeq=${c.menuSeq || "(none)"} depth=${c.depth || "(none)"} visible=${c.visible} inNav=${c.inLocalNav}`
      );
      console.log(
        `   [진단][leaf]   href=${JSON.stringify(c.href)} onclick=${JSON.stringify(c.onclick)} outerHTML=${JSON.stringify(c.outerHTML)}`
      );
    }
  }
  return all;
}

/**
 * 사이드바/메뉴 「재고수불부」 leaf 탐색.
 * 우선순위: exact text + (C000035 / depth=2) → exact text → (최후) leafPrg(E040702) href
 * E040702 href 단독 우선 선택 금지 — 사람 UX(C000035 depth=2)와 불일치.
 */
async function findLedgerSidebarLeaf(
  page: Page
): Promise<{ loc: Locator; how: string } | null> {
  const leafPrg = ledgerPrgId();
  const folderPrg = ledgerOutputFolderPrgId();
  console.log(
    `   → [LEDGER NAV] 재고수불부 leaf 탐색 (사람 UX: urlPrg=${folderPrg} depth=2; leafPrgHint=${leafPrg}는 최후 수단)`
  );

  const deadline = Date.now() + 12000;
  let verboseOnce = true;

  while (Date.now() < deadline) {
    const candidates = await diagnoseLedgerLeafCandidates(page, { verbose: verboseOnce });
    verboseOnce = false;

    const ranked = [...candidates]
      .filter((c) => c.visible)
      .sort(
        (a, b) =>
          scoreLedgerLeafCandidate(b, folderPrg, leafPrg) - scoreLedgerLeafCandidate(a, folderPrg, leafPrg)
      );

    for (const pick of ranked) {
      const score = scoreLedgerLeafCandidate(pick, folderPrg, leafPrg);
      // exact text(100+) 또는 folder shell(80+)만 1차 채택 — 순수 E040702(-120) 제외
      if (score < 80) continue;
      if (pick.source === "leaf-prg-href" && pick.prgId.toUpperCase() === leafPrg.toUpperCase()) {
        continue; // E040702 href는 1차에서 제외
      }

      const frame = page.frames()[pick.frameIndex];
      if (!frame) continue;

      const loc = await resolveLedgerLeafLocator(frame, pick);
      if (!loc) continue;

      const how =
        `exact-preferred prgId=${pick.prgId || "(none)"} depth=${pick.depth || "(none)"} ` +
        `menuSeq=${pick.menuSeq || "(none)"} id=${pick.id || "(none)"} score=${score} src=${pick.source}`;
      console.log(`   [진단][leaf] 선택 근거: ${how}`);
      console.log(`   [진단][leaf] 선택 href=${JSON.stringify(pick.href)}`);
      return { loc, how };
    }

    await page.waitForTimeout(400);
  }

  // 최후 수단: leafPrg href (경고) — 사람 UX와 다를 수 있음
  console.warn(
    `   ⚠ [LEDGER NAV] exact-text/C000035 leaf 미발견 — leafPrgHint=${leafPrg} href 폴백 (비권장)`
  );
  for (const frame of page.frames()) {
    for (const sel of [`#link_prg_${leafPrg}`, `a[href*="${leafPrg}"]`, `a[onclick*="${leafPrg}"]`]) {
      try {
        const candidates = frame.locator(sel);
        const n = Math.min(await candidates.count(), 8);
        for (let i = 0; i < n; i++) {
          const loc = candidates.nth(i);
          if (!(await isClickableLedgerLeaf(loc))) continue;
          return { loc, how: `FALLBACK ${sel} (E040702 — 사람 UX C000035와 불일치 가능)` };
        }
      } catch {
        /* next */
      }
    }
  }

  return null;
}

async function resolveLedgerLeafLocator(
  frame: Frame,
  pick: LedgerLeafCandidate
): Promise<Locator | null> {
  if (pick.id) {
    const byId = frame.locator(`[id="${pick.id}"]`).first();
    if ((await byId.count()) > 0 && (await isClickableLedgerLeaf(byId))) return byId;
  }

  const links = frame.locator("a");
  const n = Math.min(await links.count(), 150);
  for (let i = 0; i < n; i++) {
    const cand = links.nth(i);
    try {
      if (!(await isClickableLedgerLeaf(cand))) continue;
      const meta = await cand.evaluate((el) => {
        const he = el as HTMLElement;
        return {
          text: (he.innerText || he.textContent || "").replace(/\s+/g, " ").trim(),
          id: he.id || "",
          href: he.getAttribute("href") || "",
        };
      });
      if (pick.id && meta.id === pick.id) return cand;
      if (!isExactLedgerLeafText(meta.text)) continue;
      if (pick.href && meta.href === pick.href) return cand;
      const hrefPrg = extractHashParam(meta.href, "prgId").toUpperCase();
      if (pick.prgId && hrefPrg === pick.prgId.toUpperCase() && isExactLedgerLeafText(pick.text)) {
        return cand;
      }
      // exact text only match when pick is exact-text without conflicting prg
      if (pick.source === "exact-text" && isExactLedgerLeafText(pick.text) && !pick.prgId) {
        return cand;
      }
      if (
        pick.source === "exact-text" &&
        isExactLedgerLeafText(pick.text) &&
        hrefPrg === (pick.prgId || "").toUpperCase()
      ) {
        return cand;
      }
    } catch {
      /* next */
    }
  }

  // last: any visible exact text in this frame matching pick text
  if (isExactLedgerLeafText(pick.text)) {
    const exact = frame.getByRole("link", { name: pick.text, exact: true });
    const en = Math.min(await exact.count(), 8);
    for (let i = 0; i < en; i++) {
      const el = exact.nth(i);
      if (await isClickableLedgerLeaf(el)) return el;
    }
  }
  return null;
}

/**
 * cascade: 재고 I → 출력물 CLICK → (재고현황 그룹) → 재고수불부 leaf CLICK
 * 클릭 후 #mainPage 「재고수불부」 검증 (URL은 C000035 셸일 수 있음; E040206 거부)
 */
async function openLedgerViaCascadeMenu(page: Page): Promise<boolean> {
  await dismissEcountPopups(page);

  if (await isLedgerSearchScreen(page)) {
    console.log(
      `   ✓ 재고수불부 검색 화면 이미 열림 (기대 URL 셸=${ledgerOutputFolderPrgId()}, leafHint=${expectedLedgerPrgId()})`
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
    console.warn("   ⚠ [LEDGER NAV] 재고수불부 leaf를 찾지 못함");
    return false;
  }

  await leaf.loc.scrollIntoViewIfNeeded().catch(() => {});
  if (!(await isClickableLedgerLeaf(leaf.loc))) {
    console.warn(`   ⚠ [LEDGER NAV] 재고수불부 leaf 클릭 불가: ${leaf.how}`);
    return false;
  }

  console.log(`   ✓ [LEDGER NAV] 재고수불부 leaf 선택: ${leaf.how}`);
  await leaf.loc.click({ force: true });
  console.log("   ✓ 재고수불부 클릭");
  await page.waitForTimeout(1500);
  await dismissEcountPopups(page);
  console.log(`   [진단][leaf] 클릭 직후 url=${page.url().slice(0, 180)}`);

  await assertLedgerProgramSearchScreen(page, 25);
  console.log(
    `   ✓ 재고수불부 검색 화면 진입 (cascade) URL 셸=${ledgerOutputFolderPrgId()} leafHint=${expectedLedgerPrgId()}`
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

/** cascade 실패 시에만: 출력물 폴더 → 「재고수불부」 프로그램 열기 */
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
  const folderPrg = ledgerOutputFolderPrgId();
  console.log(
    `   → 「재고수불부」 열기 폴백 (사람 UX 셸=${folderPrg}; leafPrgHint=${leafPrg}는 최후)`
  );

  // 1) 진단 후 exact-text / C000035 우선 (findLedgerSidebarLeaf와 동일 정책)
  const leaf = await findLedgerSidebarLeaf(page);
  if (leaf) {
    await leaf.loc.scrollIntoViewIfNeeded().catch(() => {});
    await leaf.loc.click({ force: true });
    console.log(`   ✓ 폴백 leaf 클릭: ${leaf.how}`);
    await page.waitForTimeout(3000);
    await dismissEcountPopups(page);
    try {
      await assertLedgerProgramSearchScreen(page, 12);
      return true;
    } catch {
      /* continue */
    }
  }

  // 2) 본문 카드 exact text
  for (const frame of page.frames()) {
    const cards = frame
      .locator('#contents a, .contents a, [class*="content"] a, [class*="program"] a, main a')
      .filter({ hasText: /^재고\s*수불부$/ });
    const n = await cards.count();
    for (let i = 0; i < n; i++) {
      const card = cards.nth(i);
      try {
        if (!(await card.isVisible())) continue;
        const href = (await card.getAttribute("href").catch(() => "")) || "";
        const hrefPrg = extractHashParam(href, "prgId").toUpperCase();
        if (hrefPrg === leafPrg.toUpperCase()) {
          console.log(`   [진단][leaf] 본문 카드[${i}] E040702 href 스킵: ${href.slice(0, 120)}`);
          continue;
        }
        await card.scrollIntoViewIfNeeded().catch(() => {});
        await card.click({ force: true });
        console.log(`   ✓ 본문 카드 (${i + 1}/${n}) prgId=${hrefPrg || "(none)"}`);
        await page.waitForTimeout(3000);
        await dismissEcountPopups(page);
        try {
          await assertLedgerProgramSearchScreen(page, 12);
          return true;
        } catch {
          /* next */
        }
      } catch {
        /* next */
      }
    }
  }

  // 3) 최후: leafPrg(E040702) — 비권장
  console.warn(`   ⚠ 폴백 최후 수단: leafPrgHint=${leafPrg} 링크 클릭`);
  const prgSelectors = [
    `#link_prg_${leafPrg}`,
    `a[onclick*="${leafPrg}"]`,
    `a[href*="${leafPrg}"]`,
  ];
  for (const sel of prgSelectors) {
    if (await clickInAnyFrame(page, sel)) {
      console.log(`   ✓ prgId 링크(FALLBACK): ${sel}`);
      await page.waitForTimeout(3000);
      try {
        await assertLedgerProgramSearchScreen(page, 12);
        return true;
      } catch {
        /* try next selector */
      }
    }
  }

  return false;
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
  // (실제 UX: urlPrg=C000035 + #mainPage 재고수불부; leafHint=E040702)
  await assertLedgerProgramSearchScreen(page, 25);
  console.log(
    `   ✓ 재고수불부 검색 화면 확인 (URL 셸=${ledgerOutputFolderPrgId()}, leafHint=${expectedLedgerPrgId()}) — 「기타」/생산불출 스킵, 바로 검색`
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

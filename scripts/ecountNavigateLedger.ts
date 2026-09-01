import type { Page } from "playwright";
import { parseStockMenuUrl } from "../src/lib/ecountStockMenuUrl";
import { dismissEcountPopups } from "./ecountNavigateStock";
import {
  isLedgerProgramPage,
  isLedgerResultsReady,
  isLedgerResultsTableReady,
  isLedgerSearchForm,
  isLedgerSearchLoading,
  isReportsListingPage,
  SEARCH_BTN_PATTERN,
  waitForLedgerResultsReady,
} from "./ecountExcel";

const LEDGER_PRG_ID_CANDIDATES = [
  process.env.ECOUNT_LEDGER_PRG_ID?.trim(),
  "C000036",
  "C000037",
  "C000034",
  "C000038",
  "C000039",
].filter(Boolean) as string[];

const LEDGER_MENUTREE_CANDIDATES = [
  "MENUTREE_000036",
  "MENUTREE_000037",
  "MENUTREE_000034",
  "MENUTREE_000038",
  "MENUTREE_000039",
  "MENUTREE_000040",
];

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

async function gotoViaHash(page: Page, savedUrl: string): Promise<boolean> {
  const parsed = parseStockMenuUrl(savedUrl);
  if (!parsed?.hash) return false;
  const current = new URL(page.url());
  current.hash = parsed.hash.startsWith("#") ? parsed.hash : `#${parsed.hash}`;
  console.log(`   → hash 네비게이션: ${current.toString().slice(0, 100)}...`);
  await page.goto(current.toString(), { waitUntil: "networkidle", timeout: 90000 });
  await page.waitForTimeout(3000);
  return true;
}

async function clickMenuIdsFromUrl(page: Page, savedUrl: string, skipDepth2 = false): Promise<boolean> {
  const parsed = parseStockMenuUrl(savedUrl);
  if (!parsed) return false;

  const selectors = [parsed.depth1Selector, skipDepth2 ? null : parsed.depth2Selector].filter(
    Boolean
  ) as string[];
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

async function isLedgerScreenReady(page: Page): Promise<boolean> {
  return (
    (await isLedgerProgramPage(page)) ||
    (await isLedgerSearchForm(page)) ||
    (await isLedgerResultsTableReady(page))
  );
}

async function openInventoryReportsFolder(page: Page, menuUrl: string): Promise<void> {
  console.log(`   → 출력물 폴더 URL 이동 (prgId 포함)`);

  const opened =
    (await gotoViaHash(page, menuUrl)) || (await clickMenuIdsFromUrl(page, menuUrl, true));

  if (!opened) {
    const parsed = parseStockMenuUrl(menuUrl);
    if (parsed?.normalized && !parsed.normalized.includes("ec_req_sid")) {
      console.log("   → 정규화 URL 직접 이동 시도...");
      await page.goto(parsed.normalized, { waitUntil: "networkidle", timeout: 90000 });
    }
  }

  await page.waitForTimeout(2500);
  await dismissEcountPopups(page);
}

/** 출력물 카드 목록 → 「재고수불부」 클릭 (본문 카드 → 왼쪽 트리 순) */
async function tryClickLedgerLink(page: Page, link: import("playwright").Locator, label: string): Promise<boolean> {
  try {
    if (!(await link.isVisible())) return false;
    await link.scrollIntoViewIfNeeded().catch(() => {});
    await link.click({ force: true });
    console.log(`   ✓ ${label}`);
    await page.waitForTimeout(8000);
    if (await isLedgerScreenReady(page)) return true;
    await link.evaluate((el: HTMLElement) => el.click());
    await page.waitForTimeout(8000);
    return await isLedgerScreenReady(page);
  } catch {
    return false;
  }
}

async function clickLedgerFromReportsListing(page: Page): Promise<boolean> {
  let hasLedgerLink = false;
  for (const frame of page.frames()) {
    if ((await frame.locator("text=재고수불부").count()) > 0) {
      hasLedgerLink = true;
      break;
    }
  }
  const onListing = (await isReportsListingPage(page)) || hasLedgerLink;
  if (!onListing) return false;

  console.log("   → 출력물 목록(2단계)에서 재고수불부 클릭...");

  const contentSelectors = [
    "#contents a",
    ".contents a",
    '[class*="content"] a',
    '[class*="program"] a',
    '[class*="wrapper"] a',
    "main a",
  ].join(", ");

  const sidebarSelectors = [
    "#sideTab a",
    '[class*="side"] a',
    '[class*="tree"] a',
    '[class*="menu-tree"] a',
    "nav a",
  ].join(", ");

  for (const frame of page.frames()) {
    // 1) 본문 카드 링크 (2번째 스크린샷 중앙 그리드)
    const contentLinks = frame.locator(contentSelectors).filter({ hasText: /^재고\s*수불부$/ });
    const contentCount = await contentLinks.count();
    for (let i = 0; i < contentCount; i++) {
      if (await tryClickLedgerLink(page, contentLinks.nth(i), `본문 카드 재고수불부 (${i + 1}/${contentCount})`)) {
        return true;
      }
    }

    // 2) 왼쪽 트리 메뉴 (2번째 스크린샷 좌측 — 1번째 스크린으로 이동)
    const sidebarLinks = frame.locator(sidebarSelectors).filter({ hasText: /^재고\s*수불부$/ });
    const sideCount = await sidebarLinks.count();
    for (let i = 0; i < sideCount; i++) {
      if (await tryClickLedgerLink(page, sidebarLinks.nth(i), `좌측 메뉴 재고수불부 (${i + 1}/${sideCount})`)) {
        return true;
      }
    }

    // 3) a 태그가 아닌 클릭 가능 요소
    const genericLinks = frame
      .locator('a, span, li, div[role="link"], div[role="button"]')
      .filter({ hasText: /^재고\s*수불부$/ });
    const genericCount = await genericLinks.count();
    for (let i = 0; i < genericCount; i++) {
      if (await tryClickLedgerLink(page, genericLinks.nth(i), `재고수불부 요소 (${i + 1}/${genericCount})`)) {
        return true;
      }
    }

    const roleLink = frame.getByRole("link", { name: /^재고\s*수불부$/ });
    if ((await roleLink.count()) > 0) {
      if (await tryClickLedgerLink(page, roleLink.first(), "role=link 재고수불부")) return true;
    }
  }

  return false;
}

async function tryMenuSearchLedger(page: Page): Promise<boolean> {
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
          await input.click({ force: true });
          await input.fill("");
          await input.fill("재고수불부");
          await input.press("Enter");
          await page.waitForTimeout(3000);
          console.log(`   ✓ 메뉴 검색: 재고수불부 (${sel})`);
          return true;
        }
      } catch {
        /* continue */
      }
    }
  }
  return false;
}

async function clickLedgerMenuSearchResult(page: Page): Promise<boolean> {
  for (const frame of page.frames()) {
    const candidates = [
      frame.locator("a, li, div[role=menuitem], span").filter({ hasText: /^재고\s*수불부$/ }).first(),
      frame.locator("a, li").filter({ hasText: /재고\s*수불부/ }).first(),
      frame.locator('[class*="search"] a, [class*="result"] a').filter({ hasText: /재고/ }).first(),
    ];
    for (const loc of candidates) {
      try {
        if ((await loc.count()) > 0 && (await loc.isVisible())) {
          await loc.click({ force: true });
          console.log("   ✓ 메뉴 검색 결과 클릭");
          await page.waitForTimeout(4000);
          return true;
        }
      } catch {
        /* next */
      }
    }
  }
  return false;
}

async function tryDefaultInventoryMenuTree(page: Page): Promise<void> {
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
}

export async function openLedgerProgram(page: Page, prgId?: string | null): Promise<boolean> {
  if (await isLedgerScreenReady(page)) {
    console.log("   ✓ 재고수불부 화면 준비됨");
    return true;
  }

  if (await isReportsListingPage(page)) {
    if (await clickLedgerFromReportsListing(page)) return true;
  }

  console.log("   → 「재고수불부」 보고서 클릭...");

  const prgIds = [prgId, ...LEDGER_PRG_ID_CANDIDATES].filter(Boolean) as string[];
  for (const id of [...new Set(prgIds)]) {
    const prgSelectors = [
      `#link_prg_${id}`,
      `[id*="${id}"]`,
      `a[onclick*="${id}"]`,
      `a[href*="${id}"]`,
    ];
    for (const sel of prgSelectors) {
      if (await clickInAnyFrame(page, sel)) {
        console.log(`   ✓ prgId 링크: ${id}`);
        await page.waitForTimeout(4000);
        if (await isLedgerScreenReady(page)) return true;
      }
    }
  }

  for (const treeId of LEDGER_MENUTREE_CANDIDATES) {
    if (await clickInAnyFrame(page, `#link_depth2_${treeId}`)) {
      console.log(`   ✓ depth2: ${treeId}`);
      await page.waitForTimeout(4000);
      if ((await isLedgerResultsTableReady(page)) || (await isLedgerSearchForm(page))) return true;
    }
  }

  for (const frame of page.frames()) {
    for (const pattern of [/^재고\s*수불부$/, /^재고수불부$/, /재고\s*수불부/]) {
      const links = frame.locator("a").filter({ hasText: pattern });
      const count = await links.count();
      for (let i = count - 1; i >= 0; i--) {
        try {
          const link = links.nth(i);
          if (await link.isVisible()) {
            await link.click();
            console.log(`   ✓ 재고수불부 링크 클릭 (${i + 1}/${count})`);
            await page.waitForTimeout(4000);
            if (await isLedgerScreenReady(page)) return true;
          }
        } catch {
          /* next */
        }
      }
    }
  }

  for (const frame of page.frames()) {
    try {
      const contentLinks = frame
        .locator('#contents a, .contents a, [class*="content"] a, main a, [class*="menu"] a')
        .filter({ hasText: /재고\s*수불부/ });
      const count = await contentLinks.count();
      for (let i = 0; i < count; i++) {
        const link = contentLinks.nth(i);
        if (await link.isVisible()) {
          await link.click();
          console.log(`   ✓ 본문 재고수불부 링크 클릭 (${i + 1}/${count})`);
          await page.waitForTimeout(4000);
          if (await isLedgerScreenReady(page)) return true;
        }
      }
    } catch {
      /* skip */
    }
  }

  if (await clickTextInAnyFrame(page, /재고\s*수불부/)) {
    await page.waitForTimeout(8000);
    return await isLedgerScreenReady(page);
  }

  return false;
}

async function fillInputNearLabel(page: Page, labelPattern: RegExp, value: string): Promise<boolean> {
  for (const frame of page.frames()) {
    try {
      const labels = frame.locator("label, th, td, span, div").filter({ hasText: labelPattern });
      const count = await labels.count();
      for (let i = 0; i < count; i++) {
        const label = labels.nth(i);
        const container = label.locator("xpath=ancestor::tr[1] | ancestor::div[contains(@class,'row')][1]").first();
        const input = container.locator('input[type="text"], input:not([type="hidden"])').first();
        if ((await input.count()) > 0 && (await input.isVisible())) {
          await input.click({ force: true });
          await input.fill(value);
          return true;
        }
      }
    } catch {
      /* continue */
    }
  }
  return false;
}

async function fillDateRange(page: Page, from: string, to: string): Promise<void> {
  console.log(`   → 기간 설정: ${from} ~ ${to}`);

  for (const frame of page.frames()) {
    try {
      if (!(await isLedgerSearchForm(page)) && !(await isLedgerResultsTableReady(page))) continue;

      const inputs = frame.locator('input[type="text"]:visible');
      const n = await inputs.count();
      const dateInputs: ReturnType<Page["locator"]>[] = [];
      for (let i = 0; i < n; i++) {
        const el = inputs.nth(i);
        const val = await el.inputValue().catch(() => "");
        if (/\d{4}[\/.\-]\d{1,2}/.test(val) || val === "") {
          dateInputs.push(el);
        }
      }
      if (dateInputs.length >= 2) {
        await dateInputs[0].click({ force: true });
        await dateInputs[0].fill(from);
        await dateInputs[1].click({ force: true });
        await dateInputs[1].fill(to);
        return;
      }
    } catch {
      /* next frame */
    }
  }

  await fillInputNearLabel(page, /시작|from/i, from);
  await fillInputNearLabel(page, /종료|to/i, to);
}

/** 생산불출/창고이동포함 체크 (미체크 시 체크) — 「기타」 탭 우선 */
async function ensureProductionTransferIncluded(page: Page): Promise<void> {
  const labelPatterns = [
    /생산불출\s*\/\s*창고이동\s*포함/,
    /생산불출\s*\/\s*창고이동포함/,
    /생산불출.*창고이동.*포함/,
  ];

  // 체크박스는 「기타」 탭에 있는 경우가 많음
  for (const frame of page.frames()) {
    try {
      const etcTab = frame
        .locator('a, button, span, li, div[role="tab"]')
        .filter({ hasText: /^기타$/ })
        .first();
      if ((await etcTab.count()) > 0 && (await etcTab.isVisible())) {
        await etcTab.click({ force: true });
        await page.waitForTimeout(800);
        console.log("   ✓ 기타 탭 클릭");
        break;
      }
    } catch {
      /* next frame */
    }
  }

  for (const labelPattern of labelPatterns) {
    for (const frame of page.frames()) {
      try {
        const label = frame.locator("label, span, td, div").filter({ hasText: labelPattern }).first();
        if ((await label.count()) === 0 || !(await label.isVisible())) continue;

        const container = label
          .locator("xpath=ancestor::tr[1] | ancestor::label[1] | ancestor::div[contains(@class,'row')][1]")
          .first();
        const checkbox = container.locator('input[type="checkbox"]').first();

        if ((await checkbox.count()) > 0) {
          if (!(await checkbox.isChecked())) {
            await checkbox.click({ force: true });
            console.log("   ✓ 생산불출/창고이동포함 체크");
          } else {
            console.log("   ✓ 생산불출/창고이동포함 이미 체크됨");
          }
          return;
        }

        await label.click({ force: true });
        console.log("   ✓ 생산불출/창고이동포함 (라벨 클릭)");
        return;
      } catch {
        /* next frame */
      }
    }
  }

  console.warn("   ⚠ 생산불출/창고이동포함 체크박스를 찾지 못함 (기본값으로 조회 계속)");
}

/** 품목 많을 때 뜨는 알림 — 취소(전체 조회 계속) */
export async function dismissLedgerItemRedesignModal(page: Page): Promise<boolean> {
  for (const frame of page.frames()) {
    try {
      const hint = frame.locator("text=/조회품목을 재지정|품목개수가 많을 경우/").first();
      if ((await hint.count()) === 0 || !(await hint.isVisible())) continue;

      const cancelCandidates = [
        frame.getByRole("button", { name: /^취소$/ }).first(),
        frame.locator('button, a, span, div[role="button"]').filter({ hasText: /^취소$/ }).first(),
      ];

      for (const cancelBtn of cancelCandidates) {
        if ((await cancelBtn.count()) > 0 && (await cancelBtn.isVisible())) {
          await cancelBtn.click({ force: true });
          console.log("   ✓ 조회품목 재지정 알림 → 취소 (전체 조회 계속)");
          await page.waitForTimeout(2000);
          return true;
        }
      }
    } catch {
      /* next frame */
    }
  }
  return false;
}

async function waitAndDismissLedgerModal(page: Page, maxSec = 15): Promise<void> {
  const steps = Math.ceil(maxSec / 1);
  for (let i = 0; i < steps; i++) {
    if (await dismissLedgerItemRedesignModal(page)) return;
    await page.waitForTimeout(1000);
  }
}

async function fillProdCode(page: Page, prodCd: string): Promise<void> {
  if (!prodCd.trim()) {
    console.log("   → 품목코드: (비움 — 전체 품목 조회)");
    return;
  }
  console.log(`   → 품목코드: ${prodCd}`);

  for (const frame of page.frames()) {
    try {
      const codeLabel = frame.locator("text=/품목코드/").first();
      if ((await codeLabel.count()) > 0) {
        const row = codeLabel.locator("xpath=ancestor::tr[1]").first();
        const input = row.locator('input[type="text"]').first();
        if ((await input.count()) > 0 && (await input.isVisible())) {
          await input.click({ force: true });
          await input.fill(prodCd);
          return;
        }
        const nextInput = codeLabel.locator("xpath=following::input[1]").first();
        if ((await nextInput.count()) > 0 && (await nextInput.isVisible())) {
          await nextInput.click({ force: true });
          await nextInput.fill(prodCd);
          return;
        }
      }
    } catch {
      /* skip */
    }
  }

  if (await fillInputNearLabel(page, /^품목코드$/, prodCd)) return;
  if (await fillInputNearLabel(page, /품목코드/, prodCd)) return;

  for (const frame of page.frames()) {
    const byPlaceholder = frame.locator('input[placeholder*="품목"], input[placeholder*="코드"]').first();
    try {
      if ((await byPlaceholder.count()) > 0 && (await byPlaceholder.isVisible())) {
        await byPlaceholder.fill(prodCd);
        return;
      }
    } catch {
      /* skip */
    }
  }
}

async function focusLedgerFrame(page: Page) {
  for (const frame of page.frames()) {
    try {
      const hint = frame.locator("text=/품목코드|조회기간|거래처명/").first();
      if ((await hint.count()) > 0) {
        await frame.locator("body").click({ position: { x: 30, y: 30 }, force: true }).catch(() => {});
        return;
      }
    } catch {
      /* skip */
    }
  }
}

async function clickSearch(page: Page): Promise<void> {
  console.log("   → 검색 실행...");

  for (const frame of page.frames()) {
    const locators = [
      frame.getByText(SEARCH_BTN_PATTERN).first(),
      frame.locator('button, a, span, div[role="button"]').filter({ hasText: SEARCH_BTN_PATTERN }).first(),
    ];
    for (const btn of locators) {
      try {
        if ((await btn.count()) > 0 && (await btn.isVisible())) {
          await btn.scrollIntoViewIfNeeded().catch(() => {});
          await btn.click({ force: true });
          console.log("   ✓ 검색 버튼 클릭");
          return;
        }
      } catch {
        /* next */
      }
    }
  }

  await focusLedgerFrame(page);
  await page.keyboard.press("F8").catch(() => {});
  await page.keyboard.press("F3").catch(() => {});
  console.log("   ✓ F8/F3 키 입력");
}

export type LedgerNavOptions = {
  stock_menu_url?: string | null;
  ledger_menu_url?: string | null;
  stock_menu_depth1?: string | null;
  stock_menu_depth2?: string | null;
  period_from: string;
  period_to: string;
  /** 비우면 전체 품목 조회 */
  prod_cd?: string;
  /** 검색 후 결과 테이블 대기(초). 전체 조회 시 300 권장 */
  results_wait_sec?: number;
};

async function runLedgerSearch(page: Page, opts: LedgerNavOptions) {
  if (await isLedgerResultsTableReady(page)) {
    console.log("   ✓ 재고수불부 결과 테이블 — 검색 생략");
    return;
  }

  if (!(await isLedgerSearchForm(page))) {
    console.log("   → 검색 조건 화면 아님 — 재고수불부 보고서 재클릭");
    await openLedgerProgram(page, parseStockMenuUrl(opts.ledger_menu_url || "")?.prgId);
    await page.waitForTimeout(2000);
  }

  await fillDateRange(page, opts.period_from, opts.period_to);
  await ensureProductionTransferIncluded(page);
  await fillProdCode(page, opts.prod_cd || "");
  await clickSearch(page);
  await waitAndDismissLedgerModal(page);

  console.log("   → 검색 결과 로딩 대기...");
  const waitSec = opts.results_wait_sec ?? (opts.prod_cd ? 90 : 300);
  if (
    !(await waitForLedgerResultsReady(page, waitSec, {
      dismissModal: () => dismissLedgerItemRedesignModal(page),
    }))
  ) {
    console.warn(`   ⚠ 재고수불부 결과 ${waitSec}초 내 미확인`);
  }
}

async function ensureLedgerScreen(page: Page, opts: LedgerNavOptions): Promise<boolean> {
  if (await isLedgerScreenReady(page)) return true;

  const ledgerUrl = (
    opts.ledger_menu_url ||
    process.env.ECOUNT_LEDGER_MENU_URL ||
    ""
  ).trim();
  const stockUrl = (opts.stock_menu_url || process.env.ECOUNT_STOCK_MENU_URL || "").trim();
  const folderUrl = ledgerUrl || stockUrl;
  const ledgerPrgId = ledgerUrl ? parseStockMenuUrl(ledgerUrl)?.prgId : null;

  // 1) 저장된 URL(prgId 포함) → 출력물 목록 → 카드에서 재고수불부 클릭
  if (folderUrl) {
    await openInventoryReportsFolder(page, folderUrl);
    if (await clickLedgerFromReportsListing(page)) return true;
    if (await isLedgerScreenReady(page)) return true;
  }

  if (await tryMenuSearchLedger(page)) {
    await clickLedgerMenuSearchResult(page);
    if (await isLedgerScreenReady(page)) return true;
  }

  if (ledgerUrl) {
    console.log(`   → 재고수불부 전용 URL 재시도`);
    await openInventoryReportsFolder(page, ledgerUrl);
    if (await clickLedgerFromReportsListing(page)) return true;
    if (await openLedgerProgram(page, ledgerPrgId)) return true;
  }

  const d1 = opts.stock_menu_depth1 || process.env.ECOUNT_STOCK_MENU_DEPTH1;
  const d2 = opts.stock_menu_depth2 || process.env.ECOUNT_STOCK_MENU_DEPTH2;

  if (d1) {
    if (await clickInAnyFrame(page, d1)) {
      await page.waitForTimeout(2000);
      if (d2 && d2.includes("000035")) {
        console.log("   → depth2(재고현황) 스킵 — 재고수불부 탐색");
      } else if (d2) {
        await clickInAnyFrame(page, d2);
        await page.waitForTimeout(2000);
      }
    }
  } else {
    await tryDefaultInventoryMenuTree(page);
  }

  if (await clickLedgerFromReportsListing(page)) return true;
  if (await openLedgerProgram(page, ledgerPrgId)) return true;

  if (await tryMenuSearchLedger(page)) {
    await clickLedgerMenuSearchResult(page);
    if (await openLedgerProgram(page, ledgerPrgId)) return true;
  }

  return await isLedgerScreenReady(page);
}

/** 재고수불부 화면 → 기간·품목 설정 → 검색 */
export async function navigateToLedgerReport(page: Page, opts: LedgerNavOptions) {
  console.log("2. 재고수불부 화면 이동...");
  await dismissEcountPopups(page);

  if (!(await ensureLedgerScreen(page, opts))) {
    throw new Error(
      "재고수불부 메뉴를 찾지 못했습니다. /admin/ecount-bot 에 재고현황 URL을 저장했거나, GitHub Secret ECOUNT_LEDGER_MENU_URL(재고수불부 화면 URL)을 설정하세요."
    );
  }

  console.log(`   현재 URL: ${page.url()}`);
  await page.waitForTimeout(1500);
  await dismissEcountPopups(page);
  await runLedgerSearch(page, opts);
}

/** 엑셀 실패 시 — 불필요한 메뉴 재클릭 없이 검색·대기만 재실행 */
export async function runLedgerSearchAfterNavigate(page: Page, opts: LedgerNavOptions) {
  await dismissEcountPopups(page);
  await dismissLedgerItemRedesignModal(page);

  if ((await isLedgerResultsTableReady(page)) || (await isLedgerResultsReady(page))) {
    return;
  }

  const bulkWait = opts.results_wait_sec ?? (opts.prod_cd ? 90 : 300);

  if (await isLedgerSearchLoading(page)) {
    console.log("   → 검색 처리 중 — 결과 대기...");
    if (await waitForLedgerResultsReady(page, bulkWait, { dismissModal: () => dismissLedgerItemRedesignModal(page) })) {
      return;
    }
  }

  if ((await isLedgerProgramPage(page)) && !(await isLedgerSearchForm(page))) {
    console.log("   → 재고수불부 결과 화면 — 추가 대기...");
    if (await waitForLedgerResultsReady(page, bulkWait, { dismissModal: () => dismissLedgerItemRedesignModal(page) })) {
      return;
    }
  }

  if (!(await isLedgerSearchForm(page))) {
    if (await isReportsListingPage(page)) {
      console.log("   → 출력물 목록 — 재고수불부 재진입");
      await openLedgerProgram(page, parseStockMenuUrl(opts.ledger_menu_url || "")?.prgId);
      await page.waitForTimeout(2000);
    } else if (!(await isLedgerProgramPage(page))) {
      console.log("   → 재고수불부 화면 아님 — 보고서 재클릭");
      await openLedgerProgram(page, parseStockMenuUrl(opts.ledger_menu_url || "")?.prgId);
      await page.waitForTimeout(2000);
    } else {
      console.log("   → 검색 조건 미감지 — 결과 추가 대기 (재클릭 생략)");
      if (await waitForLedgerResultsReady(page, 60, { dismissModal: () => dismissLedgerItemRedesignModal(page) })) {
        return;
      }
    }
  }

  if ((await isLedgerResultsTableReady(page)) || (await isLedgerResultsReady(page))) {
    return;
  }

  await fillDateRange(page, opts.period_from, opts.period_to);
  await ensureProductionTransferIncluded(page);
  await fillProdCode(page, opts.prod_cd || "");
  await clickSearch(page);
  await waitAndDismissLedgerModal(page);
  await waitForLedgerResultsReady(page, bulkWait, { dismissModal: () => dismissLedgerItemRedesignModal(page) });
}

export async function downloadLedgerExcel(page: Page, saveAs: string) {
  const { clickLedgerExcelDownload } = await import("./ecountExcel");
  console.log("4. 재고수불부 엑셀 다운로드...");
  await clickLedgerExcelDownload(page, saveAs);
  console.log(`✅ 엑셀 저장: ${saveAs}`);
}

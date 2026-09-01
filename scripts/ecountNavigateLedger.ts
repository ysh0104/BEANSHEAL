import type { Page } from "playwright";
import { parseStockMenuUrl } from "../src/lib/ecountStockMenuUrl";
import { dismissEcountPopups } from "./ecountNavigateStock";
import {
  clickLedgerExcelDownload,
  isLedgerResultsReady,
  isLedgerSearchForm,
  waitForLedgerResultsReady,
} from "./ecountExcel";

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
  current.hash = parsed.hash;
  await page.goto(current.toString(), { waitUntil: "networkidle", timeout: 90000 });
  await page.waitForTimeout(3000);
  return true;
}

export async function openLedgerProgram(page: Page): Promise<boolean> {
  console.log("   → 「재고수불부」 보고서 클릭...");

  for (const frame of page.frames()) {
    const links = frame.locator("a").filter({ hasText: /^재고수불부$/ });
    const count = await links.count();
    for (let i = count - 1; i >= 0; i--) {
      try {
        const link = links.nth(i);
        if (await link.isVisible()) {
          await link.click();
          console.log(`   ✓ 재고수불부 클릭 (${i + 1}/${count})`);
          await page.waitForTimeout(4000);
          return true;
        }
      } catch {
        /* next */
      }
    }
  }

  if (await clickTextInAnyFrame(page, /^재고수불부$/)) {
    await page.waitForTimeout(4000);
    return true;
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

async function fillProdCode(page: Page, prodCd: string): Promise<void> {
  console.log(`   → 품목코드: ${prodCd}`);

  for (const frame of page.frames()) {
    try {
      const codeLabel = frame.locator("text=/품목코드/").first();
      if ((await codeLabel.count()) > 0) {
        const row = codeLabel.locator("xpath=ancestor::tr[1]").first();
        const input = row.locator('input[type="text"]').first();
        if ((await input.count()) > 0 && (await input.isVisible())) {
          await input.fill(prodCd);
          return;
        }
        const nextInput = codeLabel.locator("xpath=following::input[1]").first();
        if ((await nextInput.count()) > 0 && (await nextInput.isVisible())) {
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

async function clickSearch(page: Page): Promise<void> {
  console.log("   → 검색(F8) 실행...");
  for (const frame of page.frames()) {
    const btn = frame.locator('button, a, span, div[role="button"]').filter({ hasText: /검색\s*\(F8\)/i }).first();
    try {
      if ((await btn.count()) > 0 && (await btn.isVisible())) {
        await btn.click({ force: true });
        return;
      }
    } catch {
      /* next */
    }
  }
  await page.keyboard.press("F8").catch(() => {});
}

export type LedgerNavOptions = {
  stock_menu_url?: string | null;
  period_from: string;
  period_to: string;
  prod_cd: string;
};

async function runLedgerSearch(page: Page, opts: LedgerNavOptions) {
  if (await isLedgerResultsReady(page)) {
    console.log("   ✓ 재고수불부 결과 화면 — 검색 생략");
    return;
  }

  if (!(await isLedgerSearchForm(page))) {
    console.log("   → 재고수불부 검색 화면 아님 — 메뉴 재클릭");
    if (!(await openLedgerProgram(page))) {
      await tryMenuSearchLedger(page);
    }
    await page.waitForTimeout(2000);
  }

  await fillDateRange(page, opts.period_from, opts.period_to);
  await fillProdCode(page, opts.prod_cd);
  await clickSearch(page);
}

async function tryMenuSearchLedger(page: Page): Promise<boolean> {
  for (const frame of page.frames()) {
    for (const sel of ['input[placeholder*="메뉴"]', "#txtMenuSearch", "#menuSearch", 'input[type="search"]']) {
      const input = frame.locator(sel).first();
      try {
        if ((await input.count()) > 0 && (await input.isVisible())) {
          await input.fill("재고수불부");
          await input.press("Enter");
          await page.waitForTimeout(4000);
          console.log("   ✓ 메뉴 검색: 재고수불부");
          return true;
        }
      } catch {
        /* continue */
      }
    }
  }
  return false;
}

/** 재고수불부 화면 → 기간·품목 설정 → 검색 */
export async function navigateToLedgerReport(page: Page, opts: LedgerNavOptions) {
  console.log("2. 재고수불부 화면 이동...");
  await dismissEcountPopups(page);

  const menuUrl = (opts.stock_menu_url || process.env.ECOUNT_STOCK_MENU_URL || "").trim();
  if (menuUrl) {
    await gotoViaHash(page, menuUrl);
    await dismissEcountPopups(page);
  }

  if (!(await openLedgerProgram(page))) {
    if (!(await tryMenuSearchLedger(page)) || !(await openLedgerProgram(page))) {
      const parsed = menuUrl ? parseStockMenuUrl(menuUrl) : null;
      if (parsed?.depth2Selector) {
        await clickInAnyFrame(page, parsed.depth2Selector);
        await page.waitForTimeout(2000);
        if (!(await openLedgerProgram(page))) {
          throw new Error("재고수불부 메뉴를 찾지 못했습니다.");
        }
      } else {
        throw new Error("재고수불부 메뉴를 찾지 못했습니다. 출력물 메뉴에서 재고수불부를 확인하세요.");
      }
    }
  }

  await page.waitForTimeout(2000);
  await dismissEcountPopups(page);
  await runLedgerSearch(page, opts);

  console.log("3. 재고수불부 결과 대기...");
  if (!(await waitForLedgerResultsReady(page, 90))) {
    console.warn("   ⚠ 재고수불부 결과 90초 내 미확인 — 엑셀 단계에서 재시도");
  }
}

/** 엑셀 다운로드 실패 시 재고수불부 검색 재실행 (재고현황 폴백 금지) */
export async function runLedgerSearchAfterNavigate(page: Page, opts: LedgerNavOptions) {
  await dismissEcountPopups(page);
  if (!(await openLedgerProgram(page))) {
    await tryMenuSearchLedger(page);
  }
  await runLedgerSearch(page, opts);
  await waitForLedgerResultsReady(page, 60);
}

export async function downloadLedgerExcel(page: Page, saveAs: string) {
  console.log("4. 재고수불부 엑셀 다운로드...");
  await clickLedgerExcelDownload(page, saveAs);
  console.log(`✅ 엑셀 저장: ${saveAs}`);
}

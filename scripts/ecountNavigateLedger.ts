import type { Page } from "playwright";
import { parseStockMenuUrl } from "../src/lib/ecountStockMenuUrl";
import { dismissEcountPopups } from "./ecountNavigateStock";
import { clickExcelDownload, waitForStockResultsReady } from "./ecountExcel";

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

async function openLedgerProgram(page: Page): Promise<boolean> {
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

    try {
      const inputs = frame.locator('input[type="text"], input:not([type="hidden"])');
      const n = await inputs.count();
      for (let i = 0; i < n; i++) {
        const input = inputs.nth(i);
        const placeholder = ((await input.getAttribute("placeholder")) || "").toLowerCase();
        const name = ((await input.getAttribute("name")) || "").toLowerCase();
        const id = ((await input.getAttribute("id")) || "").toLowerCase();
        const hint = `${placeholder}${name}${id}`;
        if (labelPattern.test(hint)) {
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

  let filled = false;
  for (const frame of page.frames()) {
    try {
      const dateInputs = frame.locator('input[type="text"], input:not([type="hidden"])').filter({
        has: frame.locator("xpath=.."),
      });
      const inputs = frame.locator('input[type="text"]');
      const n = await inputs.count();
      const candidates: { idx: number; el: ReturnType<Page["locator"]> }[] = [];
      for (let i = 0; i < n; i++) {
        const el = inputs.nth(i);
        const val = await el.inputValue().catch(() => "");
        if (/\d{4}[\/.\-]\d{1,2}/.test(val) || val === "") {
          candidates.push({ idx: i, el });
        }
      }
      if (candidates.length >= 2) {
        await candidates[0].el.click({ force: true });
        await candidates[0].el.fill(from);
        await candidates[1].el.click({ force: true });
        await candidates[1].el.fill(to);
        filled = true;
        break;
      }
    } catch {
      /* next frame */
    }
  }

  if (!filled) {
    await fillInputNearLabel(page, /기간|시작|from|date/i, from);
    await fillInputNearLabel(page, /종료|to|date/i, to);
  }
}

async function fillProdCode(page: Page, prodCd: string): Promise<void> {
  console.log(`   → 품목코드: ${prodCd}`);
  const patterns = [/품목코드/, /품목/, /prod/i, /code/i];
  for (const p of patterns) {
    if (await fillInputNearLabel(page, p, prodCd)) return;
  }

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
    throw new Error(
      "재고수불부 메뉴를 찾지 못했습니다. 출력물 메뉴에서 재고수불부 URL/메뉴 경로를 확인하세요."
    );
  }

  await page.waitForTimeout(2000);
  await dismissEcountPopups(page);
  await fillDateRange(page, opts.period_from, opts.period_to);
  await fillProdCode(page, opts.prod_cd);
  await clickSearch(page);

  console.log("3. 재고수불부 결과 대기...");
  if (!(await waitForStockResultsReady(page, 90))) {
    console.warn("   ⚠ 결과 화면 미확인 — 엑셀 다운로드 재시도 예정");
  }
}

export async function downloadLedgerExcel(page: Page, saveAs: string) {
  console.log("4. 재고수불부 엑셀 다운로드...");
  await clickExcelDownload(page, saveAs);
  console.log(`✅ 엑셀 저장: ${saveAs}`);
}

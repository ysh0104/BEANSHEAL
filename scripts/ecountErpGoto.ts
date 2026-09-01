import type { Page } from "playwright";

/** Ecount ERP는 WebSocket 때문에 networkidle이 끝나지 않음 — domcontentloaded만 사용 */
export async function gotoEcountPage(page: Page, url: string, label: string): Promise<void> {
  const started = Date.now();
  console.log(`   → ${label}: ${url.slice(0, 110)}...`);
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  } catch (err) {
    console.warn(
      `   ⚠ ${label} 로드 타임아웃 (${((Date.now() - started) / 1000).toFixed(0)}s) — 계속 진행:`,
      err instanceof Error ? err.message : err
    );
  }
  await page.waitForTimeout(2000);
  console.log(`   ✓ ${label} (${((Date.now() - started) / 1000).toFixed(1)}s)`);
}

import type { Frame, Page } from "playwright";

const LOGIN_URLS = [
  "https://login.ecount.com/Login/KOR",
  "https://login.ecount.com/Login/",
  "https://login.ecount.com/",
];

async function fillFirstMatch(page: Page, selectors: string[], value: string, label: string) {
  const timeout = 45000;
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    for (const frame of page.frames()) {
      for (const sel of selectors) {
        const loc = frame.locator(sel).first();
        try {
          if ((await loc.count()) > 0 && (await loc.isVisible())) {
            await loc.fill(value);
            console.log(`   ✓ ${label}: ${sel}`);
            return;
          }
        } catch {
          /* try next */
        }
      }
    }
    await page.waitForTimeout(500);
  }

  throw new Error(`${label} 입력란을 찾지 못했습니다. (${selectors.join(", ")})`);
}

async function pressEnterOnPassword(page: Page) {
  const selectors = ['input[name="passwd"]', 'input[name="password"]', 'input[type="password"]', "#passwd"];
  for (const frame of page.frames()) {
    for (const sel of selectors) {
      const loc = frame.locator(sel).first();
      try {
        if ((await loc.count()) > 0) {
          await loc.press("Enter");
          return;
        }
      } catch {
        /* continue */
      }
    }
  }
  await page.keyboard.press("Enter");
}

export async function loginEcountWeb(
  page: Page,
  creds: { com_code: string; login_id: string; login_pw: string }
) {
  let lastErr: unknown;
  for (const url of LOGIN_URLS) {
    try {
      console.log(`1. 이카ount 로그인 페이지: ${url}`);
      await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
      await page.waitForTimeout(2000);

      await fillFirstMatch(
        page,
        ['input[name="com_code"]', "#com_code", 'input[id*="com_code"]', 'input[placeholder*="회사"]'],
        creds.com_code,
        "회사코드"
      );
      await fillFirstMatch(
        page,
        ['input[name="id"]', "#id", 'input[name="user_id"]', 'input[placeholder*="아이디"]'],
        creds.login_id,
        "아이디"
      );
      await fillFirstMatch(
        page,
        ['input[name="passwd"]', 'input[name="password"]', "#passwd", 'input[type="password"]'],
        creds.login_pw,
        "비밀번호"
      );

      await pressEnterOnPassword(page);
      await page.waitForURL(/.*(OnetLogin\/Main|view\/erp|ECERP).*/i, { timeout: 60000 });
      console.log("✅ 로그인 성공");
      await page.waitForTimeout(3000);
      return;
    } catch (e) {
      lastErr = e;
      console.warn(`   로그인 시도 실패 (${url}):`, e instanceof Error ? e.message : e);
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error("이카ount 로그인 실패");
}

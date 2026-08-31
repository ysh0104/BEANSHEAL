/**
 * Legacy — 시리얼/로트 현황 엑셀 → ecount_inventory
 * ECOUNT_BOT_TARGET=lot 일 때만 실행
 */
import * as fs from "fs";
import * as path from "path";
import { exec } from "child_process";
import { chromium } from "playwright";
import { loginEcountWeb } from "./ecountLogin";

const envPath = fs.existsSync(".env.local") ? ".env.local" : ".env";
require("dotenv").config({ path: envPath });

export async function runEcountLotBotLegacy() {
  if (!process.env.ECOUNT_COM_CODE || !process.env.ECOUNT_ID || !process.env.ECOUNT_PW) {
    throw new Error("ECOUNT_COM_CODE, ECOUNT_ID, ECOUNT_PW 필요");
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    acceptDownloads: true,
  });
  const page = await context.newPage();

  try {
    await loginEcountWeb(page, {
      com_code: process.env.ECOUNT_COM_CODE!,
      login_id: process.env.ECOUNT_ID!,
      login_pw: process.env.ECOUNT_PW!,
    });

    await page.locator("#link_depth1_MENUTREE_000783").click();
    await page.waitForTimeout(1500);
    await page.locator("#link_depth2_MENUTREE_000208").click();
    await page.waitForTimeout(10000);

    let downloadObj = null;
    for (const frame of page.frames()) {
      const excelBtn = frame.locator("#outputExcel");
      if ((await excelBtn.count()) > 0) {
        const [downloadEvent] = await Promise.all([
          page.waitForEvent("download", { timeout: 30000 }),
          excelBtn.click(),
        ]);
        downloadObj = downloadEvent;
        break;
      }
    }

    if (!downloadObj) throw new Error("로트 엑셀 버튼 없음");

    const downloadDir = path.join(process.cwd(), "downloads");
    if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir);
    const filePath = path.join(downloadDir, "ecount_inventory.xlsx");
    await downloadObj.saveAs(filePath);

    await new Promise<void>((resolve, reject) => {
      exec("npx tsx scripts/uploadToSupabase.ts", (err, stdout, stderr) => {
        if (err) reject(err);
        else {
          if (stdout) console.log(stdout);
          if (stderr) console.error(stderr);
          resolve();
        }
      });
    });
  } finally {
    await browser.close();
  }
}

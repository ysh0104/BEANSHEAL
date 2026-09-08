/**
 * 진단 전용: 재고수불부 leaf DOM 후보 수집
 *
 * 흐름:
 *   로그인 → 재고 I → 출력물 클릭 → (재고현황 그룹 펼침) → 중단
 *   「재고수불부」 exact-text 후보만 JSON 로그 (클릭/검색/fallback 없음)
 *
 * 실행:
 *   ECOUNT_BOT_TARGET=ledger_leaf_dom npx tsx scripts/ecountBot.ts
 */
import * as fs from "fs";
import * as path from "path";
import { chromium, type Frame, type Page } from "playwright";
import { resolveEcountBotCredentials } from "../src/lib/ecountBotConfig";
import { loginEcountWeb } from "./ecountLogin";
import {
  ensureStockStatusGroupExpanded,
  openInventoryTopMenuForLedger,
} from "./ecountNavigateLedger";

const DOWNLOAD_DIR = path.join(process.cwd(), "downloads");
const OUT_JSON = path.join(DOWNLOAD_DIR, "ledger-leaf-dom-candidates.json");

/**
 * Playwright frame.evaluate 에 넣을 순수 JS 문자열.
 * TypeScript/transpile helper(__name 등)가 절대 주입되지 않도록 문자열로만 전달.
 */
const SCAN_EXACT_LEDGER_LEAF_JS = `(function () {
  var out = [];
  var nodes = document.querySelectorAll("a, span, li, div, button, td, label, p, em, strong, b, i");
  for (var i = 0; i < nodes.length; i++) {
    var el = nodes[i];
    var text = "";
    try {
      text = String(el.innerText || el.textContent || "").replace(/\\s+/g, " ").trim();
    } catch (e) {
      continue;
    }
    if (text !== "재고수불부" && text !== "재고 수불부") continue;

    var href = "";
    var onclick = "";
    try {
      href = el.getAttribute("href") || "";
      onclick = el.getAttribute("onclick") || "";
    } catch (e2) {
      href = "";
      onclick = "";
    }

    var dataAttrs = {};
    try {
      if (el.attributes) {
        for (var ai = 0; ai < el.attributes.length; ai++) {
          var attr = el.attributes[ai];
          if (!attr || !attr.name) continue;
          if (attr.name.indexOf("data-") === 0) {
            dataAttrs[attr.name] = String(attr.value || "").slice(0, 200);
          }
        }
      }
    } catch (e3) {
      dataAttrs = {};
    }

    var blob = href + " " + onclick + " " + (el.id || "");
    function pickParam(raw, key) {
      try {
        var hash = raw.indexOf("#") >= 0 ? raw.slice(raw.indexOf("#") + 1) : raw;
        if (hash.charAt(0) === "?") hash = hash.slice(1);
        var params = new URLSearchParams(hash);
        return params.get(key) || "";
      } catch (e4) {
        var re = new RegExp("[?&#]" + key + "=([^&#]*)", "i");
        var m = raw.match(re);
        return m ? decodeURIComponent(m[1]) : "";
      }
    }

    var closestAHtml = "";
    try {
      var ca = el.closest("a");
      if (!ca && el.querySelector) {
        ca = el.querySelector("a");
      }
      if (ca) closestAHtml = String(ca.outerHTML || "").replace(/\\s+/g, " ").trim().slice(0, 400);
    } catch (e5) {
      closestAHtml = "";
    }

    var outer = "";
    try {
      outer = String(el.outerHTML || "").replace(/\\s+/g, " ").trim().slice(0, 400);
    } catch (e6) {
      outer = "";
    }

    var visible = false;
    try {
      visible = !!(el.offsetWidth || el.offsetHeight || (el.getClientRects && el.getClientRects().length));
    } catch (e7) {
      visible = false;
    }

    out.push({
      tagName: el.tagName || "",
      visible: visible,
      innerText: text.slice(0, 80),
      id: el.id || "",
      className: String(el.className || "").slice(0, 160),
      href: String(href).slice(0, 300),
      onclick: String(onclick).slice(0, 300),
      dataAttrs: dataAttrs,
      prgId: String(pickParam(href, "prgId") || pickParam(blob, "prgId") || "").toUpperCase(),
      menuSeq: pickParam(href, "menuSeq") || pickParam(blob, "menuSeq") || "",
      groupSeq: pickParam(href, "groupSeq") || pickParam(blob, "groupSeq") || "",
      depth: pickParam(href, "depth") || pickParam(blob, "depth") || "",
      closestAnchorOuterHTML: closestAHtml,
      outerHTML: outer
    });

    if (out.length >= 80) break;
  }
  return out;
})()`;

type LeafDomHit = {
  frameIndex: number;
  frameName: string;
  frameUrl: string;
  tagName: string;
  visible: boolean;
  innerText: string;
  id: string;
  className: string;
  href: string;
  onclick: string;
  dataAttrs: Record<string, string>;
  prgId: string;
  menuSeq: string;
  groupSeq: string;
  depth: string;
  closestAnchorOuterHTML: string;
  outerHTML: string;
};

async function scanExactLedgerLeafInFrame(frame: Frame, frameIndex: number): Promise<LeafDomHit[]> {
  let rows: Array<Omit<LeafDomHit, "frameIndex" | "frameName" | "frameUrl">> = [];
  try {
    // 문자열 evaluate — TS transpile helper(__name) 주입 방지
    rows = (await frame.evaluate(SCAN_EXACT_LEDGER_LEAF_JS)) as typeof rows;
  } catch (err) {
    console.log(
      JSON.stringify({
        type: "ledger_leaf_dom_frame_error",
        frameIndex,
        frameName: frame.name(),
        frameUrl: frame.url(),
        error: err instanceof Error ? err.message : String(err),
      })
    );
    return [];
  }

  return rows.map((r) => ({
    frameIndex,
    frameName: frame.name(),
    frameUrl: frame.url(),
    ...r,
  }));
}

async function dumpLedgerLeafDomCandidates(page: Page): Promise<LeafDomHit[]> {
  const frames = page.frames();
  const all: LeafDomHit[] = [];
  for (let i = 0; i < frames.length; i++) {
    const hits = await scanExactLedgerLeafInFrame(frames[i], i);
    all.push(...hits);
  }
  return all;
}

async function clickOutputMenu(page: Page): Promise<void> {
  console.log("   → [LEAF DOM DUMP] 출력물 클릭");
  for (const frame of page.frames()) {
    const loc = frame.getByText("출력물", { exact: true }).first();
    try {
      if ((await loc.count()) > 0 && (await loc.isVisible())) {
        await loc.scrollIntoViewIfNeeded().catch(() => {});
        await loc.click({ force: true });
        console.log("   ✓ 출력물 클릭");
        await page.waitForTimeout(1000);
        return;
      }
    } catch {
      /* next */
    }
  }
  throw new Error("[LEAF DOM DUMP] 출력물 메뉴를 클릭하지 못했습니다.");
}

async function waitLedgerLeafTextVisible(page: Page, maxMs = 12000): Promise<boolean> {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    for (const frame of page.frames()) {
      try {
        const loc = frame.getByText("재고수불부", { exact: true }).first();
        if ((await loc.count()) > 0 && (await loc.isVisible().catch(() => false))) return true;
        const loc2 = frame.getByText("재고 수불부", { exact: true }).first();
        if ((await loc2.count()) > 0 && (await loc2.isVisible().catch(() => false))) return true;
      } catch {
        /* next */
      }
    }
    await page.waitForTimeout(300);
  }
  return false;
}

export async function runLedgerLeafDomDump(): Promise<void> {
  console.log("🔍 재고수불부 leaf DOM 진단 (클릭/검색/fallback 없음)");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    acceptDownloads: false,
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();

  try {
    const creds = await resolveEcountBotCredentials();
    if (!creds) {
      throw new Error("ECOUNT 로그인 정보 없음 (env 또는 ecount_bot_config)");
    }
    console.log(`   자격증명 source=${creds.source}`);
    await loginEcountWeb(page, creds);
    await page.waitForTimeout(1500);

    await openInventoryTopMenuForLedger(page);
    await clickOutputMenu(page);
    await ensureStockStatusGroupExpanded(page);

    const visible = await waitLedgerLeafTextVisible(page, 12000);
    console.log(
      JSON.stringify({
        type: "ledger_leaf_dom_ready",
        pageUrl: page.url(),
        exactTextVisible: visible,
        frameCount: page.frames().length,
      })
    );

    // 재고수불부 클릭하지 않음 / E040702 fallback 없음 / 검색 없음
    const candidates = await dumpLedgerLeafDomCandidates(page);
    const summary = {
      type: "ledger_leaf_dom_candidates",
      pageUrl: page.url(),
      total: candidates.length,
      visibleCount: candidates.filter((c) => c.visible).length,
      withC000035: candidates.filter((c) => c.prgId === "C000035").length,
      withE040702: candidates.filter((c) => c.prgId === "E040702").length,
      depth2: candidates.filter((c) => c.depth === "2").length,
      candidates,
    };

    console.log(JSON.stringify(summary, null, 2));

    fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
    fs.writeFileSync(OUT_JSON, JSON.stringify(summary, null, 2), "utf8");
    console.log(`📄 saved ${OUT_JSON}`);

    const shot = path.join(DOWNLOAD_DIR, "ledger-leaf-dom-dump.png");
    await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
    console.log(`📸 ${shot}`);

    if (candidates.length === 0) {
      throw new Error("exact text 「재고수불부」 DOM 후보 0건 — evaluate/화면 상태 확인 필요");
    }
    console.log(`✅ leaf DOM 후보 ${candidates.length}건 수집 완료 (클릭하지 않음)`);
  } finally {
    await browser.close();
  }
}

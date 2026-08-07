/**
 * BEANSHEAL 사무실 PC → 이카운트 고정 IP 관문 프록시
 *
 * Vercel/웹 → (Cloudflare Tunnel) → 이 PC → oapi{ZONE}.ecount.com
 * 이카운트가 보는 출구 IP = 이 PC의 공인 IP (예: 222.120.156.62)
 *
 * 실행: npm start
 * 터널: cloudflared tunnel --url http://localhost:8787
 */

import http from "node:http";
import { URL } from "node:url";

const PORT = Number(process.env.PORT || 8787);
const ZONE = (process.env.ECOUNT_ZONE || "AC").toUpperCase().trim();
/** oapi = 실서버 API Key, sboapi = Test Key */
const DOMAIN = (process.env.ECOUNT_DOMAIN || "oapi").toLowerCase().trim();
const UPSTREAM = (
  process.env.ECOUNT_UPSTREAM || `https://${DOMAIN}${ZONE.toLowerCase()}.ecount.com`
).replace(/\/$/, "");
/** Vercel에서도 같은 값으로 맞춤. 비우면 인증 없음(테스트용) */
const PROXY_SECRET = (process.env.PROXY_SECRET || "").trim();

function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

async function forward(req, res, targetBase) {
  const incomingUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const targetUrl = `${targetBase}${incomingUrl.pathname}${incomingUrl.search}`;

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks);

  const headers = { ...req.headers };
  delete headers.host;
  delete headers["content-length"];
  // 터널/프록시 흔적 제거 (선택)
  delete headers["x-forwarded-for"];
  delete headers["x-forwarded-proto"];
  delete headers["cf-connecting-ip"];

  if (PROXY_SECRET) {
    // 업스트림으로 시크릿을 넘기지 않음
    delete headers["x-beansheal-proxy-secret"];
  }

  let upstream;
  try {
    upstream = await fetch(targetUrl, {
      method: req.method || "GET",
      headers: {
        "content-type": headers["content-type"] || "application/json",
        accept: headers.accept || "application/json",
      },
      body: req.method === "GET" || req.method === "HEAD" ? undefined : body,
    });
  } catch (err) {
    log("UPSTREAM ERROR", targetUrl, err?.message || err);
    res.writeHead(502, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "upstream_failed", message: String(err?.message || err) }));
    return;
  }

  const outHeaders = {};
  upstream.headers.forEach((value, key) => {
    if (key === "transfer-encoding" || key === "content-encoding") return;
    outHeaders[key] = value;
  });

  const buf = Buffer.from(await upstream.arrayBuffer());
  res.writeHead(upstream.status, outHeaders);
  res.end(buf);
  log(req.method, incomingUrl.pathname, "→", upstream.status, targetUrl);
}

const server = http.createServer(async (req, res) => {
  // CORS (브라우저에서 직접 칠 일은 거의 없음)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Beansheal-Proxy-Secret");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const path = (req.url || "/").split("?")[0];

  if (path === "/health" || path === "/") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        service: "beansheal-ecount-office-proxy",
        upstream: UPSTREAM,
        zone: ZONE,
        domain: DOMAIN,
        auth_required: !!PROXY_SECRET,
      })
    );
    return;
  }

  if (PROXY_SECRET) {
    const got = req.headers["x-beansheal-proxy-secret"];
    if (got !== PROXY_SECRET) {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "unauthorized", message: "PROXY_SECRET 불일치" }));
      return;
    }
  }

  if (!path.startsWith("/OAPI/")) {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not_found", hint: "Use /OAPI/V2/..." }));
    return;
  }

  await forward(req, res, UPSTREAM);
});

server.listen(PORT, "0.0.0.0", () => {
  log(`Ecount office proxy listening on http://0.0.0.0:${PORT}`);
  log(`Upstream: ${UPSTREAM}`);
  log(`PROXY_SECRET: ${PROXY_SECRET ? "enabled" : "disabled (dev only)"}`);
  log("");
  log("Next:");
  log("  1) cloudflared tunnel --url http://localhost:" + PORT);
  log("  2) Vercel env ECOUNT_API_BASE_URL = https://xxxx.trycloudflare.com");
  log("  3) Vercel env ECOUNT_PROXY_SECRET = (same as PROXY_SECRET here)");
  log("  4) Ecount API allowlist = this PC public IP");
});

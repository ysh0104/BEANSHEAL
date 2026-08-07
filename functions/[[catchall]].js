/**
 * Cloudflare Pages Functions Proxy for Ecount ERP API
 * Path: functions/[[catchall]].js
 */
async function getWorkerIPv4() {
  const ipv4Endpoints = [
    "http://checkip.amazonaws.com",
    "https://ipv4.icanhazip.com",
    "http://ip4only.me/api/",
    "http://v4.ipv6-test.com/api/myip.php"
  ];

  for (const url of ipv4Endpoints) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      const text = await res.text();
      const match = text.match(/\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/);
      if (match && match[0]) {
        return match[0];
      }
    } catch (e) {}
  }
  return "Cloudflare Outbound IPv4 수신 실패";
}

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);

  // 1. 루트 (/) 또는 /ip 접속 시 순수 IPv4 주소 반환!
  if (url.pathname === "/" || url.pathname === "/ip" || url.pathname === "/my-ip") {
    const outboundIPv4 = await getWorkerIPv4();

    return new Response(
      JSON.stringify({
        status: "200 OK",
        worker_outbound_ipv4: outboundIPv4,
        client_ip: request.headers.get("cf-connecting-ip") || "Unknown",
        ecount_whitelist_guide: `이카운트 ERP [셀프커스터마이징 ➔ 정보관리 ➔ API인증서 관리 ➔ 허용 IP 관리] 메뉴에 위 IPv4 주소 [ ${outboundIPv4} ] 를 등록하세요.`,
        usage: {
          ip_check: request.url,
          oapi_proxy: "이 주소를 Vercel 환경변수 ECOUNT_API_BASE_URL 에 등록하세요."
        }
      }, null, 2),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Access-Control-Allow-Origin": "*"
        }
      }
    );
  }

  // 2. CORS Preflight OPTIONS 처리
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, SESSION_ID, COM_CODE, API_CERT_KEY",
      }
    });
  }

  // 3. 이카운트 OAPI 타겟 URL로 포워딩 (https://oapi.ecount.com)
  const targetHost = "https://oapi.ecount.com";
  const targetUrl = new URL(url.pathname + url.search, targetHost);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("Host", "oapi.ecount.com");
  requestHeaders.delete("cf-connecting-ip");
  requestHeaders.delete("cf-ipcountry");
  requestHeaders.delete("cf-ray");
  requestHeaders.delete("cf-visitor");

  const init = {
    method: request.method,
    headers: requestHeaders,
    redirect: "follow"
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.arrayBuffer();
  }

  try {
    const response = await fetch(targetUrl.toString(), init);
    const responseHeaders = new Headers(response.headers);
    responseHeaders.set("Access-Control-Allow-Origin", "*");
    responseHeaders.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    responseHeaders.set("Access-Control-Allow-Headers", "*");

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: "Proxy Forwarding Error", message: error.message }),
      { status: 502, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
    );
  }
}

/**
 * Cloudflare Pages Functions Proxy for Ecount ERP API
 * Path: functions/[[catchall]].js
 * 
 * 목적: Vercel 동적 IP 및 IPv6 제한 문제를 해결하기 위한 Ecount OAPI 리버스 프록시
 */
export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);

  // 1. 루트 (/) 또는 /ip 접속 시 즉시 Cloudflare Outbound IPv4 주소 반환!
  if (url.pathname === "/" || url.pathname === "/ip" || url.pathname === "/my-ip") {
    try {
      const ipRes = await fetch("https://api4.ipify.org?format=json", { cache: "no-store" });
      const ipData = await ipRes.json();
      return new Response(
        JSON.stringify({
          status: "200 OK",
          worker_outbound_ipv4: ipData.ip,
          client_ip: request.headers.get("cf-connecting-ip") || "Unknown",
          ecount_whitelist_guide: `이카운트 ERP [셀프커스터마이징 ➔ 정보관리 ➔ API인증서 관리 ➔ 허용 IP 관리] 메뉴에 [ ${ipData.ip} ] IPv4 주소를 등록하세요.`,
          usage: {
            ip_check: request.url,
            oapi_proxy: "이 주소를 Vercel 환경변수 ECOUNT_API_BASE_URL 에 등록하십시오."
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
    } catch (e) {
      return new Response(
        JSON.stringify({
          cf_connecting_ip: request.headers.get("cf-connecting-ip"),
          error: e.message
        }, null, 2),
        { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
      );
    }
  }

  // 2. CORS Preflight OPTIONS 요청 처리
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

  // 요청 헤더 복제 및 Host 수정
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

  // GET / HEAD 가 아닌 요청은 Body 바이너리를 그대로 포워딩
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.arrayBuffer();
  }

  try {
    const response = await fetch(targetUrl.toString(), init);
    
    // 응답 헤더 복제 및 CORS 헤더 주입
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
      JSON.stringify({
        error: "Proxy Forwarding Error",
        message: error.message
      }),
      {
        status: 502,
        headers: { 
          "Content-Type": "application/json", 
          "Access-Control-Allow-Origin": "*" 
        }
      }
    );
  }
}

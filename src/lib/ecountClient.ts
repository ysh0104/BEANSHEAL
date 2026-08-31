import https from "https";
import { createFixieAgent, getFixieUrl, isFixieConfigured } from "@/lib/fixie";

export { getFixieUrl, isFixieConfigured };

export async function getEcountProxyBaseUrl(): Promise<string> {
  const fixieUrl = getFixieUrl();
  const envUrl = process.env.ECOUNT_API_BASE_URL || process.env.ECOUNT_PROXY_URL || "";

  // Fixie 프록시 사용 중이거나, 기존 trycloudflare / workers.dev 도메인이 만료된 경우 이카운트 공식 OAPI URL로 우선 자동 변경
  if (fixieUrl || !envUrl || envUrl.includes("trycloudflare") || envUrl.includes("workers.dev")) {
    const zone = process.env.ECOUNT_ZONE || "AC";
    return `https://oapi${zone.toLowerCase()}.ecount.com`;
  }

  return envUrl.replace(/\/$/, "");
}

export async function ecountFetchHeaders(extra: Record<string, string> = {}): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...extra,
  };
  const secret = process.env.ECOUNT_PROXY_SECRET || process.env.PROXY_SECRET;
  if (secret) headers["X-Beansheal-Proxy-Secret"] = secret;
  return headers;
}

/**
 * Fixie 고정 IP 프록시 지원 ECOUNT API 통신 전용 함수
 * FIXIE_URL 설정 시 Fixie 고정 IP(IPv4 2개)를 거쳐 이카운트로 다이렉트 통신
 */
export async function ecountPost(
  url: string,
  body: any,
  extraHeaders: Record<string, string> = {}
): Promise<{ status: number; text: string; data: any }> {
  const fixieUrl = getFixieUrl();
  const headers = await ecountFetchHeaders(extraHeaders);

  if (fixieUrl) {
    const agent = createFixieAgent(fixieUrl);
    const result = await new Promise<{ status: number; text: string; data: any }>((resolve) => {
      try {
        const parsedUrl = new URL(url);
        const postData = JSON.stringify(body);

        const options = {
          hostname: parsedUrl.hostname,
          port: parsedUrl.port || 443,
          path: parsedUrl.pathname + parsedUrl.search,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(postData),
            ...headers,
          },
          agent: agent,
          timeout: 10000,
        };

        const req = https.request(options, (res) => {
          let rawData = "";
          res.on("data", (chunk) => {
            rawData += chunk;
          });
          res.on("end", () => {
            let parsedData: any = null;
            try {
              const cleanText = rawData.replace(/^\uFEFF/, "").trim();
              parsedData = JSON.parse(cleanText);
            } catch (e) {
              parsedData = null;
            }
            resolve({
              status: res.statusCode || 200,
              text: rawData,
              data: parsedData,
            });
          });
        });

        req.on("error", (e) => {
          resolve({
            status: 500,
            text: e?.message || "Fixie 프록시 통신 오류",
            data: null,
          });
        });

        req.write(postData);
        req.end();
      } catch (err: any) {
        resolve({
          status: 500,
          text: err?.message || "Fixie URL 파싱 오류",
          data: null,
        });
      }
    });

    // Fixie 프록시 통신 성공 시 즉시 반환 (이카운트 로그인 거절 응답도 포함)
    if (result.status === 200 && result.data) {
      return result;
    }

    // Fixie가 설정된 경우 Vercel 동적 IP로 폴백하지 않음 (이카운트 IP 차단·서킷브레이커 방지)
    console.error(`[Fixie Proxy] Fixie 통신 실패 (${result.text}). FIXIE_URL 설정 시 직접 fetch 폴백을 사용하지 않습니다.`);
    return {
      status: result.status || 502,
      text:
        result.text ||
        "Fixie 프록시 통신 실패. Fixie 대시보드 Outbound IP 2개를 이카운트 [API인증키발급 > IP등록]에 추가하거나, /api/debug-fixie 로 확인하세요.",
      data: result.data,
    };
  }

  // FIXIE_URL 미설정 또는 Fixie 실패 시 표준 fetch 폴백
  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const text = await res.text();
    let parsedData: any = null;
    try {
      const cleanText = text.replace(/^\uFEFF/, "").trim();
      parsedData = JSON.parse(cleanText);
    } catch {
      parsedData = null;
    }
    return {
      status: res.status,
      text,
      data: parsedData,
    };
  } catch (e: any) {
    return {
      status: 500,
      text: e?.message || "네트워크 통신 오류",
      data: null,
    };
  }
}

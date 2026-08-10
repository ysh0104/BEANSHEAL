import https from "https";
import { HttpsProxyAgent } from "https-proxy-agent";

export async function getEcountProxyBaseUrl(): Promise<string> {
  const fixieUrl = process.env.FIXIE_URL || process.env.FIXIE_SOCKS_HOST;
  if (fixieUrl && !process.env.ECOUNT_API_BASE_URL) {
    const zone = process.env.ECOUNT_ZONE || "AC";
    return `https://oapi${zone.toLowerCase()}.ecount.com`;
  }
  return (
    process.env.ECOUNT_API_BASE_URL ||
    process.env.ECOUNT_PROXY_URL ||
    "https://oapiac.ecount.com"
  ).replace(/\/$/, "");
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
export async function ecountPost(url: string, body: any, extraHeaders: Record<string, string> = {}): Promise<{ status: number; text: string; data: any }> {
  const fixieUrl = process.env.FIXIE_URL || process.env.FIXIE_SOCKS_HOST;
  const headers = await ecountFetchHeaders(extraHeaders);

  if (fixieUrl) {
    const agent = new HttpsProxyAgent(fixieUrl);
    return new Promise<{ status: number; text: string; data: any }>((resolve, reject) => {
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
        };

        const req = https.request(options, (res) => {
          let rawData = "";
          res.on("data", (chunk) => {
            rawData += chunk;
          });
          res.on("end", () => {
            let parsedData: any = null;
            try {
              parsedData = JSON.parse(rawData);
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
            data: { error: e?.message },
          });
        });

        req.write(postData);
        req.end();
      } catch (err: any) {
        resolve({
          status: 500,
          text: err?.message || "Fixie URL 파싱 오류",
          data: { error: err?.message },
        });
      }
    });
  }

  // FIXIE_URL 미설정 시 일반 fetch (클라우드플레어 터널/오피스 프록시 경유)
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
      parsedData = JSON.parse(text);
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
      data: { error: e?.message },
    };
  }
}

import https from "https";
import { HttpsProxyAgent } from "https-proxy-agent";

export function getFixieUrl(): string {
  return (process.env.FIXIE_URL || process.env.FIXIE_SOCKS_HOST || "").trim();
}

export function isFixieConfigured(): boolean {
  return !!getFixieUrl();
}

/** Fixie HTTP 프록시 Agent (Proxy-Authorization 포함) */
export function createFixieAgent(fixieUrl?: string) {
  const url = fixieUrl || getFixieUrl();
  if (!url) throw new Error("FIXIE_URL이 설정되지 않았습니다.");

  try {
    const parsed = new URL(url);
    const auth = parsed.username
      ? `${decodeURIComponent(parsed.username)}:${decodeURIComponent(parsed.password)}`
      : "";

    const proxyHeaders: Record<string, string> = {};
    if (auth && auth !== ":") {
      proxyHeaders["Proxy-Authorization"] = "Basic " + Buffer.from(auth).toString("base64");
    }

    return new HttpsProxyAgent(url, {
      headers: proxyHeaders,
      keepAlive: false,
    });
  } catch {
    return new HttpsProxyAgent(url);
  }
}

/** Fixie 경유 외부 IP 조회 (이카운트 IP 등록용) */
export async function probeFixieOutboundIp(): Promise<{ ip: string; raw: string; error?: string }> {
  const fixieUrl = getFixieUrl();
  if (!fixieUrl) {
    return { ip: "", raw: "", error: "FIXIE_URL 미설정" };
  }

  try {
    const agent = createFixieAgent(fixieUrl);
    const res = await new Promise<{ status: number; text: string }>((resolve, reject) => {
      const req = https.get("https://api.ipify.org?format=json", { agent, timeout: 12000 }, (res) => {
        let text = "";
        res.on("data", (chunk) => (text += chunk));
        res.on("end", () => {
          if (res.statusCode === 407 || text.includes("407 Proxy Authentication")) {
            resolve({
              status: 407,
              text: "407 Proxy Authentication Required — FIXIE_URL 아이디/비밀번호가 잘못되었거나 Proxy Application이 삭제된 상태입니다.",
            });
            return;
          }
          resolve({ status: res.statusCode || 200, text });
        });
      });
      req.on("error", reject);
      req.on("timeout", () => {
        req.destroy();
        reject(new Error("Fixie IP 조회 타임아웃 (12초)"));
      });
    });

    if (res.status === 407) {
      return {
        ip: "",
        raw: res.text,
        error: "FIXIE_AUTH_FAILED",
      };
    }

    try {
      const parsed = JSON.parse(res.text);
      const ip = parsed.ip || "";
      if (!ip || ip.includes("407")) {
        return { ip: "", raw: res.text, error: "FIXIE_PROBE_FAILED" };
      }
      return { ip, raw: res.text };
    } catch {
      const trimmed = res.text.trim();
      if (trimmed.includes("407")) {
        return { ip: "", raw: res.text, error: "FIXIE_AUTH_FAILED" };
      }
      return { ip: trimmed, raw: res.text };
    }
  } catch (e: any) {
    return { ip: "", raw: "", error: e?.message || "Fixie 프록시 통신 실패" };
  }
}

/** Fixie는 Outbound IP 2개를 로드밸런싱 — 여러 번 조회해 고유 IP 수집 */
export async function collectFixieOutboundIps(samples = 8): Promise<string[]> {
  const found = new Set<string>();
  const tasks = Array.from({ length: samples }, () => probeFixieOutboundIp());
  const results = await Promise.all(tasks);
  for (const r of results) {
    if (r.ip && !r.ip.includes("407") && !r.error) found.add(r.ip);
  }
  return Array.from(found).sort();
}

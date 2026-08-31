import { NextResponse } from "next/server";
import { collectFixieOutboundIps, getFixieUrl, isFixieConfigured, probeFixieOutboundIp } from "@/lib/fixie";
import { ecountPost } from "@/lib/ecountClient";

export const runtime = "nodejs";

export async function GET() {
  const fixieUrl = getFixieUrl();
  const isFixieActive = isFixieConfigured();

  if (!isFixieActive) {
    return NextResponse.json({
      status: "FIXIE_NOT_CONFIGURED",
      is_fixie_active: false,
      fixie_url_masked: "환경변수 없음 (FIXIE_URL)",
      outbound_ips: [] as string[],
      ecount_login_ok: false,
      guide: [
        "1. https://vercel.com/integrations/fixie 에서 Vercel 연동 설치",
        "2. Fixie 대시보드(https://app.usefixie.com)에서 Proxy 생성 후 이 Vercel 프로젝트 연결",
        "3. FIXIE_URL 환경변수 자동 생성 확인 → Redeploy",
        "4. 이 페이지를 다시 열어 outbound_ips 확인 → 이카운트 IP 등록",
      ],
    });
  }

  let errorMsg: string | null = null;
  let outboundIps: string[] = [];
  let singleProbe = { ip: "", raw: "", error: "" as string | undefined };

  try {
    singleProbe = await probeFixieOutboundIp();
    if (singleProbe.error) errorMsg = singleProbe.error;
    outboundIps = await collectFixieOutboundIps(8);
    if (outboundIps.length === 0 && singleProbe.ip) outboundIps = [singleProbe.ip];
  } catch (e: any) {
    errorMsg = e?.message || "Fixie IP 조회 실패";
  }

  // 이카운트 로그인 테스트 (IP 허용 여부 확인)
  let ecountLoginOk = false;
  let ecountLoginMessage = "";
  const comCode = (process.env.ECOUNT_ZONE_ID || process.env.ECOUNT_COM_CODE || "").trim();
  const userId = (process.env.ECOUNT_USER_ID || "").trim();
  const apiKey = (process.env.ECOUNT_API_KEY || "").trim();
  const zone = (process.env.ECOUNT_ZONE || "AC").toUpperCase();

  if (comCode && userId && apiKey) {
    const loginUrl = `https://oapi${zone.toLowerCase()}.ecount.com/OAPI/V2/OAPILogin`;
    const loginRes = await ecountPost(loginUrl, {
      COM_CODE: comCode,
      USER_ID: userId,
      API_CERT_KEY: apiKey,
      LAN_TYPE: "ko-KR",
      ZONE: zone,
    });
    const sessionId =
      loginRes.data?.Data?.Datas?.SESSION_ID || loginRes.data?.Data?.SESSION_ID;
    if (sessionId) {
      ecountLoginOk = true;
      ecountLoginMessage = "이카운트 로그인 성공 (IP 등록 완료)";
    } else {
      ecountLoginMessage =
        loginRes.data?.Data?.Message ||
        loginRes.data?.Errors?.[0]?.Message ||
        loginRes.text?.substring(0, 200) ||
        "로그인 실패";
    }
  } else {
    ecountLoginMessage = "ECOUNT_COM_CODE / ECOUNT_USER_ID / ECOUNT_API_KEY 환경변수 확인 필요";
  }

  return NextResponse.json({
    status: errorMsg ? "FIXIE_ERROR" : "FIXIE_ACTIVE",
    is_fixie_active: true,
    fixie_url_masked: `${fixieUrl.substring(0, 20)}...`,
    current_outbound_ip: singleProbe.ip || outboundIps[0] || "조회 실패",
    outbound_ips: outboundIps,
    raw_ip_response: singleProbe.raw,
    error: errorMsg,
    ecount_login_ok: ecountLoginOk,
    ecount_login_message: ecountLoginMessage,
    guide: ecountLoginOk
      ? "Fixie + 이카운트 연동이 정상입니다. /inventory 에서 재고 동기화 버튼을 사용하세요."
      : outboundIps.length > 0
        ? `이카운트 ERP > API인증키발급 > IP등록 에 아래 IP를 모두 추가하세요: ${outboundIps.join(", ")}`
        : "Fixie 프록시 연결을 확인하세요. FIXIE_URL 형식: http://user:pass@host:port",
    ecount_ip_register_steps: [
      "이카운트 ERP 로그인",
      "Self-Customizing > 정보관리 > API인증키발급",
      "IP등록 탭 → outbound_ips 목록의 IP를 각각 추가",
      "저장 후 이 페이지 새로고침",
    ],
  });
}

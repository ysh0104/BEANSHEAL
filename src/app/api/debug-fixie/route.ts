import { NextResponse } from 'next/server';
import https from 'https';
import { HttpsProxyAgent } from 'https-proxy-agent';

export async function GET() {
  const fixieUrl = process.env.FIXIE_URL || process.env.FIXIE_SOCKS_HOST || '';
  const isFixieActive = !!fixieUrl;

  let outboundIp = 'Unknown (Direct Vercel Dynamic IP)';
  let rawResponseText = '';
  let errorMsg = null;

  if (isFixieActive) {
    try {
      const agent = new HttpsProxyAgent(fixieUrl);
      const res = await new Promise<{ status: number; text: string }>((resolve, reject) => {
        const req = https.get('https://api.ipify.org?format=json', { agent, timeout: 8000 }, (res) => {
          let text = '';
          res.on('data', (chunk) => (text += chunk));
          res.on('end', () => resolve({ status: res.statusCode || 200, text }));
        });
        req.on('error', (err) => reject(err));
        req.end();
      });

      rawResponseText = res.text;
      try {
        const parsed = JSON.parse(res.text);
        outboundIp = parsed.ip || res.text;
      } catch {
        outboundIp = res.text;
      }
    } catch (e: any) {
      errorMsg = e?.message || 'Fixie 프록시 통신 실패';
    }
  }

  return NextResponse.json({
    status: isFixieActive ? 'FIXIE_ACTIVE' : 'FIXIE_NOT_CONFIGURED',
    is_fixie_active: isFixieActive,
    fixie_url_masked: fixieUrl ? `${fixieUrl.substring(0, 15)}...` : '환경변수 없음 (FIXIE_URL)',
    current_outbound_ip: outboundIp,
    raw_ip_response: rawResponseText,
    error: errorMsg,
    guide: isFixieActive
      ? `위 'current_outbound_ip' (${outboundIp}) 및 Fixie 대시보드(https://app.fixie.ai)의 Outbound IP 2개를 이카운트 ERP [API인증서 관리] 허용 IP에 모두 등록해야 합니다.`
      : 'Vercel Settings -> Environment Variables에서 FIXIE_URL이 설정되어 있지 않습니다.'
  });
}

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Supabase Service Role Client (RLS 우회 저장용)
function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-key";
  return createClient(supabaseUrl, supabaseServiceKey);
}

/**
 * 이카운트 ERP ➔ Supabase ecount_inventory 자동 동기화 API
 * Path: /api/ecount/sync
 * Vercel 자동 재배포 트리거 (최신 환경변수 동기화 반영)
 */
export async function POST() {
  try {
    const baseUrl = (
      process.env.ECOUNT_API_BASE_URL || 
      process.env.ECOUNT_PROXY_URL || 
      'https://beansheal-ecount.sala0104.workers.dev'
    ).replace(/\/$/, '');

    const comCode = (
      process.env.ECOUNT_ZONE_ID || 
      process.env.ECOUNT_COM_CODE || 
      process.env.ECOUNT_COMPANY_CODE || 
      ''
    ).trim();

    const userId = (
      process.env.ECOUNT_USER_ID || 
      process.env.ECOUNT_USER || 
      ''
    ).trim();

    const apiKey = (
      process.env.ECOUNT_API_KEY || 
      process.env.ECOUNT_CERT_KEY || 
      process.env.ECOUNT_USER_PASSWORD || 
      ''
    ).trim();

    if (!comCode || !userId || !apiKey) {
      return NextResponse.json(
        { 
          success: false, 
          error: '이카운트 필수 환경변수가 부족합니다.', 
          required: ['ECOUNT_ZONE_ID (또는 ECOUNT_COM_CODE)', 'ECOUNT_USER_ID', 'ECOUNT_API_KEY'] 
        },
        { status: 400 }
      );
    }

    // 1. Cloudflare Pages 프록시 주소를 통해 세션 발급 / Zone 위치 확인
    let zone = 'BA';
    let zoneDataRaw: any = null;
    try {
      const zoneRes = await fetch(`${baseUrl}/OAPI/V2/Zone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ COM_CODE: comCode }),
        cache: 'no-store'
      });
      zoneDataRaw = await zoneRes.json();
      if (zoneDataRaw?.Data?.ZONE) {
        zone = String(zoneDataRaw.Data.ZONE).trim();
      }
    } catch (e) {
      console.warn('[Ecount Sync] Zone API 호출 경고:', e);
    }

    // 2. 이카운트 OAPI 로그인 세션 발급 (/OAPI/V2/OAPILogin)
    const loginUrl = `${baseUrl}/OAPI/V2/OAPILogin`;
    const loginPayload = {
      COM_CODE: comCode,
      USER_ID: userId,
      API_CERT_KEY: apiKey,
      LAN_TYPE: 'ko-KR',
      ZONE: zone,
    };

    const loginRes = await fetch(loginUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(loginPayload),
      cache: 'no-store'
    });

    const loginData = await loginRes.json();
    const sessionId = loginData.Data?.Datas?.SESSION_ID || loginData.Data?.SESSION_ID;

    if (!sessionId) {
      const detailErr = 
        loginData.Result?.Message || 
        loginData.Errors?.[0]?.Message || 
        loginData.Data?.Message || 
        loginData.Error?.Message || 
        '이카운트 로그인 거절 (인증정보 또는 IP 승인 확인 필요)';

      return NextResponse.json(
        { 
          success: false, 
          error: `이카운트 로그인 거절: ${detailErr}`,
          diagnostics: {
            com_code_used: comCode ? `${comCode.substring(0, 2)}***` : '없음',
            user_id_used: userId ? `${userId.substring(0, 2)}***` : '없음',
            api_key_length: apiKey ? apiKey.length : 0,
            zone_used: zone,
            proxy_url_used: baseUrl,
            ecount_login_response: loginData,
            ecount_zone_response: zoneDataRaw
          },
          solution_checklist: [
            "1. ECOUNT_ZONE_ID (회사코드 6자리)가 맞는지 확인",
            "2. ECOUNT_USER_ID (이카운트 사용자 ID)가 맞는지 확인",
            "3. ECOUNT_API_KEY 에 일반 비밀번호가 아닌 [API 인증키]가 들어갔는지 확인",
            "4. 이카운트 [셀프커스터마이징 ➔ 정보관리 ➔ API인증서 관리] 에서 API 인증키 상태가 '사용중'인지 확인"
          ]
        },
        { status: 401 }
      );
    }

    // 3. 재고 현황 조회 (/OAPI/V2/InventoryBalance/GetListInventoryBalanceStatus)
    const today = new Date();
    const kstTime = new Date(today.getTime() + 9 * 60 * 60 * 1000);
    const baseDate = `${kstTime.getUTCFullYear()}${String(kstTime.getUTCMonth() + 1).padStart(2, '0')}${String(kstTime.getUTCDate()).padStart(2, '0')}`;

    const invUrl = `${baseUrl}/OAPI/V2/InventoryBalance/GetListInventoryBalanceStatus?SESSION_ID=${sessionId}`;
    const invRes = await fetch(invUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        SESSION_ID: sessionId,
        COM_CODE: comCode,
        BASE_DATE: baseDate,
        DATA: {
          BASE_DATE: baseDate,
          WH_CD: '',
          PROD_CD: '',
        },
      }),
      cache: 'no-store'
    });

    const invData = await invRes.json();
    const rawList = invData.Data?.Result || invData.Data?.List || invData.Data || [];

    if (!Array.isArray(rawList)) {
      return NextResponse.json(
        { success: false, error: '이카운트에서 올바른 재고 목록 데이터를 받지 못했습니다.', rawResponse: invData },
        { status: 500 }
      );
    }

    // 4. Supabase ecount_inventory 테이블에 item_code (UNIQUE) 기준 Upsert 수행
    const upsertRows = rawList
      .map((item: any) => {
        const itemCode = String(item.PROD_CD || item.item_code || '').trim();
        const itemName = String(item.PROD_DES || item.item_name || itemCode).trim();
        const spec = String(item.SIZE_DES || item.spec || '-').trim();
        const qty = Number(item.BAL_QTY ?? item.qty ?? 0);

        return {
          item_code: itemCode,
          item_name: itemName,
          spec: spec,
          qty: isNaN(qty) ? 0 : qty,
          updated_at: new Date().toISOString(),
        };
      })
      .filter((row) => !!row.item_code);

    if (upsertRows.length === 0) {
      return NextResponse.json({
        success: true,
        message: '동기화할 재고 항목이 없습니다. (조회 데이터 0건)',
        count: 0,
      });
    }

    const supabase = getSupabaseClient();
    const { error: dbError } = await supabase
      .from('ecount_inventory')
      .upsert(upsertRows, { onConflict: 'item_code' });

    if (dbError) {
      console.error('Supabase ecount_inventory upsert error:', dbError);
      return NextResponse.json(
        { success: false, error: `Supabase DB 저장 실패: ${dbError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `이카운트 재고 ${upsertRows.length}건이 성공적으로 Supabase ecount_inventory 테이블에 동기화되었습니다.`,
      count: upsertRows.length,
      synced_at: new Date().toISOString(),
    });

  } catch (error: any) {
    console.error('[Ecount Sync Route Error]:', error);
    return NextResponse.json(
      { success: false, error: error.message || '서버 내부 오류' },
      { status: 500 }
    );
  }
}

// 브라우저에서 편리하게 테스트할 수 있는 GET 요청 지원
export async function GET() {
  return POST();
}
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { ecountPost } from '@/lib/ecountClient';

// Fixie 고정 IP 프록시 지원 HTTP POST 함수 (Vercel -> Fixie Static IPv4 -> Ecount 다이렉트 통신)
async function fetchWithEgressProxy(url: string, body: any, headersExtra: Record<string, string> = {}) {
  const res = await ecountPost(url, body, headersExtra);
  if (res.data) return res.data;
  return { rawText: res.text, error: "이카운트 응답이 올바른 JSON 형식이 아닙니다." };
}

// Supabase Service Role Client (RLS 우회 저장용)
function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-key";
  return createClient(supabaseUrl, supabaseServiceKey);
}

/**
 * 이카운트 ERP ➔ Supabase ecount_inventory Vercel 배포용 자동 동기화 API
 * Path: /api/ecount/sync
 * Vercel 배포 환경 (Fixie Static Egress / Cloudflare Proxy 프록시 이중 지원)
 */
export async function POST() {
  try {
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

    // 1. Zone 및 프록시 호스트 세팅 (Zone API 중복 호출 생략하여 통신속도 2배 단축)
    const isFixieActive = !!(process.env.FIXIE_URL || process.env.FIXIE_SOCKS_HOST);
    const zone = (process.env.ECOUNT_ZONE || 'AC').toUpperCase().trim();
    
    const targetHost = isFixieActive 
      ? `https://oapi${zone.toLowerCase()}.ecount.com`
      : (process.env.ECOUNT_API_BASE_URL || 'https://beansheal-ecount.sala0104.workers.dev').replace(/\/$/, '');

    // 2. 이카운트 OAPI 로그인 세션 발급 (/OAPI/V2/OAPILogin)
    const loginUrl = `${targetHost}/OAPI/V2/OAPILogin`;
    const loginPayload = {
      COM_CODE: comCode,
      USER_ID: userId,
      API_CERT_KEY: apiKey,
      LAN_TYPE: 'ko-KR',
      ZONE: zone,
    };

    const loginData = await fetchWithEgressProxy(loginUrl, loginPayload, { 'X-Ecount-Zone': zone });
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
            is_fixie_active: isFixieActive,
            target_url_used: loginUrl,
            ecount_login_response: loginData
          }
        },
        { status: 401 }
      );
    }

    // 3. 재고 현황 조회 (/OAPI/V2/InventoryBalance/GetListInventoryBalanceStatus)
    const today = new Date();
    const kstTime = new Date(today.getTime() + 9 * 60 * 60 * 1000);
    const baseDate = `${kstTime.getUTCFullYear()}${String(kstTime.getUTCMonth() + 1).padStart(2, '0')}${String(kstTime.getUTCDate()).padStart(2, '0')}`;

    const invUrl = `${targetHost}/OAPI/V2/InventoryBalance/GetListInventoryBalanceStatus?SESSION_ID=${sessionId}`;
    const invData = await fetchWithEgressProxy(invUrl, {
      SESSION_ID: sessionId,
      COM_CODE: comCode,
      BASE_DATE: baseDate,
      DATA: {
        BASE_DATE: baseDate,
        WH_CD: '',
        PROD_CD: '',
      },
    }, { 'X-Ecount-Zone': zone });

    const rawList = invData.Data?.Result || invData.Data?.List || invData.Data || [];

    if (!Array.isArray(rawList)) {
      return NextResponse.json(
        { success: false, error: '이카운트에서 올바른 재고 목록 데이터를 받지 못했습니다.', rawResponse: invData },
        { status: 500 }
      );
    }

    // 4. Supabase ecount_items 및 ecount_inventory 병렬(Parallel) Upsert 수행
    const masterRows = rawList
      .map((item: any) => {
        const prodCd = String(item.PROD_CD || item.item_code || '').trim();
        const prodNm = String(item.PROD_DES || item.item_name || prodCd).trim();
        const rawQtyStr = String(item.BAL_QTY ?? item.qty ?? '0').replace(/,/g, '').trim();
        const qty = Number(rawQtyStr);

        return {
          prod_cd: prodCd,
          prod_nm: prodNm,
          total_qty: isNaN(qty) ? 0 : qty,
          last_synced_at: new Date().toISOString(),
        };
      })
      .filter((row) => !!row.prod_cd);

    if (masterRows.length === 0) {
      return NextResponse.json({
        success: true,
        message: '동기화할 재고 항목이 없습니다. (조회 데이터 0건)',
        count: 0,
      });
    }

    const inventoryRows = rawList
      .map((item: any) => {
        const prodCd = String(item.PROD_CD || item.item_code || '').trim();
        const prodNm = String(item.PROD_DES || item.item_name || prodCd).trim();
        const lotNo = String(item.LOT_NO || item.lot_no || prodCd).trim();
        const rawQtyStr = String(item.BAL_QTY ?? item.qty ?? '0').replace(/,/g, '').trim();
        const qty = Number(rawQtyStr);

        return {
          item_name: prodNm,
          lot_no: lotNo,
          quantity: isNaN(qty) ? 0 : qty,
          status: '정상'
        };
      })
      .filter((row) => !!row.item_name);

    const supabase = getSupabaseClient();
    
    // ecount_items 및 ecount_inventory 병렬 저장으로 속도 극대화
    await Promise.all([
      supabase.from('ecount_items').upsert(masterRows, { onConflict: 'prod_cd' }),
      supabase.from('ecount_inventory').upsert(inventoryRows)
    ]);

    return NextResponse.json({
      success: true,
      message: `이카운트 재고 ${masterRows.length}건이 성공적으로 Supabase 테이블에 동기화되었습니다. (Vercel 배포 환경)`,
      count: masterRows.length,
      synced_at: new Date().toISOString(),
      is_fixie_active: isFixieActive
    });

  } catch (error: any) {
    console.error('[Ecount Sync Vercel Error]:', error);
    return NextResponse.json(
      { success: false, error: error.message || '서버 내부 오류' },
      { status: 500 }
    );
  }
}

// Vercel Cron Jobs 및 브라우저 테스트를 위한 GET 지원
export async function GET() {
  return POST();
}
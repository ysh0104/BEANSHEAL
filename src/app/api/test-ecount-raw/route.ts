import { NextResponse } from 'next/server';
import { ecountPost } from '@/lib/ecountClient';

export async function GET() {
  try {
    const comCode = (process.env.ECOUNT_ZONE_ID || process.env.ECOUNT_COM_CODE || process.env.ECOUNT_COMPANY_CODE || '').trim();
    const userId = (process.env.ECOUNT_USER_ID || process.env.ECOUNT_USER || '').trim();
    const apiKey = (process.env.ECOUNT_API_KEY || process.env.ECOUNT_CERT_KEY || process.env.ECOUNT_USER_PASSWORD || '').trim();
    const zone = (process.env.ECOUNT_ZONE || 'AC').toUpperCase().trim();
    const isFixieActive = !!(process.env.FIXIE_URL || process.env.FIXIE_SOCKS_HOST);

    const targetHost = isFixieActive 
      ? `https://oapi${zone.toLowerCase()}.ecount.com`
      : (process.env.ECOUNT_API_BASE_URL || 'https://beansheal-ecount.sala0104.workers.dev').replace(/\/$/, '');

    // 1. Login
    const loginUrl = `${targetHost}/OAPI/V2/OAPILogin`;
    const loginRes = await ecountPost(loginUrl, {
      COM_CODE: comCode,
      USER_ID: userId,
      API_CERT_KEY: apiKey,
      LAN_TYPE: 'ko-KR',
      ZONE: zone,
    }, { 'X-Ecount-Zone': zone });

    const sessionId = loginRes.data?.Data?.Datas?.SESSION_ID || loginRes.data?.Data?.SESSION_ID;
    if (!sessionId) {
      return NextResponse.json({ success: false, error: 'Login failed', loginRes });
    }

    // 2. Fetch Location Stock API
    const locUrl = `${targetHost}/OAPI/V2/InventoryBalance/GetListInventoryBalanceStatusByLocation?SESSION_ID=${sessionId}`;
    const today = new Date();
    const baseDate = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
    
    const locRes = await ecountPost(locUrl, {
      SESSION_ID: sessionId,
      COM_CODE: comCode,
      BASE_DATE: baseDate,
      DATA: { BASE_DATE: baseDate, WH_CD: '', PROD_CD: '', ZERO_INCL_YN: 'Y', USE_DECIMAL_YN: 'Y', DECIMAL_PRECISION: '4', UNIT_TYPE: '1' }
    }, { 'X-Ecount-Zone': zone });

    // 3. Test multiple Item Master Endpoints
    const masterEndpoints = [
      '/OAPI/V2/InventoryBasic/GetListItem',
      '/OAPI/V2/InventoryBasic/GetListBasicItem',
      '/OAPI/V2/Item/GetList',
      '/OAPI/V2/Product/GetList',
      '/OAPI/V2/Master/GetListProduct'
    ];

    const masterResults: Record<string, any> = {};

    for (const ep of masterEndpoints) {
      try {
        const url = `${targetHost}${ep}?SESSION_ID=${sessionId}`;
        const res = await ecountPost(url, {
          SESSION_ID: sessionId,
          COM_CODE: comCode,
          DATA: { PROD_CD: '' }
        }, { 'X-Ecount-Zone': zone });

        const list = res.data?.Data?.Result || res.data?.Data?.List || res.data?.Data || [];
        if (Array.isArray(list) && list.length > 0) {
          masterResults[ep] = { count: list.length, sample: list.slice(0, 5) };
        } else {
          masterResults[ep] = { error: res.data?.Result?.Message || res.data?.Message || 'Empty or error', res: res.data };
        }
      } catch (e: any) {
        masterResults[ep] = { error: e.message };
      }
    }

    return NextResponse.json({
      success: true,
      sessionId,
      masterResults,
    });

  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message || String(e) }, { status: 500 });
  }
}

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

    const today = new Date();
    const baseDate = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;

    // 2. Fetch Stock APIs with max page size and combined parameters
    const stockEndpoints = [
      '/OAPI/V2/InventoryBalance/GetListInventoryBalanceStatus',
      '/OAPI/V2/InventoryBalance/GetListInventoryBalanceStatusByLocation',
      '/OAPI/V2/InventoryBalance/GetListInventoryBalanceStatusByLot',
      '/OAPI/V2/InventoryBalance/GetListInventoryBalanceStatusLocation'
    ];

    const stockCounts: Record<string, any> = {};

    for (const ep of stockEndpoints) {
      try {
        const url = `${targetHost}${ep}?SESSION_ID=${sessionId}`;
        const res = await ecountPost(url, {
          SESSION_ID: sessionId,
          COM_CODE: comCode,
          BASE_DATE: baseDate,
          DATA: {
            BASE_DATE: baseDate,
            WH_CD: '',
            PROD_CD: '',
            ZERO_INCL_YN: 'Y',
            USE_DECIMAL_YN: 'Y',
            DECIMAL_PRECISION: '4',
            UNIT_TYPE: '1',
            PAGE_SIZE: '5000',
            PAGE_NO: '1'
          }
        }, { 'X-Ecount-Zone': zone });

        const list = res.data?.Data?.Result || res.data?.Data?.List || res.data?.Data || [];
        stockCounts[ep] = {
          count: Array.isArray(list) ? list.length : 0,
          sample: Array.isArray(list) ? list.slice(0, 3) : null,
          resMsg: res.data?.Result?.Message || res.data?.Message
        };
      } catch (e: any) {
        stockCounts[ep] = { error: e.message };
      }
    }

    // 3. Test multiple Item Master Endpoints and Payloads
    const testCases = [
      { ep: '/OAPI/V2/InventoryBasic/GetListItem', body: { PROD_CD: '' } },
      { ep: '/OAPI/V2/InventoryBasic/GetListItem', body: { PROD_CD: '', USE_YN: 'Y' } },
      { ep: '/OAPI/V2/InventoryBasic/GetListItem', body: { PROD_CD: '', DEL_YN: 'N' } },
      { ep: '/OAPI/V2/InventoryBasic/GetListBasicItem', body: { PROD_CD: '' } },
      { ep: '/OAPI/V2/Item/GetList', body: { PROD_CD: '' } },
      { ep: '/OAPI/V2/InventoryBasic/GetListProductMaster', body: { PROD_CD: '' } },
      { ep: '/OAPI/V2/Product/GetList', body: { PROD_CD: '' } },
    ];

    const masterResults: Record<string, any> = {};

    for (let i = 0; i < testCases.length; i++) {
      const tc = testCases[i];
      const key = `${i + 1}. ${tc.ep} (${JSON.stringify(tc.body)})`;
      try {
        const url = `${targetHost}${tc.ep}?SESSION_ID=${sessionId}`;
        const res = await ecountPost(url, {
          SESSION_ID: sessionId,
          COM_CODE: comCode,
          DATA: tc.body
        }, { 'X-Ecount-Zone': zone });

        const list = res.data?.Data?.Result || res.data?.Data?.List || res.data?.Data || [];
        if (Array.isArray(list) && list.length > 0) {
          masterResults[key] = { success: true, count: list.length, sample: list.slice(0, 5) };
        } else {
          masterResults[key] = { success: false, msg: res.data?.Result?.Message || res.data?.Message || 'Empty or Error', raw: res.data };
        }
      } catch (e: any) {
        masterResults[key] = { success: false, error: e.message };
      }
    }

    return NextResponse.json({
      success: true,
      sessionId,
      stockCounts,
      masterResults,
    });

  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message || String(e) }, { status: 500 });
  }
}

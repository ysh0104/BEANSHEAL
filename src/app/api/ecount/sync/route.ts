import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { ecountPost } from '@/lib/ecountClient';
import { isFixieConfigured } from '@/lib/fixie';

export const runtime = 'nodejs';

// Fixie 고정 IP 프록시 지원 HTTP POST 함수 (Vercel -> Fixie Static IPv4 -> Ecount 다이렉트 통신)
async function fetchWithEgressProxy(url: string, body: any, headersExtra: Record<string, string> = {}) {
  const res = await ecountPost(url, body, headersExtra);
  if (res.data) return res.data;
  return { rawText: res.text, error: "이카운트 응답이 올바른 JSON 형식이 아닙니다." };
}

// Supabase Service Role Client (RLS 우회 저장용)
function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
  const supabaseServiceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    "placeholder-key";
  return createClient(supabaseUrl, supabaseServiceKey);
}

/**
 * 이카운트 ERP ➔ Supabase ecount_inventory Vercel 배포용 자동 동기화 API
 * Path: /api/ecount/sync
 */
export async function POST() {
  try {
    // 1️⃣ 환경 변수 검증
    const comCode = (process.env.ECOUNT_ZONE_ID || process.env.ECOUNT_COM_CODE || process.env.ECOUNT_COMPANY_CODE || "").trim();
    const userId = (process.env.ECOUNT_USER_ID || process.env.ECOUNT_USER || "").trim();
    const apiKey = (process.env.ECOUNT_API_KEY || process.env.ECOUNT_CERT_KEY || process.env.ECOUNT_USER_PASSWORD || "").trim();

    if (!comCode || !userId || !apiKey) {
      return NextResponse.json(
        {
          success: false,
          error: "이카운트 필수 환경변수가 부족합니다.",
          required: ["ECOUNT_ZONE_ID (또는 ECOUNT_COM_CODE)", "ECOUNT_USER_ID", "ECOUNT_API_KEY"]
        },
        { status: 400 }
      );
    }

    // 2️⃣ 프록시/호스트 설정
    const isFixieActive = isFixieConfigured();
    const zone = (process.env.ECOUNT_ZONE || "AC").toUpperCase().trim();
    const targetHost = isFixieActive
      ? `https://oapi${zone.toLowerCase()}.ecount.com`
      : (process.env.ECOUNT_API_BASE_URL || "https://beansheal-ecount.sala0104.workers.dev").replace(/\/$/, "");

    // 3️⃣ 로그인 및 세션 획득
    const loginUrl = `${targetHost}/OAPI/V2/OAPILogin`;
    const loginPayload = {
      COM_CODE: comCode,
      USER_ID: userId,
      API_CERT_KEY: apiKey,
      LAN_TYPE: "ko-KR",
      ZONE: zone
    };
    const loginData = await fetchWithEgressProxy(loginUrl, loginPayload, { "X-Ecount-Zone": zone });
    const sessionId = loginData.Data?.Datas?.SESSION_ID || loginData.Data?.SESSION_ID;
    if (!sessionId) {
      const detailErr =
        loginData.Result?.Message ||
        loginData.Errors?.[0]?.Message ||
        loginData.Data?.Message ||
        loginData.Error?.Message ||
        "이카운트 로그인 거절 (인증정보 또는 IP 승인 필요)";
      const isIpError = /허용되지 않은 IP|IP등록|unauthorized ip/i.test(detailErr);
      return NextResponse.json(
        {
          success: false,
          error: `이카운트 로그인 거절: ${detailErr}`,
          diagnostics: {
            com_code_used: comCode ? `${comCode.substring(0, 2)}***` : "없음",
            user_id_used: userId ? `${userId.substring(0, 2)}***` : "없음",
            api_key_length: apiKey ? apiKey.length : 0,
            zone_used: zone,
            is_fixie_active: isFixieActive,
            target_url_used: loginUrl,
            ecount_login_response: loginData,
            ...(isIpError && {
              fix_guide: isFixieActive
                ? "FIXIE_URL이 설정되어 있습니다. Vercel 배포 URL의 /api/debug-fixie 에서 'current_outbound_ip' 2개를 확인한 뒤, 이카운트 ERP > API인증키발급 > IP등록에 모두 추가하세요. (54.x 대역은 Vercel 동적 IP이므로 등록하지 마세요)"
                : "사무실 PC 프록시(ECOUNT_API_BASE_URL) 또는 Fixie(FIXIE_URL)를 설정하고, 해당 고정 IP를 이카운트 ERP > API인증키발급 > IP등록에 추가하세요.",
            }),
          }
        },
        { status: 401 }
      );
    }

    // 4️⃣ 재고 데이터 페이지네이션 (2건씩)
    const today = new Date();
    const kstTime = new Date(today.getTime() + 9 * 60 * 60 * 1000);
    const baseDate = `${kstTime.getUTCFullYear()}${String(kstTime.getUTCMonth() + 1).padStart(2, "0")}${String(kstTime.getUTCDate()).padStart(2, "0")}`;

    const candidateEndpoints = [
      "/OAPI/V2/InventoryBalance/GetListInventoryBalanceStatusByLocation",
      "/OAPI/V2/InventoryBalance/GetListInventoryBalanceStatusLocation",
      "/OAPI/V2/InventoryBalance/GetListInventoryBalanceStatusByLot",
      "/OAPI/V2/InventoryBalance/GetListInventoryBalanceStatus"
    ];

    const combinedListMap = new Map<string, any>();
    let usedEndpoint = "";
    const pageSize = 200; // 이카운트 API 페이지당 최대 200건

    for (const ep of candidateEndpoints) {
      let pageNo = 1;
      while (true) {
        const epUrl = `${targetHost}${ep}?SESSION_ID=${sessionId}`;
        const payload = {
          SESSION_ID: sessionId,
          COM_CODE: comCode,
          BASE_DATE: baseDate,
          DATA: { PAGE_NO: String(pageNo), PAGE_SIZE: String(pageSize) }
        };
        let resData: any;
        try {
          resData = await fetchWithEgressProxy(epUrl, payload, { "X-Ecount-Zone": zone });
        } catch (e) {
          console.warn(`[Ecount Sync] Endpoint ${ep} proxy fetch failed:`, e);
          break;
        }
        const list = resData.Data?.Result || resData.Data?.List || resData.Data || [];
        if (!Array.isArray(list) || list.length === 0) break;
        list.forEach((row: any) => {
          const key = String(row.PROD_CD || row.PROD_NO || row.CODE || row.ITEM_CD || "").trim();
          if (key && !combinedListMap.has(key)) {
            combinedListMap.set(key, row);
          }
        });
        usedEndpoint = usedEndpoint ? `${usedEndpoint}, ${ep}` : ep;
        console.log(`[Ecount Sync] ${ep} page ${pageNo} fetched ${list.length} rows`);
        if (list.length < pageSize) break; // 마지막 페이지
        pageNo++;
      }
    }

    const rawList = Array.from(combinedListMap.values());
    if (rawList.length === 0) {
      return NextResponse.json({
        success: false,
        error: "이카운트 정밀 재고 API에서 목록 데이터를 수집하지 못했습니다."
      }, { status: 500 });
    }

    // 5️⃣ 품목 마스터 전체 페이지네이션 (2건씩) 및 매핑 구축
    const itemMasterMap = new Map<string, string>();
    const itemMasterEp = `${targetHost}/OAPI/V2/InventoryBasic/GetListItem?SESSION_ID=${sessionId}`;
    let masterPageNo = 1;
    while (true) {
      const masterPayload = {
        SESSION_ID: sessionId,
        COM_CODE: comCode,
        PAGE_NO: String(masterPageNo),
        PAGE_SIZE: String(pageSize),
        DATA: { PROD_CD: "" }
      };
      let masterRes: any;
      try {
        masterRes = await fetchWithEgressProxy(itemMasterEp, masterPayload, { "X-Ecount-Zone": zone });
      } catch (e) {
        console.warn("[Ecount Item Master] Proxy fetch failed:", e);
        break;
      }
      const masterList = masterRes.Data?.Result || masterRes.Data?.List || masterRes.Data || [];
      if (!Array.isArray(masterList) || masterList.length === 0) break;
      masterList.forEach((mItem: any) => {
        const mCd = String(mItem.PROD_CD || mItem.PROD_NO || mItem.CODE || mItem.ITEM_CD || "").trim();
        const mNm = String(
          mItem.PROD_DES ||
            mItem.PROD_NM ||
            mItem.PROD_NAME ||
            mItem.ITEM_DES ||
            mItem.DES ||
            mItem.REMARKS ||
            ""
        ).trim();
        if (mCd && mNm) itemMasterMap.set(mCd, mNm);
      });
      console.log(`[Ecount Item Master] page ${masterPageNo} mapped ${masterList.length} items.`);
      if (masterList.length < pageSize) break; // 마지막 페이지
      masterPageNo++;
    }
    console.log(`[Ecount Item Master] 전체 매핑된 품목명 수: ${itemMasterMap.size}`);

    // 6️⃣ 기존 supabase 마스터와 로트 테이블 보강
    try {
      const supabase = getSupabaseClient();
      const { data: invData } = await supabase.from("ecount_inventory").select("item_name, lot_no").limit(10000);
      if (invData) {
        invData.forEach((row: any) => {
          if (row.item_name && row.lot_no) {
            const lot = String(row.lot_no).trim();
            const name = String(row.item_name).trim();
            if (lot && name && !itemMasterMap.has(lot)) {
              itemMasterMap.set(lot, name);
            }
          }
        });
      }
    } catch (e) {}

    try {
      const supabase = getSupabaseClient();
      const { data: userMaster } = await supabase.from("ecount_items_master").select("prod_cd, prod_nm");
      if (userMaster) {
        userMaster.forEach((u: any) => {
          if (u.prod_cd && u.prod_nm) {
            itemMasterMap.set(String(u.prod_cd).trim(), String(u.prod_nm).trim());
          }
        });
      }
      const { data: existingItems } = await supabase.from("ecount_items").select("prod_cd, prod_nm");
      if (existingItems) {
        existingItems.forEach((e: any) => {
          const cd = String(e.prod_cd || "").trim();
          const nm = String(e.prod_nm || "").trim();
          if (cd && nm && cd !== nm) itemMasterMap.set(cd, nm);
        });
      }
    } catch (e) {}

    // 7️⃣ 품목별 재고 합산 (소수점 보존)
    const productQtyMap = new Map<string, { prodNm: string; totalQty: number }>();
    for (const item of rawList) {
      const rawCd = String(
        item.PROD_CD ||
          item.PROD_NO ||
          item.CODE ||
          item.ITEM_CD ||
          item.item_code ||
          ""
      ).trim();
      let rawNm = String(
        item.PROD_SIZE_DES ||
          item.PROD_DES ||
          item.PROD_NM ||
          item.PROD_NAME ||
          item.ITEM_DES ||
          item.DES ||
          item.item_name ||
          ""
      ).trim();
      // 매핑에 존재하면 이름 교체
      if (rawCd && itemMasterMap.has(rawCd)) {
        rawNm = itemMasterMap.get(rawCd)!;
      }
      const sizeDes = String(item.SIZE_DES || item.SIZE || "").trim();
      if (sizeDes && rawNm && !rawNm.includes(sizeDes)) {
        rawNm = `${rawNm} [${sizeDes}]`;
      }
      if (!rawCd && !rawNm) continue;
      const prodCd = rawCd || rawNm;
      const prodNm = rawNm || prodCd;
      const rawQtyVal = item.BAL_QTY ?? item.BAL_QTY_TOT ?? item.QTY ?? item.qty ?? "0";
      const rawQtyStr = String(rawQtyVal).replace(/,/g, "").trim();
      const qty = Number(rawQtyStr);
      const safeQty = isNaN(qty) ? 0 : qty;
      if (productQtyMap.has(prodCd)) {
        const prev = productQtyMap.get(prodCd)!;
        productQtyMap.set(prodCd, {
          prodNm: prev.prodNm || prodNm,
          totalQty: Number((prev.totalQty + safeQty).toFixed(4))
        });
      } else {
        productQtyMap.set(prodCd, { prodNm, totalQty: safeQty });
      }
    }
    const masterRows = Array.from(productQtyMap.entries()).map(([prodCd, info]) => ({
      prod_cd: prodCd,
      prod_nm: info.prodNm,
      total_qty: info.totalQty,
      last_synced_at: new Date().toISOString()
    }));
    if (masterRows.length === 0) {
      return NextResponse.json({ success: true, message: "동기화할 재고 항목이 없습니다. (조회 데이터 0건)", count: 0 });
    }
    const supabase = getSupabaseClient();
    // 기존 데이터 전체 삭제 (중복 방지)
    const { error: delErr } = await supabase.from("ecount_items").delete().neq("prod_cd", "___IMPOSSIBLE_CD___");
    if (delErr) console.warn("[ecount_items clear warning]", delErr.message);
    // 신규 데이터 upsert
    const { error: masterErr } = await supabase.from("ecount_items").upsert(masterRows, { onConflict: "prod_cd" });
    if (masterErr) throw masterErr;
    return NextResponse.json({
      success: true,
      message: `이카운트 품목/재고 ${masterRows.length}건이 성공적으로 마스터 DB(ecount_items)에 동기화되었습니다.`,
      count: masterRows.length,
      usedEndpoint,
      rawSample: rawList.slice(0, 10),
      parsedSample: masterRows.slice(0, 10),
      synced_at: new Date().toISOString(),
      is_fixie_active: isFixieActive
    });
  } catch (error: any) {
    console.error("[Ecount Sync Vercel Error]", error);
    return NextResponse.json({ success: false, error: error.message || "서버 내부 오류" }, { status: 500 });
  }
}

// Vercel Cron Jobs 및 브라우저 테스트를 위한 GET 지원
export async function GET() {
  return POST();
}
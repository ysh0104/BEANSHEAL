"use server"

import { supabase } from "@/lib/supabase"; 
import { ecountPost, getEcountProxyBaseUrl, ecountFetchHeaders } from "@/lib/ecountClient";

export { getEcountProxyBaseUrl, ecountFetchHeaders };

/** 세션 HOST_URL 대신 항상 프록시로 호출 (사무실 고정 IP 관문) */
async function ecountApiUrl(pathWithQuery: string) {
  const path = pathWithQuery.startsWith("/") ? pathWithQuery : `/${pathWithQuery}`;
  const base = await getEcountProxyBaseUrl();
  return `${base}${path}`;
}

// 1. 이카운트 로그인 및 세션 발급
export async function getSessionId() {
  const COM_CODE = process.env.ECOUNT_COM_CODE || process.env.ECOUNT_COMPANY_CODE || process.env.ECOUNT_COM_CD;
  const USER_ID = process.env.ECOUNT_USER_ID || process.env.ECOUNT_USER || process.env.ECOUNT_ID;
  const API_KEY = process.env.ECOUNT_API_KEY || process.env.ECOUNT_CERT_KEY || process.env.ECOUNT_API_CERT_KEY || process.env.ECOUNT_KEY;

  const proxyBaseUrl = await getEcountProxyBaseUrl();

  console.log("=== [DEBUG] getSessionId 환경변수 검증 ===");
  console.log("ECOUNT_COM_CODE:", COM_CODE ? `${COM_CODE.substring(0, 2)}*** (길이: ${COM_CODE.length})` : "undefined / 누락");
  console.log("ECOUNT_USER_ID:", USER_ID ? `${USER_ID.substring(0, 2)}*** (길이: ${USER_ID.length})` : "undefined / 누락");
  console.log("ECOUNT_API_KEY:", API_KEY ? `${API_KEY.substring(0, Math.min(4, API_KEY.length))}*** (길이: ${API_KEY.length})` : "undefined / 누락");
  console.log("ECOUNT_API_BASE_URL:", proxyBaseUrl);
  console.log("=========================================");

  if (!COM_CODE || !USER_ID || !API_KEY) {
    return { 
      error: `Vercel 환경변수가 부족합니다. (COM_CODE: ${!!COM_CODE}, USER_ID: ${!!USER_ID}, API_KEY: ${!!API_KEY}). Vercel Settings -> Environment Variables에서 ECOUNT_COM_CODE, ECOUNT_USER_ID, ECOUNT_API_KEY 환경변수를 확인해주세요.` 
    };
  }

  try {
    const zoneRes = await ecountPost(`${proxyBaseUrl}/OAPI/V2/Zone`, { COM_CODE: COM_CODE });
    const zoneData = zoneRes.data || {};
    
    if (!zoneData.Data && zoneRes.text) {
      return { error: `이카운트 API 통신 오류: ${zoneRes.text.substring(0, 150)}` };
    }
    
    console.log("=== [DEBUG] ZONE API Response ===");
    console.log(JSON.stringify(zoneData, null, 2));
    
    const ZONE = zoneData.Data?.ZONE || process.env.ECOUNT_ZONE || "AC";
    const loginUrl = `${proxyBaseUrl}/OAPI/V2/OAPILogin`;

    const loginRes = await ecountPost(loginUrl, {
      COM_CODE: COM_CODE,
      USER_ID: USER_ID,
      API_CERT_KEY: API_KEY,
      LAN_TYPE: "ko-KR",
      ZONE: ZONE
    });

    const data = loginRes.data || {};
    if (!data.Status && loginRes.text) {
      return { error: `이카운트 로그인 응답 오류: ${loginRes.text.substring(0, 150)}` };
    }

    console.log("=== [DEBUG] OAPILogin API Response ===");
    console.log(JSON.stringify(data, null, 2));

    // 실서버용 API 키의 경우 응답 상태 코드(Status)가 "200" 또는 200 이고, 
    // 내부 반환 코드가 "00", "200", "204" 일 때 모두 로그인 성공으로 판단합니다.
    const successData = data.Data?.Datas || data.Data;
    const isLoginSuccess = (data.Status === "200" || data.Status === 200) && 
                           (data.Data?.Code === "00" || data.Data?.Code === "200" || data.Data?.Code === "204" || successData?.SESSION_ID);

    if (!isLoginSuccess) {
      return { error: data.Result?.Message || data.Errors?.[0]?.Message || data.Data?.Message || "이카운트 로그인 거절" };
    }

    // 후속 API가 이카운트 직행하지 않도록 HOST_URL을 프록시 호스트로 덮어씀
    try {
      const proxyHost = new URL(proxyBaseUrl).host;
      if (successData && typeof successData === "object") {
        (successData as any).HOST_URL = proxyHost;
        if ((successData as any).Datas) (successData as any).Datas.HOST_URL = proxyHost;
      }
    } catch {
      /* ignore */
    }
    
    return { Data: successData }; 
  } catch (error) {
    console.error("eCount 로그인 에러:", error);
    return { error: "통신 실패" };
  }
} 

// 2. 구매(입고) 내역 가져오기 (주소 및 규격 수리 완료)
export async function getRecentPurchases(sessionObj: any) {
  const COM_CODE = process.env.ECOUNT_COM_CODE;

  try {
    const actualSessionId = sessionObj?.SESSION_ID || sessionObj?.Datas?.SESSION_ID;
    const hostUrl = sessionObj?.HOST_URL || sessionObj?.Datas?.HOST_URL || "sboapiac.ecount.com";

    if (!actualSessionId) {
      return { isError: true, message: "이카운트 세션 ID를 찾을 수 없습니다." };
    }

    const today = new Date();
    const oneMonthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000); 

    const formatDate = (date: Date) => {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      return `${y}${m}${d}`;
    };

    const requestUrl = await ecountApiUrl(`/OAPI/V2/Purchases/GetListPurchases?SESSION_ID=${actualSessionId}`);
    const headers = await ecountFetchHeaders();

    const response = await fetch(requestUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        SESSION_ID: actualSessionId, 
        COM_CODE: COM_CODE,
        DATA: {
          FROM_DATE: formatDate(oneMonthAgo), 
          TO_DATE: formatDate(today),      
        }
      }),
    });

    const textData = await response.text();

    // ===================================================================
    // 원본 데이터를 무조건 터미널에 강제로 출력하는 디버깅 코드입니다.
    console.log("=== 이카운트 원본 응답 강제 출력 ===");
    console.log(textData);
    console.log("=====================================");
    // ===================================================================

    let result;
    try {
      result = JSON.parse(textData);
    } catch (parseError) {
      console.error("[API 응답 파싱 실패]:", textData.substring(0, 100));
      return { isError: true, message: "이카운트 서버에서 올바른 데이터를 반환하지 않았습니다." };
    }

    if (result.Status !== "200") {
      return { isError: true, message: result.Errors?.[0]?.Message || "이카운트 통신 오류" };
    }

    if (result.Data?.Result || result.Data?.List) {
      const rawList = result.Data.Result || result.Data.List;

      const sortedList = rawList.sort((a: any, b: any) => {
        const dateA = a.U_TXT2 || a.IO_DATE || "";
        const dateB = b.U_TXT2 || b.IO_DATE || "";
        return dateB.localeCompare(dateA); 
      });

      return sortedList.map((item: any) => {
        const formatKoreanDate = (rawDate: string) => {
          if (!rawDate || rawDate.length < 8) return rawDate || "일자미상";
          return `${rawDate.slice(0,4)}년 ${rawDate.slice(4,6)}월 ${rawDate.slice(6,8)}일`;
        };

        return {
          prodCd: item.PROD_CD,
          productName: item.PROD_DES,
          testDate: formatKoreanDate(item.IO_DATE || item.PROD_DT),
          lotNo: item.REMARKS || item.U_TXT1 || item.SERIAL_NO || item.LOT_NO || "LOT미상", 
          mfgDate: formatKoreanDate(item.U_TXT2) || "제조일자미상",
          qty: item.QTY ? item.QTY.toLocaleString() : '0' 
        };
      });
    }
    
    return [];
  } catch (error: any) {
    console.error("이카운트 입고내역 조회 실패:", error);
    return { isError: true, message: error.message };
  }
}

// 3. 이카운트 구매내역과 DB 예약내역 자동 매칭 및 완료 처리
export async function syncInboundWithEcount() {
  try {
    const { data: schedules, error: schedError } = await supabase
      .from('inbound_schedule')
      .select('*')
      .eq('status', '대기');

    if (schedError) throw schedError;
    if (!schedules || schedules.length === 0) return { success: true, message: "대기 중인 예약 내역이 없습니다." };

    const sessionRes = await getSessionId();
    if (!sessionRes || !sessionRes.Data) throw new Error("이카운트 세션 획득 실패 (로그인 오류)");
    
    const ecountPurchases = await getRecentPurchases(sessionRes.Data);
    if (ecountPurchases.isError || !ecountPurchases || ecountPurchases.length === 0) return { success: true, message: "이카운트 최근 입고 내역이 없습니다." };

    let matchedCount = 0;

    for (const sched of schedules) {
      const safeSchedName = sched.item_name.replace(/\s/g, '');
      const expectedQty = Number(sched.expected_qty);
      
      const isMatched = ecountPurchases.find((p: any) => {
        const safeEcountName = p.productName.replace(/\s/g, '');
        const ecountQty = Number(p.qty.replace(/,/g, ''));
        
        const nameMatch = safeEcountName.includes(safeSchedName) || safeSchedName.includes(safeEcountName);
        const qtyMatch = Math.abs(ecountQty - expectedQty) < (expectedQty * 0.01);
        
        return nameMatch && qtyMatch;
      });

      if (isMatched) {
        await supabase
          .from('inbound_schedule')
          .update({ status: '완료' })
          .eq('id', sched.id);
        
        matchedCount++;
      }
    }

    return { success: true, message: `${matchedCount}건의 예약 내역이 이카운트 입고와 매칭되어 완료 처리되었습니다.` };

  } catch (error: any) {
    console.error("입고 동기화 에러:", error);
    return { success: false, error: error.message };
  }
}

// 4. 이카운트 품목 마스터(전체 품목 리스트) 가져오기
export async function getListProductDetailed(sessionObj: any): Promise<{ data: any[]; error?: string }> {
  const COM_CODE = process.env.ECOUNT_COM_CODE;
  try {
    const actualSessionId = sessionObj?.Datas?.SESSION_ID || sessionObj?.SESSION_ID;

    const requestUrl = await ecountApiUrl(`/OAPI/V2/InventoryBasic/GetBasicProductsList?SESSION_ID=${actualSessionId}`);
    const headers = await ecountFetchHeaders();

    const response = await fetch(requestUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        SESSION_ID: actualSessionId,
        COM_CODE: COM_CODE,
        DATA: {
          PROD_CD: "",
        } 
      })
    });

    const textData = await response.text();

    if (textData.includes("시간당 연속 오류") || textData.includes("QUANTITY_INFO")) {
      return {
        data: [],
        error: "이카운트 API 시간당 연속 오류 제한 초과 (이카운트 ERP [API인증서 관리] 메뉴에서 연속 오류 차단을 해제하시거나 30분~1시간 후 다시 시도해 주세요)."
      };
    }

    let result: any = {};
    try {
      const cleanText = textData.replace(/^\uFEFF/, "").trim();
      result = JSON.parse(cleanText);
    } catch (e) {
      console.error("JSON 파싱 에러:", textData.substring(0, 200));
      return { data: [], error: `응답 파싱 실패: ${textData.substring(0, 100)}` };
    }

    if (result?.Data?.QUANTITY_INFO && String(result.Data.QUANTITY_INFO).includes("연속 오류")) {
      return {
        data: [],
        error: `이카운트 제한: ${result.Data.QUANTITY_INFO} (이카운트 ERP [API인증서 관리] 메뉴에서 차단 해제 필요)`
      };
    }

    if (result?.Status && result.Status !== "200") {
      const errDetail = result.Errors?.[0]?.Message || result.Result?.Message || `Status ${result.Status}`;
      return { data: [], error: `이카운트 응답 에러 (${result.Status}): ${errDetail}` };
    }

    const dataList = result.Data?.Result || result.Data?.List || result.Data || [];
    if (!Array.isArray(dataList)) {
      const msg = result.Data?.QUANTITY_INFO || result?.Errors?.[0]?.Message || "품목 결과 데이터가 배열 형태가 아닙니다.";
      return { data: [], error: msg };
    }
    return { data: dataList };
  } catch (error: any) {
    console.error("품목 마스터 조회 에러:", error);
    return { data: [], error: error?.message || "통신 오류" };
  }
}

export async function getListProduct(sessionObj: any) {
  const res = await getListProductDetailed(sessionObj);
  return res.data;
}

// 5. 전체 품목의 현재고 현황 가져오기
export async function getInventoryStatusDetailed(sessionObj: any): Promise<{ data: any[]; error?: string }> {
  const COM_CODE = process.env.ECOUNT_COM_CODE;
  try {
    const actualSessionId = sessionObj?.Datas?.SESSION_ID || sessionObj?.SESSION_ID;

    const today = new Date();
    const kstTime = new Date(today.getTime() + (9 * 60 * 60 * 1000));
    const y = kstTime.getUTCFullYear();
    const m = String(kstTime.getUTCMonth() + 1).padStart(2, '0');
    const d = String(kstTime.getUTCDate()).padStart(2, '0');
    const baseDateString = `${y}${m}${d}`; 

    const requestUrl = await ecountApiUrl(`/OAPI/V2/InventoryBalance/GetListInventoryBalanceStatus?SESSION_ID=${actualSessionId}`);
    const headers = await ecountFetchHeaders();

    const response = await fetch(requestUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        SESSION_ID: actualSessionId,
        COM_CODE: COM_CODE,
        BASE_DATE: baseDateString, 
        DATA: {
          BASE_DATE: baseDateString,
          WH_CD: "",   
          PROD_CD: ""  
        }
      }),
    });

    const textData = await response.text(); 

    if (textData.includes("시간당 연속 오류") || textData.includes("QUANTITY_INFO")) {
      return {
        data: [],
        error: "이카운트 API 시간당 연속 오류 제한 초과 (이카운트 ERP [API인증서 관리] 메뉴에서 연속 오류 차단을 해제해 주세요)."
      };
    }

    let result: any = {};
    try {
      const cleanText = textData.replace(/^\uFEFF/, "").trim();
      result = JSON.parse(cleanText);
    } catch (e) {
      console.error("이카운트 응답 파싱 에러:", textData.substring(0, 500));
      return { data: [], error: `재고응답 파싱 실패: ${textData.substring(0, 100)}` };
    }

    if (result?.Data?.QUANTITY_INFO && String(result.Data.QUANTITY_INFO).includes("연속 오류")) {
      return {
        data: [],
        error: `이카운트 제한: ${result.Data.QUANTITY_INFO} (이카운트 ERP [API인증서 관리] 메뉴에서 차단 해제 필요)`
      };
    }

    if (result?.Status && result.Status !== "200") {
      const errDetail = result.Errors?.[0]?.Message || result.Result?.Message || `Status ${result.Status}`;
      return { data: [], error: `재고 현황 에러 (${result.Status}): ${errDetail}` };
    }

    const dataList = result.Data?.Result || result.Data?.List || result.Data;

    if (!Array.isArray(dataList)) {
      const msg = result.Data?.QUANTITY_INFO || result?.Errors?.[0]?.Message || "재고 데이터가 배열 형식이 아닙니다.";
      return { data: [], error: msg };
    }

    const productListRes = await getListProductDetailed(sessionObj);
    const productList = productListRes.data;
    const productMap: Record<string, any> = {};
    
    if (Array.isArray(productList)) {
      productList.forEach((p: any) => {
        productMap[p.PROD_CD] = {
          prodNm: p.PROD_DES,
          size: p.SIZE_DES,
          unit: p.UNIT || 'EA'
        };
      });
    }

    const mapped = dataList
      .filter((item: any) => Number(item.BAL_QTY) !== 0) 
      .map((item: any) => {
        const matchedInfo = productMap[item.PROD_CD] || {};
        return {
          prodCd: item.PROD_CD,
          prodNm: matchedInfo.prodNm || item.PROD_DES || item.PROD_CD, 
          size: matchedInfo.size || item.SIZE_DES || '-',
          qty: Number(item.BAL_QTY).toLocaleString(undefined, {
            minimumFractionDigits: 0,
            maximumFractionDigits: 3,
          }),
          unit: matchedInfo.unit || item.QTY_UNIT || 'EA'
        };
      })
      .sort((a: any, b: any) => Number(b.qty.replace(/,/g, '')) - Number(a.qty.replace(/,/g, '')));
      
    return { data: mapped };
  } catch (error: any) {
    console.error("재고 현황 조회 통신 실패:", error);
    return { data: [], error: error?.message || "통신 오류" };
  }
}

export async function getInventoryStatus(sessionObj: any) {
  const res = await getInventoryStatusDetailed(sessionObj);
  return res.data;
}

// --- 재고 현황을 강제로 찔러서 로트 번호 유무를 확인하는 디버그 함수 ---
export async function debugEcountAPI() {
  try {
    const sessionRes = await getSessionId();
    // 세션 ID 추출 경로 수정 (undefined 오류 해결)
    const actualSessionId = sessionRes?.Data?.Datas?.SESSION_ID || sessionRes?.Data?.SESSION_ID;
    const hostUrl = sessionRes?.Data?.Datas?.HOST_URL || sessionRes?.Data?.HOST_URL || "sboapiac.ecount.com";
    const COM_CODE = process.env.ECOUNT_COM_CODE;

    if (!actualSessionId) {
      return "세션 ID 추출 실패. 로그인 데이터 원본: " + JSON.stringify(sessionRes);
    }

    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    const baseDateString = `${y}${m}${d}`; 

    // 확실하게 열려있는 '재고 현황 조회' API 호출
    const requestUrl = await ecountApiUrl(`/OAPI/V2/InventoryBalance/GetListInventoryBalanceStatus?SESSION_ID=${actualSessionId}`);
    const headers = await ecountFetchHeaders();
    const response = await fetch(requestUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        SESSION_ID: actualSessionId,
        COM_CODE: COM_CODE,
        BASE_DATE: baseDateString,
        DATA: {
          BASE_DATE: baseDateString,
          WH_CD: "",   
          PROD_CD: ""  
        }
      }),
    });

    return await response.text();
  } catch (e: any) {
    return "통신 중 에러 발생: " + e.message;
  }
}

export interface EcountProductionInboundDetail {
  PROD_CD: string;       // 품목 코드 (완제품)
  QTY: number;           // 생산 수량
  WH_CD_F?: string;      // 생산된 공장 코드 (기본값: '100')
  WH_CD_T?: string;      // 받는 창고 코드 (기본값: '100')
}

// 6. 이카운트 재고I 생산입고 전표 입력 API 연동
export async function saveProductionInboundToEcount(productionData: EcountProductionInboundDetail) {
  const COM_CODE = process.env.ECOUNT_COM_CODE;
  try {
    const sessionRes: any = await getSessionId();
    const actualSessionId = sessionRes?.Data?.Datas?.SESSION_ID || sessionRes?.Data?.SESSION_ID || sessionRes?.SESSION_ID;
    const hostUrl = sessionRes?.Data?.Datas?.HOST_URL || sessionRes?.Data?.HOST_URL || sessionRes?.HOST_URL || "oapiac.ecount.com";

    console.log("=== [DEBUG] saveProductionInboundToEcount 세션 디버그 ===");
    console.log("sessionRes 원본:", JSON.stringify(sessionRes));
    console.log("actualSessionId 추출값:", actualSessionId);
    console.log("hostUrl 추출값:", hostUrl);
    console.log("======================================================");

    if (!actualSessionId) {
      return { success: false, error: "세션 ID 획득 실패. 로그인 정보나 API 상태를 확인해주세요." };
    }

    const today = new Date();
    const kstTime = new Date(today.getTime() + (9 * 60 * 60 * 1000));
    const y = kstTime.getUTCFullYear();
    const m = String(kstTime.getUTCMonth() + 1).padStart(2, '0');
    const d = String(kstTime.getUTCDate()).padStart(2, '0');
    const slipDate = `${y}${m}${d}`; // YYYYMMDD 포맷

    const requestUrl = await ecountApiUrl(`/OAPI/V2/GoodsReceipt/SaveGoodsReceipt?SESSION_ID=${actualSessionId}`);
    const headers = await ecountFetchHeaders();

    const payload = {
      SESSION_ID: actualSessionId,
      COM_CODE: COM_CODE,
      GoodsReceiptList: [
        {
          Line: "0",
          BulkDatas: {
            IO_DATE: slipDate,                           // 전표일자
            PROD_CD: productionData.PROD_CD,             // 생산완제품 품목코드
            QTY: productionData.QTY,                     // 생산수량
            WH_CD_F: productionData.WH_CD_F || "100",    // 생산된 공장 (필수)
            WH_CD_T: productionData.WH_CD_T || "100",    // 받는 창고 (필수)
          }
        }
      ]
    };

    console.log("=== 이카운트 생산입고 전송 요청 데이터 ===");
    console.log(JSON.stringify(payload, null, 2));

    const response = await fetch(requestUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    });

    const textData = await response.text();
    console.log("=== 이카운트 생산입고 응답 데이터 ===");
    console.log(textData);

    let result;
    try {
      result = JSON.parse(textData);
    } catch (parseError) {
      return { success: false, error: "이카운트 응답 분석 실패: " + textData.substring(0, 200) };
    }

    if (result.Status !== "200" || result.Error || result.Errors || result.Data?.FailCnt > 0) {
      const detailErr = result.Data?.ResultDetails?.[0]?.TotalError || result.Data?.ResultDetails?.[0]?.Errors?.[0]?.Message;
      const errMsg = detailErr || result.Result?.Message || result.Errors?.[0]?.Message || result.Data?.Result?.Message || result.Error?.Message || "이카운트 API가 전송을 거절했습니다.";
      return { success: false, error: errMsg, details: result };
    }

    return { 
      success: true, 
      message: "이카운트 재고I 생산입고 전표 입력 성공!", 
      slipNo: result.Data?.SlipNos?.[0] || result.Data?.SlipNo || result.Data?.Result?.SlipNo || "전표 생성 성공"
    };
  } catch (error: any) {
    console.error("생산입고 전표 전송 중 통신 실패:", error);
    return { success: false, error: error.message || "통신 실패" };
  }
}

export interface EcountPurchaseLine {
  PROD_CD: string;
  PROD_DES?: string;
  QTY: number;
  WH_CD?: string;
}

// 7. 이카운트 구매(입고) 전표 입력 — 발주/결품 보충용
export async function savePurchasesToEcount(lines: EcountPurchaseLine[], whCd = "100") {
  const COM_CODE = process.env.ECOUNT_COM_CODE;
  try {
    if (!lines?.length) {
      return { success: false, error: "전송할 구매 품목이 없습니다." };
    }

    const sessionRes: any = await getSessionId();
    const actualSessionId = sessionRes?.Data?.Datas?.SESSION_ID || sessionRes?.Data?.SESSION_ID || sessionRes?.SESSION_ID;
    const hostUrl = sessionRes?.Data?.Datas?.HOST_URL || sessionRes?.Data?.HOST_URL || sessionRes?.HOST_URL || "oapiac.ecount.com";

    if (!actualSessionId) {
      return { success: false, error: "세션 ID 획득 실패. 로그인 정보나 API 상태를 확인해주세요." };
    }

    const today = new Date();
    const kstTime = new Date(today.getTime() + (9 * 60 * 60 * 1000));
    const slipDate = `${kstTime.getUTCFullYear()}${String(kstTime.getUTCMonth() + 1).padStart(2, "0")}${String(kstTime.getUTCDate()).padStart(2, "0")}`;

    const requestUrl = await ecountApiUrl(`/OAPI/V2/Purchases/SavePurchases?SESSION_ID=${actualSessionId}`);
    const headers = await ecountFetchHeaders();

    const PurchasesList = lines.map((line, index) => ({
      Line: String(index),
      BulkDatas: {
        IO_DATE: slipDate,
        WH_CD: line.WH_CD || whCd,
        PROD_CD: line.PROD_CD,
        PROD_DES: line.PROD_DES || "",
        QTY: line.QTY,
      },
    }));

    const payload = {
      SESSION_ID: actualSessionId,
      COM_CODE,
      PurchasesList,
    };

    console.log("=== 이카운트 구매입고 전송 ===");
    console.log(JSON.stringify(payload, null, 2));

    const response = await fetch(requestUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    const textData = await response.text();
    console.log("=== 이카운트 구매입고 응답 ===");
    console.log(textData);

    let result;
    try {
      result = JSON.parse(textData);
    } catch {
      return { success: false, error: "이카운트 응답 분석 실패: " + textData.substring(0, 200) };
    }

    if (result.Status !== "200" || result.Error || result.Errors || result.Data?.FailCnt > 0) {
      const detailErr =
        result.Data?.ResultDetails?.[0]?.TotalError ||
        result.Data?.ResultDetails?.[0]?.Errors?.[0]?.Message;
      const errMsg =
        detailErr ||
        result.Errors?.[0]?.Message ||
        result.Error?.Message ||
        "이카운트 구매 전송이 거절되었습니다.";
      return { success: false, error: errMsg, details: result };
    }

    return {
      success: true,
      message: `구매입고 ${result.Data?.SuccessCnt || lines.length}건 전송 성공`,
      slipNos: result.Data?.SlipNos || [],
      details: result,
    };
  } catch (error: any) {
    console.error("구매입고 전송 실패:", error);
    return { success: false, error: error.message || "통신 실패" };
  }
}

// 8. 이카운트 품목+재고 → Supabase ecount_items 동기화
export async function syncEcountMasterToDb() {
  try {
    const sessionRes: any = await getSessionId();
    const sessionData = sessionRes?.Data;
    if (!sessionData) {
      return { success: false, error: sessionRes?.error || "이카운트 로그인 실패" };
    }

    // getListProduct / getInventoryStatus 는 Datas 또는 평면 SESSION_ID 모두 허용
    const sessionObj = sessionData.Datas ? sessionData : { Datas: sessionData, ...sessionData };

    const productListRes = await getListProductDetailed(sessionObj);
    const inventoryRes = await getInventoryStatusDetailed(sessionObj);

    const productList = productListRes.data;
    const inventory = inventoryRes.data;

    const qtyMap = new Map<string, number>();
    if (Array.isArray(inventory)) {
      inventory.forEach((item: any) => {
        qtyMap.set(item.prodCd, Number(String(item.qty).replace(/,/g, "")) || 0);
      });
    }

    const source = Array.isArray(productList) && productList.length > 0
      ? productList
      : (inventory || []).map((i: any) => ({
          PROD_CD: i.prodCd,
          PROD_DES: i.prodNm,
        }));

    if (!source.length) {
      const prodErr = productListRes.error || "응답 0건";
      const invErr = inventoryRes.error || "응답 0건";
      return {
        success: false,
        error: `이카운트 품목/재고 데이터 가져오기 실패 [품목API: ${prodErr} | 재고API: ${invErr}] — 이카운트 허용 IP 등록 및 사무실 프록시 PC 상태를 확인해 주세요.`
      };
    }

    const rows = source
      .filter((p: any) => p.PROD_CD || p.prodCd)
      .map((p: any) => {
        const prodCd = p.PROD_CD || p.prodCd;
        return {
          prod_cd: prodCd,
          prod_nm: p.PROD_DES || p.prodNm || prodCd,
          total_qty: qtyMap.get(prodCd) ?? 0,
          last_synced_at: new Date().toISOString(),
        };
      });

    const { error } = await supabase.from("ecount_items").upsert(rows, { onConflict: "prod_cd" });
    if (error) throw error;

    return {
      success: true,
      message: `이카운트 품목/재고 ${rows.length}건을 DB에 동기화했습니다.`,
      count: rows.length,
    };
  } catch (error: any) {
    console.error("마스터 동기화 실패:", error);
    return { success: false, error: error.message || "동기화 실패" };
  }
}

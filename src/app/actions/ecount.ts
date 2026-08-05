"use server"

import { supabase } from "@/lib/supabase"; 

// 1. 이카운트 로그인 및 세션 발급
export async function getSessionId() {
  const COM_CODE = process.env.ECOUNT_COM_CODE;
  const USER_ID = process.env.ECOUNT_USER_ID;
  const API_KEY = process.env.ECOUNT_API_KEY;

  try {
    const zoneResponse = await fetch("https://sboapi.ecount.com/OAPI/V2/Zone", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ COM_CODE: COM_CODE }),
    });
    
    const zoneData = await zoneResponse.json();
    const ZONE = zoneData.Data?.ZONE;
    
    if (!ZONE) throw new Error("ZONE 정보를 찾을 수 없습니다.");

    const loginUrl = `https://sboapi${ZONE.toLowerCase()}.ecount.com/OAPI/V2/OAPILogin`;

    const response = await fetch(loginUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        COM_CODE: COM_CODE,
        USER_ID: USER_ID,
        API_CERT_KEY: API_KEY,
        LAN_TYPE: "ko-KR",
        ZONE: ZONE 
      }),
    });

    const data = await response.json();
    return data; 
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

    const requestUrl = `https://${hostUrl}/OAPI/V2/Purchases/GetListPurchases?SESSION_ID=${actualSessionId}`;

    const response = await fetch(requestUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
export async function getListProduct(sessionObj: any) {
  const COM_CODE = process.env.ECOUNT_COM_CODE;
  try {
    const actualSessionId = sessionObj?.Datas?.SESSION_ID;
    const hostUrl = sessionObj?.Datas?.HOST_URL || "sboapiac.ecount.com";

    const requestUrl = `https://${hostUrl}/OAPI/V2/InventoryBasic/GetBasicProductsList?SESSION_ID=${actualSessionId}`;

    const response = await fetch(requestUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        SESSION_ID: actualSessionId,
        COM_CODE: COM_CODE,
        DATA: {} 
      })
    });

    const textData = await response.text();

    let result;
    try {
      result = JSON.parse(textData);
    } catch (e) {
      console.error("JSON 파싱 에러:", textData.substring(0, 200));
      return [];
    }

    const dataList = result.Data?.Result || result.Data?.List || result.Data || [];
    return dataList;
  } catch (error) {
    console.error("품목 마스터 조회 에러:", error);
    return [];
  }
}

// 5. 전체 품목의 현재고 현황 가져오기
export async function getInventoryStatus(sessionObj: any) {
  const COM_CODE = process.env.ECOUNT_COM_CODE;
  try {
    const actualSessionId = sessionObj?.Datas?.SESSION_ID;
    const hostUrl = sessionObj?.Datas?.HOST_URL || "sboapiac.ecount.com";

    const today = new Date();
    const kstTime = new Date(today.getTime() + (9 * 60 * 60 * 1000));
    const y = kstTime.getUTCFullYear();
    const m = String(kstTime.getUTCMonth() + 1).padStart(2, '0');
    const d = String(kstTime.getUTCDate()).padStart(2, '0');
    const baseDateString = `${y}${m}${d}`; 

    const requestUrl = `https://${hostUrl}/OAPI/V2/InventoryBalance/GetListInventoryBalanceStatus?SESSION_ID=${actualSessionId}`;

    const response = await fetch(requestUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
    let result;
    try {
      result = JSON.parse(textData);
    } catch (e) {
      console.error("이카운트 응답 파싱 에러:", textData.substring(0, 500));
      return [];
    }

    const dataList = result.Data?.Result || result.Data?.List || result.Data;

    if (!Array.isArray(dataList)) {
      return [];
    }

    const productList = await getListProduct(sessionObj);
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

    return dataList
      .filter((item: any) => Number(item.BAL_QTY) !== 0) 
      .map((item: any) => {
        const matchedInfo = productMap[item.PROD_CD] || {};
        return {
          prodCd: item.PROD_CD,
          prodNm: matchedInfo.prodNm || item.PROD_DES || item.PROD_CD, 
          size: matchedInfo.size || item.SIZE_DES || '-',
          qty: Number(item.BAL_QTY).toLocaleString(),
          unit: matchedInfo.unit || item.QTY_UNIT || 'EA'
        };
      })
      .sort((a: any, b: any) => Number(b.qty.replace(/,/g, '')) - Number(a.qty.replace(/,/g, '')));
      
  } catch (error) {
    console.error("재고 현황 조회 통신 실패:", error);
    return [];
  }
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
    const requestUrl = `https://${hostUrl}/OAPI/V2/InventoryBalance/GetListInventoryBalanceStatus?SESSION_ID=${actualSessionId}`;
    const response = await fetch(requestUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
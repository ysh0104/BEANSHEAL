import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// 1. 환경변수(.env.local) 강제 로딩
const envLocalPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envLocalPath)) dotenv.config({ path: envLocalPath, override: true });

const COM_CODE = process.env.ECOUNT_COM_CODE;
// 🌟 바로 이 부분! 사용자님의 파일에 적힌 이름(ECOUNT_SER_ID) 그대로 가져오게 수정했습니다.
const USER_ID = process.env.ECOUNT_SER_ID; 
const API_KEY = process.env.ECOUNT_SER_ID;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;

if (!supabaseUrl || !COM_CODE || !USER_ID) {
  console.error("❌ 필수 환경변수를 읽지 못했습니다. .env.local 파일을 확인해 주세요.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey!);

async function standaloneSync() {
  console.log("\n📦 [맥북 로컬] 이카운트 API 통신을 시작합니다...");

  try {
    // 2. 이카운트 로그인 (세션 발급)
    const zoneRes = await fetch("https://sboapi.ecount.com/OAPI/V2/Zone", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ COM_CODE })
    }).then(res => res.json());
    
    const ZONE = zoneRes.Data?.ZONE;
    const loginRes = await fetch(`https://sboapi${ZONE.toLowerCase()}.ecount.com/OAPI/V2/OAPILogin`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ COM_CODE, USER_ID, API_CERT_KEY: API_KEY, LAN_TYPE: "ko-KR", ZONE })
    }).then(res => res.json());

    const SESSION_ID = loginRes.Data?.Datas?.SESSION_ID || loginRes.Data?.SESSION_ID;
    const HOST_URL = loginRes.Data?.Datas?.HOST_URL || loginRes.Data?.HOST_URL || "sboapiac.ecount.com";

    if (!SESSION_ID) {
      // 🌟 이카운트가 뱉어낸 에러 메시지 원본을 출력합니다!
      console.log("🚨 [이카운트 거절 사유 원본]:", JSON.stringify(loginRes, null, 2));
      throw new Error("이카운트 로그인 실패!");
    }
    
    console.log("✅ 이카운트 로그인 완벽하게 성공!");

    // 3. 재고 현황 가져오기
    const today = new Date();
    const kstTime = new Date(today.getTime() + (9 * 60 * 60 * 1000));
    const baseDateString = `${kstTime.getUTCFullYear()}${String(kstTime.getUTCMonth() + 1).padStart(2, '0')}${String(kstTime.getUTCDate()).padStart(2, '0')}`;

    console.log("📦 실시간 재고 현황 요청 중...");
    const invRes = await fetch(`https://${HOST_URL}/OAPI/V2/InventoryBalance/GetListInventoryBalanceStatus?SESSION_ID=${SESSION_ID}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ SESSION_ID, COM_CODE, BASE_DATE: baseDateString, DATA: { BASE_DATE: baseDateString, WH_CD: "", PROD_CD: "" } })
    }).then(res => res.json());

    const dataList = invRes.Data?.Result || invRes.Data?.List || invRes.Data;
    if (!Array.isArray(dataList) || dataList.length === 0) {
      console.log("⚠️ 이카운트에서 가져올 재고 데이터가 없습니다."); return;
    }

    // 4. 불필요한 데이터(재고 0) 거르고 Supabase에 넣기
    const formattedData = dataList.filter(item => Number(item.BAL_QTY) !== 0).map(item => ({
      prod_cd: item.PROD_CD,
      prod_nm: item.PROD_DES,
      size: item.SIZE_DES || '-',
      qty: Number(item.BAL_QTY).toLocaleString(),
      unit: item.QTY_UNIT || 'EA',
      updated_at: new Date().toISOString()
    }));

    const { error } = await supabase.from('ecount_stock').upsert(formattedData, { onConflict: 'prod_cd' });
    if (error) throw error;

    console.log("--------------------------------------------------");
    console.log(`🎉 [성공] 총 ${formattedData.length}개의 재고 데이터가 Supabase에 채워졌습니다!`);
    console.log("--------------------------------------------------\n");

  } catch (e: any) {
    console.error("❌ 에러 발생:", e.message);
  }
}

standaloneSync();
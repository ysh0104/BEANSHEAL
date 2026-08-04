import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// 1. 환경변수 로드
const possiblePaths = [
  path.resolve(process.cwd(), '.env.local'),
  path.resolve(process.cwd(), '.env'),
  path.resolve(__dirname, '../.env.local'),
  path.resolve(__dirname, '../.env')
];

for (const envPath of possiblePaths) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath, override: true });
    break;
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;
const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
const telegramChatId = process.env.TELEGRAM_CHAT_ID;

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Supabase 환경변수를 찾을 수 없습니다.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// 🌟 [핵심] 집중 감시할 원료/부자재 이름과 '위험 기준선(안전재고)' 설정
const SAFETY_RULES = [
  { keyword: '원)커피향 JK503125', safeQty: 999, unit: 'kg' },
  { keyword: '세리컷 파우치', safeQty: 5000, unit: '매' },
  { keyword: '포장박스 카톤', safeQty: 1000, unit: 'EA' }
  // 필요하신 품목을 여기에 계속 추가하시면 됩니다!
];

// 텔레그램 발송 함수
async function sendEmergencyAlert(message: string) {
  if (!telegramToken || !telegramChatId) {
    console.log("⚠️ 텔레그램 토큰이나 채팅 ID가 없어 메시지를 보내지 않습니다.");
    return;
  }
  const url = `https://api.telegram.org/bot${telegramToken}/sendMessage`;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: telegramChatId, text: message })
    });
  } catch (error) {
    console.error("❌ 텔레그램 발송 에러:", error);
  }
}

async function runSafetyStockCheck() {
  console.log("\n🕵️‍♂️ [보안관 출동] 원부자재 안전 재고 검사를 시작합니다...");

  // 🌟 [수정됨] 우리 시스템의 진짜 마스터 장부 이름인 'ecount_items'로 접속!
  const { data: stockData, error } = await supabase.from('ecount_items').select('*');
  
  if (error) {
    console.error("❌ DB 통신 에러:", error.message);
    return;
  }

  if (!stockData || stockData.length === 0) {
    console.log("❌ DB에서 가져온 데이터가 0개입니다! (마스터 동기화를 먼저 해주세요)");
    return;
  }

  console.log(`📦 DB에서 총 ${stockData.length}개의 재고 데이터를 성공적으로 가져왔습니다.`);
  // 🌟 [수정됨] total_qty 로 출력
  console.log(`📝 [참고] 첫 번째 데이터 샘플: 품목명(${stockData[0].prod_nm}), 재고량(${stockData[0].total_qty})`);

  let warningMessages: string[] = [];

  // 2. 룰 검사 및 수사 과정 중계
  SAFETY_RULES.forEach(rule => {
    console.log(`\n🔍 타겟 수색 중: [${rule.keyword}]`);
    const safeKeyword = rule.keyword.replace(/\s/g, '');

    const matchedItems = stockData.filter((item: any) => {
      if (!item.prod_nm) return false;
      const dbName = item.prod_nm.replace(/\s/g, '');
      return dbName.includes(safeKeyword) || safeKeyword.includes(dbName);
    });

    if (matchedItems.length === 0) {
      console.log(`   ❌ 실패: DB 목록에서 타겟과 비슷한 이름조차 찾지 못했습니다.`);
    } else {
      matchedItems.forEach((item: any) => {
        // 🌟 [수정됨] qty 대신 total_qty 사용
        console.log(`   ✅ 일치 발견: DB 품목명 [${item.prod_nm}], 현재고 [${item.total_qty}]`);
        
        // Supabase에 NUMERIC으로 저장되어 있지만, 혹시 모를 안전을 위해 형변환
        const currentQty = Number(item.total_qty);
        console.log(`   👉 인식된 숫자: ${currentQty} (기준치: ${rule.safeQty})`);

        if (currentQty <= rule.safeQty) {
          console.log(`   🚨 [경고 발동] 기준치 미달! 알람 목록에 추가합니다.`);
          warningMessages.push(
            `⚠️ [${item.prod_nm}]\n- 현재고: ${currentQty.toLocaleString()} ${item.unit || rule.unit}\n- 안전기준: ${rule.safeQty.toLocaleString()} ${rule.unit}\n👉 발주가 시급합니다!`
          );
        } else {
          console.log(`   🛡️ [안전] 기준치보다 많아서 알람을 울리지 않습니다.`);
        }
      });
    }
  });

  // 3. 최종 알림 발송
  if (warningMessages.length > 0) {
    console.log(`\n🚨 최종 위험 항목 ${warningMessages.length}건 텔레그램 발송 중...`);
    const finalMessage = `🚨 [BEANSHEAL 원료 긴급경보] 🚨\n\n아래 품목의 재고가 위험 수위에 도달했습니다. 즉시 발주를 확인해 주세요.\n\n` + warningMessages.join('\n\n');
    await sendEmergencyAlert(finalMessage);
    console.log("✅ 텔레그램 경고 발송 완료.");
  } else {
    console.log("\n✅ 최종 결과: 모든 원부자재가 안전 재고 이상입니다. (평화로움)");
  }
}

runSafetyStockCheck();
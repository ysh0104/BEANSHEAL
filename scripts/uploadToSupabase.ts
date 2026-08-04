import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { parseEcountExcel } from './parseExcel';

// 1. 프로젝트 폴더 전역을 뒤져서 환경변수 파일을 찾아냅니다.
const possiblePaths = [
  path.resolve(process.cwd(), '.env.local'),
  path.resolve(process.cwd(), '.env'),
  path.resolve(__dirname, '../.env.local'),
  path.resolve(__dirname, '../.env')
];

let loadedPath = '';
for (const envPath of possiblePaths) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath, override: true });
    loadedPath = envPath;
    break;
  }
}

// 2. 환경변수 인식
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;
const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
const telegramChatId = process.env.TELEGRAM_CHAT_ID;

console.log(`[시스템] 환경변수 파일 탐색 결과: ${loadedPath ? loadedPath : '실패 (파일 없음)'}`);
console.log(`[시스템] SUPABASE_URL 인식 여부: ${supabaseUrl ? '성공' : '실패'}`);
console.log(`[시스템] SUPABASE_KEY 인식 여부: ${supabaseKey ? '성공' : '실패'}`);
console.log(`[시스템] TELEGRAM 설정 인식 여부: ${telegramToken && telegramChatId ? '성공' : '실패 (알림 발송 생략됨)'}`);

if (!supabaseUrl || !supabaseKey) {
  console.error("\n[치명적 오류] Supabase 환경변수를 찾을 수 없습니다.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// 텔레그램 알림 발송 함수
async function sendTelegramMessage(text: string) {
  if (!telegramToken || !telegramChatId) return; 
  
  const url = `https://api.telegram.org/bot${telegramToken}/sendMessage`;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: telegramChatId, text: text })
    });
    if (response.ok) console.log("[시스템] 텔레그램으로 알림을 발송했습니다.");
  } catch (error) {
    console.error("[에러] 텔레그램 통신 에러 발생:", error);
  }
}

// 텍스트 정규화 함수
function normalizeName(name: string) {
  if (!name) return "";
  return name
    .replace(/^[원부자반]\)\s*/, '') 
    .replace(/\[.*?\]/g, '')        
    .replace(/\s+/g, '')            
    .toLowerCase();                 
}

async function syncInventoryToSupabase() {
  console.log("\n1. 엑셀 파일에서 데이터 추출 시작...");
  const extractedData = parseEcountExcel(); 

  if (!extractedData || extractedData.length === 0) {
    console.log("업로드할 데이터가 없습니다.");
    return;
  }

  console.log(`\n2. DB 기존 데이터와 비교하여 수량 변동(입고/생산소모) 감지 중...`);
  
  const dbData = extractedData.map((item: any) => ({
    item_name: item.itemName,
    lot_no: item.lotNo,
    quantity: item.quantity,
    expiry_date: item.expiryDate,
    status: '문서대기' 
  }));

  const lotNumbers = dbData.map((item: any) => item.lot_no);

  // DB에서 기존에 있던 로트들의 수량까지 싹 다 가져옵니다.
  const { data: existingData, error: fetchError } = await supabase
    .from('ecount_inventory')
    .select('id, item_name, lot_no, quantity')
    .in('lot_no', lotNumbers);

  if (fetchError) {
    console.error("DB 중복 체크 중 에러 발생:", fetchError.message);
    return;
  }

  // 기존 데이터를 Map으로 정리하여 찾기 쉽게 만듭니다.
  const existingMap = new Map(existingData?.map(row => [`${row.item_name}_${row.lot_no}`, row]) || []);

  const newItemsToInsert: any[] = []; // 아예 처음 들어오는 완전 신규 로트
  const itemsToUpdate: any[] = [];    // 기존에 있었는데 생산소모 등으로 수량이 바뀐 로트
  const masterDeltas = new Map<string, number>(); // 마스터 재고(ecount_items)에 더하거나 뺄 최종 수량

  for (const item of dbData) {
    const key = `${item.item_name}_${item.lot_no}`;
    const existing = existingMap.get(key);

    if (existing) {
      // 기존에 있는 로트라면, (엑셀 수량 - DB 수량)으로 변동폭(Delta)을 계산합니다.
      const delta = item.quantity - existing.quantity;
      
      if (delta !== 0) { // 변동이 있을 때만 (생산소모 발생 등)
        itemsToUpdate.push({
          id: existing.id,
          new_quantity: item.quantity,
          item_name: item.item_name,
          lot_no: item.lot_no,
          delta: delta
        });
        // 마스터 재고 변동 내역에 누적 (감소했으면 음수가 누적됨)
        masterDeltas.set(item.item_name, (masterDeltas.get(item.item_name) || 0) + delta);
      }
    } else {
      // DB에 없는 완전 신규 로트
      newItemsToInsert.push(item);
      masterDeltas.set(item.item_name, (masterDeltas.get(item.item_name) || 0) + item.quantity);
    }
  }

  if (newItemsToInsert.length === 0 && itemsToUpdate.length === 0) {
    console.log("--------------------------------------------------");
    console.log("새로운 입고 내역이나 생산소모 등 수량 변동이 전혀 없습니다.");
    console.log("--------------------------------------------------\n");
    return;
  }

  console.log(`3. DB 업데이트 진행 중... (신규등록: ${newItemsToInsert.length}건, 변동업데이트: ${itemsToUpdate.length}건)`);

  // [신규 로트 Insert]
  if (newItemsToInsert.length > 0) {
    const { error: insertError } = await supabase.from('ecount_inventory').insert(newItemsToInsert);
    if (insertError) console.error("신규 데이터 삽입 에러:", insertError.message);
  }

  // [기존 로트 수량 덮어쓰기 Update (생산소모 반영)]
  if (itemsToUpdate.length > 0) {
    for (const update of itemsToUpdate) {
      await supabase.from('ecount_inventory').update({ quantity: update.new_quantity }).eq('id', update.id);
    }
  }
    
  console.log("--------------------------------------------------");
  console.log(`[개별 로트 동기화 완료] 데이터가 성공적으로 맞춰졌습니다!`);
  
  // =========================================================================
  // 4. 마스터 재고(ecount_items) 총수량 자동 가감 (+ 입고 / - 생산소모)
  // =========================================================================
  console.log(`\n4. 마스터 재고(ecount_items) 총수량 자동 가감 업데이트 시작...`);
  
  const { data: masterItems, error: masterError } = await supabase
    .from('ecount_items')
    .select('prod_cd, prod_nm, total_qty');

  if (masterError) {
    console.error("마스터 데이터 조회 실패:", masterError.message);
  } else if (masterItems) {
    for (const [itemName, delta] of masterDeltas.entries()) {
      if (delta === 0) continue; // 변동 없으면 패스

      const targetCleanName = normalizeName(itemName);
      const matchedMaster = masterItems.find(master => normalizeName(master.prod_nm) === targetCleanName);

      if (matchedMaster) {
        // 기존 수량에 변동폭(음수면 자동으로 빼짐)을 더합니다.
        const updatedQty = (matchedMaster.total_qty || 0) + delta;
        
        const { error: updateError } = await supabase
          .from('ecount_items')
          .update({ total_qty: updatedQty })
          .eq('prod_cd', matchedMaster.prod_cd);

        if (!updateError) {
          const sign = delta > 0 ? "+" : ""; // 음수는 기호가 자동으로 붙음
          const actionText = delta > 0 ? "입고" : "생산소모/출고";
          console.log(`  └ [${actionText}] ${matchedMaster.prod_nm}: ${sign}${delta} (현재 총재고: ${updatedQty})`);
          matchedMaster.total_qty = updatedQty;
        } else {
          console.error(`  └ [업데이트 실패] ${matchedMaster.prod_nm}: ${updateError.message}`);
        }
      } else {
        console.log(`  └ [경고] 마스터 테이블에서 '${itemName}' 품목을 찾을 수 없어 반영을 건너뜁니다.`);
      }
    }
  }
  console.log("--------------------------------------------------\n");

  if (newItemsToInsert.length > 0) {
    const alertMessage = `[BEANSHEAL 자동알림]\n새로운 로트 ${newItemsToInsert.length}건이 입고되었습니다!\n웹 대시보드에 접속하여 확인해 주세요.`;
    await sendTelegramMessage(alertMessage);
  }
}

syncInventoryToSupabase();
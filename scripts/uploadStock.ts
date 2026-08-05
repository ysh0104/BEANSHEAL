import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import * as xlsx from 'xlsx';
import { createClient } from '@supabase/supabase-js';

// 1. 환경변수 로드
const possiblePaths = [
  path.resolve(process.cwd(), '.env.local'),
  path.resolve(process.cwd(), '.env')
];

for (const envPath of possiblePaths) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath, override: true });
    break;
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Supabase 환경변수를 찾을 수 없습니다.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// 이름 정규화 (괄호, 공백 제거)
function normalizeName(name: string) {
  if (!name) return "";
  return name.replace(/^[원부자반]\)\s*/, '').replace(/\[.*?\]/g, '').replace(/\s+/g, '').toLowerCase();                 
}

async function uploadStockData() {
  console.log("\n🚀 [마스터 재고 펌프 & 좀비 자동청소] 시스템 가동...");

  let filePath = path.resolve(process.cwd(), 'data/stock.xlsx');
  if (!fs.existsSync(filePath)) {
    filePath = path.resolve(process.cwd(), 'stock.xlsx');
  }
  
  if (!fs.existsSync(filePath)) {
    console.error("❌ 에러: 'stock.xlsx' 파일을 찾을 수 없습니다. data/ 폴더 또는 최상단 폴더에 넣어주세요.");
    return;
  }

  try {
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const rawData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { range: 1 });

    console.log(`📄 엑셀에서 총 ${rawData.length}줄의 데이터를 읽었습니다. 마스터 업데이트 및 로트 정리를 시작합니다...`);

    // 🌟 1. DB의 현재 모든 로트 데이터 가져오기 (수량이 1 이상인 놈들만)
    // order('lot_no', { ascending: false }) -> 최신 로트번호가 위로 오도록 내림차순 정렬!
    const { data: allLots, error: lotError } = await supabase
      .from('ecount_inventory')
      .select('id, item_name, lot_no, quantity')
      .gt('quantity', 0)
      .order('lot_no', { ascending: false }); 

    if (lotError) throw lotError;

    let masterSuccessCount = 0;
    let zombieCleanCount = 0;
    let partialUseCount = 0;

    for (const row of rawData as any[]) {
      const prodCd = row['품목코드'];
      const rawItemName = row['품목명'] || row['품목명[규격]'] || row['품목'];
      if (!prodCd || !rawItemName) continue;

      const rawQty = row['재고수량'];
      const trueTotalQty = rawQty ? Number(String(rawQty).replace(/,/g, '')) : 0;
      const targetCleanName = normalizeName(rawItemName);

      // 🌟 2. 마스터 테이블(ecount_items) 총수량 덮어쓰기
      const { error: updateError } = await supabase
        .from('ecount_items')
        .update({ 
          total_qty: trueTotalQty,
          last_synced_at: new Date().toISOString()
        })
        .eq('prod_cd', String(prodCd).trim());

      if (!updateError) masterSuccessCount++;

      // 🌟 3. 과장님 아이디어 이식: 좀비 로트 자동 청소 로직 (위에서부터 채우고 남은 건 버리기)
      const matchedLots = allLots?.filter(lot => normalizeName(lot.item_name) === targetCleanName) || [];
      
      let remainingQtyToKeep = trueTotalQty; // 우리가 지켜내야 할 진짜 재고량

      for (const lot of matchedLots) {
        const lotQty = Number(lot.quantity);

        if (remainingQtyToKeep <= 0) {
          // 지켜낼 재고량을 이미 다 채웠다면, 뒤에 나오는 옛날 로트들은 전부 다 쓴(0) 좀비!
          await supabase.from('ecount_inventory').update({ quantity: 0 }).eq('id', lot.id);
          zombieCleanCount++;
        } else if (lotQty > remainingQtyToKeep) {
          // 이 최신 로트 하나가 지켜낼 재고량보다 크다면? (일부만 남고 사용됨)
          await supabase.from('ecount_inventory').update({ quantity: remainingQtyToKeep }).eq('id', lot.id);
          partialUseCount++;
          remainingQtyToKeep = 0; 
        } else {
          // 이 로트는 온전히 다 남아있는 상태 (다음 로트로 남은 수량 넘김)
          remainingQtyToKeep -= lotQty;
        }
      }
    }

    console.log(`\n✅ [작업 완료 보고]`);
    console.log(` - 📦 마스터 총재고 최신화: ${masterSuccessCount}개 품목`);
    console.log(` - 🧟 삭제된 옛날 좀비 로트: ${zombieCleanCount}건`);
    console.log(` - 📉 일부 사용(수량 깎임) 처리된 로트: ${partialUseCount}건\n`);

  } catch (error) {
    console.error("❌ 엑셀 처리 중 에러 발생:", error);
  }
}

uploadStockData();
'use server'

import { createClient } from '@supabase/supabase-js';
import { ParsedInventoryData } from '@/utils/excelParser'; 

// 서버 전용 Supabase 클라이언트 세팅
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-key";
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// 이름 정규화 함수 (괄호, 공백 제거하여 엄격한 비교)
function normalizeName(name: string) {
  if (!name) return "";
  return name.replace(/^[원부자반]\)\s*/, '').replace(/\[.*?\]/g, '').replace(/\s+/g, '').toLowerCase();                 
}

export async function syncExcelToSupabase(parsedData: ParsedInventoryData[]) {
  try {
    if (!parsedData || parsedData.length === 0) {
      return { success: false, message: '동기화할 데이터가 없습니다.' };
    }

    // 1. 엑셀 데이터 맵핑 (기준점)
    const excelDataMap = new Map<string, any>();
    parsedData.forEach(item => {
       const key = `${normalizeName(item.itemName)}_${item.lotNo}`;
       excelDataMap.set(key, item);
    });

    // 2. 현재 DB에 있는 모든 재고 가져오기
    const { data: dbInventory, error: fetchError } = await supabase
      .from('ecount_inventory')
      .select('*');

    if (fetchError) throw new Error(`DB 조회 에러: ${fetchError.message}`);

    const newItemsToInsert: any[] = [];
    const itemsToUpdate: any[] = [];

    const dbInventoryMap = new Map<string, any>();
    dbInventory?.forEach(row => {
        dbInventoryMap.set(`${normalizeName(row.item_name)}_${row.lot_no}`, row);
    });

    // ====================================================================
    // 3. 엑셀에 있는 데이터만 "정확하게 타겟팅" 하여 업데이트 (없는 건 절대 안 건드림)
    // ====================================================================
    for (const [key, excelItem] of excelDataMap.entries()) {
      const dbItem = dbInventoryMap.get(key);

      if (dbItem) {
        // 기존 로트: 엑셀 수량과 다르면 엑셀 수량으로 정확히 '덮어쓰기'
        if (dbItem.quantity !== excelItem.quantity) {
          itemsToUpdate.push({ id: dbItem.id, quantity: excelItem.quantity });
        }
      } else {
        // 완전 신규 로트
        newItemsToInsert.push({
          item_name: excelItem.itemName,
          lot_no: excelItem.lotNo,
          quantity: excelItem.quantity,
          expiry_date: excelItem.expiryDate,
          status: '문서대기'
        });
      }
    }

    // 🔥 [삭제됨] 멀쩡한 데이터를 0으로 밀어버리던 위험한 '좀비 소각 로직' 영구 폐기

    // ====================================================================
    // 4. DB 실제 업데이트 실행
    // ====================================================================
    if (newItemsToInsert.length > 0) {
      await supabase.from('ecount_inventory').insert(newItemsToInsert);
    }
    if (itemsToUpdate.length > 0) {
      for (const update of itemsToUpdate) {
        await supabase.from('ecount_inventory').update({ quantity: update.quantity }).eq('id', update.id);
      }
    }

    // ====================================================================
    // 5. 마스터 재고(ecount_items) 총합 갱신 (마이너스 및 오류 원천 차단)
    // ====================================================================
    // 방금 업데이트된 내용을 포함하여 DB에서 다시 최신 상태를 읽어옵니다.
    const { data: finalInventory } = await supabase.from('ecount_inventory').select('item_name, quantity');
    const { data: masterItems } = await supabase.from('ecount_items').select('prod_cd, prod_nm');

    const originalItemNames = Array.from(new Set(parsedData.map(p => p.itemName)));

    if (finalInventory && masterItems) {
      // 이번 엑셀 업로드에 포함된 품목들만 마스터 재고 재계산
      for (const itemName of originalItemNames) {
        const normName = normalizeName(itemName);
        
        // 해당 품목의 모든 로트 수량을 안전하게 합산 (0 미만은 무시)
        const totalQty = finalInventory
          .filter(inv => normalizeName(inv.item_name) === normName)
          .reduce((sum, inv) => sum + Math.max(0, Number(inv.quantity || 0)), 0);

        const matchedMaster = masterItems.find(m => normalizeName(m.prod_nm) === normName);
        if (matchedMaster) {
          // 마스터 테이블에 합산된 총 수량을 안전하게 덮어쓰기
          await supabase.from('ecount_items').update({ total_qty: totalQty }).eq('prod_cd', matchedMaster.prod_cd);
        }
      }
    }

    return { 
      success: true, 
      message: `동기화 완료! (신규등록: ${newItemsToInsert.length}건 / 수량변경: ${itemsToUpdate.length}건)` 
    };

  } catch (error: any) {
    console.error('[Sync Action Error]', error);
    return { success: false, message: error.message || '서버 통신 중 알 수 없는 오류가 발생했습니다.' };
  }
}

/**
 * Supabase ecount_inventory 테이블 전체 목록 조회
 */
export async function getAuditInventoryItems() {
  try {
    const { data, error } = await supabase
      .from('ecount_inventory')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1000);

    if (error) {
      console.error("ecount_inventory fetch error:", error);
      return { success: false, message: error.message, data: [] };
    }

    return { success: true, data: data || [] };
  } catch (error: any) {
    console.error("getAuditInventoryItems error:", error);
    return { success: false, message: error?.message || "데이터 불러오기 오류", data: [] };
  }
}

/**
 * 즉시 생산 실적 등록 시 Supabase ecount_inventory에 직접 저장
 */
export async function insertQuickProductionToSupabase(item: {
  item_name: string;
  lot_no: string;
  quantity: string | number;
  expiry_date?: string;
  status?: string;
}) {
  try {
    const qtyVal = typeof item.quantity === 'number' 
      ? item.quantity 
      : parseFloat(String(item.quantity).replace(/[^0-9.]/g, '')) || 0;

    const { data, error } = await supabase
      .from('ecount_inventory')
      .insert([
        {
          item_name: item.item_name,
          lot_no: item.lot_no,
          quantity: qtyVal,
          expiry_date: item.expiry_date || '제조일로부터 24개월',
          status: item.status || '문서대기'
        }
      ])
      .select();

    if (error) throw error;
    return { success: true, data };
  } catch (error: any) {
    console.error("insertQuickProductionToSupabase error:", error);
    return { success: false, message: error?.message || "DB 저장 오류" };
  }
}
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

// ⚡ 품질/감사 로트 목록 초고속 서버 인메모리 캐시 (15초 TTL)
let auditInventoryCache: { data: any[]; expiry: number } | null = null;

const SYSTEM_STATUSES = ['SAFETY_STOCK', 'CALIBRATION', 'HEALTH_CHECK', 'MEMO', 'ITEM_MASTER'];

/**
 * Supabase ecount_inventory 테이블 전체 목록 조회 (시스템 예약 행 및 품목코드 대체 행 자동 필터링)
 */
export async function getAuditInventoryItems() {
  if (auditInventoryCache && auditInventoryCache.expiry > Date.now()) {
    return { success: true, data: auditInventoryCache.data };
  }

  try {
    const { data, error } = await supabase
      .from('ecount_inventory')
      .select('*')
      .not('status', 'in', '("SAFETY_STOCK","CALIBRATION","HEALTH_CHECK","MEMO","ITEM_MASTER")')
      .order('created_at', { ascending: false })
      .limit(1000);

    if (error) {
      console.error("ecount_inventory fetch error:", error);
      return { success: false, message: error.message, data: [] };
    }

    // 마스터 품목코드 목록 조회 (lot_no가 품목코드와 동일한 행을 오인하지 않도록 방어)
    const { data: masterItems } = await supabase.from('ecount_items').select('prod_cd');
    const masterProdCodes = new Set((masterItems || []).map(m => String(m.prod_cd).trim()));

    const filteredData = (data || []).filter(item => {
      const status = String(item.status || '').toUpperCase();
      if (SYSTEM_STATUSES.includes(status)) return false;

      const lot = String(item.lot_no || '').trim();
      // lot_no가 없거나 'undefined', 'null' 인 경우 거름
      if (!lot || lot === 'undefined' || lot === 'null') return false;

      // lot_no가 단순 품목코드(예: M0001, 000010 등)와 100% 동일하면 엑셀 파싱 오류로 유입된 것으로 판단하여 제외
      if (masterProdCodes.has(lot)) return false;

      return true;
    });

    auditInventoryCache = { data: filteredData, expiry: Date.now() + 15000 };
    return { success: true, data: filteredData };
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

/**
 * 품질/감사 서류 발급 완료 시 상태 업데이트 ('승인/발급완료')
 */
export async function updateAuditItemStatusToSupabase(id: string | number, status: string = '승인/발급완료') {
  try {
    const { data, error } = await supabase
      .from('ecount_inventory')
      .update({ status })
      .eq('id', id)
      .select();

    if (error) {
      await supabase
        .from('dashboard')
        .update({ qc_status: status })
        .eq('id', id);
    }
    return { success: true, data };
  } catch (error: any) {
    console.error("updateAuditItemStatusToSupabase error:", error);
    return { success: false, message: error?.message || "DB 업데이트 오류" };
  }
}

/** ecount_items 재고 마스터 전량 삭제 (전체관리자만) */
async function assertSuperAdmin(actorUserId: string | undefined | null): Promise<{ ok: boolean; error?: string }> {
  if (!actorUserId) {
    return { ok: false, error: "로그인이 필요합니다." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("permission_group_id, role")
    .eq("id", actorUserId)
    .maybeSingle();

  if (!profile) {
    return { ok: false, error: "사용자 프로필을 찾을 수 없습니다." };
  }

  if (profile.permission_group_id) {
    const { data: group } = await supabase
      .from("permission_groups")
      .select("name")
      .eq("id", profile.permission_group_id)
      .maybeSingle();
    if (group?.name === "전체관리자") return { ok: true };
  } else if (profile.role === "ADMIN") {
    return { ok: true };
  }

  return { ok: false, error: "전체관리자만 재고현황 전체 삭제가 가능합니다." };
}

export async function clearAllEcountItems(
  actorUserId?: string | null
): Promise<{ success: boolean; error?: string }> {
  try {
    const guard = await assertSuperAdmin(actorUserId);
    if (!guard.ok) return { success: false, error: guard.error };

    const { error } = await supabase.from("ecount_items").delete().neq("prod_cd", "___IMPOSSIBLE_CD___");
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : "삭제 오류" };
  }
}
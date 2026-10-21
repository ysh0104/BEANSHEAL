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
        const hasRealExcelExp =
          excelItem.expiryDate &&
          excelItem.expiryDate !== '-' &&
          excelItem.expiryDate !== '제조일로부터 24개월';
        const needExpUpdate =
          hasRealExcelExp && dbItem.expiry_date !== excelItem.expiryDate;

        // 기존 로트: 엑셀 수량 또는 소비기한이 다르면 정확히 업데이트
        if (dbItem.quantity !== excelItem.quantity || needExpUpdate) {
          itemsToUpdate.push({
            id: dbItem.id,
            quantity: excelItem.quantity,
            ...(needExpUpdate ? { expiry_date: excelItem.expiryDate } : {}),
          });
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
        const patch: Record<string, any> = { quantity: update.quantity };
        if (update.expiry_date) patch.expiry_date = update.expiry_date;
        await supabase.from('ecount_inventory').update(patch).eq('id', update.id);
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

    auditInventoryCache = null;

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

function sanitizeInventoryItemName(rawName: any): string {
  let name = String(rawName || '').trim();
  if (!name) return '';
  if (name.includes('재고수불부')) {
    const parts = name.split(/재고수불부\s*\/\s*/);
    name = (parts[parts.length - 1] || '').trim();
  }
  name = name.replace(/^\d{4}[\/.\-]\d{1,2}[\/.\-]\d{1,2}\s*~\s*\d{4}[\/.\-]\d{1,2}[\/.\-]\d{1,2}\s*\/\s*/g, '').trim();
  name = name.replace(/\s*\([A-Za-z0-9_-]{3,20}\)\s*$/, '').trim();
  return name;
}

function parseLotKeyForSort(rawLot: string) {
  const raw = String(rawLot || '').trim();
  const dateMatch = raw.match(/^([^0-9]*?)(20\d{6}|\d{6})(.*)$/);
  if (dateMatch) {
    const lead = (dateMatch[1] || '').trim();
    const datePart = dateMatch[2];
    const rest = (dateMatch[3] || '').trim();
    const fullDateStr = datePart.length === 6 ? `20${datePart}` : datePart;
    const dateVal = parseInt(fullDateStr, 10) || 0;
    const seqMatch = rest.match(/^([^0-9]*)(\d+)(.*)$/);
    const midPrefix = `${lead}${seqMatch ? seqMatch[1] : rest}`.trim().toUpperCase();
    const seqNum = seqMatch ? parseInt(seqMatch[2], 10) : 0;
    const suffix = (seqMatch ? seqMatch[3] : '').trim().toUpperCase();
    return { hasDate: true, dateVal, midPrefix, seqNum, suffix, raw };
  }
  return { hasDate: false, dateVal: 0, midPrefix: raw.toUpperCase(), seqNum: Number.MAX_SAFE_INTEGER, suffix: '', raw };
}

function compareLotNumbersServer(lotA: string, lotB: string): number {
  const a = parseLotKeyForSort(lotA);
  const b = parseLotKeyForSort(lotB);
  if (a.hasDate !== b.hasDate) return a.hasDate ? -1 : 1;
  // 1순위: 날짜 최신순 (내림차순: 최신 날짜가 위로)
  if (a.dateVal !== b.dateVal) return b.dateVal - a.dateVal;
  // 2순위: 같은 날짜 내에서도 최신 순번이 위로 (내림차순: Q3 -> Q2 -> Q1)
  if (a.seqNum !== b.seqNum) return b.seqNum - a.seqNum;
  if (a.midPrefix !== b.midPrefix) {
    return b.midPrefix.localeCompare(a.midPrefix, 'en', { numeric: true, sensitivity: 'base' });
  }
  if (a.suffix !== b.suffix) {
    return b.suffix.localeCompare(a.suffix, 'en', { numeric: true, sensitivity: 'base' });
  }
  return b.raw.localeCompare(a.raw, 'en', { numeric: true, sensitivity: 'base' });
}

/**
 * Supabase ecount_inventory 테이블 전체 목록 조회 (시스템 예약 행, 오염된 수불부 헤더/다중로트 행 자동 정제 및 정렬)
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
      .limit(1500);

    if (error) {
      console.error("ecount_inventory fetch error:", error);
      return { success: false, message: error.message, data: [] };
    }

    // 마스터 품목코드 목록 조회 (lot_no가 품목코드와 동일한 행을 오인하지 않도록 방어)
    const { data: masterItems } = await supabase.from('ecount_items').select('prod_cd');
    const masterProdCodes = new Set((masterItems || []).map(m => String(m.prod_cd).trim()));

    const corruptIdsToDelete: (string | number)[] = [];
    const corruptRowsToRename: { id: string | number; item_name: string }[] = [];
    const dedupMap = new Map<string, any>();

    for (const item of data || []) {
      const status = String(item.status || '').toUpperCase();
      if (SYSTEM_STATUSES.includes(status)) continue;

      const rawLot = String(item.lot_no || '').trim();
      // lot_no가 없거나 비정상 기호('—', '-'), 공백으로 뭉친 다중 로트('250925Q2  251013Q3'), 숫자 미포함인 경우 제외
      if (
        !rawLot ||
        rawLot === 'undefined' ||
        rawLot === 'null' ||
        rawLot === '—' ||
        rawLot === '-' ||
        /\s/.test(rawLot) ||
        !/\d/.test(rawLot) ||
        masterProdCodes.has(rawLot)
      ) {
        if (item.id && (rawLot === '—' || rawLot === '-' || /\s/.test(rawLot))) {
          corruptIdsToDelete.push(item.id);
        }
        continue;
      }

      const origName = String(item.item_name || '').trim();
      const cleanName = sanitizeInventoryItemName(origName);
      if (!cleanName || cleanName === '소계' || cleanName === '합계' || cleanName === '총계') {
        continue;
      }

      const wasCorruptName = origName !== cleanName;
      const isNoExpPackaging = /^[부자]\)|^\[(부자재|부)\]|단상자|카톤|외상자|박스|상자|파우치|스틱|필름|비닐/.test(cleanName);
      const sanitizedItem = { ...item, item_name: cleanName, lot_no: rawLot, ...(isNoExpPackaging ? { expiry_date: '' } : {}) };
      const dedupKey = `${normalizeName(cleanName)}_${rawLot}`;

      const isRealExp = (exp: any) => {
        const s = String(exp || '').trim();
        return !!s && s !== '-' && s !== '—' && s !== 'undefined' && s !== 'null' && s !== '제조일로부터 24개월';
      };

      const existing = dedupMap.get(dedupKey);
      if (!existing) {
        dedupMap.set(dedupKey, { item: sanitizedItem, wasCorruptName });
        if (wasCorruptName && item.id) {
          corruptRowsToRename.push({ id: item.id, item_name: cleanName });
        }
      } else {
        // 이미 동일 품목+LOT가 있는 경우: 실제 소비기한, 승인/발급완료 상태, 정상 품목명을 모두 보존하고 중복 '-' 행은 삭제
        const existingRealExp = isRealExp(existing.item.expiry_date);
        const currentRealExp = isRealExp(sanitizedItem.expiry_date);
        const mergedExpiry = existingRealExp
          ? existing.item.expiry_date
          : currentRealExp
          ? sanitizedItem.expiry_date
          : existing.item.expiry_date || sanitizedItem.expiry_date;

        const existingApproved = existing.item.status && existing.item.status !== '문서대기';
        const currentApproved = sanitizedItem.status && sanitizedItem.status !== '문서대기';
        const mergedStatus = existingApproved
          ? existing.item.status
          : currentApproved
          ? sanitizedItem.status
          : existing.item.status || '문서대기';

        if ((!existingRealExp && currentRealExp) || (existing.wasCorruptName && !wasCorruptName)) {
          if (existing.item.id) corruptIdsToDelete.push(existing.item.id);
          dedupMap.set(dedupKey, {
            item: { ...sanitizedItem, expiry_date: mergedExpiry, status: mergedStatus },
            wasCorruptName,
          });
        } else {
          existing.item.expiry_date = mergedExpiry;
          existing.item.status = mergedStatus;
          if (item.id) corruptIdsToDelete.push(item.id);
        }
      }
    }

    // 백그라운드에서 오염된 DB 행 자동 정화 (비동기)
    if (corruptIdsToDelete.length > 0) {
      void supabase.from('ecount_inventory').delete().in('id', corruptIdsToDelete.slice(0, 200));
    }
    const deleteSet = new Set(corruptIdsToDelete);
    for (const r of corruptRowsToRename.slice(0, 50)) {
      if (!deleteSet.has(r.id)) {
        void supabase.from('ecount_inventory').update({ item_name: r.item_name }).eq('id', r.id);
      }
    }

    const filteredData = Array.from(dedupMap.values()).map(v => v.item);

    // LOT 번호 기준 정렬: 1순위 날짜 최신순(내림차순), 2순위 같은 날짜 내 숫자 순서(오름차순)
    filteredData.sort((a, b) => compareLotNumbersServer(String(a.lot_no || ''), String(b.lot_no || '')));

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
    auditInventoryCache = null;
    return { success: true, data };
  } catch (error: any) {
    console.error("insertQuickProductionToSupabase error:", error);
    return { success: false, message: error?.message || "DB 저장 오류" };
  }
}

/**
 * 품질/감사 서류 발급 완료 시 상태 업데이트 ('승인/발급완료')
 */
export async function updateAuditItemStatusToSupabase(
  id: string | number | undefined,
  status: string = '승인/발급완료',
  lotNo?: string
) {
  try {
    auditInventoryCache = null;

    if (id !== undefined && id !== null && id !== '') {
      const { data, error } = await supabase
        .from('ecount_inventory')
        .update({ status })
        .eq('id', id)
        .select();

      if (error || !data || data.length === 0) {
        if (lotNo) {
          await supabase
            .from('ecount_inventory')
            .update({ status })
            .eq('lot_no', lotNo);
        }
        await supabase
          .from('dashboard')
          .update({ qc_status: status })
          .eq('id', id);
      }
      return { success: true, data };
    } else if (lotNo) {
      const { data } = await supabase
        .from('ecount_inventory')
        .update({ status })
        .eq('lot_no', lotNo)
        .select();
      return { success: true, data };
    }

    return { success: true };
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

const QC_UNIT_SPECS_ROW_ID = "qc_unit_specs";

/**
 * 품목별 품질관리표시서 단위포장 수량(예: 25kg, 20kg) 설정 조회
 */
export async function getQcItemUnitSpecsFromSupabase(): Promise<{
  success: boolean;
  data: Record<string, string>;
}> {
  try {
    const { data, error } = await supabase
      .from("memo_presets")
      .select("templates")
      .eq("id", QC_UNIT_SPECS_ROW_ID)
      .maybeSingle();

    if (error || !data || !data.templates || typeof data.templates !== "object" || Array.isArray(data.templates)) {
      return { success: true, data: {} };
    }

    return {
      success: true,
      data: data.templates as Record<string, string>,
    };
  } catch (e) {
    return { success: false, data: {} };
  }
}

/**
 * 품목별 품질관리표시서 단위포장 수량(예: 25kg, 20kg) 설정 저장 (한 번 입력 시 영구 기억)
 */
export async function saveQcItemUnitSpecsToSupabase(
  unitSpecs: Record<string, string>
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from("memo_presets")
      .upsert(
        {
          id: QC_UNIT_SPECS_ROW_ID,
          templates: unitSpecs,
          tags: [],
          mentions: [],
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      );

    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || "저장 오류" };
  }
}
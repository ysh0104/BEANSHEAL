'use server'

import { createClient } from '@supabase/supabase-js';
import { CalibrationItem, DEFAULT_CALIBRATION_ITEMS } from '@/lib/calibrationData';

export type { CalibrationItem };

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

function getSupabase() {
  if (!supabaseUrl || !supabaseServiceKey) return null;
  return createClient(supabaseUrl, supabaseServiceKey);
}

/**
 * Supabase에서 기기 검교정 관리대장 데이터 전체 조회
 */
export async function getCalibrationItemsFromSupabase() {
  try {
    const supabase = getSupabase();
    if (!supabase) return { success: true, data: DEFAULT_CALIBRATION_ITEMS };

    // 1차: gmp_calibration_items 테이블 시도
    const { data, error } = await supabase
      .from('gmp_calibration_items')
      .select('*')
      .order('no', { ascending: true });

    if (!error && data && data.length > 0) {
      return { success: true, data };
    }

    // 2차 폴백: ecount_inventory 내 CALIBRATION 상태 조회
    const { data: invData, error: invError } = await supabase
      .from('ecount_inventory')
      .select('*')
      .eq('status', 'CALIBRATION')
      .order('id', { ascending: true });

    if (!invError && invData && invData.length > 0) {
      const mapped = invData.map((item: any) => {
        let meta: any = {};
        try { meta = JSON.parse(item.expiry_date || '{}'); } catch {}
        return {
          id: String(item.id),
          no: meta.no || item.quantity || 1,
          name: item.item_name || "",
          code: item.lot_no || "",
          external_date: meta.external_date || "",
          internal_date: meta.internal_date || "",
          next_date: meta.next_date || "",
          cycle: meta.cycle || "1년",
          remark: meta.remark || "",
        };
      });
      return { success: true, data: mapped };
    }

    return { success: true, data: DEFAULT_CALIBRATION_ITEMS };
  } catch (error: any) {
    console.error("[getCalibrationItemsFromSupabase error]", error);
    return { success: true, data: DEFAULT_CALIBRATION_ITEMS };
  }
}

/**
 * Supabase에 기기 검교정 관리대장 데이터 전체 저장 / 동기화
 */
export async function saveCalibrationItemsToSupabase(items: CalibrationItem[]) {
  try {
    const supabase = getSupabase();
    if (!supabase) return { success: true };

    // 1차: gmp_calibration_items 시도
    const payload = items.map((item) => ({
      no: item.no,
      name: item.name,
      code: item.code,
      external_date: item.external_date || "",
      internal_date: item.internal_date || "",
      next_date: item.next_date || "",
      cycle: item.cycle || "1년",
      remark: item.remark || "",
      updated_at: new Date().toISOString(),
    }));

    const { error: upsertErr } = await supabase
      .from('gmp_calibration_items')
      .upsert(payload, { onConflict: 'no' });

    if (!upsertErr) {
      return { success: true };
    }

    console.warn("[gmp_calibration_items table error, using ecount_inventory fallback]:", upsertErr.message);

    // 2차 폴백: ecount_inventory 테이블 활용
    await supabase.from('ecount_inventory').delete().eq('status', 'CALIBRATION');
    const payloads = items.map((item) => ({
      item_name: item.name,
      lot_no: item.code,
      quantity: item.no,
      expiry_date: JSON.stringify({
        no: item.no,
        external_date: item.external_date,
        internal_date: item.internal_date,
        next_date: item.next_date,
        cycle: item.cycle,
        remark: item.remark,
      }),
      status: 'CALIBRATION'
    }));

    const { data: invRes, error: invErr } = await supabase.from('ecount_inventory').insert(payloads).select();
    if (!invErr && invRes) return { success: true, data: invRes };

    return { success: true };
  } catch (error: any) {
    console.error("[saveCalibrationItemsToSupabase error]", error);
    return { success: false, message: error?.message || "저장 오류" };
  }
}

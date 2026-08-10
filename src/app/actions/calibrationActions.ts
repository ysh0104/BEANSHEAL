'use server'

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-key";
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export interface CalibrationItem {
  id?: number | string;
  no: number;
  name: string;
  code: string;
  external_date?: string;
  internal_date?: string;
  next_date?: string;
  cycle?: string;
  remark?: string;
  created_at?: string;
}

export const DEFAULT_CALIBRATION_ITEMS: CalibrationItem[] = [
  { no: 1, name: "전자저울1(검수대)", code: "BH-Q-071", external_date: "", internal_date: "2026-05-19", next_date: "2027-05-12", cycle: "1년", remark: "30kg까지" },
  { no: 2, name: "전자저울2(추출실)", code: "BH-Q-072", external_date: "", internal_date: "2026-05-19", next_date: "2027-05-12", cycle: "1년", remark: "30kg까지" },
  { no: 3, name: "전자저울3(분쇄실)", code: "BH-Q-073", external_date: "", internal_date: "2026-05-19", next_date: "2027-05-12", cycle: "1년", remark: "2kg까지" },
  { no: 4, name: "전자저울4(충진실)", code: "BH-Q-074", external_date: "", internal_date: "2026-05-19", next_date: "2027-05-12", cycle: "1년", remark: "1kg까지" },
  { no: 5, name: "전자저울5(충진실)", code: "BH-Q-075", external_date: "", internal_date: "2026-05-19", next_date: "2027-05-12", cycle: "1년", remark: "1kg까지" },
  { no: 6, name: "표준분동", code: "BH-Q-010", external_date: "2026-05-14", internal_date: "", next_date: "2028-05-13", cycle: "2년", remark: "CAL-LAB" },
  { no: 7, name: "차압계1(분쇄실)", code: "BH-Q-084", external_date: "", internal_date: "2024-11-11", next_date: "2025-11-10", cycle: "1년", remark: "" },
  { no: 8, name: "차압계2(칭량실)", code: "BH-Q-085", external_date: "", internal_date: "2024-11-11", next_date: "2025-11-10", cycle: "1년", remark: "" },
  { no: 9, name: "차압계3(추출실)", code: "BH-Q-086", external_date: "", internal_date: "2024-11-11", next_date: "2025-11-10", cycle: "1년", remark: "" },
  { no: 10, name: "차압계4(충진실)", code: "BH-Q-087", external_date: "", internal_date: "2024-11-11", next_date: "2025-11-10", cycle: "1년", remark: "" },
  { no: 11, name: "차압계5", code: "BH-Q-088", external_date: "2026-11-01", internal_date: "", next_date: "2027-11-05", cycle: "1년", remark: "" },
  { no: 12, name: "디지털온도계", code: "BH-Q-013", external_date: "2026-05-13", internal_date: "", next_date: "2027-05-12", cycle: "1년", remark: "CAL-LAB" },
  { no: 13, name: "온도계1(분쇄실)", code: "BH-Q-079", external_date: "", internal_date: "", next_date: "", cycle: "1년", remark: "" },
  { no: 14, name: "온도계2(추출실)", code: "BH-Q-080", external_date: "", internal_date: "", next_date: "", cycle: "1년", remark: "" },
  { no: 15, name: "온습도계3(칭량실)", code: "BH-Q-081", external_date: "", internal_date: "", next_date: "", cycle: "1년", remark: "" },
  { no: 16, name: "온도계4(충진실)", code: "BH-Q-082", external_date: "", internal_date: "", next_date: "", cycle: "1년", remark: "" },
  { no: 17, name: "온도계5(원두보관실)", code: "BH-Q-083", external_date: "", internal_date: "", next_date: "", cycle: "1년", remark: "" },
  { no: 18, name: "온도계6(반제품실)", code: "BH-Q-089", external_date: "", internal_date: "", next_date: "", cycle: "1년", remark: "" },
  { no: 19, name: "온도계7(검체보관실)", code: "BH-Q-090", external_date: "", internal_date: "", next_date: "", cycle: "1년", remark: "" },
  { no: 20, name: "온수기1", code: "BH-M-044", external_date: "", internal_date: "2026-05-19", next_date: "2027-05-12", cycle: "1년", remark: "" },
  { no: 21, name: "온수기2", code: "BH-M-045", external_date: "", internal_date: "2026-05-19", next_date: "2027-05-12", cycle: "1년", remark: "" },
  { no: 22, name: "온수기3", code: "BH-M-045-1", external_date: "", internal_date: "2026-05-19", next_date: "2027-05-12", cycle: "1년", remark: "" },
  { no: 23, name: "배합기(교반)1", code: "BH-M-046", external_date: "", internal_date: "2026-05-19", next_date: "2027-05-12", cycle: "1년", remark: "" },
  { no: 24, name: "배합기(교반)2", code: "BH-M-047", external_date: "", internal_date: "2026-05-19", next_date: "2027-05-12", cycle: "1년", remark: "" },
  { no: 25, name: "배합기(교반)3", code: "BH-M-048", external_date: "", internal_date: "2026-05-19", next_date: "2027-05-12", cycle: "1년", remark: "" },
  { no: 26, name: "스톱워치", code: "BH-Q-015", external_date: "", internal_date: "2026-05-15", next_date: "2027-05-12", cycle: "1년", remark: "" },
  { no: 27, name: "광조도계", code: "BH-Q-012", external_date: "2026-05-13", internal_date: "2026-06-02", next_date: "2027-05-12", cycle: "1년", remark: "CAL-LAB" },
  { no: 28, name: "당도계", code: "BH-Q-092", external_date: "", internal_date: "2026-05-17", next_date: "2027-05-12", cycle: "1년", remark: "CAL-LAB" },
  { no: 31, name: "냉장고온도계", code: "BH-Q-106", external_date: "", internal_date: "2026-05-19", next_date: "2027-05-12", cycle: "1년", remark: "" },
  { no: 32, name: "샘플냉장고온도계1", code: "BH-Q-107", external_date: "", internal_date: "2025-05-16", next_date: "2025-05-16", cycle: "1년", remark: "폐기" },
  { no: 33, name: "샘플냉장고온도계2", code: "BH-Q-108", external_date: "", internal_date: "2025-05-16", next_date: "2025-05-16", cycle: "1년", remark: "폐기" },
  { no: 34, name: "냉동고온도계", code: "BH-Q-109", external_date: "", internal_date: "2026-05-19", next_date: "2027-05-12", cycle: "1년", remark: "" },
  { no: 35, name: "당도계2", code: "BH-Q-102", external_date: "2026-05-14", internal_date: "", next_date: "2027-05-12", cycle: "1년", remark: "검은색" },
  { no: 36, name: "전자저울6(칭량실)", code: "BH-Q-105", external_date: "", internal_date: "2026-05-19", next_date: "2027-05-12", cycle: "1년", remark: "1kg까지" },
  { no: 37, name: "전자저울7(칭량실)", code: "BH-Q-110", external_date: "", internal_date: "2026-05-19", next_date: "2027-05-12", cycle: "1년", remark: "30kg까지" },
];

/**
 * Supabase에서 기기 검교정 관리대장 데이터 전체 조회
 */
export async function getCalibrationItemsFromSupabase() {
  try {
    const { data, error } = await supabase
      .from('gmp_calibration_items')
      .select('*')
      .order('no', { ascending: true });

    if (!error && data && data.length > 0) {
      return { success: true, data };
    }

    // ecount_inventory 내 CALIBRATION 상태 폴백 조회
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
          id: item.id,
          no: meta.no || item.id,
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
    // 1차: gmp_calibration_items 시도
    const { error: delErr } = await supabase.from('gmp_calibration_items').delete().neq('id', 0);
    if (!delErr) {
      const { data, error } = await supabase.from('gmp_calibration_items').insert(items).select();
      if (!error && data) return { success: true, data };
    }

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

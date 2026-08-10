"use server";

import { createClient } from "@supabase/supabase-js";
import { HealthCheckItem, DEFAULT_HEALTH_CHECK_ITEMS } from "@/lib/healthCheckData";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

function getSupabase() {
  if (!supabaseUrl || !supabaseServiceKey) return null;
  return createClient(supabaseUrl, supabaseServiceKey);
}

/**
 * Supabase에서 건강진단결과서(보건증) 데이터 조회 (1차: health_check_items, 2차 폴백: ecount_inventory status='HEALTH_CHECK')
 */
export async function getHealthCheckItemsFromSupabase(): Promise<{ success: boolean; data?: HealthCheckItem[]; error?: string }> {
  try {
    const supabase = getSupabase();
    if (!supabase) {
      return { success: true, data: DEFAULT_HEALTH_CHECK_ITEMS };
    }

    // 1차: health_check_items 테이블 시도
    const { data: primaryData, error: primaryErr } = await supabase
      .from("health_check_items")
      .select("*")
      .order("no", { ascending: true });

    if (!primaryErr && primaryData && primaryData.length > 0) {
      return { success: true, data: primaryData as HealthCheckItem[] };
    }

    // 2차 폴백: ecount_inventory 내 HEALTH_CHECK status 조회
    const { data: fallbackData, error: fallbackErr } = await supabase
      .from("ecount_inventory")
      .select("*")
      .eq("status", "HEALTH_CHECK")
      .order("id", { ascending: true });

    if (!fallbackErr && fallbackData && fallbackData.length > 0) {
      const mapped: HealthCheckItem[] = fallbackData.map((item: any) => {
        let meta: any = {};
        try { meta = JSON.parse(item.expiry_date || "{}"); } catch {}
        return {
          id: String(item.id),
          no: meta.no || item.quantity || 1,
          name: item.item_name || "",
          checkup_date: meta.checkup_date || "",
          judgment_date: meta.judgment_date || "",
          result_status: meta.result_status || "정상",
          next_date: meta.next_date || "",
          remark: meta.remark || "",
        };
      });
      return { success: true, data: mapped };
    }

    return { success: true, data: DEFAULT_HEALTH_CHECK_ITEMS };
  } catch (e: any) {
    console.error("[getHealthCheckItemsFromSupabase error]:", e);
    return { success: true, data: DEFAULT_HEALTH_CHECK_ITEMS };
  }
}

/**
 * Supabase에 건강진단결과서(보건증) 데이터 영구 저장 (1차: health_check_items, 2차 폴백: ecount_inventory status='HEALTH_CHECK')
 */
export async function saveHealthCheckItemsToSupabase(items: HealthCheckItem[]): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = getSupabase();
    if (!supabase) return { success: true };

    // 1차: health_check_items 시도
    const payload = items.map((item) => ({
      no: item.no,
      name: item.name,
      checkup_date: item.checkup_date,
      judgment_date: item.judgment_date,
      result_status: item.result_status || "정상",
      next_date: item.next_date,
      remark: item.remark || "",
      updated_at: new Date().toISOString(),
    }));

    const { error: upsertErr } = await supabase
      .from("health_check_items")
      .upsert(payload, { onConflict: "no" });

    if (!upsertErr) {
      return { success: true };
    }

    console.warn("[health_check_items table missing or error, using ecount_inventory fallback]:", upsertErr.message);

    // 2차 폴백: ecount_inventory 테이블에 영구 보존
    await supabase.from("ecount_inventory").delete().eq("status", "HEALTH_CHECK");

    const fallbackPayloads = items.map((item) => ({
      item_name: item.name,
      lot_no: `HC-${String(item.no).padStart(3, "0")}`,
      quantity: item.no,
      expiry_date: JSON.stringify({
        no: item.no,
        checkup_date: item.checkup_date,
        judgment_date: item.judgment_date,
        result_status: item.result_status,
        next_date: item.next_date,
        remark: item.remark,
      }),
      status: "HEALTH_CHECK"
    }));

    const { error: invErr } = await supabase.from("ecount_inventory").insert(fallbackPayloads);
    if (invErr) {
      console.error("[HealthCheck fallback save error]:", invErr.message);
      return { success: false, error: invErr.message };
    }

    return { success: true };
  } catch (e: any) {
    console.error("[saveHealthCheckItemsToSupabase error]:", e);
    return { success: false, error: e.message };
  }
}

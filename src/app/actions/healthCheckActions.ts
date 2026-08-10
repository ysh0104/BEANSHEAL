"use server";

import { createClient } from "@supabase/supabase-js";
import { HealthCheckItem, DEFAULT_HEALTH_CHECK_ITEMS } from "@/lib/healthCheckData";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

function getSupabase() {
  if (!supabaseUrl || !supabaseServiceKey) return null;
  return createClient(supabaseUrl, supabaseServiceKey);
}

export async function getHealthCheckItemsFromSupabase(): Promise<{ success: boolean; data?: HealthCheckItem[]; error?: string }> {
  try {
    const supabase = getSupabase();
    if (!supabase) {
      return { success: true, data: DEFAULT_HEALTH_CHECK_ITEMS };
    }

    const { data, error } = await supabase
      .from("health_check_items")
      .select("*")
      .order("no", { ascending: true });

    if (error) {
      console.warn("[HealthCheck Supabase warning]:", error.message);
      return { success: true, data: DEFAULT_HEALTH_CHECK_ITEMS };
    }

    if (!data || data.length === 0) {
      return { success: true, data: DEFAULT_HEALTH_CHECK_ITEMS };
    }

    return { success: true, data: data as HealthCheckItem[] };
  } catch (e: any) {
    console.error("getHealthCheckItems error:", e);
    return { success: true, data: DEFAULT_HEALTH_CHECK_ITEMS };
  }
}

export async function saveHealthCheckItemsToSupabase(items: HealthCheckItem[]): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = getSupabase();
    if (!supabase) return { success: true };

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

    const { error } = await supabase
      .from("health_check_items")
      .upsert(payload, { onConflict: "no" });

    if (error) {
      console.warn("[HealthCheck save warning]:", error.message);
    }

    return { success: true };
  } catch (e: any) {
    console.error("saveHealthCheckItems error:", e);
    return { success: false, error: e.message };
  }
}

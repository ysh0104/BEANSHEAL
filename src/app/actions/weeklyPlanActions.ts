"use server";

import { createClient } from "@supabase/supabase-js";
import type { WeeklyPlanGrid } from "@/lib/weeklyPlan";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "placeholder-key";

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function getWeeklyPlan(weekStart: string): Promise<{
  success: boolean;
  data?: WeeklyPlanGrid | null;
  message?: string;
}> {
  try {
    const { data, error } = await supabase
      .from("weekly_plans")
      .select("cells")
      .eq("week_start", weekStart)
      .maybeSingle();

    if (error && error.code !== "PGRST116") {
      return { success: false, message: error.message };
    }

    return { success: true, data: (data?.cells as WeeklyPlanGrid) || null };
  } catch (e: any) {
    return { success: false, message: e?.message || "주간계획표 조회 실패" };
  }
}

export async function saveWeeklyPlan(
  weekStart: string,
  cells: WeeklyPlanGrid,
  updatedBy?: string
): Promise<{ success: boolean; message?: string }> {
  try {
    const { error } = await supabase.from("weekly_plans").upsert(
      {
        week_start: weekStart,
        cells,
        updated_at: new Date().toISOString(),
        updated_by: updatedBy || "시스템 사용자",
      },
      { onConflict: "week_start" }
    );

    if (error) {
      return { success: false, message: error.message };
    }

    return { success: true, message: "주간계획표가 저장되었습니다." };
  } catch (e: any) {
    return { success: false, message: e?.message || "주간계획표 저장 실패" };
  }
}

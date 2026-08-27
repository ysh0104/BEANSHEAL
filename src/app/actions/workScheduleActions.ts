"use server";

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "placeholder-key";

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export type ScheduleEmployeeRow = {
  id: string;
  /** profiles.id 와 동일 (동기화용) */
  profileId?: string;
  name: string;
  group: string;
  shifts: Record<string, string>;
  sortOrder?: number;
};

export async function getWorkSchedule(yearMonth: string): Promise<{
  success: boolean;
  data?: ScheduleEmployeeRow[];
  message?: string;
}> {
  try {
    const { data, error } = await supabase
      .from("work_schedules")
      .select("data")
      .eq("year_month", yearMonth)
      .maybeSingle();

    if (error && error.code !== "PGRST116") {
      return { success: false, message: error.message };
    }

    if (data?.data) {
      return { success: true, data: data.data as ScheduleEmployeeRow[] };
    }

    return { success: true, data: [] };
  } catch (e: any) {
    return { success: false, message: e?.message || "스케줄 조회 실패" };
  }
}

export async function saveWorkSchedule(
  yearMonth: string,
  scheduleData: ScheduleEmployeeRow[],
  updatedBy?: string
): Promise<{ success: boolean; message?: string }> {
  try {
    const payload = {
      year_month: yearMonth,
      data: scheduleData,
      updated_at: new Date().toISOString(),
      updated_by: updatedBy || "시스템 사용자",
    };

    const { error } = await supabase
      .from("work_schedules")
      .upsert(payload, { onConflict: "year_month" });

    if (error) {
      return { success: false, message: error.message };
    }

    return { success: true, message: "월간 스케줄이 성공적으로 저장되었습니다." };
  } catch (e: any) {
    return { success: false, message: e?.message || "스케줄 저장 실패" };
  }
}

export async function deleteWorkSchedule(
  yearMonth: string
): Promise<{ success: boolean; message?: string }> {
  try {
    const { error } = await supabase.from("work_schedules").delete().eq("year_month", yearMonth);
    if (error) {
      return { success: false, message: error.message };
    }
    return { success: true, message: `${yearMonth} 스케줄 데이터를 삭제했습니다.` };
  } catch (e: any) {
    return { success: false, message: e?.message || "스케줄 삭제 실패" };
  }
}

export async function deleteAllWorkSchedules(): Promise<{
  success: boolean;
  message?: string;
}> {
  try {
    const { error } = await supabase.from("work_schedules").delete().neq("year_month", "");
    if (error) {
      return { success: false, message: error.message };
    }
    return { success: true, message: "저장된 모든 월간 스케줄 데이터를 삭제했습니다." };
  } catch (e: any) {
    return { success: false, message: e?.message || "전체 스케줄 삭제 실패" };
  }
}

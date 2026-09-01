"use server";

import { createClient } from "@supabase/supabase-js";
import type { ScheduleEmployeeRow } from "@/app/actions/workScheduleActions";
import {
  normalizeAdminDepartment,
  normalizePersonName,
  scheduleGroupToProfileDept,
} from "@/lib/departmentNormalize";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "placeholder-key";

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

import type { RosterProfile } from "@/lib/scheduleRosterTypes";

function computeRole(department: string, _position: string): "ADMIN" | "QA" | "WORKER" {
  if (department.includes("경영")) return "ADMIN";
  if (department.includes("품질")) return "QA";
  return "WORKER";
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function mapProfileRow(p: Record<string, unknown>): RosterProfile {
  const department = normalizeAdminDepartment(String(p.department || "생산팀"));
  return {
    id: String(p.id),
    full_name: normalizePersonName(String(p.full_name || p.name || "사원")),
    department,
    position: String(p.position || "사원"),
    email: String(p.email || ""),
    schedule_sort_order: Number(p.schedule_sort_order ?? 0),
    include_in_work_schedule: p.include_in_work_schedule !== false,
    is_schedule_only: !!p.is_schedule_only,
  };
}

/** 스케줄표에 포함할 profiles 목록 */
export async function getScheduleRosterProfiles(): Promise<{
  success: boolean;
  data: RosterProfile[];
  message?: string;
}> {
  try {
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select(
        "id, full_name, department, position, email, schedule_sort_order, include_in_work_schedule, is_schedule_only"
      )
      .order("schedule_sort_order", { ascending: true })
      .order("full_name", { ascending: true });

    if (error) {
      const { data: fallback, error: e2 } = await supabaseAdmin
        .from("profiles")
        .select("id, full_name, department, position, email")
        .order("full_name", { ascending: true });
      if (e2) return { success: false, data: [], message: e2.message };
      return {
        success: true,
        data: (fallback || []).map((p) =>
          mapProfileRow({ ...p, include_in_work_schedule: true, schedule_sort_order: 0 })
        ),
      };
    }

    const profiles = (data || [])
      .map(mapProfileRow)
      .filter((p) => p.include_in_work_schedule);

    return { success: true, data: profiles };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "프로필 목록 조회 실패";
    return { success: false, data: [], message: msg };
  }
}

async function getNextSortOrder(): Promise<number> {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("schedule_sort_order")
    .order("schedule_sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  return Number(data?.schedule_sort_order ?? 0) + 1;
}

function buildStaffPlaceholderEmail(_fullName: string): string {
  const id = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  // Supabase Auth는 .internal·한글 local-part 등을 거부 → ASCII + 실제 TLD만 사용
  return `staff.${id}@beansheal.com`;
}

/** 스케줄표/사용자관리 공통 — 신규 사원 등록 */
export async function createProfileForSchedule(
  fullName: string,
  scheduleGroup: string,
  position = "사원"
): Promise<{ success: boolean; profile?: RosterProfile; message?: string }> {
  try {
    const name = normalizePersonName(fullName);
    if (!name) return { success: false, message: "이름을 입력해 주세요." };

    const department = scheduleGroupToProfileDept(scheduleGroup);
    const pos = position || "사원";
    const role = computeRole(department, pos);
    const email = buildStaffPlaceholderEmail(name);
    const password = `${crypto.randomUUID()}Aa1!`;

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: name,
        department,
        position: pos,
        is_schedule_only: true,
      },
    });

    if (authError || !authData.user) {
      const msg = authError?.message || "사원 계정 생성 실패";
      if (msg.toLowerCase().includes("email")) {
        return {
          success: false,
          message: `이메일 형식 오류로 등록에 실패했습니다. (${msg})`,
        };
      }
      return { success: false, message: msg };
    }

    const sortOrder = await getNextSortOrder();
    const payload = {
      id: authData.user.id,
      email,
      full_name: name,
      department,
      position: pos,
      role,
      approval_status: "approved",
      auth_provider: "email",
      include_in_work_schedule: true,
      is_schedule_only: true,
      schedule_sort_order: sortOrder,
      updated_at: new Date().toISOString(),
    };

    const { error: profileError } = await supabaseAdmin.from("profiles").upsert(payload);
    if (profileError) {
      // 신규 컬럼 없을 때 폴백
      const { error: e2 } = await supabaseAdmin.from("profiles").upsert({
        id: authData.user.id,
        email,
        full_name: name,
        department,
        position: pos,
        role,
        updated_at: new Date().toISOString(),
      });
      if (e2) return { success: false, message: e2.message };
    }

    return {
      success: true,
      profile: mapProfileRow({ ...payload, is_schedule_only: true }),
    };
  } catch (e: unknown) {
    return { success: false, message: e instanceof Error ? e.message : "사원 등록 실패" };
  }
}

/** 스케줄표에서 이름/부서 수정 → profiles 반영 */
export async function updateProfileFromSchedule(
  profileId: string,
  fullName: string,
  scheduleGroup: string
): Promise<{ success: boolean; message?: string }> {
  try {
    const name = normalizePersonName(fullName);
    const department = scheduleGroupToProfileDept(scheduleGroup);

    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("position")
      .eq("id", profileId)
      .maybeSingle();

    const position = String(existing?.position || "사원");
    const role = computeRole(department, position);

    const patch = {
      full_name: name,
      department,
      role,
      include_in_work_schedule: true,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabaseAdmin.from("profiles").update(patch).eq("id", profileId);
    if (error) {
      const { error: e2 } = await supabaseAdmin
        .from("profiles")
        .update({ full_name: name, department, role, updated_at: patch.updated_at })
        .eq("id", profileId);
      if (e2) return { success: false, message: e2.message };
    }
    return { success: true };
  } catch (e: unknown) {
    return { success: false, message: e instanceof Error ? e.message : "프로필 수정 실패" };
  }
}

/** 스케줄표에서 삭제 → 사용자 목록에는 유지, 스케줄만 제외 */
export async function excludeProfileFromSchedule(
  profileId: string
): Promise<{ success: boolean; message?: string }> {
  try {
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({
        include_in_work_schedule: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", profileId);

    if (error) {
      return { success: true, message: "스케줄에서 제외 (로컬만 반영)" };
    }
    return { success: true };
  } catch (e: unknown) {
    return { success: false, message: e instanceof Error ? e.message : "제외 처리 실패" };
  }
}

/** 저장 시 순서·이름·부서 profiles 동기화 */
export async function syncScheduleRosterFromRows(
  rows: ScheduleEmployeeRow[]
): Promise<{ success: boolean; message?: string }> {
  try {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const profileId = row.profileId || (isUuid(row.id) ? row.id : null);
      if (!profileId) continue;

      const department = scheduleGroupToProfileDept(row.group);
      const patch: Record<string, unknown> = {
        full_name: normalizePersonName(row.name),
        department,
        include_in_work_schedule: true,
        schedule_sort_order: i,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabaseAdmin.from("profiles").update(patch).eq("id", profileId);
      if (error) {
        await supabaseAdmin
          .from("profiles")
          .update({
            full_name: patch.full_name,
            department,
            updated_at: patch.updated_at,
          })
          .eq("id", profileId);
      }
    }
    return { success: true };
  } catch (e: unknown) {
    return { success: false, message: e instanceof Error ? e.message : "로스터 동기화 실패" };
  }
}

"use server";

import { createClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { formatJobTitle, normalizeAdminDepartment } from "@/lib/departmentNormalize";

export interface ProfileItem {
  id: string;
  email: string;
  full_name: string;
  department: string;
  position: string;
  role: "ADMIN" | "QA" | "WORKER";
  job_title?: string;
  updated_at?: string;
  created_at?: string;
  permission_group_id?: string | null;
  ecount_user_id?: string | null;
  ecount_emp_cd?: string | null;
  ecount_user_name?: string | null;
}

function computeRoleHelper(department: string, _position: string): "ADMIN" | "QA" | "WORKER" {
  if (department.includes("경영")) return "ADMIN";
  if (department.includes("품질")) return "QA";
  return "WORKER";
}

// 부서 + 직급 조합으로 실제 권한(role) 자동 계산
export async function computeRole(department: string, position: string): Promise<"ADMIN" | "QA" | "WORKER"> {
  return computeRoleHelper(department, position);
}

/**
 * 전체 사용자 프로필 목록 조회 (관리자 전용)
 */
export async function getAllUserProfiles() {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("getAllUserProfiles error:", error);
      return { success: false, message: error.message, data: [] };
    }

    const profiles: ProfileItem[] = (data || []).map((p: any) => {
      let department = normalizeAdminDepartment(p.department || "생산팀");
      let position = (p.position || "사원").trim();
      if (position === "관리자") position = "이사";
      const role =
        (p.role as "ADMIN" | "QA" | "WORKER") || computeRoleHelper(department, position);

      return {
        id: p.id,
        email: p.email || "",
        full_name: p.full_name || p.name || "사용자",
        department,
        position,
        role,
        job_title: formatJobTitle(department, position),
        updated_at: p.updated_at || p.created_at || new Date().toISOString(),
        permission_group_id: p.permission_group_id || null,
        ecount_user_id: p.ecount_user_id || null,
        ecount_emp_cd: p.ecount_emp_cd || null,
        ecount_user_name: p.ecount_user_name || null,
      };
    });

    return { success: true, data: profiles };
  } catch (err: any) {
    console.error("getAllUserProfiles exception:", err);
    return { success: false, message: err?.message || "프로필 목록 조회 실패", data: [] };
  }
}

/**
 * 관리자가 특정 사용자의 부서, 직급 및 권한(Role) 변경/부여
 */
export async function updateUserProfile(
  userId: string,
  department: string,
  position: string,
  customRole?: "ADMIN" | "QA" | "WORKER"
) {
  try {
    const normalizedPosition = position === "관리자" ? "이사" : position;
    const normalizedDepartment = normalizeAdminDepartment(
      department === "-" || !department?.trim() ? "생산팀" : department
    );
    const role = customRole || computeRoleHelper(normalizedDepartment, normalizedPosition);
    const updatedAt = new Date().toISOString();

    const { error } = await supabase
      .from("profiles")
      .update({
        department: normalizedDepartment,
        position: normalizedPosition,
        role,
        updated_at: updatedAt,
      })
      .eq("id", userId);

    if (error) {
      console.error("updateUserProfile error:", error);
      return { success: false, message: error.message };
    }

    return {
      success: true,
      message: "사용자 직책 및 권한이 성공적으로 수정되었습니다.",
      updated: { department: normalizedDepartment, position: normalizedPosition, role, updatedAt },
    };
  } catch (err: any) {
    console.error("updateUserProfile exception:", err);
    return { success: false, message: err?.message || "수정 처리 중 오류가 발생했습니다." };
  }
}

/**
 * 사원/사용자 삭제 서버 액션 (Supabase Admin Auth & profiles 테이블 즉시 삭제)
 */
export async function deleteUserProfile(userId: string) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
    const supabaseServiceKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      "placeholder-key";

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { error } = await supabaseAdmin
      .from("profiles")
      .delete()
      .eq("id", userId);

    if (error) {
      await supabase.from("profiles").delete().eq("id", userId);
    }

    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
      try {
        await supabaseAdmin.auth.admin.deleteUser(userId);
      } catch (authErr) {}
    }

    return { success: true, message: "사원이 정상 삭제되었습니다." };
  } catch (err: any) {
    console.error("deleteUserProfile exception:", err);
    return { success: false, message: err?.message || "사원 삭제 처리 오류" };
  }
}

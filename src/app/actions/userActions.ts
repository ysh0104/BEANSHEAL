"use server";

import { supabase } from "@/lib/supabase";
import { formatJobTitle } from "@/context/AuthContext";

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
}

function computeRoleHelper(department: string, position: string): "ADMIN" | "QA" | "WORKER" {
  if (position === "관리자" || department.includes("경영")) return "ADMIN";
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

    const profiles: ProfileItem[] = (data || []).map((p: any) => ({
      id: p.id,
      email: p.email || "",
      full_name: p.full_name || p.name || "사용자",
      department: p.department || "생산팀",
      position: p.position || "사원",
      role: p.role || computeRoleHelper(p.department || "생산팀", p.position || "사원"),
      job_title: formatJobTitle(p.department || "생산팀", p.position || "사원"),
      updated_at: p.updated_at || p.created_at || new Date().toISOString(),
      permission_group_id: p.permission_group_id || null,
    }));

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
    let role = customRole || computeRoleHelper(department, position);
    if (position === "관리자" || position === "대표이사" || position === "대표" || position === "이사") {
      department = "-";
      role = "ADMIN";
    }
    const updatedAt = new Date().toISOString();

    const { error } = await supabase
      .from("profiles")
      .update({
        department,
        position,
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
      updated: { department, position, role, updatedAt },
    };
  } catch (err: any) {
    console.error("updateUserProfile exception:", err);
    return { success: false, message: err?.message || "수정 처리 중 오류가 발생했습니다." };
  }
}

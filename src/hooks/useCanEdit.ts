"use client";

import { useAuth, UserProfile } from "@/context/AuthContext";
import type { FeatureKey } from "@/lib/permissions";

/** @deprecated FeatureGroup → FeatureKey 와 동일. 기존 페이지 호환용 */
export type FeatureGroup = FeatureKey | "all";

function isSuperUser(user: UserProfile): boolean {
  return (
    user.role === "ADMIN" ||
    user.position === "대표" ||
    user.position === "대표이사" ||
    user.permissionGroupName === "전체관리자"
  );
}

/**
 * 권한 그룹(또는 레거시 부서 규칙) 기반 수정 권한
 */
export function canUserEdit(user: UserProfile | null, group: FeatureGroup): boolean {
  if (!user) return false;
  if (group === "all") return true;
  if (isSuperUser(user)) return true;

  const key = group as FeatureKey;
  if (user.permissions?.[key]) {
    return !!user.permissions[key].can_edit;
  }

  // 레거시 폴백 (권한 그룹 미적용 환경)
  const dept = user.department || "";
  if (dept.includes("경영")) return true;

  switch (key) {
    case "production":
    case "recipes":
      return dept.includes("생산");
    case "qa":
      return dept.includes("품질") || user.role === "QA";
    case "inventory":
      return dept.includes("생산") || dept.includes("경영지원");
    case "cms":
    case "admin_users":
      return user.role === "ADMIN";
    case "schedule_mgmt":
    case "memo":
    case "work_schedule":
    case "weekly_plan":
      return true;
    default:
      return false;
  }
}

export function canUserView(user: UserProfile | null, group: FeatureGroup): boolean {
  if (!user) return false;
  if (group === "all") return true;
  if (isSuperUser(user)) return true;

  const key = group as FeatureKey;
  if (user.permissions?.[key]) {
    return !!user.permissions[key].can_view || !!user.permissions[key].can_edit;
  }

  // 그룹 없으면 기존처럼 로그인 사용자는 대부분 조회 가능
  if (key === "cms" || key === "admin_users") {
    return (
      user.role === "ADMIN" ||
      !!user.department?.includes("경영") ||
      !!user.permissions?.[key]?.can_view
    );
  }
  return true;
}

export function useCanEdit(group: FeatureGroup): { canEdit: boolean; user: UserProfile | null } {
  const { user } = useAuth();
  const canEdit = canUserEdit(user, group);
  return { canEdit, user };
}

export function useCanView(group: FeatureGroup): { canView: boolean; user: UserProfile | null } {
  const { user } = useAuth();
  const canView = canUserView(user, group);
  return { canView, user };
}

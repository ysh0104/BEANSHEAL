"use client";

import { useAuth, UserProfile } from "@/context/AuthContext";

export type FeatureGroup = "production" | "qa" | "inventory" | "recipes" | "cms" | "all";

/**
 * 사용자 부서 및 권한을 기반으로 특정 기능의 쓰기(생성/수정/삭제) 권한 보유 여부 확인
 */
export function canUserEdit(user: UserProfile | null, group: FeatureGroup): boolean {
  if (!user) return false;

  // 경영관리 부서, 관리자 직급, 또는 ADMIN 권한은 모든 화면 수정/생성 가능
  if (
    (user.role as string) === "ADMIN" ||
    user.department.includes("경영") ||
    user.position === "관리자" ||
    user.position === "대표" ||
    user.position === "대표이사"
  ) {
    return true;
  }

  const dept = user.department || "";

  switch (group) {
    case "production":
      // 생산관리 부서 -> 생산/발주 계획, 제조/공정 실행 수정 가능
      return dept.includes("생산");

    case "qa":
      // 품질관리 부서 또는 QA 권한 -> 품질/감사(QA) 수정 가능
      return dept.includes("품질") || user.role === "QA";

    case "inventory":
      // 자재물류 부서 -> 자재/물류 관리 수정 가능
      return dept.includes("자재") || dept.includes("물류");

    case "recipes":
      // 기준정보 레시피 -> 생산관리 부서 수정 가능
      return dept.includes("생산");

    case "cms":
      // 홈페이지 관리 -> 관리자 전용
      return user.role === "ADMIN";

    case "all":
      return true;

    default:
      return false;
  }
}

/**
 * 리액트 컴포넌트용 커스텀 훅
 */
export function useCanEdit(group: FeatureGroup): { canEdit: boolean; user: UserProfile | null } {
  const { user } = useAuth();
  const canEdit = canUserEdit(user, group);
  return { canEdit, user };
}

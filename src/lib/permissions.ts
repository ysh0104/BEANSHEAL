/** 기능(메뉴/화면) 권한 카탈로그 — 이카운트식 권한 그룹의 feature_key */

export type FeatureKey =
  | "recipes"
  | "production"
  | "inventory"
  | "qa"
  | "cms"
  | "admin_users"
  | "workspace";

export type FeaturePermission = {
  can_view: boolean;
  can_edit: boolean;
};

export type PermissionMap = Record<FeatureKey, FeaturePermission>;

export const FEATURE_CATALOG: {
  key: FeatureKey;
  label: string;
  description: string;
}[] = [
  { key: "workspace", label: "워크스페이스", description: "대시보드 · 메모 · 일정" },
  { key: "recipes", label: "기준정보 (BOM)", description: "제품 레시피 조회/수정" },
  { key: "production", label: "생산/제조", description: "발주계산 · 작업지시 · 제조기록 · 로트" },
  { key: "inventory", label: "자재/물류", description: "재고 · 스캔" },
  { key: "qa", label: "품질/감사", description: "Audit 실적 등록" },
  { key: "cms", label: "홈페이지 관리", description: "문의 · FAQ · 포트폴리오" },
  { key: "admin_users", label: "시스템/사용자", description: "사원 · 권한 그룹 관리" },
];

export const ALL_FEATURE_KEYS = FEATURE_CATALOG.map((f) => f.key);

export function emptyPermissionMap(view = false, edit = false): PermissionMap {
  return ALL_FEATURE_KEYS.reduce((acc, key) => {
    acc[key] = { can_view: view, can_edit: edit };
    return acc;
  }, {} as PermissionMap);
}

export function fullPermissionMap(): PermissionMap {
  return emptyPermissionMap(true, true);
}

/** 메뉴 그룹명 → feature_key */
export const MENU_FEATURE_MAP: Record<string, FeatureKey> = {
  "기준정보 관리": "recipes",
  "생산/발주 계획": "production",
  "제조/공정 실행": "production",
  "자재/물류 관리": "inventory",
  "품질/감사 (QA)": "qa",
  "홈페이지 관리": "cms",
  "시스템/사용자 관리": "admin_users",
};

export type PermissionGroupRecord = {
  id: string;
  name: string;
  description: string;
  is_system: boolean;
  features: PermissionMap;
};

/** 시드용 기본 그룹 정의 */
export const DEFAULT_GROUP_SEEDS: {
  name: string;
  description: string;
  is_system: boolean;
  features: PermissionMap;
}[] = [
  {
    name: "전체관리자",
    description: "모든 메뉴 조회·수정 (슈퍼유저)",
    is_system: true,
    features: fullPermissionMap(),
  },
  {
    name: "생산",
    description: "BOM · 생산/제조 · 재고 수정, 품질 조회",
    is_system: false,
    features: {
      workspace: { can_view: true, can_edit: true },
      recipes: { can_view: true, can_edit: true },
      production: { can_view: true, can_edit: true },
      inventory: { can_view: true, can_edit: true },
      qa: { can_view: true, can_edit: false },
      cms: { can_view: false, can_edit: false },
      admin_users: { can_view: false, can_edit: false },
    },
  },
  {
    name: "품질",
    description: "품질/감사 수정, 생산·재고 조회",
    is_system: false,
    features: {
      workspace: { can_view: true, can_edit: true },
      recipes: { can_view: true, can_edit: false },
      production: { can_view: true, can_edit: false },
      inventory: { can_view: true, can_edit: false },
      qa: { can_view: true, can_edit: true },
      cms: { can_view: false, can_edit: false },
      admin_users: { can_view: false, can_edit: false },
    },
  },
  {
    name: "경영지원",
    description: "대부분 조회·수정, 사용자 관리 포함",
    is_system: false,
    features: fullPermissionMap(),
  },
  {
    name: "조회전용",
    description: "업무 메뉴 조회만 (수정 불가)",
    is_system: false,
    features: {
      workspace: { can_view: true, can_edit: true },
      recipes: { can_view: true, can_edit: false },
      production: { can_view: true, can_edit: false },
      inventory: { can_view: true, can_edit: false },
      qa: { can_view: true, can_edit: false },
      cms: { can_view: false, can_edit: false },
      admin_users: { can_view: false, can_edit: false },
    },
  },
];

export function featuresFromRows(
  rows: { feature_key: string; can_view: boolean; can_edit: boolean }[]
): PermissionMap {
  const map = emptyPermissionMap(false, false);
  for (const row of rows || []) {
    const key = row.feature_key as FeatureKey;
    if (!ALL_FEATURE_KEYS.includes(key)) continue;
    map[key] = {
      can_view: !!row.can_view,
      can_edit: !!row.can_edit,
    };
  }
  return map;
}

export function inferGroupNameFromProfile(department: string, role: string): string {
  if (role === "ADMIN" || department.includes("경영진") || department.includes("경영지원") || department.includes("경영")) {
    return department.includes("경영진") || role === "ADMIN" ? "전체관리자" : "경영지원";
  }
  if (department.includes("품질") || role === "QA") return "품질";
  if (department.includes("생산")) return "생산";
  return "조회전용";
}

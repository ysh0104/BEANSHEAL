/** 기능(메뉴/화면) 권한 카탈로그 — 이카운트식 권한 그룹의 feature_key */

export type FeatureKey =
  | "schedule_mgmt"
  | "memo"
  | "work_schedule"
  | "weekly_plan"
  | "recipes"
  | "production"
  | "inventory"
  | "qa"
  | "cms"
  | "admin_users";

export type FeaturePermission = {
  can_view: boolean;
  can_edit: boolean;
};

export type PermissionMap = Record<FeatureKey, FeaturePermission>;

/** 레거시 workspace 키 → 세분화된 4개 키 */
export const WORKSPACE_FEATURE_KEYS: FeatureKey[] = [
  "schedule_mgmt",
  "memo",
  "work_schedule",
  "weekly_plan",
];

export const FEATURE_CATALOG: {
  key: FeatureKey;
  label: string;
  description: string;
  section?: string;
}[] = [
  {
    key: "schedule_mgmt",
    label: "일정관리",
    description: "월간 생산 계획표 · 노션 일정",
    section: "BEANSHEAL Workspace",
  },
  {
    key: "memo",
    label: "메모",
    description: "실시간 특이사항 · 공유 메모",
    section: "BEANSHEAL Workspace",
  },
  {
    key: "work_schedule",
    label: "스케줄표",
    description: "월간 근무 · 근무조 스케줄표",
    section: "BEANSHEAL Workspace",
  },
  {
    key: "weekly_plan",
    label: "주간계획표",
    description: "주간 생산/입고/출고 계획표",
    section: "BEANSHEAL Workspace",
  },
  { key: "recipes", label: "기준정보 (BOM)", description: "제품 레시피 조회/수정" },
  { key: "production", label: "생산/제조", description: "발주계산 · 작업지시 · 제조기록 · 로트" },
  { key: "inventory", label: "자재/물류", description: "재고 · 스캔" },
  { key: "qa", label: "품질/감사", description: "Audit 실적 등록" },
  { key: "cms", label: "BEANSHEAL Connect", description: "문의 · FAQ · 포트폴리오" },
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

/** 워크스페이스 4기능만 동일 권한으로 설정 */
export function workspacePermission(view: boolean, edit: boolean): Pick<PermissionMap, "schedule_mgmt" | "memo" | "work_schedule" | "weekly_plan"> {
  return {
    schedule_mgmt: { can_view: view, can_edit: edit },
    memo: { can_view: view, can_edit: edit },
    work_schedule: { can_view: view, can_edit: edit },
    weekly_plan: { can_view: view, can_edit: edit },
  };
}

/** 메뉴 그룹명 → feature_key */
export const MENU_FEATURE_MAP: Record<string, FeatureKey> = {
  "기준정보 관리": "recipes",
  "생산/발주 계획": "production",
  "제조/공정 실행": "production",
  "자재/물류 관리": "inventory",
  "품질/감사 (QA)": "qa",
  "BEANSHEAL Connect 관리": "cms",
  "시스템/사용자 관리": "admin_users",
};

export type PermissionGroupRecord = {
  id: string;
  name: string;
  description: string;
  is_system: boolean;
  features: PermissionMap;
};

const wsFull = workspacePermission(true, true);
const wsViewOnly = workspacePermission(true, false);

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
      ...wsFull,
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
      ...wsFull,
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
      ...wsViewOnly,
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

  // 레거시 workspace → 4개 워크스페이스 기능으로 폴백
  const legacy = rows?.find((r) => r.feature_key === "workspace");
  if (legacy) {
    for (const key of WORKSPACE_FEATURE_KEYS) {
      const hasOwn = rows?.some((r) => r.feature_key === key);
      if (!hasOwn) {
        map[key] = {
          can_view: !!legacy.can_view,
          can_edit: !!legacy.can_edit,
        };
      }
    }
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

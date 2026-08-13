/** admin/users 부서명 ↔ WorkScheduleTable 팀명 매핑 */

export const ADMIN_DEPARTMENT_OPTIONS = [
  "생산팀",
  "품질관리팀",
  "영업팀",
  "경영지원팀",
  "경영진",
] as const;

export const SCHEDULE_GROUP_OPTIONS = [
  "생산팀",
  "품질팀",
  "영업팀",
  "경영지원팀",
  "경영진",
] as const;

export type AdminDepartment = (typeof ADMIN_DEPARTMENT_OPTIONS)[number];
export type ScheduleGroup = (typeof SCHEDULE_GROUP_OPTIONS)[number];

export function normalizeAdminDepartment(dept: string): AdminDepartment {
  const d = (dept || "").trim();
  if (!d || d === "-") return "경영진";
  if ((ADMIN_DEPARTMENT_OPTIONS as readonly string[]).includes(d)) return d as AdminDepartment;
  if (d.includes("경영진")) return "경영진";
  if (d.includes("경영지원") || d.includes("경영관리") || d === "경영") return "경영지원팀";
  if (d.includes("품질")) return "품질관리팀";
  if (d.includes("영업")) return "영업팀";
  if (d.includes("자재") || d.includes("물류") || d.includes("생산")) return "생산팀";
  return "생산팀";
}

/** profiles.department → 스케줄표 group */
export function profileDeptToScheduleGroup(dept: string): ScheduleGroup {
  const admin = normalizeAdminDepartment(dept);
  if (admin === "품질관리팀") return "품질팀";
  if (admin === "경영진") return "경영진";
  return admin as ScheduleGroup;
}

/** 스케줄표 group → profiles.department */
export function scheduleGroupToProfileDept(group: string): AdminDepartment {
  const g = (group || "").trim();
  if (g === "품질팀" || g.includes("품질")) return "품질관리팀";
  if (g === "경영진" || g.includes("경영진")) return "경영진";
  if ((SCHEDULE_GROUP_OPTIONS as readonly string[]).includes(g)) {
    if (g === "품질팀") return "품질관리팀";
    return g as AdminDepartment;
  }
  return normalizeAdminDepartment(g);
}

export function normalizePersonName(name: string): string {
  return (name || "").trim().replace(/\s+/g, " ");
}

export function formatJobTitle(department: string, position: string): string {
  const pos = position === "관리자" ? "이사" : position || "사원";
  const dept = (department || "생산팀").trim();
  if (!dept || dept === "-") {
    return pos;
  }
  return `${dept} ${pos}`;
}

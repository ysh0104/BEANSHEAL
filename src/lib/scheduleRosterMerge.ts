import {
  normalizePersonName,
  profileDeptToScheduleGroup,
} from "@/lib/departmentNormalize";
import type { ScheduleEmployeeRow } from "@/app/actions/workScheduleActions";
import type { RosterProfile } from "@/lib/scheduleRosterTypes";

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function buildDefaultShifts(year: number, month: number): Record<string, string> {
  const days = new Date(year, month, 0).getDate();
  const shifts: Record<string, string> = {};
  for (let day = 1; day <= days; day++) {
    const dateObj = new Date(year, month - 1, day);
    shifts[String(day)] = dateObj.getDay() === 0 || dateObj.getDay() === 6 ? "BE" : "A4";
  }
  return shifts;
}

/** profiles + 기존 월간 shifts 병합 */
export function mergeRosterWithScheduleRows(
  profiles: RosterProfile[],
  existingRows: ScheduleEmployeeRow[],
  year: number,
  month: number
): ScheduleEmployeeRow[] {
  const rowById = new Map<string, ScheduleEmployeeRow>();
  const rowByName = new Map<string, ScheduleEmployeeRow>();

  for (const row of existingRows) {
    if (isUuid(row.id)) rowById.set(row.id, row);
    if (row.profileId && isUuid(row.profileId)) rowById.set(row.profileId, row);
    rowByName.set(normalizePersonName(row.name), row);
  }

  const sorted = [...profiles].sort((a, b) => {
    if (a.schedule_sort_order !== b.schedule_sort_order) {
      return a.schedule_sort_order - b.schedule_sort_order;
    }
    return a.full_name.localeCompare(b.full_name, "ko");
  });

  return sorted.map((p, index) => {
    const group = profileDeptToScheduleGroup(p.department);
    const matched =
      rowById.get(p.id) || rowByName.get(normalizePersonName(p.full_name));

    return {
      id: p.id,
      profileId: p.id,
      name: p.full_name,
      group,
      shifts:
        matched?.shifts && Object.keys(matched.shifts).length > 0
          ? matched.shifts
          : buildDefaultShifts(year, month),
      sortOrder: index,
    };
  });
}

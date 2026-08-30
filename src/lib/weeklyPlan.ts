import type { ScheduleLike } from "@/lib/scheduleDisplay";

export type WeeklyPlanCategory = "생산" | "관리" | "입고" | "출고";

export type WeeklyPlanGrid = Record<WeeklyPlanCategory, string[]>;

export type WeekDay = {
  dateStr: string;
  day: number;
  month: number;
};

export const WEEKLY_PLAN_CATEGORIES: WeeklyPlanCategory[] = ["생산", "관리", "입고", "출고"];

const DAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];

export function emptyWeeklyPlanGrid(): WeeklyPlanGrid {
  return {
    생산: Array(7).fill(""),
    관리: Array(7).fill(""),
    입고: Array(7).fill(""),
    출고: Array(7).fill(""),
  };
}

function parseYmd(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return { y, m, d };
}

function formatYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 해당 날짜가 속한 주의 월요일 */
export function getMondayOfDate(date: Date = new Date()): string {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dow = d.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + diff);
  return formatYmd(d);
}

export function weekDaysFromMonday(mondayStr: string): WeekDay[] {
  const { y, m, d } = parseYmd(mondayStr);
  return Array.from({ length: 7 }, (_, i) => {
    const dt = new Date(y, m - 1, d + i);
    return {
      dateStr: formatYmd(dt),
      day: dt.getDate(),
      month: dt.getMonth() + 1,
    };
  });
}

/** 기준일 전·후 N일 포함한 날짜 배열 (기본: 전 3일 + 당일 + 후 4일 = 8일) */
export function daysAroundToday(
  before = 3,
  after = 4,
  anchor: Date = new Date()
): WeekDay[] {
  const start = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() - before);
  return Array.from({ length: before + after + 1 }, (_, i) => {
    const dt = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    return {
      dateStr: formatYmd(dt),
      day: dt.getDate(),
      month: dt.getMonth() + 1,
    };
  });
}

export function dayOfWeekShort(dateStr: string): string {
  const { y, m, d } = parseYmd(dateStr);
  return ["일", "월", "화", "수", "목", "금", "토"][new Date(y, m - 1, d).getDay()];
}

export function weekDayLabel(day: WeekDay, idx: number): string {
  return `${day.month}/${day.day} (${DAY_LABELS[idx]})`;
}

export function isTodayDate(dateStr: string): boolean {
  return dateStr === formatYmd(new Date());
}

export function resolveScheduleCategory(sch: ScheduleLike): WeeklyPlanCategory {
  const text = `${sch.tag_name || ""} ${sch.product_name || ""}`.toLowerCase();
  if (text.includes("생산") || text.includes("제조") || text.includes("라인")) return "생산";
  if (text.includes("입고") || text.includes("자재") || text.includes("원료") || text.includes("발주")) return "입고";
  if (text.includes("출고") || text.includes("배송") || text.includes("납품") || text.includes("택배")) return "출고";
  return "관리";
}

function scheduleOverlapsDay(sch: ScheduleLike, dateStr: string) {
  const start = sch.plan_date ? String(sch.plan_date).split("T")[0].trim() : "";
  if (!start) return false;
  const end =
    sch.end_date && String(sch.end_date).trim()
      ? String(sch.end_date).split("T")[0].trim()
      : start;
  return start <= dateStr && dateStr <= end;
}

export function getSchedulesForCell(
  schedules: ScheduleLike[],
  category: WeeklyPlanCategory,
  dateStr: string
): ScheduleLike[] {
  return schedules.filter(
    (sch) => resolveScheduleCategory(sch) === category && scheduleOverlapsDay(sch, dateStr)
  );
}

export function countDaySchedules(schedules: ScheduleLike[], dateStr: string): number {
  return WEEKLY_PLAN_CATEGORIES.reduce(
    (sum, cat) => sum + getSchedulesForCell(schedules, cat, dateStr).length,
    0
  );
}

export function shiftMonday(mondayStr: string, weeks: number): string {
  const { y, m, d } = parseYmd(mondayStr);
  const dt = new Date(y, m - 1, d + weeks * 7);
  return formatYmd(dt);
}

export function weekOfMonthLabel(monday: WeekDay): string {
  const { y } = parseYmd(monday.dateStr);
  const month = monday.month;
  const firstOfMonth = new Date(y, month - 1, 1);
  const firstDow = firstOfMonth.getDay();
  const adjusted = monday.day + ((firstDow + 6) % 7);
  const weekNum = Math.ceil(adjusted / 7) || 1;
  return `${y}년 ${month}월 ${weekNum}주차`;
}

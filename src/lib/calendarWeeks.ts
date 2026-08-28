export type CalendarCell = {
  day: number;
  dateStr: string;
  isToday: boolean;
  isOtherMonth: boolean;
  dayOfWeek: number;
};

export type AgendaDayGroup = {
  dateStr: string;
  day: number;
  dayOfWeek: number;
  isToday: boolean;
  schedules: any[];
};

const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];

export function dayName(dayOfWeek: number): string {
  return DAY_NAMES[dayOfWeek] ?? "";
}

export function formatDateString(year: number, month: number, day: number): string {
  const m = String(month + 1).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${year}-${m}-${d}`;
}

export function parseScheduleDateRange(sch: { plan_date?: string; end_date?: string }) {
  const start = sch.plan_date ? String(sch.plan_date).split("T")[0].trim() : "";
  const end =
    sch.end_date && String(sch.end_date).trim()
      ? String(sch.end_date).split("T")[0].trim()
      : start;
  return { start, end };
}

export function scheduleCoversDate(sch: { plan_date?: string; end_date?: string }, dateStr: string): boolean {
  const { start, end } = parseScheduleDateRange(sch);
  if (!start) return false;
  return dateStr >= start && dateStr <= end;
}

export function getCalendarWeeks(y: number, m: number): CalendarCell[][] {
  const firstDayIndex = new Date(y, m, 1).getDay();
  const totalDays = new Date(y, m + 1, 0).getDate();

  const weeks: CalendarCell[][] = [];
  let currentWeek: CalendarCell[] = [];
  const today = new Date();

  for (let i = 0; i < firstDayIndex; i++) {
    const prevDate = new Date(y, m, 1 - (firstDayIndex - i));
    const pY = prevDate.getFullYear();
    const pM = prevDate.getMonth();
    const pD = prevDate.getDate();
    currentWeek.push({
      day: pD,
      dateStr: formatDateString(pY, pM, pD),
      isToday: false,
      isOtherMonth: true,
      dayOfWeek: i,
    });
  }

  for (let d = 1; d <= totalDays; d++) {
    const dateStr = formatDateString(y, m, d);
    const isToday = d === today.getDate() && m === today.getMonth() && y === today.getFullYear();
    const dayOfWeek = currentWeek.length % 7;
    currentWeek.push({
      day: d,
      dateStr,
      isToday,
      isOtherMonth: false,
      dayOfWeek,
    });

    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }

  if (currentWeek.length > 0) {
    let nextD = 1;
    while (currentWeek.length < 7) {
      const nextDate = new Date(y, m + 1, nextD);
      const nY = nextDate.getFullYear();
      const nM = nextDate.getMonth();
      const nD = nextDate.getDate();
      currentWeek.push({
        day: nD,
        dateStr: formatDateString(nY, nM, nD),
        isToday: false,
        isOtherMonth: true,
        dayOfWeek: currentWeek.length,
      });
      nextD++;
    }
    weeks.push(currentWeek);
  }

  return weeks;
}

export function groupSchedulesForMonth(schedules: any[], year: number, month: number): AgendaDayGroup[] {
  const totalDays = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  const todayStr = formatDateString(today.getFullYear(), today.getMonth(), today.getDate());
  const groups: AgendaDayGroup[] = [];

  for (let d = 1; d <= totalDays; d++) {
    const dateStr = formatDateString(year, month, d);
    const daySchedules = schedules.filter((sch) => scheduleCoversDate(sch, dateStr));
    if (daySchedules.length === 0) continue;

    groups.push({
      dateStr,
      day: d,
      dayOfWeek: new Date(year, month, d).getDay(),
      isToday: dateStr === todayStr,
      schedules: daySchedules.sort((a, b) => String(a.id).localeCompare(String(b.id))),
    });
  }

  return groups;
}

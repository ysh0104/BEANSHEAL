"use client";

import { useEffect, useMemo, useState } from "react";
import { getWorkSchedule, type ScheduleEmployeeRow } from "@/app/actions/workScheduleActions";
import { getShiftInfo } from "@/components/WorkScheduleTable";
import { normalizePersonName } from "@/lib/departmentNormalize";
import { dayOfWeekShort, daysAroundToday } from "@/lib/weeklyPlan";

function workScheduleCacheKey(yearMonth: string) {
  return `beansheal_work_schedule_${yearMonth}`;
}

function readCachedWorkSchedule(yearMonth: string): ScheduleEmployeeRow[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(workScheduleCacheKey(yearMonth));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function findMyRow(rows: ScheduleEmployeeRow[], userName: string): ScheduleEmployeeRow | null {
  const key = normalizePersonName(userName);
  if (!key) return null;
  return rows.find((r) => normalizePersonName(r.name) === key) ?? null;
}

function yearMonthFromDateStr(dateStr: string): string {
  const [y, m] = dateStr.split("-");
  return `${y}-${m}`;
}

type Props = {
  userName?: string;
};

export default function MyWeeklyShiftStrip({ userName }: Props) {
  const [myRowsByMonth, setMyRowsByMonth] = useState<Record<string, ScheduleEmployeeRow | null>>({});
  const [loading, setLoading] = useState(true);

  const now = useMemo(() => new Date(), []);
  const days = useMemo(() => daysAroundToday(3, 4, now), [now]);
  const yearMonthKeys = useMemo(
    () => [...new Set(days.map((day) => yearMonthFromDateStr(day.dateStr)))],
    [days]
  );
  const todayStr = useMemo(
    () =>
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`,
    [now]
  );

  const hasAnyRow = useMemo(
    () => Object.values(myRowsByMonth).some((row) => row != null),
    [myRowsByMonth]
  );

  useEffect(() => {
    if (!userName?.trim()) {
      setMyRowsByMonth({});
      setLoading(false);
      return;
    }

    const cachedByMonth: Record<string, ScheduleEmployeeRow | null> = {};
    let hasCached = false;
    for (const key of yearMonthKeys) {
      const mine = findMyRow(readCachedWorkSchedule(key), userName);
      cachedByMonth[key] = mine;
      if (mine) hasCached = true;
    }
    if (hasCached) {
      setMyRowsByMonth(cachedByMonth);
      setLoading(false);
    } else {
      setLoading(true);
    }

    let cancelled = false;
    void (async () => {
      const next: Record<string, ScheduleEmployeeRow | null> = { ...cachedByMonth };
      await Promise.all(
        yearMonthKeys.map(async (key) => {
          const res = await getWorkSchedule(key);
          const rows = res.success && res.data ? res.data : readCachedWorkSchedule(key);
          next[key] = findMyRow(rows, userName);
        })
      );
      if (cancelled) return;
      setMyRowsByMonth(next);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [userName, yearMonthKeys]);

  if (!userName?.trim()) return null;

  if (!loading && !hasAnyRow) return null;

  const getShiftCode = (day: (typeof days)[number]) => {
    const row = myRowsByMonth[yearMonthFromDateStr(day.dateStr)];
    return row?.shifts[String(day.day)] || "";
  };

  return (
    <section className="mb-3 rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
      <div className="px-3 py-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-extrabold text-slate-900 truncate">
            {userName}님 · 근무 일정
          </p>
          <p className="text-[10px] text-slate-500 font-medium">
            {days[0]?.month}월 {days[0]?.day}일 ~ {days[days.length - 1]?.month}월 {days[days.length - 1]?.day}일
          </p>
        </div>
        <a
          href="#work-schedule-dashboard"
          className="shrink-0 text-[10px] font-bold text-blue-600 hover:text-blue-800 px-2 py-1 rounded-lg hover:bg-blue-50"
        >
          전체표 →
        </a>
      </div>

      {loading ? (
        <div className="px-3 py-4 text-[11px] text-slate-400 font-medium">근무표 불러오는 중…</div>
      ) : (
        <div className="grid grid-cols-8 gap-1 p-2">
          {days.map((day) => {
            const isToday = day.dateStr === todayStr;
            const code = getShiftCode(day);
            const info = code ? getShiftInfo(code) : null;
            const [y, m, d] = day.dateStr.split("-").map(Number);
            const dow = new Date(y, m - 1, d).getDay();
            const isSun = dow === 0;
            const isSat = dow === 6;

            return (
              <div
                key={day.dateStr}
                className={`rounded-lg border p-1.5 text-center min-w-0 ${
                  isToday
                    ? "border-blue-400 bg-blue-50 ring-1 ring-blue-200"
                    : isSun
                      ? "border-red-100 bg-red-50/50"
                      : isSat
                        ? "border-indigo-100 bg-indigo-50/50"
                        : "border-slate-100 bg-slate-50/50"
                }`}
              >
                <div className="text-[9px] font-bold text-slate-500">{dayOfWeekShort(day.dateStr)}</div>
                <div className={`text-[11px] font-black ${isToday ? "text-blue-700" : "text-slate-800"}`}>
                  {day.day}
                </div>
                {code ? (
                  <div
                    className={`mt-1 px-1 py-0.5 rounded text-[10px] font-black leading-tight ${info?.badgeClass || "bg-slate-200"}`}
                    title={info?.name ? `${code} · ${info.name}` : code}
                  >
                    {code}
                  </div>
                ) : (
                  <div className="mt-1 text-[10px] text-slate-300">—</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { getWorkSchedule, type ScheduleEmployeeRow } from "@/app/actions/workScheduleActions";
import { getShiftInfo } from "@/components/WorkScheduleTable";
import { normalizePersonName } from "@/lib/departmentNormalize";
import { getMondayOfDate, weekDaysFromMonday } from "@/lib/weeklyPlan";

const DAY_SHORT = ["월", "화", "수", "목", "금", "토", "일"];

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

type Props = {
  userName?: string;
};

export default function MyWeeklyShiftStrip({ userName }: Props) {
  const [myRow, setMyRow] = useState<ScheduleEmployeeRow | null>(null);
  const [loading, setLoading] = useState(true);

  const now = useMemo(() => new Date(), []);
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const yearMonthKey = `${year}-${String(month).padStart(2, "0")}`;
  const days = useMemo(() => weekDaysFromMonday(getMondayOfDate(now)), [now]);
  const todayStr = useMemo(
    () =>
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`,
    [now]
  );

  useEffect(() => {
    if (!userName?.trim()) {
      setMyRow(null);
      setLoading(false);
      return;
    }

    const cached = readCachedWorkSchedule(yearMonthKey);
    const cachedMine = findMyRow(cached, userName);
    if (cachedMine) {
      setMyRow(cachedMine);
      setLoading(false);
    } else {
      setLoading(true);
    }

    let cancelled = false;
    void (async () => {
      const res = await getWorkSchedule(yearMonthKey);
      if (cancelled) return;
      const rows = res.success && res.data ? res.data : cached;
      setMyRow(findMyRow(rows, userName));
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [userName, yearMonthKey]);

  if (!userName?.trim()) return null;

  if (!loading && !myRow) return null;

  return (
    <section className="mb-3 rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
      <div className="px-3 py-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-extrabold text-slate-900 truncate">
            {userName}님 · 이번 주 근무
          </p>
          <p className="text-[10px] text-slate-500 font-medium">
            {days[0]?.month}월 {days[0]?.day}일 ~ {days[6]?.month}월 {days[6]?.day}일
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
        <div className="grid grid-cols-7 gap-1 p-2">
          {days.map((day, idx) => {
            const isToday = day.dateStr === todayStr;
            const inMonth = day.month === month;
            const code = inMonth ? myRow?.shifts[String(day.day)] || "" : "";
            const info = code ? getShiftInfo(code) : null;
            const isSat = idx === 5;
            const isSun = idx === 6;

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
                <div className="text-[9px] font-bold text-slate-500">{DAY_SHORT[idx]}</div>
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

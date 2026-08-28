"use client";

import { useRef } from "react";
import WeeklyPlanCell, { type WeeklyPlanEditingCell } from "@/components/WeeklyPlanCell";
import type { ScheduleLike } from "@/lib/scheduleDisplay";
import {
  WEEKLY_PLAN_CATEGORIES,
  getSchedulesForCell,
  isTodayDate,
  weekDayLabel,
  type WeekDay,
  type WeeklyPlanCategory,
  type WeeklyPlanGrid,
} from "@/lib/weeklyPlan";

type Props = {
  days: WeekDay[];
  grid: WeeklyPlanGrid;
  schedules: ScheduleLike[];
  canEdit: boolean;
  editingCell: WeeklyPlanEditingCell;
  onEditCell: (cell: WeeklyPlanEditingCell) => void;
  onCellChange: (cat: WeeklyPlanCategory, dayIdx: number, value: string) => void;
};

function dayScheduleCount(schedules: ScheduleLike[], dateStr: string): number {
  return WEEKLY_PLAN_CATEGORIES.reduce(
    (sum, cat) => sum + getSchedulesForCell(schedules, cat, dateStr).length,
    0
  );
}

function dayHasContent(
  grid: WeeklyPlanGrid,
  schedules: ScheduleLike[],
  dateStr: string,
  dayIdx: number
): boolean {
  const hasMemo = WEEKLY_PLAN_CATEGORIES.some((cat) => (grid[cat][dayIdx] || "").trim());
  return hasMemo || dayScheduleCount(schedules, dateStr) > 0;
}

export default function MobileWeeklyPlanAgenda({
  days,
  grid,
  schedules,
  canEdit,
  editingCell,
  onEditCell,
  onCellChange,
}: Props) {
  const dayRefs = useRef<(HTMLElement | null)[]>([]);

  const scrollToDay = (idx: number) => {
    dayRefs.current[idx]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="flex flex-col gap-3 md:hidden print:hidden">
      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-0.5 px-0.5 snap-x snap-mandatory">
        {days.map((day, idx) => {
          const isToday = isTodayDate(day.dateStr);
          const isSat = idx === 5;
          const isSun = idx === 6;
          const count = dayScheduleCount(schedules, day.dateStr);

          return (
            <button
              key={day.dateStr}
              type="button"
              onClick={() => scrollToDay(idx)}
              className={`shrink-0 snap-start min-w-[52px] rounded-xl border px-2 py-2 text-center cursor-pointer transition-colors ${
                isToday
                  ? "border-indigo-400 bg-indigo-50 text-indigo-800"
                  : isSun
                    ? "border-red-200 bg-red-50 text-red-800"
                    : isSat
                      ? "border-blue-200 bg-blue-50 text-blue-800"
                      : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
              }`}
            >
              <div className="text-[10px] font-bold opacity-80">{weekDayLabel(day, idx).split(" ")[1]}</div>
              <div className="text-sm font-extrabold leading-tight">{day.day}</div>
              {count > 0 && (
                <div className="text-[9px] font-bold mt-0.5 opacity-70">{count}건</div>
              )}
            </button>
          );
        })}
      </div>

      <p className="text-[11px] font-bold text-slate-500 -mt-1">날짜별 · 구분(생산/관리/입고/출고) 목록</p>

      <div className="space-y-3">
        {days.map((day, idx) => {
          const isToday = isTodayDate(day.dateStr);
          const isSat = idx === 5;
          const isSun = idx === 6;
          const hasContent = dayHasContent(grid, schedules, day.dateStr, idx);

          if (!hasContent && !canEdit) return null;

          return (
            <article
              key={day.dateStr}
              ref={(el) => {
                dayRefs.current[idx] = el;
              }}
              className={`rounded-xl border overflow-hidden scroll-mt-2 ${
                isToday ? "border-indigo-300 ring-1 ring-indigo-100" : "border-slate-200"
              }`}
            >
              <header
                className={`px-3 py-2.5 flex items-center justify-between border-b ${
                  isToday
                    ? "bg-indigo-50 border-indigo-100"
                    : isSun
                      ? "bg-red-50 border-red-100"
                      : isSat
                        ? "bg-blue-50 border-blue-100"
                        : "bg-slate-50 border-slate-200/80"
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-base font-extrabold text-slate-900">{weekDayLabel(day, idx)}</span>
                  {isToday && (
                    <span className="text-[10px] font-extrabold text-indigo-700 bg-indigo-100 px-1.5 py-0.5 rounded shrink-0">
                      오늘
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-bold text-slate-400 shrink-0">
                  {dayScheduleCount(schedules, day.dateStr)}건
                </span>
              </header>

              <div className="divide-y divide-slate-100 bg-white">
                {WEEKLY_PLAN_CATEGORIES.map((cat) => {
                  const cellSchedules = getSchedulesForCell(schedules, cat, day.dateStr);
                  const memo = (grid[cat][idx] || "").trim();
                  if (!canEdit && cellSchedules.length === 0 && !memo) return null;

                  return (
                    <section key={`${day.dateStr}-${cat}`}>
                      <div className="px-3 py-1.5 bg-[#1e3a5f] text-white text-[11px] font-extrabold">
                        {cat}
                      </div>
                      <WeeklyPlanCell
                        category={cat}
                        dayIdx={idx}
                        dateStr={day.dateStr}
                        value={grid[cat][idx] || ""}
                        schedules={schedules}
                        canEdit={canEdit}
                        editingCell={editingCell}
                        onEditCell={onEditCell}
                        onCellChange={onCellChange}
                        variant="card"
                        isSat={isSat}
                        isSun={isSun}
                      />
                    </section>
                  );
                })}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

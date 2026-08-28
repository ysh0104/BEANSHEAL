"use client";

import React from "react";
import ScheduleEntryPills from "@/components/ScheduleEntryPills";
import { ScheduleCalendarMobileLegend } from "@/components/ScheduleCalendarHeader";
import { dayName, groupSchedulesForMonth, parseScheduleDateRange } from "@/lib/calendarWeeks";

type Props = {
  year: number;
  month: number;
  schedules: any[];
  canEditSchedule: boolean;
  onDeleteSchedule: (id: number | string, notionPageId?: string) => void;
};

function formatDurationLabel(sch: any): string | null {
  const { start, end } = parseScheduleDateRange(sch);
  if (!start || !end || start === end) return null;
  return `${start.slice(5).replace("-", "/")} ~ ${end.slice(5).replace("-", "/")}`;
}

export default function MobileScheduleAgenda({
  year,
  month,
  schedules,
  canEditSchedule,
  onDeleteSchedule,
}: Props) {
  const dayGroups = groupSchedulesForMonth(schedules, year, month);
  const totalInMonth = dayGroups.reduce((sum, group) => sum + group.schedules.length, 0);

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <ScheduleCalendarMobileLegend />

      <p className="text-xs font-bold text-slate-500 mb-3">
        {month + 1}월 일정 {totalInMonth}건 · 날짜별 목록
      </p>

      <div className="flex-1 overflow-y-auto custom-scrollbar -mx-1 px-1 space-y-3">
        {dayGroups.length === 0 ? (
          <div className="text-center py-10 px-4 bg-slate-50 border border-dashed border-slate-200 rounded-xl">
            <p className="text-sm font-extrabold text-slate-700 mb-1">등록된 일정이 없습니다</p>
            <p className="text-xs text-slate-500">{year}년 {month + 1}월에 표시할 일정이 없습니다.</p>
          </div>
        ) : (
          dayGroups.map((group) => (
            <section
              key={group.dateStr}
              className={`rounded-xl border overflow-hidden ${
                group.isToday ? "border-indigo-300 ring-1 ring-indigo-100" : "border-slate-200"
              }`}
            >
              <div
                className={`px-3 py-2 flex items-center justify-between ${
                  group.isToday ? "bg-indigo-50" : "bg-slate-50"
                } border-b border-slate-200/80`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`text-base font-extrabold shrink-0 ${
                      group.isToday ? "text-indigo-700" : "text-slate-900"
                    }`}
                  >
                    {group.day}일
                  </span>
                  <span className="text-xs font-bold text-slate-500 shrink-0">
                    {dayName(group.dayOfWeek)}요일
                  </span>
                  {group.isToday && (
                    <span className="text-[10px] font-extrabold text-indigo-700 bg-indigo-100 px-1.5 py-0.5 rounded shrink-0">
                      오늘
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-bold text-slate-400 shrink-0">{group.schedules.length}건</span>
              </div>

              <div className="divide-y divide-slate-100 bg-white">
                {group.schedules.map((sch) => {
                  const durationLabel = formatDurationLabel(sch);

                  return (
                    <div key={`${group.dateStr}-${sch.id}`} className="p-3 relative group/item">
                      <ScheduleEntryPills schedule={sch} />
                      {durationLabel && (
                        <p className="text-[10px] font-semibold text-slate-400 mt-1.5">기간: {durationLabel}</p>
                      )}
                      {canEditSchedule && (
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm(`'${sch.product_name}' 일정을 삭제하시겠습니까?`)) {
                              onDeleteSchedule(sch.id, sch.notion_page_id);
                            }
                          }}
                          className="absolute top-2 right-2 text-slate-400 hover:text-red-600 font-black text-sm px-2 py-1 rounded-lg hover:bg-red-50 cursor-pointer"
                          title="일정 삭제"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import type { ScheduleEmployeeRow } from "@/app/actions/workScheduleActions";
import type { ShiftCodeInfo } from "@/components/WorkScheduleTable";

export type WorkScheduleDayHeader = {
  day: number;
  label: string;
  dayName: string;
  isSat: boolean;
  isSun: boolean;
};

type Props = {
  days: WorkScheduleDayHeader[];
  employees: ScheduleEmployeeRow[];
  empWorkStatsMap: Record<string, { totalHours: number; workDays: number; leaveDays: number }>;
  readOnly: boolean;
  onCellClick: (empId: string, day: number, empName: string, code: string) => void;
  getShiftInfo: (code: string) => ShiftCodeInfo;
};

function avatarBadge(name: string) {
  const initial = name.charAt(0).toUpperCase();
  const colors = [
    "bg-[#DBEAFE] text-[#1E40AF]",
    "bg-[#CFFAFE] text-[#0891B2]",
    "bg-[#E0E7FF] text-[#3730A3]",
    "bg-[#F3E8FF] text-[#6B21A8]",
    "bg-[#CCFBF1] text-[#0F766E]",
    "bg-[#FEF3C7] text-[#92400E]",
  ];
  return { initial, colorClass: colors[name.charCodeAt(0) % colors.length] };
}

export default function MobileWorkScheduleAgenda({
  days,
  employees,
  empWorkStatsMap,
  readOnly,
  onCellClick,
  getShiftInfo,
}: Props) {
  const [selectedDay, setSelectedDay] = useState(days[0]?.day ?? 1);

  useEffect(() => {
    const today = new Date().getDate();
    if (days.some((d) => d.day === today)) {
      setSelectedDay(today);
    } else if (days.length > 0) {
      setSelectedDay(days[0].day);
    }
  }, [days]);

  const selectedMeta = days.find((d) => d.day === selectedDay) ?? days[0];

  return (
    <div className="md:hidden space-y-3">
      <div className="flex gap-1.5 overflow-x-auto pb-1 snap-x snap-mandatory -mx-0.5 px-0.5">
        {days.map((d) => {
          const active = d.day === selectedDay;
          return (
            <button
              key={d.day}
              type="button"
              onClick={() => setSelectedDay(d.day)}
              className={`shrink-0 snap-start min-w-[52px] rounded-xl border px-2 py-2 text-center cursor-pointer transition-colors ${
                active
                  ? "border-blue-500 bg-blue-50 text-blue-800 ring-1 ring-blue-200"
                  : d.isSun
                    ? "border-red-200 bg-red-50 text-red-800"
                    : d.isSat
                      ? "border-indigo-200 bg-indigo-50 text-indigo-800"
                      : "border-slate-200 bg-white text-slate-800"
              }`}
            >
              <div className="text-[10px] font-bold opacity-80">{d.dayName}</div>
              <div className="text-sm font-extrabold leading-tight">{d.day}일</div>
            </button>
          );
        })}
      </div>

      <p className="text-[11px] font-bold text-slate-500">
        {selectedMeta ? `${selectedMeta.day}일(${selectedMeta.dayName}) · ${employees.length}명` : "일정 없음"}
      </p>

      <div className="space-y-2">
        {employees.length === 0 ? (
          <div className="text-center py-10 px-4 bg-slate-50 border border-dashed border-slate-200 rounded-xl text-sm text-slate-500">
            표시할 사원이 없습니다.
          </div>
        ) : (
          employees.map((emp) => {
            const code = emp.shifts[String(selectedDay)] || "";
            const info = code ? getShiftInfo(code) : null;
            const stat = empWorkStatsMap[emp.id] || { totalHours: 0, workDays: 0 };
            const avatar = avatarBadge(emp.name);

            return (
              <article
                key={emp.id}
                className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-xs"
              >
                <div className="px-3 py-2.5 flex items-center justify-between gap-2 border-b border-slate-100">
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${avatar.colorClass}`}
                    >
                      {avatar.initial}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-extrabold text-slate-900 truncate">{emp.name}</div>
                      <div className="text-[10px] font-medium text-slate-500 truncate">{emp.group}</div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[11px] font-black text-blue-700">{stat.totalHours}시간</div>
                    <div className="text-[9px] text-slate-400">({stat.workDays}일)</div>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={readOnly && !code}
                  onClick={() => onCellClick(emp.id, selectedDay, emp.name, code)}
                  className={`w-full px-3 py-3 flex items-center justify-between gap-2 text-left ${
                    readOnly ? "cursor-default" : "cursor-pointer active:bg-slate-50"
                  }`}
                >
                  <span className="text-[11px] font-bold text-slate-500">근무 코드</span>
                  {code ? (
                    <span className={`px-3 py-1.5 rounded-lg text-xs font-black ${info?.badgeClass || ""}`}>
                      {code}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-300 font-medium">{readOnly ? "—" : "탭하여 입력"}</span>
                  )}
                </button>
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}

"use client";

import React from "react";

type ScheduleCalendarHeaderLeftProps = {
  year: number;
  month: number;
  canEditSchedule: boolean;
  schedules: any[];
  notionSyncStatusMsg: string | null;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onYearChange: (year: number) => void;
  onJumpToLatest: () => void;
  compact?: boolean;
};

export function ScheduleCalendarHeaderLeft({
  year,
  month,
  canEditSchedule,
  schedules,
  notionSyncStatusMsg,
  onPrevMonth,
  onNextMonth,
  onYearChange,
  onJumpToLatest,
  compact = false,
}: ScheduleCalendarHeaderLeftProps) {
  const latestScheduleDate =
    schedules.length > 0
      ? schedules
          .map((s) => (s.plan_date ? String(s.plan_date).split("T")[0] : ""))
          .filter(Boolean)
          .sort()
          .reverse()[0]
      : null;

  const latestYear = latestScheduleDate ? Number(latestScheduleDate.split("-")[0]) : null;
  const latestMonth = latestScheduleDate ? Number(latestScheduleDate.split("-")[1]) - 1 : null;

  return (
    <div className={`flex items-center gap-1.5 sm:gap-2 text-slate-800 text-sm font-bold ${compact ? "flex-wrap" : "flex-wrap"}`}>
      <button
        type="button"
        onClick={onPrevMonth}
        className="p-1 hover:bg-slate-200 rounded text-slate-600 cursor-pointer text-base shrink-0"
        aria-label="이전 달"
      >
        ‹
      </button>
      <select
        value={year}
        onChange={(e) => onYearChange(Number(e.target.value))}
        className="font-extrabold font-mono border border-slate-200 rounded px-1.5 sm:px-2 py-1 text-xs sm:text-sm bg-slate-50 cursor-pointer shrink-0"
      >
        {[2023, 2024, 2025, 2026, 2027].map((y) => (
          <option key={y} value={y}>
            {y}년
          </option>
        ))}
      </select>
      <span className="font-extrabold font-mono text-xs sm:text-sm shrink-0">{String(month + 1).padStart(2, "0")}월</span>
      <button
        type="button"
        onClick={onNextMonth}
        className="p-1 hover:bg-slate-200 rounded text-slate-600 cursor-pointer text-base shrink-0"
        aria-label="다음 달"
      >
        ›
      </button>
      <span className="text-slate-900 font-extrabold text-xs sm:text-sm shrink-0">일정관리</span>
      {!canEditSchedule && (
        <span className="text-[10px] sm:text-xs font-bold text-slate-500 bg-slate-100 px-1.5 sm:px-2 py-0.5 rounded shrink-0">
          조회 전용
        </span>
      )}

      {!compact && schedules.length > 0 && latestYear && latestYear !== year && (
        <button
          type="button"
          onClick={onJumpToLatest}
          className="text-[10px] sm:text-[11px] font-bold text-emerald-800 bg-emerald-100 hover:bg-emerald-200 border border-emerald-300 px-2 py-0.5 rounded cursor-pointer transition-colors"
        >
          💡 노션 일정 {schedules.length}건 ({latestYear}년 {latestMonth !== null ? latestMonth + 1 : 1}월 ➔)
        </button>
      )}

      {notionSyncStatusMsg && (
        <span
          className="text-[10px] sm:text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-300 px-2 py-0.5 rounded shadow-xs max-w-[180px] sm:max-w-none truncate"
          title={notionSyncStatusMsg}
        >
          ⚠️ {notionSyncStatusMsg}
        </span>
      )}
    </div>
  );
}

export function ScheduleCalendarHeaderRight({ compact = false }: { compact?: boolean }) {
  if (compact) return null;

  const legendItems = [
    { label: "생산", className: "bg-[#e6f4ea] text-[#137333]" },
    { label: "입고", className: "bg-[#e8f0fe] text-[#1a73e8]" },
    { label: "출고", className: "bg-[#f3e8fd] text-[#7627bb]" },
    { label: "휴가", className: "bg-[#fef7e0] text-[#b06000]" },
    { label: "점검", className: "bg-[#fce8e6] text-[#c5221f]" },
  ];

  if (compact) {
    return null;
  }

  return (
    <div className="hidden sm:flex items-center gap-2 text-xs font-bold shrink-0">
      {legendItems.map((item) => (
        <span key={item.label} className={`${item.className} px-2.5 py-1 rounded font-bold`}>
          {item.label}
        </span>
      ))}
    </div>
  );
}

export function ScheduleCalendarMobileLegend() {
  return (
    <div className="flex flex-wrap gap-1.5 mb-3 pb-3 border-b border-slate-100">
      {[
        { label: "생산", className: "bg-[#e6f4ea] text-[#137333]" },
        { label: "입고", className: "bg-[#e8f0fe] text-[#1a73e8]" },
        { label: "출고", className: "bg-[#f3e8fd] text-[#7627bb]" },
        { label: "휴가", className: "bg-[#fef7e0] text-[#b06000]" },
        { label: "점검", className: "bg-[#fce8e6] text-[#c5221f]" },
      ].map((item) => (
        <span key={item.label} className={`${item.className} px-2 py-0.5 rounded text-[10px] font-bold`}>
          {item.label}
        </span>
      ))}
    </div>
  );
}

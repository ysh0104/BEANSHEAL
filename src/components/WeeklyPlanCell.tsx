"use client";

import { ScheduleEntryPillsList } from "@/components/ScheduleEntryPills";
import type { ScheduleLike } from "@/lib/scheduleDisplay";
import { getSchedulesForCell, type WeeklyPlanCategory } from "@/lib/weeklyPlan";

export type WeeklyPlanEditingCell = { cat: WeeklyPlanCategory; dayIdx: number } | null;

function sameEditingCell(
  a: WeeklyPlanEditingCell,
  cat: WeeklyPlanCategory,
  dayIdx: number
) {
  return a?.cat === cat && a?.dayIdx === dayIdx;
}

type Props = {
  category: WeeklyPlanCategory;
  dayIdx: number;
  dateStr: string;
  value: string;
  schedules: ScheduleLike[];
  canEdit: boolean;
  editingCell: WeeklyPlanEditingCell;
  onEditCell: (cell: WeeklyPlanEditingCell) => void;
  onCellChange: (cat: WeeklyPlanCategory, dayIdx: number, value: string) => void;
  /** 모바일 카드형 vs 테이블 셀 */
  variant?: "table" | "card";
  isSat?: boolean;
  isSun?: boolean;
};

export default function WeeklyPlanCell({
  category,
  dayIdx,
  dateStr,
  value,
  schedules,
  canEdit,
  editingCell,
  onEditCell,
  onCellChange,
  variant = "table",
  isSat = false,
  isSun = false,
}: Props) {
  const cellSchedules = getSchedulesForCell(schedules, category, dateStr);
  const isEditing = sameEditingCell(editingCell, category, dayIdx);
  const showMemoEditor = canEdit && (isEditing || !!value || cellSchedules.length === 0);

  const cellBg =
    variant === "table"
      ? isSun
        ? "bg-[#fff5f5]"
        : isSat
          ? "bg-[#f0f7ff]"
          : "bg-white"
      : "bg-white";

  const pad = variant === "card" ? "px-3 py-2" : "px-1.5 sm:px-2 py-1.5";

  return (
    <div className={`flex flex-col ${variant === "table" ? "min-h-[72px] sm:min-h-[96px]" : ""} ${cellBg}`}>
      {cellSchedules.length > 0 && (
        <div
          className={`${variant === "table" ? "px-1.5 sm:px-2 pt-1.5 sm:pt-2" : "px-3 pt-2"} ${
            value || showMemoEditor ? "pb-1 border-b border-slate-100/80" : "pb-1.5"
          }`}
        >
          <ScheduleEntryPillsList schedules={cellSchedules} compact />
        </div>
      )}

      {showMemoEditor ? (
        <textarea
          value={value}
          onChange={(e) => onCellChange(category, dayIdx, e.target.value)}
          onFocus={() => onEditCell({ cat: category, dayIdx })}
          onBlur={() => {
            if (!value.trim()) {
              onEditCell(null);
            }
          }}
          autoFocus={isEditing && !value}
          rows={value ? 3 : 2}
          className={`w-full flex-1 min-h-[40px] ${pad} text-[11px] sm:text-xs font-medium leading-relaxed resize-none bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-300 text-slate-800 placeholder:text-slate-400`}
          placeholder={cellSchedules.length ? "추가 메모…" : "메모 입력…"}
        />
      ) : canEdit && cellSchedules.length > 0 ? (
        <button
          type="button"
          onClick={() => onEditCell({ cat: category, dayIdx })}
          className={`${pad} text-[10px] sm:text-[11px] font-bold text-slate-400 hover:text-indigo-600 text-left cursor-pointer`}
        >
          + 메모 추가
        </button>
      ) : value ? (
        <div className={`${pad} text-[11px] sm:text-xs font-medium leading-relaxed whitespace-pre-wrap text-slate-700`}>
          {value}
        </div>
      ) : cellSchedules.length === 0 ? (
        <div className={`${pad} text-[11px] text-slate-300`}>—</div>
      ) : null}
    </div>
  );
}

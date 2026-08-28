"use client";

import React from "react";
import ScheduleEntryPills from "@/components/ScheduleEntryPills";
import { getCalendarWeeks } from "@/lib/calendarWeeks";
import { estimateScheduleCardHeight } from "@/lib/scheduleDisplay";

type Props = {
  year: number;
  month: number;
  schedules: any[];
  canEditSchedule: boolean;
  draggedSchedule: any | null;
  onDragStart: (e: React.DragEvent, sch: any) => void;
  onDropOnCell: (e: React.DragEvent, targetDateStr: string) => void;
  onDeleteSchedule: (id: number | string, notionPageId?: string) => void;
};

export default function MonthlyScheduleCalendar({
  year,
  month,
  schedules,
  canEditSchedule,
  draggedSchedule,
  onDragStart,
  onDropOnCell,
  onDeleteSchedule,
}: Props) {
  const weeks = getCalendarWeeks(year, month);

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 overflow-x-auto">
      <div className="min-w-[640px] flex flex-col h-full min-h-0">
        <div className="grid grid-cols-7 gap-1.5 text-center mb-1.5 bg-slate-50 py-2 border-b border-slate-200 rounded-t shrink-0">
          {["일", "월", "화", "수", "목", "금", "토"].map((day) => (
            <div
              key={day}
              className={`text-sm font-extrabold ${day === "일" ? "text-red-500" : day === "토" ? "text-blue-500" : "text-slate-700"}`}
            >
              {day}
            </div>
          ))}
        </div>

        <div className="flex-1 flex flex-col h-full min-h-0 overflow-y-auto space-y-1 custom-scrollbar">
          {weeks.map((week, wIdx) => {
            const weekStartStr = week[0].dateStr;
            const weekEndStr = week[6].dateStr;

            const weekSegments: any[] = [];
            schedules.forEach((sch) => {
              const schStart = sch.plan_date ? String(sch.plan_date).split("T")[0].trim() : "";
              const schEnd =
                sch.end_date && String(sch.end_date).trim()
                  ? String(sch.end_date).split("T")[0].trim()
                  : schStart;
              if (!schStart) return;

              if (schStart <= weekEndStr && schEnd >= weekStartStr) {
                let startCol = 0;
                let isStartOfSchedule = false;
                if (schStart <= weekStartStr) {
                  startCol = 0;
                  isStartOfSchedule = schStart === weekStartStr;
                } else {
                  const idx = week.findIndex((d) => d.dateStr === schStart);
                  startCol = idx >= 0 ? idx : 0;
                  isStartOfSchedule = true;
                }

                let endCol = 6;
                let isEndOfSchedule = false;
                if (schEnd >= weekEndStr) {
                  endCol = 6;
                  isEndOfSchedule = schEnd === weekEndStr;
                } else {
                  const idx = week.findIndex((d) => d.dateStr === schEnd);
                  endCol = idx >= 0 ? idx : 6;
                  isEndOfSchedule = true;
                }

                const colSpan = Math.max(1, endCol - startCol + 1);
                weekSegments.push({
                  sch,
                  startCol,
                  endCol,
                  colSpan,
                  isStartOfSchedule,
                  isEndOfSchedule,
                });
              }
            });

            weekSegments.sort((a, b) => {
              if (a.startCol !== b.startCol) return a.startCol - b.startCol;
              if (a.colSpan !== b.colSpan) return b.colSpan - a.colSpan;
              return String(a.sch.id).localeCompare(String(b.sch.id));
            });

            const occupied: boolean[][] = [];
            const allocated = weekSegments.map((seg) => {
              let lane = 0;
              while (true) {
                if (!occupied[lane]) occupied[lane] = Array(7).fill(false);
                let canFit = true;
                for (let c = seg.startCol; c <= seg.endCol; c++) {
                  if (occupied[lane][c]) {
                    canFit = false;
                    break;
                  }
                }
                if (canFit) {
                  for (let c = seg.startCol; c <= seg.endCol; c++) {
                    occupied[lane][c] = true;
                  }
                  return { ...seg, lane };
                }
                lane++;
              }
            });

            const segCardHeights = allocated.map((seg) => estimateScheduleCardHeight(seg.sch, seg.colSpan));

            const LANE_GAP = 8;
            const maxLane = allocated.reduce((m, s) => Math.max(m, s.lane), -1);
            const laneRowHeights: number[] = [];
            for (let l = 0; l <= maxLane; l++) {
              let maxH = 56;
              allocated.forEach((seg, i) => {
                if (seg.lane === l) maxH = Math.max(maxH, segCardHeights[i]);
              });
              laneRowHeights.push(maxH);
            }

            const scheduleStackHeight =
              laneRowHeights.reduce((sum, h) => sum + h, 0) + Math.max(0, laneRowHeights.length - 1) * LANE_GAP;
            const weekRequiredMinHeight = Math.max(140, 32 + scheduleStackHeight + 16);

            return (
              <div
                key={wIdx}
                style={{ minHeight: `${weekRequiredMinHeight}px` }}
                className="grid grid-cols-7 gap-1.5 relative border-b border-slate-100 last:border-0 pb-1 shrink-0"
              >
                {week.map((cell, cIdx) => (
                  <div
                    key={cIdx}
                    onDragOver={(e) => {
                      if (canEditSchedule && draggedSchedule) e.preventDefault();
                    }}
                    onDrop={(e) => {
                      if (canEditSchedule && draggedSchedule && cell.dateStr) {
                        e.preventDefault();
                        e.stopPropagation();
                        onDropOnCell(e, cell.dateStr);
                      }
                    }}
                    className={`border border-slate-200/90 p-1 flex flex-col justify-start items-start relative h-full w-full ${
                      cell.isOtherMonth
                        ? "bg-slate-50/40 text-slate-300"
                        : cell.isToday
                          ? "bg-indigo-50/50"
                          : "bg-white hover:bg-slate-50/80"
                    } transition-colors rounded`}
                  >
                    <div className="w-full flex justify-between items-center mb-0.5">
                      <span
                        className={`text-sm font-extrabold ${
                          cell.isToday
                            ? "bg-indigo-600 text-white px-2 py-0.5 rounded shadow-xs"
                            : cell.isOtherMonth
                              ? "text-slate-300"
                              : "text-slate-800 ml-0.5"
                        }`}
                      >
                        {cell.day}
                      </span>
                    </div>
                  </div>
                ))}

                <div
                  className="absolute inset-x-0 top-[28px] bottom-1 grid grid-cols-7 gap-1.5 pointer-events-none pb-2"
                  style={{
                    gridTemplateRows: laneRowHeights.length ? laneRowHeights.map((h) => `${h}px`).join(" ") : undefined,
                    rowGap: `${LANE_GAP}px`,
                  }}
                >
                  {allocated.map((seg, sIdx) => {
                    const sch = seg.sch;
                    const roundedClass = `${seg.isStartOfSchedule ? "rounded-l-md" : "rounded-l-none"} ${seg.isEndOfSchedule ? "rounded-r-md" : "rounded-r-none"}`;

                    return (
                      <div
                        key={`${sch.id}-${wIdx}-${sIdx}`}
                        style={{
                          gridColumn: `${seg.startCol + 1} / span ${seg.colSpan}`,
                          gridRow: `${seg.lane + 1}`,
                        }}
                        draggable={canEditSchedule}
                        onDragStart={(e) => {
                          if (!canEditSchedule) {
                            e.preventDefault();
                            return;
                          }
                          e.stopPropagation();
                          onDragStart(e, sch);
                        }}
                        className={`pointer-events-auto relative h-full min-h-0 py-1.5 px-2.5 text-left flex items-start justify-between transition-all group/bar overflow-hidden ${canEditSchedule ? "cursor-grab active:cursor-grabbing hover:shadow-md" : "cursor-default"} bg-white border border-slate-300/90 shadow-sm ${roundedClass}`}
                      >
                        <div className="pr-1 w-full min-w-0 overflow-hidden">
                          <ScheduleEntryPills schedule={sch} compact />
                        </div>

                        {canEditSchedule && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm(`'${sch.product_name}' 일정을 삭제하시겠습니까?`)) {
                                onDeleteSchedule(sch.id, sch.notion_page_id);
                              }
                            }}
                            className="opacity-0 group-hover/bar:opacity-100 text-slate-500 hover:text-red-600 font-black text-xs transition-opacity ml-1 cursor-pointer shrink-0 mt-0.5"
                            title="일정 삭제"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

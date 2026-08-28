"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ProductionScheduleItem } from "@/app/actions/notionActions";
import { ScheduleEntryPillsList } from "@/components/ScheduleEntryPills";
import { getWeeklyPlan, saveWeeklyPlan } from "@/app/actions/weeklyPlanActions";
import {
  emptyWeeklyPlanGrid,
  WEEKLY_PLAN_CATEGORIES,
  type WeeklyPlanCategory,
  type WeeklyPlanGrid,
} from "@/lib/weeklyPlan";

export type { WeeklyPlanCategory, WeeklyPlanGrid };

const CATEGORIES = WEEKLY_PLAN_CATEGORIES;
const DAY_LABELS = ["월(Mon)", "화(Tue)", "수(Wed)", "목(Thu)", "금(Fri)", "토(Sat)", "일(Sun)"];

type ScheduleLike = Pick<
  ProductionScheduleItem,
  | "id"
  | "product_name"
  | "plan_date"
  | "end_date"
  | "quantity"
  | "note"
  | "tag_name"
  | "tag_color"
  | "company_name"
  | "product_tags"
  | "detail_tags"
>;

interface WeekDay {
  dateStr: string;
  day: number;
  month: number;
}

interface WeeklyPlanViewProps {
  schedules: ScheduleLike[];
  department?: string;
  canEdit?: boolean;
  /** 대시보드 위젯 내 임베드 (닫기 버튼 없음) */
  embedded?: boolean;
  updatedBy?: string;
}

type EditingCell = { cat: WeeklyPlanCategory; dayIdx: number } | null;

function emptyGrid(): WeeklyPlanGrid {
  return emptyWeeklyPlanGrid();
}

function weeklyPlanCacheKey(weekStart: string) {
  return `beansheal_weekly_plan_${weekStart}`;
}

function readCachedWeeklyPlan(weekStart: string): WeeklyPlanGrid | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(weeklyPlanCacheKey(weekStart));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WeeklyPlanGrid;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCachedWeeklyPlan(weekStart: string, grid: WeeklyPlanGrid) {
  try {
    localStorage.setItem(weeklyPlanCacheKey(weekStart), JSON.stringify(grid));
  } catch {
    /* ignore */
  }
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

function weekOfMonthLabel(monday: WeekDay): string {
  const { y } = parseYmd(monday.dateStr);
  const month = monday.month;
  const firstOfMonth = new Date(y, month - 1, 1);
  const firstDow = firstOfMonth.getDay();
  const adjusted = monday.day + ((firstDow + 6) % 7);
  const weekNum = Math.ceil(adjusted / 7) || 1;
  return `${y}년 ${month}월 ${weekNum}주차`;
}

function getSchedulesForCell(
  schedules: ScheduleLike[],
  category: WeeklyPlanCategory,
  dateStr: string
): ScheduleLike[] {
  return schedules.filter(
    (sch) => resolveScheduleCategory(sch) === category && scheduleOverlapsDay(sch, dateStr)
  );
}

function shiftMonday(mondayStr: string, weeks: number): string {
  const { y, m, d } = parseYmd(mondayStr);
  const dt = new Date(y, m - 1, d + weeks * 7);
  return formatYmd(dt);
}

function sameEditingCell(a: EditingCell, cat: WeeklyPlanCategory, dayIdx: number) {
  return a?.cat === cat && a?.dayIdx === dayIdx;
}

export default function WeeklyPlanView({
  schedules,
  department = "생산팀",
  canEdit = false,
  embedded = false,
  updatedBy,
}: WeeklyPlanViewProps) {
  const [weekStart, setWeekStart] = useState(() => getMondayOfDate());
  const [grid, setGrid] = useState<WeeklyPlanGrid>(emptyGrid);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [editingCell, setEditingCell] = useState<EditingCell>(null);
  const schedulesRef = useRef(schedules);
  schedulesRef.current = schedules;

  const days = weekDaysFromMonday(weekStart);
  const periodLabel = weekOfMonthLabel(days[0]);

  useLayoutEffect(() => {
    const cached = readCachedWeeklyPlan(weekStart);
    if (cached) {
      setGrid(cached);
      setLoading(false);
    }
  }, [weekStart]);

  const loadWeek = useCallback(async () => {
    const cached = readCachedWeeklyPlan(weekStart);
    if (!cached) setLoading(true);
    setMsg(null);
    setEditingCell(null);

    const res = await getWeeklyPlan(weekStart);
    if (res.success && res.data) {
      const merged = emptyGrid();
      for (const cat of CATEGORIES) {
        merged[cat] = (res.data[cat] || Array(7).fill("")).slice(0, 7);
        while (merged[cat].length < 7) merged[cat].push("");
      }
      setGrid(merged);
      setDirty(false);
      writeCachedWeeklyPlan(weekStart, merged);
    } else if (!cached) {
      setGrid(emptyGrid());
      setDirty(false);
    }
    setLoading(false);
  }, [weekStart]);

  useEffect(() => {
    void loadWeek();
  }, [loadWeek]);

  const handleCellChange = (cat: WeeklyPlanCategory, dayIdx: number, value: string) => {
    if (!canEdit) return;
    setGrid((prev) => {
      const next = { ...prev, [cat]: [...prev[cat]] };
      next[cat][dayIdx] = value;
      return next;
    });
    setDirty(true);
  };

  const handleSave = async () => {
    if (!canEdit) return;
    setSaving(true);
    setMsg(null);
    const res = await saveWeeklyPlan(weekStart, grid, updatedBy);
    if (res.success) {
      writeCachedWeeklyPlan(weekStart, grid);
      setDirty(false);
      setMsg("저장되었습니다.");
    } else {
      writeCachedWeeklyPlan(weekStart, grid);
      setDirty(false);
      setMsg(res.message || "서버 저장 실패 — 로컬에만 저장됨");
    }
    setSaving(false);
  };

  const handleWeekChange = (nextWeekStart: string) => {
    setWeekStart(nextWeekStart);
    setEditingCell(null);
  };

  return (
    <div className={`bg-white text-slate-900 w-full ${embedded ? "" : "max-w-6xl mx-auto"}`}>
      <div className="flex flex-col gap-2 mb-3 print:hidden">
        <div className="min-w-0">
          {!embedded && (
            <h2 className="text-xl md:text-2xl font-black tracking-tight text-[#1e3a5f]">
              BEANSHEAL 주간계획표
            </h2>
          )}
          <p className={`text-xs sm:text-sm font-bold text-slate-700 ${embedded ? "" : "mt-1"}`}>
            부서: {department} · {periodLabel}
            {!canEdit && <span className="ml-1.5 text-slate-400">(조회 전용)</span>}
            {loading && <span className="ml-1.5 text-slate-400 font-medium">동기화 중…</span>}
          </p>
          {canEdit && (
            <p className="text-[10px] sm:text-[11px] text-slate-500 mt-0.5">
              노션 일정은 자동 표시 · 아래 메모만 직접 편집 후 저장
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              onClick={() => handleWeekChange(getMondayOfDate())}
              className="text-[11px] sm:text-xs font-bold px-2 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer"
            >
              이번 주
            </button>
            <button
              type="button"
              onClick={() => handleWeekChange(shiftMonday(weekStart, -1))}
              className="text-[11px] sm:text-xs font-bold px-2 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer"
            >
              ‹ 이전
            </button>
            <button
              type="button"
              onClick={() => handleWeekChange(shiftMonday(weekStart, 1))}
              className="text-[11px] sm:text-xs font-bold px-2 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer"
            >
              다음 ›
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {canEdit && (
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="text-[11px] sm:text-xs font-bold px-3 py-1.5 rounded-lg bg-[#1e3a5f] text-white hover:bg-[#152a45] cursor-pointer disabled:opacity-50"
              >
                {saving ? "저장 중…" : dirty ? "저장 *" : "저장"}
              </button>
            )}
            <button
              type="button"
              onClick={() => window.print()}
              className="text-[11px] sm:text-xs font-bold px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 cursor-pointer"
            >
              인쇄
            </button>
          </div>
        </div>
      </div>

      {msg && (
        <p className="text-xs font-medium text-emerald-700 mb-2 print:hidden">{msg}</p>
      )}

      <div className="overflow-x-auto border border-[#9db4d0] rounded-sm flex-1 min-h-0 -mx-0.5 sm:mx-0">
        <table className="w-full min-w-[560px] sm:min-w-[720px] border-collapse text-left table-fixed">
          <thead>
            <tr className="bg-[#1e3a5f] text-white">
              <th className="sticky left-0 z-20 w-[64px] sm:w-[80px] border border-[#9db4d0] px-1.5 sm:px-2 py-2 text-xs sm:text-sm font-extrabold text-center bg-[#1e3a5f]">
                구분
              </th>
              {days.map((day, idx) => {
                const isSat = idx === 5;
                const isSun = idx === 6;
                return (
                  <th
                    key={day.dateStr}
                    className={`border border-[#9db4d0] px-1 sm:px-2 py-2 text-[10px] sm:text-xs font-extrabold text-center ${
                      isSun ? "bg-[#5c2b2b] text-red-100" : isSat ? "bg-[#2a4a6f]" : ""
                    }`}
                  >
                    <span className="block sm:hidden">{day.month}/{day.day}</span>
                    <span className="hidden sm:block">{day.month}/{day.day}_{DAY_LABELS[idx]}</span>
                    <span className="block sm:hidden text-[9px] font-bold opacity-90">
                      {DAY_LABELS[idx].split("(")[0]}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {CATEGORIES.map((cat) => (
              <tr key={cat}>
                <td className="sticky left-0 z-10 border border-[#9db4d0] bg-[#1e3a5f] text-white text-center text-xs sm:text-sm font-extrabold align-middle px-1.5 sm:px-2 py-3 shadow-[2px_0_4px_rgba(0,0,0,0.08)]">
                  {cat}
                </td>
                {days.map((day, idx) => {
                  const isSat = idx === 5;
                  const isSun = idx === 6;
                  const value = grid[cat][idx] || "";
                  const cellSchedules = getSchedulesForCell(schedules, cat, day.dateStr);
                  const isEditing = sameEditingCell(editingCell, cat, idx);
                  const showMemoEditor = canEdit && (isEditing || !!value || cellSchedules.length === 0);
                  const cellBg = isSun
                    ? "bg-[#fff5f5]"
                    : isSat
                      ? "bg-[#f0f7ff]"
                      : "bg-white";

                  return (
                    <td
                      key={`${cat}-${day.dateStr}`}
                      className={`border border-[#9db4d0] p-0 align-top ${cellBg}`}
                    >
                      <div className="flex flex-col min-h-[72px] sm:min-h-[96px]">
                        {cellSchedules.length > 0 && (
                          <div className={`px-1.5 sm:px-2 pt-1.5 sm:pt-2 ${value || showMemoEditor ? "pb-1 border-b border-slate-100/80" : "pb-1.5"}`}>
                            <ScheduleEntryPillsList schedules={cellSchedules} compact />
                          </div>
                        )}

                        {showMemoEditor ? (
                          <textarea
                            value={value}
                            onChange={(e) => handleCellChange(cat, idx, e.target.value)}
                            onFocus={() => setEditingCell({ cat, dayIdx: idx })}
                            onBlur={() => {
                              if (!value.trim()) {
                                setEditingCell((prev) =>
                                  sameEditingCell(prev, cat, idx) ? null : prev
                                );
                              }
                            }}
                            autoFocus={isEditing && !value}
                            rows={value ? 3 : 2}
                            className="w-full flex-1 min-h-[40px] px-1.5 sm:px-2 py-1.5 text-[11px] sm:text-xs font-medium leading-relaxed resize-none bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-300 text-slate-800 placeholder:text-slate-400"
                            placeholder={cellSchedules.length ? "추가 메모…" : "메모 입력…"}
                          />
                        ) : canEdit && cellSchedules.length > 0 ? (
                          <button
                            type="button"
                            onClick={() => setEditingCell({ cat, dayIdx: idx })}
                            className="mx-1.5 sm:mx-2 my-1 text-[10px] sm:text-[11px] font-bold text-slate-400 hover:text-indigo-600 text-left cursor-pointer"
                          >
                            + 메모 추가
                          </button>
                        ) : value ? (
                          <div className="px-1.5 sm:px-2 py-1.5 text-[11px] sm:text-xs font-medium leading-relaxed whitespace-pre-wrap text-slate-700">
                            {value}
                          </div>
                        ) : cellSchedules.length === 0 ? (
                          <div className="px-1.5 sm:px-2 py-1.5 text-[11px] text-slate-300">—</div>
                        ) : null}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

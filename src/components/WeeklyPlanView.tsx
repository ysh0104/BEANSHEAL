"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import type { ProductionScheduleItem } from "@/app/actions/notionActions";
import WeeklyPlanCell, { type WeeklyPlanEditingCell } from "@/components/WeeklyPlanCell";
import { getWeeklyPlan, saveWeeklyPlan } from "@/app/actions/weeklyPlanActions";
import {
  emptyWeeklyPlanGrid,
  getMondayOfDate,
  shiftMonday,
  weekDaysFromMonday,
  weekOfMonthLabel,
  WEEKLY_PLAN_CATEGORIES,
  type WeeklyPlanCategory,
  type WeeklyPlanGrid,
} from "@/lib/weeklyPlan";

export type { WeeklyPlanCategory, WeeklyPlanGrid };
export {
  getMondayOfDate,
  resolveScheduleCategory,
  weekDaysFromMonday,
} from "@/lib/weeklyPlan";

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

interface WeeklyPlanViewProps {
  schedules: ScheduleLike[];
  department?: string;
  canEdit?: boolean;
  /** 대시보드 위젯 내 임베드 (닫기 버튼 없음) */
  embedded?: boolean;
  updatedBy?: string;
}

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
  const [editingCell, setEditingCell] = useState<WeeklyPlanEditingCell>(null);

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
    <div
      className={`bg-white text-slate-900 w-full ${
        embedded ? "h-full flex flex-col min-h-0" : "max-w-6xl mx-auto"
      }`}
    >
      <div className="flex flex-col gap-2 mb-3 print:hidden shrink-0">
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
              노션 일정 자동 표시 · 메모 편집 후 저장 · 표는 좌우 스크롤
            </p>
          )}
          {!canEdit && (
            <p className="text-[10px] sm:text-[11px] text-slate-400 mt-0.5 md:hidden">
              ← 좌우로 스크롤해 한 주 전체를 확인하세요
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
              className="hidden sm:inline-flex text-[11px] sm:text-xs font-bold px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 cursor-pointer"
            >
              인쇄
            </button>
          </div>
        </div>
      </div>

      {msg && (
        <p className="text-xs font-medium text-emerald-700 mb-2 print:hidden shrink-0">{msg}</p>
      )}

      {/* 모바일: 날짜별 카드 목록 */}
      <div className="md:hidden space-y-3 print:hidden">
        {days.map((day, idx) => {
          const isSat = idx === 5;
          const isSun = idx === 6;
          const headerBg = isSun ? "bg-[#5c2b2b] text-red-100" : isSat ? "bg-[#2a4a6f] text-white" : "bg-[#1e3a5f] text-white";
          const cellBg = isSun ? "bg-[#fff5f5]" : isSat ? "bg-[#f0f7ff]" : "bg-white";

          return (
            <section key={day.dateStr} className="border border-[#9db4d0] rounded-lg overflow-hidden">
              <div className={`px-3 py-2 text-sm font-extrabold ${headerBg}`}>
                {day.month}/{day.day} · {DAY_LABELS[idx]}
              </div>
              <div className={`divide-y divide-[#9db4d0]/60 ${cellBg}`}>
                {CATEGORIES.map((cat) => (
                  <div key={`${day.dateStr}-${cat}`} className="p-0">
                    <div className="px-3 py-1.5 text-[11px] font-extrabold text-[#1e3a5f] bg-slate-50 border-b border-[#9db4d0]/40">
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
                      onEditCell={setEditingCell}
                      onCellChange={handleCellChange}
                      variant="table"
                      isSat={isSat}
                      isSun={isSun}
                    />
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <div
        className={`hidden md:block border border-[#9db4d0] rounded-sm overflow-x-auto overflow-y-auto ${
          embedded ? "flex-1 min-h-0" : ""
        }`}
      >
        <table className="w-full min-w-[880px] border-collapse text-left">
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
                    className={`w-[120px] min-w-[120px] border border-[#9db4d0] px-2 py-2 text-xs font-extrabold text-center ${
                      isSun ? "bg-[#5c2b2b] text-red-100" : isSat ? "bg-[#2a4a6f]" : ""
                    }`}
                  >
                    {day.month}/{day.day}_{DAY_LABELS[idx]}
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
                  const cellBg = isSun
                    ? "bg-[#fff5f5]"
                    : isSat
                      ? "bg-[#f0f7ff]"
                      : "bg-white";

                  return (
                    <td
                      key={`${cat}-${day.dateStr}`}
                      className={`border border-[#9db4d0] p-0 align-top min-w-[120px] ${cellBg}`}
                    >
                      <WeeklyPlanCell
                        category={cat}
                        dayIdx={idx}
                        dateStr={day.dateStr}
                        value={grid[cat][idx] || ""}
                        schedules={schedules}
                        canEdit={canEdit}
                        editingCell={editingCell}
                        onEditCell={setEditingCell}
                        onCellChange={handleCellChange}
                        variant="table"
                        isSat={isSat}
                        isSun={isSun}
                      />
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

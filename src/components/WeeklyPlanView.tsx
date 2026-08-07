"use client";

import { useCallback, useEffect, useState } from "react";
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

function emptyGrid(): WeeklyPlanGrid {
  return emptyWeeklyPlanGrid();
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
  return start <= dateStr && end >= dateStr;
}

function formatCellEntry(sch: ScheduleLike, category: WeeklyPlanCategory): string {
  const name = (sch.product_name || "").trim();
  const qty = (sch.quantity || "").trim();
  const note = (sch.note || "").trim();

  if (category === "생산") {
    const lines = [`*생산 : ${name || "-"}`];
    if (qty && qty !== "1") lines.push(`수량 : ${qty}`);
    if (note) lines.push(note.startsWith("LOT") || note.startsWith("lot") ? note : `LOT : ${note}`);
    return lines.join("\n");
  }

  if (category === "입고" || category === "출고") {
    return name + (qty && qty !== "1" ? ` (${qty})` : "") + (note ? `\n${note}` : "");
  }

  const tag = sch.tag_name ? `[${sch.tag_name}] ` : "";
  return `${tag}${name}` + (note ? `\n${note}` : "");
}

export function buildGridFromSchedules(schedules: ScheduleLike[], days: WeekDay[]): WeeklyPlanGrid {
  const grid = emptyGrid();
  schedules.forEach((sch) => {
    const category = resolveScheduleCategory(sch);
    days.forEach((day, idx) => {
      if (scheduleOverlapsDay(sch, day.dateStr)) {
        const entry = formatCellEntry(sch, category);
        grid[category][idx] = grid[category][idx]
          ? `${grid[category][idx]}\n\n${entry}`
          : entry;
      }
    });
  });
  return grid;
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

  const days = weekDaysFromMonday(weekStart);
  const periodLabel = weekOfMonthLabel(days[0]);

  const loadWeek = useCallback(async () => {
    setLoading(true);
    setMsg(null);
    const dayList = weekDaysFromMonday(weekStart);

    const res = await getWeeklyPlan(weekStart);
    if (res.success && res.data) {
      const merged = emptyGrid();
      for (const cat of CATEGORIES) {
        merged[cat] = (res.data[cat] || Array(7).fill("")).slice(0, 7);
        while (merged[cat].length < 7) merged[cat].push("");
      }
      setGrid(merged);
      setDirty(false);
    } else {
      const fromSchedules = buildGridFromSchedules(schedules, dayList);
      setGrid(fromSchedules);
      setDirty(false);
      const cached = localStorage.getItem(`beansheal_weekly_plan_${weekStart}`);
      if (cached) {
        try {
          const parsed = JSON.parse(cached) as WeeklyPlanGrid;
          setGrid(parsed);
        } catch {
          /* ignore */
        }
      }
    }
    setLoading(false);
  }, [weekStart, schedules]);

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

  const handleImportFromSchedules = () => {
    if (!canEdit) return;
    if (dirty && !confirm("편집 중인 내용이 있습니다. 일정 데이터로 덮어쓸까요?")) return;
    setGrid(buildGridFromSchedules(schedules, days));
    setDirty(true);
    setMsg("노션/일정 데이터를 불러왔습니다. 저장 버튼을 눌러 반영하세요.");
  };

  const handleSave = async () => {
    if (!canEdit) return;
    setSaving(true);
    setMsg(null);
    const res = await saveWeeklyPlan(weekStart, grid, updatedBy);
    if (res.success) {
      localStorage.setItem(`beansheal_weekly_plan_${weekStart}`, JSON.stringify(grid));
      setDirty(false);
      setMsg("저장되었습니다.");
    } else {
      localStorage.setItem(`beansheal_weekly_plan_${weekStart}`, JSON.stringify(grid));
      setDirty(false);
      setMsg(res.message || "서버 저장 실패 — 로컬에만 저장됨");
    }
    setSaving(false);
  };

  return (
    <div className={`bg-white text-slate-900 w-full ${embedded ? "" : "max-w-6xl mx-auto"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2 mb-3 print:hidden">
        <div className="min-w-0">
          {!embedded && (
            <h2 className="text-xl md:text-2xl font-black tracking-tight text-[#1e3a5f]">
              BEANSHEAL 주간계획표
            </h2>
          )}
          <p className={`text-xs font-bold text-slate-600 ${embedded ? "" : "mt-1"}`}>
            부서: {department} | 기간: {periodLabel}
            {!canEdit && <span className="ml-2 text-slate-400">(조회 전용)</span>}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setWeekStart(getMondayOfDate())}
            className="text-[11px] font-bold px-2 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer"
          >
            이번 주
          </button>
          <button
            type="button"
            onClick={() => setWeekStart((w) => shiftMonday(w, -1))}
            className="text-[11px] font-bold px-2 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer"
          >
            ‹ 이전 주
          </button>
          <button
            type="button"
            onClick={() => setWeekStart((w) => shiftMonday(w, 1))}
            className="text-[11px] font-bold px-2 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer"
          >
            다음 주 ›
          </button>
          {canEdit && (
            <>
              <button
                type="button"
                onClick={handleImportFromSchedules}
                className="text-[11px] font-bold px-2 py-1 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 cursor-pointer"
              >
                일정에서 불러오기
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-[#1e3a5f] text-white hover:bg-[#152a45] cursor-pointer disabled:opacity-50"
              >
                {saving ? "저장 중…" : dirty ? "저장 *" : "저장"}
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => window.print()}
            className="text-[11px] font-bold px-2 py-1 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 cursor-pointer"
          >
            인쇄
          </button>
        </div>
      </div>

      {msg && (
        <p className="text-[11px] font-medium text-emerald-700 mb-2 print:hidden">{msg}</p>
      )}

      {loading ? (
        <div className="py-12 text-center text-xs text-slate-400">불러오는 중…</div>
      ) : (
        <div className="overflow-x-auto border border-[#9db4d0] rounded-sm flex-1 min-h-0">
          <table className="w-full min-w-[720px] border-collapse text-left table-fixed">
            <thead>
              <tr className="bg-[#1e3a5f] text-white">
                <th className="w-[72px] border border-[#9db4d0] px-2 py-2 text-xs font-extrabold text-center">
                  구분
                </th>
                {days.map((day, idx) => {
                  const isSat = idx === 5;
                  const isSun = idx === 6;
                  return (
                    <th
                      key={day.dateStr}
                      className={`border border-[#9db4d0] px-2 py-2 text-[11px] font-extrabold text-center ${
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
                  <td className="border border-[#9db4d0] bg-[#1e3a5f] text-white text-center text-xs font-extrabold align-middle px-2 py-2">
                    {cat}
                  </td>
                  {days.map((day, idx) => {
                    const isSat = idx === 5;
                    const isSun = idx === 6;
                    const value = grid[cat][idx] || "";
                    const cellSchedules = getSchedulesForCell(schedules, cat, day.dateStr);
                    const cellBg = isSun
                      ? "bg-[#fff5f5]"
                      : isSat
                        ? "bg-[#f0f7ff]"
                        : "bg-white";

                    return (
                      <td
                        key={`${cat}-${day.dateStr}`}
                        className={`border border-[#9db4d0] p-0 align-top min-h-[88px] ${cellBg}`}
                      >
                        <div className="flex flex-col min-h-[88px]">
                          {/* 노션 스타일: 업체명 · 타입 · 제품/상세 pill */}
                          {cellSchedules.length > 0 && (
                            <div className="px-1.5 pt-1.5 pb-1 border-b border-slate-100/80">
                              <ScheduleEntryPillsList schedules={cellSchedules} compact />
                            </div>
                          )}

                          {canEdit ? (
                            <textarea
                              value={value}
                              onChange={(e) => handleCellChange(cat, idx, e.target.value)}
                              className="w-full flex-1 min-h-[48px] px-2 py-1.5 text-[10px] font-medium leading-relaxed resize-none bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-300 text-slate-700 placeholder:text-slate-400"
                              placeholder={cellSchedules.length ? "추가 메모…" : "입력…"}
                            />
                          ) : value ? (
                            <div className="px-2 py-1.5 text-[10px] font-medium leading-relaxed whitespace-pre-wrap text-slate-600">
                              {value}
                            </div>
                          ) : cellSchedules.length === 0 ? (
                            <div className="px-2 py-2 text-[10px] text-slate-300">—</div>
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
      )}
    </div>
  );
}

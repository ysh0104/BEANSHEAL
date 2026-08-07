"use client";

import type { ProductionScheduleItem } from "@/app/actions/notionActions";

export type WeeklyPlanCategory = "생산" | "관리" | "입고" | "출고";

const CATEGORIES: WeeklyPlanCategory[] = ["생산", "관리", "입고", "출고"];

const DAY_LABELS = ["월(Mon)", "화(Tue)", "수(Wed)", "목(Thu)", "금(Fri)", "토(Sat)", "일(Sun)"];

type ScheduleLike = Pick<
  ProductionScheduleItem,
  "id" | "product_name" | "plan_date" | "end_date" | "quantity" | "note" | "tag_name"
>;

interface WeekDay {
  dateStr: string;
  day: number;
  month: number; // 1-12
}

interface WeeklyPlanViewProps {
  /** 일~토 또는 월~일 7일. 내부에서 월~일로 정규화 */
  weekCells: { dateStr: string; day?: number }[];
  schedules: ScheduleLike[];
  department?: string;
  onClose?: () => void;
  /** 인쇄용으로 닫기 버튼 숨김 */
  printMode?: boolean;
  /** 예: "2026년 7월 2주차" — 없으면 자동 계산 */
  periodLabel?: string;
}

function parseYmd(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return { y, m, d };
}

/** 캘린더 주(일~토) → 주간계획표 주(월~일) */
export function toMondayFirstWeek(weekCells: { dateStr: string; day?: number }[]): WeekDay[] {
  if (weekCells.length !== 7) return [];

  // 첫날이 일요일(기존 캘린더)이면 Mon~Sun = slice(1)+[Sun]
  const first = new Date(weekCells[0].dateStr + "T12:00:00");
  const isSundayStart = first.getDay() === 0;

  const ordered = isSundayStart
    ? [...weekCells.slice(1), weekCells[0]]
    : weekCells;

  return ordered.map((cell) => {
    const { m, d } = parseYmd(cell.dateStr);
    return {
      dateStr: cell.dateStr,
      day: cell.day ?? d,
      month: m,
    };
  });
}

export function resolveScheduleCategory(sch: ScheduleLike): WeeklyPlanCategory {
  const text = `${sch.tag_name || ""} ${sch.product_name || ""}`.toLowerCase();
  if (text.includes("생산") || text.includes("제조") || text.includes("라인")) return "생산";
  if (text.includes("입고") || text.includes("자재") || text.includes("원료") || text.includes("발주")) return "입고";
  if (text.includes("출고") || text.includes("배송") || text.includes("납품") || text.includes("택배")) return "출고";
  return "관리"; // 휴가, 점검, 기타
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

  // 관리 (휴가/점검 등)
  const tag = sch.tag_name ? `[${sch.tag_name}] ` : "";
  return `${tag}${name}` + (note ? `\n${note}` : "");
}

function weekOfMonthLabel(monday: WeekDay, sunday: WeekDay): string {
  // 해당 주가 걸쳐 있는 주 달력 기준: 월요일 날짜가 속한 달의 N주차
  // (1~7일 → 1주차, 8~14 → 2주차 …)
  const { y } = parseYmd(monday.dateStr);
  const month = monday.month;
  // 그 달 1일이 무슨 요일인지 반영한 주차 (월 시작 주 = 1주차)
  const firstOfMonth = new Date(y, month - 1, 1);
  const firstDow = firstOfMonth.getDay(); // 0=일
  // 월요일 기준 주차: 해당 달 날짜가 속한 ISO-ish week-of-month
  const adjusted = monday.day + ((firstDow + 6) % 7); // 월요일이 주 시작이 되도록
  const weekNum = Math.ceil(adjusted / 7) || 1;
  // 일요일이 다음 달이면 월요일 달 기준 유지
  void sunday;
  return `${y}년 ${month}월 ${weekNum}주차`;
}

export default function WeeklyPlanView({
  weekCells,
  schedules,
  department = "생산팀",
  onClose,
  printMode = false,
  periodLabel: periodLabelProp,
}: WeeklyPlanViewProps) {
  const days = toMondayFirstWeek(weekCells);
  if (days.length !== 7) return null;

  const periodLabel = periodLabelProp || weekOfMonthLabel(days[0], days[6]);

  const grid: Record<WeeklyPlanCategory, string[][]> = {
    생산: Array.from({ length: 7 }, () => [] as string[]),
    관리: Array.from({ length: 7 }, () => [] as string[]),
    입고: Array.from({ length: 7 }, () => [] as string[]),
    출고: Array.from({ length: 7 }, () => [] as string[]),
  };

  schedules.forEach((sch) => {
    const category = resolveScheduleCategory(sch);
    days.forEach((day, idx) => {
      if (scheduleOverlapsDay(sch, day.dateStr)) {
        grid[category][idx].push(formatCellEntry(sch, category));
      }
    });
  });

  return (
    <div className="bg-white text-slate-900 w-full max-w-6xl mx-auto">
      {!printMode && (
        <div className="flex items-start justify-between gap-3 mb-4 print:hidden">
          <div>
            <h2 className="text-2xl md:text-3xl font-black tracking-tight text-[#1e3a5f]">
              BEANSHEAL 주간계획표
            </h2>
            <p className="mt-1 text-sm font-bold text-slate-600">
              부서: {department} | 기간: {periodLabel}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => window.print()}
              className="text-xs font-bold px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 cursor-pointer"
            >
              인쇄
            </button>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="text-xs font-bold px-3 py-1.5 rounded-lg bg-slate-800 text-white hover:bg-slate-700 cursor-pointer"
              >
                닫기
              </button>
            )}
          </div>
        </div>
      )}

      {printMode && (
        <div className="mb-3">
          <h2 className="text-2xl font-black text-[#1e3a5f]">BEANSHEAL 주간계획표</h2>
          <p className="text-sm font-bold text-slate-600">
            부서: {department} | 기간: {periodLabel}
          </p>
        </div>
      )}

      <div className="overflow-x-auto border border-[#9db4d0] rounded-sm">
        <table className="w-full min-w-[720px] border-collapse text-left table-fixed">
          <thead>
            <tr className="bg-[#1e3a5f] text-white">
              <th className="w-[72px] border border-[#9db4d0] px-2 py-2.5 text-xs font-extrabold text-center">
                구분
              </th>
              {days.map((day, idx) => {
                const isSat = idx === 5;
                const isSun = idx === 6;
                return (
                  <th
                    key={day.dateStr}
                    className={`border border-[#9db4d0] px-2 py-2.5 text-[11px] font-extrabold text-center ${
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
                <td className="border border-[#9db4d0] bg-[#1e3a5f] text-white text-center text-xs font-extrabold align-middle px-2 py-3">
                  {cat}
                </td>
                {days.map((day, idx) => {
                  const isSat = idx === 5;
                  const isSun = idx === 6;
                  const entries = grid[cat][idx];
                  return (
                    <td
                      key={`${cat}-${day.dateStr}`}
                      className={`border border-[#9db4d0] px-2 py-2 align-top text-[11px] font-semibold leading-relaxed whitespace-pre-wrap min-h-[72px] ${
                        isSun
                          ? "bg-[#fff5f5] text-slate-800"
                          : isSat
                            ? "bg-[#f0f7ff] text-slate-800"
                            : "bg-white text-slate-900"
                      }`}
                    >
                      {entries.length > 0 ? entries.join("\n\n") : ""}
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

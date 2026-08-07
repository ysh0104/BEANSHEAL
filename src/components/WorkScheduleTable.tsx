"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  getWorkSchedule,
  saveWorkSchedule,
  type ScheduleEmployeeRow,
} from "@/app/actions/workScheduleActions";

export type ShiftCodeInfo = {
  code: string;
  name: string;
  hours?: string;
  category: "leave" | "shiftA" | "shiftB" | "shiftC" | "shiftD" | "shiftE";
  badgeClass: string;
  dotColor?: string;
};

export const SHIFT_CODES: Record<string, ShiftCodeInfo> = {
  // 휴무 및 연차 코드
  BE: { code: "BE", name: "Off Day (휴무)", hours: "-", category: "leave", badgeClass: "bg-[#18181B] text-white font-bold" },
  AL: { code: "AL", name: "Annual Leave (연차)", hours: "-", category: "leave", badgeClass: "bg-[#DCFCE7] text-[#15803D] font-bold" },
  ML: { code: "ML", name: "Full Day Off (일차)", hours: "-", category: "leave", badgeClass: "bg-[#FEF3C7] text-[#92400E] font-bold" },
  MO: { code: "MO", name: "Morning Off (오전반차)", hours: "-", category: "leave", badgeClass: "bg-[#F3F4F6] text-[#374151] font-bold" },
  AO: { code: "AO", name: "Afternoon Off (오후반차)", hours: "-", category: "leave", badgeClass: "bg-[#FFEDD5] text-[#C2410C] font-bold" },
  SL: { code: "SL", name: "Sick Leave (병가)", hours: "-", category: "leave", badgeClass: "bg-[#FEE2E2] text-[#B91C1C] font-bold" },
  PL: { code: "PL", name: "Paid Leave (유급휴가)", hours: "-", category: "leave", badgeClass: "bg-[#FCE7F3] text-[#BE185D] font-bold" },
  BT: { code: "BT", name: "Business Trip (출장)", hours: "-", category: "leave", badgeClass: "bg-[#E0F2FE] text-[#0369A1] font-bold" },
  OL: { code: "OL", name: "Duty (예비군)", hours: "-", category: "leave", badgeClass: "bg-[#F1F5F9] text-[#475569] font-bold" },
  RW: { code: "RW", name: "Remote Work (재택)", hours: "-", category: "leave", badgeClass: "bg-[#E6FCF5] text-[#0CA678] font-bold" },
  "?": { code: "?", name: "Pending (미정)", hours: "-", category: "leave", badgeClass: "bg-[#F4F4F5] text-[#71717A] font-bold" },

  // A계열 주간/표준 근무
  A1: { code: "A1", name: "Shift A1", hours: "06:00 - 15:00", category: "shiftA", badgeClass: "bg-[#F4F4F5] text-[#27272A] font-semibold hover:bg-[#E4E4E7]", dotColor: "#3B82F6" },
  A2: { code: "A2", name: "Shift A2", hours: "07:00 - 16:00", category: "shiftA", badgeClass: "bg-[#F4F4F5] text-[#27272A] font-semibold hover:bg-[#E4E4E7]", dotColor: "#3B82F6" },
  A3: { code: "A3", name: "Shift A3", hours: "08:00 - 17:00", category: "shiftA", badgeClass: "bg-[#F4F4F5] text-[#27272A] font-semibold hover:bg-[#E4E4E7]", dotColor: "#3B82F6" },
  A4: { code: "A4", name: "Standard A4", hours: "09:00 - 18:00", category: "shiftA", badgeClass: "bg-[#F4F4F5] text-[#27272A] font-semibold hover:bg-[#E4E4E7]", dotColor: "#3B82F6" },
  A5: { code: "A5", name: "Shift A5", hours: "10:00 - 19:00", category: "shiftA", badgeClass: "bg-[#F4F4F5] text-[#27272A] font-semibold hover:bg-[#E4E4E7]", dotColor: "#F97316" },
  A6: { code: "A6", name: "Shift A6", hours: "11:00 - 20:00", category: "shiftA", badgeClass: "bg-[#F4F4F5] text-[#27272A] font-semibold hover:bg-[#E4E4E7]", dotColor: "#F97316" },
  A7: { code: "A7", name: "Shift A7", hours: "12:00 - 21:00", category: "shiftA", badgeClass: "bg-[#F4F4F5] text-[#27272A] font-semibold hover:bg-[#E4E4E7]", dotColor: "#F97316" },
  A8: { code: "A8", name: "Shift A8", hours: "13:00 - 22:00", category: "shiftA", badgeClass: "bg-[#F4F4F5] text-[#27272A] font-semibold hover:bg-[#E4E4E7]", dotColor: "#F97316" },
  A9: { code: "A9", name: "Night A9", hours: "14:00 - 23:00", category: "shiftA", badgeClass: "bg-[#EEF2FF] text-[#3730A3] font-semibold", dotColor: "#6366F1" },
  A10: { code: "A10", name: "Night A10", hours: "15:00 - 24:00", category: "shiftA", badgeClass: "bg-[#EEF2FF] text-[#3730A3] font-semibold", dotColor: "#6366F1" },
  A11: { code: "A11", name: "Overnight A11", hours: "16:00 - 01:00", category: "shiftA", badgeClass: "bg-[#E0E7FF] text-[#312E81] font-bold", dotColor: "#4338CA" },
  A12: { code: "A12", name: "Overnight A12", hours: "17:00 - 02:00", category: "shiftA", badgeClass: "bg-[#E0E7FF] text-[#312E81] font-bold", dotColor: "#4338CA" },
  A13: { code: "A13", name: "Overnight A13", hours: "18:00 - 03:00", category: "shiftA", badgeClass: "bg-[#F3E8FF] text-[#581C87] font-bold", dotColor: "#8B5CF6" },
};

function getShiftInfo(code: string): ShiftCodeInfo {
  if (SHIFT_CODES[code]) return SHIFT_CODES[code];
  const char = code.charAt(0);
  const num = parseInt(code.slice(1), 10);
  if (!isNaN(num)) {
    const baseHour = (5 + num) % 24;
    let dur = 9;
    if (char === "B") dur = 10;
    if (char === "C") dur = 11;
    if (char === "D") dur = 12;
    if (char === "E") dur = 13;
    const startH = String(baseHour).padStart(2, "0");
    const endH = String((baseHour + dur) % 24).padStart(2, "0");
    return {
      code,
      name: `${char} Series`,
      hours: `${startH}:00 - ${endH}:00`,
      category: `shift${char}` as any,
      badgeClass: "bg-[#F4F4F5] text-[#27272A] font-semibold",
    };
  }
  return {
    code,
    name: code,
    hours: "-",
    category: "leave",
    badgeClass: "bg-[#F4F4F5] text-[#27272A] font-semibold",
  };
}

// 아바타 원형 서클 색상 생성 헬퍼
function getAvatarBadge(name: string) {
  const initial = name.charAt(0).toUpperCase();
  const charCode = name.charCodeAt(0);
  const colorIndex = charCode % 6;
  const avatarColors = [
    "bg-[#DBEAFE] text-[#1E40AF]", // Blue
    "bg-[#CFFAFE] text-[#0891B2]", // Cyan
    "bg-[#E0E7FF] text-[#3730A3]", // Indigo
    "bg-[#F3E8FF] text-[#6B21A8]", // Purple
    "bg-[#CCFBF1] text-[#0F766E]", // Teal
    "bg-[#FEF3C7] text-[#92400E]", // Amber
  ];
  return {
    initial,
    colorClass: avatarColors[colorIndex],
  };
}

const INITIAL_DEMO_DATA: ScheduleEmployeeRow[] = [
  { id: "1", name: "Jung Sun-young", group: "생산1팀", shifts: { "1": "A4", "2": "A4", "3": "A8", "4": "A3", "5": "A8", "6": "AL", "7": "AL", "8": "A4", "9": "A4", "10": "A4", "11": "A4", "12": "A4", "13": "A3", "14": "AL", "15": "BE", "16": "BE" } },
  { id: "2", name: "Im Hwa-rang", group: "생산1팀", shifts: { "1": "BE", "2": "BE", "3": "AL", "4": "A3", "5": "A4", "6": "A4", "7": "AL", "8": "BE", "9": "BE", "10": "A4", "11": "A3", "12": "A4", "13": "A8", "14": "AL", "15": "BE", "16": "BE" } },
  { id: "3", name: "Lee Sang-eun", group: "생산1팀", shifts: { "1": "BE", "2": "BE", "3": "A8", "4": "A4", "5": "A3", "6": "A4", "7": "AL", "8": "BE", "9": "BE", "10": "AL", "11": "AL", "12": "A4", "13": "A3", "14": "A8", "15": "BE", "16": "BE" } },
  { id: "4", name: "Joo Jae-hoon", group: "생산1팀", shifts: { "1": "A4", "2": "A4", "3": "A4", "4": "A4", "5": "AL", "6": "A3", "7": "A4", "8": "A4", "9": "A4", "10": "A8", "11": "AL", "12": "A4", "13": "A4", "14": "A3", "15": "BE", "16": "BE" } },
  { id: "5", name: "Yoo Kwang-sung", group: "생산1팀", shifts: { "1": "BE", "2": "BE", "3": "A3", "4": "A4", "5": "A4", "6": "A4", "7": "AL", "8": "BE", "9": "BE", "10": "A8", "11": "A8", "12": "A4", "13": "AL", "14": "A3", "15": "BE", "16": "BE" } },
  { id: "6", name: "Yoo Hee-ryung", group: "생산2팀", shifts: { "1": "BE", "2": "BE", "3": "A8", "4": "AL", "5": "A8", "6": "A3", "7": "A4", "8": "BE", "9": "BE", "10": "AL", "11": "AL", "12": "A4", "13": "A8", "14": "AL", "15": "BE", "16": "BE" } },
  { id: "7", name: "Kim Jong-dae", group: "생산2팀", shifts: { "1": "A4", "2": "A4", "3": "A8", "4": "A4", "5": "A3", "6": "AL", "7": "A4", "8": "A4", "9": "A4", "10": "A3", "11": "A3", "12": "A8", "13": "A8", "14": "A8", "15": "BE", "16": "BE" } },
  { id: "8", name: "Yoo Seung-hoon", group: "생산2팀", shifts: { "1": "BE", "2": "BE", "3": "A4", "4": "A3", "5": "A3", "6": "A8", "7": "A8", "8": "BE", "9": "BE", "10": "A4", "11": "A4", "12": "A3", "13": "AL", "14": "A3", "15": "BE", "16": "BE" } },
  { id: "9", name: "Bang Se-won", group: "생산2팀", shifts: { "1": "BE", "2": "BE", "3": "A3", "4": "A4", "5": "AL", "6": "A8", "7": "A8", "8": "BE", "9": "BE", "10": "A8", "11": "AL", "12": "AL", "13": "A4", "14": "A4", "15": "BE", "16": "BE" } },
  { id: "10", name: "Kim Hak-chan", group: "품질팀", shifts: { "1": "A4", "2": "A4", "3": "A3", "4": "AL", "5": "A4", "6": "A3", "7": "A4", "8": "A4", "9": "A4", "10": "A4", "11": "A3", "12": "A4", "13": "AL", "14": "A4", "15": "BE", "16": "BE" } },
  { id: "11", name: "Choi Bong-ju", group: "품질팀", shifts: { "1": "BE", "2": "BE", "3": "A8", "4": "A4", "5": "AL", "6": "A3", "7": "A8", "8": "BE", "9": "BE", "10": "AL", "11": "AL", "12": "AL", "13": "A8", "14": "A4", "15": "BE", "16": "BE" } },
  { id: "12", name: "Kang Da-hyun", group: "품질팀", shifts: { "1": "BE", "2": "BE", "3": "A4", "4": "A3", "5": "A8", "6": "A4", "7": "A8", "8": "BE", "9": "BE", "10": "A3", "11": "A8", "12": "A4", "13": "A4", "14": "A8", "15": "BE", "16": "BE" } },
  { id: "13", name: "Jung Sun-hee", group: "경영지원팀", shifts: { "1": "BE", "2": "BE", "3": "A4", "4": "A3", "5": "A8", "6": "A4", "7": "A4", "8": "BE", "9": "BE", "10": "A3", "11": "A4", "12": "AL", "13": "A3", "14": "A8", "15": "BE", "16": "BE" } },
  { id: "14", name: "Joo Mi-jung", group: "경영지원팀", shifts: { "1": "BE", "2": "BE", "3": "A4", "4": "A4", "5": "A4", "6": "A3", "7": "A8", "8": "BE", "9": "BE", "10": "AL", "11": "A4", "12": "A4", "13": "A3", "14": "A4", "15": "BE", "16": "BE" } },
  { id: "15", name: "Kim Dae-won", group: "경영지원팀", shifts: { "1": "A4", "2": "A4", "3": "AL", "4": "AL", "5": "A3", "6": "A8", "7": "A4", "8": "A4", "9": "A4", "10": "A4", "11": "AL", "12": "A8", "13": "A4", "14": "A4", "15": "BE", "16": "BE" } },
];

export default function WorkScheduleTable() {
  const [currentYear, setCurrentYear] = useState(2026);
  const [currentMonth, setCurrentMonth] = useState(8); // 1-12
  const [viewMode, setViewMode] = useState<"Month" | "Week" | "Day">("Month");
  const [rows, setRows] = useState<ScheduleEmployeeRow[]>(INITIAL_DEMO_DATA);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const [editingCell, setEditingCell] = useState<{
    empId: string;
    day: number;
    empName: string;
    currentCode: string;
  } | null>(null);

  const yearMonthKey = `${currentYear}-${String(currentMonth).padStart(2, "0")}`;

  // 데이터 로딩
  useEffect(() => {
    (async () => {
      try {
        const res = await getWorkSchedule(yearMonthKey);
        if (res.success && res.data && res.data.length > 0) {
          setRows(res.data);
        } else {
          const localData = localStorage.getItem(`beansheal_work_schedule_${yearMonthKey}`);
          if (localData) setRows(JSON.parse(localData));
          else setRows(INITIAL_DEMO_DATA);
        }
      } catch {
        setRows(INITIAL_DEMO_DATA);
      }
    })();
  }, [yearMonthKey]);

  // 저장 실행
  const handleSave = async () => {
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await saveWorkSchedule(yearMonthKey, rows);
      localStorage.setItem(`beansheal_work_schedule_${yearMonthKey}`, JSON.stringify(rows));
      if (res.success) {
        setSaveMsg({ type: "success", text: "스케줄이 성공적으로 게시/저장되었습니다." });
      } else {
        setSaveMsg({ type: "success", text: "로컬 스토리지에 스케줄이 저장되었습니다." });
      }
    } catch {
      setSaveMsg({ type: "error", text: "스케줄 저장 실패" });
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(null), 3000);
    }
  };

  const daysInMonth = useMemo(() => {
    return new Date(currentYear, currentMonth, 0).getDate();
  }, [currentYear, currentMonth]);

  const daysHeader = useMemo(() => {
    const arr = [];
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    for (let day = 1; day <= daysInMonth; day++) {
      const dateObj = new Date(currentYear, currentMonth - 1, day);
      const dayOfWeek = dateObj.getDay();
      const isSat = dayOfWeek === 6;
      const isSun = dayOfWeek === 0;
      arr.push({
        day,
        label: `${day}/${currentMonth}`,
        dayName: dayNames[dayOfWeek],
        isSat,
        isSun,
      });
    }
    return arr;
  }, [currentYear, currentMonth, daysInMonth]);

  const filteredRows = useMemo(() => {
    if (!searchQuery.trim()) return rows;
    const q = searchQuery.toLowerCase();
    return rows.filter((r) => r.name.toLowerCase().includes(q) || r.group.toLowerCase().includes(q));
  }, [rows, searchQuery]);

  const updateCellValue = (empId: string, day: number, code: string) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id === empId) {
          const nextShifts = { ...r.shifts };
          if (!code.trim()) delete nextShifts[String(day)];
          else nextShifts[String(day)] = code.trim().toUpperCase();
          return { ...r, shifts: nextShifts };
        }
        return r;
      })
    );
  };

  const handleExportCSV = () => {
    let csv = `Employee,` + daysHeader.map((d) => `${d.label}(${d.dayName})`).join(",") + "\n";
    rows.forEach((r) => {
      const line = [`"${r.name}"`, ...daysHeader.map((d) => `"${r.shifts[String(d.day)] || ""}"`)].join(",");
      csv += line + "\n";
    });
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Schedule_${yearMonthKey}.csv`;
    link.click();
  };

  const monthNamesEn = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  return (
    <div className="w-full bg-[#F8FAFC] dark:bg-slate-950 p-4 sm:p-6 rounded-[24px] font-sans border border-slate-200/80 dark:border-slate-800 shadow-2xl space-y-6">
      {/* 🌟 1. 상단 Top Navigation Bar (Kinetic Workforce Admin 룩앤필) */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-white font-black text-lg shadow-md">
            K
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              Scheduling Dashboard
            </h1>
            <p className="text-xs text-slate-400 font-medium">Workforce Admin • Kinetic Intelligent Schedule</p>
          </div>
        </div>

        {/* 검색창 & 액션 버튼 */}
        <div className="flex items-center flex-wrap gap-3">
          <div className="relative">
            <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search employees..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-2 text-xs bg-slate-100 dark:bg-slate-800 border-none rounded-full text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-blue-600 w-44 sm:w-60 font-medium"
            />
          </div>

          <button
            onClick={handleExportCSV}
            className="px-4 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-xl transition-all border border-slate-200 dark:border-slate-700"
          >
            Export CSV
          </button>

          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 text-xs font-bold text-white bg-[#0047FF] hover:bg-blue-700 rounded-xl shadow-md transition-all disabled:opacity-50 flex items-center gap-2"
          >
            {saving ? "Publishing..." : "Publish Schedule"}
          </button>
        </div>
      </div>

      {/* 🌟 2. Month Selector & View Mode Switcher Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <button
            onClick={() => {
              if (currentMonth === 1) { setCurrentYear((prev) => prev - 1); setCurrentMonth(12); }
              else setCurrentMonth((prev) => prev - 1);
            }}
            className="p-2 bg-white dark:bg-slate-900 hover:bg-slate-100 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 transition-colors shadow-2xs"
          >
            ‹
          </button>
          <div>
            <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              {monthNamesEn[currentMonth - 1]} {currentYear}
            </h2>
            <p className="text-xs text-slate-400 font-medium">Showing all active departments ({filteredRows.length} employees)</p>
          </div>
          <button
            onClick={() => {
              if (currentMonth === 12) { setCurrentYear((prev) => prev + 1); setCurrentMonth(1); }
              else setCurrentMonth((prev) => prev + 1);
            }}
            className="p-2 bg-white dark:bg-slate-900 hover:bg-slate-100 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 transition-colors shadow-2xs"
          >
            ›
          </button>
        </div>

        {/* View Mode Toggle Switcher (Month | Week | Day) */}
        <div className="bg-slate-200/80 dark:bg-slate-800/80 p-1 rounded-xl flex items-center gap-1 text-xs font-bold">
          {(["Month", "Week", "Day"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-4 py-1.5 rounded-lg transition-all ${
                viewMode === mode
                  ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs"
                  : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      {saveMsg && (
        <div
          className={`px-4 py-2 text-xs font-bold rounded-xl text-center shadow-xs ${
            saveMsg.type === "success"
              ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
              : "bg-red-500/10 text-red-600 border border-red-500/20"
          }`}
        >
          {saveMsg.text}
        </div>
      )}

      {/* 🌟 3. 스케줄 그리드 테이블 (Kinetic 디자인 레퍼런스 스타일) */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 overflow-hidden shadow-sm">
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-xs text-center border-collapse">
            <thead>
              <tr className="bg-[#F8FAFC] dark:bg-slate-800/90 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">
                <th className="sticky left-0 z-20 bg-[#F8FAFC] dark:bg-slate-800 px-4 py-3.5 border-r border-slate-200 dark:border-slate-700 text-left font-bold min-w-[200px]">
                  Employee
                </th>
                {daysHeader.map((d) => (
                  <th
                    key={d.day}
                    className={`px-1 py-2 border-r border-slate-200 dark:border-slate-700 min-w-[42px] font-bold ${
                      d.isSun
                        ? "text-[#DC2626] bg-[#FEF2F2] dark:bg-red-950/30"
                        : d.isSat
                        ? "text-[#1D4ED8] bg-[#EFF6FF] dark:bg-blue-950/30"
                        : ""
                    }`}
                  >
                    <div className="text-[12px] font-black">{d.day}/{currentMonth}</div>
                    <div className="text-[10px] font-semibold opacity-75">{d.dayName}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={daysInMonth + 1} className="py-12 text-slate-400 font-medium">
                    No matching employees found.
                  </td>
                </tr>
              ) : (
                filteredRows.map((emp, idx) => {
                  const avatar = getAvatarBadge(emp.name);
                  return (
                    <tr
                      key={emp.id}
                      className={`border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors ${
                        idx % 2 === 1 ? "bg-[#FAFAFA] dark:bg-slate-900/50" : ""
                      }`}
                    >
                      {/* 사원 이름 + 아바타 */}
                      <td className="sticky left-0 z-10 bg-white dark:bg-slate-900 px-4 py-2.5 border-r border-slate-200 dark:border-slate-800 text-left font-semibold text-slate-800 dark:text-slate-200 shadow-2xs">
                        <div className="flex items-center space-x-2.5">
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${avatar.colorClass}`}>
                            {avatar.initial}
                          </div>
                          <div className="truncate">
                            <div className="font-bold text-slate-900 dark:text-white text-[13px] leading-tight truncate">
                              {emp.name}
                            </div>
                            <div className="text-[10px] text-slate-400 font-medium truncate">{emp.group}</div>
                          </div>
                        </div>
                      </td>

                      {/* 일자별 근무 코드 */}
                      {daysHeader.map((d) => {
                        const code = emp.shifts[String(d.day)] || "";
                        const info = getShiftInfo(code);

                        return (
                          <td
                            key={d.day}
                            onClick={() =>
                              setEditingCell({
                                empId: emp.id,
                                day: d.day,
                                empName: emp.name,
                                currentCode: code,
                              })
                            }
                            className={`p-1 border-r border-slate-100 dark:border-slate-800/80 cursor-pointer hover:ring-2 hover:ring-blue-500 transition-all select-none ${
                              d.isSun ? "bg-[#FEF2F2]/30" : d.isSat ? "bg-[#EFF6FF]/30" : ""
                            }`}
                          >
                            {code ? (
                              <div className={`w-full py-1 rounded-[6px] text-center font-bold text-[11px] transition-transform hover:scale-105 shadow-2xs ${info.badgeClass}`}>
                                {code}
                              </div>
                            ) : (
                              <div className="w-full py-1 text-center text-[10px] text-slate-300 dark:text-slate-700">
                                -
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 🌟 4. 셀 편집 팝업 모달 */}
      {editingCell && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 max-w-sm w-full shadow-2xl space-y-4 animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                  Edit Shift: <span className="text-blue-600 dark:text-blue-400">{editingCell.empName}</span>
                </h3>
                <p className="text-xs text-slate-400">
                  {currentMonth}/{editingCell.day}
                </p>
              </div>
              <button onClick={() => setEditingCell(null)} className="text-slate-400 hover:text-slate-600 font-bold">
                ✕
              </button>
            </div>

            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1 scrollbar-thin text-xs">
              <div>
                <div className="text-[11px] font-bold text-slate-400 mb-1.5">Status Codes</div>
                <div className="grid grid-cols-3 gap-1.5">
                  {["BE", "AL", "MO", "AO", "SL", "BT", "RW", "?"].map((cd) => {
                    const info = getShiftInfo(cd);
                    return (
                      <button
                        key={cd}
                        onClick={() => { updateCellValue(editingCell.empId, editingCell.day, cd); setEditingCell(null); }}
                        className={`p-2 rounded-xl text-center font-bold text-xs transition-all ${info.badgeClass}`}
                      >
                        {cd}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="text-[11px] font-bold text-slate-400 mb-1.5">Standard Shifts (A1-A13)</div>
                <div className="grid grid-cols-4 gap-1.5">
                  {["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9", "A10", "A11", "A12", "A13"].map((cd) => {
                    const info = getShiftInfo(cd);
                    return (
                      <button
                        key={cd}
                        onClick={() => { updateCellValue(editingCell.empId, editingCell.day, cd); setEditingCell(null); }}
                        className={`p-1.5 rounded-xl text-center text-xs font-bold transition-all ${info.badgeClass}`}
                      >
                        {cd}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2">
              <button
                onClick={() => { updateCellValue(editingCell.empId, editingCell.day, ""); setEditingCell(null); }}
                className="w-full py-2 text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 rounded-xl transition-all"
              >
                Clear Cell
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🌟 5. 하단 3개 요약 레전드 카드 (레퍼런스 이미지와 100% 동일) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: STANDARD SHIFTS (A1-A13) */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs space-y-3">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider">
            Standard Shifts (A1-A13)
          </h3>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {[
              { code: "A1: 06:00 - 15:00", dot: "bg-blue-500" },
              { code: "A2: 07:00 - 16:00", dot: "bg-blue-500" },
              { code: "A3: 08:00 - 17:00", dot: "bg-blue-500" },
              { code: "A4: 09:00 - 18:00", dot: "bg-blue-500" },
              { code: "A5: 10:00 - 19:00", dot: "bg-orange-500" },
              { code: "A6: 11:00 - 20:00", dot: "bg-orange-500" },
              { code: "A7: 12:00 - 21:00", dot: "bg-orange-500" },
              { code: "A8: 13:00 - 22:00", dot: "bg-orange-500" },
            ].map((item, i) => (
              <div key={i} className="p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-100 dark:border-slate-800 flex items-center space-x-2 font-medium text-slate-700 dark:text-slate-300">
                <span className={`w-2 h-2 rounded-full shrink-0 ${item.dot}`}></span>
                <span className="truncate">{item.code}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Card 2: OVERTIME/EXTENDED (B, C, D) */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs space-y-3">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider">
            Overtime / Extended (B, C, D)
          </h3>
          <div className="space-y-2 text-xs">
            <div className="p-3 bg-purple-50 dark:bg-purple-950/30 rounded-xl border border-purple-100 dark:border-purple-900/50 flex items-center space-x-2 font-semibold text-purple-900 dark:text-purple-300">
              <span className="w-2.5 h-2.5 rounded-full bg-purple-500 shrink-0"></span>
              <span>B Series: 10hr Shifts</span>
            </div>
            <div className="p-3 bg-indigo-50 dark:bg-indigo-950/30 rounded-xl border border-indigo-100 dark:border-indigo-900/50 flex items-center space-x-2 font-semibold text-indigo-900 dark:text-indigo-300">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 shrink-0"></span>
              <span>C Series: 11hr Shifts</span>
            </div>
            <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-xl border border-blue-100 dark:border-blue-900/50 flex items-center space-x-2 font-semibold text-blue-900 dark:text-blue-300">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-600 shrink-0"></span>
              <span>D Series: Night Shifts</span>
            </div>
          </div>
        </div>

        {/* Card 3: STATUS CODES */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs space-y-3">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider">
            Status Codes
          </h3>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2.5 bg-[#18181B] text-white rounded-xl font-bold flex items-center justify-between">
              <span>BE: Off Day</span>
            </div>
            <div className="p-2.5 bg-[#DCFCE7] text-[#15803D] rounded-xl font-bold flex items-center justify-between">
              <span>AL: Annual Leave</span>
            </div>
            <div className="p-2.5 bg-[#FEE2E2] text-[#B91C1C] rounded-xl font-bold flex items-center justify-between">
              <span>SL: Sick Leave</span>
            </div>
            <div className="p-2.5 bg-[#F3F4F6] text-[#374151] rounded-xl font-bold flex items-center justify-between">
              <span>MO: Morning Off</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

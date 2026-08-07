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

// 근무/휴무 한국어 명칭 및 스타일 지정
export const SHIFT_CODES: Record<string, ShiftCodeInfo> = {
  // 휴무 및 연차 코드
  BE: { code: "BE", name: "휴무 (Off)", hours: "-", category: "leave", badgeClass: "bg-[#18181B] text-white font-bold" },
  AL: { code: "AL", name: "연차 (Annual Leave)", hours: "-", category: "leave", badgeClass: "bg-[#DCFCE7] text-[#15803D] font-bold" },
  ML: { code: "ML", name: "일차 (Full Day Off)", hours: "-", category: "leave", badgeClass: "bg-[#FEF3C7] text-[#92400E] font-bold" },
  MO: { code: "MO", name: "오전반차 (Morning Off)", hours: "-", category: "leave", badgeClass: "bg-[#F3F4F6] text-[#374151] font-bold" },
  AO: { code: "AO", name: "오후반차 (Afternoon Off)", hours: "-", category: "leave", badgeClass: "bg-[#FFEDD5] text-[#C2410C] font-bold" },
  SL: { code: "SL", name: "병가 (Sick Leave)", hours: "-", category: "leave", badgeClass: "bg-[#FEE2E2] text-[#B91C1C] font-bold" },
  PL: { code: "PL", name: "유급휴가 (Paid Leave)", hours: "-", category: "leave", badgeClass: "bg-[#FCE7F3] text-[#BE185D] font-bold" },
  BT: { code: "BT", name: "출장 (Business Trip)", hours: "-", category: "leave", badgeClass: "bg-[#E0F2FE] text-[#0369A1] font-bold" },
  OL: { code: "OL", name: "예비군/민방위", hours: "-", category: "leave", badgeClass: "bg-[#F1F5F9] text-[#475569] font-bold" },
  RW: { code: "RW", name: "재택근무 (Remote Work)", hours: "-", category: "leave", badgeClass: "bg-[#E6FCF5] text-[#0CA678] font-bold" },
  "?": { code: "?", name: "미정 (Pending)", hours: "-", category: "leave", badgeClass: "bg-[#F4F4F5] text-[#71717A] font-bold" },

  // A계열 주간/표준 근무 (06:00 ~ 18:00 시작)
  A1: { code: "A1", name: "조근1 (06:00~15:00)", hours: "06:00 - 15:00", category: "shiftA", badgeClass: "bg-[#F4F4F5] text-[#27272A] font-semibold hover:bg-[#E4E4E7]", dotColor: "#3B82F6" },
  A2: { code: "A2", name: "조근2 (07:00~16:00)", hours: "07:00 - 16:00", category: "shiftA", badgeClass: "bg-[#F4F4F5] text-[#27272A] font-semibold hover:bg-[#E4E4E7]", dotColor: "#3B82F6" },
  A3: { code: "A3", name: "조근3 (08:00~17:00)", hours: "08:00 - 17:00", category: "shiftA", badgeClass: "bg-[#F4F4F5] text-[#27272A] font-semibold hover:bg-[#E4E4E7]", dotColor: "#3B82F6" },
  A4: { code: "A4", name: "주간정속 (09:00~18:00)", hours: "09:00 - 18:00", category: "shiftA", badgeClass: "bg-[#F4F4F5] text-[#27272A] font-semibold hover:bg-[#E4E4E7]", dotColor: "#3B82F6" },
  A5: { code: "A5", name: "주근5 (10:00~19:00)", hours: "10:00 - 19:00", category: "shiftA", badgeClass: "bg-[#F4F4F5] text-[#27272A] font-semibold hover:bg-[#E4E4E7]", dotColor: "#F97316" },
  A6: { code: "A6", name: "주근6 (11:00~20:00)", hours: "11:00 - 20:00", category: "shiftA", badgeClass: "bg-[#F4F4F5] text-[#27272A] font-semibold hover:bg-[#E4E4E7]", dotColor: "#F97316" },
  A7: { code: "A7", name: "주근7 (12:00~21:00)", hours: "12:00 - 21:00", category: "shiftA", badgeClass: "bg-[#F4F4F5] text-[#27272A] font-semibold hover:bg-[#E4E4E7]", dotColor: "#F97316" },
  A8: { code: "A8", name: "석근8 (13:00~22:00)", hours: "13:00 - 22:00", category: "shiftA", badgeClass: "bg-[#F4F4F5] text-[#27272A] font-semibold hover:bg-[#E4E4E7]", dotColor: "#F97316" },
  A9: { code: "A9", name: "야근9 (14:00~23:00)", hours: "14:00 - 23:00", category: "shiftA", badgeClass: "bg-[#EEF2FF] text-[#3730A3] font-semibold", dotColor: "#6366F1" },
  A10: { code: "A10", name: "야근10 (15:00~24:00)", hours: "15:00 - 24:00", category: "shiftA", badgeClass: "bg-[#EEF2FF] text-[#3730A3] font-semibold", dotColor: "#6366F1" },
  A11: { code: "A11", name: "철야11 (16:00~01:00)", hours: "16:00 - 01:00", category: "shiftA", badgeClass: "bg-[#E0E7FF] text-[#312E81] font-bold", dotColor: "#4338CA" },
  A12: { code: "A12", name: "철야12 (17:00~02:00)", hours: "17:00 - 02:00", category: "shiftA", badgeClass: "bg-[#E0E7FF] text-[#312E81] font-bold", dotColor: "#4338CA" },
  A13: { code: "A13", name: "철야13 (18:00~03:00)", hours: "18:00 - 03:00", category: "shiftA", badgeClass: "bg-[#F3E8FF] text-[#581C87] font-bold", dotColor: "#8B5CF6" },
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
      name: `${char} 계열 연장 근무`,
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
  { id: "1", name: "정성영", group: "생산1팀", shifts: { "1": "A4", "2": "A4", "3": "A8", "4": "A3", "5": "A8", "6": "AL", "7": "AL", "8": "A4", "9": "A4", "10": "A4", "11": "A4", "12": "A4", "13": "A3", "14": "AL", "15": "BE", "16": "BE" } },
  { id: "2", name: "임화랑", group: "생산1팀", shifts: { "1": "BE", "2": "BE", "3": "AL", "4": "A3", "5": "A4", "6": "A4", "7": "AL", "8": "BE", "9": "BE", "10": "A4", "11": "A3", "12": "A4", "13": "A8", "14": "AL", "15": "BE", "16": "BE" } },
  { id: "3", name: "이상은", group: "생산1팀", shifts: { "1": "BE", "2": "BE", "3": "A8", "4": "A4", "5": "A3", "6": "A4", "7": "AL", "8": "BE", "9": "BE", "10": "AL", "11": "AL", "12": "A4", "13": "A3", "14": "A8", "15": "BE", "16": "BE" } },
  { id: "4", name: "주재훈", group: "생산1팀", shifts: { "1": "A4", "2": "A4", "3": "A4", "4": "A4", "5": "AL", "6": "A3", "7": "A4", "8": "A4", "9": "A4", "10": "A8", "11": "AL", "12": "A4", "13": "A4", "14": "A3", "15": "BE", "16": "BE" } },
  { id: "5", name: "유광성", group: "생산1팀", shifts: { "1": "BE", "2": "BE", "3": "A3", "4": "A4", "5": "A4", "6": "A4", "7": "AL", "8": "BE", "9": "BE", "10": "A8", "11": "A8", "12": "A4", "13": "AL", "14": "A3", "15": "BE", "16": "BE" } },
  { id: "6", name: "유희정", group: "생산2팀", shifts: { "1": "BE", "2": "BE", "3": "A8", "4": "AL", "5": "A8", "6": "A3", "7": "A4", "8": "BE", "9": "BE", "10": "AL", "11": "AL", "12": "A4", "13": "A8", "14": "AL", "15": "BE", "16": "BE" } },
  { id: "7", name: "김종대", group: "생산2팀", shifts: { "1": "A4", "2": "A4", "3": "A8", "4": "A4", "5": "A3", "6": "AL", "7": "A4", "8": "A4", "9": "A4", "10": "A3", "11": "A3", "12": "A8", "13": "A8", "14": "A8", "15": "BE", "16": "BE" } },
  { id: "8", name: "유승훈", group: "생산2팀", shifts: { "1": "BE", "2": "BE", "3": "A4", "4": "A3", "5": "A3", "6": "A8", "7": "A8", "8": "BE", "9": "BE", "10": "A4", "11": "A4", "12": "A3", "13": "AL", "14": "A3", "15": "BE", "16": "BE" } },
  { id: "9", name: "방세원", group: "생산2팀", shifts: { "1": "BE", "2": "BE", "3": "A3", "4": "A4", "5": "AL", "6": "A8", "7": "A8", "8": "BE", "9": "BE", "10": "A8", "11": "AL", "12": "AL", "13": "A4", "14": "A4", "15": "BE", "16": "BE" } },
  { id: "10", name: "김학찬", group: "품질팀", shifts: { "1": "A4", "2": "A4", "3": "A3", "4": "AL", "5": "A4", "6": "A3", "7": "A4", "8": "A4", "9": "A4", "10": "A4", "11": "A3", "12": "A4", "13": "AL", "14": "A4", "15": "BE", "16": "BE" } },
  { id: "11", name: "최봉구", group: "품질팀", shifts: { "1": "BE", "2": "BE", "3": "A8", "4": "A4", "5": "AL", "6": "A3", "7": "A8", "8": "BE", "9": "BE", "10": "AL", "11": "AL", "12": "AL", "13": "A8", "14": "A4", "15": "BE", "16": "BE" } },
  { id: "12", name: "강다현", group: "품질팀", shifts: { "1": "BE", "2": "BE", "3": "A4", "4": "A3", "5": "A8", "6": "A4", "7": "A8", "8": "BE", "9": "BE", "10": "A3", "11": "A8", "12": "A4", "13": "A4", "14": "A8", "15": "BE", "16": "BE" } },
  { id: "13", name: "정선희", group: "경영지원팀", shifts: { "1": "BE", "2": "BE", "3": "A4", "4": "A3", "5": "A8", "6": "A4", "7": "A4", "8": "BE", "9": "BE", "10": "A3", "11": "A4", "12": "AL", "13": "A3", "14": "A8", "15": "BE", "16": "BE" } },
  { id: "14", name: "주미정", group: "경영지원팀", shifts: { "1": "BE", "2": "BE", "3": "A4", "4": "A4", "5": "A4", "6": "A3", "7": "A8", "8": "BE", "9": "BE", "10": "AL", "11": "A4", "12": "A4", "13": "A3", "14": "A4", "15": "BE", "16": "BE" } },
  { id: "15", name: "김대원", group: "경영지원팀", shifts: { "1": "A4", "2": "A4", "3": "AL", "4": "AL", "5": "A3", "6": "A8", "7": "A4", "8": "A4", "9": "A4", "10": "A4", "11": "AL", "12": "A8", "13": "A4", "14": "A4", "15": "BE", "16": "BE" } },
];

export default function WorkScheduleTable() {
  const [currentYear, setCurrentYear] = useState(2026);
  const [currentMonth, setCurrentMonth] = useState(8); // 1-12
  const [viewMode, setViewMode] = useState<"월간" | "주간" | "일간">("월간");
  const [selectedWeek, setSelectedWeek] = useState<number>(1); // 주간 뷰 (1~5주차)
  const [selectedDeptFilter, setSelectedDeptFilter] = useState<string>("전체");
  
  const [rows, setRows] = useState<ScheduleEmployeeRow[]>(INITIAL_DEMO_DATA);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // 새 사원 등록 모달 state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newEmpName, setNewEmpName] = useState("");
  const [newEmpGroup, setNewEmpGroup] = useState("생산1팀");

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
        setSaveMsg({ type: "success", text: "월간 스케줄이 저장 및 전사 게시되었습니다! 🚀" });
      } else {
        setSaveMsg({ type: "success", text: "로컬 스토리지에 스케줄이 보관되었습니다." });
      }
    } catch {
      setSaveMsg({ type: "error", text: "스케줄 저장 중 오류가 발생했습니다." });
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(null), 3000);
    }
  };

  // 전사 평일 A4 + 주말 BE 일괄 채우기
  const handleGlobalAutoFill = () => {
    if (!confirm("전사 사원의 당월 평일을 'A4 (09~18)', 주말을 'BE (휴무)'로 일괄 생성하시겠습니까?")) return;
    const days = new Date(currentYear, currentMonth, 0).getDate();
    setRows((prev) =>
      prev.map((r) => {
        const nextShifts = { ...r.shifts };
        for (let day = 1; day <= days; day++) {
          const dateObj = new Date(currentYear, currentMonth - 1, day);
          const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
          nextShifts[String(day)] = isWeekend ? "BE" : "A4";
        }
        return { ...r, shifts: nextShifts };
      })
    );
  };

  // 지난달 스케줄 패턴 가져오기 (복사)
  const handleCopyPrevMonth = () => {
    const prevM = currentMonth === 1 ? 12 : currentMonth - 1;
    const prevY = currentMonth === 1 ? currentYear - 1 : currentYear;
    const prevKey = `${prevY}-${String(prevM).padStart(2, "0")}`;
    const localData = localStorage.getItem(`beansheal_work_schedule_${prevKey}`);
    if (localData) {
      try {
        const parsed = JSON.parse(localData);
        setRows(parsed);
        alert(`${prevY}년 ${prevM}월 스케줄 패턴을 불러왔습니다!`);
        return;
      } catch (e) {}
    }
    alert(`${prevY}년 ${prevM}월 저장된 스케줄 데이터가 없습니다.`);
  };

  // 새 사원 추가
  const handleCreateEmployee = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmpName.trim()) return;
    const newId = String(Date.now());
    const days = new Date(currentYear, currentMonth, 0).getDate();
    const newRow: ScheduleEmployeeRow = {
      id: newId,
      name: newEmpName.trim(),
      group: newEmpGroup,
      shifts: {},
    };
    for (let day = 1; day <= days; day++) {
      const dateObj = new Date(currentYear, currentMonth - 1, day);
      if (dateObj.getDay() === 0 || dateObj.getDay() === 6) {
        newRow.shifts[String(day)] = "BE";
      } else {
        newRow.shifts[String(day)] = "A4";
      }
    }
    setRows((prev) => [...prev, newRow]);
    setNewEmpName("");
    setIsAddModalOpen(false);
  };

  const daysInMonth = useMemo(() => {
    return new Date(currentYear, currentMonth, 0).getDate();
  }, [currentYear, currentMonth]);

  const daysHeader = useMemo(() => {
    const arr = [];
    const dayNames = ["일", "월", "화", "수", "목", "금", "토"];
    for (let day = 1; day <= daysInMonth; day++) {
      const dateObj = new Date(currentYear, currentMonth - 1, day);
      const dayOfWeek = dateObj.getDay();
      const isSat = dayOfWeek === 6;
      const isSun = dayOfWeek === 0;
      arr.push({
        day,
        label: `${day}일`,
        dayName: dayNames[dayOfWeek],
        isSat,
        isSun,
      });
    }
    return arr;
  }, [currentYear, currentMonth, daysInMonth]);

  // 주간/월간 뷰에 따른 표시 날짜 필터링
  const visibleDaysHeader = useMemo(() => {
    if (viewMode === "주간") {
      const startDay = (selectedWeek - 1) * 7 + 1;
      const endDay = Math.min(selectedWeek * 7, daysInMonth);
      return daysHeader.filter((d) => d.day >= startDay && d.day <= endDay);
    }
    if (viewMode === "일간") {
      return daysHeader.filter((d) => d.day === 1); // 기본 1일
    }
    return daysHeader;
  }, [daysHeader, viewMode, selectedWeek, daysInMonth]);

  // 부서 목록 추출
  const departmentList = useMemo(() => {
    const set = new Set(rows.map((r) => r.group));
    return ["전체", ...Array.from(set)];
  }, [rows]);

  // 사원 필터링
  const filteredRows = useMemo(() => {
    let result = rows;
    if (selectedDeptFilter !== "전체") {
      result = result.filter((r) => r.group === selectedDeptFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((r) => r.name.toLowerCase().includes(q) || r.group.toLowerCase().includes(q));
    }
    return result;
  }, [rows, selectedDeptFilter, searchQuery]);

  // 스케줄 통계 (Dashboard Metrics)
  const metrics = useMemo(() => {
    let totalShifts = 0;
    let leaveCount = 0;
    let nightShiftCount = 0;

    rows.forEach((r) => {
      Object.values(r.shifts).forEach((code) => {
        if (!code) return;
        totalShifts++;
        if (["AL", "ML", "MO", "AO", "SL", "PL"].includes(code)) leaveCount++;
        if (["A9", "A10", "A11", "A12", "A13", "B9", "B10", "C9", "C10"].includes(code)) nightShiftCount++;
      });
    });

    return {
      totalEmployees: rows.length,
      leaveCount,
      nightShiftCount,
      attendanceRate: totalShifts > 0 ? (((totalShifts - leaveCount) / totalShifts) * 100).toFixed(1) : "100.0",
    };
  }, [rows]);

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
    let csv = `사원명,부서,` + visibleDaysHeader.map((d) => `${d.label}(${d.dayName})`).join(",") + "\n";
    filteredRows.forEach((r) => {
      const line = [`"${r.name}"`, `"${r.group}"`, ...visibleDaysHeader.map((d) => `"${r.shifts[String(d.day)] || ""}"`)].join(",");
      csv += line + "\n";
    });
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `근무스케줄_${yearMonthKey}.csv`;
    link.click();
  };

  return (
    <div className="w-full bg-[#F8FAFC] dark:bg-slate-950 p-4 sm:p-6 rounded-[24px] font-sans border border-slate-200/80 dark:border-slate-800 shadow-2xl space-y-6">
      {/* 🌟 1. 상단 타이틀 & 글로벌 컨트롤 바 */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-white font-black text-lg shadow-md">
            K
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
              근무 및 근무조 스케줄 대시보드
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 font-bold border border-blue-200">
                실시간 편집 지원
              </span>
            </h1>
            <p className="text-xs text-slate-400 font-medium">생산 · 품질 · 영업 · 경영 지원 인력 통합 스케줄링 관리 시스템</p>
          </div>
        </div>

        {/* 검색 및 상단 액션 버튼 그룹 */}
        <div className="flex items-center flex-wrap gap-2.5">
          <div className="relative">
            <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="사원명 / 부서 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-2 text-xs bg-slate-100 dark:bg-slate-800 border-none rounded-full text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-blue-600 w-40 sm:w-56 font-medium"
            />
          </div>

          <button
            onClick={() => setIsAddModalOpen(true)}
            className="px-3.5 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-xl transition-all border border-slate-200 dark:border-slate-700"
          >
            + 사원 등록
          </button>

          <button
            onClick={handleGlobalAutoFill}
            className="px-3.5 py-2 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-xl transition-all border border-blue-200"
            title="평일 A4 / 주말 BE 일괄 채우기"
          >
            ⚡ 자동 일괄채우기
          </button>

          <button
            onClick={handleCopyPrevMonth}
            className="px-3.5 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-xl transition-all border border-slate-200 dark:border-slate-700"
            title="지난 달 스케줄 가져오기"
          >
            📋 전월 패턴 복사
          </button>

          <button
            onClick={handleExportCSV}
            className="px-3.5 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-xl transition-all border border-slate-200 dark:border-slate-700"
          >
            엑셀 다운로드 (CSV) 📥
          </button>

          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 text-xs font-bold text-white bg-[#0047FF] hover:bg-blue-700 rounded-xl shadow-md transition-all disabled:opacity-50 flex items-center gap-2"
          >
            {saving ? "저장 중..." : "스케줄 저장 & 게시 🚀"}
          </button>
        </div>
      </div>

      {/* 🌟 2. 요약 메트릭스 카드 (Metrics Dashboard) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-2xs">
          <div className="text-[11px] font-bold text-slate-400">총 관리 사원수</div>
          <div className="text-xl font-black text-slate-900 dark:text-white mt-0.5">{metrics.totalEmployees}명</div>
        </div>
        <div className="bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-2xs">
          <div className="text-[11px] font-bold text-slate-400">당월 연차/휴가 건수</div>
          <div className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-0.5">{metrics.leaveCount}건</div>
        </div>
        <div className="bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-2xs">
          <div className="text-[11px] font-bold text-slate-400">야간/철야 잔업 건수</div>
          <div className="text-xl font-black text-indigo-600 dark:text-indigo-400 mt-0.5">{metrics.nightShiftCount}건</div>
        </div>
        <div className="bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-2xs">
          <div className="text-[11px] font-bold text-slate-400">평균 근무 출근율</div>
          <div className="text-xl font-black text-blue-600 dark:text-blue-400 mt-0.5">{metrics.attendanceRate}%</div>
        </div>
      </div>

      {/* 🌟 3. 년월 선택, 부서 필터 탭 & 뷰 전환 컨트롤 */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* 년/월 선택 및 네비게이션 */}
        <div className="flex items-center space-x-3">
          <button
            onClick={() => {
              if (currentMonth === 1) { setCurrentYear((prev) => prev - 1); setCurrentMonth(12); }
              else setCurrentMonth((prev) => prev - 1);
            }}
            className="p-2 bg-white dark:bg-slate-900 hover:bg-slate-100 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 transition-colors shadow-2xs font-bold"
          >
            ◀
          </button>
          <div>
            <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              {currentYear}년 {currentMonth}월
            </h2>
            <p className="text-xs text-slate-400 font-medium">전체 부서 및 근로자 실시간 스케줄 현황</p>
          </div>
          <button
            onClick={() => {
              if (currentMonth === 12) { setCurrentYear((prev) => prev + 1); setCurrentMonth(1); }
              else setCurrentMonth((prev) => prev + 1);
            }}
            className="p-2 bg-white dark:bg-slate-900 hover:bg-slate-100 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 transition-colors shadow-2xs font-bold"
          >
            ▶
          </button>
        </div>

        {/* 부서 필터 칩 & 뷰 전환 (월간 | 주간 | 일간) */}
        <div className="flex items-center flex-wrap gap-3">
          {/* 부서 필터 칩 */}
          <div className="flex items-center bg-slate-200/70 dark:bg-slate-800/70 p-1 rounded-xl gap-1 text-xs font-bold">
            {departmentList.map((dept) => (
              <button
                key={dept}
                onClick={() => setSelectedDeptFilter(dept)}
                className={`px-3 py-1 rounded-lg transition-all ${
                  selectedDeptFilter === dept
                    ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs font-extrabold"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                }`}
              >
                {dept}
              </button>
            ))}
          </div>

          {/* 뷰 전환 모드 (월간 | 주간 | 일간) */}
          <div className="bg-slate-200/70 dark:bg-slate-800/70 p-1 rounded-xl flex items-center gap-1 text-xs font-bold">
            {(["월간", "주간", "일간"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-3.5 py-1 rounded-lg transition-all ${
                  viewMode === mode
                    ? "bg-[#0047FF] text-white shadow-xs font-extrabold"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                }`}
              >
                {mode}
              </button>
            ))}
          </div>

          {viewMode === "주간" && (
            <select
              value={selectedWeek}
              onChange={(e) => setSelectedWeek(Number(e.target.value))}
              className="px-3 py-1.5 text-xs font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-800 dark:text-white"
            >
              <option value={1}>1주차 (1일~7일)</option>
              <option value={2}>2주차 (8일~14일)</option>
              <option value={3}>3주차 (15일~21일)</option>
              <option value={4}>4주차 (22일~28일)</option>
              <option value={5}>5주차 (29일~말일)</option>
            </select>
          )}
        </div>
      </div>

      {saveMsg && (
        <div
          className={`px-4 py-2.5 text-xs font-bold rounded-xl text-center shadow-xs ${
            saveMsg.type === "success"
              ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
              : "bg-red-500/10 text-red-600 border border-red-500/20"
          }`}
        >
          {saveMsg.text}
        </div>
      )}

      {/* 🌟 4. 스케줄 그리드 테이블 */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 overflow-hidden shadow-sm">
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-xs text-center border-collapse">
            <thead>
              <tr className="bg-[#F8FAFC] dark:bg-slate-800/90 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">
                <th className="sticky left-0 z-20 bg-[#F8FAFC] dark:bg-slate-800 px-4 py-3.5 border-r border-slate-200 dark:border-slate-700 text-left font-bold min-w-[200px]">
                  사원명 / 부서
                </th>
                {visibleDaysHeader.map((d) => (
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
                    <div className="text-[12px] font-black">{d.day}일</div>
                    <div className="text-[10px] font-semibold opacity-75">{d.dayName}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={visibleDaysHeader.length + 1} className="py-12 text-slate-400 font-medium">
                    검색 결과 또는 등록된 사원 스케줄이 없습니다.
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
                      {visibleDaysHeader.map((d) => {
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

      {/* 🌟 5. 셀 빠른 편집 모달 */}
      {editingCell && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 max-w-sm w-full shadow-2xl space-y-4 animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                  근무 코드 변경: <span className="text-blue-600 dark:text-blue-400">{editingCell.empName}</span>
                </h3>
                <p className="text-xs text-slate-400">
                  {currentMonth}월 {editingCell.day}일 근무 상태
                </p>
              </div>
              <button onClick={() => setEditingCell(null)} className="text-slate-400 hover:text-slate-600 font-bold">
                ✕
              </button>
            </div>

            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1 scrollbar-thin text-xs">
              <div>
                <div className="text-[11px] font-bold text-slate-400 mb-1.5">휴무 및 휴가 코드</div>
                <div className="grid grid-cols-3 gap-1.5">
                  {["BE", "AL", "MO", "AO", "SL", "BT", "RW", "?"].map((cd) => {
                    const info = getShiftInfo(cd);
                    return (
                      <button
                        key={cd}
                        onClick={() => { updateCellValue(editingCell.empId, editingCell.day, cd); setEditingCell(null); }}
                        className={`p-2 rounded-xl text-center font-bold text-xs transition-all ${info.badgeClass}`}
                      >
                        <div>{cd}</div>
                        <div className="text-[9px] opacity-80 font-normal">{info.name.split(" ")[0]}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="text-[11px] font-bold text-slate-400 mb-1.5">표준 근무조 (A1-A13)</div>
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
                셀 초기화
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🌟 6. 새 사원 등록 모달 */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <form onSubmit={handleCreateEmployee} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 max-w-sm w-full shadow-2xl space-y-4">
            <h3 className="font-bold text-slate-900 dark:text-white text-base">새 사원 등록</h3>
            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">사원 성명</label>
                <input
                  type="text"
                  required
                  placeholder="예: 홍길동"
                  value={newEmpName}
                  onChange={(e) => setNewEmpName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">소속 부서 / 팀</label>
                <select
                  value={newEmpGroup}
                  onChange={(e) => setNewEmpGroup(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-bold"
                >
                  <option value="생산1팀">생산1팀</option>
                  <option value="생산2팀">생산2팀</option>
                  <option value="품질팀">품질팀</option>
                  <option value="경영지원팀">경영지원팀</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 rounded-xl"
              >
                취소
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl"
              >
                등록하기
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 🌟 7. 하단 3개 요약 레전드 카드 (Kinetic 레퍼런스 스타일) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: 표준 주간 근무조 (A1-A13) */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs space-y-3">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider">
            표준 주간 근무조 (A1 - A13)
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

        {/* Card 2: 연장 및 잔업 근무조 (B, C, D) */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs space-y-3">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider">
            연장 및 잔업 근무조 (B, C, D)
          </h3>
          <div className="space-y-2 text-xs">
            <div className="p-3 bg-purple-50 dark:bg-purple-950/30 rounded-xl border border-purple-100 dark:border-purple-900/50 flex items-center space-x-2 font-semibold text-purple-900 dark:text-purple-300">
              <span className="w-2.5 h-2.5 rounded-full bg-purple-500 shrink-0"></span>
              <span>B 계열: 10시간 연장 근무조</span>
            </div>
            <div className="p-3 bg-indigo-50 dark:bg-indigo-950/30 rounded-xl border border-indigo-100 dark:border-indigo-900/50 flex items-center space-x-2 font-semibold text-indigo-900 dark:text-indigo-300">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 shrink-0"></span>
              <span>C 계열: 11시간 특근 근무조</span>
            </div>
            <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-xl border border-blue-100 dark:border-blue-900/50 flex items-center space-x-2 font-semibold text-blue-900 dark:text-blue-300">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-600 shrink-0"></span>
              <span>D 계열: 12시간 야간 교대조</span>
            </div>
          </div>
        </div>

        {/* Card 3: 휴무 및 휴가 현황 코드 */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs space-y-3">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider">
            휴무 및 근태 코드 기준
          </h3>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2.5 bg-[#18181B] text-white rounded-xl font-bold flex items-center justify-between">
              <span>BE: 휴무 (Off)</span>
            </div>
            <div className="p-2.5 bg-[#DCFCE7] text-[#15803D] rounded-xl font-bold flex items-center justify-between">
              <span>AL: 연차 (Leave)</span>
            </div>
            <div className="p-2.5 bg-[#FEE2E2] text-[#B91C1C] rounded-xl font-bold flex items-center justify-between">
              <span>SL: 병가 (Sick)</span>
            </div>
            <div className="p-2.5 bg-[#F3F4F6] text-[#374151] rounded-xl font-bold flex items-center justify-between">
              <span>MO: 오전반차</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

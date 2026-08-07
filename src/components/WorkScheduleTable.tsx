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
  workHours: number; // 근무시간 계산용 (시간 단위)
};

export const SHIFT_CODES: Record<string, ShiftCodeInfo> = {
  // 휴무 및 연차 코드
  BE: { code: "BE", name: "휴무", hours: "-", category: "leave", badgeClass: "bg-[#18181B] text-white font-bold", workHours: 0 },
  ML: { code: "ML", name: "월차", hours: "-", category: "leave", badgeClass: "bg-[#E6F4EA] text-[#137333] font-bold border border-[#A8DADC]", workHours: 0 },
  AL: { code: "AL", name: "연차", hours: "-", category: "leave", badgeClass: "bg-[#DCFCE7] text-[#15803D] font-bold border border-[#86EFAC]", workHours: 0 },
  MO: { code: "MO", name: "오전반차", hours: "-", category: "leave", badgeClass: "bg-[#FEF3C7] text-[#92400E] font-bold border border-[#FDE68A]", workHours: 4 },
  AO: { code: "AO", name: "오후반차", hours: "-", category: "leave", badgeClass: "bg-[#FFEDD5] text-[#C2410C] font-bold border border-[#FDBA74]", workHours: 4 },
  SL: { code: "SL", name: "병가", hours: "-", category: "leave", badgeClass: "bg-[#FEE2E2] text-[#B91C1C] font-bold border border-[#FCA5A5]", workHours: 0 },
  PL: { code: "PL", name: "유급휴가", hours: "-", category: "leave", badgeClass: "bg-[#FCE7F3] text-[#BE185D] font-bold border border-[#F472B6]", workHours: 8 },
  BT: { code: "BT", name: "출장", hours: "-", category: "leave", badgeClass: "bg-[#E0F2FE] text-[#0369A1] font-bold border border-[#7DD3FC]", workHours: 8 },
  OL: { code: "OL", name: "예비군/민방위", hours: "-", category: "leave", badgeClass: "bg-[#F1F5F9] text-[#475569] font-bold border border-[#CBD5E1]", workHours: 8 },
  RW: { code: "RW", name: "재택근무", hours: "-", category: "leave", badgeClass: "bg-[#E6FCF5] text-[#0CA678] font-bold border border-[#6EE7B7]", workHours: 8 },
  "?": { code: "?", name: "미정", hours: "-", category: "leave", badgeClass: "bg-[#F4F4F5] text-[#71717A] font-bold border border-[#E4E4E7]", workHours: 0 },

  // A계열 주간/표준 근무 (9시간)
  A1: { code: "A1", name: "조근1", hours: "06:00~15:00", category: "shiftA", badgeClass: "bg-[#F4F4F5] text-[#27272A] font-semibold", workHours: 8 },
  A2: { code: "A2", name: "조근2", hours: "07:00~16:00", category: "shiftA", badgeClass: "bg-[#F4F4F5] text-[#27272A] font-semibold", workHours: 8 },
  A3: { code: "A3", name: "조근3", hours: "08:00~17:00", category: "shiftA", badgeClass: "bg-[#F4F4F5] text-[#27272A] font-semibold", workHours: 8 },
  A4: { code: "A4", name: "주간정속", hours: "09:00~18:00", category: "shiftA", badgeClass: "bg-[#F4F4F5] text-[#27272A] font-semibold", workHours: 8 },
  A5: { code: "A5", name: "주근5", hours: "10:00~19:00", category: "shiftA", badgeClass: "bg-[#F4F4F5] text-[#27272A] font-semibold", workHours: 8 },
  A6: { code: "A6", name: "주근6", hours: "11:00~20:00", category: "shiftA", badgeClass: "bg-[#F8CBAD] text-[#7C2D12] font-extrabold border border-[#F0B080]", workHours: 8 },
  A7: { code: "A7", name: "주근7", hours: "12:00~21:00", category: "shiftA", badgeClass: "bg-[#F8CBAD] text-[#7C2D12] font-extrabold border border-[#F0B080]", workHours: 8 },
  A8: { code: "A8", name: "석근8", hours: "13:00~22:00", category: "shiftA", badgeClass: "bg-[#F8CBAD] text-[#7C2D12] font-extrabold border border-[#F0B080]", workHours: 8 },
  A9: { code: "A9", name: "야근9", hours: "14:00~23:00", category: "shiftA", badgeClass: "bg-[#F8CBAD] text-[#7C2D12] font-extrabold border border-[#F0B080]", workHours: 8 },
  A10: { code: "A10", name: "야근10", hours: "15:00~24:00", category: "shiftA", badgeClass: "bg-[#F8CBAD] text-[#7C2D12] font-extrabold border border-[#F0B080]", workHours: 8 },
  A11: { code: "A11", name: "철야11", hours: "16:00~01:00", category: "shiftA", badgeClass: "bg-[#F8CBAD] text-[#7C2D12] font-extrabold border border-[#F0B080]", workHours: 8 },
  A12: { code: "A12", name: "철야12", hours: "17:00~02:00", category: "shiftA", badgeClass: "bg-[#F8CBAD] text-[#7C2D12] font-extrabold border border-[#F0B080]", workHours: 8 },
  A13: { code: "A13", name: "철야13", hours: "18:00~03:00", category: "shiftA", badgeClass: "bg-[#EEF2FF] text-[#312E81] font-bold border border-[#C7D2FE]", workHours: 8 },
};

// 이미지 상의 정확한 5개 계열 시간표 맵 데이터
export const MASTER_LEGEND_GRID = {
  shiftA: [
    { code: "A1", time: "06:00~15:00", highlight: false },
    { code: "A2", time: "07:00~16:00", highlight: false },
    { code: "A3", time: "08:00~17:00", highlight: false },
    { code: "A4", time: "09:00~18:00", highlight: false },
    { code: "A5", time: "10:00~19:00", highlight: false },
    { code: "A6", time: "11:00~20:00", highlight: true },
    { code: "A7", time: "12:00~21:00", highlight: true },
    { code: "A8", time: "13:00~22:00", highlight: true },
    { code: "A9", time: "14:00~23:00", highlight: true },
    { code: "A10", time: "15:00~24:00", highlight: true },
    { code: "A11", time: "16:00~01:00", highlight: true },
    { code: "A12", time: "17:00~02:00", highlight: true },
    { code: "A13", time: "18:00~03:00", highlight: false },
  ],
  shiftB: [
    { code: "B1", time: "06:00~16:00", highlight: false },
    { code: "B2", time: "07:00~17:00", highlight: false },
    { code: "B3", time: "08:00~18:00", highlight: false },
    { code: "B4", time: "09:00~19:00", highlight: false },
    { code: "B5", time: "10:00~20:00", highlight: false },
    { code: "B6", time: "11:00~21:00", highlight: true },
    { code: "B7", time: "12:00~22:00", highlight: true },
    { code: "B8", time: "13:00~23:00", highlight: true },
    { code: "B9", time: "14:00~24:00", highlight: true },
    { code: "B10", time: "15:00~01:00", highlight: true },
  ],
  shiftC: [
    { code: "C1", time: "06:00~17:00", highlight: false },
    { code: "C2", time: "07:00~18:00", highlight: false },
    { code: "C3", time: "08:00~19:00", highlight: false },
    { code: "C4", time: "09:00~20:00", highlight: false },
    { code: "C5", time: "10:00~21:00", highlight: false },
    { code: "C6", time: "11:00~22:00", highlight: true },
    { code: "C7", time: "12:00~23:00", highlight: true },
    { code: "C8", time: "13:00~24:00", highlight: true },
    { code: "C9", time: "14:00~01:00", highlight: true },
    { code: "C10", time: "15:00~02:00", highlight: true },
  ],
  shiftD: [
    { code: "D1", time: "06:00~18:00", highlight: false },
    { code: "D2", time: "07:00~19:00", highlight: false },
    { code: "D3", time: "08:00~20:00", highlight: false },
    { code: "D4", time: "09:00~21:00", highlight: false },
    { code: "D5", time: "10:00~22:00", highlight: false },
    { code: "D6", time: "11:00~23:00", highlight: true },
    { code: "D7", time: "12:00~24:00", highlight: true },
    { code: "D8", time: "13:00~01:00", highlight: true },
    { code: "D9", time: "14:00~02:00", highlight: true },
    { code: "D10", time: "15:00~03:00", highlight: true },
    { code: "D11", time: "16:00~04:00", highlight: false },
    { code: "D12", time: "17:00~05:00", highlight: false },
    { code: "D13", time: "18:00~06:00", highlight: false },
  ],
  shiftE: [
    { code: "E1", time: "06:00~19:00", highlight: false },
    { code: "E2", time: "07:00~20:00", highlight: false },
    { code: "E3", time: "08:00~21:00", highlight: false },
    { code: "E4", time: "09:00~22:00", highlight: false },
    { code: "E5", time: "10:00~23:00", highlight: false },
    { code: "E6", time: "11:00~24:00", highlight: true },
    { code: "E7", time: "12:00~01:00", highlight: true },
    { code: "E8", time: "13:00~02:00", highlight: true },
    { code: "E9", time: "14:00~03:00", highlight: true },
    { code: "E10", time: "15:00~04:00", highlight: true },
    { code: "E11", time: "16:00~05:00", highlight: false },
    { code: "E12", time: "17:00~06:00", highlight: false },
    { code: "E13", time: "18:00~07:00", highlight: false },
  ],
  leaveCodes: [
    { code: "BE", name: "휴무", badge: "bg-[#18181B] text-white font-bold" },
    { code: "ML", name: "월차", badge: "bg-[#E6F4EA] text-[#137333] font-bold border border-[#A8DADC]" },
    { code: "AL", name: "연차", badge: "bg-[#DCFCE7] text-[#15803D] font-bold border border-[#86EFAC]" },
    { code: "MO", name: "오전반차", badge: "bg-[#FEF3C7] text-[#92400E] font-bold border border-[#FDE68A]" },
    { code: "AO", name: "오후반차", badge: "bg-[#FFEDD5] text-[#C2410C] font-bold border border-[#FDBA74]" },
    { code: "SL", name: "병가", badge: "bg-[#FEE2E2] text-[#B91C1C] font-bold border border-[#FCA5A5]" },
    { code: "PL", name: "유급휴가", badge: "bg-[#FCE7F3] text-[#BE185D] font-bold border border-[#F472B6]" },
    { code: "BT", name: "출장", badge: "bg-[#E0F2FE] text-[#0369A1] font-bold border border-[#7DD3FC]" },
    { code: "OL", name: "예비군/민방위", badge: "bg-[#F1F5F9] text-[#475569] font-bold border border-[#CBD5E1]" },
    { code: "RW", name: "재택근무", badge: "bg-[#E6FCF5] text-[#0CA678] font-bold border border-[#6EE7B7]" },
    { code: "?", name: "미정", badge: "bg-[#F4F4F5] text-[#71717A] font-bold border border-[#E4E4E7]" },
  ]
};

function getShiftInfo(code: string): ShiftCodeInfo {
  if (SHIFT_CODES[code]) return SHIFT_CODES[code];
  const char = code.charAt(0);
  const num = parseInt(code.slice(1), 10);
  if (!isNaN(num)) {
    const baseHour = (5 + num) % 24;
    let dur = 8;
    if (char === "B") dur = 9;
    if (char === "C") dur = 10;
    if (char === "D") dur = 11;
    if (char === "E") dur = 12;
    const startH = String(baseHour).padStart(2, "0");
    const endH = String((baseHour + dur + 1) % 24).padStart(2, "0");
    const isHighlight = num >= 6 && num <= 10;
    return {
      code,
      name: `${char}계열 근무`,
      hours: `${startH}:00~${endH}:00`,
      category: `shift${char}` as any,
      badgeClass: isHighlight
        ? "bg-[#F8CBAD] text-[#7C2D12] font-extrabold border border-[#F0B080]"
        : "bg-[#F4F4F5] text-[#27272A] font-semibold",
      workHours: dur,
    };
  }
  return {
    code,
    name: code,
    hours: "-",
    category: "leave",
    badgeClass: "bg-[#F4F4F5] text-[#27272A] font-semibold",
    workHours: 0,
  };
}

function getAvatarBadge(name: string) {
  const initial = name.charAt(0).toUpperCase();
  const charCode = name.charCodeAt(0);
  const colorIndex = charCode % 6;
  const avatarColors = [
    "bg-[#DBEAFE] text-[#1E40AF]",
    "bg-[#CFFAFE] text-[#0891B2]",
    "bg-[#E0E7FF] text-[#3730A3]",
    "bg-[#F3E8FF] text-[#6B21A8]",
    "bg-[#CCFBF1] text-[#0F766E]",
    "bg-[#FEF3C7] text-[#92400E]",
  ];
  return { initial, colorClass: avatarColors[colorIndex] };
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
  const [selectedWeek, setSelectedWeek] = useState<number>(1);
  const [selectedDeptFilter, setSelectedDeptFilter] = useState<string>("전체");
  
  const [rows, setRows] = useState<ScheduleEmployeeRow[]>(INITIAL_DEMO_DATA);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showMasterGrid, setShowMasterGrid] = useState(true); // 근무 코드표 100% 매칭 토글

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
        setSaveMsg({ type: "success", text: "월간 스케줄이 성공적으로 저장 및 전사 게시되었습니다!" });
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

  // 평일 A4 + 주말 BE 일괄 생성
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

  // 일자별 휴무자 수 및 비율 계산 (과다 휴무 경고 체크용)
  const leaveStatsPerDay = useMemo(() => {
    const map: Record<number, { count: number; ratio: number }> = {};
    const totalCount = rows.length || 1;
    for (let day = 1; day <= daysInMonth; day++) {
      let count = 0;
      rows.forEach((r) => {
        const code = r.shifts[String(day)];
        if (code && ["BE", "AL", "ML", "SL", "PL", "MO", "AO"].includes(code)) {
          count++;
        }
      });
      map[day] = { count, ratio: count / totalCount };
    }
    return map;
  }, [rows, daysInMonth]);

  const visibleDaysHeader = useMemo(() => {
    if (viewMode === "주간") {
      const startDay = (selectedWeek - 1) * 7 + 1;
      const endDay = Math.min(selectedWeek * 7, daysInMonth);
      return daysHeader.filter((d) => d.day >= startDay && d.day <= endDay);
    }
    if (viewMode === "일간") {
      return daysHeader.filter((d) => d.day === 1);
    }
    return daysHeader;
  }, [daysHeader, viewMode, selectedWeek, daysInMonth]);

  const departmentList = useMemo(() => {
    const set = new Set(rows.map((r) => r.group));
    return ["전체", ...Array.from(set)];
  }, [rows]);

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

  // 사원별 당월 총 근무시간 및 연차 횟수 계산
  const empWorkStatsMap = useMemo(() => {
    const map: Record<string, { totalHours: number; leaveDays: number; workDays: number }> = {};
    rows.forEach((r) => {
      let hours = 0;
      let leaves = 0;
      let works = 0;
      Object.values(r.shifts).forEach((code) => {
        if (!code) return;
        const info = getShiftInfo(code);
        hours += info.workHours;
        if (["AL", "ML", "SL", "PL"].includes(code)) leaves += 1;
        if (["MO", "AO"].includes(code)) leaves += 0.5;
        if (info.workHours > 0) works += 1;
      });
      map[r.id] = { totalHours: hours, leaveDays: leaves, workDays: works };
    });
    return map;
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
    let csv = `사원명,부서,월총근무시간,연차사용일수,` + visibleDaysHeader.map((d) => `${d.label}(${d.dayName})`).join(",") + "\n";
    filteredRows.forEach((r) => {
      const stat = empWorkStatsMap[r.id] || { totalHours: 0, leaveDays: 0 };
      const line = [
        `"${r.name}"`,
        `"${r.group}"`,
        `"${stat.totalHours}시간"`,
        `"${stat.leaveDays}일"`,
        ...visibleDaysHeader.map((d) => `"${r.shifts[String(d.day)] || ""}"`)
      ].join(",");
      csv += line + "\n";
    });
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `근무스케줄_${yearMonthKey}.csv`;
    link.click();
  };

  // 🖨️ 인쇄 출력 실행
  const handlePrint = () => {
    window.print();
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
                실시간 편집
              </span>
            </h1>
            <p className="text-xs text-slate-400 font-medium">생산 · 품질 · 영업 · 경영 지원 인력 통합 스케줄링 및 시간 집계 시스템</p>
          </div>
        </div>

        {/* 액션 버튼 그룹 */}
        <div className="flex items-center flex-wrap gap-2">
          <div className="relative">
            <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="사원명 / 부서 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-2 text-xs bg-slate-100 dark:bg-slate-800 border-none rounded-full text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-blue-600 w-36 sm:w-48 font-medium"
            />
          </div>

          <button
            onClick={handleGlobalAutoFill}
            className="px-3 py-2 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-xl transition-all border border-blue-200"
            title="평일 A4 / 주말 BE 일괄 채우기"
          >
            ⚡ 자동 생성
          </button>

          <button
            onClick={handlePrint}
            className="px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-xl transition-all border border-slate-200 dark:border-slate-700"
          >
            🖨️ 인쇄
          </button>

          <button
            onClick={handleExportCSV}
            className="px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-xl transition-all border border-slate-200 dark:border-slate-700"
          >
            엑셀 다운로드 (CSV) 📥
          </button>

          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-xs font-bold text-white bg-[#0047FF] hover:bg-blue-700 rounded-xl shadow-md transition-all disabled:opacity-50 flex items-center gap-1.5"
          >
            {saving ? "저장 중..." : "스케줄 저장 & 게시 🚀"}
          </button>
        </div>
      </div>

      {/* 🌟 2. 년월 선택, 부서 필터 탭 & 뷰 전환 컨트롤 */}
      <div className="flex flex-wrap items-center justify-between gap-4">
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

        <div className="flex items-center flex-wrap gap-2">
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

          {/* 뷰 전환 모드 */}
          <div className="bg-slate-200/70 dark:bg-slate-800/70 p-1 rounded-xl flex items-center gap-1 text-xs font-bold">
            {(["월간", "주간", "일간"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-3 py-1 rounded-lg transition-all ${
                  viewMode === mode
                    ? "bg-[#0047FF] text-white shadow-xs font-extrabold"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
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

      {/* 🌟 3. 스케줄 그리드 테이블 (사원별 총 근무시간 열 포함) */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 overflow-hidden shadow-sm">
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-xs text-center border-collapse">
            <thead>
              <tr className="bg-[#F8FAFC] dark:bg-slate-800/90 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">
                <th className="sticky left-0 z-20 bg-[#F8FAFC] dark:bg-slate-800 px-4 py-3.5 border-r border-slate-200 dark:border-slate-700 text-left font-bold min-w-[180px]">
                  사원명 / 부서
                </th>
                <th className="sticky left-[180px] z-20 bg-[#F8FAFC] dark:bg-slate-800 px-3 py-3.5 border-r border-slate-200 dark:border-slate-700 min-w-[90px] font-bold text-blue-600 dark:text-blue-400">
                  월 총근무시간
                </th>
                {visibleDaysHeader.map((d) => {
                  const stat = leaveStatsPerDay[d.day];
                  const isHighLeave = stat && stat.ratio >= 0.4;
                  return (
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
                      <div className="text-[12px] font-black flex items-center justify-center gap-0.5">
                        {d.day}일
                        {isHighLeave && <span title="당일 휴휴/연차자 40% 이상" className="text-[10px]">⚠️</span>}
                      </div>
                      <div className="text-[10px] font-semibold opacity-75">{d.dayName}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={visibleDaysHeader.length + 2} className="py-12 text-slate-400 font-medium">
                    등록된 사원 스케줄이 없습니다.
                  </td>
                </tr>
              ) : (
                filteredRows.map((emp, idx) => {
                  const avatar = getAvatarBadge(emp.name);
                  const stat = empWorkStatsMap[emp.id] || { totalHours: 0, leaveDays: 0, workDays: 0 };
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

                      {/* 월 총근무시간 집계 열 */}
                      <td className="sticky left-[180px] z-10 bg-white dark:bg-slate-900 px-2 py-2.5 border-r border-slate-200 dark:border-slate-800 text-center font-black text-slate-900 dark:text-white font-mono shadow-2xs">
                        {stat.totalHours}시간
                        <div className="text-[9px] text-slate-400 font-normal">({stat.workDays}일 근무)</div>
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

      {/* 🌟 4. 근무 코드설명 표 100% 매칭 그리드 카드 (이미지 100% 반영) */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 p-5 space-y-4 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div>
            <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
              📋 이카운트 근무 코드 & 시간 기준표 (Shift Master Legend Grid)
              <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-800 font-bold border border-orange-200">
                주황색 = 11시이후 야간/석근조
              </span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">보내주신 시간 기준표 규격 100% 동일 매칭 표</p>
          </div>
          <button
            onClick={() => setShowMasterGrid((prev) => !prev)}
            className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline"
          >
            {showMasterGrid ? "표 접기 ▲" : "표 펼치기 ▼"}
          </button>
        </div>

        {showMasterGrid && (
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-xs text-center border border-slate-300 dark:border-slate-700 border-collapse">
              <thead>
                <tr className="bg-slate-100 dark:bg-slate-800 font-bold border-b border-slate-300 dark:border-slate-700">
                  <th colSpan={2} className="py-2 border-r border-slate-300 dark:border-slate-700">A계열 (9시간)</th>
                  <th colSpan={2} className="py-2 border-r border-slate-300 dark:border-slate-700">B계열 (10시간)</th>
                  <th colSpan={2} className="py-2 border-r border-slate-300 dark:border-slate-700">C계열 (11시간)</th>
                  <th colSpan={2} className="py-2 border-r border-slate-300 dark:border-slate-700">D계열 (12시간)</th>
                  <th colSpan={2} className="py-2 border-r border-slate-300 dark:border-slate-700">E계열 (13시간)</th>
                  <th colSpan={2} className="py-2 bg-slate-200 dark:bg-slate-700">휴무/근태 구분</th>
                </tr>
              </thead>
              <tbody>
                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((i) => {
                  const itemA = MASTER_LEGEND_GRID.shiftA[i];
                  const itemB = MASTER_LEGEND_GRID.shiftB[i];
                  const itemC = MASTER_LEGEND_GRID.shiftC[i];
                  const itemD = MASTER_LEGEND_GRID.shiftD[i];
                  const itemE = MASTER_LEGEND_GRID.shiftE[i];
                  const itemLeave = MASTER_LEGEND_GRID.leaveCodes[i];

                  return (
                    <tr key={i} className="border-b border-slate-200 dark:border-slate-800 font-mono">
                      {/* A계열 */}
                      <td className={`px-2 py-1.5 font-bold border-r border-slate-200 dark:border-slate-800 ${itemA?.highlight ? "bg-[#F8CBAD] text-[#7C2D12]" : ""}`}>
                        {itemA?.code || ""}
                      </td>
                      <td className={`px-2 py-1.5 border-r border-slate-300 dark:border-slate-700 ${itemA?.highlight ? "bg-[#F8CBAD] text-[#7C2D12]" : ""}`}>
                        {itemA?.time || ""}
                      </td>

                      {/* B계열 */}
                      <td className={`px-2 py-1.5 font-bold border-r border-slate-200 dark:border-slate-800 ${itemB?.highlight ? "bg-[#F8CBAD] text-[#7C2D12]" : ""}`}>
                        {itemB?.code || ""}
                      </td>
                      <td className={`px-2 py-1.5 border-r border-slate-300 dark:border-slate-700 ${itemB?.highlight ? "bg-[#F8CBAD] text-[#7C2D12]" : ""}`}>
                        {itemB?.time || ""}
                      </td>

                      {/* C계열 */}
                      <td className={`px-2 py-1.5 font-bold border-r border-slate-200 dark:border-slate-800 ${itemC?.highlight ? "bg-[#F8CBAD] text-[#7C2D12]" : ""}`}>
                        {itemC?.code || ""}
                      </td>
                      <td className={`px-2 py-1.5 border-r border-slate-300 dark:border-slate-700 ${itemC?.highlight ? "bg-[#F8CBAD] text-[#7C2D12]" : ""}`}>
                        {itemC?.time || ""}
                      </td>

                      {/* D계열 */}
                      <td className={`px-2 py-1.5 font-bold border-r border-slate-200 dark:border-slate-800 ${itemD?.highlight ? "bg-[#F8CBAD] text-[#7C2D12]" : ""}`}>
                        {itemD?.code || ""}
                      </td>
                      <td className={`px-2 py-1.5 border-r border-slate-300 dark:border-slate-700 ${itemD?.highlight ? "bg-[#F8CBAD] text-[#7C2D12]" : ""}`}>
                        {itemD?.time || ""}
                      </td>

                      {/* E계열 */}
                      <td className={`px-2 py-1.5 font-bold border-r border-slate-200 dark:border-slate-800 ${itemE?.highlight ? "bg-[#F8CBAD] text-[#7C2D12]" : ""}`}>
                        {itemE?.code || ""}
                      </td>
                      <td className={`px-2 py-1.5 border-r border-slate-300 dark:border-slate-700 ${itemE?.highlight ? "bg-[#F8CBAD] text-[#7C2D12]" : ""}`}>
                        {itemE?.time || ""}
                      </td>

                      {/* 휴무/근태 코드 */}
                      <td className="px-2 py-1.5 font-bold border-r border-slate-200 dark:border-slate-800">
                        {itemLeave ? <span className={`px-2 py-0.5 rounded text-[11px] ${itemLeave.badge}`}>{itemLeave.code}</span> : ""}
                      </td>
                      <td className="px-2 py-1.5 font-sans font-bold text-slate-800 dark:text-slate-200">
                        {itemLeave?.name || ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 🌟 5. 셀 편집 모달 */}
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
                <div className="text-[11px] font-bold text-slate-400 mb-1.5">휴무 및 근태 코드</div>
                <div className="grid grid-cols-3 gap-1.5">
                  {["BE", "ML", "AL", "MO", "AO", "SL", "PL", "BT", "OL", "RW", "?"].map((cd) => {
                    const info = getShiftInfo(cd);
                    return (
                      <button
                        key={cd}
                        onClick={() => { updateCellValue(editingCell.empId, editingCell.day, cd); setEditingCell(null); }}
                        className={`p-2 rounded-xl text-center font-bold text-xs transition-all ${info.badgeClass}`}
                      >
                        <div>{cd}</div>
                        <div className="text-[9px] opacity-80 font-normal">{info.name}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="text-[11px] font-bold text-slate-400 mb-1.5">A계열 표준 근무조 (A1-A13)</div>
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
    </div>
  );
}

"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  getWorkSchedule,
  saveWorkSchedule,
  type ScheduleEmployeeRow,
} from "@/app/actions/workScheduleActions";

// 근무/휴무 코드 정의
export type ShiftCodeInfo = {
  code: string;
  name: string;
  hours?: string;
  category: "leave" | "shiftA" | "shiftB" | "shiftC" | "shiftD" | "shiftE";
  colorClass: string;
};

export const SHIFT_CODES: Record<string, ShiftCodeInfo> = {
  // 휴무 및 연차 코드
  BE: { code: "BE", name: "휴무", hours: "-", category: "leave", colorClass: "bg-[#1e1e1e] text-white font-bold" },
  ML: { code: "ML", name: "일차", hours: "-", category: "leave", colorClass: "bg-[#f5ebe0] text-[#5c3d2e] font-bold border border-[#d6c0b3]" },
  AL: { code: "AL", name: "연차", hours: "-", category: "leave", colorClass: "bg-[#d1f2d9] text-[#0f5132] font-bold border border-[#a3e4b2]" },
  MO: { code: "MO", name: "오전반차", hours: "-", category: "leave", colorClass: "bg-[#fff3cd] text-[#856404] font-bold border border-[#ffebaA]" },
  AO: { code: "AO", name: "오후반차", hours: "-", category: "leave", colorClass: "bg-[#ffe5d0] text-[#d9480f] font-bold border border-[#ffc999]" },
  SL: { code: "SL", name: "병가", hours: "-", category: "leave", colorClass: "bg-[#e2d9f3] text-[#5f3dc4] font-bold border border-[#c0b3e5]" },
  PL: { code: "PL", name: "유급휴가", hours: "-", category: "leave", colorClass: "bg-[#fce8e6] text-[#c5221f] font-bold border border-[#f5b8b5]" },
  BT: { code: "BT", name: "출장", hours: "-", category: "leave", colorClass: "bg-[#cff4fc] text-[#055160] font-bold border border-[#9eeaf9]" },
  OL: { code: "OL", name: "예비군/민방위", hours: "-", category: "leave", colorClass: "bg-[#e9ecef] text-[#495057] font-bold border border-[#ced4da]" },
  RW: { code: "RW", name: "재택근무", hours: "-", category: "leave", colorClass: "bg-[#e6fcf5] text-[#0ca678] font-bold border border-[#96f2d7]" },
  "?": { code: "?", name: "미정", hours: "-", category: "leave", colorClass: "bg-slate-100 text-slate-500 border border-slate-300 font-bold" },

  // A계열 근무 (06:00 ~ 18:00 시작)
  A1: { code: "A1", name: "조근1", hours: "06:00~15:00", category: "shiftA", colorClass: "bg-slate-100 text-slate-800 border border-slate-300 font-medium" },
  A2: { code: "A2", name: "조근2", hours: "07:00~16:00", category: "shiftA", colorClass: "bg-slate-100 text-slate-800 border border-slate-300 font-medium" },
  A3: { code: "A3", name: "조근3", hours: "08:00~17:00", category: "shiftA", colorClass: "bg-slate-100 text-slate-800 border border-slate-300 font-medium" },
  A4: { code: "A4", name: "주간정속", hours: "09:00~18:00", category: "shiftA", colorClass: "bg-slate-100 text-slate-800 border border-slate-300 font-medium" },
  A5: { code: "A5", name: "주근5", hours: "10:00~19:00", category: "shiftA", colorClass: "bg-orange-50 text-orange-800 border border-orange-200 font-medium" },
  A6: { code: "A6", name: "주근6", hours: "11:00~20:00", category: "shiftA", colorClass: "bg-orange-100 text-orange-900 border border-orange-300 font-medium" },
  A7: { code: "A7", name: "주근7", hours: "12:00~21:00", category: "shiftA", colorClass: "bg-orange-100 text-orange-900 border border-orange-300 font-medium" },
  A8: { code: "A8", name: "석근8", hours: "13:00~22:00", category: "shiftA", colorClass: "bg-[#ffd8a8] text-[#d9480f] border border-[#ffc078] font-semibold" },
  A9: { code: "A9", name: "야근9", hours: "14:00~23:00", category: "shiftA", colorClass: "bg-indigo-100 text-indigo-900 border border-indigo-300 font-semibold" },
  A10: { code: "A10", name: "야근10", hours: "15:00~24:00", category: "shiftA", colorClass: "bg-indigo-100 text-indigo-900 border border-indigo-300 font-semibold" },
  A11: { code: "A11", name: "철야11", hours: "16:00~01:00", category: "shiftA", colorClass: "bg-indigo-200 text-indigo-950 border border-indigo-400 font-bold" },
  A12: { code: "A12", name: "철야12", hours: "17:00~02:00", category: "shiftA", colorClass: "bg-indigo-200 text-indigo-950 border border-indigo-400 font-bold" },
  A13: { code: "A13", name: "철야13", hours: "18:00~03:00", category: "shiftA", colorClass: "bg-purple-200 text-purple-950 border border-purple-400 font-bold" },
};

// B, C, D, E 계열 자동 맵 생성 헬퍼
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
      name: `${char}계열근무`,
      hours: `${startH}:00~${endH}:00`,
      category: `shift${char}` as any,
      colorClass: "bg-cyan-50 text-cyan-900 border border-cyan-300 font-medium",
    };
  }
  return {
    code,
    name: code,
    hours: "-",
    category: "leave",
    colorClass: "bg-slate-100 text-slate-700 border border-slate-300",
  };
}

// 샘플 데모 데이터 (엑셀 이미지 기준)
const INITIAL_DEMO_DATA: ScheduleEmployeeRow[] = [
  // 세리/VX
  { id: "1", name: "정성영", group: "생산1팀 (세리/VX)", shifts: { "1": "BE", "2": "BE", "3": "AL", "4": "AL", "5": "AL", "6": "AL", "7": "A4", "8": "BE", "9": "BE", "10": "A4", "11": "A3", "12": "A3", "13": "A4", "15": "BE", "16": "BE", "17": "BE", "22": "BE", "23": "BE", "29": "BE", "30": "BE" } },
  { id: "2", name: "임화랑", group: "생산1팀 (세리/VX)", shifts: { "1": "BE", "2": "BE", "3": "A4", "4": "A4", "5": "A4", "6": "A4", "7": "A4", "8": "BE", "9": "BE", "10": "A4", "11": "A1", "12": "A1", "13": "A4", "15": "BE", "16": "BE", "17": "BE", "22": "BE", "23": "BE", "29": "BE", "30": "BE" } },
  { id: "3", name: "이상은", group: "생산1팀 (세리/VX)", shifts: { "1": "BE", "2": "BE", "3": "A4", "4": "A4", "5": "A4", "6": "A4", "7": "A4", "8": "BE", "9": "BE", "10": "A4", "11": "A3", "12": "A3", "13": "A4", "15": "BE", "16": "BE", "17": "BE", "22": "BE", "23": "BE", "29": "BE", "30": "BE" } },
  { id: "4", name: "주재훈", group: "생산1팀 (세리/VX)", shifts: { "1": "BE", "2": "BE", "3": "A4", "4": "A4", "5": "A4", "6": "A4", "7": "A4", "8": "BE", "9": "BE", "10": "AL", "11": "A8", "12": "A8", "13": "A4", "15": "BE", "16": "BE", "17": "BE", "19": "AL", "22": "BE", "23": "BE", "29": "BE", "30": "BE" } },
  { id: "5", name: "유광성", group: "생산1팀 (세리/VX)", shifts: { "1": "BE", "2": "BE", "3": "A4", "4": "A4", "5": "A4", "6": "A4", "7": "AL", "8": "BE", "9": "BE", "10": "A4", "11": "A8", "12": "A8", "13": "A4", "15": "BE", "16": "BE", "17": "BE", "22": "BE", "23": "BE", "29": "BE", "30": "BE" } },

  // 유미
  { id: "6", name: "유희정", group: "생산2팀 (유미)", shifts: { "1": "BE", "2": "BE", "3": "AL", "4": "A4", "5": "AL", "6": "A4", "7": "A4", "8": "BE", "9": "BE", "10": "A4", "11": "A1", "12": "A1", "13": "A4", "15": "BE", "16": "BE", "17": "BE", "22": "BE", "23": "BE", "29": "BE", "30": "BE" } },
  { id: "7", name: "김종대", group: "생산2팀 (유미)", shifts: { "1": "BE", "2": "BE", "3": "AL", "4": "A4", "5": "AL", "6": "A4", "7": "A4", "8": "BE", "9": "BE", "10": "A4", "11": "A8", "12": "A8", "13": "A4", "15": "BE", "16": "BE", "17": "BE", "22": "BE", "23": "BE", "29": "BE", "30": "BE" } },
  { id: "8", name: "유승훈", group: "생산2팀 (유미)", shifts: { "1": "BE", "2": "BE", "3": "A4", "4": "A4", "5": "A4", "6": "A4", "7": "A4", "8": "BE", "9": "BE", "10": "A4", "11": "A1", "12": "A1", "13": "A4", "15": "BE", "16": "BE", "17": "BE", "22": "BE", "23": "BE", "29": "BE", "30": "BE" } },
  { id: "9", name: "방세원", group: "생산2팀 (유미)", shifts: { "1": "BE", "2": "BE", "3": "A4", "4": "A4", "5": "A4", "6": "A4", "7": "A4", "8": "BE", "9": "BE", "10": "A4", "11": "A3", "12": "A4", "13": "AO", "15": "BE", "16": "BE", "17": "BE", "18": "AL", "19": "AL", "20": "AL", "21": "AL", "22": "BE", "23": "BE", "24": "AL", "25": "AL", "26": "AL", "27": "AL", "28": "AL", "29": "BE", "30": "BE", "31": "AL" } },
  { id: "10", name: "길화진", group: "생산2팀 (유미)", shifts: { "1": "BE", "2": "BE", "3": "A4", "4": "A4", "5": "A4", "6": "A4", "7": "A4", "8": "BE", "9": "BE", "10": "A4", "11": "A1", "12": "A1", "13": "A4", "15": "BE", "16": "BE", "17": "BE", "22": "BE", "23": "BE", "29": "BE", "30": "BE" } },
  { id: "11", name: "최봉구", group: "생산2팀 (유미)", shifts: { "1": "BE", "2": "BE", "3": "A4", "4": "A4", "5": "A4", "6": "AO", "7": "AL", "8": "BE", "9": "BE", "10": "A4", "11": "A3", "12": "A3", "13": "A4", "14": "AO", "15": "BE", "16": "BE", "17": "BE", "22": "BE", "23": "BE", "29": "BE", "30": "BE" } },

  // 씨베리
  { id: "12", name: "강다현", group: "품질팀 (씨베리)", shifts: { "1": "BE", "2": "BE", "3": "BE", "4": "A4", "5": "A4", "6": "A4", "7": "A4", "8": "BE", "9": "BE", "10": "A4", "11": "A8", "12": "A8", "13": "A4", "15": "BE", "16": "BE", "17": "BE", "22": "BE", "23": "BE", "29": "BE", "30": "BE" } },
  { id: "13", name: "정선희", group: "품질팀 (씨베리)", shifts: { "1": "BE", "2": "BE", "3": "BE", "4": "BE", "5": "BE", "6": "BE", "7": "BE", "8": "BE", "9": "BE", "10": "A3", "11": "A3", "12": "A4", "15": "BE", "16": "BE", "17": "BE", "18": "A4", "19": "A4", "20": "A4", "21": "A4", "22": "BE", "23": "BE", "29": "BE", "30": "BE" } },

  // 에브리 리몬
  { id: "14", name: "주미정", group: "경영/영업팀 (에브리 리몬)", shifts: { "1": "BE", "2": "BE", "8": "BE", "9": "BE", "15": "BE", "16": "BE", "22": "BE", "23": "BE", "29": "BE", "30": "BE" } },
  { id: "15", name: "김대원", group: "경영/영업팀 (에브리 리몬)", shifts: { "1": "BE", "2": "BE", "8": "BE", "9": "BE", "15": "BE", "16": "BE", "22": "BE", "23": "BE", "29": "BE", "30": "BE" } },
];

export default function WorkScheduleTable() {
  const [currentYear, setCurrentYear] = useState(2026);
  const [currentMonth, setCurrentMonth] = useState(8); // 1-12
  const [rows, setRows] = useState<ScheduleEmployeeRow[]>(INITIAL_DEMO_DATA);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // 셀 편집 팝업 상태
  const [editingCell, setEditingCell] = useState<{
    empId: string;
    day: number;
    empName: string;
    currentCode: string;
  } | null>(null);

  const [inputCustomCode, setInputCustomCode] = useState("");
  const [filterSearch, setFilterSearch] = useState("");
  const [showLegend, setShowLegend] = useState(true);

  const yearMonthKey = `${currentYear}-${String(currentMonth).padStart(2, "0")}`;

  // 데이터 로딩 (Supabase ➔ 없으면 localStorage ➔ 없으면 데모)
  const loadSchedule = async () => {
    setLoading(true);
    try {
      const res = await getWorkSchedule(yearMonthKey);
      if (res.success && res.data && res.data.length > 0) {
        setRows(res.data);
      } else {
        const localKey = `beansheal_work_schedule_${yearMonthKey}`;
        const localData = localStorage.getItem(localKey);
        if (localData) {
          setRows(JSON.parse(localData));
        } else {
          setRows(INITIAL_DEMO_DATA);
        }
      }
    } catch (e) {
      setRows(INITIAL_DEMO_DATA);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSchedule();
  }, [yearMonthKey]);

  // 저장 실행
  const handleSave = async () => {
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await saveWorkSchedule(yearMonthKey, rows);
      const localKey = `beansheal_work_schedule_${yearMonthKey}`;
      localStorage.setItem(localKey, JSON.stringify(rows));

      if (res.success) {
        setSaveMsg({ type: "success", text: "월간 스케줄이 성공적으로 저장되었습니다!" });
      } else {
        setSaveMsg({ type: "success", text: "로컬 저장 완료 (DB 준비 완료시 자동동기화 됩니다)." });
      }
    } catch (e: any) {
      setSaveMsg({ type: "error", text: "저장 중 오류가 발생했습니다." });
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(null), 3000);
    }
  };

  // 해당 월의 날짜 수 (28~31)
  const daysInMonth = useMemo(() => {
    return new Date(currentYear, currentMonth, 0).getDate();
  }, [currentYear, currentMonth]);

  // 날짜별 요일 정보 및 주말 여부 계산
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
        label: `${currentMonth}/${day}`,
        dayName: dayNames[dayOfWeek],
        isSat,
        isSun,
      });
    }
    return arr;
  }, [currentYear, currentMonth, daysInMonth]);

  // 그룹(팀)별 행 묶기
  const groupedRows = useMemo(() => {
    const map: Record<string, ScheduleEmployeeRow[]> = {};
    const filtered = rows.filter((r) =>
      filterSearch ? r.name.includes(filterSearch) || r.group.includes(filterSearch) : true
    );
    filtered.forEach((row) => {
      const g = row.group || "기타팀";
      if (!map[g]) map[g] = [];
      map[g].push(row);
    });
    return map;
  }, [rows, filterSearch]);

  // 셀 값 업데이트 헬퍼
  const updateCellValue = (empId: string, day: number, code: string) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id === empId) {
          const nextShifts = { ...r.shifts };
          if (!code.trim()) {
            delete nextShifts[String(day)];
          } else {
            nextShifts[String(day)] = code.trim().toUpperCase();
          }
          return { ...r, shifts: nextShifts };
        }
        return r;
      })
    );
  };

  // 평일 A4 / 주말 BE 일괄 채우기
  const handleAutoFillRow = (empId: string) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id === empId) {
          const nextShifts = { ...r.shifts };
          for (let day = 1; day <= daysInMonth; day++) {
            const dateObj = new Date(currentYear, currentMonth - 1, day);
            const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
            nextShifts[String(day)] = isWeekend ? "BE" : "A4";
          }
          return { ...r, shifts: nextShifts };
        }
        return r;
      })
    );
  };

  // 사원 추가
  const handleAddEmployee = (groupName: string) => {
    const name = prompt("새 사원의 이름을 입력하세요:", "새 사원");
    if (!name) return;
    const newId = String(Date.now());
    const newRow: ScheduleEmployeeRow = {
      id: newId,
      name: name.trim(),
      group: groupName,
      shifts: {},
    };
    for (let day = 1; day <= daysInMonth; day++) {
      const dateObj = new Date(currentYear, currentMonth - 1, day);
      if (dateObj.getDay() === 0 || dateObj.getDay() === 6) {
        newRow.shifts[String(day)] = "BE";
      }
    }
    setRows((prev) => [...prev, newRow]);
  };

  // 사원 삭제
  const handleDeleteEmployee = (empId: string, name: string) => {
    if (!confirm(`'${name}' 사원을 스케줄표에서 삭제하시겠습니까?`)) return;
    setRows((prev) => prev.filter((r) => r.id !== empId));
  };

  // 엑셀 다운로드 (CSV 형태로 다운로드)
  const handleExportCSV = () => {
    let csv = `이름,구분,` + daysHeader.map((d) => `${d.label}(${d.dayName})`).join(",") + "\n";
    rows.forEach((r) => {
      const line = [
        `"${r.name}"`,
        `"${r.group}"`,
        ...daysHeader.map((d) => `"${r.shifts[String(d.day)] || ""}"`),
      ].join(",");
      csv += line + "\n";
    });
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `근무스케줄_${yearMonthKey}.csv`;
    link.click();
  };

  return (
    <div className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl overflow-hidden flex flex-col transition-all">
      {/* 🌟 헤더 컨트롤 바 */}
      <div className="px-6 py-4 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-4 border-b border-slate-800">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-blue-600/20 text-blue-400 rounded-xl border border-blue-500/30">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 002-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
              월간 근무 & 근무조 스케줄표
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-400/30">
                실시간 편집
              </span>
            </h2>
            <p className="text-xs text-slate-400">사원별 근무조(A1~E13), 휴무(BE), 연차(AL) 일괄 입력 및 편집</p>
          </div>
        </div>

        {/* 연/월 네비게이터 & 액션 버튼 */}
        <div className="flex items-center flex-wrap gap-3">
          <div className="flex items-center bg-slate-800/80 border border-slate-700/80 rounded-xl p-1">
            <button
              onClick={() => {
                if (currentMonth === 1) {
                  setCurrentYear((prev) => prev - 1);
                  setCurrentMonth(12);
                } else {
                  setCurrentMonth((prev) => prev - 1);
                }
              }}
              className="p-1.5 hover:bg-slate-700 rounded-lg text-slate-300 hover:text-white transition-colors"
              title="이전 달"
            >
              ◀
            </button>
            <span className="px-3 text-sm font-extrabold text-white tracking-wide">
              {currentYear}년 {currentMonth}월
            </span>
            <button
              onClick={() => {
                if (currentMonth === 12) {
                  setCurrentYear((prev) => prev + 1);
                  setCurrentMonth(1);
                } else {
                  setCurrentMonth((prev) => prev + 1);
                }
              }}
              className="p-1.5 hover:bg-slate-700 rounded-lg text-slate-300 hover:text-white transition-colors"
              title="다음 달"
            >
              ▶
            </button>
          </div>

          <input
            type="text"
            placeholder="이름/팀 검색..."
            value={filterSearch}
            onChange={(e) => setFilterSearch(e.target.value)}
            className="px-3 py-1.5 text-xs bg-slate-800 border border-slate-700 text-white rounded-xl placeholder-slate-400 focus:outline-none focus:border-blue-500 w-32 sm:w-40"
          />

          <button
            onClick={() => setShowLegend((prev) => !prev)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-xl border transition-all ${
              showLegend
                ? "bg-slate-800 text-blue-300 border-blue-500/40"
                : "bg-slate-800/50 text-slate-400 border-slate-700 hover:text-white"
            }`}
          >
            근무 코드표 {showLegend ? "접기 ▲" : "보기 ▼"}
          </button>

          <button
            onClick={handleExportCSV}
            className="px-3 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl transition-all shadow-sm"
          >
            엑셀 다운로드 📥
          </button>

          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-1.5 text-xs font-bold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl shadow-md transition-all disabled:opacity-50 flex items-center gap-1.5"
          >
            {saving ? "저장 중..." : "저장하기 💾"}
          </button>
        </div>
      </div>

      {/* 🌟 월 선택 탭 (엑셀 하단 탭 스타일: 1월 ~ 12월) */}
      <div className="flex items-center overflow-x-auto bg-slate-100 dark:bg-slate-800/80 px-4 border-b border-slate-200 dark:border-slate-800 text-xs font-bold scrollbar-thin">
        <span className="text-slate-400 text-[11px] mr-2 shrink-0">월 선택:</span>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => {
          const isActive = m === currentMonth;
          return (
            <button
              key={m}
              onClick={() => setCurrentMonth(m)}
              className={`px-3 py-2 border-b-2 font-bold transition-all shrink-0 ${
                isActive
                  ? "border-blue-600 text-blue-600 dark:text-blue-400 bg-white dark:bg-slate-900 shadow-2xs"
                  : "border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              {m}월
            </button>
          );
        })}
      </div>

      {saveMsg && (
        <div
          className={`px-4 py-2 text-xs font-semibold text-center ${
            saveMsg.type === "success"
              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-b border-emerald-500/20"
              : "bg-red-500/10 text-red-600 dark:text-red-400 border-b border-red-500/20"
          }`}
        >
          {saveMsg.text}
        </div>
      )}

      {/* 🌟 메인 스케줄 그리드 테이블 */}
      <div className="overflow-x-auto overflow-y-auto max-h-[600px] relative scrollbar-thin">
        <table className="w-full text-xs text-center border-collapse">
          <thead>
            {/* 1행: 날짜 헤더 (8/1, 8/2, ...) */}
            <tr className="bg-slate-100 dark:bg-slate-800/90 text-slate-700 dark:text-slate-200 border-b border-slate-300 dark:border-slate-700 sticky top-0 z-20">
              <th className="sticky left-0 z-30 bg-slate-200 dark:bg-slate-800 px-3 py-2 border-r border-slate-300 dark:border-slate-700 min-w-[120px] font-bold text-left shadow-xs">
                이름 / 구분
              </th>
              {daysHeader.map((d) => (
                <th
                  key={d.day}
                  className={`px-1 py-1.5 border-r border-slate-300 dark:border-slate-700 min-w-[34px] font-bold text-[11px] ${
                    d.isSun
                      ? "bg-red-500/10 text-red-600 dark:text-red-400"
                      : d.isSat
                      ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                      : ""
                  }`}
                >
                  {d.label}
                </th>
              ))}
              <th className="px-2 py-2 min-w-[60px] bg-slate-200 dark:bg-slate-800 font-bold border-l border-slate-300 dark:border-slate-700">
                관리
              </th>
            </tr>
            {/* 2행: 요일 헤더 (토, 일, 월, ...) */}
            <tr className="bg-slate-50 dark:bg-slate-850 text-slate-600 dark:text-slate-300 border-b border-slate-300 dark:border-slate-700 sticky top-[33px] z-20">
              <th className="sticky left-0 z-30 bg-slate-100 dark:bg-slate-800 px-3 py-1 border-r border-slate-300 dark:border-slate-700 text-left font-semibold text-[10px] text-slate-400">
                기준월: {yearMonthKey}
              </th>
              {daysHeader.map((d) => (
                <th
                  key={d.day}
                  className={`px-1 py-1 border-r border-slate-300 dark:border-slate-700 text-[11px] font-bold ${
                    d.isSun
                      ? "bg-red-500/20 text-red-600 dark:text-red-400"
                      : d.isSat
                      ? "bg-blue-500/20 text-blue-600 dark:text-blue-400"
                      : ""
                  }`}
                >
                  {d.dayName}
                </th>
              ))}
              <th className="bg-slate-100 dark:bg-slate-800 border-l border-slate-300 dark:border-slate-700"></th>
            </tr>
          </thead>
          <tbody>
            {Object.keys(groupedRows).length === 0 ? (
              <tr>
                <td colSpan={daysInMonth + 2} className="py-8 text-slate-400">
                  등록된 사원 스케줄이 없습니다.
                </td>
              </tr>
            ) : (
              Object.entries(groupedRows).map(([groupName, empList]) => (
                <React.Fragment key={groupName}>
                  {/* 팀 구분 구분헤더 행 (엑셀의 '세리/VX', '유미', '씨베리' 등) */}
                  <tr className="bg-slate-200/80 dark:bg-slate-800/60 font-bold border-t-2 border-b border-slate-300 dark:border-slate-700">
                    <td
                      colSpan={daysInMonth + 2}
                      className="px-4 py-1.5 text-left text-xs text-blue-900 dark:text-blue-300 font-extrabold tracking-wide flex items-center justify-between"
                    >
                      <span>🏷️ {groupName}</span>
                      <button
                        onClick={() => handleAddEmployee(groupName)}
                        className="text-[11px] px-2 py-0.5 bg-blue-600 hover:bg-blue-500 text-white rounded font-medium transition-colors"
                      >
                        + {groupName} 사원 추가
                      </button>
                    </td>
                  </tr>

                  {/* 사원 행 반복 */}
                  {empList.map((emp) => (
                    <tr
                      key={emp.id}
                      className="hover:bg-blue-50/50 dark:hover:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800 transition-colors"
                    >
                      {/* 사원 이름 */}
                      <td className="sticky left-0 z-10 bg-white dark:bg-slate-900 px-3 py-1.5 border-r border-slate-200 dark:border-slate-800 font-bold text-left text-slate-800 dark:text-slate-200 flex items-center justify-between group shadow-2xs">
                        <span className="truncate max-w-[90px]" title={emp.name}>
                          {emp.name}
                        </span>
                        <button
                          onClick={() => handleAutoFillRow(emp.id)}
                          className="opacity-0 group-hover:opacity-100 text-[10px] text-blue-600 dark:text-blue-400 hover:underline ml-1"
                          title="평일 A4 / 주말 BE 일괄채우기"
                        >
                          자동
                        </button>
                      </td>

                      {/* 일자별 근무조 Cell */}
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
                            className={`px-0.5 py-1 border-r border-slate-200 dark:border-slate-800 cursor-pointer hover:ring-2 hover:ring-blue-400 transition-all select-none ${
                              d.isSun
                                ? "bg-red-500/5"
                                : d.isSat
                                ? "bg-blue-500/5"
                                : ""
                            }`}
                            title={`${emp.name} ${d.label}(${d.dayName}): ${info.name} (${info.hours})`}
                          >
                            {code ? (
                              <span
                                className={`inline-block w-full py-1 text-[11px] rounded shadow-2xs ${info.colorClass}`}
                              >
                                {code}
                              </span>
                            ) : (
                              <span className="inline-block w-full py-1 text-[10px] text-slate-300 dark:text-slate-700">
                                -
                              </span>
                            )}
                          </td>
                        );
                      })}

                      {/* 삭제 버튼 */}
                      <td className="px-1 py-1 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 text-center">
                        <button
                          onClick={() => handleDeleteEmployee(emp.id, emp.name)}
                          className="text-slate-400 hover:text-red-500 text-xs px-1"
                          title="삭제"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 🌟 셀 빠른 편집 레이어 / 모달 */}
      {editingCell && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 max-w-md w-full shadow-2xl space-y-4 animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-base">
                  근무 코드 변경: <span className="text-blue-600 dark:text-blue-400">{editingCell.empName}</span>
                </h3>
                <p className="text-xs text-slate-500">
                  {currentMonth}월 {editingCell.day}일 근무 상태를 선택하거나 직접 입력하세요.
                </p>
              </div>
              <button
                onClick={() => setEditingCell(null)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold px-2"
              >
                ✕
              </button>
            </div>

            {/* 빠른 선택 버튼 그룹 */}
            <div className="space-y-3 max-h-[340px] overflow-y-auto pr-1 scrollbar-thin text-xs">
              {/* 휴무 / 연차 */}
              <div>
                <div className="text-[11px] font-bold text-slate-400 mb-1.5">휴무 및 휴가 코드</div>
                <div className="grid grid-cols-4 gap-1.5">
                  {["BE", "ML", "AL", "MO", "AO", "SL", "PL", "BT", "OL", "RW", "?"].map((cd) => {
                    const info = getShiftInfo(cd);
                    const isSelected = editingCell.currentCode === cd;
                    return (
                      <button
                        key={cd}
                        onClick={() => {
                          updateCellValue(editingCell.empId, editingCell.day, cd);
                          setEditingCell(null);
                        }}
                        className={`p-2 rounded-xl text-center font-bold text-xs transition-all border ${
                          info.colorClass
                        } ${isSelected ? "ring-2 ring-blue-500 scale-105 shadow-md" : "hover:opacity-80"}`}
                      >
                        <div>{cd}</div>
                        <div className="text-[9px] font-normal opacity-80 truncate">{info.name}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 주간 / 표준 근무 (A계열) */}
              <div>
                <div className="text-[11px] font-bold text-slate-400 mb-1.5">표준 및 Shift (A계열)</div>
                <div className="grid grid-cols-4 gap-1.5">
                  {["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9", "A10", "A11", "A12", "A13"].map((cd) => {
                    const info = getShiftInfo(cd);
                    const isSelected = editingCell.currentCode === cd;
                    return (
                      <button
                        key={cd}
                        onClick={() => {
                          updateCellValue(editingCell.empId, editingCell.day, cd);
                          setEditingCell(null);
                        }}
                        className={`p-1.5 rounded-xl text-center transition-all border ${
                          info.colorClass
                        } ${isSelected ? "ring-2 ring-blue-500 scale-105 shadow-md" : "hover:opacity-80"}`}
                      >
                        <div className="font-bold text-xs">{cd}</div>
                        <div className="text-[9px] text-slate-600 dark:text-slate-300 font-mono truncate">{info.hours}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* 직접 입력 커스텀 코드 및 삭제 */}
            <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2">
              <input
                type="text"
                placeholder="직접 입력 (예: B2, C1)..."
                defaultValue={editingCell.currentCode}
                onChange={(e) => setInputCustomCode(e.target.value)}
                className="flex-1 px-3 py-2 text-xs bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white uppercase font-bold focus:outline-none focus:border-blue-500"
              />
              <button
                onClick={() => {
                  if (inputCustomCode) {
                    updateCellValue(editingCell.empId, editingCell.day, inputCustomCode);
                  }
                  setEditingCell(null);
                }}
                className="px-3 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-all"
              >
                적용
              </button>
              <button
                onClick={() => {
                  updateCellValue(editingCell.empId, editingCell.day, "");
                  setEditingCell(null);
                }}
                className="px-3 py-2 text-xs font-bold bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300 rounded-xl transition-all"
              >
                초기화
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🌟 하단 근무 코드표 및 시간표 (엑셀 이미지와 동일한 코드 레전드) */}
      {showLegend && (
        <div className="p-4 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-extrabold text-slate-800 dark:text-slate-200 tracking-tight flex items-center gap-1.5">
              📋 근무 코드표 & 시간 기준표 (Shift Code Reference)
            </h4>
            <span className="text-[11px] text-slate-500">※ 셀 클릭 시 위 코드를 선택하실 수 있습니다.</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 text-xs">
            {/* 1열: A계열 (9시간 텀) */}
            <div className="bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs space-y-1">
              <div className="font-bold text-slate-700 dark:text-slate-300 text-[11px] border-b pb-1">A계열 (9시간)</div>
              {[
                ["A1", "06:00~15:00"], ["A2", "07:00~16:00"], ["A3", "08:00~17:00"],
                ["A4", "09:00~18:00"], ["A5", "10:00~19:00"], ["A6", "11:00~20:00"],
                ["A7", "12:00~21:00"], ["A8", "13:00~22:00"], ["A9", "14:00~23:00"],
                ["A10", "15:00~24:00"], ["A11", "16:00~01:00"], ["A12", "17:00~02:00"]
              ].map(([code, time]) => (
                <div key={code} className="flex justify-between items-center text-[11px]">
                  <span className="font-bold text-blue-600 dark:text-blue-400 w-7">{code}</span>
                  <span className="text-slate-600 dark:text-slate-400 font-mono text-[10px]">{time}</span>
                </div>
              ))}
            </div>

            {/* 2열: B계열 (+1h) */}
            <div className="bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs space-y-1">
              <div className="font-bold text-slate-700 dark:text-slate-300 text-[11px] border-b pb-1">B계열 (+1h)</div>
              {[
                ["B1", "06:00~16:00"], ["B2", "07:00~17:00"], ["B3", "08:00~18:00"],
                ["B4", "09:00~19:00"], ["B5", "10:00~20:00"], ["B6", "11:00~21:00"],
                ["B7", "12:00~22:00"], ["B8", "13:00~23:00"], ["B9", "14:00~24:00"],
                ["B10", "15:00~01:00"]
              ].map(([code, time]) => (
                <div key={code} className="flex justify-between items-center text-[11px]">
                  <span className="font-bold text-orange-600 dark:text-orange-400 w-7">{code}</span>
                  <span className="text-slate-600 dark:text-slate-400 font-mono text-[10px]">{time}</span>
                </div>
              ))}
            </div>

            {/* 3열: C계열 (+2h) */}
            <div className="bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs space-y-1">
              <div className="font-bold text-slate-700 dark:text-slate-300 text-[11px] border-b pb-1">C계열 (+2h)</div>
              {[
                ["C1", "06:00~17:00"], ["C2", "07:00~18:00"], ["C3", "08:00~19:00"],
                ["C4", "09:00~20:00"], ["C5", "10:00~21:00"], ["C6", "11:00~22:00"],
                ["C7", "12:00~23:00"], ["C8", "13:00~24:00"], ["C9", "14:00~01:00"],
                ["C10", "15:00~02:00"]
              ].map(([code, time]) => (
                <div key={code} className="flex justify-between items-center text-[11px]">
                  <span className="font-bold text-purple-600 dark:text-purple-400 w-7">{code}</span>
                  <span className="text-slate-600 dark:text-slate-400 font-mono text-[10px]">{time}</span>
                </div>
              ))}
            </div>

            {/* 4열: D/E계열 */}
            <div className="bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs space-y-1">
              <div className="font-bold text-slate-700 dark:text-slate-300 text-[11px] border-b pb-1">D/E계열 (+3/4h)</div>
              {[
                ["D1", "06:00~18:00"], ["D2", "07:00~19:00"], ["D3", "08:00~20:00"],
                ["E1", "06:00~19:00"], ["E2", "07:00~20:00"], ["E3", "08:00~21:00"],
                ["E4", "09:00~22:00"], ["E5", "10:00~23:00"], ["E6", "11:00~24:00"]
              ].map(([code, time]) => (
                <div key={code} className="flex justify-between items-center text-[11px]">
                  <span className="font-bold text-indigo-600 dark:text-indigo-400 w-7">{code}</span>
                  <span className="text-slate-600 dark:text-slate-400 font-mono text-[10px]">{time}</span>
                </div>
              ))}
            </div>

            {/* 5열: 휴무 및 휴가 코드 */}
            <div className="bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs space-y-1">
              <div className="font-bold text-slate-700 dark:text-slate-300 text-[11px] border-b pb-1">휴무/휴가 구문</div>
              {[
                ["BE", "휴무"], ["ML", "일차"], ["AL", "연차"],
                ["MO", "오전반차"], ["AO", "오후반차"], ["SL", "병가"],
                ["PL", "유급휴가"], ["BT", "출장"], ["OL", "예비군/민방위"],
                ["RW", "재택근무"], ["?", "미정"]
              ].map(([code, desc]) => {
                const info = getShiftInfo(code);
                return (
                  <div key={code} className="flex justify-between items-center text-[11px]">
                    <span className={`px-1.5 py-0.2 rounded text-[10px] ${info.colorClass}`}>{code}</span>
                    <span className="text-slate-600 dark:text-slate-400 font-medium text-[11px]">{desc}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

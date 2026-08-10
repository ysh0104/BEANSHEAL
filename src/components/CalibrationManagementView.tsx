"use client";

import React, { useState, useEffect } from "react";

import {
  CalibrationItem,
  DEFAULT_CALIBRATION_ITEMS,
} from "@/lib/calibrationData";
import {
  getCalibrationItemsFromSupabase,
  saveCalibrationItemsToSupabase,
} from "@/app/actions/calibrationActions";

interface CalibrationManagementViewProps {
  canEdit?: boolean;
}

export default function CalibrationManagementView({ canEdit = true }: CalibrationManagementViewProps) {
  const [items, setItems] = useState<CalibrationItem[]>(DEFAULT_CALIBRATION_ITEMS);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const cached = localStorage.getItem("beansheal_calibration_items");
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) setItems(parsed);
        } catch {}
      }
    }
  }, []);

  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "OVERDUE" | "UPCOMING" | "NORMAL" | "DISCARDED">("ALL");

  // 모달 State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<CalibrationItem | null>(null);

  // 폼 State
  const [formData, setFormData] = useState<Partial<CalibrationItem>>({
    no: 1,
    name: "",
    code: "",
    external_date: "",
    internal_date: "",
    next_date: "",
    cycle: "1년",
    remark: "",
  });

  // 백엔드 Supabase 데이터 연동
  const fetchItems = async () => {
    setIsLoading(true);
    try {
      const res = await getCalibrationItemsFromSupabase();
      if (res.success && res.data && res.data.length > 0) {
        setItems(res.data);
        localStorage.setItem("beansheal_calibration_items", JSON.stringify(res.data));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, []);

  // 오늘 날짜 및 D-Day 계산 함수
  const getDDayInfo = (nextDateStr?: string, remark?: string) => {
    if (remark?.includes("폐기") || remark?.includes("불용")) {
      return { days: null, status: "DISCARDED", label: "폐기 / 불용", badgeClass: "bg-slate-100 text-slate-500 border-slate-200" };
    }

    if (!nextDateStr || !nextDateStr.trim()) {
      return { days: null, status: "NO_DATE", label: "일자 미기재", badgeClass: "bg-gray-100 text-gray-600 border-gray-200" };
    }

    // YYYY-MM-DD 포맷 변환
    const cleanDate = nextDateStr.replace(/\.\s*/g, "-").trim();
    const targetDate = new Date(cleanDate);
    if (isNaN(targetDate.getTime())) {
      return { days: null, status: "NO_DATE", label: nextDateStr, badgeClass: "bg-gray-100 text-gray-600 border-gray-200" };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    targetDate.setHours(0, 0, 0, 0);

    const diffTime = targetDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return {
        days: diffDays,
        status: "OVERDUE",
        label: `기한 경과 (D+${Math.abs(diffDays)}일)`,
        badgeClass: "bg-red-100 text-red-800 border-red-300 font-extrabold animate-pulse",
      };
    } else if (diffDays <= 30) {
      return {
        days: diffDays,
        status: "UPCOMING",
        label: diffDays === 0 ? "오늘 검교정 예정 (D-Day)" : `검교정 임박 (D-${diffDays}일)`,
        badgeClass: "bg-amber-100 text-amber-900 border-amber-300 font-bold",
      };
    } else {
      return {
        days: diffDays,
        status: "NORMAL",
        label: `정상 (D-${diffDays}일)`,
        badgeClass: "bg-emerald-50 text-emerald-800 border-emerald-200 font-medium",
      };
    }
  };

  // 상태 통계
  const stats = items.reduce(
    (acc, item) => {
      const info = getDDayInfo(item.next_date, item.remark);
      if (info.status === "OVERDUE") acc.overdue++;
      else if (info.status === "UPCOMING") acc.upcoming++;
      else if (info.status === "NORMAL") acc.normal++;
      else if (info.status === "DISCARDED") acc.discarded++;
      return acc;
    },
    { overdue: 0, upcoming: 0, normal: 0, discarded: 0 }
  );

  // 저장 처리
  const handleSaveItems = async (newItems: CalibrationItem[]) => {
    setItems(newItems);
    localStorage.setItem("beansheal_calibration_items", JSON.stringify(newItems));
    await saveCalibrationItemsToSupabase(newItems);
  };

  // 모달 열기 (신규 등록)
  const handleOpenAddModal = () => {
    const nextNo = items.length > 0 ? Math.max(...items.map((i) => i.no)) + 1 : 1;
    setFormData({
      no: nextNo,
      name: "",
      code: `BH-Q-${String(nextNo).padStart(3, "0")}`,
      external_date: "",
      internal_date: "",
      next_date: "",
      cycle: "1년",
      remark: "",
    });
    setEditingItem(null);
    setIsAddModalOpen(true);
  };

  // 모달 열기 (수정)
  const handleOpenEditModal = (item: CalibrationItem) => {
    setEditingItem(item);
    setFormData({ ...item });
    setIsAddModalOpen(true);
  };

  // 폼 제출
  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.code) {
      alert("기기명과 관리번호를 입력해 주십시오.");
      return;
    }

    let updatedList: CalibrationItem[];
    if (editingItem) {
      updatedList = items.map((i) => (i.no === editingItem.no ? ({ ...formData } as CalibrationItem) : i));
    } else {
      updatedList = [...items, { ...formData } as CalibrationItem].sort((a, b) => a.no - b.no);
    }

    await handleSaveItems(updatedList);
    setIsAddModalOpen(false);
  };

  // 항목 삭제
  const handleDeleteItem = async (no: number) => {
    if (!confirm(`NO.${no} 기기를 삭제하시겠습니까?`)) return;
    const updatedList = items.filter((i) => i.no !== no);
    await handleSaveItems(updatedList);
  };

  // 차기 예정일 자동 계산 헬퍼
  const handleAutoCalcNextDate = (baseDateStr?: string, cycleStr?: string) => {
    if (!baseDateStr) return "";
    const cleanDate = baseDateStr.replace(/\.\s*/g, "-").trim();
    const d = new Date(cleanDate);
    if (isNaN(d.getTime())) return "";

    const years = cycleStr?.includes("2년") ? 2 : 1;
    d.setFullYear(d.getFullYear() + years);
    d.setDate(d.getDate() - 1); // 하루 전

    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  // 필터링된 기기 목록
  const filteredItems = items.filter((item) => {
    const info = getDDayInfo(item.next_date, item.remark);

    if (statusFilter === "OVERDUE" && info.status !== "OVERDUE") return false;
    if (statusFilter === "UPCOMING" && info.status !== "UPCOMING") return false;
    if (statusFilter === "NORMAL" && info.status !== "NORMAL") return false;
    if (statusFilter === "DISCARDED" && info.status !== "DISCARDED") return false;

    if (searchTerm.trim()) {
      const kw = searchTerm.trim().toLowerCase();
      const matchName = item.name.toLowerCase().includes(kw);
      const matchCode = item.code.toLowerCase().includes(kw);
      const matchRemark = (item.remark || "").toLowerCase().includes(kw);
      if (!matchName && !matchCode && !matchRemark) return false;
    }
    return true;
  });

  return (
    <div className="space-y-5 font-sans">
      {/* 🌟 서식 양식 헤더 정보 바 (화이트 모던 룩) */}
      <div className="bg-white border border-gray-200 text-slate-900 p-4 sm:p-5 rounded-xl shadow-2xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-200 flex items-center justify-center font-black text-xl shadow-2xs">
            GMP
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-extrabold text-lg sm:text-xl tracking-tight text-slate-900">기기 검·교정 관리대장</h3>
              <span className="text-xs bg-slate-100 text-slate-700 border border-slate-200 px-2.5 py-0.5 rounded font-mono font-bold">
                양식번호: G-05-07-01
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-600 mt-1 font-medium">
              기록주기: 발생 시 | 보관 부서: 품질관리부 | 보존 년한: 3년
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {canEdit && (
            <button
              type="button"
              onClick={handleOpenAddModal}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-lg text-xs sm:text-sm font-extrabold transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
            >
              <span>+ 신규 기기 등록</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => window.print()}
            className="bg-white hover:bg-slate-50 text-slate-700 border border-gray-300 px-4 py-2.5 rounded-lg text-xs sm:text-sm font-extrabold transition-colors shadow-2xs cursor-pointer"
          >
            인쇄 / 서식 출력
          </button>
        </div>
      </div>

      {/* 🌟 자동으로 도래하는 검교정 알람 현황 카드 4종 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <button
          type="button"
          onClick={() => setStatusFilter(statusFilter === "OVERDUE" ? "ALL" : "OVERDUE")}
          className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
            statusFilter === "OVERDUE"
              ? "bg-red-600 text-white border-red-700 ring-2 ring-red-400 shadow-md"
              : "bg-red-50 text-red-900 border-red-200 hover:bg-red-100"
          }`}
        >
          <div className="text-xs sm:text-sm font-extrabold opacity-90">교정 기한 경과 (점검 필요)</div>
          <div className="text-2xl sm:text-3xl font-black mt-1">{stats.overdue}건</div>
          <div className="text-xs mt-1 font-bold opacity-80">클릭 시 즉시 조치대상 조회</div>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter(statusFilter === "UPCOMING" ? "ALL" : "UPCOMING")}
          className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
            statusFilter === "UPCOMING"
              ? "bg-amber-600 text-white border-amber-700 ring-2 ring-amber-400 shadow-md"
              : "bg-amber-50 text-amber-900 border-amber-200 hover:bg-amber-100"
          }`}
        >
          <div className="text-xs sm:text-sm font-extrabold opacity-90">교정 예정 임박 (30일 이내)</div>
          <div className="text-2xl sm:text-3xl font-black mt-1">{stats.upcoming}건</div>
          <div className="text-xs mt-1 font-bold opacity-80">사전 일정 수립 필요</div>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter(statusFilter === "NORMAL" ? "ALL" : "NORMAL")}
          className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
            statusFilter === "NORMAL"
              ? "bg-emerald-600 text-white border-emerald-700 ring-2 ring-emerald-400 shadow-md"
              : "bg-emerald-50 text-emerald-900 border-emerald-200 hover:bg-emerald-100"
          }`}
        >
          <div className="text-xs sm:text-sm font-extrabold opacity-90">정상 관리 기기</div>
          <div className="text-2xl sm:text-3xl font-black mt-1">{stats.normal}건</div>
          <div className="text-xs mt-1 font-bold opacity-80">유효기간 상태 정상</div>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter(statusFilter === "DISCARDED" ? "ALL" : "DISCARDED")}
          className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
            statusFilter === "DISCARDED"
              ? "bg-slate-700 text-white border-slate-800 ring-2 ring-slate-400 shadow-md"
              : "bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200"
          }`}
        >
          <div className="text-xs sm:text-sm font-extrabold opacity-90">폐기 / 불용 기기</div>
          <div className="text-2xl sm:text-3xl font-black mt-1">{stats.discarded}건</div>
          <div className="text-xs mt-1 font-bold opacity-80">사용 중단 보관 기기</div>
        </button>
      </div>

      {/* 🌟 검색 및 필터 컨트롤 바 */}
      <div className="bg-white border border-gray-200 p-3.5 rounded-xl shadow-2xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-[260px]">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="기기명, 관리번호(BH-Q-...), 비고 검색..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 font-bold"
            />
            <svg className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm("")}
              className="text-xs sm:text-sm text-gray-500 hover:text-gray-700 px-2.5 py-1.5 bg-gray-100 font-bold rounded cursor-pointer"
            >
              지우기
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 text-xs sm:text-sm font-extrabold text-gray-700">
          <span>필터:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 bg-white text-xs sm:text-sm font-extrabold text-gray-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 shadow-2xs cursor-pointer"
          >
            <option value="ALL">전체 보기 ({items.length}건)</option>
            <option value="OVERDUE">교정 기한 경과 ({stats.overdue}건)</option>
            <option value="UPCOMING">교정 예정 임박 ({stats.upcoming}건)</option>
            <option value="NORMAL">정상 관리 기기 ({stats.normal}건)</option>
            <option value="DISCARDED">폐기/불용 ({stats.discarded}건)</option>
          </select>
        </div>
      </div>

      {/* 🌟 검교정 관리대장 데이터 테이블 */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm whitespace-nowrap border-collapse">
            <thead className="bg-slate-100 text-slate-900 border-b border-slate-200">
              <tr>
                <th className="p-3.5 font-black text-center w-14 border-r border-slate-200">NO</th>
                <th className="p-3.5 font-black min-w-[160px] border-r border-slate-200">기기명</th>
                <th className="p-3.5 font-black min-w-[120px] border-r border-slate-200">관리번호</th>
                <th className="p-3.5 font-black min-w-[130px] text-center border-r border-slate-200">공인기관 검·교정 일자</th>
                <th className="p-3.5 font-black min-w-[130px] text-center border-r border-slate-200">자체 검·교정 일자</th>
                <th className="p-3.5 font-black min-w-[140px] text-center border-r border-slate-200">차기 검·교정 예정 일자</th>
                <th className="p-3.5 font-black text-center w-24 border-r border-slate-200">교정 주기</th>
                <th className="p-3.5 font-black text-center min-w-[150px] border-r border-slate-200">자동 알람 상태</th>
                <th className="p-3.5 font-black min-w-[120px] border-r border-slate-200">비고</th>
                {canEdit && <th className="p-3.5 font-black text-center w-24">관리</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredItems.map((item) => {
                const info = getDDayInfo(item.next_date, item.remark);
                return (
                  <tr key={item.no} className="hover:bg-slate-50 transition-colors">
                    <td className="p-3.5 font-mono font-bold text-center text-slate-700 border-r border-gray-100">
                      {item.no}
                    </td>
                    <td className="p-3.5 font-extrabold text-slate-900 border-r border-gray-100 text-sm">{item.name}</td>
                    <td className="p-3.5 font-mono font-black text-indigo-700 border-r border-gray-100 text-sm">
                      {item.code}
                    </td>
                    <td className="p-3.5 text-center font-mono font-bold text-slate-800 border-r border-gray-100">
                      {item.external_date || "-"}
                    </td>
                    <td className="p-3.5 text-center font-mono font-bold text-slate-800 border-r border-gray-100">
                      {item.internal_date || "-"}
                    </td>
                    <td className="p-3.5 text-center font-mono font-black text-slate-900 border-r border-gray-100 text-sm">
                      {item.next_date || "-"}
                    </td>
                    <td className="p-3.5 text-center font-black text-slate-800 border-r border-gray-100">
                      {item.cycle || "1년"}
                    </td>
                    <td className="p-3.5 text-center border-r border-gray-100">
                      <span className={`px-3 py-1 rounded-md text-xs border inline-block font-extrabold ${info.badgeClass}`}>
                        {info.label}
                      </span>
                    </td>
                    <td className="p-3.5 text-slate-800 border-r border-gray-100 font-bold text-xs sm:text-sm">
                      {item.remark || "-"}
                    </td>
                    {canEdit && (
                      <td className="p-3.5 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(item)}
                            className="px-2.5 py-1 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-800 font-extrabold rounded border border-gray-300 text-xs cursor-pointer transition-colors"
                          >
                            수정
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteItem(item.no)}
                            className="px-2 py-1 text-gray-400 hover:text-red-600 text-xs font-bold cursor-pointer transition-colors"
                            title="삭제"
                          >
                            ✕
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
              {filteredItems.length === 0 && (
                <tr>
                  <td colSpan={canEdit ? 10 : 9} className="text-center py-12 text-gray-400 font-medium bg-slate-50">
                    검색 조건에 일치하는 기기 검교정 항목이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 🌟 신규 등록 및 수정 모달 */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-lg overflow-hidden">
            <div className="bg-white border-b border-gray-200 text-slate-900 px-5 py-3.5 flex justify-between items-center">
              <h3 className="font-extrabold text-sm sm:text-base text-slate-900">
                {editingItem ? `NO.${editingItem.no} 기기 검·교정 정보 수정` : "신규 검·교정 기기 등록"}
              </h3>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 font-bold text-base cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitForm} className="p-5 space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">NO (순번)</label>
                  <input
                    type="number"
                    value={formData.no || 1}
                    onChange={(e) => setFormData({ ...formData, no: Number(e.target.value) })}
                    className="w-full border border-gray-300 rounded px-2.5 py-1.5 bg-white font-bold"
                    required
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">관리번호</label>
                  <input
                    type="text"
                    value={formData.code || ""}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    placeholder="예: BH-Q-071"
                    className="w-full border border-gray-300 rounded px-2.5 py-1.5 bg-white font-mono font-bold"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">기기명</label>
                <input
                  type="text"
                  value={formData.name || ""}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="예: 전자저울1(검수대)"
                  className="w-full border border-gray-300 rounded px-2.5 py-1.5 bg-white font-bold"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">공인기관 검·교정 일자</label>
                  <input
                    type="date"
                    value={formData.external_date || ""}
                    onChange={(e) => {
                      const extDate = e.target.value;
                      const next = handleAutoCalcNextDate(extDate, formData.cycle);
                      setFormData({ ...formData, external_date: extDate, next_date: next || formData.next_date });
                    }}
                    className="w-full border border-gray-300 rounded px-2.5 py-1.5 bg-white"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">자체 검·교정 일자</label>
                  <input
                    type="date"
                    value={formData.internal_date || ""}
                    onChange={(e) => {
                      const intDate = e.target.value;
                      const next = handleAutoCalcNextDate(intDate, formData.cycle);
                      setFormData({ ...formData, internal_date: intDate, next_date: next || formData.next_date });
                    }}
                    className="w-full border border-gray-300 rounded px-2.5 py-1.5 bg-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-bold text-slate-700">차기 예정 일자</label>
                    {(formData.internal_date || formData.external_date) && (
                      <button
                        type="button"
                        onClick={() => {
                          const base = formData.internal_date || formData.external_date;
                          const calc = handleAutoCalcNextDate(base, formData.cycle);
                          if (calc) setFormData({ ...formData, next_date: calc });
                        }}
                        className="text-[10px] text-indigo-600 font-extrabold hover:underline cursor-pointer"
                      >
                        자동 계산
                      </button>
                    )}
                  </div>
                  <input
                    type="date"
                    value={formData.next_date || ""}
                    onChange={(e) => setFormData({ ...formData, next_date: e.target.value })}
                    className="w-full border border-gray-300 rounded px-2.5 py-1.5 bg-white font-bold text-indigo-800"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">교정 주기</label>
                  <select
                    value={formData.cycle || "1년"}
                    onChange={(e) => setFormData({ ...formData, cycle: e.target.value })}
                    className="w-full border border-gray-300 rounded px-2.5 py-1.5 bg-white font-bold"
                  >
                    <option value="1년">1년</option>
                    <option value="2년">2년</option>
                    <option value="6개월">6개월</option>
                    <option value="3년">3년</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">비고 (특이사항 / 용량 / 폐기 여부)</label>
                <input
                  type="text"
                  value={formData.remark || ""}
                  onChange={(e) => setFormData({ ...formData, remark: e.target.value })}
                  placeholder="예: 30kg까지, CAL-LAB, 폐기 등"
                  className="w-full border border-gray-300 rounded px-2.5 py-1.5 bg-white"
                />
              </div>

              <div className="pt-3 border-t border-gray-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-slate-700 font-bold rounded-lg cursor-pointer"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-lg shadow-xs cursor-pointer"
                >
                  {editingItem ? "수정 완료" : "등록 저장"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

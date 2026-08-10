"use client";

import React, { useState, useEffect } from "react";
import { HealthCheckItem, DEFAULT_HEALTH_CHECK_ITEMS } from "@/lib/healthCheckData";
import { getHealthCheckItemsFromSupabase, saveHealthCheckItemsToSupabase } from "@/app/actions/healthCheckActions";

interface HealthCheckManagementViewProps {
  canEdit?: boolean;
}

export default function HealthCheckManagementView({ canEdit = true }: HealthCheckManagementViewProps) {
  const [items, setItems] = useState<HealthCheckItem[]>(DEFAULT_HEALTH_CHECK_ITEMS);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "OVERDUE" | "UPCOMING" | "NORMAL">("ALL");

  // 모달 State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<HealthCheckItem | null>(null);

  // 폼 State
  const [formData, setFormData] = useState<Partial<HealthCheckItem>>({
    no: 1,
    name: "",
    checkup_date: "",
    judgment_date: "",
    result_status: "정상",
    next_date: "",
    remark: "",
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      const cached = localStorage.getItem("beansheal_health_check_items");
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) setItems(parsed);
        } catch {}
      }
    }
    fetchItems();
  }, []);

  const fetchItems = async () => {
    setIsLoading(true);
    try {
      const res = await getHealthCheckItemsFromSupabase();
      if (res.success && res.data && res.data.length > 0) {
        setItems(res.data);
        localStorage.setItem("beansheal_health_check_items", JSON.stringify(res.data));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  // D-Day 및 알림 상태 계산 함수
  const getDDayInfo = (nextDateStr?: string) => {
    if (!nextDateStr || !nextDateStr.trim()) {
      return { days: null, status: "NO_DATE", label: "일자 미기재", badgeClass: "bg-gray-100 text-gray-600 border-gray-200" };
    }

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
        label: `검진기한 만료 (D+${Math.abs(diffDays)}일)`,
        badgeClass: "bg-rose-100 text-rose-900 border-rose-300 font-extrabold animate-pulse",
      };
    } else if (diffDays <= 30) {
      return {
        days: diffDays,
        status: "UPCOMING",
        label: diffDays === 0 ? "오늘 검진 예정 (D-Day)" : `재검진 임박 (D-${diffDays}일)`,
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

  // 통계
  const stats = items.reduce(
    (acc, item) => {
      const info = getDDayInfo(item.next_date);
      if (info.status === "OVERDUE") acc.overdue++;
      else if (info.status === "UPCOMING") acc.upcoming++;
      else if (info.status === "NORMAL") acc.normal++;
      return acc;
    },
    { overdue: 0, upcoming: 0, normal: 0 }
  );

  const handleSaveItems = async (newItems: HealthCheckItem[]) => {
    setItems(newItems);
    localStorage.setItem("beansheal_health_check_items", JSON.stringify(newItems));
    await saveHealthCheckItemsToSupabase(newItems);
  };

  const handleOpenAddModal = () => {
    const nextNo = items.length > 0 ? Math.max(...items.map((i) => i.no)) + 1 : 1;
    setFormData({
      no: nextNo,
      name: "",
      checkup_date: "",
      judgment_date: "",
      result_status: "정상",
      next_date: "",
      remark: "",
    });
    setEditingItem(null);
    setIsAddModalOpen(true);
  };

  const handleOpenEditModal = (item: HealthCheckItem) => {
    setFormData({ ...item });
    setEditingItem(item);
    setIsAddModalOpen(true);
  };

  // 검진일 입력 시 차후판정일(+1년) 자동 계산
  const handleCheckupDateChange = (dateVal: string) => {
    const nextForm = { ...formData, checkup_date: dateVal };
    if (dateVal && dateVal.length >= 8) {
      const clean = dateVal.replace(/\./g, "-");
      const d = new Date(clean);
      if (!isNaN(d.getTime())) {
        d.setFullYear(d.getFullYear() + 1);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        nextForm.next_date = `${yyyy}.${mm}.${dd}`;
      }
    }
    setFormData(nextForm);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name?.trim()) {
      alert("작업자 성명을 입력해주세요.");
      return;
    }

    let updatedList: HealthCheckItem[];
    if (editingItem) {
      updatedList = items.map((item) =>
        item.no === editingItem.no ? ({ ...item, ...formData } as HealthCheckItem) : item
      );
    } else {
      updatedList = [...items, formData as HealthCheckItem];
    }

    handleSaveItems(updatedList);
    setIsAddModalOpen(false);
  };

  const handleDeleteItem = (no: number) => {
    if (!confirm("해당 작업자의 건강진단(보건증) 기록을 삭제하시겠습니까?")) return;
    const updatedList = items.filter((item) => item.no !== no);
    handleSaveItems(updatedList);
  };

  // 검색 및 필터링
  const filteredItems = items.filter((item) => {
    const matchSearch =
      item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.remark && item.remark.toLowerCase().includes(searchTerm.toLowerCase()));

    const info = getDDayInfo(item.next_date);
    let matchStatus = true;
    if (statusFilter === "OVERDUE") matchStatus = info.status === "OVERDUE";
    else if (statusFilter === "UPCOMING") matchStatus = info.status === "UPCOMING";
    else if (statusFilter === "NORMAL") matchStatus = info.status === "NORMAL";

    return matchSearch && matchStatus;
  });

  return (
    <div className="space-y-6">
      {/* 1. 상단 경고/알림 뷰 탭 */}
      {(stats.overdue > 0 || stats.upcoming > 0) && (
        <div className="bg-gradient-to-r from-amber-50 to-rose-50 border border-amber-200 rounded-xl p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl sm:text-3xl animate-bounce">🚨</span>
            <div>
              <h4 className="text-base sm:text-lg font-extrabold text-amber-950 flex items-center gap-2">
                보건증 재검진 기한 경과 및 임박 알람
                <span className="text-xs bg-rose-600 text-white font-bold px-2 py-0.5 rounded-full">
                  경고 {stats.overdue + stats.upcoming}건
                </span>
              </h4>
              <p className="text-xs sm:text-sm text-amber-800 font-medium mt-0.5">
                {stats.overdue > 0 && `기한 만료 작업자 ${stats.overdue}명 `}
                {stats.upcoming > 0 && `30일 이내 검진 예정자 ${stats.upcoming}명 `}
                기한 내 보건소 재검진을 통해 GMP 품질기준을 준수해주세요.
              </p>
            </div>
          </div>
          <button
            onClick={() => setStatusFilter(stats.overdue > 0 ? "OVERDUE" : "UPCOMING")}
            className="w-full sm:w-auto bg-amber-900 hover:bg-amber-800 text-white font-bold text-xs px-4 py-2 rounded-lg transition-colors shadow-xs whitespace-nowrap cursor-pointer"
          >
            대리 대상자 목록 보기
          </button>
        </div>
      )}

      {/* 2. 요약 카드 헤더 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div
          onClick={() => setStatusFilter("ALL")}
          className={`p-4 rounded-xl border transition-all cursor-pointer ${
            statusFilter === "ALL"
              ? "bg-blue-50 border-blue-300 ring-2 ring-blue-500/20 shadow-sm"
              : "bg-white border-gray-200 hover:border-gray-300"
          }`}
        >
          <div className="text-xs font-bold text-gray-500">총 작업자 수</div>
          <div className="text-2xl font-black text-gray-900 mt-1">{items.length}명</div>
          <div className="text-[11px] text-gray-400 font-medium mt-1">보건증 관리 대상</div>
        </div>

        <div
          onClick={() => setStatusFilter("OVERDUE")}
          className={`p-4 rounded-xl border transition-all cursor-pointer ${
            statusFilter === "OVERDUE"
              ? "bg-rose-50 border-rose-300 ring-2 ring-rose-500/20 shadow-sm"
              : "bg-white border-gray-200 hover:border-gray-300"
          }`}
        >
          <div className="text-xs font-bold text-rose-700 flex items-center justify-between">
            기한 만료 🚨
            {stats.overdue > 0 && (
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
            )}
          </div>
          <div className="text-2xl font-black text-rose-900 mt-1">{stats.overdue}명</div>
          <div className="text-[11px] text-rose-700 font-medium mt-1">즉시 재검진 필요</div>
        </div>

        <div
          onClick={() => setStatusFilter("UPCOMING")}
          className={`p-4 rounded-xl border transition-all cursor-pointer ${
            statusFilter === "UPCOMING"
              ? "bg-amber-50 border-amber-300 ring-2 ring-amber-500/20 shadow-sm"
              : "bg-white border-gray-200 hover:border-gray-300"
          }`}
        >
          <div className="text-xs font-bold text-amber-700">검진 임박 ⚠️</div>
          <div className="text-2xl font-black text-amber-900 mt-1">{stats.upcoming}명</div>
          <div className="text-[11px] text-amber-700 font-medium mt-1">30일 이내 만료 예정</div>
        </div>

        <div
          onClick={() => setStatusFilter("NORMAL")}
          className={`p-4 rounded-xl border transition-all cursor-pointer ${
            statusFilter === "NORMAL"
              ? "bg-emerald-50 border-emerald-300 ring-2 ring-emerald-500/20 shadow-sm"
              : "bg-white border-gray-200 hover:border-gray-300"
          }`}
        >
          <div className="text-xs font-bold text-emerald-700">정상 🟢</div>
          <div className="text-2xl font-black text-emerald-900 mt-1">{stats.normal}명</div>
          <div className="text-[11px] text-emerald-700 font-medium mt-1">유효기간 정상 유지</div>
        </div>
      </div>

      {/* 3. 검색 및 액션 바 */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <input
            type="text"
            placeholder="작업자 성명 또는 비고 검색..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="px-3.5 py-2 border border-gray-300 rounded-lg text-xs md:text-sm font-medium w-full sm:w-64 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />

          <select
            value={statusFilter}
            onChange={(e: any) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-xs md:text-sm font-bold bg-white text-gray-700 cursor-pointer"
          >
            <option value="ALL">전체 필터 ({items.length})</option>
            <option value="OVERDUE">🚨 기한 만료 ({stats.overdue})</option>
            <option value="UPCOMING">⚠️ 30일 이내 임박 ({stats.upcoming})</option>
            <option value="NORMAL">🟢 정상 ({stats.normal})</option>
          </select>
        </div>

        {canEdit && (
          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              onClick={handleOpenAddModal}
              className="bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs sm:text-sm px-4 py-2 rounded-lg transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <span>+</span>
              <span>신규 보건증 등록</span>
            </button>
          </div>
        )}
      </div>

      {/* 4. 건강진단결과서 관리대장 테이블 */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-gray-200 flex items-center justify-between bg-slate-50">
          <div>
            <h3 className="text-base font-extrabold text-gray-900 flex items-center gap-2">
              건강진단결과서 (보건증) 관리대장
              <span className="text-xs font-bold bg-slate-200 text-slate-700 px-2 py-0.5 rounded">
                GMP 서류
              </span>
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              식품위생법 및 GMP 기준에 따른 작업자 건강진단결과서 차후판정일 자동 추적 관리
            </p>
          </div>
          <span className="text-xs font-mono font-bold text-gray-400">
            총 {filteredItems.length}명 표시 중
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[750px]">
            <thead>
              <tr className="bg-slate-100/70 border-b border-gray-200 text-slate-700 text-xs font-bold">
                <th className="py-3 px-4 text-center w-16">No</th>
                <th className="py-3 px-4">성명</th>
                <th className="py-3 px-4 text-center">검진일</th>
                <th className="py-3 px-4 text-center">판정일</th>
                <th className="py-3 px-4 text-center">정상여부</th>
                <th className="py-3 px-4 text-center">차후판정일 (만료예정)</th>
                <th className="py-3 px-4 text-center">만료 상태 알림</th>
                <th className="py-3 px-4">비고</th>
                {canEdit && <th className="py-3 px-4 text-center w-24">관리</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-xs md:text-sm">
              {filteredItems.map((item) => {
                const info = getDDayInfo(item.next_date);

                return (
                  <tr key={item.no} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 text-center font-mono text-gray-400 font-bold">
                      {item.no}
                    </td>
                    <td className="py-3 px-4 font-extrabold text-slate-900">{item.name}</td>
                    <td className="py-3 px-4 text-center font-mono font-medium text-slate-600">
                      {item.checkup_date || "-"}
                    </td>
                    <td className="py-3 px-4 text-center font-mono font-medium text-slate-600">
                      {item.judgment_date || "-"}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="inline-block px-2.5 py-0.5 rounded text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                        {item.result_status || "정상"}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center font-mono font-bold text-slate-900">
                      {item.next_date || "-"}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`inline-block px-2.5 py-1 rounded-full text-xs border ${info.badgeClass}`}>
                        {info.label}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-gray-500 text-xs">{item.remark || "-"}</td>

                    {canEdit && (
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => handleOpenEditModal(item)}
                            className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded text-xs transition-colors cursor-pointer"
                          >
                            수정
                          </button>
                          <button
                            onClick={() => handleDeleteItem(item.no)}
                            className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold rounded text-xs transition-colors cursor-pointer"
                          >
                            삭제
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}

              {filteredItems.length === 0 && (
                <tr>
                  <td colSpan={canEdit ? 9 : 8} className="py-12 text-center text-gray-400 font-medium">
                    등록되었거나 조건에 일치하는 보건증 기록이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 5. 등록 및 수정 모달 */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-200 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-base font-extrabold text-gray-900">
                {editingItem ? "보건증 기록 수정" : "신규 보건증(건강진단) 등록"}
              </h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 font-bold text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">작업자 성명 *</label>
                <input
                  type="text"
                  required
                  placeholder="예: 주미정"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs md:text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">검진일 *</label>
                  <input
                    type="text"
                    required
                    placeholder="YYYY.MM.DD"
                    value={formData.checkup_date}
                    onChange={(e) => handleCheckupDateChange(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs md:text-sm font-mono font-medium focus:ring-2 focus:ring-blue-500/20 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">판정일</label>
                  <input
                    type="text"
                    placeholder="YYYY.MM.DD"
                    value={formData.judgment_date}
                    onChange={(e) => setFormData({ ...formData, judgment_date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs md:text-sm font-mono font-medium focus:ring-2 focus:ring-blue-500/20 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">정상여부</label>
                  <select
                    value={formData.result_status}
                    onChange={(e) => setFormData({ ...formData, result_status: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs md:text-sm font-bold bg-white focus:outline-none"
                  >
                    <option value="정상">정상</option>
                    <option value="재검진">재검진</option>
                    <option value="소견불량">소견불량</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">차후판정일 (만료예정일)</label>
                  <input
                    type="text"
                    placeholder="YYYY.MM.DD (+1년 자동)"
                    value={formData.next_date}
                    onChange={(e) => setFormData({ ...formData, next_date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs md:text-sm font-mono font-bold text-blue-700 bg-blue-50/50 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">비고</label>
                <input
                  type="text"
                  placeholder="특이사항 입력..."
                  value={formData.remark}
                  onChange={(e) => setFormData({ ...formData, remark: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs font-medium focus:outline-none"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs rounded-lg transition-colors cursor-pointer"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg transition-colors shadow-xs cursor-pointer"
                >
                  {editingItem ? "수정 저장" : "신규 등록"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

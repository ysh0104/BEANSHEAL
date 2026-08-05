"use client";

import React, { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import Link from "next/link";

export default function WorkplaceDashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const [currentDate] = useState(new Date());

  const [memos, setMemos] = useState([
    { id: 1, text: "A라인 포장기 점검 예정 (14:00~15:00)", date: "오늘 10:30", author: "생산팀" },
    { id: 2, text: "유기농 야채원료 입고 검수 완료", date: "오늘 09:15", author: "품질팀" },
    { id: 3, text: "신규 원두 배합비 샘플링 승인 요청", date: "어제 17:40", author: "경영팀" },
  ]);
  const [newMemoText, setNewMemoText] = useState("");

  const handleAddMemo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemoText.trim()) return;
    const memo = {
      id: Date.now(),
      text: newMemoText.trim(),
      date: "방금 전",
      author: user?.name || "사원",
    };
    setMemos([memo, ...memos]);
    setNewMemoText("");
  };

  return (
    <div className="min-h-screen bg-[#0b0b0b] text-zinc-100 p-6 font-sans">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* 대시보드 상단 환영 바 */}
        <div className="bg-zinc-900/90 border border-zinc-800 rounded-3xl p-6 md:p-8 shadow-2xl flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 text-xs text-zinc-400 mb-2 font-extrabold">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>BEANSHEAL Workplace ERP 시스템</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight">
              {user ? `${user.name} (${user.jobTitle})` : "사원"}님, 반갑습니다! ☕
            </h1>
            <p className="text-zinc-400 text-xs font-semibold mt-1">
              오늘도 안전하고 효율적인 생산 & 재고 관리를 위해 준비되었습니다.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/inventory"
              className="bg-white hover:bg-zinc-200 text-black font-extrabold text-xs px-4 py-3 rounded-2xl shadow-md transition-all cursor-pointer flex items-center gap-1.5"
            >
              <span>📦 재고 현황 보기</span>
            </Link>
            <Link
              href="/recipes"
              className="bg-zinc-800 hover:bg-zinc-700 text-white font-extrabold text-xs px-4 py-3 rounded-2xl border border-zinc-700 transition-all cursor-pointer flex items-center gap-1.5"
            >
              <span>📜 배합 레시피 관리</span>
            </Link>
          </div>
        </div>

        {/* 메인 4대 대표 업무 퀵 메뉴 카드 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Link
            href="/inventory"
            className="group bg-zinc-900/80 hover:bg-zinc-800/90 border border-zinc-800 p-5 rounded-3xl transition-all shadow-xl hover:-translate-y-0.5"
          >
            <div className="w-10 h-10 rounded-2xl bg-emerald-950/80 text-emerald-400 border border-emerald-800 flex items-center justify-center text-lg mb-3">
              📦
            </div>
            <h3 className="font-extrabold text-white text-sm group-hover:text-emerald-400 transition-colors">
              이카운트 재고관리
            </h3>
            <p className="text-[11px] text-zinc-400 mt-1 font-medium">
              실시간 마스터 원자재 & 부자재 재고 파싱
            </p>
          </Link>

          <Link
            href="/orders"
            className="group bg-zinc-900/80 hover:bg-zinc-800/90 border border-zinc-800 p-5 rounded-3xl transition-all shadow-xl hover:-translate-y-0.5"
          >
            <div className="w-10 h-10 rounded-2xl bg-blue-950/80 text-blue-400 border border-blue-800 flex items-center justify-center text-lg mb-3">
              📋
            </div>
            <h3 className="font-extrabold text-white text-sm group-hover:text-blue-400 transition-colors">
              제조지시기록서 (수주)
            </h3>
            <p className="text-[11px] text-zinc-400 mt-1 font-medium">
              공정일지, CCP 모니터링, 서명 승인
            </p>
          </Link>

          <Link
            href="/recipes"
            className="group bg-zinc-900/80 hover:bg-zinc-800/90 border border-zinc-800 p-5 rounded-3xl transition-all shadow-xl hover:-translate-y-0.5"
          >
            <div className="w-10 h-10 rounded-2xl bg-purple-950/80 text-purple-400 border border-purple-800 flex items-center justify-center text-lg mb-3">
              📜
            </div>
            <h3 className="font-extrabold text-white text-sm group-hover:text-purple-400 transition-colors">
              배합 레시피 관리
            </h3>
            <p className="text-[11px] text-zinc-400 mt-1 font-medium">
              원료 칭량, 수율 및 처방전 데이터베이스
            </p>
          </Link>

          <Link
            href="/LotGenerator"
            className="group bg-zinc-900/80 hover:bg-zinc-800/90 border border-zinc-800 p-5 rounded-3xl transition-all shadow-xl hover:-translate-y-0.5"
          >
            <div className="w-10 h-10 rounded-2xl bg-amber-950/80 text-amber-400 border border-amber-800 flex items-center justify-center text-lg mb-3">
              🏷️
            </div>
            <h3 className="font-extrabold text-white text-sm group-hover:text-amber-400 transition-colors">
              시리얼 LOT 발행기
            </h3>
            <p className="text-[11px] text-zinc-400 mt-1 font-medium">
              생산 이력 추적용 로트 번호 및 라벨 출력
            </p>
          </Link>
        </div>

        {/* 2열 하단 그리드 (월간 생산 계획표 및 실시간 메모) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* 생산 현황 요약 */}
          <div className="md:col-span-2 bg-zinc-900/80 border border-zinc-800 rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h2 className="text-base font-extrabold text-white flex items-center gap-2">
                <span>🗓️ 금일 생산 계획 & 가동 현황</span>
              </h2>
              <span className="text-xs font-mono text-zinc-400 font-bold">
                {currentDate.toLocaleDateString()}
              </span>
            </div>

            <div className="space-y-3 text-xs font-semibold">
              <div className="p-4 bg-zinc-950/60 border border-zinc-800 rounded-2xl flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  <div>
                    <div className="font-extrabold text-white">유기농 콜드브루 원두 추출 1라인</div>
                    <div className="text-[11px] text-zinc-400 mt-0.5 font-normal">계획 수량: 1,500 kg / 현재 달성율: 82%</div>
                  </div>
                </div>
                <span className="px-3 py-1 bg-emerald-950 text-emerald-300 border border-emerald-800 rounded-full text-[10px] font-extrabold">
                  가동 중
                </span>
              </div>

              <div className="p-4 bg-zinc-950/60 border border-zinc-800 rounded-2xl flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-400 animate-pulse"></span>
                  <div>
                    <div className="font-extrabold text-white">액상 스틱 파우치 충진 2라인</div>
                    <div className="text-[11px] text-zinc-400 mt-0.5 font-normal">계획 수량: 5,000 EA / 포장 검수 준비 완료</div>
                  </div>
                </div>
                <span className="px-3 py-1 bg-blue-950 text-blue-300 border border-blue-800 rounded-full text-[10px] font-extrabold">
                  정상 가동
                </span>
              </div>
            </div>
          </div>

          {/* 실시간 메모장 */}
          <div className="bg-zinc-900/80 border border-zinc-800 rounded-3xl p-6 shadow-2xl space-y-4 flex flex-col justify-between">
            <div>
              <h2 className="text-base font-extrabold text-white mb-3 flex items-center justify-between border-b border-zinc-800 pb-3">
                <span>📝 공정 특이사항 & 메모</span>
                <span className="text-[10px] bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded font-mono">{memos.length}건</span>
              </h2>

              <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1">
                {memos.map((m) => (
                  <div key={m.id} className="p-3 bg-zinc-950/60 border border-zinc-800/80 rounded-2xl text-xs">
                    <div className="text-zinc-200 font-semibold">{m.text}</div>
                    <div className="flex items-center justify-between text-[10px] text-zinc-500 font-mono mt-1.5">
                      <span>{m.author}</span>
                      <span>{m.date}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <form onSubmit={handleAddMemo} className="pt-2 border-t border-zinc-800 flex gap-2">
              <input
                type="text"
                value={newMemoText}
                onChange={(e) => setNewMemoText(e.target.value)}
                placeholder="공정 특이사항 등록..."
                className="flex-1 bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-white transition-colors"
              />
              <button type="submit" className="bg-white text-black font-extrabold text-xs px-3 py-2 rounded-xl hover:bg-zinc-200 transition-colors cursor-pointer shrink-0">
                등록
              </button>
            </form>
          </div>

        </div>

      </div>
    </div>
  );
}

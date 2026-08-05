"use client";

import React, { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import Link from "next/link";

export default function AdminCmsPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<"inquiries" | "calculator" | "portfolio" | "faq" | "settings">("inquiries");

  // 샘플 문의 내역 데이터
  const [inquiries] = useState([
    { id: 1, company: "(주)카카오프렌즈", name: "김철수", phone: "010-1234-5678", email: "cs@kacao.com", status: "답변완료", date: "2026-08-04" },
    { id: 2, company: "스타벅스 코리아", name: "이영희", phone: "010-9876-5432", email: "yh@starbucks.co.kr", status: "대기중", date: "2026-08-05" },
    { id: 3, company: "블루보틀 로스터리", name: "박민수", phone: "010-5555-4444", email: "ms@bluebottle.com", status: "상담중", date: "2026-08-05" },
  ]);

  return (
    <div className="min-h-screen bg-[#0b0b0b] text-zinc-100 p-6 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* 상단 헤더 & 브레드크럼 */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800 pb-5">
          <div>
            <div className="flex items-center gap-2 text-xs text-zinc-400 mb-1 font-bold">
              <Link href="/" className="hover:text-white transition-colors">업무 ERP 플랫폼</Link>
              <span>/</span>
              <span className="text-white">홈페이지 콘텐츠 관리 (CMS)</span>
            </div>
            <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
              🖥️ BEANSHEAL 브랜드 홈페이지 관리
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="bg-zinc-800 hover:bg-zinc-700 text-white font-extrabold text-xs px-4 py-2.5 rounded-xl border border-zinc-700 transition-all flex items-center gap-2"
            >
              <span>← 업무 ERP로 이동</span>
            </Link>
          </div>
        </div>

        {/* CMS 탭 메뉴 선택 바 */}
        <div className="flex bg-zinc-900/90 border border-zinc-800 p-1.5 rounded-2xl text-xs font-extrabold overflow-x-auto">
          <button
            onClick={() => setActiveTab("inquiries")}
            className={`px-4 py-2.5 rounded-xl transition-all whitespace-nowrap cursor-pointer ${
              activeTab === "inquiries" ? "bg-white text-black shadow-md" : "text-zinc-400 hover:text-white"
            }`}
          >
            📋 고객 견적 문의 관리 ({inquiries.length})
          </button>
          <button
            onClick={() => setActiveTab("calculator")}
            className={`px-4 py-2.5 rounded-xl transition-all whitespace-nowrap cursor-pointer ${
              activeTab === "calculator" ? "bg-white text-black shadow-md" : "text-zinc-400 hover:text-white"
            }`}
          >
            🧮 견적 산출기 옵션 설정
          </button>
          <button
            onClick={() => setActiveTab("portfolio")}
            className={`px-4 py-2.5 rounded-xl transition-all whitespace-nowrap cursor-pointer ${
              activeTab === "portfolio" ? "bg-white text-black shadow-md" : "text-zinc-400 hover:text-white"
            }`}
          >
            🖼️ 포트폴리오/원두 쇼케이스
          </button>
          <button
            onClick={() => setActiveTab("faq")}
            className={`px-4 py-2.5 rounded-xl transition-all whitespace-nowrap cursor-pointer ${
              activeTab === "faq" ? "bg-white text-black shadow-md" : "text-zinc-400 hover:text-white"
            }`}
          >
            ❓ 자주 묻는 질문 (FAQ)
          </button>
          <button
            onClick={() => setActiveTab("settings")}
            className={`px-4 py-2.5 rounded-xl transition-all whitespace-nowrap cursor-pointer ${
              activeTab === "settings" ? "bg-white text-black shadow-md" : "text-zinc-400 hover:text-white"
            }`}
          >
            ⚙️ 홈페이지 브랜드 설정
          </button>
        </div>

        {/* 탭 1: 고객 견적 문의 관리 */}
        {activeTab === "inquiries" && (
          <div className="bg-zinc-900/80 border border-zinc-800 rounded-3xl p-6 space-y-4 shadow-2xl">
            <h2 className="text-lg font-bold text-white flex items-center justify-between">
              <span>📩 접수된 고객 견적 및 제휴 문의</span>
              <span className="text-xs font-semibold text-zinc-400">총 {inquiries.length}건</span>
            </h2>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-medium border-collapse">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-400 font-bold bg-zinc-950/50">
                    <th className="p-3">NO</th>
                    <th className="p-3">회사/고객명</th>
                    <th className="p-3">담당자</th>
                    <th className="p-3">연락처</th>
                    <th className="p-3">이메일</th>
                    <th className="p-3">상태</th>
                    <th className="p-3">접수일</th>
                    <th className="p-3 text-right">관리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60 text-zinc-200 font-semibold">
                  {inquiries.map((item) => (
                    <tr key={item.id} className="hover:bg-zinc-800/40 transition-colors">
                      <td className="p-3 text-zinc-400">{item.id}</td>
                      <td className="p-3 font-extrabold text-white">{item.company}</td>
                      <td className="p-3">{item.name}</td>
                      <td className="p-3 font-mono">{item.phone}</td>
                      <td className="p-3">{item.email}</td>
                      <td className="p-3">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold ${
                          item.status === "답변완료" 
                            ? "bg-emerald-950 text-emerald-300 border border-emerald-800" 
                            : item.status === "상담중"
                            ? "bg-blue-950 text-blue-300 border border-blue-800"
                            : "bg-amber-950 text-amber-300 border border-amber-800"
                        }`}>
                          {item.status}
                        </span>
                      </td>
                      <td className="p-3 text-zinc-400 font-mono">{item.date}</td>
                      <td className="p-3 text-right space-x-2">
                        <button onClick={() => alert(`${item.company} 상세 상담 내역 조회`)} className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 rounded text-zinc-300 font-bold text-[11px] transition-colors cursor-pointer">
                          상세보기
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 탭 2: 견적 산출기 옵션 설정 */}
        {activeTab === "calculator" && (
          <div className="bg-zinc-900/80 border border-zinc-800 rounded-3xl p-6 space-y-4 shadow-2xl">
            <h2 className="text-lg font-bold text-white">🧮 견적 단가 및 최소 주문량(MOQ) 설정</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-semibold">
              <div className="p-4 bg-zinc-950/60 border border-zinc-800 rounded-2xl space-y-2">
                <label className="text-zinc-400 font-bold block">기본 원두 로스팅 단가 (1kg 당)</label>
                <input type="text" defaultValue="15,000 원" className="w-full bg-zinc-900 border border-zinc-700 rounded-xl p-2.5 text-white font-mono" />
              </div>
              <div className="p-4 bg-zinc-950/60 border border-zinc-800 rounded-2xl space-y-2">
                <label className="text-zinc-400 font-bold block">최소 수주 수량 (MOQ)</label>
                <input type="text" defaultValue="50 kg" className="w-full bg-zinc-900 border border-zinc-700 rounded-xl p-2.5 text-white font-mono" />
              </div>
            </div>
            <button onClick={() => alert("견적 단가 옵션이 저장되었습니다.")} className="px-5 py-2.5 bg-white text-black font-extrabold text-xs rounded-xl hover:bg-zinc-200 transition-colors cursor-pointer">
              설정 저장
            </button>
          </div>
        )}

        {/* 탭 3: 포트폴리오 관리 */}
        {activeTab === "portfolio" && (
          <div className="bg-zinc-900/80 border border-zinc-800 rounded-3xl p-6 space-y-4 shadow-2xl">
            <h2 className="text-lg font-bold text-white">🖼️ 메인 홈페이지 대표 원두 쇼케이스 등록</h2>
            <p className="text-xs text-zinc-400 leading-relaxed">
              고객용 홈페이지 랜딩 섹션에 노출할 원두 로스팅 스펙 및 브랜딩 이미지를 관리합니다.
            </p>
            <div className="p-8 border-2 border-dashed border-zinc-800 rounded-2xl text-center text-xs text-zinc-500 font-bold">
              새로운 로스팅 원두 이미지 및 설명 등록하기
            </div>
          </div>
        )}

        {/* 탭 4: FAQ 관리 */}
        {activeTab === "faq" && (
          <div className="bg-zinc-900/80 border border-zinc-800 rounded-3xl p-6 space-y-4 shadow-2xl">
            <h2 className="text-lg font-bold text-white">❓ 자주 묻는 질문 (FAQ) 편집</h2>
            <div className="space-y-3 text-xs font-semibold">
              <div className="p-3 bg-zinc-950/60 border border-zinc-800 rounded-xl">
                Q. 샘플 로스팅 신청은 어떻게 하나요?
              </div>
              <div className="p-3 bg-zinc-950/60 border border-zinc-800 rounded-xl">
                Q. 납품 기한 및 배송 일정은 몇 일 소요되나요?
              </div>
            </div>
          </div>
        )}

        {/* 탭 5: 홈페이지 브랜드 설정 */}
        {activeTab === "settings" && (
          <div className="bg-zinc-900/80 border border-zinc-800 rounded-3xl p-6 space-y-4 shadow-2xl">
            <h2 className="text-lg font-bold text-white">⚙️ 홈페이지 메타 정보 및 상담 대표전화</h2>
            <div className="space-y-3 text-xs font-semibold">
              <div>
                <label className="text-zinc-400 block mb-1">고객센터 대표번호</label>
                <input type="text" defaultValue="1588-0000" className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-2.5 text-white" />
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

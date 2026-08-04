"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import LoginModal from "@/components/LoginModal";

export default function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);

  const menuGroups = [
    {
      name: "기준정보 관리",
      items: [
        { name: "제품 및 레시피 목록", path: "/recipes" }
      ]
    },
    {
      name: "생산/발주 계획",
      items: [
        { name: "발주 자동 계산서", path: "/simulator" },
        { name: "작업지시서", path: "/work-order" }
      ]
    },
    {
      name: "제조/공정 실행",
      items: [
        { name: "제조지시기록서", path: "/orders" },
        { name: "시리얼 로트 생성", path: "/LotGenerator" }
      ]
    },
    {
      name: "자재/물류 관리",
      items: [
        { name: "이카운트 재고현황", path: "/inventory" },
        { name: "바코드 / QR 스캔", path: "/scan" }
      ]
    },
    {
      name: "품질/감사 (QA)",
      items: [
        { name: "감사 대응 (Audit)", path: "/audit" }
      ]
    },
    {
      name: "홈페이지 관리",
      items: [
        { name: "고객 견적 문의 관리", path: "/admin?tab=inquiries" },
        { name: "견적 산출기 옵션 설정", path: "/admin?tab=calculator" },
        { name: "포트폴리오 관리", path: "/admin?tab=portfolio" },
        { name: "FAQ 관리", path: "/admin?tab=faq" },
        { name: "홈페이지 시스템 설정", path: "/admin?tab=settings" }
      ]
    }
  ];

  return (
    <>
      <header className="bg-green-600 text-white sticky top-0 z-50 shadow-md border-b border-green
      -700 font-sans">
        <div className="max-w-7xl mx-auto px-4 md:px-6 flex items-center justify-between h-14">
          
          {/* 좌측 로고 홈 링크 */}
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center group cursor-pointer">
              <h1 className="text-2xl font-black tracking-tight text-white group-hover:text-red-100 transition-colors">
                BEANSHEAL
              </h1>
            </Link>
          </div>

          {/* 중앙 상단 가로 메뉴바 (GNB Dropdowns) */}
          <nav className="hidden md:flex items-center gap-1">
            {menuGroups.map((group) => {
              const hasActiveChild = group.items.some(item => pathname.startsWith(item.path));
              const isOpen = activeDropdown === group.name;

              return (
                <div 
                  key={group.name} 
                  className="relative"
                  onMouseEnter={() => setActiveDropdown(group.name)}
                  onMouseLeave={() => setActiveDropdown(null)}
                >
                  <button
                    onClick={() => setActiveDropdown(isOpen ? null : group.name)}
                    className={`flex items-center gap-1.5 px-3.5 py-2 text-sm font-bold rounded-md transition-all duration-200 cursor-pointer transform hover:scale-110 origin-center ${
                      hasActiveChild 
                        ? "bg-red-700 text-white font-extrabold shadow-inner" 
                        : "text-white/90 hover:bg-red-700/80 hover:text-white"
                    }`}
                  >
                    <span className="transition-transform duration-200">{group.name}</span>
                    <svg className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180 text-white" : "text-white/70"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {/* Dropdown Menu */}
                  {isOpen && (
                    <div className="absolute left-0 mt-0.5 w-56 bg-white text-slate-900 rounded-lg shadow-xl border border-red-100 py-1.5 z-50 animate-fadeIn">
                      {group.items.map((item) => {
                        const isActive = pathname.startsWith(item.path);
                        return (
                          <Link
                            key={item.path}
                            href={item.path}
                            className={`block px-4 py-2.5 text-sm font-bold transition-all duration-150 transform hover:scale-105 hover:pl-5 origin-left ${
                              isActive 
                                ? "bg-red-50 text-red-700 font-extrabold border-l-4 border-red-600" 
                                : "text-slate-700 hover:bg-red-50/70 hover:text-red-600"
                            }`}
                          >
                            {item.name}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          {/* 우측 사용자 프로필 및 로그인/로그아웃 */}
          <div className="flex items-center gap-2.5 text-xs">
            {user ? (
              <div className="flex items-center gap-2">
                <div className="bg-red-700/80 text-white border border-red-500/50 px-3 py-1 rounded-full font-bold flex items-center gap-2 shadow-2xs">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span>{user.name} ({user.role})</span>
                  {user.provider === "google" && (
                    <span className="text-[10px] bg-white/20 text-white px-1.5 py-0.2 rounded font-extrabold">
                      Google
                    </span>
                  )}
                </div>
                <button
                  onClick={logout}
                  className="text-red-100 hover:text-white font-bold px-2 py-1 rounded hover:bg-red-700/80 transition-colors cursor-pointer"
                  title="로그아웃"
                >
                  로그아웃
                </button>
              </div>
            ) : (
              <button
                onClick={() => setIsLoginModalOpen(true)}
                className="bg-white hover:bg-red-50 text-red-600 font-extrabold px-4 py-1.5 rounded-full shadow-xs transition-colors cursor-pointer"
              >
                로그인
              </button>
            )}
          </div>

        </div>
      </header>

      {/* 모달 팝업 */}
      <LoginModal 
        isOpen={isLoginModalOpen} 
        onClose={() => setIsLoginModalOpen(false)} 
      />
    </>
  );
}
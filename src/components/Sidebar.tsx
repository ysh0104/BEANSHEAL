"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import LoginModal from "@/components/LoginModal";

export default function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const handleLogout = () => {
    logout();
    window.location.href = "/login";
  };
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);

  // 로그인 페이지 및 메인 고객 홈페이지에서는 상단 메뉴바 숨김 처리
  if (pathname === "/login" || pathname === "/") {
    return null;
  }

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
        { name: "고객 견적 문의 관리", path: "/admin/cms?tab=inquiries" },
        { name: "견적 산출기 옵션 설정", path: "/admin/cms?tab=calculator" },
        { name: "포트폴리오 관리", path: "/admin/cms?tab=portfolio" },
        { name: "FAQ 관리", path: "/admin/cms?tab=faq" },
        { name: "홈페이지 시스템 설정", path: "/admin/cms?tab=settings" }
      ]
    }
  ];

  return (
    <>
      <header className="bg-[#0b0b0b]/90 backdrop-blur-md text-zinc-100 sticky top-0 z-50 border-b border-zinc-800/80 font-sans">
        <div className="max-w-7xl mx-auto px-4 md:px-6 flex items-center justify-between h-14 gap-3 whitespace-nowrap">
          
          {/* 좌측 로고 홈 링크 */}
          <div className="flex items-center gap-4 shrink-0">
            <Link href="https://beansheal.vercel.app/workspace#" className="flex items-center group cursor-pointer">
              <h1 className="text-xl md:text-2xl font-black tracking-tight text-white group-hover:text-zinc-300 transition-colors">
                BEANSHEAL
              </h1>
            </Link>
          </div>

          {/* 중앙 상단 가로 메뉴바 (GNB Dropdowns) */}
          <nav className="hidden md:flex items-center gap-0.5 shrink-0">
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
                    className={`flex items-center gap-1 px-2.5 py-1.5 text-xs md:text-sm font-bold rounded-md transition-all duration-200 cursor-pointer ${
                      hasActiveChild 
                        ? "bg-zinc-800 text-white font-extrabold" 
                        : "text-zinc-400 hover:bg-zinc-800/50 hover:text-white"
                    }`}
                  >
                    <span>{group.name}</span>
                    <svg className={`w-3.5 h-3.5 transition-transform ${isOpen ? "rotate-180 text-white" : "text-zinc-500"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {/* Dropdown Menu */}
                  {isOpen && (
                    <div className="absolute left-0 mt-1 w-56 bg-[#121214] text-zinc-100 rounded-xl shadow-2xl border border-zinc-800 py-1.5 z-50 animate-fadeIn backdrop-blur-xl">
                      {group.items.map((item) => {
                        const isActive = pathname.startsWith(item.path);
                        return (
                          <Link
                            key={item.path}
                            href={item.path}
                            className={`block px-4 py-2.5 text-sm font-bold transition-all duration-150 ${
                              isActive 
                                ? "bg-zinc-800 text-white font-extrabold border-l-4 border-white" 
                                : "text-zinc-400 hover:bg-zinc-800/60 hover:text-white"
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
          <div className="flex items-center gap-2 text-xs shrink-0">
            {user ? (
              <div className="flex items-center gap-1.5">
                <div className="bg-zinc-900/90 text-zinc-200 border border-zinc-800 px-2.5 py-1 rounded-full font-bold flex items-center gap-1.5 shadow-2xs whitespace-nowrap shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0"></span>
                  <span className="text-xs font-extrabold text-white">{user.name}</span>
                  <span className="text-[10px] text-zinc-400 font-medium">
                    ({user.jobTitle ? user.jobTitle : `${user.department || '생산'} ${user.position || '사원'}`})
                  </span>
                  {user.provider === "google" && (
                    <span className="text-[9px] bg-blue-950 text-blue-300 border border-blue-800 px-1.5 py-0.2 rounded font-extrabold shrink-0">
                      Google
                    </span>
                  )}
                </div>
                <button
                  onClick={handleLogout}
                  className="text-zinc-400 hover:text-red-400 text-xs font-bold px-1.5 py-1 rounded hover:bg-zinc-800/60 transition-colors cursor-pointer shrink-0"
                  title="로그아웃"
                >
                  로그아웃
                </button>
              </div>
            ) : (
              <button
                onClick={() => setIsLoginModalOpen(true)}
                className="bg-white hover:bg-zinc-200 text-black font-extrabold px-3.5 py-1.5 rounded-full shadow-xs transition-colors cursor-pointer text-xs shrink-0"
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
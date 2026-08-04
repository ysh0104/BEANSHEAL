"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Sidebar() {
  const pathname = usePathname();
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

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
    }
  ];

  return (
    <header className="bg-slate-900 text-white sticky top-0 z-50 shadow-md border-b border-slate-800 font-sans">
      <div className="max-w-7xl mx-auto px-4 md:px-6 flex items-center justify-between h-14">
        
        {/* 좌측 로고 및 대시보드 홈 링크 */}
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2 group cursor-pointer">
            <span className="bg-blue-600 text-white p-1.5 rounded-lg text-xs font-black tracking-tighter group-hover:bg-blue-500 transition-colors">
              ERP
            </span>
            <h1 className="text-lg font-black tracking-tight text-white group-hover:text-blue-200 transition-colors">
              BEANSHEAL
            </h1>
          </Link>

          <Link
            href="/"
            className={`text-xs font-bold px-3 py-1.5 rounded-md transition-colors ${
              pathname === "/" ? "bg-blue-600 text-white" : "text-slate-300 hover:bg-slate-800 hover:text-white"
            }`}
          >
            🏠 대시보드
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
                  className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-md transition-all cursor-pointer ${
                    hasActiveChild 
                      ? "bg-slate-800 text-blue-400 border-b-2 border-blue-500" 
                      : "text-slate-300 hover:bg-slate-800 hover:text-white"
                  }`}
                >
                  <span>{group.name}</span>
                  <svg className={`w-3.5 h-3.5 transition-transform ${isOpen ? "rotate-180 text-blue-400" : "text-slate-400"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* Dropdown Menu */}
                {isOpen && (
                  <div className="absolute left-0 mt-0.5 w-48 bg-white text-slate-900 rounded-lg shadow-xl border border-slate-200 py-1.5 z-50 animate-fadeIn">
                    {group.items.map((item) => {
                      const isActive = pathname.startsWith(item.path);
                      return (
                        <Link
                          key={item.path}
                          href={item.path}
                          className={`block px-4 py-2 text-xs font-bold transition-colors ${
                            isActive 
                              ? "bg-blue-50 text-blue-700 font-extrabold border-l-4 border-blue-600" 
                              : "text-slate-700 hover:bg-slate-100 hover:text-slate-900"
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

        {/* 우측 사용자 프로필 및 관리자 대시보드 바로가기 */}
        <div className="flex items-center gap-3 text-xs">
          <a
            href="/admin"
            className="bg-emerald-700 hover:bg-emerald-600 text-white border border-emerald-500 px-3 py-1 rounded-md text-xs font-extrabold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
            title="빈스힐 홈페이지 통합 관리자 대시보드로 이동합니다 (admin.html)"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-300 animate-pulse"></span>
            <span>⚙️ 관리자 시스템</span>
          </a>
          <div className="bg-slate-800 text-slate-300 border border-slate-700 px-3 py-1 rounded-full font-medium hidden sm:flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span>관리자</span>
          </div>
        </div>

      </div>
    </header>
  );
}
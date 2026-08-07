"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import LoginModal from "@/components/LoginModal";
import { canUserView } from "@/hooks/useCanEdit";
import { MENU_FEATURE_MAP } from "@/lib/permissions";

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

  const isAdmin =
    user?.role === "ADMIN" ||
    user?.department?.includes("경영") ||
    user?.position === "관리자" ||
    user?.position === "대표" ||
    user?.position === "대표이사" ||
    user?.permissionGroupName === "전체관리자" ||
    !!user?.permissions?.admin_users?.can_edit;

  const rawMenuGroups = [
    {
      name: "기준정보 관리",
      items: [
        { name: "제품 BOM (레시피)", path: "/recipes" }
      ]
    },
    {
      name: "생산/발주 계획",
      items: [
        { name: "발주 계산 · 구매전송", path: "/simulator" },
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
        { name: "재고 · 생산입고", path: "/inventory" },
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
    },
    {
      name: "시스템/사용자 관리",
      items: [
        { name: "사용자 및 권한 설정", path: "/admin/users" }
      ]
    }
  ];

  // 🌟 시스템/사용자 관리 탭은 관리자 권한(isAdmin)이 있는 경우에만 메뉴에 노출
  const menuGroups = rawMenuGroups.filter((group) => {
    const featureKey = MENU_FEATURE_MAP[group.name];
    if (group.name === "시스템/사용자 관리" || featureKey === "admin_users") {
      return isAdmin;
    }
    if (!featureKey) return true;
    if (!user?.permissions) {
      if (featureKey === "cms") return isAdmin;
      return true;
    }
    return canUserView(user, featureKey);
  });

  return (
    <>
      <header className="bg-white/95 backdrop-blur-md text-slate-900 sticky top-0 z-50 border-b border-slate-200 shadow-2xs font-sans">
        <div className="max-w-7xl mx-auto px-4 md:px-6 flex items-center justify-between h-14 gap-3 whitespace-nowrap">
          
          {/* 좌측 로고 홈 링크 */}
          <div className="flex items-center gap-4 shrink-0">
            <Link href="/workspace" className="flex items-center group cursor-pointer">
              <img
                src="/images/beansheal-logo.png"
                alt="BEANSHEAL"
                className="h-7 md:h-8 w-auto max-w-[180px] object-contain opacity-95 group-hover:opacity-80 transition-opacity"
              />
            </Link>
          </div>

          {/* 중앙 상단 가로 메뉴바 (GNB Dropdowns) */}
          <nav className="hidden md:flex items-center gap-0.5 shrink-0">
            {menuGroups.map((group) => {
              const hasActiveChild = group.items.some(item => {
                const basePath = item.path.split("?")[0];
                return pathname === basePath || pathname.startsWith(basePath + "/");
              });
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
                    className={`flex items-center gap-1 px-3 py-1.5 text-xs md:text-sm font-bold rounded-lg transition-all duration-150 cursor-pointer ${
                      isOpen 
                        ? "bg-slate-100 text-slate-900" 
                        : "text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                    }`}
                  >
                    <span>{group.name}</span>
                    <svg className={`w-3.5 h-3.5 transition-transform ${isOpen ? "rotate-180 text-slate-700" : "text-slate-400"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {/* Dropdown Menu - 화사한 화이트 서브 메뉴 스티키 */}
                  {isOpen && (
                    <div className="absolute left-0 top-full pt-1.5 w-56 z-50 animate-fadeIn">
                      <div className="bg-white text-slate-900 rounded-xl shadow-xl border border-slate-200/90 p-1 backdrop-blur-xl">
                        {group.items.map((item) => (
                          <Link
                            key={item.path}
                            href={item.path}
                            onClick={() => setActiveDropdown(null)}
                            className="block px-4 py-2.5 text-xs md:text-sm font-bold text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors duration-150 rounded-lg"
                          >
                            {item.name}
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          {/* 우측 사용자 프로필 및 로그인/로그아웃 */}
          <div className="flex items-center gap-2 text-xs shrink-0">
            {user ? (
              <div className="flex items-center gap-2">
                <div className="bg-slate-100 text-slate-800 border border-slate-200 px-3 py-1 rounded-full font-bold flex items-center gap-1.5 shadow-2xs whitespace-nowrap shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0"></span>
                  <span className="text-xs font-extrabold text-slate-900">{user.name}</span>
                  <span className="text-xs text-slate-700 font-bold">
                    ({user.jobTitle ? user.jobTitle : `${user.department || '생산'} ${user.position || '사원'}`})
                  </span>
                </div>
                <button
                  onClick={handleLogout}
                  className="text-slate-500 hover:text-red-600 text-xs font-bold px-2 py-1 rounded hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
                  title="로그아웃"
                >
                  로그아웃
                </button>
              </div>
            ) : (
              <button
                onClick={() => setIsLoginModalOpen(true)}
                className="bg-slate-900 hover:bg-slate-800 text-white font-extrabold px-3.5 py-1.5 rounded-full shadow-xs transition-colors cursor-pointer text-xs shrink-0"
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
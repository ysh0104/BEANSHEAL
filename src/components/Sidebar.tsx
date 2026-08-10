"use client";

import React, { useState, useEffect } from "react";
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
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [mobileExpandedGroup, setMobileExpandedGroup] = useState<string | null>(null);

  useEffect(() => {
    setIsMobileMenuOpen(false);
    setMobileExpandedGroup(null);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = isMobileMenuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isMobileMenuOpen]);

  if (!pathname || pathname === "/login" || pathname === "/") {
    return null;
  }

  const isAdmin =
    user?.role === "ADMIN" ||
    !!user?.department?.includes("경영") ||
    user?.position === "대표" ||
    user?.position === "대표이사" ||
    user?.position === "이사" ||
    user?.permissionGroupName === "전체관리자" ||
    !!user?.permissions?.admin_users?.can_edit;

  const rawMenuGroups = [
    {
      name: "기준정보 관리",
      items: [{ name: "제품 BOM (레시피)", path: "/recipes" }],
    },
    {
      name: "생산/발주 계획",
      items: [
        { name: "발주 계산 · 구매전송", path: "/simulator" },
        { name: "작업지시서", path: "/work-order" },
      ],
    },
    {
      name: "제조/공정 실행",
      items: [
        { name: "제조지시기록서", path: "/orders" },
        { name: "시리얼 로트 생성", path: "/LotGenerator" },
      ],
    },
    {
      name: "자재/물류 관리",
      items: [
        { name: "재고 · 생산입고", path: "/inventory" },
        { name: "바코드 / QR 스캔", path: "/scan" },
      ],
    },
    {
      name: "품질/감사 (QA)",
      items: [
        { name: "감사 대응 (Audit)", path: "/audit" },
        { name: "기기 검·교정 관리대장", path: "/audit?tab=calibration" },
      ],
    },
    {
      name: "홈페이지 관리",
      items: [
        { name: "고객 견적 문의 관리", path: "/admin/cms?tab=inquiries" },
        { name: "견적 산출기 옵션 설정", path: "/admin/cms?tab=calculator" },
        { name: "포트폴리오 관리", path: "/admin/cms?tab=portfolio" },
        { name: "FAQ 관리", path: "/admin/cms?tab=faq" },
        { name: "홈페이지 시스템 설정", path: "/admin/cms?tab=settings" },
      ],
    },
    {
      name: "시스템/사용자 관리",
      items: [{ name: "사용자 및 권한 설정", path: "/admin/users" }],
    },
  ];

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

  const isActivePath = (path: string) => {
    if (!pathname) return false;
    const basePath = path.split("?")[0];
    return pathname === basePath || pathname.startsWith(basePath + "/");
  };

  return (
    <>
      <header className="bg-white/95 backdrop-blur-md text-slate-900 sticky top-0 z-50 border-b border-slate-200 shadow-2xs font-sans">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 flex items-center justify-between h-14 gap-2 min-w-0">
          <div className="flex items-center gap-2 sm:gap-4 shrink-0 min-w-0">
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(true)}
              className="md:hidden p-2 -ml-1 rounded-lg text-slate-700 hover:bg-slate-100 cursor-pointer shrink-0"
              aria-label="메뉴 열기"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <Link href="/workspace" className="flex items-center group cursor-pointer min-w-0">
              <img
                src="/images/beansheal-logo.png"
                alt="BEANSHEAL"
                className="h-6 sm:h-7 md:h-8 w-auto max-w-[140px] sm:max-w-[180px] object-contain opacity-95 group-hover:opacity-80 transition-opacity"
              />
            </Link>
          </div>

          <nav className="hidden md:flex items-center gap-0.5 shrink-0">
            {menuGroups.map((group) => {
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
                    <svg
                      className={`w-3.5 h-3.5 transition-transform ${isOpen ? "rotate-180 text-slate-700" : "text-slate-400"}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {isOpen && (
                    <div className="absolute left-0 top-full pt-1.5 w-56 z-50 animate-fadeIn">
                      <div className="bg-white text-slate-900 rounded-xl shadow-xl border border-slate-200/90 p-1 backdrop-blur-xl">
                        {group.items.map((item) => (
                          <Link
                            key={item.path}
                            href={item.path}
                            onClick={() => setActiveDropdown(null)}
                            className={`block px-4 py-2.5 text-xs md:text-sm font-bold transition-colors duration-150 rounded-lg ${
                              isActivePath(item.path)
                                ? "bg-indigo-50 text-indigo-800"
                                : "text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                            }`}
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

          <div className="flex items-center gap-1 sm:gap-2 text-xs shrink-0 min-w-0">
            {user ? (
              <div className="flex items-center gap-1 sm:gap-2 min-w-0">
                <div className="bg-slate-100 text-slate-800 border border-slate-200 px-2 sm:px-3 py-1 rounded-full font-bold flex items-center gap-1 sm:gap-1.5 shadow-2xs min-w-0 max-w-[160px] sm:max-w-none">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                  <span className="text-xs font-extrabold text-slate-900 truncate">{user.name}</span>
                  <span className="hidden sm:inline text-xs text-slate-700 font-bold truncate">
                    ({user.jobTitle ? user.jobTitle : `${user.department || "생산"} ${user.position || "사원"}`})
                  </span>
                </div>
                <button
                  onClick={handleLogout}
                  className="text-slate-500 hover:text-red-600 text-xs font-bold px-1.5 sm:px-2 py-1 rounded hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
                  title="로그아웃"
                >
                  <span className="hidden sm:inline">로그아웃</span>
                  <span className="sm:hidden">↪</span>
                </button>
              </div>
            ) : (
              <button
                onClick={() => setIsLoginModalOpen(true)}
                className="bg-slate-900 hover:bg-slate-800 text-white font-extrabold px-3 sm:px-3.5 py-1.5 rounded-full shadow-xs transition-colors cursor-pointer text-xs shrink-0"
              >
                로그인
              </button>
            )}
          </div>
        </div>
      </header>

      {/* 모바일 드로어 메뉴 */}
      {isMobileMenuOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/40 z-[60] md:hidden"
            onClick={() => setIsMobileMenuOpen(false)}
            aria-hidden
          />
          <div className="fixed inset-y-0 left-0 w-[min(100vw-3rem,320px)] bg-white z-[70] shadow-2xl flex flex-col md:hidden animate-fadeIn">
            <div className="flex items-center justify-between px-4 h-14 border-b border-slate-200 shrink-0">
              <span className="text-sm font-extrabold text-slate-900">메뉴</span>
              <button
                type="button"
                onClick={() => setIsMobileMenuOpen(false)}
                className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
                aria-label="메뉴 닫기"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto py-2">
              <Link
                href="/workspace"
                onClick={() => setIsMobileMenuOpen(false)}
                className={`block mx-2 mb-2 px-4 py-3 text-sm font-extrabold rounded-xl ${
                  pathname === "/workspace"
                    ? "bg-indigo-50 text-indigo-800 border border-indigo-200"
                    : "text-slate-800 hover:bg-slate-50 border border-transparent"
                }`}
              >
                대시보드
              </Link>

              {menuGroups.map((group) => {
                const expanded = mobileExpandedGroup === group.name;
                const hasActive = group.items.some((item) => isActivePath(item.path));

                return (
                  <div key={group.name} className="border-b border-slate-100 last:border-0">
                    <button
                      type="button"
                      onClick={() => setMobileExpandedGroup(expanded ? null : group.name)}
                      className={`w-full flex items-center justify-between px-4 py-3 text-sm font-bold cursor-pointer ${
                        hasActive ? "text-indigo-700 bg-indigo-50/50" : "text-slate-800 hover:bg-slate-50"
                      }`}
                    >
                      <span>{group.name}</span>
                      <svg
                        className={`w-4 h-4 transition-transform ${expanded ? "rotate-180" : ""}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {expanded && (
                      <div className="pb-2 bg-slate-50/80">
                        {group.items.map((item) => (
                          <Link
                            key={item.path}
                            href={item.path}
                            onClick={() => setIsMobileMenuOpen(false)}
                            className={`block pl-6 pr-4 py-2.5 text-sm font-semibold ${
                              isActivePath(item.path)
                                ? "text-indigo-800 bg-indigo-50"
                                : "text-slate-600 hover:text-slate-900 hover:bg-white"
                            }`}
                          >
                            {item.name}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </nav>

            {user && (
              <div className="border-t border-slate-200 p-4 shrink-0">
                <p className="text-xs font-bold text-slate-500 mb-1">로그인 계정</p>
                <p className="text-sm font-extrabold text-slate-900">{user.name}</p>
                <p className="text-xs text-slate-600 mt-0.5">
                  {user.jobTitle || `${user.department || "생산"} ${user.position || "사원"}`}
                </p>
              </div>
            )}
          </div>
        </>
      )}

      <LoginModal isOpen={isLoginModalOpen} onClose={() => setIsLoginModalOpen(false)} />
    </>
  );
}

"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { canUserView } from "@/hooks/useCanEdit";
import { MENU_FEATURE_MAP } from "@/lib/permissions";

export default function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const handleLogout = async () => {
    setIsUserMenuOpen(false);
    setIsMobileMenuOpen(false);
    await logout();
    window.location.href = "/login";
  };
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [mobileExpandedGroup, setMobileExpandedGroup] = useState<string | null>(null);
  const userMenuRef = React.useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (!isUserMenuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [isUserMenuOpen]);

  if (!pathname || pathname === "/login" || pathname === "/" || pathname.startsWith("/auth/")) {
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
        { name: "건강진단결과서 (보건증)", path: "/audit?tab=health" },
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
    if (!user) return false;
    const featureKey = MENU_FEATURE_MAP[group.name];
    if (group.name === "시스템/사용자 관리" || featureKey === "admin_users") {
      return isAdmin;
    }
    if (!featureKey) return true;
    if (!user.permissions) {
      if (featureKey === "cms") return isAdmin;
      return true;
    }
    return canUserView(user, featureKey);
  });

  const isActivePath = (path: string) => {
    if (!pathname) return false;
    if (path.includes("?")) {
      const [basePath, queryStr] = path.split("?");
      if (pathname !== basePath) return false;
      if (typeof window !== "undefined") {
        return window.location.search.includes(queryStr);
      }
      return false;
    } else {
      if (typeof window !== "undefined" && window.location.search.includes("tab=calibration") && path === "/audit") {
        return false;
      }
      return pathname === path || pathname.startsWith(path + "/");
    }
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
            <Link
              href="/"
              className="hidden sm:inline-flex items-center gap-1 px-2 py-1.5 sm:px-2.5 text-[11px] md:text-xs font-extrabold text-slate-600 hover:text-emerald-800 bg-slate-50 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-200 rounded-lg transition-colors shrink-0"
              title="고객 홈페이지로 이동"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0h4" />
              </svg>
              홈페이지
            </Link>
          </div>

          <nav className="hidden md:flex items-center gap-0.5 shrink-0">
            {user ? (
              menuGroups.map((group) => {
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
            })
            ) : (
              <span className="px-3 py-1.5 text-xs font-bold text-slate-500">
                로그인 후 메뉴를 이용할 수 있습니다
              </span>
            )}
          </nav>

          <div className="flex items-center gap-1 sm:gap-2 text-xs shrink-0 min-w-0">
            {user ? (
              <div ref={userMenuRef} className="relative flex items-center min-w-0">
                <button
                  type="button"
                  onClick={() => setIsUserMenuOpen((open) => !open)}
                  className="bg-slate-100 text-slate-800 border border-slate-200 px-2 sm:px-3 py-1 rounded-full font-bold flex items-center gap-1 sm:gap-1.5 shadow-2xs min-w-0 max-w-[180px] sm:max-w-none hover:bg-slate-200/80 transition-colors cursor-pointer"
                  aria-expanded={isUserMenuOpen}
                  aria-haspopup="menu"
                  title="계정 메뉴"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                  <span className="text-xs font-extrabold text-slate-900 truncate">{user.name}</span>
                  <span className="hidden sm:inline text-xs text-slate-700 font-bold truncate">
                    ({user.jobTitle ? user.jobTitle : `${user.department || "생산"} ${user.position || "사원"}`})
                  </span>
                  <svg
                    className={`w-3.5 h-3.5 shrink-0 text-slate-500 transition-transform ${isUserMenuOpen ? "rotate-180" : ""}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    aria-hidden
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {isUserMenuOpen && (
                  <div className="absolute right-0 top-full pt-2 w-56 z-[80] animate-fadeIn">
                    <div className="bg-white text-slate-900 rounded-xl shadow-xl border border-slate-200/90 p-1 backdrop-blur-xl">
                      <div className="px-3 py-2 border-b border-slate-100 mb-1">
                        <p className="text-xs font-extrabold text-slate-900 truncate">{user.name}</p>
                        <p className="text-[11px] text-slate-500 truncate mt-0.5">{user.email}</p>
                      </div>
                      <button
                        type="button"
                        onClick={handleLogout}
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-bold text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                      >
                        <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                          />
                        </svg>
                        로그아웃
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <Link
                href="/login"
                className="bg-slate-900 hover:bg-slate-800 text-white font-extrabold px-3 sm:px-3.5 py-1.5 rounded-full shadow-xs transition-colors cursor-pointer text-xs shrink-0"
              >
                로그인
              </Link>
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
              <Link
                href="/"
                onClick={() => setIsMobileMenuOpen(false)}
                className="block mx-2 mb-2 px-4 py-3 text-sm font-extrabold rounded-xl text-emerald-800 hover:bg-emerald-50 border border-emerald-100"
              >
                홈페이지
              </Link>

              {user ? (
                menuGroups.map((group) => {
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
              })
              ) : (
                <div className="mx-4 my-3 p-4 bg-slate-50 border border-slate-200 rounded-xl text-center">
                  <p className="text-sm font-extrabold text-slate-900 mb-1">로그인이 필요합니다</p>
                  <p className="text-xs text-slate-600 leading-relaxed mb-4">
                    ERP 메뉴와 기능은 사내 계정 로그인 후 이용할 수 있습니다.
                  </p>
                  <Link
                    href="/login"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="inline-flex items-center justify-center w-full bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-sm px-4 py-3 rounded-xl transition-colors"
                  >
                    로그인하기
                  </Link>
                </div>
              )}
            </nav>

            {!user && (
              <div className="border-t border-slate-200 p-4 shrink-0">
                <Link
                  href="/login"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition-colors"
                >
                  로그인
                </Link>
              </div>
            )}

            {user && (
              <div className="border-t border-slate-200 p-4 shrink-0 space-y-3">
                <div>
                  <p className="text-xs font-bold text-slate-500 mb-1">로그인 계정</p>
                  <p className="text-sm font-extrabold text-slate-900">{user.name}</p>
                  <p className="text-xs text-slate-600 mt-0.5">
                    {user.jobTitle || `${user.department || "생산"} ${user.position || "사원"}`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-bold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-xl transition-colors cursor-pointer"
                >
                  <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                    />
                  </svg>
                  로그아웃
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}

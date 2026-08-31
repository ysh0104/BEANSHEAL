"use client";

import React from "react";
import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import AuthGate from "@/components/AuthGate";

export default function LayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // 고객용 공식 메인 홈페이지(/) 또는 로그인 화면(/login)인 경우:
  // 상단 바, 패딩(p-4), 최대 가로폭(max-w-7xl) 제한 없이 100% 풀스크린 렌더링
  const isFullWidthPage =
    pathname === "/" || pathname === "/login" || pathname?.startsWith("/auth/");

  if (isFullWidthPage) {
    return (
      <div className="w-full min-h-screen bg-white text-slate-900 m-0 p-0 overflow-x-hidden">
        {children}
      </div>
    );
  }

  // 사내 업무 ERP 관련 페이지(/workspace, /inventory 등)인 경우:
  // 원래의 화사한 라이트 슬레이트 배경(bg-slate-100 text-slate-900) 적용 및 넓은 와이드 스크린 레이아웃(max-w-[1920px])
  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col antialiased">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-2 sm:p-4 md:p-6 max-w-[1920px] mx-auto w-full min-w-0">
        <AuthGate>{children}</AuthGate>
      </main>
    </div>
  );
}

"use client";

import React from "react";
import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";

export default function LayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // 고객용 공식 메인 홈페이지(/) 또는 로그인 화면(/login)인 경우:
  // 상단 바, 패딩(p-4), 최대 가로폭(max-w-7xl) 제한 없이 100% 풀스크린 렌더링
  const isFullWidthPage = pathname === "/" || pathname === "/login";

  if (isFullWidthPage) {
    return (
      <div className="w-full min-h-screen bg-white text-slate-900 m-0 p-0 overflow-x-hidden">
        {children}
      </div>
    );
  }

  // 사내 업무 ERP 관련 페이지(/workspace, /inventory 등)인 경우:
  // 상단 GNB 메뉴바 노출 및 중앙 정렬 레이아웃 적용
  return (
    <div className="min-h-screen bg-[#0b0b0b] text-zinc-100 flex flex-col antialiased selection:bg-zinc-800 selection:text-white">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-4 md:p-6 max-w-7xl mx-auto w-full">
        {children}
      </main>
    </div>
  );
}

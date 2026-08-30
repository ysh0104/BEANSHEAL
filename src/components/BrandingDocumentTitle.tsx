"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { pageTitle } from "@/lib/branding";

/** 클라이언트 라우팅 시 브라우저 탭 제목을 Connect / Workspace / Platform에 맞게 갱신 */
export default function BrandingDocumentTitle() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname) return;

    if (pathname === "/" || pathname === "/homepage.html") {
      document.title = pageTitle("connect");
      return;
    }

    if (pathname === "/login" || pathname.startsWith("/auth/")) {
      document.title = pageTitle("workspace", "로그인");
      return;
    }

    const erpPaths = [
      "/workspace",
      "/orders",
      "/inventory",
      "/recipes",
      "/work-order",
      "/simulator",
      "/scan",
      "/audit",
      "/labels",
      "/LotGenerator",
      "/admin",
    ];

    if (erpPaths.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
      document.title = pageTitle("workspace");
      return;
    }

    document.title = pageTitle("platform");
  }, [pathname]);

  return null;
}

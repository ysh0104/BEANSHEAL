import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// 사원/관리자 업무 ERP 전용 보호 경로 목록
const PROTECTED_ROUTES = [
  "/workspace",
  "/inventory",
  "/orders",
  "/recipes",
  "/work-order",
  "/LotGenerator",
  "/labels",
  "/scan",
  "/audit",
  "/simulator",
  "/admin",
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // legacy html 라우트 요청 시 표준 Next.js 라우트로 자동 리다이렉트
  if (pathname === "/login.html") {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (pathname === "/index.html" || pathname === "/page.html" || pathname === "/page.tsx" || pathname === "/homepage.html") {
    return NextResponse.redirect(new URL("/", request.url));
  }
  if (pathname === "/admin.html") {
    return NextResponse.redirect(new URL("/admin/cms", request.url));
  }

  // Supabase Auth 토큰 쿠키 존재 여부 확인 (기본 미들웨어 검증)
  const hasAuthToken = request.cookies.getAll().some(cookie => cookie.name.includes("auth-token"));

  // 보호 대상 업무 라우트 접근 시 미인증 사용자는 로그인 페이지로 리다이렉트
  const isProtectedRoute = PROTECTED_ROUTES.some(route => pathname.startsWith(route));

  if (isProtectedRoute && !hasAuthToken) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * 아래 경로를 제외한 모든 요청 경로에 미들웨어 적용:
     * - api (API 라우트)
     * - _next/static (정적 뷰 렌더링 파일)
     * - _next/image (이미지 최적화 파일)
     * - favicon.ico, images/ (정적 파일)
     */
    "/((?!api|_next/static|_next/image|favicon.ico|images|legacy).*)",
  ],
};

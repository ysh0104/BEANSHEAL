import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 메인 루트(/) 접속 시 항상 고객용 공식 HTML 웹사이트(homepage.html)로 라이브 리라이트
  if (pathname === "/") {
    return NextResponse.rewrite(new URL("/homepage.html", request.url));
  }

  // 레거시 HTML/파일명 요청 시 표준 Next.js 라우트로 자동 리다이렉트
  if (pathname === "/login.html") {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (pathname === "/index.html" || pathname === "/page.html" || pathname === "/page.tsx") {
    return NextResponse.redirect(new URL("/", request.url));
  }
  if (pathname === "/admin.html") {
    return NextResponse.redirect(new URL("/admin/cms", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|images|css|js).*)"],
};

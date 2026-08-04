import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  if (pathname === '/') {
    return NextResponse.rewrite(new URL('/homepage.html', request.url));
  }
}

export const config = {
  matcher: '/',
};

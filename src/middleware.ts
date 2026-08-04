import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  if (pathname === '/index.html' || pathname === '/') {
    return NextResponse.rewrite(new URL('/admin.html', request.url));
  }
}

export const config = {
  matcher: ['/', '/index.html'],
};

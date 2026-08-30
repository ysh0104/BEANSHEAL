"use client";

import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { BRAND } from "@/lib/branding";

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center min-h-[50vh] p-6">
        <div className="flex items-center gap-3 text-slate-600 font-bold text-sm bg-white px-5 py-3 rounded-xl shadow-xs border border-slate-200">
          <span className="w-4 h-4 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
          <span>로그인 상태를 확인하는 중입니다...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-1 items-center justify-center min-h-[50vh] p-6">
        <div className="bg-white border border-slate-200 p-8 rounded-2xl shadow-md text-center max-w-md w-full">
          <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl">
            🔐
          </div>
          <h2 className="text-lg font-extrabold text-slate-900 mb-2">로그인이 필요합니다</h2>
          <p className="text-sm text-slate-600 leading-relaxed mb-6">
            {BRAND.workspace} 기능은 로그인한 사원만 이용할 수 있습니다.
            <br />
            사내 계정으로 로그인해 주세요.
          </p>
          <div className="flex flex-col gap-2">
            <Link
              href="/login"
              className="bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-sm px-5 py-3 rounded-xl shadow-xs transition-colors w-full text-center"
            >
              로그인하기
            </Link>
            <Link
              href="/"
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm px-5 py-3 rounded-xl transition-colors w-full text-center border border-slate-200"
            >
              {BRAND.connect}로 이동
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

"use client";

import React, { useEffect } from "react";
import Link from "next/link";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Next.js Application Client Exception Caught:", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans text-slate-900">
      <div className="bg-white border border-slate-200 shadow-xl rounded-2xl p-8 max-w-md w-full text-center space-y-6">
        <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto border border-red-100">
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>

        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">화면을 불러오는 중 일시적 오류가 발생했습니다.</h2>
          <p className="text-xs text-slate-500 mt-2 leading-relaxed">
            네트워크 동기화 또는 브라우저 캐시 업데이트 과정에서 발생한 일시적인 현상입니다.<br />
            아래 버튼을 눌러 다시 시도해 주세요.
          </p>
        </div>

        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            onClick={() => {
              if (typeof window !== "undefined") {
                window.location.reload();
              } else {
                reset();
              }
            }}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            페이지 새로고침
          </button>
          <Link
            href="/workspace"
            className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors cursor-pointer border border-slate-200"
          >
            대시보드로 이동
          </Link>
        </div>
      </div>
    </div>
  );
}

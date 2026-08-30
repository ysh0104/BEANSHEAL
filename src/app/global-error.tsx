"use client";

import React, { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global Root Exception Caught:", error);
  }, [error]);

  return (
    <html lang="ko">
      <body className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans text-slate-900 m-0">
        <div className="bg-white border border-slate-200 shadow-xl rounded-2xl p-8 max-w-md w-full text-center space-y-6">
          <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto border border-blue-100">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </div>

          <div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">시스템 업데이트 및 자동 복구 안내</h2>
            <p className="text-xs text-slate-500 mt-2 leading-relaxed">
              최신 서비스 업데이트 적용으로 브라우저 세션 재설정이 진행 중입니다.<br />
              아래 버튼을 눌러 바로 정상 화면으로 접속하실 수 있습니다.
            </p>
          </div>

          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              onClick={() => {
                if (typeof window !== "undefined") {
                  try {
                    localStorage.removeItem("beansheal_active_user");
                  } catch (e) {}
                  window.location.href = "/workspace";
                } else {
                  reset();
                }
              }}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer w-full"
            >
              시스템 새로고침 및 BEANSHEAL Workspace 접속
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}

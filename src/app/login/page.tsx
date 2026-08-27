"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

export default function LoginPage() {
  const router = useRouter();
  const { user, loading: authLoading, loginWithEmail, loginWithGoogle, signUpWithEmail } = useAuth();

  const [activeTab, setActiveTab] = useState<"id" | "qr">("id");
  const [mode, setMode] = useState<"login" | "signup">("login");
  
  // 로그인 입력 필드 (아이디, 비밀번호)
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  
  // 자동로그인 및 출근체크 옵션
  const [autoLogin, setAutoLogin] = useState(true);
  const [clockInCheck, setClockInCheck] = useState(false);
  
  const [error, setError] = useState("");
  const [infoMsg, setInfoMsg] = useState("");
  const [loading, setLoading] = useState(false);

  // 회원가입 전용 폼 상태
  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupDepartment, setSignupDepartment] = useState("생산팀");
  const [signupPosition, setSignupPosition] = useState("사원");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupConfirmPassword, setSignupConfirmPassword] = useState("");

  // 이미 로그인된 사용자인 경우 사내 ERP(/workspace)로 자동 이동
  useEffect(() => {
    if (!authLoading && user) {
      const isAuto = localStorage.getItem("beansheal_auto_login") !== "false";
      if (isAuto) {
        router.replace("/workspace");
      }
    }
  }, [user, authLoading, router]);

  // 아이디 저장 로드 + Google 승인 대기/거절 안내
  useEffect(() => {
    const savedId = localStorage.getItem("beansheal_saved_id");
    if (savedId) {
      setEmail(savedId);
    }
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("pending") === "1") {
      setInfoMsg(
        "Google 가입 요청이 접수되었습니다. 관리자 승인 후 로그인할 수 있습니다. (/admin/users에서 승인)"
      );
    } else if (params.get("rejected") === "1") {
      setError("가입 요청이 거절되었습니다. 관리자에게 문의해 주세요.");
    } else if (params.get("error")) {
      setError(decodeURIComponent(params.get("error") || "로그인에 실패했습니다."));
    }
  }, []);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (!email.trim() || !password) {
      setError("아이디와 비밀번호를 모두 입력해 주세요.");
      setLoading(false);
      return;
    }

    const { error: loginErr } = await loginWithEmail(email.trim(), password, autoLogin);
    setLoading(false);
    
    if (loginErr) {
      setError(loginErr);
      return;
    }

    // 아이디 및 자동로그인 저장 처리
    if (autoLogin) {
      localStorage.setItem("beansheal_saved_id", email.trim());
      localStorage.setItem("beansheal_auto_login", "true");
    } else {
      localStorage.setItem("beansheal_saved_id", email.trim());
      localStorage.setItem("beansheal_auto_login", "false");
    }

    // 출근체크 알림
    if (clockInCheck) {
      alert("출근체크가 정상 등록되었습니다. 오늘 하루도 수고하세요!");
    }

    // 전체 새로고침 대신 클라이언트 이동 — 대시보드 JS를 처음부터 다시 받지 않음
    router.replace("/workspace");
  };

  const handleGoogleLogin = async () => {
    setError("");
    try {
      await loginWithGoogle();
    } catch (err: any) {
      setError(err?.message || "Google 로그인에 실패했습니다.");
    }
  };

  const handleSignupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!signupName.trim() || !signupEmail.trim() || !signupPassword) {
      setError("모든 회원가입 정보를 입력해 주세요.");
      return;
    }
    if (signupPassword !== signupConfirmPassword) {
      setError("비밀번호가 일치하지 않습니다.");
      return;
    }
    if (signupPassword.length < 6) {
      setError("비밀번호는 최소 6자 이상이어야 합니다.");
      return;
    }

    setLoading(true);
    const { error: signUpErr } = await signUpWithEmail(
      signupEmail.trim(),
      signupPassword,
      signupName.trim(),
      signupDepartment,
      signupPosition
    );
    setLoading(false);

    if (signUpErr) {
      setError(signUpErr);
    } else {
      alert("사내 계정 승인 요청이 성공적으로 완료되었습니다! 사내 계정으로 로그인해 주세요.");
      setMode("login");
      setEmail(signupEmail.trim());
    }
  };

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans flex items-center justify-center p-4 select-none">
      
      {/* 중앙 메인 로그인 카드 */}
      <div className="w-full max-w-[420px] bg-white rounded-3xl p-8 shadow-xl border border-slate-200/90 space-y-7 relative overflow-hidden">
        
        {/* 상단 로고 헤더 (BEANSHEAL) */}
        <div className="text-center space-y-3 pt-2">
          <div className="text-[11px] font-black tracking-widest text-slate-400 uppercase">
            EFFICIENT CHANGE & INTEGRATION
          </div>
          <div className="flex items-center justify-center">
            <img
              src="/images/beansheal-logo.png"
              alt="BEANSHEAL"
              className="h-8 w-auto max-w-[220px] object-contain"
            />
          </div>
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-1.5 mx-auto px-3 py-1.5 text-xs font-extrabold text-slate-600 hover:text-emerald-800 bg-slate-50 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-200 rounded-lg transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0h4" />
            </svg>
            홈페이지로 돌아가기
          </Link>
        </div>

        {/* 탭 스위처 (ID 로그인 / QR 로그인) */}
        <div className="bg-slate-100 p-1 rounded-full flex items-center text-xs font-bold">
          <button
            type="button"
            onClick={() => { setActiveTab("id"); setMode("login"); }}
            className={`flex-1 py-2.5 rounded-full transition-all text-center cursor-pointer ${
              activeTab === "id" && mode === "login"
                ? "bg-white text-[#2c4cb0] shadow-xs font-extrabold"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            ID 로그인
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab("qr");
              alert("QR 로그인은 사내 모바일 앱 전용 기능입니다.");
            }}
            className={`flex-1 py-2.5 rounded-full transition-all text-center cursor-pointer ${
              activeTab === "qr"
                ? "bg-white text-[#2c4cb0] shadow-xs font-extrabold"
                : "text-slate-400 hover:text-slate-600"
            }`}
          >
            QR 로그인
          </button>
        </div>

        {/* 에러 / 안내 메시지 바 */}
        {infoMsg && (
          <div className="bg-amber-50 border border-amber-200 text-amber-900 text-xs p-3 rounded-xl font-semibold leading-relaxed">
            {infoMsg}
          </div>
        )}
        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs p-3 rounded-xl font-semibold leading-relaxed animate-fade-in">
            {error}
          </div>
        )}

        {/* 1. 로그인 폼 */}
        {mode === "login" ? (
          <div className="space-y-4">
            <form onSubmit={handleLoginSubmit} method="post" action="/workspace" className="space-y-5">
              
              {/* 사원 아이디 입력 (모노크롬 SVG 아이콘: 사용자) */}
              <div className="flex items-center gap-3 border-b border-slate-200 py-3 focus-within:border-[#2c4cb0] transition-colors">
                <svg className="w-5 h-5 text-slate-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <input
                  type="text"
                  name="username"
                  id="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="사원 아이디 또는 이메일"
                  className="w-full text-sm font-semibold text-slate-800 placeholder-slate-400 bg-transparent focus:outline-none"
                  autoComplete="username"
                  required
                />
              </div>

              {/* 비밀번호 입력 (모노크롬 SVG 아이콘: 자물쇠) */}
              <div className="flex items-center gap-3 border-b border-slate-200 py-3 focus-within:border-[#2c4cb0] transition-colors">
                <svg className="w-5 h-5 text-slate-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <input
                  type="password"
                  name="password"
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="비밀번호"
                  className="w-full text-sm font-semibold text-slate-800 placeholder-slate-400 bg-transparent focus:outline-none"
                  autoComplete="current-password"
                  required
                />
              </div>

              {/* 체크박스 옵션 행 (자동로그인, 출근체크) */}
              <div className="flex items-center justify-end gap-4 text-xs font-semibold text-slate-600 pt-1">
                <label className="flex items-center gap-1.5 cursor-pointer hover:text-slate-900 transition-colors" title="재접속 시 자동 로그인 설정">
                  <input
                    type="checkbox"
                    checked={autoLogin}
                    onChange={(e) => setAutoLogin(e.target.checked)}
                    className="w-4 h-4 accent-[#2c4cb0] rounded cursor-pointer"
                  />
                  <span className="font-extrabold text-[#2c4cb0]">자동로그인</span>
                </label>

                <label className="flex items-center gap-1.5 cursor-pointer hover:text-slate-900 transition-colors">
                  <input
                    type="checkbox"
                    checked={clockInCheck}
                    onChange={(e) => setClockInCheck(e.target.checked)}
                    className="w-4 h-4 accent-[#2c4cb0] rounded cursor-pointer"
                  />
                  <span>출근체크</span>
                </label>
              </div>

              {/* 메인 로그인 버튼 */}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#3352c4] hover:bg-[#2c4cb0] active:bg-[#243ea6] text-white font-bold text-base py-3.5 rounded-xl shadow-md transition-all cursor-pointer disabled:opacity-50 mt-2"
              >
                {loading ? "사내 인증 처리 중..." : "로그인"}
              </button>

            </form>

            {/* 구분선 (또는) */}
            <div className="relative my-3 flex items-center justify-center">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200" />
              </div>
              <span className="relative bg-white px-3 text-[11px] font-bold text-slate-400">또는</span>
            </div>

            {/* 구글 소셜 회원가입/로그인 버튼 */}
            <button
              type="button"
              onClick={handleGoogleLogin}
              className="w-full bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 font-bold text-sm py-3 rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
              <span>Google로 가입 요청 / 로그인</span>
            </button>

            {/* 자동저장 안내 도움말 */}
            <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 text-[11px] text-slate-600 leading-relaxed text-left space-y-1">
              <p className="font-bold text-slate-800 flex items-center gap-1">
                💡 구글 회원가입 및 비밀번호 자동저장 안내
              </p>
              <p>
                구글 계정으로 첫 접속 시 자동으로 회원가입 처리되며, 상단 ID/비밀번호 폼으로 로그인하시면 브라우저의 <strong>'비밀번호 저장'</strong> 기능을 사용하여 더 편리하게 자동 로그인하실 수 있습니다.
              </p>
            </div>
          </div>
        ) : (
          /* 2. 사내 신규 회원가입 폼 */
          <form onSubmit={handleSignupSubmit} className="space-y-3">
            <div className="text-center font-extrabold text-sm text-slate-800 pb-1">
              신규 사원 사내 계정 생성
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-500">이름</label>
              <input
                type="text"
                value={signupName}
                onChange={(e) => setSignupName(e.target.value)}
                placeholder="홍길동"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold focus:outline-none focus:border-[#2c4cb0]"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-500">사내 아이디 (이메일)</label>
              <input
                type="text"
                value={signupEmail}
                onChange={(e) => setSignupEmail(e.target.value)}
                placeholder="user@beansheal.com"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold focus:outline-none focus:border-[#2c4cb0]"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] font-bold text-slate-500">소속 부서</label>
                <select
                  value={signupDepartment}
                  onChange={(e) => setSignupDepartment(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-2 py-2 text-xs font-semibold focus:outline-none focus:border-[#2c4cb0]"
                >
                  <option value="생산팀">생산팀</option>
                  <option value="품질관리팀">품질관리팀</option>
                  <option value="영업팀">영업팀</option>
                  <option value="경영지원팀">경영지원팀</option>
                  <option value="경영진">경영진</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-500">직급</label>
                <select
                  value={signupPosition}
                  onChange={(e) => setSignupPosition(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-2 py-2 text-xs font-semibold focus:outline-none focus:border-[#2c4cb0]"
                >
                  <option value="사원">사원</option>
                  <option value="주임">주임</option>
                  <option value="과장">과장</option>
                  <option value="팀장">팀장</option>
                  <option value="이사">이사</option>
                  <option value="대표">대표</option>
                  <option value="대표이사">대표이사</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-500">비밀번호</label>
              <input
                type="password"
                value={signupPassword}
                onChange={(e) => setSignupPassword(e.target.value)}
                placeholder="6자 이상 입력"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold focus:outline-none focus:border-[#2c4cb0]"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-500">비밀번호 확인</label>
              <input
                type="password"
                value={signupConfirmPassword}
                onChange={(e) => setSignupConfirmPassword(e.target.value)}
                placeholder="비밀번호 재입력"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold focus:outline-none focus:border-[#2c4cb0]"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#3352c4] hover:bg-[#2c4cb0] text-white font-bold text-xs py-3 rounded-xl shadow-md transition-all cursor-pointer disabled:opacity-50 mt-1"
            >
              {loading ? "등록 처리 중..." : "회원가입 신청"}
            </button>

            <button
              type="button"
              onClick={() => setMode("login")}
              className="w-full text-xs font-bold text-slate-500 hover:text-slate-800 text-center pt-1 cursor-pointer"
            >
              ← 로그인 화면으로 돌아가기
            </button>
          </form>
        )}

        {/* 하단 링크 및 회원가입 전환 텍스트 */}
        <div className="pt-2 border-t border-slate-100 text-center text-[11px] font-semibold text-slate-400 flex items-center justify-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => alert("비밀번호 재설정은 사내 전산 관리자에게 문의해 주세요.")}
            className="hover:text-slate-700 transition-colors cursor-pointer"
          >
            비밀번호 찾기
          </button>
          <span>|</span>
          <button
            type="button"
            onClick={() => alert("개인정보처리방침 안내: 사내 인증 데이터는 암호화하여 보호됩니다.")}
            className="hover:text-slate-700 font-bold transition-colors cursor-pointer"
          >
            개인정보처리방침
          </button>
          <span>|</span>
          <span className="text-slate-400 font-medium">한국 (한국어) ∨</span>
          <span>|</span>
          <button
            type="button"
            onClick={() => setMode(mode === "login" ? "signup" : "login")}
            className="text-[#2c4cb0] font-extrabold hover:underline cursor-pointer"
          >
            {mode === "login" ? "회원가입" : "로그인"}
          </button>
        </div>

      </div>

    </div>
  );
}
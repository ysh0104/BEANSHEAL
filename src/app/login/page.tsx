"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, UserProfile } from "@/context/AuthContext";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const { login, loginWithGoogle, user } = useAuth();
  
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  
  // 회원가입 폼 상태
  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupRole, setSignupRole] = useState("생산팀장");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupConfirmPassword, setSignupConfirmPassword] = useState("");

  const handleGoogleLogin = () => {
    loginWithGoogle();
    router.push("/");
  };

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      alert("이메일 주소 또는 사원 아이디를 입력해 주세요.");
      return;
    }
    const localUser: UserProfile = {
      name: email.split("@")[0] || "사원",
      email: email.trim(),
      role: "사원",
      provider: "local"
    };

    login(localUser);
    router.push("/");
  };

  const handleSignupSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!signupName.trim() || !signupEmail.trim() || !signupPassword) {
      alert("모든 회원가입 정보를 입력해 주세요.");
      return;
    }
    if (signupPassword !== signupConfirmPassword) {
      alert("비밀번호가 일치하지 않습니다. 다시 확인해 주세요.");
      return;
    }

    const newProfile: UserProfile = {
      name: signupName.trim(),
      email: signupEmail.trim(),
      role: signupRole,
      provider: "local"
    };

    alert(`🎉 ${signupName}님, 사내 회원가입이 완료되었습니다! 로그인 상태로 시작합니다.`);
    login(newProfile);
    router.push("/");
  };

  return (
    <div className="min-h-screen bg-slate-900/90 flex flex-col justify-center items-center p-4 relative overflow-hidden font-sans">
      {/* Background Subtle Gradient Blobs */}
      <div className="absolute top-10 left-10 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-10 right-10 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl pointer-events-none"></div>

      <div className="w-full max-w-[420px] bg-white rounded-3xl shadow-2xl border border-gray-100 p-8 z-10 animate-fadeIn relative flex flex-col items-center">
        {/* 상단 닫기 X 링크 */}
        <Link 
          href="/" 
          className="absolute top-5 right-5 text-gray-400 hover:text-gray-700 p-1.5 rounded-full hover:bg-gray-100 transition-colors cursor-pointer"
          title="메인 페이지로 이동"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </Link>

        {/* 메인 타이틀 & 서브 텍스트 */}
        <h1 className="text-2xl font-extrabold text-gray-900 text-center mb-1.5 tracking-tight">
          {mode === "login" ? "로그인 또는 회원가입" : "BEANSHEAL 사내 회원가입"}
        </h1>
        <p className="text-xs font-semibold text-gray-500 text-center mb-6 leading-relaxed px-2">
          {mode === "login" 
            ? "BEANSHEAL 스마트 ERP 시스템 및 관리자 기능을 이용할 수 있습니다."
            : "새로운 사내 계정을 생성하고 시스템 이용 권한을 부여받으세요."}
        </p>

        {/* 로그인 완료시 노출되는 상태 알림 바 */}
        {user && (
          <div className="w-full mb-5 p-3 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="font-bold text-emerald-900">
                현재 로그인: {user.name} ({user.role})
              </span>
            </div>
            <Link href="/" className="text-emerald-700 font-extrabold hover:underline">
              메인으로 ➔
            </Link>
          </div>
        )}

        {/* 탭 전환 (로그인 / 회원가입) */}
        <div className="w-full flex bg-gray-100 p-1 rounded-full mb-5 text-xs font-extrabold">
          <button
            onClick={() => setMode("login")}
            className={`flex-1 py-2 rounded-full transition-all cursor-pointer ${
              mode === "login" ? "bg-white text-gray-900 shadow-2xs" : "text-gray-500 hover:text-gray-900"
            }`}
          >
            로그인
          </button>
          <button
            onClick={() => setMode("signup")}
            className={`flex-1 py-2 rounded-full transition-all cursor-pointer ${
              mode === "signup" ? "bg-white text-gray-900 shadow-2xs" : "text-gray-500 hover:text-gray-900"
            }`}
          >
            회원가입
          </button>
        </div>

        {/* [모드 1] 로그인 View */}
        {mode === "login" ? (
          <div className="w-full">
            {/* 1. Google 계정으로 계속하기 */}
            <button
              onClick={handleGoogleLogin}
              className="w-full border border-gray-300 hover:border-gray-400 bg-white text-gray-800 font-bold py-3 px-4 rounded-full flex items-center justify-center gap-2.5 transition-all text-sm cursor-pointer shadow-2xs mb-3 group"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
              <span>Google 계정으로 계속하기</span>
            </button>

            {/* 2. 사내 아이디 / 이메일로 계속하기 */}
            <button
              onClick={() => {
                const promptEmail = prompt("사내 이메일 또는 사원번호를 입력하세요:", "chulsoo@beansheal.com");
                if (promptEmail) {
                  login({
                    name: promptEmail.split("@")[0] || "사원",
                    email: promptEmail,
                    role: "사원",
                    provider: "local"
                  });
                  router.push("/");
                }
              }}
              className="w-full border border-gray-300 hover:border-gray-400 bg-white text-gray-800 font-bold py-3 px-4 rounded-full flex items-center justify-center gap-2.5 transition-all text-sm cursor-pointer shadow-2xs"
            >
              <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              <span>🏢 사내 아이디 / 사원번호로 계속하기</span>
            </button>

            {/* 구분선 (또는) */}
            <div className="w-full flex items-center my-4">
              <div className="flex-1 border-t border-gray-200"></div>
              <span className="px-3 text-xs font-semibold text-gray-400">또는</span>
              <div className="flex-1 border-t border-gray-200"></div>
            </div>

            {/* 이메일 직접 입력 및 계속 (검정 알약 버튼) */}
            <form onSubmit={handleLoginSubmit} className="w-full space-y-3">
              <input
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="이메일 주소 또는 사원 아이디"
                className="w-full border border-gray-300 focus:border-black rounded-full px-5 py-3 text-sm focus:outline-none text-gray-900 placeholder-gray-400 font-medium transition-colors"
              />

              <button
                type="submit"
                className="w-full bg-black hover:bg-gray-800 text-white font-extrabold py-3.5 px-4 rounded-full transition-colors text-sm cursor-pointer shadow-md active:scale-[0.99]"
              >
                계속
              </button>
            </form>

            <div className="text-center mt-4">
              <button
                onClick={() => setMode("signup")}
                className="text-xs font-bold text-gray-500 hover:text-black transition-colors cursor-pointer"
              >
                아직 사내 계정이 없으신가요? <span className="text-blue-600 underline">회원가입하기</span>
              </button>
            </div>
          </div>
        ) : (
          /* [모드 2] 회원가입 View */
          <form onSubmit={handleSignupSubmit} className="w-full space-y-3">
            <div>
              <input
                type="text"
                value={signupName}
                onChange={(e) => setSignupName(e.target.value)}
                placeholder="이름 (예: 홍길동)"
                className="w-full border border-gray-300 focus:border-black rounded-full px-5 py-2.5 text-xs focus:outline-none text-gray-900 placeholder-gray-400 font-medium transition-colors"
              />
            </div>

            <div>
              <input
                type="email"
                value={signupEmail}
                onChange={(e) => setSignupEmail(e.target.value)}
                placeholder="사내 이메일 주소 (user@beansheal.com)"
                className="w-full border border-gray-300 focus:border-black rounded-full px-5 py-2.5 text-xs focus:outline-none text-gray-900 placeholder-gray-400 font-medium transition-colors"
              />
            </div>

            <div>
              <select
                value={signupRole}
                onChange={(e) => setSignupRole(e.target.value)}
                className="w-full border border-gray-300 focus:border-black rounded-full px-5 py-2.5 text-xs focus:outline-none text-gray-900 font-bold bg-white cursor-pointer"
              >
                <option value="생산팀장">🏭 생산관리 팀장</option>
                <option value="품질팀장">🔍 품질검사 팀장</option>
                <option value="관리자">👑 최고관리자 (Admin)</option>
                <option value="사원">👤 일반 사원</option>
              </select>
            </div>

            <div>
              <input
                type="password"
                value={signupPassword}
                onChange={(e) => setSignupPassword(e.target.value)}
                placeholder="비밀번호 설정"
                className="w-full border border-gray-300 focus:border-black rounded-full px-5 py-2.5 text-xs focus:outline-none text-gray-900 placeholder-gray-400 font-medium transition-colors"
              />
            </div>

            <div>
              <input
                type="password"
                value={signupConfirmPassword}
                onChange={(e) => setSignupConfirmPassword(e.target.value)}
                placeholder="비밀번호 확인"
                className="w-full border border-gray-300 focus:border-black rounded-full px-5 py-2.5 text-xs focus:outline-none text-gray-900 placeholder-gray-400 font-medium transition-colors"
              />
            </div>

            <button
              type="submit"
              className="w-full bg-black hover:bg-gray-800 text-white font-extrabold py-3.5 px-4 rounded-full transition-colors text-sm cursor-pointer shadow-md active:scale-[0.99] mt-2"
            >
              회원가입 완료
            </button>

            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => setMode("login")}
                className="text-xs font-bold text-gray-500 hover:text-black transition-colors cursor-pointer"
              >
                이미 계정이 있으신가요? <span className="text-blue-600 underline">로그인하기</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

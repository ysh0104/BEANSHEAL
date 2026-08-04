"use client";

import React, { useState } from "react";
import { useAuth } from "@/context/AuthContext";

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function LoginModal({ isOpen, onClose }: LoginModalProps) {
  const { loginWithGoogle, loginWithEmail, signUpWithEmail } = useAuth();

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // 회원가입 폼 상태
  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupDepartment, setSignupDepartment] = useState("생산관리");
  const [signupPosition, setSignupPosition] = useState("사원");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupConfirmPassword, setSignupConfirmPassword] = useState("");

  if (!isOpen) return null;

  const handleGoogleLogin = async () => {
    setError("");
    await loginWithGoogle();
    // 구글은 리디렉션되므로 onClose 불필요
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email.trim() || !password) {
      setError("이메일과 비밀번호를 입력해 주세요.");
      return;
    }
    setLoading(true);
    const { error } = await loginWithEmail(email.trim(), password);
    setLoading(false);
    if (error) {
      setError(error);
      return;
    }
    onClose();
  };

  const handleSignupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!signupName.trim() || !signupEmail.trim() || !signupPassword) {
      setError("모든 회원가입 정보를 입력해 주세요.");
      return;
    }
    if (signupPassword !== signupConfirmPassword) {
      setError("비밀번호가 일치하지 않습니다. 다시 확인해 주세요.");
      return;
    }
    if (signupPassword.length < 6) {
      setError("비밀번호는 6자 이상이어야 합니다.");
      return;
    }
    setLoading(true);
    const { error } = await signUpWithEmail(
      signupName.trim(),
      signupEmail.trim(),
      signupPassword,
      signupDepartment,
      signupPosition
    );
    setLoading(false);
    if (error) {
      setError(error);
      return;
    }
    alert(`${signupName}님, 사내 회원가입이 완료되었습니다.`);
    setMode("login");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-fadeIn font-sans">
      <div
        className="bg-white rounded-3xl shadow-2xl border border-gray-100 w-full max-w-[420px] p-8 relative flex flex-col items-center animate-scaleUp"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-gray-400 hover:text-gray-700 p-1.5 rounded-full hover:bg-gray-100 transition-colors cursor-pointer"
          title="닫기"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <h2 className="text-2xl font-extrabold text-gray-900 text-center mb-1.5 tracking-tight">
          {mode === "login" ? "로그인 또는 회원가입" : "BEANSHEAL 사내 회원가입"}
        </h2>
        <p className="text-xs font-semibold text-gray-500 text-center mb-6 leading-relaxed px-2">
          {mode === "login"
            ? "BEANSHEAL 스마트 ERP 시스템 및 관리자 기능을 이용할 수 있습니다."
            : "새로운 사내 계정을 생성하고 시스템 이용 권한을 부여받으세요."}
        </p>

        <div className="w-full flex bg-gray-100 p-1 rounded-full mb-5 text-xs font-extrabold">
          <button
            onClick={() => { setMode("login"); setError(""); }}
            className={`flex-1 py-2 rounded-full transition-all cursor-pointer ${
              mode === "login" ? "bg-white text-gray-900 shadow-2xs" : "text-gray-500 hover:text-gray-900"
            }`}
          >
            로그인
          </button>
          <button
            onClick={() => { setMode("signup"); setError(""); }}
            className={`flex-1 py-2 rounded-full transition-all cursor-pointer ${
              mode === "signup" ? "bg-white text-gray-900 shadow-2xs" : "text-gray-500 hover:text-gray-900"
            }`}
          >
            회원가입
          </button>
        </div>

        {error && (
          <div className="w-full mb-3 p-2.5 bg-red-50 border border-red-200 rounded-2xl text-xs font-semibold text-red-600 text-center">
            {error}
          </div>
        )}

        {mode === "login" ? (
          <div className="w-full">
            <button
              onClick={handleGoogleLogin}
              className="w-full border border-gray-300 hover:border-gray-400 bg-white text-gray-800 font-bold py-3 px-4 rounded-full flex items-center justify-center gap-2.5 transition-all text-sm cursor-pointer shadow-2xs mb-4 group"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
              <span>Google 계정으로 계속하기</span>
            </button>

            <div className="w-full flex items-center my-4">
              <div className="flex-1 border-t border-gray-200"></div>
              <span className="px-3 text-xs font-semibold text-gray-400">또는</span>
              <div className="flex-1 border-t border-gray-200"></div>
            </div>

            <form onSubmit={handleLoginSubmit} className="w-full space-y-3">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="이메일 주소"
                className="w-full border border-gray-300 focus:border-black rounded-full px-5 py-3 text-sm focus:outline-none text-gray-900 placeholder-gray-400 font-medium transition-colors"
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="비밀번호"
                className="w-full border border-gray-300 focus:border-black rounded-full px-5 py-3 text-sm focus:outline-none text-gray-900 placeholder-gray-400 font-medium transition-colors"
              />

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-black hover:bg-gray-800 text-white font-extrabold py-3.5 px-4 rounded-full transition-colors text-sm cursor-pointer shadow-md active:scale-[0.99] disabled:opacity-50"
              >
                {loading ? "로그인 중..." : "계속"}
              </button>
            </form>

            <div className="text-center mt-4">
              <button
                onClick={() => { setMode("signup"); setError(""); }}
                className="text-xs font-bold text-gray-500 hover:text-black transition-colors cursor-pointer"
              >
                아직 사내 계정이 없으신가요? <span className="text-blue-600 underline">회원가입하기</span>
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSignupSubmit} className="w-full space-y-3">
            <input
              type="text"
              value={signupName}
              onChange={(e) => setSignupName(e.target.value)}
              placeholder="이름 (예: 홍길동)"
              className="w-full border border-gray-300 focus:border-black rounded-full px-5 py-2.5 text-xs focus:outline-none text-gray-900 placeholder-gray-400 font-medium transition-colors"
            />
            <input
              type="email"
              value={signupEmail}
              onChange={(e) => setSignupEmail(e.target.value)}
              placeholder="사내 이메일 주소 (user@beansheal.com)"
              className="w-full border border-gray-300 focus:border-black rounded-full px-5 py-2.5 text-xs focus:outline-none text-gray-900 placeholder-gray-400 font-medium transition-colors"
            />

            {/* 부서 선택 */}
            <select
              value={signupDepartment}
              onChange={(e) => setSignupDepartment(e.target.value)}
              className="w-full border border-gray-300 focus:border-black rounded-full px-5 py-2.5 text-xs focus:outline-none text-gray-900 font-bold bg-white cursor-pointer"
            >
              <option value="생산">생산</option>
              <option value="품질">품질</option>
              <option value="경영">경영</option>
              <option value="자재물류">자재/물류</option>
            </select>

            {/* 직급 선택 */}
            <select
              value={signupPosition}
              onChange={(e) => setSignupPosition(e.target.value)}
              className="w-full border border-gray-300 focus:border-black rounded-full px-5 py-2.5 text-xs focus:outline-none text-gray-900 font-bold bg-white cursor-pointer"
            >
              <option value="사원">사원</option>
              <option value="주임">주임</option>
              <option value="팀장">팀장</option>
              <option value="과장">과장</option>
              <option value="관리자">관리자 (Admin)</option>
            </select>

            <input
              type="password"
              value={signupPassword}
              onChange={(e) => setSignupPassword(e.target.value)}
              placeholder="비밀번호 설정 (6자 이상)"
              className="w-full border border-gray-300 focus:border-black rounded-full px-5 py-2.5 text-xs focus:outline-none text-gray-900 placeholder-gray-400 font-medium transition-colors"
            />
            <input
              type="password"
              value={signupConfirmPassword}
              onChange={(e) => setSignupConfirmPassword(e.target.value)}
              placeholder="비밀번호 확인"
              className="w-full border border-gray-300 focus:border-black rounded-full px-5 py-2.5 text-xs focus:outline-none text-gray-900 placeholder-gray-400 font-medium transition-colors"
            />

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-black hover:bg-gray-800 text-white font-extrabold py-3.5 px-4 rounded-full transition-colors text-sm cursor-pointer shadow-md active:scale-[0.99] mt-2 disabled:opacity-50"
            >
              {loading ? "가입 중..." : "회원가입 완료"}
            </button>

            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => { setMode("login"); setError(""); }}
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
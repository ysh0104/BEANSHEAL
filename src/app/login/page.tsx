"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const { loginWithGoogle, loginWithEmail, signUpWithEmail, user, loading: authLoading } = useAuth();
  
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberId, setRememberId] = useState(true);
  const [clockInCheck, setClockInCheck] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // 회원가입 폼 상태
  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupDepartment, setSignupDepartment] = useState("생산");
  const [signupPosition, setSignupPosition] = useState("사원");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupConfirmPassword, setSignupConfirmPassword] = useState("");

  // 아이디 저장 로드
  useEffect(() => {
    const savedId = localStorage.getItem("beansheal_saved_id");
    if (savedId) {
      setEmail(savedId);
      setRememberId(true);
    }
  }, []);

  const handleGoogleLogin = async () => {
    setError("");
    await loginWithGoogle();
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email.trim() || !password) {
      setError("아이디(이메일)와 비밀번호를 입력해 주세요.");
      return;
    }
    setLoading(true);
    const { error } = await loginWithEmail(email.trim(), password);
    setLoading(false);
    
    if (error) {
      setError(error);
      return;
    }

    // 아이디 저장 처리
    if (rememberId) {
      localStorage.setItem("beansheal_saved_id", email.trim());
    } else {
      localStorage.removeItem("beansheal_saved_id");
    }

    // 출근체크 토스트 알림
    if (clockInCheck) {
      alert("출근체크가 완료되었습니다. 오늘 하루도 좋은 하루 되세요!");
    }

    window.location.href = "/";
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

    // 회원가입 성공 시에도 아이디 저장
    if (rememberId) {
      localStorage.setItem("beansheal_saved_id", signupEmail.trim());
    }

    alert(`${signupName}님, 사내 회원가입이 성공적으로 완료되었습니다.`);
    setEmail(signupEmail.trim());
    setMode("login");
  };

  return (
    <div className="min-h-screen bg-[#f4f6f9] flex flex-col justify-center items-center p-4 font-sans select-none">
      <div className="w-full max-w-[400px] flex flex-col items-center">
        
        {/* 상단 ECOUNT ERP 스타일 로고 */}
        <div className="text-center mb-8">
          <p className="text-[11px] font-bold tracking-widest text-gray-400 uppercase mb-0.5">
            EFFICIENT & SMART ERP
          </p>
          <h1 className="text-3xl font-black tracking-tight text-gray-800 flex items-center justify-center gap-0.5">
            <span className="text-[#c81e1e]">BEANS</span>
            <span className="text-gray-900">HEAL</span>
            <span className="text-[#c81e1e] font-extrabold ml-1 text-2xl">ERP</span>
          </h1>
        </div>

        {/* 메인 로그인 카카오/이카운트 스타일 박스 */}
        <div className="w-full bg-white rounded-lg shadow-sm border border-gray-200/80 p-6 flex flex-col items-center">
          
          {/* 로그인 완료 상태 시 안내 바 */}
          {user && (
            <div className="w-full mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span className="font-bold text-emerald-900">
                  {user.name} ({user.jobTitle}) 로그인됨
                </span>
              </div>
              <Link href="/" className="text-emerald-700 font-bold hover:underline">
                메인으로 ➔
              </Link>
            </div>
          )}

          {/* 탭 메뉴 (ID 로그인 / 회원가입) */}
          <div className="w-full flex bg-gray-100/80 p-1 rounded-md mb-6 text-xs font-bold text-gray-500">
            <button
              type="button"
              onClick={() => { setMode("login"); setError(""); }}
              className={`flex-1 py-2 rounded transition-all cursor-pointer ${
                mode === "login" 
                  ? "bg-white text-gray-900 shadow-2xs font-extrabold" 
                  : "hover:text-gray-800"
              }`}
            >
              ID 로그인
            </button>
            <button
              type="button"
              onClick={() => { setMode("signup"); setError(""); }}
              className={`flex-1 py-2 rounded transition-all cursor-pointer ${
                mode === "signup" 
                  ? "bg-white text-gray-900 shadow-2xs font-extrabold" 
                  : "hover:text-gray-800"
              }`}
            >
              회원가입
            </button>
          </div>

          {/* 에러 메시지 알림 */}
          {error && (
            <div className="w-full mb-4 p-3 bg-red-50 border border-red-200 rounded text-xs font-semibold text-red-600 leading-relaxed">
              {error}
            </div>
          )}

          {mode === "login" ? (
            /* [ID 로그인 폼] */
            <form onSubmit={handleLoginSubmit} className="w-full space-y-4">
              
              {/* 사내 아이디/이메일 입력 */}
              <div className="relative border-b border-gray-300 focus-within:border-[#2c4cb0] transition-colors py-1 flex items-center gap-3">
                <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <input
                  type="text"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="아이디 또는 이메일 (예: user123)"
                  className="w-full text-xs font-medium text-gray-900 placeholder-gray-400 bg-transparent focus:outline-none py-1"
                />
              </div>

              {/* 비밀번호 입력 */}
              <div className="relative border-b border-gray-300 focus-within:border-[#2c4cb0] transition-colors py-1 flex items-center gap-3">
                <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="비밀번호"
                  className="w-full text-xs font-medium text-gray-900 placeholder-gray-400 bg-transparent focus:outline-none py-1"
                />
              </div>

              {/* 저장 [Code, ID] & 출근체크 옵션 */}
              <div className="flex items-center justify-between text-[11px] text-gray-600 font-semibold pt-2">
                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={rememberId}
                    onChange={(e) => setRememberId(e.target.checked)}
                    className="w-3.5 h-3.5 text-[#2c4cb0] rounded border-gray-300 focus:ring-[#2c4cb0] cursor-pointer"
                  />
                  <span>저장 [Code, ID]</span>
                </label>

                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={clockInCheck}
                    onChange={(e) => setClockInCheck(e.target.checked)}
                    className="w-3.5 h-3.5 text-[#2c4cb0] rounded border-gray-300 focus:ring-[#2c4cb0] cursor-pointer"
                  />
                  <span>출근체크</span>
                </label>
              </div>

              {/* 메인 ECOUNT 시그니처 로열블루 로그인 버튼 */}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#2c4cb0] hover:bg-[#203a8c] text-white font-bold py-3 rounded text-sm transition-all shadow-xs cursor-pointer active:scale-[0.99] disabled:opacity-50 mt-2"
              >
                {loading ? "로그인 중..." : "로그인"}
              </button>

              {/* 구글 계정 보조 로그인 옵션 */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  className="w-full border border-gray-200 hover:bg-gray-50 text-gray-700 font-semibold py-2.5 rounded flex items-center justify-center gap-2 text-xs transition-colors cursor-pointer"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                  </svg>
                  <span>Google 계정으로 로그인</span>
                </button>
              </div>

            </form>
          ) : (
            /* [회원가입 폼] */
            <form onSubmit={handleSignupSubmit} className="w-full space-y-3">
              <div className="border-b border-gray-300 focus-within:border-[#2c4cb0] transition-colors py-1">
                <input
                  type="text"
                  value={signupName}
                  onChange={(e) => setSignupName(e.target.value)}
                  placeholder="이름 (예: 홍길동)"
                  className="w-full text-xs font-medium text-gray-900 placeholder-gray-400 bg-transparent focus:outline-none py-1"
                />
              </div>

              <div className="border-b border-gray-300 focus-within:border-[#2c4cb0] transition-colors py-1">
                <input
                  type="text"
                  value={signupEmail}
                  onChange={(e) => setSignupEmail(e.target.value)}
                  placeholder="사내 아이디 또는 이메일 (예: user123)"
                  className="w-full text-xs font-medium text-gray-900 placeholder-gray-400 bg-transparent focus:outline-none py-1"
                />
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <div>
                  <label className="text-[10px] text-gray-400 font-bold mb-1 block">부서 선택</label>
                  <select
                    value={signupDepartment}
                    onChange={(e) => setSignupDepartment(e.target.value)}
                    className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs text-gray-800 font-bold bg-white focus:outline-none"
                  >
                    <option value="생산">생산</option>
                    <option value="품질">품질</option>
                    <option value="경영">경영</option>
                    <option value="자재물류">자재/물류</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] text-gray-400 font-bold mb-1 block">직급 선택</label>
                  <select
                    value={signupPosition}
                    onChange={(e) => setSignupPosition(e.target.value)}
                    className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs text-gray-800 font-bold bg-white focus:outline-none"
                  >
                    <option value="사원">사원</option>
                    <option value="주임">주임</option>
                    <option value="팀장">팀장</option>
                    <option value="과장">과장</option>
                    <option value="이사">이사</option>
                    <option value="관리자">관리자 (Admin)</option>
                  </select>
                </div>
              </div>

              <div className="border-b border-gray-300 focus-within:border-[#2c4cb0] transition-colors py-1">
                <input
                  type="password"
                  value={signupPassword}
                  onChange={(e) => setSignupPassword(e.target.value)}
                  placeholder="비밀번호 (6자 이상)"
                  className="w-full text-xs font-medium text-gray-900 placeholder-gray-400 bg-transparent focus:outline-none py-1"
                />
              </div>

              <div className="border-b border-gray-300 focus-within:border-[#2c4cb0] transition-colors py-1">
                <input
                  type="password"
                  value={signupConfirmPassword}
                  onChange={(e) => setSignupConfirmPassword(e.target.value)}
                  placeholder="비밀번호 확인"
                  className="w-full text-xs font-medium text-gray-900 placeholder-gray-400 bg-transparent focus:outline-none py-1"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#2c4cb0] hover:bg-[#203a8c] text-white font-bold py-3 rounded text-sm transition-all shadow-xs cursor-pointer active:scale-[0.99] disabled:opacity-50 mt-2"
              >
                {loading ? "가입 중..." : "회원가입 완료"}
              </button>
            </form>
          )}

        </div>

        {/* 하단 푸터 링크 (이카운트 스타일) */}
        <div className="flex items-center gap-3 text-[11px] text-gray-500 font-medium mt-6">
          <button type="button" onClick={() => alert("사내 관리자에게 문의하여 비밀번호를 재설정하세요.")} className="hover:underline">
            비밀번호 찾기
          </button>
          <span>|</span>
          <button type="button" onClick={() => alert("BEANSHEAL ERP 개인정보 처리방침")} className="hover:underline">
            개인정보처리방침
          </button>
          <span>|</span>
          <span className="flex items-center gap-1 cursor-pointer hover:text-gray-700">
            한국 (한국어)
            <svg className="w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
            </svg>
          </span>
        </div>

      </div>
    </div>
  );
}
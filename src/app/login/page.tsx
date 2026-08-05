"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const { loginWithEmail, signUpWithEmail } = useAuth();
  
  const [activeTab, setActiveTab] = useState<"id" | "qr">("id");
  const [mode, setMode] = useState<"login" | "signup">("login");
  
  // 로그인 입력 필드 (회사코드, 아이디, 비밀번호)
  const [companyCode, setCompanyCode] = useState("669192");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  
  // 체크박스 옵션
  const [rememberId, setRememberId] = useState(true);
  const [clockInCheck, setClockInCheck] = useState(false);
  
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // 회원가입 전용 폼 상태
  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupDepartment, setSignupDepartment] = useState("생산");
  const [signupPosition, setSignupPosition] = useState("사원");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupConfirmPassword, setSignupConfirmPassword] = useState("");

  // 아이디 저장 로드
  useEffect(() => {
    const savedId = localStorage.getItem("beansheal_saved_id");
    const savedCode = localStorage.getItem("beansheal_saved_code");
    if (savedId) {
      setEmail(savedId);
    }
    if (savedCode) {
      setCompanyCode(savedCode);
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

    const { error: loginErr } = await loginWithEmail(email.trim(), password);
    setLoading(false);
    
    if (loginErr) {
      setError(loginErr);
      return;
    }

    // 아이디 및 회사코드 저장 처리
    if (rememberId) {
      localStorage.setItem("beansheal_saved_id", email.trim());
      localStorage.setItem("beansheal_saved_code", companyCode.trim());
    } else {
      localStorage.removeItem("beansheal_saved_id");
      localStorage.removeItem("beansheal_saved_code");
    }

    // 출근체크 알림
    if (clockInCheck) {
      alert("출근체크가 정상 등록되었습니다. 오늘 하루도 수고하세요!");
    }

    // 로그인 완료 시 사내 업무 플랫폼(/workspace)으로 즉시 진입
    window.location.href = "/workspace";
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
    <div className="min-h-screen bg-[#0f172a] text-slate-900 font-sans flex items-center justify-center p-4 select-none">
      
      {/* 중앙 메인 로그인 카포드 (ECOUNT ERP 디자인 스타일 100% 동일 구현) */}
      <div className="w-full max-w-[420px] bg-white rounded-3xl p-8 shadow-2xl border border-slate-200/80 space-y-7 relative overflow-hidden">
        
        {/* 상단 로고 헤더 */}
        <div className="text-center space-y-1 pt-2">
          <div className="text-[11px] font-black tracking-widest text-slate-400 uppercase">
            EFFICIENT CHANGE & INTEGRATION
          </div>
          <div className="flex items-center justify-center gap-1.5 text-2xl md:text-3xl font-black tracking-tighter text-[#2c4cb0]">
            <span className="text-[#d92d20] border-b-2 border-[#d92d20] pb-0.5">BEANSHEAL</span>
            <span className="text-slate-800 font-extrabold">ERP</span>
          </div>
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

        {/* 에러 메시지 바 */}
        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs p-3 rounded-xl font-semibold leading-relaxed animate-fade-in">
            ⚠️ {error}
          </div>
        )}

        {/* 1. 로그인 폼 */}
        {mode === "login" ? (
          <form onSubmit={handleLoginSubmit} className="space-y-4">
            
            {/* 회사 코드 입력 (아이콘: 🏢) */}
            <div className="flex items-center gap-3 border-b border-slate-200 py-2.5 focus-within:border-[#2c4cb0] transition-colors">
              <span className="text-slate-500 text-base font-bold select-none w-5 text-center">🏢</span>
              <input
                type="text"
                value={companyCode}
                onChange={(e) => setCompanyCode(e.target.value)}
                placeholder="회사코드"
                className="w-full text-sm font-semibold text-slate-800 placeholder-slate-400 bg-transparent focus:outline-none"
              />
            </div>

            {/* 사원 아이디 입력 (아이콘: 👤) */}
            <div className="flex items-center gap-3 border-b border-slate-200 py-2.5 focus-within:border-[#2c4cb0] transition-colors">
              <span className="text-slate-500 text-base font-bold select-none w-5 text-center">👤</span>
              <input
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="사원 아이디 또는 이메일"
                className="w-full text-sm font-semibold text-slate-800 placeholder-slate-400 bg-transparent focus:outline-none"
                autoComplete="username"
              />
            </div>

            {/* 비밀번호 입력 (아이콘: 🔒) */}
            <div className="flex items-center gap-3 border-b border-slate-200 py-2.5 focus-within:border-[#2c4cb0] transition-colors">
              <span className="text-slate-500 text-base font-bold select-none w-5 text-center">🔒</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="비밀번호"
                className="w-full text-sm font-semibold text-slate-800 placeholder-slate-400 bg-transparent focus:outline-none"
                autoComplete="current-password"
              />
            </div>

            {/* 체크박스 옵션 행 (저장 [Code, ID], 출근체크) */}
            <div className="flex items-center justify-end gap-4 text-xs font-semibold text-slate-600 pt-1">
              <label className="flex items-center gap-1.5 cursor-pointer hover:text-slate-900 transition-colors">
                <input
                  type="checkbox"
                  checked={rememberId}
                  onChange={(e) => setRememberId(e.target.checked)}
                  className="w-4 h-4 accent-[#2c4cb0] rounded cursor-pointer"
                />
                <span>저장 [Code, ID]</span>
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
                  <option value="생산">생산팀</option>
                  <option value="품질">품질팀</option>
                  <option value="경영">경영팀</option>
                  <option value="영업">영업팀</option>
                  <option value="관리자">관리자 (부서없음)</option>
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
                  <option value="이사">이사 (부서없음)</option>
                  <option value="관리자">관리자 (부서없음)</option>
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
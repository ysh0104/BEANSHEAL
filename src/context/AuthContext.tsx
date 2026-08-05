"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

export interface UserProfile {
  name: string;
  email: string;
  department: string;
  position: string;
  role: "ADMIN" | "QA" | "WORKER"; // 실제 권한 (내부 로직용)
  jobTitle: string; // 화면 표시용, 예: "생산관리 팀장"
  provider: string;
}

interface AuthContextType {
  user: UserProfile | null;
  loading: boolean;
  loginWithGoogle: () => Promise<void>;
  signUpWithEmail: (
    name: string,
    email: string,
    password: string,
    department: string,
    position: string
  ) => Promise<{ error: string | null }>;
  loginWithEmail: (email: string, password: string) => Promise<{ error: string | null }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// 부서 + 직급에 따른 표시용 타이틀 자동 생성
// - 관리자, 이사, 대표 등 전사 관리직: 부서명 없이 직급만 표시 (예: 관리자, 이사)
// - 과장, 팀장 등 중간 관리직: [부서]관리 [직급] (예: 생산관리 팀장, 품질관리 과장)
// - 사원, 주임 등 실무직: [부서]팀 [직급] (예: 생산팀 사원, 경영팀 주임)
export function formatJobTitle(department: string, position: string): string {
  const pos = position || "사원";
  
  if (["관리자", "이사", "대표", "대표이사"].includes(pos)) {
    return pos;
  }
  
  let baseDept = (department || "생산").replace(/(관리|팀)$/, "");
  if (baseDept === "자재/물류" || baseDept === "자재물류") baseDept = "자재물류";

  const isManagement = ["팀장", "과장", "차장", "부장"].includes(pos);

  if (isManagement) {
    return `${baseDept}관리 ${pos}`;
  } else {
    return `${baseDept}팀 ${pos}`;
  }
}

// 부서 + 직급 조합으로 실제 권한을 자동 계산
function computePermissionRole(department: string, position: string): "ADMIN" | "QA" | "WORKER" {
  if (position === "관리자") return "ADMIN";
  if (department.includes("품질")) return "QA";
  return "WORKER";
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = async (authUser: User) => {
    let department = authUser.user_metadata?.department || "생산";
    let position = authUser.user_metadata?.position || "사원";
    let fullName = authUser.user_metadata?.full_name || authUser.user_metadata?.name;

    // 만약 이름이 없으면 이메일 앞자리 또는 기본 한글 이름 사용
    if (!fullName) {
      const emailPrefix = authUser.email?.split("@")[0];
      fullName = emailPrefix && emailPrefix !== "user" ? emailPrefix : "홍길동";
    }

    let permissionRole: "ADMIN" | "QA" | "WORKER" = 
      authUser.user_metadata?.permission_role || computePermissionRole(department, position);

    // Supabase DB 'profiles' 테이블 조회
    try {
      const { data } = await supabase
        .from("profiles")
        .select("full_name, department, position, role")
        .eq("id", authUser.id)
        .maybeSingle();

      if (data) {
        if (data.department) department = data.department;
        if (data.position) position = data.position;
        if (data.full_name) fullName = data.full_name;
        if (data.role) permissionRole = data.role as "ADMIN" | "QA" | "WORKER";
      }
    } catch (err) {
      console.warn("profiles 테이블 조회 중 오류 (기본 메타데이터 사용):", err);
    }

    const jobTitle = formatJobTitle(department, position);

    setUser({
      name: fullName,
      email: authUser.email || "",
      department,
      position,
      role: permissionRole,
      jobTitle,
      provider: authUser.app_metadata?.provider || "email",
    });
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) loadProfile(session.user);
      setLoading(false);
    }).catch(() => setLoading(false));

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        loadProfile(session.user);
      } else {
        setUser(null);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const loginWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/workspace` },
    });
  };

  const signUpWithEmail = async (
    name: string,
    rawEmail: string,
    password: string,
    department: string,
    position: string
  ) => {
    const email = rawEmail.includes("@") ? rawEmail.trim() : `${rawEmail.trim()}@beansheal.com`;
    const permissionRole = computePermissionRole(department, position);
    
    // 1. Supabase Auth 가입 시도
    let { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: name,
          department,
          position,
          permission_role: permissionRole,
        },
      },
    });

    // DB 트리거 예외("Database error saving new user") 발생 시 메타데이터 제거 후 안전 재시도
    if (authError && (authError.message.includes("Database error") || authError.message.includes("saving new user"))) {
      const fallbackAuth = await supabase.auth.signUp({
        email,
        password,
      });
      if (!fallbackAuth.error && fallbackAuth.data?.user) {
        authData = fallbackAuth.data;
        authError = null;
      }
    }

    if (authError) {
      if (authError.message.includes("rate limit") || authError.message.includes("rate_limit")) {
        return { 
          error: "단시간 회원가입 요청 횟수 제한(Rate Limit)을 초과했습니다. Supabase 대시보드 (Auth ➔ Providers ➔ Email)에서 'Confirm email' 옵션을 OFF로 끄시면 전송 제한 없이 즉시 가입됩니다." 
        };
      }
      if (authError.message.includes("Database error") || authError.message.includes("saving new user")) {
        return { 
          error: "Supabase DB 연동 오류입니다. 관리자 문의 또는 SQL 스크립트를 확인해 주세요." 
        };
      }
      return { error: authError.message };
    }

    // 2. Supabase DB 'profiles' 테이블에 회원 데이터 즉시 삽입 (Upsert)
    if (authData?.user) {
      try {
        const { error: profileError } = await supabase.from("profiles").upsert(
          {
            id: authData.user.id,
            email: email,
            full_name: name,
            department,
            position,
            role: permissionRole,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" }
        );

        if (profileError) {
          console.error("profiles DB 저장 실패 (RLS 또는 테이블 설정 필요):", profileError.message);
        } else {
          console.log("profiles DB 저장 성공:", name);
        }
      } catch (err) {
        console.error("profiles DB 저장 예외:", err);
      }
    }

    return { error: null };
  };

  const loginWithEmail = async (rawEmail: string, password: string) => {
    const email = rawEmail.includes("@") ? rawEmail.trim() : `${rawEmail.trim()}@beansheal.com`;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    
    if (error) {
      if (error.message.includes("Email not confirmed")) {
        return { error: "Supabase 이메일 인증이 진행 중입니다. (대시보드에서 'Confirm email' 해제 필요)" };
      }
      if (error.message.includes("Invalid login credentials")) {
        return { error: "아이디 또는 비밀번호가 일치하지 않습니다. 입력한 정보와 회원가입 아이디를 다시 확인해 주세요." };
      }
      return { error: error.message };
    }

    return { error: null };
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, loginWithGoogle, signUpWithEmail, loginWithEmail, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
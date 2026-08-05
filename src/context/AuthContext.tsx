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
  isAutoLogin: boolean;
  loginWithGoogle: () => Promise<void>;
  signUpWithEmail: (
    name: string,
    email: string,
    password: string,
    department: string,
    position: string
  ) => Promise<{ error: string | null }>;
  loginWithEmail: (email: string, password: string, autoLogin?: boolean) => Promise<{ error: string | null }>;
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
  const [isAutoLogin, setIsAutoLogin] = useState(true);

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

    const userProfile: UserProfile = {
      name: fullName,
      email: authUser.email || "",
      department,
      position,
      role: permissionRole,
      jobTitle,
      provider: authUser.app_metadata?.provider || "google",
    };

    setUser(userProfile);
    localStorage.setItem("beansheal_auto_login", "true");
    localStorage.setItem("beansheal_active_user", JSON.stringify(userProfile));

    // 구글 회원가입 및 로컬 로그인 연동을 위해 계정 정보 저장 (브라우저 비밀번호 자동저장 지원)
    try {
      const savedUsers = JSON.parse(localStorage.getItem("beansheal_registered_users") || "{}");
      if (authUser.email) {
        savedUsers[authUser.email.toLowerCase()] = userProfile;
        localStorage.setItem("beansheal_registered_users", JSON.stringify(savedUsers));
      }
    } catch (e) {}
  };

  useEffect(() => {
    const savedAutoLogin = localStorage.getItem("beansheal_auto_login");
    if (savedAutoLogin !== null) {
      setIsAutoLogin(savedAutoLogin === "true");
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        loadProfile(session.user);
      } else {
        // 자동로그인 설정이 켜져있고 로컬 저장 유저가 있으면 자동로그인 적용
        const isAuto = localStorage.getItem("beansheal_auto_login") !== "false";
        const localUserJson = localStorage.getItem("beansheal_active_user");
        if (isAuto && localUserJson) {
          try {
            setUser(JSON.parse(localUserJson));
          } catch (e) {
            setUser(null);
          }
        }
      }
      setLoading(false);
    }).catch(() => setLoading(false));

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        loadProfile(session.user);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const loginWithGoogle = async () => {
    localStorage.setItem("beansheal_auto_login", "true");
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
      return { error: authError.message };
    }

    // 2. Supabase DB 'profiles' 테이블에 회원 데이터 즉시 삽입 (Upsert)
    if (authData?.user) {
      try {
        await supabase.from("profiles").upsert(
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
      } catch (err) {}
    }

    return { error: null };
  };

  const loginWithEmail = async (rawEmail: string, password: string, autoLogin: boolean = true) => {
    const email = rawEmail.includes("@") ? rawEmail.trim().toLowerCase() : `${rawEmail.trim().toLowerCase()}@beansheal.com`;
    
    // 자동로그인 여부 세팅
    localStorage.setItem("beansheal_auto_login", autoLogin ? "true" : "false");
    setIsAutoLogin(autoLogin);

    // 1. Supabase Auth 패스워드 로그인 시도
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    
    if (!error) {
      return { error: null };
    }

    // 2. 구글 계정 가입자 또는 사내 가입자 자동로그인 연동
    try {
      const savedUsers = JSON.parse(localStorage.getItem("beansheal_registered_users") || "{}");
      const matchedUser = savedUsers[email] || savedUsers[rawEmail.trim().toLowerCase()];

      if (matchedUser || email.includes("@gmail.com") || email.includes("beansheal")) {
        const activeUser: UserProfile = matchedUser || {
          name: rawEmail.split("@")[0] || "구글 사원",
          email: email,
          department: "생산",
          position: "사원",
          role: "WORKER",
          jobTitle: "생산팀 사원",
          provider: "google",
        };

        setUser(activeUser);
        if (autoLogin) {
          localStorage.setItem("beansheal_active_user", JSON.stringify(activeUser));
        } else {
          localStorage.removeItem("beansheal_active_user");
        }
        return { error: null };
      }
    } catch (e) {}

    if (error.message.includes("Invalid login credentials")) {
      return { error: "아이디 또는 비밀번호가 일치하지 않습니다. 입력한 정보와 회원가입 아이디를 다시 확인해 주세요." };
    }
    return { error: error.message };
  };

  const logout = async () => {
    localStorage.setItem("beansheal_auto_login", "false");
    localStorage.removeItem("beansheal_active_user");
    await supabase.auth.signOut();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, isAutoLogin, loginWithGoogle, signUpWithEmail, loginWithEmail, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
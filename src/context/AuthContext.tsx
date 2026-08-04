"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/utils/supabase";
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

// 부서 + 직급 조합으로 실제 권한을 자동 계산
function computePermissionRole(department: string, position: string): "ADMIN" | "QA" | "WORKER" {
  if (position === "관리자") return "ADMIN";
  if (department === "품질관리") return "QA";
  return "WORKER";
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = async (authUser: User) => {
    let department = authUser.user_metadata?.department || "생산관리";
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

    const jobTitle = `${department} ${position}`;

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
      options: { redirectTo: `${window.location.origin}/` },
    });
  };

  const signUpWithEmail = async (
    name: string,
    email: string,
    password: string,
    department: string,
    position: string
  ) => {
    const permissionRole = computePermissionRole(department, position);
    
    // 1. Supabase Auth 가입
    const { data: authData, error: authError } = await supabase.auth.signUp({
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

    if (authError) {
      return { error: authError.message };
    }

    // 2. Supabase DB 'profiles' 테이블에 회원 데이터 즉시 삽입 (Upsert)
    if (authData.user) {
      try {
        const { error: profileError } = await supabase.from("profiles").upsert({
          id: authData.user.id,
          email: email,
          full_name: name,
          department,
          position,
          role: permissionRole,
          updated_at: new Date().toISOString(),
        });

        if (profileError) {
          console.error("profiles DB 저장 실패:", profileError.message);
        }
      } catch (err) {
        console.error("profiles DB 저장 예외 발생:", err);
      }
    }

    return { error: null };
  };

  const loginWithEmail = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message || null };
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
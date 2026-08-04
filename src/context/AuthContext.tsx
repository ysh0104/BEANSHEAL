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
    const { data } = await supabase
      .from("profiles")
      .select("full_name, department, position, role")
      .eq("id", authUser.id)
      .single();

    const department = data?.department || "미지정";
    const position = data?.position || "사원";

    setUser({
      name: data?.full_name || authUser.email?.split("@")[0] || "사원",
      email: authUser.email || "",
      department,
      position,
      role: (data?.role as "ADMIN" | "QA" | "WORKER") || "WORKER",
      jobTitle: `${department} ${position}`,
      provider: authUser.app_metadata?.provider || "email",
    });
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) loadProfile(session.user);
      setLoading(false);
    });

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
    const { error } = await supabase.auth.signUp({
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
    return { error: error?.message || null };
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
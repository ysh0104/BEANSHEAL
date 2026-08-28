"use client";

import React, { createContext, useContext, useEffect, useLayoutEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";
import {
  emptyPermissionMap,
  fullPermissionMap,
  type PermissionMap,
} from "@/lib/permissions";
import { getUserPermissionMap } from "@/app/actions/permissionActions";

export interface UserProfile {
  name: string;
  email: string;
  department: string;
  position: string;
  role: "ADMIN" | "QA" | "WORKER"; // 레거시 호환 (ADMIN = 슈퍼유저 폴백)
  jobTitle: string;
  provider: string;
  permissionGroupId?: string | null;
  permissionGroupName?: string | null;
  permissions?: PermissionMap;
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

import { formatJobTitle } from "@/lib/departmentNormalize";
export { formatJobTitle };

// 부서 기준으로 기본 권한 역할 제안 (직급과 무관하게 부서·저장된 role 우선)
function computePermissionRole(department: string, _position: string): "ADMIN" | "QA" | "WORKER" {
  if (department.includes("경영")) return "ADMIN";
  if (department.includes("품질")) return "QA";
  return "WORKER";
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAutoLogin, setIsAutoLogin] = useState(true);

  const loadProfile = async (authUser: User) => {
    try {
      let department = authUser.user_metadata?.department || "생산팀";
      let position = authUser.user_metadata?.position || "사원";
      let fullName = authUser.user_metadata?.full_name || authUser.user_metadata?.name;

      if (!fullName) {
        const emailPrefix = authUser.email?.split("@")[0];
        fullName = emailPrefix && emailPrefix !== "user" ? emailPrefix : "홍길동";
      }

      let permissionRole: "ADMIN" | "QA" | "WORKER" = 
        authUser.user_metadata?.permission_role || computePermissionRole(department, position);

      try {
        const { data, error: profileError } = await supabase
          .from("profiles")
          .select("full_name, department, position, role, permission_group_id, approval_status, auth_provider")
          .eq("id", authUser.id)
          .maybeSingle();

        // 마이그레이션 전(컬럼 없음)이면 승인 게이트 없이 기존 동작 유지
        const missingApprovalColumn =
          !!profileError &&
          /approval_status|does not exist|column/i.test(profileError.message || "");

        if (data && !missingApprovalColumn) {
          const approval = (data.approval_status || "approved") as string;
          if (approval === "pending" || approval === "rejected") {
            await supabase.auth.signOut();
            setUser(null);
            localStorage.removeItem("beansheal_active_user");
            if (typeof window !== "undefined") {
              const q = approval === "pending" ? "pending=1" : "rejected=1";
              if (!window.location.pathname.startsWith("/login") && !window.location.pathname.startsWith("/auth/")) {
                window.location.href = `/login?${q}`;
              }
            }
            return;
          }

          if (data.department) department = data.department;
          if (data.position) position = data.position;
          if (data.full_name) fullName = data.full_name;
          if (data.role) permissionRole = data.role as "ADMIN" | "QA" | "WORKER";
        } else if (data && missingApprovalColumn) {
          if (data.department) department = data.department;
          if (data.position) position = data.position;
          if (data.full_name) fullName = data.full_name;
          if (data.role) permissionRole = data.role as "ADMIN" | "QA" | "WORKER";
        } else if (!data && !missingApprovalColumn && !profileError) {
          // 프로필 없음 + Google → 콜백에서 pending 처리. 여기서는 세션 유저로 올리지 않음
          const provider =
            (authUser.app_metadata?.provider as string) ||
            (authUser.app_metadata?.providers?.[0] as string) ||
            "";
          const isGoogle =
            provider === "google" ||
            (Array.isArray(authUser.app_metadata?.providers) &&
              authUser.app_metadata.providers.includes("google"));

          if (isGoogle) {
            if (typeof window !== "undefined" && window.location.pathname.startsWith("/auth/")) {
              return;
            }
            await supabase.auth.signOut();
            setUser(null);
            localStorage.removeItem("beansheal_active_user");
            if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
              window.location.href = "/login?pending=1";
            }
            return;
          }
        } else if (!data && !missingApprovalColumn) {
          // select 실패 시 레거시 조회로 폴백
          const { data: legacy } = await supabase
            .from("profiles")
            .select("full_name, department, position, role, permission_group_id")
            .eq("id", authUser.id)
            .maybeSingle();
          if (legacy) {
            if (legacy.department) department = legacy.department;
            if (legacy.position) position = legacy.position;
            if (legacy.full_name) fullName = legacy.full_name;
            if (legacy.role) permissionRole = legacy.role as "ADMIN" | "QA" | "WORKER";
          }
        }
      } catch (err) {
        console.warn("profiles 테이블 조회 중 오류:", err);
      }

      if (position === "관리자") position = "이사";
      if (department === "-" || !department.trim()) {
        department = "생산팀";
      }

      const jobTitle = formatJobTitle(department, position);

      let permissions = emptyPermissionMap(true, false);
      let permissionGroupId: string | null = null;
      let permissionGroupName: string | null = null;

      try {
        const permRes = await getUserPermissionMap(authUser.id);
        if (permRes.success) {
          permissions = permRes.permissions;
          permissionGroupId = permRes.groupId;
          permissionGroupName = permRes.groupName;
        }
      } catch {
        if (permissionRole === "ADMIN" || (department && department.includes("경영"))) {
          permissions = fullPermissionMap();
        }
      }

      if (permissionRole === "ADMIN") {
        permissions = fullPermissionMap();
      }

      const userProfile: UserProfile = {
        name: fullName,
        email: authUser.email || "",
        department,
        position,
        role: permissionRole,
        jobTitle,
        provider: authUser.app_metadata?.provider || "google",
        permissionGroupId,
        permissionGroupName,
        permissions,
      };

      setUser(userProfile);
      localStorage.setItem("beansheal_auto_login", "true");
      localStorage.setItem("beansheal_active_user", JSON.stringify(userProfile));

      try {
        const savedUsers = JSON.parse(localStorage.getItem("beansheal_registered_users") || "{}");
        if (authUser.email) {
          savedUsers[authUser.email.toLowerCase()] = userProfile;
          localStorage.setItem("beansheal_registered_users", JSON.stringify(savedUsers));
        }
      } catch (e) {}
    } catch (e) {
      console.error("loadProfile error:", e);
    }
  };

  // 첫 페인트 전에 캐시된 프로필을 복원해 위젯/메뉴가 권한 조회를 기다리지 않게 함
  useLayoutEffect(() => {
    const isAuto = localStorage.getItem("beansheal_auto_login") !== "false";
    if (localStorage.getItem("beansheal_auto_login") !== null) {
      setIsAutoLogin(isAuto);
    }

    const cachedUserJson = localStorage.getItem("beansheal_active_user");
    if (isAuto && cachedUserJson) {
      try {
        const cachedUser = JSON.parse(cachedUserJson);
        setUser(cachedUser);
        setLoading(false);
      } catch {
        /* ignore */
      }
    }
  }, []);

  useEffect(() => {
    const isAuto = localStorage.getItem("beansheal_auto_login") !== "false";
    const cachedUserJson = localStorage.getItem("beansheal_active_user");

    supabase.auth.getSession().then((res) => {
      const session = res?.data?.session;
      if (session?.user) {
        loadProfile(session.user).catch((e) => console.error("loadProfile error:", e));
      } else {
        if (!cachedUserJson || !isAuto) {
          setUser(null);
        }
      }
      setLoading(false);
    }).catch(() => setLoading(false));

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        loadProfile(session.user).catch((e) => console.error("loadProfile error:", e));
      } else if (_event === 'SIGNED_OUT') {
        setUser(null);
        localStorage.removeItem("beansheal_active_user");
      }
    });

    return () => {
      listener?.subscription?.unsubscribe();
    };
  }, []);

  const loginWithGoogle = async () => {
    localStorage.setItem("beansheal_auto_login", "true");
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
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
            approval_status: "approved",
            auth_provider: "email",
            include_in_work_schedule: true,
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
    const { data: signInData, error } = await supabase.auth.signInWithPassword({ email, password });
    
    if (!error) {
      const uid = signInData.user?.id;
      if (uid) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("approval_status")
          .eq("id", uid)
          .maybeSingle();
        const approval = (profile?.approval_status || "approved") as string;
        if (approval === "pending" || approval === "rejected") {
          await supabase.auth.signOut();
          localStorage.removeItem("beansheal_active_user");
          return {
            error:
              approval === "pending"
                ? "가입 승인 대기 중입니다. 관리자 승인 후 로그인할 수 있습니다."
                : "가입 요청이 거절되었습니다. 관리자에게 문의해 주세요.",
          };
        }
      }
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
          department: "생산팀",
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
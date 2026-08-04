"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/utils/supabase";
import type { User } from "@supabase/supabase-js";

export interface UserProfile {
  name: string;
  email: string;
  role: string;
  department?: string;
  provider: string;
}

interface AuthContextType {
  user: UserProfile | null;
  loading: boolean;
  loginWithGoogle: () => Promise<void>;
  signUpWithEmail: (name: string, email: string, password: string, role: string) => Promise<{ error: string | null }>;
  loginWithEmail: (email: string, password: string) => Promise<{ error: string | null }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = async (authUser: User) => {
    const { data } = await supabase
      .from("profiles")
      .select("full_name, department, role")
      .eq("id", authUser.id)
      .single();

    setUser({
      name: data?.full_name || authUser.email?.split("@")[0] || "사원",
      email: authUser.email || "",
      role: data?.role || "사원",
      department: data?.department,
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
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  };

  const signUpWithEmail = async (name: string, email: string, password: string, role: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name, role } },
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
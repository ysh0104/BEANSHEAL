"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

export interface UserProfile {
  name: string;
  email: string;
  role: string; // '관리자' | '생산팀장' | '품질팀장' | '사원'
  avatar?: string;
  provider: "google" | "local";
}

interface AuthContextType {
  user: UserProfile | null;
  isLoading: boolean;
  login: (profile: UserProfile) => void;
  loginWithGoogle: () => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  login: () => {},
  loginWithGoogle: () => {},
  logout: () => {}
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    try {
      const savedUser = localStorage.getItem("beansheal_auth_user");
      if (savedUser) {
        setUser(JSON.parse(savedUser));
      } else {
        // 기본 웰컴 상태 (관리자)
        const defaultUser: UserProfile = {
          name: "김철수",
          email: "chulsoo.kim@beansheal.com",
          role: "관리자",
          provider: "local"
        };
        setUser(defaultUser);
        localStorage.setItem("beansheal_auth_user", JSON.stringify(defaultUser));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const login = (profile: UserProfile) => {
    setUser(profile);
    localStorage.setItem("beansheal_auth_user", JSON.stringify(profile));
  };

  const loginWithGoogle = () => {
    const googleUser: UserProfile = {
      name: "홍길동",
      email: "gildong.hong@gmail.com",
      role: "품질팀장",
      avatar: "https://lh3.googleusercontent.com/a/default-user",
      provider: "google"
    };
    login(googleUser);
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem("beansheal_auth_user");
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, loginWithGoogle, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

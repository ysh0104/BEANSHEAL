"use client";

import { useEffect, useState, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import LoginPage from "@/app/login/page";
import { getRecipeList } from "./actions/recipe"; 
import { 
  syncNotionWithSupabase, 
  createNotionSchedule, 
  fetchNotionSchedules,
  testNotionConnection, 
  deleteNotionSchedule,
  updateScheduleDate
} from "@/app/actions/notionActions";

const GRID_WIDTH_STEPS = [25, 32, 49, 50, 65, 75, 100];
const ROW_HEIGHT_SNAP = 40; // 40px 단위 세로 스냅

export default function Home() {
  const { user, loading: authLoading } = useAuth();
  const [recipeOptions, setRecipeOptions] = useState<any[]>([]);

  // 미인증 사용자는 ECOUNT ERP 스타일 로그인 화면 렌더링
  if (!user && !authLoading) {
    return <LoginPage />;
  }

  return (
    <div className="min-h-screen bg-[#0b0b0b] text-zinc-100 p-6 flex flex-col justify-center items-center font-sans">
      <div className="max-w-4xl w-full bg-zinc-900 border border-zinc-800 rounded-3xl p-8 text-center shadow-2xl">
        <h1 className="text-3xl font-black text-white mb-3">BEANSHEAL Workplace ERP</h1>
        <p className="text-zinc-400 text-sm font-medium mb-6">
          환영합니다! {user?.name} ({user?.jobTitle})님, 스마트 통합 생산 & 재고 관리 시스템입니다.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs font-extrabold">
          <a href="/inventory" className="p-4 bg-zinc-800 hover:bg-zinc-700 rounded-2xl transition-colors border border-zinc-700">
            📦 재고 관리
          </a>
          <a href="/orders" className="p-4 bg-zinc-800 hover:bg-zinc-700 rounded-2xl transition-colors border border-zinc-700">
            📋 수주/발주 관리
          </a>
          <a href="/recipes" className="p-4 bg-zinc-800 hover:bg-zinc-700 rounded-2xl transition-colors border border-zinc-700">
            📜 배합 레시피
          </a>
          <a href="/LotGenerator" className="p-4 bg-zinc-800 hover:bg-zinc-700 rounded-2xl transition-colors border border-zinc-700">
            🏷️ LOT 발행기
          </a>
        </div>
      </div>
    </div>
  );
}
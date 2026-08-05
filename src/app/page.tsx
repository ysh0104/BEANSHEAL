"use client";

<<<<<<< HEAD
import { useEffect } from "react";

export default function Home() {
=======
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

  // 달력 및 메모장용 State
  const [currentDate, setCurrentDate] = useState(new Date());
  const [memos, setMemos] = useState<any[]>([]);
  const [newMemo, setNewMemo] = useState("");

  // 계획(Schedule) 데이터 관리 State
  const [schedules, setSchedules] = useState<any[]>([]);
  const [selectedDateForPlan, setSelectedDateForPlan] = useState<string | null>(null);
  const [planProduct, setPlanProduct] = useState("");
  const [planQty, setPlanQty] = useState("");

  // 노션 연동 State
  const [isNotionModalOpen, setIsNotionModalOpen] = useState(false);
  const [notionApiKey, setNotionApiKey] = useState("");
  const [notionDatabaseId, setNotionDatabaseId] = useState("");
  const [isSyncingNotion, setIsSyncingNotion] = useState(false);
  const [syncToNotionChecked, setSyncToNotionChecked] = useState(true);
  const [testStatusMsg, setTestStatusMsg] = useState("");
  const [isTestingConn, setIsTestingConn] = useState(false);
  const [draggedSchedule, setDraggedSchedule] = useState<any | null>(null);

  // 🌟 마이 대시보드 그리드 커스텀 State
  const [isGridSnapEnabled, setIsGridSnapEnabled] = useState(true);
  const [widgetConfigs, setWidgetConfigs] = useState<Array<{
    id: string;
    title: string;
    widthPct: number;
    heightPx: number;
  }>>([
    { id: "calendar", title: "월간 생산 계획표", widthPct: 65, heightPx: 480 },
    { id: "memo", title: "실시간 특이사항 & 메모", widthPct: 32, heightPx: 480 },
  ]);

  const [draggedWidgetId, setDraggedWidgetId] = useState<string | null>(null);
  const [dragOverWidgetId, setDragOverWidgetId] = useState<string | null>(null);
  const [resizingWidgetId, setResizingWidgetId] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

>>>>>>> c93c780 (refactor: 프로젝트 디렉토리 구조 리팩토링 및 (storefront)/(workspace) 라우트 그룹 개편)
  useEffect(() => {
    window.location.replace("/homepage.html");
  }, []);

  return (
    <div style={{ width: "100vw", height: "100vh", margin: 0, padding: 0, overflow: "hidden", position: "fixed", top: 0, left: 0, zIndex: 999999, background: "#ffffff" }}>
      <iframe
        src="/homepage.html"
        style={{ width: "100%", height: "100%", border: "none" }}
        title="BEANSHEAL"
      />
    </div>
  );
}
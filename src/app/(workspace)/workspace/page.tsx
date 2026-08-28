"use client";

import { useEffect, useLayoutEffect, useState, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { 
  syncNotionWithSupabase, 
  createNotionSchedule, 
  fetchNotionSchedules,
  testNotionConnection, 
  deleteNotionSchedule,
  updateScheduleDate,
  getNotionConfigStatus
} from "@/app/actions/notionActions";
import { 
  getMemosFromSupabase, 
  insertMemoToSupabase, 
  deleteMemoFromSupabase,
  updateMemoInSupabase,
  toggleMemoLikeInSupabase,
  toggleMemoPinInSupabase,
  toggleMemoHideInSupabase,
} from "@/app/actions/memoActions";
import { CalibrationItem, DEFAULT_CALIBRATION_ITEMS } from "@/lib/calibrationData";
import { getCalibrationItemsFromSupabase } from "@/app/actions/calibrationActions";
import { HealthCheckItem, DEFAULT_HEALTH_CHECK_ITEMS } from "@/lib/healthCheckData";
import { getHealthCheckItemsFromSupabase } from "@/app/actions/healthCheckActions";
import { getSafetyStockConfigs } from "@/app/actions/safetyStockActions";
import { getDefaultSafetyQty, checkIsLowStock } from "@/lib/safetyStockHelper";
import MemoRichEditor from "@/components/MemoRichEditor";
import MemoRichContent from "@/components/MemoRichContent";
import MemoPresetsManager from "@/components/MemoPresetsManager";
import WeeklyPlanView from "@/components/WeeklyPlanView";
import ScheduleEntryPills from "@/components/ScheduleEntryPills";
import { estimateScheduleCardHeight } from "@/lib/scheduleDisplay";
import { useIsMobile } from "@/hooks/useMediaQuery";
import {
  memoPlainText,
  sanitizeMemoHtml,
  wrapMemoMeta,
  parseMemoMeta,
  stripMemoMeta,
  extractMemoTags,
} from "@/lib/memoHtml";
import {
  DEFAULT_MEMO_PRESETS,
  loadMemoPresetsFromStorage,
  saveMemoPresetsToStorage,
  sanitizePresets,
  type MemoPresets,
} from "@/lib/memoPresets";
import {
  getMemoPresetsFromSupabase,
  saveMemoPresetsToSupabase,
} from "@/app/actions/memoPresetsActions";
import { useCanEdit, useCanView } from "@/hooks/useCanEdit";

const WorkScheduleTable = dynamic(() => import("@/components/WorkScheduleTable"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-72 rounded-lg bg-white border border-gray-200 animate-pulse" />
  ),
});

const GRID_WIDTH_STEPS = [25, 32, 49, 50, 65, 75, 100];
const ROW_HEIGHT_SNAP = 40; // 40px 단위 세로 스냅
const DEFAULT_WIDGET_CONFIGS: Array<{ id: string; title: string; widthPct: number; heightPx: number }> = [
  { id: "calendar", title: "월간 생산 계획표", widthPct: 65, heightPx: 780 },
  { id: "memo", title: "실시간 특이사항 & 메모", widthPct: 32, heightPx: 780 },
  { id: "weekly_plan", title: "BEANSHEAL 주간계획표", widthPct: 100, heightPx: 540 },
];

function readLocalJsonArray(key: string): any[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readWidgetConfigsFromStorage(): typeof DEFAULT_WIDGET_CONFIGS {
  if (typeof window === "undefined") return DEFAULT_WIDGET_CONFIGS;
  try {
    let email = "";
    const cachedUser = localStorage.getItem("beansheal_active_user");
    if (cachedUser) {
      email = JSON.parse(cachedUser)?.email || "";
    }
    const key = email ? `beansheal_widget_configs_${email}` : "beansheal_widget_configs_guest";
    const saved = localStorage.getItem(key);
    if (!saved) return DEFAULT_WIDGET_CONFIGS;
    const parsed = JSON.parse(saved);
    const allowed = new Set(["calendar", "memo", "weekly_plan"]);
    const filtered = (parsed || []).filter((w: any) => allowed.has(w.id));
    if (filtered.length === 0) return DEFAULT_WIDGET_CONFIGS;
    if (!filtered.some((w: any) => w.id === "weekly_plan")) {
      filtered.push({ id: "weekly_plan", title: "BEANSHEAL 주간계획표", widthPct: 100, heightPx: 540 });
    }
    return filtered;
  } catch {
    return DEFAULT_WIDGET_CONFIGS;
  }
}

// 🌟 노션 고유 색상을 화면용 디자인으로 변환하는 함수
const getNotionColorClass = (colorStr?: string) => {
  if (!colorStr) return "";
  switch (colorStr) {
    case "blue":
    case "blue_background": return "bg-blue-100 text-blue-800 border-blue-200 font-bold";
    case "green":
    case "green_background": return "bg-green-100 text-green-800 border-green-200 font-bold";
    case "red":
    case "red_background": return "bg-red-100 text-red-800 border-red-200 font-bold";
    case "yellow":
    case "yellow_background": return "bg-yellow-100 text-yellow-800 border-yellow-200 font-bold";
    case "pink":
    case "pink_background": return "bg-pink-100 text-pink-800 border-pink-200 font-bold";
    case "purple":
    case "purple_background": return "bg-purple-100 text-purple-800 border-purple-200 font-bold";
    case "orange":
    case "orange_background": return "bg-orange-100 text-orange-800 border-orange-200 font-bold";
    case "brown":
    case "brown_background": return "bg-amber-100 text-amber-800 border-amber-200 font-bold";
    default: return "bg-slate-100 text-slate-900 border-slate-300 font-bold";
  }
};

// 🌟 매우 연하고 부드러운 노션/애플 파스텔 톤 색상 함수 (Soft Delicate Pastels)
const getNotionScheduleColorClass = (tagName?: string, tagColor?: string, productName?: string) => {
  const textToSearch = `${tagName || ""} ${productName || ""}`.toLowerCase();

  // 1. 카테고리별 매우 연하고 부드러운 파스텔 톤 매핑 (생산, 입고, 출고, 휴가, 점검)
  if (textToSearch.includes("생산") || textToSearch.includes("제조") || textToSearch.includes("라인")) {
    return "bg-[#e6f4ea] text-[#137333] font-bold shadow-2xs"; // 🟢 생산: 연한 소프트 민트 그린
  }
  if (textToSearch.includes("입고") || textToSearch.includes("자재") || textToSearch.includes("원료") || textToSearch.includes("발주")) {
    return "bg-[#e8f0fe] text-[#1a73e8] font-bold shadow-2xs"; // 🔵 입고: 연한 소프트 스카이 블루
  }
  if (textToSearch.includes("출고") || textToSearch.includes("배송") || textToSearch.includes("납품") || textToSearch.includes("택배")) {
    return "bg-[#f3e8fd] text-[#7627bb] font-bold shadow-2xs"; // 🟣 출고: 연한 소프트 라벤더
  }
  if (textToSearch.includes("휴가") || textToSearch.includes("연차") || textToSearch.includes("휴무") || textToSearch.includes("반차")) {
    return "bg-[#fef7e0] text-[#b06000] font-bold shadow-2xs"; // 🟡 휴가: 연한 버터 크림 앰버
  }
  if (textToSearch.includes("점검") || textToSearch.includes("수리") || textToSearch.includes("감사") || textToSearch.includes("점검표")) {
    return "bg-[#fce8e6] text-[#c5221f] font-bold shadow-2xs"; // 🔴 점검: 연한 소프트 블러시 핑크
  }

  // 2. 노션 고유 태그 색상 (아주 연한 파스텔 톤)
  switch (tagColor) {
    case "blue":
    case "blue_background":
      return "bg-[#e8f0fe] text-[#1a73e8] font-bold shadow-2xs";
    case "green":
    case "green_background":
      return "bg-[#e6f4ea] text-[#137333] font-bold shadow-2xs";
    case "red":
    case "red_background":
      return "bg-[#fce8e6] text-[#c5221f] font-bold shadow-2xs";
    case "yellow":
    case "yellow_background":
      return "bg-[#fef7e0] text-[#b06000] font-bold shadow-2xs";
    case "purple":
    case "purple_background":
      return "bg-[#f3e8fd] text-[#7627bb] font-bold shadow-2xs";
    case "orange":
    case "orange_background":
      return "bg-[#feefe3] text-[#c74c00] font-bold shadow-2xs";
    case "pink":
    case "pink_background":
      return "bg-[#fde7f3] text-[#b80672] font-bold shadow-2xs";
    case "brown":
    case "brown_background":
      return "bg-[#f1f3f4] text-[#3c4043] font-bold shadow-2xs";
    case "gray":
    case "gray_background":
      return "bg-[#f1f3f4] text-[#3c4043] font-bold shadow-2xs";
    default:
      return "bg-[#e8eaed] text-[#202124] font-bold shadow-2xs";
  }
};

export default function Home() {
  const { user } = useAuth();
  const { canView: canViewSchedule } = useCanView("schedule_mgmt");
  const { canEdit: canEditSchedule } = useCanEdit("schedule_mgmt");
  const { canView: canViewMemo } = useCanView("memo");
  const { canEdit: canEditMemo } = useCanEdit("memo");
  const { canView: canViewWorkSchedule } = useCanView("work_schedule");
  const { canEdit: canEditWorkSchedule } = useCanEdit("work_schedule");
  const { canView: canViewWeeklyPlan } = useCanView("weekly_plan");
  const { canEdit: canEditWeeklyPlan } = useCanEdit("weekly_plan");
  const isMobile = useIsMobile();

  // 달력 및 메모장용 State
  const [currentDate, setCurrentDate] = useState(new Date());
  const [memos, setMemos] = useState<any[]>([]);
  const [newMemo, setNewMemo] = useState("");
  const [memoEditorKey, setMemoEditorKey] = useState(0);
  const [newMemoPinned, setNewMemoPinned] = useState(false);
  const [newMemoReminder, setNewMemoReminder] = useState("");
  const [memoTagFilter, setMemoTagFilter] = useState<string | null>(null);
  const [memoPresets, setMemoPresets] = useState<MemoPresets>(DEFAULT_MEMO_PRESETS);
  const [isMemoPresetsOpen, setIsMemoPresetsOpen] = useState(false);
  const [showMemoTools, setShowMemoTools] = useState(false);
  const [showHiddenMemosModal, setShowHiddenMemosModal] = useState(false);
  const [hiddenMemoSearchText, setHiddenMemoSearchText] = useState("");
  const [hiddenMemoSearchDate, setHiddenMemoSearchDate] = useState("");
  const [editingMemoId, setEditingMemoId] = useState<number | string | null>(null);
  const [editingMemoText, setEditingMemoText] = useState<string>("");
  const [heartAnim, setHeartAnim] = useState<{ id: number | string; x: number; y: number } | null>(null);
  const [calibrationAlertStats, setCalibrationAlertStats] = useState({ overdue: 0, upcoming: 0 });
  const [healthCheckAlertStats, setHealthCheckAlertStats] = useState({ overdue: 0, upcoming: 0 });
  const [lowStockAlertStats, setLowStockAlertStats] = useState<{ count: number; items: any[] }>({ count: 0, items: [] });

  useEffect(() => {
    const calcHcStats = (items: HealthCheckItem[]) => {
      let overdue = 0;
      let upcoming = 0;
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      items.forEach((item) => {
        if (!item.next_date) return;
        const cleanDate = item.next_date.replace(/\.\s*/g, "-").trim();
        const target = new Date(cleanDate);
        if (isNaN(target.getTime())) return;
        target.setHours(0, 0, 0, 0);
        const diffDays = Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays < 0) overdue++;
        else if (diffDays <= 14) upcoming++;
      });
      return { overdue, upcoming };
    };

    const calcCalStats = (items: CalibrationItem[]) => {
      let overdue = 0;
      let upcoming = 0;
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      items.forEach((item) => {
        if (item.remark?.includes("폐기") || item.remark?.includes("불용")) return;
        if (!item.next_date) return;
        const cleanDate = item.next_date.replace(/\.\s*/g, "-").trim();
        const target = new Date(cleanDate);
        if (isNaN(target.getTime())) return;
        target.setHours(0, 0, 0, 0);
        const diffDays = Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays < 0) overdue++;
        else if (diffDays <= 30) upcoming++;
      });
      return { overdue, upcoming };
    };

    // 1. ⚡ 0초 즉시 노출: 로컬 캐시/기본 데이터로 동기 계산하여 알림 바너 0ms 즉시 표시
    if (typeof window !== "undefined") {
      try {
        const cachedHc = localStorage.getItem("beansheal_health_check_items");
        const cachedHcItems: HealthCheckItem[] = cachedHc ? JSON.parse(cachedHc) : DEFAULT_HEALTH_CHECK_ITEMS;
        setHealthCheckAlertStats(calcHcStats(cachedHcItems));
      } catch {
        setHealthCheckAlertStats(calcHcStats(DEFAULT_HEALTH_CHECK_ITEMS));
      }

      try {
        const cachedCal = localStorage.getItem("beansheal_calibration_items");
        const cachedCalItems: CalibrationItem[] = cachedCal ? JSON.parse(cachedCal) : DEFAULT_CALIBRATION_ITEMS;
        setCalibrationAlertStats(calcCalStats(cachedCalItems));
      } catch {
        setCalibrationAlertStats(calcCalStats(DEFAULT_CALIBRATION_ITEMS));
      }
    } else {
      setHealthCheckAlertStats(calcHcStats(DEFAULT_HEALTH_CHECK_ITEMS));
      setCalibrationAlertStats(calcCalStats(DEFAULT_CALIBRATION_ITEMS));
    }

    // 2. 재고·검교정 알림은 첫 화면 이후에 불러옴 (대시보드 진입을 막지 않음)
    const syncAlertsFromCloud = async () => {
      try {
        const [calRes, hcRes, safetyRes, ecountRes] = await Promise.all([
          getCalibrationItemsFromSupabase(),
          getHealthCheckItemsFromSupabase(),
          getSafetyStockConfigs(),
          supabase.from("ecount_items").select("prod_cd, prod_nm, total_qty").order("prod_cd", { ascending: true })
        ]);

        if (calRes?.data && calRes.data.length > 0) {
          setCalibrationAlertStats(calcCalStats(calRes.data));
          localStorage.setItem("beansheal_calibration_items", JSON.stringify(calRes.data));
        }

        if (hcRes?.data && hcRes.data.length > 0) {
          setHealthCheckAlertStats(calcHcStats(hcRes.data));
          localStorage.setItem("beansheal_health_check_items", JSON.stringify(hcRes.data));
        }

        if (ecountRes?.data && ecountRes.data.length > 0) {
          const safetyMap = safetyRes?.data || {};
          const lowStockItems: any[] = [];

          ecountRes.data.forEach((item: any) => {
            const minQty = safetyMap[item.prod_cd] ?? getDefaultSafetyQty(item.prod_nm);
            const totalQty = Number(item.total_qty || 0);
            if (checkIsLowStock(totalQty, minQty)) {
              lowStockItems.push({
                prod_cd: item.prod_cd,
                prod_nm: item.prod_nm,
                total_qty: totalQty,
                min_qty: minQty,
              });
            }
          });

          setLowStockAlertStats({ count: lowStockItems.length, items: lowStockItems });
        }
      } catch {}
    };

    const alertTimer = window.setTimeout(() => {
      void syncAlertsFromCloud();
    }, 400);
    return () => clearTimeout(alertTimer);
  }, []);

  // 🌟 메모 카드 격자 드래그 앤 드롭 (Drag & Drop) 위치 이동 State 및 핸들러
  const [draggedMemoId, setDraggedMemoId] = useState<number | string | null>(null);
  const [dragOverMemoId, setDragOverMemoId] = useState<number | string | null>(null);

  const handleMemoCardDragStart = (e: React.DragEvent, memoId: number | string) => {
    e.stopPropagation();
    setDraggedMemoId(memoId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleMemoCardDragOver = (e: React.DragEvent, memoId: number | string) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    if (dragOverMemoId !== memoId) {
      setDragOverMemoId(memoId);
    }
  };

  const handleMemoCardDrop = (e: React.DragEvent, targetMemoId: number | string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!draggedMemoId || String(draggedMemoId) === String(targetMemoId)) {
      setDraggedMemoId(null);
      setDragOverMemoId(null);
      return;
    }
    setMemos((prev) => {
      const updated = [...prev];
      const sourceIdx = updated.findIndex((m) => String(m.id) === String(draggedMemoId));
      const targetIdx = updated.findIndex((m) => String(m.id) === String(targetMemoId));
      if (sourceIdx < 0 || targetIdx < 0) return prev;
      const [moved] = updated.splice(sourceIdx, 1);
      updated.splice(targetIdx, 0, moved);
      localStorage.setItem("beansheal_memos", JSON.stringify(updated));
      return updated;
    });
    setDraggedMemoId(null);
    setDragOverMemoId(null);
  };

  const handleMemoCardDragEnd = (e: React.DragEvent) => {
    e.stopPropagation();
    setDraggedMemoId(null);
    setDragOverMemoId(null);
  };

  // ⚡ 첫 페인트 전 로컬 캐시 복원 (노션/메모 네트워크를 기다리지 않음)
  const [schedules, setSchedules] = useState<any[]>([]);

  useLayoutEffect(() => {
    const cachedSchedules = readLocalJsonArray("beansheal_cached_schedules");
    if (cachedSchedules.length > 0) setSchedules(cachedSchedules);
    const cachedMemos = readLocalJsonArray("beansheal_memos");
    if (cachedMemos.length > 0) setMemos(cachedMemos);
  }, []);
  const [selectedDateForPlan, setSelectedDateForPlan] = useState<string | null>(null);
  const [planEndDate, setPlanEndDate] = useState<string>("");
  const [planProduct, setPlanProduct] = useState("");
  const [planQty, setPlanQty] = useState("");
  const [planNote, setPlanNote] = useState("");
  const [isAddScheduleModalOpen, setIsAddScheduleModalOpen] = useState(false);

  // 노션 연동 State
  const [isNotionModalOpen, setIsNotionModalOpen] = useState(false);
  const [notionApiKey, setNotionApiKey] = useState("");
  const [notionDatabaseId, setNotionDatabaseId] = useState("");
  const [isVercelNotionConfigured, setIsVercelNotionConfigured] = useState(false);
  const [isSyncingNotion, setIsSyncingNotion] = useState(false);
  const [syncToNotionChecked, setSyncToNotionChecked] = useState(true);
  const [testStatusMsg, setTestStatusMsg] = useState("");
  const [notionSyncStatusMsg, setNotionSyncStatusMsg] = useState<string | null>(null);
  const [isTestingConn, setIsTestingConn] = useState(false);
  const [draggedSchedule, setDraggedSchedule] = useState<any | null>(null);

  // 현재 유효한 노션 설정 객체 반환 헬퍼
  const getNotionConfig = () => {
    if (notionApiKey.trim() && notionDatabaseId.trim()) {
      return { apiKey: notionApiKey.trim(), databaseId: notionDatabaseId.trim() };
    }
    return undefined;
  };

  // 🌟 마이 대시보드 그리드 커스텀 State
  const [isGridSnapEnabled, setIsGridSnapEnabled] = useState(true);
  const [widgetConfigs, setWidgetConfigs] = useState(DEFAULT_WIDGET_CONFIGS);

  const [draggedWidgetId, setDraggedWidgetId] = useState<string | null>(null);
  const [dragOverWidgetId, setDragOverWidgetId] = useState<string | null>(null);
  const [resizingWidgetId, setResizingWidgetId] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // 🌟 로그인 사용자 ID(이메일)별 독립된 대시보드 그리드 커스텀 키 반환
  const getStorageKey = () => {
    return user?.email ? `beansheal_widget_configs_${user.email}` : "beansheal_widget_configs_guest";
  };

  useLayoutEffect(() => {
    setWidgetConfigs(readWidgetConfigsFromStorage());
  }, [user?.email]);

  useEffect(() => {
    const local = loadMemoPresetsFromStorage();
    setMemoPresets(local);

    (async () => {
      const res = await getMemoPresetsFromSupabase();
      if (res.success && res.data) {
        const merged = sanitizePresets(res.data);
        setMemoPresets(merged);
        saveMemoPresetsToStorage(merged);
      }
    })();
  }, []);

  const handleSaveMemoPresets = async (next: MemoPresets) => {
    const clean = sanitizePresets(next);
    setMemoPresets(clean);
    saveMemoPresetsToStorage(clean);
    const res = await saveMemoPresetsToSupabase(clean);
    if (!res.success) {
      // 로컬은 저장됨. 테이블 미생성 시에도 사용 가능
      console.warn("[memo presets] supabase save skipped:", res.message);
    }
  };

  const saveWidgetConfigs = (newConfigs: typeof widgetConfigs) => {
    setWidgetConfigs(newConfigs);
    const key = getStorageKey();
    localStorage.setItem(key, JSON.stringify(newConfigs));
  };

  const fetchSchedulesSilently = useCallback(async () => {
    try {
      const y = currentDate.getFullYear();
      const m = currentDate.getMonth();
      const startDate = `${y}-${String(m + 1).padStart(2, "0")}-01`;
      const nextY = m === 11 ? y + 1 : y;
      const nextM = m === 11 ? 1 : m + 2;
      const lastDayNextM = new Date(nextY, nextM, 0).getDate();
      const endDate = `${nextY}-${String(nextM).padStart(2, "0")}-${String(lastDayNextM).padStart(2, "0")}`;

      const savedKey = typeof window !== "undefined" ? localStorage.getItem("beansheal_notion_api_key") : null;
      const savedDbId = typeof window !== "undefined" ? localStorage.getItem("beansheal_notion_database_id") : null;
      const config =
        notionApiKey.trim() && notionDatabaseId.trim()
          ? { apiKey: notionApiKey.trim(), databaseId: notionDatabaseId.trim() }
          : savedKey?.trim() && savedDbId?.trim()
            ? { apiKey: savedKey.trim(), databaseId: savedDbId.trim() }
            : undefined;

      const notionRes = await Promise.race([
        fetchNotionSchedules(config, { startDate, endDate }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 12000)),
      ]);
      if (!notionRes) return;

      if (notionRes.success && notionRes.data && notionRes.data.length > 0) {
        setSchedules(notionRes.data);
        setNotionSyncStatusMsg(null);
        localStorage.setItem("beansheal_cached_schedules", JSON.stringify(notionRes.data));
      } else {
        const cached = localStorage.getItem("beansheal_cached_schedules");
        if (cached) {
          try {
            const parsed = JSON.parse(cached);
            if (parsed && parsed.length > 0) setSchedules(parsed);
          } catch {
            /* ignore */
          }
        }
        if (!notionRes.success) {
          setNotionSyncStatusMsg(notionRes.message || "노션 연동 실패");
        }
      }
    } catch (e: any) {
      setNotionSyncStatusMsg(e?.message || "노션 데이터 불러오기 오류");
    }
  }, [currentDate, notionApiKey, notionDatabaseId]);

  const fetchSchedulesRef = useRef(fetchSchedulesSilently);
  fetchSchedulesRef.current = fetchSchedulesSilently;

  useEffect(() => {
    void fetchSchedulesRef.current();
  }, [currentDate]);

  useEffect(() => {
    const initData = async () => {
      try {
        const savedKey = localStorage.getItem("beansheal_notion_api_key");
        const savedDbId = localStorage.getItem("beansheal_notion_database_id");
        if (savedKey) setNotionApiKey(savedKey);
        if (savedDbId) setNotionDatabaseId(savedDbId);

        const [statusRes, memoRes] = await Promise.all([
          getNotionConfigStatus().catch(() => ({ isConfigured: false })),
          getMemosFromSupabase().catch(() => ({ success: false, data: [] })),
        ]);

        if (statusRes?.isConfigured) setIsVercelNotionConfigured(true);

        if (memoRes?.success && memoRes.data && memoRes.data.length > 0) {
          setMemos(memoRes.data);
          localStorage.setItem("beansheal_memos", JSON.stringify(memoRes.data));
        } else {
          const savedMemos = localStorage.getItem("beansheal_memos");
          if (savedMemos) {
            try {
              const parsed = JSON.parse(savedMemos);
              setMemos(
                (parsed || []).map((m: any) => {
                  const meta = parseMemoMeta(m.text || "");
                  return {
                    ...m,
                    pinned: m.pinned ?? meta.pinned ?? false,
                    reminder_at: m.reminder_at ?? meta.reminder_at ?? null,
                  };
                })
              );
            } catch {
              setMemos(JSON.parse(savedMemos));
            }
          } else {
            const defaultMemos = [
              { id: 1, text: "A라인 포장기 점검 예정 (14:00~15:00)", date: "오늘 10:30", author: "생산팀" },
              { id: 2, text: "유기농 야채원료 입고 검수 완료", date: "오늘 09:15", author: "품질팀" },
            ];
            setMemos(defaultMemos);
            localStorage.setItem("beansheal_memos", JSON.stringify(defaultMemos));
          }
        }
      } catch (e) {
        console.error(e);
      }
    };
    void initData();

    const interval = setInterval(() => {
      void fetchSchedulesRef.current();
    }, 60000);

    const refreshMemos = async () => {
      try {
        const memoRes = await getMemosFromSupabase();
        if (!memoRes?.success || !Array.isArray(memoRes.data)) return;
        setMemos((prev) => {
          if (memoRes.data.length === 0 && prev.length > 0) return prev;
          localStorage.setItem("beansheal_memos", JSON.stringify(memoRes.data));
          return memoRes.data;
        });
      } catch {
        /* ignore */
      }
    };

    const memoChannel = supabase
      .channel("workspace-memos-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "memos" },
        () => {
          void refreshMemos();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "workspace_memos" },
        () => {
          void refreshMemos();
        }
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      void supabase.removeChannel(memoChannel);
    };
  }, []);

  const handleAddMemo = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const plain = memoPlainText(newMemo);
    if (!plain && !newMemo.includes("<img")) return;
    const safeHtml = wrapMemoMeta(sanitizeMemoHtml(newMemo), {
      pinned: newMemoPinned,
      reminder_at: newMemoReminder || null,
    });

    // 1. 현재 시간 포맷팅
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    
    const formattedDate = `${year}-${month}-${day} ${hours}:${minutes}`;

    // 2. 부서명에 '팀' 자동 추가 로직
    let department = user?.department || "";
    if (department && !department.endsWith("팀")) {
      department += "팀";
    }

    const name = user?.name || "사용자";
    const position = user?.position || "";
    
    // 3. 부서, 이름, 직급 조합
    const authorString = [department, name, position].filter(Boolean).join(" ") || "사용자";

    const item = {
      id: Date.now(),
      text: safeHtml,
      date: formattedDate,
      author: authorString,
      pinned: newMemoPinned,
      reminder_at: newMemoReminder || null,
      likes: [] as string[],
    };

    const updated = [item, ...memos];
    setMemos(updated);
    localStorage.setItem("beansheal_memos", JSON.stringify(updated));
    setNewMemo("");
    setNewMemoPinned(false);
    setNewMemoReminder("");
    setMemoEditorKey((k) => k + 1);

    // 🌟 Supabase에 메모 저장 및 동기화
    const res = await insertMemoToSupabase(item);
    if (res?.success && res.data && res.data[0]) {
      const realId = res.data[0].id;
      setMemos(prev => prev.map(m => m.id === item.id ? { ...m, id: realId } : m));
    }
  };

  const handleDeleteMemo = async (id: number | string) => {
    const updated = memos.filter(m => m.id !== id);
    setMemos(updated);
    localStorage.setItem("beansheal_memos", JSON.stringify(updated));

    // 🌟 Supabase에서도 실시간 삭제 연동
    await deleteMemoFromSupabase(id);
  };

  const handleStartEditMemo = (memo: any) => {
    setEditingMemoId(memo.id);
    setEditingMemoText(stripMemoMeta(memo.text || "") || memo.text || "");
  };

  const handleCancelEditMemo = () => {
    setEditingMemoId(null);
    setEditingMemoText("");
  };

  const handleSaveEditMemo = async (id: number | string) => {
    if (!memoPlainText(editingMemoText) && !editingMemoText.includes("<img")) return;
    const existing = memos.find((m) => m.id === id);
    const meta = parseMemoMeta(existing?.text || "");
    const pinned = existing?.pinned ?? meta.pinned ?? false;
    const reminder_at = existing?.reminder_at ?? meta.reminder_at ?? null;
    const safeHtml = wrapMemoMeta(sanitizeMemoHtml(editingMemoText), { pinned, reminder_at });
    const updated = memos.map(m => m.id === id ? { ...m, text: safeHtml, pinned, reminder_at } : m);
    setMemos(updated);
    localStorage.setItem("beansheal_memos", JSON.stringify(updated));
    setEditingMemoId(null);
    setEditingMemoText("");

    await updateMemoInSupabase(id, safeHtml, { pinned, reminder_at });
  };

  const handleTogglePin = async (memo: any) => {
    const nextPinned = !memo.pinned;
    const safeHtml = wrapMemoMeta(sanitizeMemoHtml(memo.text), {
      pinned: nextPinned,
      reminder_at: memo.reminder_at || null,
    });
    const updated = memos.map((m) =>
      m.id === memo.id ? { ...m, pinned: nextPinned, text: safeHtml } : m
    );
    setMemos(updated);
    localStorage.setItem("beansheal_memos", JSON.stringify(updated));
    await toggleMemoPinInSupabase(memo.id, nextPinned, safeHtml);
  };

  // 🌟 메모 화면 숨기기 (Soft-delete: DB 데이터 보존하고 화면에서만 숨김)
  const handleHideMemo = async (memoToHide: any) => {
    const meta = parseMemoMeta(memoToHide.text || "");
    const safeHtml = wrapMemoMeta(sanitizeMemoHtml(memoToHide.text), {
      pinned: memoToHide.pinned ?? meta.pinned ?? false,
      hidden: true,
      reminder_at: memoToHide.reminder_at ?? meta.reminder_at ?? null,
    });
    const updated = memos.map((m) =>
      m.id === memoToHide.id ? { ...m, hidden: true, text: safeHtml } : m
    );
    setMemos(updated);
    localStorage.setItem("beansheal_memos", JSON.stringify(updated));
    await toggleMemoHideInSupabase(memoToHide.id, true, safeHtml);
  };

  // 🌟 숨겨진 메모 복원 (보관함 ➔ 화면에 다시 복원)
  const handleUnhideMemo = async (memoToUnhide: any) => {
    const meta = parseMemoMeta(memoToUnhide.text || "");
    const safeHtml = wrapMemoMeta(sanitizeMemoHtml(memoToUnhide.text), {
      pinned: memoToUnhide.pinned ?? meta.pinned ?? false,
      hidden: false,
      reminder_at: memoToUnhide.reminder_at ?? meta.reminder_at ?? null,
    });
    const updated = memos.map((m) =>
      m.id === memoToUnhide.id ? { ...m, hidden: false, text: safeHtml } : m
    );
    setMemos(updated);
    localStorage.setItem("beansheal_memos", JSON.stringify(updated));
    await toggleMemoHideInSupabase(memoToUnhide.id, false, safeHtml);
  };

  const handleToggleLike = async (memoId: number | string, e?: React.MouseEvent) => {
    let department = user?.department || "";
    if (department && !department.endsWith("팀")) {
      department += "팀";
    }
    const name = user?.name || "사용자";
    const position = user?.position || "";
    const currentUserIdentifier = [department, name, position].filter(Boolean).join(" ") || "사용자";

    if (e) {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setHeartAnim({ id: memoId, x: e.clientX - rect.left, y: e.clientY - rect.top });
      setTimeout(() => setHeartAnim(null), 800);
    }

    setMemos(prev => prev.map(m => {
      if (m.id === memoId) {
        const likes = Array.isArray(m.likes) ? [...m.likes] : [];
        const idx = likes.indexOf(currentUserIdentifier);
        if (idx > -1) likes.splice(idx, 1);
        else likes.push(currentUserIdentifier);
        return { ...m, likes };
      }
      return m;
    }));

    await toggleMemoLikeInSupabase(memoId, currentUserIdentifier);
  };

  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const formatDateString = (year: number, month: number, day: number) => {
    const m = String(month + 1).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    return `${year}-${m}-${d}`;
  };

  const handleAddSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDateForPlan || !planProduct || !planQty) {
      alert("시작일, 품목명, 목표 수량을 모두 입력해 주세요.");
      return;
    }

    const startDate = selectedDateForPlan;
    const endDate = (planEndDate && planEndDate.trim()) ? planEndDate.trim() : startDate;

    const localItem = {
      id: Date.now(),
      plan_date: startDate,
      end_date: endDate,
      product_name: planProduct,
      quantity: planQty,
      note: planNote
    };

    let notionPageId = undefined;

    if (syncToNotionChecked) {
      try {
        setIsSyncingNotion(true);
        const res = await createNotionSchedule(
          {
            plan_date: startDate,
            end_date: endDate,
            product_name: planProduct,
            quantity: planQty,
            note: planNote
          },
          getNotionConfig()
        );

        if (res.success && res.pageId) {
          notionPageId = res.pageId;
        }
      } catch (err) {
        console.error("Notion 생성 실패:", err);
      } finally {
        setIsSyncingNotion(false);
      }
    }

    const newItem = { ...localItem, notion_page_id: notionPageId };
    setSchedules((prev) => [...prev, newItem]);
    setPlanProduct("");
    setPlanQty("");
    setPlanNote("");
    setPlanEndDate("");
    setIsAddScheduleModalOpen(false);
  };

  const handleDeleteSchedule = async (id: number | string, notionPageId?: string) => {
    setSchedules((prev) => prev.filter((s) => s.id !== id));
    if (notionPageId) {
      try {
        await deleteNotionSchedule(notionPageId, getNotionConfig());
      } catch (e) {
        console.error(e);
      }
    }
  };

  const handleNotionSync = async () => {
    try {
      setIsSyncingNotion(true);
      const res = await fetchNotionSchedules(getNotionConfig());
      if (res?.success && res.data) {
        setSchedules(res.data);
        alert(`성공적으로 노션 데이터(${res.data.length}건)를 동기화했습니다!`);
      } else if (res?.message) {
        alert(res.message);
      }
    } catch (err) {
      alert("노션 동기화 중 오류가 발생했습니다.");
    } finally {
      setIsSyncingNotion(false);
    }
  };

  const handleSaveNotionConfig = () => {
    localStorage.setItem("beansheal_notion_api_key", notionApiKey.trim());
    localStorage.setItem("beansheal_notion_database_id", notionDatabaseId.trim());
    setIsNotionModalOpen(false);
    alert("노션 API 설정이 저장되었습니다.");
    handleNotionSync();
  };

  const handleTestNotionConnection = async () => {
    setIsTestingConn(true);
    setTestStatusMsg("연결 테스트 중...");

    const res = await testNotionConnection(getNotionConfig());
    setIsTestingConn(false);
    if (res.success) {
      setTestStatusMsg(`✅ ${res.message}`);
    } else {
      setTestStatusMsg(`❌ 실패: ${res.message}`);
    }
  };

  const handleDragStart = (e: React.DragEvent, sch: any) => {
    setDraggedSchedule(sch);
    e.dataTransfer.setData("type", "SCHEDULE");
    e.dataTransfer.setData("text/plain", String(sch.id));
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDropOnCell = async (e: React.DragEvent, targetDateStr: string) => {
    if (!draggedSchedule) return;

    e.preventDefault();
    e.stopPropagation();

    const movingSch = draggedSchedule;
    setDraggedSchedule(null);

    const origStart = movingSch.plan_date ? String(movingSch.plan_date).split("T")[0].trim() : targetDateStr;
    const origEnd = movingSch.end_date ? String(movingSch.end_date).split("T")[0].trim() : origStart;

    if (origStart === targetDateStr) return;

    // 일수 차이(Duration) 계산
    const origStartObj = new Date(origStart);
    const origEndObj = new Date(origEnd);
    const durationMs = Math.max(0, origEndObj.getTime() - origStartObj.getTime());

    const newStartObj = new Date(targetDateStr);
    const newEndObj = new Date(newStartObj.getTime() + durationMs);

    const newStartStr = formatDateString(newStartObj.getFullYear(), newStartObj.getMonth(), newStartObj.getDate());
    const newEndStr = formatDateString(newEndObj.getFullYear(), newEndObj.getMonth(), newEndObj.getDate());

    setSchedules((prev) => {
      const updated = prev.map((item) =>
        item.id === movingSch.id || (movingSch.notion_page_id && item.notion_page_id === movingSch.notion_page_id)
          ? { ...item, plan_date: newStartStr, end_date: newEndStr }
          : item
      );
      return updated;
    });

    try {
      await updateScheduleDate(movingSch.id, newStartStr, newEndStr, movingSch.notion_page_id, getNotionConfig());
    } catch (err) {
      console.error(err);
    }
  };

  // 🌟 위젯 위치 이동 드래그 핸들러
  const handleWidgetDragStart = (e: React.DragEvent, id: string) => {
    if (e.dataTransfer.types.includes("type") && e.dataTransfer.getData("type") === "SCHEDULE") {
      return;
    }
    setDraggedWidgetId(id);
    e.dataTransfer.setData("widgetId", id);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleWidgetDragOver = (e: React.DragEvent, id: string) => {
    if (draggedSchedule) return;
    if (draggedWidgetId && draggedWidgetId !== id) {
      e.preventDefault();
      setDragOverWidgetId(id);
    }
  };

  const handleWidgetDragLeave = () => {
    setDragOverWidgetId(null);
  };

  const handleWidgetDragEnd = () => {
    setDragOverWidgetId(null);
    setDraggedWidgetId(null);
  };

  const handleWidgetDrop = (e: React.DragEvent, targetId: string) => {
    if (draggedSchedule) return;
    e.preventDefault();
    const sourceId = e.dataTransfer.getData("widgetId") || draggedWidgetId;
    if (!sourceId || sourceId === targetId) {
      setDragOverWidgetId(null);
      setDraggedWidgetId(null);
      return;
    }

    const newConfigs = [...widgetConfigs];
    const srcIndex = newConfigs.findIndex(w => w.id === sourceId);
    const tgtIndex = newConfigs.findIndex(w => w.id === targetId);

    if (srcIndex !== -1 && tgtIndex !== -1) {
      const [moved] = newConfigs.splice(srcIndex, 1);
      newConfigs.splice(tgtIndex, 0, moved);
      saveWidgetConfigs(newConfigs);
    }

    setDragOverWidgetId(null);
    setDraggedWidgetId(null);
  };

  // 🌟 마우스 2D 가로/세로 리사이즈 핸들러 (좌측 하단 & 우측 하단 겸용)
  const startCornerResize = (e: React.MouseEvent, widgetId: string, isLeft: boolean = false) => {
    e.preventDefault();
    e.stopPropagation();

    setResizingWidgetId(widgetId);
    const startX = e.clientX;
    const startY = e.clientY;

    const targetWidget = widgetConfigs.find(w => w.id === widgetId);
    if (!targetWidget) return;

    const startWidthPct = targetWidget.widthPct;
    const startHeightPx = targetWidget.heightPx;

    const containerWidth = containerRef.current ? containerRef.current.clientWidth : 1200;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      let deltaX = moveEvent.clientX - startX;
      if (isLeft) deltaX = -deltaX; // 좌측 모서리는 왼쪽으로 마우스 이동 시 가로폭 증가
      const deltaY = moveEvent.clientY - startY;

      let newWidthPct = Math.min(100, Math.max(20, startWidthPct + (deltaX / containerWidth) * 100));
      let newHeightPx = Math.min(1200, Math.max(240, startHeightPx + deltaY));

      if (isGridSnapEnabled) {
        let closestWidth = GRID_WIDTH_STEPS[0];
        let minDiff = Math.abs(newWidthPct - closestWidth);
        for (let i = 1; i < GRID_WIDTH_STEPS.length; i++) {
          const diff = Math.abs(newWidthPct - GRID_WIDTH_STEPS[i]);
          if (diff < minDiff) {
            minDiff = diff;
            closestWidth = GRID_WIDTH_STEPS[i];
          }
        }
        newWidthPct = closestWidth;
        newHeightPx = Math.round(newHeightPx / ROW_HEIGHT_SNAP) * ROW_HEIGHT_SNAP;
      } else {
        newWidthPct = Math.round(newWidthPct);
        newHeightPx = Math.round(newHeightPx);
      }

      setWidgetConfigs(prev => prev.map(w => w.id === widgetId ? { ...w, widthPct: newWidthPct, heightPx: newHeightPx } : w));
    };

    const handleMouseUp = () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      setResizingWidgetId(null);
      setWidgetConfigs(latest => {
        saveWidgetConfigs(latest);
        return latest;
      });
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  const handleStepResize = (widgetId: string, direction: "UP" | "DOWN" | "LEFT" | "RIGHT") => {
    setWidgetConfigs(prev => {
      const updated = prev.map(w => {
        if (w.id !== widgetId) return w;
        let newW = w.widthPct;
        let newH = w.heightPx;

        if (direction === "LEFT" || direction === "RIGHT") {
          const currentIndex = GRID_WIDTH_STEPS.indexOf(w.widthPct);
          if (direction === "RIGHT" && currentIndex < GRID_WIDTH_STEPS.length - 1) {
            newW = GRID_WIDTH_STEPS[currentIndex + 1];
          } else if (direction === "LEFT" && currentIndex > 0) {
            newW = GRID_WIDTH_STEPS[currentIndex - 1];
          }
        }

        if (direction === "UP") newH = Math.max(240, newH - 40);
        if (direction === "DOWN") newH = Math.min(1200, newH + 40);

        return { ...w, widthPct: newW, heightPx: newH };
      });
      saveWidgetConfigs(updated);
      return updated;
    });
  };

  const resetWidgetLayout = () => {
    saveWidgetConfigs(DEFAULT_WIDGET_CONFIGS);
  };

  const getCalendarWeeks = (y: number, m: number) => {
    const firstDayIndex = new Date(y, m, 1).getDay();
    const totalDays = new Date(y, m + 1, 0).getDate();

    const weeks: {
      day: number;
      dateStr: string;
      isToday: boolean;
      isOtherMonth: boolean;
      dayOfWeek: number;
    }[][] = [];

    let currentWeek: any[] = [];
    const today = new Date();

    for (let i = 0; i < firstDayIndex; i++) {
      const prevDate = new Date(y, m, 1 - (firstDayIndex - i));
      const pY = prevDate.getFullYear();
      const pM = prevDate.getMonth();
      const pD = prevDate.getDate();
      currentWeek.push({
        day: pD,
        dateStr: formatDateString(pY, pM, pD),
        isToday: false,
        isOtherMonth: true,
        dayOfWeek: i,
      });
    }

    for (let d = 1; d <= totalDays; d++) {
      const dateStr = formatDateString(y, m, d);
      const isToday = d === today.getDate() && m === today.getMonth() && y === today.getFullYear();
      const dayOfWeek = currentWeek.length % 7;
      currentWeek.push({
        day: d,
        dateStr,
        isToday,
        isOtherMonth: false,
        dayOfWeek,
      });

      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
    }

    if (currentWeek.length > 0) {
      let nextD = 1;
      while (currentWeek.length < 7) {
        const nextDate = new Date(y, m + 1, nextD);
        const nY = nextDate.getFullYear();
        const nM = nextDate.getMonth();
        const nD = nextDate.getDate();
        currentWeek.push({
          day: nD,
          dateStr: formatDateString(nY, nM, nD),
          isToday: false,
          isOtherMonth: true,
          dayOfWeek: currentWeek.length,
        });
        nextD++;
      }
      weeks.push(currentWeek);
    }

    return weeks;
  };

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const visibleWidgetConfigs = widgetConfigs.filter((w) => {
    if (w.id === "calendar") return canViewSchedule;
    if (w.id === "memo") return canViewMemo;
    if (w.id === "weekly_plan") return canViewWeeklyPlan;
    return true;
  });

  const firstDayIndex = new Date(year, month, 1).getDay();
  const totalDays = new Date(year, month + 1, 0).getDate();

  const daysArray: (number | null)[] = [];
  for (let i = 0; i < firstDayIndex; i++) {
    daysArray.push(null);
  }
  for (let d = 1; d <= totalDays; d++) {
    daysArray.push(d);
  }

  return (
    <div className="space-y-6 max-w-[1920px] mx-auto w-full pb-20 mt-2 px-1 sm:px-2 font-sans text-sm">
      
      {/* 대시보드 상단 타이틀 & 그리드 스냅 토글 */}
      <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-4 pb-4 border-b border-gray-200">
        <div className="min-w-0">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight flex flex-wrap items-center gap-2">
            <span>BEANSHEAL 대시보드</span>
            <span className="text-xs bg-blue-100 text-blue-800 font-extrabold px-2.5 py-0.5 rounded border border-blue-200">ERP 그리드 커스텀</span>
          </h2>
          <p className="text-sm text-gray-500 mt-1 hidden sm:block">상단 <strong>⣿ 핸들</strong>로 순서를 변경하고, 우측 하단 <strong>⤡ 코너</strong>를 끌어 가로/세로 크기를 커스텀하세요.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            onClick={() => setIsGridSnapEnabled(!isGridSnapEnabled)}
            className={`px-3 py-2 text-xs font-bold rounded-lg border transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs ${
              isGridSnapEnabled
                ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                : 'bg-gray-100 border-gray-300 text-gray-600 hover:bg-gray-200'
            }`}
            title="그리드 스냅 (자석 자동맞춤) 토글"
          >
            <span className={`w-2 h-2 rounded-full ${isGridSnapEnabled ? 'bg-indigo-600 animate-pulse' : 'bg-gray-400'}`}></span>
            <span>그리드 스냅: {isGridSnapEnabled ? 'ON (자석)' : 'OFF (자유)'}</span>
          </button>

          <button
            onClick={resetWidgetLayout}
            className="px-3 py-2 text-xs font-bold text-gray-600 bg-white border border-gray-300 hover:bg-gray-100 rounded-lg transition-colors shadow-2xs cursor-pointer"
            title="위젯 위치 및 크기를 초기 기본값으로 복원"
          >
            기본 배치 복원
          </button>
        </div>
      </div>

      {/* 1. GMP 기기 검·교정 자동 알림 바너 */}
      {(calibrationAlertStats.overdue > 0 || calibrationAlertStats.upcoming > 0) && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs animate-fadeIn mb-3">
          <div className="flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping shrink-0" />
            <div>
              <div className="text-xs font-extrabold text-amber-900 flex items-center gap-2">
                <span>GMP 기기 검·교정 점검 알림</span>
                {calibrationAlertStats.overdue > 0 && (
                  <span className="bg-red-600 text-white text-[10px] px-2 py-0.2 rounded font-bold">
                    기한 경과 {calibrationAlertStats.overdue}건
                  </span>
                )}
                {calibrationAlertStats.upcoming > 0 && (
                  <span className="bg-amber-600 text-white text-[10px] px-2 py-0.2 rounded font-bold">
                    30일 이내 임박 {calibrationAlertStats.upcoming}건
                  </span>
                )}
              </div>
              <p className="text-[11px] text-amber-800 mt-0.5 font-medium">
                검교정 기한이 지나거나 30일 이내 예정된 실험/생산 기기가 존재합니다. 검교정 대장을 확인하십시오.
              </p>
            </div>
          </div>

          <a
            href="/audit?tab=calibration"
            className="shrink-0 bg-amber-700 hover:bg-amber-800 text-white text-xs font-bold px-3.5 py-1.5 rounded-lg transition-colors shadow-2xs flex items-center gap-1 cursor-pointer"
          >
            <span>기기 검·교정 대장 이동</span>
            <span>&rarr;</span>
          </a>
        </div>
      )}

      {/* 2. 작업자 건강진단결과서 (보건증) 만료 및 재검진 알림 바너 (GMP 기기 알람 밑에 노출) */}
      {(healthCheckAlertStats.overdue > 0 || healthCheckAlertStats.upcoming > 0) && (
        <div className="bg-rose-50 border border-rose-300 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs animate-fadeIn mb-3">
          <div className="flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping shrink-0" />
            <div>
              <div className="text-xs font-extrabold text-rose-950 flex items-center gap-2">
                <span>작업자 건강진단결과서(보건증) 만료 및 재검진 알림</span>
                {healthCheckAlertStats.overdue > 0 && (
                  <span className="bg-rose-600 text-white text-[10px] px-2 py-0.2 rounded font-bold">
                    기한 만료 {healthCheckAlertStats.overdue}명
                  </span>
                )}
                {healthCheckAlertStats.upcoming > 0 && (
                  <span className="bg-amber-600 text-white text-[10px] px-2 py-0.2 rounded font-bold">
                    2주(14일) 이내 임박 {healthCheckAlertStats.upcoming}명
                  </span>
                )}
              </div>
              <p className="text-[11px] text-rose-800 mt-0.5 font-medium">
                보건증 기한이 지났거나 2주(14일) 이내 재검진이 예정된 작업자가 존재합니다. 대장을 확인하십시오.
              </p>
            </div>
          </div>

          <a
            href="/audit?tab=health"
            className="shrink-0 bg-rose-700 hover:bg-rose-800 text-white text-xs font-bold px-3.5 py-1.5 rounded-lg transition-colors shadow-2xs flex items-center gap-1 cursor-pointer"
          >
            <span>보건증 관리대장 이동</span>
            <span>&rarr;</span>
          </a>
        </div>
      )}

      {/* 3. 원자재 및 부자재 안전재고 부족 및 조기 발주 알림 바너 */}
      {lowStockAlertStats.count > 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs animate-fadeIn mb-3">
          <div className="flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-600 animate-ping shrink-0" />
            <div>
              <div className="text-xs font-extrabold text-amber-950 flex items-center gap-2">
                <span>원자재 및 부자재 안전재고 부족 및 조기 발주 알림</span>
                <span className="bg-amber-600 text-white text-[10px] px-2 py-0.2 rounded font-bold">
                  안전재고 미달 {lowStockAlertStats.count}건
                </span>
              </div>
              <p className="text-[11px] text-amber-800 mt-0.5 font-medium">
                {lowStockAlertStats.items.slice(0, 3).map(i => `${i.prod_nm}(현재 ${i.total_qty} / 기준 ${i.min_qty})`).join(", ")}
                {lowStockAlertStats.count > 3 && ` 외 ${lowStockAlertStats.count - 3}건`} 품목이 안전재고 기준에 미달했습니다. 조기 발주를 실행하십시오.
              </p>
            </div>
          </div>

          <a
            href="/inventory?filter=low_stock"
            className="shrink-0 bg-amber-800 hover:bg-amber-900 text-white text-xs font-bold px-3.5 py-1.5 rounded-lg transition-colors shadow-2xs flex items-center gap-1 cursor-pointer"
          >
            <span>미달 품목 발주 확인</span>
            <span>&rarr;</span>
          </a>
        </div>
      )}

      {/* 🌟 2D 자유형 드래그 앤 드롭 & 코너 리사이즈 그리드 컨테이너 */}
      <div 
        ref={containerRef}
        className={`flex flex-wrap gap-4 transition-all duration-300 p-2 rounded-xl relative ${
          isGridSnapEnabled ? 'bg-slate-50/50 border border-dashed border-slate-200' : ''
        }`}
        style={
          isGridSnapEnabled
            ? {
                backgroundImage: 'radial-gradient(#cbd5e1 1px, transparent 1px)',
                backgroundSize: '16px 16px'
              }
            : undefined
        }
      >
        {visibleWidgetConfigs.map((widget) => {
          const isDraggingThis = draggedWidgetId === widget.id;
          const isDragOverThis = dragOverWidgetId === widget.id;
          const isResizingThis = resizingWidgetId === widget.id;

          const cardStyle: React.CSSProperties = isMobile
            ? {
                width: "100%",
                minWidth: "unset",
                height: `${widget.heightPx}px`,
                flexGrow: 0,
                flexShrink: 0,
              }
            : {
                width: `calc(${widget.widthPct}% - 12px)`,
                minWidth: "280px",
                height: `${widget.heightPx}px`,
                flexGrow: 0,
                flexShrink: 0,
              };

          const dragVisualClass = isDraggingThis
            ? 'opacity-40 scale-95 border-2 border-dashed border-blue-500 shadow-2xl'
            : isDragOverThis
            ? 'border-2 border-blue-500 ring-4 ring-blue-100 scale-[1.01]'
            : isResizingThis
            ? 'border-2 border-indigo-500 ring-2 ring-indigo-200'
            : '';

          const renderWidgetHeader = (customLeft: React.ReactNode, customRight?: React.ReactNode) => (
            <div 
              draggable={true}
              onDragStart={(e) => handleWidgetDragStart(e, widget.id)}
              onDragEnd={handleWidgetDragEnd}
              className="bg-slate-100/90 border-b border-slate-200 px-3.5 py-1.5 flex justify-between items-center cursor-grab active:cursor-grabbing select-none hover:bg-slate-200/70 transition-colors"
            >
              <div className="flex items-center gap-2">
                {customLeft}
              </div>
              <div className="flex items-center gap-2">
                {customRight}
              </div>
            </div>
          );

          const renderCornerResizeHandles = () =>
            isMobile ? null : (
            <>
              {/* 우측 하단 모서리 리사이즈 핸들 (Bottom-Right) */}
              <div 
                onMouseDown={(e) => startCornerResize(e, widget.id, false)}
                className="absolute bottom-0 right-0 w-7 h-7 hidden md:flex items-end justify-end text-slate-400 hover:text-indigo-600 cursor-nwse-resize select-none p-1 group/corner-br z-20"
                title="우측 하단으로 끌어 크기를 조절하세요"
              >
                {isResizingThis && (
                  <span className="absolute bottom-7 right-0 bg-slate-900 text-white text-[10px] font-mono px-2 py-0.5 rounded shadow-lg whitespace-nowrap z-30 font-bold animate-fadeIn">
                    {widget.widthPct}% × {widget.heightPx}px
                  </span>
                )}
                <span className="text-xs font-black leading-none opacity-0 group-hover/corner-br:opacity-100 transition-opacity duration-200">⤡</span>
              </div>

              {/* 좌측 하단 모서리 리사이즈 핸들 (Bottom-Left) */}
              <div 
                onMouseDown={(e) => startCornerResize(e, widget.id, true)}
                className="absolute bottom-0 left-0 w-7 h-7 hidden md:flex items-end justify-start text-slate-400 hover:text-indigo-600 cursor-nesw-resize select-none p-1 group/corner-bl z-20"
                title="좌측 하단으로 끌어 크기를 조절하세요"
              >
                {isResizingThis && (
                  <span className="absolute bottom-7 left-0 bg-slate-900 text-white text-[10px] font-mono px-2 py-0.5 rounded shadow-lg whitespace-nowrap z-30 font-bold animate-fadeIn">
                    {widget.widthPct}% × {widget.heightPx}px
                  </span>
                )}
                <span className="text-xs font-black leading-none opacity-0 group-hover/corner-bl:opacity-100 transition-opacity duration-200">⤢</span>
              </div>
            </>
          );

          /* Widget 1: 월간 생산 계획표 (Calendar) - 노션 스타일 연장형 멀티데이 바 캘린더 */
          if (widget.id === "calendar") {
            // 노션 수신 일정 중 연도/월 분포 파악 헬퍼
            const latestScheduleDate = schedules.length > 0
              ? schedules.map(s => s.plan_date ? String(s.plan_date).split('T')[0] : '').filter(Boolean).sort().reverse()[0]
              : null;

            const latestYear = latestScheduleDate ? Number(latestScheduleDate.split('-')[0]) : null;
            const latestMonth = latestScheduleDate ? Number(latestScheduleDate.split('-')[1]) - 1 : null;

            const calendarHeaderLeft = (
              <div className="flex items-center gap-2 text-slate-800 text-sm font-bold flex-wrap">
                <button onClick={handlePrevMonth} className="p-1 hover:bg-slate-200 rounded text-slate-600 cursor-pointer text-base">
                  ‹
                </button>
                <select 
                  value={year} 
                  onChange={(e) => setCurrentDate(new Date(Number(e.target.value), month, 1))}
                  className="font-extrabold font-mono border border-slate-200 rounded px-2 py-1 text-sm bg-slate-50 cursor-pointer"
                >
                  {[2023, 2024, 2025, 2026, 2027].map((y) => (
                    <option key={y} value={y}>{y}년</option>
                  ))}
                </select>
                <span className="font-extrabold font-mono text-sm">{String(month + 1).padStart(2, '0')}월</span>
                <button onClick={handleNextMonth} className="p-1 hover:bg-slate-200 rounded text-slate-600 cursor-pointer text-base">
                  ›
                </button>
                <span className="ml-1 text-slate-900 font-extrabold text-sm">일정관리</span>
                {!canEditSchedule && (
                  <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">조회 전용</span>
                )}

                {/* 🌟 노션 수신 성공했으나 2025년 일정이 많은 경우 연도 이동 바로가기 버튼 */}
                {schedules.length > 0 && latestYear && latestYear !== year && (
                  <button 
                    onClick={() => setCurrentDate(new Date(latestYear, latestMonth !== null ? latestMonth : 0, 1))}
                    className="ml-2 text-[11px] font-bold text-emerald-800 bg-emerald-100 hover:bg-emerald-200 border border-emerald-300 px-2 py-0.5 rounded cursor-pointer transition-colors"
                  >
                    💡 노션 일정 {schedules.length}건 수신 완료 ({latestYear}년 {latestMonth !== null ? latestMonth + 1 : 1}월 바로가기 ➔)
                  </button>
                )}

                {notionSyncStatusMsg && (
                  <span className="ml-2 text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-300 px-2 py-0.5 rounded shadow-xs" title={notionSyncStatusMsg}>
                    ⚠️ {notionSyncStatusMsg}
                  </span>
                )}
              </div>
            );

            const calendarHeaderRight = (
              <div className="hidden sm:flex items-center gap-2 text-xs font-bold shrink-0">
                <span className="bg-[#e6f4ea] text-[#137333] px-2.5 py-1 rounded font-bold">
                  생산
                </span>
                <span className="bg-[#e8f0fe] text-[#1a73e8] px-2.5 py-1 rounded font-bold">
                  입고
                </span>
                <span className="bg-[#f3e8fd] text-[#7627bb] px-2.5 py-1 rounded font-bold">
                  출고
                </span>
                <span className="bg-[#fef7e0] text-[#b06000] px-2.5 py-1 rounded font-bold">
                  휴가
                </span>
                <span className="bg-[#fce8e6] text-[#c5221f] px-2.5 py-1 rounded font-bold">
                  점검
                </span>
              </div>
            );

            const weeks = getCalendarWeeks(year, month);

            return (
              <div 
                key={widget.id} 
                onDragOver={(e) => handleWidgetDragOver(e, widget.id)}
                onDragLeave={handleWidgetDragLeave}
                onDragEnd={handleWidgetDragEnd}
                onDrop={(e) => handleWidgetDrop(e, widget.id)}
                style={cardStyle}
                className={`transition-all duration-300 ease-in-out rounded-lg group/card ${dragVisualClass}`}
              >
                <div className="bg-white border border-gray-200 rounded-lg shadow-xs flex flex-col h-full overflow-hidden relative">
                  {renderWidgetHeader(calendarHeaderLeft, calendarHeaderRight)}
                  <div className="p-3 flex flex-col flex-1 overflow-hidden">
                    <div className="flex-1 flex flex-col h-full min-h-0 overflow-x-auto">
                      <div className="min-w-[640px] flex flex-col h-full min-h-0">
                      {/* 요일 헤더 */}
                      <div className="grid grid-cols-7 gap-1.5 text-center mb-1.5 bg-slate-50 py-2 border-b border-slate-200 rounded-t shrink-0">
                        {['일', '월', '화', '수', '목', '금', '토'].map(day => (
                          <div key={day} className={`text-sm font-extrabold ${day === '일' ? 'text-red-500' : day === '토' ? 'text-blue-500' : 'text-slate-700'}`}>
                            {day}
                          </div>
                        ))}
                      </div>

                      {/* 🌟 노션 스타일 주(Week) 단위 멀티데이 오버레이 그리드 */}
                      <div className="flex-1 flex flex-col h-full min-h-0 overflow-y-auto space-y-1 custom-scrollbar">
                        {weeks.map((week, wIdx) => {
                          const weekStartStr = week[0].dateStr;
                          const weekEndStr = week[6].dateStr;

                          // 해당 주(Week)에 걸쳐 있는 일정 세그먼트 추출
                          const weekSegments: any[] = [];
                          schedules.forEach((sch) => {
                            const schStart = sch.plan_date ? String(sch.plan_date).split("T")[0].trim() : "";
                            const schEnd = (sch.end_date && String(sch.end_date).trim()) ? String(sch.end_date).split("T")[0].trim() : schStart;
                            if (!schStart) return;

                            if (schStart <= weekEndStr && schEnd >= weekStartStr) {
                              let startCol = 0;
                              let isStartOfSchedule = false;
                              if (schStart <= weekStartStr) {
                                startCol = 0;
                                isStartOfSchedule = (schStart === weekStartStr);
                              } else {
                                const idx = week.findIndex((d) => d.dateStr === schStart);
                                startCol = idx >= 0 ? idx : 0;
                                isStartOfSchedule = true;
                              }

                              let endCol = 6;
                              let isEndOfSchedule = false;
                              if (schEnd >= weekEndStr) {
                                endCol = 6;
                                isEndOfSchedule = (schEnd === weekEndStr);
                              } else {
                                const idx = week.findIndex((d) => d.dateStr === schEnd);
                                endCol = idx >= 0 ? idx : 6;
                                isEndOfSchedule = true;
                              }

                              const colSpan = Math.max(1, endCol - startCol + 1);
                              weekSegments.push({
                                sch,
                                startCol,
                                endCol,
                                colSpan,
                                isStartOfSchedule,
                                isEndOfSchedule,
                              });
                            }
                          });

                          // 정렬: 시작 컬럼 ➔ 기간(span) ➔ ID
                          weekSegments.sort((a, b) => {
                            if (a.startCol !== b.startCol) return a.startCol - b.startCol;
                            if (a.colSpan !== b.colSpan) return b.colSpan - a.colSpan;
                            return String(a.sch.id).localeCompare(String(b.sch.id));
                          });

                          // 레인(Lane) 충돌 방지 배치
                          const occupied: boolean[][] = [];
                          const allocated = weekSegments.map((seg) => {
                            let lane = 0;
                            while (true) {
                              if (!occupied[lane]) occupied[lane] = Array(7).fill(false);
                              let canFit = true;
                              for (let c = seg.startCol; c <= seg.endCol; c++) {
                                if (occupied[lane][c]) {
                                  canFit = false;
                                  break;
                                }
                              }
                              if (canFit) {
                                for (let c = seg.startCol; c <= seg.endCol; c++) {
                                  occupied[lane][c] = true;
                                }
                                return { ...seg, lane };
                              }
                              lane++;
                            }
                          });

                          const segCardHeights = allocated.map((seg) =>
                            estimateScheduleCardHeight(seg.sch, seg.colSpan)
                          );

                          const LANE_GAP = 8;
                          const maxLane = allocated.reduce((m, s) => Math.max(m, s.lane), -1);
                          const laneRowHeights: number[] = [];
                          for (let l = 0; l <= maxLane; l++) {
                            let maxH = 56;
                            allocated.forEach((seg, i) => {
                              if (seg.lane === l) maxH = Math.max(maxH, segCardHeights[i]);
                            });
                            laneRowHeights.push(maxH);
                          }

                          const scheduleStackHeight = laneRowHeights.reduce((sum, h) => sum + h, 0)
                            + Math.max(0, laneRowHeights.length - 1) * LANE_GAP;
                          const weekRequiredMinHeight = Math.max(140, 32 + scheduleStackHeight + 16);

                          return (
                            <div
                              key={wIdx}
                              style={{ minHeight: `${weekRequiredMinHeight}px` }}
                              className="grid grid-cols-7 gap-1.5 relative border-b border-slate-100 last:border-0 pb-1 shrink-0"
                            >
                              {/* 1. 배경 날짜 셀 Layer */}
                              {week.map((cell, cIdx) => (
                                <div
                                  key={cIdx}
                                  onDragOver={(e) => {
                                    if (canEditSchedule && draggedSchedule) e.preventDefault();
                                  }}
                                  onDrop={(e) => {
                                    if (canEditSchedule && draggedSchedule && cell.dateStr) {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      handleDropOnCell(e, cell.dateStr);
                                    }
                                  }}
                                  className={`border border-slate-200/90 p-1 flex flex-col justify-start items-start relative h-full w-full ${
                                    cell.isOtherMonth ? 'bg-slate-50/40 text-slate-300' : cell.isToday ? 'bg-indigo-50/50' : 'bg-white hover:bg-slate-50/80'
                                  } transition-colors rounded`}
                                >
                                  <div className="w-full flex justify-between items-center mb-0.5">
                                    <span className={`text-sm font-extrabold ${cell.isToday ? 'bg-indigo-600 text-white px-2 py-0.5 rounded shadow-xs' : cell.isOtherMonth ? 'text-slate-300' : 'text-slate-800 ml-0.5'}`}>
                                      {cell.day}
                                    </span>
                                  </div>
                                </div>
                              ))}

                              {/* 2. 오버레이 — 배경 그리드와 동일한 7열 grid로 레인별 배치 (겹침 방지) */}
                              <div
                                className="absolute inset-x-0 top-[28px] bottom-1 grid grid-cols-7 gap-1.5 pointer-events-none pb-2"
                                style={{
                                  gridTemplateRows: laneRowHeights.length
                                    ? laneRowHeights.map((h) => `${h}px`).join(" ")
                                    : undefined,
                                  rowGap: `${LANE_GAP}px`,
                                }}
                              >
                                  {allocated.map((seg, sIdx) => {
                                    const sch = seg.sch;
                                    const roundedClass = `${seg.isStartOfSchedule ? 'rounded-l-md' : 'rounded-l-none'} ${seg.isEndOfSchedule ? 'rounded-r-md' : 'rounded-r-none'}`;

                                    return (
                                      <div
                                        key={`${sch.id}-${wIdx}-${sIdx}`}
                                        style={{
                                          gridColumn: `${seg.startCol + 1} / span ${seg.colSpan}`,
                                          gridRow: `${seg.lane + 1}`,
                                        }}
                                      draggable={canEditSchedule}
                                      onDragStart={(e) => {
                                        if (!canEditSchedule) {
                                          e.preventDefault();
                                          return;
                                        }
                                        e.stopPropagation();
                                        handleDragStart(e, sch);
                                      }}
                                      className={`pointer-events-auto relative h-full min-h-0 py-1.5 px-2.5 text-left flex items-start justify-between transition-all group/bar overflow-hidden ${canEditSchedule ? "cursor-grab active:cursor-grabbing hover:shadow-md" : "cursor-default"} bg-white border border-slate-300/90 shadow-sm ${roundedClass}`}
                                      >
                                        <div className="pr-1 w-full min-w-0 overflow-hidden">
                                          <ScheduleEntryPills schedule={sch} compact />
                                        </div>

                                      {canEditSchedule && (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            if (confirm(`'${sch.product_name}' 일정을 삭제하시겠습니까?`)) {
                                              handleDeleteSchedule(sch.id, sch.notion_page_id);
                                            }
                                          }}
                                          className="opacity-0 group-hover/bar:opacity-100 text-slate-500 hover:text-red-600 font-black text-xs transition-opacity ml-1 cursor-pointer shrink-0 mt-0.5"
                                          title="일정 삭제"
                                        >
                                          ×
                                        </button>
                                      )}
                                      </div>
                                    );
                                  })}
                                </div>
                            </div>
                          );
                        })}
                      </div>
                      </div>
                    </div>
                  </div>
                  {renderCornerResizeHandles()}
                </div>
              </div>
            );
          }

          /* Widget 2: 실시간 특이사항 및 메모 (Memo) - 이카운트 ERP 룩앤필 */
          if (widget.id === "memo") {
            const allTags = [...new Set(memos.flatMap((m) => extractMemoTags(m.text || "")))];
            const hiddenMemosCount = memos.filter((m) => !!m.hidden).length;
            const visibleMemos = memos
              .filter((m) => !m.hidden)
              .filter((m) => {
                if (!memoTagFilter) return true;
                return extractMemoTags(m.text || "").includes(memoTagFilter);
              })
              .slice()
              .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned));

            const mentionList = [
              ...new Set([
                ...memoPresets.mentions,
                ...(user?.name ? [`@${user.name}`] : []),
              ]),
            ];

            const memoHeaderLeft = (
              <span className="text-xs font-bold text-slate-900">특이사항 및 메모</span>
            );

            const memoHeaderRight = (
              <div className="flex items-center gap-2">
                {!canEditMemo && (
                  <span className="text-[10px] font-bold text-slate-400">조회 전용</span>
                )}
                <button
                  type="button"
                  onClick={() => setShowMemoTools(!showMemoTools)}
                  className={`text-[10px] font-bold px-2 py-0.5 rounded transition-all cursor-pointer flex items-center gap-1 border ${
                    showMemoTools
                      ? "bg-indigo-600 text-white border-indigo-600 shadow-2xs"
                      : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 hover:text-indigo-600"
                  }`}
                  title="상세기능 (태그 필터, 상단고정, 알림, 템플릿 관리)"
                >
                  <span>상세 기능</span>
                  <span className="text-[9px]">{showMemoTools ? "▲" : "▼"}</span>
                </button>
              </div>
            );

            return (
              <div 
                key={widget.id} 
                onDragOver={(e) => handleWidgetDragOver(e, widget.id)}
                onDragLeave={handleWidgetDragLeave}
                onDragEnd={handleWidgetDragEnd}
                onDrop={(e) => handleWidgetDrop(e, widget.id)}
                style={cardStyle}
                className={`transition-all duration-300 ease-in-out rounded-lg group/card ${dragVisualClass}`}
              >
                <div className="bg-white border border-gray-200 rounded-lg shadow-xs flex flex-col h-full overflow-hidden relative">
                  {renderWidgetHeader(memoHeaderLeft, memoHeaderRight)}
                  <div className="p-4 flex flex-col flex-1 overflow-hidden">
                    {/* 상세기능이 열렸거나 태그 필터가 활성화된 경우만 태그 바 노출 */}
                    {(showMemoTools || memoTagFilter) && (allTags.length > 0 || memoTagFilter) && (
                      <div className="flex flex-wrap items-center gap-1 mb-2 bg-slate-50 p-1.5 rounded-md border border-slate-100 animate-fadeIn">
                        <button
                          type="button"
                          onClick={() => setMemoTagFilter(null)}
                          className={`text-[10px] px-1.5 py-0.5 rounded font-bold cursor-pointer ${
                            !memoTagFilter ? "bg-slate-800 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                          }`}
                        >
                          전체
                        </button>
                        {[...new Set([...memoPresets.tags.map((t) => t.toLowerCase()), ...allTags])].map((tag) => (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => setMemoTagFilter(memoTagFilter === tag ? null : tag)}
                            className={`text-[10px] px-1.5 py-0.5 rounded font-bold cursor-pointer ${
                              memoTagFilter === tag
                                ? "bg-amber-500 text-white"
                                : "bg-amber-50 text-amber-800 hover:bg-amber-100"
                            }`}
                          >
                            {tag}
                          </button>
                        ))}
                      </div>
                    )}

                    <div className="flex-1 min-h-[140px] overflow-y-auto flex flex-wrap gap-2.5 items-start content-start pr-1 mb-3">
                      {visibleMemos.map((memo) => {
                        let dept = user?.department || "";
                        if (dept && !dept.endsWith("팀")) dept += "팀";
                        const currentUserIdent = [dept, user?.name || "사용자", user?.position || ""].filter(Boolean).join(" ") || "사용자";
                        const likedByList: string[] = Array.isArray(memo.likes) ? memo.likes : [];
                        const isLikedByMe = likedByList.includes(currentUserIdent);
                        const reminderLabel = memo.reminder_at
                          ? new Date(memo.reminder_at).toLocaleString("ko-KR", {
                              month: "numeric",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : null;
                        const reminderDue =
                          memo.reminder_at && new Date(memo.reminder_at).getTime() <= Date.now();

                        const isBeingDragged = draggedMemoId != null && String(draggedMemoId) === String(memo.id);
                        const isTargetOver = dragOverMemoId != null && String(dragOverMemoId) === String(memo.id) && !isBeingDragged;

                        return (
                          <div 
                            key={memo.id} 
                            draggable={canEditMemo && editingMemoId === null}
                            onDragStart={(e) => canEditMemo && handleMemoCardDragStart(e, memo.id)}
                            onDragOver={(e) => canEditMemo && handleMemoCardDragOver(e, memo.id)}
                            onDrop={(e) => canEditMemo && handleMemoCardDrop(e, memo.id)}
                            onDragEnd={handleMemoCardDragEnd}
                            onDoubleClick={(e) => {
                              if (canEditMemo) handleToggleLike(memo.id, e);
                            }}
                            className={`p-3 border rounded-xl shadow-xs relative group transition-all select-none ${canEditMemo ? "cursor-grab active:cursor-grabbing" : "cursor-default"} inline-flex flex-col justify-between w-full sm:w-fit max-w-full min-w-0 sm:min-w-[200px] flex-grow-0 flex-shrink-0 ${
                              isBeingDragged
                                ? "opacity-30 border-dashed border-2 border-indigo-400 scale-95"
                                : isTargetOver
                                ? "bg-indigo-100/90 ring-4 ring-indigo-500 border-2 border-indigo-600 scale-105 shadow-xl"
                                : memo.pinned
                                ? "border-amber-300 bg-amber-50/80 hover:bg-amber-50 shadow-sm"
                                : "border-gray-200/90 bg-slate-50/90 hover:bg-white hover:border-indigo-200 hover:shadow-md"
                            }`}
                            title={canEditMemo ? "마우스로 드래그하여 메모 위치 순서를 자유롭게 바꿀 수 있습니다." : undefined}
                          >
                            {/* 🌟 드래그 핸들 (⋮⋮) & 고정 핀 아이콘 */}
                            <div className="absolute top-2 left-2 flex items-center gap-1">
                              <span className="text-slate-300 group-hover:text-indigo-600 text-[11px] font-mono font-black cursor-grab">
                                ⋮⋮
                              </span>
                              {memo.pinned && (
                                <span className="text-[10px] font-extrabold text-amber-700">📌</span>
                              )}
                            </div>

                            {/* 드래그 위치 이동 뱃지 */}
                            {isTargetOver && (
                              <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] bg-indigo-600 text-white px-2 py-0.5 rounded-full font-black shadow-md z-20">
                                📥 여기에 이동
                              </span>
                            )}

                            {/* 팝업 하트 애니메이션 */}
                            {heartAnim && heartAnim.id === memo.id && (
                              <div 
                                style={{ left: heartAnim.x, top: heartAnim.y }}
                                className="absolute transform -translate-x-1/2 -translate-y-1/2 pointer-events-none z-30 text-2xl animate-bounce"
                              >
                                ❤️
                              </div>
                            )}

                            {editingMemoId != null && String(editingMemoId) === String(memo.id) ? (
                              <div className="space-y-1.5 w-full min-w-0 sm:min-w-[260px]" onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
                                <MemoRichEditor
                                  key={`edit-${memo.id}`}
                                  value={editingMemoText}
                                  onChange={setEditingMemoText}
                                  onSubmit={() => handleSaveEditMemo(memo.id)}
                                  onManagePresets={() => setIsMemoPresetsOpen(true)}
                                  placeholder="메모를 수정하세요"
                                  minHeight={72}
                                  autoFocus
                                  className="border-indigo-300"
                                  templates={memoPresets.templates}
                                  tags={memoPresets.tags}
                                  mentions={mentionList}
                                />
                                <div className="flex justify-end gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleSaveEditMemo(memo.id)}
                                    className="px-2 py-0.5 bg-indigo-600 text-white text-[11px] font-bold rounded shadow-xs hover:bg-indigo-700 transition-colors cursor-pointer"
                                  >
                                    저장
                                  </button>
                                  <button
                                    type="button"
                                    onClick={handleCancelEditMemo}
                                    className="px-2 py-0.5 bg-gray-200 text-gray-700 text-[11px] font-bold rounded shadow-xs hover:bg-gray-300 transition-colors cursor-pointer"
                                  >
                                    취소
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <div className={`pr-14 ${memo.pinned ? "pl-4" : ""}`}>
                                  <MemoRichContent html={memo.text} className="font-medium text-slate-800 text-xs leading-relaxed" />
                                  {reminderLabel && (
                                    <div
                                      className={`mt-1.5 inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                        reminderDue
                                          ? "bg-rose-100 text-rose-700"
                                          : "bg-sky-50 text-sky-700"
                                      }`}
                                    >
                                      ⏰ {reminderLabel}
                                      {reminderDue ? " (지남)" : ""}
                                    </div>
                                  )}
                                </div>
                                <div className="flex items-center justify-between gap-3 mt-3 pt-1 border-t border-gray-100/80">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[10px] text-gray-400 font-bold">{memo.date}</span>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleToggleLike(memo.id);
                                      }}
                                      className={`inline-flex items-center gap-1 text-[10px] font-extrabold px-1.5 py-0.5 rounded-full transition-all cursor-pointer ${
                                        isLikedByMe
                                          ? "bg-rose-50 text-rose-600 border border-rose-200 shadow-2xs"
                                          : "bg-gray-200/80 text-gray-500 hover:bg-rose-50 hover:text-rose-600"
                                      }`}
                                      title={likedByList.length > 0 ? `확인한 사람 (${likedByList.length}명): ${likedByList.join(", ")}` : "더블클릭 또는 클릭하여 확인 하트 남기기"}
                                    >
                                      <span>{isLikedByMe ? "❤️" : "🤍"}</span>
                                      {likedByList.length > 0 && <span>{likedByList.length}</span>}
                                    </button>
                                  </div>
                                  <span className="text-[10px] font-bold text-gray-600 bg-gray-200/80 px-1.5 py-0.5 rounded-md whitespace-nowrap">{memo.author}</span>
                                </div>

                                <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                                  {canEditMemo && (
                                    <>
                                      <button 
                                        onClick={() => handleTogglePin(memo)} 
                                        className={`transition-colors cursor-pointer p-0.5 ${memo.pinned ? "text-amber-500 opacity-100" : "text-gray-400 hover:text-amber-500"}`}
                                        title={memo.pinned ? "핀 해제" : "상단 고정"}
                                      >
                                        <svg className="w-3.5 h-3.5" fill={memo.pinned ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                                        </svg>
                                      </button>
                                      <button 
                                        onClick={() => handleStartEditMemo(memo)} 
                                        className="text-gray-400 hover:text-indigo-600 transition-colors cursor-pointer p-0.5" 
                                        title="메모 수정"
                                      >
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                                        </svg>
                                      </button>
                                      <button 
                                        onClick={() => handleHideMemo(memo)} 
                                        className="text-gray-400 hover:text-amber-600 transition-colors cursor-pointer p-0.5" 
                                        title="화면에서 숨기기 (보관함에 보존)"
                                      >
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                                        </svg>
                                      </button>
                                    </>
                                  )}
                                </div>
                              </>
                            )}
                          </div>
                        );
                      })}
                      {visibleMemos.length === 0 && (
                        <div className="w-full text-center py-12 text-gray-400 text-xs font-medium">
                          {memoTagFilter
                            ? `선택한 태그(${memoTagFilter})에 해당하는 메모가 없습니다.`
                            : memos.length > 0
                              ? "표시할 메모가 없습니다."
                              : "등록된 특이사항이 없습니다."}
                        </div>
                      )}
                    </div>

                    {canEditMemo ? (
                      <form onSubmit={handleAddMemo} className="pt-2 border-t border-gray-200 flex flex-col gap-2">
                        <MemoRichEditor
                          key={memoEditorKey}
                          value={newMemo}
                          onChange={setNewMemo}
                          onSubmit={() => handleAddMemo()}
                          onManagePresets={() => setIsMemoPresetsOpen(true)}
                          placeholder="공유할 메모 (서식·태그·멘션·이미지·Ctrl+Enter)"
                          minHeight={72}
                          templates={memoPresets.templates}
                          tags={memoPresets.tags}
                          mentions={mentionList}
                        />
                        <div className="flex flex-wrap items-center gap-2 justify-between">
                          {showMemoTools ? (
                            <div className="flex flex-wrap items-center gap-2 bg-slate-50 p-1.5 rounded-md border border-slate-200/80 w-full justify-between animate-fadeIn">
                              <div className="flex flex-wrap items-center gap-2">
                                <label className="inline-flex items-center gap-1 text-[10px] font-bold text-gray-700 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={newMemoPinned}
                                    onChange={(e) => setNewMemoPinned(e.target.checked)}
                                    className="rounded border-gray-300 text-amber-500 focus:ring-amber-400"
                                  />
                                  상단 고정
                                </label>
                                <label className="inline-flex items-center gap-1 text-[10px] font-bold text-gray-700">
                                  <span>알림:</span>
                                  <input
                                    type="datetime-local"
                                    value={newMemoReminder}
                                    onChange={(e) => setNewMemoReminder(e.target.value)}
                                    className="text-[10px] border border-gray-300 rounded px-1.5 py-0.5 bg-white shadow-2xs"
                                  />
                                </label>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setShowHiddenMemosModal(true)}
                                  className="text-[10px] font-extrabold text-amber-700 hover:text-amber-900 bg-amber-50 px-2 py-0.5 rounded cursor-pointer border border-amber-200 hover:bg-amber-100 flex items-center gap-1"
                                >
                                  <span>숨겨진 보관함</span>
                                  {hiddenMemosCount > 0 && (
                                    <span className="bg-amber-600 text-white rounded-full px-1.5 py-0.2 text-[9px]">
                                      {hiddenMemosCount}
                                    </span>
                                  )}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setIsMemoPresetsOpen(true)}
                                  className="text-[10px] font-extrabold text-indigo-600 hover:text-indigo-800 bg-indigo-50 px-2 py-0.5 rounded cursor-pointer border border-indigo-100 hover:bg-indigo-100"
                                >
                                  템플릿/태그 관리
                                </button>
                              </div>
                            </div>
                          ) : null}

                          <div className="flex items-center justify-between w-full mt-1">
                            <button
                              type="button"
                              onClick={() => setShowMemoTools(!showMemoTools)}
                              className="text-[11px] font-bold text-slate-500 hover:text-indigo-600 cursor-pointer flex items-center gap-1 px-1 py-0.5 rounded hover:bg-slate-100 transition-colors"
                            >
                              <span>{showMemoTools ? "상세 옵션 닫기 ▲" : "상세 옵션 열기 (태그·핀·알림) ▼"}</span>
                            </button>

                            <button type="submit" className="bg-slate-800 text-white px-4 py-1.5 text-xs font-bold rounded shadow-xs hover:bg-indigo-700 transition-colors cursor-pointer flex items-center gap-1">
                              <span>전송</span>
                              <span className="text-[10px] opacity-75">↵</span>
                            </button>
                          </div>
                        </div>
                      </form>
                    ) : (
                      <div className="pt-2 border-t border-gray-200 text-center text-[11px] text-slate-400 font-medium py-3">
                        메모 작성 권한이 없습니다 (조회 전용)
                      </div>
                    )}
                  </div>
                  {renderCornerResizeHandles()}
                </div>
              </div>
            );
          }

          /* Widget 3: BEANSHEAL 주간계획표 */
          if (widget.id === "weekly_plan") {
            const weeklyHeaderLeft = (
              <span className="text-xs font-bold text-slate-900">BEANSHEAL 주간계획표</span>
            );
            const weeklyHeaderRight = (
              <span className="text-[10px] font-bold text-slate-500">
                {!canEditWeeklyPlan ? "조회 전용" : "셀 클릭 후 편집 · 저장"}
              </span>
            );

            return (
              <div
                key={widget.id}
                onDragOver={(e) => handleWidgetDragOver(e, widget.id)}
                onDragLeave={handleWidgetDragLeave}
                onDragEnd={handleWidgetDragEnd}
                onDrop={(e) => handleWidgetDrop(e, widget.id)}
                style={cardStyle}
                className={`transition-all duration-300 ease-in-out rounded-lg group/card ${dragVisualClass}`}
              >
                <div className="bg-white border border-gray-200 rounded-lg shadow-xs flex flex-col h-full overflow-hidden relative">
                  {renderWidgetHeader(weeklyHeaderLeft, weeklyHeaderRight)}
                  <div className="p-3 flex flex-col flex-1 overflow-hidden min-h-0">
                    <WeeklyPlanView
                      schedules={schedules}
                      department={user?.department || "생산팀"}
                      canEdit={canEditWeeklyPlan}
                      embedded
                      updatedBy={user?.name || user?.email || undefined}
                    />
                  </div>
                  {renderCornerResizeHandles()}
                </div>
              </div>
            );
          }

          return null;
        })}
      </div>

      {/* 🌟 월간 근무 & 근무조 스케줄표 (엑셀 이미지 기준 편집 기능 탑재) */}
      {canViewWorkSchedule && (
        <div className="w-full mt-8">
          <WorkScheduleTable readOnly={!canEditWorkSchedule} />
        </div>
      )}

      <MemoPresetsManager
        open={isMemoPresetsOpen}
        presets={memoPresets}
        onClose={() => setIsMemoPresetsOpen(false)}
        onSave={handleSaveMemoPresets}
      />

      {/* 노션 API 연동 설정 모달 */}
      {isNotionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="bg-white rounded-xl shadow-2xl border border-gray-200 w-full max-w-lg overflow-hidden flex flex-col">
            <div className="bg-slate-900 text-white px-6 py-4 flex justify-between items-center">
              <div className="flex items-center gap-2 font-bold text-base">
                <span>노션(Notion) 출력 API 연동 설정</span>
              </div>
              <button
                onClick={() => setIsNotionModalOpen(false)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              {isVercelNotionConfigured && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs text-emerald-900 flex items-start gap-2">
                  <span className="text-base leading-none text-emerald-600 font-bold">✓</span>
                  <div className="space-y-0.5">
                    <p className="font-bold text-emerald-950">Vercel 서버 환경변수(NOTION_API_KEY, NOTION_DATABASE_ID) 전사 자동 연동 중</p>
                    <p className="text-[11px] text-emerald-800 leading-relaxed">
                      서버 환경변수가 등록되어 있어 전사 어떤 컴퓨터나 계정에서도 개별 설정 없이 노션 데이터가 자동으로 연동됩니다. (특정 커스텀 노션 키를 사용하하려는 경우에만 아래에 직접 입력해 주세요.)
                    </p>
                  </div>
                </div>
              )}

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-900 space-y-1.5">
                <p className="font-bold flex items-center gap-1">
                  노션 API 개별 설정 가이드 (선택 사항)
                </p>
                <ol className="list-decimal list-inside space-y-1 text-[11px] leading-relaxed text-blue-800">
                  <li>
                    <a href="https://www.notion.so/my-integrations" target="_blank" rel="noreferrer" className="underline font-bold hover:text-blue-900">Notion My Integrations</a>에 접속하여 새 통합을 생성하여 <strong>API Key (Secret)</strong>를 복사합니다.
                  </li>
                  <li>
                    사용할 노션 출력 데이터베이스 페이지 우측 상단 <strong>[...] ➔ 연결 추가 (Add connections)</strong>에서 생성한 통합을 선택합니다.
                  </li>
                  <li>
                    데이터베이스 페이지 URL에서 32자리 <strong>Database ID</strong>를 복사하여 아래 입력창에 넣습니다.
                  </li>
                </ol>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-700 flex items-center justify-between">
                  <span>Notion API Key (선택 사항)</span>
                  <span className="text-[10px] text-gray-400 font-normal">비워두면 Vercel 서버 환경변수 사용</span>
                </label>
                <input
                  type="password"
                  value={notionApiKey}
                  onChange={(e) => setNotionApiKey(e.target.value)}
                  placeholder={isVercelNotionConfigured ? "Vercel 환경변수 사용 중 (개별 입력 가능)" : "ntn_..."}
                  className="w-full text-xs border border-gray-300 rounded-lg px-3 py-2 bg-white text-gray-900 focus:ring-2 focus:ring-slate-900 focus:outline-none font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-700 flex items-center justify-between">
                  <span>Notion Database ID (선택 사항)</span>
                  <span className="text-[10px] text-gray-400 font-normal">비워두면 Vercel 서버 환경변수 사용</span>
                </label>
                <input
                  type="text"
                  value={notionDatabaseId}
                  onChange={(e) => setNotionDatabaseId(e.target.value)}
                  placeholder={isVercelNotionConfigured ? "Vercel 환경변수 사용 중 (개별 입력 가능)" : "예: c8e9a1b2c3d4e5f6a7b8c9d0e1f2a3b4"}
                  className="w-full text-xs border border-gray-300 rounded-lg px-3 py-2 bg-white text-gray-900 focus:ring-2 focus:ring-slate-900 focus:outline-none font-mono"
                />
              </div>

              {testStatusMsg && (
                <div className={`p-3 rounded-lg text-xs font-bold border ${
                  testStatusMsg.includes("성공") 
                    ? "bg-green-50 text-green-800 border-green-200" 
                    : "bg-amber-50 text-amber-800 border-amber-200"
                }`}>
                  {testStatusMsg}
                </div>
              )}
            </div>

            <div className="bg-gray-50 border-t border-gray-200 px-6 py-3 flex justify-between items-center">
              <button
                type="button"
                onClick={handleTestNotionConnection}
                disabled={isTestingConn || (!notionApiKey && !notionDatabaseId && !isVercelNotionConfigured)}
                className="bg-white border border-gray-300 hover:bg-gray-100 text-gray-700 text-xs font-bold px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                {isTestingConn ? "확인 중..." : "연결 테스트"}
              </button>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsNotionModalOpen(false)}
                  className="bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs font-bold px-4 py-2 rounded-lg transition-colors cursor-pointer"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleSaveNotionConfig}
                  className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-5 py-2 rounded-lg transition-colors shadow-xs cursor-pointer"
                >
                  저장하기
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 🌟 숨겨진 메모 보관함 모달 (데이터는 DB에 100% 저장되어 있으며 필요 시 복원 가능) */}
      {showHiddenMemosModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
            <div className="bg-slate-900 text-white px-6 py-4 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-white">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-bold text-base">숨겨진 메모 보관함</h3>
                  <p className="text-xs text-slate-300">화면에서 숨긴 메모들은 데이터베이스에 안전하게 보관되어 있습니다.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowHiddenMemosModal(false)}
                className="text-slate-400 hover:text-white text-lg font-bold p-1 rounded hover:bg-slate-800 transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* 검색 및 일자 필터 바 */}
            <div className="bg-slate-100 p-3 border-b border-slate-200 flex flex-wrap items-center gap-2">
              <div className="flex-1 min-w-[200px] relative">
                <input
                  type="text"
                  placeholder="내용 또는 작성자 검색..."
                  value={hiddenMemoSearchText}
                  onChange={(e) => setHiddenMemoSearchText(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
                />
                <svg className="w-4 h-4 text-slate-400 absolute left-2.5 top-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-xs font-bold text-slate-600">일자:</span>
                <input
                  type="date"
                  value={hiddenMemoSearchDate}
                  onChange={(e) => setHiddenMemoSearchDate(e.target.value)}
                  className="px-2 py-1 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
                />
                {(hiddenMemoSearchText || hiddenMemoSearchDate) && (
                  <button
                    type="button"
                    onClick={() => {
                      setHiddenMemoSearchText("");
                      setHiddenMemoSearchDate("");
                    }}
                    className="text-xs font-bold text-slate-600 hover:text-red-600 bg-white border border-slate-300 px-2 py-1 rounded-lg hover:bg-red-50 cursor-pointer transition-colors"
                  >
                    초기화
                  </button>
                )}
              </div>
            </div>

            {(() => {
              const allHidden = memos.filter((m) => !!m.hidden);
              const filteredHidden = allHidden.filter((m) => {
                // 내용 / 작성자 검색
                if (hiddenMemoSearchText.trim()) {
                  const kw = hiddenMemoSearchText.trim().toLowerCase();
                  const plain = memoPlainText(m.text || "").toLowerCase();
                  const author = (m.author || "").toLowerCase();
                  if (!plain.includes(kw) && !author.includes(kw)) return false;
                }
                // 일자별 검색 (YYYY-MM-DD)
                if (hiddenMemoSearchDate) {
                  const dateStr = (m.created_at || m.date || "").replace(/\.\s*/g, "-");
                  if (!dateStr.includes(hiddenMemoSearchDate)) return false;
                }
                return true;
              });

              return (
                <>
                  <div className="p-6 overflow-y-auto flex-1 space-y-3 bg-slate-50">
                    {allHidden.length === 0 ? (
                      <div className="text-center py-12 text-slate-400 text-sm font-medium">
                        숨겨진 메모가 없습니다.
                      </div>
                    ) : filteredHidden.length === 0 ? (
                      <div className="text-center py-12 text-slate-400 text-sm font-medium">
                        검색 조건에 맞는 숨겨진 메모가 없습니다.
                      </div>
                    ) : (
                      filteredHidden.map((memo) => (
                        <div
                          key={`hidden-${memo.id}`}
                          className="p-4 bg-white border border-slate-200 rounded-xl shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all hover:border-amber-300"
                        >
                          <div className="flex-1 min-w-0 pr-2">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md">
                                {memo.author}
                              </span>
                              <span className="text-[11px] text-slate-400">{memo.date}</span>
                              {memo.pinned && (
                                <span className="text-[10px] bg-amber-100 text-amber-800 font-extrabold px-1.5 py-0.5 rounded">
                                  상단 고정됨
                                </span>
                              )}
                            </div>
                            <MemoRichContent html={memo.text} className="text-xs text-slate-800 leading-relaxed font-medium" />
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleUnhideMemo(memo)}
                              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-2xs transition-colors cursor-pointer flex items-center gap-1"
                            >
                              <span>화면에 복원</span>
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="bg-gray-100 px-6 py-3 border-t border-gray-200 flex justify-between items-center text-xs text-slate-500 font-medium">
                    <span>
                      {hiddenMemoSearchText || hiddenMemoSearchDate
                        ? `검색 결과 ${filteredHidden.length}개 / 전체 ${allHidden.length}개`
                        : `총 ${allHidden.length}개의 숨겨진 메모`}
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowHiddenMemosModal(false)}
                      className="bg-slate-800 hover:bg-slate-900 text-white font-bold px-4 py-1.5 rounded-lg transition-colors cursor-pointer"
                    >
                      닫기
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

    </div>
  );
}
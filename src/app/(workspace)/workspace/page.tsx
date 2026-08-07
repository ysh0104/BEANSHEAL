"use client";

import { useEffect, useState, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { getRecipeList } from "@/app/actions/recipe"; 
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
} from "@/app/actions/memoActions";
import MemoRichEditor from "@/components/MemoRichEditor";
import MemoRichContent from "@/components/MemoRichContent";
import MemoPresetsManager from "@/components/MemoPresetsManager";
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
import WorkScheduleTable from "@/components/WorkScheduleTable";

const GRID_WIDTH_STEPS = [25, 32, 49, 50, 65, 75, 100];
const ROW_HEIGHT_SNAP = 40; // 40px 단위 세로 스냅

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
  const [recipeOptions, setRecipeOptions] = useState<any[]>([]);

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
  const [editingMemoId, setEditingMemoId] = useState<number | string | null>(null);
  const [editingMemoText, setEditingMemoText] = useState<string>("");
  const [heartAnim, setHeartAnim] = useState<{ id: number | string; x: number; y: number } | null>(null);

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

  // 계획(Schedule) 데이터 관리 State
  const [schedules, setSchedules] = useState<any[]>([]);
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

  // 현재 유효한 노션 설정 객체 반환 헬퍼 (개별 커스텀 키가 없으면 undefined를 넘겨 Vercel 환경변수 사용)
  const getNotionConfig = () => {
    if (notionApiKey.trim() && notionDatabaseId.trim()) {
      return { apiKey: notionApiKey.trim(), databaseId: notionDatabaseId.trim() };
    }
    return undefined;
  };

  // 🌟 마이 대시보드 그리드 커스텀 State
  const [isGridSnapEnabled, setIsGridSnapEnabled] = useState(true);
  const [widgetConfigs, setWidgetConfigs] = useState<Array<{
    id: string;
    title: string;
    widthPct: number;
    heightPx: number;
  }>>([
    { id: "calendar", title: "월간 생산 계획표", widthPct: 65, heightPx: 640 },
    { id: "memo", title: "실시간 특이사항 & 메모", widthPct: 32, heightPx: 640 },
  ]);

  const [draggedWidgetId, setDraggedWidgetId] = useState<string | null>(null);
  const [dragOverWidgetId, setDragOverWidgetId] = useState<string | null>(null);
  const [resizingWidgetId, setResizingWidgetId] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // 🌟 로그인 사용자 ID(이메일)별 독립된 대시보드 그리드 커스텀 키 반환
  const getStorageKey = () => {
    return user?.email ? `beansheal_widget_configs_${user.email}` : "beansheal_widget_configs_guest";
  };

  useEffect(() => {
    const key = getStorageKey();
    const savedLayout = localStorage.getItem(key);
    if (savedLayout) {
      try {
        const parsed = JSON.parse(savedLayout);
        const filtered = parsed.filter((w: any) => w.id === "calendar" || w.id === "memo");
        if (filtered.length > 0) setWidgetConfigs(filtered);
      } catch (e) {}
    }
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

  useEffect(() => {
    const fetchSchedulesSilently = async () => {
      try {
        const y = currentDate.getFullYear();
        const m = currentDate.getMonth(); // 0-indexed
        
        // 당월 1일 ~ 다음달 말일 계산
        const startDate = `${y}-${String(m + 1).padStart(2, '0')}-01`;
        const nextY = m === 11 ? y + 1 : y;
        const nextM = m === 11 ? 1 : m + 2;
        const lastDayNextM = new Date(nextY, nextM, 0).getDate();
        const endDate = `${nextY}-${String(nextM).padStart(2, '0')}-${String(lastDayNextM).padStart(2, '0')}`;

        const notionRes = await fetchNotionSchedules(getNotionConfig(), { startDate, endDate });
        if (notionRes?.success && notionRes.data && notionRes.data.length > 0) {
          setSchedules(notionRes.data);
          setNotionSyncStatusMsg(null);
          localStorage.setItem("beansheal_cached_schedules", JSON.stringify(notionRes.data));
        } else {
          // 백업 캐시 일정 불러오기 시도
          const cached = localStorage.getItem("beansheal_cached_schedules");
          if (cached) {
            try {
              const parsed = JSON.parse(cached);
              if (parsed && parsed.length > 0) setSchedules(parsed);
            } catch (cE) {}
          }
          if (notionRes && !notionRes.success) {
            setNotionSyncStatusMsg(notionRes.message || "노션 연동 실패");
          }
        }
      } catch (e: any) {
        setNotionSyncStatusMsg(e?.message || "노션 데이터 불러오기 오류");
      }
    };

    const initData = async () => {
      try {
        const recipeRes = await getRecipeList();
        if (recipeRes?.success && recipeRes.data) setRecipeOptions(recipeRes.data);

        const savedKey = localStorage.getItem("beansheal_notion_api_key");
        const savedDbId = localStorage.getItem("beansheal_notion_database_id");
        if (savedKey) setNotionApiKey(savedKey);
        if (savedDbId) setNotionDatabaseId(savedDbId);

        // Vercel 서버 환경변수 연동 상태 체크
        try {
          const status = await getNotionConfigStatus();
          setIsVercelNotionConfigured(status.isConfigured);
        } catch (e) {}

        // 🌟 Supabase 메모 데이터 100% 우선 연동 (없으면 로컬스토리지/기본값)
        const memoRes = await getMemosFromSupabase();
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
              { id: 2, text: "유기농 야채원료 입고 검수 완료", date: "오늘 09:15", author: "품질팀" }
            ];
            setMemos(defaultMemos);
            localStorage.setItem("beansheal_memos", JSON.stringify(defaultMemos));
          }
        }

        // 노션 달력 생산 일정 갱신 (Vercel 서버 환경변수로 100% 무조건 백그라운드 자동 로드)
        await fetchSchedulesSilently();
      } catch (e) {
        console.error(e);
      }
    };
    initData();

    // 노션 일정만 주기적 폴링 (메모는 Realtime으로 즉시 반영)
    const interval = setInterval(() => {
      fetchSchedulesSilently();
    }, 15000);

    // Supabase Realtime: 다른 사용자가 메모를 추가/수정/삭제하면 새로고침 없이 반영
    const refreshMemos = async () => {
      try {
        const memoRes = await getMemosFromSupabase();
        if (!memoRes?.success || !Array.isArray(memoRes.data)) return;
        setMemos((prev) => {
          // 서버가 비어 있는데 로컬만 있는 경우(저장 지연/실패) 목록을 지우지 않음
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
  }, [currentDate]);

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
    const defaultConfig = [
      { id: "calendar", title: "월간 생산 계획표", widthPct: 65, heightPx: 640 },
      { id: "memo", title: "실시간 특이사항 & 메모", widthPct: 32, heightPx: 640 },
    ];
    saveWidgetConfigs(defaultConfig);
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
    <div className="space-y-6 max-w-7xl mx-auto w-full pb-20 mt-2 px-2 font-sans">
      
      {/* 대시보드 상단 타이틀 & 그리드 스냅 토글 */}
      <div className="flex justify-between items-center pb-4 border-b border-gray-200">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <span>BEANSHEAL 대시보드</span>
            <span className="text-xs bg-blue-100 text-blue-800 font-extrabold px-2.5 py-0.5 rounded border border-blue-200">ERP 그리드 커스텀</span>
          </h2>
          <p className="text-sm text-gray-500 mt-1">상단 <strong>⣿ 핸들</strong>로 순서를 변경하고, 우측 하단 <strong>⤡ 코너</strong>를 끌어 가로/세로 크기를 커스텀하세요.</p>
        </div>

        <div className="flex items-center gap-2">
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
        {widgetConfigs.map((widget) => {
          const isDraggingThis = draggedWidgetId === widget.id;
          const isDragOverThis = dragOverWidgetId === widget.id;
          const isResizingThis = resizingWidgetId === widget.id;

          const cardStyle: React.CSSProperties = {
            width: `calc(${widget.widthPct}% - 12px)`,
            minWidth: '280px',
            height: `${widget.heightPx}px`,
            flexGrow: 0,
            flexShrink: 0
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

          const renderCornerResizeHandles = () => (
            <>
              {/* 우측 하단 모서리 리사이즈 핸들 (Bottom-Right) */}
              <div 
                onMouseDown={(e) => startCornerResize(e, widget.id, false)}
                className="absolute bottom-0 right-0 w-7 h-7 flex items-end justify-end text-slate-400 hover:text-indigo-600 cursor-nwse-resize select-none p-1 group/corner-br z-20"
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
                className="absolute bottom-0 left-0 w-7 h-7 flex items-end justify-start text-slate-400 hover:text-indigo-600 cursor-nesw-resize select-none p-1 group/corner-bl z-20"
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
              <div className="flex items-center gap-1.5 text-slate-800 text-xs font-bold flex-wrap">
                <button onClick={handlePrevMonth} className="p-0.5 hover:bg-slate-200 rounded text-slate-600 cursor-pointer">
                  ‹
                </button>
                <select 
                  value={year} 
                  onChange={(e) => setCurrentDate(new Date(Number(e.target.value), month, 1))}
                  className="font-extrabold font-mono border border-slate-200 rounded px-1 py-0.5 text-xs bg-slate-50 cursor-pointer"
                >
                  {[2023, 2024, 2025, 2026, 2027].map((y) => (
                    <option key={y} value={y}>{y}년</option>
                  ))}
                </select>
                <span className="font-extrabold font-mono">{String(month + 1).padStart(2, '0')}월</span>
                <button onClick={handleNextMonth} className="p-0.5 hover:bg-slate-200 rounded text-slate-600 cursor-pointer">
                  ›
                </button>
                <span className="ml-1 text-slate-900 font-extrabold text-xs">일정관리</span>

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
              <div className="hidden sm:flex items-center gap-1.5 text-[10.5px] font-bold shrink-0">
                <span className="bg-[#e6f4ea] text-[#137333] px-2 py-0.5 rounded font-bold">
                  생산
                </span>
                <span className="bg-[#e8f0fe] text-[#1a73e8] px-2 py-0.5 rounded font-bold">
                  입고
                </span>
                <span className="bg-[#f3e8fd] text-[#7627bb] px-2 py-0.5 rounded font-bold">
                  출고
                </span>
                <span className="bg-[#fef7e0] text-[#b06000] px-2 py-0.5 rounded font-bold">
                  휴가
                </span>
                <span className="bg-[#fce8e6] text-[#c5221f] px-2 py-0.5 rounded font-bold">
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
                    <div className="flex-1 flex flex-col h-full min-h-0">
                      {/* 요일 헤더 */}
                      <div className="grid grid-cols-7 gap-1 text-center mb-1 bg-slate-50 py-1.5 border-b border-slate-200 rounded-t shrink-0">
                        {['일', '월', '화', '수', '목', '금', '토'].map(day => (
                          <div key={day} className={`text-[11px] font-extrabold ${day === '일' ? 'text-red-500' : day === '토' ? 'text-blue-500' : 'text-slate-600'}`}>
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

                          // 🌟 주(Week)별 레인 상단 Y좌표(top) 및 픽셀 정밀 배치
                          // 1. 각 레인-컬럼별 적재 높이 계산 (긴 줄바꿈 품목 포함)
                          const laneColHeights: { [key: string]: number } = {};
                          const segCardHeights: number[] = [];

                          allocated.forEach((seg, sIdx) => {
                            const prodName = seg.sch.product_name || "";
                            const tagName = seg.sch.tag_name || "";
                            const nameLen = prodName.length + tagName.length;

                            let cardH = 26; // 기본 1줄 카드
                            if (nameLen > 25 || (prodName.length > 15 && tagName)) {
                              cardH = 58; // 3~4줄 긴 품목명
                            } else if (nameLen > 14 || (prodName.length > 8 && tagName)) {
                              cardH = 42; // 2줄 품목명
                            }
                            segCardHeights[sIdx] = cardH;

                            for (let c = seg.startCol; c <= seg.endCol; c++) {
                              const key = `${seg.lane}-${c}`;
                              laneColHeights[key] = Math.max(laneColHeights[key] || 0, cardH);
                            }
                          });

                          // 2. 해당 세그먼트가 차지하는 컬럼들에서의 이전 레인 최대 높이 합 + gap(4px)으로 상단 Y좌표 결정
                          const segTops = allocated.map((seg) => {
                            let currentTop = 0;
                            for (let l = 0; l < seg.lane; l++) {
                              let maxPrevLaneH = 26; // 기본 레인 최소 높이 26px
                              for (let c = seg.startCol; c <= seg.endCol; c++) {
                                const key = `${l}-${c}`;
                                if (laneColHeights[key]) {
                                  maxPrevLaneH = Math.max(maxPrevLaneH, laneColHeights[key]);
                                }
                              }
                              currentTop += maxPrevLaneH + 4; // 상하 레인 간격 4px 고정
                            }
                            return currentTop;
                          });

                          let maxTopWithCard = 0;
                          allocated.forEach((seg, i) => {
                            const topH = segTops[i] + (segCardHeights[i] || 26);
                            if (topH > maxTopWithCard) maxTopWithCard = topH;
                          });

                          const weekRequiredMinHeight = Math.max(115, 28 + maxTopWithCard + 12);

                          return (
                            <div
                              key={wIdx}
                              style={{ minHeight: `${weekRequiredMinHeight}px` }}
                              className="flex-1 grid grid-cols-7 gap-1 relative border-b border-slate-100 last:border-0 pb-1"
                            >
                              {/* 1. 배경 날짜 셀 Layer */}
                              {week.map((cell, cIdx) => (
                                <div
                                  key={cIdx}
                                  onDragOver={(e) => {
                                    if (draggedSchedule) e.preventDefault();
                                  }}
                                  onDrop={(e) => {
                                    if (draggedSchedule && cell.dateStr) {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      handleDropOnCell(e, cell.dateStr);
                                    }
                                  }}
                                  className={`border border-slate-200/90 p-1 flex flex-col justify-start items-start relative h-full w-full ${
                                    cell.isOtherMonth ? 'bg-slate-50/40 text-slate-300' : cell.isToday ? 'bg-indigo-50/50' : 'bg-white hover:bg-slate-50/80'
                                  } transition-colors rounded`}
                                >
                                  <div className="w-full flex justify-between items-center">
                                    <span className={`text-[11px] font-extrabold ${cell.isToday ? 'bg-indigo-600 text-white px-1.5 rounded shadow-xs' : cell.isOtherMonth ? 'text-slate-300' : 'text-slate-700 ml-0.5'}`}>
                                      {cell.day}
                                    </span>
                                  </div>
                                </div>
                              ))}

                              {/* 2. 오버레이 노션 스타일 가로 연장 막대(Bar) Layer (상하 간격 4px 100% 통일 & 전체 줄바꿈) */}
                              <div className="absolute inset-x-0 top-[24px] bottom-1 pointer-events-none px-0.5 pb-2">
                                {allocated.map((seg, sIdx) => {
                                  const sch = seg.sch;
                                  const tagStyle = getNotionScheduleColorClass(sch.tag_name, sch.tag_color, sch.product_name);
                                  const roundedClass = `${seg.isStartOfSchedule ? 'rounded-l-md' : 'rounded-l-none'} ${seg.isEndOfSchedule ? 'rounded-r-md' : 'rounded-r-none'}`;
                                  const topPos = segTops[sIdx];
                                  const leftPct = (seg.startCol / 7) * 100;
                                  const widthPct = (seg.colSpan / 7) * 100;

                                  return (
                                    <div
                                      key={`${sch.id}-${wIdx}-${sIdx}`}
                                      style={{
                                        position: "absolute",
                                        top: `${topPos}px`,
                                        left: `calc(${leftPct}% + 2px)`,
                                        width: `calc(${widthPct}% - 4px)`,
                                      }}
                                      draggable={true}
                                      onDragStart={(e) => {
                                        e.stopPropagation();
                                        handleDragStart(e, sch);
                                      }}
                                      className={`pointer-events-auto relative h-fit min-h-[26px] py-0.5 px-2.5 text-left flex items-start justify-between cursor-grab active:cursor-grabbing transition-all hover:shadow-md group/bar ${tagStyle} ${roundedClass}`}
                                    >
                                      <div className="text-[11px] font-extrabold leading-[1.35] text-slate-950 pr-1 w-full break-normal">
                                        {sch.tag_name && (
                                          <span className="inline-block text-[9.5px] font-black px-1.5 py-0.5 rounded bg-black/15 text-slate-900 mr-1 align-middle shrink-0 leading-none">
                                            {sch.tag_name}
                                          </span>
                                        )}
                                        <span className="inline leading-[1.35] font-extrabold text-slate-950 align-middle">
                                          {sch.product_name}
                                        </span>
                                        {sch.quantity && sch.quantity !== "1" && (
                                          <span className="inline-block text-[10px] opacity-90 font-black shrink-0 font-mono ml-1 align-middle leading-none">
                                            ({sch.quantity})
                                          </span>
                                        )}
                                      </div>

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
                  {renderCornerResizeHandles()}
                </div>
              </div>
            );
          }

          /* Widget 2: 실시간 특이사항 및 메모 (Memo) - 이카운트 ERP 룩앤필 */
          if (widget.id === "memo") {
            const allTags = [...new Set(memos.flatMap((m) => extractMemoTags(m.text || "")))];
            const visibleMemos = memos
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
              <span className="text-xs font-bold text-slate-900">Memo</span>
            );

            const memoHeaderRight = (
              <button
                type="button"
                onClick={() => setIsMemoPresetsOpen(true)}
                className="text-[10px] font-bold text-slate-600 hover:text-indigo-600 cursor-pointer px-1.5 py-0.5 rounded hover:bg-indigo-50"
                title="템플릿/태그/멘션 관리"
              >
                빠른입력 관리
              </button>
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
                    {(allTags.length > 0 || memoTagFilter) && (
                      <div className="flex flex-wrap items-center gap-1 mb-2">
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
                            draggable={editingMemoId === null}
                            onDragStart={(e) => handleMemoCardDragStart(e, memo.id)}
                            onDragOver={(e) => handleMemoCardDragOver(e, memo.id)}
                            onDrop={(e) => handleMemoCardDrop(e, memo.id)}
                            onDragEnd={handleMemoCardDragEnd}
                            onDoubleClick={(e) => handleToggleLike(memo.id, e)}
                            className={`p-3 border rounded-xl shadow-xs relative group transition-all select-none cursor-grab active:cursor-grabbing inline-flex flex-col justify-between w-fit max-w-full min-w-[200px] flex-grow-0 flex-shrink-0 ${
                              isBeingDragged
                                ? "opacity-30 border-dashed border-2 border-indigo-400 scale-95"
                                : isTargetOver
                                ? "bg-indigo-100/90 ring-4 ring-indigo-500 border-2 border-indigo-600 scale-105 shadow-xl"
                                : memo.pinned
                                ? "border-amber-300 bg-amber-50/80 hover:bg-amber-50 shadow-sm"
                                : "border-gray-200/90 bg-slate-50/90 hover:bg-white hover:border-indigo-200 hover:shadow-md"
                            }`}
                            title="마우스로 드래그하여 메모 위치 순서를 자유롭게 바꿀 수 있습니다."
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
                              <div className="space-y-1.5 w-full min-w-[260px]" onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
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
                                  <button 
                                    onClick={() => handleTogglePin(memo)} 
                                    className={`transition-colors cursor-pointer p-0.5 ${memo.pinned ? "text-amber-500 opacity-100" : "text-gray-400 hover:text-amber-500"}`}
                                    title={memo.pinned ? "핀 해제" : "상단 고정"}
                                  >
                                    <span className="text-xs">📌</span>
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
                                    onClick={() => handleDeleteMemo(memo.id)} 
                                    className="text-gray-400 hover:text-red-600 transition-colors cursor-pointer p-0.5" 
                                    title="메모 삭제"
                                  >
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                                    </svg>
                                  </button>
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
                        <div className="flex flex-wrap items-center gap-2">
                          <label className="inline-flex items-center gap-1 text-[10px] font-bold text-gray-600 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={newMemoPinned}
                              onChange={(e) => setNewMemoPinned(e.target.checked)}
                              className="rounded border-gray-300"
                            />
                            📌 상단 고정
                          </label>
                          <label className="inline-flex items-center gap-1 text-[10px] font-bold text-gray-600">
                            ⏰
                            <input
                              type="datetime-local"
                              value={newMemoReminder}
                              onChange={(e) => setNewMemoReminder(e.target.value)}
                              className="text-[10px] border border-gray-300 rounded px-1 py-0.5 bg-white"
                            />
                          </label>
                        </div>
                        <button type="submit" className="bg-slate-800 text-white px-3 py-1.5 text-xs font-bold rounded shadow-xs hover:bg-slate-700 transition-colors cursor-pointer">등록</button>
                      </div>
                    </form>
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
      <div className="w-full mt-8">
        <WorkScheduleTable />
      </div>

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

    </div>
  );
}
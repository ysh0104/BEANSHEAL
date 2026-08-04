"use client"

import { useEffect, useState, useRef } from "react";
import { getDashboardItems } from "./actions/database";
import { supabase } from "../utils/supabase";

import { parseEcountExcel } from "@/utils/excelParser"; 
import { syncExcelToSupabase } from "@/app/actions/inventoryActions"; 

import { getRecipeList } from "./actions/recipe"; 
import { 
  syncNotionWithSupabase, 
  createNotionSchedule, 
  fetchNotionSchedules,
  testNotionConnection, 
  deleteNotionSchedule,
  updateScheduleDate
} from "@/app/actions/notionActions";

const analyzeItemTemplate = (productName: string) => {
  let mainType = "완제품";
  let subType = "기본";

  if (productName.startsWith('원)')) {
    mainType = "원료";
    if (productName.includes('액상') || productName.includes('농축액') || productName.includes('유기농')) subType = "액상";
    else if (productName.includes('분말') || productName.includes('덱스트린') || productName.includes('추출물') || productName.includes('비타민') || productName.includes('파우더')) subType = "분말";
    else subType = "기본";
  } 
  else if (productName.startsWith('부)') || productName.startsWith('자)')) {
    mainType = "부자재";
    if (productName.includes('파우치') || productName.includes('비닐')) subType = "파우치";
    else if (productName.includes('단상자')) subType = "단상자";
    else if (productName.includes('카톤') || productName.includes('박스')) subType = "카톤박스";
    else subType = "기본";
  }
  else if (productName.startsWith('반)')) {
    mainType = "반제품";
    subType = productName.includes('액상') ? "액상" : "기본";
  }
  else if (productName.includes('농축액') || productName.includes('추출물') || productName.includes('분말') || productName.includes('파우더') || productName.includes('원료')) {
    mainType = "원료";
    if (productName.includes('농축액') || productName.includes('액상') || productName.includes('유기농')) {
      subType = "액상";
    } else {
      subType = "분말";
    }
  }

  return `${mainType}_${subType}`; 
};

const getCleanRecipeName = (rawName: string) => {
  if (!rawName) return "";
  return rawName
    .replace(/^[원부자반완]\)\s*/g, '') 
    .replace(/\s*\(?(액상|기본|기본형|분말|파우더|고체)\)?\s*$/g, '') 
    .trim();
};

export default function Home() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [scrapedItems, setScrapedItems] = useState<any[]>([]);
  
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [lastSyncTime, setLastSyncTime] = useState<string>("기록 없음");
  
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [filterDate, setFilterDate] = useState("ALL");

  const [selectedProduct, setSelectedProduct] = useState("");
  const [inputQty, setInputQty] = useState("");
  const [previewLot, setPreviewLot] = useState("");

  const [recipeOptions, setRecipeOptions] = useState<any[]>([]);

  const handleQtyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const numericValue = e.target.value.replace(/[^0-9]/g, '');
    const formattedValue = numericValue ? Number(numericValue).toLocaleString('ko-KR') : '';
    setInputQty(formattedValue);
  };
  
  const [mfgNo, setMfgNo] = useState("");
  const [mfgDate, setMfgDate] = useState("");
  const [mfgHistory, setMfgHistory] = useState<any[]>([]);

  // 달력 및 메모장용 State
  const [currentDate, setCurrentDate] = useState(new Date());
  const [memos, setMemos] = useState<any[]>([]);
  const [newMemo, setNewMemo] = useState("");

  // 계획(Schedule) 데이터 관리 State
  const [schedules, setSchedules] = useState<any[]>([]);
  const [selectedDateForPlan, setSelectedDateForPlan] = useState<string | null>(null);
  const [planProduct, setPlanProduct] = useState("");
  const [planQty, setPlanQty] = useState("");
  const [planNote, setPlanNote] = useState("");

  // 노션 및 모달 연동 State
  const [isNotionModalOpen, setIsNotionModalOpen] = useState(false);
  const [isMemoModalOpen, setIsMemoModalOpen] = useState(false);
  const [notionApiKey, setNotionApiKey] = useState("");
  const [notionDatabaseId, setNotionDatabaseId] = useState("");
  const [isSyncingNotion, setIsSyncingNotion] = useState(false);
  const [syncToNotionChecked, setSyncToNotionChecked] = useState(true);
  const [testStatusMsg, setTestStatusMsg] = useState("");
  const [isTestingConn, setIsTestingConn] = useState(false);

  // 대시보드 위젯 State
  const [widgetConfigs, setWidgetConfigs] = useState<Array<{
    id: string;
    title: string;
    widthPct: number;
    heightPx: number;
  }>>([
    { id: "calendar", title: "월간 생산 계획표", widthPct: 65, heightPx: 480 },
    { id: "memo", title: "실시간 특이사항 & 생산계획 등록", widthPct: 32, heightPx: 480 },
    { id: "quickProduction", title: "반제품/완제품 실적 즉시 등록", widthPct: 100, heightPx: 260 },
    { id: "lotTable", title: "로트 동기화 및 관리 데이터", widthPct: 100, heightPx: 480 },
  ]);

  const [draggedWidgetId, setDraggedWidgetId] = useState<string | null>(null);
  const [dropTargetWidgetId, setDropTargetWidgetId] = useState<string | null>(null);
  const [resizingWidgetId, setResizingWidgetId] = useState<string | null>(null);

  // 그리드 스냅 State
  const [isGridSnapEnabled, setIsGridSnapEnabled] = useState(true);
  const GRID_WIDTH_STEPS = [25, 32, 50, 65, 75, 100];

  const snapWidthPct = (rawPct: number) => {
    if (!isGridSnapEnabled) return Math.max(20, Math.min(100, Math.round(rawPct)));
    const clamped = Math.max(20, Math.min(100, rawPct));
    return GRID_WIDTH_STEPS.reduce((prev, curr) =>
      Math.abs(curr - clamped) < Math.abs(prev - clamped) ? curr : prev
    );
  };

  const snapHeightPx = (rawPx: number) => {
    if (!isGridSnapEnabled) return Math.max(200, Math.min(1400, Math.round(rawPx)));
    const clamped = Math.max(200, Math.min(1400, rawPx));
    return Math.round(clamped / 40) * 40;
  };

  useEffect(() => {
    try {
      const saved = localStorage.getItem("custom_dashboard_layout_configs");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const converted = parsed.map((item: any) => ({
            id: item.id,
            title: item.title,
            widthPct: item.widthPct !== undefined 
              ? item.widthPct 
              : item.colSpan === 'col-span-1' ? 32 : item.colSpan === 'col-span-2' ? 65 : 100,
            heightPx: item.heightPx !== undefined
              ? item.heightPx
              : item.id === 'quickProduction' ? 260 : 480
          }));
          setWidgetConfigs(converted);
        }
      }
    } catch (e) { console.error(e); }
  }, []);

  const saveWidgetConfigs = (newConfigs: typeof widgetConfigs) => {
    setWidgetConfigs(newConfigs);
    localStorage.setItem("custom_dashboard_layout_configs", JSON.stringify(newConfigs));
  };

  const startCornerResize = (e: React.MouseEvent, widgetId: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    setResizingWidgetId(widgetId);
    const startX = e.clientX;
    const startY = e.clientY;

    const targetWidget = widgetConfigs.find(w => w.id === widgetId);
    if (!targetWidget) return;

    const startWidthPct = targetWidget.widthPct;
    const startHeightPx = targetWidget.heightPx;

    const container = document.getElementById("dashboard-container");
    const containerWidth = container ? container.clientWidth : window.innerWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;

      const deltaPct = (deltaX / containerWidth) * 100;
      const rawWidthPct = startWidthPct + deltaPct;
      const rawHeightPx = startHeightPx + deltaY;

      const finalWidthPct = snapWidthPct(rawWidthPct);
      const finalHeightPx = snapHeightPx(rawHeightPx);

      setWidgetConfigs(prev => prev.map(w => w.id === widgetId ? { ...w, widthPct: finalWidthPct, heightPx: finalHeightPx } : w));
    };

    const handleMouseUp = () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      setResizingWidgetId(null);

      setWidgetConfigs(latest => {
        localStorage.setItem("custom_dashboard_layout_configs", JSON.stringify(latest));
        return latest;
      });
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  const handleWidgetDragStart = (e: React.DragEvent, id: string) => {
    setDraggedWidgetId(id);
    e.dataTransfer.setData("type", "WIDGET");
    e.dataTransfer.setData("text/plain", id);
    e.dataTransfer.setData("widget_id", id);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleWidgetDragOver = (e: React.DragEvent, id: string) => {
    if (draggedWidgetId) {
      e.preventDefault(); 
      e.dataTransfer.dropEffect = "move";
      if (draggedWidgetId !== id && dropTargetWidgetId !== id) {
        setDropTargetWidgetId(id);
      }
    }
  };

  const handleWidgetDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleWidgetDrop = (e: React.DragEvent, targetId: string) => {
    if (!draggedWidgetId) return;

    e.preventDefault();
    e.stopPropagation();
    setDropTargetWidgetId(null);

    const sourceId = e.dataTransfer.getData("widget_id") || draggedWidgetId;
    if (!sourceId || sourceId === targetId) return;

    const sourceIdx = widgetConfigs.findIndex(w => w.id === sourceId);
    const targetIdx = widgetConfigs.findIndex(w => w.id === targetId);
    if (sourceIdx < 0 || targetIdx < 0) return;

    const updated = [...widgetConfigs];
    const [moved] = updated.splice(sourceIdx, 1);
    updated.splice(targetIdx, 0, moved);
    
    saveWidgetConfigs(updated);
    setDraggedWidgetId(null);
  };

  const handleWidgetDragEnd = () => {
    setDraggedWidgetId(null);
    setDropTargetWidgetId(null);
  };

  const resetWidgetLayout = () => {
    const defaultConfig: typeof widgetConfigs = [
      { id: "calendar", title: "월간 생산 계획표", widthPct: 65, heightPx: 480 },
      { id: "memo", title: "실시간 특이사항 & 생산계획 등록", widthPct: 32, heightPx: 480 },
      { id: "quickProduction", title: "반제품/완제품 실적 즉시 등록", widthPct: 100, heightPx: 260 },
      { id: "lotTable", title: "로트 동기화 및 관리 데이터", widthPct: 100, heightPx: 480 },
    ];
    saveWidgetConfigs(defaultConfig);
  };

  // 스케줄 드래그 앤 드롭
  const [draggedSchedule, setDraggedSchedule] = useState<any | null>(null);

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
    if (draggedSchedule.plan_date === targetDateStr) return;

    const movingSch = draggedSchedule;
    setDraggedSchedule(null);

    setSchedules((prev) => {
      const updated = prev.map((item) =>
        item.id === movingSch.id || (movingSch.notion_page_id && item.notion_page_id === movingSch.notion_page_id)
          ? { ...item, plan_date: targetDateStr }
          : item
      );
      localStorage.setItem("cached_schedules", JSON.stringify(updated));
      return updated;
    });

    try {
      await updateScheduleDate(
        movingSch.id,
        targetDateStr,
        movingSch.notion_page_id,
        { apiKey: notionApiKey, databaseId: notionDatabaseId }
      );
    } catch (err: any) {
      console.error("드래그 이동 저장 오류:", err);
    }
  };

  const loadAllSchedules = async (overrideApiKey?: string, overrideDbId?: string) => {
    const apiKey = overrideApiKey || notionApiKey || localStorage.getItem("notionApiKey") || undefined;
    const dbId = overrideDbId || notionDatabaseId || localStorage.getItem("notionDbId") || undefined;

    let notionItems: any[] = [];
    if (apiKey && dbId) {
      try {
        const notionRes = await fetchNotionSchedules({ apiKey, databaseId: dbId });
        if (notionRes.success && notionRes.data) {
          notionItems = notionRes.data;
        }
      } catch (e) { console.error("노션 로딩 오류:", e); }
    }

    let supabaseItems: any[] = [];
    try {
      const { data, error } = await supabase.from("production_schedules").select("*").order("plan_date", { ascending: true });
      if (!error && data) supabaseItems = data;
    } catch (e) {}

    const map = new Map();
    supabaseItems.forEach((item) => map.set(item.id || item.notion_page_id, item));
    notionItems.forEach((item) => map.set(item.id || item.notion_page_id, item));
    const combined = Array.from(map.values());

    setSchedules(combined);
    localStorage.setItem("cached_schedules", JSON.stringify(combined));
  };

  useEffect(() => {
    const savedApiKey = localStorage.getItem("notionApiKey");
    const savedDbId = localStorage.getItem("notionDbId");
    if (savedApiKey) setNotionApiKey(savedApiKey);
    if (savedDbId) setNotionDatabaseId(savedDbId);

    const cachedSchedules = localStorage.getItem("cached_schedules");
    if (cachedSchedules) {
      try { setSchedules(JSON.parse(cachedSchedules)); } catch (e) {}
    }

    loadAllSchedules(savedApiKey || undefined, savedDbId || undefined);
  }, []);

  const fetchMemos = async () => {
    try {
      const { data, error } = await supabase.from("dashboard_memos").select("*").order("id", { ascending: false });
      if (error) throw error;
      if (data) setMemos(data);
    } catch (e) { console.error("메모 데이터 로드 실패:", e); }
  };

  useEffect(() => {
    const savedHistory = localStorage.getItem('mfgSetHistory');
    if (savedHistory) setMfgHistory(JSON.parse(savedHistory));
    fetchMemos();
  }, []);

  const handleNotionSync = async () => {
    setIsSyncingNotion(true);
    try {
      await loadAllSchedules();
      alert("노션 일정을 성공적으로 불러와 달력에 반영했습니다!");
    } catch (e: any) {
      alert("노션 동기화 중 오류 발생: " + e.message);
    } finally {
      setIsSyncingNotion(false);
    }
  };

  const handleTestNotionConnection = async () => {
    setIsTestingConn(true);
    setTestStatusMsg("연동 상태 확인 중...");
    try {
      const res = await testNotionConnection({ apiKey: notionApiKey, databaseId: notionDatabaseId });
      setTestStatusMsg(res.message);
    } catch (e: any) {
      setTestStatusMsg("연동 테스트 실패: " + e.message);
    } finally {
      setIsTestingConn(false);
    }
  };

  const handleSaveNotionConfig = () => {
    if (notionApiKey) localStorage.setItem("notionApiKey", notionApiKey);
    if (notionDatabaseId) localStorage.setItem("notionDbId", notionDatabaseId);
    alert("노션 연동 설정이 성공적으로 저장되었습니다!");
    setIsNotionModalOpen(false);
    loadAllSchedules(notionApiKey, notionDatabaseId);
  };

  const handleMfgNoChange = (val: string) => {
    setMfgNo(val);
    const matchedSet = mfgHistory.find(item => item.mfgNo === val);
    if (matchedSet) setMfgDate(matchedSet.mfgDate); 
  };

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    return { firstDay, daysInMonth, year, month };
  };

  const { firstDay, daysInMonth, year, month } = getDaysInMonth(currentDate);
  const daysArray = Array.from({ length: 42 }, (_, i) => {
    const dayNumber = i - firstDay + 1;
    if (dayNumber > 0 && dayNumber <= daysInMonth) return dayNumber;
    return null;
  });

  const handlePrevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const handleNextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  const formatDateString = (y: number, m: number, d: number) => {
    return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  };

  const handleAddMemo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemo.trim()) return;
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase.from("dashboard_memos").insert([{ text: newMemo, date: todayStr, author: "관리자" }]).select();
      if (error) throw error;
      if (data) { setMemos([data[0], ...memos]); setNewMemo(""); }
    } catch (e: any) { alert("메모 저장 실패: " + e.message); }
  };

  const handleDeleteMemo = async (id: number) => {
    if (!window.confirm("선택한 메모를 삭제하시겠습니까?")) return;
    try {
      const { error } = await supabase.from("dashboard_memos").delete().eq("id", id);
      if (error) throw error;
      setMemos(memos.filter(m => m.id !== id));
    } catch (e: any) { alert("메모 삭제 실패: " + e.message); }
  };

  const handleAddSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDateForPlan || !planProduct || !planQty) {
      alert("날짜, 품목, 수량을 모두 입력해 주십시오.");
      return;
    }

    try {
      let notionPageId = undefined;

      if (syncToNotionChecked) {
        const notionRes = await createNotionSchedule({
          product_name: planProduct,
          plan_date: selectedDateForPlan,
          quantity: planQty,
          note: planNote
        }, { apiKey: notionApiKey, databaseId: notionDatabaseId });

        if (notionRes.success && notionRes.pageId) {
          notionPageId = notionRes.pageId;
        }
      }

      const { data, error } = await supabase.from("production_schedules").insert([{
        product_name: planProduct,
        plan_date: selectedDateForPlan,
        quantity: planQty,
        note: planNote,
        notion_page_id: notionPageId
      }]).select();

      if (error) throw error;
      if (data) {
        setSchedules([...schedules, data[0]]);
        setPlanProduct("");
        setPlanQty("");
        setPlanNote("");
        setSelectedDateForPlan(null);
      }
    } catch (e: any) { alert("계획 등록 실패: " + e.message); }
  };

  const handleDeleteSchedule = async (id: number | string, notionPageId?: string) => {
    if (!window.confirm("해당 생산 계획을 삭제하시겠습니까?")) return;
    try {
      if (notionPageId) {
        await deleteNotionSchedule(notionPageId, { apiKey: notionApiKey, databaseId: notionDatabaseId });
      }
      const { error } = await supabase.from("production_schedules").delete().eq("id", id);
      if (error) throw error;
      setSchedules(schedules.filter(s => s.id !== id));
    } catch (e: any) { alert("계획 삭제 실패: " + e.message); }
  };

  const getNextQLot = async (targetDateStr: string) => {
    let datePrefix = "";
    if (targetDateStr) {
      datePrefix = targetDateStr.replace(/-/g, '').substring(2); 
    } else {
      const today = new Date();
      const offset = today.getTimezoneOffset() * 60000;
      const localToday = new Date(today.getTime() - offset);
      datePrefix = localToday.toISOString().split('T')[0].replace(/-/g, '').substring(2);
    }
    const { data, error } = await supabase.from('ecount_inventory').select('lot_no').like('lot_no', `${datePrefix}%`);
    if (error || !data || data.length === 0) return `${datePrefix}Q1`;
    let maxSeq = 0;
    data.forEach((item: any) => {
      const match = item.lot_no?.match(/Q(\d+)$/);
      if (match) {
        const seq = parseInt(match[1], 10);
        if (seq > maxSeq) maxSeq = seq;
      }
    });
    return `${datePrefix}Q${maxSeq + 1}`;
  };

  useEffect(() => {
    if (selectedProduct) getNextQLot(mfgDate).then(setPreviewLot);
    else setPreviewLot("");
  }, [selectedProduct, mfgDate]);

  useEffect(() => {
    async function loadData() {
      try {
        const result = await getDashboardItems();
        if (result && result.success && result.data) setItems(result.data);
        const recipeResult = await getRecipeList();
        if (recipeResult && recipeResult.success && recipeResult.data) setRecipeOptions(recipeResult.data);
      } catch (e) { console.error("데이터 로딩 에러:", e); }
      setLoading(false);
    }
    loadData(); 
  }, []);

  useEffect(() => {
    fetchScrapedItems();
  }, [filterStatus, filterDate]);

  const fetchScrapedItems = async () => {
    try {
      let query = supabase.from('ecount_inventory').select('*');
      if (filterStatus !== 'ALL') query = query.eq('status', filterStatus);
      if (filterDate !== 'ALL') {
        const now = new Date(); let pastDate = new Date();
        if (filterDate === 'TODAY') pastDate.setHours(0, 0, 0, 0);
        else if (filterDate === 'WEEK') pastDate.setDate(now.getDate() - 7);
        else if (filterDate === 'MONTH') pastDate.setMonth(now.getMonth() - 1);
        query = query.gte('created_at', pastDate.toISOString());
      }
      const { data, error = null } = await query.order('id', { ascending: false }).limit(3000); 
      if (error) throw error;
      if (data) {
        let formattedData = data.map((item: any) => {
          const timeString = item.created_at ? new Date(item.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : "새로 수집됨";
          return {
            id: item.id, scrapedAt: timeString, productName: item.item_name, cleanName: getCleanRecipeName(item.item_name), 
            lotNo: item.lot_no, expDate: item.expiry_date || "-", qty: item.quantity, status: item.status || "문서대기",
            mfgNo: item.mfg_no || "", mfgDate: item.mfg_date || new Date(item.created_at).toISOString().split('T')[0] 
          };
        });
        formattedData.sort((a, b) => {
          const lotA = a.lotNo || ""; const lotB = b.lotNo || "";
          if (lotA !== lotB) return lotB.localeCompare(lotA);
          return b.id - a.id;
        });
        setScrapedItems(formattedData);
      }
    } catch (error) { console.error("스크래핑 데이터 로딩 에러:", error); }
  };

  const handleFileUploadClick = () => { if (fileInputRef.current) fileInputRef.current.click(); };

  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setIsUploading(true);
    try {
      const parsedData = await parseEcountExcel(file);
      if (parsedData.length === 0) throw new Error("파싱된 데이터가 없습니다. 이카운트 표준 양식이 맞는지 확인하십시오.");
      const result = await syncExcelToSupabase(parsedData);
      if (!result.success) throw new Error(result.message);
      setLastSyncTime(new Date().toLocaleString('ko-KR'));
      alert(`시스템 동기화 완료: ${result.message}`);
      fetchScrapedItems(); 
    } catch (error: any) { alert(`동기화 실패: ${error.message}`); } finally {
      setIsUploading(false); if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleQuickProductionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct || !inputQty || !mfgNo || !mfgDate || !previewLot) { alert("품목, 제조번호, 제조일자, 생산량, LOT 번호를 모두 확인해 주십시오."); return; }
    const filteredHistory = mfgHistory.filter(item => item.mfgNo !== mfgNo);
    const newHistory = [{ mfgNo, mfgDate }, ...filteredHistory].slice(0, 3);
    setMfgHistory(newHistory); localStorage.setItem('mfgSetHistory', JSON.stringify(newHistory));
    try {
      const finalLot = previewLot;
      const calcExpDate = new Date(mfgDate); calcExpDate.setFullYear(calcExpDate.getFullYear() + 2);
      const finalExpStr = calcExpDate.toISOString().split('T')[0];
      const { error } = await supabase.from('ecount_inventory').insert([{
        item_name: selectedProduct, lot_no: finalLot, quantity: inputQty.replace(/,/g, ''),
        status: '문서대기', expiry_date: finalExpStr, mfg_no: mfgNo, mfg_date: mfgDate 
      }]);
      if (error) { alert(`저장 실패! 에러메시지: ${error.message}`); return; }
      alert(`[${getCleanRecipeName(selectedProduct)}] 생산 등록 완료. (소비기한: ${finalExpStr})`);
      setSelectedProduct(""); setInputQty(""); setMfgNo(""); setMfgDate(""); fetchScrapedItems(); 
    } catch (err) { alert("등록 중 오류가 발생했습니다."); }
  };

  const handleDownloadQCBatch = async (item: any) => {
    try {
      let currentLotNo = item.lotNo;
      if (/Q\d+$/.test(currentLotNo)) {
        const { data: collisionData } = await supabase.from('ecount_inventory').select('id').eq('lot_no', currentLotNo).neq('id', item.id);
        if (collisionData && collisionData.length > 0) {
          const newLotNo = await getNextQLot(item.mfgDate);
          const { error: updateError } = await supabase.from('ecount_inventory').update({ lot_no: newLotNo }).eq('id', item.id);
          if (updateError) throw updateError;
          currentLotNo = newLotNo; 
          alert(`로트번호 중복이 감지되어 [${newLotNo}]로 자동 재정렬 후 서류를 발급합니다.`);
          setScrapedItems(prev => prev.map(i => i.id === item.id ? { ...i, lotNo: newLotNo } : i));
        }
      }
      const isFrozen = ["냉동", "심냉", "Frozen"].some(keyword => item.productName.includes(keyword));
      const templateKey = analyzeItemTemplate(item.productName);
      const isSemiOrProduct = item.productName.startsWith('반)') || item.productName.startsWith('완)');

      const generateStandardDocs = async () => {
        const docTypes = ['log', 'instruction', 'report', 'label'];
        if (isSemiOrProduct) docTypes.push('request');
        for (const type of docTypes) {
          const response = await fetch('/api/generate-qc-doc', { 
            method: 'POST', headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ 
              productName: item.cleanName, lotNo: currentLotNo, testDate: item.mfgDate, mfgDate: item.mfgDate, 
              expiryDate: item.expDate, qty: item.qty, mfgNo: item.mfgNo, docType: type, templateKey: templateKey 
            }), 
          });
          if (!response.ok) { alert(`[알림] 양식 파일이 서버에 없어 건너뜁니다.`); continue; }
          const blob = await response.blob(); const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a'); a.href = url; a.download = `${type}_${currentLotNo}.docx`; 
          document.body.appendChild(a); a.click(); a.remove(); window.URL.revokeObjectURL(url);
          await new Promise(res => setTimeout(res, 500));
        }
      };

      const updateStatusToComplete = async () => {
        const { error } = await supabase.from('ecount_inventory').update({ status: '승인/발급완료' }).eq('id', item.id);
        if (error) throw error;
        setScrapedItems(prev => prev.map(i => i.id === item.id ? { ...i, status: "승인/발급완료" } : i));
        alert(`[${currentLotNo}] 서류 일괄 생성이 완료되었습니다.`);
      };

      if (isFrozen) {
        const fileInput = document.createElement('input'); fileInput.type = 'file'; fileInput.multiple = true; fileInput.accept = 'image/*';
        fileInput.onchange = async (e: any) => {
          const files = Array.from(e.target.files).slice(0, 3) as File[]; 
          if (files.length === 0) { alert("냉동 원료 서류 작성을 위해 최소 1장의 사진이 필요합니다."); return; }
          await generateStandardDocs();
          const formData = new FormData();
          formData.append('productName', item.cleanName); formData.append('lotNo', currentLotNo);
          formData.append('receiptDate', new Date().toLocaleDateString('ko-KR')); formData.append('qty', item.qty);
          formData.append('expiryDate', item.expDate); files.forEach(file => { formData.append('images', file); });
          const frozenRes = await fetch('/api/generate-frozen-doc', { method: 'POST', body: formData, });
          if (frozenRes.ok) {
            const blob = await frozenRes.blob(); const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = `냉동원료_온도측정확인표_${currentLotNo}.docx`;
            document.body.appendChild(a); a.click(); a.remove(); window.URL.revokeObjectURL(url);
          }
          await updateStatusToComplete();
        };
        fileInput.click();
      } else {
        await generateStandardDocs();
        await updateStatusToComplete();
      }
    } catch (error) { alert("작업 처리 중 에러가 발생했습니다."); }
  };

  return (
    <div className="space-y-6 w-full max-w-full pb-20 mt-4 px-2">
      
      {/* 대시보드 상단 타이틀 & 그리드 스냅 토글 */}
      <div className="flex justify-between items-center pb-4 border-b border-gray-200">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <span>BEANSHEAL 통합 대시보드</span>
            <span className="text-xs bg-blue-100 text-blue-800 font-extrabold px-2.5 py-0.5 rounded border border-blue-200">이카운트 ERP 그리드 대시보드</span>
          </h2>
          <p className="text-sm text-gray-500 mt-1">💡 <strong>위치 이동:</strong> 상단 헤더(⣿ 아이콘) 드래그&드롭 | <strong>그리드 크기 조절:</strong> 우측 하단 <strong>⤡ 코너</strong>를 마우스로 끌면 칼럼/행 그리드 단위로 자석처럼 스냅 정렬됩니다!</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsGridSnapEnabled(!isGridSnapEnabled)}
            className={`px-3 py-2 text-xs font-bold rounded-lg border transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs ${
              isGridSnapEnabled
                ? "bg-blue-600 text-white border-blue-700 font-black"
                : "bg-white text-slate-600 border-slate-300 hover:bg-slate-100"
            }`}
            title="그리드 스냅(자석 정렬) 모드를 켜거나 끕니다"
          >
            <span>⚡</span>
            <span>그리드 스냅: {isGridSnapEnabled ? "ON (자석 정렬)" : "OFF (자유 정렬)"}</span>
          </button>

          <button
            onClick={resetWidgetLayout}
            className="bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold px-3 py-2 rounded-lg border border-slate-300 transition-colors shadow-2xs cursor-pointer flex items-center gap-1.5"
            title="기본 배치 및 크기로 초기화"
          >
            <span>🔄</span>
            <span>배치 초기화</span>
          </button>
        </div>
      </div>

      {/* 동적 커스텀 그리드 영역 */}
      <div 
        id="dashboard-container" 
        className={`flex flex-wrap gap-5 w-full mb-6 relative transition-all duration-200 ${
          (resizingWidgetId || draggedWidgetId) 
            ? "bg-[radial-gradient(#94a3b8_1.5px,transparent_1.5px)] [background-size:24px_24px] bg-slate-50/90 p-3 rounded-2xl border-2 border-dashed border-blue-400 shadow-inner" 
            : ""
        }`}
      >
        {widgetConfigs.map((widget) => {
          const isDraggingThis = draggedWidgetId === widget.id;
          const isTargetedHover = dropTargetWidgetId === widget.id;

          const sourceIdx = widgetConfigs.findIndex(w => w.id === draggedWidgetId);
          const targetIdx = widgetConfigs.findIndex(w => w.id === widget.id);
          const isMovingRight = sourceIdx < targetIdx;

          let dragVisualClass = "";
          if (isDraggingThis) {
            dragVisualClass = "opacity-30 scale-95 border-2 border-dashed border-blue-500 shadow-inner z-0";
          } else if (isTargetedHover) {
            dragVisualClass = isMovingRight
              ? "shadow-[6px_0_0_0_#2563eb] -translate-x-2.5 z-10" 
              : "shadow-[-6px_0_0_0_#2563eb] translate-x-2.5 z-10"; 
          }

          const renderWidgetDragHeader = () => (
            <div 
              draggable={true}
              onDragStart={(e) => handleWidgetDragStart(e, widget.id)}
              onDragEnd={handleWidgetDragEnd}
              className="bg-slate-100 border-b border-slate-200 px-3.5 py-2 flex justify-between items-center text-xs text-slate-700 font-bold rounded-t-lg select-none cursor-grab active:cursor-grabbing hover:bg-slate-200/80 transition-colors gap-2"
              title="이 곳을 잡고 드래그하여 상하좌우 다른 카드 위치로 이동하세요"
            >
              <div className="flex items-center gap-2 text-slate-700 shrink-0">
                <span className="text-lg leading-none font-black text-slate-400">⣿</span>
                <span className="font-extrabold text-sm">{widget.title}</span>
              </div>
            </div>
          );

          const renderCornerResizeHandle = () => (
            <>
              {resizingWidgetId === widget.id && (
                <div className="absolute top-3 left-1/2 -translate-x-1/2 z-40 bg-slate-900 text-white font-mono text-xs font-bold px-3 py-1.5 rounded-full shadow-xl border border-blue-400 flex items-center gap-2 animate-bounce">
                  <span className="text-amber-400 font-black">⚡ 그리드 스냅:</span>
                  <span>{widget.widthPct}% × {widget.heightPx}px</span>
                </div>
              )}
              <div
                onMouseDown={(e) => startCornerResize(e, widget.id)}
                className="absolute bottom-0 right-0 z-20 w-7 h-7 bg-slate-200/90 hover:bg-blue-600 hover:text-white text-slate-700 rounded-tl-lg cursor-nwse-resize flex items-center justify-center font-black text-sm select-none shadow-md border-t border-l border-slate-300 transition-colors"
                title="마우스로 잡고 우측/아래로 끌면 칼럼 및 행 그리드에 맞춰 자석처럼 스냅 정렬됩니다"
              >
                ⤡
              </div>
            </>
          );

          const cardStyle = {
            flex: `1 1 calc(${widget.widthPct}% - 14px)`,
            maxWidth: `calc(${widget.widthPct}% - 14px)`,
            minWidth: '300px',
            height: `${widget.heightPx}px`,
          };

          {/* Widget 1: 월간 생산 계획표 (Calendar) */}
          if (widget.id === "calendar") {
            return (
              <div 
                key={widget.id} 
                onDragOver={(e) => handleWidgetDragOver(e, widget.id)}
                onDragLeave={handleWidgetDragLeave}
                onDrop={(e) => handleWidgetDrop(e, widget.id)}
                style={cardStyle}
                className={`transition-all duration-300 ease-in-out rounded-lg ${dragVisualClass}`}
              >
                <div className="bg-white border border-gray-200 rounded-lg shadow-sm flex flex-col h-full overflow-hidden relative">
                  {renderWidgetDragHeader()}
                  <div className="p-6 flex flex-col flex-1">
                    <div className="flex justify-between items-center mb-4 border-b border-gray-100 pb-3">
                      <div className="flex items-center gap-3">
                        <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                          월간 생산 계획표
                        </h3>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={handleNotionSync}
                            disabled={isSyncingNotion}
                            className="bg-slate-900 text-white hover:bg-slate-800 px-2.5 py-1 text-xs font-bold rounded flex items-center gap-1.5 transition-all shadow-sm cursor-pointer disabled:opacity-50"
                            title="노션 데이터베이스와 2way 동기화"
                          >
                            {isSyncingNotion ? (
                              <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
                            ) : (
                              <span className="text-[11px]">📝</span>
                            )}
                            {isSyncingNotion ? "동기화 중..." : "노션 동기화"}
                          </button>
                          <button
                            onClick={() => setIsNotionModalOpen(true)}
                            className="bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300 px-2 py-1 text-xs font-bold rounded flex items-center gap-1 transition-colors cursor-pointer"
                            title="Notion API Key & Database ID 설정"
                          >
                            <svg className="w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                            연동 설정
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <button onClick={handlePrevMonth} className="p-1 hover:bg-gray-100 rounded text-gray-600 transition-colors cursor-pointer">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7"></path></svg>
                        </button>
                        <span className="text-sm font-extrabold text-gray-800">{year}년 {month + 1}월</span>
                        <button onClick={handleNextMonth} className="p-1 hover:bg-gray-100 rounded text-gray-600 transition-colors cursor-pointer">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path></svg>
                        </button>
                      </div>
                    </div>
                    
                    <div className="flex-1">
                      <div className="grid grid-cols-7 gap-1 text-center mb-2">
                        {['일', '월', '화', '수', '목', '금', '토'].map(day => (
                          <div key={day} className={`text-xs font-bold py-1 ${day === '일' ? 'text-red-500' : day === '토' ? 'text-blue-500' : 'text-gray-500'}`}>
                            {day}
                          </div>
                        ))}
                      </div>
                      <div className="grid grid-cols-7 gap-1.5 min-h-[270px]">
                        {daysArray.map((day, idx) => {
                          const isToday = day === new Date().getDate() && month === new Date().getMonth() && year === new Date().getFullYear();
                          const cellDateStr = day ? formatDateString(year, month, day) : null;
                          
                          const normalizeDateStr = (d?: string) => d ? String(d).split("T")[0].trim() : "";
                          const daySchedules = cellDateStr ? schedules.filter(s => normalizeDateStr(s.plan_date) === cellDateStr) : [];
                          const maxVisible = 2;
                          const visibleSchedules = daySchedules.slice(0, maxVisible);
                          const extraCount = daySchedules.length - maxVisible;

                          return (
                            <div 
                              key={idx} 
                              onClick={() => cellDateStr && setSelectedDateForPlan(cellDateStr)}
                              onDragOver={(e) => {
                                if (draggedSchedule) {
                                  e.preventDefault();
                                }
                              }}
                              onDrop={(e) => {
                                if (draggedSchedule && cellDateStr) {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleDropOnCell(e, cellDateStr);
                                }
                              }}
                              className={`border border-gray-200 p-1 flex flex-col justify-start items-start relative min-h-[62px] ${
                                day ? 'bg-white hover:bg-indigo-50 cursor-pointer shadow-2xs' : 'bg-gray-50'
                              } transition-colors rounded overflow-hidden`}
                            >
                              {day && (
                                <>
                                  <div className="w-full flex justify-between items-center mb-0.5">
                                    <span className={`text-[11px] font-bold ${isToday ? 'bg-indigo-600 text-white px-1.5 rounded shadow-xs' : 'text-gray-600 ml-1'}`}>
                                      {day}
                                    </span>
                                  </div>

                                  <div className="w-full space-y-0.5 mt-0.5 flex-1">
                                    {visibleSchedules.map(sch => (
                                      <div 
                                        key={sch.id} 
                                        draggable={true}
                                        onDragStart={(e) => {
                                          e.stopPropagation();
                                          handleDragStart(e, sch);
                                        }}
                                        className={`text-[9px] px-1 py-0.5 rounded truncate font-medium border flex items-center justify-between gap-0.5 cursor-grab active:cursor-grabbing hover:scale-105 transition-transform ${
                                          sch.notion_page_id
                                            ? "bg-slate-100 text-slate-900 border-slate-300 font-bold"
                                            : "bg-blue-100 text-blue-800 border-blue-200"
                                        }`} 
                                        title={`${sch.product_name} (${sch.quantity}) ${sch.notion_page_id ? '[Notion 연동]' : ''}`}
                                      >
                                        <span className="truncate">{sch.product_name}</span>
                                        {sch.notion_page_id && <span className="text-[8px] text-slate-500 bg-slate-200 px-0.5 rounded shrink-0 font-extrabold">N</span>}
                                      </div>
                                    ))}
                                    {extraCount > 0 && (
                                      <div className="text-[9px] text-indigo-600 font-bold text-center bg-indigo-50 rounded py-0.5">
                                        +{extraCount}개
                                      </div>
                                    )}
                                  </div>
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                  {renderCornerResizeHandle()}
                </div>
              </div>
            );
          }

          {/* Widget 2: 실시간 특이사항 및 메모 (Memo) */}
          if (widget.id === "memo") {
            return (
              <div 
                key={widget.id} 
                onDragOver={(e) => handleWidgetDragOver(e, widget.id)}
                onDragLeave={handleWidgetDragLeave}
                onDrop={(e) => handleWidgetDrop(e, widget.id)}
                style={cardStyle}
                className={`transition-all duration-300 ease-in-out rounded-lg ${dragVisualClass}`}
              >
                <div className="bg-white border border-gray-200 rounded-lg shadow-sm flex flex-col h-full overflow-hidden relative">
                  {renderWidgetDragHeader()}
                  <div className="p-6 flex flex-col flex-1 overflow-hidden">
                    {selectedDateForPlan ? (
                      <div className="flex flex-col h-full">
                        <div className="flex justify-between items-center mb-4 border-b border-gray-100 pb-3">
                          <h3 className="text-sm font-bold text-indigo-700 flex items-center gap-2">
                            <span className="bg-indigo-100 p-1 rounded"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg></span>
                            {selectedDateForPlan} 계획 등록
                          </h3>
                          <button onClick={() => setSelectedDateForPlan(null)} className="text-xs text-gray-400 hover:text-gray-700 font-bold cursor-pointer">닫기</button>
                        </div>

                        <div className="flex-1 overflow-y-auto mb-3 space-y-2 pr-1">
                          {schedules.filter(s => (s.plan_date ? String(s.plan_date).split("T")[0].trim() : "") === selectedDateForPlan).length === 0 && (
                            <p className="text-xs text-gray-400 text-center py-4">등록된 계획이 없습니다.</p>
                          )}
                          {schedules.filter(s => (s.plan_date ? String(s.plan_date).split("T")[0].trim() : "") === selectedDateForPlan).map(sch => (
                            <div key={sch.id} className="p-2 border border-blue-100 bg-blue-50 rounded text-xs relative group flex justify-between items-center">
                              <div>
                                <div className="flex items-center gap-1">
                                  <p className="font-bold text-blue-900">{sch.product_name}</p>
                                  {sch.notion_page_id && <span className="text-[9px] font-extrabold text-slate-600 bg-slate-200 px-1 py-0.5 rounded">Notion</span>}
                                </div>
                                <p className="text-blue-700 font-medium mt-0.5">목표: {sch.quantity}</p>
                              </div>
                              <button onClick={() => handleDeleteSchedule(sch.id, sch.notion_page_id)} className="text-blue-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity p-1 cursor-pointer">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                              </button>
                            </div>
                          ))}
                        </div>

                        <form onSubmit={handleAddSchedule} className="space-y-3 pt-3 border-t border-gray-100">
                          <div>
                            <select value={planProduct} onChange={(e) => setPlanProduct(e.target.value)} className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 bg-white text-gray-800 shadow-sm focus:ring-1 focus:ring-indigo-500">
                              <option value="">품목 선택</option>
                              {recipeOptions.map((recipe) => (
                                <optgroup key={recipe.id} label={recipe.product_name}>
                                  <option value={`반)${recipe.product_name}`}>반) {recipe.product_name}</option>
                                  <option value={`완)${recipe.product_name}`}>완) {recipe.product_name}</option>
                                </optgroup>
                              ))}
                            </select>
                          </div>
                          <div className="flex gap-2">
                            <input type="text" value={planQty} onChange={(e) => setPlanQty(e.target.value)} placeholder="수량 입력" className="w-1/2 text-xs border border-gray-300 rounded px-2 py-1.5 bg-white shadow-sm focus:ring-1 focus:ring-indigo-500 text-black" />
                            <button type="submit" className="w-1/2 bg-indigo-600 text-white text-xs font-bold rounded shadow-sm hover:bg-indigo-700 transition-colors cursor-pointer">추가하기</button>
                          </div>
                          <div className="flex items-center gap-1.5 pt-1">
                            <input
                              type="checkbox"
                              id="syncToNotion"
                              checked={syncToNotionChecked}
                              onChange={(e) => setSyncToNotionChecked(e.target.checked)}
                              className="w-3.5 h-3.5 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
                            />
                            <label htmlFor="syncToNotion" className="text-[11px] font-semibold text-gray-600 cursor-pointer select-none">
                              📝 노션(Notion)에도 동기화 등록
                            </label>
                          </div>
                        </form>
                      </div>
                    ) : (
                      <>
                        <div className="flex justify-between items-center mb-4 border-b border-gray-100 pb-3">
                          <h3 className="text-lg font-bold text-gray-900">실시간 특이사항 및 메모</h3>
                          <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded border border-indigo-100">Live Board</span>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto space-y-3 pr-1 mb-4 h-[230px]">
                          {memos.map((memo) => (
                            <div key={memo.id} className="p-3 border border-gray-100 rounded-lg bg-gray-50 shadow-sm relative group">
                              <p className="text-sm font-bold text-gray-800 break-keep pr-6">{memo.text}</p>
                              <div className="flex justify-between items-center mt-2">
                                <span className="text-[10px] text-gray-400 font-bold">{memo.date}</span>
                                <span className="text-[10px] font-bold text-gray-500 bg-gray-200 px-1.5 py-0.5 rounded">{memo.author}</span>
                              </div>
                              <button onClick={() => handleDeleteMemo(memo.id)} className="absolute top-3 right-3 text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer" title="메모 삭제">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                              </button>
                            </div>
                          ))}
                          {memos.length === 0 && <div className="text-center py-16 text-gray-400 text-sm font-medium">등록된 특이사항이 없습니다.</div>}
                        </div>

                        <form onSubmit={handleAddMemo} className="pt-3 border-t border-gray-200 flex gap-2">
                          <input type="text" value={newMemo} onChange={(e) => setNewMemo(e.target.value)} placeholder="공유할 메모를 입력하십시오" className="flex-1 text-sm border border-gray-300 rounded px-3 py-2 bg-white text-gray-800 shadow-sm focus:ring-1 focus:ring-indigo-500" />
                          <button type="submit" className="bg-slate-800 text-white px-3 py-2 text-sm font-bold rounded shadow-sm hover:bg-slate-700 transition-colors cursor-pointer">등록</button>
                        </form>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          }

          {/* Widget 3: 실적 즉시 등록 (Quick Production) */}
          if (widget.id === "quickProduction") {
            return (
              <div 
                key={widget.id} 
                onDragOver={(e) => handleWidgetDragOver(e, widget.id)}
                onDragLeave={handleWidgetDragLeave}
                onDrop={(e) => handleWidgetDrop(e, widget.id)}
                style={cardStyle}
                className={`transition-all duration-300 ease-in-out rounded-lg ${dragVisualClass}`}
              >
                <div className="bg-white border border-gray-300 rounded-lg shadow-sm flex flex-col h-full overflow-hidden relative">
                  {renderWidgetDragHeader()}
                  <div className="p-5">
                    <h3 className="text-md font-bold text-gray-900 mb-4 border-b border-gray-200 pb-2">반제품 / 완제품 실적 즉시 등록 (주간 제조세트 연동)</h3>
                    <form onSubmit={handleQuickProductionSubmit} className="grid grid-cols-6 gap-3 items-end">
                      <div className="flex flex-col">
                        <label className="text-xs font-bold text-gray-600 mb-1">품목 선택</label>
                        <select 
                          value={selectedProduct} 
                          onChange={(e) => setSelectedProduct(e.target.value)}
                          className="text-sm border border-gray-300 rounded px-3 py-2 bg-white font-medium text-gray-700 shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                        >
                          <option value="">품목을 선택하십시오</option>
                          {recipeOptions.map((recipe) => (
                            <optgroup key={recipe.id} label={`[ 레시피 ] ${recipe.product_name}`}>
                              <option value={`반)${recipe.product_name}`}>반) {recipe.product_name} (반제품)</option>
                              <option value={`완)${recipe.product_name}`}>완) {recipe.product_name} (완제품)</option>
                            </optgroup>
                          ))}
                        </select>
                      </div>

                      <div className="flex flex-col">
                        <label className="text-xs font-bold text-gray-600 mb-1">LOT 번호 (자동/수정)</label>
                        <input 
                          type="text" 
                          value={previewLot}
                          onChange={(e) => setPreviewLot(e.target.value)}
                          placeholder="직접 수정 가능"
                          className="text-sm border border-gray-300 rounded px-3 py-2 bg-white text-gray-700 shadow-sm font-mono font-bold focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </div>

                      <div className="flex flex-col">
                        <label className="text-xs font-bold text-gray-600 mb-1">제조번호 (선택/입력)</label>
                        <input 
                          type="text" 
                          list="mfg-history-list"
                          value={mfgNo}
                          onChange={(e) => handleMfgNoChange(e.target.value)}
                          placeholder="입력 또는 클릭"
                          className="text-sm border border-gray-300 rounded px-3 py-2 bg-white text-gray-700 shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 font-bold"
                        />
                        <datalist id="mfg-history-list">
                          {mfgHistory.map((item, index) => <option key={index} value={item.mfgNo}>{item.mfgNo} ({item.mfgDate})</option>)}
                        </datalist>
                      </div>

                      <div className="flex flex-col">
                        <label className="text-xs font-bold text-gray-600 mb-1">제조일자</label>
                        <input 
                          type="date" 
                          value={mfgDate}
                          onChange={(e) => setMfgDate(e.target.value)}
                          className="text-sm border border-gray-300 rounded px-3 py-2 bg-white text-gray-700 shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 font-medium"
                        />
                      </div>

                      <div className="flex flex-col">
                        <label className="text-xs font-bold text-gray-600 mb-1">생산 수량</label>
                        <input 
                          type="text" 
                          value={inputQty}
                          onChange={handleQtyChange}
                          placeholder="숫자 (예: 1,500)"
                          className="text-sm border border-gray-300 rounded px-3 py-2 bg-white text-gray-700 shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </div>

                      <button 
                        type="submit"
                        className="bg-blue-600 text-white text-sm px-4 py-2 font-bold rounded shadow-sm hover:bg-blue-700 transition-colors h-[38px]"
                      >
                        대기열 등록
                      </button>
                    </form>
                  </div>
                  {renderCornerResizeHandle()}
                </div>
              </div>
            );
          }

          {/* Widget 4: 동기화 로트 테이블 (Lot Table) */}
          if (widget.id === "lotTable") {
            return (
              <div 
                key={widget.id} 
                onDragOver={(e) => handleWidgetDragOver(e, widget.id)}
                onDragLeave={handleWidgetDragLeave}
                onDrop={(e) => handleWidgetDrop(e, widget.id)}
                style={cardStyle}
                className={`transition-all duration-300 ease-in-out rounded-lg ${dragVisualClass}`}
              >
                <div className="bg-white border border-gray-300 rounded-lg shadow-sm flex flex-col h-full overflow-hidden relative">
                  {renderWidgetDragHeader()}
                  <div>
                    <div className="bg-white text-gray-900 px-5 py-3 flex justify-between items-center border-b border-gray-200">
                      <div className="flex Handicap items-center gap-2">
                        <h3 className="font-bold text-lg">데이터 동기화 및 관리열 (수동 하이브리드)</h3>
                      </div>
                      
                      <div className="flex items-center gap-4">
                        <div className="text-xs text-gray-500 flex flex-col text-right">
                          <span className="font-bold">마지막 동기화</span>
                          <span className="font-mono text-blue-600">{lastSyncTime}</span>
                        </div>
                        
                        <input 
                          type="file" 
                          accept=".xlsx, .xls" 
                          ref={fileInputRef} 
                          onChange={handleExcelUpload} 
                          className="hidden" 
                        />
                        <button 
                          onClick={handleFileUploadClick} 
                          disabled={isUploading}
                          className={`text-sm px-4 py-2 rounded font-bold border shadow-sm transition-colors flex items-center gap-2 ${
                            isUploading 
                              ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed' 
                              : 'bg-gray-800 text-white border-gray-700 hover:bg-gray-700'
                          }`}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path></svg>
                          {isUploading ? "데이터 처리 중..." : "이카운트 엑셀 업로드"}
                        </button>
                      </div>
                    </div>

                    <div className="bg-gray-50 px-5 py-3 border-b border-gray-200 flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        <div className="flex flex-col">
                          <label className="text-[10px] font-bold text-gray-500 mb-1 uppercase tracking-wider">진행 상태</label>
                          <select 
                            value={filterStatus} 
                            onChange={(e) => setFilterStatus(e.target.value)}
                            className="text-sm border border-gray-300 rounded px-2 py-1.5 bg-white font-medium text-gray-700 shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                          >
                            <option value="ALL">전체 보기</option>
                            <option value="문서대기">문서대기 (미승인)</option>
                            <option value="승인/발급완료">승인 및 발급완료</option>
                          </select>
                        </div>
                        <div className="flex flex-col">
                          <label className="text-[10px] font-bold text-gray-500 mb-1 uppercase tracking-wider">조회 기간</label>
                          <select 
                            value={filterDate} 
                            onChange={(e) => setFilterDate(e.target.value)}
                            className="text-sm border border-gray-300 rounded px-2 py-1.5 bg-white font-medium text-gray-700 shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                          >
                            <option value="ALL">전체 기간</option>
                            <option value="TODAY">오늘 입고분</option>
                            <option value="WEEK">최근 1주일</option>
                            <option value="MONTH">최근 1개월</option>
                          </select>
                        </div>
                      </div>
                      <div className="text-sm text-gray-500">
                        전체 관리 로트 <span className="font-bold text-blue-600">{scrapedItems.length}</span> 건 
                        <span className="text-xs ml-1 text-gray-400">(화면에는 최근 20건만 표시됩니다)</span>
                      </div>
                    </div>

                    <div className="p-0 overflow-x-auto">
                      <table className="w-full text-left text-sm whitespace-nowrap border-collapse">
                        <thead className="bg-gray-100 text-gray-700">
                          <tr>
                            <th className="p-3 border-b border-gray-300 font-semibold text-center w-24">수집/동기화 시간</th>
                            <th className="p-3 border-b border-gray-300 font-semibold">품목명</th>
                            <th className="p-3 border-b border-gray-300 font-semibold">LOT 번호</th>
                            <th className="p-3 border-b border-gray-300 font-semibold">소비기한</th>
                            <th className="p-3 border-b border-gray-300 font-semibold text-center w-28">상태</th>
                            <th className="p-3 border-b border-gray-300 font-bold text-center w-48">관리자 승인</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {scrapedItems.slice(0, 100).map((item, idx) => (
                            <tr key={idx} className={`transition-colors ${item.status === '문서대기' ? 'bg-white hover:bg-blue-50' : 'bg-gray-50'}`}>
                              <td className="p-3 text-gray-500 font-mono text-center text-xs">{item.scrapedAt}</td>
                              <td className="p-3 font-bold text-gray-900">{item.cleanName}</td>
                              <td className="p-3 text-blue-700 font-mono font-bold">{item.lotNo}</td>
                              <td className="p-3 text-gray-600">{item.expDate}</td>
                              <td className="p-3 text-center">
                                <span className={`px-2.5 py-1 rounded text-xs font-bold border ${item.status === '문서대기' ? 'bg-orange-100 text-orange-800 border-orange-200' : 'bg-green-100 text-green-800 border-green-200'}`}>
                                  {item.status}
                                </span>
                              </td>
                              <td className="p-3 text-center">
                                {item.status === '문서대기' ? (
                                  <button 
                                    onClick={() => handleDownloadQCBatch(item)} 
                                    className="bg-blue-600 text-white text-xs px-4 py-2 font-bold rounded shadow-sm hover:bg-blue-700 transition-colors cursor-pointer"
                                  >
                                    검토 및 서류 발급
                                  </button>
                                ) : (
                                  <button 
                                    onClick={() => handleDownloadQCBatch(item)} 
                                    className="bg-gray-200 text-gray-500 text-xs px-4 py-2 font-bold rounded hover:bg-gray-300 transition-colors cursor-pointer"
                                  >
                                    서류 재발급
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                          {scrapedItems.length === 0 && (<tr><td colSpan={6} className="text-center py-12 text-gray-500 font-medium bg-gray-50">조건에 맞는 로트 데이터가 없습니다.</td></tr>)}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  {renderCornerResizeHandle()}
                </div>
              </div>
            );
          }

          return null;
        })}
      </div>

      {/* 노션 API 연동 설정 모달 */}
      {isNotionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="bg-white rounded-xl shadow-2xl border border-gray-200 w-full max-w-lg overflow-hidden flex flex-col">
            
            <div className="bg-slate-900 text-white px-6 py-4 flex justify-between items-center">
              <div className="flex items-center gap-2 font-bold text-base">
                <span className="text-xl">📝</span>
                <span>노션(Notion) 달력 API 연동 설정</span>
              </div>
              <button
                onClick={() => setIsNotionModalOpen(false)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-900 space-y-1.5">
                <p className="font-bold flex items-center gap-1">
                  💡 노션 API 연동 3단계 가이드
                </p>
                <ol className="list-decimal list-inside space-y-1 text-[11px] leading-relaxed text-blue-800">
                  <li>
                    <a href="https://www.notion.so/my-integrations" target="_blank" rel="noreferrer" className="underline font-bold hover:text-blue-900">Notion My Integrations</a>에 접속 후 새 통합 앱을 생성하여 <strong>API Key (Secret)</strong>를 복사합니다.
                  </li>
                  <li>
                    사용할 노션 달력 데이터베이스 페이지의 우측 상단 <strong>[...] ➔ 연결 추가 (Add connections)</strong>에서 생성한 통합을 선택합니다.
                  </li>
                  <li>
                    데이터베이스 페이지 URL에서 32자리 <strong>Database ID</strong>를 복사해 아래 입력란에 넣습니다.
                  </li>
                </ol>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-700 flex items-center justify-between">
                  <span>Notion API Key (Internal Integration Secret)</span>
                  <span className="text-[10px] text-gray-400 font-normal">ntn_... 또는 secret_...</span>
                </label>
                <input
                  type="password"
                  value={notionApiKey}
                  onChange={(e) => setNotionApiKey(e.target.value)}
                  placeholder="ntn_..."
                  className="w-full text-xs border border-gray-300 rounded-lg px-3 py-2 bg-white text-gray-900 focus:ring-2 focus:ring-slate-900 focus:outline-none font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-700 flex items-center justify-between">
                  <span>Notion Database ID</span>
                  <span className="text-[10px] text-gray-400 font-normal">URL의 32자리 문구</span>
                </label>
                <input
                  type="text"
                  value={notionDatabaseId}
                  onChange={(e) => setNotionDatabaseId(e.target.value)}
                  placeholder="예: c8e9a1b2c3d4e5f6a7b8c9d0e1f2a3b4"
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
                disabled={isTestingConn || !notionApiKey || !notionDatabaseId}
                className="bg-white border border-gray-300 hover:bg-gray-100 text-gray-700 text-xs font-bold px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50"
              >
                {isTestingConn ? "확인 중..." : "🔌 연결 테스트"}
              </button>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsNotionModalOpen(false)}
                  className="bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs font-bold px-4 py-2 rounded-lg transition-colors"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleSaveNotionConfig}
                  className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-5 py-2 rounded-lg transition-colors shadow-sm"
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
"use client";

import { useEffect, useState, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { getRecipeList } from "@/app/actions/recipe"; 
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

function ERPDashboard() {
  const { user } = useAuth();
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

  useEffect(() => {
    const savedLayout = localStorage.getItem("beansheal_widget_configs_v2");
    if (savedLayout) {
      try {
        const parsed = JSON.parse(savedLayout);
        const filtered = parsed.filter((w: any) => w.id === "calendar" || w.id === "memo");
        if (filtered.length > 0) setWidgetConfigs(filtered);
      } catch (e) {}
    }
  }, []);

  const saveWidgetConfigs = (newConfigs: typeof widgetConfigs) => {
    setWidgetConfigs(newConfigs);
    localStorage.setItem("beansheal_widget_configs_v2", JSON.stringify(newConfigs));
  };

  useEffect(() => {
    const initData = async () => {
      try {
        const recipeRes = await getRecipeList();
        if (recipeRes?.success && recipeRes.data) setRecipeOptions(recipeRes.data);

        const savedKey = localStorage.getItem("beansheal_notion_api_key");
        const savedDbId = localStorage.getItem("beansheal_notion_database_id");
        if (savedKey) setNotionApiKey(savedKey);
        if (savedDbId) setNotionDatabaseId(savedDbId);

        const savedMemos = localStorage.getItem("beansheal_memos");
        if (savedMemos) setMemos(JSON.parse(savedMemos));
        else {
          const defaultMemos = [
            { id: 1, text: "A라인 포장기 점검 예정 (14:00~15:00)", date: "오늘 10:30", author: "생산팀" },
            { id: 2, text: "유기농 야채원료 입고 검수 완료", date: "오늘 09:15", author: "품질팀" }
          ];
          setMemos(defaultMemos);
          localStorage.setItem("beansheal_memos", JSON.stringify(defaultMemos));
        }

        if (savedKey && savedDbId) {
          try {
            const notionRes = await fetchNotionSchedules({ apiKey: savedKey, databaseId: savedDbId });
            if (notionRes?.success && notionRes.data) {
              setSchedules(notionRes.data);
            }
          } catch (err) {
            console.error("노션 자동 갱신 오류:", err);
          }
        }
      } catch (e) {
        console.error(e);
      }
    };
    initData();
  }, []);

  const handleAddMemo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemo.trim()) return;

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    
    const formattedDate = `${year}-${month}-${day} ${hours}:${minutes}`;

    const item = {
      id: Date.now(),
      text: newMemo.trim(),
      date: formattedDate,
      author: user?.name || "사용자"
    };

    const updated = [item, ...memos];
    setMemos(updated);
    localStorage.setItem("beansheal_memos", JSON.stringify(updated));
    setNewMemo("");
  };

  const handleDeleteMemo = (id: number) => {
    const updated = memos.filter(m => m.id !== id);
    setMemos(updated);
    localStorage.setItem("beansheal_memos", JSON.stringify(updated));
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
      alert("품목과 목표 수량을 모두 입력해주세요.");
      return;
    }

    const localItem = {
      id: Date.now(),
      plan_date: selectedDateForPlan,
      product_name: planProduct,
      quantity: planQty
    };

    let notionPageId = undefined;

    if (syncToNotionChecked && notionApiKey && notionDatabaseId) {
      try {
        setIsSyncingNotion(true);
        const res = await createNotionSchedule(
          {
            plan_date: selectedDateForPlan,
            product_name: planProduct,
            quantity: planQty
          },
          { apiKey: notionApiKey, databaseId: notionDatabaseId }
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
  };

  const handleDeleteSchedule = async (id: number, notionPageId?: string) => {
    setSchedules((prev) => prev.filter((s) => s.id !== id));
    if (notionPageId && notionApiKey) {
      try {
        await deleteNotionSchedule(notionPageId, { apiKey: notionApiKey, databaseId: notionDatabaseId });
      } catch (e) {
        console.error(e);
      }
    }
  };

  const handleNotionSync = async () => {
    if (!notionApiKey || !notionDatabaseId) {
      setIsNotionModalOpen(true);
      return;
    }

    try {
      setIsSyncingNotion(true);
      const res = await fetchNotionSchedules({ apiKey: notionApiKey, databaseId: notionDatabaseId });
      if (res?.success && res.data) {
        setSchedules(res.data);
        alert(`성공적으로 노션 데이터(${res.data.length}건)를 동기화했습니다!`);
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
    if (!notionApiKey || !notionDatabaseId) return;
    setIsTestingConn(true);
    setTestStatusMsg("연결 테스트 중...");

    const res = await testNotionConnection({ apiKey: notionApiKey.trim(), databaseId: notionDatabaseId.trim() });
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
    if (draggedSchedule.plan_date === targetDateStr) return;

    const movingSch = draggedSchedule;
    setDraggedSchedule(null);

    setSchedules((prev) => {
      const updated = prev.map((item) =>
        item.id === movingSch.id || (movingSch.notion_page_id && item.notion_page_id === movingSch.notion_page_id)
          ? { ...item, plan_date: targetDateStr }
          : item
      );
      return updated;
    });

    if (movingSch.notion_page_id && notionApiKey) {
      try {
        await updateScheduleDate(movingSch.id, targetDateStr, movingSch.notion_page_id, { apiKey: notionApiKey, databaseId: notionDatabaseId });
      } catch (err) {
        console.error(err);
      }
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
      { id: "calendar", title: "월간 생산 계획표", widthPct: 65, heightPx: 480 },
      { id: "memo", title: "실시간 특이사항 & 메모", widthPct: 32, heightPx: 480 },
    ];
    saveWidgetConfigs(defaultConfig);
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

          /* Widget 1: 월간 생산 계획표 (Calendar) - 이카운트 ERP 룩앤필 */
          if (widget.id === "calendar") {
            const calendarHeaderLeft = (
              <div className="flex items-center gap-1 text-slate-800 text-xs font-bold">
                <button onClick={handlePrevMonth} className="p-0.5 hover:bg-slate-200 rounded text-slate-600 cursor-pointer">
                  ‹
                </button>
                <span className="font-extrabold font-mono">{year}/{String(month + 1).padStart(2, '0')}</span>
                <button onClick={handleNextMonth} className="p-0.5 hover:bg-slate-200 rounded text-slate-600 cursor-pointer">
                  ›
                </button>
                <span className="ml-1 text-slate-900 font-extrabold text-xs">일정관리</span>
              </div>
            );

            const calendarHeaderRight = (
              <button
                onClick={() => setIsNotionModalOpen(true)}
                className="text-slate-400 hover:text-slate-700 p-0.5 rounded transition-colors cursor-pointer"
                title="Notion API Key & Database ID 설정"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
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
                  {renderWidgetHeader(calendarHeaderLeft, calendarHeaderRight)}
                  <div className="p-3 flex flex-col flex-1 overflow-hidden">
                    <div className="flex-1 flex flex-col h-full min-h-0">
                      <div className="grid grid-cols-7 gap-1 text-center mb-1 bg-slate-50 py-1.5 border-b border-slate-200 rounded-t shrink-0">
                        {['일', '월', '화', '수', '목', '금', '토'].map(day => (
                          <div key={day} className={`text-[11px] font-extrabold ${day === '일' ? 'text-red-500' : day === '토' ? 'text-blue-500' : 'text-slate-600'}`}>
                            {day}
                          </div>
                        ))}
                      </div>
                      <div 
                        className="flex-1 min-h-0"
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
                          gridTemplateRows: `repeat(${Math.ceil(daysArray.length / 7)}, minmax(0, 1fr))`,
                          gap: '4px'
                        }}
                      >
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
                              className={`border border-slate-200 p-1 flex flex-col justify-start items-start relative h-full w-full ${
                                day ? 'bg-white hover:bg-indigo-50/60 shadow-2xs' : 'bg-slate-50/50'
                              } transition-colors rounded overflow-hidden`}
                            >
                              {day && (
                                <>
                                  <div className="w-full flex justify-between items-center mb-0.5">
                                    <span className={`text-[11px] font-extrabold ${isToday ? 'bg-indigo-600 text-white px-1.5 rounded shadow-xs' : 'text-slate-600 ml-0.5'}`}>
                                      {day}
                                    </span>
                                  </div>

                                  <div className="w-full space-y-0.5 mt-0.5 flex-1 min-h-0 overflow-y-auto">
                                    {visibleSchedules.map(sch => (
                                      <div 
                                        key={sch.id} 
                                        draggable={true}
                                        onDragStart={(e) => {
                                          e.stopPropagation();
                                          handleDragStart(e, sch);
                                        }}
                                        className={`text-[9px] px-1 py-0.5 rounded truncate font-medium border flex items-center justify-between gap-0.5 cursor-grab active:cursor-grabbing hover:scale-102 transition-transform ${
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
                  {renderCornerResizeHandles()}
                </div>
              </div>
            );
          }

          /* Widget 2: 실시간 특이사항 및 메모 (Memo) - 이카운트 ERP 룩앤필 */
          if (widget.id === "memo") {
            const memoHeaderLeft = (
              <span className="text-xs font-bold text-slate-900">Memo</span>
            );

            const memoHeaderRight = null;

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
                    <div className="flex-1 overflow-y-auto space-y-2 pr-1 mb-3">
                      {memos.map((memo) => (
                        <div key={memo.id} className="p-2.5 border border-gray-100 rounded-lg bg-gray-50 shadow-xs relative group">
                          <p className="text-xs font-bold text-gray-800 break-keep pr-6">{memo.text}</p>
                          <div className="flex justify-between items-center mt-1.5">
                            <span className="text-[10px] text-gray-400 font-bold">{memo.date}</span>
                            <span className="text-[10px] font-bold text-gray-500 bg-gray-200 px-1.5 py-0.5 rounded">{memo.author}</span>
                          </div>
                          <button onClick={() => handleDeleteMemo(memo.id)} className="absolute top-2.5 right-2.5 text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer" title="메모 삭제">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                          </button>
                        </div>
                      ))}
                      {memos.length === 0 && <div className="text-center py-12 text-gray-400 text-xs font-medium">등록된 특이사항이 없습니다.</div>}
                    </div>

                    <form onSubmit={handleAddMemo} className="pt-2 border-t border-gray-200 flex gap-2">
                      <input type="text" value={newMemo} onChange={(e) => setNewMemo(e.target.value)} placeholder="공유할 메모를 입력하십시오" className="flex-1 text-xs border border-gray-300 rounded px-2.5 py-1.5 bg-white text-gray-800 shadow-xs focus:ring-1 focus:ring-indigo-500" />
                      <button type="submit" className="bg-slate-800 text-white px-3 py-1.5 text-xs font-bold rounded shadow-xs hover:bg-slate-700 transition-colors cursor-pointer">등록</button>
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
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-900 space-y-1.5">
                <p className="font-bold flex items-center gap-1">
                  노션 API 연동 3단계 가이드
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

export default function MainPage() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white text-sm font-bold">
        로딩 중...
      </div>
    );
  }

  if (user) {
    return <ERPDashboard />;
  }

  return (
    <iframe
      src="/homepage.html"
      style={{
        width: "100vw",
        height: "100vh",
        border: "none",
        margin: 0,
        padding: 0,
        overflow: "hidden",
        display: "block",
      }}
      title="BEANSHEAL Customer Main Website"
    />
  );
}

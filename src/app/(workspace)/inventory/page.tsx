"use client"

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useCanEdit } from "@/hooks/useCanEdit";
import { saveProductionInboundToEcount } from "@/app/actions/ecount";
import { formatLastSyncedAt } from "@/lib/syncTime";
import { getSafetyStockConfigs, saveSafetyStockConfig, setAllSafetyStockToZero } from "@/app/actions/safetyStockActions";
import { getDefaultSafetyQty, checkIsLowStock } from "@/lib/safetyStockHelper";
import { saveItemMasterMapping } from "@/app/actions/itemMasterActions";
import EcountExcelUploadModal from "@/components/EcountExcelUploadModal";

/** 재고수량: 반올림/올림 절대 없음! 최소 3자리 고정 표시 및 4자리 이상 원본 100% 표시 */
function formatQty(value: number | string) {
  if (value === null || value === undefined || value === "") return "0.000";
  const str = String(value).trim().replace(/,/g, "");
  if (!str || str === "NaN") return "0.000";
  const num = Number(str);
  if (!Number.isFinite(num)) return "0.000";

  const parts = str.split(".");
  const intPart = Number(parts[0]).toLocaleString("ko-KR");
  
  if (parts.length === 1) {
    return `${intPart}.000`;
  }
  
  const decimalPart = parts[1];
  if (decimalPart.length < 3) {
    return `${intPart}.${decimalPart.padEnd(3, "0")}`;
  }
  
  return `${intPart}.${decimalPart}`;
}

export default function InventoryPage() {
  const { canEdit } = useCanEdit("inventory");
  const [inventory, setInventory] = useState<any[]>([]);
  const [loadingInv, setLoadingInv] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [scrapedItems, setScrapedItems] = useState<any[]>([]);
  const [currentDate, setCurrentDate] = useState("");
  
  // [신규 상태] 수량 0 숨기기 체크박스 상태 관리 (기본값: 체크됨)
  const [hideZeroQty, setHideZeroQty] = useState(true);
  const [showOnlyLowStock, setShowOnlyLowStock] = useState(false);
  const [safetyConfigs, setSafetyConfigs] = useState<Record<string, number>>({});
  const [fixieStatus, setFixieStatus] = useState<any>(null);
  const [fixieChecking, setFixieChecking] = useState(false);

  const handleCheckFixie = async () => {
    setFixieChecking(true);
    try {
      const res = await fetch("/api/debug-fixie");
      const data = await res.json();
      setFixieStatus(data);
      if (data.ecount_login_ok) {
        alert("Fixie + 이카운트 연동 정상입니다. 재고 동기화 버튼을 사용하세요.");
      } else if (data.outbound_ips?.length) {
        alert(
          `Fixie IP 확인됨: ${data.outbound_ips.join(", ")}\n\n이 IP들을 이카운트 ERP > API인증키발급 > IP등록에 추가한 뒤 다시 확인하세요.`
        );
      } else {
        alert(data.guide || data.error || "Fixie 설정을 확인하세요.");
      }
    } catch (e: any) {
      alert(e?.message || "Fixie 확인 중 오류");
    } finally {
      setFixieChecking(false);
    }
  };

  const handleEditSafetyStock = async (prodCd: string, prodNm: string, currentMinQty: number) => {
    const newVal = prompt(`[${prodNm}] 의 최소 안전재고 수량을 입력하십시오:`, String(currentMinQty));
    if (newVal === null) return;
    const num = Number(newVal);
    if (isNaN(num) || num < 0) {
      alert("올바른 수량을 입력하십시오.");
      return;
    }
    const nextConfigs = { ...safetyConfigs, [prodCd]: num };
    setSafetyConfigs(nextConfigs);
    if (typeof window !== "undefined") {
      localStorage.setItem("beansheal_safety_configs", JSON.stringify(nextConfigs));
    }
    const res = await saveSafetyStockConfig(prodCd, prodNm, num);
    if (res.success) {
      alert(`[${prodNm}] 안전재고 기준 수량이 ${num} (으)로 클라우드 DB에 성공적으로 영구 저장되었습니다.`);
    } else {
      alert(`[안내] 브라우저 로컬 캐시에 안전재고 기준이 보존되었습니다.`);
    }
  };

  const handleResetAllSafetyStockToZero = async () => {
    if (!confirm("모든 품목의 안전재고 기준을 0으로 일괄 저장하시겠습니까?")) return;
    setLoadingInv(true);
    try {
      const res = await setAllSafetyStockToZero();
      if (res.success) {
        if (typeof window !== "undefined") {
          localStorage.removeItem("beansheal_safety_configs");
        }
        setSafetyConfigs({});
        alert(`총 ${res.count || 0}개 품목의 안전재고 기준이 성공적으로 0으로 일괄 변경되었습니다!`);
        fetchInventory();
      } else {
        alert(`일괄 변경 실패: ${res.error}`);
      }
    } catch (e: any) {
      alert(`오류 발생: ${e.message}`);
    } finally {
      setLoadingInv(false);
    }
  };

  // 🌟 1클릭 품목명 마스터 영구 세팅 (이카운트 API 수량 자동 연동용)
  const handleEditItemName = async (prodCd: string, currentNm: string) => {
    const newVal = prompt(`[품목코드: ${prodCd}] 의 지정할 품목명을 입력하십시오:`, currentNm === prodCd ? "" : currentNm);
    if (newVal === null) return;
    const cleanNm = newVal.trim();
    if (!cleanNm) {
      alert("품목명을 정확히 입력하십시오.");
      return;
    }

    setInventory((prev) =>
      prev.map((i) => (i.prodCd === prodCd ? { ...i, prodNm: cleanNm } : i))
    );

    const res = await saveItemMasterMapping(prodCd, cleanNm);
    if (res.success) {
      alert(`[${prodCd}] ➔ [${cleanNm}] 품목명이 마스터 DB에 영구 세팅되었습니다!\n이후 이카운트 API 동기화 시 수량만 자동 갱신됩니다.`);
      fetchInventory();
    } else {
      alert(`저장 실패: ${res.error}`);
    }
  };

  // 생산입고 전표 입력 & 엑셀 모달
  const [isExcelModalOpen, setIsExcelModalOpen] = useState(false);
  const [isInboundModalOpen, setIsInboundModalOpen] = useState(false);
  const [inboundProdCd, setInboundProdCd] = useState("");
  const [inboundQty, setInboundQty] = useState(1);
  const [inboundWhCdF, setInboundWhCdF] = useState("100");
  const [inboundWhCdT, setInboundWhCdT] = useState("100");
  const [inboundSending, setInboundSending] = useState(false);
  const [inboundResult, setInboundResult] = useState<any>(null);
  const [syncingMaster, setSyncingMaster] = useState(false);

  const openInboundModal = (prodCd = "") => {
    setInboundProdCd(prodCd);
    setInboundQty(1);
    setInboundWhCdF("100");
    setInboundWhCdT("100");
    setInboundResult(null);
    setIsInboundModalOpen(true);
  };

  const handleSendInbound = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inboundProdCd.trim()) {
      alert("품목코드를 입력해주세요.");
      return;
    }
    if (inboundQty <= 0) {
      alert("수량은 1 이상이어야 합니다.");
      return;
    }

    setInboundSending(true);
    setInboundResult(null);
    try {
      const res = await saveProductionInboundToEcount({
        PROD_CD: inboundProdCd.trim(),
        QTY: inboundQty,
        WH_CD_F: inboundWhCdF.trim() || "100",
        WH_CD_T: inboundWhCdT.trim() || "100",
      });
      setInboundResult(res);
      if (res.success) {
        fetchInventory();
      }
    } catch (err: any) {
      setInboundResult({ success: false, error: err.message || "통신 오류 발생" });
    } finally {
      setInboundSending(false);
    }
  };

  const [rawLogModalData, setRawLogModalData] = useState<any>(null);

  const handleSyncMaster = async () => {
    if (
      !confirm(
        "이카ount 재고현황 엑셀 봇을 실행할까요?\n\n· GitHub 클라우드에서 자동 로그인 → 엑셀 다운 → DB 반영\n· 1~3분 후 새로고침\n· PC 설치 불필요"
      )
    )
      return;
    setSyncingMaster(true);
    try {
      const res = await fetch("/api/sync-inventory", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        if (data.synced_at) setLastSyncedAt(data.synced_at);
        alert(data.message || "봇 동기화를 시작했습니다.");
        if (data.mode === "api-fallback") fetchInventory();
      } else {
        setRawLogModalData({
          title: "재고 동기화 오류",
          error: data.message || data.error || "동기화 실패",
          rawResponse: data,
        });
        alert(data.message || data.error || "동기화에 실패했습니다.");
      }
    } catch (err: any) {
      setRawLogModalData({
        title: "재고 동기화 오류",
        error: err.message || "동기화 중 오류",
        rawResponse: { error: err.message || "네트워크/서버 통신 실패" },
      });
    } finally {
      setSyncingMaster(false);
    }
  };

  useEffect(() => {
    const today = new Date();
    const formattedDate = `${today.getFullYear()}/${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}`;
    setCurrentDate(formattedDate);
    // 로컬 캐시 즉시 반영 (화면 먼저 보여주기)
    if (typeof window !== "undefined") {
      const cached = localStorage.getItem("beansheal_safety_configs");
      if (cached) { try { setSafetyConfigs(JSON.parse(cached)); } catch {} }
    }
    fetchAll();
  }, []);

  // 모든 DB 쿼리를 병렬(Promise.all)로 한 번에 요청 → 총 왕복 1회로 단축
  const fetchAll = async () => {
    setLoadingInv(true);
    try {
      const [
        inventoryRes,
        scrapedRes,
        safetyRes,
      ] = await Promise.all([
        supabase
          .from('ecount_items')
          .select('prod_cd, prod_nm, total_qty, last_synced_at')
          .order('prod_cd', { ascending: true }),
        supabase
          .from('ecount_inventory')
          .select('item_name, lot_no, expiry_date, quantity')
          .order('created_at', { ascending: false })
          .limit(500),  // 3000 → 500 (화면 표시에 충분한 양)
        getSafetyStockConfigs(),
      ]);

      // 재고 마스터
      if (!inventoryRes.error && inventoryRes.data) {
        setInventory(inventoryRes.data.map((item: any) => ({
          prodCd: item.prod_cd,
          prodNm: item.prod_nm,
          qty: item.total_qty || 0,
        })));
        const latest = inventoryRes.data
          .map((item: any) => item.last_synced_at as string | null)
          .filter(Boolean)
          .sort()
          .pop();
        if (latest) setLastSyncedAt(latest);
      }

      // 로트 데이터
      if (!scrapedRes.error && scrapedRes.data) {
        setScrapedItems(scrapedRes.data.map((item: any) => ({
          productName: item.item_name,
          lotNo: item.lot_no,
          expDate: item.expiry_date || "-",
          qty: item.quantity,
        })));
      }

      // 안전재고 설정
      if (safetyRes.success && safetyRes.data) {
        setSafetyConfigs(safetyRes.data);
        if (typeof window !== "undefined") {
          localStorage.setItem("beansheal_safety_configs", JSON.stringify(safetyRes.data));
        }
      }
    } catch (e) {
      console.error("DB 재고 현황 로딩 에러:", e);
    } finally {
      setLoadingInv(false);
    }
  };

  // fetchInventory는 외부에서 호출되므로 fetchAll 로 위임
  const fetchInventory = fetchAll;

  // [수정] 검색어, 수량 0 숨기기, 안전재고 미달 필터링 동시 적용
  const filteredInventory = inventory.filter(item => {
    const matchesSearch = item.prodNm.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          item.prodCd.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesQty = hideZeroQty ? item.qty > 0 : true;

    const minQty = safetyConfigs[item.prodCd] ?? getDefaultSafetyQty(item.prodNm);
    const isLowStock = checkIsLowStock(item.qty, minQty);
    const matchesLowStock = showOnlyLowStock ? isLowStock : true;

    return matchesSearch && matchesQty && matchesLowStock;
  });

  const normalizeName = (name: string) => {
    if (!name) return "";
    return name
      .replace(/^[원부자반]\)\s*/, '') 
      .replace(/\[.*?\]/g, '')        
      .replace(/\s+/g, '')            
      .toLowerCase();                 
  };

  const getInventoryBreakdown = (prodNm: string, totalQtyStr: string | number) => {
    const totalQty = Number(String(totalQtyStr).replace(/,/g, ''));
    const targetCleanName = normalizeName(prodNm);

    const rawLots = scrapedItems.filter(lot => normalizeName(lot.productName) === targetCleanName);

    const uniqueLotsMap = new Map();
    rawLots.forEach(lot => {
      const lotKey = String(lot.lotNo || '').trim();
      if (!uniqueLotsMap.has(lotKey)) {
        uniqueLotsMap.set(lotKey, { ...lot, qty: Number(String(lot.qty).replace(/,/g, '')) });
      }
    });

    let matchingLots = Array.from(uniqueLotsMap.values()).sort((a, b) => {
      const lotA = String(a.lotNo || '').trim();
      const lotB = String(b.lotNo || '').trim();
      return lotB.localeCompare(lotA); 
    });
    
    let neededQty = totalQty;
    let finalLots = [];

    for (let i = 0; i < matchingLots.length; i++) {
      if (neededQty <= 0) break; 
      
      const lot = matchingLots[i];
      if (lot.qty <= neededQty) {
        finalLots.push(lot);
        neededQty = Math.round((neededQty - lot.qty) * 1000) / 1000;
      } else {
        finalLots.push({ ...lot, qty: neededQty });
        neededQty = 0;
      }
    }

    const unassignedQty = Math.max(Math.round(neededQty * 1000) / 1000, 0); 

    return { totalQty, matchingLots: finalLots, unassignedQty };
  };

  return (
    <div className="max-w-[1920px] mx-auto py-6 sm:py-8 md:py-10 px-2 sm:px-4 bg-[#f8f9fb] min-h-screen">
      
      <div className="mb-8">
        <div className="flex items-center justify-center gap-3 mb-2">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">재고현황</h1>
          {!canEdit && (
            <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2.5 py-1 rounded border border-amber-200 shadow-2xs">
              🔒 자재물류 부서 사원만 수정 가능 (조회 전용)
            </span>
          )}
        </div>
        <p className="text-center text-sm text-slate-500 mb-2">
          마지막 동기화: <span className="font-semibold text-slate-700">{formatLastSyncedAt(lastSyncedAt)}</span>
          {syncingMaster && <span className="ml-2 text-emerald-700 font-medium">봇 실행 중… (1~3분)</span>}
        </p>
        {canEdit && (
          <p className="text-center text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg max-w-2xl mx-auto px-3 py-2 mb-4">
            <strong>권장:</strong> 이카ount 재고현황 엑셀 →{" "}
            <button
              type="button"
              onClick={() => setIsExcelModalOpen(true)}
              className="underline font-bold hover:text-emerald-950 cursor-pointer"
            >
              엑셀 재고 반영
            </button>
            {" "}(소수점 100%). API 동기화는 정수만 반영됩니다.{" "}
            <Link href="/admin/ecount-bot" className="underline font-bold">
              봇 설정
            </Link>
          </p>
        )}

        {canEdit && (
          <div className="max-w-3xl mx-auto mb-6 rounded-lg border border-indigo-200 bg-indigo-50/80 px-4 py-3 text-sm text-slate-700">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="font-bold text-indigo-900">Fixie 고정 IP 연동</span>
                <span className="ml-2 text-xs text-slate-500">Vercel → Fixie → 이카운트</span>
              </div>
              <button
                type="button"
                onClick={handleCheckFixie}
                disabled={fixieChecking}
                className="text-xs font-bold text-indigo-800 bg-white border border-indigo-300 px-3 py-1.5 rounded hover:bg-indigo-100 disabled:opacity-50"
              >
                {fixieChecking ? "확인 중…" : "Fixie / IP 연결 확인"}
              </button>
            </div>
            {fixieStatus && (
              <div className="mt-2 text-xs space-y-1">
                <p>
                  상태:{" "}
                  <span className={fixieStatus.ecount_login_ok ? "text-emerald-700 font-bold" : "text-amber-800 font-bold"}>
                    {fixieStatus.ecount_login_ok ? "연동 정상" : fixieStatus.is_fixie_active ? "IP 등록 필요" : "FIXIE_URL 미설정"}
                  </span>
                </p>
                {fixieStatus.outbound_ips?.length > 0 && (
                  <p>
                    등록할 IP: <code className="bg-white px-1 rounded">{fixieStatus.outbound_ips.join(", ")}</code>
                  </p>
                )}
                {!fixieStatus.is_fixie_active && (
                  <div className="text-slate-600 space-y-1">
                    <p>
                      Fixie Apps에 앱이 없으면: Vercel Environment Variables에서 <strong>FIXIE_URL</strong> 삭제 → Fixie에서 Proxy 새로 만들기
                    </p>
                    <p>
                      <a className="underline text-indigo-700" href="https://vercel.com/integrations/fixie" target="_blank" rel="noreferrer">Fixie 연동</a>
                      {" · "}
                      production 체크가 회색이면 Vercel에 FIXIE_URL이 이미 있어서 충돌 중입니다.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-end mb-2">
          
          {/* [신규 UI] 수량 0 숨기기 & 안전재고 미달만 보기 체크박스 영역 */}
          <div className="flex items-center gap-4">
            <label className="flex items-center cursor-pointer hover:opacity-80 transition-opacity">
              <input 
                type="checkbox" 
                checked={hideZeroQty}
                onChange={(e) => setHideZeroQty(e.target.checked)}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
              />
              <span className="ml-2 text-sm font-medium text-gray-700 select-none">
                수량 0 숨기기
              </span>
            </label>

            <label className="flex items-center cursor-pointer hover:opacity-80 transition-opacity">
              <input 
                type="checkbox" 
                checked={showOnlyLowStock}
                onChange={(e) => setShowOnlyLowStock(e.target.checked)}
                className="w-4 h-4 text-amber-600 border-gray-300 rounded focus:ring-amber-500 cursor-pointer"
              />
              <span className="ml-2 text-sm font-bold text-amber-800 select-none">
                안전재고 미달만 보기
              </span>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <div className="relative w-full sm:w-auto order-1">
              <input
                type="text"
                placeholder="품목명/코드 검색"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="border-2 border-blue-500 text-gray-900 bg-white placeholder-gray-300 px-3 py-1.5 text-sm w-full sm:w-64 focus:outline-none focus:border-blue-600 shadow-sm"
              />
            </div>
            
            <button 
              onClick={fetchInventory} 
              disabled={loadingInv} 
              className="text-sm text-gray-700 bg-gray-100 border border-gray-300 px-4 py-1.5 hover:bg-gray-200 cursor-pointer order-2"
            >
              {loadingInv ? "조회중..." : "조회"}
            </button>

            <button
              onClick={() => openInboundModal("")}
              className="text-sm font-semibold text-white bg-blue-600 border border-blue-700 px-4 py-1.5 hover:bg-blue-700 transition-colors shadow-sm cursor-pointer order-3 sm:order-4"
            >
              생산입고 전표
            </button>

            {/* 모바일: 추가 작업 접이식 메뉴 */}
            <details className="md:hidden w-full order-4">
              <summary className="text-sm font-bold text-gray-700 bg-gray-100 border border-gray-300 px-4 py-2 cursor-pointer list-none flex items-center justify-between">
                추가 작업
                <span className="text-xs text-gray-400">▼</span>
              </summary>
              <div className="mt-2 flex flex-col gap-2 p-2 bg-white border border-gray-200 rounded-lg">
                <button
                  onClick={() => setIsExcelModalOpen(true)}
                  className="text-sm font-extrabold text-white bg-emerald-700 hover:bg-emerald-800 border border-emerald-800 px-4 py-2 transition-colors"
                >
                  엑셀 재고 반영
                </button>
                <button
                  onClick={handleSyncMaster}
                  disabled={syncingMaster}
                  className="text-sm font-bold text-blue-700 bg-blue-50 border border-blue-300 px-4 py-2 hover:bg-blue-100 disabled:opacity-50"
                >
                  {syncingMaster ? "봇 실행 중…" : "엑셀 봇 자동 동기화"}
                </button>
                <button
                  onClick={handleResetAllSafetyStockToZero}
                  disabled={loadingInv}
                  className="text-sm font-bold text-amber-800 bg-amber-50 border border-amber-300 px-4 py-2 hover:bg-amber-100 disabled:opacity-50"
                >
                  안전재고 전체 0 설정
                </button>
              </div>
            </details>

            <button
              onClick={() => setIsExcelModalOpen(true)}
              className="hidden md:flex text-sm font-extrabold text-white bg-emerald-700 hover:bg-emerald-800 border border-emerald-800 px-4 py-1.5 transition-colors shadow-sm cursor-pointer items-center gap-1.5"
            >
              <span>이카운트 엑셀 재고 반영 (100% 소수점)</span>
            </button>

            <button
              onClick={handleSyncMaster}
              disabled={syncingMaster}
              className="hidden md:inline-flex text-sm font-bold text-blue-700 bg-blue-50 border border-blue-300 px-4 py-1.5 hover:bg-blue-100 cursor-pointer disabled:opacity-50 shadow-2xs"
            >
              {syncingMaster ? "봇 실행 중…" : "엑셀 봇 자동 동기화"}
            </button>

            <button
              onClick={handleResetAllSafetyStockToZero}
              disabled={loadingInv}
              className="hidden md:inline-flex text-sm font-bold text-amber-800 bg-amber-50 border border-amber-300 px-4 py-1.5 hover:bg-amber-100 cursor-pointer shadow-2xs"
              title="모든 품목의 안전재고 기준 수량을 0으로 일괄 저장합니다"
            >
              안전재고 전체 0 설정
            </button>
            
            <span className="text-sm text-gray-800 font-mono w-full sm:w-auto sm:ml-2 order-5">{currentDate}</span>
          </div>
        </div>
      </div>

      {/* 모바일 카드 목록 */}
      <div className="md:hidden space-y-3 mb-4">
        {filteredInventory.map((item, idx) => {
          const breakdown = getInventoryBreakdown(item.prodNm, item.qty);
          const minQty = safetyConfigs[item.prodCd] ?? getDefaultSafetyQty(item.prodNm);
          const isLowStock = checkIsLowStock(breakdown.totalQty, minQty);

          return (
            <article
              key={`mobile-${idx}`}
              className={`bg-white border rounded-xl p-4 shadow-sm ${isLowStock ? "border-amber-300 bg-amber-50/40" : "border-gray-300"}`}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <button
                  type="button"
                  onClick={() => openInboundModal(item.prodCd)}
                  className="font-mono text-xs text-blue-600 font-bold hover:underline"
                >
                  {item.prodCd}
                </button>
                {isLowStock && (
                  <span className="px-2 py-0.5 bg-amber-600 text-white rounded text-[10px] font-extrabold shrink-0">
                    안전재고 미달
                  </span>
                )}
              </div>
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-gray-900 text-sm truncate">
                    {item.prodNm && item.prodNm !== item.prodCd ? item.prodNm : "(품목명 미지정)"}
                  </p>
                  <button
                    type="button"
                    onClick={() => handleEditItemName(item.prodCd, item.prodNm)}
                    className="mt-1 text-[11px] font-bold text-blue-600"
                  >
                    품목명 {(!item.prodNm || item.prodNm === item.prodCd) ? "등록" : "수정"}
                  </button>
                </div>
                <p className="font-extrabold text-lg text-gray-900 shrink-0">{formatQty(breakdown.totalQty)}</p>
              </div>
              <div className="flex items-center justify-between text-xs border-t border-gray-100 pt-2">
                <span className="text-gray-500">안전재고: <span className="font-mono font-bold">{formatQty(minQty)}</span></span>
                <button
                  onClick={() => handleEditSafetyStock(item.prodCd, item.prodNm, minQty)}
                  className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-[10px] font-bold border border-gray-300"
                >
                  기준 설정
                </button>
              </div>
              {breakdown.matchingLots.length > 0 && (
                <div className="mt-2 pt-2 border-t border-dashed border-gray-200 space-y-1">
                  {breakdown.matchingLots.map((lot, lotIdx) => (
                    <p key={lotIdx} className="text-[11px] text-gray-500">
                      LOT {lot.lotNo} · {lot.expDate} · {formatQty(lot.qty)}
                    </p>
                  ))}
                </div>
              )}
            </article>
          );
        })}
        {filteredInventory.length === 0 && !loadingInv && (
          <p className="text-center py-10 text-gray-500 text-sm">조회된 데이터가 없습니다.</p>
        )}
      </div>

      <div className="hidden md:block overflow-x-auto bg-[#f8f9fb]">
        <table className="w-full text-sm border-collapse border border-gray-300 table-fixed bg-[#f8f9fb]">
          
          <colgroup>
            <col className="w-[15%]" />
            <col className="w-[45%]" />
            <col className="w-[20%]" />
            <col className="w-[20%]" />
          </colgroup>

          <thead>
            <tr className="bg-[#f0f2f5]">
              <th className="border border-gray-300 py-2 text-center text-[#203366] font-bold text-[13px]">
                품목코드 <span className="text-[10px]">▼</span>
              </th>
              <th className="border border-gray-300 py-2 text-center text-[#203366] font-bold text-[13px]">
                품목명[규격] <span className="text-[10px]">▼</span>
              </th>
              <th className="border border-gray-300 py-2 text-center text-[#203366] font-bold text-[13px]">
                재고수량 <span className="text-[10px]">▼</span>
              </th>
              <th className="border border-gray-300 py-2 text-center text-[#203366] font-bold text-[13px]">
                안전재고 기준 / 상태
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredInventory.flatMap((item, idx) => {
              const breakdown = getInventoryBreakdown(item.prodNm, item.qty);
              const minQty = safetyConfigs[item.prodCd] ?? getDefaultSafetyQty(item.prodNm);
              const isLowStock = checkIsLowStock(breakdown.totalQty, minQty);
              const rows = [];

              rows.push(
                <tr key={`parent-${idx}`} className={`bg-[#f8f9fb] transition-colors ${isLowStock ? 'bg-amber-50/70 hover:bg-amber-100/80' : 'hover:bg-yellow-50'}`}>
                  <td className="border border-gray-300 px-2 py-1.5 text-[#203366] font-medium text-[13px] whitespace-nowrap overflow-hidden text-ellipsis text-center">
                    <span 
                      onClick={() => openInboundModal(item.prodCd)}
                      className="cursor-pointer hover:underline hover:text-blue-600 flex items-center justify-center gap-1.5"
                      title="클릭하여 생산입고 전표 입력"
                    >
                      {item.prodCd}
                      <span className="text-[9px] bg-emerald-50 text-emerald-700 px-1 py-0.5 rounded border border-emerald-200 font-bold tracking-tight scale-90">입고</span>
                    </span>
                  </td>
                  <td className="border border-gray-300 px-2 py-1.5 text-gray-900 text-[13px] whitespace-nowrap overflow-hidden text-ellipsis font-bold">
                    <div className="flex items-center justify-between gap-2">
                      {item.prodNm && item.prodNm !== item.prodCd ? (
                        <span>{item.prodNm}</span>
                      ) : (
                        <span className="text-amber-800 text-xs font-normal italic">
                          (품목명 미지정)
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={() => handleEditItemName(item.prodCd, item.prodNm)}
                        className={`px-2 py-0.5 rounded text-[11px] font-extrabold transition-all cursor-pointer border ${
                          !item.prodNm || item.prodNm === item.prodCd
                            ? "bg-blue-600 hover:bg-blue-700 text-white border-blue-700 shadow-2xs animate-pulse"
                            : "bg-gray-100 hover:bg-gray-200 text-gray-700 border-gray-300"
                        }`}
                        title="품목명 영구 지정 세팅"
                      >
                        {!item.prodNm || item.prodNm === item.prodCd ? "품목명 등록" : "수정"}
                      </button>
                    </div>
                  </td>
                  <td className="border border-gray-300 px-2 py-1.5 text-right font-bold text-[13px] text-gray-900">
                    {formatQty(breakdown.totalQty)}
                  </td>
                  <td className="border border-gray-300 px-2 py-1.5 text-center text-xs font-medium">
                    <div className="flex items-center justify-center gap-1.5">
                      <span className="font-mono font-bold text-gray-700">{formatQty(minQty)}</span>
                      <button
                        onClick={() => handleEditSafetyStock(item.prodCd, item.prodNm, minQty)}
                        className="px-1.5 py-0.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded text-[10px] font-bold transition-colors cursor-pointer border border-gray-300"
                        title="안전재고 임계값 변경"
                      >
                        설정
                      </button>
                      {isLowStock && (
                        <span className="px-1.5 py-0.5 bg-amber-600 text-white rounded text-[10px] font-extrabold animate-pulse">
                          미달
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              );

              breakdown.matchingLots.forEach((lot, lotIdx) => {
                rows.push(
                  <tr key={`child-${idx}-${lotIdx}`} className="bg-[#f8f9fb]">
                    <td className="border border-gray-300 px-2 py-1 text-center text-gray-300">
                    </td>
                    <td className="border border-gray-300 px-2 py-1 pl-6 text-gray-500 text-xs flex items-center gap-2 border-t-0 border-b-0">
                      <span className="text-gray-400">└</span>
                      <span>[LOT: {lot.lotNo}]</span>
                      <span className="text-gray-400">/ 소비기한: {lot.expDate}</span>
                    </td>
                    <td className="border border-gray-300 px-2 py-1 text-right text-gray-500 text-xs font-mono border-t-dashed">
                      {formatQty(lot.qty)}
                    </td>
                  </tr>
                );
              });

              if (breakdown.unassignedQty > 0 && breakdown.matchingLots.length > 0) {
                rows.push(
                  <tr key={`unassigned-${idx}`} className="bg-[#f8f9fb]">
                    <td className="border border-gray-300 px-2 py-1 text-center"></td>
                    <td className="border border-gray-300 px-2 py-1 pl-6 text-gray-500 text-xs flex items-center gap-2 border-t-0 border-b-0">
                      <span className="text-gray-400">└</span>
                      <span className="text-red-400">[미지정 재고]</span>
                    </td>
                    <td className="border border-gray-300 px-2 py-1 text-right text-red-400 text-xs font-mono border-t-dashed">
                      {formatQty(breakdown.unassignedQty)}
                    </td>
                  </tr>
                );
              }

              return rows;
            })}
            
            {filteredInventory.length === 0 && !loadingInv && (
              <tr>
                <td colSpan={3} className="border border-gray-300 bg-[#f8f9fb] text-center py-10 text-gray-500 text-sm">
                  조회된 데이터가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 이카운트 생산입고 전표 입력 */}
      {isInboundModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 font-sans">
          <div 
            className="bg-white rounded-2xl shadow-2xl border border-gray-100 w-full max-w-[500px] p-6 relative flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center border-b border-gray-100 pb-3 mb-4">
              <h3 className="text-lg font-bold text-gray-900">이카운트 생산입고 전표</h3>
              <button 
                type="button"
                onClick={() => setIsInboundModalOpen(false)}
                className="text-gray-400 hover:text-gray-700 p-1.5 rounded-full hover:bg-gray-100 transition-colors cursor-pointer"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSendInbound} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">
                  생산 완제품 품목코드 <span className="text-red-500">*</span>
                </label>
                <input 
                  type="text" 
                  value={inboundProdCd}
                  onChange={(e) => setInboundProdCd(e.target.value)}
                  placeholder="예: P00016"
                  className="w-full border-2 border-gray-200 text-gray-900 px-3 py-2 text-sm rounded-lg focus:outline-none focus:border-blue-500 transition-colors"
                  required
                />
                <p className="text-[10px] text-gray-400 mt-1">
                  품목코드의 [입고] 배지를 클릭하면 자동 입력됩니다. 마스터 등록/수정은 이카운트에서 하세요.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">
                    생산 수량 <span className="text-red-500">*</span>
                  </label>
                  <input 
                    type="number" 
                    value={inboundQty}
                    onChange={(e) => setInboundQty(Number(e.target.value))}
                    min={1}
                    className="w-full border-2 border-gray-200 text-gray-900 px-3 py-2 text-sm rounded-lg focus:outline-none focus:border-blue-500 transition-colors"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">생산된 공장</label>
                  <input 
                    type="text" 
                    value={inboundWhCdF}
                    onChange={(e) => setInboundWhCdF(e.target.value)}
                    placeholder="100"
                    className="w-full border-2 border-gray-200 text-gray-900 px-3 py-2 text-sm rounded-lg focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">받는 창고</label>
                  <input 
                    type="text" 
                    value={inboundWhCdT}
                    onChange={(e) => setInboundWhCdT(e.target.value)}
                    placeholder="100"
                    className="w-full border-2 border-gray-200 text-gray-900 px-3 py-2 text-sm rounded-lg focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>
              </div>

              {inboundSending && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-center">
                  <div className="inline-block animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600 mr-2 align-middle"></div>
                  <span className="text-xs text-blue-700 font-semibold align-middle">이카운트 전표 생성 중...</span>
                </div>
              )}

              {inboundResult && (
                <div className={`p-4 border rounded-xl text-xs space-y-1.5 ${
                  inboundResult.success 
                    ? "bg-green-50 border-green-200 text-green-800" 
                    : "bg-red-50 border-red-200 text-red-800"
                }`}>
                  <div className="font-bold text-sm">
                    {inboundResult.success ? "전송 성공" : "전송 실패"}
                  </div>
                  <p>{inboundResult.message || inboundResult.error}</p>
                  {inboundResult.slipNo && (
                    <p className="font-mono mt-1 bg-white border border-green-100 px-2 py-1 rounded inline-block text-[10px]">
                      전표번호: {inboundResult.slipNo}
                    </p>
                  )}
                </div>
              )}

              <div className="flex gap-2 justify-end border-t border-gray-100 pt-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsInboundModalOpen(false);
                    setInboundResult(null);
                  }}
                  className="px-4 py-2 text-xs font-semibold text-gray-500 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
                >
                  닫기
                </button>
                <button
                  type="submit"
                  disabled={inboundSending || !canEdit}
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 rounded-lg transition-colors cursor-pointer"
                >
                  {inboundSending ? "전송 중..." : "생산입고 전송"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 🌟 이카운트 수신 원본 JSON 로그 모달 (고객센터 전달용) */}
      {rawLogModalData && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="bg-slate-900 text-white px-5 py-3.5 flex justify-between items-center shrink-0">
              <h3 className="font-extrabold text-sm sm:text-base flex items-center gap-2">
                <span>{rawLogModalData.title}</span>
              </h3>
              <button
                type="button"
                onClick={() => setRawLogModalData(null)}
                className="text-slate-400 hover:text-white font-bold text-base cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs overflow-y-auto flex-1">
              <div className="bg-red-50 border border-red-200 text-red-900 p-3 rounded-lg font-bold">
                {rawLogModalData.error}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="font-extrabold text-slate-700">이카운트 서버 수신 원본 JSON 응답 (Raw Response):</label>
                  <button
                    type="button"
                    onClick={() => {
                      const text = JSON.stringify(rawLogModalData.rawResponse, null, 2);
                      navigator.clipboard.writeText(text);
                      alert("이카운트 수신 원본 JSON 로그가 클립보드에 복사되었습니다!");
                    }}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 rounded text-xs font-extrabold cursor-pointer transition-colors shadow-2xs"
                  >
                    JSON 로그 1클릭 복사
                  </button>
                </div>

                <pre className="bg-slate-950 text-emerald-400 p-4 rounded-xl text-xs font-mono overflow-x-auto max-h-[350px] leading-relaxed border border-slate-800 select-all">
                  {JSON.stringify(rawLogModalData.rawResponse, null, 2)}
                </pre>
              </div>

              <div className="text-[11px] text-slate-500 bg-slate-50 p-3 rounded-lg border border-slate-200 font-medium">
                💡 <strong>안내:</strong> 상단 <code>JSON 로그 1클릭 복사</code> 버튼을 클릭하신 후, 이카운트 고객센터 문의에 그대로 붙여넣기(Ctrl+V) 하시면 이카운트 기술팀에서 즉시 원인을 분석해 드립니다.
              </div>
            </div>

            <div className="bg-gray-50 border-t border-gray-200 px-5 py-3 flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => setRawLogModalData(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white font-extrabold text-xs rounded-lg cursor-pointer"
              >
                확인 / 닫기
              </button>
            </div>
          </div>
        </div>
      )}
      {/* 🌟 이카운트 엑셀 무손실 동기화 모달 */}
      <EcountExcelUploadModal
        isOpen={isExcelModalOpen}
        onClose={() => setIsExcelModalOpen(false)}
        onSuccess={fetchInventory}
      />
    </div>
  );
}
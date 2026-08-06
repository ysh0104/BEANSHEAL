"use client"

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase"; 
import { useCanEdit } from "@/hooks/useCanEdit";
import { saveProductionInboundToEcount, syncEcountMasterToDb } from "@/app/actions/ecount";

export default function InventoryPage() {
  const { canEdit } = useCanEdit("inventory");
  const [inventory, setInventory] = useState<any[]>([]);
  const [loadingInv, setLoadingInv] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [scrapedItems, setScrapedItems] = useState<any[]>([]);
  const [currentDate, setCurrentDate] = useState("");
  
  // [신규 상태] 수량 0 숨기기 체크박스 상태 관리 (기본값: 체크됨)
  const [hideZeroQty, setHideZeroQty] = useState(true);

  // 생산입고 전표 입력
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

  const handleSyncMaster = async () => {
    if (!confirm("이카운트 품목/재고를 DB에 동기화할까요?")) return;
    setSyncingMaster(true);
    try {
      const res = await syncEcountMasterToDb();
      if (res.success) {
        alert(res.message);
        fetchInventory();
      } else {
        alert("동기화 실패: " + res.error);
      }
    } catch (err: any) {
      alert(err.message || "동기화 중 오류");
    } finally {
      setSyncingMaster(false);
    }
  };

  useEffect(() => {
    const today = new Date();
    const formattedDate = `${today.getFullYear()}/${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}`;
    setCurrentDate(formattedDate);

    fetchInventory();
    fetchScrapedItems();
  }, []);

  const fetchInventory = async () => {
    setLoadingInv(true);
    try {
      const { data, error } = await supabase
        .from('ecount_items')
        .select('prod_cd, prod_nm, total_qty')
        // [수정] 품목명(prod_nm) 정렬에서 품목코드(prod_cd) 오름차순 정렬로 변경
        .order('prod_cd', { ascending: true });

      if (error) throw error;

      if (data) {
        setInventory(data.map((item: any) => ({
          prodCd: item.prod_cd,
          prodNm: item.prod_nm,
          qty: item.total_qty || 0
        })));
      }
    } catch (e) { 
      console.error("DB 재고 현황 로딩 에러:", e); 
    } finally { 
      setLoadingInv(false); 
    }
  };

  const fetchScrapedItems = async () => {
    try {
      const { data, error } = await supabase
        .from('ecount_inventory')
        .select('item_name, lot_no, expiry_date, quantity')
        .order('created_at', { ascending: false })
        .limit(3000); 

      if (error) throw error;

      if (data) {
        setScrapedItems(data.map((item: any) => ({
          productName: item.item_name,
          lotNo: item.lot_no,
          expDate: item.expiry_date || "-",
          qty: item.quantity,
        })));
      }
    } catch (error) {
      console.error("로트 데이터 로딩 에러:", error);
    }
  };

  // [수정] 검색어 필터링과 '수량 0 숨기기' 필터링 동시 적용
  const filteredInventory = inventory.filter(item => {
    const matchesSearch = item.prodNm.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          item.prodCd.toLowerCase().includes(searchTerm.toLowerCase());
    
    // hideZeroQty가 true일 때는 수량이 0 초과인 것만 통과시킴
    const matchesQty = hideZeroQty ? item.qty > 0 : true;

    return matchesSearch && matchesQty;
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
        neededQty -= lot.qty;
      } else {
        finalLots.push({ ...lot, qty: neededQty });
        neededQty = 0;
      }
    }

    const unassignedQty = Math.max(neededQty, 0); 

    return { totalQty, matchingLots: finalLots, unassignedQty };
  };

  return (
    <div className="max-w-7xl mx-auto py-10 px-4 bg-[#f8f9fb] min-h-screen">
      
      <div className="mb-8">
        <div className="flex items-center justify-center gap-3 mb-6">
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">재고현황</h1>
          {!canEdit && (
            <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2.5 py-1 rounded border border-amber-200 shadow-2xs">
              🔒 자재물류 부서 사원만 수정 가능 (조회 전용)
            </span>
          )}
        </div>
        
        <div className="flex justify-between items-end mb-2">
          
          {/* [신규 UI] 수량 0 숨기기 체크박스 영역 (좌측 배치) */}
          <div className="flex items-center">
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
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <input
                type="text"
                placeholder="품목명/코드 검색"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="border-2 border-blue-500 text-gray-900 bg-white placeholder-gray-300 px-3 py-1.5 text-sm w-64 focus:outline-none focus:border-blue-600 shadow-sm"
              />
            </div>
            
            <button 
              onClick={fetchInventory} 
              disabled={loadingInv} 
              className="text-sm text-gray-700 bg-gray-100 border border-gray-300 px-4 py-1.5 hover:bg-gray-200 cursor-pointer"
            >
              {loadingInv ? "조회중..." : "조회"}
            </button>

            <button
              onClick={handleSyncMaster}
              disabled={syncingMaster}
              className="text-sm text-gray-700 bg-white border border-gray-300 px-4 py-1.5 hover:bg-gray-50 cursor-pointer disabled:opacity-50"
            >
              {syncingMaster ? "동기화중..." : "이카운트 동기화"}
            </button>

            <button
              onClick={() => openInboundModal("")}
              className="text-sm font-semibold text-white bg-blue-600 border border-blue-700 px-4 py-1.5 hover:bg-blue-700 transition-colors shadow-sm cursor-pointer"
            >
              생산입고 전표
            </button>
            
            <span className="text-sm text-gray-800 font-mono ml-4">{currentDate}</span>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto bg-[#f8f9fb]">
        <table className="w-full text-sm border-collapse border border-gray-300 table-fixed bg-[#f8f9fb]">
          
          <colgroup>
            <col className="w-[15%]" />
            <col className="w-[60%]" />
            <col className="w-[25%]" />
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
            </tr>
          </thead>
          <tbody>
            {filteredInventory.flatMap((item, idx) => {
              const breakdown = getInventoryBreakdown(item.prodNm, item.qty);
              const rows = [];

              rows.push(
                <tr key={`parent-${idx}`} className="bg-[#f8f9fb] hover:bg-yellow-50 transition-colors">
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
                  <td className="border border-gray-300 px-2 py-1.5 text-gray-900 text-[13px] whitespace-nowrap overflow-hidden text-ellipsis">
                    {item.prodNm}
                  </td>
                  <td className="border border-gray-300 px-2 py-1.5 text-right font-medium text-[13px] text-gray-900">
                    {breakdown.totalQty.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 3 })}
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
                      {Number(lot.qty).toLocaleString()}
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
                      {breakdown.unassignedQty.toLocaleString()}
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

              <div className="grid grid-cols-3 gap-3">
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
    </div>
  );
}
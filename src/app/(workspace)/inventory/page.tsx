"use client"

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase"; 
import { useCanEdit } from "@/hooks/useCanEdit";

export default function InventoryPage() {
  const { canEdit } = useCanEdit("inventory");
  const [inventory, setInventory] = useState<any[]>([]);
  const [loadingInv, setLoadingInv] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [scrapedItems, setScrapedItems] = useState<any[]>([]);
  const [currentDate, setCurrentDate] = useState("");
  
  // [신규 상태] 수량 0 숨기기 체크박스 상태 관리 (기본값: 체크됨)
  const [hideZeroQty, setHideZeroQty] = useState(true);

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
              className="text-sm text-gray-700 bg-gray-100 border border-gray-300 px-4 py-1.5 hover:bg-gray-200"
            >
              {loadingInv ? "조회중..." : "조회"}
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
                    {item.prodCd}
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
    </div>
  );
}
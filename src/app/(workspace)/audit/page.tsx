"use client";

import { useEffect, useState, useRef } from "react";
import { getDashboardItems } from "@/app/actions/database";
import { parseEcountExcel } from "@/utils/excelParser"; 
import { 
  syncExcelToSupabase, 
  getAuditInventoryItems, 
  insertQuickProductionToSupabase 
} from "@/app/actions/inventoryActions"; 
import { getRecipeList } from "@/app/actions/recipe"; 

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

export default function AuditPage() {
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

  const [mfgNo, setMfgNo] = useState("");
  const [mfgDate, setMfgDate] = useState("");
  const [mfgHistory, setMfgHistory] = useState<any[]>([]);

  // Supabase ecount_inventory 데이터 실시간 로드 함수
  const fetchInventoryFromSupabase = async () => {
    try {
      const res = await getAuditInventoryItems();
      if (res?.success && Array.isArray(res.data) && res.data.length > 0) {
        const formatted = res.data.map((item: any) => ({
          scrapedAt: item.created_at 
            ? new Date(item.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) 
            : '미상',
          cleanName: item.item_name || item.name || item.product_name,
          lotNo: item.lot_no || item.ecount_prod_cd || item.lot_number || `LOT-${item.id}`,
          expDate: item.expiry_date || item.expiration_date || '제조일로부터 24개월',
          status: item.status || item.qc_status || '문서대기',
          rawItem: item
        }));
        setScrapedItems(formatted);
        setLastSyncTime(new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }));
      } else {
        // Fallback to getDashboardItems if ecount_inventory is empty
        const dashRes = await getDashboardItems();
        if (dashRes?.success && Array.isArray(dashRes.data) && dashRes.data.length > 0) {
          const formatted = dashRes.data.map((item: any) => ({
            scrapedAt: item.created_at ? new Date(item.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '미상',
            cleanName: item.name || item.product_name,
            lotNo: item.ecount_prod_cd || item.lot_number || `LOT-${item.id}`,
            expDate: item.expiration_date || '제조일로부터 24개월',
            status: item.qc_status || '문서대기',
            rawItem: item
          }));
          setScrapedItems(formatted);
          setLastSyncTime(new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }));
        }
      }
    } catch (e) {
      console.error("fetchInventoryFromSupabase error:", e);
    }
  };

  useEffect(() => {
    const initData = async () => {
      try {
        const recipeRes = await getRecipeList();
        if (recipeRes?.success && recipeRes.data) {
          setRecipeOptions(recipeRes.data);
        }

        // Supabase ecount_inventory 데이터 100% 자동 로드
        await fetchInventoryFromSupabase();

        const savedHistory = localStorage.getItem("beansheal_mfg_history");
        if (savedHistory) setMfgHistory(JSON.parse(savedHistory));
      } catch (e) {
        console.error(e);
      }
    };
    initData();

    // 사용자가 버튼을 클릭하지 않아도 15초마다 알아서 백그라운드 자동 갱신
    const interval = setInterval(() => {
      fetchInventoryFromSupabase();
    }, 15000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!selectedProduct) {
      setPreviewLot("");
      return;
    }

    const todayStr = new Date().toISOString().slice(2, 10).replace(/-/g, ""); 
    const prefix = selectedProduct.startsWith("반)") ? "SEMI" : "PROD";
    setPreviewLot(`LOT-${prefix}-${todayStr}-001`);
  }, [selectedProduct]);

  const handleQtyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const numericValue = e.target.value.replace(/[^0-9]/g, '');
    const formattedValue = numericValue ? Number(numericValue).toLocaleString('ko-KR') : '';
    setInputQty(formattedValue);
  };

  const handleMfgNoChange = (val: string) => {
    setMfgNo(val);
    const matched = mfgHistory.find(h => h.mfgNo === val);
    if (matched && matched.mfgDate) {
      setMfgDate(matched.mfgDate);
    }
  };

  const handleQuickProductionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct || !previewLot || !inputQty) {
      alert("품목, LOT 번호, 수량을 정확히 입력해주세요.");
      return;
    }

    try {
      const isSemi = selectedProduct.startsWith("반)");
      const rawName = selectedProduct.replace(/^[반완]\)\s*/, '');
      const cleanRecipeName = getCleanRecipeName(rawName);

      const targetRecipe = recipeOptions.find(r => r.product_name.trim() === cleanRecipeName.trim());

      let dynamicTemplateName = isSemi ? "qc_semi_liquid_log" : "qc_product_default_log";

      if (targetRecipe) {
        const analyzed = analyzeItemTemplate(targetRecipe.product_name);
        if (isSemi) {
          dynamicTemplateName = analyzed.endsWith('_액상') ? "qc_semi_liquid_log" : "qc_semi_liquid_log";
        } else {
          dynamicTemplateName = "qc_product_default_log";
        }
      }

      if (mfgNo.trim()) {
        const updatedHistory = [
          { mfgNo: mfgNo.trim(), mfgDate: mfgDate || new Date().toISOString().split('T')[0] },
          ...mfgHistory.filter(h => h.mfgNo !== mfgNo.trim())
        ].slice(0, 20);

        setMfgHistory(updatedHistory);
        localStorage.setItem("beansheal_mfg_history", JSON.stringify(updatedHistory));
      }

      // Supabase ecount_inventory 테이블에 즉시 실적 등록
      await insertQuickProductionToSupabase({
        item_name: selectedProduct,
        lot_no: previewLot,
        quantity: inputQty,
        expiry_date: '제조일로부터 24개월',
        status: '문서대기'
      });

      await fetchInventoryFromSupabase();
      alert(`[대기열 등록 및 Supabase 동기화 완료]\n품목: ${selectedProduct}\nLOT: ${previewLot}\n수량: ${inputQty}`);

      setSelectedProduct("");
      setInputQty("");
      setPreviewLot("");
      setMfgNo("");
      setMfgDate("");
    } catch (err) {
      alert("등록 중 에러가 발생했습니다.");
    }
  };

  const handleFileUploadClick = () => {
    if (fileInputRef.current) fileInputRef.current.click();
  };

  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploading(true);
      const parsedItems = await parseEcountExcel(file);
      await syncExcelToSupabase(parsedItems);

      // 엑셀 업로드 후 Supabase ecount_inventory에서 최신 데이터 즉시 재조회
      await fetchInventoryFromSupabase();
      alert(`성공적으로 이카운트 엑셀 데이터(${parsedItems.length}건)를 Supabase와 동기화했습니다!`);
    } catch (error: any) {
      alert(`엑셀 파싱 및 업로드 오류: ${error?.message || "알 수 없는 오류"}`);
    } finally {
      setIsUploading(false);
      if (e.target) e.target.value = "";
    }
  };

  const handleDownloadQCBatch = async (item: any) => {
    try {
      const response = await fetch('/api/generate-qc-doc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateName: item.rawItem?.template_name || 'qc_product_default_log',
          productName: item.cleanName,
          lotNumber: item.lotNo,
          mfgNo: item.rawItem?.mfg_no,
          mfgDate: item.rawItem?.mfg_date
        })
      });

      if (!response.ok) throw new Error('서류 생성에 실패했습니다.');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `[품질서류]_${item.cleanName}_${item.lotNo}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err: any) {
      alert(err.message || '서류 발급 오류');
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto w-full pb-20 mt-2 px-2 font-sans">
      
      {/* 상단 헤더 */}
      <div className="flex justify-between items-center pb-4 border-b border-gray-200">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <span>품질 / 감사 대응 관리 (QA & Audit)</span>
            <span className="text-xs bg-emerald-100 text-emerald-800 font-extrabold px-2.5 py-0.5 rounded border border-emerald-200">HACCP 서류 발급 시스템</span>
          </h2>
          <p className="text-sm text-gray-500 mt-1">반제품 및 완제품 실적 즉시 등록, 이카운트 엑셀 로트 동기화 및 품질검사 서류 일괄 발급을 관리합니다.</p>
        </div>
      </div>

      {/* 3번: 반제품/완제품 실적 즉시 등록 */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-xs overflow-hidden">
        <div className="p-5">
          <h3 className="text-md font-bold text-gray-900 mb-4 border-b border-gray-200 pb-2">반제품 / 완제품 실적 즉시 등록 (주간 제조세트 연동)</h3>
          <form onSubmit={handleQuickProductionSubmit} className="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-6 gap-3 items-end">
            <div className="flex flex-col">
              <label className="text-xs font-bold text-gray-600 mb-1">품목 선택</label>
              <select 
                value={selectedProduct} 
                onChange={(e) => setSelectedProduct(e.target.value)}
                className="text-sm border border-gray-300 rounded px-3 py-2 bg-white font-medium text-gray-700 shadow-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
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
                className="text-sm border border-gray-300 rounded px-3 py-2 bg-white text-gray-700 shadow-xs font-mono font-bold focus:outline-none focus:ring-1 focus:ring-blue-500"
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
                className="text-sm border border-gray-300 rounded px-3 py-2 bg-white text-gray-700 shadow-xs focus:outline-none focus:ring-1 focus:ring-blue-500 font-bold"
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
                className="text-sm border border-gray-300 rounded px-3 py-2 bg-white text-gray-700 shadow-xs focus:outline-none focus:ring-1 focus:ring-blue-500 font-medium"
              />
            </div>

            <div className="flex flex-col">
              <label className="text-xs font-bold text-gray-600 mb-1">생산 수량</label>
              <input 
                type="text" 
                value={inputQty}
                onChange={handleQtyChange}
                placeholder="숫자 (예: 1,500)"
                className="text-sm border border-gray-300 rounded px-3 py-2 bg-white text-gray-700 shadow-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <button 
              type="submit"
              className="bg-blue-600 text-white text-sm px-4 py-2 font-bold rounded shadow-xs hover:bg-blue-700 transition-colors h-[38px] cursor-pointer"
            >
              대기열 등록
            </button>
          </form>
        </div>
      </div>

      {/* 4번: 동기화 로트 테이블 */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-xs overflow-hidden">
        <div>
          <div className="bg-white text-gray-900 px-5 py-3 flex justify-between items-center border-b border-gray-200">
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-lg">데이터 동기화 및 관리열 (이카운트 엑셀 / 자동 수집)</h3>
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
                className={`text-sm px-4 py-2 rounded font-bold border shadow-xs transition-colors flex items-center gap-2 cursor-pointer ${
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
                  className="text-sm border border-gray-300 rounded px-2 py-1.5 bg-white font-medium text-gray-700 shadow-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
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
                  className="text-sm border border-gray-300 rounded px-2 py-1.5 bg-white font-medium text-gray-700 shadow-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
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
                          className="bg-blue-600 text-white text-xs px-4 py-2 font-bold rounded shadow-xs hover:bg-blue-700 transition-colors cursor-pointer"
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
      </div>
    </div>
  );
}

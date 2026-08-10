"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { getDashboardItems } from "@/app/actions/database";
import { parseEcountExcel } from "@/utils/excelParser"; 
import { 
  syncExcelToSupabase, 
  getAuditInventoryItems, 
  insertQuickProductionToSupabase,
  updateAuditItemStatusToSupabase
} from "@/app/actions/inventoryActions"; 
import { getRecipeList } from "@/app/actions/recipe"; 
import { useCanEdit } from "@/hooks/useCanEdit";
import CalibrationManagementView from "@/components/CalibrationManagementView";
import HealthCheckManagementView from "@/components/HealthCheckManagementView";

const analyzeItemTemplate = (productName: string) => {
  let mainType = "완제품";
  let subType = "기본";

  if (productName.includes('시녹스')) {
    return "부자재_시녹스마일드";
  }

  if (productName.startsWith('자)') || productName.startsWith('부)')) {
    if (productName.includes('시녹스')) return "부자재_시녹스마일드";
    if (productName.includes('알코올') || productName.includes('알콜') || productName.includes('주정') || productName.includes('에탄올') || productName.includes('소독제') || productName.includes('세척제')) {
      return "부자재_액상";
    }
    mainType = "부자재";
    if (productName.includes('파우치') || productName.includes('비닐')) subType = "파우치";
    else if (productName.includes('단상자')) subType = "단상자";
    else if (productName.includes('카톤') || productName.includes('박스')) subType = "카톤박스";
    else subType = "기본";
  } 
  else if (productName.startsWith('원)')) {
    mainType = "원료";
    if (productName.includes('분말') || productName.includes('파우더') || productName.includes('원두') || productName.includes('생두') || productName.includes('커피') || productName.includes('덱스트린') || productName.includes('비타민')) subType = "분말";
    else if (productName.includes('액상') || productName.includes('농축액') || productName.includes('유기농')) subType = "액상";
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

function AuditPageContent() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") === "calibration" ? "calibration" : "health";
  const [activeTab, setActiveTab] = useState<"health" | "calibration">(initialTab);

  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam === "calibration") setActiveTab("calibration");
    else if (tabParam === "health") setActiveTab("health");
  }, [searchParams]);

  const { canEdit } = useCanEdit("qa");
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

  useEffect(() => {
    if (typeof window !== "undefined") {
      const cachedItems = localStorage.getItem("beansheal_audit_items");
      if (cachedItems) {
        try {
          const parsed = JSON.parse(cachedItems);
          if (Array.isArray(parsed) && parsed.length > 0) setScrapedItems(parsed);
        } catch (e) {}
      }
      const cachedRecipes = localStorage.getItem("beansheal_recipe_options");
      if (cachedRecipes) {
        try {
          const parsed = JSON.parse(cachedRecipes);
          if (Array.isArray(parsed) && parsed.length > 0) setRecipeOptions(parsed);
        } catch (e) {}
      }
    }
  }, []);

  const [mfgNo, setMfgNo] = useState("");
  const [mfgDate, setMfgDate] = useState("");
  const [mfgHistory, setMfgHistory] = useState<any[]>([]);

  // Supabase ecount_inventory 데이터 실시간 로드 함수
  const fetchInventoryFromSupabase = async () => {
    try {
      const invRes = await getAuditInventoryItems();
      if (invRes?.success && Array.isArray(invRes.data) && invRes.data.length > 0) {
        const formatted = invRes.data.map((item: any) => ({
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
        localStorage.setItem("beansheal_audit_items", JSON.stringify(formatted));
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
          localStorage.setItem("beansheal_audit_items", JSON.stringify(formatted));
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
        // ⚡ 레시피 목록 및 품질 로트 데이터를 병렬(Promise.all) 초고속 로드
        const [recipeRes] = await Promise.all([
          getRecipeList().catch(() => ({ success: false, data: [] })),
          fetchInventoryFromSupabase().catch(() => {}),
        ]);

        if (recipeRes?.success && recipeRes.data) {
          setRecipeOptions(recipeRes.data);
        }

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
    const value = e.target.value;
    if (/^\d*\.?\d{0,3}$/.test(value) || value === "") {
      setInputQty(value);
    }
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

  const [docFormat, setDocFormat] = useState<"hwp" | "hwpx" | "docx">("hwp");

  const handleDownloadQCBatch = async (item: any) => {
    try {
      const rawName = item.rawItem?.item_name || item.cleanName || "";
      const lotNumber = item.lotNo || item.rawItem?.lot_no || "LOT-0000";

      // 원료/부자재/반제품/완제품 품목 성격별 필수 발급 서류 목록 (4~5종)
      const isSemiOrProduct = rawName.startsWith("반)") || rawName.startsWith("완)") || rawName.includes("반제품") || rawName.includes("완제품");
      const docTypes = isSemiOrProduct
        ? ['log', 'instruction', 'report', 'request', 'label']
        : ['log', 'instruction', 'report', 'label'];

      const docNames: Record<string, string> = {
        log: "시험일지",
        instruction: "시험지시_및_기록서",
        report: "시험결과보고서",
        request: "시험의뢰서",
        label: "품질관리표시서"
      };

      let successCount = 0;
      const fileExt = docFormat;

      for (const type of docTypes) {
        const response = await fetch('/api/generate-qc-doc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            productName: rawName,
            lotNo: lotNumber,
            lotNumber: lotNumber,
            docType: type,
            format: fileExt,
            qty: item.rawItem?.total_qty || item.rawItem?.qty || item.rawItem?.quantity || item.rawItem?.expected_qty || item.quantity || "",
            mfgNo: item.rawItem?.mfg_no || item.mfgNo || "",
            mfgDate: item.rawItem?.mfg_date || item.rawItem?.make_date || item.rawItem?.created_at || "",
            expiryDate: item.expDate || item.rawItem?.expiry_date || item.rawItem?.expiration_date || ""
          })
        });

        if (!response.ok) {
          console.warn(`[${docNames[type]}] 생성 실패`);
          continue;
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${docNames[type]}_${lotNumber}.${fileExt}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);

        successCount++;
        await new Promise((resolve) => setTimeout(resolve, 350));
      }

      if (successCount > 0) {
        // 🌟 Supabase DB 상태 업데이트: '승인/발급완료'
        if (item.rawItem?.id) {
          await updateAuditItemStatusToSupabase(item.rawItem.id, "승인/발급완료");
        }

        // 🌟 화면 상태 즉시 업데이트 ('문서대기' -> '승인/발급완료')
        setScrapedItems((prev) =>
          prev.map((it) =>
            it.lotNo === item.lotNo || (item.rawItem?.id && it.rawItem?.id === item.rawItem?.id)
              ? { ...it, status: "승인/발급완료" }
              : it
          )
        );
      } else {
        alert("품질 서류 생성에 실패했습니다.");
      }
    } catch (err: any) {
      alert(err.message || '서류 발급 오류');
    }
  };

  return (
    <div className="space-y-6 max-w-[1280px] mx-auto w-full pb-20 mt-2 px-1 sm:px-2 font-sans">
      
      {/* 상단 헤더 및 양식 포맷 선택 버튼 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-200">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <span>품질 / 감사 대응 관리 (QA & Audit)</span>
            <span className="text-xs bg-emerald-100 text-emerald-800 font-extrabold px-2.5 py-0.5 rounded border border-emerald-200">HACCP & GMP 서류 통합 관리</span>
          </h2>
          <p className="text-sm text-gray-500 mt-1">HACCP 검사서류 일괄 발급, 실적 수집 및 GMP 기기 검·교정 관리대장 서식을 한곳에서 관리합니다.</p>
        </div>

        {/* 한글 / 워드 문서 포맷 선택 토글 버튼 */}
        <div className="flex items-center bg-gray-100 p-1.5 rounded-xl border border-gray-200 self-start sm:self-auto gap-1">
          <button
            type="button"
            onClick={() => setDocFormat("hwp")}
            className={`px-3.5 py-2 rounded-lg text-xs sm:text-sm font-extrabold transition-all cursor-pointer ${
              docFormat === "hwp"
                ? "bg-blue-600 text-white shadow-xs"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            한컴 한글 (.hwp)
          </button>
          <button
            type="button"
            onClick={() => setDocFormat("hwpx")}
            className={`px-3.5 py-2 rounded-lg text-xs sm:text-sm font-extrabold transition-all cursor-pointer ${
              docFormat === "hwpx"
                ? "bg-blue-600 text-white shadow-xs"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            한글 (.hwpx)
          </button>
          <button
            type="button"
            onClick={() => setDocFormat("docx")}
            className={`px-3.5 py-2 rounded-lg text-xs sm:text-sm font-extrabold transition-all cursor-pointer ${
              docFormat === "docx"
                ? "bg-white text-slate-900 shadow-xs border border-gray-200"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            MS 워드 (.docx)
          </button>
        </div>
      </div>

      {/* 🌟 탭 네비게이션 */}
      <div className="flex items-center gap-2 border-b border-gray-200 pb-1 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab("health")}
          className={`px-4 sm:px-5 py-2.5 text-sm sm:text-base font-extrabold rounded-t-xl transition-all cursor-pointer border-t border-x flex items-center gap-2 whitespace-nowrap ${
            activeTab === "health"
              ? "bg-white text-indigo-700 border-gray-300 shadow-xs border-b-2 border-b-white -mb-1"
              : "bg-slate-100 text-slate-600 border-transparent hover:bg-slate-200 hover:text-slate-900"
          }`}
        >
          <span>건강진단결과서 (보건증) 관리대장</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("calibration")}
          className={`px-4 sm:px-5 py-2.5 text-sm sm:text-base font-extrabold rounded-t-xl transition-all cursor-pointer border-t border-x flex items-center gap-2 whitespace-nowrap ${
            activeTab === "calibration"
              ? "bg-white text-indigo-700 border-gray-300 shadow-xs border-b-2 border-b-white -mb-1"
              : "bg-slate-100 text-slate-600 border-transparent hover:bg-slate-200 hover:text-slate-900"
          }`}
        >
          <span>기기 검·교정 관리대장 (GMP G-05-07-01)</span>
          <span className="bg-indigo-600 text-white text-xs px-2 py-0.5 rounded-full font-mono font-bold">
            37종
          </span>
        </button>
      </div>

      {activeTab === "calibration" ? (
        <CalibrationManagementView canEdit={canEdit} />
      ) : (
        <HealthCheckManagementView canEdit={canEdit} />
      )}
    </div>
  );
}

export default function AuditPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm font-bold text-slate-500">감사 및 기기 검·교정 관리대장 데이터 로딩 중...</div>}>
      <AuditPageContent />
    </Suspense>
  );
}

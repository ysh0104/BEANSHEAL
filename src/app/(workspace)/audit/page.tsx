"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { getDashboardItems } from "@/app/actions/database";
import { parseEcountExcel } from "@/utils/excelParser"; 
import { 
  syncExcelToSupabase, 
  getAuditInventoryItems, 
  insertQuickProductionToSupabase,
  updateAuditItemStatusToSupabase,
  getQcItemUnitSpecsFromSupabase,
  saveQcItemUnitSpecsToSupabase
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

const sanitizeAuditItemName = (rawName: any): string => {
  let name = String(rawName || "").trim();
  if (!name) return "";
  if (name.includes("재고수불부")) {
    const parts = name.split(/재고수불부\s*\/\s*/);
    name = (parts[parts.length - 1] || "").trim();
  }
  name = name.replace(/^\d{4}[\/.\-]\d{1,2}[\/.\-]\d{1,2}\s*~\s*\d{4}[\/.\-]\d{1,2}[\/.\-]\d{1,2}\s*\/\s*/g, "").trim();
  name = name.replace(/\s*\([A-Za-z0-9_-]{3,20}\)\s*$/, "").trim();
  return name;
};

const isValidSingleLotNo = (rawLot: any): boolean => {
  const lot = String(rawLot || "").trim();
  if (!lot || lot === "undefined" || lot === "null" || lot === "—" || lot === "-") return false;
  if (/\s/.test(lot)) return false; // "250925Q2  251013Q3" 같은 다중 로트 오염 제외
  if (!/\d/.test(lot)) return false;
  return true;
};

const parseLotSortKey = (rawLot: string) => {
  const raw = String(rawLot || "").trim();
  const dateMatch = raw.match(/^([^0-9]*?)(20\d{6}|\d{6})(.*)$/);
  if (dateMatch) {
    const lead = (dateMatch[1] || "").trim();
    const datePart = dateMatch[2];
    const rest = (dateMatch[3] || "").trim();
    const fullDateStr = datePart.length === 6 ? `20${datePart}` : datePart;
    const dateVal = parseInt(fullDateStr, 10) || 0;
    const seqMatch = rest.match(/^([^0-9]*)(\d+)(.*)$/);
    const midPrefix = `${lead}${seqMatch ? seqMatch[1] : rest}`.trim().toUpperCase();
    const seqNum = seqMatch ? parseInt(seqMatch[2], 10) : 0;
    const suffix = (seqMatch ? seqMatch[3] : "").trim().toUpperCase();
    return { hasDate: true, dateVal, midPrefix, seqNum, suffix, raw };
  }
  return { hasDate: false, dateVal: 0, midPrefix: raw.toUpperCase(), seqNum: Number.MAX_SAFE_INTEGER, suffix: "", raw };
};

// 1순위: LOT 날짜 최신순(내림차순), 2순위: 같은 날짜 내 최신 순번이 위로(Q3 -> Q2 -> Q1 내림차순)
const compareLotNumbers = (lotA: string, lotB: string): number => {
  const a = parseLotSortKey(lotA);
  const b = parseLotSortKey(lotB);
  if (a.hasDate !== b.hasDate) return a.hasDate ? -1 : 1;
  if (a.dateVal !== b.dateVal) {
    return b.dateVal - a.dateVal;
  }
  if (a.seqNum !== b.seqNum) return b.seqNum - a.seqNum;
  if (a.midPrefix !== b.midPrefix) {
    return b.midPrefix.localeCompare(a.midPrefix, "en", { numeric: true, sensitivity: "base" });
  }
  if (a.suffix !== b.suffix) {
    return b.suffix.localeCompare(a.suffix, "en", { numeric: true, sensitivity: "base" });
  }
  return b.raw.localeCompare(a.raw, "en", { numeric: true, sensitivity: "base" });
};

const normalizeItemSpecKey = (rawName: string): string => {
  if (!rawName) return "";
  return sanitizeAuditItemName(rawName)
    .replace(/^[원부자반완]\)\s*/, "")
    .replace(/\s+/g, "")
    .toLowerCase();
};

const cleanAndDeduplicateAuditList = (list: any[]): any[] => {
  const map = new Map<string, any>();
  for (const it of list) {
    if (!it) continue;
    const cleanName = sanitizeAuditItemName(it.cleanName || it.rawItem?.item_name || "");
    const lotNo = String(it.lotNo || it.rawItem?.lot_no || "").trim();
    if (!cleanName || !isValidSingleLotNo(lotNo)) continue;
    const key = `${cleanName.replace(/\s+/g, "")}_${lotNo}`;
    const existing = map.get(key);
    const updatedItem = { ...it, cleanName, lotNo };
    if (!existing || (existing.status === "문서대기" && updatedItem.status !== "문서대기")) {
      map.set(key, updatedItem);
    }
  }
  const result = Array.from(map.values());
  result.sort((a, b) => compareLotNumbers(a.lotNo, b.lotNo));
  return result;
};

function AuditPageContent() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") === "calibration" ? "calibration" : searchParams.get("tab") === "health" ? "health" : "documents";
  const [activeTab, setActiveTab] = useState<"documents" | "health" | "calibration">(initialTab);

  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam === "calibration") setActiveTab("calibration");
    else if (tabParam === "health") setActiveTab("health");
    else if (tabParam === "documents") setActiveTab("documents");
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
  const [itemUnitSpecs, setItemUnitSpecs] = useState<Record<string, string>>({});
  const unitSpecSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleUnitSpecChange = (rawItemName: string, val: string) => {
    const key = normalizeItemSpecKey(rawItemName);
    if (!key) return;
    setItemUnitSpecs((prev) => {
      const next = { ...prev, [key]: val };
      try {
        localStorage.setItem("beansheal_item_unit_specs", JSON.stringify(next));
      } catch (e) {}
      if (unitSpecSaveTimerRef.current) clearTimeout(unitSpecSaveTimerRef.current);
      unitSpecSaveTimerRef.current = setTimeout(() => {
        void saveQcItemUnitSpecsToSupabase(next);
      }, 350);
      return next;
    });
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      const cachedItems = localStorage.getItem("beansheal_audit_items");
      if (cachedItems) {
        try {
          const parsed = JSON.parse(cachedItems);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const cleaned = cleanAndDeduplicateAuditList(parsed);
            setScrapedItems(cleaned);
          }
        } catch (e) {}
      }
      const cachedRecipes = localStorage.getItem("beansheal_recipe_options");
      if (cachedRecipes) {
        try {
          const parsed = JSON.parse(cachedRecipes);
          if (Array.isArray(parsed) && parsed.length > 0) setRecipeOptions(parsed);
        } catch (e) {}
      }
      const cachedSpecs = localStorage.getItem("beansheal_item_unit_specs");
      if (cachedSpecs) {
        try {
          const parsed = JSON.parse(cachedSpecs);
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            setItemUnitSpecs(parsed);
          }
        } catch (e) {}
      }
    }
  }, []);

  const [mfgNo, setMfgNo] = useState("");
  const [mfgDate, setMfgDate] = useState("");
  const [mfgHistory, setMfgHistory] = useState<any[]>([]);

  const formatExpDate = (rawDate: any) => {
    if (!rawDate) return '제조일로부터 24개월';
    const str = String(rawDate).trim();
    if (!str || str === '-' || str === 'undefined' || str === 'null') return '제조일로부터 24개월';
    if (str.includes('T')) {
      const datePart = str.split('T')[0];
      if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return datePart;
    }
    const match = str.match(/(\d{4})[\/.\-](\d{1,2})[\/.\-](\d{1,2})/);
    if (match) {
      return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
    }
    const match2 = str.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (match2) {
      return `${match2[1]}-${match2[2]}-${match2[3]}`;
    }
    return str;
  };

  // 발급 완료된 LOT 번호를 로컬 세션에도 기억하여 15초 백그라운드 폴링 시 덮어씌워짐 방지
  const issuedLotsRef = useRef<Set<string>>(new Set());
  const [lotSortOrder, setLotSortOrder] = useState<"desc" | "asc">("desc");

  // Supabase ecount_inventory 데이터 실시간 로드 함수
  const fetchInventoryFromSupabase = async () => {
    try {
      const invRes = await getAuditInventoryItems();
      if (invRes?.success && Array.isArray(invRes.data) && invRes.data.length > 0) {
        const formatted = invRes.data.map((item: any) => {
          const rawLot = String(item.lot_no || item.lot_number || '').trim();
          const lotNo = (rawLot && rawLot !== 'undefined' && rawLot !== 'null') 
            ? rawLot 
            : `LOT-${item.id}`;
          const dbStatus = item.status || item.qc_status || '문서대기';
          const finalStatus = issuedLotsRef.current.has(lotNo) ? '승인/발급완료' : dbStatus;
          const cleanName = sanitizeAuditItemName(item.item_name || item.name || item.product_name);

          return {
            scrapedAt: item.created_at 
              ? new Date(item.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) 
              : '미상',
            cleanName,
            lotNo: lotNo,
            expDate: formatExpDate(item.expiry_date || item.expiration_date),
            status: finalStatus,
            rawItem: { ...item, item_name: cleanName }
          };
        });
        const cleaned = cleanAndDeduplicateAuditList(formatted);
        setScrapedItems(cleaned);
        localStorage.setItem("beansheal_audit_items", JSON.stringify(cleaned));
        setLastSyncTime(new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }));
      } else {
        // Fallback to getDashboardItems if ecount_inventory is empty
        const dashRes = await getDashboardItems();
        if (dashRes?.success && Array.isArray(dashRes.data) && dashRes.data.length > 0) {
          const formatted = dashRes.data.map((item: any) => {
            const lotNo = item.lot_number || `LOT-${item.id}`;
            const dbStatus = item.qc_status || '문서대기';
            const cleanName = sanitizeAuditItemName(item.name || item.product_name);
            return {
              scrapedAt: item.created_at ? new Date(item.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '미상',
              cleanName,
              lotNo,
              expDate: formatExpDate(item.expiration_date),
              status: issuedLotsRef.current.has(lotNo) ? '승인/발급완료' : dbStatus,
              rawItem: item
            };
          });
          const cleaned = cleanAndDeduplicateAuditList(formatted);
          setScrapedItems(cleaned);
          localStorage.setItem("beansheal_audit_items", JSON.stringify(cleaned));
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
        // ⚡ 레시피 목록, 품질 로트 데이터, 품목별 단위규격 설정을 병렬(Promise.all) 초고속 로드
        const [recipeRes, unitSpecsRes] = await Promise.all([
          getRecipeList().catch(() => ({ success: false, data: [] })),
          getQcItemUnitSpecsFromSupabase().catch(() => ({ success: false, data: {} })),
          fetchInventoryFromSupabase().catch(() => {}),
        ]);

        if (recipeRes?.success && recipeRes.data) {
          setRecipeOptions(recipeRes.data);
        }

        if (unitSpecsRes?.success && unitSpecsRes.data) {
          setItemUnitSpecs((prev) => {
            const merged = { ...unitSpecsRes.data, ...prev };
            try {
              localStorage.setItem("beansheal_item_unit_specs", JSON.stringify(merged));
            } catch (e) {}
            return merged;
          });
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

  const docFormat = "docx";

  const handleDownloadQCBatch = async (item: any) => {
    try {
      const rawName = item.rawItem?.item_name || item.cleanName || "";
      const lotNumber = item.lotNo || item.rawItem?.lot_no || "LOT-0000";

      // ⚡ 0초 즉시 UI 상태 전환 ('문서대기' -> '승인/발급완료' / '서류 재발급' 버튼으로 즉시 변경)
      issuedLotsRef.current.add(lotNumber);
      setScrapedItems((prev) => {
        const next = prev.map((it) =>
          it.lotNo === item.lotNo || (item.rawItem?.id && it.rawItem?.id === item.rawItem?.id)
            ? { ...it, status: "승인/발급완료" }
            : it
        );
        try {
          localStorage.setItem("beansheal_audit_items", JSON.stringify(next));
        } catch (e) {}
        return next;
      });

      // 백그라운드 Supabase DB 상태 즉시 업데이트
      void updateAuditItemStatusToSupabase(item.rawItem?.id, "승인/발급완료", lotNumber);

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
      const unitSpecVal = (itemUnitSpecs[normalizeItemSpecKey(rawName)] || "").trim();

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
            unitQty: unitSpecVal,
            mfgNo: item.rawItem?.mfg_no || item.mfgNo || "",
            mfgDate: item.rawItem?.mfg_date || item.rawItem?.make_date || "",
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

      if (successCount === 0) {
        alert("품질 서류 생성에 실패했습니다.");
      }
    } catch (err: any) {
      alert(err.message || '서류 발급 오류');
    }
  };

  return (
    <div className="space-y-6 max-w-[1280px] mx-auto w-full pb-20 mt-2 px-1 sm:px-2 font-sans">
      
      {/* 상단 헤더 및 워드 양식 안내 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-200">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <span>품질 / 감사 대응 관리 (QA & Audit)</span>
            <span className="text-xs bg-emerald-100 text-emerald-800 font-extrabold px-2.5 py-0.5 rounded border border-emerald-200">HACCP & GMP 서류 통합 관리</span>
          </h2>
          <p className="text-sm text-gray-500 mt-1">HACCP 검사서류 일괄 발급, 실적 수집 및 GMP 기기 검·교정 관리대장 서식을 한곳에서 관리합니다.</p>
        </div>

        {/* MS 워드 (.docx) 기본 고정 배지 */}
        <div className="flex items-center bg-blue-50 px-4 py-2 rounded-xl border border-blue-200 self-start sm:self-auto gap-2 shadow-2xs">
          <span className="w-2 h-2 rounded-full bg-blue-600"></span>
          <span className="text-xs sm:text-sm font-extrabold text-blue-800">
            MS 워드 (.docx) 자동 발급
          </span>
        </div>
      </div>

      {/* 🌟 탭 네비게이션 (HACCP 품질서류 발급 vs 건강진단결과서 보건증 대장 vs GMP 기기 검·교정 관리대장) */}
      <div className="flex items-center gap-2 border-b border-gray-200 pb-1 overflow-x-auto -mx-1 px-1">
        <button
          type="button"
          onClick={() => setActiveTab("documents")}
          className={`px-3 sm:px-5 py-2.5 text-xs sm:text-base font-extrabold rounded-t-xl transition-all cursor-pointer border-t border-x whitespace-nowrap shrink-0 ${
            activeTab === "documents"
              ? "bg-white text-indigo-700 border-gray-300 shadow-xs border-b-2 border-b-white -mb-1"
              : "bg-slate-100 text-slate-600 border-transparent hover:bg-slate-200 hover:text-slate-900"
          }`}
        >
          <span className="sm:hidden">품질서류</span>
          <span className="hidden sm:inline">HACCP 품질검사 서류 발급</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("health")}
          className={`px-3 sm:px-5 py-2.5 text-xs sm:text-base font-extrabold rounded-t-xl transition-all cursor-pointer border-t border-x flex items-center gap-2 whitespace-nowrap shrink-0 ${
            activeTab === "health"
              ? "bg-white text-indigo-700 border-gray-300 shadow-xs border-b-2 border-b-white -mb-1"
              : "bg-slate-100 text-slate-600 border-transparent hover:bg-slate-200 hover:text-slate-900"
          }`}
        >
          <span className="sm:hidden">보건증</span>
          <span className="hidden sm:inline">건강진단결과서 (보건증) 관리대장</span>
          <span className="bg-emerald-600 text-white text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 rounded-full font-mono font-bold">
            14명
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("calibration")}
          className={`px-3 sm:px-5 py-2.5 text-xs sm:text-base font-extrabold rounded-t-xl transition-all cursor-pointer border-t border-x flex items-center gap-2 whitespace-nowrap shrink-0 ${
            activeTab === "calibration"
              ? "bg-white text-indigo-700 border-gray-300 shadow-xs border-b-2 border-b-white -mb-1"
              : "bg-slate-100 text-slate-600 border-transparent hover:bg-slate-200 hover:text-slate-900"
          }`}
        >
          <span className="sm:hidden">검·교정</span>
          <span className="hidden sm:inline">기기 검·교정 관리대장 (GMP G-05-07-01)</span>
          <span className="bg-indigo-600 text-white text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 rounded-full font-mono font-bold">
            37종
          </span>
        </button>
      </div>

      {activeTab === "calibration" ? (
        <CalibrationManagementView canEdit={canEdit} />
      ) : activeTab === "health" ? (
        <HealthCheckManagementView canEdit={canEdit} />
      ) : (
        <>

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
              disabled={!canEdit}
              className={`text-sm px-4 py-2 font-bold rounded shadow-xs transition-colors h-[38px] cursor-pointer ${
                !canEdit
                  ? "bg-gray-200 text-gray-400 cursor-not-allowed border border-gray-300"
                  : "bg-blue-600 text-white hover:bg-blue-700"
              }`}
              title={!canEdit ? "품질관리 부서 또는 QA 권한 사원만 실적 등록이 가능합니다 (조회 전용)" : ""}
            >
              {!canEdit ? "등록 권한 없음 (조회 전용)" : "대기열 등록"}
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
              {!canEdit && (
                <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded border border-amber-200">
                  🔒 품질관리 부서 사원만 수정 가능 (조회 전용)
                </span>
              )}
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
                disabled={isUploading || !canEdit}
                className={`text-sm px-4 py-2 rounded font-bold border shadow-xs transition-colors flex items-center gap-2 cursor-pointer ${
                  isUploading || !canEdit
                    ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed' 
                    : 'bg-gray-800 text-white border-gray-700 hover:bg-gray-700'
                }`}
                title={!canEdit ? "품질관리 부서 또는 QA 권한 사원만 엑셀 업로드가 가능합니다" : ""}
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
            <table className="w-full text-left text-sm border-collapse table-auto">
              <thead className="bg-gray-100 text-gray-700 whitespace-nowrap">
                <tr>
                  <th className="py-3 pl-10 pr-4 border-b border-gray-300 font-semibold text-left">품목명</th>
                  <th className="py-3 px-3 border-b border-gray-300 font-bold text-blue-800 text-center w-36">
                    LOT 번호
                  </th>
                  <th
                    className="py-3 px-3 border-b border-gray-300 font-bold text-emerald-800 text-center w-36"
                    title="한 번 입력하면 해당 품목의 단위규격이 자동 저장되어 이후 입고분에도 품질관리표시서에 자동 반영됩니다."
                  >
                    표시서 단위수량
                  </th>
                  <th className="py-3 px-3 border-b border-gray-300 font-semibold text-center w-36">소비기한</th>
                  <th className="py-3 px-3 border-b border-gray-300 font-semibold text-center w-28">상태</th>
                  <th className="py-3 pl-3 pr-6 border-b border-gray-300 font-bold text-center w-40">관리자 승인</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {[...scrapedItems]
                  .filter((item) => {
                    if (filterStatus === "문서대기") return item.status === "문서대기";
                    if (filterStatus === "승인/발급완료") return item.status !== "문서대기";
                    return true;
                  })
                  .sort((a, b) => compareLotNumbers(a.lotNo, b.lotNo))
                  .slice(0, 100)
                  .map((item, idx) => {
                    const isPending = item.status === "문서대기";
                    const itemSpecKey = normalizeItemSpecKey(item.cleanName);
                    const savedUnitSpec = itemUnitSpecs[itemSpecKey] || "";

                    return (
                      <tr key={item.lotNo || idx} className={`transition-colors ${isPending ? 'bg-white hover:bg-blue-50' : 'bg-gray-50'}`}>
                        <td className="py-2.5 pl-10 pr-4 font-bold text-gray-900 text-left max-w-[320px] truncate" title={item.cleanName}>
                          {item.cleanName}
                        </td>
                        <td className="py-2.5 px-3 text-blue-700 font-mono font-bold text-center whitespace-nowrap">{item.lotNo}</td>
                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                          <input
                            type="text"
                            value={savedUnitSpec}
                            onChange={(e) => handleUnitSpecChange(item.cleanName, e.target.value)}
                            placeholder="예: 25kg"
                            className={`w-24 text-center text-xs font-bold px-2 py-1.5 rounded border transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                              savedUnitSpec
                                ? "bg-emerald-50/70 border-emerald-300 text-emerald-900"
                                : "bg-white border-gray-300 text-gray-700 placeholder:text-gray-400"
                            }`}
                            title="품목당 1회만 입력하면 모든 LOT의 품질관리표시서 수량/단위 칸에 자동 적용됩니다 (예: 25kg, 20kg)"
                          />
                        </td>
                        <td className="py-2.5 px-3 text-gray-600 text-center whitespace-nowrap">{item.expDate}</td>
                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                          <span className={`px-2.5 py-1 rounded text-xs font-bold border ${item.status === '문서대기' ? 'bg-orange-100 text-orange-800 border-orange-200' : 'bg-green-100 text-green-800 border-green-200'}`}>
                            {item.status}
                          </span>
                        </td>
                        <td className="py-2.5 pl-3 pr-6 text-center whitespace-nowrap">
                          {item.status === '문서대기' ? (
                            <button 
                              onClick={() => handleDownloadQCBatch(item)} 
                              className="bg-blue-600 text-white text-xs px-3.5 py-1.5 font-bold rounded shadow-xs hover:bg-blue-700 transition-colors cursor-pointer"
                            >
                              검토 및 서류 발급
                            </button>
                          ) : (
                            <button 
                              onClick={() => handleDownloadQCBatch(item)} 
                              className="bg-gray-200 text-gray-500 text-xs px-3.5 py-1.5 font-bold rounded hover:bg-gray-300 transition-colors cursor-pointer"
                            >
                              서류 재발급
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                {scrapedItems.length === 0 && (<tr><td colSpan={6} className="text-center py-12 text-gray-500 font-medium bg-gray-50">조건에 맞는 로트 데이터가 없습니다.</td></tr>)}
              </tbody>
            </table>
          </div>
        </div>
      </div>
        </>
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

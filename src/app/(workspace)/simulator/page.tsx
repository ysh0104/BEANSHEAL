"use client"
import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase"; 
import { getRecipeList, getRecipeDetails } from "@/app/actions/recipe"; 
import { savePurchasesToEcount } from "@/app/actions/ecount"; 
import { findStockForMaterial, StockItem } from "@/lib/stockHelper";
import { useCanEdit } from "@/hooks/useCanEdit";

// 🌟 사전에 정의된 원료별 포장 규격 (이름에 포함된 키워드 기준)
const MATERIAL_SPEC_MASTER: Record<string, number> = {
  "난소화성말토덱스트린": 20, 
  "가르시니아": 25,         
  "커피분말": 25,           
  "커피농축액": 20,
  "커피 농축액": 20,
  "탄산칼륨": 25,
  "유기농 씨베리 NFC주스": 200,
  "유기농 레몬주스(이탈리아)": 180
};

interface SimulationResult {
  type: string;
  name: string;
  materialCode?: string;
  requiredQty: number | string;
  requiredPacksDesc?: string;
  currentStock: number | string;
  shortage: number | string;
  unit: string;
}

export default function ProductionSimulator() {
  const { canEdit } = useCanEdit("production");
  const [recipeList, setRecipeList] = useState<any[]>([]);
  const [selectedRecipeId, setSelectedRecipeId] = useState<string>("");
  
  const [calcMode, setCalcMode] = useState<"kg" | "ea">("kg");
  const [targetQty, setTargetQty] = useState<number | "">("");
  const [pouchWeight, setPouchWeight] = useState<number | "">(14);
  const [processLossRate, setProcessLossRate] = useState<number | "">(2); 
  const [packLossRate, setPackLossRate] = useState<number | "">(2);       
  const [memo, setMemo] = useState<string>("");
  
  const [results, setResults] = useState<SimulationResult[]>([]);
  const [isCalculating, setIsCalculating] = useState(false);
  const [isSendingPurchase, setIsSendingPurchase] = useState(false);
  const [purchaseWhCd, setPurchaseWhCd] = useState("100");
  const [lastCalculatedInfo, setLastCalculatedInfo] = useState({ 
    name: "", 
    inputMode: "kg",
    inputValue: 0,
    grossQty: 0, 
    expectedPouches: 0,
    weight: 0, 
    processLoss: 0, 
    packLoss: 0,
    batches: 0 
  });

  useEffect(() => {
    async function fetchRecipes() {
      try {
        const res = await getRecipeList();
        if (res.success && res.data) {
          setRecipeList(res.data);
        }
      } catch (error) {
        console.error("레시피 로딩 실패:", error);
      }
    }
    fetchRecipes();
  }, []);

  const normalizeName = (name: string) => {
    if (!name) return "";
    return name.replace(/^[원부자반]\)\s*/, '').replace(/\[.*?\]/g, '').replace(/\s+/g, '').toLowerCase();
  };

  const handleCalculate = async () => {
    const inputValue = Number(targetQty);
    if (!inputValue || inputValue <= 0) {
      alert("목표 생산량을 정확히 입력해 주십시오.");
      return;
    }

    setIsCalculating(true);
    setResults([]);

    try {
      const selectedRecipe = recipeList.find(r => r.id === selectedRecipeId);
      const recipeName = selectedRecipe?.product_name || selectedRecipe?.recipe_name || "";
      
      let rawMaterials: any[] = [];
      let packMaterials: any[] = [];
      let baseBatchSize = 1350; 

      const detailsRes = await getRecipeDetails(selectedRecipeId);
      if (detailsRes.success && detailsRes.materials) {
        if (selectedRecipe.base_batch_size) baseBatchSize = Number(selectedRecipe.base_batch_size);
        
        detailsRes.materials.forEach((mat: any) => {
          const baseQty = Number(mat.input_qty);
          const obj = {
            name: mat.material_name,
            materialCode: mat.material_code || "",
            ratio: (baseQty / baseBatchSize) * 100, 
            packaging_unit: Number(mat.packaging_unit) || 1, 
            unit: mat.input_unit || (mat.material_type?.trim() === '부자재' ? 'EA' : 'kg'),
            type: mat.material_type?.trim() === '부자재' ? '부자재' : '원료'
          };
          if (obj.type === '부자재') packMaterials.push(obj);
          else rawMaterials.push(obj);
        });
      }

      if (rawMaterials.length === 0 && packMaterials.length === 0) {
        alert("선택한 품목의 레시피 정보가 없습니다.");
        setIsCalculating(false);
        return;
      }

      // ecount_items(수동 엑셀 업로드 데이터) 및 ecount_inventory(로트별 재고) 안전 조회
      const allStockItems: StockItem[] = [];

      try {
        const { data: ecountItems, error: itemsErr } = await supabase
          .from('ecount_items')
          .select('prod_cd, prod_nm, total_qty');

        if (itemsErr) console.warn("ecount_items 조회 경고:", itemsErr.message);

        if (ecountItems && ecountItems.length > 0) {
          ecountItems.forEach(i => {
            allStockItems.push({
              prod_cd: String(i.prod_cd || '').trim(),
              prod_nm: String(i.prod_nm || '').trim(),
              total_qty: Number(i.total_qty || 0),
            });
          });
        }
      } catch (e) {
        console.warn("ecount_items 조회 예외:", e);
      }

      // 보조: ecount_inventory 데이터도 추가
      try {
        const { data: invItems } = await supabase
          .from('ecount_inventory')
          .select('item_name, quantity')
          .gt('quantity', 0);

        if (invItems && invItems.length > 0) {
          invItems.forEach(inv => {
            const nm = String(inv.item_name || '').trim();
            if (nm && !allStockItems.some(a => a.prod_nm === nm)) {
              allStockItems.push({
                prod_cd: '',
                prod_nm: nm,
                total_qty: Number(String(inv.quantity).replace(/,/g, '')) || 0,
              });
            }
          });
        }
      } catch (e) {
        console.warn("ecount_inventory 조회 예외:", e);
      }

      const c_loss = Math.min(Number(processLossRate) || 0, 99); 
      const c_packLoss = Number(packLossRate) || 0;
      const c_weight = Math.max(Number(pouchWeight) || 14, 0.1); 
      let grossQtyKg = 0; 
      let expectedPouches = 0; 

      if (calcMode === "kg") {
        grossQtyKg = inputValue;
        const netYield = grossQtyKg * (1 - (c_loss / 100));
        expectedPouches = Math.floor((netYield * 1000) / c_weight);
      } else {
        expectedPouches = inputValue;
        const netYield = (expectedPouches * c_weight) / 1000; 
        grossQtyKg = netYield / (1 - (c_loss / 100));         
      }

      const calculatedBatches = Number((grossQtyKg / baseBatchSize).toFixed(1));
      
      let innerSpec = 50; 
      let cartonSpec = 10;
      const innerBoxMat = packMaterials.find(m => m.name.includes("단상자") || m.name.includes("인박스"));
      if (innerBoxMat && innerBoxMat.packaging_unit > 0) innerSpec = innerBoxMat.packaging_unit;
      const cartonMat = packMaterials.find(m => m.name.includes("카톤") || m.name.includes("외박스"));
      if (cartonMat && cartonMat.packaging_unit > 0) cartonSpec = cartonMat.packaging_unit;

      const calculatedResults: SimulationResult[] = [];

      // 3-1. 원料 계산
      rawMaterials.forEach(mat => {
        const requiredQty = grossQtyKg * (mat.ratio / 100);
        const isExtractMat = mat.name.includes("커피") && mat.name.includes("추출액");
        let currentStock: number | string;
        let shortage: number;

        if (isExtractMat) {
          currentStock = "자가생산";
          shortage = 0;
        } else {
          const matchResult = findStockForMaterial(mat, allStockItems);
          currentStock = matchResult.qty;
          const netRequirement = currentStock - requiredQty;
          shortage = netRequirement < 0 ? Math.ceil(Math.abs(netRequirement)) : 0;
        }

        // 🌟 부족한 원료(shortage > 0)에 대해서만 발주 포대 수량 역산
        const specKey = Object.keys(MATERIAL_SPEC_MASTER).find(key => mat.name.includes(key));
        const specSize = specKey ? MATERIAL_SPEC_MASTER[specKey] : 0;
        let packsDesc = "";
        
        if (specSize > 0 && shortage > 0) {
          const orderPacks = Math.ceil(shortage / specSize);
          packsDesc = `(${specSize}kg × ${orderPacks})`;
        }

        calculatedResults.push({
          type: "원료",
          name: mat.name,
          materialCode: mat.materialCode || "",
          requiredQty: Number(requiredQty.toFixed(2)),
          requiredPacksDesc: packsDesc,
          currentStock: typeof currentStock === 'number' ? Number(currentStock.toFixed(2)) : currentStock,
          shortage: shortage,
          unit: "kg"
        });
      });

      // 3-2. 부자재(포장재) 계산
      packMaterials.forEach(mat => {
        let baseReqEA = 0;
        if (mat.name.includes("단상자") || mat.name.includes("인박스")) {
          baseReqEA = Math.ceil(expectedPouches / innerSpec);
        } else if (mat.name.includes("카톤") || mat.name.includes("외박스")) {
          const reqInner = Math.ceil(expectedPouches / innerSpec);
          baseReqEA = Math.ceil(reqInner / cartonSpec);
        } else {
          baseReqEA = Math.ceil(expectedPouches / mat.packaging_unit);
        }

        const finalReqEA = Math.ceil(baseReqEA * (1 + (c_packLoss / 100)));
        const matchResult = findStockForMaterial(mat, allStockItems);
        const currentStock = matchResult.qty;
        
        const netRequirement = currentStock - finalReqEA;
        const shortage = netRequirement < 0 ? Math.ceil(Math.abs(netRequirement)) : 0;

        calculatedResults.push({
          type: "부자재",
          name: mat.name,
          materialCode: mat.materialCode || "",
          requiredQty: finalReqEA,
          requiredPacksDesc: "",
          currentStock: currentStock,
          shortage: shortage,
          unit: mat.unit
        });
      });

      setResults(calculatedResults);
      setLastCalculatedInfo({ 
        name: recipeName, 
        inputMode: calcMode,
        inputValue: inputValue,
        grossQty: Number(grossQtyKg.toFixed(2)), 
        expectedPouches: expectedPouches,
        weight: c_weight, 
        processLoss: c_loss,
        packLoss: c_packLoss,
        batches: calculatedBatches 
      });

    } catch (err: any) {
      console.error("산출 에러:", err);
      alert("데이터 연동 중 에러가 발생했습니다. 백엔드 상태를 확인해 주십시오.");
    } finally {
      setIsCalculating(false);
    }
  };

  const handleSendPurchasesToEcount = async () => {
    const shortageLines = results.filter(
      (r) => Number(r.shortage) > 0 && r.currentStock !== "자가생산"
    );

    if (shortageLines.length === 0) {
      alert("전송할 결품(발주 필요) 품목이 없습니다.");
      return;
    }

    const missingCode = shortageLines.filter((r) => !r.materialCode);
    if (missingCode.length > 0) {
      alert(
        `이카운트 품목코드가 없는 결품이 ${missingCode.length}건 있습니다.\n레시피 BOM에서 material_code를 매핑한 뒤 다시 계산해주세요.\n예: ${missingCode[0].name}`
      );
      return;
    }

    if (
      !confirm(
        `결품 ${shortageLines.length}건을 이카운트 구매입고 전표로 전송할까요?\n창고코드: ${purchaseWhCd}`
      )
    ) {
      return;
    }

    setIsSendingPurchase(true);
    try {
      const res = await savePurchasesToEcount(
        shortageLines.map((r) => ({
          PROD_CD: r.materialCode!,
          PROD_DES: r.name,
          QTY: Number(r.shortage),
          WH_CD: purchaseWhCd,
        })),
        purchaseWhCd
      );

      if (res.success) {
        alert(
          `${res.message}\n전표: ${(res.slipNos || []).join(", ") || "-"}`
        );
      } else {
        alert(
          `전송 실패: ${res.error}\n\n※ '인증되지 않은 API'라면 이카운트에서 구매 API를 테스트키로 1회 검증해야 합니다.`
        );
      }
    } catch (err: any) {
      alert(err.message || "전송 중 오류");
    } finally {
      setIsSendingPurchase(false);
    }
  };

  const exportToCSV = () => {
    if (results.length === 0) return;
    
    // 🌟 CSV 헤더에 발주 포대 환산 열 추가
    const headers = ["구분", "품목명", "필요 소요량", "단위", "이카운트 현재 재고", "발주 필요 수량 (올림 적용)", "발주 포대/박스 환산"];
    
    const rows = results.map(item => {
      const isSelfProduced = item.currentStock === "자가생산";
      const shortageStr = isSelfProduced ? "-" : (Number(item.shortage) > 0 ? item.shortage : "-");
      const packDescStr = item.requiredPacksDesc ? item.requiredPacksDesc : "-";

      return [
        item.type,
        `"${item.name}"`, 
        item.requiredQty,
        item.unit,
        item.currentStock,
        shortageStr,
        `"${packDescStr}"`
      ].join(",");
    });

    const csvContent = "\uFEFF" + [headers.join(","), ...rows].join("\n"); 
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `소요량_발주리포트_${lastCalculatedInfo.name}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex flex-col items-center gap-6 font-sans w-full p-4 sm:p-6 md:p-8 bg-[#f4f5f7] min-h-screen">
      
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 10mm; }
          body { background: white !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .no-print { display: none !important; }
        }
      `}</style>

      {/* 컨트롤 패널 */}
      <div className="no-print w-full max-w-[1200px] bg-[#f8f9fa] border border-[#e5e7eb] rounded-xl p-4 sm:p-7 shadow-sm">
        
        <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-4">
          <div className="min-w-0">
            <h2 className="text-lg sm:text-[22px] font-black text-[#1e293b] tracking-tight">원부자재 소요량 산출 시뮬레이터 (MRP)</h2>
            <p className="text-[13px] sm:text-[14px] font-semibold text-[#64748b] mt-1.5">생산 배합량(kg) 또는 목표 포장수량(포)을 기준으로 필요한 모든 자재의 정밀 발주량을 산출합니다.</p>
          </div>
          <button 
            onClick={handleCalculate}
            disabled={isCalculating}
            className="bg-[#8b98d2] text-white px-5 sm:px-7 py-3 rounded-md font-bold text-[14px] sm:text-[15px] hover:bg-[#7a86c1] transition-colors disabled:opacity-50 shadow-sm shrink-0 w-full sm:w-auto"
          >
            {isCalculating ? "데이터 연동 중..." : "소요량 자동 산출"}
          </button>
        </div>

        <div className="w-full h-px bg-[#e2e8f0] my-5"></div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4">
          <div>
            <label className="block text-[12px] font-bold text-[#475569] mb-2">생산 품목 선택</label>
            <select 
              value={selectedRecipeId}
              onChange={(e) => setSelectedRecipeId(e.target.value)}
              className="w-full h-[40px] border border-[#cbd5e1] rounded bg-white px-2 text-[13px] outline-none font-semibold focus:border-[#8b98d2] text-[#334155]"
            >
              <option value="">품목을 선택해 주십시오</option>
              {recipeList.map(recipe => (
                <option key={recipe.id} value={recipe.id}>{recipe.product_name || recipe.recipe_name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[12px] font-bold text-[#475569] mb-2">산출 기준 (단위)</label>
            <select 
              value={calcMode}
              onChange={(e) => setCalcMode(e.target.value as "kg" | "ea")}
              className="w-full h-[40px] border border-[#cbd5e1] rounded bg-white px-2 text-[13px] outline-none font-bold text-blue-800 focus:border-[#8b98d2]"
            >
              <option value="kg">배합량 (kg)</option>
              <option value="ea">포장 수량 (포)</option>
            </select>
          </div>
          
          <div>
            <label className="block text-[12px] font-bold text-[#475569] mb-2">
              목표 {calcMode === "kg" ? "배합량 (kg)" : "포장 수량 (포)"}
            </label>
            <input 
              type="number" 
              value={targetQty}
              onChange={(e) => setTargetQty(Number(e.target.value))}
              placeholder={calcMode === "kg" ? "예: 2000" : "예: 100000"}
              className="w-full h-[40px] border border-[#cbd5e1] rounded bg-[#f1f5f9] px-3 text-[13px] font-bold text-[#1e293b] outline-none focus:bg-white focus:border-[#8b98d2]"
            />
          </div>

          <div>
            <label className="block text-[12px] font-bold text-[#475569] mb-2">1포당 중량 (g/ml)</label>
            <input 
              type="number" 
              value={pouchWeight}
              onChange={(e) => setPouchWeight(Number(e.target.value))}
              placeholder="예: 14"
              className="w-full h-[40px] border border-[#cbd5e1] rounded bg-[#f1f5f9] px-3 text-[13px] font-bold text-[#1e293b] outline-none focus:bg-white focus:border-[#8b98d2]"
            />
          </div>

          <div>
            <label className="block text-[12px] font-bold text-[#475569] mb-2">공정 로스율 (%)</label>
            <input 
              type="number" 
              value={processLossRate}
              onChange={(e) => setProcessLossRate(Number(e.target.value))}
              placeholder="예: 2"
              className="w-full h-[40px] border border-[#cbd5e1] rounded bg-[#f1f5f9] px-3 text-[13px] font-bold text-[#1e293b] outline-none focus:bg-white focus:border-[#8b98d2]"
            />
          </div>

          <div>
            <label className="block text-[12px] font-bold text-[#475569] mb-2">포장재 여유율 (%)</label>
            <input 
              type="number" 
              value={packLossRate}
              onChange={(e) => setPackLossRate(Number(e.target.value))}
              placeholder="예: 2"
              className="w-full h-[40px] border border-[#cbd5e1] rounded bg-[#f1f5f9] px-3 text-[13px] font-bold text-[#1e293b] outline-none focus:bg-white focus:border-[#8b98d2]"
            />
          </div>

          <div>
            <label className="block text-[12px] font-bold text-[#475569] mb-2">비고 (직접입력)</label>
            <input 
              type="text" 
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="예: 긴급 발주용"
              className="w-full h-[40px] border border-[#cbd5e1] rounded bg-[#f1f5f9] px-3 text-[13px] font-semibold text-[#1e293b] outline-none focus:bg-white focus:border-[#8b98d2]"
            />
          </div>
        </div>
      </div>

      {/* 산출 결과 리포트 */}
      {results.length > 0 && (
        <div className="w-full max-w-[1200px] bg-white border border-gray-300 rounded p-4 sm:p-8 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:justify-between lg:items-end gap-4 border-b-2 border-black pb-3 mb-4">
            <div className="min-w-0">
              <h3 className="text-[20px] font-extrabold tracking-tight text-gray-900">원부자재 소요량 및 결품 리포트</h3>
              
              <div className="flex items-center gap-4 mt-2">
                <p className="text-[14px] font-bold text-gray-800">
                  <span className="text-gray-900 border-r-2 border-gray-300 pr-3 mr-1">{lastCalculatedInfo.name}</span> 
                  필요 배합량: <span className="text-gray-900 font-extrabold">{lastCalculatedInfo.grossQty.toLocaleString()} kg</span>
                  
                  <span className="text-blue-700 ml-1.5 font-bold tracking-tight">(약 {lastCalculatedInfo.batches} 배치 분량)</span>
                  
                  <span className="text-gray-400 mx-3">|</span>
                  예상 생산량: <span className="text-gray-900 font-extrabold">약 {lastCalculatedInfo.expectedPouches.toLocaleString()} 포</span>
                  {memo && <span className="ml-2 text-gray-500 font-semibold">[{memo}]</span>}
                </p>
              </div>

              <p className="text-[12px] font-semibold text-gray-500 mt-1.5 bg-gray-50 inline-block px-2 py-1 rounded">
                입력 기준: [{lastCalculatedInfo.inputMode === 'kg' ? '배합량' : '생산 포수'} {lastCalculatedInfo.inputValue.toLocaleString()}{lastCalculatedInfo.inputMode === 'kg' ? 'kg' : '포'}] · 
                1포 중량: {lastCalculatedInfo.weight}g · 공정 로스: {lastCalculatedInfo.processLoss}% · 포장재 여유율: {lastCalculatedInfo.packLoss}% 가산
              </p>
            </div>
            
            <div className="no-print flex flex-wrap items-center gap-2 shrink-0">
              <label className="text-[12px] font-bold text-gray-600 flex items-center gap-1">
                창고
                <input
                  type="text"
                  value={purchaseWhCd}
                  onChange={(e) => setPurchaseWhCd(e.target.value)}
                  className="w-14 border border-gray-400 px-1 py-1 text-center"
                />
              </label>
              <button
                onClick={handleSendPurchasesToEcount}
                disabled={isSendingPurchase || !canEdit}
                className="bg-blue-700 text-white border border-blue-800 px-4 py-2 font-bold text-[13px] hover:bg-blue-800 transition-colors disabled:opacity-50"
              >
                {isSendingPurchase ? "전송중..." : "결품 → 이카운트 구매전송"}
              </button>
              <button onClick={exportToCSV} className="bg-green-700 text-white border border-green-800 px-4 py-2 font-bold text-[13px] hover:bg-green-800 transition-colors">
                엑셀 다운로드
              </button>
              <button onClick={() => window.print()} className="bg-white text-black border border-black px-4 py-2 font-bold text-[13px] hover:bg-gray-100 transition-colors">
                리포트 인쇄 / PDF 저장
              </button>
            </div>
          </div>

          <div className="overflow-x-auto -mx-1 px-1">
          <table className="w-full min-w-[720px] border-collapse border-2 border-black text-center text-[13px]">
            <colgroup>
              <col className="w-[8%]" />
              <col className="w-[28%]" />
              <col className="w-[18%]" />
              <col className="w-[10%]" />
              <col className="w-[16%]" />
              <col className="w-[20%]" />
            </colgroup>
            <thead className="bg-gray-100">
              <tr className="h-10 border-b border-black">
                <th className="border-r border-black font-extrabold text-gray-800">구분</th>
                <th className="border-r border-black font-extrabold text-gray-800">품목명</th>
                <th className="border-r border-black font-extrabold text-gray-800">필요 소요량</th>
                <th className="border-r border-black font-extrabold text-gray-800">단위</th>
                <th className="border-r border-black font-extrabold text-gray-800">이카운트 현재 재고</th>
                <th className="font-extrabold text-gray-800">발주 필요 수량</th>
              </tr>
            </thead>
            <tbody>
              {results.map((item, idx) => {
                const isShortage = Number(item.shortage) > 0;
                const isSelfProduced = item.currentStock === "자가생산";
                
                let rowBgClass = 'bg-white';
                if (isSelfProduced) rowBgClass = 'bg-gray-100';
                else if (isShortage) rowBgClass = 'bg-red-100';

                return (
                  <tr key={idx} className={`h-10 border-b border-gray-300 ${rowBgClass}`}>
                    <td className="border-r border-black font-bold text-gray-600">{item.type}</td>
                    <td className="border-r border-black text-left px-4 font-bold text-gray-900">
                      {item.name}
                      {item.materialCode && (
                        <span className="ml-2 text-[11px] font-mono font-semibold text-blue-700">{item.materialCode}</span>
                      )}
                    </td>
                    <td className="border-r border-black font-bold text-gray-900">
                      {Number(item.requiredQty).toLocaleString()}
                    </td>
                    <td className="border-r border-black font-semibold text-gray-600">{item.unit}</td>
                    <td className="border-r border-black font-bold text-gray-900">
                      {typeof item.currentStock === 'number' ? item.currentStock.toLocaleString() : item.currentStock}
                    </td>
                    <td className={`font-extrabold ${isShortage && !isSelfProduced ? 'text-red-700 text-[14px]' : 'text-gray-400'}`}>
                      {isSelfProduced ? "-" : (Number(item.shortage) > 0 ? Number(item.shortage).toLocaleString() : "-")}
                      
                      {/* 🌟 결품 시 발주 필요 수량 우측에 포대/박스 단위 표시 */}
                      {item.requiredPacksDesc && (
                        <span className="ml-1.5 text-[12px] font-bold text-red-900 tracking-tighter">
                          {item.requiredPacksDesc}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>

          <div className="mt-4 text-[12px] font-bold text-gray-500 text-right">
            ※ 발주 필요 수량은 올림(Ceil) 기준입니다. 붉은 결품은 [결품 → 이카운트 구매전송]으로 구매입고 전표를 생성할 수 있습니다.
          </div>
        </div>
      )}
    </div>
  );
}
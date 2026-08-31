"use client"

import React, { useState, useEffect } from "react";
import { getRecipeList, getRecipeDetails } from "@/app/actions/recipe";
import { supabase } from "@/lib/supabase";
import { useCanEdit } from "@/hooks/useCanEdit";
import A4MobileScaler from "@/components/A4MobileScaler";

// 사전에 정의된 원료별 포장 규격 (이름에 포함된 키워드 기준)
const MATERIAL_SPEC_MASTER: Record<string, number> = {
  "난소화성말토덱스트린": 20, // 20kg 포대
  "가르시니아": 25,         // 25kg 포대
  "커피분말": 25,           // 25kg 포대
  "커피 농축액": 20,
  "스프레이 드라이드 커피 파우더(MVI-0)": 25
};

export default function WorkOrder() {
  const { canEdit } = useCanEdit("production");
  const [recipes, setRecipes] = useState<any[]>([]);
  const [selectedRecipeId, setSelectedRecipeId] = useState<string>("");
  const [targetQty, setTargetQty] = useState<number | "">("");
  
  // 🌟 1포당 중량(g/ml) 상태 추가 (기본값 14)
  const [pouchWeight, setPouchWeight] = useState<number>(14);
  const [lossRate, setLossRate] = useState<number>(2);
  
  const [netQty, setNetQty] = useState<number>(0);
  const [expectedPouches, setExpectedPouches] = useState<number>(0);
  const [expectedInnerBoxes, setExpectedInnerBoxes] = useState<number>(0);
  const [expectedCartons, setExpectedCartons] = useState<number>(0);

  const [expDateStr, setExpDateStr] = useState<string>("");

  const [recipeDetails, setRecipeDetails] = useState<any>(null);
  
  const [inventory, setInventory] = useState<any[]>([]);
  const [calculatedMaterials, setCalculatedMaterials] = useState<any[]>([]);
  const [packagingMaterials, setPackagingMaterials] = useState<any[]>([]);
  
  const [isLoading, setIsLoading] = useState(false);
  const [isInvLoading, setIsInvLoading] = useState(true);

  const [docNo, setDocNo] = useState("");
  const [todayStr, setTodayStr] = useState("");

  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    setDocNo(`WO-${Date.now().toString().slice(-6)}`);
    setTodayStr(new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }));
  }, []);

  useEffect(() => {
    async function fetchInitialData() {
      const res = await getRecipeList();
      if (res.success) setRecipes(res.data); // 강제 선택 로직이 없으므로 빈칸으로 시작합니다.

      try {
        const { data, error } = await supabase
          .from("ecount_items")
          .select("prod_cd, prod_nm, total_qty")
          .order("prod_cd", { ascending: true });
        if (!error && data) {
          setInventory(
            data.map((item) => ({
              prodCd: item.prod_cd,
              prodNm: item.prod_nm,
              size: "-",
              qty: Number(item.total_qty || 0).toLocaleString(),
              unit: "EA",
            }))
          );
        }
      } catch (error) {
        console.error("재고 조회 실패:", error);
      } finally {
        setIsInvLoading(false);
      }
    }
    fetchInitialData();
  }, []);

  useEffect(() => {
    async function fetchDetails() {
      if (!selectedRecipeId) {
        setRecipeDetails(null);
        return;
      }
      setIsLoading(true);
      const res = await getRecipeDetails(selectedRecipeId);
      if (res.success) setRecipeDetails(res);
      setIsLoading(false);
    }
    fetchDetails();
  }, [selectedRecipeId]);

  useEffect(() => {
    if (recipeDetails && recipeDetails.materials && targetQty) {
      const baseBatchSize = recipeDetails.baseInfo?.base_batch_size || 1350;
      const ratioMultiplier = Number(targetQty) / baseBatchSize;

      const calculatedMats = recipeDetails.materials
        .filter((mat: any) => mat.material_type !== '부자재')
        .map((mat: any) => {
          const baseQty = Number(mat.input_qty);
          const requiredQty = baseQty * ratioMultiplier;

          // 원료명 키워드로 규격 사전에서 검색
          const specKey = Object.keys(MATERIAL_SPEC_MASTER).find(key => mat.material_name.includes(key));
          const unitSize = specKey ? MATERIAL_SPEC_MASTER[specKey] : 0;

          let fetchInstruction = "";
          if (unitSize > 0) {
            const unitCount = Math.ceil(requiredQty / unitSize);
            fetchInstruction = `${unitCount} EA`;
          } else {
            fetchInstruction = "[ 직접 확인 ]";
          }

          return {
            name: mat.material_name,
            requiredQty: requiredQty.toFixed(2),
            specSize: unitSize > 0 ? `${unitSize}kg` : "-",
            fetchInstruction: fetchInstruction
          };
        });
      setCalculatedMaterials(calculatedMats);

      const calculatedNetQty = Number(targetQty) * (1 - (lossRate / 100)); 
      
      // 🌟 14로 고정되었던 값을 사용자가 입력한 pouchWeight로 나누도록 변경
      const safeWeight = pouchWeight > 0 ? pouchWeight : 14; 
      const totalPouches = Math.floor((calculatedNetQty * 1000) / safeWeight); 
      
      setNetQty(Number(calculatedNetQty.toFixed(2)));
      setExpectedPouches(totalPouches);

      const getPackagingSpec = (keyword: string) => {
        const stockItem = inventory.find((inv: any) => inv.prodNm.includes(keyword));
        return stockItem ? stockItem.size : "-";
      };

      const dbPackMats = recipeDetails.materials.filter((mat: any) => mat.material_type === '부자재');
      
      let innerSpec = 50;
      let cartonSpec = 10;
      
      if (dbPackMats.length > 0) {
        const innerBoxMat = dbPackMats.find((m: any) => m.material_name.includes("단상자") || m.material_name.includes("인박스"));
        if (innerBoxMat && Number(innerBoxMat.packaging_unit) > 0) innerSpec = Number(innerBoxMat.packaging_unit);

        const cartonMat = dbPackMats.find((m: any) => m.material_name.includes("카톤") || m.material_name.includes("외박스"));
        if (cartonMat && Number(cartonMat.packaging_unit) > 0) cartonSpec = Number(cartonMat.packaging_unit);
      }

      const expInnerBoxes = Math.floor(totalPouches / innerSpec);
      const expCartons = Math.floor(expInnerBoxes / cartonSpec);
      
      setExpectedInnerBoxes(expInnerBoxes);
      setExpectedCartons(expCartons);

      if (dbPackMats.length > 0) {
        const newPackMats = dbPackMats.map((pack: any) => {
          let calcQtyStr = "";
          const originalName = pack.material_name || "";
          const pUnit = Number(pack.packaging_unit) || 1;
          
          // 🌟 화면에 출력될 아주 심플하고 깔끔한 이름
          let simpleName = originalName;

          if (originalName.includes("파우치") || originalName.includes("스틱") || originalName.includes("비닐") || originalName.includes("롤")) {
            simpleName = "파우치"; // 강제 덮어쓰기!
            if (pUnit > 1) { 
              const rollCount = Math.ceil(totalPouches / pUnit);
              calcQtyStr = `${rollCount.toLocaleString()} ${pack.input_unit || '롤'} (총 ${totalPouches.toLocaleString()} 포 분량)`;
            } else {
              calcQtyStr = `${totalPouches.toLocaleString()} ${pack.input_unit || '매'}`;
            }
          } else if (originalName.includes("단상자") || originalName.includes("인박스")) {
            simpleName = "단상자"; // 강제 덮어쓰기!
            const reqInnerBoxes = Math.ceil(totalPouches / innerSpec);
            calcQtyStr = `${reqInnerBoxes.toLocaleString()} ${pack.input_unit || '개'}`;
          } else if (originalName.includes("카톤") || originalName.includes("외박스")) {
            simpleName = "카톤박스"; // 강제 덮어쓰기!
            const reqInnerBoxes = Math.ceil(totalPouches / innerSpec);
            const reqCartons = Math.ceil(reqInnerBoxes / cartonSpec);
            calcQtyStr = `${reqCartons.toLocaleString()} ${pack.input_unit || '개'}`;
          } else {
            const qty = Math.ceil(totalPouches / (pUnit > 0 ? pUnit : 1));
            calcQtyStr = `${qty.toLocaleString()} ${pack.input_unit || 'EA'}`;
          }

          return {
            name: simpleName, // 🌟 표에는 이 깔끔한 이름이 출력됩니다.
            requiredQty: calcQtyStr,
            unit: "",
            spec: getPackagingSpec(originalName) // 이카운트 규격 검색용으로는 원래 긴 이름을 던져줍니다.
          };
        });
        setPackagingMaterials(newPackMats);
      } else {
        const reqInnerBoxes = Math.ceil(totalPouches / 50);
        const reqCartons = Math.ceil(reqInnerBoxes / 10);
        
        setPackagingMaterials([
          { name: "파우치", requiredQty: totalPouches.toLocaleString(), unit: "매", spec: getPackagingSpec("파우치") },
          { name: "단상자", requiredQty: reqInnerBoxes.toLocaleString(), unit: "개", spec: getPackagingSpec("단상자") },
          { name: "카톤박스", requiredQty: reqCartons.toLocaleString(), unit: "개", spec: getPackagingSpec("카톤박스") }
        ]);
      }

    } else {
      setCalculatedMaterials([]);
      setPackagingMaterials([]);
      setNetQty(0);
      setExpectedPouches(0);
      setExpectedInnerBoxes(0);
      setExpectedCartons(0);
    }
  }, [recipeDetails, targetQty, lossRate, pouchWeight, inventory]); 

  if (!isMounted) return null;

  return (
    <div className="max-w-5xl mx-auto py-6 sm:py-10 px-2 sm:px-4 font-sans print:py-0">
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 5mm; }
          html, body { 
            width: 100%; height: 100%; margin: 0; padding: 0; background: white; 
          }
          
          body * { visibility: hidden; }
          .print-container, .print-container * { visibility: visible; }

          .print-container {
            position: absolute;
            left: 0;
            top: 0;
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            box-sizing: border-box;
          }
          .no-print { display: none !important; }
        }
      `}</style>

      {/* 조작 패널 */}
      <div className="no-print bg-gray-100 border border-gray-300 rounded-lg p-4 sm:p-6 mb-6 sm:mb-8 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4 mb-4 border-b border-gray-300 pb-4">
          <div className="min-w-0">
            <h2 className="text-lg sm:text-xl font-bold text-gray-900">작업지시서 발행기</h2>
            <p className="text-sm text-gray-600 mt-1">제품과 수량, 중량, 로스율을 입력하면 정밀한 불출 지시서가 자동 생성됩니다.</p>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            {isInvLoading && <span className="text-sm font-bold text-blue-600 self-center mr-2">재고 불러오는 중...</span>}
            <button 
              onClick={() => window.print()}
              disabled={calculatedMaterials.length === 0}
              className="bg-blue-800 text-white px-5 py-2 font-bold rounded hover:bg-blue-900 disabled:opacity-50 transition-colors"
            >
              A4 인쇄/PDF 저장
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">생산 품목 선택</label>
            <select
              value={selectedRecipeId}
              onChange={(e) => setSelectedRecipeId(e.target.value)}
              className="w-full border text-black border-gray-300 rounded p-2 text-sm focus:outline-none focus:border-gray-500"
            >
              <option value="">품목을 선택해 주십시오</option>
              {recipes.map((r) => (
                <option key={r.id} value={r.id}>{r.product_name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">목표 생산량 (총 투입량 kg)</label>
            <input
              type="number"
              value={targetQty}
              onChange={(e) => setTargetQty(Number(e.target.value))}
              placeholder="예: 2000"
              className="w-full text-black border border-gray-300 rounded p-2 text-sm focus:outline-none focus:border-gray-500"
            />
          </div>
          
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">1포당 중량 (g/ml)</label>
            <input
              type="number"
              value={pouchWeight}
              onChange={(e) => setPouchWeight(Number(e.target.value))}
              placeholder="예: 14"
              className="w-full text-black border border-gray-300 rounded p-2 text-sm focus:outline-none focus:border-gray-500"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">예상 공정 로스율 (%)</label>
            <input
              type="number"
              step="0.1"
              value={lossRate}
              onChange={(e) => setLossRate(Number(e.target.value))}
              placeholder="예: 2"
              className="w-full text-black border border-gray-300 rounded p-2 text-sm focus:outline-none focus:border-gray-500"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">날인 문구 직접입력</label>
            <input
              type="text"
              value={expDateStr}
              onChange={(e) => setExpDateStr(e.target.value)}
              placeholder="예: 2028.04.04 까지"
              className="w-full text-black border border-gray-300 rounded p-2 text-sm focus:outline-none focus:border-gray-500"
            />
          </div>
        </div>
      </div>

      <A4MobileScaler className="print-container flex justify-center print:block print:w-full">
        <div className="bg-white w-[794px] print:w-full min-h-[1050px] print:min-h-0 border border-gray-400 print:border-none p-8 print:p-2 box-border text-black shadow-lg print:shadow-none">
          
          <div className="flex justify-between items-start mb-3">
            <div className="w-1/3">
              <div className="text-sm mb-1 font-bold">문서번호: {docNo}</div>
              <div className="text-sm font-bold">발행일자: {todayStr}</div>
            </div>
            <div className="w-1/3 text-center">
              <h1 className="text-3xl font-extrabold tracking-widest border-b-2 border-black inline-block pb-1">작업 지시서</h1>
              <div className="text-sm font-bold mt-1">(원·부자재 창고 불출용)</div>
            </div>
            <div className="w-1/3 flex justify-end">
              <table className="border-collapse border-2 border-black text-sm text-center w-32">
                <tbody>
                  <tr>
                    <td rowSpan={2} className="border border-black bg-gray-100 px-2 font-bold w-8 leading-tight">결<br/>재</td>
                    <td className="border border-black bg-gray-100 py-1 font-bold w-12">작 성</td>
                    <td className="border border-black bg-gray-100 py-1 font-bold w-12">승 인</td>
                  </tr>
                  <tr className="h-10 bg-white">
                    <td className="border border-black"></td>
                    <td className="border border-black"></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <table className="w-full border-collapse border-2 border-black text-[13px] mb-3">
            <tbody>
              <tr className="text-center bg-white h-7">
                <td className="border border-black font-bold bg-gray-100 w-[15%]">제품명</td>
                <td className="border border-black font-bold text-[14px] w-[35%] text-blue-900">
                  {recipeDetails ? recipeDetails.baseInfo?.product_name : ""}
                </td>
                <td className="border border-black font-bold bg-gray-100 w-[15%]">원료 투입량</td>
                <td className="border border-black font-bold text-[15px] w-[35%] text-blue-900">
                  {targetQty ? `${targetQty.toLocaleString()} kg` : ""}
                </td>
              </tr>
              <tr className="text-center bg-white h-7">
                <td className="border border-black font-bold bg-gray-100">공정 로스율</td>
                <td className="border border-black font-bold text-red-600">
                  {lossRate}% (가용: {netQty.toLocaleString()} kg)
                </td>
                <td className="border border-black font-bold bg-gray-100">예상 생산량</td>
                <td className="border border-black font-bold text-blue-700 text-[13px] tracking-tight">
                  약 {expectedPouches.toLocaleString()} 포 / {expectedInnerBoxes.toLocaleString()} 단상자 / {expectedCartons.toLocaleString()} 카톤
                </td>
              </tr>
            </tbody>
          </table>

          <div className="mb-3">
            <div className="font-bold text-sm bg-gray-100 border-2 border-b-0 border-black px-2 py-1">
              1. 원재료 창고 출고 지시
            </div>
            <table className="w-full border-collapse border-2 border-black text-[12px] text-center">
              <thead className="bg-gray-50">
                <tr className="h-6">
                  <th className="border border-black w-[5%]">No</th>
                  <th className="border border-black w-[25%]">원료명</th>
                  <th className="border border-black w-[15%]">투입 소요량(kg)</th>
                  <th className="border border-black w-[15%]">포장 규격</th>
                  <th className="border border-black w-[30%]">창고 불출 지시량 (예상)</th>
                  <th className="border border-black w-[10%]">불출 확인</th>
                </tr>
              </thead>
              <tbody className="bg-white">
                {calculatedMaterials.length > 0 ? (
                  calculatedMaterials.map((mat, idx) => (
                    <tr key={idx} className="h-7 hover:bg-gray-50">
                      <td className="border border-black font-bold text-gray-600">{idx + 1}</td>
                      <td className="border border-black font-bold text-left px-2 text-gray-900 truncate max-w-[150px]">{mat.name}</td>
                      <td className="border border-black font-bold text-blue-800">{mat.requiredQty}</td>
                      <td className="border border-black text-gray-700">{mat.specSize}</td>
                      <td className="border border-black font-bold bg-gray-50">{mat.fetchInstruction}</td>
                      <td className="border border-black text-lg">□</td>
                    </tr>
                  ))
                ) : (
                  <tr className="h-7"><td colSpan={6} className="border border-black text-gray-400">데이터가 없습니다.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mb-3">
            <div className="font-bold text-sm bg-gray-100 border-2 border-b-0 border-black px-2 py-1 flex justify-between items-center">
              <span>2. 부자재(포장재) 창고 출고 지시</span>
              <span className="text-[11px] font-normal text-gray-500 mr-1">* 로스율 {lossRate}% 가 차감된 수량입니다.</span>
            </div>
            <table className="w-full border-collapse border-2 border-black text-[12px] text-center">
              <thead className="bg-gray-50">
                <tr className="h-6">
                  <th className="border border-black w-[25%]">부자재명</th>
                  <th className="border border-black w-[20%]">이카운트 규격</th>
                  <th className="border border-black w-[25%]">필요 예상 수량</th>
                  <th className="border border-black w-[20%]">실제 출고 수량 (기입)</th>
                  <th className="border border-black w-[10%]">불출 확인</th>
                </tr>
              </thead>
              <tbody className="bg-white">
                {packagingMaterials.length > 0 ? (
                  packagingMaterials.map((pack, idx) => (
                    <tr key={idx} className="h-7 hover:bg-gray-50">
                      <td className="border border-black font-bold text-center px-2 text-gray-900 truncate max-w-[150px]">{pack.name}</td>
                      <td className="border border-black text-gray-700">{pack.spec}</td>
                      <td className="border border-black font-bold text-red-600">{pack.requiredQty}</td>
                      <td className="border border-black"></td>
                      <td className="border border-black text-lg">□</td>
                    </tr>
                  ))
                ) : (
                  <tr className="h-7"><td colSpan={5} className="border border-black text-gray-400">데이터가 없습니다.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mb-3">
            <div className="font-bold text-sm bg-gray-100 border-2 border-b-0 border-black px-2 py-1">
              3. 포장 라벨 및 날인기 세팅 가이드
            </div>
            <table className="w-full border-collapse border-2 border-black text-[12px] text-center">
              <tbody className="bg-white">
                <tr>
                  <td className="border border-black px-2 py-1 font-bold bg-gray-50 w-[25%] leading-tight">
                    날인 표기 문구<br/>
                    <span className="text-[10px] font-normal text-gray-600">(지시서 입력 사항)</span>
                  </td>
                  <td className="border border-black px-2 py-1 text-[22px] font-black tracking-widest text-blue-800">
                    {expDateStr || "(날인 문구 미입력)"}
                  </td>
                </tr>
                <tr>
                  <td className="border border-black p-1.5 font-bold bg-gray-50">작업자 준수사항</td>
                  <td className="border border-black p-1.5 text-left font-bold text-gray-800 px-4 leading-snug text-[11px]">
                    □ 파우치 및 단상자 날인 문구가 위 내용과 정확히 일치하는지 작업 전 반드시 대조할 것.<br/>
                    □ 본 생산 전 3회 이상 테스트 타발하여 번짐이나 누락 여부를 확인할 것.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="border-2 border-black p-2 text-[11px] leading-snug bg-white">
            <div className="font-bold mb-0.5">※ 창고 출고 주의사항</div>
            <div>1. 원료 출고 시 선입선출(FIFO) 원칙에 따라 소비기한이 가장 짧은 LOT부터 우선 불출할 것.</div>
            <div>2. 파손되거나 오염된 원부자재는 불출을 금하며 즉시 관리자에게 보고할 것.</div>
            <div>3. 모든 불출이 완료되면 우측 '불출 확인' 란에 체크하고 서명하여 생산팀으로 인계할 것.</div>
          </div>

        </div>
      </A4MobileScaler>

    </div>
  );
}
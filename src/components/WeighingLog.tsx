"use client"
import React, { useState, useEffect } from "react";
import { supabase } from "../utils/supabase";
import { getRecipeList, getRecipeDetails } from "@/app/actions/recipe"; 
import { getSessionId, getRecentPurchases } from "@/app/actions/ecount";

export default function WeighingLog({ selectedOrder, signatures, openSignModal }: any) {
  
  const [dbRecipe, setDbRecipe] = useState<any[]>([]);
  const [isLoadingRecipe, setIsLoadingRecipe] = useState(true);

  const fallbackRecipeDB: Record<string, { name: string, ratio: number }[]> = {
    "세리컷 프레소 V2": [
      { name: "커피원두 추출액", ratio: 22.94 },
      { name: "난소화성말토덱스트린", ratio: 15.38 },
      { name: "가르시니아캄보지아추출물65%", ratio: 3.58 },
      { name: "커피농축액", ratio: 8.50 },
      { name: "커피분말", ratio: 9.30 },
      { name: "비타민C", ratio: 0.24 },
      { name: "커피향JK503125", ratio: 0.06 },
      { name: "복합허브추출물E", ratio: 0.05 },
      { name: "폴리덱스트로스", ratio: 0.05 },
      { name: "탄산칼륨(무수)", ratio: 0.03 },
      { name: "효모추출물", ratio: 0.01 },
      { name: "정제수", ratio: 39.86 }
    ],
    "유기농 배도라지 스틱": [
      { name: "도라지 농축액", ratio: 45.00 },
      { name: "배 농축액", ratio: 35.00 },
      { name: "유기농 정제수", ratio: 20.00 }
    ]
  };

  // 🌟 구버전 캐시 무시하고 즉시 최신 DB를 바라보게 강제 리셋 (v3)
  const storageKey = `order_${selectedOrder?.id || 'temp'}_weighing_v3`;

  const [formData, setFormData] = useState<Record<string, any>>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(storageKey);
      if (saved) return JSON.parse(saved);
    }
    return {};
  });

  const currentTotalWeight = Number(formData.totalBaseWeight || selectedOrder?.qty || 1350);

  // 1. 레시피 정보 불러오기
  useEffect(() => {
    async function fetchRealRecipe() {
      setIsLoadingRecipe(true);

      try {
        let fetchedFromDB = false;

        if (selectedOrder?.recipeId) {
          const listRes = await getRecipeList();
          let baseBatchSize = 1350; 
          
          if (listRes.success) {
            const matchingRecipe = listRes.data.find((r: any) => r.id === selectedOrder.recipeId);
            if (matchingRecipe && matchingRecipe.base_batch_size) {
              baseBatchSize = matchingRecipe.base_batch_size;
            }
          }

          const detailsRes = await getRecipeDetails(selectedOrder.recipeId);
          
          if (detailsRes.success && detailsRes.materials && detailsRes.materials.length > 0) {
            const calculated = detailsRes.materials
              .filter((mat: any) => mat.material_type !== '부자재') 
              .map((mat: any) => {
                const baseQty = Number(mat.input_qty);
                const percentage = (baseQty / baseBatchSize) * 100; 

                let pType = mat.process_type;
                if (mat.material_name.includes("추출액") || mat.material_name.includes("농축액")) {
                  pType = "mixing";
                } else if (!pType) {
                  pType = mat.material_name.includes("원두") ? "grinding" : "mixing";
                }

                return {
                  name: mat.material_name,
                  ratio: percentage,
                  processType: pType
                };
              });
            
            setDbRecipe(calculated);
            fetchedFromDB = true;
          }
        }

        if (!fetchedFromDB && selectedOrder?.itemName) {
          const fallbackData = fallbackRecipeDB[selectedOrder.itemName];
          if (fallbackData) {
            const mappedFallback = fallbackData.map(m => ({ ...m, processType: 'mixing' }));
            setDbRecipe(mappedFallback);
          } else {
            setDbRecipe([]);
          }
        }
      } catch (err: any) {
        console.error("레시피 로딩 실패:", err.message);
        setDbRecipe([]);
      } finally {
        setIsLoadingRecipe(false);
      }
    }

    fetchRealRecipe();
  }, [selectedOrder?.recipeId, selectedOrder?.itemName]);

  // 화면에 보여줄 배합 리스트 (원두 분쇄 항목 제외)
  const mixingList = dbRecipe
    .map((mat, idx) => ({ ...mat, originalIndex: idx }))
    .filter(m => m.processType !== 'grinding');

  // 2. Supabase 재고 연동 (FIFO 선입선출 및 100% 완전 일치 검색)
  useEffect(() => {
    async function autoFillData() {
      if (dbRecipe.length === 0) return;

      const getStrictName = (name: string) => {
        if (!name) return "";
        return name
          .replace(/^[원부자반]\)\s*/, '') 
          .replace(/\[.*?\]/g, '')        
          .replace(/\s+/g, '')            
          .toLowerCase();                 
      };

      let autoFilledData: Record<string, any> = {};
      let isModified = false;

      dbRecipe.forEach((mat, idx) => {
        if (mat.processType === 'grinding') return; 
        
        const useKey = `usage_${idx}`;
        const calculatedBase = Number((currentTotalWeight * (mat.ratio / 100)).toFixed(2));
        
        if (formData[useKey] === undefined || formData[useKey] === "") {
          autoFilledData[useKey] = calculatedBase;
          isModified = true;
        }
      });

      if (isModified) {
        setFormData(prev => ({ ...prev, ...autoFilledData }));
      }

      try {
        const { data: inventoryData, error } = await supabase
          .from('ecount_inventory')
          .select('*')
          .gt('quantity', 0)
          .order('lot_no', { ascending: true }); 

        if (error) throw error;

        if (inventoryData && inventoryData.length > 0) {
          let sbAutoFill: Record<string, any> = {};
          let isSbModified = false;

          dbRecipe.forEach((mat, idx) => {
            if (mat.processType === 'grinding') return;

            const isExtractMat = mat.name.includes("커피") && mat.name.includes("추출액");
            
            const matchedItems = inventoryData.filter((inv: any) => {
              if (isExtractMat) return false; 

              const safeMatName = getStrictName(mat.name);
              const safeInvName = getStrictName(inv.item_name);
              return safeInvName === safeMatName; 
            });

            if (matchedItems.length > 0) {
              const calculatedBase = Number((currentTotalWeight * (mat.ratio / 100)).toFixed(2));
              let remainingReq = calculatedBase;
              let usedLots: string[] = [];
              let usedExps: string[] = [];
              let usedQtys: string[] = [];

              for (const item of matchedItems) {
                if (remainingReq <= 0) break;

                const stockQty = Number(item.quantity);
                if (isNaN(stockQty) || stockQty <= 0) continue;

                const takeQty = Math.min(remainingReq, stockQty);
                
                if (item.lot_no) usedLots.push(item.lot_no);
                if (item.expiry_date) usedExps.push(item.expiry_date);
                usedQtys.push(takeQty.toFixed(2));

                remainingReq -= takeQty;
              }

              if (usedLots.length > 0) {
                const testNumKey = `testNum_${idx}`;
                const expKey = `expDate_${idx}`;
                const useKey = `usage_${idx}`;

                if (!formData[testNumKey]) {
                  sbAutoFill[testNumKey] = usedLots.join(" / ");
                  isSbModified = true;
                }
                
                if (!formData[expKey]) {
                  const uniqueExps = Array.from(new Set(usedExps));
                  sbAutoFill[expKey] = uniqueExps.join(" / ");
                  isSbModified = true;
                }

                if ((!formData[useKey] || formData[useKey] == calculatedBase) && usedQtys.length > 1) {
                  sbAutoFill[useKey] = usedQtys.join(" / ");
                  isSbModified = true;
                }
              }
            }
          });

          if (isSbModified) {
            setFormData(prev => ({ ...prev, ...sbAutoFill }));
          }
        }
      } catch (error) {
        console.error("Supabase 데이터 연동 실패:", error);
      }
    }
    
    autoFillData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbRecipe, currentTotalWeight]);

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(formData));
  }, [formData, storageKey]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSaveToCloud = async () => {
    try {
      const { error } = await supabase
        .from('manufacturing_logs')
        .insert({
          log_type: 'WEIGHING_LOG', 
          form_data: formData       
        });

      if (error) throw error;
      alert("데이터가 클라우드 DB에 안전하게 저장되었습니다.");
    } catch (error: any) {
      alert("저장 실패: " + error.message);
    }
  };

  return (
    <div className="relative flex flex-col items-center gap-4">
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 0; }
          body { margin: 0; padding: 0; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .no-print { display: none !important; }
        }
      `}</style>

      {/* 🌟 제어 패널 (칭량기록서용 폼 리셋 버튼 포함) */}
      <div className="no-print bg-white border-2 border-gray-300 rounded-lg p-5 w-[794px] shadow-md flex justify-between items-center mt-6">
        <div>
          <h2 className="text-xl font-black text-gray-800 tracking-tight">원료 칭량 연동 컨트롤러</h2>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => {
              if (window.confirm("입력된 내용을 모두 지우고 DB에서 최신 재고를 다시 불러오시겠습니까?")) {
                localStorage.removeItem(storageKey);
                window.location.reload();
              }
            }} 
            className="bg-gray-500 text-white px-4 py-2 font-bold rounded shadow hover:bg-gray-600"
          >
            🔄 폼 초기화
          </button>
          <button onClick={() => window.print()} className="bg-gray-800 text-white px-4 py-2 font-bold rounded shadow hover:bg-gray-900 ml-2">
            🖨️ 인쇄하기
          </button>
        </div>
      </div>

      <div className="w-[794px] h-[1123px] mx-auto text-black font-sans bg-white border border-gray-400 print:border-none p-10 flex flex-col justify-start gap-6 box-border overflow-hidden shrink-0 shadow-sm print:shadow-none" style={{ letterSpacing: '-0.5px' }}>
        
        {/* 1. 상단 결재 및 기본 정보 폼 */}
        <table className="w-full border-collapse border-2 border-black text-center text-[14px] table-fixed">
          <colgroup><col className="w-[50%]"/><col className="w-[6%]"/><col className="w-[14.6%]"/><col className="w-[14.6%]"/><col className="w-[14.6%]"/></colgroup>
          <tbody>
            <tr>
              <td className="border border-black py-4 text-[30px] font-black tracking-widest bg-white">원료 칭량 기록서</td>
              <td rowSpan={4} className="border border-black font-bold bg-gray-50 text-[13px] leading-tight text-center">결<br/><br/>재</td>
              <td className="border border-black py-1.5 font-bold bg-gray-50">작 성</td>
              <td className="border border-black py-1.5 font-bold bg-gray-50">검 토</td>
              <td className="border border-black py-1.5 font-bold bg-gray-50">승 인</td>
            </tr>
            <tr>
              <td className="border border-black py-2.5 px-5 text-left font-bold text-[16px]">제품명 : <span className="text-blue-800">{selectedOrder?.itemName || ""}</span></td>
              <td rowSpan={3} className="border border-black relative cursor-pointer" onClick={() => openSignModal("칭량_작성")}>
                {signatures?.["칭량_작성"] ? <img src={signatures["칭량_작성"]} alt="작성" className="h-16 w-full object-contain absolute inset-0 m-auto p-1" /> : <span className="text-gray-300 text-xs block mt-6">(서명)</span>}
              </td>
              <td rowSpan={3} className="border border-black relative cursor-pointer" onClick={() => openSignModal("칭량_검토")}>
                {signatures?.["칭량_검토"] ? <img src={signatures["칭량_검토"]} alt="검토" className="h-16 w-full object-contain absolute inset-0 m-auto p-1" /> : <span className="text-gray-300 text-xs block mt-6">(서명)</span>}
              </td>
              <td rowSpan={3} className="border border-black relative cursor-pointer" onClick={() => openSignModal("칭량_승인")}>
                {signatures?.["칭량_승인"] ? <img src={signatures["칭량_승인"]} alt="승인" className="h-16 w-full object-contain absolute inset-0 m-auto p-1" /> : <span className="text-gray-300 text-xs block mt-6">(서명)</span>}
              </td>
            </tr>
            <tr>
              <td className="border border-black py-2 px-5 text-left font-bold text-[16px]">제조지시기록량 : <input type="number" name="totalBaseWeight" value={formData.totalBaseWeight ?? (selectedOrder?.qty || 1350)} onChange={handleChange} className="outline-none bg-transparent w-20 text-center font-bold text-blue-800 border-b border-gray-300" /> kg</td>
            </tr>
            <tr>
              <td className="border border-black py-2 px-5 text-left font-bold text-[16px]">칭량일 : <span className="text-blue-800 font-extrabold">{selectedOrder?.date?.split('-')[0] || '2026'}</span>년 <span className="text-blue-800 font-extrabold">{selectedOrder?.date?.split('-')[1] || ''}</span>월 <span className="text-blue-800 font-extrabold">{selectedOrder?.date?.split('-')[2] || ''}</span>일</td>
            </tr>
          </tbody>
        </table>

        {/* 2. 메인 재고 및 레시피 테이블 */}
        <table className="w-full border-collapse border-2 border-black text-center text-[13px] table-fixed">
          <colgroup><col className="w-[5%]"/><col className="w-[18%]"/><col className="w-[12%]"/><col className="w-[8%]"/><col className="w-[8%]"/><col className="w-[8%]"/><col className="w-[13%]"/><col className="w-[8%]"/><col className="w-[8%]"/><col className="w-[12%]"/></colgroup>
          <thead className="bg-gray-50 font-bold border-b border-black">
            <tr className="h-9">
              <th className="border-r border-black">번호</th><th className="border-r border-black">원료명</th><th className="border-r border-black">시험번호</th><th className="border-r border-black">비율(%)</th><th className="border-r border-black">기준량</th><th className="border-r border-black">사용량</th><th className="border-r border-black">소비기한</th><th className="border-r border-black">칭량1</th><th className="border-r border-black">칭량2</th><th>비고</th>
            </tr>
          </thead>
          <tbody className="bg-white">
            {isLoadingRecipe ? (<tr><td colSpan={10} className="p-8 text-center text-gray-500 font-bold text-lg">로딩 중...</td></tr>) : mixingList.length > 0 ? (
              mixingList.map((mat, displayIdx) => {
                const mIdx = mat.originalIndex;
                const isExtractMat = mat.name.includes("커피") && mat.name.includes("추출액");

                return (
                  <tr key={`w-mat-${mIdx}`} className="h-9 border-b border-gray-300">
                    <td className="border-r border-black font-extrabold">{displayIdx + 1}</td>
                    <td className="border-r border-black font-bold text-[12px] px-2 text-center bg-yellow-50 truncate">{mat.name}</td>
                    <td className="border-r border-black p-0">
                      <input type="text" name={`testNum_${mIdx}`} value={formData[`testNum_${mIdx}`] || ""} onChange={handleChange} readOnly={isExtractMat} tabIndex={isExtractMat ? -1 : undefined} className={`w-full h-full text-center outline-none ${isExtractMat ? 'bg-gray-100 text-gray-500' : 'bg-transparent'}`} />
                    </td>
                    <td className="border-r border-black font-bold text-blue-700">{mat.ratio.toFixed(2)}%</td>
                    <td className="border-r border-black font-bold text-blue-700">{(currentTotalWeight * (mat.ratio / 100)).toFixed(2)}</td>
                    <td className="border-r border-black p-0"><input type="text" name={`usage_${mIdx}`} value={formData[`usage_${mIdx}`] || ""} onChange={handleChange} className="w-full h-full text-center outline-none bg-transparent font-extrabold text-red-600" /></td>
                    <td className="border-r border-black p-0">
                      <input type="text" name={`expDate_${mIdx}`} value={formData[`expDate_${mIdx}`] || ""} onChange={handleChange} readOnly={isExtractMat} tabIndex={isExtractMat ? -1 : undefined} className={`w-full h-full text-center outline-none text-[11px] ${isExtractMat ? 'bg-gray-100 text-gray-500' : 'bg-transparent'}`} />
                    </td>
                    <td className="border-r border-black p-0"><input type="text" name={`weigh1_${mIdx}`} value={formData[`weigh1_${mIdx}`] || ""} onChange={handleChange} className="w-full h-full text-center outline-none bg-transparent" /></td>
                    <td className="border-r border-black p-0"><input type="text" name={`weigh2_${mIdx}`} value={formData[`weigh2_${mIdx}`] || ""} onChange={handleChange} className="w-full h-full text-center outline-none bg-transparent" /></td>
                    <td className="p-0"><input type="text" name={`note_${mIdx}`} value={formData[`note_${mIdx}`] || ""} onChange={handleChange} className="w-full h-full text-center outline-none bg-transparent text-[11px]" /></td>
                  </tr>
                );
              })
            ) : null}
            {/* 🌟 여기서 빈 칸 생성 개수를 딱 12칸 기준으로 고정했습니다 */}
            {Array.from({ length: Math.max(0, 12 - mixingList.length) }).map((_, i) => (
              <tr key={i} className="h-9 border-b border-gray-200">
                <td className="border-r border-black"></td><td className="border-r border-black bg-yellow-50/5"></td><td colSpan={8} className="border-r border-black"></td>
              </tr>
            ))}
            <tr className="h-10 bg-gray-100 border-t border-black font-bold">
              <td colSpan={3} className="border-r border-black text-center">합계</td>
              <td className="border-r border-black text-blue-700">100%</td>
              <td className="border-r border-black text-blue-700">{currentTotalWeight.toLocaleString()}</td>
              <td colSpan={5}></td>
            </tr>
          </tbody>
        </table>

        {/* 3. 하단 기업 정보 테이블 */}
        <table className="w-full border-collapse border-2 border-black text-center text-[13px] table-fixed">
          <colgroup><col className="w-[14%]"/><col className="w-[22%]"/><col className="w-[14%]"/><col className="w-[14%]"/><col className="w-[14%]"/><col className="w-[22%]"/></colgroup>
          <tbody>
            <tr>
              <td className="border border-black py-1.5 bg-gray-200 font-bold">양식번호</td><td className="border border-black py-1.5 bg-gray-200 font-bold">기록명</td><td className="border border-black py-1.5 bg-gray-200 font-bold">기록주기</td><td className="border border-black py-1.5 bg-gray-200 font-bold">보관부서</td><td className="border border-black py-1.5 bg-gray-200 font-bold">보존년한</td><td rowSpan={2} className="border border-black text-[14px] tracking-wide font-black bg-white align-middle">㈜BEANSHEAL</td>
            </tr>
            <tr className="bg-white">
              <td className="border border-black py-2.5 font-bold">G-03-06-01</td><td className="border border-black py-2.5 font-bold">원료칭량기록서</td><td className="border border-black py-2.5 font-bold">발생시</td><td className="border border-black py-2.5 font-bold">제조관리부</td><td className="border border-black py-2.5 font-bold">3년</td>
            </tr>
          </tbody>
        </table>

      </div>
    </div>
  );
}
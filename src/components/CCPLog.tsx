"use client";
import React, { useState, useEffect } from "react";
import { supabase } from "../utils/supabase";

export default function CCPLog({ selectedOrder, signatures, openSignModal }: any) {

  // 🌟 마법의 제품 스펙 DB
  const ccpSpecDB: Record<string, { type: string, filter: string }> = {
    "세리컷 프레소 V2": { type: "액상커피", filter: "1㎛" },
    "유기농 배도라지 스틱": { type: "액상차/과채주스", filter: "40mesh" }
  };

  const currentSpec = selectedOrder?.itemName ? ccpSpecDB[selectedOrder.itemName] : null;

  const storageKey = `order_${selectedOrder?.id || 'temp'}_ccp`;

  const [formData, setFormData] = useState<Record<string, any>>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(storageKey);
      if (saved) return JSON.parse(saved);
    }
    return {};
  });

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(formData));
  }, [formData, storageKey]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const finalValue = type === 'checkbox' ? (e.target as HTMLInputElement).checked : value;
    
    setFormData(prev => ({
      ...prev,
      [name]: finalValue
    }));
  };

  const handleSaveToCloud = async () => {
    try {
      const { error } = await supabase
        .from('manufacturing_logs')
        .insert({
          log_type: 'CCP_LOG', 
          form_data: formData       
        });

      if (error) throw error;
      alert("데이터가 클라우드 DB에 안전하게 저장되었습니다.");
    } catch (error: any) {
      alert("저장 실패 : " + error.message);
    }
  };

  return (
    <div className="relative">
      {/* 🌟 인쇄 전용 스타일: 여백 0, 배경색 인쇄 허용, no-print 숨김 처리 */}
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 0; }
          body { margin: 0; padding: 0; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .no-print { display: none !important; }
        }
      `}</style>

      {/* 🌟 A4 황금 규격(794x1123) 적용 및 overflow-hidden으로 유령 페이지 완벽 차단 */}
      <div className="w-[794px] h-[1123px] mx-auto text-black font-sans bg-white border border-gray-400 print:border-none p-10 flex flex-col justify-start box-border overflow-hidden shrink-0 shadow-sm print:shadow-none relative" style={{ letterSpacing: '-0.5px' }}>
        

        {/* 🌟 전체 폼을 감싸는 두꺼운 테두리 (내부 요소가 A4 길이에 꽉 차게 끔 h-full 적용) */}
        <div className="border-2 border-black w-full flex flex-col text-[13px] h-full">

          {/* 1. 상단 타이틀 및 결재란 */}
          <table className="w-full border-collapse text-center shrink-0">
            <tbody>
              <tr>
                <td rowSpan={2} className="bg-[#dce6f2] font-black text-[22px] py-4 leading-tight">
                  중요관리점(CCP-2P) 모니터링일지<br />[여과공정]
                </td>
                <td rowSpan={2} className="border-l border-black w-8 font-bold bg-[#f8f9fa] text-xs leading-tight">결<br/><br/>재</td>
                <td className="border-l border-b border-black w-20 font-bold bg-[#f8f9fa]">작성</td>
                <td className="border-l border-b border-black w-20 font-bold bg-[#f8f9fa]">승인</td>
              </tr>
              <tr className="h-[70px] bg-white">
                <td className="border-l border-black relative cursor-pointer hover:bg-yellow-50" onClick={() => openSignModal("CCP_작성")}>
                  {signatures?.["CCP_작성"] ? <img src={signatures["CCP_작성"]} alt="작성" className="h-full w-full object-contain absolute inset-0 m-auto p-1" /> : <span className="absolute bottom-1 right-2 text-gray-300 text-[10px]">(서명)</span>}
                </td>
                <td className="border-l border-dashed border-black relative cursor-pointer hover:bg-yellow-50" onClick={() => openSignModal("CCP_승인")}>
                  {signatures?.["CCP_승인"] ? <img src={signatures["CCP_승인"]} alt="승인" className="h-full w-full object-contain absolute inset-0 m-auto p-1" /> : <span className="absolute bottom-1 right-2 text-gray-300 text-[10px]">(서명)</span>}
                </td>
              </tr>
            </tbody>
          </table>

          {/* 2. 기본 정보 및 기준 */}
          <table className="w-full border-collapse text-center border-t-2 border-black shrink-0">
            <colgroup><col width="12%"/><col width="38%"/><col width="12%"/><col width="38%"/></colgroup>
            <tbody>
              <tr>
                <td className="border-r border-b border-black bg-[#dce6f2] font-bold py-1.5">작성일자</td>
                <td className="border-r border-b border-black">
                  <input type="date" name="ccpDate" value={formData.ccpDate ?? (selectedOrder?.date || "")} onChange={handleChange} className="w-full text-center outline-none bg-transparent font-bold text-blue-800"/>
                </td>
                <td className="border-r border-b border-black bg-[#dce6f2] font-bold">점검자</td>
                <td className="border-b border-black">
                  <input type="text" name="inspector" value={formData.inspector || ""} onChange={handleChange} className="w-full text-center outline-none bg-transparent"/>
                </td>
              </tr>
              <tr>
                <td rowSpan={2} className="border-r border-b border-black bg-[#dce6f2] font-bold">현재기준</td>
                <td rowSpan={2} className="border-r border-b border-black bg-[#dce6f2] font-bold">여과필터 : 파손없음</td>
                <td colSpan={2} className={`border-b border-black font-bold py-1.5 ${currentSpec?.type === "액상커피" ? "bg-yellow-100 text-red-600 font-extrabold" : "bg-[#dce6f2]"}`}>
                  액상커피 : 여과필터 pore size : 1㎛
                </td>
              </tr>
              <tr>
                <td colSpan={2} className={`border-b border-black font-bold py-1.5 ${currentSpec?.type === "액상차/과채주스" ? "bg-yellow-100 text-red-600 font-extrabold" : "bg-[#dce6f2]"}`}>
                  액상차/과채주스 : 40mesh 이상
                </td>
              </tr>
              <tr>
                <td className="border-r border-black bg-[#dce6f2] font-bold py-1.5">주 기</td>
                <td colSpan={3} className="font-bold">작업시작 전 , 작업종료후, 품목교체시</td>
              </tr>
            </tbody>
          </table>

          {/* 3. 모니터링 방법 */}
          <table className="w-full border-collapse border-t-2 border-black text-[12px] shrink-0">
            <colgroup><col width="12%"/><col width="78%"/><col width="10%"/></colgroup>
            <tbody>
              <tr>
                <td rowSpan={4} className="border-r border-black bg-[#dce6f2] text-center font-bold">방 법</td>
                <td className="border-b border-black py-1 px-3 font-bold text-[13px]">○ 필터(여과 터)사이즈 확인 및 기록</td>
                <td rowSpan={4} className="border-l border-black border-dashed"></td>
              </tr>
              <tr>
                <td className="border-b border-black py-1 px-3 text-gray-700">모니터링 담당자는 필터(여과필터)사이즈를 확인하여 CCP-2P 모니터링 일지에 기록한다.</td>
              </tr>
              <tr>
                <td className="border-b border-black py-1 px-3 font-bold text-[13px]">○ 카트리지 여과필터 이상(파손)여부 확인</td>
              </tr>
              <tr>
                <td className="py-1 px-3 text-gray-700">모니터링 담당자는 필터(여과망)이상(파손)여부를 확인하여 CCP-2P 모니터링 일지에 기록한다.</td>
              </tr>
            </tbody>
          </table>

          {/* 4. 데이터 기록 표 */}
          <table className="w-full border-collapse border-t-2 border-black text-center text-[13px] shrink-0">
            <thead className="bg-[#dce6f2] font-bold">
              <tr>
                <th className="border-r border-b border-black py-1.5 w-[20%]">품 명</th>
                <th className="border-r border-b border-black w-[15%]">측정시간</th>
                <th className="border-r border-b border-black w-[15%]">필터사이즈</th>
                <th className="border-r border-b border-black w-[20%]">필터파손여부</th>
                <th className="border-r border-b border-black w-[20%] leading-tight">판정<br/><span className="text-[11px] font-normal">(적합/부적합)</span></th>
                <th className="border-b border-black w-[10%]">서명</th>
              </tr>
            </thead>
            <tbody>
              {[1,2,3,4,5].map((_, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="border-r border-b border-black p-0 h-[26px]">
                    <input type="text" name={`ccpItem_${i}`} value={formData[`ccpItem_${i}`] ?? (i === 0 ? selectedOrder?.itemName : "")} onChange={handleChange} className="w-full h-full text-center outline-none bg-transparent font-bold text-blue-800"/>
                  </td>
                  <td className="border-r border-b border-black p-0">
                    <div className="flex justify-center items-center h-full text-gray-700">
                      <input type="text" name={`ccpTimeH_${i}`} value={formData[`ccpTimeH_${i}`] || ""} onChange={handleChange} className="w-6 text-right outline-none bg-transparent font-bold" />
                      <span className="font-extrabold mx-0.5">:</span>
                      <input type="text" name={`ccpTimeM_${i}`} value={formData[`ccpTimeM_${i}`] || ""} onChange={handleChange} className="w-6 text-left outline-none bg-transparent font-bold" />
                    </div>
                  </td>
                  <td className="border-r border-b border-black p-0">
                    <input type="text" name={`ccpFilter_${i}`} value={formData[`ccpFilter_${i}`] ?? (i === 0 && currentSpec ? currentSpec.filter : "")} onChange={handleChange} className="w-full h-full text-center outline-none bg-transparent font-bold text-blue-800"/>
                  </td>
                  <td className="border-r border-b border-black p-0">
                    <input type="text" name={`ccpBroken_${i}`} value={formData[`ccpBroken_${i}`] ?? (i === 0 ? "없음" : "")} onChange={handleChange} className="w-full h-full text-center outline-none bg-transparent text-gray-700"/>
                  </td>
                  <td className="border-r border-b border-black font-extrabold text-sm tracking-widest p-0 align-middle">
                    <select name={`ccpResult_${i}`} value={formData[`ccpResult_${i}`] || ""} onChange={handleChange} className="w-full h-full text-center [text-align-last:center] outline-none bg-transparent cursor-pointer font-bold appearance-none">
                      <option value="text-">O / X</option>
                      <option value="O" className="text-blue-600">O (적합)</option>
                      <option value="X" className="text-red-600">X (부적합)</option>
                    </select>
                  </td>
                  <td className="border-b border-black p-0 border-l border-dashed">
                    <input type="text" name={`ccpSign_${i}`} value={formData[`ccpSign_${i}`] || ""} onChange={handleChange} className="w-full h-full text-center outline-none bg-transparent"/>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* 5. 개선조치방법 (flex-1로 남는 공간을 자연스럽게 채우도록 설정) */}
          <table className="w-full border-collapse border-t-2 border-black text-[12px] flex-1 flex flex-col">
            <colgroup><col width="12%"/><col width="78%"/><col width="10%"/></colgroup>
            <tbody className="flex-1 flex flex-col w-full">
              <tr className="flex flex-1 w-full">
                <td className="border-r border-black bg-[#dce6f2] w-[12%] text-center font-bold flex items-center justify-center">개선조치<br/>방법</td>
                <td className="py-2 px-3 leading-relaxed text-gray-800 tracking-tight w-[78%] flex flex-col justify-center">
                  <div className="font-bold text-[13px] mb-0.5">○ 필터 파손 및 사이즈 이상 발견 시</div>
                  <div className="pl-2">- 모니터링 담당자는 작업 시작을 보류한 후 생산팀장에게 보고</div>
                  <div className="pl-2 text-gray-600">▽ 작업 시작 전 필터 파손 또는 사이즈 이상 발견 시</div>
                  <div className="pl-4">- 필터를 교체</div>
                  <div className="pl-2 text-gray-600">▽ 작업 종료 후 필터 파손 및 사이즈 이상 발견 시</div>
                  <div className="pl-4">- 필터를 교체</div>
                  <div className="pl-4">- 이탈 시간을 확인하여 병입된 제품에 대해서 부적합 보관장소에 보관 후 전수 검사</div>
                  <div className="pl-4">- 전수 검사 후 이상 없는 것으로 확인된 제품에 대해 출고를 진행하고, 이물이 발견된 제품은 폐기.</div>
                  <div className="w-full border-t border-dashed border-gray-300 my-2"></div>
                  <div className="font-bold text-[13px] mb-0.5">○ 필터 확인 중 주요 이물(금속 조각 등) 발견 시</div>
                  <div className="pl-2">- 모니터링 담당자는 즉시 생산팀장에게 보고 한 후 필터 파손 여부 확인 - 파손 발견 시 즉시 당일 생산</div>
                  <div className="pl-4">제품을 출고 보류 조치하고 전수 검사를 실시</div>
                  <div className="pl-2">- 이상 없는 것으로 확인된 제품에 대해 출고를 진행하고, 이물 발견 제품은 폐기</div>
                  <div className="pl-2">- 필터 파손 여부 확인 시 파손 및 이상 없을 경우, 당일 생산 제품은 출고를 진행.</div>
                  <div className="w-full border-t border-dashed border-gray-300 my-2"></div>
                  <div className="font-bold text-[13px] mb-0.5">○ 공통 : 개선 조치 후</div>
                  <div className="pl-2">- 모니터링 담당자는 개선조치 내용을 기록, 생산팀장 및 품질관리팀장은 조치 내용을</div>
                  <div className="pl-4">HACCP팀장에게 보고하고 개선조치 결과를 기록, 관리한다.</div>
                </td>
                <td className="border-l border-black border-dashed w-[10%]"></td>
              </tr>
            </tbody>
          </table>

          {/* 6. 하단 이탈 기록 (높이를 120px 정도로 여유있게 주어 공간을 꽉 채움) */}
          <table className="w-full border-collapse border-t-2 border-black text-center text-[13px] shrink-0">
            <thead className="bg-[#dce6f2] font-bold">
              <tr>
                <th className="border-r border-b border-black py-1.5 w-[35%]">현재기준 이탈내용</th>
                <th className="border-r border-b border-black w-[40%]">개선조치 및 결과</th>
                <th className="border-r border-b border-black w-[15%]">조치자</th>
                <th className="border-b border-black w-[10%]">확 인</th>
              </tr>
            </thead>
            <tbody>
              <tr className="h-[120px]">
                <td className="border-r border-black p-0">
                  <textarea name="deviationContent" value={formData.deviationContent || ""} onChange={handleChange} className="w-full h-full p-2 outline-none resize-none bg-transparent"/>
                </td>
                <td className="border-r border-black p-0">
                  <textarea name="actionResult" value={formData.actionResult || ""} onChange={handleChange} className="w-full h-full p-2 outline-none resize-none bg-transparent"/>
                </td>
                <td className="border-r border-black p-0">
                  <input type="text" name="actionPerson" value={formData.actionPerson || ""} onChange={handleChange} className="w-full h-full text-center outline-none bg-transparent"/>
                </td>
                <td className="border-l border-dashed border-black p-0">
                  <input type="text" name="actionConfirm" value={formData.actionConfirm || ""} onChange={handleChange} className="w-full h-full text-center outline-none bg-transparent"/>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
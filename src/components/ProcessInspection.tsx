"use client"
import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

export default function ProcessInspection({ selectedOrder, signatures, openSignModal }: any) {
  
  const specDB: Record<string, any> = {
    "세리컷 프레소 V2": {
      totalWeight: "1350",
      brix: "10.0 ± 1.0",
      sg: "비중 1.152",
      targetVol: "14ml=16.128g",
      minVol: "13.58 ml =",
      minWeight: "15.65g"
    },
    "유기농 배도라지 스틱": {
      totalWeight: "1000",
      brix: "15.0 ± 1.0",
      sg: "비중 1.050",
      targetVol: "10ml=10.5g",
      minVol: "9.7 ml =",
      minWeight: "10.1g"
    }
  };

  const currentSpec = selectedOrder?.itemName ? specDB[selectedOrder.itemName] || specDB["세리컷 프레소 V2"] : specDB["세리컷 프레소 V2"];

  const storageKey = `order_${selectedOrder?.id}_process`;

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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
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
          log_type: 'PROCESS_INSPECTION',
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
      {/* 🌟 중복되던 복잡한 스타일 태그를 제거하고 기본 인쇄 세팅만 남김 */}
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 0; }
          body { margin: 0; padding: 0; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .no-print { display: none !important; }
        }
      `}</style>

      {/* 🌟 h-[1123px] 고정 및 overflow-hidden으로 유령 페이지 생성 완벽 차단 */}
      {/* 🌟 위아래 패딩(py-6)으로 타이트하게 잡아줌 */}
      <div className="w-[794px] h-[1123px] mx-auto text-black font-sans bg-white border border-gray-400 print:border-none px-8 py-6 flex flex-col justify-start box-border overflow-hidden shrink-0 shadow-sm print:shadow-none" style={{ letterSpacing: '-0.5px' }}>
        

        {/* 상단 타이틀 */}
        <div className="text-center mb-3 mt-1 shrink-0">
          <h1 className="text-[28px] font-extrabold tracking-widest leading-none">공정 검사기록서</h1>
          <p className="text-[14px] font-bold mt-2 text-gray-700 leading-none">추출에서 충진까지</p>
        </div>

        {/* 기본 정보 */}
        <div className="flex justify-between items-end mb-2 font-bold text-[13px] px-2 shrink-0">
          <div className="flex items-center gap-6">
            <div>제품명 : <span className="text-[15px] ml-2 text-blue-800 leading-none">{selectedOrder?.itemName || ""}</span></div>
            <div>배합량 : 
              <input 
                type="text" 
                name="mixWeight" 
                value={formData.mixWeight ?? currentSpec.totalWeight} 
                onChange={handleChange}
                className="border-b border-black w-16 outline-none text-center bg-transparent font-extrabold text-blue-800 text-[14px] leading-none m-0 p-0" 
              /> kg
            </div>
          </div>
          <div>
            <input 
              type="date" 
              name="processDate" 
              value={formData.processDate ?? (selectedOrder?.date || "")} 
              onChange={handleChange}
              className="outline-none bg-transparent font-bold text-right text-gray-700 text-[13px] leading-none m-0 p-0" 
            />
          </div>
        </div>

        {/* 공정검사 기록 표 */}
        <table className="w-full border-collapse border-2 border-black text-[12px] text-center flex-1 table-fixed mb-3">
          <thead className="bg-gray-100">
            <tr className="h-7 border-b border-black">
              <th className="border-r border-black py-0 px-1 w-[12%] leading-none">공정명</th>
              <th colSpan={3} className="border-r border-black py-0 leading-none">체크 항목</th>
              <th className="py-0 px-1 w-[13%] leading-none">비고(확인)</th>
            </tr>
          </thead>
          <tbody className="bg-white">
            
            <tr className="h-6 border-b border-black">
              <td className="border-r border-black px-1 py-0 font-bold bg-gray-50 leading-none">분 쇄</td>
              <td className="border-r border-black px-1 py-0 font-bold w-[35%] text-[13px] leading-none">볶은 원두(kg)</td>
              <td colSpan={2} className="border-r border-black px-1 py-0 font-bold text-[13px] leading-none">분쇄량(kg)</td>
              <td className="p-0">
                <input type="text" name="crushNote" value={formData.crushNote || ""} onChange={handleChange} className="w-full h-full text-center bg-transparent outline-none font-semibold leading-none m-0 p-0" />
              </td>
            </tr>
            
            <tr className="h-6 border-b border-gray-300">
              <td rowSpan={2} className="border-r border-b border-black px-1 py-0 font-bold bg-gray-50 leading-none">추 출</td>
              <td className="border-r border-black px-4 py-0 text-left font-bold leading-none">정제수 온도</td>
              <td className="border-r border-black px-1 py-0 font-extrabold text-[13px] leading-none w-[20%]">90℃±5</td>
              <td className="border-r border-black px-1 py-0 font-bold leading-none w-[20%]">℃</td>
              <td className="border-r border-black p-0">
                <input type="text" name="extractTempNote" value={formData.extractTempNote || ""} onChange={handleChange} className="w-full h-full text-center bg-transparent outline-none font-semibold leading-none m-0 p-0" />
              </td>
            </tr>
            <tr className="h-6 border-b border-black">
              <td className="border-r border-black px-4 py-0 text-left font-bold leading-none">성상, 관능</td>
              <td colSpan={2} className="border-r border-black px-1 py-0 text-[11px] font-semibold text-gray-700 tracking-tight leading-none">이미·이취가 없고 고유 향미의 흑갈색 액상</td>
              <td className="p-0">
                <input type="text" name="extractTasteNote" value={formData.extractTasteNote || ""} onChange={handleChange} className="w-full h-full text-center bg-transparent outline-none leading-none m-0 p-0" />
              </td>
            </tr>

            <tr className="h-6 border-b border-black">
              <td className="border-r border-black px-1 py-0 font-bold bg-gray-50 leading-none">당 도</td>
              <td className="border-r border-black px-1 py-0 font-bold text-[13px] leading-none">Brix</td>
              <td colSpan={2} className="border-r border-black px-1 py-0 font-extrabold text-[14px] text-blue-700 leading-none">{currentSpec.brix}</td>
              <td className="p-0">
                <input type="text" name="brixNote" value={formData.brixNote || ""} onChange={handleChange} className="w-full h-full text-center bg-transparent outline-none font-extrabold text-red-600 text-[13px] leading-none m-0 p-0" />
              </td>
            </tr>
            
            <tr className="h-6 border-b border-gray-300">
              <td rowSpan={4} className="border-r border-b border-black px-1 py-0 font-bold bg-gray-50 leading-none">여 과</td>
              <td className="border-r border-black p-0 bg-gray-50"></td>
              <td className="border-r border-black px-1 py-0 font-bold bg-gray-50 leading-none">여과 전</td>
              <td className="border-r border-black px-1 py-0 font-bold bg-gray-50 leading-none">여과 후</td>
              <td className="border-b border-black px-1 py-0 font-bold bg-gray-50 leading-none">확인</td>
            </tr>
            {["여과망 규격", "필터파손 및 이물확인", "필터 육안검사"].map((item, idx) => (
              <tr key={`filter-${idx}`} className={`h-6 ${idx === 2 ? 'border-b border-black' : 'border-b border-gray-300'}`}>
                <td className="border-r border-black py-0 px-4 text-left font-semibold text-[11.5px] leading-none">{item}</td>
                <td className="border-r border-black p-0"><input type="text" name={`filterPre_${idx}`} value={formData[`filterPre_${idx}`] || ""} onChange={handleChange} className="w-full h-full text-center bg-transparent outline-none leading-none m-0 p-0" /></td>
                <td className="border-r border-black p-0"><input type="text" name={`filterPost_${idx}`} value={formData[`filterPost_${idx}`] || ""} onChange={handleChange} className="w-full h-full text-center bg-transparent outline-none leading-none m-0 p-0" /></td>
                <td 
                  className={`p-0 cursor-pointer hover:bg-yellow-50 align-middle text-center relative ${idx === 2 ? 'border-b border-black' : 'border-b border-gray-300'}`}
                  onClick={() => openSignModal(`filterSign_${idx}`)}
                >
                  {signatures[`filterSign_${idx}`] ? (
                    <img src={signatures[`filterSign_${idx}`]} alt="서명" className="h-[18px] w-full object-contain absolute inset-0 m-auto p-0.5" />
                  ) : (
                    <span className="text-gray-300 text-[9px] leading-none">(서명)</span>
                  )}
                </td>
              </tr>
            ))}

            <tr className="h-8 bg-gray-50 border-b border-gray-300">
              <td rowSpan={1} className="border-r border-black px-1 py-0 font-bold leading-none">충 진</td>
              <td className="border-r border-black px-1 py-0 text-[10.5px] font-bold text-blue-800 leading-tight">용량 {currentSpec.targetVol} 및<br/>측정 시간 / 씰링 상태</td>
              <td className="border-r border-black px-1 py-0 font-bold leading-none">
                <div className="flex justify-between px-3 text-gray-600 text-[10.5px]"><span>#1</span><span>#2</span><span>#3</span><span>#4</span><span>#5</span></div>
              </td>
              <td className="border-r border-black px-1 py-0 font-bold leading-none">
                <div className="flex justify-between px-3 text-gray-600 text-[10.5px]"><span>#6</span><span>#7</span><span>#8</span><span>#9</span><span>#10</span></div>
              </td>
              <td className="border-b border-black px-1 py-0 font-bold leading-none">확인</td>
            </tr>

            {Array.from({ length: 8 }).map((_, i) => {
              let labelW = ""; 
              let labelS = ""; 
              
              if (i === 2) { labelW = currentSpec.sg; labelS = currentSpec.targetVol; }
              if (i === 3) { labelW = "충진량 기준"; labelS = "97% 이상"; }
              if (i === 4) { labelW = currentSpec.minVol; labelS = currentSpec.minWeight; }

              return (
                <React.Fragment key={`fill-group-${i}`}>
                  <tr className="h-[21px] border-b border-gray-200">
                    <td className="border-r border-black px-0.5 py-0 text-[10px] font-bold text-center bg-gray-50/50 text-gray-700 leading-none">{labelW}</td>
                    <td className="border-r border-black px-0.5 py-0 text-center whitespace-nowrap font-bold text-[11px] leading-none">
                      {/* 🌟 핵심 수정: type="time"을 type="text"로 변경하여 빈칸 유지 */}
                      {i === 0 ? "start :" : ":"} <input type="text" name={`fillTime_${i}`} value={formData[`fillTime_${i}`] || ""} onChange={handleChange} className="w-16 ml-1 outline-none bg-transparent text-center font-bold leading-none m-0 p-0 h-[16px]" />
                    </td>
                    <td className="border-r border-black p-0">
                      <div className="flex justify-evenly items-center h-full">
                        {Array.from({length:5}).map((_, j) => (
                          <div key={j} className="flex items-center h-full w-full border-r border-gray-300 last:border-r-0"><input type="text" name={`fillW1_${i}_${j}`} value={formData[`fillW1_${i}_${j}`] || ""} onChange={handleChange} className="w-full h-full outline-none text-center text-[10.5px] bg-transparent font-semibold leading-none m-0 p-0" /></div>
                        ))}
                      </div>
                    </td>
                    <td className="border-r border-black p-0">
                      <div className="flex justify-evenly items-center h-full">
                        {Array.from({length:5}).map((_, j) => (
                          <div key={j} className="flex items-center h-full w-full border-r border-gray-300 last:border-r-0"><input type="text" name={`fillW2_${i}_${j}`} value={formData[`fillW2_${i}_${j}`] || ""} onChange={handleChange} className="w-full h-full outline-none text-center text-[10.5px] bg-transparent font-semibold leading-none m-0 p-0" /></div>
                        ))}
                      </div>
                    </td>
                    <td 
                      rowSpan={2} 
                      className={`border-r-0 p-0 cursor-pointer hover:bg-yellow-50 align-middle text-center relative ${i === 7 ? 'border-b border-black' : 'border-b border-gray-300'}`}
                      onClick={() => openSignModal(`fillSign_${i}`)}
                    >
                      {signatures[`fillSign_${i}`] ? (
                        <img src={signatures[`fillSign_${i}`]} alt="서명" className="h-[28px] w-full object-contain absolute inset-0 m-auto p-0.5" />
                      ) : (
                        <span className="text-gray-300 text-[9px] leading-none">(서명)</span>
                      )}
                    </td>
                  </tr>
                  <tr className={`h-[19px] ${i === 7 ? 'border-b border-black' : 'border-b border-gray-300'}`}>
                    <td className="border-r border-black px-0.5 py-0 text-[10px] font-bold text-center bg-gray-50/50 text-blue-700 leading-none">{labelS}</td>
                    <td className="border-r border-black px-0.5 py-0 text-center font-bold bg-gray-100 text-[10px] leading-none">씰링상태</td>
                    <td colSpan={2} className="border-r border-black px-0.5 py-0 text-center font-extrabold text-gray-700 tracking-widest text-[10px] leading-none">
                      양호 / 불량
                    </td>
                  </tr>
                </React.Fragment>
              );
            })}
            
            {/* 포장 */}
            <tr className="h-7 border-b border-gray-300">
              <td rowSpan={2} className="border-r border-b border-black px-1 py-0 font-bold bg-gray-50 leading-none">포 장</td>
              <td className="border-r border-black px-4 py-0 text-left font-bold text-[11.5px] leading-none">소비기한 날인 상태 확인</td>
              <td className="border-r border-black px-1 py-0 text-center font-extrabold text-gray-700 tracking-widest text-[11px] leading-none">
                양호 / 불량
              </td>
              <td className="border-r border-black p-0">
                <div className="flex items-center justify-center h-full text-[11.5px] leading-none">
                  <input type="text" name="packDateNote" value={formData.packDateNote || ""} onChange={handleChange} className="w-14 text-center bg-transparent outline-none py-0 font-bold border-b border-gray-400 mr-2 text-[12px] leading-none m-0 p-0 h-[18px]" /> 소비기한 날인
                </div>
              </td>
              <td 
                className="border-b border-gray-300 p-0 cursor-pointer hover:bg-yellow-50 align-middle text-center relative"
                onClick={() => openSignModal("packSign_1")}
              >
                {signatures["packSign_1"] ? (
                  <img src={signatures["packSign_1"]} alt="서명" className="h-[18px] w-full object-contain absolute inset-0 m-auto p-0.5" />
                ) : (
                  <span className="text-gray-300 text-[9px] leading-none">(서명)</span>
                )}
              </td>
            </tr>
            <tr className="h-7 border-b border-black">
              <td className="border-r border-black px-4 py-0 text-left font-bold text-[11.5px] leading-none">입(入)수량</td>
              <td className="border-r border-black p-0">
                <div className="flex items-center justify-center h-full text-[11.5px] font-bold leading-none">
                  <input type="text" name="packQty" value={formData.packQty ?? "50"} onChange={handleChange} className="w-10 text-center bg-transparent outline-none py-0 font-bold border-b border-gray-400 mr-2 text-blue-700 text-[12px] leading-none m-0 p-0 h-[18px]" /> EA
                </div>
              </td>
              <td className="border-r border-black px-1 py-0 text-[10.5px] font-bold text-gray-500 leading-none">
                잘라 붙이기
              </td>
              <td 
                className="border-b border-black p-0 cursor-pointer hover:bg-yellow-50 align-middle text-center relative"
                onClick={() => openSignModal("packSign_2")}
              >
                {signatures["packSign_2"] ? (
                  <img src={signatures["packSign_2"]} alt="서명" className="h-[18px] w-full object-contain absolute inset-0 m-auto p-0.5" />
                ) : (
                  <span className="text-gray-300 text-[9px] leading-none">(서명)</span>
                )}
              </td>
            </tr>
          </tbody>
        </table>
          
        {/* 하단 승인사항 - mt-auto 적용으로 하단에 고정 */}
        <table className="w-full border-collapse border-2 border-black text-[13px] text-center mt-auto shrink-0">
          <tbody>
            <tr>
              <td rowSpan={2} className="border border-black font-extrabold w-[12%] bg-gray-100 text-[14px]">확 인</td>
              <td className="border border-black font-bold py-1 bg-gray-50 w-[44%]">제조관리책임자</td>
              <td className="border border-black font-bold py-1 bg-gray-50 w-[44%]">품질관리책임자</td>
            </tr>
            <tr className="h-[46px] bg-white">
              <td className="border border-black relative cursor-pointer hover:bg-yellow-50" onClick={() => openSignModal("제조관리책임자")}>
                  {signatures["제조관리책임자"] ? <img src={signatures["제조관리책임자"]} alt="제조" className="h-full w-full object-contain absolute inset-0 m-auto p-1" /> : <span className="text-gray-300 text-[10px] leading-none">(서명)</span>}
              </td>
              <td className="border border-black relative cursor-pointer hover:bg-yellow-50" onClick={() => openSignModal("품질관리책임자")}>
                  {signatures["품질관리책임자"] ? <img src={signatures["품질관리책임자"]} alt="품질" className="h-full w-full object-contain absolute inset-0 m-auto p-1" /> : <span className="text-gray-300 text-[10px] leading-none">(서명)</span>}
              </td>
            </tr>
          </tbody>
        </table>

      </div>
    </div>
  );
}
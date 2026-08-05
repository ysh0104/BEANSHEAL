"use client";
import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

export default function ExtractionProcessLog({ selectedOrder }: any) {
  
  const storageKey = `order_${selectedOrder?.id || 'temp'}_extraction_handdrip`;

  const [formData, setFormData] = useState<Record<string, any>>({});

  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        try {
          setFormData(JSON.parse(saved));
        } catch (e) {
          console.error("데이터 불러오기 실패:", e);
        }
      }
    }
  }, [storageKey]);

  useEffect(() => {
    if (Object.keys(formData).length > 0) {
      localStorage.setItem(storageKey, JSON.stringify(formData));
    }
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
          log_type: 'EXTRACTION_LOG',
          form_data: formData       
        });

      if (error) throw error;
      alert("데이터가 클라우드 DB에 안전하게 저장되었습니다.");
    } catch (error: any) {
      alert("저장 실패 : " + error.message);
    }
  };

  const year = typeof selectedOrder?.date === 'string' ? selectedOrder.date.split('-')[0] : '2026';
  const defaultMonth = typeof selectedOrder?.date === 'string' ? selectedOrder.date.split('-')[1] : '';
  const defaultDay = typeof selectedOrder?.date === 'string' ? selectedOrder.date.split('-')[2] : '';

  return (
    <div className="relative">
      {/* 🌟 인쇄 전용 스타일 세팅 (다른 양식들과 완벽히 동일하게) */}
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 0; }
          body { margin: 0; padding: 0; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .no-print { display: none !important; }
        }
      `}</style>

      {/* 🌟 A4 알맹이 폼: 높이/너비 고정, 중앙 정렬, 유령 페이지 방지(overflow-hidden) */}
      <div className="w-[794px] h-[1123px] mx-auto text-black font-sans bg-white border border-gray-400 print:border-none p-10 flex flex-col justify-center gap-14 box-border overflow-hidden shrink-0 shadow-sm print:shadow-none relative" style={{ letterSpacing: '-0.5px' }}>
        

        {/* 두 개의 블록 렌더링 (상단/하단) */}
        {[1, 2].map((blockId) => (
          <div key={`block-${blockId}`} className="w-full flex flex-col">
            
            {/* 1. 상단 타이틀 및 결재란 */}
            <div className="flex justify-between items-end mb-4">
              <h2 className="font-extrabold text-[20px] tracking-tight pb-1">
                핸드드립 공정(추출수 붓는 시간) 체크( 4리터씩)
              </h2>
              <table className="border-collapse border-2 border-black text-center text-[13px] w-40">
                <tbody>
                  <tr>
                    <td className="border border-black font-bold py-1 bg-gray-50">작성자</td>
                    <td className="border border-black font-bold py-1 bg-gray-50">확인</td>
                  </tr>
                  <tr>
                    <td className="border border-black h-12 p-0"><input type="text" name={`writer_${blockId}`} value={formData[`writer_${blockId}`] || ""} onChange={handleChange} className="w-full h-full bg-transparent outline-none text-center font-bold"/></td>
                    <td className="border border-black h-12 p-0"><input type="text" name={`checker_${blockId}`} value={formData[`checker_${blockId}`] || ""} onChange={handleChange} className="w-full h-full bg-transparent outline-none text-center font-bold"/></td>
                  </tr>
                </tbody>
              </table>
            </div>
            
            {/* 2. 제품명 및 날짜 */}
            <div className="flex justify-between items-center mb-2">
              <div className="font-bold text-[15px]">
                제품명: <span className="text-blue-800 ml-1">{selectedOrder?.itemName || ""}</span>
              </div>
              <div className="font-bold text-[14px]">
                {year}. 
                <input type="text" name={`month_${blockId}`} value={formData[`month_${blockId}`] ?? defaultMonth} onChange={handleChange} className="w-8 mx-1 text-center outline-none bg-transparent border-b border-gray-400 focus:border-gray-600 font-bold text-blue-800"/> . 
                <input type="text" name={`day_${blockId}`} value={formData[`day_${blockId}`] ?? defaultDay} onChange={handleChange} className="w-8 mx-1 text-center outline-none bg-transparent border-b border-gray-400 focus:border-gray-600 font-bold text-blue-800"/> ( 
                <input type="text" name={`dayOfWeek_${blockId}`} value={formData[`dayOfWeek_${blockId}`] || ""} onChange={handleChange} className="w-8 text-center outline-none bg-transparent border-b border-gray-400 focus:border-gray-600 font-bold text-blue-800"/> 요일)
              </div>
            </div>
            
            {/* 3. 시간 입력란 (핵심 수정 지점: type="time" -> type="text") */}
            <div className="font-bold text-[14px] mb-3">
              시작 시간~종료 시간 ( 
              <input type="text" name={`timeStart_${blockId}`} value={formData[`timeStart_${blockId}`] || ""} onChange={handleChange} className="w-24 text-center outline-none bg-transparent font-bold mx-1 text-blue-800 border-b border-gray-300"/> ~ 
              <input type="text" name={`timeEnd_${blockId}`} value={formData[`timeEnd_${blockId}`] || ""} onChange={handleChange} className="w-24 text-center outline-none bg-transparent font-bold mx-1 text-blue-800 border-b border-gray-300"/> )
            </div>

            {/* 4. 메인 데이터 표 */}
            <table className="w-full border-collapse text-center text-[14px] table-fixed border-2 border-black">
              <thead>
                <tr className="border-b-2 border-black bg-gray-100 h-8">
                  <th className="border-r border-black p-0 w-[6%]"></th>
                  {Array.from({ length: 13 }).map((_, i) => (
                    <th key={`th-${blockId}-${i}`} className="border-r border-black last:border-r-0 p-0 font-extrabold text-[15px] w-[7.2%]">{i + 1}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="border-b-2 border-black bg-[#eef7e1]">
                <tr className="h-8">
                  <td className="border-r border-b border-black p-0 font-bold text-[15px]">1</td>
                  <td colSpan={13} rowSpan={4} className="font-extrabold text-[26px] tracking-widest align-middle border-none">추출기당 뜸 16L씩</td>
                </tr>
                <tr className="h-8"><td className="border-r border-b border-black p-0 font-bold text-[15px]">2</td></tr>
                <tr className="h-8"><td className="border-r border-b border-black p-0 font-bold text-[15px]">3</td></tr>
                <tr className="h-8"><td className="border-r border-black p-0 font-bold text-[15px]">4</td></tr>
              </tbody>
              <tbody className="bg-white">
                {[5, 6, 7, 8, 9, 10].map((rowNum, rIdx) => (
                  <tr key={`row-${blockId}-${rowNum}`} className={`h-8 ${rIdx !== 0 ? "border-t border-gray-400" : ""}`}>
                    <td className="border-r border-black p-0 font-bold text-[15px] bg-gray-50">{rowNum}</td>
                    {Array.from({ length: 13 }).map((_, colIdx) => (
                      <td key={`cell-${blockId}-${rowNum}-${colIdx}`} className="border-r border-gray-400 last:border-r-0 p-0">
                        <input type="text" name={`cell_${blockId}_${rowNum}_${colIdx}`} value={formData[`cell_${blockId}_${rowNum}_${colIdx}`] || ""} onChange={handleChange} className="w-full h-full text-center bg-transparent outline-none font-semibold focus:bg-yellow-50" />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>

          </div>
        ))}
      </div>
    </div>
  );
}
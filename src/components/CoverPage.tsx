"use client";
import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

export default function CoverPage({ selectedOrder, signatures, openSignModal }: any) {
  const storageKey = `order_${selectedOrder?.id || 'temp'}_cover`;

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

  const handleChange = (e: any) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSaveToCloud = async () => {
    try {
      const { error } = await supabase.from('manufacturing_logs').insert({
        log_type: 'COVER_PAGE',
        form_data: formData
      });
      if (error) throw error;
      alert("데이터가 클라우드에 성공적으로 저장되었습니다.");
    } catch (error: any) {
      alert("저장 실패: " + error.message);
    }
  };

  const [theoreticalQty, setTheoreticalQty] = useState<string | number>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(`${storageKey}_theoQty`);
      return saved !== null ? saved : (selectedOrder?.qty || "");
    }
    return selectedOrder?.qty || "";
  });

  const [actualQty, setActualQty] = useState<string | number>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(`${storageKey}_actualQty`);
      return saved !== null ? saved : "";
    }
    return "";
  });

  useEffect(() => {
    localStorage.setItem(`${storageKey}_theoQty`, String(theoreticalQty));
  }, [theoreticalQty, storageKey]);

  useEffect(() => {
    localStorage.setItem(`${storageKey}_actualQty`, String(actualQty));
  }, [actualQty, storageKey]);

  const numTheo = Number(theoreticalQty);
  const numActual = Number(actualQty);
  const yieldPercent = numTheo > 0 && numActual > 0 ? ((numActual / numTheo) * 100).toFixed(1) : "";

  return (
    <div className="relative">
      {/* 인쇄 스타일 및 숫자 입력창 화살표 제거 스타일 */}
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 0; }
          body { margin: 0; padding: 0; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .no-print { display: none !important; }
        }
        /* 숫자 입력창 위아래 화살표 숨김 처리 */
        input[type="number"]::-webkit-inner-spin-button,
        input[type="number"]::-webkit-outer-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        input[type="number"] {
          -moz-appearance: textfield;
        }
      `}</style>

      {/* 794px x 1123px 표준 규격 통일 및 알맹이 폼 */}
      <div className="w-[794px] h-[1123px] text-black font-sans bg-white border border-gray-400 print:border-none p-10 flex flex-col justify-start box-border overflow-hidden shrink-0 shadow-sm print:shadow-none" style={{ letterSpacing: '-0.5px' }}>

        <div className="text-center pb-2 mb-8 mt-4">
          <h1 className="text-4xl font-extrabold tracking-widest text-black">제조지시 및 기록서(표지)</h1>
        </div>

        <table className="w-full border-collapse text-[15px] mb-8 table-fixed border border-black">
          <colgroup>
            <col className="w-[20%]" />
            <col className="w-[30%]" />
            <col className="w-[20%]" />
            <col className="w-[30%]" />
          </colgroup>
          <tbody>
            <tr>
              <td className="border border-black p-3 font-bold bg-gray-50 text-center text-black">제품명</td>
              <td colSpan={3} className="border border-black p-3 font-bold text-xl text-black text-center">{selectedOrder?.itemName}</td>
            </tr>
            <tr>
              <td className="border border-black p-3 font-bold bg-gray-50 text-center text-black">성 상</td>
              <td colSpan={3} className="border border-black p-3 text-center text-[14px] text-black">이미 · 이취가 없고 고유의 향미가 있는 흑갈색의 액상</td>
            </tr>
            <tr>
              <td className="border border-black p-3 font-bold bg-gray-50 text-center text-black">제조일자</td>
              <td className="border border-black p-3 text-center align-middle font-bold text-lg text-black">
                {selectedOrder?.date ? selectedOrder.date.replace(/-/g, ".") : ""}
              </td>
              <td className="border border-black p-3 font-bold bg-gray-50 text-center text-black">소비기한</td>
              <td className="border border-black p-3 text-center">
                <input type="text" defaultValue="제조일로부터 24개월" className="w-full text-center outline-none bg-transparent text-[14px] text-black"/>
              </td>
            </tr>
            <tr>
              <td className="border border-black p-3 font-bold bg-gray-50 text-center text-black">제조단위</td>
              <td className="border border-black p-3 text-center align-middle font-bold text-lg text-black">
                {selectedOrder?.qty ? `${selectedOrder.qty} kg` : ""}
              </td>
              <td className="border border-black p-3 font-bold bg-gray-50 text-center text-black">포장단위</td>
              <td className="border border-black p-3 text-center font-bold text-lg text-black">14ml * 50포</td>
            </tr>
            <tr>
              <td className="border border-black p-3 font-bold bg-gray-50 text-center text-black">이론생산량(A)</td>
              <td className="border border-black p-3 text-center align-middle font-bold text-lg text-black">
                {theoreticalQty ? `${theoreticalQty} EA` : ""}
              </td>
              <td className="border border-black p-3 font-bold bg-gray-50 text-center text-black">실제생산량(B)</td>
              <td className="border border-black p-3 text-center bg-gray-50">
                <div className="inline-flex items-center justify-center font-bold text-lg text-black">
                  <input 
                    type="number" 
                    value={actualQty}
                    onChange={(e) => setActualQty(e.target.value)}
                    className="w-24 outline-none bg-transparent text-right text-black border-b border-black mr-1"
                  /> EA
                </div>
              </td>
            </tr>
            <tr>
              <td colSpan={4} className="border border-black p-2 text-[12px] text-black bg-white px-5 text-left">
                * 이론생산량(A) = 배합량(kg) / 단위중량(g) * 1,000 (단위중량=14ml * 비중1.152) 
                <span className="float-right font-bold mr-2 text-[13px]">16.128</span>
              </td>
            </tr>
            <tr>
              <td className="border border-black p-3 font-bold bg-gray-50 text-center text-black">문서보존기한</td>
              <td className="border border-black p-3 text-center font-bold text-lg text-black">3년</td>
              <td className="border border-black p-3 font-bold bg-gray-50 text-center relative text-black">
                생산수율(%)<br/>
                <span className="text-[11px] font-normal text-black block">(B/A*100)</span>
              </td>
              <td className="border border-black p-3 text-center align-middle">
                <div className="inline-flex items-center justify-center">
                  <input 
                    type="text" 
                    readOnly 
                    value={yieldPercent} 
                    className="w-20 outline-none bg-transparent text-right font-black text-black text-2xl mr-1"
                  /> %
                </div>
              </td>
            </tr>
            <tr>
              <td className="border border-black p-3 font-bold bg-gray-50 text-center align-middle text-black">비고</td>
              <td colSpan={3} className="border border-black p-0 h-[80px]">
                  <textarea className="w-full h-full p-3 outline-none resize-none bg-transparent block box-border text-[14px] text-black"></textarea>
              </td>
            </tr>
          </tbody>
        </table>

        <table className="w-full border-collapse text-[15px] text-center mb-10 table-fixed border border-black">
          <colgroup>
            <col className="w-[12%]" />
            <col className="w-[73%]" />
            <col className="w-[15%]" />
          </colgroup>
          <thead className="bg-gray-100">
            <tr>
              <th className="p-2.5 border border-black font-bold text-black">구분</th>
              <th className="p-2.5 border border-black font-bold text-black">항목</th>
              <th className="p-2.5 border border-black font-bold text-black">확인</th>
            </tr>
          </thead>
          <tbody>
            {[
              "제조지시 및 기록서 (원료칭량~포장)",
              "제조지시 및 기록서 (공정검사기록서: 추출, 충진, 포장)",
              "공정검사 기록서",
              "칭량 기록서",
              "제품시험 성적서",
              "완제품 출하 승인서"
            ].map((item, idx) => (
              <tr key={idx} className="hover:bg-gray-50 h-10">
                <td className="p-2 border border-black font-bold text-[16px] text-black">{idx + 1}</td>
                <td className="p-2 border border-black text-left px-5 text-[14px] text-black">{item}</td>
                <td className="p-2 border border-black">
                  <input type="checkbox" className="w-5 h-5 cursor-pointer accent-black"/>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* 서명란: 맨 하단에 여유있게 배치 */}
        <div className="mt-auto pb-4">
          <table className="w-full border-collapse border-2 border-black text-[14px] text-center table-fixed">
            <colgroup>
              <col className="w-[16%]" />
              <col className="w-[28%]" />
              <col className="w-[28%]" />
              <col className="w-[28%]" />
            </colgroup>
            <tbody>
              <tr>
                <td rowSpan={2} className="border border-black font-extrabold bg-gray-100 text-[15px] text-black">승인사항</td>
                <td className="border border-black font-bold py-2 bg-gray-50 text-black">제조관리책임자</td>
                <td className="border border-black font-bold py-2 bg-gray-50 text-black">품질관리책임자</td>
                <td className="border border-black font-bold py-2 bg-gray-50 text-black">GMP총괄책임자</td>
              </tr>
              <tr className="h-24">
                <td className="border border-black relative cursor-pointer hover:bg-gray-50 p-2" onClick={() => openSignModal("제조관리책임자")}>
                    {signatures["제조관리책임자"] ? <img src={signatures["제조관리책임자"]} alt="제조" className="h-full w-full object-contain" /> : <span className="text-gray-400 text-sm block mt-8">(서명)</span>}
                </td>
                <td className="border border-black relative cursor-pointer hover:bg-gray-50 p-2" onClick={() => openSignModal("품질관리책임자")}>
                    {signatures["품질관리책임자"] ? <img src={signatures["품질관리책임자"]} alt="품질" className="h-full w-full object-contain" /> : <span className="text-gray-400 text-sm block mt-8">(서명)</span>}
                </td>
                <td className="border border-black relative cursor-pointer hover:bg-gray-50 p-2" onClick={() => openSignModal("GMP총괄책임자")}>
                    {signatures["GMP총괄책임자"] ? <img src={signatures["GMP총괄책임자"]} alt="GMP" className="h-full w-full object-contain" /> : <span className="text-gray-400 text-sm block mt-8">(서명)</span>}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

      </div>
    </div>
  );
}
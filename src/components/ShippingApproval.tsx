import React from "react";
import { supabase } from "@/lib/supabase";

export default function ShippingApproval({ selectedOrder, signatures, openSignModal }: any) {
  
  // 🌟 마법의 제품 스펙 DB: 제품명에 따라 포장 단위가 다르게 적용됩니다!
  const specDB: Record<string, { unit: string }> = {
    "세리컷 프레소 V2": { unit: "14ml*50" },
    "유기농 배도라지 스틱": { unit: "10ml*30" }
  };

  const currentSpec = selectedOrder?.itemName ? specDB[selectedOrder.itemName] || specDB["세리컷 프레소 V2"] : specDB["세리컷 프레소 V2"];

  return (
    <div className="w-full max-w-4xl text-black font-sans bg-white shadow-lg mx-auto p-10" style={{ letterSpacing: '-0.5px' }}>
      
      {/* 1. 상단 타이틀 (독립된 굵은 테두리 박스) */}
      <div className="border-[3px] border-black w-full text-center py-5 mb-2">
        <h1 className="text-3xl font-extrabold tracking-widest">완제품 출하 증명(승인)서</h1>
      </div>

      {/* 2. 메인 컨텐츠 래퍼 */}
      <div className="relative border-[3px] border-black flex flex-col w-full text-[15px]">
        
        {/* 3. 기본 정보 표 (🌟 데이터 자동 바인딩) */}
        <table className="w-full border-collapse text-center">
          <colgroup>
            <col className="w-[18%]" />
            <col className="w-[82%]" />
          </colgroup>
          <tbody>
            {[
              { label: "제 품 명", val: selectedOrder?.itemName || "", isBlue: true },
              { label: "제조일자", val: selectedOrder?.date || "", isBlue: false },
              { label: "소비기한", val: "제조일로부터 24개월", isBlue: false },
              { label: "포장단위", val: currentSpec.unit, isBlue: true },
              { label: "총 수 량", val: selectedOrder?.qty ? `${selectedOrder.qty.toLocaleString()} EA` : "", isBlue: true },
              { label: "출 하 일", val: "", isBlue: false }
            ].map((row, idx) => (
              <tr key={idx}>
                <td className="border-b border-r border-black font-extrabold py-5 bg-[#f8f9fa] tracking-widest text-[16px]">{row.label}</td>
                <td className="border-b border-black p-0">
                  <input 
                    type="text" 
                    defaultValue={row.val} 
                    className={`w-full h-full text-left pl-6 outline-none bg-transparent font-bold text-[16px] ${row.isBlue ? 'text-blue-800' : 'text-gray-800'}`} 
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* 4. 비고란 (거대한 텍스트 에어리어) */}
        <div className="w-full h-[320px] border-b border-black p-2 relative flex flex-col">
          <span className="font-extrabold text-[15px] absolute top-2 left-3">비고</span>
          <textarea className="w-full h-full pt-8 px-2 outline-none resize-none bg-transparent relative z-0 text-[15px] leading-relaxed" />
        </div>

        {/* 5. 결재 (확인) 표 (🌟 전자 서명 연동) */}
        <table className="w-full border-collapse text-center">
          <colgroup>
            <col className="w-[18%]" />
            <col className="w-[27.3%]" />
            <col className="w-[27.3%]" />
            <col className="w-[27.3%]" />
          </colgroup>
          <tbody>
            <tr>
              <td rowSpan={2} className="border-b border-r border-black font-extrabold py-4 text-[16px] bg-[#f8f9fa]">확 인</td>
              <td className="border-b border-r border-black py-2.5 font-bold text-sm bg-[#f8f9fa]">제조관리부서책임자</td>
              <td className="border-b border-r border-black py-2.5 font-bold text-sm bg-[#f8f9fa]">품질관리부서책임자</td>
              <td className="border-b border-black py-2.5 font-bold text-sm bg-[#f8f9fa]">품질관리인</td>
            </tr>
            <tr className="h-[90px]">
              {/* 제조관리부서책임자 서명란 */}
              <td className="border-b border-r border-black relative cursor-pointer hover:bg-yellow-50" onClick={() => openSignModal("출하_제조")}>
                {signatures?.["출하_제조"] ? <img src={signatures["출하_제조"]} alt="서명" className="h-full w-full object-contain absolute inset-0 m-auto" /> : <span className="absolute bottom-1 right-2 text-gray-300 text-xs">(서명)</span>}
              </td>
              {/* 품질관리부서책임자 칸의 대각선(사선) 처리 - 여기는 서명 안 받음 */}
              <td className="border-b border-r border-black relative" style={{ background: 'linear-gradient(to bottom right, transparent calc(50% - 0.5px), black calc(50% - 0.5px), black calc(50% + 0.5px), transparent transparent)' }}></td>
              {/* 품질관리인 서명란 */}
              <td className="border-b border-black relative cursor-pointer hover:bg-yellow-50" onClick={() => openSignModal("출하_품질")}>
                {signatures?.["출하_품질"] ? <img src={signatures["출하_품질"]} alt="서명" className="h-full w-full object-contain absolute inset-0 m-auto" /> : <span className="absolute bottom-1 right-2 text-gray-300 text-xs">(서명)</span>}
              </td>
            </tr>
          </tbody>
        </table>

        {/* 6. 하단 양식 정보 꼬리표 */}
        <table className="w-full border-collapse text-center text-[13px] font-bold">
          <colgroup>
            <col className="w-[20%]" />
            <col className="w-[25%]" />
            <col className="w-[18%]" />
            <col className="w-[20%]" />
            <col className="w-[17%]" />
          </colgroup>
          <tbody className="bg-[#e6e6e6]">
            <tr>
              <td className="border-r border-b border-black py-1.5 tracking-widest">양 식 번 호</td>
              <td className="border-r border-b border-black py-1.5 tracking-widest">기 록 명</td>
              <td className="border-r border-b border-black py-1.5 tracking-widest">기록주기</td>
              <td className="border-r border-b border-black py-1.5 tracking-widest">보관 부서</td>
              <td className="border-b border-black py-1.5 tracking-widest">보존 년한</td>
            </tr>
            <tr className="bg-white text-gray-800">
              <td className="border-r border-black py-1.5 font-semibold">G-05-02-05</td>
              <td className="border-r border-black py-1.5 font-semibold">완제품출하승인서</td>
              <td className="border-r border-black py-1.5 font-semibold">발급시</td>
              <td className="border-r border-black py-1.5 font-semibold">품질관리부</td>
              <td className="border-black py-1.5 font-semibold">3 년</td>
            </tr>
          </tbody>
        </table>

      </div>
    </div>
  );
}
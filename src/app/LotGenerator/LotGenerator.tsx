"use client";

import React, { useState, useEffect } from "react";
import { supabase } from "@/utils/supabase";

export default function LotGenerator() {
  const [itemName, setItemName] = useState("");
  const [makeDate, setMakeDate] = useState("");
  const [sequence, setSequence] = useState(1);
  const [isOrganic, setIsOrganic] = useState(false);
  const [expDate, setExpDate] = useState("");
  const [lotNumber, setLotNumber] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [supplier, setSupplier] = useState("");

  // 자주 사용하는 납품처 목록 (필요에 따라 추가/삭제 가능)
  const commonSuppliers = ["퍼플랩스", "비즈바이오", "빈스힐", "직접입력"];

  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    setMakeDate(`${yyyy}-${mm}-${dd}`);
  }, []);

  useEffect(() => {
    if (!makeDate) return;
    const dateStr = makeDate.slice(2).replace(/-/g, "");
    const seqStr = String(sequence);
    const organicStr = isOrganic ? "U" : "";
    setLotNumber(`${dateStr}Q${seqStr}${organicStr}`);
  }, [makeDate, sequence, isOrganic]);

  const handleSaveAndGenerateAll = async () => {
    if (!itemName || !makeDate || !expDate || !quantity) {
      alert("품목명, 제조일자, 소비기한, 수량을 모두 입력하십시오.");
      return;
    }

    setIsSubmitting(true);

    try {
      const { error: dbError } = await supabase
        .from('ecount_inventory')
        .insert([
          {
            item_name: itemName,       
            lot_no: lotNumber,         
            expiry_date: expDate,
            quantity: Number(quantity),
            supplier: supplier 
          }
        ]);

      if (dbError) throw new Error("DB 저장 실패: " + dbError.message);

      const docTypes = ['log', 'instruction', 'report', 'label'];
      const docNames: Record<string, string> = {
        log: "시험일지",
        instruction: "시험지시_및_기록서",
        report: "시험결과보고서",
        label: "품질관리표시서"
      };

      for (const type of docTypes) {
        const docResponse = await fetch('/api/generate-qc-doc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            productName: itemName,
            lotNo: lotNumber,
            testDate: makeDate, 
            mfgDate: makeDate,
            qty: quantity,
            supplier: supplier,
            docType: type 
          })
        });

        if (!docResponse.ok) {
          console.error(`${docNames[type]} 생성 실패`);
          continue; 
        }

        const blob = await docResponse.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `${docNames[type]}_${lotNumber}.docx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(downloadUrl);

        await new Promise(resolve => setTimeout(resolve, 300));
      }

      alert(`✅ [${lotNumber}] DB 저장 및 필수 서류(4종) 일괄 생성이 완료되었습니다.`);
      setSequence((prev) => prev + 1);

    } catch (error: any) {
      console.error("작업 에러:", error);
      alert("오류가 발생했습니다: " + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6 bg-white rounded-lg shadow-sm border border-gray-200">
      <h2 className="text-xl font-bold text-gray-800 mb-6 border-b pb-2">
        긴급 로트번호 발행 및 4종 서류 일괄 생성
      </h2>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            품목명
          </label>
          <input
            type="text"
            value={itemName}
            onChange={(e) => setItemName(e.target.value)}
            placeholder="품목명을 입력하세요"
            className="w-full border border-gray-300 rounded p-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* 납품처 선택 및 입력 필드 */}
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              납품처 (선택 또는 직접 입력)
            </label>
            <input
              list="supplier-list"
              type="text"
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              placeholder="납품처를 선택하거나 입력하세요"
              className="w-full border border-gray-300 rounded p-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <datalist id="supplier-list">
              {commonSuppliers.map((s, index) => (
                <option key={index} value={s} />
              ))}
            </datalist>
          </div>
          <div className="w-1/3">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              입고 수량
            </label>
            <input
              type="number"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-full border border-gray-300 rounded p-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        <div className="flex gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              제조/보충 일자
            </label>
            <input
              type="date"
              value={makeDate}
              onChange={(e) => setMakeDate(e.target.value)}
              className="w-full border border-gray-300 rounded p-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div className="w-32">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              당일 배치 순번
            </label>
            <input
              type="number"
              min="1"
              value={sequence}
              onChange={(e) => setSequence(Number(e.target.value))}
              className="w-full border border-gray-300 rounded p-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        <div className="flex items-center mt-2">
          <input
            type="checkbox"
            id="organicToggle"
            checked={isOrganic}
            onChange={(e) => setIsOrganic(e.target.checked)}
            className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
          />
          <label htmlFor="organicToggle" className="ml-2 text-sm text-gray-700 font-medium">
            유기농 원료 적용 (로트번호 끝에 U 추가)
          </label>
        </div>

        <div className="pt-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            소비기한
          </label>
          <input
            type="date"
            value={expDate}
            onChange={(e) => setExpDate(e.target.value)}
            className="w-full border border-gray-300 rounded p-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        <div className="mt-6 p-4 bg-gray-50 border border-gray-200 rounded">
          <div className="flex justify-between items-end mb-2">
            <h3 className="text-sm font-bold text-gray-700">발행 예정 로트번호</h3>
            <span className="font-bold text-blue-700 text-xl tracking-wider">
              {lotNumber}
            </span>
          </div>
        </div>

        <div className="pt-6 flex justify-end border-t border-gray-200 mt-6">
          <button 
            onClick={handleSaveAndGenerateAll}
            disabled={isSubmitting}
            className={`px-8 py-3 rounded font-bold text-white transition-colors ${
              isSubmitting ? "bg-gray-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {isSubmitting ? "서류 4종 생성 중..." : "DB 저장 및 필수 서류(4종) 일괄 생성"}
          </button>
        </div>
      </div>
    </div>
  );
}
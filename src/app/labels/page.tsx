"use client"

import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';

export default function LabelPrinterPage() {
  const [labelData, setLabelData] = useState({
    itemName: '세리컷 파우치 (14ml)',
    lotNo: 'LOT-20260329-01',
    qty: '1500',
    date: '2026-03-29'
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setLabelData(prev => ({ ...prev, [name]: value }));
  };

  const handlePrint = () => {
    window.print();
  };

  // QR 코드에 담길 실제 데이터 (스캐너가 읽을 내용)
  const qrValue = `${labelData.lotNo}`;

  return (
    <div className="max-w-4xl mx-auto p-8 font-sans text-gray-900">
      
      {/* 화면용 UI (인쇄 시 숨김 처리됨: print:hidden) */}
      <div className="print:hidden mb-10 p-6 bg-white border border-gray-300 rounded-lg shadow-sm">
        <h2 className="text-2xl font-bold mb-6">QR 라벨 발행기</h2>
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">품목명</label>
            <input type="text" name="itemName" value={labelData.itemName} onChange={handleChange} className="w-full p-2 border border-gray-300 rounded outline-none focus:border-gray-900" />
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">LOT 번호 (시험번호)</label>
            <input type="text" name="lotNo" value={labelData.lotNo} onChange={handleChange} className="w-full p-2 border border-gray-300 rounded outline-none focus:border-gray-900" />
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">입고/생산일자</label>
            <input type="date" name="date" value={labelData.date} onChange={handleChange} className="w-full p-2 border border-gray-300 rounded outline-none focus:border-gray-900" />
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">수량/단위</label>
            <input type="text" name="qty" value={labelData.qty} onChange={handleChange} className="w-full p-2 border border-gray-300 rounded outline-none focus:border-gray-900" />
          </div>
        </div>
        <button onClick={handlePrint} className="w-full bg-gray-900 text-white font-bold py-3 rounded hover:bg-black transition-colors">
          라벨 인쇄하기 (Ctrl + P)
        </button>
      </div>

      {/* 인쇄용 라벨 UI (테두리와 크기를 라벨지 규격에 맞게 조정 가능) */}
      <div className="flex justify-center">
        <div className="w-[8cm] h-[5cm] border-2 border-black bg-white p-4 flex flex-col justify-between" style={{ pageBreakInside: 'avoid' }}>
          
          <div className="flex justify-between items-start border-b-2 border-black pb-2 mb-2">
            <h1 className="text-lg font-black tracking-tight leading-tight truncate w-2/3">
              {labelData.itemName || '품목명 없음'}
            </h1>
            <span className="text-sm font-bold bg-black text-white px-2 py-0.5">
              승인
            </span>
          </div>

          <div className="flex gap-4 items-center">
            <div className="w-24 h-24 flex-shrink-0">
              <QRCodeSVG 
                value={qrValue} 
                size={96}
                level="M"
                includeMargin={false}
              />
            </div>
            
            <div className="flex-1 space-y-1.5 text-sm font-semibold">
              <div className="flex justify-between">
                <span className="text-gray-600">LOT:</span>
                <span className="font-bold text-black">{labelData.lotNo}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">일자:</span>
                <span className="font-bold text-black">{labelData.date}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">수량:</span>
                <span className="font-bold text-black">{labelData.qty}</span>
              </div>
            </div>
          </div>

        </div>
      </div>

    </div>
  );
}
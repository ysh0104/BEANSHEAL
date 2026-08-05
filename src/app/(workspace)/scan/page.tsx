"use client"

import { useEffect, useState, useRef } from "react";
import { Html5QrcodeScanner } from "html5-qrcode";
// ★ 수정 완료: processScan 함수 임포트 및 절대경로(@) 사용 ★
import { processScan } from "@/app/actions/inventory";

export default function ScanPage() {
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [qty, setQty] = useState<number | "">("");
  const [statusMsg, setStatusMsg] = useState<string>("");
  
  // 수기 입력용 상태와 스캐너 제어용 Ref 추가
  const [manualInput, setManualInput] = useState<string>("");
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);

  useEffect(() => {
    // 스캔 결과가 없을 때(초기 화면)만 카메라를 작동시킵니다.
    if (!scanResult) {
      const scanner = new Html5QrcodeScanner(
        "reader",
        { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 },
        false
      );
      scannerRef.current = scanner;

      const onScanSuccess = (decodedText: string) => {
        const audio = new Audio("https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3");
        audio.play();
        setScanResult(decodedText);
        scanner.clear().catch(() => {}); // 스캔 성공 시 카메라 종료
      };

      scanner.render(onScanSuccess, () => {});

      return () => {
        scanner.clear().catch(() => {});
      };
    }
  }, [scanResult]);

  // 수기 입력 제출 버튼 클릭 시 실행
  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault(); // 엔터 쳤을 때 페이지 새로고침 방지
    
    if (!manualInput.trim()) {
      alert("바코드 또는 LOT 번호를 입력해주세요.");
      return;
    }
    
    // 수동으로 입력했으므로 켜져 있는 카메라를 강제로 끕니다.
    if (scannerRef.current) {
      scannerRef.current.clear().catch(() => {});
    }
    
    // 입력한 텍스트를 스캔 결과로 덮어씌웁니다.
    setScanResult(manualInput.trim());
  };

  const handleSubmit = async () => {
    if (!qty || Number(qty) <= 0) {
      alert("올바른 수량을 입력해주세요.");
      return;
    }
    setStatusMsg("DB에 저장 중입니다... ⏳");
    
    // ★ 수정 완료: 스캐너 전용 함수인 processScan 호출! (빨간 줄 완벽 제거) ★
    const result = await processScan(scanResult!, Number(qty));
    
    setStatusMsg(result.message);
  };

  const handleReset = () => {
    setScanResult(null);
    setQty("");
    setStatusMsg("");
    setManualInput("");
    window.location.reload();
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="pb-4 border-b border-gray-200">
        <h2 className="text-2xl font-bold text-gray-900 tracking-tight">바코드 / QR 스캔</h2>
        <p className="text-sm text-gray-500 mt-1">부자재 및 완제품의 LOT 번호를 스캔하거나 직접 입력하세요.</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6 flex flex-col items-center">
        {scanResult ? (
          // ----------------------------------------------------
          // [2] 스캔 또는 수기 입력 성공 시 나오는 수량 입력 화면
          // ----------------------------------------------------
          <div className="w-full max-w-sm text-center space-y-6 py-6">
            <h3 className="text-xl font-bold text-gray-900">입력 완료!</h3>
            
            <div className="p-4 bg-gray-50 border border-gray-200 rounded text-lg font-mono text-blue-600 font-bold tracking-wider">
              {scanResult}
            </div>

            <div className="text-left space-y-2">
              <label className="block text-sm font-semibold text-gray-700">처리 수량 (투입/출고)</label>
              <input 
                type="number" 
                value={qty}
                onChange={(e) => setQty(Number(e.target.value))}
                placeholder="수량을 입력하세요 (예: 100)"
                className="w-full p-3 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>

            {statusMsg && (
              <p className={`text-sm font-bold ${statusMsg.includes('✅') ? 'text-green-600' : 'text-blue-600'}`}>
                {statusMsg}
              </p>
            )}

            <div className="flex gap-3 pt-4">
              <button onClick={handleReset} className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 font-semibold rounded hover:bg-gray-200 transition">
                다시 입력
              </button>
              <button onClick={handleSubmit} className="flex-1 px-4 py-2.5 bg-blue-600 text-white font-semibold rounded hover:bg-blue-700 shadow-sm transition">
                DB 투입(출고) 처리
              </button>
            </div>
          </div>
        ) : (
          // ----------------------------------------------------
          // [1] 카메라 및 수기 입력 대기 화면
          // ----------------------------------------------------
          <div className="w-full max-w-md mx-auto space-y-8">
            
            {/* 카메라 영역 */}
            <div>
              <div id="reader" className="w-full rounded overflow-hidden border-2 border-dashed border-gray-300"></div>
            </div>

            {/* 구분선 (또는 수기 입력) */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500 font-medium">또는 수기 입력</span>
              </div>
            </div>

           {/* 수기 입력 영역 */}
            <form onSubmit={handleManualSubmit} className="space-y-3">
              <label className="block text-base font-extrabold text-gray-900">
                LOT 번호 직접 입력
              </label>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={manualInput}
                  onChange={(e) => setManualInput(e.target.value)}
                  placeholder="테스트용 바코드 (예: TEST-001)"
                  className="flex-1 p-3 border-2 border-gray-300 rounded focus:ring-2 focus:ring-blue-600 focus:border-blue-600 outline-none text-gray-900 font-bold placeholder:text-gray-500 placeholder:font-medium"
                />
                <button type="submit" className="px-5 py-3 bg-gray-900 text-white font-bold rounded hover:bg-black shadow-md transition">
                  확인
                </button>
              </div>
            </form>

          </div>
        )}
      </div>
    </div>
  );
}
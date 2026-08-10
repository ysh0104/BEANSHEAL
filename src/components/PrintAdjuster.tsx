"use client";
import React, { useState, useEffect, useRef, useCallback } from "react";

interface Props {
  children: React.ReactNode;
  formId: string;
}

export default function PrintAdjuster({ children, formId }: Props) {
  // 초기값: 비율 100%(scale: 1), 상단 여백 0
  const [config, setConfig] = useState({ scale: 1, marginTop: 0 });
  const [isResizing, setIsResizing] = useState(false);
  const [isMoving, setIsMoving] = useState(false);

  const startY = useRef(0);
  const startScale = useRef(1);
  const startMouseY = useRef(0);

  // 1. 브라우저에 저장된 설정 불러오기
  useEffect(() => {
    const saved = localStorage.getItem(`print_config_${formId}`);
    if (saved) {
      try {
        setConfig(JSON.parse(saved));
      } catch (e) {
        console.error("설정 불러오기 실패:", e);
      }
    }
  }, [formId]);

  // 2. 설정 바뀔 때마다 자동 저장
  useEffect(() => {
    localStorage.setItem(`print_config_${formId}`, JSON.stringify(config));
  }, [config, formId]);

  // --- 위치 이동 로직 ---
  const handleMouseDownMove = (e: React.MouseEvent) => {
    // 입력칸이나 버튼을 클릭했을 때는 이동하지 않음
    if ((e.target as HTMLElement).closest('input, button, select, textarea')) return;
    e.preventDefault();
    setIsMoving(true);
    startY.current = config.marginTop;
    startMouseY.current = e.clientY;
  };

  // --- 크기 조절 로직 ---
  const handleMouseDownResize = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    startScale.current = config.scale;
    startMouseY.current = e.clientY;
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isMoving) {
      const deltaY = e.clientY - startMouseY.current;
      setConfig(prev => ({ ...prev, marginTop: startY.current + deltaY }));
    }
    if (isResizing) {
      const deltaY = e.clientY - startMouseY.current;
      // 마우스 이동량에 따라 비율 조정 (0.5배 ~ 1.5배 사이 제한)
      const newScale = Math.max(0.5, Math.min(1.5, startScale.current + (deltaY / 1000)));
      setConfig(prev => ({ ...prev, scale: newScale }));
    }
  }, [isMoving, isResizing]);

  const handleMouseUp = useCallback(() => {
    setIsMoving(false);
    setIsResizing(false);
  }, []);

  useEffect(() => {
    if (isMoving || isResizing) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    }
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isMoving, isResizing, handleMouseMove, handleMouseUp]);

  return (
    <div className="relative w-full min-h-screen bg-gray-100 py-4 sm:py-10 print:py-0 print:bg-white flex flex-col items-center overflow-x-auto sm:overflow-x-hidden px-3 sm:px-4">
      
      {/* 🌟 핵심 해결책: 화면에서 조절한 값을 인쇄(PDF)할 때도 강제로 주입하는 스타일 */}
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 0; }
          body { margin: 0; padding: 0; }
          /* 인쇄 시 config 상태값을 CSS transform으로 직접 연결합니다 */
          .printable-wrapper {
            transform: scale(${config.scale}) !important;
            margin-top: ${config.marginTop}px !important;
            transform-origin: top center !important;
          }
        }
      `}</style>

      {/* 상단 안내 및 초기화 패널 (인쇄 시 숨김 처리) */}
      <div className="mb-6 text-sm text-slate-700 font-bold bg-white p-4 rounded border border-slate-300 shadow-sm print:hidden z-10 w-full max-w-[794px]">
        상단 빈 공간을 드래그하여 위아래 위치를 조절하고, 우측 하단 모서리를 당겨 크기(비율)를 조절하십시오. 설정은 자동으로 저장됩니다.
        <div className="mt-3 flex items-center space-x-3">
          <button 
            onClick={() => setConfig({ scale: 1, marginTop: 0 })} 
            className="px-4 py-1.5 bg-gray-200 hover:bg-gray-300 rounded text-xs transition-colors"
          >
            기본값 초기화
          </button>
          <span className="text-xs text-gray-500">
            현재 비율: {Math.round(config.scale * 100)}% / 상단여백: {config.marginTop}px
          </span>
        </div>
      </div>

      {/* 조절 대상 컨테이너 */}
      {/* 🌟 printable-wrapper 클래스를 추가하여 인쇄 시 스타일이 먹히도록 연결 */}
      <div
        style={{
          transform: `scale(${config.scale})`,
          marginTop: `${config.marginTop}px`,
          transformOrigin: "top center",
          cursor: isMoving ? "grabbing" : "grab"
        }}
        onMouseDown={handleMouseDownMove}
        className="relative shadow-2xl print:shadow-none print:m-0 printable-wrapper inline-block max-w-full"
      >
        {/* 실제 양식 내용이 렌더링될 위치 */}
        <div className="bg-white pointer-events-auto">
          {children}
        </div>

        크기 조절 핸들 (우측 하단 모서리, 인쇄 시 숨김 처리)
        <div
          onMouseDown={handleMouseDownResize}
          className="absolute bottom-0 right-0 w-10 h-10 cursor-nwse-resize bg-gray-400 hover:bg-gray-600 flex items-center justify-center print:hidden z-50 rounded-tl-lg opacity-80 transition-colors"
          title="크기 조절"
        >
          <div className="w-3 h-3 border-r-2 border-b-2 border-white transform translate-x-[-2px] translate-y-[-2px]"></div>
        </div>
      </div>
    </div>
  );
}
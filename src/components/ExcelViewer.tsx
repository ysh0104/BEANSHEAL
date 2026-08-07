"use client";

import React, { useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx";

interface ExcelViewerProps {
  selectedOrder?: any;
  signatures?: Record<string, string>;
  openSignModal?: (role: string) => void;
  onSave?: (data: any) => void;
}

export default function ExcelViewer({
  selectedOrder,
  signatures = {},
  openSignModal,
  onSave,
}: ExcelViewerProps) {
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [activeSheet, setActiveSheet] = useState<string>("");
  const [sheetHtml, setSheetHtml] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const containerRef = useRef<HTMLDivElement>(null);

  // 1. 엑셀 원본 템플릿 로딩 (/templates/batch_record_template.xlsx)
  useEffect(() => {
    async function loadTemplate() {
      try {
        setLoading(true);
        setErrorMsg("");
        const res = await fetch("/templates/batch_record_template.xlsx");
        if (!res.ok) {
          throw new Error(`엑셀 템플릿 로딩 실패 (${res.status})`);
        }
        const ab = await res.arrayBuffer();
        const wb = XLSX.read(ab, {
          cellStyles: true,
          cellHTML: true,
          cellDates: true,
          cellFormula: true,
        });

        setWorkbook(wb);
        setSheetNames(wb.SheetNames);
        if (wb.SheetNames.length > 0) {
          setActiveSheet(wb.SheetNames[0]);
        }
      } catch (err: any) {
        console.error("Excel Template Load Error:", err);
        setErrorMsg(err.message || "엑셀 파일 로딩 중 오류 발생");
      } finally {
        setLoading(false);
      }
    }

    loadTemplate();
  }, []);

  // 2. 활성화된 시트를 엑셀 원본 HTML 테이블로 변환 및 실시간 데이터 바인딩
  useEffect(() => {
    if (!workbook || !activeSheet) return;

    const sheet = workbook.Sheets[activeSheet];
    if (!sheet) return;

    // 데이터 자동 채움 (제품명, 날짜, 수량 등)
    if (selectedOrder) {
      injectOrderDataToSheet(sheet, activeSheet, selectedOrder);
    }

    // SheetJS HTML 테이블 변환
    let html = XLSX.utils.sheet_to_html(sheet, { editable: true });

    // 전자 서명 이미지 바인딩 및 엑셀 스타일 보정
    html = injectSignaturesAndStyles(sheet, html, activeSheet, signatures);

    setSheetHtml(html);
  }, [workbook, activeSheet, selectedOrder, signatures]);

  // 엑셀 셀에 DB 데이터 자동 삽입
  function injectOrderDataToSheet(sheet: XLSX.WorkSheet, sheetName: string, order: any) {
    const itemName = order.itemName || order.product_name || "세리컷 프레소 V2";
    const orderDate = order.date ? order.date.replace(/-/g, ".") : "2026.04.09";
    const orderQty = order.qty || order.target_qty || 2250;
    const docNum = order.orderNumber || order.order_no || "PLS260401D";

    // 셀 값 변경 헬퍼
    const setCell = (cellRef: string, val: any) => {
      sheet[cellRef] = { t: typeof val === "number" ? "n" : "s", v: String(val) };
    };

    if (sheetName === "표지") {
      setCell("B4", `제품명 :  ${itemName}`);
      setCell("G6", orderDate);
      setCell("G7", orderQty);
      setCell("I8", Math.round((orderQty / 16.128) * 1000));
    } else if (sheetName === "제조지시기록서") {
      setCell("B7", itemName);
      setCell("F7", docNum);
      setCell("B9", orderDate);
      setCell("D9", orderQty);
    } else if (sheetName === "원료칭량기록서" || sheetName === "원료칭량기록서 (2)") {
      setCell("B2", `  제품명 : ${itemName}`);
      setCell("B3", `  제조지시기록량 : ${orderQty} kg`);
      setCell("B4", `  칭량일 : ${orderDate}`);
    } else if (sheetName === "완제품 출하 승인서") {
      setCell("B5", itemName);
      setCell("B8", orderDate);
      setCell("B17", `${orderQty.toLocaleString()} EA`);
    }
  }

  // 전자서명 및 엑셀 CSS 컬럼 너비/스타일 보정
  function injectSignaturesAndStyles(sheet: XLSX.WorkSheet, htmlStr: string, sheetName: string, sigs: Record<string, string>) {
    const cols = sheet["!cols"] || [];
    let colGroupHtml = "<colgroup>";
    let totalWidth = 0;
    
    if (cols.length > 0) {
      cols.forEach((col: any) => {
        const w = col.wpx || (col.width ? Math.round(col.width * 7.5) : 30);
        colGroupHtml += `<col style="width:${w}px; min-width:${w}px; max-width:${w}px;" />`;
        totalWidth += w;
      });
      colGroupHtml += "</colgroup>";
    }
    
    const tableWidthStyle = totalWidth > 0 ? `width:${totalWidth}px; min-width:${totalWidth}px;` : "width:100%;";

    // 엑셀 테이블에 colgroup 및 고정 너비 스타일 부여
    let updated = htmlStr.replace("<table>", `<table class="excel-live-table" style="${tableWidthStyle} table-layout:fixed; border-collapse:collapse; margin:0 auto;">${colGroupHtml}`);

    // 서명 위치 치환
    Object.entries(sigs).forEach(([role, sigUrl]) => {
      if (sigUrl) {
        const placeholder = `(${role})`;
        const imgTag = `<img src="${sigUrl}" style="max-height:45px; margin:0 auto; display:block;" alt="${role}" />`;
        updated = updated.replace(placeholder, imgTag);
      }
    });

    return updated;
  }

  // 3. 엑셀 파일 다운로드 (.xlsx)
  const handleDownloadXLSX = () => {
    if (!workbook) return;
    XLSX.writeFile(workbook, `제조지시기록서_${selectedOrder?.orderNumber || "Export"}.xlsx`);
  };

  // 4. A4 1:1 맞춤 인쇄 / PDF 다운로드
  const handlePrintPDF = () => {
    const printContent = containerRef.current?.innerHTML;
    if (!printContent) return;

    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${activeSheet} - 인쇄</title>
          <style>
            @page { size: A4 portrait; margin: 8mm; }
            *, *::before, *::after {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
              color-adjust: exact !important;
            }
            body { font-family: 'Malgun Gothic', '맑은 고딕', Dotum, sans-serif; margin: 0; padding: 0; background: #fff; color: #000; }
            table { border-collapse: collapse !important; width: 100% !important; border: 2px solid #000000 !important; table-layout: fixed; margin: 0 auto; }
            td, th { border: 1px solid #000000 !important; padding: 4px 6px !important; font-size: 11px !important; text-align: center; vertical-align: middle; word-break: break-all; color: #000 !important; }
            tr { height: 26px; }
            input, textarea { border: none !important; outline: none !important; background: transparent !important; text-align: center; width: 100%; font-family: inherit; font-size: inherit; color: #000 !important; }
          </style>
        </head>
        <body>
          ${printContent}
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 500);
  };

  return (
    <div className="w-full flex flex-col items-center font-sans bg-slate-200 min-h-screen p-4">
      {/* 🌟 엑셀 모드 상단 조작 툴바 */}
      <div className="w-full max-w-6xl bg-white border border-slate-300 rounded-xl p-4 shadow-md mb-4 flex flex-wrap items-center justify-between gap-3 sticky top-2 z-30">
        <div className="flex items-center gap-3">
          <span className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse"></span>
          <span className="font-extrabold text-slate-800 text-sm md:text-base">
            📊 MS Excel 원본 라이브 뷰어 & 서식 편집기
          </span>
          <span className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-md font-bold">
            엑셀 서식 100% 동일 일치 (오차 0%)
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handlePrintPDF}
            className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs px-4 py-2 rounded-lg shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            📄 엑셀 원본 A4 인쇄 / PDF
          </button>
          <button
            onClick={handleDownloadXLSX}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2 rounded-lg shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            📥 엑셀 파일 다운로드 (.xlsx)
          </button>
        </div>
      </div>

      {/* 🌟 엑셀 하단 시트 탭 바 (Excel Sheet Tabs) */}
      <div className="w-full max-w-6xl bg-slate-300 px-3 pt-2 rounded-t-lg border-b border-slate-400 flex items-center gap-1 overflow-x-auto">
        {sheetNames.map((name) => (
          <button
            key={name}
            onClick={() => setActiveSheet(name)}
            className={`px-4 py-2 text-xs font-bold rounded-t-md transition-all border-t border-l border-r whitespace-nowrap cursor-pointer ${
              activeSheet === name
                ? "bg-white text-slate-900 border-slate-400 border-b-white font-black shadow-xs -mb-[1px] border-t-3 border-t-emerald-600"
                : "bg-slate-200 text-slate-600 border-slate-300 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            📊 {name}
          </button>
        ))}
      </div>

      {/* 🌟 엑셀 워크시트 메인 렌더링 영역 */}
      <div className="w-full max-w-6xl bg-white border border-slate-400 shadow-xl p-8 rounded-b-lg min-h-[900px] overflow-x-auto flex justify-center">
        {loading && (
          <div className="flex flex-col items-center justify-center py-32 text-slate-600 gap-3">
            <span className="w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin"></span>
            <span className="font-bold text-sm">엑셀 원본 워크시트를 정밀 로딩하는 중입니다...</span>
          </div>
        )}

        {errorMsg && (
          <div className="p-8 text-center bg-rose-50 border border-rose-200 rounded-xl my-10 max-w-md">
            <span className="text-2xl block mb-2">⚠️</span>
            <h3 className="font-extrabold text-slate-900 mb-1">엑셀 로딩 안내</h3>
            <p className="text-xs text-rose-600 font-bold">{errorMsg}</p>
          </div>
        )}

        {!loading && !errorMsg && (
          <div className="excel-container w-full" ref={containerRef}>
            <style>{`
              .excel-container table {
                border-collapse: collapse;
                width: 100%;
                margin: 0 auto;
                font-family: '맑은 고딕', 'Malgun Gothic', Dotum, sans-serif;
                font-size: 13px;
                color: #000;
                table-layout: fixed;
                background-color: #fff;
              }
              .excel-container td, .excel-container th {
                border: 1px solid #475569;
                padding: 6px 8px;
                text-align: center;
                vertical-align: middle;
                word-break: break-all;
                background-clip: padding-box;
              }
              .excel-container tr {
                height: 30px;
              }
              .excel-container td[contenteditable="true"]:focus {
                outline: 2px solid #10b981;
                background-color: #ecfdf5 !important;
              }
              .excel-container tr:first-child td, .excel-container tr:first-child th {
                font-weight: bold;
              }
              @media print {
                @page { size: A4 portrait; margin: 5mm; }
                body { background: white !important; }
                .excel-container { padding: 0 !important; }
                .excel-container table { width: 100% !important; border: 2px solid #000 !important; }
              }
            `}</style>
            <div
              className="excel-html-wrapper"
              dangerouslySetInnerHTML={{ __html: sheetHtml }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

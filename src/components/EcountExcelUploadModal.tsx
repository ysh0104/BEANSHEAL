"use client";

import { useState } from "react";
import { parseEcountStockExcel, type EcountStockExcelRow } from "@/lib/ecountStockExcelParser";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function EcountExcelUploadModal({ isOpen, onClose, onSuccess }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<EcountStockExcelRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [skippedRows, setSkippedRows] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  if (!isOpen) return null;

  const resetPreview = () => {
    setParsedRows([]);
    setHeaders([]);
    setSkippedRows(0);
    setErrorMsg("");
  };

  const processFile = (fileToRead: File) => {
    setFile(fileToRead);
    resetPreview();

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const buffer = e.target?.result as ArrayBuffer;
        const parsed = parseEcountStockExcel(buffer);
        setHeaders(parsed.headers);
        setParsedRows(parsed.rows);
        setSkippedRows(parsed.skippedRows);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "형식을 확인하세요.";
        setErrorMsg(message);
      }
    };
    reader.readAsArrayBuffer(fileToRead);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) processFile(selectedFile);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) processFile(droppedFile);
  };

  const handleUploadSubmit = async () => {
    if (!file || parsedRows.length === 0) {
      alert("업로드할 유효한 재고 항목이 없습니다.");
      return;
    }

    setIsUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);

      const res = await fetch("/api/ecount/excel-stock", { method: "POST", body: form });
      const data = await res.json();

      if (data.success) {
        if (typeof window !== "undefined") {
          localStorage.setItem("beansheal_excel_items", JSON.stringify(parsedRows));
        }
        alert(
          data.message ||
            `총 ${data.count}개 품목의 재고(소수점 포함)가 반영되었습니다.`
        );
        onSuccess();
        onClose();
      } else {
        alert(`저장 실패: ${data.error || "알 수 없는 오류"}`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "통신 오류";
      alert(`오류 발생: ${message}`);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="bg-gradient-to-r from-emerald-800 to-teal-900 text-white px-5 py-4 flex justify-between items-center shrink-0">
          <div>
            <h3 className="font-extrabold text-base">이카ount 재고현황 엑셀 반영</h3>
            <p className="text-xs text-emerald-100 mt-0.5 font-medium">
              API(정수) 대신 엑셀 원본으로 소수점 재고를 100% 반영합니다.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-emerald-200 hover:text-white font-bold text-lg cursor-pointer px-2"
          >
            ✕
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto flex-1 text-xs">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3.5 text-[11px] text-emerald-950 leading-relaxed">
            <p className="font-bold text-emerald-900 mb-1">이카ount에서 엑셀 받는 방법</p>
            <ol className="list-decimal list-inside space-y-0.5 text-emerald-900/90">
              <li>재고 → 재고현황 (또는 재고수불부 → 재고현황)</li>
              <li>조회 후 우측 상단 <strong>엑셀</strong> 버튼으로 다운로드</li>
              <li>아래에 파일을 드래그하거나 선택 → 미리보기 확인 → DB 반영</li>
            </ol>
          </div>

          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            className="border-2 border-dashed border-emerald-300 bg-emerald-50/50 hover:bg-emerald-100/50 transition-colors rounded-xl p-6 text-center cursor-pointer relative"
          >
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileChange}
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
            />
            <div className="space-y-1 select-none">
              <p className="text-sm font-extrabold text-emerald-900">
                {file ? `선택된 파일: ${file.name}` : "재고현황 엑셀 (.xlsx)을 드래그하거나 클릭"}
              </p>
              <p className="text-xs text-emerald-700 font-medium">
                품목코드 · 품목명[규격] · 재고수량 열을 자동 인식합니다.
              </p>
            </div>
          </div>

          {headers.length > 0 && (
            <div className="text-[11px] text-gray-500 bg-gray-50 rounded-lg p-2 border border-gray-200">
              <span className="font-bold text-gray-700">감지된 컬럼: </span>
              {headers.filter(Boolean).join(" | ")}
              {skippedRows > 0 && (
                <span className="ml-2 text-amber-700">(합계·머리글 등 {skippedRows}행 제외)</span>
              )}
            </div>
          )}

          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg font-bold">{errorMsg}</div>
          )}

          {parsedRows.length > 0 && (
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="font-extrabold text-gray-800 text-xs">
                  파싱 성공:{" "}
                  <span className="text-emerald-700 font-mono text-sm">{parsedRows.length}</span>개 품목
                </span>
                <span className="text-[11px] text-gray-500 font-medium">(상위 5개 미리보기)</span>
              </div>

              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead className="bg-gray-100 text-gray-700 font-bold border-b border-gray-200">
                    <tr>
                      <th className="p-2 border-r border-gray-200">품목코드</th>
                      <th className="p-2 border-r border-gray-200">품목명</th>
                      <th className="p-2 text-right">재고수량</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white font-medium text-gray-800">
                    {parsedRows.slice(0, 5).map((row, idx) => (
                      <tr key={idx} className="hover:bg-emerald-50/50">
                        <td className="p-2 border-r border-gray-100 font-mono text-emerald-900 font-bold">
                          {row.prod_cd}
                        </td>
                        <td className="p-2 border-r border-gray-100 font-bold">{row.prod_nm}</td>
                        <td className="p-2 text-right font-mono font-bold text-emerald-700">
                          {row.total_qty.toLocaleString("ko-KR", { minimumFractionDigits: 0, maximumFractionDigits: 3 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="bg-gray-50 border-t border-gray-200 px-5 py-3.5 flex justify-between items-center shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer"
          >
            취소
          </button>

          <button
            type="button"
            onClick={handleUploadSubmit}
            disabled={parsedRows.length === 0 || isUploading}
            className="px-5 py-2 text-xs font-extrabold text-white bg-emerald-700 hover:bg-emerald-800 disabled:bg-emerald-300 rounded-lg transition-colors shadow-md cursor-pointer flex items-center gap-1.5"
          >
            {isUploading ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>DB에 반영 중...</span>
              </>
            ) : (
              <span>재고 DB 반영 ({parsedRows.length || 0}건)</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

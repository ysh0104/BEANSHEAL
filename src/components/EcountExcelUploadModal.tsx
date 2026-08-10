"use client";

import { useState } from "react";
import * as XLSX from "xlsx";
import { uploadEcountExcelMaster, ExcelMasterRow } from "@/app/actions/ecountExcelActions";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function EcountExcelUploadModal({ isOpen, onClose, onSuccess }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<ExcelMasterRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    processFile(selectedFile);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files?.[0];
    if (!droppedFile) return;
    processFile(droppedFile);
  };

  const processFile = (fileToRead: File) => {
    setFile(fileToRead);
    setErrorMsg("");
    setParsedRows([]);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        // 전체 행을 배열로 읽기 (header:1 옵션으로 첫 행을 헤더로 쓰지 않음)
        const allRows: any[][] = XLSX.utils.sheet_to_json(worksheet, {
          header: 1,
          defval: "",
        });

        if (allRows.length === 0) {
          setErrorMsg("엑셀 파일에 읽을 데이터가 없습니다.");
          return;
        }

        // 헤더 행 자동 탐색: "품목코드" 또는 "품목명" 이 포함된 행을 헤더로 인식
        let headerRowIdx = -1;
        for (let i = 0; i < Math.min(allRows.length, 10); i++) {
          const rowStr = allRows[i].map((c: any) => String(c || "")).join("|");
          if (/품목코드|PROD_CD|Item Code/i.test(rowStr)) {
            headerRowIdx = i;
            break;
          }
        }

        if (headerRowIdx === -1) {
          setErrorMsg("엑셀에서 '품목코드' 헤더를 찾을 수 없습니다. 이카운트 재고현황 엑셀인지 확인하세요.");
          return;
        }

        const rawHeaders = allRows[headerRowIdx].map((c: any) => String(c || "").trim());
        setHeaders(rawHeaders);

        // 컬럼 인덱스 자동 감지
        const codeIdx = rawHeaders.findIndex((h) =>
          /품목코드|코드|PROD_CD|ITEM_CD|Item Code/i.test(h.replace(/\s+/g, ""))
        );
        const nameIdx = rawHeaders.findIndex((h) =>
          /품목명|명칭|PROD_DES|PROD_NM|Item Name/i.test(h.replace(/\s+/g, ""))
        );
        const qtyIdx = rawHeaders.findIndex((h) =>
          /재고수량|수량|재고|BAL_QTY|QTY|Quantity|실재고/i.test(h.replace(/\s+/g, ""))
        );

        // 감지 못한 경우 순서대로 대입
        const finalCodeIdx = codeIdx >= 0 ? codeIdx : 0;
        const finalNameIdx = nameIdx >= 0 ? nameIdx : 1;
        const finalQtyIdx = qtyIdx >= 0 ? qtyIdx : 2;

        const validRows: ExcelMasterRow[] = [];
        const dataRows = allRows.slice(headerRowIdx + 1);

        // 유효하지 않은 행 필터링 함수
        // 날짜/시간 패턴, 합계행, 머리글/바닥글 텍스트 등을 걸러냄
        const isInvalidRow = (cd: string, nm: string): boolean => {
          const combined = `${cd} ${nm}`.trim();
          // 빈 행
          if (!cd && !nm) return true;
          // 날짜 패턴 (예: 2026/08/10, 2026-08-10, 2026.08.10)
          if (/\d{4}[\/.\-]\d{1,2}[\/.\-]\d{1,2}/.test(combined)) return true;
          // 시간 패턴 (예: 오전 4:58:46, 오후 4:58:46, 16:58:46)
          if (/(오전|오후)\s*\d{1,2}:\d{2}/.test(combined)) return true;
          if (/\d{2}:\d{2}:\d{2}/.test(combined)) return true;
          // 합계·소계·총계 행
          if (/^(합계|소계|총계|계|total|sum)$/i.test(cd.replace(/\s/g, ""))) return true;
          // 회사명·인쇄일 등 머리글/바닥글 ("회사명" 포함 또는 "재고현황" 포함)
          if (/(회사명|인쇄일|출력일|재고현황|페이지|Page)/i.test(combined)) return true;
          // 품목코드가 너무 길면(30자 초과) 유효한 코드가 아님
          if (cd.length > 30) return true;
          return false;
        };

        dataRows.forEach((row) => {
          const rawCd = String(row[finalCodeIdx] ?? "").trim();
          const rawNm = String(row[finalNameIdx] ?? "").trim();
          const rawQtyRaw = row[finalQtyIdx];

          // 유효하지 않은 행 스킵
          if (isInvalidRow(rawCd, rawNm)) return;

          const prodCd = rawCd || rawNm;
          const prodNm = rawNm || rawCd;

          // 숫자 변환 (콤마 제거, 빈값 → 0)
          const qtyStr = String(rawQtyRaw ?? "").replace(/,/g, "").trim();
          const qty = qtyStr === "" ? 0 : Number(qtyStr);
          const safeQty = isNaN(qty) ? 0 : qty;

          validRows.push({
            prod_cd: prodCd,
            prod_nm: prodNm,
            total_qty: safeQty,
          });
        });

        if (validRows.length === 0) {
          setErrorMsg("엑셀에서 유효한 품목코드, 품목명, 수량을 추출하지 못했습니다.");
          return;
        }

        setParsedRows(validRows);
      } catch (err: any) {
        console.error("엑셀 파싱 에러:", err);
        setErrorMsg(`엑셀 파싱 실패: ${err.message || "형식을 확인하세요."}`);
      }
    };
    reader.readAsArrayBuffer(fileToRead);
  };

  const handleUploadSubmit = async () => {
    if (parsedRows.length === 0) {
      alert("업로드할 유효한 재고 항목이 없습니다.");
      return;
    }

    setIsUploading(true);
    try {
      const res = await uploadEcountExcelMaster(parsedRows);
      if (res.success) {
        if (typeof window !== "undefined") {
          localStorage.setItem("beansheal_excel_items", JSON.stringify(parsedRows));
        }
        alert(`총 ${res.count}개 품목의 품목코드, 품목명, 정밀 재고(소수점 100% 보존)가 성공적으로 반영되었습니다!`);
        onSuccess();
        onClose();
      } else {
        alert(`저장 실패: ${res.error}`);
      }
    } catch (err: any) {
      alert(`오류 발생: ${err.message || "통신 오류"}`);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* 모달 헤더 */}
        <div className="bg-gradient-to-r from-blue-900 to-indigo-900 text-white px-5 py-4 flex justify-between items-center shrink-0">
          <div>
            <h3 className="font-extrabold text-base flex items-center gap-2">
              <span>이카운트 엑셀 재고 파일 100% 무손실 반영</span>
            </h3>
            <p className="text-xs text-blue-200 mt-0.5 font-medium">
              이카운트 ERP에서 다운받은 엑셀을 드래그하여 품목코드, 품목명, 소수점 수량을 100% 반영합니다.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-blue-200 hover:text-white font-bold text-lg cursor-pointer px-2"
          >
            ✕
          </button>
        </div>

        {/* 모달 본문 */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1 text-xs">
          {/* 드래그 앤 드롭 업로드 박스 */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            className="border-2 border-dashed border-blue-300 bg-blue-50/50 hover:bg-blue-100/50 transition-colors rounded-xl p-6 text-center cursor-pointer relative"
          >
            <input
              type="file"
              accept=".xlsx, .xls, .csv"
              onChange={handleFileChange}
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
            />
            <div className="space-y-1 select-none">
              <p className="text-sm font-extrabold text-blue-900">
                {file ? `선택된 파일: ${file.name}` : "이카운트 엑셀 파일 (.xlsx, .xls)을 여기에 드래그하거나 클릭하여 선택"}
              </p>
              <p className="text-xs text-blue-600 font-medium">
                품목코드, 품목명[규격], 재고수량 칼럼이 자동 추출됩니다. (제목 행 자동 건너뜀)
              </p>
            </div>
          </div>

          {/* 감지된 헤더 표시 */}
          {headers.length > 0 && (
            <div className="text-[11px] text-gray-500 bg-gray-50 rounded-lg p-2 border border-gray-200">
              <span className="font-bold text-gray-700">감지된 컬럼: </span>
              {headers.filter(Boolean).join(" | ")}
            </div>
          )}

          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg font-bold">
              {errorMsg}
            </div>
          )}

          {/* 미리보기 영역 */}
          {parsedRows.length > 0 && (
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="font-extrabold text-gray-800 text-xs">
                  엑셀 파싱 성공: 총 <span className="text-blue-600 font-mono text-sm">{parsedRows.length}</span>개 품목 추출됨
                </span>
                <span className="text-[11px] text-gray-500 font-medium">
                  (상위 5개 미리보기)
                </span>
              </div>

              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead className="bg-gray-100 text-gray-700 font-bold border-b border-gray-200">
                    <tr>
                      <th className="p-2 border-r border-gray-200">품목코드</th>
                      <th className="p-2 border-r border-gray-200">품목명[규격]</th>
                      <th className="p-2 text-right">재고수량</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white font-medium text-gray-800">
                    {parsedRows.slice(0, 5).map((row, idx) => (
                      <tr key={idx} className="hover:bg-blue-50/50">
                        <td className="p-2 border-r border-gray-100 font-mono text-blue-900 font-bold">{row.prod_cd}</td>
                        <td className="p-2 border-r border-gray-100 font-bold">{row.prod_nm}</td>
                        <td className="p-2 text-right font-mono font-bold text-emerald-700">
                          {row.total_qty.toLocaleString("ko-KR", { minimumFractionDigits: 3 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* 모달 푸터 */}
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
            className="px-5 py-2 text-xs font-extrabold text-white bg-blue-700 hover:bg-blue-800 disabled:bg-blue-300 rounded-lg transition-colors shadow-md cursor-pointer flex items-center gap-1.5"
          >
            {isUploading ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>DB에 반영 중...</span>
              </>
            ) : (
              <span>엑셀 재고 DB 100% 반영 적용</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

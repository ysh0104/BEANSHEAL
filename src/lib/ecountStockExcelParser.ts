import * as XLSX from "xlsx";

export interface EcountStockExcelRow {
  prod_cd: string;
  prod_nm: string;
  total_qty: number;
}

export interface EcountStockExcelParseResult {
  rows: EcountStockExcelRow[];
  headers: string[];
  headerRowIndex: number;
  skippedRows: number;
}

function isInvalidRow(cd: string, nm: string): boolean {
  const combined = `${cd} ${nm}`.trim();
  if (!cd && !nm) return true;
  if (/\d{4}[\/.\-]\d{1,2}[\/.\-]\d{1,2}/.test(combined)) return true;
  if (/(오전|오후)\s*\d{1,2}:\d{2}/.test(combined)) return true;
  if (/\d{2}:\d{2}:\d{2}/.test(combined)) return true;
  if (/^(합계|소계|총계|계|total|sum)$/i.test(cd.replace(/\s/g, ""))) return true;
  if (/(회사명|인쇄일|출력일|재고현황|페이지|Page)/i.test(combined)) return true;
  if (cd.length > 30) return true;
  return false;
}

function findColumnIndex(headers: string[], patterns: RegExp[], fallback: number): number {
  const idx = headers.findIndex((h) => patterns.some((p) => p.test(h.replace(/\s+/g, ""))));
  return idx >= 0 ? idx : fallback;
}

/**
 * 이카ount ERP 「재고현황」 엑셀 → 품목코드·품목명·재고수량(소수점 보존)
 * 브라우저 업로드·API·Playwright 봇이 동일 파서 사용
 */
export function parseEcountStockExcel(input: ArrayBuffer | Uint8Array): EcountStockExcelParseResult {
  const data = input instanceof Uint8Array ? input : new Uint8Array(input);
  const workbook = XLSX.read(data, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error("엑셀 시트를 찾을 수 없습니다.");
  }

  const worksheet = workbook.Sheets[sheetName];
  const allRows: unknown[][] = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: "",
  });

  if (allRows.length === 0) {
    throw new Error("엑셀 파일에 읽을 데이터가 없습니다.");
  }

  let headerRowIdx = -1;
  for (let i = 0; i < Math.min(allRows.length, 15); i++) {
    const rowStr = allRows[i].map((c) => String(c ?? "")).join("|");
    if (/품목코드|PROD_CD|Item Code/i.test(rowStr)) {
      headerRowIdx = i;
      break;
    }
  }

  if (headerRowIdx === -1) {
    throw new Error("엑셀에서 '품목코드' 헤더를 찾을 수 없습니다. 이카ount 재고현황 엑셀인지 확인하세요.");
  }

  const rawHeaders = allRows[headerRowIdx].map((c) => String(c ?? "").trim());

  const codeIdx = findColumnIndex(rawHeaders, [/품목코드|^코드$|PROD_CD|ITEM_CD|ItemCode/i], 0);
  const nameIdx = findColumnIndex(rawHeaders, [/품목명|품목명\[규격\]|명칭|PROD_DES|PROD_NM|ItemName/i], 1);
  const qtyIdx = findColumnIndex(rawHeaders, [/재고수량|^수량$|재고|BAL_QTY|QTY|Quantity|실재고/i], 2);

  const rows: EcountStockExcelRow[] = [];
  let skippedRows = 0;
  const dataRows = allRows.slice(headerRowIdx + 1);

  for (const row of dataRows) {
    if (!Array.isArray(row)) continue;

    const rawCd = String(row[codeIdx] ?? "").trim();
    const rawNm = String(row[nameIdx] ?? "").trim();
    const rawQtyRaw = row[qtyIdx];

    if (isInvalidRow(rawCd, rawNm)) {
      skippedRows += 1;
      continue;
    }

    const prodCd = rawCd || rawNm;
    const prodNm = rawNm || rawCd;
    const qtyStr = String(rawQtyRaw ?? "").replace(/,/g, "").trim();
    const qty = qtyStr === "" ? 0 : Number(qtyStr);
    const safeQty = Number.isFinite(qty) ? qty : 0;

    rows.push({
      prod_cd: prodCd,
      prod_nm: prodNm,
      total_qty: safeQty,
    });
  }

  if (rows.length === 0) {
    throw new Error("엑셀에서 유효한 품목코드·품목명·수량을 추출하지 못했습니다.");
  }

  return {
    rows,
    headers: rawHeaders,
    headerRowIndex: headerRowIdx,
    skippedRows,
  };
}

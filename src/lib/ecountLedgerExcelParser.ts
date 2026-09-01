import * as XLSX from "xlsx";

export type LedgerRowKind = "opening" | "txn" | "subtotal" | "total" | "other";

export type EcountLedgerExcelRow = {
  txn_date: string;
  partner_name: string;
  remarks: string;
  in_qty: number;
  out_qty: number;
  balance_qty: number | null;
  lot_no: string;
  row_kind: LedgerRowKind;
};

export type EcountLedgerParseResult = {
  rows: EcountLedgerExcelRow[];
  prod_nm: string;
  prod_cd: string;
  headers: string[];
};

export type EcountLedgerBulkParseResult = {
  items: EcountLedgerParseResult[];
  total_rows: number;
};

function parseQty(raw: unknown): number {
  if (raw === null || raw === undefined || raw === "") return 0;
  const n = Number(String(raw).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

function findCol(headers: string[], patterns: RegExp[], fallback = -1): number {
  const idx = headers.findIndex((h) => patterns.some((p) => p.test(String(h).replace(/\s+/g, ""))));
  return idx >= 0 ? idx : fallback;
}

function classifyRow(date: string, remarks: string): LedgerRowKind {
  const d = date.trim();
  const r = remarks.trim();
  if (/전일재고/.test(r) || /전일재고/.test(d)) return "opening";
  if (/합계/.test(r) || /^합계$/.test(d)) return "total";
  if (/계$/.test(d) || /월\s*계/.test(d) || /^\d{4}[\/.\-]\d{1,2}\s*계/.test(d)) return "subtotal";
  return "txn";
}

function isLedgerHeaderRow(row: unknown[]): boolean {
  const cells = row.map((c) => String(c).trim());
  const joined = cells.join(" ");
  const hasDate = cells.some((c) => /^일자$/.test(c.replace(/\s+/g, ""))) || /일자/.test(joined);
  const hasIn = cells.some((c) => /입고/.test(c)) || /입고/.test(joined);
  const hasOut = cells.some((c) => /출고/.test(c)) || /출고/.test(joined);
  return hasDate && (hasIn || hasOut);
}

function extractProdFromRowsAbove(allRows: unknown[][], headerIndex: number): { prod_cd: string; prod_nm: string } {
  for (let j = headerIndex - 1; j >= Math.max(0, headerIndex - 10); j--) {
    const row = allRows[j];
    if (!Array.isArray(row)) continue;
    const line = row.map((c) => String(c)).join(" ");
    if (!line.trim()) continue;

    const m = line.match(/\(([A-Z0-9][A-Z0-9_-]*)\)/i);
    if (m) {
      let prod_nm = "";
      const nameMatch = line.match(/[/／]\s*(.+?)\s*\(/);
      if (nameMatch) {
        prod_nm = nameMatch[1].trim();
      } else {
        const before = line.split("(")[0].trim();
        if (before && !/품목|회사|재고수불부|출력|인쇄/.test(before)) {
          prod_nm = before.replace(/^[\d.]+\s*/, "").trim();
        }
      }
      return { prod_cd: m[1].trim(), prod_nm };
    }
  }
  return { prod_cd: "", prod_nm: "" };
}

function parseRowsFromSection(
  allRows: unknown[][],
  headerRowIndex: number,
  headers: string[],
  nextHeaderIndex: number,
  expectedProdCd?: string
): EcountLedgerExcelRow[] {
  const col = {
    date: findCol(headers, [/일자/, /날짜/], 0),
    partner: findCol(headers, [/거래처/, /업체/, /상호/], 1),
    remarks: findCol(headers, [/적요/, /비고/, /내용/], 2),
    inQty: findCol(headers, [/입고/], 3),
    outQty: findCol(headers, [/출고/], 4),
    balance: findCol(headers, [/재고수량/, /^재고$/], 5),
    lot: findCol(headers, [/시리얼/, /로트/, /LOT/i], 6),
  };

  const rows: EcountLedgerExcelRow[] = [];
  const end = nextHeaderIndex < 0 ? allRows.length : nextHeaderIndex;

  for (let i = headerRowIndex + 1; i < end; i++) {
    const row = allRows[i];
    if (!Array.isArray(row)) continue;

    if (isLedgerHeaderRow(row)) break;

    const line = row.map((c) => String(c)).join(" ");
    if (/\([A-Z0-9][A-Z0-9_-]*\)/i.test(line) && /품목|^\s*[\d.]+\s/.test(line)) continue;

    const txn_date = String(row[col.date] ?? "").trim();
    const partner_name = String(row[col.partner] ?? "").trim();
    const remarks = String(row[col.remarks] ?? "").trim();
    const lot_no = String(row[col.lot] ?? "").trim();

    if (!txn_date && !remarks && !partner_name) continue;
    if (/^(페이지|Page|\[P\.)/i.test(txn_date)) continue;
    if (/인쇄일|출력일|재고수불부/.test(`${txn_date}${remarks}`)) continue;

    const row_kind = classifyRow(txn_date, remarks);
    const in_qty = parseQty(row[col.inQty]);
    const out_qty = parseQty(row[col.outQty]);
    const balanceRaw = row[col.balance];
    const balance_qty =
      balanceRaw === "" || balanceRaw === null || balanceRaw === undefined ? null : parseQty(balanceRaw);

    if (row_kind === "txn" && !txn_date && !remarks) continue;
    if (expectedProdCd && row_kind === "txn" && !txn_date && !lot_no && in_qty === 0 && out_qty === 0) continue;

    rows.push({
      txn_date,
      partner_name,
      remarks,
      in_qty,
      out_qty,
      balance_qty,
      lot_no,
      row_kind,
    });
  }

  return rows;
}

/**
 * 이카ount 「재고수불부」 엑셀 — 단일 품목 섹션 파싱
 */
export function parseEcountLedgerExcel(
  input: ArrayBuffer | Uint8Array,
  expectedProdCd?: string
): EcountLedgerParseResult {
  const bulk = parseEcountLedgerExcelBulk(input);
  if (expectedProdCd) {
    const match = bulk.items.find((it) => it.prod_cd === expectedProdCd);
    if (match) return match;
  }
  if (bulk.items.length === 1) return bulk.items[0];
  if (bulk.items.length > 1) {
    throw new Error(
      `엑셀에 ${bulk.items.length}개 품목이 있습니다. 품목코드 없이 전체 조회한 경우 parseEcountLedgerExcelBulk를 사용하세요.`
    );
  }
  throw new Error("재고수불부 데이터 행이 없습니다.");
}

/**
 * 이카ount 「재고수불부」 엑셀 — 전체 품목(다중 섹션) 파싱
 */
export function parseEcountLedgerExcelBulk(input: ArrayBuffer | Uint8Array): EcountLedgerBulkParseResult {
  const data = input instanceof Uint8Array ? input : new Uint8Array(input);
  const workbook = XLSX.read(data, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("엑셀 시트를 찾을 수 없습니다.");

  const allRows: unknown[][] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    header: 1,
    defval: "",
  });

  const headerIndices: number[] = [];
  for (let i = 0; i < allRows.length; i++) {
    const row = allRows[i];
    if (!Array.isArray(row)) continue;
    if (isLedgerHeaderRow(row)) headerIndices.push(i);
  }

  if (headerIndices.length === 0) {
    for (let i = 0; i < Math.min(80, allRows.length); i++) {
      const row = allRows[i];
      if (!Array.isArray(row)) continue;
      const joined = row.map((c) => String(c)).join(" ");
      if (/품목코드/.test(joined) && /재고수량/.test(joined)) {
        throw new Error(
          "「재고현황」 엑셀입니다. 수불부 업로드에는 이카ount 출력물 → 재고수불부 화면에서 Excel로 받은 파일이 필요합니다. (일자·거래처명·적요·입고·출고 컬럼)"
        );
      }
    }
    throw new Error("재고수불부 헤더 행을 찾을 수 없습니다. (일자·입고·출고 컬럼 확인)");
  }

  const items: EcountLedgerParseResult[] = [];
  let total_rows = 0;

  for (let s = 0; s < headerIndices.length; s++) {
    const headerRowIndex = headerIndices[s];
    const nextHeaderIndex = s + 1 < headerIndices.length ? headerIndices[s + 1] : -1;
    const headers = allRows[headerRowIndex].map((h) => String(h).trim());
    const { prod_cd, prod_nm } = extractProdFromRowsAbove(allRows, headerRowIndex);
    const rows = parseRowsFromSection(allRows, headerRowIndex, headers, nextHeaderIndex);

    if (rows.length === 0 && !prod_cd) continue;

    const cd = prod_cd || `__UNKNOWN_${s + 1}__`;
    items.push({ rows, prod_nm, prod_cd: cd, headers });
    total_rows += rows.length;
  }

  if (items.length === 0) {
    throw new Error("재고수불부 품목 섹션을 파싱하지 못했습니다.");
  }

  return { items, total_rows };
}

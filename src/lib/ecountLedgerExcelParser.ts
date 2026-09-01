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

/**
 * 이카ount 「재고수불부」 엑셀 파싱
 * 컬럼: 일자, 거래처명, 적요, 입고수량, 출고수량, 재고수량, 시리얼/로트
 */
export function parseEcountLedgerExcel(
  input: ArrayBuffer | Uint8Array,
  expectedProdCd?: string
): EcountLedgerParseResult {
  const data = input instanceof Uint8Array ? input : new Uint8Array(input);
  const workbook = XLSX.read(data, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("엑셀 시트를 찾을 수 없습니다.");

  const allRows: unknown[][] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    header: 1,
    defval: "",
  });

  let headerRowIndex = -1;
  for (let i = 0; i < Math.min(80, allRows.length); i++) {
    const row = allRows[i];
    if (!Array.isArray(row)) continue;
    const cells = row.map((c) => String(c).trim());
    const joined = cells.join(" ");
    const hasDate = cells.some((c) => /^일자$/.test(c.replace(/\s+/g, ""))) || /일자/.test(joined);
    const hasIn = cells.some((c) => /입고/.test(c)) || /입고/.test(joined);
    const hasOut = cells.some((c) => /출고/.test(c)) || /출고/.test(joined);
    if (hasDate && (hasIn || hasOut)) {
      headerRowIndex = i;
      break;
    }
  }

  if (headerRowIndex < 0) {
    for (let i = 0; i < Math.min(80, allRows.length); i++) {
      const row = allRows[i];
      if (!Array.isArray(row)) continue;
      const joined = row.map((c) => String(c)).join(" ");
      if (/품목코드/.test(joined) && /재고수량/.test(joined)) {
        throw new Error(
          "재고현황 엑셀이 다운로드되었습니다. 봇이 재고수불부가 아닌 재고현황 화면에서 저장했을 수 있습니다."
        );
      }
    }
    throw new Error("재고수불부 헤더 행을 찾을 수 없습니다. (일자·입고·출고 컬럼 확인)");
  }

  const headers = allRows[headerRowIndex].map((h) => String(h).trim());

  const col = {
    date: findCol(headers, [/일자/, /날짜/], 0),
    partner: findCol(headers, [/거래처/, /업체/, /상호/], 1),
    remarks: findCol(headers, [/적요/, /비고/, /내용/], 2),
    inQty: findCol(headers, [/입고/], 3),
    outQty: findCol(headers, [/출고/], 4),
    balance: findCol(headers, [/재고수량/, /^재고$/], 5),
    lot: findCol(headers, [/시리얼/, /로트/, /LOT/i], 6),
  };

  let prod_nm = "";
  let prod_cd = expectedProdCd || "";

  for (let i = 0; i < headerRowIndex; i++) {
    const line = allRows[i].map((c) => String(c)).join(" ");
    const m = line.match(/\(([^)]+)\)\s*$/);
    if (m && /^[A-Z0-9]+$/i.test(m[1].trim())) {
      prod_cd = prod_cd || m[1].trim();
    }
    if (/품목|회사명/.test(line) && !prod_nm) {
      const nameMatch = line.match(/[/／]\s*(.+?)\s*\(/);
      if (nameMatch) prod_nm = nameMatch[1].trim();
    }
  }

  const rows: EcountLedgerExcelRow[] = [];

  for (let i = headerRowIndex + 1; i < allRows.length; i++) {
    const row = allRows[i];
    if (!Array.isArray(row)) continue;

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
      balanceRaw === "" || balanceRaw === null || balanceRaw === undefined
        ? null
        : parseQty(balanceRaw);

    if (row_kind === "txn" && !txn_date && !remarks) continue;

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

  return { rows, prod_nm, prod_cd, headers };
}

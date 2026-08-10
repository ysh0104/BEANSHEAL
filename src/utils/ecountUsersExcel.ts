import * as XLSX from "xlsx";

export type EcountUserExcelRow = {
  user_id: string;
  emp_cd: string;
  user_name: string;
  dept_name: string;
  raw?: Record<string, string>;
};

function cellStr(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "number" && Number.isFinite(value)) {
    // 사원번호 0007 등이 숫자로 읽힌 경우 정수면 그대로 문자열화
    return Number.isInteger(value) ? String(value) : String(value);
  }
  return String(value).trim();
}

function normHeader(h: string): string {
  return h.replace(/\s/g, "").toLowerCase();
}

function findHeaderIndex(rows: any[][]): number {
  for (let i = 0; i < Math.min(30, rows.length); i++) {
    const row = rows[i];
    if (!Array.isArray(row)) continue;
    const cells = row.map((c) => normHeader(cellStr(c)));
    const hasId =
      cells.some((c) => c.includes("아이디") || c === "id" || c.includes("로그인")) ||
      cells.some((c) => c.includes("userid") || c.includes("user_id"));
    const hasName =
      cells.some((c) => c.includes("성명") || c.includes("이름") || c.includes("사원명")) ||
      cells.some((c) => c.includes("user_name") || c.includes("uname"));
    if (hasId && hasName) return i;
    // EMM001M: 아이디 + 사원번호
    if (hasId && cells.some((c) => c.includes("사원번호") || c.includes("고객번호"))) return i;
  }
  return -1;
}

function colIndex(headers: string[], predicates: ((h: string) => boolean)[]): number {
  for (const pred of predicates) {
    const idx = headers.findIndex(pred);
    if (idx >= 0) return idx;
  }
  return -1;
}

/** 이카운트 사용자등록(EMM001M) 엑셀 → 매칭용 행 목록 */
export async function parseEcountUsersExcel(file: File): Promise<{
  rows: EcountUserExcelRow[];
  sheetName: string;
}> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: false, raw: false });

  const preferred =
    wb.SheetNames.find((n) => n.includes("사용자")) ||
    wb.SheetNames.find((n) => n.toUpperCase().includes("EMM")) ||
    wb.SheetNames[0];

  const sheet = wb.Sheets[preferred];
  if (!sheet) {
    throw new Error("엑셀 시트를 찾을 수 없습니다.");
  }

  const rawRows = XLSX.utils.sheet_to_json<any[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
  });

  const headerIdx = findHeaderIndex(rawRows);
  if (headerIdx < 0) {
    throw new Error(
      "헤더(아이디·성명)를 찾지 못했습니다. 이카운트 「사용자등록(EMM001M)」 엑셀인지 확인하세요."
    );
  }

  const headers = (rawRows[headerIdx] as any[]).map((h) => cellStr(h));
  const normHeaders = headers.map(normHeader);

  const idxId = colIndex(normHeaders, [
    (h) => h === "아이디" || h.includes("아이디"),
    (h) => h === "id" || h === "userid" || h === "user_id" || h.includes("로그인"),
  ]);
  const idxName = colIndex(normHeaders, [
    (h) => h === "성명" || h.includes("성명"),
    (h) => h.includes("이름") || h.includes("사원명") || h === "user_name",
  ]);
  const idxEmp = colIndex(normHeaders, [
    (h) => h.includes("사원번호"),
    (h) => h === "emp_cd" || h === "empcd",
  ]);
  const idxDept = colIndex(normHeaders, [
    (h) => h.includes("허용부서") || h.includes("부서"),
    (h) => h === "dept_name" || h.includes("dept"),
  ]);

  if (idxId < 0) {
    throw new Error("「아이디」 열을 찾을 수 없습니다.");
  }

  const out: EcountUserExcelRow[] = [];
  const seen = new Set<string>();

  for (let i = headerIdx + 1; i < rawRows.length; i++) {
    const row = rawRows[i] as any[];
    if (!row || !Array.isArray(row)) continue;
    if (row.every((c) => cellStr(c) === "")) continue;

    const user_id = cellStr(row[idxId]);
    if (!user_id) continue;

    // 푸터 타임스탬프·합계 행 스킵
    if (/^\d{4}\/\d{2}\/\d{2}/.test(user_id) || user_id === "합계" || user_id === "소계") {
      continue;
    }

    const user_name = idxName >= 0 ? cellStr(row[idxName]) : user_id;
    const empRaw = idxEmp >= 0 ? cellStr(row[idxEmp]) : "";
    const emp_cd = empRaw || user_id;
    let dept_name = idxDept >= 0 ? cellStr(row[idxDept]) : "";
    if (dept_name === "전체") dept_name = "";

    const key = user_id.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const raw: Record<string, string> = {};
    headers.forEach((h, idx) => {
      if (h) raw[h] = cellStr(row[idx]);
    });

    out.push({
      user_id,
      emp_cd,
      user_name: user_name || user_id,
      dept_name,
      raw,
    });
  }

  if (!out.length) {
    throw new Error("등록할 사용자 행이 없습니다.");
  }

  return { rows: out, sheetName: preferred };
}

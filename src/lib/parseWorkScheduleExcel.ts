import * as XLSX from "xlsx";
import { normalizePersonName } from "@/lib/departmentNormalize";

/** 엑셀 표기 ↔ 사내 profiles 이름 보정 */
export const WORK_SCHEDULE_NAME_ALIASES: Record<string, string> = {
  유혜형: "유희정",
  최봉주: "최봉구",
  정선영: "정성영",
};

export type ParsedExcelEmployee = {
  /** 엑셀 원본 이름 */
  excelName: string;
  /** alias 적용 후 매칭용 이름 */
  matchName: string;
  shifts: Record<string, string>;
};

export type ParsedExcelMonth = {
  yearMonth: string; // YYYY-MM
  year: number;
  month: number;
  sheetName: string;
  employees: ParsedExcelEmployee[];
};

export type ParseWorkScheduleExcelResult = {
  months: ParsedExcelMonth[];
  skippedSheets: string[];
  warnings: string[];
};

function cellStr(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date) return "";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return String(value).trim();
}

function isPlaceholderName(name: string): boolean {
  const n = name.trim();
  if (!n) return true;
  if (/^(CCC|BBB|AAA|XXX|TEST|테스트)$/i.test(n)) return true;
  if (/^[A-Za-z0-9_\-]{1,4}$/.test(n) && !/[가-힣]/.test(n)) return true;
  return false;
}

function resolveMatchName(excelName: string): string {
  const raw = normalizePersonName(excelName);
  return WORK_SCHEDULE_NAME_ALIASES[raw] || raw;
}

function excelCellToDateParts(value: unknown): { year: number; month: number; day: number } | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    // xlsx는 UTC 자정 Date로 내려주는 경우가 많아 로컬 getDate()면 하루 밀림
    return {
      year: value.getUTCFullYear(),
      month: value.getUTCMonth() + 1,
      day: value.getUTCDate(),
    };
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    // Excel serial date
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed && parsed.y && parsed.m && parsed.d) {
      return { year: parsed.y, month: parsed.m, day: parsed.d };
    }
  }
  if (typeof value === "string") {
    const s = value.trim();
    const iso = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/);
    if (iso) {
      return {
        year: Number(iso[1]),
        month: Number(iso[2]),
        day: Number(iso[3]),
      };
    }
  }
  return null;
}

function parseMonthFromSheetName(sheetName: string): number | null {
  const m = sheetName.trim().match(/^(\d{1,2})\s*월$/);
  if (m) {
    const month = Number(m[1]);
    if (month >= 1 && month <= 12) return month;
  }
  return null;
}

function normalizeShiftCode(raw: unknown): string | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number") return null;
  const code = String(raw).trim().toUpperCase();
  if (!code) return null;
  // 합계/메모 셀 제외
  if (/^\(?\+?\d+\)?$/.test(code)) return null;
  if (code === "이름" || code === "기준월") return null;
  return code;
}

function parseSheet(
  sheetName: string,
  ws: XLSX.WorkSheet,
  warnings: string[],
  defaultYear: number
): ParsedExcelMonth | null {
  // cellDates:false → 시리얼 숫자로 받아 타임존 오차 방지
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: null,
    raw: true,
  }) as unknown[][];

  if (!rows.length) return null;

  let headerRowIdx = -1;
  let nameColIdx = -1;
  const dayColMap = new Map<number, number>(); // colIdx -> day of month
  let year = 0;
  let month = 0;

  for (let r = 0; r < Math.min(8, rows.length); r++) {
    const row = rows[r] || [];
    let foundNameCol = -1;
    const dayCols = new Map<number, number>();
    let y = 0;
    let m = 0;

    for (let c = 0; c < row.length; c++) {
      const cell = row[c];
      if (cellStr(cell) === "이름") {
        foundNameCol = c;
        continue;
      }
      const parts = excelCellToDateParts(cell);
      if (parts) {
        dayCols.set(c, parts.day);
        if (!y) {
          y = parts.year;
          m = parts.month;
        }
      }
    }

    if (foundNameCol >= 0 && dayCols.size >= 7) {
      headerRowIdx = r;
      nameColIdx = foundNameCol;
      dayCols.forEach((day, col) => dayColMap.set(col, day));
      year = y;
      month = m;
      break;
    }
  }

  // 시트명·기준월 셀로 연/월 보정
  const sheetMonth = parseMonthFromSheetName(sheetName);
  let baseYearHint = 0;
  for (let r = 0; r < Math.min(4, rows.length); r++) {
    const row = rows[r] || [];
    for (let c = 0; c < row.length; c++) {
      if (cellStr(row[c]) === "기준월") {
        const parts = excelCellToDateParts(row[c + 1]);
        if (parts) {
          baseYearHint = parts.year;
          if (!sheetMonth) month = parts.month;
        }
      }
    }
  }

  if (headerRowIdx < 0 || nameColIdx < 0 || dayColMap.size === 0) {
    warnings.push(`시트 "${sheetName}": 날짜/이름 헤더를 찾지 못해 건너뜀`);
    return null;
  }

  if (sheetMonth) month = sheetMonth;
  if (baseYearHint) year = baseYearHint;
  else if (year) {
    // 시리얼/Date가 전월로 밀린 경우 시트월 기준으로 연도 보정
    if (sheetMonth && month === sheetMonth && year > 0) {
      /* keep */
    }
  }
  if (!year) year = defaultYear;
  if (!month) {
    warnings.push(`시트 "${sheetName}": 월 정보를 찾지 못해 건너뜀`);
    return null;
  }

  // 시트월과 파싱된 일자 열이 어긋나면(타임존), 열 순서대로 1..N 일 재매핑
  const sortedDayCols = [...dayColMap.entries()].sort((a, b) => a[0] - b[0]);
  const daysInMonth = new Date(year, month, 0).getDate();
  if (sortedDayCols.length >= daysInMonth - 2) {
    const remapped = new Map<number, number>();
    sortedDayCols.forEach(([col], i) => {
      const day = i + 1;
      if (day <= daysInMonth) remapped.set(col, day);
    });
    if (remapped.size >= 28) {
      dayColMap.clear();
      remapped.forEach((day, col) => dayColMap.set(col, day));
    }
  }

  const employees: ParsedExcelEmployee[] = [];
  const seenNames = new Set<string>();

  for (let r = headerRowIdx + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const excelName = cellStr(row[nameColIdx]);
    if (!excelName || isPlaceholderName(excelName)) continue;
    if (excelName === "이름") continue;

    const shifts: Record<string, string> = {};
    dayColMap.forEach((day, col) => {
      const code = normalizeShiftCode(row[col]);
      if (code) shifts[String(day)] = code;
    });

    // 근무 코드가 거의 없으면 합계/빈 행으로 간주
    if (Object.keys(shifts).length < 3) continue;

    const matchName = resolveMatchName(excelName);
    const key = normalizePersonName(matchName);
    if (seenNames.has(key)) {
      warnings.push(`시트 "${sheetName}": 중복 이름 "${excelName}" — 마지막 행 사용`);
      const idx = employees.findIndex((e) => normalizePersonName(e.matchName) === key);
      if (idx >= 0) employees.splice(idx, 1);
    }
    seenNames.add(key);

    employees.push({ excelName, matchName, shifts });
  }

  if (employees.length === 0) {
    warnings.push(`시트 "${sheetName}": 사원 행이 없어 건너뜀`);
    return null;
  }

  const yearMonth = `${year}-${String(month).padStart(2, "0")}`;
  return {
    yearMonth,
    year,
    month,
    sheetName,
    employees,
  };
}

/** 근무시간표(YYYY).xlsx → 월별 사원 shifts */
export async function parseWorkScheduleExcel(file: File): Promise<ParseWorkScheduleExcelResult> {
  const buf = await file.arrayBuffer();
  // cellDates:false 로 시리얼 유지 → SSF로 연/월/일 추출 (타임존 안전)
  const wb = XLSX.read(buf, { type: "array", cellDates: false, raw: true });

  const yearFromName = file.name.match(/(20\d{2})/)?.[1];
  const defaultYear = yearFromName ? Number(yearFromName) : 2026;

  const months: ParsedExcelMonth[] = [];
  const skippedSheets: string[] = [];
  const warnings: string[] = [];

  for (const sheetName of wb.SheetNames) {
    if (/공휴일|휴일|범례|설명|코드/.test(sheetName)) {
      skippedSheets.push(sheetName);
      continue;
    }
    const ws = wb.Sheets[sheetName];
    if (!ws) {
      skippedSheets.push(sheetName);
      continue;
    }
    const parsed = parseSheet(sheetName, ws, warnings, defaultYear);
    if (parsed) months.push(parsed);
    else skippedSheets.push(sheetName);
  }

  months.sort((a, b) => a.yearMonth.localeCompare(b.yearMonth));

  return { months, skippedSheets, warnings };
}

export type OverlayMatchResult = {
  rows: import("@/app/actions/workScheduleActions").ScheduleEmployeeRow[];
  matchedNames: string[];
  unmatchedExcelNames: string[];
  rosterWithoutExcel: string[];
};

/** 엑셀 shifts를 기존 스케줄 행에 덮어쓰기 (이름 매칭) */
export function overlayExcelShiftsOnRows(
  baseRows: import("@/app/actions/workScheduleActions").ScheduleEmployeeRow[],
  excelEmployees: ParsedExcelEmployee[],
  options?: { addUnmatchedAsNew?: boolean; defaultGroup?: string }
): OverlayMatchResult {
  const addUnmatched = options?.addUnmatchedAsNew ?? false;
  const defaultGroup = options?.defaultGroup ?? "생산팀";

  const byName = new Map<string, number>();
  baseRows.forEach((row, idx) => {
    byName.set(normalizePersonName(row.name), idx);
  });

  const next = baseRows.map((r) => ({
    ...r,
    shifts: { ...r.shifts },
  }));

  const matchedNames: string[] = [];
  const unmatchedExcelNames: string[] = [];
  const matchedBaseKeys = new Set<string>();

  for (const emp of excelEmployees) {
    const key = normalizePersonName(emp.matchName);
    const idx = byName.get(key);
    if (idx != null) {
      next[idx] = {
        ...next[idx],
        shifts: { ...emp.shifts },
      };
      matchedNames.push(emp.excelName === emp.matchName ? emp.excelName : `${emp.excelName}→${emp.matchName}`);
      matchedBaseKeys.add(key);
    } else if (addUnmatched) {
      const id = `excel-${key}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      next.push({
        id,
        name: emp.matchName,
        group: defaultGroup,
        shifts: { ...emp.shifts },
      });
      byName.set(key, next.length - 1);
      matchedNames.push(`${emp.excelName} (신규)`);
      matchedBaseKeys.add(key);
    } else {
      unmatchedExcelNames.push(
        emp.excelName === emp.matchName ? emp.excelName : `${emp.excelName}→${emp.matchName}`
      );
    }
  }

  const rosterWithoutExcel = next
    .filter((r) => !matchedBaseKeys.has(normalizePersonName(r.name)))
    .filter((r) => !String(r.id).startsWith("excel-"))
    .map((r) => r.name);

  return { rows: next, matchedNames, unmatchedExcelNames, rosterWithoutExcel };
}

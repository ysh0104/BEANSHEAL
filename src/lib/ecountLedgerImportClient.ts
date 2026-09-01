import { parseEcountLedgerExcelBulk, type EcountLedgerParseResult } from "@/lib/ecountLedgerExcelParser";

/** 브라우저에서 재고수불부 xlsx 파싱 (서버 업로드 전) */
export async function parseLedgerFilesOnClient(files: File[]): Promise<{
  items: EcountLedgerParseResult[];
  errors: string[];
}> {
  const items: EcountLedgerParseResult[] = [];
  const errors: string[] = [];

  for (const file of files) {
    const name = file.name || "unknown.xlsx";
    if (!/\.xlsx?$/i.test(name)) {
      errors.push(`${name}: xlsx 파일만 지원합니다.`);
      continue;
    }
    try {
      const buffer = await file.arrayBuffer();
      const parsed = parseEcountLedgerExcelBulk(buffer);
      items.push(...parsed.items);
    } catch (e) {
      errors.push(`${name}: ${e instanceof Error ? e.message : "파싱 실패"}`);
    }
  }

  return { items, errors };
}

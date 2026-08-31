"use server";

import type { EcountStockExcelRow } from "@/lib/ecountStockExcelParser";
import { uploadEcountStockRows } from "@/lib/ecountStockExcelUpload";

export type ExcelMasterRow = EcountStockExcelRow;

/** @deprecated ExcelMasterRow 사용 — 브라우저 업로드·서버 액션 */
export async function uploadEcountExcelMaster(
  rows: ExcelMasterRow[]
): Promise<{ success: boolean; count?: number; synced_at?: string; error?: string }> {
  return uploadEcountStockRows(rows);
}

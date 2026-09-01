import { parseEcountLedgerExcelBulk, type EcountLedgerParseResult } from "@/lib/ecountLedgerExcelParser";
import { uploadEcountLedgerImportedFiles } from "@/lib/ecountLedgerUpload";
import { getLedgerBotDateRange } from "@/lib/ecountLedgerDateRange";
import { LEDGER_BULK_META_CD } from "@/lib/ledgerSyncStatus";
import { createClient } from "@supabase/supabase-js";

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !key) return null;
  return createClient(url, key);
}

export type LedgerUploadResult = {
  success: boolean;
  message?: string;
  file_count?: number;
  item_count?: number;
  row_count?: number;
  synced_at?: string;
  errors?: string[];
};

function inferImportPeriod(items: EcountLedgerParseResult[]) {
  const dates: string[] = [];
  for (const item of items) {
    for (const r of item.rows) {
      const d = r.txn_date.trim();
      if (/^\d{4}[\/.\-]\d{1,2}/.test(d)) {
        dates.push(d.replace(/\./g, "/").replace(/-/g, "/"));
      }
    }
  }
  if (dates.length === 0) {
    const bot = getLedgerBotDateRange();
    return { from: bot.from, to: bot.to };
  }
  dates.sort();
  return { from: dates[0], to: dates[dates.length - 1] };
}

export async function importParsedLedgerItems(allItems: EcountLedgerParseResult[]): Promise<LedgerUploadResult> {
  if (allItems.length === 0) {
    return { success: false, message: "파싱된 수불부 데이터가 없습니다." };
  }

  const upload = await uploadEcountLedgerImportedFiles(allItems);
  if (!upload.success) {
    return {
      success: false,
      message: upload.error || "DB 업로드 실패",
      errors: upload.errors,
    };
  }

  const supabase = getServiceSupabase();
  if (supabase && upload.synced_at) {
    const range = inferImportPeriod(allItems);
    const { data: existing } = await supabase
      .from("ecount_ledger_sync_meta")
      .select("first_synced_at")
      .eq("prod_cd", LEDGER_BULK_META_CD)
      .maybeSingle();

    await supabase.from("ecount_ledger_sync_meta").upsert(
      {
        prod_cd: LEDGER_BULK_META_CD,
        prod_nm: "엑셀 업로드",
        first_synced_at: existing?.first_synced_at || upload.synced_at,
        last_synced_at: upload.synced_at,
        period_from: range.from,
        period_to: range.to,
      },
      { onConflict: "prod_cd" }
    );
  }

  return {
    success: true,
    item_count: upload.item_count,
    row_count: upload.row_count,
    synced_at: upload.synced_at,
    message: `${upload.item_count}품목 · ${upload.row_count?.toLocaleString("ko-KR")}행 반영`,
    errors: upload.errors,
  };
}

export async function importLedgerExcelFiles(formData: FormData): Promise<LedgerUploadResult> {
  const entries = formData.getAll("files");
  const files = entries.filter((f): f is File => f instanceof File && f.size > 0);

  if (files.length === 0) {
    return { success: false, message: "업로드할 엑셀 파일을 선택하세요." };
  }

  const allItems: EcountLedgerParseResult[] = [];
  const parseErrors: string[] = [];

  for (const file of files) {
    const name = file.name || "unknown.xlsx";
    if (!/\.xlsx?$/i.test(name)) {
      parseErrors.push(`${name}: xlsx 파일만 지원합니다.`);
      continue;
    }
    try {
      const buffer = await file.arrayBuffer();
      const parsed = parseEcountLedgerExcelBulk(buffer);
      allItems.push(...parsed.items);
    } catch (e) {
      parseErrors.push(`${name}: ${e instanceof Error ? e.message : "파싱 실패"}`);
    }
  }

  if (allItems.length === 0) {
    return {
      success: false,
      message: parseErrors.join("\n") || "파싱된 수불부 데이터가 없습니다.",
      errors: parseErrors,
    };
  }

  const result = await importParsedLedgerItems(allItems);
  if (!result.success) {
    return { ...result, errors: [...parseErrors, ...(result.errors || [])] };
  }

  return {
    ...result,
    file_count: files.length,
    message: `${files.length}개 파일 · ${result.message}`,
    errors: [...parseErrors, ...(result.errors || [])].filter(Boolean).length
      ? [...parseErrors, ...(result.errors || [])]
      : undefined,
  };
}

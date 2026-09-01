"use server";

import { createClient } from "@supabase/supabase-js";
import { getLedgerBotDateRange, getLedgerDateRange } from "@/lib/ecountLedgerDateRange";
import { parseEcountLedgerExcelBulk } from "@/lib/ecountLedgerExcelParser";
import { uploadEcountLedgerImportedFiles } from "@/lib/ecountLedgerUpload";
import { LEDGER_BULK_META_CD } from "@/lib/ledgerSyncStatus";

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  if (!url || !key) return null;
  return createClient(url, key);
}

export type LedgerRow = {
  id: string;
  txn_date: string;
  partner_name: string;
  remarks: string;
  in_qty: number;
  out_qty: number;
  balance_qty: number | null;
  lot_no: string | null;
  row_kind: string;
};

export async function getLedgerSyncMeta(prodCd: string) {
  const supabase = getServiceSupabase();
  if (!supabase) return { success: false as const, error: "DB 연결 실패" };

  const { data, error } = await supabase
    .from("ecount_ledger_sync_meta")
    .select("*")
    .eq("prod_cd", prodCd)
    .maybeSingle();

  if (error) return { success: false as const, error: error.message };
  return { success: true as const, data };
}

export async function getStockLedgerRows(prodCd: string, prodNm?: string) {
  const supabase = getServiceSupabase();
  if (!supabase) return { success: false as const, error: "DB 연결 실패" };

  let { data, error } = await supabase
    .from("ecount_stock_ledger")
    .select("id, txn_date, partner_name, remarks, in_qty, out_qty, balance_qty, lot_no, row_kind")
    .eq("prod_cd", prodCd)
    .order("id", { ascending: true });

  if (error) return { success: false as const, error: error.message };

  let rows = (data || []) as LedgerRow[];

  if (rows.length === 0 && prodNm?.trim()) {
    const nm = prodNm.trim();
    const byNm = await supabase
      .from("ecount_stock_ledger")
      .select("id, txn_date, partner_name, remarks, in_qty, out_qty, balance_qty, lot_no, row_kind")
      .ilike("prod_nm", nm)
      .order("id", { ascending: true });

    if (!byNm.error && byNm.data?.length) {
      rows = byNm.data as LedgerRow[];
    } else {
      const nmNorm = nm.replace(/\s+/g, "");
      const fuzzy = await supabase
        .from("ecount_stock_ledger")
        .select("id, txn_date, partner_name, remarks, in_qty, out_qty, balance_qty, lot_no, row_kind, prod_nm")
        .order("id", { ascending: true });

      if (!fuzzy.error && fuzzy.data) {
        rows = (fuzzy.data as (LedgerRow & { prod_nm?: string })[]).filter((r) => {
          const stored = (r.prod_nm || "").replace(/\s+/g, "");
          return stored === nmNorm || stored.includes(nmNorm) || nmNorm.includes(stored);
        });
      }
    }
  }

  const metaRes = await getLedgerSyncMeta(prodCd);

  return {
    success: true as const,
    rows,
    meta: metaRes.success ? metaRes.data : null,
  };
}

export async function getPlannedLedgerPeriod(prodCd: string) {
  const meta = await getLedgerSyncMeta(prodCd);
  const hasPrior = meta.success && !!meta.data?.first_synced_at;
  if (hasPrior) return getLedgerBotDateRange();
  return getLedgerDateRange(hasPrior);
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

/** 재고수불부 엑셀 파일 직접 업로드 (복수 파일 가능) */
export async function uploadLedgerExcelFiles(formData: FormData): Promise<LedgerUploadResult> {
  const entries = formData.getAll("files");
  const files = entries.filter((f): f is File => f instanceof File && f.size > 0);

  if (files.length === 0) {
    return { success: false, message: "업로드할 엑셀 파일을 선택하세요." };
  }

  const allItems: import("@/lib/ecountLedgerExcelParser").EcountLedgerParseResult[] = [];
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

  const upload = await uploadEcountLedgerImportedFiles(allItems);
  if (!upload.success) {
    return {
      success: false,
      message: upload.error || "DB 업로드 실패",
      errors: [...parseErrors, ...(upload.errors || [])],
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

  const warnings = [...parseErrors, ...(upload.errors || [])];
  return {
    success: true,
    file_count: files.length,
    item_count: upload.item_count,
    row_count: upload.row_count,
    synced_at: upload.synced_at,
    message: `${files.length}개 파일 · ${upload.item_count}품목 · ${upload.row_count?.toLocaleString("ko-KR")}행 반영`,
    errors: warnings.length > 0 ? warnings : undefined,
  };
}

function inferImportPeriod(items: import("@/lib/ecountLedgerExcelParser").EcountLedgerParseResult[]) {
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

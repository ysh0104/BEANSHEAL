"use server";

import { createClient } from "@supabase/supabase-js";
import { getLedgerBotDateRange, getLedgerDateRange } from "@/lib/ecountLedgerDateRange";
import { applyLedgerFifoLots } from "@/lib/ecountLedgerFifo";
import {
  importLedgerExcelFiles,
  type LedgerUploadResult,
} from "@/lib/ecountLedgerImport";

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
  /** FIFO 선입선출 계산 로트 (출고 포함, 복수 시 줄바꿈) */
  fifo_lot_no?: string | null;
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

  const withFifo = applyLedgerFifoLots(
    rows.map((r) => ({
      ...r,
      in_qty: Number(r.in_qty) || 0,
      out_qty: Number(r.out_qty) || 0,
    }))
  );

  return {
    success: true as const,
    rows: withFifo.map((r) => ({
      ...r,
      lot_no: r.lot_no,
      fifo_lot_no: r.fifo_lot_no || null,
    })),
    meta: metaRes.success ? metaRes.data : null,
  };
}

export async function getPlannedLedgerPeriod(prodCd: string) {
  const meta = await getLedgerSyncMeta(prodCd);
  const hasPrior = meta.success && !!meta.data?.first_synced_at;
  if (hasPrior) return getLedgerBotDateRange();
  return getLedgerDateRange(hasPrior);
}

export type { LedgerUploadResult };

/** @deprecated API route 사용 권장 */
export async function uploadLedgerExcelFiles(formData: FormData): Promise<LedgerUploadResult> {
  return importLedgerExcelFiles(formData);
}

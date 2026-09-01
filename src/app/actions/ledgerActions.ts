"use server";

import { createClient } from "@supabase/supabase-js";
import { getLedgerDateRange } from "@/lib/ecountLedgerDateRange";

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

export async function getStockLedgerRows(prodCd: string) {
  const supabase = getServiceSupabase();
  if (!supabase) return { success: false as const, error: "DB 연결 실패" };

  const { data, error } = await supabase
    .from("ecount_stock_ledger")
    .select("id, txn_date, partner_name, remarks, in_qty, out_qty, balance_qty, lot_no, row_kind")
    .eq("prod_cd", prodCd)
    .order("id", { ascending: true });

  if (error) return { success: false as const, error: error.message };

  const rows = (data || []) as LedgerRow[];
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
  return getLedgerDateRange(hasPrior);
}

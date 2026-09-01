import { createClient } from "@supabase/supabase-js";

export const LEDGER_BULK_META_CD = "__BULK__";

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  if (!url || !key) return null;
  return createClient(url, key);
}

export type LedgerBulkDbStatus = {
  last_synced_at: string | null;
  synced_item_count: number;
  period_from: string | null;
  period_to: string | null;
};

export async function fetchLedgerBulkDbStatus(): Promise<LedgerBulkDbStatus> {
  const supabase = getServiceSupabase();
  if (!supabase) {
    return { last_synced_at: null, synced_item_count: 0, period_from: null, period_to: null };
  }

  const { data: bulkMeta } = await supabase
    .from("ecount_ledger_sync_meta")
    .select("last_synced_at, period_from, period_to")
    .eq("prod_cd", LEDGER_BULK_META_CD)
    .maybeSingle();

  const { count } = await supabase
    .from("ecount_ledger_sync_meta")
    .select("*", { count: "exact", head: true })
    .neq("prod_cd", LEDGER_BULK_META_CD);

  return {
    last_synced_at: (bulkMeta?.last_synced_at as string | null) ?? null,
    synced_item_count: count ?? 0,
    period_from: (bulkMeta?.period_from as string | null) ?? null,
    period_to: (bulkMeta?.period_to as string | null) ?? null,
  };
}

export async function upsertLedgerBulkMeta(period_from: string, period_to: string) {
  const supabase = getServiceSupabase();
  if (!supabase) return;
  const now = new Date().toISOString();
  const { data: existing } = await supabase
    .from("ecount_ledger_sync_meta")
    .select("first_synced_at")
    .eq("prod_cd", LEDGER_BULK_META_CD)
    .maybeSingle();

  await supabase.from("ecount_ledger_sync_meta").upsert(
    {
      prod_cd: LEDGER_BULK_META_CD,
      prod_nm: "일괄 동기화",
      first_synced_at: existing?.first_synced_at || now,
      last_synced_at: now,
      period_from,
      period_to,
    },
    { onConflict: "prod_cd" }
  );
}

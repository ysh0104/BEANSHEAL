import { createClient } from "@supabase/supabase-js";
import type { EcountLedgerExcelRow, EcountLedgerParseResult } from "@/lib/ecountLedgerExcelParser";

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !key) return null;
  return createClient(url, key);
}

const INSERT_BATCH = 400;

export async function uploadEcountLedgerRows(params: {
  prod_cd: string;
  prod_nm?: string;
  period_from: string;
  period_to: string;
  rows: EcountLedgerExcelRow[];
}): Promise<{ success: boolean; count?: number; synced_at?: string; error?: string }> {
  const supabase = getServiceSupabase();
  if (!supabase) return { success: false, error: "Supabase service role 미설정" };

  const synced_at = new Date().toISOString();

  const { error: delErr } = await supabase
    .from("ecount_stock_ledger")
    .delete()
    .eq("prod_cd", params.prod_cd);

  if (delErr) return { success: false, error: delErr.message };

  if (params.rows.length === 0) {
    await upsertMeta(supabase, params, synced_at);
    return { success: true, count: 0, synced_at };
  }

  const payload = params.rows.map((r) => ({
    prod_cd: params.prod_cd,
    prod_nm: params.prod_nm || null,
    txn_date: r.txn_date,
    partner_name: r.partner_name,
    remarks: r.remarks,
    in_qty: r.in_qty,
    out_qty: r.out_qty,
    balance_qty: r.balance_qty,
    lot_no: r.lot_no || null,
    row_kind: r.row_kind,
    period_from: params.period_from,
    period_to: params.period_to,
    synced_at,
  }));

  for (let i = 0; i < payload.length; i += INSERT_BATCH) {
    const batch = payload.slice(i, i + INSERT_BATCH);
    const { error: insErr } = await supabase.from("ecount_stock_ledger").insert(batch);
    if (insErr) return { success: false, error: insErr.message };
  }

  await upsertMeta(supabase, params, synced_at);
  await syncLotsFromLedger(supabase, params.prod_cd, params.prod_nm, params.rows);

  return { success: true, count: payload.length, synced_at };
}

/** 전체 품목 재고수불부 일괄 업로드 (기존 데이터 전체 교체) */
export async function uploadEcountLedgerBulk(params: {
  period_from: string;
  period_to: string;
  items: EcountLedgerParseResult[];
}): Promise<{
  success: boolean;
  item_count?: number;
  row_count?: number;
  synced_at?: string;
  error?: string;
}> {
  const supabase = getServiceSupabase();
  if (!supabase) return { success: false, error: "Supabase service role 미설정" };

  const synced_at = new Date().toISOString();
  const validItems = params.items.filter((it) => it.rows.length > 0 && !it.prod_cd.startsWith("__UNKNOWN_"));

  const { error: delErr } = await supabase.from("ecount_stock_ledger").delete().neq("prod_cd", "");
  if (delErr) return { success: false, error: delErr.message };

  let row_count = 0;
  const allPayload: Record<string, unknown>[] = [];

  for (const item of validItems) {
    for (const r of item.rows) {
      allPayload.push({
        prod_cd: item.prod_cd,
        prod_nm: item.prod_nm || null,
        txn_date: r.txn_date,
        partner_name: r.partner_name,
        remarks: r.remarks,
        in_qty: r.in_qty,
        out_qty: r.out_qty,
        balance_qty: r.balance_qty,
        lot_no: r.lot_no || null,
        row_kind: r.row_kind,
        period_from: params.period_from,
        period_to: params.period_to,
        synced_at,
      });
    }
  }

  for (let i = 0; i < allPayload.length; i += INSERT_BATCH) {
    const batch = allPayload.slice(i, i + INSERT_BATCH);
    const { error: insErr } = await supabase.from("ecount_stock_ledger").insert(batch);
    if (insErr) return { success: false, error: insErr.message };
  }
  row_count = allPayload.length;

  for (const item of validItems) {
    await upsertMeta(
      supabase,
      {
        prod_cd: item.prod_cd,
        prod_nm: item.prod_nm,
        period_from: params.period_from,
        period_to: params.period_to,
      },
      synced_at
    );
    await syncLotsFromLedger(supabase, item.prod_cd, item.prod_nm, item.rows);
  }

  return { success: true, item_count: validItems.length, row_count, synced_at };
}

async function upsertMeta(
  supabase: ReturnType<typeof createClient>,
  params: { prod_cd: string; prod_nm?: string; period_from: string; period_to: string },
  synced_at: string
) {
  const { data: existing } = await supabase
    .from("ecount_ledger_sync_meta")
    .select("first_synced_at")
    .eq("prod_cd", params.prod_cd)
    .maybeSingle();

  await supabase.from("ecount_ledger_sync_meta").upsert(
    {
      prod_cd: params.prod_cd,
      prod_nm: params.prod_nm || null,
      first_synced_at: existing?.first_synced_at || synced_at,
      last_synced_at: synced_at,
      period_from: params.period_from,
      period_to: params.period_to,
    },
    { onConflict: "prod_cd" }
  );
}

/** 수불부 txn 행에서 품목별 로트 스냅샷을 ecount_inventory에 반영 (목록 시리얼/로트 컬럼용) */
async function syncLotsFromLedger(
  supabase: ReturnType<typeof createClient>,
  prod_cd: string,
  prod_nm: string | undefined,
  rows: EcountLedgerExcelRow[]
) {
  if (!prod_nm) return;

  const lotLastBalance = new Map<string, number>();
  for (const r of rows) {
    if (r.row_kind !== "txn" || !r.lot_no) continue;
    const lot = r.lot_no.trim();
    if (!lot) continue;
    if (r.balance_qty !== null && Number.isFinite(r.balance_qty)) {
      lotLastBalance.set(lot, r.balance_qty);
    }
  }

  for (const [lot_no, quantity] of lotLastBalance.entries()) {
    if (quantity <= 0) continue;
    const { data: existing } = await supabase
      .from("ecount_inventory")
      .select("id")
      .eq("item_name", prod_nm)
      .eq("lot_no", lot_no)
      .maybeSingle();

    if (existing?.id) {
      await supabase.from("ecount_inventory").update({ quantity }).eq("id", existing.id);
    } else {
      await supabase.from("ecount_inventory").insert({
        item_name: prod_nm,
        lot_no,
        quantity,
        expiry_date: "-",
        status: "문서대기",
      });
    }
  }
}

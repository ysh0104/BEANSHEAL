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

/** 봇 동기화 — 해당 조회기간(period) 데이터만 교체 (엑셀 업로드 이력은 유지) */
export async function uploadEcountLedgerBotBatch(params: {
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

  let row_count = 0;

  for (const item of validItems) {
    const { error: delErr } = await supabase
      .from("ecount_stock_ledger")
      .delete()
      .eq("prod_cd", item.prod_cd)
      .eq("period_from", params.period_from)
      .eq("period_to", params.period_to);

    if (delErr) return { success: false, error: delErr.message };

    const payload = item.rows.map((r) => ({
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
    }));

    for (let i = 0; i < payload.length; i += INSERT_BATCH) {
      const batch = payload.slice(i, i + INSERT_BATCH);
      const { error: insErr } = await supabase.from("ecount_stock_ledger").insert(batch);
      if (insErr) return { success: false, error: insErr.message };
    }

    row_count += payload.length;

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

/** @deprecated use uploadEcountLedgerBotBatch */
export async function uploadEcountLedgerBulk(params: {
  period_from: string;
  period_to: string;
  items: EcountLedgerParseResult[];
}) {
  return uploadEcountLedgerBotBatch(params);
}

function inferPeriodFromRows(rows: EcountLedgerExcelRow[]): { from: string; to: string } {
  const dates = rows
    .map((r) => r.txn_date.trim())
    .filter((d) => /^\d{4}[\/.\-]\d{1,2}[\/.\-]\d{1,2}/.test(d))
    .map((d) => d.replace(/\./g, "/").replace(/-/g, "/"));

  if (dates.length === 0) {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, "/");
    return { from: today, to: today };
  }

  dates.sort();
  return { from: dates[0], to: dates[dates.length - 1] };
}

/** 엑셀 파일 직접 업로드 — 품목별 전체 교체 (여러 파일은 품목코드 기준 병합) */
export async function uploadEcountLedgerImportedFiles(
  parsedItems: EcountLedgerParseResult[]
): Promise<{
  success: boolean;
  item_count?: number;
  row_count?: number;
  synced_at?: string;
  errors?: string[];
  error?: string;
}> {
  const merged = new Map<string, { prod_nm: string; rows: EcountLedgerExcelRow[] }>();

  for (const item of parsedItems) {
    if (!item.prod_cd || item.prod_cd.startsWith("__UNKNOWN_") || item.rows.length === 0) continue;
    const cur = merged.get(item.prod_cd);
    if (cur) {
      cur.rows.push(...item.rows);
      if (item.prod_nm) cur.prod_nm = item.prod_nm;
    } else {
      merged.set(item.prod_cd, { prod_nm: item.prod_nm, rows: [...item.rows] });
    }
  }

  if (merged.size === 0) {
    return { success: false, error: "업로드할 수불부 데이터가 없습니다." };
  }

  let row_count = 0;
  const errors: string[] = [];
  let synced_at = new Date().toISOString();

  for (const [prod_cd, { prod_nm, rows }] of merged) {
    const { from, to } = inferPeriodFromRows(rows);
    const res = await uploadEcountLedgerRows({
      prod_cd,
      prod_nm,
      period_from: from,
      period_to: to,
      rows,
    });
    if (!res.success) {
      errors.push(`${prod_cd}: ${res.error}`);
      continue;
    }
    row_count += res.count || 0;
    if (res.synced_at) synced_at = res.synced_at;
  }

  if (row_count === 0 && errors.length > 0) {
    return { success: false, error: errors.join("\n"), errors };
  }

  return {
    success: true,
    item_count: merged.size - errors.length,
    row_count,
    synced_at,
    errors: errors.length > 0 ? errors : undefined,
  };
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

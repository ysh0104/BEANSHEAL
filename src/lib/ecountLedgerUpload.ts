import { createClient } from "@supabase/supabase-js";
import type { EcountLedgerExcelRow, EcountLedgerParseResult } from "@/lib/ecountLedgerExcelParser";
import { getFifoLotBalances } from "@/lib/ecountLedgerFifo";

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !key) return null;
  return createClient(url, key);
}

const INSERT_BATCH = 400;

function normalizeItemName(name: string): string {
  return name
    .replace(/\s+/g, "")
    .replace(/\[.*?\]/g, "")
    .toLowerCase();
}

type InventoryItem = { prod_cd: string; prod_nm: string | null };

function resolveLedgerProdCdFromInventory(
  extractedCd: string,
  extractedNm: string,
  inventory: InventoryItem[]
): { prod_cd: string; prod_nm: string } {
  const cd = extractedCd.trim();
  const nm = extractedNm.trim();

  if (!cd && !nm) return { prod_cd: cd, prod_nm: nm };
  if (inventory.length === 0) return { prod_cd: cd, prod_nm: nm };

  if (cd && inventory.some((i) => i.prod_cd === cd)) {
    const hit = inventory.find((i) => i.prod_cd === cd)!;
    return { prod_cd: hit.prod_cd, prod_nm: hit.prod_nm || nm };
  }

  if (nm) {
    const nmNorm = normalizeItemName(nm);
    const exactNm = inventory.find((i) => normalizeItemName(i.prod_nm || "") === nmNorm);
    if (exactNm) return { prod_cd: exactNm.prod_cd, prod_nm: exactNm.prod_nm || nm };

    const partialNm = inventory.find((i) => {
      const inv = normalizeItemName(i.prod_nm || "");
      return inv && nmNorm && (inv.includes(nmNorm) || nmNorm.includes(inv));
    });
    if (partialNm) return { prod_cd: partialNm.prod_cd, prod_nm: partialNm.prod_nm || nm };
  }

  if (cd.includes("-")) {
    const base = cd.split("-")[0];
    const baseHit = inventory.find((i) => i.prod_cd === base);
    if (baseHit) return { prod_cd: baseHit.prod_cd, prod_nm: baseHit.prod_nm || nm };
  }

  if (/^0+\d+$/.test(cd)) {
    const noLead = cd.replace(/^0+/, "");
    const mHit = inventory.find((i) => i.prod_cd === `M${noLead}` || i.prod_cd === noLead);
    if (mHit) return { prod_cd: mHit.prod_cd, prod_nm: mHit.prod_nm || nm };
  }

  return { prod_cd: cd, prod_nm: nm };
}

/** 엑셀 품목코드/명 → 재고현황(ecount_items) 품목코드에 맞춤 */
export async function resolveLedgerProdCd(
  extractedCd: string,
  extractedNm: string
): Promise<{ prod_cd: string; prod_nm: string }> {
  const supabase = getServiceSupabase();
  if (!supabase) return { prod_cd: extractedCd.trim(), prod_nm: extractedNm.trim() };

  const { data: items } = await supabase.from("ecount_items").select("prod_cd, prod_nm");
  return resolveLedgerProdCdFromInventory(extractedCd, extractedNm, items || []);
}

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

/** 엑셀 파일 직접 업로드 — 품목별 전체 교체 (배치 DB) */
export async function uploadEcountLedgerImportedFiles(
  parsedItems: EcountLedgerParseResult[]
): Promise<{
  success: boolean;
  item_count?: number;
  row_count?: number;
  synced_at?: string;
  errors?: string[];
  skipped?: number;
  error?: string;
}> {
  const merged = new Map<string, { prod_nm: string; rows: EcountLedgerExcelRow[] }>();
  let skipped = 0;

  const supabase = getServiceSupabase();
  if (!supabase) return { success: false, error: "Supabase service role 미설정" };

  const { data: inventoryRows } = await supabase.from("ecount_items").select("prod_cd, prod_nm");
  const inventory = inventoryRows || [];

  for (const item of parsedItems) {
    if (item.rows.length === 0) {
      skipped += 1;
      continue;
    }

    let prod_cd = item.prod_cd?.trim() || "";
    let prod_nm = item.prod_nm?.trim() || "";

    if (!prod_cd || prod_cd.startsWith("__UNKNOWN_")) {
      skipped += 1;
      continue;
    }

    const resolved = resolveLedgerProdCdFromInventory(prod_cd, prod_nm, inventory);
    prod_cd = resolved.prod_cd;
    prod_nm = resolved.prod_nm || prod_nm;

    const cur = merged.get(prod_cd);
    if (cur) {
      cur.rows.push(...item.rows);
      if (prod_nm) cur.prod_nm = prod_nm;
    } else {
      merged.set(prod_cd, { prod_nm, rows: [...item.rows] });
    }
  }

  if (merged.size === 0) {
    return { success: false, error: "업로드할 수불부 데이터가 없습니다." };
  }

  const synced_at = new Date().toISOString();
  const prodCds = [...merged.keys()];

  // 품목별 기존 수불부 삭제 (배치)
  for (let i = 0; i < prodCds.length; i += 50) {
    const batch = prodCds.slice(i, i + 50);
    const { error: delErr } = await supabase.from("ecount_stock_ledger").delete().in("prod_cd", batch);
    if (delErr) return { success: false, error: delErr.message };
  }

  const allPayload: Record<string, unknown>[] = [];
  const metaItems: { prod_cd: string; prod_nm: string; period_from: string; period_to: string }[] = [];

  for (const [prod_cd, { prod_nm, rows }] of merged) {
    const { from, to } = inferPeriodFromRows(rows);
    metaItems.push({ prod_cd, prod_nm, period_from: from, period_to: to });

    for (const r of rows) {
      allPayload.push({
        prod_cd,
        prod_nm: prod_nm || null,
        txn_date: r.txn_date,
        partner_name: r.partner_name,
        remarks: r.remarks,
        in_qty: r.in_qty,
        out_qty: r.out_qty,
        balance_qty: r.balance_qty,
        lot_no: r.lot_no || null,
        row_kind: r.row_kind,
        period_from: from,
        period_to: to,
        synced_at,
      });
    }
  }

  for (let i = 0; i < allPayload.length; i += INSERT_BATCH) {
    const batch = allPayload.slice(i, i + INSERT_BATCH);
    const { error: insErr } = await supabase.from("ecount_stock_ledger").insert(batch);
    if (insErr) return { success: false, error: insErr.message };
  }

  // 메타 upsert (배치)
  for (const meta of metaItems) {
    const { data: existing } = await supabase
      .from("ecount_ledger_sync_meta")
      .select("first_synced_at")
      .eq("prod_cd", meta.prod_cd)
      .maybeSingle();

    await supabase.from("ecount_ledger_sync_meta").upsert(
      {
        prod_cd: meta.prod_cd,
        prod_nm: meta.prod_nm || null,
        first_synced_at: existing?.first_synced_at || synced_at,
        last_synced_at: synced_at,
        period_from: meta.period_from,
        period_to: meta.period_to,
      },
      { onConflict: "prod_cd" }
    );
  }

  // FIFO 로트 → ecount_inventory (품목별, 삭제/insert는 이미 완료)
  const lotErrors: string[] = [];
  for (const [prod_cd, { prod_nm, rows }] of merged) {
    try {
      await syncLotsFromLedger(supabase, prod_cd, prod_nm, rows);
    } catch (e) {
      lotErrors.push(`${prod_cd}: ${e instanceof Error ? e.message : "로트 동기화 실패"}`);
    }
  }

  return {
    success: true,
    item_count: merged.size,
    row_count: allPayload.length,
    synced_at,
    skipped: skipped > 0 ? skipped : undefined,
    errors: lotErrors.length > 0 ? lotErrors : undefined,
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

/** 수불부 txn 행 FIFO 기준 로트 잔량 → ecount_inventory 반영 */
async function syncLotsFromLedger(
  supabase: ReturnType<typeof createClient>,
  prod_cd: string,
  prod_nm: string | undefined,
  rows: EcountLedgerExcelRow[]
) {
  if (!prod_nm) return;

  const lotBalances = getFifoLotBalances(rows);

  for (const [lot_no, quantity] of lotBalances.entries()) {
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

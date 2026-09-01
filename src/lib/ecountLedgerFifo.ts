/** 재고수불부 FIFO(선입선출) — 출고 행에 소모 로트 배분 */

export type FifoLedgerInput = {
  id?: string;
  txn_date: string;
  partner_name?: string;
  remarks?: string;
  in_qty: number;
  out_qty: number;
  balance_qty?: number | null;
  lot_no?: string | null;
  row_kind: string;
};

export type FifoLedgerOutput = FifoLedgerInput & {
  fifo_lot_no: string;
};

type LotBucket = {
  lotKey: string;
  qty: number;
  seq: number;
};

const QTY_EPS = 0.0001;
export const NO_LOT_LABEL = "—";

function roundQty(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function parseTxnSortKey(dateStr: string): number {
  const d = (dateStr || "").trim();
  if (!d) return 0;

  const iso = d.match(/^(\d{4})[\/.\-](\d{1,2})[\/.\-](\d{1,2})/);
  if (iso) {
    return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])).getTime();
  }

  const kor = d.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
  if (kor) {
    const year = new Date().getFullYear();
    return new Date(year, Number(kor[1]) - 1, Number(kor[2])).getTime();
  }

  if (/전일재고|조정/.test(d)) return -1;
  return 0;
}

const SORT_OPENING = -9e15;
const SORT_TOTAL = 9e15;

function displaySortKey(row: FifoLedgerInput): number {
  const remarks = `${row.remarks || ""}${row.txn_date || ""}`;

  if (row.row_kind === "opening" || /전일재고/.test(remarks)) {
    return SORT_OPENING;
  }

  if (row.row_kind === "total" || /^합계$/.test(row.txn_date.trim())) {
    return SORT_TOTAL;
  }

  const monthSub = row.txn_date.trim().match(/^(\d{4})[\/.\-](\d{1,2})\s*계$/);
  if (row.row_kind === "subtotal" || monthSub) {
    const y = Number(monthSub?.[1] || 0);
    const m = Number(monthSub?.[2] || 0);
    if (y && m) {
      // 해당 월 말일 직후 (월별 거래 다음)
      return new Date(y, m, 0).getTime() + 86_400_000;
    }
  }

  const t = parseTxnSortKey(row.txn_date);
  if (t > 0) return t;
  if (t === -1) return SORT_OPENING + 1;
  return 0;
}

/** 화면 표시용 — 전일재고 → 일자순(입고→출고) → 월계 → 합계 */
export function sortLedgerRowsForDisplay<T extends FifoLedgerInput>(rows: T[]): T[] {
  return [...rows]
    .map((r, i) => ({ r, i }))
    .sort((a, b) => {
      const ka = displaySortKey(a.r);
      const kb = displaySortKey(b.r);
      if (ka !== kb) return ka - kb;

      const inA = a.r.in_qty > QTY_EPS ? 0 : a.r.out_qty > QTY_EPS ? 1 : 2;
      const inB = b.r.in_qty > QTY_EPS ? 0 : b.r.out_qty > QTY_EPS ? 1 : 2;
      if (inA !== inB) return inA - inB;

      return a.i - b.i;
    })
    .map(({ r }) => r);
}

function txnSortOrder(row: FifoLedgerInput, index: number): number {
  if (row.row_kind === "opening") return -2;
  if (row.row_kind === "subtotal" || row.row_kind === "total") return 999999 + index;
  const t = parseTxnSortKey(row.txn_date);
  const inFirst = row.in_qty > QTY_EPS ? 0 : row.out_qty > QTY_EPS ? 1 : row.out_qty < -QTY_EPS ? 0 : 2;
  return t * 10 + inFirst;
}

function formatLotLabels(labels: string[]): string {
  const unique: string[] = [];
  for (const l of labels) {
    if (!unique.includes(l)) unique.push(l);
  }
  return unique.join("\n");
}

function lotLabel(lotRaw: string | null | undefined): string {
  const lot = (lotRaw || "").trim();
  return lot || NO_LOT_LABEL;
}

function lotKey(lotRaw: string | null | undefined): string {
  const lot = (lotRaw || "").trim();
  return lot || "__NO_LOT__";
}

function consumeFifo(pool: LotBucket[], amount: number): string[] {
  let remaining = amount;
  const usedLabels: string[] = [];

  while (remaining > QTY_EPS && pool.length > 0) {
    const bucket = pool[0];
    const take = Math.min(bucket.qty, remaining);
    if (take <= QTY_EPS) {
      pool.shift();
      continue;
    }

    usedLabels.push(bucket.lotKey === "__NO_LOT__" ? NO_LOT_LABEL : bucket.lotKey);
    bucket.qty = roundQty(bucket.qty - take);
    remaining = roundQty(remaining - take);

    if (bucket.qty <= QTY_EPS) pool.shift();
  }

  return usedLabels;
}

function addToPool(pool: LotBucket[], lotRaw: string | null | undefined, qty: number, seqRef: { n: number }) {
  if (qty <= QTY_EPS) return;
  const key = lotKey(lotRaw);
  const existing = pool.find((b) => b.lotKey === key);
  if (existing) {
    existing.qty = roundQty(existing.qty + qty);
  } else {
    pool.push({ lotKey: key, qty: roundQty(qty), seq: seqRef.n++ });
  }
}

type SimulateResult = {
  fifoByIndex: Map<number, string>;
  lotBalances: Map<string, number>;
};

function simulateFifo(rows: FifoLedgerInput[]): SimulateResult {
  const txnRows = rows
    .map((r, i) => ({ r, i, order: txnSortOrder(r, i) }))
    .filter(({ r }) => r.row_kind !== "subtotal" && r.row_kind !== "total");

  txnRows.sort((a, b) => a.order - b.order || a.i - b.i);

  const pool: LotBucket[] = [];
  const seqRef = { n: 0 };
  const fifoByIndex = new Map<number, string>();

  for (const { r, i } of txnRows) {
    let inQty = Number(r.in_qty) || 0;
    let outQty = Number(r.out_qty) || 0;
    const remarks = `${r.remarks || ""}${r.txn_date || ""}${r.partner_name || ""}`;
    const existingLot = (r.lot_no || "").trim();

    if (outQty < -QTY_EPS) {
      inQty = roundQty(inQty + Math.abs(outQty));
      outQty = 0;
    }
    if (inQty < -QTY_EPS) {
      outQty = roundQty(outQty + Math.abs(inQty));
      inQty = 0;
    }

    if (r.row_kind === "opening" || /전일재고/.test(remarks)) {
      const qty =
        inQty > QTY_EPS ? inQty : outQty > QTY_EPS ? 0 : Math.abs(Number(r.balance_qty) || 0);
      if (qty > QTY_EPS) {
        addToPool(pool, existingLot || null, qty, seqRef);
        fifoByIndex.set(i, lotLabel(existingLot || null));
      }
      continue;
    }

    if (inQty > QTY_EPS) {
      addToPool(pool, existingLot || null, inQty, seqRef);
      fifoByIndex.set(i, lotLabel(existingLot || null));
      continue;
    }

    if (outQty > QTY_EPS) {
      if (existingLot) {
        fifoByIndex.set(i, existingLot);
        consumeFifo(pool, outQty);
      } else {
        const used = consumeFifo(pool, outQty);
        fifoByIndex.set(i, used.length > 0 ? formatLotLabels(used) : NO_LOT_LABEL);
      }
      continue;
    }

    if (/조정/.test(remarks) && Number(r.balance_qty) > QTY_EPS && inQty <= QTY_EPS && outQty <= QTY_EPS) {
      addToPool(pool, null, Math.abs(Number(r.balance_qty) || 0), seqRef);
      fifoByIndex.set(i, NO_LOT_LABEL);
    }
  }

  const lotBalances = new Map<string, number>();
  for (const b of pool) {
    if (b.qty <= QTY_EPS) continue;
    if (b.lotKey === "__NO_LOT__") continue;
    lotBalances.set(b.lotKey, b.qty);
  }

  return { fifoByIndex, lotBalances };
}

export function applyLedgerFifoLots<T extends FifoLedgerInput>(rows: T[]): (T & { fifo_lot_no: string })[] {
  const sorted = sortLedgerRowsForDisplay(rows);
  const { fifoByIndex } = simulateFifo(sorted);
  return sorted.map((r, i) => ({
    ...r,
    fifo_lot_no: fifoByIndex.get(i) ?? lotLabel(r.lot_no),
  }));
}

export function getFifoLotBalances<T extends FifoLedgerInput>(rows: T[]): Map<string, number> {
  return simulateFifo(sortLedgerRowsForDisplay(rows)).lotBalances;
}

export function formatFifoLotDisplay(fifoLotNo: string | null | undefined): string {
  const s = (fifoLotNo || "").trim();
  if (!s || s === NO_LOT_LABEL) return "";
  return s;
}

-- 재고수불부 (품목별 입·출고 이력) + 동기화 메타
CREATE TABLE IF NOT EXISTS public.ecount_stock_ledger (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  prod_cd TEXT NOT NULL,
  prod_nm TEXT,
  txn_date TEXT,
  partner_name TEXT,
  remarks TEXT,
  in_qty NUMERIC DEFAULT 0,
  out_qty NUMERIC DEFAULT 0,
  balance_qty NUMERIC,
  lot_no TEXT,
  row_kind TEXT NOT NULL DEFAULT 'txn',
  period_from TEXT,
  period_to TEXT,
  synced_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ecount_stock_ledger_prod_cd ON public.ecount_stock_ledger (prod_cd);
CREATE INDEX IF NOT EXISTS idx_ecount_stock_ledger_synced ON public.ecount_stock_ledger (prod_cd, synced_at DESC);

CREATE TABLE IF NOT EXISTS public.ecount_ledger_sync_meta (
  prod_cd TEXT PRIMARY KEY,
  prod_nm TEXT,
  first_synced_at TIMESTAMPTZ,
  last_synced_at TIMESTAMPTZ,
  period_from TEXT,
  period_to TEXT
);

ALTER TABLE public.ecount_stock_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ecount_ledger_sync_meta ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ecount_stock_ledger service" ON public.ecount_stock_ledger;
CREATE POLICY "ecount_stock_ledger service" ON public.ecount_stock_ledger
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "ecount_stock_ledger read" ON public.ecount_stock_ledger;
CREATE POLICY "ecount_stock_ledger read" ON public.ecount_stock_ledger
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "ecount_ledger_sync_meta service" ON public.ecount_ledger_sync_meta;
CREATE POLICY "ecount_ledger_sync_meta service" ON public.ecount_ledger_sync_meta
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "ecount_ledger_sync_meta read" ON public.ecount_ledger_sync_meta;
CREATE POLICY "ecount_ledger_sync_meta read" ON public.ecount_ledger_sync_meta
  FOR SELECT TO anon, authenticated USING (true);

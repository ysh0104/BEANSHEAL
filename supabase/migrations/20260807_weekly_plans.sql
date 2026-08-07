-- BEANSHEAL 주간계획표 (주차별 셀 편집 저장)

CREATE TABLE IF NOT EXISTS public.weekly_plans (
  week_start DATE PRIMARY KEY,
  cells JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT DEFAULT ''
);

ALTER TABLE public.weekly_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "weekly_plans_all_service" ON public.weekly_plans;
CREATE POLICY "weekly_plans_all_service" ON public.weekly_plans
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "weekly_plans_read_all" ON public.weekly_plans;
CREATE POLICY "weekly_plans_read_all" ON public.weekly_plans
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "weekly_plans_write_all" ON public.weekly_plans;
CREATE POLICY "weekly_plans_write_all" ON public.weekly_plans
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- ====================================================================
-- 이카운트식 권한 그룹 (관리자가 그룹·기능을 자유롭게 설정)
-- ====================================================================

CREATE TABLE IF NOT EXISTS public.permission_groups (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT DEFAULT '',
  is_system BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.permission_group_features (
  group_id UUID NOT NULL REFERENCES public.permission_groups(id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL,
  can_view BOOLEAN DEFAULT TRUE,
  can_edit BOOLEAN DEFAULT FALSE,
  PRIMARY KEY (group_id, feature_key)
);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS permission_group_id UUID REFERENCES public.permission_groups(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_permission_group_id
  ON public.profiles (permission_group_id);

ALTER TABLE public.permission_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permission_group_features ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pg_all_service" ON public.permission_groups;
CREATE POLICY "pg_all_service" ON public.permission_groups
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "pg_read_all" ON public.permission_groups;
CREATE POLICY "pg_read_all" ON public.permission_groups
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "pg_write_all" ON public.permission_groups;
CREATE POLICY "pg_write_all" ON public.permission_groups
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "pgf_all_service" ON public.permission_group_features;
CREATE POLICY "pgf_all_service" ON public.permission_group_features
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "pgf_read_all" ON public.permission_group_features;
CREATE POLICY "pgf_read_all" ON public.permission_group_features
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "pgf_write_all" ON public.permission_group_features;
CREATE POLICY "pgf_write_all" ON public.permission_group_features
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

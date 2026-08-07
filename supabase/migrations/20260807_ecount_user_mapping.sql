-- ====================================================================
-- 구글(BEANSHEAL) 계정 ↔ 이카운트 사용자 매칭
-- ====================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ecount_user_id TEXT,
  ADD COLUMN IF NOT EXISTS ecount_emp_cd TEXT,
  ADD COLUMN IF NOT EXISTS ecount_user_name TEXT;

CREATE INDEX IF NOT EXISTS idx_profiles_ecount_user_id
  ON public.profiles (ecount_user_id);

-- 이카운트 사원/사용자 디렉터리 캐시 (API 동기화 또는 관리자 수동 등록)
CREATE TABLE IF NOT EXISTS public.ecount_users (
  user_id TEXT PRIMARY KEY,
  emp_cd TEXT DEFAULT '',
  user_name TEXT NOT NULL DEFAULT '',
  dept_name TEXT DEFAULT '',
  raw JSONB DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ecount_users_name
  ON public.ecount_users (user_name);

ALTER TABLE public.ecount_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ecount_users_all_service" ON public.ecount_users;
CREATE POLICY "ecount_users_all_service" ON public.ecount_users
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "ecount_users_read_all" ON public.ecount_users;
CREATE POLICY "ecount_users_read_all" ON public.ecount_users
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "ecount_users_write_all" ON public.ecount_users;
CREATE POLICY "ecount_users_write_all" ON public.ecount_users
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

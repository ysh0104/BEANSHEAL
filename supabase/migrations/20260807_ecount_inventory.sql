-- ====================================================================
-- 이카운트 ERP 재고 데이터 저장을 위한 ecount_inventory 테이블 스키마 SQL
-- ====================================================================

-- 1. ecount_inventory 테이블 생성
CREATE TABLE IF NOT EXISTS public.ecount_inventory (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  item_code TEXT UNIQUE NOT NULL,
  item_name TEXT,
  spec TEXT,
  qty NUMERIC DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 검색 및 조인 성능 향상을 위한 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_ecount_inventory_item_code ON public.ecount_inventory (item_code);

-- 3. Row Level Security (RLS) 활성화
ALTER TABLE public.ecount_inventory ENABLE ROW LEVEL SECURITY;

-- 4. RLS 정책 설정 (service_role 백엔드 권한 & anon/authenticated 읽기 권한)
-- 4-1. 백엔드 서버 (service_role) 전체 권한 허용
DROP POLICY IF EXISTS "Enable all access for service role" ON public.ecount_inventory;
CREATE POLICY "Enable all access for service role"
ON public.ecount_inventory
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 4-2. 모든 사용자 (anon, authenticated) SELECT 읽기 권한 허용
DROP POLICY IF EXISTS "Enable read access for all users" ON public.ecount_inventory;
CREATE POLICY "Enable read access for all users"
ON public.ecount_inventory
FOR SELECT
TO anon, authenticated
USING (true);

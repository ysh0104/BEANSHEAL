-- ====================================================================
-- 워크스페이스 메모 및 카카오톡 스타일 더블클릭 확인(하트) 저장을 위한 memos 테이블 SQL
-- ====================================================================

-- 1. memos 테이블 생성
CREATE TABLE IF NOT EXISTS public.memos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  text TEXT NOT NULL,
  author TEXT DEFAULT '사용자',
  date TEXT,
  likes JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 최신순 조회를 위한 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_memos_created_at ON public.memos (created_at DESC);

-- 3. Row Level Security (RLS) 활성화
ALTER TABLE public.memos ENABLE ROW LEVEL SECURITY;

-- 4. RLS 보안 정책 설정 (백엔드 전체 권한 & 모든 사용자 읽기/쓰기/수정/삭제 권한)
DROP POLICY IF EXISTS "Enable all access for service role on memos" ON public.memos;
CREATE POLICY "Enable all access for service role on memos"
ON public.memos
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Enable read access for all on memos" ON public.memos;
CREATE POLICY "Enable read access for all on memos"
ON public.memos
FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "Enable insert access for all on memos" ON public.memos;
CREATE POLICY "Enable insert access for all on memos"
ON public.memos
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "Enable update access for all on memos" ON public.memos;
CREATE POLICY "Enable update access for all on memos"
ON public.memos
FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Enable delete access for all on memos" ON public.memos;
CREATE POLICY "Enable delete access for all on memos"
ON public.memos
FOR DELETE
TO anon, authenticated
USING (true);

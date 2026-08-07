-- 워크스페이스 메모 실시간 구독 (Supabase Realtime)
-- Dashboard > Database > Publications 에서도 memos 확인 가능

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'memos'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.memos;
  END IF;
END $$;

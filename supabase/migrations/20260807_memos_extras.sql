-- 메모 핀 / 리마인더 컬럼 (없으면 HTML meta 스팬으로도 동작)

ALTER TABLE public.memos
  ADD COLUMN IF NOT EXISTS pinned BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS reminder_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_memos_pinned ON public.memos (pinned DESC, created_at DESC);

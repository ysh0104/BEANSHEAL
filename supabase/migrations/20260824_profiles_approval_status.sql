-- Google OAuth 가입 승인제
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS auth_provider TEXT DEFAULT 'email',
  ADD COLUMN IF NOT EXISTS requested_at TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.approval_status IS 'pending | approved | rejected — Google 등 외부 가입 승인 상태';
COMMENT ON COLUMN public.profiles.auth_provider IS 'email | google | …';
COMMENT ON COLUMN public.profiles.requested_at IS '가입/승인 요청 시각';

-- 최초 적용: 기존 계정은 모두 승인 유지 (이후 Google 신규만 pending으로 생성)
UPDATE public.profiles
SET approval_status = 'approved'
WHERE requested_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_approval_status
  ON public.profiles (approval_status);

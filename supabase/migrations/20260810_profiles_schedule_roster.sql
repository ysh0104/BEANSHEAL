-- 스케줄표 ↔ 사용자(profiles) 양방향 동기화용 컬럼
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS include_in_work_schedule BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS schedule_sort_order INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_schedule_only BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_profiles_schedule_roster
  ON public.profiles (include_in_work_schedule, schedule_sort_order);

COMMENT ON COLUMN public.profiles.include_in_work_schedule IS 'false면 스케줄표에서 제외';
COMMENT ON COLUMN public.profiles.schedule_sort_order IS '스케줄표 사원 목록 정렬 순서';
COMMENT ON COLUMN public.profiles.is_schedule_only IS '스케줄/인사 등록용(로그인 미사용) 계정';

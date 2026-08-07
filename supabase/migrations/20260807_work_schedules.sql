-- 20260807_work_schedules.sql
-- 월간 근무/근무조 스케줄표 저장용 테이블

CREATE TABLE IF NOT EXISTS work_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year_month VARCHAR(7) NOT NULL, -- YYYY-MM (예: '2026-08')
  data JSONB NOT NULL DEFAULT '[]'::jsonb, -- 직원별 일자 스케줄 배열
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_work_schedules_year_month ON work_schedules (year_month);

ALTER TABLE work_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read for all users" ON work_schedules
  FOR SELECT USING (true);

CREATE POLICY "Allow insert/update for authenticated users" ON work_schedules
  FOR ALL USING (true) WITH CHECK (true);

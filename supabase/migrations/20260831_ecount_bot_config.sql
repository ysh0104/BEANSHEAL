-- 이카ount 엑셀 봇 웹 로그인 설정 (GitHub Actions가 service role로 읽음)
CREATE TABLE IF NOT EXISTS ecount_bot_config (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  com_code text NOT NULL DEFAULT '',
  login_id text NOT NULL DEFAULT '',
  login_pw text NOT NULL DEFAULT '',
  stock_menu_depth1 text,
  stock_menu_depth2 text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);

ALTER TABLE ecount_bot_config ENABLE ROW LEVEL SECURITY;

-- 클라이언트 직접 접근 차단 (service role / server만)
CREATE POLICY "ecount_bot_config_deny_all" ON ecount_bot_config
  FOR ALL USING (false);

INSERT INTO ecount_bot_config (id, com_code, login_id, login_pw)
VALUES (1, '', '', '')
ON CONFLICT (id) DO NOTHING;

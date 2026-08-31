-- 재고현황 화면 URL (PC 브라우저 주소창 복사)
ALTER TABLE ecount_bot_config
  ADD COLUMN IF NOT EXISTS stock_menu_url text;

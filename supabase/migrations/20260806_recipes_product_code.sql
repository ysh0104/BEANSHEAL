-- BOM 완제품 이카운트 품목코드 매핑
ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS product_code text;

COMMENT ON COLUMN recipes.product_code IS '이카운트 완제품 품목코드 (PROD_CD)';

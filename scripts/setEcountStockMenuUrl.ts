/**
 * 재고현황 URL을 Supabase ecount_bot_config.stock_menu_url 에 저장
 * 사용: npx tsx scripts/setEcountStockMenuUrl.ts "<url>"
 */
import { createClient } from "@supabase/supabase-js";
import { parseStockMenuUrl } from "../src/lib/ecountStockMenuUrl";

const raw = process.argv[2]?.trim();
if (!raw) {
  console.error("Usage: npx tsx scripts/setEcountStockMenuUrl.ts \"<재고현황 URL>\"");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 필요");
  process.exit(1);
}

const parsed = parseStockMenuUrl(raw);
const toSave = parsed?.normalized || raw;

const supabase = createClient(url, key);
const { error } = await supabase
  .from("ecount_bot_config")
  .upsert(
    {
      id: 1,
      stock_menu_url: toSave,
      updated_at: new Date().toISOString(),
      updated_by: "setEcountStockMenuUrl.ts",
    },
    { onConflict: "id" }
  );

if (error) {
  console.error("저장 실패:", error.message);
  process.exit(1);
}

console.log("✅ stock_menu_url 저장됨:");
console.log(toSave);
if (parsed?.depth1Selector) console.log("   depth1:", parsed.depth1Selector);
if (parsed?.depth2Selector) console.log("   depth2:", parsed.depth2Selector);

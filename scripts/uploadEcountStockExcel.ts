/**
 * 로컬·봇 테스트: 이카ount 재고현황 엑셀 → Supabase ecount_items
 *
 * 사용법:
 *   npx tsx scripts/uploadEcountStockExcel.ts [파일경로]
 *   npx tsx scripts/uploadEcountStockExcel.ts downloads/ecount_stock.xlsx
 */
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { parseEcountStockExcel } from "../src/lib/ecountStockExcelParser";
import { uploadEcountStockRows } from "../src/lib/ecountStockExcelUpload";

for (const envPath of [".env.local", ".env"]) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath, override: true });
    break;
  }
}

async function main() {
  const argPath = process.argv[2];
  const candidates = [
    argPath,
    "downloads/ecount_stock.xlsx",
    "downloads/ecount_inventory.xlsx",
    "data/stock.xlsx",
    "stock.xlsx",
  ].filter(Boolean) as string[];

  let filePath = "";
  for (const c of candidates) {
    const resolved = path.resolve(process.cwd(), c);
    if (fs.existsSync(resolved)) {
      filePath = resolved;
      break;
    }
  }

  if (!filePath) {
    console.error("❌ 엑셀 파일을 찾을 수 없습니다.");
    console.error("   npx tsx scripts/uploadEcountStockExcel.ts path/to/재고현황.xlsx");
    process.exit(1);
  }

  console.log(`📄 파일: ${filePath}`);
  const buffer = fs.readFileSync(filePath);
  const parsed = parseEcountStockExcel(buffer);
  console.log(`✅ 파싱: ${parsed.rows.length}건 (스킵 ${parsed.skippedRows}행)`);
  console.log(`   헤더: ${parsed.headers.filter(Boolean).slice(0, 6).join(" | ")}`);

  const upload = await uploadEcountStockRows(parsed.rows);
  if (!upload.success) {
    console.error("❌ 업로드 실패:", upload.error);
    process.exit(1);
  }

  console.log(`🎉 Supabase 반영 완료: ${upload.count}건 (${upload.synced_at})`);
}

main().catch((e) => {
  console.error("❌", e?.message || e);
  process.exit(1);
});

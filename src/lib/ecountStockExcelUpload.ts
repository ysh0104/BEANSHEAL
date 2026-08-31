import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { EcountStockExcelRow } from "@/lib/ecountStockExcelParser";

function getSupabase(): SupabaseClient | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const supabaseServiceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  if (!supabaseUrl || !supabaseServiceKey) return null;
  return createClient(supabaseUrl, supabaseServiceKey);
}

export type EcountStockUploadResult = {
  success: boolean;
  count?: number;
  synced_at?: string;
  error?: string;
};

/**
 * 이카ount 재고현황 엑셀 파싱 결과 → ecount_items 전량 교체 업로드
 */
export async function uploadEcountStockRows(rows: EcountStockExcelRow[]): Promise<EcountStockUploadResult> {
  try {
    const supabase = getSupabase();
    if (!supabase) return { success: false, error: "Supabase 설정 누락" };
    if (!rows?.length) return { success: false, error: "저장할 엑셀 데이터가 없습니다." };

    const syncedAt = new Date().toISOString();
    const payload = rows.map((r) => ({
      prod_cd: String(r.prod_cd).trim(),
      prod_nm: String(r.prod_nm).trim(),
      total_qty: Number(r.total_qty || 0),
      last_synced_at: syncedAt,
    }));

    const { error: deleteError } = await supabase
      .from("ecount_items")
      .delete()
      .neq("prod_cd", "___IMPOSSIBLE_CD___");
    if (deleteError) {
      console.error("[uploadEcountStockRows delete]:", deleteError.message);
      return { success: false, error: deleteError.message };
    }

    const { error } = await supabase.from("ecount_items").upsert(payload, { onConflict: "prod_cd" });
    if (error) {
      console.error("[uploadEcountStockRows upsert]:", error.message);
      return { success: false, error: error.message };
    }

    return { success: true, count: payload.length, synced_at: syncedAt };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "알 수 없는 오류";
    console.error("[uploadEcountStockRows catch]:", e);
    return { success: false, error: message };
  }
}

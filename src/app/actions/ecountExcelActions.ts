"use server";

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

function getSupabase() {
  if (!supabaseUrl || !supabaseServiceKey) return null;
  return createClient(supabaseUrl, supabaseServiceKey);
}

export interface ExcelMasterRow {
  prod_cd: string;
  prod_nm: string;
  total_qty: number;
}

/**
 * 이카운트 엑셀 다운로드 파일 데이터를 마스터 DB(ecount_items)에 100% 소수점 원본 덮어쓰기 저장
 */
export async function uploadEcountExcelMaster(rows: ExcelMasterRow[]): Promise<{ success: boolean; count?: number; error?: string }> {
  try {
    const supabase = getSupabase();
    if (!supabase) return { success: false, error: "Supabase 설정 누락" };

    if (!rows || rows.length === 0) {
      return { success: false, error: "저장할 엑셀 데이터가 없습니다." };
    }

    const payload = rows.map((r) => ({
      prod_cd: String(r.prod_cd).trim(),
      prod_nm: String(r.prod_nm).trim(),
      total_qty: Number(r.total_qty || 0),
      last_synced_at: new Date().toISOString(),
    }));

    // 1. 기존 마스터 재고 데이터 전량 지우고 엑셀 원본으로 깨끗이 재작성
    await supabase.from("ecount_items").delete().neq("prod_cd", "___IMPOSSIBLE_CD___");

    // 2. 엑셀 수집 마스터 데이터 업서트
    const { error } = await supabase.from("ecount_items").upsert(payload, { onConflict: "prod_cd" });
    if (error) {
      console.error("[uploadEcountExcelMaster error]:", error.message);
      return { success: false, error: error.message };
    }

    return { success: true, count: payload.length };
  } catch (e: any) {
    console.error("[uploadEcountExcelMaster catch error]:", e);
    return { success: false, error: e.message };
  }
}

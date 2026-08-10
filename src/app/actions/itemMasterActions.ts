"use server";

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

function getSupabase() {
  if (!supabaseUrl || !supabaseServiceKey) return null;
  return createClient(supabaseUrl, supabaseServiceKey);
}

/**
 * Supabase에서 품목 마스터 (prod_cd ➔ prod_nm) 맵 전체 조회
 */
export async function getItemMasterMap(): Promise<{ success: boolean; data?: Record<string, string>; error?: string }> {
  try {
    const supabase = getSupabase();
    if (!supabase) return { success: true, data: {} };

    // 1차: ecount_items_master 테이블 시도
    const { data: masterData, error: masterErr } = await supabase
      .from("ecount_items_master")
      .select("prod_cd, prod_nm");

    const map: Record<string, string> = {};

    if (!masterErr && masterData && masterData.length > 0) {
      masterData.forEach((row) => {
        if (row.prod_cd && row.prod_nm) {
          map[row.prod_cd] = row.prod_nm;
        }
      });
      return { success: true, data: map };
    }

    // 2차 폴백: ecount_inventory 내 ITEM_MASTER status 및 ecount_items 조회
    const { data: invData } = await supabase
      .from("ecount_inventory")
      .select("lot_no, item_name")
      .eq("status", "ITEM_MASTER");

    if (invData && invData.length > 0) {
      invData.forEach((row) => {
        if (row.lot_no && row.item_name) {
          map[row.lot_no] = row.item_name;
        }
      });
    }

    // 3차 폴백: ecount_items 내 유효 품목명 조회
    const { data: itemsData } = await supabase
      .from("ecount_items")
      .select("prod_cd, prod_nm");

    if (itemsData && itemsData.length > 0) {
      itemsData.forEach((row) => {
        if (row.prod_cd && row.prod_nm && row.prod_cd !== row.prod_nm && !map[row.prod_cd]) {
          map[row.prod_cd] = row.prod_nm;
        }
      });
    }

    return { success: true, data: map };
  } catch (e: any) {
    console.error("[getItemMasterMap error]:", e);
    return { success: true, data: {} };
  }
}

/**
 * Supabase에 특정 품목 마스터 (prod_cd ➔ prod_nm) 맵 영구 저장
 */
export async function saveItemMasterMapping(prodCd: string, prodNm: string): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = getSupabase();
    if (!supabase) return { success: true };

    const cleanCd = String(prodCd).trim();
    const cleanNm = String(prodNm).trim();

    if (!cleanCd || !cleanNm) {
      return { success: false, error: "품목코드와 품목명을 정확히 입력하십시오." };
    }

    // 1. ecount_items_master 테이블 업서트 시도
    const { error: masterErr } = await supabase
      .from("ecount_items_master")
      .upsert({
        prod_cd: cleanCd,
        prod_nm: cleanNm,
        updated_at: new Date().toISOString(),
      }, { onConflict: "prod_cd" });

    // 2. ecount_items 마스터 재고 테이블 내 prod_nm 즉시 업데이트
    await supabase
      .from("ecount_items")
      .update({ prod_nm: cleanNm })
      .eq("prod_cd", cleanCd);

    if (!masterErr) {
      return { success: true };
    }

    // 3. 폴백: ecount_inventory 보존
    await supabase
      .from("ecount_inventory")
      .upsert({
        item_name: cleanNm,
        lot_no: cleanCd,
        quantity: 0,
        status: "ITEM_MASTER",
        expiry_date: new Date().toISOString(),
      }, { onConflict: "lot_no" });

    return { success: true };
  } catch (e: any) {
    console.error("[saveItemMasterMapping error]:", e);
    return { success: false, error: e.message };
  }
}

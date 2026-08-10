"use server";

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

function getSupabase() {
  if (!supabaseUrl || !supabaseServiceKey) return null;
  return createClient(supabaseUrl, supabaseServiceKey);
}

export interface SafetyStockConfig {
  prod_cd: string;
  prod_nm: string;
  min_safety_qty: number;
}

/**
 * Supabase에서 안전재고 설정 전체 조회 (1차: safety_stock_configs, 2차 폴백: ecount_inventory status='SAFETY_STOCK')
 */
export async function getSafetyStockConfigs(): Promise<{ success: boolean; data?: Record<string, number>; error?: string }> {
  try {
    const supabase = getSupabase();
    if (!supabase) return { success: true, data: {} };

    // 1차: safety_stock_configs 시도
    const { data: primaryData, error: primaryErr } = await supabase
      .from("safety_stock_configs")
      .select("prod_cd, min_safety_qty");

    if (!primaryErr && primaryData && primaryData.length > 0) {
      const map: Record<string, number> = {};
      primaryData.forEach((row) => {
        map[row.prod_cd] = row.min_safety_qty;
      });
      return { success: true, data: map };
    }

    // 2차 폴백: ecount_inventory 내 SAFETY_STOCK status 조회
    const { data: fallbackData, error: fallbackErr } = await supabase
      .from("ecount_inventory")
      .select("lot_no, quantity")
      .eq("status", "SAFETY_STOCK");

    if (!fallbackErr && fallbackData && fallbackData.length > 0) {
      const map: Record<string, number> = {};
      fallbackData.forEach((row) => {
        if (row.lot_no) {
          map[row.lot_no] = Number(row.quantity || 0);
        }
      });
      return { success: true, data: map };
    }

    return { success: true, data: {} };
  } catch (e: any) {
    console.error("[getSafetyStockConfigs error]:", e);
    return { success: true, data: {} };
  }
}

/**
 * Supabase에 특정 품목 안전재고 설정 영구 저장 (1차: safety_stock_configs, 2차 폴백: ecount_inventory status='SAFETY_STOCK')
 */
export async function saveSafetyStockConfig(prodCd: string, prodNm: string, minSafetyQty: number): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = getSupabase();
    if (!supabase) return { success: true };

    // 1차: safety_stock_configs 테이블에 저장 시도
    const { error: upsertErr } = await supabase
      .from("safety_stock_configs")
      .upsert({
        prod_cd: prodCd,
        prod_nm: prodNm,
        min_safety_qty: minSafetyQty,
        updated_at: new Date().toISOString(),
      }, { onConflict: "prod_cd" });

    if (!upsertErr) {
      return { success: true };
    }

    console.warn("[safety_stock_configs table missing or error, using ecount_inventory fallback]:", upsertErr.message);

    // 2차 폴백: ecount_inventory 테이블에 SAFETY_STOCK 전표 항목으로 보존
    const { error: invErr } = await supabase
      .from("ecount_inventory")
      .upsert({
        item_name: prodNm,
        lot_no: prodCd,
        quantity: minSafetyQty,
        status: "SAFETY_STOCK",
        expiry_date: new Date().toISOString(),
      }, { onConflict: "lot_no" });

    if (invErr) {
      // onConflict 키 제약이 없으면 기존 항목 삭제 후 재입력
      await supabase.from("ecount_inventory").delete().eq("status", "SAFETY_STOCK").eq("lot_no", prodCd);
      await supabase.from("ecount_inventory").insert({
        item_name: prodNm,
        lot_no: prodCd,
        quantity: minSafetyQty,
        status: "SAFETY_STOCK",
        expiry_date: new Date().toISOString(),
      });
    }

    return { success: true };
  } catch (e: any) {
    console.error("[saveSafetyStockConfig error]:", e);
    return { success: false, error: e.message };
  }
}

/**
 * DB의 모든 품목 안전재고를 0으로 일괄 저장
 */
export async function setAllSafetyStockToZero(): Promise<{ success: boolean; count?: number; error?: string }> {
  try {
    const supabase = getSupabase();
    if (!supabase) return { success: false, error: "Supabase 설정 누락" };

    // 1. ecount_items에서 전체 품목 가져오기
    const { data: items, error: fetchErr } = await supabase
      .from("ecount_items")
      .select("prod_cd, prod_nm");

    if (fetchErr) {
      console.error("[setAllSafetyStockToZero fetch error]:", fetchErr.message);
      return { success: false, error: fetchErr.message };
    }

    if (!items || items.length === 0) {
      return { success: true, count: 0 };
    }

    // 2. safety_stock_configs에 0으로 upsert
    const payload = items.map((i) => ({
      prod_cd: i.prod_cd,
      prod_nm: i.prod_nm,
      min_safety_qty: 0,
      updated_at: new Date().toISOString(),
    }));

    const { error: upsertErr } = await supabase
      .from("safety_stock_configs")
      .upsert(payload, { onConflict: "prod_cd" });

    if (upsertErr) {
      console.warn("[safety_stock_configs upsert warn, using ecount_inventory fallback]:", upsertErr.message);
      const fallbackPayload = items.map((i) => ({
        item_name: i.prod_nm,
        lot_no: i.prod_cd,
        quantity: 0,
        status: "SAFETY_STOCK",
        expiry_date: new Date().toISOString(),
      }));

      await supabase
        .from("ecount_inventory")
        .upsert(fallbackPayload, { onConflict: "lot_no" });
    }

    return { success: true, count: items.length };
  } catch (e: any) {
    console.error("[setAllSafetyStockToZero catch error]:", e);
    return { success: false, error: e.message };
  }
}


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
 * 기본 안전재고 임계값 (설정되지 않은 품목 기본값)
 * 원료 계열: 50 kg / 부자재 계열: 100 EA / 기본: 30
 */
export async function getDefaultSafetyQty(prodNm: string): Promise<number> {
  if (!prodNm) return 30;
  if (prodNm.startsWith("원)") || prodNm.includes("농축액") || prodNm.includes("추출물") || prodNm.includes("분말") || prodNm.includes("원두")) {
    return 50;
  }
  if (prodNm.startsWith("부)") || prodNm.includes("포장") || prodNm.includes("스틱") || prodNm.includes("박스") || prodNm.includes("파우치")) {
    return 100;
  }
  return 30;
}

/**
 * Supabase에서 안전재고 설정 조회
 */
export async function getSafetyStockConfigs(): Promise<{ success: boolean; data?: Record<string, number>; error?: string }> {
  try {
    const supabase = getSupabase();
    if (!supabase) return { success: true, data: {} };

    const { data, error } = await supabase
      .from("safety_stock_configs")
      .select("prod_cd, min_safety_qty");

    if (error || !data) {
      return { success: true, data: {} };
    }

    const map: Record<string, number> = {};
    data.forEach((row) => {
      map[row.prod_cd] = row.min_safety_qty;
    });

    return { success: true, data: map };
  } catch (e: any) {
    console.error("[getSafetyStockConfigs error]:", e);
    return { success: true, data: {} };
  }
}

/**
 * Supabase에 특정 품목 안전재고 설정 저장
 */
export async function saveSafetyStockConfig(prodCd: string, prodNm: string, minSafetyQty: number): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = getSupabase();
    if (!supabase) return { success: true };

    const { error } = await supabase
      .from("safety_stock_configs")
      .upsert({
        prod_cd: prodCd,
        prod_nm: prodNm,
        min_safety_qty: minSafetyQty,
        updated_at: new Date().toISOString(),
      }, { onConflict: "prod_cd" });

    if (error) {
      console.warn("[saveSafetyStockConfig error]:", error.message);
    }

    return { success: true };
  } catch (e: any) {
    console.error("[saveSafetyStockConfig error]:", e);
    return { success: false, error: e.message };
  }
}

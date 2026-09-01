"use server";

import { createClient } from "@supabase/supabase-js";
import { getEcountBotConfigPublic } from "@/lib/ecountBotConfig";
import { parseStockMenuUrl, validateStockMenuUrl } from "@/lib/ecountStockMenuUrl";

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function fetchEcountBotConfigStatus() {
  const bot = await getEcountBotConfigPublic();
  return {
    bot,
    vercel: {
      github_token: !!process.env.GITHUB_TOKEN,
      github_repo: process.env.GITHUB_REPO || "ysh0104/BEANSHEAL",
      supabase_service_role: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    },
  };
}

export async function saveEcountBotConfig(input: {
  com_code: string;
  login_id: string;
  login_pw?: string;
  stock_menu_url?: string;
  stock_menu_depth1?: string;
  stock_menu_depth2?: string;
  updated_by?: string;
}): Promise<{ success: boolean; error?: string; normalized_menu_url?: string; menu_hint?: string }> {
  const supabase = getServiceSupabase();
  if (!supabase) return { success: false, error: "Supabase service role 미설정" };

  const com_code = (input.com_code || "").trim();
  const login_id = (input.login_id || "").trim();
  if (!com_code || !login_id) {
    return { success: false, error: "회사코드와 로그인 ID는 필수입니다." };
  }

  const { data: existing } = await supabase
    .from("ecount_bot_config")
    .select("login_pw")
    .eq("id", 1)
    .maybeSingle();

  const login_pw = (input.login_pw || "").trim() || existing?.login_pw || "";
  if (!login_pw) {
    return { success: false, error: "웹 로그인 비밀번호를 입력하세요." };
  }

  const stockMenuUrlRaw = (input.stock_menu_url || "").trim();
  let stock_menu_url: string | null = null;
  let menu_hint: string | undefined;
  let depth1 = (input.stock_menu_depth1 || "").trim() || null;
  let depth2 = (input.stock_menu_depth2 || "").trim() || null;

  if (stockMenuUrlRaw) {
    const check = validateStockMenuUrl(stockMenuUrlRaw);
    if (!check.ok) {
      return { success: false, error: check.hint || "메뉴 URL 형식이 올바르지 않습니다." };
    }
    stock_menu_url = check.normalized;
    menu_hint = check.hint;
    const parsed = parseStockMenuUrl(stock_menu_url);
    if (!depth1 && parsed?.depth1Selector) depth1 = parsed.depth1Selector;
    if (!depth2 && parsed?.depth2Selector) depth2 = parsed.depth2Selector;
  }

  const { error } = await supabase.from("ecount_bot_config").upsert(
    {
      id: 1,
      com_code,
      login_id,
      login_pw,
      stock_menu_url,
      stock_menu_depth1: depth1,
      stock_menu_depth2: depth2,
      updated_at: new Date().toISOString(),
      updated_by: input.updated_by || null,
    },
    { onConflict: "id" }
  );

  if (error) return { success: false, error: error.message };
  return { success: true, normalized_menu_url: stock_menu_url || undefined, menu_hint };
}

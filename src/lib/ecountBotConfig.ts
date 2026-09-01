import { createClient } from "@supabase/supabase-js";

export type EcountBotConfig = {
  com_code: string;
  login_id: string;
  login_pw: string;
  stock_menu_url: string | null;
  stock_menu_depth1: string | null;
  stock_menu_depth2: string | null;
  updated_at: string | null;
  updated_by: string | null;
};

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !key) return null;
  return createClient(url, key);
}

/** GitHub Actions·봇 스크립트용 — Supabase에 저장된 웹 로그인 정보 */
export async function loadEcountBotConfigFromDb(): Promise<EcountBotConfig | null> {
  const supabase = getServiceSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("ecount_bot_config")
    .select("com_code, login_id, login_pw, stock_menu_url, stock_menu_depth1, stock_menu_depth2, updated_at, updated_by")
    .eq("id", 1)
    .maybeSingle();

  if (error || !data) return null;
  if (!data.com_code?.trim() || !data.login_id?.trim() || !data.login_pw?.trim()) return null;

  return data as EcountBotConfig;
}

/** 환경변수 우선, 없으면 DB. 메뉴 URL/selector는 env·DB 중 하나라도 있으면 병합 */
export async function resolveEcountBotCredentials(): Promise<{
  com_code: string;
  login_id: string;
  login_pw: string;
  stock_menu_url?: string;
  stock_menu_depth1?: string;
  stock_menu_depth2?: string;
  ledger_menu_url?: string;
  source: "env" | "database";
} | null> {
  const comEnv = process.env.ECOUNT_COM_CODE?.trim();
  const idEnv = (process.env.ECOUNT_ID || process.env.ECOUNT_USER_ID)?.trim();
  const pwEnv = process.env.ECOUNT_PW?.trim();
  const db = await loadEcountBotConfigFromDb();

  const menuFromEnv = {
    stock_menu_url: process.env.ECOUNT_STOCK_MENU_URL?.trim() || undefined,
    stock_menu_depth1: process.env.ECOUNT_STOCK_MENU_DEPTH1?.trim() || undefined,
    stock_menu_depth2: process.env.ECOUNT_STOCK_MENU_DEPTH2?.trim() || undefined,
  };

  const menuFromDb = db
    ? {
        stock_menu_url: db.stock_menu_url?.trim() || undefined,
        stock_menu_depth1: db.stock_menu_depth1?.trim() || undefined,
        stock_menu_depth2: db.stock_menu_depth2?.trim() || undefined,
      }
    : {};

  const menu = {
    stock_menu_url: menuFromEnv.stock_menu_url || menuFromDb.stock_menu_url,
    stock_menu_depth1: menuFromEnv.stock_menu_depth1 || menuFromDb.stock_menu_depth1,
    stock_menu_depth2: menuFromEnv.stock_menu_depth2 || menuFromDb.stock_menu_depth2,
    ledger_menu_url: process.env.ECOUNT_LEDGER_MENU_URL?.trim() || undefined,
  };

  if (comEnv && idEnv && pwEnv) {
    return {
      com_code: comEnv,
      login_id: idEnv,
      login_pw: pwEnv,
      ...menu,
      source: "env",
    };
  }

  if (!db) return null;

  return {
    com_code: db.com_code.trim(),
    login_id: db.login_id.trim(),
    login_pw: db.login_pw.trim(),
    ...menu,
    source: "database",
  };
}

/** UI용 — 비밀번호 마스킹 */
export async function getEcountBotConfigPublic(): Promise<{
  configured: boolean;
  com_code: string;
  login_id: string;
  has_password: boolean;
  stock_menu_url: string;
  stock_menu_depth1: string;
  stock_menu_depth2: string;
  updated_at: string | null;
  updated_by: string | null;
}> {
  const db = await loadEcountBotConfigFromDb();
  if (!db) {
    return {
      configured: false,
      com_code: "",
      login_id: "",
      has_password: false,
      stock_menu_url: "",
      stock_menu_depth1: "",
      stock_menu_depth2: "",
      updated_at: null,
      updated_by: null,
    };
  }
  return {
    configured: true,
    com_code: db.com_code,
    login_id: db.login_id,
    has_password: !!db.login_pw,
    stock_menu_url: db.stock_menu_url || "",
    stock_menu_depth1: db.stock_menu_depth1 || "",
    stock_menu_depth2: db.stock_menu_depth2 || "",
    updated_at: db.updated_at,
    updated_by: db.updated_by,
  };
}

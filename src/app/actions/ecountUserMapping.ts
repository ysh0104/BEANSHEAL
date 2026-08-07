"use server";

import { createClient } from "@supabase/supabase-js";
import { getSessionId, getEcountProxyBaseUrl, ecountFetchHeaders } from "@/app/actions/ecount";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "placeholder-key";
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export type EcountUserRecord = {
  user_id: string;
  emp_cd: string;
  user_name: string;
  dept_name: string;
};

function normalizeEcountRow(raw: any): EcountUserRecord | null {
  const userId = String(
    raw?.USER_ID || raw?.USERID || raw?.LOGIN_ID || raw?.ID || raw?.EMP_CD || raw?.emp_cd || ""
  ).trim();
  const empCd = String(raw?.EMP_CD || raw?.EMPCD || raw?.emp_cd || userId || "").trim();
  const userName = String(
    raw?.USER_NAME || raw?.UNAME || raw?.EMP_NAME || raw?.EMP_DES || raw?.NAME || raw?.user_name || ""
  ).trim();
  const deptName = String(
    raw?.DEPT_NAME || raw?.SITE_DES || raw?.DEPT_DES || raw?.dept_name || ""
  ).trim();

  if (!userId && !empCd) return null;
  return {
    user_id: userId || empCd,
    emp_cd: empCd || userId,
    user_name: userName || userId || empCd,
    dept_name: deptName,
  };
}

export async function listEcountUsers(): Promise<{
  success: boolean;
  message?: string;
  data: EcountUserRecord[];
}> {
  try {
    const { data, error } = await supabase
      .from("ecount_users")
      .select("user_id, emp_cd, user_name, dept_name")
      .order("user_name", { ascending: true });

    if (error) {
      return { success: false, message: error.message, data: [] };
    }
    return { success: true, data: (data || []) as EcountUserRecord[] };
  } catch (e: any) {
    return { success: false, message: e?.message || "조회 실패", data: [] };
  }
}

/** 관리자가 이카운트 사용자를 수동 등록 */
export async function upsertEcountUserManual(input: {
  user_id: string;
  emp_cd?: string;
  user_name?: string;
  dept_name?: string;
}) {
  try {
    const user_id = (input.user_id || "").trim();
    if (!user_id) return { success: false, message: "이카운트 사용자 ID를 입력하세요." };

    const row = {
      user_id,
      emp_cd: (input.emp_cd || user_id).trim(),
      user_name: (input.user_name || user_id).trim(),
      dept_name: (input.dept_name || "").trim(),
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("ecount_users").upsert(row, { onConflict: "user_id" });
    if (error) return { success: false, message: error.message };
    return { success: true, data: row };
  } catch (e: any) {
    return { success: false, message: e?.message || "등록 실패" };
  }
}

/**
 * 이카운트 API로 사원/사용자 목록 동기화 시도.
 * IP/API 미지원 시 실패 메시지를 반환하고, 수동 등록을 안내합니다.
 */
export async function syncEcountUsersFromApi() {
  try {
    const sessionRes: any = await getSessionId();
    if (sessionRes?.error || !sessionRes?.Data) {
      return {
        success: false,
        message:
          (sessionRes?.error || "이카운트 로그인 실패") +
          " — 사무실 프록시(ECOUNT_API_BASE_URL)가 켜져 있는지, 이카운트 허용 IP가 사무실 PC인지 확인하세요. 당장은 수동 매칭도 가능합니다.",
        count: 0,
      };
    }

    const sessionData = sessionRes.Data?.Datas || sessionRes.Data;
    const sessionId = sessionData?.SESSION_ID;
    const COM_CODE = process.env.ECOUNT_COM_CODE;

    if (!sessionId) {
      return { success: false, message: "세션 ID 없음. 수동 매칭을 사용하세요.", count: 0 };
    }

    const proxyBaseUrl = await getEcountProxyBaseUrl();
    const headers = await ecountFetchHeaders();

    const candidates = [
      `${proxyBaseUrl}/OAPI/V2/AccountCommon/GetListEmployee?SESSION_ID=${sessionId}`,
      `${proxyBaseUrl}/OAPI/V2/CommonBasic/GetListEmployee?SESSION_ID=${sessionId}`,
    ];

    let rows: any[] = [];
    let lastError = "";

    for (const url of candidates) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify({
            SESSION_ID: sessionId,
            COM_CODE,
          }),
          cache: "no-store",
        });
        const text = await res.text();
        let json: any = {};
        try {
          json = JSON.parse(text);
        } catch {
          json = { Result: { Message: `응답 해석 실패: ${text.slice(0, 100)}` } };
        }
        const list =
          json?.Data?.Result ||
          json?.Data?.Datas?.Result ||
          json?.Data?.Details ||
          json?.Result ||
          [];
        if (Array.isArray(list) && list.length > 0) {
          rows = list;
          break;
        }
        lastError = json?.Result?.Message || json?.Data?.Message || JSON.stringify(json).slice(0, 200);
      } catch (e: any) {
        lastError = e?.message || "통신 실패";
      }
    }

    if (!rows.length) {
      return {
        success: false,
        message:
          lastError ||
          "이카운트 사원 API에서 목록을 가져오지 못했습니다. 아래에서 ID를 직접 입력해 매칭하세요.",
        count: 0,
      };
    }

    const mapped = rows
      .map(normalizeEcountRow)
      .filter((r): r is EcountUserRecord => !!r);

    if (!mapped.length) {
      return {
        success: false,
        message: "사원 응답 형식을 해석하지 못했습니다. 수동 매칭을 사용하세요.",
        count: 0,
      };
    }

    const upserts = mapped.map((m) => ({
      ...m,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await supabase.from("ecount_users").upsert(upserts, { onConflict: "user_id" });
    if (error) return { success: false, message: error.message, count: 0 };

    return {
      success: true,
      message: `이카운트 사용자 ${mapped.length}명을 동기화했습니다.`,
      count: mapped.length,
    };
  } catch (e: any) {
    return {
      success: false,
      message: e?.message || "동기화 실패. 수동 매칭을 사용하세요.",
      count: 0,
    };
  }
}

/** 구글 프로필 ↔ 이카운트 사용자 매칭 저장 */
export async function updateEcountMapping(
  profileId: string,
  mapping: {
    ecount_user_id: string | null;
    ecount_emp_cd?: string | null;
    ecount_user_name?: string | null;
  }
) {
  try {
    const ecount_user_id = mapping.ecount_user_id?.trim() || null;
    const patch: Record<string, any> = {
      ecount_user_id,
      ecount_emp_cd: mapping.ecount_emp_cd?.trim() || null,
      ecount_user_name: mapping.ecount_user_name?.trim() || null,
      updated_at: new Date().toISOString(),
    };

    // 캐시에 있으면 이름/사원코드 자동 채움
    if (ecount_user_id) {
      const { data: cached } = await supabase
        .from("ecount_users")
        .select("user_id, emp_cd, user_name")
        .eq("user_id", ecount_user_id)
        .maybeSingle();
      if (cached) {
        if (!patch.ecount_emp_cd) patch.ecount_emp_cd = cached.emp_cd || ecount_user_id;
        if (!patch.ecount_user_name) patch.ecount_user_name = cached.user_name || ecount_user_id;
      }
    }

    const { error } = await supabase.from("profiles").update(patch).eq("id", profileId);
    if (error) {
      // 컬럼 미적용 환경
      if (error.message?.includes("ecount_user_id") || error.code === "PGRST204") {
        return {
          success: false,
          message:
            "profiles에 이카운트 매칭 컬럼이 없습니다. Supabase에서 20260807_ecount_user_mapping.sql 을 실행하세요.",
        };
      }
      return { success: false, message: error.message };
    }
    return { success: true, updated: patch };
  } catch (e: any) {
    return { success: false, message: e?.message || "매칭 저장 실패" };
  }
}

"use server";

import { createClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export type ApprovalStatus = "pending" | "approved" | "rejected";

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    "placeholder-key";
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function setUserApprovalStatus(
  userId: string,
  status: ApprovalStatus
): Promise<{ success: boolean; message?: string }> {
  try {
    const client = adminClient();
    const { error } = await client
      .from("profiles")
      .update({
        approval_status: status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);

    if (error) {
      const fallback = await supabase
        .from("profiles")
        .update({
          approval_status: status,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);
      if (fallback.error) {
        return { success: false, message: fallback.error.message };
      }
    }

    return {
      success: true,
      message:
        status === "approved"
          ? "가입을 승인했습니다. 해당 사용자는 이제 로그인할 수 있습니다."
          : status === "rejected"
            ? "가입 요청을 거절했습니다."
            : "상태가 변경되었습니다.",
    };
  } catch (e: any) {
    return { success: false, message: e?.message || "승인 처리 실패" };
  }
}

export async function ensurePendingGoogleProfile(input: {
  userId: string;
  email: string;
  fullName: string;
  provider?: string;
}): Promise<{ success: boolean; message?: string; status?: ApprovalStatus }> {
  try {
    const client = adminClient();
    const provider = input.provider || "google";
    const { data: existing } = await client
      .from("profiles")
      .select("id, approval_status")
      .eq("id", input.userId)
      .maybeSingle();

    if (existing) {
      return {
        success: true,
        status: (existing.approval_status || "approved") as ApprovalStatus,
      };
    }

    const { error } = await client.from("profiles").upsert(
      {
        id: input.userId,
        email: input.email,
        full_name: input.fullName,
        department: "생산팀",
        position: "사원",
        role: "WORKER",
        approval_status: "pending",
        auth_provider: provider,
        requested_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );

    if (error) {
      return { success: false, message: error.message };
    }
    return { success: true, status: "pending" };
  } catch (e: any) {
    return { success: false, message: e?.message || "프로필 생성 실패" };
  }
}

export async function getPendingApprovalProfiles() {
  try {
    const client = adminClient();
    const { data, error } = await client
      .from("profiles")
      .select("id, email, full_name, department, position, auth_provider, requested_at, created_at, approval_status")
      .eq("approval_status", "pending")
      .order("requested_at", { ascending: false });

    if (error) {
      const fallback = await supabase
        .from("profiles")
        .select("id, email, full_name, department, position, auth_provider, requested_at, created_at, approval_status")
        .eq("approval_status", "pending")
        .order("requested_at", { ascending: false });
      if (fallback.error) {
        return { success: false, message: fallback.error.message, data: [] as any[] };
      }
      return { success: true, data: fallback.data || [] };
    }
    return { success: true, data: data || [] };
  } catch (e: any) {
    return { success: false, message: e?.message || "대기 목록 조회 실패", data: [] as any[] };
  }
}

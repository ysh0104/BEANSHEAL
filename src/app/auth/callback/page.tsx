"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { ensurePendingGoogleProfile } from "@/app/actions/userApprovalActions";

/**
 * Google OAuth 콜백 — 프로필 승인 상태 확인 후 workspace 또는 login으로 분기
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const [message, setMessage] = useState("로그인 확인 중…");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // PKCE: ?code=… 교환. Implicit: getSession이 URL 해시에서 세션 복원
        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");
        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) throw exchangeError;
        }

        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;

        const authUser = sessionData.session?.user;
        if (!authUser) {
          setMessage("세션이 없습니다. 로그인 화면으로 이동합니다.");
          router.replace("/login?error=no_session");
          return;
        }

        const provider =
          (authUser.app_metadata?.provider as string) ||
          (authUser.app_metadata?.providers?.[0] as string) ||
          "email";

        const fullName =
          authUser.user_metadata?.full_name ||
          authUser.user_metadata?.name ||
          authUser.email?.split("@")[0] ||
          "사용자";

        const { data: existing } = await supabase
          .from("profiles")
          .select("id, approval_status, auth_provider")
          .eq("id", authUser.id)
          .maybeSingle();

        if (!existing) {
          const initialStatus = provider === "google" ? "pending" : "approved";

          if (provider === "google") {
            const ensured = await ensurePendingGoogleProfile({
              userId: authUser.id,
              email: authUser.email || "",
              fullName,
              provider,
            });
            if (!ensured.success) {
              console.error("ensurePendingGoogleProfile:", ensured.message);
            }
          } else {
            const { error: insertError } = await supabase.from("profiles").upsert(
              {
                id: authUser.id,
                email: authUser.email || "",
                full_name: fullName,
                department: "생산팀",
                position: "사원",
                role: "WORKER",
                approval_status: initialStatus,
                auth_provider: provider,
                updated_at: new Date().toISOString(),
              },
              { onConflict: "id" }
            );
            if (insertError) console.error("profile upsert failed:", insertError);
          }

          if (initialStatus === "pending") {
            await supabase.auth.signOut();
            localStorage.removeItem("beansheal_active_user");
            if (!cancelled) {
              router.replace("/login?pending=1");
            }
            return;
          }
        } else {
          const status = (existing.approval_status || "approved") as string;

          if (status === "pending") {
            await supabase.auth.signOut();
            localStorage.removeItem("beansheal_active_user");
            if (!cancelled) router.replace("/login?pending=1");
            return;
          }
          if (status === "rejected") {
            await supabase.auth.signOut();
            localStorage.removeItem("beansheal_active_user");
            if (!cancelled) router.replace("/login?rejected=1");
            return;
          }

          if (!existing.auth_provider && provider) {
            await supabase
              .from("profiles")
              .update({ auth_provider: provider })
              .eq("id", authUser.id);
          }
        }

        if (!cancelled) {
          setMessage("승인된 계정입니다. 대시보드로 이동합니다…");
          router.replace("/workspace");
        }
      } catch (e: any) {
        console.error("auth callback error:", e);
        await supabase.auth.signOut().catch(() => {});
        if (!cancelled) {
          router.replace(`/login?error=${encodeURIComponent(e?.message || "auth_failed")}`);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-800 p-6">
      <div className="text-center space-y-3">
        <div className="w-8 h-8 border-2 border-slate-800 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-sm font-bold">{message}</p>
      </div>
    </div>
  );
}

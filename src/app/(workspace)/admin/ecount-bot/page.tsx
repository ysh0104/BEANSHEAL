"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { fetchEcountBotConfigStatus, saveEcountBotConfig } from "@/app/actions/ecountBotConfigActions";

export default function EcountBotAdminPage() {
  const { user } = useAuth();
  const isSuperAdmin = user?.permissionGroupName === "전체관리자";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<Awaited<ReturnType<typeof fetchEcountBotConfigStatus>> | null>(null);
  const [comCode, setComCode] = useState("");
  const [loginId, setLoginId] = useState("");
  const [loginPw, setLoginPw] = useState("");
  const [menuUrl, setMenuUrl] = useState("");
  const [menu1, setMenu1] = useState("");
  const [menu2, setMenu2] = useState("");
  const [msg, setMsg] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const s = await fetchEcountBotConfigStatus();
      setStatus(s);
      setComCode(s.bot.com_code || "");
      setLoginId(s.bot.login_id || "");
      setMenuUrl(s.bot.stock_menu_url || "");
      setMenu1(s.bot.stock_menu_depth1 || "");
      setMenu2(s.bot.stock_menu_depth2 || "");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMsg("");
    const res = await saveEcountBotConfig({
      com_code: comCode,
      login_id: loginId,
      login_pw: loginPw || undefined,
      stock_menu_url: menuUrl,
      stock_menu_depth1: menu1,
      stock_menu_depth2: menu2,
      updated_by: user?.email || user?.full_name,
    });
    setSaving(false);
    if (res.success) {
      setLoginPw("");
      setMsg("저장되었습니다. GitHub Actions 봇이 이 정보를 사용합니다.");
      load();
    } else {
      setMsg(res.error || "저장 실패");
    }
  };

  if (!isSuperAdmin) {
    return (
      <div className="max-w-lg mx-auto mt-20 p-8 bg-white rounded-2xl border text-center">
        <p className="font-bold text-slate-800">전체관리자만 접근할 수 있습니다.</p>
        <Link href="/inventory" className="text-emerald-700 underline text-sm mt-2 inline-block">
          재고현황으로
        </Link>
      </div>
    );
  }

  const checks = [
    { ok: status?.bot.configured, label: "이카ount 웹 로그인 (아래 폼)" },
    { ok: status?.vercel.supabase_service_role, label: "Vercel SUPABASE_SERVICE_ROLE_KEY" },
    { ok: status?.vercel.github_token, label: "Vercel GITHUB_TOKEN (봇 트리거)" },
  ];
  const allReady = checks.every((c) => c.ok);

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <h1 className="text-2xl font-bold text-slate-900 mb-1">이카ount 엑셀 봇 설정</h1>
      <p className="text-sm text-slate-500 mb-6">
        여기에 한 번만 입력하면 GitHub Actions 봇이 자동 로그인합니다. 직원 PC 설치 불필요.
      </p>

      <div className="mb-6 rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
        <p className="text-xs font-bold text-slate-700">설정 체크리스트</p>
        {checks.map((c) => (
          <div key={c.label} className="flex items-center gap-2 text-sm">
            <span className={c.ok ? "text-emerald-600" : "text-amber-600"}>{c.ok ? "✓" : "○"}</span>
            <span className={c.ok ? "text-slate-800" : "text-slate-600"}>{c.label}</span>
          </div>
        ))}
        {!loading && (
          <p className={`text-xs font-bold pt-2 ${allReady ? "text-emerald-700" : "text-amber-800"}`}>
            {allReady
              ? "준비 완료 — /inventory 에서 「엑셀 봇 자동 동기화」 사용 가능"
              : "GitHub Secrets: SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL 도 필요합니다 (docs/ecount-bot-setup.md)"}
          </p>
        )}
      </div>

      {loading ? (
        <p className="text-slate-400 text-sm">로딩 중…</p>
      ) : (
        <form onSubmit={handleSave} className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-sm">
          <div>
            <label className="text-xs font-bold text-slate-600">회사코드 (COM_CODE)</label>
            <input
              value={comCode}
              onChange={(e) => setComCode(e.target.value)}
              className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              placeholder="예: 123456"
              required
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-600">웹 로그인 ID</label>
            <input
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono"
              required
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-600">
              웹 로그인 비밀번호 {status?.bot.has_password && "(변경 시에만 입력)"}
            </label>
            <input
              type="password"
              value={loginPw}
              onChange={(e) => setLoginPw(e.target.value)}
              className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              placeholder={status?.bot.has_password ? "•••••• (유지)" : "비밀번호 입력"}
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-600">
              출력물(재고) 메뉴 URL <span className="font-normal text-amber-700">(봇 필수)</span>
            </label>
            <p className="text-[11px] text-slate-500 mt-1 mb-1.5 leading-relaxed">
              PC에서 이카ount 로그인 → <strong>재고 I → 출력물</strong> 화면(재고현황·재고수불부 카드가 보이는
              목록) → 주소창 URL 전체 복사.{" "}
              <span className="text-slate-400">
                다른 브라우저에 붙여넣으면 「출력물」 목록만 보여도 정상입니다. 재고 봇은 「재고현황」, 수불부 봇은
                「재고수불부」를 자동 클릭합니다.
              </span>
            </p>
            <input
              value={menuUrl}
              onChange={(e) => setMenuUrl(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono"
              placeholder="https://..."
            />
          </div>
          <details className="text-xs text-slate-600">
            <summary className="cursor-pointer font-bold text-slate-700">메뉴 selector (고급, 자동 이동 실패 시)</summary>
            <p className="mt-2 mb-2">
              PC에서 이카ount 로그인 → <strong>재고(1)</strong> → <strong>재고현황</strong> 클릭 → F12 →
              메뉴 <code>&lt;a id=&quot;link_depth1_...&quot;&gt;</code> Copy selector 를 아래에 붙여넣기.
            </p>
            <input
              value={menu1}
              onChange={(e) => setMenu1(e.target.value)}
              placeholder="ECOUNT_STOCK_MENU_DEPTH1"
              className="w-full mb-2 border border-slate-200 rounded-lg px-2 py-1.5 font-mono text-[11px]"
            />
            <input
              value={menu2}
              onChange={(e) => setMenu2(e.target.value)}
              placeholder="ECOUNT_STOCK_MENU_DEPTH2"
              className="w-full border border-slate-200 rounded-lg px-2 py-1.5 font-mono text-[11px]"
            />
          </details>

          {msg && (
            <p className={`text-xs font-bold ${msg.includes("실패") || msg.includes("필수") ? "text-rose-700" : "text-emerald-700"}`}>
              {msg}
            </p>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-bold px-4 py-2 rounded-xl disabled:opacity-50 cursor-pointer"
            >
              {saving ? "저장 중…" : "봇 로그인 정보 저장"}
            </button>
            <Link
              href="/inventory"
              className="text-sm font-semibold text-slate-600 border border-slate-300 px-4 py-2 rounded-xl hover:bg-slate-50"
            >
              재고현황
            </Link>
          </div>
        </form>
      )}

      <p className="mt-6 text-[11px] text-slate-500 leading-relaxed">
        Supabase에 <code className="bg-slate-100 px-1 rounded">ecount_bot_config</code> 테이블 마이그레이션이 필요합니다.
        SQL:{" "}
        <code className="bg-slate-100 px-1 rounded">20260831_ecount_bot_config.sql</code>,{" "}
        <code className="bg-slate-100 px-1 rounded">20260831_ecount_bot_config_url.sql</code>
      </p>
    </div>
  );
}

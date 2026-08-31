import { NextResponse } from "next/server";
import { syncEcountMasterToDb, getSessionId } from "@/app/actions/ecount";

export async function GET() {
  const sessionRes = await getSessionId();
  const COM_CODE = process.env.ECOUNT_COM_CODE || process.env.ECOUNT_COMPANY_CODE || process.env.ECOUNT_COM_CD;
  const USER_ID = process.env.ECOUNT_USER_ID || process.env.ECOUNT_USER || process.env.ECOUNT_ID;
  const API_KEY = process.env.ECOUNT_API_KEY || process.env.ECOUNT_CERT_KEY || process.env.ECOUNT_API_CERT_KEY;

  return NextResponse.json({
    mode: process.env.GITHUB_TOKEN && process.env.GITHUB_REPO ? "excel-bot" : "api-fallback",
    envCheck: {
      ECOUNT_COM_CODE: !!COM_CODE,
      ECOUNT_USER_ID: !!USER_ID,
      ECOUNT_API_KEY: !!API_KEY,
      GITHUB_TOKEN: !!process.env.GITHUB_TOKEN,
      GITHUB_REPO: !!process.env.GITHUB_REPO,
    },
    loginResult: sessionRes,
    setupGuide: "/docs/ecount-bot-setup.md",
  });
}

/** GitHub REST — fine-grained PAT는 Bearer + User-Agent 필수 */
function githubApiHeaders(token: string): HeadersInit {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token.trim()}`,
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "BEANSHEAL-Platform",
  };
}

/** 재고 동기화 — GitHub Actions 엑셀 봇 우선, 미설정 시 OpenAPI(정수) 폴백 */
export async function POST() {
  const GITHUB_TOKEN = process.env.GITHUB_TOKEN?.trim();
  const GITHUB_REPO = (process.env.GITHUB_REPO || "ysh0104/BEANSHEAL").trim().replace(/^https:\/\/github\.com\//, "");

  if (GITHUB_TOKEN && GITHUB_REPO) {
    try {
      const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/dispatches`, {
        method: "POST",
        headers: githubApiHeaders(GITHUB_TOKEN),
        body: JSON.stringify({
          event_type: "trigger-sync",
          client_payload: { target: "stock", source: "inventory-ui" },
        }),
      });

      if (response.ok) {
        return NextResponse.json({
          success: true,
          mode: "excel-bot",
          message:
            "엑셀 봇 동기화를 시작했습니다. GitHub Actions에서 이카ount 로그인 → 재고현황 엑셀 → DB 반영 중입니다. 1~3분 후 새로고침하세요.",
        });
      }

      let detail = "";
      try {
        const errJson = await response.json();
        detail = errJson.message || JSON.stringify(errJson);
      } catch {
        detail = await response.text();
      }
      console.error("[sync-inventory] GitHub dispatch failed:", response.status, detail);
      return NextResponse.json(
        {
          success: false,
          mode: "excel-bot",
          message: `GitHub 봇 트리거 실패 (${response.status}): ${detail || "권한 없음"}. Fine-grained 토큰은 BEANSHEAL repo + Actions Read and write 필요.`,
          github_status: response.status,
          github_detail: detail,
        },
        { status: 502 }
      );
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "알 수 없는 오류";
      console.error("[sync-inventory] GitHub dispatch error:", error);
      return NextResponse.json(
        { success: false, mode: "excel-bot", message: `GitHub 봇 트리거 오류: ${msg}` },
        { status: 502 }
      );
    }
  }

  // GitHub 미설정 — OpenAPI 폴백 (정수만, docs/ecount-bot-setup.md 참고)
  try {
    const syncRes = await syncEcountMasterToDb();
    if (!syncRes.success) {
      return NextResponse.json(
        {
          success: false,
          mode: "api-fallback",
          message: `API 동기화 실패: ${syncRes.error}. 소수점 재고는 「엑셀 재고 반영」 또는 GitHub 봇 설정(docs/ecount-bot-setup.md)을 사용하세요.`,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      mode: "api-fallback",
      message:
        "⚠️ GitHub 봇 미설정 — OpenAPI(정수)로 동기화했습니다. 소수점 재고는 「엑셀 재고 반영」 또는 docs/ecount-bot-setup.md 봇 설정을 권장합니다.",
      count: syncRes.count,
      synced_at: syncRes.synced_at || new Date().toISOString(),
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "알 수 없는 오류";
    return NextResponse.json(
      { success: false, mode: "api-fallback", message: `동기화 오류: ${msg}` },
      { status: 500 }
    );
  }
}

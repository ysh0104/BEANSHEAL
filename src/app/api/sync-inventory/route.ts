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

/** 재고 동기화 — GitHub Actions 엑셀 봇 우선, 미설정 시 OpenAPI(정수) 폴백 */
export async function POST() {
  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const GITHUB_REPO = process.env.GITHUB_REPO;

  if (GITHUB_TOKEN && GITHUB_REPO) {
    try {
      const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/dispatches`, {
        method: "POST",
        headers: {
          Accept: "application/vnd.github.v3+json",
          Authorization: `token ${GITHUB_TOKEN}`,
          "Content-Type": "application/json",
        },
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

      const errText = await response.text();
      console.error("[sync-inventory] GitHub dispatch failed:", response.status, errText);
      return NextResponse.json(
        {
          success: false,
          mode: "excel-bot",
          message: `GitHub 봇 트리거 실패 (${response.status}). GITHUB_TOKEN 권한(Actions write)과 GITHUB_REPO(ysh0104/BEANSHEAL)를 확인하세요.`,
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

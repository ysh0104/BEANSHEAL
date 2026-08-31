import { NextResponse } from "next/server";
import { getSessionId } from "@/app/actions/ecount";

export async function GET() {
  const sessionRes = await getSessionId();
  const COM_CODE = process.env.ECOUNT_COM_CODE || process.env.ECOUNT_COMPANY_CODE || process.env.ECOUNT_COM_CD;
  const USER_ID = process.env.ECOUNT_USER_ID || process.env.ECOUNT_USER || process.env.ECOUNT_ID;
  const API_KEY = process.env.ECOUNT_API_KEY || process.env.ECOUNT_CERT_KEY || process.env.ECOUNT_API_CERT_KEY;

  return NextResponse.json({
    mode: "excel-bot",
    envCheck: {
      ECOUNT_COM_CODE: !!COM_CODE,
      ECOUNT_USER_ID: !!USER_ID,
      ECOUNT_API_KEY: !!API_KEY,
      GITHUB_TOKEN: !!process.env.GITHUB_TOKEN,
      GITHUB_REPO: process.env.GITHUB_REPO || "ysh0104/BEANSHEAL",
    },
    loginResult: sessionRes,
    setupGuide: "/docs/ecount-bot-setup.md",
  });
}

function githubApiHeaders(token: string): HeadersInit {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token.trim()}`,
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "BEANSHEAL-Platform",
  };
}

async function parseGithubError(res: Response): Promise<string> {
  try {
    const j = await res.json();
    return j.message || JSON.stringify(j);
  } catch {
    return res.text();
  }
}

/** repository_dispatch → 실패 시 workflow_dispatch 폴백 */
async function triggerGithubExcelBot(token: string, repo: string): Promise<{ ok: true; method: string } | { ok: false; detail: string }> {
  const headers = githubApiHeaders(token);

  const dispatchRes = await fetch(`https://api.github.com/repos/${repo}/dispatches`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      event_type: "trigger-sync",
      client_payload: { target: "stock", source: "inventory-ui" },
    }),
  });

  if (dispatchRes.ok) return { ok: true, method: "repository_dispatch" };

  const dispatchErr = await parseGithubError(dispatchRes);
  console.warn("[sync-inventory] repository_dispatch failed:", dispatchRes.status, dispatchErr);

  const workflowRes = await fetch(
    `https://api.github.com/repos/${repo}/actions/workflows/sync-inventory.yml/dispatches`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        ref: "main",
        inputs: { target: "stock" },
      }),
    }
  );

  if (workflowRes.ok) return { ok: true, method: "workflow_dispatch" };

  const workflowErr = await parseGithubError(workflowRes);
  console.error("[sync-inventory] workflow_dispatch failed:", workflowRes.status, workflowErr);

  return {
    ok: false,
    detail: `repository_dispatch: ${dispatchErr} / workflow_dispatch: ${workflowErr}`,
  };
}

/** 재고 동기화 — GitHub Actions 엑셀 봇 전용 */
export async function POST() {
  const GITHUB_TOKEN = process.env.GITHUB_TOKEN?.trim();
  const GITHUB_REPO = (process.env.GITHUB_REPO || "ysh0104/BEANSHEAL").trim().replace(/^https:\/\/github\.com\//, "");

  if (!GITHUB_TOKEN || !GITHUB_REPO) {
    return NextResponse.json(
      {
        success: false,
        mode: "excel-bot",
        message:
          "GitHub 봇이 설정되지 않았습니다. Vercel에 GITHUB_TOKEN·GITHUB_REPO를 설정하고 /admin/ecount-bot 에서 이카ount 로그인 정보를 저장하세요.",
      },
      { status: 503 }
    );
  }

  try {
    const triggered = await triggerGithubExcelBot(GITHUB_TOKEN, GITHUB_REPO);

    if (triggered.ok) {
      return NextResponse.json({
        success: true,
        mode: "excel-bot",
        trigger: triggered.method,
        message:
          "엑셀 봇 동기화를 시작했습니다. GitHub Actions에서 이카ount 로그인 → 재고현황 엑셀 → DB 반영 중입니다. 1~3분 후 새로고침하세요.",
      });
    }

    return NextResponse.json(
      {
        success: false,
        mode: "excel-bot",
        message:
          "GitHub 토큰 권한이 부족합니다. Fine-grained(agent-token) 대신 Classic 토큰(ghp_...)을 만들고 repo 권한을 켠 뒤 Vercel GITHUB_TOKEN을 교체하세요.",
        github_detail: triggered.detail,
        fix_steps: [
          "GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)",
          "Generate new token → repo 체크 → ghp_... 복사",
          "Vercel → GITHUB_TOKEN 값 교체 → Redeploy",
        ],
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

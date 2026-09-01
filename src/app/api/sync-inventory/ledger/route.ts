import { NextResponse } from "next/server";
import { fetchLatestGithubBotRun } from "@/lib/syncInventoryStatus";
import { fetchLedgerBulkDbStatus } from "@/lib/ledgerSyncStatus";

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

async function triggerLedgerBulkBot(token: string, repo: string) {
  const headers = githubApiHeaders(token);

  const dispatchRes = await fetch(`https://api.github.com/repos/${repo}/dispatches`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      event_type: "trigger-sync",
      client_payload: { target: "ledger_bulk", source: "inventory-ui" },
    }),
  });

  if (dispatchRes.ok) return { ok: true as const, method: "repository_dispatch" };

  const dispatchErr = await parseGithubError(dispatchRes);

  const workflowRes = await fetch(
    `https://api.github.com/repos/${repo}/actions/workflows/sync-inventory.yml/dispatches`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        ref: "main",
        inputs: { target: "ledger_bulk" },
      }),
    }
  );

  if (workflowRes.ok) return { ok: true as const, method: "workflow_dispatch" };

  const workflowErr = await parseGithubError(workflowRes);
  return { ok: false as const, detail: `${dispatchErr} / ${workflowErr}` };
}

/** 재고수불부 일괄 동기화 현황 */
export async function GET() {
  const db = await fetchLedgerBulkDbStatus();
  const token = process.env.GITHUB_TOKEN?.trim();
  const repo = (process.env.GITHUB_REPO || "ysh0104/BEANSHEAL").trim().replace(/^https:\/\/github\.com\//, "");

  let github_run = null;
  if (token && repo) {
    github_run = await fetchLatestGithubBotRun(token, repo);
  }

  return NextResponse.json({
    ...db,
    github_configured: !!(token && repo),
    github_actions_url: repo ? `https://github.com/${repo}/actions/workflows/sync-inventory.yml` : null,
    github_run,
  });
}

/** 재고수불부 일괄 봇 트리거 */
export async function POST() {
  const GITHUB_TOKEN = process.env.GITHUB_TOKEN?.trim();
  const GITHUB_REPO = (process.env.GITHUB_REPO || "ysh0104/BEANSHEAL").trim().replace(/^https:\/\/github\.com\//, "");

  if (!GITHUB_TOKEN || !GITHUB_REPO) {
    return NextResponse.json(
      {
        success: false,
        message: "GitHub 봇이 설정되지 않았습니다. Vercel GITHUB_TOKEN·GITHUB_REPO를 확인하세요.",
      },
      { status: 503 }
    );
  }

  const triggered = await triggerLedgerBulkBot(GITHUB_TOKEN, GITHUB_REPO);
  if (!triggered.ok) {
    return NextResponse.json(
      { success: false, message: "GitHub 재고수불부 봇 시작 실패", github_detail: triggered.detail },
      { status: 502 }
    );
  }

  return NextResponse.json({
    success: true,
    mode: "ledger_bulk",
    trigger: triggered.method,
    message:
      "재고수불부 일괄 동기화를 시작했습니다. 품목코드 없이 전체를 한 번에 조회합니다. 데이터 양에 따라 수 분~30분 이상 걸릴 수 있습니다.",
  });
}

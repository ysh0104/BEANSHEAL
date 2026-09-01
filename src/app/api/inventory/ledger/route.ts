import { NextRequest, NextResponse } from "next/server";
import { getLedgerSyncMeta, getStockLedgerRows, getPlannedLedgerPeriod } from "@/app/actions/ledgerActions";

function githubApiHeaders(token: string): HeadersInit {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token.trim()}`,
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "BEANSHEAL-Platform",
  };
}

async function triggerLedgerBot(
  token: string,
  repo: string,
  payload: { prod_cd: string; prod_nm?: string; period_from: string; period_to: string }
) {
  const headers = githubApiHeaders(token);

  const dispatchRes = await fetch(`https://api.github.com/repos/${repo}/dispatches`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      event_type: "trigger-sync",
      client_payload: {
        target: "ledger",
        prod_cd: payload.prod_cd,
        prod_nm: payload.prod_nm || "",
        period_from: payload.period_from,
        period_to: payload.period_to,
        source: "inventory-ledger-ui",
      },
    }),
  });

  if (dispatchRes.ok) return { ok: true as const };

  const workflowRes = await fetch(
    `https://api.github.com/repos/${repo}/actions/workflows/sync-inventory.yml/dispatches`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        ref: "main",
        inputs: {
          target: "ledger",
          prod_cd: payload.prod_cd,
          prod_nm: payload.prod_nm || "",
          period_from: payload.period_from,
          period_to: payload.period_to,
        },
      }),
    }
  );

  if (workflowRes.ok) return { ok: true as const };

  let detail = "";
  try {
    detail = await dispatchRes.text();
  } catch {
    /* ignore */
  }
  return { ok: false as const, detail };
}

/** GET ?prod_cd=M0001 — 캐시된 재고수불부 조회 */
export async function GET(req: NextRequest) {
  const prodCd = req.nextUrl.searchParams.get("prod_cd")?.trim();
  if (!prodCd) {
    return NextResponse.json({ success: false, error: "prod_cd 필요" }, { status: 400 });
  }

  const result = await getStockLedgerRows(prodCd);
  if (!result.success) {
    return NextResponse.json({ success: false, error: result.error }, { status: 500 });
  }

  const planned = await getPlannedLedgerPeriod(prodCd);

  return NextResponse.json({
    success: true,
    prod_cd: prodCd,
    rows: result.rows,
    meta: result.meta,
    planned_period: planned,
    has_data: result.rows.length > 0,
  });
}

/** POST { prod_cd, prod_nm? } — GitHub 재고수불부 봇 트리거 */
export async function POST(req: NextRequest) {
  const GITHUB_TOKEN = process.env.GITHUB_TOKEN?.trim();
  const GITHUB_REPO = (process.env.GITHUB_REPO || "ysh0104/BEANSHEAL").trim().replace(/^https:\/\/github\.com\//, "");

  if (!GITHUB_TOKEN || !GITHUB_REPO) {
    return NextResponse.json(
      { success: false, message: "GitHub 봇(GITHUB_TOKEN)이 설정되지 않았습니다." },
      { status: 503 }
    );
  }

  let body: { prod_cd?: string; prod_nm?: string; force?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: "JSON body 필요" }, { status: 400 });
  }

  const prod_cd = body.prod_cd?.trim();
  if (!prod_cd) {
    return NextResponse.json({ success: false, message: "prod_cd 필요" }, { status: 400 });
  }

  const metaRes = await getLedgerSyncMeta(prod_cd);
  const hasPrior = metaRes.success && !!metaRes.data?.last_synced_at;
  const planned = await getPlannedLedgerPeriod(prod_cd);

  if (!body.force && hasPrior && metaRes.data?.period_from === planned.from && metaRes.data?.period_to === planned.to) {
    const cached = await getStockLedgerRows(prod_cd);
    if (cached.success && cached.rows.length > 0) {
      return NextResponse.json({
        success: true,
        cached: true,
        message: "최신 기간 데이터가 이미 있습니다.",
        rows: cached.rows,
        meta: cached.meta,
        planned_period: planned,
      });
    }
  }

  const triggered = await triggerLedgerBot(GITHUB_TOKEN, GITHUB_REPO, {
    prod_cd,
    prod_nm: body.prod_nm,
    period_from: planned.from,
    period_to: planned.to,
  });

  if (!triggered.ok) {
    return NextResponse.json(
      { success: false, message: "GitHub 재고수불부 봇 시작 실패", detail: triggered.detail },
      { status: 502 }
    );
  }

  return NextResponse.json({
    success: true,
    cached: false,
    message: `재고수불부 동기화 시작 (${planned.from} ~ ${planned.to})`,
    planned_period: planned,
    prod_cd,
  });
}

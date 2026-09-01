import type { GithubWorkflowRunStatus } from "@/lib/syncInventoryStatus";

export type GithubRunProgress = {
  percent: number;
  step_label: string;
};

type WorkflowStepRule = {
  match: RegExp;
  weight: number;
  label: string;
};

const WORKFLOW_STEP_RULES: WorkflowStepRule[] = [
  { match: /checkout/i, weight: 5, label: "소스 체크아웃" },
  { match: /setup node/i, weight: 8, label: "Node.js 설정" },
  { match: /install dependencies/i, weight: 12, label: "패키지 설치" },
  { match: /playwright/i, weight: 15, label: "Playwright 설치" },
  { match: /run ecount/i, weight: 60, label: "Ecount 봇 실행" },
];

const BOT_STEP_ESTIMATE_MS: Record<string, number> = {
  stock: 3 * 60 * 1000,
  ledger_bulk: 5 * 60 * 1000,
};

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function findStepRule(name: string): WorkflowStepRule | undefined {
  return WORKFLOW_STEP_RULES.find((rule) => rule.match.test(name));
}

function estimateBotStepRatio(startedAt: string | null | undefined, botTarget: string): number {
  if (!startedAt) return 0.15;
  const elapsed = Date.now() - new Date(startedAt).getTime();
  const estimateMs = BOT_STEP_ESTIMATE_MS[botTarget] ?? BOT_STEP_ESTIMATE_MS.stock;
  return Math.min(0.95, Math.max(0.08, elapsed / estimateMs));
}

function progressFromJobs(
  steps: { name: string; status: string; started_at?: string | null }[],
  botTarget: string
): GithubRunProgress {
  let percent = 0;
  let stepLabel = "GitHub Actions 준비 중…";
  let activeFound = false;

  for (const rule of WORKFLOW_STEP_RULES) {
    const step = steps.find((s) => rule.match.test(s.name));
    if (!step) continue;

    if (step.status === "completed") {
      percent += rule.weight;
      stepLabel = `${rule.label} 완료`;
      continue;
    }

    if (step.status === "in_progress") {
      activeFound = true;
      if (/run ecount/i.test(step.name)) {
        const ratio = estimateBotStepRatio(step.started_at, botTarget);
        percent += rule.weight * ratio;
        stepLabel =
          botTarget === "ledger_bulk"
            ? "Ecount 로그인 → 수불부 엑셀 다운로드·업로드 중…"
            : "Ecount 로그인 → 재고 엑셀 다운로드·업로드 중…";
      } else {
        percent += rule.weight * 0.45;
        stepLabel = `${rule.label} 중…`;
      }
      break;
    }

    if (step.status === "queued") {
      activeFound = true;
      stepLabel = `${rule.label} 대기 중…`;
      break;
    }
  }

  if (!activeFound && steps.every((s) => s.status === "completed")) {
    return { percent: 92, step_label: "GitHub 완료 · DB 반영 대기 중…" };
  }

  return { percent: clampPercent(Math.max(percent, 4)), step_label: stepLabel };
}

export async function fetchGithubRunProgress(
  token: string,
  repo: string,
  run: GithubWorkflowRunStatus,
  opts: { dbSynced?: boolean; botTarget?: string } = {}
): Promise<GithubRunProgress> {
  const botTarget = opts.botTarget ?? "stock";

  if (opts.dbSynced) {
    return { percent: 100, step_label: "동기화 완료" };
  }

  if (run.status === "queued") {
    return { percent: 3, step_label: "GitHub 실행 대기 중…" };
  }

  if (run.status === "completed") {
    if (run.conclusion === "failure") {
      return { percent: 100, step_label: "GitHub 봇 실패" };
    }
    if (run.conclusion === "success") {
      return { percent: 95, step_label: "DB 반영 대기 중…" };
    }
    return { percent: 90, step_label: "GitHub 작업 마무리 중…" };
  }

  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token.trim()}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "BEANSHEAL-Platform",
  };

  try {
    const res = await fetch(
      `https://api.github.com/repos/${repo}/actions/runs/${run.id}/jobs?per_page=5`,
      { headers, cache: "no-store" }
    );
    if (!res.ok) {
      return fallbackProgressFromRun(run, botTarget);
    }

    const json = await res.json();
    const job = json.jobs?.[0];
    const steps: { name: string; status: string; started_at?: string | null }[] = job?.steps ?? [];
    if (steps.length === 0) {
      return fallbackProgressFromRun(run, botTarget);
    }

    return progressFromJobs(steps, botTarget);
  } catch {
    return fallbackProgressFromRun(run, botTarget);
  }
}

function fallbackProgressFromRun(run: GithubWorkflowRunStatus, botTarget: string): GithubRunProgress {
  const startedMs = new Date(run.created_at).getTime();
  const elapsed = Date.now() - startedMs;
  const estimateMs = BOT_STEP_ESTIMATE_MS[botTarget] ?? BOT_STEP_ESTIMATE_MS.stock;
  const ratio = Math.min(0.9, Math.max(0.05, elapsed / (estimateMs + 45_000)));
  const label =
    botTarget === "ledger_bulk"
      ? "품목별 수불부 동기화 중…"
      : "Ecount 로그인 → 엑셀 다운로드 중…";
  return { percent: clampPercent(8 + ratio * 82), step_label: label };
}

/** 트리거 직후 GitHub run 이 아직 없을 때 */
export function estimateTriggerProgress(elapsedMs: number, botTarget: string): GithubRunProgress {
  const warmUpMs = 20_000;
  const ratio = Math.min(1, elapsedMs / warmUpMs);
  return {
    percent: clampPercent(1 + ratio * 6),
    step_label:
      botTarget === "ledger_bulk" ? "재고수불부 봇 시작 요청 중…" : "재고 봇 시작 요청 중…",
  };
}

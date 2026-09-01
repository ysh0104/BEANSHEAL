import { NextResponse } from "next/server";
import { fetchGithubRunProgress } from "@/lib/githubRunProgress";
import {
  fetchLatestGithubBotRun,
  fetchSyncInventoryDbStatus,
} from "@/lib/syncInventoryStatus";

/** 재고 동기화 현황 — DB last_synced_at + GitHub Actions 최신 run */
export async function GET() {
  const db = await fetchSyncInventoryDbStatus();

  const token = process.env.GITHUB_TOKEN?.trim();
  const repo = (process.env.GITHUB_REPO || "ysh0104/BEANSHEAL").trim().replace(/^https:\/\/github\.com\//, "");

  let github_run = null;
  let github_progress = null;
  if (token && repo) {
    github_run = await fetchLatestGithubBotRun(token, repo);
    if (github_run) {
      github_progress = await fetchGithubRunProgress(token, repo, github_run, {
        botTarget: "stock",
      });
    }
  }

  return NextResponse.json({
    ...db,
    github_configured: !!(token && repo),
    github_repo: repo,
    github_actions_url: repo ? `https://github.com/${repo}/actions/workflows/sync-inventory.yml` : null,
    github_run,
    github_progress,
  });
}

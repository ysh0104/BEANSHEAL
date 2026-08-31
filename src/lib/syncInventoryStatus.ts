import { createClient } from "@supabase/supabase-js";

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  if (!url || !key) return null;
  return createClient(url, key);
}

export type SyncInventoryDbStatus = {
  last_synced_at: string | null;
  item_count: number;
};

export type GithubWorkflowRunStatus = {
  id: number;
  status: string;
  conclusion: string | null;
  created_at: string;
  updated_at: string;
  html_url: string;
};

export async function fetchSyncInventoryDbStatus(): Promise<SyncInventoryDbStatus> {
  const supabase = getServiceSupabase();
  if (!supabase) return { last_synced_at: null, item_count: 0 };

  const { count, error: countErr } = await supabase
    .from("ecount_items")
    .select("*", { count: "exact", head: true });

  const { data, error } = await supabase
    .from("ecount_items")
    .select("last_synced_at")
    .order("last_synced_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (countErr || error) {
    return { last_synced_at: null, item_count: count ?? 0 };
  }

  return {
    last_synced_at: (data?.last_synced_at as string | null) ?? null,
    item_count: count ?? 0,
  };
}

export async function fetchLatestGithubBotRun(
  token: string,
  repo: string
): Promise<GithubWorkflowRunStatus | null> {
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token.trim()}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "BEANSHEAL-Platform",
  };

  const res = await fetch(
    `https://api.github.com/repos/${repo}/actions/workflows/sync-inventory.yml/runs?per_page=1`,
    { headers, cache: "no-store" }
  );
  if (!res.ok) return null;

  const json = await res.json();
  const run = json.workflow_runs?.[0];
  if (!run) return null;

  return {
    id: run.id,
    status: run.status,
    conclusion: run.conclusion,
    created_at: run.created_at,
    updated_at: run.updated_at,
    html_url: run.html_url,
  };
}

/** 봇 트리거 이후 DB 동기화가 갱신됐는지 */
export function isSyncNewerThan(
  lastSyncedAt: string | null,
  baseline: string | null,
  triggeredAt: string
): boolean {
  if (!lastSyncedAt) return false;
  const syncMs = new Date(lastSyncedAt).getTime();
  if (Number.isNaN(syncMs)) return false;
  const triggerMs = new Date(triggeredAt).getTime() - 3000;
  if (baseline) {
    const baseMs = new Date(baseline).getTime();
    if (!Number.isNaN(baseMs) && syncMs > baseMs) return true;
  }
  return syncMs >= triggerMs;
}

/** 이번 봇 트리거로 시작된 GitHub run 인지 */
export function isGithubRunFromTrigger(
  run: { created_at: string } | null | undefined,
  triggeredAt: string
): boolean {
  if (!run) return false;
  const runMs = new Date(run.created_at).getTime();
  const triggerMs = new Date(triggeredAt).getTime() - 15000;
  return !Number.isNaN(runMs) && runMs >= triggerMs;
}

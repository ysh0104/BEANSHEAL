type BotSyncProgressBannerProps = {
  phase: "idle" | "watching" | "failed" | "timeout";
  statusLine: string;
  percent: number;
  stepLabel?: string;
  githubActionsUrl?: string | null;
  tone?: "blue" | "violet";
};

export function BotSyncProgressBanner({
  phase,
  statusLine,
  percent,
  stepLabel,
  githubActionsUrl,
  tone = "blue",
}: BotSyncProgressBannerProps) {
  if (phase === "idle" || !statusLine) return null;

  const safePercent = Math.max(0, Math.min(100, percent));
  const isError = phase === "failed";
  const isTimeout = phase === "timeout";
  const isWarning = isError || isTimeout;

  const palette =
    tone === "violet"
      ? {
          box: isError
            ? "text-rose-800 bg-rose-50 border-rose-200"
            : isTimeout
              ? "text-amber-800 bg-amber-50 border-amber-200"
              : "text-violet-900 bg-violet-50 border-violet-200",
          barTrack: isWarning ? (isError ? "bg-rose-100" : "bg-amber-100") : "bg-violet-100",
          barFill: isError ? "bg-rose-500" : isTimeout ? "bg-amber-500" : "bg-violet-500",
          dot: isError ? "bg-rose-500" : isTimeout ? "bg-amber-500" : "bg-violet-500",
          percent: isWarning ? (isError ? "text-rose-700" : "text-amber-800") : "text-violet-800",
        }
      : {
          box: isError
            ? "text-rose-800 bg-rose-50 border-rose-200"
            : isTimeout
              ? "text-amber-800 bg-amber-50 border-amber-200"
              : "text-blue-900 bg-blue-50 border-blue-200",
          barTrack: isWarning ? (isError ? "bg-rose-100" : "bg-amber-100") : "bg-blue-100",
          barFill: isError ? "bg-rose-500" : isTimeout ? "bg-amber-500" : "bg-blue-500",
          dot: isError ? "bg-rose-500" : isTimeout ? "bg-amber-500" : "bg-blue-500",
          percent: isWarning ? (isError ? "text-rose-700" : "text-amber-800") : "text-blue-800",
        };

  return (
    <div className={`text-sm font-medium max-w-2xl px-3 py-2.5 rounded-lg border ${palette.box}`}>
      <div className="flex items-start gap-2 mb-2">
        {phase === "watching" && (
          <span className={`inline-block w-2 h-2 rounded-full ${palette.dot} animate-pulse mt-1.5 shrink-0`} />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-3">
            <p className="leading-snug">
              {stepLabel || statusLine}
              {githubActionsUrl && (
                <>
                  {" "}
                  <a
                    href={githubActionsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline font-bold whitespace-nowrap"
                  >
                    GitHub Actions
                  </a>
                </>
              )}
            </p>
            <span className={`shrink-0 text-xs font-extrabold tabular-nums ${palette.percent}`}>
              {safePercent}%
            </span>
          </div>
          {stepLabel && statusLine !== stepLabel && (
            <p className="text-xs opacity-80 mt-0.5">{statusLine}</p>
          )}
        </div>
      </div>
      <div className={`h-2 rounded-full overflow-hidden ${palette.barTrack}`}>
        <div
          className={`h-full rounded-full transition-[width] duration-700 ease-out ${palette.barFill}`}
          style={{ width: `${safePercent}%` }}
        />
      </div>
    </div>
  );
}

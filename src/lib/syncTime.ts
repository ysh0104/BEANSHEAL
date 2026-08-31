/** ISO 문자열을 한국어 동기화 시각으로 표시 */
export function formatLastSyncedAt(iso: string | null | undefined): string {
  if (!iso) return "동기화 기록 없음";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "동기화 기록 없음";
  return d.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

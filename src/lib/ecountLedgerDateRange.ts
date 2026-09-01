/** 재고수불부 조회 기간 — 최초: 2025/01/01~, 이후: 6개월 롤링 */
export function formatEcountDate(d: Date): string {
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

export function getLedgerPeriodEnd(): string {
  return formatEcountDate(new Date());
}

export function getLedgerPeriodStart(hasPriorSync: boolean): string {
  if (!hasPriorSync) return "2025/01/01";
  const from = new Date();
  from.setMonth(from.getMonth() - 6);
  return formatEcountDate(from);
}

export function getLedgerDateRange(hasPriorSync: boolean): { from: string; to: string } {
  return {
    from: getLedgerPeriodStart(hasPriorSync),
    to: getLedgerPeriodEnd(),
  };
}

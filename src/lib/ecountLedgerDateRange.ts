/** 재고수불부 조회 기간 */
export function formatEcountDate(d: Date): string {
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

export function getLedgerPeriodEnd(): string {
  return formatEcountDate(new Date());
}

/** 봇 동기화: 전월 1일 ~ 오늘 */
export function getLedgerBotDateRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to.getFullYear(), to.getMonth() - 1, 1);
  return { from: formatEcountDate(from), to: formatEcountDate(to) };
}

/** @deprecated 엑셀 직접 업로드 사용 권장. 봇은 getLedgerBotDateRange 사용 */
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

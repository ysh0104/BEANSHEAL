/**
 * 기본 안전재고 임계값 (설정되지 않은 품목 기본값: 0)
 */
export function getDefaultSafetyQty(prodNm: string): number {
  return 0;
}

/**
 * 안전재고 미달 여부 판별 함수
 * - minQty가 0인 경우: totalQty가 0 이상(0 포함)이면 괜찮음 (totalQty < 0 일 때만 미달/경고)
 * - minQty가 0보다 큰 경우: totalQty <= minQty 일 때 미달/경고
 */
export function checkIsLowStock(totalQty: number, minQty: number): boolean {
  if (minQty === 0) {
    return totalQty < 0;
  }
  return totalQty <= minQty;
}

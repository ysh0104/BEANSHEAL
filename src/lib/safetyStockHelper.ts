/**
 * 기본 안전재고 임계값 (설정되지 않은 품목 기본값)
 * 원료 계열: 50 kg / 부자재 계열: 100 EA / 기본: 30
 */
export function getDefaultSafetyQty(prodNm: string): number {
  if (!prodNm) return 30;
  if (prodNm.startsWith("원)") || prodNm.includes("농축액") || prodNm.includes("추출물") || prodNm.includes("분말") || prodNm.includes("원두")) {
    return 50;
  }
  if (prodNm.startsWith("부)") || prodNm.includes("포장") || prodNm.includes("스틱") || prodNm.includes("박스") || prodNm.includes("파우치")) {
    return 100;
  }
  return 30;
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

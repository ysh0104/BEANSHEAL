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

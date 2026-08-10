/**
 * 🌟 재고 품목명 정규화 및 마스터 재고 매칭 헬퍼
 */

export interface StockItem {
  prod_cd: string;
  prod_nm: string;
  total_qty: number;
}

/**
 * 텍스트 정규화 (원/부 접두사, 대괄호[], 소괄호(), 특수문자, 공백 모두 제거)
 */
export function normalizeStockName(name: string): string {
  if (!name) return "";
  return String(name)
    .trim()
    .replace(/^[원부자반]\)\s*/, '')      // 원), 부), 자), 반) 접두사 제거
    .replace(/\[.*?\]/g, '')             // [이탈리아], [액상] 등 대괄호 제거
    .replace(/\(.*?\)/g, '')             // (베트남), (콜롬비아) 등 소괄호 제거
    .replace(/[^a-zA-Z0-9가-힣]/g, '')   // 특수문자 및 공백 제거
    .toLowerCase();
}

/**
 * 지능형 4단계 재고 매칭 함수
 * 1단계: 품목코드(prod_cd) 정확 일치
 * 2단계: 정규화된 품목명 정확 일치
 * 3단계: 정규화된 품목명 포함(부분) 일치
 * 4단계: 핵심 키워드 일치
 */
export function findStockForMaterial(
  mat: { name: string; materialCode?: string; material_code?: string; material_name?: string },
  itemsList: StockItem[]
): { qty: number; matched: boolean; matchedName?: string } {
  if (!itemsList || itemsList.length === 0) {
    return { qty: 0, matched: false };
  }

  const matCode = String(mat.materialCode || mat.material_code || '').trim();
  const rawMatName = String(mat.name || mat.material_name || '').trim();
  const matNorm = normalizeStockName(rawMatName);

  // 1단계: 품목 코드(prod_cd) 정확 일치
  if (matCode) {
    const codeMatch = itemsList.find(i => String(i.prod_cd).trim() === matCode);
    if (codeMatch) {
      return {
        qty: Number(codeMatch.total_qty) || 0,
        matched: true,
        matchedName: codeMatch.prod_nm,
      };
    }
  }

  if (!matNorm) {
    return { qty: 0, matched: false };
  }

  // 2단계: 정규화 품목명 정확 일치
  const exactMatches = itemsList.filter(i => normalizeStockName(i.prod_nm) === matNorm);
  if (exactMatches.length > 0) {
    const totalQty = exactMatches.reduce((sum, i) => sum + (Number(i.total_qty) || 0), 0);
    return {
      qty: totalQty,
      matched: true,
      matchedName: exactMatches[0].prod_nm,
    };
  }

  // 3단계: 부분/포함 일치 (matNorm이 itemNorm에 포함되거나 그 반대)
  const fuzzyMatches = itemsList.filter(i => {
    const itemNorm = normalizeStockName(i.prod_nm);
    if (!itemNorm) return false;
    return itemNorm.includes(matNorm) || matNorm.includes(itemNorm);
  });
  if (fuzzyMatches.length > 0) {
    const totalQty = fuzzyMatches.reduce((sum, i) => sum + (Number(i.total_qty) || 0), 0);
    return {
      qty: totalQty,
      matched: true,
      matchedName: fuzzyMatches[0].prod_nm,
    };
  }

  // 4단계: 핵심 키워드(앞 3~4글자) 일치
  const coreKeyword = matNorm.slice(0, Math.min(matNorm.length, 4));
  if (coreKeyword.length >= 2) {
    const keywordMatches = itemsList.filter(i => {
      const itemNorm = normalizeStockName(i.prod_nm);
      return itemNorm.includes(coreKeyword);
    });
    if (keywordMatches.length > 0) {
      const totalQty = keywordMatches.reduce((sum, i) => sum + (Number(i.total_qty) || 0), 0);
      return {
        qty: totalQty,
        matched: true,
        matchedName: keywordMatches[0].prod_nm,
      };
    }
  }

  return { qty: 0, matched: false };
}

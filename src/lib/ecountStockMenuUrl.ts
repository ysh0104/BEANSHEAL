/** 저장 URL에서 세션 ID(ec_req_sid) 제거 + hash/menu ID 추출 */
export function parseStockMenuUrl(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  try {
    const u = new URL(trimmed);
    u.searchParams.delete("ec_req_sid");
    const hash = u.hash.startsWith("#") ? u.hash.slice(1) : u.hash;
    const params = new URLSearchParams(hash);
    const menuSeq = params.get("menuSeq") || params.get("groupSeq");
    const menuType = params.get("menuType");
    const prgId = params.get("prgId");

    return {
      normalized: `${u.origin}${u.pathname}?${u.searchParams.toString()}${u.hash}`,
      hash: u.hash,
      menuSeq,
      menuType,
      prgId,
      depth1Selector: menuType ? `#link_depth1_${menuType}` : null,
      depth2Selector: menuSeq ? `#link_depth2_${menuSeq}` : null,
    };
  } catch {
    return {
      normalized: trimmed,
      hash: "",
      menuSeq: null,
      menuType: null,
      prgId: null,
      depth1Selector: null,
      depth2Selector: null,
    };
  }
}

export function normalizeStockMenuUrl(raw: string): string {
  const parsed = parseStockMenuUrl(raw);
  return parsed?.normalized?.trim() || raw.trim();
}

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

/** 로그인 세션(ec_req_sid)을 유지하면서 저장 URL 기준으로 ERP 이동 URL 생성 */
export function resolveErpNavigationTarget(currentPageUrl: string, savedMenuUrl: string): string | null {
  const trimmed = savedMenuUrl.trim();
  if (!trimmed) return null;

  try {
    const target = new URL(trimmed);
    target.searchParams.delete("ec_req_sid");

    try {
      const current = new URL(currentPageUrl);
      const sid = current.searchParams.get("ec_req_sid");
      if (sid) target.searchParams.set("ec_req_sid", sid);
    } catch {
      /* ignore */
    }

    return target.toString();
  } catch {
    return null;
  }
}

/** 저장 URL의 hash를 ERP 베이스(loginac…/ec5/view/erp)에 적용 */
export function applyMenuHashFromSaved(currentPageUrl: string, savedMenuUrl: string): string | null {
  const parsed = parseStockMenuUrl(savedMenuUrl);
  if (!parsed?.hash) return resolveErpNavigationTarget(currentPageUrl, savedMenuUrl);

  const base = resolveErpNavigationTarget(currentPageUrl, savedMenuUrl);
  if (!base) return null;

  try {
    const u = new URL(base);
    u.hash = parsed.hash.startsWith("#") ? parsed.hash : `#${parsed.hash}`;
    return u.toString();
  } catch {
    return null;
  }
}

/** hash의 prgId를 바꿔 특정 보고서 프로그램 URL 생성 */
export function buildProgramMenuUrl(raw: string, prgId: string): string {
  const trimmed = raw.trim();
  if (!trimmed || !prgId.trim()) return trimmed;
  try {
    const u = new URL(trimmed);
    u.searchParams.delete("ec_req_sid");
    const hashRaw = u.hash.startsWith("#") ? u.hash.slice(1) : u.hash;
    const params = new URLSearchParams(hashRaw);
    params.set("prgId", prgId.trim());
    u.hash = params.toString() ? `#${params.toString()}` : "";
    return u.toString();
  } catch {
    return trimmed;
  }
}
/** 재고현황 prgId 제거 — 출력물 폴더만 열기 (재고수불부 등 sibling 메뉴 클릭용) */
export function stripPrgIdFromMenuUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  try {
    const u = new URL(trimmed);
    u.searchParams.delete("ec_req_sid");
    if (u.hash) {
      const params = new URLSearchParams(u.hash.startsWith("#") ? u.hash.slice(1) : u.hash);
      params.delete("prgId");
      u.hash = params.toString() ? `#${params.toString()}` : "";
    }
    return u.toString();
  } catch {
    return trimmed;
  }
}

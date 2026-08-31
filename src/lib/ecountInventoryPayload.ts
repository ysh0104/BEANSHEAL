/** 이카운트 재고 API 요청 DATA (소수점 3자리) */
export function buildInventoryBalanceData(baseDate: string, pageNo: number, pageSize: number) {
  return {
    BASE_DATE: baseDate,
    WH_CD: "",
    PROD_CD: "",
    ZERO_INCL_YN: "Y",
    USE_DECIMAL_YN: "Y",
    DECIMAL_PRECISION: "3",
    UNIT_TYPE: "1",
    PAGE_NO: String(pageNo),
    PAGE_SIZE: String(pageSize),
  };
}

/** BAL_QTY 등 수량 필드 파싱 (콤마 제거, 소수 보존) */
export function parseEcountBalQty(item: Record<string, unknown>): number {
  const rawQtyVal =
    item.BAL_QTY ??
    item.BAL_QTY_TOT ??
    item.BAL_QTY1 ??
    item.QTY ??
    item.qty ??
    "0";
  const rawQtyStr = String(rawQtyVal).replace(/,/g, "").trim();
  if (!rawQtyStr || rawQtyStr === "NaN") return 0;
  const qty = Number(rawQtyStr);
  return Number.isFinite(qty) ? qty : 0;
}

export function getInventoryRowKey(row: Record<string, unknown>): string {
  return String(row.PROD_CD || row.PROD_NO || row.CODE || row.ITEM_CD || "").trim();
}

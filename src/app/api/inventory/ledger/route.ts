import { NextRequest, NextResponse } from "next/server";
import { getStockLedgerRows, getPlannedLedgerPeriod } from "@/app/actions/ledgerActions";

/** GET ?prod_cd=M0001 — 캐시된 재고수불부 조회 (봇 트리거는 /api/sync-inventory/ledger POST) */
export async function GET(req: NextRequest) {
  const prodCd = req.nextUrl.searchParams.get("prod_cd")?.trim();
  const prodNm = req.nextUrl.searchParams.get("prod_nm")?.trim() || undefined;
  if (!prodCd) {
    return NextResponse.json({ success: false, error: "prod_cd 필요" }, { status: 400 });
  }

  const result = await getStockLedgerRows(prodCd, prodNm);
  if (!result.success) {
    return NextResponse.json({ success: false, error: result.error }, { status: 500 });
  }

  const planned = await getPlannedLedgerPeriod(prodCd);

  return NextResponse.json({
    success: true,
    prod_cd: prodCd,
    rows: result.rows,
    meta: result.meta,
    planned_period: planned,
    has_data: result.rows.length > 0,
  });
}

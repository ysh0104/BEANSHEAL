import { NextRequest, NextResponse } from "next/server";
import { parseEcountStockExcel } from "@/lib/ecountStockExcelParser";
import { uploadEcountStockRows } from "@/lib/ecountStockExcelUpload";

const MAX_BYTES = 15 * 1024 * 1024; // 15MB

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.ECOUNT_EXCEL_UPLOAD_SECRET;
  if (!secret) return true;
  const header =
    req.headers.get("x-ecount-upload-secret") ||
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return header === secret;
}

/** 이카ount 재고현황 엑셀 파일 → Supabase ecount_items (사용자·봇 공용) */
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ success: false, error: "업로드 권한이 없습니다." }, { status: 401 });
  }

  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error: "file 필드에 엑셀 파일을 첨부하세요." }, { status: 400 });
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json({ success: false, error: "파일 크기는 15MB 이하여야 합니다." }, { status: 400 });
    }

    const name = (file.name || "").toLowerCase();
    if (!/\.(xlsx|xls|csv)$/.test(name)) {
      return NextResponse.json(
        { success: false, error: "xlsx, xls, csv 파일만 업로드할 수 있습니다." },
        { status: 400 }
      );
    }

    const buffer = await file.arrayBuffer();
    const parsed = parseEcountStockExcel(buffer);
    const upload = await uploadEcountStockRows(parsed.rows);

    if (!upload.success) {
      return NextResponse.json({ success: false, error: upload.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: `총 ${upload.count}개 품목 재고(소수점 포함)가 반영되었습니다.`,
      count: upload.count,
      synced_at: upload.synced_at,
      skipped_rows: parsed.skippedRows,
      source: file.name,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "엑셀 처리 중 오류";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}

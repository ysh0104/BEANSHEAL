import { NextRequest, NextResponse } from "next/server";
import { uploadLedgerExcelFiles } from "@/app/actions/ledgerActions";

export const maxDuration = 300;

/** POST multipart/form-data — files: 재고수불부 xlsx (복수 가능) */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const result = await uploadLedgerExcelFiles(formData);

    if (!result.success) {
      return NextResponse.json(result, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : "업로드 처리 오류" },
      { status: 500 }
    );
  }
}

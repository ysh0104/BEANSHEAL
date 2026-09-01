import { NextRequest, NextResponse } from "next/server";
import { importLedgerExcelFiles, importParsedLedgerItems } from "@/lib/ecountLedgerImport";
import type { EcountLedgerParseResult } from "@/lib/ecountLedgerExcelParser";

export const maxDuration = 300;

async function readJsonBody(req: NextRequest): Promise<{ items?: EcountLedgerParseResult[]; file_count?: number } | null> {
  const ct = req.headers.get("content-type") || "";
  if (!ct.includes("application/json")) return null;
  try {
    return await req.json();
  } catch {
    return null;
  }
}

/** POST — JSON { items } (브라우저 파싱) 또는 multipart files */
export async function POST(req: NextRequest) {
  try {
    const jsonBody = await readJsonBody(req);

    if (jsonBody?.items && Array.isArray(jsonBody.items)) {
      const result = await importParsedLedgerItems(jsonBody.items);
      const status = result.success ? 200 : 400;
      return NextResponse.json(
        {
          ...result,
          file_count: jsonBody.file_count,
          message: jsonBody.file_count
            ? `${jsonBody.file_count}개 파일 · ${result.message || "반영 완료"}`
            : result.message,
        },
        { status }
      );
    }

    const formData = await req.formData();
    const result = await importLedgerExcelFiles(formData);
    const status = result.success ? 200 : 400;
    return NextResponse.json(result, { status });
  } catch (e) {
    console.error("[ledger upload]", e);
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : "업로드 처리 오류" },
      { status: 500 }
    );
  }
}

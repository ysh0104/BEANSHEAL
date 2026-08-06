export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { testNotionConnection, fetchNotionSchedules } from "@/app/actions/notionActions";

export async function GET() {
  const envApiKey = (
    process.env.NOTION_API_KEY ||
    process.env.NOTION_KEY ||
    process.env.NOTION_SECRET ||
    process.env.NOTION_TOKEN ||
    process.env.NEXT_PUBLIC_NOTION_API_KEY ||
    ""
  ).trim();

  const envDbId = (
    process.env.NOTION_DATABASE_ID ||
    process.env.NOTION_DB_ID ||
    process.env.NOTION_PAGE_ID ||
    process.env.NEXT_PUBLIC_NOTION_DATABASE_ID ||
    ""
  ).trim();

  // Vercel 서버 환경에 존재하는 관련 환경변수 이름(Key) 목록 수집
  const matchingEnvKeys = Object.keys(process.env).filter(
    (k) =>
      k.toLowerCase().includes("notion") ||
      k.toLowerCase().includes("secret") ||
      k.toLowerCase().includes("key") ||
      k.toLowerCase().includes("db") ||
      k.toLowerCase().includes("database")
  );

  const testConn = await testNotionConnection();
  const testFetch = await fetchNotionSchedules();

  return NextResponse.json({
    matchingEnvKeysFoundOnVercel: matchingEnvKeys,
    envCheck: {
      hasApiKey: !!envApiKey,
      apiKeyPrefix: envApiKey ? envApiKey.slice(0, 7) + "..." : "미설정",
      hasDatabaseId: !!envDbId,
      dbIdLength: envDbId.length,
      dbIdSample: envDbId ? envDbId.slice(0, 6) + "..." : "미설정",
    },
    connectionTest: testConn,
    schedulesCount: testFetch.data?.length || 0,
    schedulesResult: testFetch,
  });
}

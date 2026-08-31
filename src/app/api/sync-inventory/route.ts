import { NextResponse } from 'next/server';
import { syncEcountMasterToDb, getSessionId } from '@/app/actions/ecount';

export async function GET() {
  const sessionRes = await getSessionId();
  const COM_CODE = process.env.ECOUNT_COM_CODE || process.env.ECOUNT_COMPANY_CODE || process.env.ECOUNT_COM_CD;
  const USER_ID = process.env.ECOUNT_USER_ID || process.env.ECOUNT_USER || process.env.ECOUNT_ID;
  const API_KEY = process.env.ECOUNT_API_KEY || process.env.ECOUNT_CERT_KEY || process.env.ECOUNT_API_CERT_KEY;

  return NextResponse.json({
    envCheck: {
      ECOUNT_COM_CODE: !!COM_CODE,
      ECOUNT_USER_ID: !!USER_ID,
      ECOUNT_API_KEY: !!API_KEY,
      GITHUB_TOKEN: !!process.env.GITHUB_TOKEN,
      GITHUB_REPO: !!process.env.GITHUB_REPO
    },
    loginResult: sessionRes
  });
}

export async function POST() {
  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const GITHUB_REPO = process.env.GITHUB_REPO;

  // 1. GitHub Actions 로봇 가동 신호 시도 (GITHUB_TOKEN이 존재하는 경우)
  if (GITHUB_TOKEN && GITHUB_REPO) {
    try {
      const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/dispatches`, {
        method: 'POST',
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'Authorization': `token ${GITHUB_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ event_type: 'trigger-sync' })
      });

      if (response.ok) {
        return NextResponse.json({ 
          success: true, 
          message: "GitHub 로봇 동기화 신호를 성공적으로 보냈습니다. 약 1분 후 최신 재고가 동기화됩니다." 
        });
      }
    } catch (error) {
      console.warn("GitHub Dispatch 실패, 이카운트 Open API 직연동으로 전환합니다.");
    }
  }

  // 2. 이카운트 Open API 직접 동기화 방식 수행 (Vercel 서벌리스 직접 연동)
  try {
    const syncRes = await syncEcountMasterToDb();

    if (!syncRes.success) {
      return NextResponse.json({ 
        success: false, 
        message: `이카운트 API 동기화 실패: ${syncRes.error}` 
      }, { status: 400 });
    }

    return NextResponse.json({ 
      success: true, 
      message: syncRes.message || "이카운트 API를 통해 최신 품목 및 재고 동기화가 완료되었습니다.",
      count: syncRes.count,
      synced_at: syncRes.synced_at || new Date().toISOString(),
    });

  } catch (error: any) {
    console.error("동기화 오류:", error);
    return NextResponse.json({ 
      success: false, 
      message: `이카운트 API 동기화 중 오류가 발생했습니다: ${error.message}` 
    }, { status: 500 });
  }
}
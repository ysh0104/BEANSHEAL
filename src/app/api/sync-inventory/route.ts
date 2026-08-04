import { NextResponse } from 'next/server';

export async function POST() {
  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const GITHUB_REPO = process.env.GITHUB_REPO;

  if (!GITHUB_TOKEN || !GITHUB_REPO) {
    return NextResponse.json({ 
      success: false, 
      message: "서버에 GitHub 연동 정보가 설정되지 않았습니다." 
    }, { status: 500 });
  }

  try {
    const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/dispatches`, {
      method: 'POST',
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        event_type: 'trigger-sync'
      })
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`GitHub 통신 에러: ${response.status} - ${errorData}`);
    }

    return NextResponse.json({ 
      success: true, 
      message: "로봇 가동 신호를 성공적으로 보냈습니다. 약 1분 후 화면을 새로고침해 주십시오." 
    });

  } catch (error: any) {
    console.error("동기화 신호 전송 오류:", error);
    return NextResponse.json({ 
      success: false, 
      message: "로봇 가동 신호 전송 중 오류가 발생했습니다: " + error.message 
    }, { status: 500 });
  }
}
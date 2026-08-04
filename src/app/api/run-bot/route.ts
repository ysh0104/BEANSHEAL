// 경로: app/api/run-bot/route.ts
import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

// 콜백 방식의 exec를 async/await로 쓰기 위해 변환
const execAsync = promisify(exec);

export async function POST() {
  try {
    // 터미널에서 봇을 실행하는 마법의 명령어
    const { stdout, stderr } = await execAsync('npx tsx scripts/ecountBot.ts');
    
    // 로봇이 남긴 로그(stdout)를 터미널과 클라이언트에 전달
    console.log('로봇 실행 완료:', stdout);
    if (stderr) console.error('로봇 실행 중 경고:', stderr);

    return NextResponse.json({ 
      success: true, 
      message: '데이터 스크래핑 및 DB 동기화 완료', 
      log: stdout 
    });
    
  } catch (error: any) {
    console.error('로봇 실행 실패:', error);
    return NextResponse.json({ 
      success: false, 
      message: '로봇 구동 중 오류가 발생했습니다.', 
      error: error.message 
    }, { status: 500 });
  }
}
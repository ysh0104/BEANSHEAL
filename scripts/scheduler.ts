// 경로: scripts/scheduler.ts
import { exec } from 'child_process';

// 🌟 실행 간격 설정 (현재 1시간으로 설정되어 있습니다)
// 30분으로 바꾸고 싶다면 (30 * 60 * 1000) 으로 수정하세요.
const INTERVAL_MS = 60 * 60 * 1000; 

console.log("==================================================");
console.log(" ⏳ BEANSHEAL 이카운트 자동화 스케줄러 가동 시작 ");
console.log(` ⏱️ 설정된 간격: ${INTERVAL_MS / 1000 / 60}분 마다 실행`);
console.log("==================================================\n");

function runBot() {
  const currentTime = new Date().toLocaleTimeString();
  console.log(`\n[${currentTime}] 🤖 정기 스크래핑 로봇 출동!`);
  
  // 우리가 만든 봇 실행 명령어를 여기서 쏴줍니다.
  exec('npx tsx scripts/ecountBot.ts', (error, stdout, stderr) => {
    if (error) {
      console.error(`❌ 로봇 실행 중 에러 발생: ${error.message}`);
      return;
    }
    
    // 로봇이 남긴 흔적(로그) 출력
    console.log(`[${new Date().toLocaleTimeString()}] ✅ 스크래핑 완료!`);
    if (stdout) console.log(stdout);
  });
}

// 1. 스케줄러를 켜자마자 바로 1회 즉시 실행
runBot();

// 2. 이후 정해진 시간(INTERVAL_MS)마다 무한 반복 실행
setInterval(runBot, INTERVAL_MS);
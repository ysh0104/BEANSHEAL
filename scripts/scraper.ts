// scripts/scraper.ts
import * as fs from 'fs';
import * as path from 'path';
import { chromium } from 'playwright';
import { exec } from 'child_process';
import 'dotenv/config';

// Vercel/GitHub Actions 환경을 위한 설정
const envPath = fs.existsSync('.env.local') ? '.env.local' : '.env';
require('dotenv').config({ path: envPath });

export async function runEcountBot() {
  console.log(`\n[환경변수 검사] ECOUNT_ID: ${process.env.ECOUNT_ID ? '세팅됨' : '누락'}`);
  
  if (!process.env.ECOUNT_COM_CODE || !process.env.ECOUNT_ID || !process.env.ECOUNT_PW) {
    console.error("❌ 로그인 정보가 없어 로봇을 종료합니다.");
    process.exit(1); // GitHub Actions에 실패를 알리기 위해 강제 종료
  }

  console.log("🤖 브라우저 봇 실행 준비 중...");
  // 🌟 [핵심 변경] GitHub 가상 서버는 모니터가 없으므로 무조건 headless: true 여야 합니다!
  // slowMo 옵션도 삭제하여 서버에서 최고 속도로 긁어오게 만듭니다.
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    // Vercel/GitHub 서버가 외국 IP일 수 있으므로, 이카운트 차단을 피하기 위해 한국어 설정 등 브라우저 지문을 조작합니다.
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  try {
    console.log("1. 이카운트 로그인 페이지 접속 중...");
    await page.goto('https://login.ecount.com/Login/');

    console.log("2. 로그인 정보 자동 입력 중...");
    await page.fill('input[name="com_code"]', process.env.ECOUNT_COM_CODE as string);
    await page.fill('input[name="id"]', process.env.ECOUNT_ID as string);
    await page.fill('input[name="passwd"]', process.env.ECOUNT_PW as string);

    console.log("3. 엔터키로 로그인 시도...");
    await page.press('input[name="passwd"]', 'Enter'); 

    // 로그인 완료될 때까지 확실히 기다리기 (GitHub 서버는 인터넷이 조금 느릴 수 있음)
    await page.waitForURL(/.*(OnetLogin\/Main|view\/erp).*/, { timeout: 30000 });
    console.log("🎉 로그인 성공! 이카운트 메인 화면 진입 완료.\n");

    console.log("화면 안정화를 위해 3초 대기...");
    await page.waitForTimeout(3000);

    console.log("4. 상위 메뉴 클릭 중...");
    await page.locator('#link_depth1_MENUTREE_000783').click();
    await page.waitForTimeout(1500); 

    console.log("5. 하위 메뉴(시리얼/로트 현황) 클릭 중...");
    await page.locator('#link_depth2_MENUTREE_000208').click();
    
    console.log("6. 장부 데이터 로딩 대기 (10초)...");
    await page.waitForTimeout(10000);

    console.log("7. 엑셀 다운로드 버튼 탐색 및 클릭 진행 중...");
    
    const frames = page.frames();
    let downloadObj = null;

    for (const frame of frames) {
      const excelBtn = frame.locator('#outputExcel');
      if (await excelBtn.count() > 0) {
        console.log("\n[엑셀 버튼 발견!] 다운로드를 시작합니다.");
        const [downloadEvent] = await Promise.all([
          page.waitForEvent('download', { timeout: 30000 }),
          excelBtn.click()
        ]);
        downloadObj = downloadEvent;
        break; 
      }
    }

    if (downloadObj) {
      // GitHub 가상 서버의 임시 폴더에 저장합니다.
      const downloadDir = path.join(process.cwd(), 'downloads');
      if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir);

      const filePath = path.join(downloadDir, 'ecount_inventory.xlsx');
      await downloadObj.saveAs(filePath);
      
      console.log("--------------------------------------------------");
      console.log(`🎉 [다운로드 성공] 파일 저장 완료: ${filePath}`);
      console.log("--------------------------------------------------\n");

      // ==========================================
      // 🚀 [2단계 자동 실행] uploadToSupabase.ts 호출
      // ==========================================
      console.log("🤖 2단계: DB 동기화 스크립트를 실행합니다...");
      
      // Promise로 감싸서 exec가 끝날 때까지 스크립트가 죽지 않도록 대기시킵니다.
      await new Promise((resolve, reject) => {
        exec('npx tsx scripts/uploadToSupabase.ts', (err, stdout, stderr) => {
          if (err) {
            console.error("\n❌ [DB 동기화 에러]:", err);
            reject(err);
            return;
          }
          if (stdout) console.log(stdout); 
          if (stderr) console.error(stderr);
          resolve(true);
        });
      });

      console.log("✅ 모든 프로세스가 완벽하게 종료되었습니다!");

    } else {
      console.error("⚠️ 엑셀 버튼을 찾지 못했거나 다운로드에 실패했습니다.");
      process.exit(1);
    }
    
  } catch (error) {
    console.error("❌ 로봇 동작 중 심각한 에러 발생:", error);
    process.exit(1);
  } finally {
    await page.waitForTimeout(1000);
    await browser.close();
  }
}

// 스크립트 실행
runEcountBot();
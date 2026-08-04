import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import * as xlsx from 'xlsx';
import { createClient } from '@supabase/supabase-js';

// 1. 환경변수 로드
const possiblePaths = [
  path.resolve(process.cwd(), '.env.local'),
  path.resolve(process.cwd(), '.env')
];

for (const envPath of possiblePaths) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath, override: true });
    break;
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Supabase 환경변수를 찾을 수 없습니다.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function uploadMasterData() {
  console.log("\n🚀 [엑셀 데이터 펌프 가동] 이카운트 기초등록 업로드를 시작합니다...");

  // 2. 엑셀 파일 경로 설정 (프로젝트 맨 바깥 폴더에 'master.xlsx' 라고 저장해야 합니다)
  const filePath = path.resolve(process.cwd(), 'master.xlsx');
  
  if (!fs.existsSync(filePath)) {
    console.error("❌ 에러: 'master.xlsx' 파일을 찾을 수 없습니다. 프로젝트 최상단 폴더에 넣어주세요.");
    return;
  }

  try {
    // 3. 엑셀 파일 읽기
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0]; 
    // 👇 로봇에게 "첫 번째 줄(0)은 회사명이니 무시하고, 두 번째 줄(1)부터 읽어!" 라고 명령합니다.
    const rawData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { range: 1 });

    console.log(`📄 엑셀에서 총 ${rawData.length}줄의 데이터를 읽었습니다. DB 변환을 시작합니다...`);

    // 4. DB 칸 모양에 맞게 데이터 예쁘게 다듬기
    const upsertData = rawData
      .filter((row: any) => row['품목코드']) // 품목코드가 비어있는 빈 줄은 무시
      .map((row: any) => ({
        prod_cd: String(row['품목코드']).trim(),
        prod_nm: row['품목명'] ? String(row['품목명']).trim() : '',
        item_type: row['품목구분'] ? String(row['품목구분']).trim() : null,
        spec: row['규격정보'] ? String(row['규격정보']).trim() : null,
        use_yn: row['사용'] ? String(row['사용']).trim() : 'YES',
        remarks: row['적요'] ? String(row['적요']).trim() : null
      }));

    if (upsertData.length === 0) {
      console.log("⚠️ 업로드할 유효한 데이터가 없습니다. 엑셀 첫 줄 제목이 맞는지 확인하세요.");
      return;
    }

    // 5. Supabase에 밀어 넣기 (이미 있는 코드는 덮어쓰기)
    const { error } = await supabase
      .from('ecount_items')
      .upsert(upsertData, { onConflict: 'prod_cd' });

    if (error) {
      throw error;
    }

    console.log(`✅ 대성공! 총 ${upsertData.length}개의 품목 데이터가 DB에 완벽하게 꽂혔습니다!`);

  } catch (error) {
    console.error("❌ 엑셀 처리 중 에러 발생:", error);
  }
}

uploadMasterData();
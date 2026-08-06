import { NextResponse } from 'next/server';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import fs from 'fs';
import path from 'path';

// 1. 템플릿 매핑 사전 (Dictionary)
const TEMPLATE_PREFIX_MAP: Record<string, string> = {
  "원료_액상": "qc_raw_liquid",
  "원료_분말": "qc_raw_powder",
  "원료_고체": "qc_raw_powder",  
  "원료_기본": "qc_raw_powder",  
  "원료_파우더": "qc_raw_powder",
  "원료_유기농": "qc_raw_organic", 
  "부자재_파우치": "qc_sub_pouch",
  "부자재_단상자": "qc_sub_singlebox",
  "부자재_카톤박스": "qc_sub_cartonbox",
  "부자재_유리병": "qc_sub_glass", 
  "반제품_젤리": "qc_semi_jelly",
  "반제품_액상": "qc_semi_liquid",
  "반제품_기본": "qc_semi_default",
  "완제품_기본": "qc_product_default"
};

const DOC_NAME_MAP: Record<string, string> = {
  log: '시험일지',
  instruction: '시험지시_및_기록서',
  report: '시험결과보고서',
  label: '품질관리표시서',
  request: '시험의뢰서' 
};

// 템플릿 버퍼 읽기 헬퍼 (로컬 디스크 + Vercel 정적 CDN 경로 모두 지원)
function readTemplateFile(fileName: string): Buffer | null {
  const possiblePaths = [
    path.resolve(process.cwd(), 'public', 'templates', fileName),
    path.resolve(process.cwd(), 'src', 'templates', fileName),
    path.resolve(process.cwd(), 'templates', fileName),
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      try {
        return fs.readFileSync(p);
      } catch (e) {}
    }
  }
  return null;
}

// 품목명 및 접두사(원), 부), 반), 완)) 기준 템플릿 키 자동 분류 함수
function resolveTemplateKey(productName: string, templateKey?: string): string {
  if (templateKey && TEMPLATE_PREFIX_MAP[templateKey]) {
    return templateKey;
  }

  const name = productName || "";

  // 1. 원료 (원) 접두사 또는 원료 키워드)
  if (name.startsWith("원)") || name.includes("원료")) {
    if (name.includes("분말") || name.includes("파우더") || name.includes("고체")) {
      return "원료_분말";
    }
    if (name.includes("유기농")) {
      return "원료_유기농";
    }
    return "원료_액상";
  }

  // 2. 부자재 (부) 접두사 또는 부자재 키워드)
  if (name.startsWith("부)") || name.includes("부자재")) {
    if (name.includes("카톤")) return "부자재_카톤박스";
    if (name.includes("단상자") || name.includes("상자") || name.includes("박스")) return "부자재_단상자";
    if (name.includes("병") || name.includes("유리병")) return "부자재_유리병";
    return "부자재_파우치";
  }

  // 3. 반제품 (반) 접두사 또는 반제품 키워드)
  if (name.startsWith("반)") || name.includes("반제품")) {
    if (name.includes("젤리")) return "반제품_젤리";
    return "반제품_액상";
  }

  // 4. 완제품 접두사 (완) 또는 기본)
  if (name.startsWith("완)") || name.includes("완제품")) {
    return "완제품_기본";
  }

  // 5. 접두사 누락 시 품목명 키워드 정밀 자동 추론
  if (name.includes("농축액") || name.includes("추출액") || name.includes("원액") || name.includes("액상")) {
    return "원료_액상";
  }
  if (name.includes("파우더") || name.includes("분말")) {
    return "원료_분말";
  }
  if (name.includes("파우치") || name.includes("스틱")) {
    return "부자재_파우치";
  }
  if (name.includes("단상자") || name.includes("카톤")) {
    return "부자재_단상자";
  }

  return "완제품_기본";
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const productName = body.productName || "";
    const lotNo = body.lotNo || body.lotNumber || body.lot_no || "";
    const testDate = body.testDate || body.makeDate || "";
    const mfgDate = body.mfgDate || body.makeDate || "";
    const expiryDate = body.expiryDate || "";
    const qty = body.qty || body.quantity || "";
    const mfgNo = body.mfgNo || "";
    const templateKeyInput = body.templateKey || "";
    const spec = body.spec || "";

    let docType = body.docType || "";
    const templateName = body.templateName || "";

    if (!docType && templateName) {
      if (templateName.includes('log')) docType = 'log';
      else if (templateName.includes('instruction')) docType = 'instruction';
      else if (templateName.includes('report')) docType = 'report';
      else if (templateName.includes('label')) docType = 'label';
      else if (templateName.includes('request')) docType = 'request';
    }
    if (!docType) docType = 'log';

    // 파일 포맷 결정 (docx / hwpx / hwp)
    const reqFormat = (body.format || body.fileFormat || 'docx').toLowerCase();
    const fileExt = reqFormat === 'hwp' ? 'hwp' : reqFormat === 'hwpx' ? 'hwpx' : 'docx';

    const contentTypeMap: Record<string, string> = {
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      hwpx: 'application/vnd.hancom.hwpx',
      hwp: 'application/x-hwp'
    };
    const mimeType = contentTypeMap[fileExt] || contentTypeMap['docx'];

    // 품목명 접두사 (원), 부), 반), 완)) 기반 자동 템플릿 키 추론
    const finalTemplateKey = resolveTemplateKey(productName, templateKeyInput);
    const outputName = DOC_NAME_MAP[docType] || '문서';

    let content: Buffer | null = null;

    // 1) 포맷별 전용 양식 파일 우선 탐색 (예: qc_raw_liquid_log.hwpx)
    const prefix = TEMPLATE_PREFIX_MAP[finalTemplateKey] || 'qc_product_default';
    const exactFileNameWithFormat = `${prefix}_${docType}.${fileExt}`;
    content = readTemplateFile(exactFileNameWithFormat);

    // 2) 일반 .docx 템플릿 탐색
    if (!content) {
      const exactFileName = `${prefix}_${docType}.docx`; 
      content = readTemplateFile(exactFileName);
    }

    // 3) templateName이 명시된 경우 2차 로딩 탐색
    if (!content && templateName) {
      const fileNameWithExt = templateName.endsWith(`.${fileExt}`) || templateName.endsWith('.docx') 
        ? templateName 
        : `${templateName}.${fileExt}`;
      content = readTemplateFile(fileNameWithExt);
    }

    // 4) Fallback 공통 양식 탐색
    if (!content) {
      console.warn(`[알림] 전용 양식이 없어 공통 양식으로 대체합니다.`);
      const fallbackFileName = `qc_${docType}.${fileExt}`; 
      content = readTemplateFile(fallbackFileName);

      if (!content) {
        const fallbackDocxName = `qc_${docType}.docx`;
        content = readTemplateFile(fallbackDocxName);
      }

      if (!content) {
        const defaultProductFileName = `qc_product_default_${docType}.docx`;
        content = readTemplateFile(defaultProductFileName);
      }

      if (!content) {
        return NextResponse.json({ error: `템플릿 파일이 없습니다: ${prefix}_${docType}.${fileExt}` }, { status: 404 });
      }
    }

    const zip = new PizZip(content);
    const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });

    // 💡 날짜 연산 로직 완벽 분리
    const formatDate = (date: Date) => {
      return date.toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).replace(/\. /g, '-').replace('.', ''); // "YYYY-MM-DD" 형태로 세탁
    };

    // 1. 진짜 '오늘' (서류를 뽑는 당일)
    const realToday = new Date();
    const todayStr = formatDate(realToday); 

    // 2. 완료예정일 (진짜 오늘로부터 정확히 3일 뒤)
    const futureDate = new Date(realToday);
    futureDate.setDate(realToday.getDate() + 3);
    const dueDateStr = formatDate(futureDate); 

    // [이름 세탁 및 대괄호 규격 분리기]
    let cleanProductName = (productName || '').replace(/^[원부자반]\)\s*/, '');
    const specMatch = cleanProductName.match(/\[(.*?)\]/);
    const extractedSpec = specMatch ? specMatch[1] : (spec || "별도표기");
    cleanProductName = cleanProductName.replace(/\s*\[.*?\]\s*/g, '').trim();

    // [유기농 감별 및 시험번호 생성기]
    const isOrganic = cleanProductName.includes('유기농');
    const testNo = isOrganic ? `${lotNo}u` : lotNo;

    // 데이터 주입
    doc.render({
      제품명: cleanProductName, 
      품명: cleanProductName,       
      LOT번호: lotNo,         
      시험번호: testNo,       
      
      // 💡 지정된 제조일자는 그대로 두고, 나머지는 '진짜 오늘' 기준으로 주입!
      시험일자: testDate || todayStr,
      제조일자: mfgDate || "",
      수량: qty,
      제조수량: qty,                
      오늘날짜: todayStr,      
      유통기한: expiryDate || "",  
      소비기한: expiryDate || "",    
      규격: extractedSpec,
      제조번호: mfgNo || "",         

      접수일자: todayStr,          // 무조건 오늘
      검체채취일자: todayStr,      // 무조건 오늘
      완료예정일: dueDateStr       // 무조건 오늘 + 3일
    });

    const buf = doc.getZip().generate({ type: 'nodebuffer' });
    
    const encodedFileName = encodeURIComponent(`${outputName}_${testNo}.${fileExt}`);

    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        'Content-Disposition': `attachment; filename*=UTF-8''${encodedFileName}`,
        'Content-Type': mimeType,
      },
    });

  } catch (error) {
    console.error('서류 생성 에러:', error);
    return NextResponse.json({ error: '서류 파일 생성에 실패했습니다.' }, { status: 500 });
  }
}
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
  "반제품_기본": "qc_semi_liquid",
  "완제품_기본": "qc_product_default"
};

const DOC_NAME_MAP: Record<string, string> = {
  log: '시험일지',
  instruction: '시험지시_및_기록서',
  report: '시험결과보고서',
  label: '품질관리표시서',
  request: '시험의뢰서' 
};

// 헬퍼 함수: 로컬 파일시스템 3개 경로 탐색 + Vercel CDN HTTP Fetch 최후 보루 Fallback
async function getTemplateBuffer(fileName: string, reqUrl: string): Promise<Buffer | null> {
  const possibleDirs = [
    path.resolve(process.cwd(), 'public', 'templates'),
    path.resolve(process.cwd(), 'src', 'templates'),
    path.resolve(process.cwd(), 'templates'),
  ];

  // 1. 디스크 파일시스템 우선 탐색
  for (const dir of possibleDirs) {
    const fullPath = path.join(dir, fileName);
    if (fs.existsSync(fullPath)) {
      try {
        return fs.readFileSync(fullPath);
      } catch (e) {}
    }
  }

  // 2. Vercel Serverless 정적 자원 HTTP Fetch 2차 보루
  try {
    const origin = new URL(reqUrl).origin;
    const fetchUrl = `${origin}/templates/${fileName}`;
    const res = await fetch(fetchUrl);
    if (res.ok) {
      const arrayBuffer = await res.arrayBuffer();
      return Buffer.from(arrayBuffer);
    }
  } catch (e) {
    console.warn(`[HTTP Fetch Fallback Error] ${fileName}:`, e);
  }

  return null;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const productName = body.productName || body.itemName || "미지정제품";
    const lotNo = body.lotNo || body.lotNumber || body.lot_no || "LOT-0000";
    const testDate = body.testDate || body.makeDate || "";
    const mfgDate = body.mfgDate || body.makeDate || "";
    const expiryDate = body.expiryDate || "";
    const qty = body.qty || body.quantity || "1";
    const mfgNo = body.mfgNo || "";
    const spec = body.spec || "";

    // docType 파싱 (docType 직접 전달 or templateName에서 extraction)
    let docType = body.docType || "";
    const templateNameParam = body.templateName || body.templateKey || "";

    if (!docType && templateNameParam) {
      if (templateNameParam.includes('log')) docType = 'log';
      else if (templateNameParam.includes('instruction')) docType = 'instruction';
      else if (templateNameParam.includes('report')) docType = 'report';
      else if (templateNameParam.includes('label')) docType = 'label';
      else if (templateNameParam.includes('request')) docType = 'request';
    }
    if (!docType) docType = 'log';

    // 템플릿 파일 버퍼 탐색
    let fileBuffer: Buffer | null = null;
    let loadedFileName = "";

    // 1) templateNameParam 직접 지정 파일 탐색
    if (templateNameParam) {
      const fileNameWithExt = templateNameParam.endsWith('.docx') ? templateNameParam : `${templateNameParam}.docx`;
      fileBuffer = await getTemplateBuffer(fileNameWithExt, req.url);
      if (fileBuffer) loadedFileName = fileNameWithExt;
    }

    // 2) docType & prefix 기준 탐색
    if (!fileBuffer) {
      if (docType === 'label') {
        fileBuffer = await getTemplateBuffer('qc_label.docx', req.url);
        if (fileBuffer) loadedFileName = 'qc_label.docx';
      } else {
        let finalTemplateKey = body.templateKey || "";
        if (!finalTemplateKey) {
          if (productName.includes('파우더') || productName.includes('분말')) {
            finalTemplateKey = "원료_분말";
          } else if (productName.includes('원료')) {
            finalTemplateKey = "원료_액상";
          } else if (productName.includes('부자재')) {
            if (productName.includes('카톤')) finalTemplateKey = "부자재_카톤박스";
            else if (productName.includes('단상자')) finalTemplateKey = "부자재_단상자";
            else finalTemplateKey = "부자재_파우치";
          } else if (productName.includes('반제품')) {
            finalTemplateKey = "반제품_액상";
          } else {
            finalTemplateKey = "완제품_기본";
          }
        }

        const prefix = TEMPLATE_PREFIX_MAP[finalTemplateKey] || 'qc_product_default';
        const exactFileName = `${prefix}_${docType}.docx`;
        fileBuffer = await getTemplateBuffer(exactFileName, req.url);
        if (fileBuffer) loadedFileName = exactFileName;

        // Fallback 1: qc_product_default_${docType}.docx
        if (!fileBuffer) {
          const defaultFileName = `qc_product_default_${docType}.docx`;
          fileBuffer = await getTemplateBuffer(defaultFileName, req.url);
          if (fileBuffer) loadedFileName = defaultFileName;
        }

        // Fallback 2: qc_${docType}.docx
        if (!fileBuffer) {
          const commonFileName = `qc_${docType}.docx`;
          fileBuffer = await getTemplateBuffer(commonFileName, req.url);
          if (fileBuffer) loadedFileName = commonFileName;
        }
      }
    }

    if (!fileBuffer) {
      console.error(`[오류] 서류 템플릿 로딩 실패 (docType=${docType}, templateName=${templateNameParam})`);
      return NextResponse.json({ error: `서버에서 요청하신 품질서류 템플릿 파일(${docType})을 찾을 수 없습니다.` }, { status: 404 });
    }

    const zip = new PizZip(fileBuffer);
    const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });

    // 날짜 포맷터
    const formatDate = (date: Date) => {
      return date.toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).replace(/\. /g, '-').replace('.', '');
    };

    const realToday = new Date();
    const todayStr = formatDate(realToday);
    const futureDate = new Date(realToday);
    futureDate.setDate(realToday.getDate() + 3);
    const dueDateStr = formatDate(futureDate);

    let cleanProductName = productName.replace(/^[원부자반]\)\s*/, '');
    const specMatch = cleanProductName.match(/\[(.*?)\]/);
    const extractedSpec = specMatch ? specMatch[1] : (spec || "별도표기");
    cleanProductName = cleanProductName.replace(/\s*\[.*?\]\s*/g, '').trim();

    const isOrganic = cleanProductName.includes('유기농');
    const testNo = isOrganic ? `${lotNo}u` : lotNo;

    doc.render({
      제품명: cleanProductName,
      품명: cleanProductName,
      LOT번호: lotNo,
      시험번호: testNo,
      시험일자: testDate || todayStr,
      제조일자: mfgDate || todayStr,
      수량: qty,
      제조수량: qty,
      오늘날짜: todayStr,
      유통기한: expiryDate || "",
      소비기한: expiryDate || "",
      규격: extractedSpec,
      제조번호: mfgNo || lotNo,
      접수일자: todayStr,
      검체채취일자: todayStr,
      완료예정일: dueDateStr
    });

    const buf = doc.getZip().generate({ type: 'nodebuffer' });
    const outputName = DOC_NAME_MAP[docType] || '품질서류';
    const encodedFileName = encodeURIComponent(`${outputName}_${testNo}.docx`);

    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        'Content-Disposition': `attachment; filename*=UTF-8''${encodedFileName}`,
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      },
    });

  } catch (error: any) {
    console.error('워드 생성 에러:', error);
    return NextResponse.json({ error: error?.message || '워드 파일 생성에 실패했습니다.' }, { status: 500 });
  }
}
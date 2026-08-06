import { NextResponse } from 'next/server';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import qcTemplateConfig from '@/config/qcTemplateMap.json';

// HWP 바이너리 파일 내 {제품명}, {LOT번호} 치환자 치환 헬퍼 (UTF-16LE + zlib 바이트 정밀 치환)
function replaceHwpPlaceholders(buffer: Buffer, renderData: Record<string, any>): Buffer {
  let result = Buffer.from(buffer);

  // 1. 비압축 스트림 내 UTF-16LE 치환자 정밀 대체
  for (const [key, val] of Object.entries(renderData)) {
    const valStr = String(val ?? '');
    const patterns = [`{{${key}}}`, `{${key}}`];

    for (const p of patterns) {
      const pBuf = Buffer.from(p, 'utf16le');
      let searchIdx = 0;
      while ((searchIdx = result.indexOf(pBuf, searchIdx)) !== -1) {
        const targetLen = pBuf.length;
        let vBuf = Buffer.from(valStr, 'utf16le');
        if (vBuf.length > targetLen) {
          vBuf = vBuf.subarray(0, targetLen);
        } else if (vBuf.length < targetLen) {
          const diff = targetLen - vBuf.length;
          const padBuf = Buffer.from(' '.repeat(Math.floor(diff / 2)), 'utf16le');
          vBuf = Buffer.concat([vBuf, padBuf]);
        }
        vBuf.copy(result, searchIdx);
        searchIdx += pBuf.length;
      }
    }
  }

  // 2. HWP 5.0 zlib 압축 스트림(BodyText/Section) 내 정밀 바이트 치환
  for (let i = 0; i < result.length - 10; i++) {
    try {
      const slice = result.subarray(i);
      const inflated = zlib.inflateRawSync(slice);
      let inflatedBuf = Buffer.from(inflated);
      let modified = false;

      for (const [key, val] of Object.entries(renderData)) {
        const valStr = String(val ?? '');
        const patterns = [`{{${key}}}`, `{${key}}`];

        for (const p of patterns) {
          const pBuf = Buffer.from(p, 'utf16le');
          let sIdx = 0;
          while ((sIdx = inflatedBuf.indexOf(pBuf, sIdx)) !== -1) {
            const targetLen = pBuf.length;
            let vBuf = Buffer.from(valStr, 'utf16le');
            if (vBuf.length > targetLen) {
              vBuf = vBuf.subarray(0, targetLen);
            } else if (vBuf.length < targetLen) {
              const diff = targetLen - vBuf.length;
              const padBuf = Buffer.from(' '.repeat(Math.floor(diff / 2)), 'utf16le');
              vBuf = Buffer.concat([vBuf, padBuf]);
            }
            vBuf.copy(inflatedBuf, sIdx);
            sIdx += pBuf.length;
            modified = true;
          }
        }
      }

      if (modified) {
        const deflated = zlib.deflateRawSync(inflatedBuf);
        if (deflated.length <= slice.length) {
          deflated.copy(result, i);
        }
      }
    } catch (e) {}
  }

  return result;
}

// 1. 독립 설정 파일(src/config/qcTemplateMap.json)에서 템플릿 매핑 사전 로드
const ITEM_MAPPING: Record<string, string> = (qcTemplateConfig as any).itemMapping || {};
const TEMPLATE_PREFIX_MAP: Record<string, string> = qcTemplateConfig.prefixMap;
const DOC_NAME_MAP: Record<string, string> = qcTemplateConfig.docNameMap;

const CATEGORY_SUBDIRS = ['01_raw', '02_sub', '03_semi', '04_product', '00_common'];

// 템플릿 버퍼 읽기 헬퍼 (카테고리 서브 디렉토리 01_raw, 02_sub 등 재귀 탐색)
function readTemplateFile(fileName: string): Buffer | null {
  const rootDirs = [
    path.resolve(process.cwd(), 'public', 'templates'),
    path.resolve(process.cwd(), 'src', 'templates'),
    path.resolve(process.cwd(), 'templates'),
  ];

  for (const rootDir of rootDirs) {
    // 1) 서브 디렉토리 (01_raw, 02_sub, 03_semi, 04_product, 00_common) 탐색
    for (const sub of CATEGORY_SUBDIRS) {
      const subPath = path.join(rootDir, sub, fileName);
      if (fs.existsSync(subPath)) {
        try {
          return fs.readFileSync(subPath);
        } catch (e) {}
      }
    }

    // 2) 루트 디렉토리 직하 파일 탐색
    const directPath = path.join(rootDir, fileName);
    if (fs.existsSync(directPath)) {
      try {
        return fs.readFileSync(directPath);
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
  const cleanName = name.replace(/^[원부자반완]\)\s*/, '').replace(/\s*\[.*?\]\s*/g, '').trim();

  // 1순위: 개별 품목명 맞춤 매핑 (itemMapping) 사전에 등록된 품목인지 검사 (최우선)
  for (const [customItemName, categoryKey] of Object.entries(ITEM_MAPPING)) {
    if (cleanName.includes(customItemName) || name.includes(customItemName)) {
      if (TEMPLATE_PREFIX_MAP[categoryKey]) {
        return categoryKey;
      }
    }
  }

  // 2순위: 원료 (원) 접두사 또는 원료 키워드)
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

    // 파일 포맷 결정 (기본값: 'hwpx' - 한글 서식 우선)
    const reqFormat = (body.format || body.fileFormat || 'hwpx').toLowerCase();
    let fileExt = reqFormat === 'docx' ? 'docx' : reqFormat === 'hwp' ? 'hwp' : 'hwpx';

    const contentTypeMap: Record<string, string> = {
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      hwpx: 'application/vnd.hancom.hwpx',
      hwp: 'application/x-hwp'
    };

    // 품목명 접두사 (원), 부), 반), 완)) 기반 자동 템플릿 키 추론
    const finalTemplateKey = resolveTemplateKey(productName, templateKeyInput);
    const outputName = DOC_NAME_MAP[docType] || '문서';

    let content: Buffer | null = null;
    const prefix = TEMPLATE_PREFIX_MAP[finalTemplateKey] || 'qc_product_default';

    // 1) .hwp 또는 .hwpx 전용 한글 템플릿 탐색 (최우선)
    content = readTemplateFile(`${prefix}_${docType}.${fileExt}`);
    
    if (!content && fileExt !== 'hwp') {
      content = readTemplateFile(`${prefix}_${docType}.hwp`);
      if (content) fileExt = 'hwp';
    }
    if (!content && fileExt !== 'hwpx') {
      content = readTemplateFile(`${prefix}_${docType}.hwpx`);
      if (content) fileExt = 'hwpx';
    }

    // 2) 일반 .docx 템플릿 탐색 (3차 순위)
    if (!content) {
      const exactFileName = `${prefix}_${docType}.docx`; 
      content = readTemplateFile(exactFileName);
      if (content) fileExt = 'docx';
    }

    // 3) templateName이 명시된 경우 2차 로딩 탐색
    if (!content && templateName) {
      const fileNameWithExt = templateName.endsWith(`.${fileExt}`) || templateName.endsWith('.hwp') || templateName.endsWith('.docx')
        ? templateName 
        : `${templateName}.${fileExt}`;
      content = readTemplateFile(fileNameWithExt);
    }

    // 4) Fallback 공통 양식 탐색
    if (!content) {
      console.warn(`[알림] 전용 양식이 없어 공통 양식으로 대체합니다.`);
      content = readTemplateFile(`qc_${docType}.${fileExt}`) || readTemplateFile(`qc_${docType}.hwp`) || readTemplateFile(`qc_${docType}.docx`);

      if (!content) {
        content = readTemplateFile(`qc_product_default_${docType}.${fileExt}`) || readTemplateFile(`qc_product_default_${docType}.hwp`) || readTemplateFile(`qc_product_default_${docType}.docx`);
      }

      if (!content) {
        return NextResponse.json({ error: `템플릿 파일이 없습니다: ${prefix}_${docType}` }, { status: 404 });
      }
    }

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
    let cleanProductName = (productName || '').replace(/^[원부자반완]\)\s*/, '');
    const specMatch = cleanProductName.match(/\[(.*?)\]/);
    const extractedSpec = specMatch ? specMatch[1] : (spec || "별도표기");
    cleanProductName = cleanProductName.replace(/\s*\[.*?\]\s*/g, '').trim();

    // [유기농 감별 및 시험번호 생성기]
    const isOrganic = cleanProductName.includes('유기농');
    const testNo = isOrganic ? `${lotNo}u` : lotNo;

    const renderData = {
      제품명: cleanProductName, 
      품명: cleanProductName,       
      LOT번호: lotNo,         
      시험번호: testNo,       
      시험일자: testDate || todayStr,
      제조일자: mfgDate || "",
      수량: qty,
      제조수량: qty,                
      오늘날짜: todayStr,      
      유통기한: expiryDate || "",  
      소비기한: expiryDate || "",    
      규격: extractedSpec,
      제조번호: mfgNo || "",         
      접수일자: todayStr,
      검체채취일자: todayStr,
      완료예정일: dueDateStr
    };

    let buf: Buffer;

    // docx 또는 hwpx 포맷인 경우 docxtemplater 렌더링 시도
    if (fileExt === 'docx' || fileExt === 'hwpx') {
      try {
        const zip = new PizZip(content);
        const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
        doc.render(renderData);
        buf = doc.getZip().generate({ type: 'nodebuffer' });
      } catch (e) {
        buf = replaceHwpPlaceholders(content, renderData);
      }
    } else {
      // HWP 바이너리 양식 파일인 경우 HWP 바이너리 스트림 렌더링 실행
      buf = replaceHwpPlaceholders(content, renderData);
    }
    
    const mimeType = contentTypeMap[fileExt] || contentTypeMap['hwp'];
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
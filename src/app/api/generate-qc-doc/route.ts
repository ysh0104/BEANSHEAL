import { NextResponse } from 'next/server';
import PizZip from 'pizzip';
import fs from 'fs';
import path from 'path';
import qcTemplateConfig from '@/config/qcTemplateMap.json';

// 1. 독립 설정 파일(src/config/qcTemplateMap.json)에서 템플릿 매핑 사전 로드
const ITEM_MAPPING: Record<string, string> = (qcTemplateConfig as any).itemMapping || {};
const TEMPLATE_PREFIX_MAP: Record<string, string> = qcTemplateConfig.prefixMap;
const DOC_NAME_MAP: Record<string, string> = qcTemplateConfig.docNameMap;

const CATEGORY_SUBDIRS = ['01_raw', '02_sub', '03_semi', '04_product', '00_common'];

// 템플릿 버퍼 읽기 헬퍼 (카테고리 서브 디렉토리 01_raw, 02_sub 등 재귀 탐색)
function readTemplateFile(fileName: string): Buffer | null {
  const rootDirs = [
    path.resolve(process.cwd(), 'templates'),
    path.resolve(process.cwd(), 'public', 'templates'),
    path.resolve(process.cwd(), 'src', 'templates'),
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

// 품목명 및 접두사(원), 부), 반), 완), [원료], [부자재] 등) 기준 템플릿 키 자동 분류 함수
function resolveTemplateKey(productName: string, templateKey?: string): string {
  if (templateKey && TEMPLATE_PREFIX_MAP[templateKey]) {
    return templateKey;
  }

  const name = productName || "";
  const cleanName = name
    .replace(/^[원부자반완]\)\s*/, '')
    .replace(/^\[(원료|부자재|반제품|완제품|원|부|반|완)\]\s*/, '')
    .replace(/^(원료|부자재|반제품|완제품)_\s*/, '')
    .replace(/\s*\[.*?\]\s*/g, '')
    .trim();

  // 1순위: 개별 품목명 맞춤 매핑 (itemMapping) 사전에 등록된 품목인지 검사 (최우선)
  for (const [customItemName, categoryKey] of Object.entries(ITEM_MAPPING)) {
    if (cleanName.includes(customItemName) || name.includes(customItemName)) {
      if (TEMPLATE_PREFIX_MAP[categoryKey]) {
        return categoryKey;
      }
    }
  }

  // 2순위: 원료 분류 (원), [원료], [원], 원료_ 또는 원료 키워드)
  if (name.startsWith("원)") || name.startsWith("[원료]") || name.startsWith("[원]") || name.startsWith("원료_") || name.includes("원료")) {
    if (name.includes("시녹스") || name.includes("주정") || name.includes("알콜") || name.includes("소독")) {
      return "원료_시녹스마일드";
    }
    if (name.includes("농축액") || name.includes("추출액") || name.includes("원액") || name.includes("액상") || name.includes("오일") || name.includes("시럽") || name.includes("액")) {
      return "원료_액상";
    }
    return "원료_분말"; // 원료의 기본형은 분말
  }

  // 3순위: 부자재 분류 (부), [부자재], [부], 부자재_ 또는 부자재 키워드)
  if (name.startsWith("부)") || name.startsWith("[부자재]") || name.startsWith("[부]") || name.startsWith("부자재_") || name.includes("부자재")) {
    if (name.includes("시녹스") || name.includes("주정") || name.includes("알콜") || name.includes("소독")) {
      return "부자재_시녹스마일드";
    }
    if (name.includes("카톤") || name.includes("외상자")) return "부자재_카톤박스";
    if (name.includes("단상자") || name.includes("상자") || name.includes("박스")) return "부자재_단상자";
    if (name.includes("병") || name.includes("유리병")) return "부자재_유리병";
    return "부자재_파우치";
  }

  // 4순위: 반제품 분류 (반), [반제품], [반], 반제품_ 또는 반제품 키워드)
  if (name.startsWith("반)") || name.startsWith("[반제품]") || name.startsWith("[반]") || name.startsWith("반제품_") || name.includes("반제품")) {
    if (name.includes("젤리")) return "반제품_젤리";
    return "반제품_액상";
  }

  // 5순위: 완제품 분류 (완), [완제품], [완], 완제품_ 또는 완제품 키워드)
  if (name.startsWith("완)") || name.startsWith("[완제품]") || name.startsWith("[완]") || name.startsWith("완제품_") || name.includes("완제품")) {
    return "완제품_기본";
  }

  // 6순위: 접두사 누락 시 품목명 키워드 정밀 자동 추론
  if (name.includes("농축액") || name.includes("추출액") || name.includes("원액") || name.includes("액상")) {
    return "원료_액상";
  }
  if (name.includes("파우더") || name.includes("분말") || name.includes("비타민") || name.includes("가르시니아") || name.includes("타우린")) {
    return "원료_분말";
  }
  if (name.includes("카톤") || name.includes("외상자")) {
    return "부자재_카톤박스";
  }
  if (name.includes("단상자") || name.includes("상자")) {
    return "부자재_단상자";
  }
  if (name.includes("파우치") || name.includes("스틱")) {
    return "부자재_파우치";
  }
  if (name.includes("시녹스") || name.includes("소독") || name.includes("주정")) {
    return "부자재_시녹스마일드";
  }

  return "완제품_기본";
}

/**
 * 범용 XML 텍스트 치환 헬퍼 (태그 분리 및 단일/이중 중괄호 {key}, {{key}} 완벽 대응)
 */
function replaceXmlPlaceholders(xmlText: string, data: Record<string, any>): { xmlText: string; modified: boolean } {
  let modified = false;
  const newXmlText = xmlText.replace(/\{+([\s\S]*?)\}+/g, (match, content) => {
    // XML 태그 및 중괄호 제거하여 순수 키 추출
    const cleanKey = content.replace(/<[^>]+>/g, '').replace(/[\{\}]/g, '').trim();
    if (Object.prototype.hasOwnProperty.call(data, cleanKey)) {
      modified = true;
      return String(data[cleanKey] ?? '');
    }
    return match;
  });
  return { xmlText: newXmlText, modified };
}

/**
 * HWPX 및 DOCX 템플릿 내의 모든 XML 파일에 대해 치환 수행
 */
function renderZipTemplate(content: Buffer, renderData: Record<string, any>): Buffer {
  const zip = new PizZip(content);
  
  for (const fileName of Object.keys(zip.files)) {
    if (fileName.endsWith('.xml')) {
      const file = zip.file(fileName);
      if (!file) continue;

      let xmlText = file.asText();
      const { xmlText: newXmlText, modified } = replaceXmlPlaceholders(xmlText, renderData);

      if (modified) {
        zip.file(fileName, newXmlText);
      }
    }
  }

  return zip.generate({ type: 'nodebuffer' });
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
    const unitQty = String(body.unitQty || body.labelQty || "").trim();
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

    // 파일 포맷 결정 (.hwpx 및 .docx 지원)
    const reqFormat = (body.format || body.fileFormat || 'hwpx').toLowerCase();
    const fileExt = reqFormat === 'docx' ? 'docx' : 'hwpx';

    const contentTypeMap: Record<string, string> = {
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      hwpx: 'application/vnd.hancom.hwpx'
    };

    // 품목명 접두사 (원), 부), 반), 완)) 기반 자동 템플릿 키 추론
    const finalTemplateKey = resolveTemplateKey(productName, templateKeyInput);
    const outputName = DOC_NAME_MAP[docType] || '문서';

    let content: Buffer | null = null;
    const prefix = TEMPLATE_PREFIX_MAP[finalTemplateKey] || 'qc_product_default';
    
    // 탐색 확장자 순서 (.hwpx 우선, docx 순)
    const searchExtensions: string[] = fileExt === 'hwpx' ? ['.hwpx', '.docx'] : ['.docx', '.hwpx'];

    // 1) 품목/카테고리 전용 양식 탐색
    for (const ext of searchExtensions) {
      content = readTemplateFile(`${prefix}_${docType}${ext}`);
      if (content) break;
    }

    // 2) templateName이 명시된 경우 2차 로딩 탐색
    if (!content && templateName) {
      const fileNameWithExt = templateName.endsWith('.docx') || templateName.endsWith('.hwpx')
        ? templateName 
        : `${templateName}.${fileExt}`;
      content = readTemplateFile(fileNameWithExt);
    }

    // 3) Fallback 공통 양식 탐색
    if (!content) {
      console.warn(`[알림] 전용 양식이 없어 공통 양식(${docType})으로 대체합니다.`);
      for (const ext of searchExtensions) {
        content = readTemplateFile(`qc_${docType}${ext}`) || readTemplateFile(`qc_product_default_${docType}${ext}`);
        if (content) break;
      }

      if (!content) {
        return NextResponse.json({ error: `템플릿 파일이 없습니다: ${prefix}_${docType}` }, { status: 404 });
      }
    }

    // 💡 날짜 연산 로직 분리
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

    // 날짜 형태 정제 헬퍼 (20260724 -> 2026-07-24, ISO -> 2026-07-24)
    const cleanDateStr = (rawDate: string) => {
      if (!rawDate) return "";
      const cleaned = rawDate.replace(/[^0-9]/g, '');
      if (cleaned.length === 8) {
        return `${cleaned.slice(0, 4)}-${cleaned.slice(4, 6)}-${cleaned.slice(6, 8)}`;
      }
      return rawDate.split('T')[0];
    };

    // LOT 번호 내 날짜 추출 헬퍼 (예: 260413Q1 -> 2026-04-13)
    const extractDateFromLot = (rawLot: string) => {
      if (!rawLot) return "";
      const match = String(rawLot).match(/(20[2-3]\d(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])|[2-3]\d(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01]))/);
      if (!match) return "";
      const d = match[1].length === 6 ? `20${match[1]}` : match[1];
      return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
    };

    // [유기농 감별 및 시험번호 생성기]
    const isOrganic = cleanProductName.includes('유기농');
    const testNo = isOrganic ? `${lotNo}u` : lotNo;

    const lotDateStr = extractDateFromLot(lotNo);
    const finalMfgDate = cleanDateStr(mfgDate) || lotDateStr || cleanDateStr(testDate) || todayStr;
    const finalTestDate = cleanDateStr(testDate) || lotDateStr || todayStr;
    const isNoExpiryPackaging = finalTemplateKey.startsWith('부자재_') || /^[부자]\)|^\[(부자재|부)\]/.test(productName.trim()) || /단상자|카톤|외상자|박스|상자|파우치|스틱|필름|비닐/.test(productName);
    const qtyUnit = isNoExpiryPackaging ? 'EA' : 'kg';
    const formatQtyWithUnit = (val: any) => {
      if (val === undefined || val === null || String(val).trim() === '') return '';
      if (typeof val === 'number') return `${val.toLocaleString()} ${qtyUnit}`;
      const s = String(val).trim();
      const numOnly = s.replace(/,/g, '');
      if (/^\d+(\.\d+)?$/.test(numOnly)) return `${Number(numOnly).toLocaleString()} ${qtyUnit}`;
      return isNoExpiryPackaging ? s.replace(/kg$/i, 'EA') : s;
    };
    const finalQty = formatQtyWithUnit(qty) || "별도표기";

    // 품질관리표시서(label) 전용 단위 포장수량 계산 (예: 총 입고량 75kg여도 단위규격 25kg 적용)
    const formattedUnitQty = unitQty
      ? formatQtyWithUnit(unitQty)
      : (extractedSpec && extractedSpec !== "별도표기" ? extractedSpec : finalQty);

    const docQty = docType === 'label' ? formattedUnitQty : finalQty;
    const finalSpec = formattedUnitQty && formattedUnitQty !== finalQty ? formattedUnitQty : extractedSpec;
    const finalExpiry = isNoExpiryPackaging ? "" : (expiryDate || "제조일로부터 24개월");

    const renderData = {
      제품명: cleanProductName, 
      품명: cleanProductName,       
      LOT번호: lotNo,         
      시험번호: testNo,       
      시험일자: finalTestDate,
      제조일자: finalMfgDate,
      수량: docQty,
      제조수량: finalQty,                
      오늘날짜: todayStr,      
      유통기한: finalExpiry,  
      소비기한: finalExpiry,    
      규격: finalSpec,
      제조번호: mfgNo || lotNo,         
      접수일자: finalTestDate,
      검체채취일자: finalTestDate,
      완료예정일: dueDateStr
    };

    const buf = renderZipTemplate(content, renderData);

    const mimeType = contentTypeMap[fileExt] || contentTypeMap['hwpx'];
    const safeAsciiFileName = `QC_${docType}_${testNo}.${fileExt}`;
    const encodedFileName = encodeURIComponent(`${outputName}_${testNo}.${fileExt}`);

    const responseArray = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);

    return new NextResponse(responseArray as any, {
      status: 200,
      headers: {
        'Content-Disposition': `attachment; filename="${safeAsciiFileName}"; filename*=UTF-8''${encodedFileName}`,
        'Content-Type': mimeType,
      },
    });

  } catch (error) {
    console.error('서류 생성 에러:', error);
    return NextResponse.json({ error: '서류 파일 생성에 실패했습니다.' }, { status: 500 });
  }
}
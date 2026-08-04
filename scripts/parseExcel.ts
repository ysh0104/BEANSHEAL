import * as xlsx from 'xlsx';
import * as path from 'path';
import * as fs from 'fs';

export function parseEcountExcel() {
  console.log("엑셀 데이터 추출을 시작합니다...");

  const filePath = path.join(process.cwd(), 'downloads', 'ecount_inventory.xlsx');

  if (!fs.existsSync(filePath)) {
    console.error("오류: 다운로드된 엑셀 파일이 없습니다. 봇을 먼저 실행해주세요.");
    return;
  }

  const workbook = xlsx.readFile(filePath);
  const sheetName = workbook.SheetNames[0]; 
  const sheet = workbook.Sheets[sheetName];

  const rawData = xlsx.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: "" });

  let headerRowIndex = -1;
  for (let i = 0; i < Math.min(20, rawData.length); i++) {
    const row = rawData[i];
    if (row.some(cell => String(cell).includes('품목명') || String(cell).includes('시리얼/로트'))) {
      headerRowIndex = i;
      break;
    }
  }

  if (headerRowIndex === -1) {
    console.error("오류: 엑셀에서 데이터 헤더를 찾을 수 없습니다.");
    return;
  }

  const headers = rawData[headerRowIndex];

  // 4. [수정 포인트 1] '전표구분' 열의 위치를 추가로 찾습니다.
  const colIdx = {
    itemName: headers.findIndex(h => String(h).includes('품목명')),
    lotNo: headers.findIndex(h => String(h).includes('시리얼/로트')),
    quantity: headers.findIndex(h => String(h).includes('수량')),
    expiryDate: headers.findIndex(h => String(h).includes('유효기한') || String(h).includes('소비기한')),
    slipType: headers.findIndex(h => String(h).includes('전표구분')) // 신규 추가
  };

  const extractedDataMap = new Map<string, any>();

  for (let i = headerRowIndex + 1; i < rawData.length; i++) {
    const row = rawData[i];
    
    if (!row[colIdx.itemName]) continue;

    const itemName = String(row[colIdx.itemName]).trim();
    const lotNo = String(row[colIdx.lotNo]).trim();
    const expiryDate = colIdx.expiryDate !== -1 ? String(row[colIdx.expiryDate]).trim() : '';
    
    // [수정 포인트 2] 수량과 전표구분 추출 및 차감 로직
    const rawQuantity = Number(String(row[colIdx.quantity]).replace(/,/g, '')) || 0;
    const slipType = colIdx.slipType !== -1 ? String(row[colIdx.slipType]).trim() : '';

    // 기본적으로 양수로 두되, 전표구분에 '소모', '출고', '판매'가 포함되면 마이너스로 바꿉니다.
    let finalQuantity = rawQuantity;
    if (slipType.includes('소모') || slipType.includes('출고') || slipType.includes('판매')) {
      finalQuantity = -rawQuantity;
    }

    const mapKey = lotNo ? `${itemName}_${lotNo}` : `${itemName}_row_${i}`;

    if (extractedDataMap.has(mapKey)) {
      const existingData = extractedDataMap.get(mapKey);
      // 입고는 더해지고(+), 생산소모는 알아서 빼집니다(-)
      existingData.quantity += finalQuantity; 
    } else {
      extractedDataMap.set(mapKey, {
        itemName,
        lotNo,
        quantity: finalQuantity,
        expiryDate
      });
    }
  }

  const extractedData = Array.from(extractedDataMap.values());

  console.log("\n[데이터 추출 및 병합 완료] 총", extractedData.length, "건의 고유 로트 데이터를 확보했습니다!");
  console.log("--------------------------------------------------");
  console.log(extractedData.slice(0, 5)); 
  if (extractedData.length > 5) console.log("... (이하 생략)");
  console.log("--------------------------------------------------\n");

  return extractedData;
}
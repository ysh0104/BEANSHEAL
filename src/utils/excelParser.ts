// 파일 경로: src/utils/excelParser.ts
import * as XLSX from 'xlsx';

export interface ParsedInventoryData {
  itemName: string;
  lotNo: string;
  quantity: number;
  expiryDate: string;
}

/**
 * 엑셀 소비기한/유효기한 날짜 포맷팅 (시리얼 번호, YYYYMMDD, YYYY/MM/DD 등 자동 변환)
 */
function parseExcelDate(raw: any): string {
  if (!raw) return '';
  const str = String(raw).trim();
  if (!str || str === '-' || str === 'undefined' || str === 'null') return '';

  // 엑셀 날짜 시리얼 번호 (예: 45500 -> 2024-07-28)
  if (!isNaN(Number(str)) && Number(str) > 30000 && Number(str) < 70000) {
    const jsDate = new Date((Number(str) - (25567 + 2)) * 86400 * 1000);
    return jsDate.toISOString().split('T')[0];
  }

  // YYYY/MM/DD, YYYY-MM-DD, YYYY.MM.DD
  const match = str.match(/(\d{4})[\/.\-](\d{1,2})[\/.\-](\d{1,2})/);
  if (match) {
    const y = match[1];
    const m = match[2].padStart(2, '0');
    const d = match[3].padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // YYYYMMDD
  const match2 = str.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (match2) {
    return `${match2[1]}-${match2[2]}-${match2[3]}`;
  }

  return str;
}

export const parseEcountExcel = async (file: File): Promise<ParsedInventoryData[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'array' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];

        // 2차원 배열 형태로 읽어오기
        const rawData = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: "" });

        // 쓰레기 행을 건너뛰고 진짜 헤더 찾기
        let headerRowIndex = -1;
        for (let i = 0; i < Math.min(20, rawData.length); i++) {
          const row = rawData[i];
          if (row.some(cell => /품목명|시리얼|로트번호|LOT/i.test(String(cell)))) {
            headerRowIndex = i;
            break;
          }
        }

        if (headerRowIndex === -1) {
          reject(new Error('엑셀에서 데이터 헤더(품목명, 로트번호 등)를 찾을 수 없습니다.'));
          return;
        }

        const headers = rawData[headerRowIndex];

        // 열 위치 추적 (품목코드/코드는 LOT번호로 오인되지 않도록 제외)
        const colIdx = {
          itemName: headers.findIndex(h => /품목명|품명|PROD_DES|PROD_NM/i.test(String(h).replace(/\s+/g, ""))),
          lotNo: headers.findIndex(h => /시리얼|로트|LOT|SERIAL/i.test(String(h).replace(/\s+/g, ""))),
          quantity: headers.findIndex(h => /수량|재고|QTY|BAL_QTY/i.test(String(h).replace(/\s+/g, ""))),
          expiryDate: headers.findIndex(h => /유효기한|소비기한|유통기한|EXP|EXPIRY/i.test(String(h).replace(/\s+/g, ""))),
          slipType: headers.findIndex(h => /전표구분|구분/i.test(String(h).replace(/\s+/g, "")))
        };

        if (colIdx.itemName === -1) {
          reject(new Error('엑셀에서 품목명 열을 찾을 수 없습니다.'));
          return;
        }

        const extractedDataMap = new Map<string, ParsedInventoryData>();

        for (let i = headerRowIndex + 1; i < rawData.length; i++) {
          const row = rawData[i];
          if (!row || !row[colIdx.itemName]) continue;

          const itemName = String(row[colIdx.itemName]).trim();
          if (itemName === '소계' || itemName === '합계' || itemName === '총계' || itemName.includes('회사명')) {
            continue;
          }

          // LOT번호가 없거나 품목코드가 들어오지 않도록 정밀 검증
          const rawLot = colIdx.lotNo !== -1 && row[colIdx.lotNo] !== undefined ? String(row[colIdx.lotNo]).trim() : '';
          const rawExp = colIdx.expiryDate !== -1 && row[colIdx.expiryDate] !== undefined ? row[colIdx.expiryDate] : '';

          const lotNo = rawLot && rawLot !== 'undefined' && rawLot !== 'null' ? rawLot : '';
          const expiryDate = parseExcelDate(rawExp);

          // 수량 텍스트 변환
          const quantityStr = colIdx.quantity !== -1 ? String(row[colIdx.quantity] || 0).replace(/,/g, '') : '0';
          const rawQuantity = isNaN(Number(quantityStr)) ? 0 : Number(quantityStr);

          // 전표구분에 따른 음수 처리
          const slipType = colIdx.slipType !== -1 && row[colIdx.slipType] !== undefined ? String(row[colIdx.slipType]).trim() : '';
          let finalQuantity = rawQuantity;
          if (slipType.includes('소모') || slipType.includes('출고') || slipType.includes('판매')) {
            finalQuantity = -rawQuantity;
          }

          const mapKey = lotNo ? `${itemName}_${lotNo}` : `${itemName}_row_${i}`;

          if (extractedDataMap.has(mapKey)) {
            const existingData = extractedDataMap.get(mapKey)!;
            existingData.quantity += finalQuantity;
          } else {
            extractedDataMap.set(mapKey, {
              itemName,
              lotNo,
              quantity: finalQuantity,
              expiryDate: expiryDate || '제조일로부터 24개월'
            });
          }
        }

        const extractedData: ParsedInventoryData[] = Array.from(extractedDataMap.values());
        resolve(extractedData);
      } catch (error) {
        reject(new Error('엑셀 파싱 실패: 파일이 손상되었거나 양식이 다릅니다.'));
      }
    };

    reader.onerror = () => {
      reject(new Error('브라우저에서 파일을 읽는 중 오류가 발생했습니다.'));
    };

    reader.readAsArrayBuffer(file);
  });
};
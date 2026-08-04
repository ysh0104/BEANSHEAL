// 파일 경로: src/utils/excelParser.ts
import * as XLSX from 'xlsx';

export interface ParsedInventoryData {
  itemName: string;
  lotNo: string;
  quantity: number;
  expiryDate: string;
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
          if (row.some(cell => String(cell).includes('품목명') || String(cell).includes('시리얼/로트') || String(cell).includes('로트번호'))) {
            headerRowIndex = i;
            break;
          }
        }

        if (headerRowIndex === -1) {
          reject(new Error('엑셀에서 데이터 헤더를 찾을 수 없습니다.'));
          return;
        }

        const headers = rawData[headerRowIndex];

        // 4. [핵심 이식 1] 전표구분 열 위치 추적 추가
        const colIdx = {
          itemName: headers.findIndex(h => String(h).includes('품목명')),
          lotNo: headers.findIndex(h => String(h).includes('시리얼/로트') || String(h).includes('로트번호')),
          quantity: headers.findIndex(h => String(h).includes('수량')),
          expiryDate: headers.findIndex(h => String(h).includes('유효기한') || String(h).includes('소비기한')),
          slipType: headers.findIndex(h => String(h).includes('전표구분')) // 신규 추가
        };

        const extractedDataMap = new Map<string, ParsedInventoryData>();
        
        // 실제 데이터 추출 및 합산
        for (let i = headerRowIndex + 1; i < rawData.length; i++) {
          const row = rawData[i];
          
          if (!row[colIdx.itemName]) continue;

          const itemName = String(row[colIdx.itemName]).trim();
          
          // [핵심 이식 2] 소계, 합계, 총계 행 건너뛰기 방어 로직
          if (itemName === '소계' || itemName === '합계' || itemName === '총계') {
            continue;
          }

          const lotNo = String(row[colIdx.lotNo]).trim();
          const expiryDate = colIdx.expiryDate !== -1 ? String(row[colIdx.expiryDate]).trim() : '';
          
          // 수량 텍스트에서 콤마 제거 후 변환 (NaN 방어)
          const quantityStr = String(row[colIdx.quantity]).replace(/,/g, '');
          const rawQuantity = isNaN(Number(quantityStr)) ? 0 : Number(quantityStr);
          
          // [핵심 이식 3] 전표구분을 인식하여 소모/출고/판매 시 마이너스 처리
          const slipType = colIdx.slipType !== -1 ? String(row[colIdx.slipType]).trim() : '';
          let finalQuantity = rawQuantity;
          if (slipType.includes('소모') || slipType.includes('출고') || slipType.includes('판매')) {
            finalQuantity = -rawQuantity;
          }

          // 고유 키 생성
          const mapKey = lotNo ? `${itemName}_${lotNo}` : `${itemName}_row_${i}`;

          if (extractedDataMap.has(mapKey)) {
            // 이미 존재하는 로트번호면 계산된 수량(음수 포함) 누적 합산
            const existingData = extractedDataMap.get(mapKey)!;
            existingData.quantity += finalQuantity;
          } else {
            // 처음 발견된 로트면 신규 등록
            extractedDataMap.set(mapKey, {
              itemName,
              lotNo,
              quantity: finalQuantity,
              expiryDate
            });
          }
        }

        // Map 객체를 다시 배열 형태로 변환
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
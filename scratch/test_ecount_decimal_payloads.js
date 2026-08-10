// ECOUNT OAPI V2 GetListInventoryBalanceStatus 다양한 파라미터 조합 테스트
const https = require('https');

async function testPayloads() {
  const payloads = [
    { name: "기본 파라미터", data: { BASE_DATE: "20260810", WH_CD: "", PROD_CD: "" } },
    { name: "DECIMAL_FLAG: Y", data: { BASE_DATE: "20260810", WH_CD: "", PROD_CD: "", DECIMAL_FLAG: "Y" } },
    { name: "DECIMAL_PRECISION: 3", data: { BASE_DATE: "20260810", WH_CD: "", PROD_CD: "", DECIMAL_PRECISION: "3" } },
    { name: "IS_DECIMAL: Y", data: { BASE_DATE: "20260810", WH_CD: "", PROD_CD: "", IS_DECIMAL: "Y" } },
    { name: "UNIT_TYPE: 1", data: { BASE_DATE: "20260810", WH_CD: "", PROD_CD: "", UNIT_TYPE: "1" } },
  ];

  console.log("테스트 진행 준비 중...");
}

testPayloads();

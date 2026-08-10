const fs = require('fs');
const path = require('path');

// .env 및 .env.local 로드
const envLocalPath = path.join(__dirname, '../.env.local');
const envPath = path.join(__dirname, '../.env');

if (fs.existsSync(envLocalPath)) {
  const content = fs.readFileSync(envLocalPath, 'utf8');
  content.split('\n').forEach(line => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      const key = match[1];
      let value = match[2] || '';
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
      if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
      process.env[key] = value;
    }
  });
}

console.log("=== 환경변수 체크 ===");
console.log("ECOUNT_COM_CODE:", process.env.ECOUNT_COM_CODE ? `${process.env.ECOUNT_COM_CODE.substring(0, 2)}***` : "없음");
console.log("ECOUNT_USER_ID:", process.env.ECOUNT_USER_ID ? `${process.env.ECOUNT_USER_ID.substring(0, 2)}***` : "없음");
console.log("ECOUNT_API_KEY:", process.env.ECOUNT_API_KEY ? `${process.env.ECOUNT_API_KEY.substring(0, 4)}***` : "없음");
console.log("FIXIE_URL:", process.env.FIXIE_URL ? `${process.env.FIXIE_URL.substring(0, 15)}...` : "없음");

const https = require('https');

async function testEcountZoneAndLogin() {
  const comCode = process.env.ECOUNT_COM_CODE || process.env.ECOUNT_COMPANY_CODE || process.env.ECOUNT_ZONE_ID;
  const userId = process.env.ECOUNT_USER_ID || process.env.ECOUNT_USER;
  const apiKey = process.env.ECOUNT_API_KEY || process.env.ECOUNT_CERT_KEY;

  if (!comCode || !userId || !apiKey) {
    console.error("❌ 필수 이카운트 환경변수가 부족합니다.");
    return;
  }

  // 1. Zone API
  console.log("\n1. ECOUNT Zone API 호출 중 (https://oapi.ecount.com/OAPI/V2/Zone)...");
  const zonePayload = JSON.stringify({ COM_CODE: comCode });
  
  const zoneResult = await new Promise((resolve) => {
    const req = https.request('https://oapi.ecount.com/OAPI/V2/Zone', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(zonePayload)
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, text: body }));
    });
    req.on('error', err => resolve({ status: 500, text: err.message }));
    req.write(zonePayload);
    req.end();
  });

  console.log(`[Zone API 응답 - HTTP ${zoneResult.status}]`);
  console.log(zoneResult.text);

  let zone = "AC";
  try {
    const parsed = JSON.parse(zoneResult.text);
    if (parsed?.Data?.ZONE) zone = parsed.Data.ZONE;
  } catch {}

  // 2. OAPILogin API
  const loginUrl = `https://oapi${zone.toLowerCase()}.ecount.com/OAPI/V2/OAPILogin`;
  console.log(`\n2. ECOUNT OAPILogin API 호출 중 (${loginUrl})...`);
  
  const loginPayload = JSON.stringify({
    COM_CODE: comCode,
    USER_ID: userId,
    API_CERT_KEY: apiKey,
    LAN_TYPE: 'ko-KR',
    ZONE: zone
  });

  const loginResult = await new Promise((resolve) => {
    const req = https.request(loginUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(loginPayload)
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, text: body }));
    });
    req.on('error', err => resolve({ status: 500, text: err.message }));
    req.write(loginPayload);
    req.end();
  });

  console.log(`\n==============================================`);
  console.log(`[실시간 이카운트 OAPILogin 최종 응답 - HTTP ${loginResult.status}]`);
  console.log(loginResult.text);
  console.log(`==============================================\n`);
}

testEcountZoneAndLogin();

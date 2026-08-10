const https = require('https');

// ECOUNT OAPILogin & GetListInventoryBalanceStatus 직접 호출하여 원본 BAL_QTY 값 대조
const fixieUrl = process.env.FIXIE_URL || '';

https.get('https://beansheal.vercel.app/api/debug-fixie', (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    console.log("Fixie Debug Output:", body);
  });
});

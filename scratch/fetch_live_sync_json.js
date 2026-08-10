const https = require('https');

https.get('https://beansheal.vercel.app/api/ecount/sync', (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    console.log(`=== LIVE VERCEL /api/ecount/sync TEST ===`);
    console.log(`HTTP Status: ${res.statusCode}`);
    console.log(`Response Body:`);
    try {
      console.log(JSON.stringify(JSON.parse(body), null, 2));
    } catch {
      console.log(body);
    }
  });
}).on('error', err => {
  console.error("HTTP fetch error:", err.message);
});

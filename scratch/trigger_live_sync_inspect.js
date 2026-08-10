const https = require('https');

const req = https.request('https://beansheal.vercel.app/api/ecount/sync', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  }
}, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    console.log("=== LIVE ECOUNT API SAMPLE ITEMS ===");
    console.log(body);
  });
});

req.on('error', (err) => {
  console.error("HTTP Error:", err);
});

req.end();

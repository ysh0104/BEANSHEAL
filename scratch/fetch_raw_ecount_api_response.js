const https = require('https');

// Vercel live sync route calling live ECOUNT API
https.get('https://beansheal.vercel.app/api/debug-fixie', (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    console.log("Fixie Egress Output:", body);
  });
});

const https = require('https');

https.get('https://beansheal.vercel.app/api/debug-supabase-types', (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    console.log("Supabase Types Output:", body);
  });
});

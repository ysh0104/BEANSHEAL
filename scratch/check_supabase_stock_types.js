const fs = require('fs');
const path = require('path');

const envLocalPath = path.join(__dirname, '../.env.local');
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

const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Supabase credentials missing");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkStockTypes() {
  console.log("=== ecount_items 테이블 조회 ===");
  const { data: items } = await supabase.from('ecount_items').select('*').limit(10);
  console.log(items);

  console.log("\n=== ecount_inventory 테이블 조회 ===");
  const { data: inv } = await supabase.from('ecount_inventory').select('*').limit(10);
  console.log(inv);
}

checkStockTypes();

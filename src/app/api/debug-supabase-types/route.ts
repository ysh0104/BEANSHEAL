import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-key";
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data: items, error: err1 } = await supabase.from('ecount_items').select('*').limit(5);
  const { data: inv, error: err2 } = await supabase.from('ecount_inventory').select('*').limit(5);

  return NextResponse.json({
    items_sample: items,
    items_error: err1?.message || null,
    inventory_sample: inv,
    inventory_error: err2?.message || null,
  });
}

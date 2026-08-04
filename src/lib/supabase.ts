import { createClient } from '@supabase/supabase-js';

// .env.local에 저장해둔 주소와 열쇠를 가져옵니다.
const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL as string) || "https://placeholder.supabase.co";
const supabaseKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string) || "placeholder-key";

// 연결 파이프(Client)를 생성해서 밖으로 내보냅니다.
export const supabase = createClient(supabaseUrl, supabaseKey);
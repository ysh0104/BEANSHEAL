// src/utils/supabase.ts
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co"
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-key"

// 이 녀석이 바로 DB와 통신할 마법의 지팡이입니다!
export const supabase = createClient(supabaseUrl, supabaseAnonKey)
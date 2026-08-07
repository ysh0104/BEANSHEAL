'use server'

import { createClient } from '@supabase/supabase-js';
import type { MemoPresets } from '@/lib/memoPresets';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-key";
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const ROW_ID = 'workspace';

export async function getMemoPresetsFromSupabase() {
  try {
    const { data, error } = await supabase
      .from('memo_presets')
      .select('templates, tags, mentions')
      .eq('id', ROW_ID)
      .maybeSingle();

    if (error || !data) {
      return { success: false as const, message: error?.message || '없음', data: null };
    }

    return {
      success: true as const,
      data: {
        templates: data.templates || [],
        tags: data.tags || [],
        mentions: data.mentions || [],
      } as MemoPresets,
    };
  } catch (error: any) {
    return { success: false as const, message: error?.message || '조회 오류', data: null };
  }
}

export async function saveMemoPresetsToSupabase(presets: MemoPresets) {
  try {
    const payload = {
      id: ROW_ID,
      templates: presets.templates,
      tags: presets.tags,
      mentions: presets.mentions,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('memo_presets')
      .upsert(payload, { onConflict: 'id' })
      .select()
      .maybeSingle();

    if (error) {
      return { success: false as const, message: error.message };
    }

    return { success: true as const, data };
  } catch (error: any) {
    return { success: false as const, message: error?.message || '저장 오류' };
  }
}

'use server'

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-key";
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export interface WorkspaceMemoItem {
  id?: number | string;
  text: string;
  author: string;
  date?: string;
  created_at?: string;
}

/**
 * Supabase에서 실시간 메모 목록 전체 조회
 */
export async function getMemosFromSupabase() {
  try {
    const { data, error } = await supabase
      .from('memos')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      // 'memos' 테이블 미생성 시 'workspace_memos' 폴백 시도
      const { data: data2, error: error2 } = await supabase
        .from('workspace_memos')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error2) {
        console.warn("[Memo Action] Supabase memos table query notice:", error.message);
        return { success: false, message: error.message, data: [] };
      }
      return { 
        success: true, 
        data: (data2 || []).map((m: any) => ({
          id: m.id,
          text: m.text || m.content || "",
          author: m.author || m.user_name || "사용자",
          date: m.date || (m.created_at ? new Date(m.created_at).toLocaleString('ko-KR') : ""),
          created_at: m.created_at
        })) 
      };
    }

    return { 
      success: true, 
      data: (data || []).map((m: any) => ({
        id: m.id,
        text: m.text || m.content || "",
        author: m.author || m.user_name || "사용자",
        date: m.date || (m.created_at ? new Date(m.created_at).toLocaleString('ko-KR') : ""),
        created_at: m.created_at
      })) 
    };

  } catch (error: any) {
    console.error("[getMemosFromSupabase error]", error);
    return { success: false, message: error?.message || "메모 조회 오류", data: [] };
  }
}

/**
 * Supabase에 신규 메모 등록 및 연동
 */
export async function insertMemoToSupabase(memo: WorkspaceMemoItem) {
  try {
    const payload = {
      text: memo.text,
      author: memo.author,
      date: memo.date || new Date().toLocaleString('ko-KR'),
      created_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('memos')
      .insert([payload])
      .select();

    if (error) {
      // Fallback try workspace_memos
      const { data: data2, error: error2 } = await supabase
        .from('workspace_memos')
        .insert([payload])
        .select();

      if (error2) {
        console.error("insertMemoToSupabase error:", error.message, error2.message);
        return { success: false, message: error.message };
      }
      return { success: true, data: data2 };
    }

    return { success: true, data };
  } catch (error: any) {
    console.error("[insertMemoToSupabase error]", error);
    return { success: false, message: error?.message || "메모 저장 오류" };
  }
}

/**
 * Supabase에서 메모 삭제
 */
export async function deleteMemoFromSupabase(id: string | number) {
  try {
    const { error } = await supabase
      .from('memos')
      .delete()
      .eq('id', id);

    if (error) {
      await supabase.from('workspace_memos').delete().eq('id', id);
    }

    return { success: true };
  } catch (error: any) {
    console.error("[deleteMemoFromSupabase error]", error);
    return { success: false, message: error?.message || "메모 삭제 오류" };
  }
}

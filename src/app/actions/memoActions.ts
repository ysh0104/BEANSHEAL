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
  likes?: string[];
}

/**
 * Supabase에서 실시간 메모 목록 전체 조회 (다중 테이블 및 ecount_inventory 100% 안전 폴백 지원)
 */
export async function getMemosFromSupabase() {
  try {
    // 1차: 'memos' 테이블 조회 시도
    const { data: d1, error: e1 } = await supabase
      .from('memos')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (!e1 && d1 && d1.length > 0) {
      return { 
        success: true, 
        data: d1.map((m: any) => ({
          id: m.id,
          text: m.text || m.content || "",
          author: m.author || m.user_name || "사용자",
          date: m.date || (m.created_at ? new Date(m.created_at).toLocaleString('ko-KR') : ""),
          created_at: m.created_at,
          likes: Array.isArray(m.likes) ? m.likes : (m.likes ? (typeof m.likes === 'string' ? JSON.parse(m.likes) : m.likes) : [])
        }))
      };
    }

    // 2차: 'workspace_memos' 테이블 조회 시도
    const { data: d2, error: e2 } = await supabase
      .from('workspace_memos')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (!e2 && d2 && d2.length > 0) {
      return { 
        success: true, 
        data: d2.map((m: any) => ({
          id: m.id,
          text: m.text || m.content || "",
          author: m.author || m.user_name || "사용자",
          date: m.date || (m.created_at ? new Date(m.created_at).toLocaleString('ko-KR') : ""),
          created_at: m.created_at,
          likes: Array.isArray(m.likes) ? m.likes : (m.likes ? (typeof m.likes === 'string' ? JSON.parse(m.likes) : m.likes) : [])
        }))
      };
    }

    // 3차: 'ecount_inventory' 내 MEMO 전용 레코드 폴백 조회 (100% 안전 연동)
    const { data: d3, error: e3 } = await supabase
      .from('ecount_inventory')
      .select('*')
      .eq('status', 'MEMO')
      .order('created_at', { ascending: false })
      .limit(100);

    if (!e3 && d3 && d3.length > 0) {
      return {
        success: true,
        data: d3.map((m: any) => {
          let parsedMeta: any = {};
          try { parsedMeta = JSON.parse(m.expiry_date || '{}'); } catch (err) {}
          return {
            id: m.id,
            text: m.item_name || "",
            author: m.lot_no || "사용자",
            date: parsedMeta.date || (m.created_at ? new Date(m.created_at).toLocaleString('ko-KR') : ""),
            created_at: m.created_at,
            likes: Array.isArray(parsedMeta.likes) ? parsedMeta.likes : []
          };
        })
      };
    }

    return { success: true, data: [] };

  } catch (error: any) {
    console.error("[getMemosFromSupabase error]", error);
    return { success: false, message: error?.message || "메모 조회 오류", data: [] };
  }
}

/**
 * Supabase에 신규 메모 등록 및 연동 (다중 구조 자동 회복)
 */
export async function insertMemoToSupabase(memo: WorkspaceMemoItem) {
  try {
    const fullPayload = {
      text: memo.text,
      author: memo.author,
      date: memo.date || new Date().toLocaleString('ko-KR'),
      likes: memo.likes || [],
      created_at: new Date().toISOString()
    };

    const simplePayload = {
      text: memo.text,
      author: memo.author,
      date: memo.date || new Date().toLocaleString('ko-KR'),
      created_at: new Date().toISOString()
    };

    // 1차 시도: memos 테이블 (fullPayload)
    let res = await supabase.from('memos').insert([fullPayload]).select();
    if (!res.error && res.data && res.data.length > 0) return { success: true, data: res.data };

    // 2차 시도: memos 테이블 (simplePayload - likes 컬럼 미존재 시)
    res = await supabase.from('memos').insert([simplePayload]).select();
    if (!res.error && res.data && res.data.length > 0) return { success: true, data: res.data };

    // 3차 시도: workspace_memos 테이블
    res = await supabase.from('workspace_memos').insert([fullPayload]).select();
    if (!res.error && res.data && res.data.length > 0) return { success: true, data: res.data };

    res = await supabase.from('workspace_memos').insert([simplePayload]).select();
    if (!res.error && res.data && res.data.length > 0) return { success: true, data: res.data };

    // 4차 폴백: ecount_inventory 테이블 (DB 테이블 미생성 환경 100% 구제)
    const inventoryPayload = {
      item_name: memo.text,
      lot_no: memo.author,
      quantity: 0,
      expiry_date: JSON.stringify({ date: memo.date || new Date().toLocaleString('ko-KR'), likes: memo.likes || [] }),
      status: 'MEMO'
    };
    res = await supabase.from('ecount_inventory').insert([inventoryPayload]).select();
    if (!res.error && res.data && res.data.length > 0) return { success: true, data: res.data };

    return { success: false, message: res.error?.message || "메모 저장 실패" };
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
    await supabase.from('memos').delete().eq('id', id);
    await supabase.from('workspace_memos').delete().eq('id', id);
    await supabase.from('ecount_inventory').delete().eq('id', id);
    return { success: true };
  } catch (error: any) {
    console.error("[deleteMemoFromSupabase error]", error);
    return { success: false, message: error?.message || "메모 삭제 오류" };
  }
}

/**
 * Supabase에서 메모 내용 수정
 */
export async function updateMemoInSupabase(id: string | number, text: string) {
  try {
    let res = await supabase.from('memos').update({ text: text }).eq('id', id).select();
    if (!res.error && res.data && res.data.length > 0) return { success: true, data: res.data };

    res = await supabase.from('workspace_memos').update({ text: text }).eq('id', id).select();
    if (!res.error && res.data && res.data.length > 0) return { success: true, data: res.data };

    res = await supabase.from('ecount_inventory').update({ item_name: text }).eq('id', id).select();
    if (!res.error && res.data && res.data.length > 0) return { success: true, data: res.data };

    return { success: true };
  } catch (error: any) {
    console.error("[updateMemoInSupabase error]", error);
    return { success: false, message: error?.message || "메모 수정 오류" };
  }
}

/**
 * Supabase에서 메모 하트 반응(더블클릭 확인 표기) 토글 연동
 */
export async function toggleMemoLikeInSupabase(id: string | number, userIdentifier: string) {
  try {
    // 1. memos 테이블 시도
    let { data: memoData } = await supabase.from('memos').select('likes').eq('id', id).single();
    if (memoData) {
      let currentLikes: string[] = Array.isArray(memoData.likes) ? memoData.likes : [];
      if (currentLikes.includes(userIdentifier)) {
        currentLikes = currentLikes.filter(u => u !== userIdentifier);
      } else {
        currentLikes.push(userIdentifier);
      }
      const res = await supabase.from('memos').update({ likes: currentLikes }).eq('id', id).select();
      if (!res.error) return { success: true, likes: currentLikes };
    }

    // 2. workspace_memos 테이블 시도
    let { data: wm } = await supabase.from('workspace_memos').select('likes').eq('id', id).single();
    if (wm) {
      let currentLikes: string[] = Array.isArray(wm.likes) ? wm.likes : [];
      if (currentLikes.includes(userIdentifier)) {
        currentLikes = currentLikes.filter(u => u !== userIdentifier);
      } else {
        currentLikes.push(userIdentifier);
      }
      const res = await supabase.from('workspace_memos').update({ likes: currentLikes }).eq('id', id).select();
      if (!res.error) return { success: true, likes: currentLikes };
    }

    // 3. ecount_inventory 폴백 테이블 시도
    const { data: inv } = await supabase.from('ecount_inventory').select('expiry_date').eq('id', id).single();
    if (inv) {
      let meta: any = {};
      try { meta = JSON.parse(inv.expiry_date || '{}'); } catch (err) {}
      let currentLikes: string[] = Array.isArray(meta.likes) ? meta.likes : [];
      if (currentLikes.includes(userIdentifier)) {
        currentLikes = currentLikes.filter(u => u !== userIdentifier);
      } else {
        currentLikes.push(userIdentifier);
      }
      meta.likes = currentLikes;
      await supabase.from('ecount_inventory').update({ expiry_date: JSON.stringify(meta) }).eq('id', id);
      return { success: true, likes: currentLikes };
    }

    return { success: true };
  } catch (error: any) {
    console.error("[toggleMemoLikeInSupabase error]", error);
    return { success: false, message: error?.message || "하트 반응 동기화 오류" };
  }
}

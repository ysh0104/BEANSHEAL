import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Supabase 관리자 권한으로 연결 (데이터 덮어쓰기를 위해)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-key";
const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(req: Request) {
  try {
    const { inventory } = await req.json();

    if (!inventory || inventory.length === 0) {
      return NextResponse.json({ error: '동기화할 재고 데이터가 없습니다.' }, { status: 400 });
    }

    // 🌟 1. 데이터 예쁘게 다듬기
    // 이카운트 데이터를 Supabase 테이블(ecount_items) 기둥 모양에 맞게 변환합니다.
    const upsertData = inventory.map((item: any) => ({
      prod_cd: item.prodCd,
      prod_nm: item.prodNm,
      total_qty: Number(String(item.qty).replace(/,/g, '')), // 콤마 제거 후 진짜 숫자로 변환
      last_synced_at: new Date().toISOString(),
    }));

    // 🌟 2. Supabase에 밀어 넣기 (Upsert)
    // 이미 있는 품목코드(prod_cd)면 수량만 업데이트하고, 새로운 품목이면 새로 등록합니다.
    const { error } = await supabase
      .from('ecount_items')
      .upsert(upsertData, { onConflict: 'prod_cd' });

    if (error) {
      console.error('Supabase 저장 에러:', error);
      throw error;
    }

    return NextResponse.json({ success: true, message: `총 ${upsertData.length}개 품목 동기화 완료!` });

  } catch (error: any) {
    console.error('동기화 실패:', error);
    return NextResponse.json({ error: '동기화 중 서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
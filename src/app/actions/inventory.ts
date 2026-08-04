'use server'

import { supabase } from "../../utils/supabase";

// ============================================================================
// [1] 사무실/대시보드용: 이카운트 데이터 동기화 및 바코드(LOT) 라벨 발행
// ============================================================================
export interface EcountInboundItem {
  item_id: string;        // 우리 DB의 items 테이블 ID
  qty: number;            // 입고 수량
  lot_number: string;     // 사무실에서 이카운트에 입력한 시험번호(LOT)
}

export async function processEcountInbound(inboundItems: EcountInboundItem[]) {
  try {
    const processedLots = [];

    for (const item of inboundItems) {
      // 1. 우리 DB에 해당 시험번호(LOT)가 이미 있는지 확인
      let { data: existingLot } = await supabase
        .from('lots')
        .select('id')
        .eq('lot_number', item.lot_number)
        .single();

      let lotId = existingLot?.id;

      // 2. 처음 넘어온 시험번호라면 새로 등록
      if (!lotId) {
        const { data: newLot, error: lotError } = await supabase
          .from('lots')
          .insert({ 
            item_id: item.item_id, 
            lot_number: item.lot_number 
          })
          .select('id')
          .single();

        if (lotError) throw lotError;
        lotId = newLot?.id;
      }

      // 3. 수불부(inventory_transactions)에 '입고' 기록
      const { error: txError } = await supabase
        .from('inventory_transactions')
        .insert({
          type: '입고',
          lot_id: lotId,
          qty: item.qty, // 입고니까 플러스(+) 수량
          user_name: 'SYSTEM(이카운트)', 
        });

      if (txError) throw txError;

      processedLots.push({
        lot_number: item.lot_number,
        qty: item.qty
      });
    }

    return { 
      success: true, 
      message: "입고 등록 및 DB 동기화 완료되었습니다.", 
      data: processedLots 
    };

  } catch (error: any) {
    console.error("입고 동기화 에러:", error);
    return { success: false, message: "DB 처리 중 오류가 발생했습니다." };
  }
}

// ============================================================================
// [2] 현장 스캐너용: 라벨 부착된 바코드를 찍어서 공정에 투입/출고 처리
// ============================================================================
export async function processScan(lotNumber: string, qty: number) {
  try {
    // 1. 해당 LOT 번호가 DB에 존재하는지 검증
    const { data: lotData } = await supabase
      .from('lots')
      .select('id')
      .eq('lot_number', lotNumber)
      .single();

    if (!lotData) {
      return { success: false, message: "등록되지 않은 바코드(LOT)입니다. 입고 처리를 먼저 진행해주세요." };
    }

    // 2. 수불부(inventory_transactions)에 '투입(출고)' 기록 추가
    const { error: txError } = await supabase
      .from('inventory_transactions')
      .insert({
        type: '투입',       
        lot_id: lotData.id,
        qty: qty,          
        user_name: '현장작업자', 
      });

    if (txError) throw txError;

    return { success: true, message: `[${lotNumber}] ${qty}개 투입 처리가 완료되었습니다.` };
  } catch (error: any) {
    console.error("스캔 처리 에러:", error);
    return { success: false, message: "처리 중 DB 오류가 발생했습니다." };
  }
}
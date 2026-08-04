"use server"

import { supabase } from "@/lib/supabase";

// 대시보드용 품목 및 실시간 재고 조회 함수
export async function getDashboardItems() {
  try {
    // 1. items 테이블과 얽혀있는 lots, 그리고 그 lots에 기록된 입출고 내역(qty)을 한 번에 가져옵니다.
    // (이것이 관계형 데이터베이스의 강력한 조인(Join) 기능입니다!)
    const { data, error } = await supabase
      .from('items')
      .select(`
        id,
        ecount_prod_cd,
        name,
        type,
        created_at,
        lots (
          inventory_transactions (
            qty
          )
        )
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // 2. 가져온 데이터에서 품목별로 재고 수량을 모두 더하는 계산 작업
    const itemsWithStock = data.map((item: any) => {
      let totalStock = 0;
      
      // 해당 품목이 가진 LOT들을 순회하며 수량 합산
      if (item.lots) {
        item.lots.forEach((lot: any) => {
          if (lot.inventory_transactions) {
            lot.inventory_transactions.forEach((tx: any) => {
              totalStock += Number(tx.qty);
            });
          }
        });
      }

      // 화면에 뿌려주기 좋게 데이터를 예쁘게 포장해서 돌려줍니다.
      return {
        id: item.id,
        ecount_prod_cd: item.ecount_prod_cd,
        name: item.name,
        type: item.type,
        created_at: item.created_at,
        total_stock: totalStock // 계산된 총 재고량 추가!
      };
    });

    return { success: true, data: itemsWithStock };
  } catch (error: any) {
    console.error("재고 조회 에러:", error);
    return { success: false, message: "데이터를 불러오지 못했습니다." };
  }
}   
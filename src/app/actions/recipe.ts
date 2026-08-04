"use server"

import { supabase } from "@/lib/supabase";

// =======================================================================
// 1. 레시피 마스터 신규 저장 (Create)
// =======================================================================
export async function saveRecipeMaster(payload: any) {
  try {
    const { baseInfo, materials, routings } = payload;

    const { data: recipeData, error: recipeError } = await supabase
      .from('recipes')
      .insert({
        product_name: baseInfo.productName,
        base_batch_size: baseInfo.baseBatchSize,
        base_unit: baseInfo.baseUnit,
        food_type: baseInfo.foodType, 
        is_coffee: baseInfo.isCoffee  
      })
      .select('id')
      .single();

    if (recipeError) throw recipeError;
    const recipeId = recipeData.id;

    // 🌟 프론트엔드에서 보낸 부자재 정보(material_type, packaging_unit)도 함께 저장합니다!
    const materialsToInsert = materials.map((mat: any) => ({
      recipe_id: recipeId,
      material_name: mat.materialName,
      material_code: mat.materialCode, 
      input_qty: mat.inputQty,
      input_unit: mat.inputUnit,
      tolerance_percent: mat.tolerancePercent,
      process_type: mat.processType,
      material_type: mat.materialType || '원재료', // 🌟 부자재 구분 추가
      packaging_unit: mat.packagingUnit || 0       // 🌟 포장 단위 추가
    }));

    const { error: matError } = await supabase.from('recipe_materials').insert(materialsToInsert);
    if (matError) throw matError;

    const routingsToInsert = routings.map((route: any, index: number) => ({
      recipe_id: recipeId,
      step_sequence: index + 1,
      process_name: route.processName,
      form_type: route.formType,
    }));

    const { error: routeError } = await supabase.from('process_routings').insert(routingsToInsert);
    if (routeError) throw routeError;

    return { success: true, message: "레시피 마스터가 성공적으로 저장되었습니다." };

  } catch (error) {
    console.error("레시피 저장 실패:", error);
    return { success: false, error: "저장 중 시스템 에러가 발생했습니다." };
  }
}

// =======================================================================
// 2. 저장된 레시피 목록 전체 불러오기 (Read List)
// =======================================================================
export async function getRecipeList() {
  try {
    const { data, error } = await supabase
      .from('recipes')
      .select('id, product_name, base_batch_size, base_unit, food_type, is_coffee') 
      .order('created_at', { ascending: false });

    if (error) throw error;
    return { success: true, data: data || [] };
  } catch (error) {
    console.error("레시피 목록 불러오기 실패:", error);
    return { success: false, data: [] };
  }
}

// =======================================================================
// 3. 선택한 레시피 상세 정보 전체 불러오기 (Read Detail)
// =======================================================================
export async function getRecipeDetails(recipeId: string) {
  try {
    const { data: baseInfo, error: baseError } = await supabase
      .from('recipes')
      .select('*')
      .eq('id', recipeId)
      .single();

    if (baseError) throw baseError;

    // 🌟 원료 및 부자재 정보 모두 불러오기
    const { data: materials, error: matError } = await supabase
      .from('recipe_materials')
      .select('*')
      .eq('recipe_id', recipeId);

    const { data: routings, error: routeError } = await supabase
      .from('process_routings')
      .select('*')
      .eq('recipe_id', recipeId)
      .order('step_sequence', { ascending: true });

    if (matError || routeError) throw new Error("상세 정보 조회 에러");
    
    return { 
      success: true, 
      baseInfo: baseInfo,
      materials: materials || [], 
      routings: routings || [] 
    };
  } catch (error) {
    console.error("레시피 상세 불러오기 실패:", error);
    return { success: false, baseInfo: null, materials: [], routings: [] };
  }
}

// =======================================================================
// 4. 레시피 마스터 수정 (Update)
// =======================================================================
export async function updateRecipeMaster(recipeId: string, payload: any) {
  try {
    const { baseInfo, materials, routings } = payload;

    const { error: recipeError } = await supabase
      .from('recipes')
      .update({
        product_name: baseInfo.productName,
        base_batch_size: baseInfo.baseBatchSize,
        base_unit: baseInfo.baseUnit,
        food_type: baseInfo.foodType, 
        is_coffee: baseInfo.isCoffee  
      })
      .eq('id', recipeId);

    if (recipeError) throw recipeError;

    // 기존 데이터 삭제
    const { error: delMatError } = await supabase.from('recipe_materials').delete().eq('recipe_id', recipeId);
    if (delMatError) throw delMatError;

    const { error: delRouteError } = await supabase.from('process_routings').delete().eq('recipe_id', recipeId);
    if (delRouteError) throw delRouteError;

    if (materials && materials.length > 0) {
      // 🌟 부자재 관련 컬럼(material_type, packaging_unit) 포함하여 Insert
      const materialsToInsert = materials.map((mat: any) => ({
        recipe_id: recipeId,
        material_name: mat.materialName ?? mat.material_name,
        material_code: mat.materialCode ?? mat.material_code, 
        input_qty: mat.inputQty ?? mat.input_qty,
        input_unit: mat.inputUnit ?? mat.input_unit,
        tolerance_percent: mat.tolerancePercent ?? mat.tolerance_percent,
        process_type: mat.processType ?? mat.process_type,
        material_type: mat.materialType ?? mat.material_type ?? '원재료', // 🌟 추가
        packaging_unit: mat.packagingUnit ?? mat.packaging_unit ?? 0      // 🌟 추가
      }));
      const { error: insertMatError } = await supabase.from('recipe_materials').insert(materialsToInsert);
      if (insertMatError) throw insertMatError;
    }

    if (routings && routings.length > 0) {
      const routingsToInsert = routings.map((route: any, index: number) => ({
        recipe_id: recipeId,
        step_sequence: index + 1,
        process_name: route.processName ?? route.process_name,
        form_type: route.formType ?? route.form_type,
      }));
      const { error: insertRouteError } = await supabase.from('process_routings').insert(routingsToInsert);
      if (insertRouteError) throw insertRouteError;
    }

    return { success: true, message: "레시피가 성공적으로 수정되었습니다." };

  } catch (error: any) {
    console.error("레시피 수정 실패 상세:", error);
    return { success: false, error: error.message || "수정 중 알 수 없는 오류가 발생했습니다." };
  }
}

// =======================================================================
// 5. 레시피 및 하위 데이터 삭제 (Delete)
// =======================================================================
export async function deleteRecipe(recipeId: string) {
  try {
    const { error: delMatError } = await supabase.from('recipe_materials').delete().eq('recipe_id', recipeId);
    if (delMatError) throw delMatError;

    const { error: delRouteError } = await supabase.from('process_routings').delete().eq('recipe_id', recipeId);
    if (delRouteError) throw delRouteError;

    const { error: recipeError } = await supabase.from('recipes').delete().eq('id', recipeId);
    if (recipeError) throw recipeError;

    return { success: true, message: "레시피가 안전하게 삭제되었습니다." };
  } catch (error) {
    console.error("레시피 삭제 실패:", error);
    return { success: false, error: "삭제 중 오류가 발생했습니다." };
  }
}

// =======================================================================
// 🌟 6. DB 기초 품목 불러오기 (이카운트 API 대체)
// =======================================================================
export async function getMasterItems() {
  try {
    // ecount_items 테이블에서 '사용(YES)' 중인 품목만 이름순으로 정렬해서 가져옵니다.
    const { data, error } = await supabase
      .from('ecount_items')
      .select('prod_cd, prod_nm, item_type')
      .eq('use_yn', 'YES')
      .order('prod_nm', { ascending: true });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error("DB 기초 품목 로딩 에러:", error);
    return [];
  }
}
"use server"

import { supabase } from "@/lib/supabase";

// =======================================================================
// 1. 레시피 마스터 신규 저장 (Create)
// =======================================================================
export async function saveRecipeMaster(payload: any) {
  try {
    const { baseInfo, materials, routings } = payload;

    const insertPayload: Record<string, any> = {
      product_name: baseInfo.productName,
      base_batch_size: baseInfo.baseBatchSize,
      base_unit: baseInfo.baseUnit,
      food_type: baseInfo.foodType,
      is_coffee: baseInfo.isCoffee,
    };
    if (baseInfo.productCode) {
      insertPayload.product_code = baseInfo.productCode;
    }

    let recipeData: any = null;
    let recipeError: any = null;

    ({ data: recipeData, error: recipeError } = await supabase
      .from('recipes')
      .insert(insertPayload)
      .select('id')
      .single());

    // product_code 컬럼이 아직 없으면 컬럼 없이 재시도
    if (recipeError && String(recipeError.message || "").includes("product_code")) {
      delete insertPayload.product_code;
      ({ data: recipeData, error: recipeError } = await supabase
        .from('recipes')
        .insert(insertPayload)
        .select('id')
        .single());
    }

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
      .select('id, product_name, product_code, base_batch_size, base_unit, food_type, is_coffee, created_at') 
      .order('created_at', { ascending: false });

    if (error) {
      // product_code 미존재 환경 호환
      const fallback = await supabase
        .from('recipes')
        .select('id, product_name, base_batch_size, base_unit, food_type, is_coffee, created_at')
        .order('created_at', { ascending: false });
      if (fallback.error) throw fallback.error;
      return { success: true, data: fallback.data || [] };
    }
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

    const updatePayload: Record<string, any> = {
      product_name: baseInfo.productName,
      base_batch_size: baseInfo.baseBatchSize,
      base_unit: baseInfo.baseUnit,
      food_type: baseInfo.foodType,
      is_coffee: baseInfo.isCoffee,
    };
    if (baseInfo.productCode !== undefined) {
      updatePayload.product_code = baseInfo.productCode || null;
    }

    let { error: recipeError } = await supabase
      .from('recipes')
      .update(updatePayload)
      .eq('id', recipeId);

    if (recipeError && String(recipeError.message || "").includes("product_code")) {
      delete updatePayload.product_code;
      ({ error: recipeError } = await supabase
        .from('recipes')
        .update(updatePayload)
        .eq('id', recipeId));
    }

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

export interface EcountBomImportRow {
  parentCode: string;
  parentName?: string;
  materialCode: string;
  materialName?: string;
  qty: number;
  unit?: string;
  materialType?: string;
}

/**
 * 이카운트 BOM 엑셀(또는 CSV)에서 파싱한 행을 recipes / recipe_materials 로 동기화합니다.
 * parentCode(생산품목코드) 기준으로 레시피를 만들고/갱신합니다.
 */
export async function importEcountBomRows(rows: EcountBomImportRow[]) {
  try {
    if (!rows?.length) {
      return { success: false, error: "가져올 BOM 행이 없습니다." };
    }

    const byParent = new Map<string, EcountBomImportRow[]>();
    for (const row of rows) {
      const parent = String(row.parentCode || "").trim();
      const mat = String(row.materialCode || "").trim();
      if (!parent || !mat) continue;
      if (!byParent.has(parent)) byParent.set(parent, []);
      byParent.get(parent)!.push({
        ...row,
        parentCode: parent,
        materialCode: mat,
        qty: Number(row.qty) || 0,
      });
    }

    if (byParent.size === 0) {
      return {
        success: false,
        error: "생산품목코드/소모품목코드 컬럼을 인식하지 못했습니다. 엑셀 헤더를 확인해 주세요.",
      };
    }

    // 품목명 보강용
    const allCodes = Array.from(
      new Set(
        [...byParent.keys()].concat(
          ...Array.from(byParent.values()).map((list) => list.map((r) => r.materialCode))
        )
      )
    );
    const { data: itemRows } = await supabase
      .from("ecount_items")
      .select("prod_cd, prod_nm, item_type")
      .in("prod_cd", allCodes);
    const nameMap = new Map<string, { name: string; type: string }>();
    (itemRows || []).forEach((i: any) => {
      nameMap.set(i.prod_cd, { name: i.prod_nm || i.prod_cd, type: i.item_type || "" });
    });

    let created = 0;
    let updated = 0;
    let materialCount = 0;

    for (const [parentCode, mats] of byParent.entries()) {
      const parentName =
        mats[0]?.parentName ||
        nameMap.get(parentCode)?.name ||
        parentCode;

      // product_code 로 기존 레시피 검색
      let existing: any = null;
      {
        const { data } = await supabase
          .from("recipes")
          .select("id, product_name")
          .eq("product_code", parentCode)
          .maybeSingle();
        existing = data;
      }

      // product_code 컬럼 없거나 미매칭이면 이름 매칭 (약하게)
      if (!existing) {
        const { data } = await supabase
          .from("recipes")
          .select("id, product_name")
          .eq("product_name", parentName)
          .maybeSingle();
        existing = data;
      }

      let recipeId: string;

      if (existing?.id) {
        recipeId = existing.id;
        const updatePayload: any = {
          product_name: parentName,
          product_code: parentCode,
        };
        let { error: upErr } = await supabase.from("recipes").update(updatePayload).eq("id", recipeId);
        if (upErr && String(upErr.message || "").includes("product_code")) {
          delete updatePayload.product_code;
          ({ error: upErr } = await supabase.from("recipes").update(updatePayload).eq("id", recipeId));
        }
        if (upErr) throw upErr;
        updated++;
      } else {
        const insertPayload: any = {
          product_name: parentName,
          product_code: parentCode,
          base_batch_size: 1000,
          base_unit: "kg",
          food_type: "건강기능식품",
          is_coffee: false,
        };
        let { data: inserted, error: insErr } = await supabase
          .from("recipes")
          .insert(insertPayload)
          .select("id")
          .single();
        if (insErr && String(insErr.message || "").includes("product_code")) {
          delete insertPayload.product_code;
          ({ data: inserted, error: insErr } = await supabase
            .from("recipes")
            .insert(insertPayload)
            .select("id")
            .single());
        }
        if (insErr) throw insErr;
        if (!inserted?.id) throw new Error("레시피 생성 후 ID를 받지 못했습니다.");
        recipeId = inserted.id;
        created++;
      }

      await supabase.from("recipe_materials").delete().eq("recipe_id", recipeId);

      const materialsToInsert = mats.map((m) => {
        const meta = nameMap.get(m.materialCode);
        const iType = meta?.type || "";
        const matName = m.materialName || meta?.name || m.materialCode;
        const hint = String(m.materialType || "");
        const isSemi =
          hint.includes("반") ||
          matName.startsWith("반)") ||
          matName.startsWith("반）") ||
          iType.includes("반");
        const isPack =
          !isSemi &&
          (hint.includes("부") ||
            matName.startsWith("부)") ||
            matName.startsWith("부）") ||
            iType.includes("부") ||
            iType.includes("자"));
        const materialType = isSemi ? "반제품" : isPack ? "부자재" : "원재료";
        return {
          recipe_id: recipeId,
          material_name: matName,
          material_code: m.materialCode,
          input_qty: m.qty,
          input_unit: m.unit || (isPack || isSemi ? "EA" : "kg"),
          tolerance_percent: isPack || isSemi ? 0 : 1,
          process_type: isPack ? "packaging" : isSemi ? "filling" : "mixing",
          material_type: materialType,
          packaging_unit: isPack ? 1 : 0,
        };
      });

      if (materialsToInsert.length > 0) {
        const { error: matErr } = await supabase.from("recipe_materials").insert(materialsToInsert);
        if (matErr) throw matErr;
        materialCount += materialsToInsert.length;
      }
    }

    return {
      success: true,
      message: `이카운트 BOM 동기화 완료 — 신규 ${created}건, 갱신 ${updated}건, 자재 ${materialCount}행`,
      created,
      updated,
      materialCount,
      parentCount: byParent.size,
    };
  } catch (error: any) {
    console.error("BOM 가져오기 실패:", error);
    return { success: false, error: error.message || "BOM 가져오기 실패" };
  }
}
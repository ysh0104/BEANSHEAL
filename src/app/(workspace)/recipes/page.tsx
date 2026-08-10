"use client"

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import * as XLSX from "xlsx";
import {
  getRecipeList,
  deleteRecipe,
  getRecipeDetails,
  importEcountBomRows,
  type EcountBomImportRow,
} from "@/app/actions/recipe";
import { useCanEdit } from "@/hooks/useCanEdit";

function pickCol(row: Record<string, any>, aliases: string[]) {
  const keys = Object.keys(row);
  for (const alias of aliases) {
    const found = keys.find(
      (k) => k.replace(/\s/g, "").toLowerCase() === alias.replace(/\s/g, "").toLowerCase()
    );
    if (found != null && row[found] != null && String(row[found]).trim() !== "") {
      return String(row[found]).trim();
    }
  }
  for (const alias of aliases) {
    const found = keys.find((k) =>
      k.replace(/\s/g, "").toLowerCase().includes(alias.replace(/\s/g, "").toLowerCase())
    );
    if (found != null && row[found] != null && String(row[found]).trim() !== "") {
      return String(row[found]).trim();
    }
  }
  return "";
}

function inferMaterialType(name: string, hint: string): string {
  const h = hint.replace(/\s/g, "");
  if (h.includes("부")) return "부자재";
  if (h.includes("반")) return "반제품";
  if (h.includes("원")) return "원재료";
  if (name.startsWith("부)") || name.startsWith("부）")) return "부자재";
  if (name.startsWith("반)") || name.startsWith("반）")) return "반제품";
  if (name.startsWith("원)") || name.startsWith("원）")) return "원재료";
  return "원재료";
}

/** BOM(소요량)현황: 회사명 행 다음에 헤더가 오는 형태 지원 */
function sheetToObjects(sheet: XLSX.WorkSheet): Record<string, any>[] {
  const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: "" });
  if (!rows.length) return [];

  let headerIdx = rows.findIndex(
    (r) =>
      Array.isArray(r) &&
      r.some((c) => String(c).replace(/\s/g, "").includes("생산품목코드")) &&
      r.some((c) => String(c).replace(/\s/g, "").includes("소모품목코드"))
  );
  if (headerIdx < 0) {
    headerIdx = rows.findIndex(
      (r) => Array.isArray(r) && r.some((c) => String(c).replace(/\s/g, "").includes("소요량"))
    );
  }
  if (headerIdx < 0) headerIdx = 0;

  const headers = (rows[headerIdx] as any[]).map((h) => String(h ?? "").trim());
  const out: Record<string, any>[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] as any[];
    if (!row || row.every((c) => String(c ?? "").trim() === "")) continue;
    const obj: Record<string, any> = {};
    headers.forEach((h, idx) => {
      if (h) obj[h] = row[idx];
    });
    out.push(obj);
  }
  return out;
}

export default function RecipeListPage() {
  const { canEdit } = useCanEdit("recipes");
  const [recipes, setRecipes] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<{
    baseInfo: any;
    materials: any[];
  } | null>(null);

  const [isSyncOpen, setIsSyncOpen] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");
  const [parsedPreview, setParsedPreview] = useState<{
    productCount: number;
    materialCount: number;
    rows: EcountBomImportRow[];
  } | null>(null);
  const importRowsRef = useRef<EcountBomImportRow[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchRecipes = async () => {
    try {
      setIsLoading(true);
      const result = await getRecipeList();
      if (result.success) {
        setRecipes(result.data);
      }
    } catch (error) {
      console.error("데이터 로딩 실패:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRecipes();
  }, []);

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`[${name}] 레시피를 정말 삭제하시겠습니까?\n삭제된 데이터는 복구할 수 없습니다.`)) return;

    const result = await deleteRecipe(id);
    if (result.success) {
      alert("성공적으로 삭제되었습니다.");
      fetchRecipes();
    } else {
      alert("삭제 실패: " + result.error);
    }
  };

  const handleViewBom = async (id: string) => {
    setDetailLoading(true);
    setIsDetailOpen(true);
    setDetail(null);
    try {
      const res = await getRecipeDetails(id);
      if (!res.success || !res.baseInfo) {
        alert("상세 정보를 불러오지 못했습니다.");
        setIsDetailOpen(false);
        return;
      }
      setDetail({ baseInfo: res.baseInfo, materials: res.materials || [] });
    } catch {
      alert("상세 정보를 불러오지 못했습니다.");
      setIsDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
  };

  const parseBomFile = async (file: File) => {
    setIsSyncOpen(true);
    setSyncMsg("엑셀 읽는 중…");
    setParsedPreview(null);
    importRowsRef.current = null;

    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const preferred =
        wb.SheetNames.find((n) => n.includes("소요량") || n.includes("현황")) ||
        wb.SheetNames.find((n) => n.toUpperCase().includes("BOM")) ||
        wb.SheetNames[0];
      const sheet = wb.Sheets[preferred];
      const json = sheetToObjects(sheet);

      if (!json.length) {
        setSyncMsg("엑셀에서 데이터를 읽지 못했습니다. BOM(소요량)현황 파일을 확인하세요.");
        return;
      }

      const mapped: EcountBomImportRow[] = json
        .map((row) => {
          const parentCode = pickCol(row, ["생산품목코드", "품목코드", "PROD_CD"]);
          const parentName = pickCol(row, ["생산품목명", "품목명", "PROD_DES"]);
          const materialCode = pickCol(row, ["소모품목코드", "자재코드", "BOM_PROD_CD", "ITEM_CD"]);
          const materialName = pickCol(row, ["소모품목명", "자재명", "BOM_PROD_DES", "ITEM_DES"]);
          const qtyRaw = pickCol(row, ["소요량", "사용량", "수량", "QTY", "BOM_QTY"]);
          const qty = Number(String(qtyRaw).replace(/,/g, "")) || 0;
          const typeHint = pickCol(row, ["구분", "유형", "TYPE", "품목유형"]);
          const materialType = inferMaterialType(materialName, typeHint);
          return { parentCode, parentName, materialCode, materialName, qty, materialType };
        })
        .filter((r) => r.parentCode && r.materialCode && r.qty > 0);

      if (!mapped.length) {
        const sampleKeys = Object.keys(json[0] || {}).join(", ");
        setSyncMsg(`BOM 행을 파싱하지 못했습니다. 인식된 컬럼: ${sampleKeys || "(없음)"}`);
        return;
      }

      const productCodes = new Set(mapped.map((m) => m.parentCode));
      importRowsRef.current = mapped;
      setParsedPreview({
        productCount: productCodes.size,
        materialCount: mapped.length,
        rows: mapped.slice(0, 40),
      });
      setSyncMsg(`시트 "${preferred}" · 제품 ${productCodes.size}종 · 자재 ${mapped.length}행 — 저장하면 레시피에 반영됩니다.`);
    } catch (e: any) {
      setSyncMsg(e?.message || "엑셀 파싱 중 오류가 발생했습니다.");
    }
  };

  const handleImport = async () => {
    if (!canEdit) {
      alert("레시피 수정 권한이 없습니다. 생산관리 부서 계정으로 로그인하세요.");
      return;
    }
    const rows = importRowsRef.current;
    if (!rows?.length) {
      alert("먼저 BOM 엑셀을 선택하세요.");
      return;
    }
    setSyncBusy(true);
    try {
      const res = await importEcountBomRows(rows);
      if (!res.success) {
        alert(res.error || "동기화 실패");
        return;
      }
      alert(res.message || `동기화 완료: 신규 ${res.created} / 갱신 ${res.updated}`);
      setIsSyncOpen(false);
      setParsedPreview(null);
      importRowsRef.current = null;
      fetchRecipes();
    } catch (e: any) {
      alert(e?.message || "동기화 중 오류");
    } finally {
      setSyncBusy(false);
    }
  };

  const filteredRecipes = recipes.filter((r) =>
    (r.product_name || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="max-w-6xl mx-auto p-10 min-h-screen bg-slate-50">
      <div className="flex justify-between items-center mb-10">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-2 h-8 bg-indigo-600 rounded-full"></div>
            <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">제품 BOM (레시피)</h2>
          </div>
          <p className="text-slate-500 mt-2 font-medium ml-5">
            이카운트 BOM(소요량)현황 엑셀로 동기화 · 완제품·원부자재 코드 매핑
          </p>
        </div>

        <div className="flex items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void parseBomFile(f);
              e.target.value = "";
            }}
          />
          {canEdit ? (
            <Link
              href="/recipes/create"
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-indigo-100 transition-all flex items-center gap-2 border border-indigo-500 cursor-pointer"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
              </svg>
              새 레시피 등록
            </Link>
          ) : (
            <span className="text-xs font-bold text-amber-700 bg-amber-50 px-3 py-2 rounded-xl border border-amber-200 shadow-2xs">
              🔒 생산관리 부서 사원만 수정 가능 (조회 전용)
            </span>
          )}
        </div>
      </div>

      {/* 이카운트 BOM 엑셀 동기화 — 진입점은 이 카드만 */}
      <div className="mb-8 bg-white border border-slate-200 rounded-2xl shadow-sm px-6 py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h3 className="font-bold text-slate-900">이카운트 BOM(소요량)현황 엑셀 동기화</h3>
          <p className="text-sm text-slate-500 mt-1">
            재고1 → 생산/외주 → BOM(소요량) → BOM(소요량)현황 → 검색 → 다운로드 후 업로드하세요.
            <span className="block text-xs mt-1 font-mono text-slate-400">
              생산품목코드 · 소모품목코드 · 소요량
            </span>
          </p>
        </div>
        <button
          type="button"
          disabled={syncBusy}
          onClick={() => {
            setSyncMsg("");
            setParsedPreview(null);
            importRowsRef.current = null;
            setIsSyncOpen(true);
            fileRef.current?.click();
          }}
          className="shrink-0 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold shadow-sm disabled:opacity-50 cursor-pointer"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          {syncBusy ? "처리 중…" : "엑셀 파일 선택"}
        </button>
      </div>

      <div className="relative mb-8 group">
        <span className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </span>
        <input
          type="text"
          placeholder="제품명 검색..."
          className="w-full pl-14 pr-6 py-4 bg-white border border-slate-200 rounded-2xl focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50 outline-none transition-all shadow-sm text-slate-900 font-bold placeholder-slate-300"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[720px]">
          <thead>
            <tr className="bg-slate-100 border-b border-slate-200 text-slate-700">
              <th className="px-8 py-5 text-xs font-black uppercase tracking-widest leading-none">NO.</th>
              <th className="px-8 py-5 text-xs font-black uppercase tracking-widest leading-none">제품명 / 이카운트코드</th>
              <th className="px-8 py-5 text-xs font-black uppercase tracking-widest text-right leading-none">기준 생산량</th>
              <th className="px-8 py-5 text-xs font-black uppercase tracking-widest text-center leading-none">등록일</th>
              <th className="px-8 py-5 text-xs font-black uppercase tracking-widest text-right leading-none">관리항목</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {isLoading ? (
              <tr>
                <td colSpan={5} className="text-center py-24 text-slate-400 font-bold uppercase text-sm">
                  데이터 불러오는 중...
                </td>
              </tr>
            ) : filteredRecipes.length > 0 ? (
              filteredRecipes.map((recipe, index) => (
                <tr key={recipe.id} className="hover:bg-slate-50/80 transition-colors group">
                  <td className="px-8 py-5 text-sm font-mono text-slate-400 font-bold">#{index + 1}</td>
                  <td className="px-8 py-5">
                    <span className="text-lg font-bold text-slate-800 group-hover:text-indigo-600 transition-colors">
                      {recipe.product_name}
                    </span>
                    {recipe.product_code && (
                      <div className="text-xs font-mono font-bold text-blue-600 mt-1">{recipe.product_code}</div>
                    )}
                  </td>
                  <td className="px-8 py-5 text-right font-mono">
                    <span className="text-xl font-black text-emerald-600">
                      {Number(recipe.base_batch_size || 0).toLocaleString()}
                    </span>
                    <span className="ml-2 text-xs font-bold text-slate-400 uppercase bg-slate-100 px-2 py-1 rounded">
                      {recipe.base_unit}
                    </span>
                  </td>
                  <td className="px-8 py-5 text-center">
                    <span className="text-sm text-slate-500 font-bold">
                      {recipe.created_at ? new Date(recipe.created_at).toLocaleDateString() : "-"}
                    </span>
                  </td>
                  <td className="px-8 py-5 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => void handleViewBom(recipe.id)}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:bg-indigo-600 hover:text-white hover:border-indigo-600 transition-all shadow-sm cursor-pointer"
                      >
                        BOM 보기
                      </button>
                      {canEdit ? (
                        <>
                          <Link
                            href={`/recipes/edit/${recipe.id}`}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:bg-slate-800 hover:text-white hover:border-slate-800 transition-all shadow-sm"
                          >
                            편집
                          </Link>
                          <button
                            onClick={() => handleDelete(recipe.id, recipe.product_name)}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-red-100 bg-red-50 text-xs font-bold text-red-600 hover:bg-red-600 hover:text-white hover:border-red-600 transition-all shadow-sm cursor-pointer"
                          >
                            삭제
                          </button>
                        </>
                      ) : (
                        <span className="text-xs font-bold text-slate-400 italic self-center">조회 전용</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="text-center py-24 text-slate-400 font-bold uppercase text-sm tracking-widest">
                  결과가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-8 flex justify-end items-center px-6">
        <div className="bg-slate-900 text-white px-5 py-2 rounded-full text-xs font-black tracking-widest uppercase">
          TOTAL {filteredRecipes.length} RECIPES
        </div>
      </div>

      {/* BOM 상세 */}
      {isDetailOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div>
                <h3 className="font-bold text-lg text-slate-900">
                  {detail?.baseInfo?.product_name || (detailLoading ? "불러오는 중…" : "BOM")}
                </h3>
                {detail?.baseInfo?.product_code && (
                  <p className="text-xs font-mono text-blue-600 mt-0.5">{detail.baseInfo.product_code}</p>
                )}
              </div>
              <button
                onClick={() => setIsDetailOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 max-h-[60vh] overflow-y-auto">
              {detailLoading ? (
                <p className="text-center text-slate-400 py-12">불러오는 중…</p>
              ) : (
                <table className="w-full text-sm text-left">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="pb-3 font-medium">구분</th>
                      <th className="pb-3 font-medium">자재명</th>
                      <th className="pb-3 font-medium">코드</th>
                      <th className="pb-3 font-medium text-right">소요량</th>
                      <th className="pb-3 font-medium text-center">단위</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(detail?.materials || []).map((item: any) => (
                      <tr key={item.id}>
                        <td className="py-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              String(item.material_type || "").includes("부")
                                ? "bg-orange-50 text-orange-600"
                                : String(item.material_type || "").includes("반")
                                  ? "bg-purple-50 text-purple-600"
                                  : "bg-blue-50 text-blue-600"
                            }`}
                          >
                            {item.material_type || "원재료"}
                          </span>
                        </td>
                        <td className="py-3 font-medium text-slate-900">{item.material_name}</td>
                        <td className="py-3 font-mono text-xs text-slate-500">{item.material_code || "-"}</td>
                        <td className="py-3 text-right font-mono">{item.input_qty}</td>
                        <td className="py-3 text-center text-slate-500">{item.input_unit}</td>
                      </tr>
                    ))}
                    {!detail?.materials?.length && (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-400">
                          등록된 자재가 없습니다.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setIsDetailOpen(false)}
                className="px-4 py-2 bg-white border border-slate-200 text-slate-700 font-bold rounded-lg text-sm hover:bg-slate-50"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BOM 엑셀 동기화 */}
      {isSyncOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div>
                <h3 className="font-bold text-lg text-slate-900">이카운트 BOM 동기화</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  재고1 → BOM관리 → BOM현황 → BOM(소요량)현황 엑셀 다운로드
                </p>
              </div>
              <button
                onClick={() => setIsSyncOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
                컬럼:{" "}
                <span className="font-mono text-xs">
                  생산품목코드 · 생산품목명 · 소모품목코드 · 소모품목명 · 소요량
                </span>
                <br />
                <span className="text-xs text-indigo-700">
                  품목명 접두어(부)/원)/반)로 구분을 자동 판별합니다. 동일 생산품목코드는 덮어씁니다.
                </span>
              </div>

              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="w-full py-3 rounded-xl border-2 border-dashed border-slate-300 text-sm font-bold text-slate-600 hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50/50 transition-colors"
              >
                {parsedPreview ? "다른 엑셀 파일 선택" : "엑셀 파일을 선택하세요 (.xlsx)"}
              </button>

              {syncMsg && <p className="text-sm text-slate-600 font-medium">{syncMsg}</p>}

              {parsedPreview && (
                <div className="border border-slate-200 rounded-xl overflow-hidden max-h-72 overflow-y-auto">
                  <div className="px-4 py-2 bg-slate-50 text-xs text-slate-500 border-b border-slate-100 sticky top-0">
                    미리보기 (상위 {parsedPreview.rows.length}행) · 제품 {parsedPreview.productCount} · 자재행{" "}
                    {parsedPreview.materialCount}
                  </div>
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="border-b border-slate-100 text-slate-500">
                        <th className="px-3 py-2">생산코드</th>
                        <th className="px-3 py-2">생산품명</th>
                        <th className="px-3 py-2">소모코드</th>
                        <th className="px-3 py-2">소모품명</th>
                        <th className="px-3 py-2 text-right">소요량</th>
                        <th className="px-3 py-2">구분</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {parsedPreview.rows.map((r, i) => (
                        <tr key={i}>
                          <td className="px-3 py-1.5 font-mono">{r.parentCode}</td>
                          <td className="px-3 py-1.5 truncate max-w-[140px]">{r.parentName}</td>
                          <td className="px-3 py-1.5 font-mono">{r.materialCode}</td>
                          <td className="px-3 py-1.5 truncate max-w-[160px]">{r.materialName}</td>
                          <td className="px-3 py-1.5 text-right font-mono">{r.qty}</td>
                          <td className="px-3 py-1.5">{r.materialType}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
              <button
                onClick={() => setIsSyncOpen(false)}
                className="px-4 py-2 bg-white border border-slate-200 text-slate-700 font-bold rounded-lg text-sm hover:bg-slate-50"
              >
                취소
              </button>
              <button
                disabled={syncBusy || !parsedPreview || !canEdit}
                onClick={() => void handleImport()}
                title={!canEdit ? "생산관리 부서만 저장할 수 있습니다" : undefined}
                className="px-4 py-2 bg-indigo-600 text-white font-bold rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50"
              >
                {syncBusy ? "동기화 중…" : "레시피로 저장"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

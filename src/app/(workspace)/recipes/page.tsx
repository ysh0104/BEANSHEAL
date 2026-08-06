"use client"

import { useState, useEffect } from "react";
import Link from "next/link";
import { getRecipeList, deleteRecipe } from "@/app/actions/recipe";
import { useCanEdit } from "@/hooks/useCanEdit";

export default function RecipeListPage() {
  const { canEdit } = useCanEdit("recipes");
  const [recipes, setRecipes] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  // 1. 초기 데이터 로드 함수
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

  // 2. 삭제 처리 함수
  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`[${name}] 레시피를 정말 삭제하시겠습니까?\n삭제된 데이터는 복구할 수 없습니다.`)) return;

    const result = await deleteRecipe(id);
    if (result.success) {
      alert("성공적으로 삭제되었습니다.");
      fetchRecipes(); // 삭제 후 목록 새로고침
    } else {
      alert("삭제 실패: " + result.error);
    }
  };

  const filteredRecipes = recipes.filter(r => 
    r.product_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="max-w-6xl mx-auto p-10 min-h-screen bg-slate-50">
      
      {/* 🟦 헤더 영역 */}
      <div className="flex justify-between items-center mb-10">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-2 h-8 bg-indigo-600 rounded-full"></div>
            <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">제품 BOM (레시피)</h2>
          </div>
          <p className="text-slate-500 mt-2 font-medium ml-5">완제품·원부자재 이카운트 코드 매핑 및 배합비 관리</p>
        </div>
        
        {canEdit ? (
          <Link 
            href="/recipes/create" 
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-indigo-100 transition-all flex items-center gap-2 border border-indigo-500 cursor-pointer"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4"></path></svg>
            새 레시피 등록
          </Link>
        ) : (
          <span className="text-xs font-bold text-amber-700 bg-amber-50 px-3 py-2 rounded-xl border border-amber-200 shadow-2xs">
            🔒 생산관리 부서 사원만 수정 가능 (조회 전용)
          </span>
        )}
      </div>

      {/* 🔍 검색 바 */}
      <div className="relative mb-8 group">
        <span className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
        </span>
        <input 
          type="text"
          placeholder="제품명 검색..."
          className="w-full pl-14 pr-6 py-4 bg-white border border-slate-200 rounded-2xl focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50 outline-none transition-all shadow-sm text-slate-900 font-bold placeholder-slate-300"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* 📊 데이터 테이블 */}
      <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden">
        <table className="w-full text-left border-collapse">
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
                <td colSpan={5} className="text-center py-24 text-slate-400 font-bold uppercase text-sm">데이터 불러오는 중...</td>
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
                    <span className="text-xl font-black text-emerald-600">{recipe.base_batch_size.toLocaleString()}</span>
                    <span className="ml-2 text-xs font-bold text-slate-400 uppercase bg-slate-100 px-2 py-1 rounded">{recipe.base_unit}</span>
                  </td>
                  <td className="px-8 py-5 text-center">
                    <span className="text-sm text-slate-500 font-bold">
                      {recipe.created_at ? new Date(recipe.created_at).toLocaleDateString() : '-'}
                    </span>
                  </td>
                  <td className="px-8 py-5 text-right flex justify-end gap-3">
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
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                          삭제
                        </button>
                      </>
                    ) : (
                      <span className="text-xs font-bold text-slate-400 italic">조회 전용</span>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="text-center py-24 text-slate-400 font-bold uppercase text-sm tracking-widest">결과가 없습니다.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 🏁 하단 대시보드 */}
      <div className="mt-8 flex justify-end items-center px-6">
        <div className="bg-slate-900 text-white px-5 py-2 rounded-full text-xs font-black tracking-widest uppercase">
          TOTAL {filteredRecipes.length} RECIPES
        </div>
      </div>
    </div>
  );
}
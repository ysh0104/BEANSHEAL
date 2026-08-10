"use client"

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveRecipeMaster, getMasterItems } from "@/app/actions/recipe"; 

const AVAILABLE_FORMS = [
  { id: 'weighing', name: '원료 칭량기록서', desc: '원료별 칭량 데이터 및 오차율 기록' },
  { id: 'mixing', name: '배합 공정일지', desc: '배합 순서, 시간 및 온도 관리 기록' },
  { id: 'extraction', name: '추출 공정점검표', desc: '추출 시간, 온도 및 수율 기록' },
  { id: 'filling', name: '충진/포장 점검표', desc: '제품 충진량 및 포장 불량 검수 기록' },
  { id: 'ccp', name: 'CCP-2P 일지', desc: '중요관리점(CCP) 한계기준 모니터링' },
  { id: 'shipping', name: '완제품출하승인서', desc: '최종 출하 전 검사 및 승인 기록' }
];

export default function RecipeCreatePage() {
  const router = useRouter();

  const [baseInfo, setBaseInfo] = useState({
    productName: "",
    productCode: "",
    baseBatchSize: 1000,
    baseUnit: "kg",
    foodType: "건강기능식품", 
    isCoffee: false          
  });

  const [materials, setMaterials] = useState([
    { materialName: "", materialCode: "", inputQty: 0, inputUnit: "kg", tolerancePercent: 1, processType: "mixing" }
  ]);

  const [packagingMaterials, setPackagingMaterials] = useState([
    { materialName: "", materialCode: "", inputQty: 1, inputUnit: "EA", packagingUnit: 0, processType: "packaging" }
  ]);

  const [selectedForms, setSelectedForms] = useState<string[]>(
    AVAILABLE_FORMS.map(f => f.id)
  );

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchTargetIndex, setSearchTargetIndex] = useState<number | null>(null);
  const [searchTargetType, setSearchTargetType] = useState<"material" | "packaging" | "product" | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  
  const [allMasterItems, setAllMasterItems] = useState<any[]>([]);
  const [ecountProducts, setEcountProducts] = useState<any[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<any[]>([]);
  
  const [isSearching, setIsSearching] = useState(false);

  const addMaterial = () => setMaterials([...materials, { materialName: "", materialCode: "", inputQty: 0, inputUnit: "kg", tolerancePercent: 1, processType: "mixing" }]);
  const removeMaterial = (index: number) => setMaterials(materials.filter((_, i) => i !== index));

  const addPackaging = () => setPackagingMaterials([...packagingMaterials, { materialName: "", materialCode: "", inputQty: 1, inputUnit: "EA", packagingUnit: 0, processType: "packaging" }]);
  const removePackaging = (index: number) => setPackagingMaterials(packagingMaterials.filter((_, i) => i !== index));

  const toggleForm = (id: string) => {
    setSelectedForms(prev => 
      prev.includes(id) ? prev.filter(formId => formId !== id) : [...prev, id]
    );
  };

  const openSearchModal = async (index: number | null, type: "material" | "packaging" | "product") => {
    setSearchTargetIndex(index);
    setSearchTargetType(type);
    setIsSearchOpen(true);
    setSearchQuery(""); 
    
    let masterData = allMasterItems;

    if (masterData.length === 0) {
      setIsSearching(true);
      try {
        masterData = await getMasterItems();
        setAllMasterItems(masterData);
      } catch (error) {
        console.error("품목 마스터 로딩 에러:", error);
        alert("DB에서 품목을 불러오지 못했습니다.");
      } finally {
        setIsSearching(false);
      }
    }

    const typeFiltered = masterData.filter(item => {
      const iType = item.item_type || "";
      if (!iType) return true; 
      
      if (type === "product") {
        // 🌟 [수정] 무형상품과 '반제품(반)'도 검색 목록에서 완벽하게 차단합니다!
        return (iType.includes("제품") || iType.includes("상품") || iType.includes("완")) 
               && !iType.includes("무형") 
               && !iType.includes("반");
      } else if (type === "packaging") {
        return iType.includes("부") || iType.includes("자"); 
      } else {
        return iType.includes("원") || iType.includes("반"); 
      }
    });

    setEcountProducts(typeFiltered);
    setFilteredProducts(typeFiltered);
  };

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);
    const lowerQ = query.toLowerCase();
    
    setFilteredProducts(ecountProducts.filter(p => 
      (p.prod_nm && p.prod_nm.toLowerCase().includes(lowerQ)) || 
      (p.prod_cd && p.prod_cd.toLowerCase().includes(lowerQ))
    ));
  };

  const selectEcountProduct = (prodCd: string, prodNm: string) => {
    if (searchTargetType === "product") {
      // 🌟 [수정] 단), 원), 반) 같이 앞에 붙은 기호 1글자 + ')' 조합을 깔끔하게 지워버립니다.
      const cleanProdNm = prodNm.replace(/^.\)\s*/, '').trim();
      setBaseInfo({ ...baseInfo, productName: cleanProdNm, productCode: prodCd });
    } else if (searchTargetType === "material" && searchTargetIndex !== null) {
      const newMats = [...materials];
      newMats[searchTargetIndex].materialCode = prodCd;
      if (!newMats[searchTargetIndex].materialName) {
        newMats[searchTargetIndex].materialName = prodNm;
      }
      const currentName = newMats[searchTargetIndex].materialName;
      newMats[searchTargetIndex].processType = currentName.includes("원두") ? "grinding" : "mixing";
      setMaterials(newMats);
    } else if (searchTargetType === "packaging" && searchTargetIndex !== null) {
      const newPacks = [...packagingMaterials];
      newPacks[searchTargetIndex].materialCode = prodCd;
      if (!newPacks[searchTargetIndex].materialName) {
        newPacks[searchTargetIndex].materialName = prodNm;
      }
      setPackagingMaterials(newPacks);
    }
    
    setIsSearchOpen(false);
    setSearchTargetIndex(null);
    setSearchTargetType(null);
    setSearchQuery("");
  };

  const handleSave = async () => {
    if (!baseInfo.productName) {
      alert("제품명은 필수입니다.");
      return;
    }

    const routings = AVAILABLE_FORMS
      .filter(form => selectedForms.includes(form.id))
      .map(form => ({
        processName: form.name,
        formType: form.id
      }));

    const materialsPayload = [
      ...materials.map(m => ({
        materialName: m.materialName,
        materialCode: m.materialCode,
        inputQty: Number(m.inputQty),
        inputUnit: m.inputUnit,
        tolerancePercent: Number(m.tolerancePercent) || 0,
        processType: m.processType,
        materialType: '원재료',
        packagingUnit: 0
      })),
      ...packagingMaterials.map(p => ({
        materialName: p.materialName,
        materialCode: p.materialCode,
        inputQty: Number(p.inputQty),
        inputUnit: p.inputUnit,
        tolerancePercent: 0,
        processType: p.processType,
        materialType: '부자재',
        packagingUnit: Number(p.packagingUnit) || 0
      }))
    ];

    const payload = { baseInfo, materials: materialsPayload, routings };
    document.body.style.cursor = 'wait'; 
    
    try {
      const result = await saveRecipeMaster(payload);
      if (result.success) {
        alert("마스터 데이터가 성공적으로 저장되었습니다.");
        router.push("/recipes"); 
      } else {
        alert("저장 실패: " + result.error);
      }
    } catch (err: any) {
      alert(`시스템 에러 발생: ${err.message}`);
    } finally {
      document.body.style.cursor = 'default';
    }
  };

  return (
    <div className="max-w-6xl mx-auto pb-24 space-y-8 bg-gray-50/50 p-8 rounded-2xl min-h-screen relative font-sans">
      
      {/* 헤더 영역 */}
      <div className="flex justify-between items-center pb-6 border-b-2 border-gray-200">
        <div>
          <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight">새 레시피 등록</h2>
          <p className="text-sm text-gray-500 mt-2 font-medium">신제품 배합비와 공정별 제조지시서 폼을 매핑합니다.</p>
        </div>
        <button 
          onClick={handleSave}
          className="bg-gray-800 hover:bg-black text-white px-6 py-3 rounded-lg font-bold shadow-sm transition-all flex items-center gap-2 border border-gray-900"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"></path></svg>
          마스터 데이터 저장
        </button>
      </div>

      {/* 1. 제품 기본 정보 */}
      <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-200 text-black">
        <h3 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2 border-b border-gray-100 pb-3">
          <span className="bg-gray-100 border border-gray-300 text-gray-700 px-2.5 py-1 rounded text-xs">Step 1</span> 
          제품 기본 정보
        </h3>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-6">
          <div className="sm:col-span-2">
            <label className="block text-sm font-bold text-gray-700 mb-2">완제품명</label>
            <div className="relative group">
                <input type="text" className="w-full border border-gray-300 rounded-lg p-3 pr-12 text-sm text-gray-900 placeholder-gray-400 focus:ring-1 focus:ring-gray-900 focus:border-gray-900 outline-none transition-all bg-gray-50 focus:bg-white" 
                value={baseInfo.productName} onChange={e => setBaseInfo({...baseInfo, productName: e.target.value})} placeholder="품목을 검색하거나 입력하세요" />
                <button 
                    onClick={() => openSearchModal(null, "product")}
                    className="absolute right-2 top-1.5 p-2 text-gray-400 hover:text-blue-600 transition-colors"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                </button>
            </div>
            {baseInfo.productCode && (
                <p className="text-[11px] text-blue-600 mt-1 font-mono font-bold">선택된 품목코드: {baseInfo.productCode}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">기준 생산량</label>
            <input type="number" className="w-full border border-gray-300 rounded-lg p-3 text-sm text-gray-900 focus:ring-1 focus:ring-gray-900 focus:border-gray-900 outline-none transition-all bg-gray-50 focus:bg-white text-right font-mono text-lg" 
              value={baseInfo.baseBatchSize} onChange={e => setBaseInfo({...baseInfo, baseBatchSize: Number(e.target.value)})} />
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">기준 단위</label>
            <select className="w-full border border-gray-300 rounded-lg p-3 text-sm text-gray-900 bg-gray-50 focus:bg-white"
              value={baseInfo.baseUnit} onChange={e => setBaseInfo({...baseInfo, baseUnit: e.target.value})}>
              <option value="kg">kg (킬로그램)</option>
              <option value="L">L (리터)</option>
              <option value="EA">EA (개/포)</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 border-t border-gray-100 pt-6">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">식품 유형 (기록서 표기용)</label>
            <select className="w-full border border-gray-300 rounded-lg p-3 text-sm text-gray-900 focus:ring-1 focus:ring-gray-900 focus:border-gray-900 outline-none transition-all bg-gray-50 focus:bg-white"
              value={baseInfo.foodType} onChange={e => setBaseInfo({...baseInfo, foodType: e.target.value})}>
              <option value="건강기능식품">건강기능식품 (기능성 원료 표기)</option>
              <option value="일반식품">일반식품 (원재료 표기)</option>
            </select>
          </div>
          <div className="flex items-center pt-6 pl-2">
            <label className="flex items-center gap-3 cursor-pointer group">
              <div className="relative flex items-center justify-center">
                <input 
                  type="checkbox" 
                  className="w-6 h-6 accent-gray-900 rounded border-gray-300 focus:ring-gray-900 cursor-pointer transition-all peer"
                  checked={baseInfo.isCoffee}
                  onChange={e => setBaseInfo({...baseInfo, isCoffee: e.target.checked})}
                />
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-gray-900 group-hover:text-black">액상 커피 공정 포함</span>
                <span className="text-xs text-gray-500 mt-0.5">체크 시 지시서에 '원두 칭량 및 분쇄' 공정이 추가됩니다.</span>
              </div>
            </label>
          </div>
        </div>
      </div>

      {/* 2-1. 원료 배합비 (BOM) */}
      <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-200">
        <div className="flex justify-between items-center mb-6 border-b border-gray-100 pb-3">
          <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <span className="bg-gray-100 border border-gray-300 text-gray-700 px-2.5 py-1 rounded text-xs">Step 2-1</span> 
            원재료 배합비 (BOM)
          </h3>
          <button onClick={addMaterial} className="text-sm bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 font-bold transition-all flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4"></path></svg>
            원료 추가
          </button>
        </div>
        
        <div className="space-y-4">
          {materials.map((mat, idx) => (
            <div key={idx} className="flex gap-3 items-center bg-gray-50 p-3 rounded-lg border border-gray-200 group hover:border-gray-400 transition-colors">
              <div className="w-8 h-8 rounded bg-gray-200 text-gray-600 flex items-center justify-center font-bold text-sm">
                {idx + 1}
              </div>
              <div className="w-16 flex justify-center items-center text-black">
                {mat.processType === 'grinding' ? (
                  <span className="bg-gray-800 text-white text-[11px] font-bold px-2 py-1 rounded shadow-sm">원두분쇄</span>
                ) : (
                  <span className="bg-gray-200 text-gray-600 text-[11px] font-bold px-2 py-1 rounded">일반배합</span>
                )}
              </div>

              <div className="flex-1 flex flex-col gap-1">
                <input type="text" className="w-full border-none bg-transparent p-1 text-base font-bold text-gray-900 focus:ring-0 placeholder-gray-400 border-b border-transparent focus:border-gray-400" placeholder="원료명 입력 (예: 커피원두 추출액)"
                  value={mat.materialName} onChange={e => {
                    const val = e.target.value;
                    const newMats = [...materials]; 
                    newMats[idx].materialName = val; 
                    newMats[idx].processType = val.includes("원두") ? "grinding" : "mixing";
                    setMaterials(newMats);
                  }}/>
                  <div className="flex items-center gap-2 pl-1">
                    {mat.materialCode ? (
                      <span className="text-[11px] font-mono bg-blue-100 text-blue-800 px-2 py-0.5 rounded border border-blue-200">
                        연결됨: {mat.materialCode}
                      </span>
                    ) : (
                      <span className="text-[11px] bg-red-50 text-red-600 px-2 py-0.5 rounded border border-red-100">
                        품목 미연결 (재고 계산 불가)
                      </span>
                    )}
                    <button 
                      onClick={() => openSearchModal(idx, "material")}
                      className="text-xs font-bold text-gray-600 hover:text-blue-600 flex items-center gap-1"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                      {mat.materialCode ? "변경" : "DB 원료 찾기"}
                    </button>
                  </div>
              </div>

              <div className="w-28 text-black">
                <input type="number" className="w-full border border-gray-300 rounded-lg p-2 text-gray-900 text-right font-mono focus:border-gray-800 outline-none"
                  value={mat.inputQty} onChange={e => {
                    const newMats = [...materials]; newMats[idx].inputQty = Number(e.target.value); setMaterials(newMats);
                  }}/>
              </div>
              <div className="w-24 text-black">
                <select className="w-full border border-gray-300 rounded-lg p-2 text-sm text-gray-900 bg-white focus:border-gray-800 outline-none"
                  value={mat.inputUnit} onChange={e => {
                    const newMats = [...materials]; newMats[idx].inputUnit = e.target.value; setMaterials(newMats);
                  }}>
                  <option value="kg">kg</option>
                  <option value="g">g</option>
                </select>
              </div>
              <div className="w-32 flex items-center gap-2 text-black">
                <span className="text-xs font-bold text-gray-500">오차율±</span>
                <input type="number" className="w-16 border border-gray-300 rounded-lg p-2 text-gray-900 text-center text-sm focus:border-gray-800 outline-none"
                  value={mat.tolerancePercent} onChange={e => {
                    const newMats = [...materials]; newMats[idx].tolerancePercent = Number(e.target.value); setMaterials(newMats);
                  }}/>
                <span className="text-xs text-gray-500">%</span>
              </div>
              <button onClick={() => removeMaterial(idx)} className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-800 p-2 transition-all">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* 2-2. 부자재(포장재) 설정 */}
      <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-200">
        <div className="flex justify-between items-center mb-6 border-b border-gray-100 pb-3">
          <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <span className="bg-gray-100 border border-gray-300 text-gray-700 px-2.5 py-1 rounded text-xs">Step 2-2</span> 
            부자재(포장재) 규격 설정
          </h3>
          <button onClick={addPackaging} className="text-sm bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 font-bold transition-all flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4"></path></svg>
            부자재 추가
          </button>
        </div>
        
        <div className="space-y-4">
          {packagingMaterials.map((pack, idx) => (
            <div key={idx} className="flex gap-3 items-center bg-blue-50/30 p-3 rounded-lg border border-blue-100 group hover:border-blue-300 transition-colors">
              <div className="w-8 h-8 rounded bg-blue-100 text-blue-800 flex items-center justify-center font-bold text-sm">
                {idx + 1}
              </div>
              <div className="w-16 flex justify-center items-center">
                <span className="bg-blue-600 text-white text-[11px] font-bold px-2 py-1 rounded shadow-sm">포장재</span>
              </div>

              <div className="flex-1 flex flex-col gap-1">
                <input type="text" className="w-full border-none bg-transparent p-1 text-base font-bold text-gray-900 focus:ring-0 placeholder-gray-400 border-b border-transparent focus:border-gray-400" placeholder="부자재명 입력 (예: 50포 단상자)"
                  value={pack.materialName} onChange={e => {
                    const newPacks = [...packagingMaterials]; newPacks[idx].materialName = e.target.value; setPackagingMaterials(newPacks);
                  }}/>
                  <div className="flex items-center gap-2 pl-1">
                    {pack.materialCode ? (
                      <span className="text-[11px] font-mono bg-blue-100 text-blue-800 px-2 py-0.5 rounded border border-blue-200">
                        연결됨: {pack.materialCode}
                      </span>
                    ) : (
                      <span className="text-[11px] bg-red-50 text-red-600 px-2 py-0.5 rounded border border-red-100">
                        품목 미연결
                      </span>
                    )}
                    <button 
                      onClick={() => openSearchModal(idx, "packaging")}
                      className="text-xs font-bold text-gray-600 hover:text-blue-600 flex items-center gap-1"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                      {pack.materialCode ? "변경" : "DB 부자재 찾기"}
                    </button>
                  </div>
              </div>

              <div className="w-48 flex items-center gap-2 border border-gray-300 bg-white rounded-lg p-2 text-black">
                <span className="text-xs font-bold text-gray-700 whitespace-nowrap">단위 포장량</span>
                <input type="number" className="w-full border-none text-gray-900 text-right font-mono focus:ring-0 outline-none bg-transparent p-0"
                  placeholder="예: 50"
                  value={pack.packagingUnit || ""} onChange={e => {
                    const newPacks = [...packagingMaterials]; newPacks[idx].packagingUnit = Number(e.target.value); setPackagingMaterials(newPacks);
                  }}/>
                <span className="text-xs text-gray-500 whitespace-nowrap">개/포</span>
              </div>

              <button onClick={() => removePackaging(idx)} className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-800 p-2 transition-all">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
            </div>
          ))}
        </div>
        <div className="mt-3 p-3 bg-gray-50 rounded border border-gray-200 text-xs text-gray-600 font-medium">
          참고: 단위 포장량에는 1개의 부자재에 들어가는 하위 단위의 수량을 입력합니다. (예: 1박스에 10개의 단상자가 들어간다면 카톤박스의 포장량은 '10')
        </div>
      </div>

      {/* 3. 출력 양식(기록서) 선택 */}
      <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-200">
        <div className="flex justify-between items-center mb-6 border-b border-gray-100 pb-3">
          <div>
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2 mb-1">
              <span className="bg-gray-100 border border-gray-300 text-gray-700 px-2.5 py-1 rounded text-xs">Step 3</span> 
              출력 지시서 양식 선택
            </h3>
            <p className="text-sm text-gray-500 font-medium">이 제품 생산 시 현장에 배치할 기록서 양식을 선택합니다. 불필요한 공정은 체크 해제하세요.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-black">
          {AVAILABLE_FORMS.map((form) => (
            <label key={form.id} className={`flex items-start gap-4 p-5 rounded-xl border-2 cursor-pointer transition-all ${
              selectedForms.includes(form.id) 
              ? "border-gray-900 bg-gray-50" 
              : "border-gray-200 bg-white opacity-50 hover:opacity-100"
            }`}>
              <div className="pt-0.5">
                <input 
                  type="checkbox" 
                  className="w-5 h-5 accent-gray-900 rounded border-gray-300 focus:ring-gray-900 cursor-pointer"
                  checked={selectedForms.includes(form.id)}
                  onChange={() => toggleForm(form.id)}
                />
              </div>
              <div>
                <p className="font-bold text-gray-900">{form.name}</p>
                <p className="text-xs text-gray-500 font-medium mt-1 leading-relaxed">{form.desc}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* DB 품목 검색 모달 */}
      {isSearchOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center text-black bg-gray-900/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-lg rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
              <h3 className="font-bold text-gray-900 text-lg">
                {searchTargetType === "product" ? "완제품/상품" : searchTargetType === "packaging" ? "부자재" : "원료"} 검색
              </h3>
              <button onClick={() => setIsSearchOpen(false)} className="text-gray-400 hover:text-gray-900">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
            </div>
            <div className="p-4 border-b border-gray-200">
              <div className="relative">
                <svg className="w-5 h-5 absolute left-3 top-2.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                <input 
                  type="text" 
                  autoFocus
                  placeholder="품목명 또는 코드로 검색..." 
                  value={searchQuery}
                  onChange={handleSearch}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2 bg-gray-50/50">
              {isSearching ? (
                <div className="p-10 text-center text-gray-500 font-bold animate-pulse">DB에서 품목을 불러오는 중...</div>
              ) : filteredProducts.length > 0 ? (
                <ul className="space-y-1">
                  {filteredProducts.slice(0, 50).map((item, i) => (
                    <li key={i}>
                      <button 
                        onClick={() => selectEcountProduct(item.prod_cd, item.prod_nm)}
                        className="w-full text-left p-3 hover:bg-gray-100 rounded-lg flex flex-col border border-transparent hover:border-gray-300 transition-colors"
                      >
                        <span className="font-bold text-gray-900">{item.prod_nm}</span>
                        <span className="text-xs font-mono text-gray-500 mt-1">[{item.prod_cd}] {item.item_type && `- ${item.item_type}`}</span>
                      </button>
                    </li>
                  ))}
                  {filteredProducts.length > 50 && (
                    <li className="p-3 text-center text-xs text-gray-500 font-bold">... 검색 결과가 너무 많습니다. 키워드를 더 입력해 주세요.</li>
                  )}
                </ul>
              ) : (
                <div className="p-10 text-center text-gray-500">검색 결과가 없습니다.</div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
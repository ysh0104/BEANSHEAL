"use client"
import { useState, useEffect, useRef } from "react";
import SignatureCanvas from 'react-signature-canvas';
import { useCanEdit } from "@/hooks/useCanEdit";

import { supabase } from "@/lib/supabase"; 
import { getRecipeList, getRecipeDetails } from "@/app/actions/recipe";
import { saveProductionInboundToEcount } from "@/app/actions/ecount";
import { findStockForMaterial, StockItem } from "@/lib/stockHelper";

import CoverPage from "@/components/CoverPage";
import ManufacturingLog from "@/components/ManufacturingLog";
import WeighingLog from "@/components/WeighingLog";
import ProcessInspection from "@/components/ProcessInspection";
import ExtractionProcessLog from "@/components/ExtractionProcessLog";
import CCPLog from "@/components/CCPLog";
import ShippingApproval from "@/components/ShippingApproval";

// 🌟 MS Excel 원본 라이브 에디터 불러오기
import ExcelViewer from "@/components/ExcelViewer";

// 🌟 마법의 조절기 불러오기
import PrintAdjuster from "@/components/PrintAdjuster"; 
import A4MobileScaler from "@/components/A4MobileScaler";

const ALL_TABS = [
  { id: 'cover', label: '표지', formType: 'cover' },
  { id: 'manufacturing', label: '제조지시기록서', formType: 'manufacturing' },
  { id: 'weighing', label: '원료칭량기록서', formType: 'weighing' },
  { id: 'extraction', label: '추출공정점검표', formType: 'extraction' },
  { id: 'filling', label: '공정검사기록서', formType: 'filling' },
  { id: 'ccp', label: 'CCP-2P 일지', formType: 'ccp' },
  { id: 'shipping', label: '완제품출하승인서', formType: 'shipping' }
];

export default function OrdersPage() {
  const { canEdit } = useCanEdit("production");
  const [orders, setOrders] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [summary, setSummary] = useState({ pending: 0, inProgress: 0, completed: 0 });

  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<string>("표지");
  const [signModal, setSignModal] = useState<{ isOpen: boolean, role: string | null }>({ isOpen: false, role: null });
  const [signatures, setSignatures] = useState<Record<string, string>>({});
  const [isPrinting, setIsPrinting] = useState(false);
  
  // 🌟 기본값: 깔끔한 웹 탭 뷰어 모드 (틀어짐 없는 정갈한 화면)
  const [viewMode, setViewMode] = useState<"excel" | "web">("web");
  
  // 🌟 통합 저장 신호를 자식에게 보내기 위한 스위치
  const [saveTrigger, setSaveTrigger] = useState(0);
  
  const [allowedTabs, setAllowedTabs] = useState<any[]>(ALL_TABS);

  const sigPad = useRef<any>(null);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [recipeList, setRecipeList] = useState<any[]>([]);
  const [selectedRecipe, setSelectedRecipe] = useState<any | null>(null);
  const [targetQty, setTargetQty] = useState<number>(0);
  const [materials, setMaterials] = useState<any[]>([]);
  const [routings, setRoutings] = useState<any[]>([]);

  // 🌟 재고 현황 맵 (품목명 → 현재 재고수량)
  const [inventoryMap, setInventoryMap] = useState<Record<string, number>>({});
  const [loadingInventory, setLoadingInventory] = useState(false);
  
  const [orderDate, setOrderDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [customOrderNumber, setCustomOrderNumber] = useState<string>("");

  useEffect(() => {
    fetchOrders();
  }, []);

  useEffect(() => {
    if (orderDate) {
      const dateString = orderDate.replace(/-/g, '').slice(2);
      const randomStr = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
      setCustomOrderNumber(`${dateString}-${randomStr}`); 
    }
  }, [orderDate]);

  const fetchOrders = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('production_orders')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const formattedOrders = data.map(order => ({
        id: order.id,
        orderNumber: order.order_number,
        itemName: order.item_name,
        qty: order.target_qty,
        rawStatus: order.status,
        date: order.order_date,
        recipeId: order.recipe_id 
      }));

      const todayString = new Date().toISOString().split('T')[0];

      let pendingCount = 0;
      let inProgressCount = 0;
      let completedCount = 0;

      const displayOrders = formattedOrders.map(order => {
        let displayStatus = "";

        if (order.rawStatus === 'COMPLETED') {
          displayStatus = "완료";
          completedCount++;
        } else if (order.date > todayString) {
          displayStatus = "대기중";
          pendingCount++;
        } else {
          displayStatus = "진행중";
          inProgressCount++;
        }

        return { ...order, status: displayStatus };
      });

      setOrders(displayOrders);
      setSummary({ pending: pendingCount, inProgress: inProgressCount, completed: completedCount });

    } catch (error: any) {
      console.error(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const openCreateModal = async () => {
    setIsCreateModalOpen(true);
    setOrderDate(new Date().toISOString().split('T')[0]);
    // 레시피 목록 + 재고 현황 병렬 로드
    setLoadingInventory(true);
    const [recipeResult, invResult] = await Promise.all([
      getRecipeList(),
      supabase.from('ecount_items').select('prod_cd, prod_nm, total_qty'),
    ]);
    if (recipeResult.success) setRecipeList(recipeResult.data);
    if (!invResult.error && invResult.data) {
      setStockItemsList(
        invResult.data.map((item: any) => ({
          prod_cd: String(item.prod_cd || '').trim(),
          prod_nm: String(item.prod_nm || '').trim(),
          total_qty: Number(item.total_qty || 0),
        }))
      );
    }
    setLoadingInventory(false);
  };

  const closeCreateModal = () => {
    setIsCreateModalOpen(false); setSelectedRecipe(null); setTargetQty(0); setMaterials([]); setRoutings([]);
  };

  const handleRecipeChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const recipeId = e.target.value;
    if (!recipeId) return;
    const recipe = recipeList.find(r => r.id === recipeId);
    setSelectedRecipe(recipe);
    setTargetQty(recipe.base_batch_size);

    const details = await getRecipeDetails(recipeId);
    if (details.success) {
      setMaterials(details.materials);
      setRoutings(details.routings);
    }
  };

  const calculateInput = (baseInputQty: number) => {
    if (!selectedRecipe || !targetQty) return 0;
    const ratio = targetQty / selectedRecipe.base_batch_size;
    const calculated = baseInputQty * ratio;
    return Number.isInteger(calculated) ? calculated : calculated.toFixed(2);
  };

  const handleCreateOrder = async () => {
    if (!selectedRecipe || !targetQty || !orderDate || !customOrderNumber) {
      return alert("지시번호, 제품, 수량, 지시일을 모두 확인해주세요.");
    }

    try {
      const { error } = await supabase.from('production_orders').insert({
        order_number: customOrderNumber,
        item_name: selectedRecipe.product_name,
        target_qty: targetQty,
        status: 'PENDING', 
        order_date: orderDate,
        recipe_id: selectedRecipe.id
      });

      if (error) { 
        if (error.code === '23505') {
          alert("이미 존재하는 지시번호(제조번호)입니다. 번호를 변경해주세요.");
        } else {
          alert(`저장 실패: ${error.message}`); 
        }
        return; 
      }

      alert(`[${customOrderNumber}] 발행 완료되었습니다.`);
      closeCreateModal();
      fetchOrders();
    } catch (err: any) { alert(`에러: ${err.message}`); }
  };

  const openModal = async (order: any) => { 
    setSelectedOrder(order); 
    setActiveTab("표지"); 
    
    if (order.recipeId) {
      const details = await getRecipeDetails(order.recipeId);
      if (details.success && details.routings) {
        const allowedFormTypes = ['cover', 'manufacturing', ...details.routings.map((r:any) => r.form_type)];
        const filteredTabs = ALL_TABS.filter(tab => allowedFormTypes.includes(tab.formType));
        setAllowedTabs(filteredTabs);
      } else {
        setAllowedTabs(ALL_TABS); 
      }
    } else {
      setAllowedTabs(ALL_TABS); 
    }
  };

  const closeModal = () => { setSelectedOrder(null); setSignatures({}); };

  // 🌟 원본 엑셀 자동 채움 100% 원클릭 다운로드
  const handleDirectExcelDownload = async () => {
    if (!selectedOrder) return;
    try {
      const res = await fetch("/api/export-excel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: selectedOrder }),
      });
      if (!res.ok) throw new Error("엑셀 파일 생성 실패");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `제조지시기록서_${selectedOrder?.itemName || "세리컷프레소V2"}_${selectedOrder?.date || "20260409"}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      alert("엑셀 다운로드 오류: " + err.message);
    }
  };
  
  const handleCompleteOrder = async () => {
    if (!selectedOrder) return;
    if (!window.confirm("이 제조지시서를 완료 처리하시겠습니까?\n완료 후에는 수정이 제한될 수 있습니다.")) return;

    try {
      const { error } = await supabase
        .from('production_orders')
        .update({ status: 'COMPLETED' })
        .eq('id', selectedOrder.id);

      if (error) throw error;

      // 완료 후 이카운트 생산입고 전송 여부 확인
      let prodCd = "";
      if (selectedOrder.recipeId) {
        const details = await getRecipeDetails(selectedOrder.recipeId);
        prodCd = details.baseInfo?.product_code || "";
      }
      if (!prodCd && selectedOrder.itemName) {
        const { data: matched } = await supabase
          .from("ecount_items")
          .select("prod_cd, prod_nm")
          .ilike("prod_nm", `%${selectedOrder.itemName}%`)
          .limit(5);
        if (matched?.length === 1) {
          prodCd = matched[0].prod_cd;
        } else if (matched && matched.length > 1) {
          const exact = matched.find((m) =>
            m.prod_nm?.replace(/^[원부자반]\)\s*/, "").includes(selectedOrder.itemName)
          );
          prodCd = exact?.prod_cd || matched[0].prod_cd;
        }
      }

      if (prodCd) {
        const qty = Number(selectedOrder.qty || selectedOrder.targetQty || selectedOrder.target_qty || 0);
        if (
          qty > 0 &&
          window.confirm(
            `완료되었습니다.\n이카운트 생산입고 전표도 전송할까요?\n품목: ${prodCd} / 수량: ${qty}`
          )
        ) {
          const inbound = await saveProductionInboundToEcount({
            PROD_CD: prodCd,
            QTY: qty,
            WH_CD_F: "100",
            WH_CD_T: "100",
          });
          if (inbound.success) {
            alert(`생산입고 성공\n전표번호: ${inbound.slipNo}`);
          } else {
            alert(`생산입고 실패: ${inbound.error}\n(완료 처리는 유지됩니다)`);
          }
        } else {
          alert("작업이 완료 처리되었습니다.");
        }
      } else {
        alert(
          "작업이 완료 처리되었습니다.\n(레시피에 이카운트 품목코드가 없어 생산입고는 건너뜁니다. 재고 화면에서 수동 입고 가능)"
        );
      }

      closeModal();
      fetchOrders();
    } catch (err: any) {
      alert(`상태 변경 에러: ${err.message}`);
    }
  };

  const handleDeleteOrder = async () => {
    if (!selectedOrder) return;
    if (!window.confirm("이 제조지시서를 정말 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.")) return;

    try {
      const { error } = await supabase
        .from('production_orders')
        .delete()
        .eq('id', selectedOrder.id);

      if (error) throw error;

      alert("지시서가 성공적으로 삭제되었습니다.");
      closeModal();
      fetchOrders();
    } catch (err: any) {
      alert(`삭제 중 에러가 발생했습니다: ${err.message}`);
    }
  };

  const openSignModal = (role: string) => setSignModal({ isOpen: true, role });
  const closeSignModal = () => setSignModal({ isOpen: false, role: null });
  const clearSignature = () => sigPad.current?.clear();
  const saveSignature = () => {
    if (sigPad.current && !sigPad.current.isEmpty()) {
      setSignatures(prev => ({ ...prev, [signModal.role as string]: sigPad.current.getTrimmedCanvas().toDataURL('image/png') }));
      closeSignModal();
    }
  };
  
  const handleDownloadAllPDF = async () => { 
    setIsPrinting(true);

    const printElement = document.getElementById("print-container");
    if (!printElement) {
      setIsPrinting(false);
      return;
    }

    printElement.querySelectorAll("input").forEach((input: any) => {
      if (input.type === "checkbox" || input.type === "radio") {
        if (input.checked) input.setAttribute("checked", "checked");
        else input.removeAttribute("checked");
      } else {
        input.setAttribute("value", input.value || "");
      }
    });

    printElement.querySelectorAll("textarea").forEach((ta: any) => {
      ta.innerHTML = ta.value || "";
    });

    const printHTML = printElement.innerHTML;
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert("팝업이 차단되었습니다. 브라우저 주소창 우측에서 팝업 차단을 해제해주세요.");
      setIsPrinting(false);
      return;
    }

    const title = `${selectedOrder?.itemName}_제조기록서_통합본_${selectedOrder?.orderNumber}`;
    
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${title}</title>
          <script src="https://cdn.tailwindcss.com"></script>
          <style>
            @page { 
              size: A4 portrait; 
              margin: 0; 
            }
            body { 
              background: white; 
              margin: 0; 
              padding: 0;
              width: 100%;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            @media print {
              .no-print { display: none !important; }
            }
            .print-page-break { 
              page-break-after: always; 
              break-after: page;
              margin: 0;
              padding: 0;
            }
            input, textarea { 
              background: transparent !important; 
              border: none !important; 
              outline: none !important; 
              text-align: center; 
              color: black !important; 
              font-weight: bold;
              resize: none;
            }
          </style>
        </head>
        <body>
          ${printHTML}
          <script>
            window.onload = function() {
              setTimeout(function() { 
                window.print(); 
                window.close(); 
              }, 1500);
            };
          </script>
        </body>
      </html>
    `);
    
    printWindow.document.close();
    setIsPrinting(false);
  };

  return (
    <div className="relative min-h-screen bg-gray-50">

      {/* 평소 화면 UI 시작 */}
      <div className="max-w-[1920px] mx-auto space-y-6 p-2 sm:p-4 md:p-6 no-print">
        
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4 pb-4 border-b border-gray-200">
          <div className="min-w-0">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">제조지시기록서 관리</h2>
            <p className="text-sm text-gray-500 mt-1">HACCP/GMP 규격에 맞춘 공정 기록 및 전자서명을 관리합니다.</p>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <button onClick={fetchOrders} className="bg-white border border-gray-300 text-gray-700 text-sm px-4 py-2.5 font-bold shadow-sm hover:bg-gray-50 flex items-center gap-1">
              새로고침
            </button>
            <button onClick={openCreateModal} className="bg-blue-600 text-white text-sm px-6 py-2.5 font-bold shadow-sm hover:bg-blue-700 flex items-center gap-1">
              새 지시서 발행
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-white border border-gray-300 p-5 shadow-sm border-l-4 border-l-gray-400">
            <p className="text-sm font-semibold text-gray-500">대기중인 지시 (내일 이후)</p>
            <p className="text-2xl font-extrabold text-gray-900 mt-1">
              {summary.pending} <span className="text-sm font-medium text-gray-500">건</span>
            </p>
          </div>
          <div className="bg-white border border-gray-300 p-5 shadow-sm border-l-4 border-l-blue-600">
            <p className="text-sm font-semibold text-blue-600">진행중인 공정 (당일 이전)</p>
            <p className="text-2xl font-extrabold text-gray-900 mt-1">
              {summary.inProgress} <span className="text-sm font-medium text-gray-500">건</span>
            </p>
          </div>
          <div className="bg-white border border-gray-300 p-5 shadow-sm border-l-4 border-l-green-600">
            <p className="text-sm font-semibold text-green-600">금일 완료 (QA 대기)</p>
            <p className="text-2xl font-extrabold text-gray-900 mt-1">
              {summary.completed} <span className="text-sm font-medium text-gray-500">건</span>
            </p>
          </div>
        </div>

        {/* 모바일 카드 목록 */}
        <div className="md:hidden space-y-3 min-h-[200px] relative">
          {isLoading && (
            <div className="absolute inset-0 bg-white/80 flex items-center justify-center z-10 rounded-lg">
              <span className="text-gray-500 font-bold text-sm">데이터 불러오는 중...</span>
            </div>
          )}
          {orders.map((order) => (
            <article
              key={order.id}
              className="bg-white border border-gray-300 rounded-xl p-4 shadow-sm active:bg-blue-50/30 transition-colors"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <p className="font-bold text-gray-600 text-sm">{order.orderNumber}</p>
                <span className={`inline-block px-2.5 py-0.5 text-[11px] font-bold border shrink-0 ${
                  order.rawStatus === 'COMPLETED' ? 'bg-green-50 text-green-700 border-green-200' : 
                  order.status === '진행중' ? 'bg-blue-50 text-blue-700 border-blue-200' : 
                  'bg-gray-100 text-gray-700 border-gray-300'
                }`}>
                  {order.status}
                </span>
              </div>
              <p className="font-extrabold text-gray-900 text-base mb-1">{order.itemName}</p>
              <div className="flex items-center justify-between text-sm mb-3">
                <span className="text-gray-500">{order.date}</span>
                <span className="font-extrabold text-blue-600">{order.qty.toLocaleString()}</span>
              </div>
              <button
                onClick={() => openModal(order)}
                className="w-full py-2.5 bg-white border border-gray-300 text-gray-700 text-sm font-bold rounded-lg hover:bg-gray-50 hover:text-blue-600 transition-colors"
              >
                기록 작성 / 조회
              </button>
            </article>
          ))}
          {orders.length === 0 && !isLoading && (
            <p className="text-center py-10 text-gray-400 text-sm">발행된 지시서가 없습니다.</p>
          )}
        </div>

        <div className="hidden md:block bg-white border border-gray-300 shadow-sm overflow-hidden min-h-[200px] relative overflow-x-auto">
          {isLoading && (
            <div className="absolute inset-0 bg-white/80 flex items-center justify-center z-10">
              <span className="text-gray-500 font-bold">데이터 불러오는 중...</span>
            </div>
          )}
          <table className="w-full text-left text-sm min-w-[640px]">
            <thead className="bg-gray-100 border-b border-gray-300 text-gray-700">
              <tr>
                <th className="px-6 py-4 font-bold uppercase tracking-wider text-xs">지시 번호 (Lot)</th>
                <th className="px-6 py-4 font-bold uppercase tracking-wider text-xs">생산 품목</th>
                <th className="px-6 py-4 font-bold uppercase tracking-wider text-xs text-right">지시 수량</th>
                <th className="px-6 py-4 font-bold uppercase tracking-wider text-xs text-center">진행 상태</th>
                <th className="px-6 py-4 font-bold uppercase tracking-wider text-xs">지시 일자</th>
                <th className="px-6 py-4 font-bold uppercase tracking-wider text-xs text-center">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 text-gray-800">
              {orders.map((order) => (
                <tr key={order.id} className="hover:bg-blue-50/50 transition-colors">
                  <td className="px-6 py-4 font-bold text-gray-600">{order.orderNumber}</td>
                  <td className="px-6 py-4 font-bold text-gray-900">{order.itemName}</td>
                  <td className="px-6 py-4 font-extrabold text-blue-600 text-right text-base">{order.qty.toLocaleString()}</td>
                  <td className="px-6 py-4 text-center">
                    <span className={`inline-block px-3 py-1 text-xs font-bold border ${
                      order.rawStatus === 'COMPLETED' ? 'bg-green-50 text-green-700 border-green-200' : 
                      order.status === '진행중' ? 'bg-blue-50 text-blue-700 border-blue-200' : 
                      'bg-gray-100 text-gray-700 border-gray-300'
                    }`}>
                      {order.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-gray-500 font-medium">{order.date}</td>
                  <td className="px-6 py-4 text-center">
                    <button onClick={() => openModal(order)} className="px-3 py-1.5 bg-white border border-gray-300 text-gray-700 text-xs font-bold hover:bg-gray-50 hover:text-blue-600 transition-colors shadow-sm">
                      기록 작성 / 조회
                    </button>
                  </td>
                </tr>
              ))}
              {orders.length === 0 && !isLoading && (
                <tr><td colSpan={6} className="text-center py-10 text-gray-400">발행된 지시서가 없습니다. 우측 상단에서 새 지시서를 발행해주세요.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div> 

      {/* 새 지시서 발행 모달 */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-gray-900/40 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-gray-50 shadow-2xl w-full sm:max-w-5xl flex flex-col h-full sm:h-auto sm:max-h-[90vh] rounded-none sm:rounded-xl overflow-hidden border-0 sm:border border-gray-300">
            <div className="flex justify-between items-center bg-white border-b border-gray-200 px-6 py-4">
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">새 스마트 제조지시서 발행</h2>
              <button onClick={closeCreateModal} className="text-gray-400 hover:text-gray-700 font-bold text-2xl transition-colors">&times;</button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col gap-6">
                <div className="flex flex-col md:flex-row md:items-start gap-4 md:gap-6 border-b border-gray-100 pb-6">
                   <div className="w-full md:w-1/3">
                    <label className="block text-sm font-bold text-gray-800 mb-2">지시 일자 (생산 예정일)</label>
                    <input 
                      type="date" 
                      className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm font-bold text-gray-800 bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none"
                      value={orderDate}
                      onChange={(e) => setOrderDate(e.target.value)}
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-sm font-bold text-gray-800 mb-2">지시 번호 (제조번호/Lot No.)</label>
                    <input 
                      type="text" 
                      className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-base font-bold text-blue-700 bg-blue-50 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 outline-none tracking-wider"
                      value={customOrderNumber}
                      onChange={(e) => setCustomOrderNumber(e.target.value)}
                      placeholder="예: 260328-001"
                    />
                    <p className="text-xs text-gray-500 mt-2 font-medium">※ 입력된 번호가 모든 공정 기록서의 '제조번호'로 매핑됩니다. 직접 수정 가능합니다.</p>
                  </div>
                </div>

                <div className="flex flex-col md:flex-row md:items-start gap-4 md:gap-6">
                  <div className="flex-1 min-w-0">
                    <label className="block text-sm font-bold text-gray-800 mb-2">생산 제품 (레시피 선택)</label>
                    <select 
                      className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm font-bold text-gray-800 bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none"
                      onChange={handleRecipeChange}
                      defaultValue=""
                    >
                      <option value="" disabled>제품을 선택해주세요</option>
                      {recipeList.map(recipe => (
                        <option key={recipe.id} value={recipe.id}>
                          {recipe.product_name} (기준: {recipe.base_batch_size}{recipe.base_unit})
                        </option>
                      ))}
                    </select>
                  </div>
                  {selectedRecipe && (
                    <div className="w-full md:w-1/3">
                      <label className="block text-sm font-bold text-blue-600 mb-2">목표 생산량 ({selectedRecipe.base_unit})</label>
                      <input 
                        type="number" 
                        className="w-full border border-blue-400 rounded-md px-3 py-2.5 text-right font-black text-blue-700 text-base bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={targetQty} 
                        onChange={e => setTargetQty(Number(e.target.value))}
                      />
                    </div>
                  )}
                </div>
              </div>

              {selectedRecipe && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* 왼쪽: 필요 원료 칭량 + 재고 현황 연동 */}
                  <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                    <h3 className="text-sm font-bold text-gray-800 mb-1 flex items-center gap-2">필요 원료 칭량 (자동계산)</h3>
                    <p className="text-xs text-gray-400 mb-3 font-medium">
                      {loadingInventory ? '재고 현황 불러오는 중...' : '현재 재고 기준 부족 수량 자동 표시'}
                    </p>
                    <div className="space-y-2 max-h-72 overflow-y-auto">
                      {/* 헤더 */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 px-3 py-1 text-[10px] font-bold text-gray-400 uppercase tracking-wide">
                        <span className="col-span-1">원료명</span>
                        <span className="text-right">필요량</span>
                        <span className="text-right">현재재고</span>
                        <span className="text-right">부족수량</span>
                      </div>
                      {materials.map((mat, idx) => {
                        const isWater = mat.material_name && mat.material_name.includes("정제수");
                        const needed = Number(calculateInput(mat.input_qty));
                        const matchRes = findStockForMaterial(
                          { name: mat.material_name, materialCode: mat.material_code },
                          stockItemsList
                        );
                        const currentStock = isWater ? "자가수급" : (matchRes.matched ? matchRes.qty : null);
                        const shortage = isWater ? 0 : (typeof currentStock === 'number' ? needed - currentStock : null);
                        const isShort = shortage !== null && shortage > 0;
                        const isOk = isWater || (shortage !== null && shortage <= 0);
                        return (
                          <div key={idx} className={`grid grid-cols-2 sm:grid-cols-4 gap-1 items-center p-3 rounded-md border ${
                            isShort ? 'bg-red-50 border-red-200' : isOk ? 'bg-emerald-50 border-emerald-200' : 'bg-gray-50 border-gray-100'
                          }`}>
                            <span className="col-span-1 font-bold text-gray-700 text-xs leading-tight">{mat.material_name}</span>
                            <div className="text-right">
                              <span className="text-base font-black text-blue-700">{calculateInput(mat.input_qty)}</span>
                              <span className="text-[10px] font-bold text-gray-400 ml-0.5">{mat.input_unit}</span>
                            </div>
                            <div className="text-right">
                              {typeof currentStock === 'number' ? (
                                <span className={`text-sm font-bold ${isOk ? 'text-emerald-600' : 'text-orange-500'}`}>
                                  {currentStock.toLocaleString('ko-KR', { minimumFractionDigits: 0, maximumFractionDigits: 3 })}
                                </span>
                              ) : (
                                <span className="text-xs font-bold text-blue-600">{currentStock || "미연동"}</span>
                              )}
                            </div>
                            <div className="text-right">
                              {shortage !== null ? (
                                isShort ? (
                                  <span className="text-sm font-black text-red-600">▲ {shortage.toLocaleString('ko-KR', { minimumFractionDigits: 0, maximumFractionDigits: 3 })}</span>
                                ) : (
                                  <span className="text-sm font-bold text-emerald-500">✓ 충분</span>
                                )
                              ) : (
                                <span className="text-xs text-gray-300">-</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {/* 재고 부족 원료 요약 */}
                    {materials.some((mat) => {
                      if (mat.material_name && mat.material_name.includes("정제수")) return false;
                      const needed = Number(calculateInput(mat.input_qty));
                      const matchRes = findStockForMaterial(
                        { name: mat.material_name, materialCode: mat.material_code },
                        stockItemsList
                      );
                      const currentStock = matchRes.matched ? matchRes.qty : null;
                      return currentStock !== null && needed > currentStock;
                    }) && (
                      <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                        <p className="text-xs font-bold text-red-700">⚠ 재고 부족 원료가 있습니다. 발주가 필요합니다.</p>
                      </div>
                    )}
                  </div>
                  <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                    <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">출력 예정 지시서 폼</h3>
                    <div className="space-y-3 max-h-72 overflow-y-auto">
                      {routings.map((route, idx) => (
                        <div key={idx} className="flex items-center gap-4 border border-gray-100 p-3 rounded-md">
                          <div className="w-6 h-6 rounded-full bg-slate-800 text-white flex items-center justify-center font-bold text-xs shrink-0">{idx + 1}</div>
                          <span className="font-bold text-gray-800">{route.process_name}</span>
                          <span className="ml-auto text-xs font-bold text-purple-600 bg-purple-50 px-2 py-1 rounded border border-purple-100">{route.form_type}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            <div className="p-4 border-t border-gray-200 bg-white flex justify-end gap-3">
              <button onClick={closeCreateModal} className="px-6 py-2.5 bg-white border border-gray-300 text-gray-700 font-bold rounded-lg hover:bg-gray-50 transition">취소</button>
              <button 
                onClick={handleCreateOrder} 
                disabled={!selectedRecipe} 
                className={`px-6 py-2.5 font-bold rounded-lg transition-all flex items-center gap-2 ${selectedRecipe ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}`}
              >
                지시서 확정 및 발행
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 기록 뷰어 모달 */}
      {selectedOrder && (
        <div className="fixed inset-0 bg-gray-900/60 flex items-end sm:items-center justify-center z-40 p-0 sm:p-4">
          <div className="bg-gray-100 shadow-2xl w-full sm:max-w-5xl flex flex-col h-full sm:h-[95vh] border-0 sm:border-2 border-black rounded-none sm:rounded-none">
            
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end bg-[#e2e8f0] border-b border-gray-400 pt-2 sm:pt-3 px-2 sm:px-3 shrink-0">
              <div className="flex overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] w-full sm:mr-4 order-2 sm:order-1">
                {allowedTabs.map((tab) => (
                  <button 
                    key={tab.id}
                    onClick={() => setActiveTab(tab.label)}
                    className={`whitespace-nowrap px-4 py-2.5 text-[14px] font-bold border-t border-l border-r rounded-t-md mr-1 transition-colors ${
                      activeTab === tab.label 
                      ? "bg-white border-gray-400 text-black border-b-transparent translate-y-[1px]" 
                      : "bg-[#cbd5e1] border-gray-400 text-gray-500 hover:bg-[#94a3b8] hover:text-white"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              
              <div className="flex items-center justify-end gap-2 sm:gap-3 pb-2 shrink-0 order-1 sm:order-2 w-full sm:w-auto">
                <button 
                  onClick={handleDownloadAllPDF}
                  disabled={isPrinting}
                  className={`${isPrinting ? 'bg-gray-500' : 'bg-blue-800 hover:bg-blue-900'} text-white px-3 sm:px-4 py-2 text-[12px] sm:text-[13px] font-bold rounded shadow-sm transition-colors flex items-center gap-1 whitespace-nowrap`}
                >
                  {isPrinting ? "PDF 준비중..." : "PDF 인쇄"}
                </button>
                <button onClick={closeModal} className="text-gray-500 hover:text-black font-bold text-2xl pb-0.5 px-2">&times;</button>
              </div>
            </div>

            <div className="overflow-y-auto flex-1 bg-gray-100 min-h-0">
              <div className="p-2 sm:p-8 flex justify-center">
                {activeTab === "표지" && (
                  <A4MobileScaler><CoverPage selectedOrder={selectedOrder} signatures={signatures} openSignModal={openSignModal} saveTrigger={saveTrigger} /></A4MobileScaler>
                )}
                {activeTab === "제조지시기록서" && (
                  <A4MobileScaler><ManufacturingLog selectedOrder={selectedOrder} signatures={signatures} openSignModal={openSignModal} saveTrigger={saveTrigger} /></A4MobileScaler>
                )}
                {activeTab === "원료칭량기록서" && allowedTabs.find(t=>t.label==="원료칭량기록서") && (
                  <A4MobileScaler><WeighingLog selectedOrder={selectedOrder} signatures={signatures} openSignModal={openSignModal} saveTrigger={saveTrigger} /></A4MobileScaler>
                )}
                {activeTab === "공정검사기록서" && allowedTabs.find(t=>t.label==="공정검사기록서") && (
                  <A4MobileScaler><ProcessInspection selectedOrder={selectedOrder} signatures={signatures} openSignModal={openSignModal} saveTrigger={saveTrigger} /></A4MobileScaler>
                )}
                
                {activeTab === "추출공정점검표" && allowedTabs.find(t=>t.label==="추출공정점검표") && (
                  <PrintAdjuster formId="extraction_handdrip">
                    <ExtractionProcessLog selectedOrder={selectedOrder} signatures={signatures} openSignModal={openSignModal} saveTrigger={saveTrigger} />
                  </PrintAdjuster>
                )}
                
                {activeTab === "CCP-2P 일지" && allowedTabs.find(t=>t.label==="CCP-2P 일지") && (
                  <A4MobileScaler><CCPLog selectedOrder={selectedOrder} signatures={signatures} openSignModal={openSignModal} saveTrigger={saveTrigger} /></A4MobileScaler>
                )}
                {activeTab === "완제품출하승인서" && allowedTabs.find(t=>t.label==="완제품출하승인서") && (
                  <A4MobileScaler><ShippingApproval selectedOrder={selectedOrder} signatures={signatures} openSignModal={openSignModal} saveTrigger={saveTrigger} /></A4MobileScaler>
                )}
              </div>
            </div>
            
            <div className="p-3 sm:p-4 border-t border-gray-400 bg-white flex flex-col sm:flex-row sm:justify-between gap-3 shrink-0">
              <div className="order-2 sm:order-1">
                <button 
                  onClick={handleDeleteOrder} 
                  className="w-full sm:w-auto px-4 py-2.5 text-red-600 font-bold border border-red-200 hover:bg-red-50 shadow-sm transition rounded text-sm"
                >
                  지시서 삭제
                </button>
              </div>

              <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center order-1 sm:order-2">
                <button 
                  onClick={() => setSaveTrigger(prev => prev + 1)}
                  className="px-4 sm:px-6 py-2.5 bg-slate-800 text-white font-bold hover:bg-slate-900 shadow-sm transition rounded text-sm"
                >
                  현재 탭 저장
                </button>

                {selectedOrder.rawStatus !== 'COMPLETED' && (
                  <button 
                    onClick={handleCompleteOrder} 
                    className="px-4 sm:px-6 py-2.5 bg-blue-600 text-white font-bold hover:bg-blue-700 shadow-sm transition rounded text-sm"
                  >
                    작업 완료 처리
                  </button>
                )}
                <button onClick={closeModal} className="px-4 sm:px-6 py-2.5 bg-white border border-gray-400 text-gray-700 font-bold hover:bg-gray-100 shadow-sm transition rounded text-sm">
                  닫기
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 서명 모달 */}
      {signModal.isOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-white border-2 border-black shadow-2xl w-full max-w-md">
            <div className="bg-black text-white p-3 font-bold text-center">결재 서명 ({signModal.role})</div>
            <div className="p-4 flex justify-center bg-gray-50">
              <div className="border-2 border-dashed border-gray-400 bg-white">
                <SignatureCanvas ref={sigPad} canvasProps={{width: 350, height: 200, className: 'sigCanvas'}} penColor="black" />
              </div>
            </div>
            <div className="p-3 border-t border-gray-400 bg-gray-100 flex justify-between">
              <button onClick={clearSignature} className="px-4 py-2 bg-white border border-gray-500 font-bold hover:bg-gray-50">지우기</button>
              <div className="flex gap-2">
                <button onClick={closeSignModal} className="px-4 py-2 bg-gray-300 font-bold hover:bg-gray-400">취소</button>
                <button onClick={saveSignature} className="px-4 py-2 bg-blue-800 text-white font-bold hover:bg-blue-900">서명 완료</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 새 창 인쇄를 위해 뒤에 조용히 7장을 렌더링해두는 컨테이너 */}
      {selectedOrder && (
        <div id="print-container" style={{ display: 'none' }}>
           <div className="print-page-break">
             <CoverPage selectedOrder={selectedOrder} signatures={signatures} />
           </div>
           <div className="print-page-break">
             <ManufacturingLog selectedOrder={selectedOrder} signatures={signatures} />
           </div>
           {allowedTabs.find(t=>t.label==="원료칭량기록서") && (
             <div className="print-page-break">
               <WeighingLog selectedOrder={selectedOrder} signatures={signatures} />
             </div>
           )}
           {allowedTabs.find(t=>t.label==="공정검사기록서") && (
             <div className="print-page-break">
               <ProcessInspection selectedOrder={selectedOrder} signatures={signatures} />
             </div>
           )}
           {allowedTabs.find(t=>t.label==="추출공정점검표") && (
             <div className="print-page-break">
               <PrintAdjuster formId="extraction_handdrip">
                 <ExtractionProcessLog selectedOrder={selectedOrder} signatures={signatures} />
               </PrintAdjuster>
             </div>
           )}
           {allowedTabs.find(t=>t.label==="CCP-2P 일지") && (
             <div className="print-page-break">
               <CCPLog selectedOrder={selectedOrder} signatures={signatures} />
             </div>
           )}
           {allowedTabs.find(t=>t.label==="완제품출하승인서") && (
             <div className="print-page-break">
               <ShippingApproval selectedOrder={selectedOrder} signatures={signatures} />
             </div>
           )}
        </div>
      )}
    </div>
  );
}
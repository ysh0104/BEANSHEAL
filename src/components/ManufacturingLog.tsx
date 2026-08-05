"use client"
import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { getRecipeList, getRecipeDetails } from "@/app/actions/recipe";
import { getSessionId, getRecentPurchases } from "@/app/actions/ecount";

export default function ManufacturingLog({ selectedOrder, signatures, openSignModal }: any) {
const [dbRecipe, setDbRecipe] = useState<any[]>([]);
const [isLoadingRecipe, setIsLoadingRecipe] = useState(true);
const [subMaterials, setSubMaterials] = useState<any[]>([]); 
  
const [isCoffeeProcess, setIsCoffeeProcess] = useState(false);
const [foodTypeStr, setFoodTypeStr] = useState("건강기능식품");

const [orderStatus, setOrderStatus] = useState<"대기" | "발행" | "완료">("대기");
const [isProcessing, setIsProcessing] = useState(false);


// 🌟 [핵심 변경] 브라우저 캐시를 강제로 비우기 위해 저장소 이름을 _v2로 바꿨습니다!
const storageKey = `order_${selectedOrder?.id || 'temp'}_mfg_v2`;

const [formData, setFormData] = useState<Record<string, any>>(() => {
if (typeof window !== "undefined") {
const saved = localStorage.getItem(storageKey);
if (saved) return JSON.parse(saved);
}
return {};
});

const docNum = selectedOrder?.orderNumber || formData.docNum || `WO-${Date.now().toString().slice(-6)}`;
const targetDate = selectedOrder?.date || formData.fillDateStr || new Date().toISOString().split('T')[0];

useEffect(() => {
async function checkOrderStatus() {
const { data, error } = await supabase
.from('inventory_adjustments')
.select('status')
.eq('work_order_no', docNum)
.limit(1);

if (data && data.length > 0) {
setOrderStatus(data[0].status as "발행" | "완료");
}
}
if (docNum) checkOrderStatus();
}, [docNum]);

useEffect(() => {
async function fetchRealRecipe() {
setIsLoadingRecipe(true);
try {
if (selectedOrder?.recipeId) {
const listRes = await getRecipeList();
let baseBatchSize = 1350;
if (listRes.success) {
const matchingRecipe = listRes.data.find((r: any) => r.id === selectedOrder.recipeId);
if (matchingRecipe && matchingRecipe.base_batch_size) {
baseBatchSize = matchingRecipe.base_batch_size;
}
}

const detailsRes = await getRecipeDetails(selectedOrder.recipeId);
if (detailsRes.success && detailsRes.materials && detailsRes.materials.length > 0) {
setIsCoffeeProcess(detailsRes.baseInfo?.is_coffee || false);
setFoodTypeStr(detailsRes.baseInfo?.food_type || "건강기능식품");

const targetQty = selectedOrder?.qty || baseBatchSize;
const ratioMultiplier = targetQty / baseBatchSize;

const calculated = detailsRes.materials
.filter((mat: any) => mat.material_type !== '부자재')
.map((mat: any) => {
const baseQty = Number(mat.input_qty);
const calculatedBase = baseQty * ratioMultiplier;
const percentage = ((baseQty / baseBatchSize) * 100).toFixed(2);

let pType = "mixing";
if (mat.material_name.includes("원두") && !mat.material_name.includes("추출액") && !mat.material_name.includes("농축액")) {
pType = "grinding";
}

return {
name: mat.material_name,
materialCode: mat.material_code,
ratio: `${percentage}%`,
calculatedBase: isNaN(calculatedBase) ? 0 : Number(calculatedBase.toFixed(2)),
processType: pType
};
});
setDbRecipe(calculated);
}
}
} catch (err: any) {
console.error("레시피 로딩 실패:", err.message);
setDbRecipe([]);
} finally {
setIsLoadingRecipe(false);
}
}

fetchRealRecipe();
}, [selectedOrder?.recipeId, selectedOrder?.itemName, selectedOrder?.qty]);

const grindingMat = dbRecipe.find(m => m.processType === 'grinding');
const grindingName = grindingMat ? grindingMat.name : "커피원두";
const mixingList = dbRecipe
.map((mat, idx) => ({ ...mat, originalIndex: idx }))
.filter(m => m.processType !== 'grinding');

useEffect(() => {
async function autoFillData() {
if (dbRecipe.length === 0) return;

const getStrictName = (name: string) => {
if (!name) return "";
return name
.replace(/^[원부자반]\)\s*/, '')
.replace(/\[.*?\]/g, '')
.replace(/\s+/g, '')
.toLowerCase();
};

let autoFilledData: Record<string, any> = {};
let isModified = false;

dbRecipe.forEach((mat, idx) => {
if (mat.processType === 'grinding') {
if (formData.coffeeBase === undefined || formData.coffeeBase === "") {
autoFilledData.coffeeBase = mat.calculatedBase;
isModified = true;
}
} else {
const useKey = `matUse_${idx}`;
if (formData[useKey] === undefined || formData[useKey] === "") {
autoFilledData[useKey] = mat.calculatedBase;
isModified = true;
}
}
});

if (isCoffeeProcess && (formData.coffeeUse === undefined || formData.coffeeUse === "")) {
const cBase = autoFilledData.coffeeBase ?? formData.coffeeBase;
if (cBase !== undefined && cBase !== "") {
autoFilledData.coffeeUse = cBase;
isModified = true;
}
}

if (isModified) {
setFormData(prev => ({ ...prev, ...autoFilledData }));
}

try {
const { data: inventoryData, error } = await supabase
.from('ecount_inventory')
.select('*')
.gt('quantity', 0)
.order('lot_no', { ascending: true });

if (error) throw error;

if (inventoryData && inventoryData.length > 0) {
let sbAutoFill: Record<string, any> = {};
let isSbModified = false;

dbRecipe.forEach((mat, idx) => {
const matchedItems = inventoryData.filter((inv: any) => {
const safeMatName = getStrictName(mat.name);
const safeInvName = getStrictName(inv.item_name);
return safeInvName === safeMatName;
});

if (matchedItems.length > 0) {
let remainingReq = mat.calculatedBase;
let usedLots: string[] = [];
let usedExps: string[] = [];
let usedQtys: string[] = [];

for (const item of matchedItems) {
if (remainingReq <= 0) break;
const stockQty = Number(item.quantity);
if (isNaN(stockQty) || stockQty <= 0) continue;

const takeQty = Math.min(remainingReq, stockQty);
if (item.lot_no) usedLots.push(item.lot_no);
if (item.expiry_date) usedExps.push(item.expiry_date);
usedQtys.push(takeQty.toFixed(2));
remainingReq -= takeQty;
}

if (usedLots.length > 0) {
const testNumKey = mat.processType === 'grinding' ? 'coffeeTestNum' : `matTestNum_${idx}`;
const expKey = mat.processType === 'grinding' ? 'coffeeExp' : `matExp_${idx}`;
const useKey = mat.processType === 'grinding' ? 'coffeeUse' : `matUse_${idx}`;

if (!formData[testNumKey]) {
sbAutoFill[testNumKey] = usedLots.join(" / ");
isSbModified = true;
}
if (!formData[expKey]) {
const uniqueExps = Array.from(new Set(usedExps));
sbAutoFill[expKey] = uniqueExps.join(" / ");
isSbModified = true;
}
if ((!formData[useKey] || formData[useKey] == mat.calculatedBase) && usedQtys.length > 1) {
sbAutoFill[useKey] = usedQtys.join(" / ");
isSbModified = true;
}
}
}
});

if (isSbModified) setFormData(prev => ({ ...prev, ...sbAutoFill }));
}
} catch (error) {
console.error("Supabase 데이터 연동 실패:", error);
}
}
autoFillData();
}, [dbRecipe, isCoffeeProcess]);

const computedTotalBase = mixingList.reduce((acc, curr) => acc + curr.calculatedBase, 0).toFixed(2);
const totalRatio = mixingList.length > 0 ? "100.0%" : "0.0%";

useEffect(() => {
localStorage.setItem(storageKey, JSON.stringify(formData));
}, [formData, storageKey]);

const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
const { name, value, type } = e.target;
// @ts-ignore
const checked = e.target.checked;
setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
};

const normalizeName = (name: string) => {
if (!name) return "";
return name.replace(/^[원부자반]\)\s*/, '').replace(/\[.*?\]/g, '').replace(/\s+/g, '').toLowerCase();
};

const handleIssue = async () => {
if (orderStatus !== "대기") return alert("이미 발행되었거나 완료된 지시서입니다.");
if (!window.confirm(`[${docNum}] 생산일자(${targetDate}) 기준으로 재고를 가예약(차감) 하시겠습니까?\n\n※ 해당일자 이후에 예약된 지시서가 있다면 자동으로 재배열됩니다.`)) return;

setIsProcessing(true);
document.body.style.cursor = 'wait';

try {
let needsToDeduct: { name: string, qty: number }[] = [];
if (isCoffeeProcess && formData.coffeeUse) {
needsToDeduct.push({ name: grindingName, qty: Number(formData.coffeeUse) });
}
mixingList.forEach(mat => {
const usedQty = Number(formData[`matUse_${mat.originalIndex}`]);
if (usedQty > 0) needsToDeduct.push({ name: mat.name, qty: usedQty });
});

const { data: futureLogs, error: logError } = await supabase
.from('inventory_adjustments')
.select('*')
.eq('status', '발행')
.gte('target_date', targetDate);

if (logError) throw logError;

const { data: allLots, error: fetchError } = await supabase.from('ecount_inventory').select('*');
if (fetchError) throw fetchError;
let virtualInventory = [...allLots];

if (futureLogs && futureLogs.length > 0) {
for (const log of futureLogs) {
const lotIndex = virtualInventory.findIndex(v => v.lot_no === log.lot_no && v.item_name === log.product_name);
if (lotIndex !== -1) {
virtualInventory[lotIndex].quantity = Number(virtualInventory[lotIndex].quantity) + Number(log.deducted_qty);
}
}
await supabase.from('inventory_adjustments').delete().gte('target_date', targetDate).eq('status', '발행');
}

let newLogs = [];
for (const item of needsToDeduct) {
if (item.qty <= 0) continue;
const targetCleanName = normalizeName(item.name);

let matchingLots = virtualInventory
.filter(lot => normalizeName(lot.item_name) === targetCleanName)
.map(lot => ({ ...lot, qty: Number(String(lot.quantity).replace(/,/g, '')) }))
.sort((a, b) => String(a.lot_no || '').localeCompare(String(b.lot_no || '')));

let remaining = item.qty;
for (const lot of matchingLots) {
if (remaining <= 0) break;
if (lot.qty <= 0) continue;

let deduct = Math.min(remaining, lot.qty);
remaining -= deduct;

const vIdx = virtualInventory.findIndex(v => v.id === lot.id);
virtualInventory[vIdx].quantity = Number(virtualInventory[vIdx].quantity) - deduct;

newLogs.push({
work_order_no: docNum,
target_date: targetDate,
product_name: lot.item_name,
lot_no: lot.lot_no,
deducted_qty: deduct,
status: '발행'
});
}
}

if (futureLogs && futureLogs.length > 0) {
const futureOrders = Array.from(new Set(futureLogs.map(l => l.work_order_no)));
for (const f_order of futureOrders) {
const orderLogs = futureLogs.filter(l => l.work_order_no === f_order);
const f_targetDate = orderLogs[0].target_date;

let f_needs = new Map();
orderLogs.forEach(l => {
f_needs.set(l.product_name, (f_needs.get(l.product_name) || 0) + Number(l.deducted_qty));
});

for (const [prodName, qty] of f_needs.entries()) {
let remaining = qty;
let matchingLots = virtualInventory
.filter(v => v.item_name === prodName)
.map(lot => ({ ...lot, qty: Number(String(lot.quantity).replace(/,/g, '')) }))
.sort((a, b) => String(a.lot_no || '').localeCompare(String(b.lot_no || '')));

for (const lot of matchingLots) {
if (remaining <= 0) break;
if (lot.qty <= 0) continue;

let deduct = Math.min(remaining, lot.qty);
remaining -= deduct;

const vIdx = virtualInventory.findIndex(v => v.id === lot.id);
virtualInventory[vIdx].quantity = Number(virtualInventory[vIdx].quantity) - deduct;

newLogs.push({
work_order_no: f_order,
target_date: f_targetDate,
product_name: lot.item_name,
lot_no: lot.lot_no,
deducted_qty: deduct,
status: '발행'
});
}
}
}
}

for (const v of virtualInventory) {
await supabase.from('ecount_inventory').update({ quantity: v.quantity }).eq('id', v.id);
}
if (newLogs.length > 0) {
await supabase.from('inventory_adjustments').insert(newLogs);
}

alert("🎉 타임머신 재계산 완료! 해당일자 기준으로 재고가 완벽하게 가예약되었습니다.");
setOrderStatus("발행");

} catch (error: any) {
alert("시스템 에러: " + error.message);
} finally {
setIsProcessing(false);
document.body.style.cursor = 'default';
}
};

const handleCancel = async () => {
if (orderStatus !== "발행") return alert("가예약 상태에서만 취소할 수 있습니다.");
if (!window.confirm(`[${docNum}] 지시서를 삭제하고 차감된 재고를 창고로 다시 원복하시겠습니까?`)) return;

setIsProcessing(true);
document.body.style.cursor = 'wait';

try {
const { data: myLogs, error: logError } = await supabase
.from('inventory_adjustments')
.select('*')
.eq('work_order_no', docNum)
.eq('status', '발행');

if (logError) throw logError;

if (myLogs && myLogs.length > 0) {
for (const log of myLogs) {
const { data: currentLot } = await supabase
.from('ecount_inventory')
.select('quantity')
.eq('lot_no', log.lot_no)
.eq('item_name', log.product_name)
.single();

if (currentLot) {
await supabase
.from('ecount_inventory')
.update({ quantity: Number(currentLot.quantity) + Number(log.deducted_qty) })
.eq('lot_no', log.lot_no)
.eq('item_name', log.product_name);
}
}
await supabase.from('inventory_adjustments').delete().eq('work_order_no', docNum);
}

alert("♻️ 재고가 성공적으로 복구되었습니다.");
setOrderStatus("대기");
} catch (error: any) {
alert("취소 에러: " + error.message);
} finally {
setIsProcessing(false);
document.body.style.cursor = 'default';
}
};

const handleComplete = async () => {
if (orderStatus !== "발행") return alert("가예약(발행) 상태의 지시서만 완료 처리할 수 있습니다.");
if (!window.confirm(`[${docNum}] 생산이 완료되었습니까?\n재고 차감을 영구적으로 확정(Fix)합니다.`)) return;

setIsProcessing(true);
try {
await supabase
.from('inventory_adjustments')
.update({ status: '완료' })
.eq('work_order_no', docNum);

alert("🔒 생산 완료 및 재고 차감이 확정되었습니다!");
setOrderStatus("완료");
} catch (error: any) {
alert("완료 에러: " + error.message);
} finally {
setIsProcessing(false);
}
};

const getSection1Data = () => {
if (isCoffeeProcess) {
return {
title: "1. 원료, 원두칭량 및 분쇄",
items: [
"1) 작업자의 복장 상태를 확인한다.", "2) 작업장 기계기구의 청소 상태를 확인한다.", "3) 작업내역표시서를 확인 부착한다.",
"4) 원료, 원두의 성상 및 이물을 확인한다.", "5) 원료를 기준량에 맞게 정확히 칭량한다.", "6) 원두는 지시된 분쇄도로 분쇄 후 정확히 칭량한다."
],
hasBeanTable: true,
materialTitle: foodTypeStr === "건강기능식품" ? "기능성 원료 및 부원료 칭량" : "원재료 칭량"
};
} else {
return {
title: "1. 원료 칭량",
items: [
"1) 작업자의 복장 상태를 확인한다.", "2) 작업장 기계기구의 청소 상태를 확인한다.", "3) 작업내역표시서를 확인 부착한다.",
"4) 원료의 성상 및 이물을 확인한다.", "5) 원료를 기준량에 맞게 정확히 칭량한다."
],
hasBeanTable: false,
materialTitle: foodTypeStr === "건강기능식품" ? "기능성 원료 및 부원료 칭량" : "원재료 칭량"
};
}
};

const section1Data = getSection1Data();
const emptyRowsCount = Math.max(0, (isCoffeeProcess ? 3 : 6) - mixingList.length);

return (
<div className="flex flex-col items-center gap-8 print:gap-0 font-sans w-full relative">
<style>{`
@media print {
@page { size: A4 portrait; margin: 0; }
body { margin: 0; padding: 0; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
.no-print { display: none !important; }
}
`}</style>


{/* ========================================== */}
{/* 제 1페이지 (1. 원료칭량) */}
{/* ========================================== */}
<div className="w-[794px] h-[1123px] text-black bg-white border border-gray-400 print:border-none px-8 pt-4 pb-6 box-border shadow-sm print:shadow-none print:break-after-page relative shrink-0" style={{ letterSpacing: '-0.5px' }}>
<div className="flex justify-between items-start mb-4">
<div className="w-1/3">
<table className="border-collapse border-2 border-black text-xs text-center w-56 mt-2">
<tbody>
<tr>
<td className="border border-black bg-gray-100 font-bold py-1.5 w-1/3">문서번호</td>
<td className="border border-black py-1.5 p-0">
<input type="text" name="docNum" value={formData.docNum ?? "V-03-01-01"} onChange={handleChange} className="w-full h-full text-center outline-none bg-transparent py-1.5" />
</td>
</tr>
<tr>
<td className="border border-black bg-gray-100 font-bold py-1.5">개정일자</td>
<td className="border border-black py-1.5 p-0">
<input type="text" name="revDate" value={formData.revDate ?? "2026.03.20"} onChange={handleChange} className="w-full h-full text-center outline-none bg-transparent py-1.5" />
</td>
</tr>
<tr>
<td className="border border-black bg-gray-100 font-bold py-1.5">작성부서</td>
<td className="border border-black py-1.5 p-0">
<input type="text" name="department" value={formData.department ?? "제조관리부"} onChange={handleChange} className="w-full h-full text-center outline-none bg-transparent py-1.5" />
</td>
</tr>
</tbody>
</table>
</div>

<div className="w-1/3 text-center pt-2">
<h1 className="text-[26px] font-extrabold tracking-widest border-b-2 border-black inline-block pb-1">
제조지시 및 기록서
</h1>
</div>

<div className="w-1/3 flex justify-end">
<table className="border-collapse border-2 border-black text-sm text-center">
<tbody>
<tr>
<td rowSpan={2} className="border border-black bg-gray-100 px-2 font-bold w-6 leading-tight">결<br/><br/>재</td>
<td className="border border-black bg-gray-100 px-5 py-1.5 font-bold w-16">제 조</td>
<td className="border border-black bg-gray-100 px-5 py-1.5 font-bold w-16">품 질</td>
<td className="border border-black bg-gray-100 px-5 py-1.5 font-bold w-16">승 인</td>
</tr>
<tr className="h-12 bg-white">
{["제조", "품질", "승인"].map((role) => (
<td key={role} className="border border-black relative cursor-pointer hover:bg-gray-50" onClick={() => openSignModal(role)}>
{signatures[role] ?
<img src={signatures[role]} alt={role} className="h-12 w-full object-contain absolute inset-0 m-auto p-0.5" />
: <span className="text-gray-300 text-xs">(서명)</span>
}
</td>
))}
</tr>
</tbody>
</table>
</div>
</div>

<table className="w-full border-collapse border-2 border-black text-[13px] mb-4">
<tbody>
<tr className="text-center bg-white">
<td className="border border-black p-1.5 font-bold bg-gray-50 w-[15%]">제품명</td>
<td className="border border-black p-1.5 font-bold text-[14px] text-blue-800 w-[35%]">
{selectedOrder?.itemName || ""}
</td>
<td className="border border-black p-1.5 font-bold bg-gray-50 w-[15%]">제품제형</td>
<td className="border border-black p-1.5 font-bold w-[10%]">액 상</td>
<td className="border border-black p-1.5 font-bold bg-gray-50 w-[10%]">제조번호</td>
<td className="border border-black p-1.5 font-bold tracking-wider text-gray-700 w-[15%]">
{selectedOrder?.orderNumber || ""}
</td>
</tr>
<tr className="text-center bg-white">
<td className="border border-black p-1.5 font-bold bg-gray-50">제조지시일</td>
<td className="border border-black p-1.5 font-bold text-gray-700">
{selectedOrder?.date || ""}
</td>
<td className="border border-black p-1.5 font-bold bg-gray-50">제조단위</td>
<td className="border border-black p-1.5 font-bold text-blue-800">
{selectedOrder?.qty ? selectedOrder.qty.toLocaleString() : 0} kg
</td>
<td className="border border-black p-1.5 font-bold bg-gray-50">소비기한</td>
<td className="border border-black p-0">
<input type="text" name="expDate" value={formData.expDate ?? "2027.11.30"} onChange={handleChange} className="w-full h-full text-center bg-transparent outline-none py-1.5 font-bold text-red-600" />
</td>
</tr>
</tbody>
</table>

<table className="w-full border-collapse border-2 border-black text-[12px]">
<tbody>
<tr>
<td colSpan={6} className="border border-black p-2 font-bold bg-gray-100 text-left pl-4 text-gray-900 text-[13px]">
{section1Data.title}
</td>
</tr>
<tr>
<td colSpan={6} className="border border-black p-0 bg-white">
<div className="grid grid-cols-2 p-2 gap-y-0.5 px-4 text-gray-800 tracking-tight">
{section1Data.items.map((item, iIdx) => (
<div key={`item-s1-${iIdx}`}>{item}</div>
))}
</div>
</td>
</tr>

<tr>
<td colSpan={6} className="border border-black p-0 bg-white">
{section1Data.hasBeanTable && (
<>
<div className="font-bold text-left py-1.5 px-4 bg-white border-b border-black text-gray-900 flex justify-between items-end text-[13px]">
<span>원두 칭량 및 분쇄</span>
<span className="font-normal text-[11px] text-gray-600 tracking-widest">일시: 2026 년&nbsp;&nbsp;월&nbsp;&nbsp;일&nbsp;&nbsp;&nbsp;&nbsp;:&nbsp;&nbsp;~&nbsp;&nbsp;:</span>
</div>

<table className="w-full text-center text-[11px] border-collapse">
<thead className="bg-gray-50 font-bold text-gray-700">
<tr>
<th className="border-r border-b border-black py-1 w-[5%]">번호</th>
<th className="border-r border-b border-black py-1 w-[20%]">원료명</th>
<th className="border-r border-b border-black py-1 w-[15%]">시험번호</th>
<th className="border-r border-b border-black py-1 w-[10%]">기준량(kg)</th>
<th className="border-r border-b border-black py-1 w-[10%]">사용량(kg)</th>
<th className="border-r border-b border-black py-1 w-[12%]">분쇄량(kg)</th>
<th className="border-r border-b border-black py-1 w-[14%]">소비기한</th>
<th className="border-r border-b border-black py-1 w-[6%]">칭량</th>
<th className="border-r border-b border-black py-1 w-[6%]">확인</th>
<th className="border-b border-black py-1 w-[2%]">비고</th>
</tr>
</thead>
<tbody className="bg-white text-gray-800">
<tr className="h-8">
<td className="border-r border-b border-black py-1 font-bold">1</td>
<td className="border-r border-b border-black py-1 font-bold bg-yellow-50 text-[10.5px] truncate max-w-[130px]">{grindingName}</td>
<td className="border-r border-b border-black p-0"><input type="text" name="coffeeTestNum" value={formData.coffeeTestNum || ""} onChange={handleChange} className="w-full h-full text-center bg-transparent outline-none" placeholder="이곳에 입력" /></td>
<td className="border-r border-b border-black p-0"><input type="text" name="coffeeBase" value={formData.coffeeBase || ""} onChange={handleChange} className="w-full h-full text-center bg-transparent outline-none font-bold text-blue-700" /></td>
<td className="border-r border-b border-black p-0"><input type="text" name="coffeeUse" value={formData.coffeeUse || ""} onChange={handleChange} className="w-full h-full text-center bg-transparent outline-none font-bold text-red-600" /></td>
<td className="border-r border-b border-black p-0"><input type="text" name="coffeeCrush" value={formData.coffeeCrush || ""} onChange={handleChange} className="w-full h-full text-center bg-transparent outline-none" /></td>
<td className="border-r border-b border-black p-0"><input type="text" name="coffeeExp" value={formData.coffeeExp || ""} onChange={handleChange} className="w-full h-full text-center bg-transparent outline-none text-[10px]" placeholder="이곳에 입력" /></td>
<td className="border-r border-b border-black p-0"><input type="text" name="coffeeWeigher" value={formData.coffeeWeigher || ""} onChange={handleChange} className="w-full h-full text-center bg-transparent outline-none" /></td>
<td className="border-r border-b border-black p-0"><input type="text" name="coffeeConfirmer" value={formData.coffeeConfirmer || ""} onChange={handleChange} className="w-full h-full text-center bg-transparent outline-none" /></td>
<td className="border-b border-black p-0"><input type="text" name="coffeeNote" value={formData.coffeeNote || ""} onChange={handleChange} className="w-full h-full text-center bg-transparent outline-none" /></td>
</tr>
</tbody>
</table>

<div className="text-left text-[11px] py-1.5 px-4 leading-tight border-b border-black bg-white text-gray-700">
1) 저울 수평 및 영점 상태 확인 2) 분쇄기 다이얼 0~1 고정 3) 분쇄기 및 원두 보관통 세척/건조 확인
</div>
</>
)}

<div className="font-bold text-left py-1.5 px-4 border-b border-black bg-white text-gray-900 flex justify-between items-end text-[13px]">
<span>{section1Data.materialTitle}</span>
<span className="font-normal text-[11px] text-gray-600 tracking-widest">일시: 2026 년&nbsp;&nbsp;월&nbsp;&nbsp;일&nbsp;&nbsp;&nbsp;&nbsp;:&nbsp;&nbsp;~&nbsp;&nbsp;:</span>
</div>

<table className="w-full text-center text-[11px] border-collapse">
<thead className="bg-gray-50 font-bold text-gray-700 border-b border-black">
<tr>
<th className="border-r py-1 w-[5%]">번호</th>
<th className="border-r py-1 w-[20%]">원료명</th>
<th className="border-r py-1 w-[15%]">시험번호</th>
<th className="border-r py-1 w-[8%]">비율(%)</th>
<th className="border-r py-1 w-[10%]">기준량(kg)</th>
<th className="border-r py-1 w-[10%]">사용량(kg)</th>
<th className="border-r py-1 w-[14%]">소비기한</th>
<th className="border-r py-1 w-[6%]">칭량</th>
<th className="border-r py-1 w-[6%]">확인</th>
<th className="py-1 w-[6%]">비고</th>
</tr>
</thead>
<tbody className="bg-white text-gray-800">
{isLoadingRecipe ? (
<tr><td colSpan={10} className="p-4 text-center text-gray-500 font-bold">데이터 로딩중...</td></tr>
) : mixingList.length > 0 ? (
mixingList.map((mat, displayIdx) => {
const mIdx = mat.originalIndex;
const isExtractMat = isCoffeeProcess && mat.name.includes("커피") && mat.name.includes("추출액");

return (
<tr key={`mat-${mIdx}`} className="h-7 hover:bg-gray-50">
<td className="border-b border-r border-black font-bold">{displayIdx + 1}</td>
<td className="border-b border-r border-black text-center px-2 font-bold bg-yellow-50 text-gray-900 text-[10.5px] truncate max-w-[130px]">{mat.name}</td>
<td className="border-b border-r border-black p-0">
<input
type="text"
name={`matTestNum_${mIdx}`}
value={formData[`matTestNum_${mIdx}`] || ""}
onChange={handleChange}
readOnly={isExtractMat}
tabIndex={isExtractMat ? -1 : undefined}
className={`w-full h-full text-center outline-none ${isExtractMat ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'bg-transparent'}`}
/>
</td>
<td className="border-b border-r border-black font-bold text-blue-800">{mat.ratio}</td>
<td className="border-b border-r border-black font-bold text-blue-800">{mat.calculatedBase}</td>
<td className="border-b border-r border-black p-0"><input type="text" name={`matUse_${mIdx}`} value={formData[`matUse_${mIdx}`] || ""} onChange={handleChange} className="w-full h-full text-center bg-transparent outline-none font-bold text-red-600" /></td>
<td className="border-b border-r border-black p-0">
<input
type="text"
name={`matExp_${mIdx}`}
value={formData[`matExp_${mIdx}`] || ""}
onChange={handleChange}
readOnly={isExtractMat}
tabIndex={isExtractMat ? -1 : undefined}
className={`w-full h-full text-center text-[10px] outline-none ${isExtractMat ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'bg-transparent'}`}
/>
</td>
<td className="border-b border-r border-black p-0"><input type="text" name={`matWeigher_${mIdx}`} value={formData[`matWeigher_${mIdx}`] || ""} onChange={handleChange} className="w-full h-full text-center bg-transparent outline-none" /></td>
<td className="border-b border-r border-black p-0"><input type="text" name={`matConfirmer_${mIdx}`} value={formData[`matConfirmer_${mIdx}`] || ""} onChange={handleChange} className="w-full h-full text-center bg-transparent outline-none" /></td>
<td className="border-b border-black p-0"><input type="text" name={`matNote_${mIdx}`} value={formData[`matNote_${mIdx}`] || ""} onChange={handleChange} className="w-full h-full text-center bg-transparent outline-none" /></td>
</tr>
);
})
) : null}

{Array.from({ length: emptyRowsCount }).map((_, i) => (
<tr key={`empty-${i}`} className="h-7 border-b border-gray-200">
<td className="border-r border-black"></td><td className="border-r border-black bg-yellow-50/20"></td><td className="border-r border-black"></td><td className="border-r border-black"></td><td className="border-r border-black"></td><td className="border-r border-black"></td><td className="border-r border-black"></td><td className="border-r border-black"></td><td className="border-r border-black"></td><td></td>
</tr>
))}
<tr className="bg-gray-100 text-gray-900 h-8 border-b border-black">
<td colSpan={3} className="border-r border-black font-bold">합계</td>
<td className="border-r border-black font-bold text-blue-800">{totalRatio}</td>
<td className="border-r border-black font-bold text-blue-800">{computedTotalBase}</td>
<td colSpan={5}></td>
</tr>
<tr className="border-b border-black h-9">
<td colSpan={6} className="border-r border-black font-bold text-left pl-4 bg-white">특이사항(공정 중 이상유무 등)</td>
<td colSpan={4} className="p-0 bg-white">
<input type="text" name="matSpecialNote" value={formData.matSpecialNote || ""} onChange={handleChange} className="w-full h-full p-2 text-left outline-none bg-transparent" />
</td>
</tr>
</tbody>
</table>

<div className="text-left text-[11px] py-2 px-4 leading-tight bg-white text-gray-700">
1) 원료칭량기록서에 따라 원료를 칭량하며 이중 점검한다. / 2) 제조지시및기록서, 원료칭량기록서에 의하여 원료를 출고한다. / 3) 작업자는 칭량한 원료를 칭량기록서에 작성한다.
</div>
</td>
</tr>
</tbody>
</table>
<div className="absolute bottom-3 right-8 text-[11px] text-gray-500 font-bold no-print">1 / 3 페이지</div>
</div>

{/* ========================================== */}
      {/* 제 2페이지 (2. 추출 및 배합 단독) */}
      {/* ========================================== */}
      <div className="w-[794px] h-[1123px] text-black bg-white border border-gray-400 print:border-none px-8 pt-8 pb-8 box-border shadow-sm print:shadow-none print:break-after-page relative shrink-0" style={{ letterSpacing: '-0.5px' }}>
        
        <table className="w-full border-collapse border-2 border-black text-[14px]">
          <tbody>
            <tr>
              <td colSpan={4} className="border-b border-black p-3 font-bold bg-gray-100 text-left pl-4 text-gray-900 text-[15px]">
                2. 추출 및 배합
                <span className="font-normal text-[12px] ml-4 tracking-widest text-gray-600">
                  <input 
                    type="text" 
                    name="extractDateStr" 
                    value={formData.extractDateStr ?? (selectedOrder?.date ? `${selectedOrder.date.split('-')[0]}년 ${selectedOrder.date.split('-')[1]}월 ${selectedOrder.date.split('-')[2]}일` : "")} 
                    onChange={handleChange} 
                    className="w-32 bg-transparent outline-none text-center border-b border-gray-400 font-bold text-black" 
                  /> 
                  &nbsp;/ 추출 : 
                  <input type="text" name="extTimeStart" value={formData.extTimeStart || ""} onChange={handleChange} className="bg-transparent outline-none ml-1 text-center w-16" /> ~ 
                  <input type="text" name="extTimeEnd" value={formData.extTimeEnd || ""} onChange={handleChange} className="bg-transparent outline-none ml-1 text-center w-16" />
                  &nbsp;&nbsp;&nbsp;배합 : 
                  <input type="text" name="mixTimeStart" value={formData.mixTimeStart || ""} onChange={handleChange} className="bg-transparent outline-none ml-1 text-center w-16" /> ~ 
                  <input type="text" name="mixTimeEnd" value={formData.mixTimeEnd || ""} onChange={handleChange} className="bg-transparent outline-none ml-1 text-center w-16" />
                </span>
              </td>
            </tr>
          </tbody>

          <tbody className="bg-white">
            {Array.from({ length: 12 }).map((_, idx) => (
              <tr key={`mix-sterilize-${idx}`} className="h-10 border-b border-gray-200">
                <td className="border-r border-black p-2 w-1/4 font-bold text-center bg-gray-50 text-gray-700">배합</td>
                <td className="border-r border-black p-0 w-1/4 text-center">
                  <input type="text" name={`mixRowStart_${idx}`} value={formData[`mixRowStart_${idx}`] || ""} onChange={handleChange} className="bg-transparent outline-none w-16 text-center" /> ~ 
                  <input type="text" name={`mixRowEnd_${idx}`} value={formData[`mixRowEnd_${idx}`] || ""} onChange={handleChange} className="bg-transparent outline-none w-16 text-center ml-1" />
                </td>
                <td className="border-r border-black p-2 w-1/4 font-bold text-center bg-gray-50 text-gray-700">살균</td>
                <td className="p-0 w-1/4 text-center">
                  <input type="text" name={`sterilizeRowStart_${idx}`} value={formData[`sterilizeRowStart_${idx}`] || ""} onChange={handleChange} className="bg-transparent outline-none w-16 text-center" /> ~ 
                  <input type="text" name={`sterilizeRowEnd_${idx}`} value={formData[`sterilizeRowEnd_${idx}`] || ""} onChange={handleChange} className="bg-transparent outline-none w-16 text-center ml-1" />
                </td>
              </tr>
            ))}
          </tbody>

          <tbody>
            <tr>
              <td colSpan={4} className="border-t border-b border-black p-4 text-left text-[14px] leading-loose bg-white text-gray-800">
                1) 작업자의 복장 상태 확인한다. 2) 추출 및 배합 탱크의 청결상태를 확인한다. 3) 추출수 온도(90°C±5)를 확인한다.<br/>
                4) 추출기에 추출수를 매 5~6분 간격으로 10회 붓는다.(추출공정 점검표)<br/>
                5) 커피추출기에서 커피추출액을 배합탱크로 이송한다. 6) 배합탱크로 이송된 추출액을 당도 체크 및 관능검사를 강하게 한다.<br/>
                7) 배합탱크에 주·부원료를 투입하고, 75°C±5에서 50~80 r.p.m으로 1시간 교반한다.<br/>
                8) 배합탱크에서 교반된 배합액을 당도 체크 및 관능검사를 한다.
                <span className="mt-2 block font-semibold text-blue-700">* 추출공정 점검표 별첨</span>
              </td>
            </tr>
          </tbody>

          <tbody className="bg-white">
            <tr>
              <td colSpan={4} className="p-0">
                <div className="flex border-b border-black h-12">
                  <div className="w-[12.5%] border-r border-black font-bold text-center bg-gray-50 flex items-center justify-center">추출액량</div>
                  <div className="w-[17.5%] border-r border-black p-0"><input type="text" name="extractAmount" value={formData.extractAmount || ""} onChange={handleChange} className="w-full h-full text-center outline-none bg-transparent" /></div>
                  <div className="w-[12.5%] border-r border-black font-bold text-center bg-gray-50 flex items-center justify-center">배합량</div>
                  <div className="w-[17.5%] border-r border-black p-0 bg-teal-50"><input type="text" name="mixAmount" value={formData.mixAmount || "2250"} onChange={handleChange} className="w-full h-full text-center outline-none bg-transparent font-bold text-teal-800 text-lg" /></div>
                  <div className="w-[10%] border-r border-black font-bold text-center bg-gray-50 flex items-center justify-center">담당자</div>
                  <div className="w-[10%] border-r border-black p-0"><input type="text" name="extractManager" value={formData.extractManager || ""} onChange={handleChange} className="w-full h-full text-center outline-none bg-transparent" /></div>
                  <div className="w-[10%] border-r border-black font-bold text-center bg-gray-50 flex items-center justify-center">확인자</div>
                  <div className="w-[10%] p-0"><input type="text" name="extractConfirmer" value={formData.extractConfirmer || ""} onChange={handleChange} className="w-full h-full text-center outline-none bg-transparent" /></div>
                </div>
                <div className="flex h-14">
                  <div className="w-[20%] border-r border-black font-bold text-center bg-gray-50 flex items-center justify-center text-[13px] leading-tight">특이사항<br/>(이상유무 등)</div>
                  <div className="w-[80%] p-0"><input type="text" name="extractNotes" value={formData.extractNotes || ""} onChange={handleChange} className="w-full h-full p-3 outline-none bg-transparent" /></div>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        
        <div className="absolute bottom-4 right-8 text-[11px] text-gray-500 font-bold no-print">2 / 3 페이지</div>
      </div>

      {/* ========================================== */}
      {/* 🌟 제 3페이지 (3. 충진 & 4. 포장) */}
      {/* ========================================== */}
      <div className="w-[794px] h-[1123px] text-black bg-white border border-gray-400 print:border-none px-8 pt-8 pb-8 box-border shadow-sm print:shadow-none print:break-after-page relative shrink-0" style={{ letterSpacing: '-0.5px' }}>
        
        {/* 3. 충진 폼 */}
        <table className="w-full border-collapse border-2 border-black text-[12.5px] mb-6">
          <tbody>
            <tr>
              <td colSpan={8} className="border-b border-black p-2 font-bold bg-gray-100 text-left pl-4 text-gray-900 text-[13.5px]">
                3. 충진
                <span className="font-normal text-[11px] ml-4 tracking-widest text-gray-600">
                  일시 : 
                  <input 
                    type="text" 
                    name="fillDateStr" 
                    value={formData.fillDateStr ?? (selectedOrder?.date ? `${selectedOrder.date.split('-')[0]}년 ${selectedOrder.date.split('-')[1]}월 ${selectedOrder.date.split('-')[2]}일` : "")} 
                    onChange={handleChange} 
                    className="w-32 bg-transparent outline-none text-center border-b border-gray-400 font-bold text-black" 
                  />
                  &nbsp;&nbsp;:&nbsp;&nbsp;
                  <input type="text" name="fillTimeStart" value={formData.fillTimeStart || ""} onChange={handleChange} className="bg-transparent outline-none text-center w-16" /> ~
                  <input type="text" name="fillTimeEnd" value={formData.fillTimeEnd || ""} onChange={handleChange} className="bg-transparent outline-none ml-1 text-center w-16" />
                </span>
              </td>
            </tr>
            {[
              "1) 작업자의 복장상태를 확인한다.",
              "2) 파우치가 투명 비닐에 잘 포장되어 있는가 확인한다.",
              "3) 충진기 기구류의 청소 청결상태를 반드시 확인한다.",
              "4) 저울의 수평 및 영점 상태를 확인한다.",
              "5) 충진기에 설정된 예열상태 확인 : 가로 씰링바 180°C 세로 씰링바 170°C",
              "6) 충전 중 호퍼의 저장량을 주기적으로 점검 확인한다.",
              "7) 충전 용량(14ml) 및 씰링상태를 주기적으로 확인한다 (매30분)",
              "8) 충진된 파우치 상태의 반제품을 시험 의뢰한다.",
              "9) 충진후 40mesh 스텐레스여과봉의 이물상태를 공정검사기록서에 기록 한다."
            ].map((item, idx) => (
              <tr key={`fill-check-${idx}`} className="bg-white hover:bg-gray-50 border-b border-gray-200">
                <td colSpan={8} className="p-1 text-left pl-6 text-[12px] text-gray-800">{item}</td>
              </tr>
            ))}
          </tbody>
          <tbody className="bg-white text-[12px] border-t-2 border-black">
            <tr className="h-8">
              <td className="border-r border-black font-bold text-center bg-gray-50 w-[12%]">파우치사용량</td>
              <td className="border-r border-black p-0 w-[13%]"><input type="text" name="fillPouchUsage" value={formData.fillPouchUsage || ""} onChange={handleChange} className="w-full h-full text-center outline-none bg-transparent" /></td>
              <td className="border-r border-black font-bold text-center bg-gray-50 w-[12%]">이론생산량</td>
              <td className="border-r border-black p-0 w-[13%]"><input type="text" name="fillTheoryProd" value={formData.fillTheoryProd || "139,509"} onChange={handleChange} className="w-full h-full text-center outline-none bg-transparent font-bold text-gray-700" /></td>
              <td className="border-r border-black font-bold text-center bg-gray-50 w-[12%]">실생산량</td>
              <td className="border-r border-black p-0 w-[13%]"><input type="text" name="fillActualProd" value={formData.fillActualProd || ""} onChange={handleChange} className="w-full h-full text-center outline-none bg-transparent" /></td>
              <td className="border-r border-black font-bold text-center bg-gray-50 w-[10%]">수율</td>
              <td className="p-0 w-[15%]"><input type="text" name="fillYield" value={formData.fillYield || "-"} onChange={handleChange} className="w-full h-full text-center outline-none bg-transparent" /></td>
            </tr>
            <tr className="h-8 border-t border-black">
              <td colSpan={4} className="border-r border-black p-1.5 font-semibold text-left pl-4 text-blue-700">* 충진공정 점검표 별첨</td>
              <td className="border-r border-black font-bold text-center bg-gray-50">담당자</td>
              <td className="border-r border-black p-0"><input type="text" name="fillManager" value={formData.fillManager || ""} onChange={handleChange} className="w-full h-full text-center outline-none bg-transparent" /></td>
              <td className="border-r border-black font-bold text-center bg-gray-50">확인자</td>
              <td className="p-0"><input type="text" name="fillConfirmer" value={formData.fillConfirmer || ""} onChange={handleChange} className="w-full h-full text-center outline-none bg-transparent" /></td>
            </tr>
            <tr className="h-10 border-t border-black">
               <td colSpan={2} className="border-r border-black font-bold text-center bg-gray-50">특이사항(이상유무 등)</td>
               <td colSpan={6} className="p-0"><input type="text" name="fillNotes" value={formData.fillNotes || ""} onChange={handleChange} className="w-full h-full p-2 outline-none bg-transparent" /></td>
            </tr>
          </tbody>
        </table>

        {/* 4. 포장 폼 */}
        <table className="w-full border-collapse border-2 border-black text-[12.5px]">
          <tbody>
            <tr>
              <td colSpan={6} className="border-b border-black p-2 font-bold bg-gray-100 text-left pl-4 text-gray-900 text-[13.5px]">
                4. 포장
                <span className="font-normal text-[11px] ml-4 tracking-widest text-gray-600">
                  일시 : 
                  <input 
                    type="text" 
                    name="packDateStr" 
                    value={formData.packDateStr ?? (selectedOrder?.date ? `${selectedOrder.date.split('-')[0]}년 ${selectedOrder.date.split('-')[1]}월 ${selectedOrder.date.split('-')[2]}일` : "")} 
                    onChange={handleChange} 
                    className="w-32 bg-transparent outline-none text-center border-b border-gray-400 font-bold text-black" 
                  />
                </span>
              </td>
            </tr>
            {[
              "1) 반제품 상태는 양호하며 단상자의 소비기한 날인은 제조지시기록서와 일치하는지 확인한다.",
              "2) 날인기상태는 청결하며 입력한 소비기한이 정상적으로 날인되는지 확인한다.",
              "3) 내포장 입수량, 소비기한, 날인상태 등을 확인하며 포장한다.",
              "4) 외관 등 포장 상태를 확인하여 이상 없을시 투명 스티커를 부착한다.",
              "5) 스티커 부착후 카톤박스에 단상자를 담아 OPP테이프로 봉인 편집한다."
            ].map((item, idx) => (
              <tr key={`pack-check-${idx}`} className="bg-white hover:bg-gray-50 border-b border-gray-200">
                <td colSpan={6} className="p-1 text-left pl-6 text-[12px] text-gray-800">{item}</td>
              </tr>
            ))}
          </tbody>
          <tbody className="bg-white text-center border-t-2 border-black">
            <tr>
              <td colSpan={6} className="border-b border-black p-1.5 text-left pl-4 font-bold bg-gray-50 text-gray-800 text-[12.5px]">포장재 사용 현황</td>
            </tr>
            <tr className="bg-gray-100 font-bold text-gray-700 h-8">
               <td className="border-r border-b border-black w-[8%]">번호</td>
               <td className="border-r border-b border-black w-[32%]">포장재명</td>
               <td className="border-r border-b border-black w-[15%]">사용수량</td>
               <td className="border-r border-b border-black w-[15%]">실 생산 수량</td>
               <td className="border-r border-b border-black w-[15%]">수율</td>
               <td className="border-b border-black w-[15%]">비고</td>
            </tr>
            {[...Array(7)].map((_, idx) => {
              // 🌟 레시피에서 받아온 부자재(포장재)명을 순서대로 강제 할당합니다.
              const defaultName = subMaterials?.[idx]?.material_name || "";              
              
              return (
                <tr key={`pack-item-${idx}`} className="h-8 hover:bg-gray-50">
                  <td className="border-r border-b border-gray-300 font-semibold">{idx + 1}</td>
                  <td className="border-r border-b border-gray-300 p-0">
                    <input type="text" name={`packName_${idx}`} value={formData[`packName_${idx}`] || ""} onChange={handleChange} className="w-full h-full text-center bg-transparent outline-none py-1" />
                  </td>
                  <td className="border-r border-b border-gray-300 p-0">
                    <input type="text" name={`packUsage_${idx}`} value={formData[`packUsage_${idx}`] || ""} onChange={handleChange} className="w-full h-full text-center bg-transparent outline-none py-1" />
                  </td>
                  <td className="border-r border-b border-gray-300 p-0">
                    <input type="text" name={`packActual_${idx}`} value={formData[`packActual_${idx}`] || ""} onChange={handleChange} className="w-full h-full text-center bg-transparent outline-none py-1" />
                  </td>
                  <td className="border-r border-b border-gray-300 p-0">
                    <input type="text" name={`packYield_${idx}`} value={formData[`packYield_${idx}`] || ""} onChange={handleChange} className="w-full h-full text-center bg-transparent outline-none py-1" />
                  </td>
                  <td className="border-b border-gray-300 p-0">
                    <input type="text" name={`packNote_${idx}`} value={formData[`packNote_${idx}`] || ""} onChange={handleChange} className="w-full h-full text-center bg-transparent outline-none py-1" />
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tbody className="border-t-2 border-black bg-white text-[12px]">
            <tr className="h-9 border-b border-black">
               <td colSpan={2} className="border-r border-black p-1.5 font-semibold text-left pl-4 text-blue-700">* 포장 공정 점검표 별첨</td>
               <td className="border-r border-black font-bold text-center bg-gray-50">담당자</td>
               <td className="border-r border-black p-0"><input type="text" name="packManager" value={formData.packManager || ""} onChange={handleChange} className="w-full h-full text-center outline-none bg-transparent" /></td>
               <td className="border-r border-black font-bold text-center bg-gray-50">확인자</td>
               <td className="p-0"><input type="text" name="packConfirmer" value={formData.packConfirmer || ""} onChange={handleChange} className="w-full h-full text-center outline-none bg-transparent" /></td>
            </tr>
            <tr className="h-10">
               <td colSpan={2} className="border-r border-black font-bold text-center bg-gray-50">특이사항<br/>(이상유무 등)</td>
               <td colSpan={4} className="p-0"><textarea name="packNotes" value={formData.packNotes || ""} onChange={handleChange} className="w-full h-full p-2 outline-none bg-transparent resize-none"></textarea></td>
            </tr>
          </tbody>
        </table>
        
        <div className="absolute bottom-3 right-8 text-[11px] text-gray-500 font-bold no-print">3 / 3 페이지</div>
      </div>

    </div>
  );
}
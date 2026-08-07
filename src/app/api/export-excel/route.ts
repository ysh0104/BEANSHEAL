import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import path from "path";
import fs from "fs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { order, materials } = body;

    const templatePath = path.join(process.cwd(), "public/templates/batch_record_template.xlsx");
    if (!fs.existsSync(templatePath)) {
      return NextResponse.json({ success: false, error: "엑셀 템플릿 파일이 존재하지 않습니다." }, { status: 404 });
    }

    const fileBuffer = fs.readFileSync(templatePath);
    const workbook = XLSX.read(fileBuffer, { cellStyles: true, cellDates: true, cellFormula: true });

    const itemName = order?.itemName || order?.product_name || "세리컷 프레소 V2";
    const orderDate = order?.date ? order.date.replace(/-/g, ".") : "2026.04.09";
    const orderQty = Number(order?.qty || order?.target_qty || 2250);
    const docNum = order?.orderNumber || order?.order_no || "PLS260401D";

    // 🌟 셀 값 수정 헬퍼 (원본 cell.s 스타일 보존)
    const updateCell = (sheet: XLSX.WorkSheet, cellRef: string, val: any) => {
      const isNum = typeof val === "number" && !isNaN(val);
      const existing = sheet[cellRef] || {};
      sheet[cellRef] = {
        ...existing,
        t: isNum ? "n" : "s",
        v: val,
        w: String(val),
      };
    };

    // 1. [표지] 시트 채우기
    const coverSheet = workbook.Sheets["표지"];
    if (coverSheet) {
      updateCell(coverSheet, "B4", `제품명 :  ${itemName}`);
      updateCell(coverSheet, "G6", orderDate);
      updateCell(coverSheet, "G7", orderQty);
      updateCell(coverSheet, "I8", Math.round((orderQty / 16.128) * 1000));
    }

    // 2. [제조지시기록서] 시트 채우기
    const mfgSheet = workbook.Sheets["제조지시기록서"];
    if (mfgSheet) {
      updateCell(mfgSheet, "B7", itemName);
      updateCell(mfgSheet, "F7", docNum);
      updateCell(mfgSheet, "B9", orderDate);
      updateCell(mfgSheet, "D9", orderQty);
    }

    // 3. [공정검사기록서] 시트 채우기
    ["공정검사기록서", "공정검사기록서 (2)", "공정검사기록서 (3)"].forEach((sName) => {
      const sheet = workbook.Sheets[sName];
      if (sheet) {
        updateCell(sheet, "B4", `제품명 : ${itemName}`);
        updateCell(sheet, "D4", orderQty);
      }
    });

    // 4. [추출공정점검표] 시트 채우기
    const extSheet = workbook.Sheets["추출공정점검표"];
    if (extSheet) {
      updateCell(extSheet, "B3", `제품명: ${itemName}`);
    }

    // 5. [원료칭량기록서] 시트 채우기
    ["원료칭량기록서", "원료칭량기록서 (2)"].forEach((sName) => {
      const sheet = workbook.Sheets[sName];
      if (sheet) {
        updateCell(sheet, "B2", `  제품명 : ${itemName}`);
        updateCell(sheet, "B3", `  제조지시기록량 : ${orderQty} kg`);
        updateCell(sheet, "B4", `  칭량일 : ${orderDate}`);
      }
    });

    // 6. [완제품 출하 승인서] 시트 채우기
    const shipSheet = workbook.Sheets["완제품 출하 승인서"];
    if (shipSheet) {
      updateCell(shipSheet, "B5", itemName);
      updateCell(shipSheet, "B8", orderDate);
      updateCell(shipSheet, "B17", `${orderQty.toLocaleString()} EA`);
    }

    // 🌟 수정된 바이너리 엑셀 파일 생성
    const outBuffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    return new NextResponse(outBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`제조지시기록서_${itemName}_${orderDate}.xlsx`)}`,
      },
    });
  } catch (err: any) {
    console.error("Excel Auto-Fill Export Error:", err);
    return NextResponse.json({ success: false, error: err.message || "엑셀 생성 중 오류" }, { status: 500 });
  }
}

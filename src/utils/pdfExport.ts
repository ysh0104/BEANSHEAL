// src/utils/pdfExport.ts
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

export const downloadPDF = async (elementId: string, filename: string) => {
  // 1. 화면에서 PDF로 구울 구역(id)을 찾습니다.
  const element = document.getElementById(elementId);
  if (!element) return;

  try {
    // 2. 고화질(scale: 2)로 화면을 찰칵! 사진으로 찍습니다.
    const canvas = await html2canvas(element, { scale: 2, useCORS: true });
    const imgData = canvas.toDataURL('image/png');

    // 3. A4 사이즈 PDF 도화지를 준비합니다.
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

    // 4. 도화지에 사진을 딱 맞게 붙이고 다운로드!
    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
    pdf.save(`${filename}.pdf`);
    
  } catch (error) {
    console.error("PDF 생성 실패:", error);
    alert("PDF 다운로드 중 오류가 발생했습니다.");
  }
};
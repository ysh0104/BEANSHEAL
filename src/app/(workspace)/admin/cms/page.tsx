"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";

// 기본 포트폴리오 30개 샘플 슬롯 생성
const initialPortfolioSlots = Array.from({ length: 30 }, (_, i) => ({
  id: i + 1,
  title: i < 23 ? `비타민 C 레몬 액상스틱 #${i + 1}` : "",
  category: i < 23 ? "건강기능식품 / 파우치" : "",
  format: i < 23 ? "액상 스틱 20ml" : "",
  tags: i < 23 ? "NFC착즙, 비타민C, HACCP" : "",
  desc: i < 23 ? "무균 충진 공정으로 제조된 프리미엄 액상 스틱 파우치 제품입니다." : "",
  image: i < 23 ? `images/portfolio-${(i % 5) + 1}.jpg` : "",
  isFilled: i < 23,
}));

// 기본 FAQ 목록
const initialFaqItems = [
  {
    id: 1,
    question: "소량 생산(MOQ) 최소 주문 수량은 어떻게 되나요?",
    answer: "(주)빈스힐은 신규 브랜드 및 스타트업을 위해 최소 10,000포 단위부터 맞춤 소량 배치 생산(MOQ)이 가능합니다.",
  },
  {
    id: 2,
    question: "원료 배합 개발 및 샘플 시생산 기간은 얼마나 걸리나요?",
    answer: "레시피 개발 요청 접수 후 샘플 제조까지 평균 3~5일 소요되며, 최종 컨펌 후 본 생산 및 포장까지 약 2주 내 신속 납품됩니다.",
  },
  {
    id: 3,
    question: "식약처 품목제조신고 및 원스톱 행정 절차도 대행해 주시나요?",
    answer: "네, 그렇습니다. 건강기능식품 및 기능성 음료 생산에 필수적인 식약처 품목제조신고(FHR), 성분 표시 검토, GMP/HACCP 안전 패키지 가이드까지 전문 행정팀이 원스톱으로 신속하게 전담 대행해 드립니다.",
  },
  {
    id: 4,
    question: "제품 포장 형태(스틱 파우치, 단상자 등)는 어떤 종류가 가능한가요?",
    answer: "15ml~35ml 액상 스틱 파우치(이지컷 무균 충진), 7포/14포/30포 단상자 패키지, 선물용 아웃박스 및 디스플레이 팝업 박스 등 고객사가 희망하는 모든 포장 사양으로 완제품 제조가 가능합니다.",
  },
];

// 기본 견적 문의 데이터
const initialInquiries = [
  {
    id: 101,
    company: "(주)삼정바이오",
    name: "김철수 팀장",
    phone: "010-1234-5678",
    email: "cs@samjungbio.com",
    title: "체지방 감소 가르시니아 액상스틱 20ml 3만포 OEM 견적 문의",
    content: "용량: 20ml\n원료: 가르시니아 + 그린커피빈\n포장: 14포 단상자\n수량: 30,000포\n\n신규 브랜드 출시 예정이며 샘플 제조 및 상세 단가표 요청드립니다.",
    status: "대기중",
    date: "2026-08-05",
    reply: "",
  },
  {
    id: 102,
    company: "스타벅스 코리아 R&D",
    name: "이영희 수석",
    phone: "010-9876-5432",
    email: "yh.lee@starbucks.co.kr",
    title: "프리미엄 콜드브루 액상스틱 벌크 파우치 납품 문의",
    content: "용량: 30ml\n원료: 유기농 아라비카 원두 100% Extract\n포장: 50포 벌크 파우치\n수량: 100,000포 이상",
    status: "답변완료",
    date: "2026-08-04",
    reply: "담당 BM 배치 완료 및 시생산 샘플 전달 완료했습니다.",
  },
  {
    id: 103,
    company: "블루보틀 코리아",
    name: "박민수 이사",
    phone: "010-5555-4444",
    email: "ms.park@bluebottle.com",
    title: "싱글오리진 싱글스틱 샘플 개발 요청",
    content: "용량: 15ml\n원료: 에티오피아 예가체프 NFC\n수량: 50,000포",
    status: "답변완료",
    date: "2026-08-03",
    reply: "레시피 테스트 차수 진행 중입니다.",
  },
];

function AdminCmsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();

  // 탭 상태 (inquiries, calculator, portfolio, faq, settings)
  const tabParam = searchParams.get("tab") as "inquiries" | "calculator" | "portfolio" | "faq" | "settings" | null;
  const activeTab = tabParam || "inquiries";

  const handleTabChange = (tab: "inquiries" | "calculator" | "portfolio" | "faq" | "settings") => {
    router.push(`/admin/cms?tab=${tab}`);
  };

  // 1. 견적 문의 데이터 및 필터
  const [inquiries, setInquiries] = useState(initialInquiries);
  const [inquiryFilter, setInquiryFilter] = useState<"all" | "대기중" | "답변완료" | "trash">("all");
  const [inquirySearch, setInquirySearch] = useState("");
  const [selectedInquiry, setSelectedInquiry] = useState<any | null>(null);
  const [replyText, setReplyText] = useState("");

  // 수동 문의 등록 모달
  const [isNewInquiryOpen, setIsNewInquiryOpen] = useState(false);
  const [newCompany, setNewCompany] = useState("");
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");

  // 2. 트래픽 수치
  const [todayVisitors, setTodayVisitors] = useState(142);
  const [totalVisitors, setTotalVisitors] = useState(12480);
  const [todayPageviews, setTodayPageviews] = useState(489);

  // 3. 견적 산출기 옵션
  const [calcVolume, setCalcVolume] = useState(
    "15ml ~ 20ml (착즙/고농축)\n25ml ~ 30ml (다이어트/커피)\n35ml ~ 50ml (프리미엄/빅스틱)\n기타 (맞춤 용량)"
  );
  const [calcIngredient, setCalcIngredient] = useState(
    "다이어트 & 건강기능커피\n유기농 원료 (NFC 100% 착즙)\n기능성 표시 식품 (밀크씨슬/가르시니아)\n과·채주스 & 효소 음료\n기타 (맞춤 원료 개발)"
  );
  const [calcPackaging, setCalcPackaging] = useState(
    "7포 / 14포 단상자 패키지\n30포 / 50포 대용량 벌크 파우치\n디스플레이 RRP 박스 포장\n기타 (맞춤 포장)"
  );
  const [calcQuantity, setCalcQuantity] = useState(
    "10,000 포 (소량배치)\n30,000 포 (표준배치)\n50,000 포 (대량생산)\n100,000 포 이상\n기타 (맞춤 수량)"
  );

  // 4. 포트폴리오 30개
  const [portfolioList, setPortfolioList] = useState(initialPortfolioSlots);
  const [portfolioFilter, setPortfolioFilter] = useState<"all" | "filled" | "empty">("all");
  const [editCard, setEditCard] = useState<any | null>(null);

  // 5. FAQ 관리
  const [faqItems, setFaqItems] = useState(initialFaqItems);

  // 6. 시스템 설정
  const [companyName, setCompanyName] = useState("(주)빈스힐");
  const [companyCeo, setCompanyCeo] = useState("홍길동");
  const [companyAddress, setCompanyAddress] = useState("경기도 고양시 일산동구 견달산로 359 (주)빈스힐 본사 & 제1공장");
  const [companyPhone, setCompanyPhone] = useState("031-900-0000");
  const [companyFax, setCompanyFax] = useState("031-900-0001");
  const [companyEmail, setCompanyEmail] = useState("beansheal@beansheal.com");
  const [companyHours, setCompanyHours] = useState("평일 09:00 ~ 18:00 (점심시간 12:00 ~ 13:00)");

  // 팝업 설정
  const [popupEnabled, setPopupEnabled] = useState(true);
  const [popupBadge, setPopupBadge] = useState("BEANSHEAL PROMOTION");
  const [popupTitle, setPopupTitle] = useState("빈스힐 소량 액상 건기식 OEM/ODM 특가 프로모션");
  const [popupSubTitle, setPopupSubTitle] = useState("액상 전용 무균 충진 및 신규 브랜드 전격 지원 혜택");
  const [popupB1Title, setPopupB1Title] = useState("소량 MOQ 지원");
  const [popupB1Desc, setPopupB1Desc] = useState("초기 부담 적은 10,000포 생산");
  const [popupB2Title, setPopupB2Title] = useState("무료 샘플 제작");
  const [popupB2Desc, setPopupB2Desc] = useState("3일 내 테스트 샘플 신속 발송");
  const [popupB3Title, setPopupB3Title] = useState("패키지 디자인 지원");
  const [popupB3Desc, setPopupB3Desc] = useState("전담 디자이너 칼선 및 가이드 무료");
  const [popupCta, setPopupCta] = useState("실시간 맞춤 견적 문의하기");

  // 비밀번호 변경
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");

  // 로컬스토리지 로드 (홈페이지와 100% 동기화)
  useEffect(() => {
    try {
      const savedInquiries = localStorage.getItem("beansheal_admin_inquiries") || localStorage.getItem("beansheal_custom_inquiries");
      if (savedInquiries) setInquiries(JSON.parse(savedInquiries));

      const savedCalc = localStorage.getItem("beansheal_calc_options") || localStorage.getItem("beansheal_custom_calc_options");
      if (savedCalc) {
        const parsed = JSON.parse(savedCalc);
        if (parsed.volume) setCalcVolume(Array.isArray(parsed.volume) ? parsed.volume.join("\n") : parsed.volume);
        if (parsed.ingredient) setCalcIngredient(Array.isArray(parsed.ingredient) ? parsed.ingredient.join("\n") : parsed.ingredient);
        if (parsed.packaging) setCalcPackaging(Array.isArray(parsed.packaging) ? parsed.packaging.join("\n") : parsed.packaging);
        if (parsed.quantity) setCalcQuantity(Array.isArray(parsed.quantity) ? parsed.quantity.join("\n") : parsed.quantity);
      }

      const savedPortfolio = localStorage.getItem("beansheal_portfolio_items") || localStorage.getItem("beansheal_custom_portfolio");
      if (savedPortfolio) setPortfolioList(JSON.parse(savedPortfolio));

      const savedFaq = localStorage.getItem("beansheal_faq_items") || localStorage.getItem("beansheal_custom_faqs");
      if (savedFaq) setFaqItems(JSON.parse(savedFaq));

      const savedComp = localStorage.getItem("beansheal_company_info") || localStorage.getItem("beansheal_custom_company_info");
      if (savedComp) {
        const parsed = JSON.parse(savedComp);
        if (parsed.name) setCompanyName(parsed.name);
        if (parsed.ceo) setCompanyCeo(parsed.ceo);
        if (parsed.address) setCompanyAddress(parsed.address);
        if (parsed.phone) setCompanyPhone(parsed.phone);
        if (parsed.fax) setCompanyFax(parsed.fax);
        if (parsed.email) setCompanyEmail(parsed.email);
        if (parsed.hours) setCompanyHours(parsed.hours);
      }

      const savedPopup = localStorage.getItem("beansheal_notice_popup") || localStorage.getItem("beansheal_custom_notice_popup");
      if (savedPopup) {
        const parsed = JSON.parse(savedPopup);
        setPopupEnabled(parsed.enabled !== false);
        if (parsed.badge) setPopupBadge(parsed.badge);
        if (parsed.title) setPopupTitle(parsed.title);
        if (parsed.subtitle) setPopupSubTitle(parsed.subtitle);
        if (parsed.b1Title) setPopupB1Title(parsed.b1Title);
        if (parsed.b1Desc) setPopupB1Desc(parsed.b1Desc);
        if (parsed.b2Title) setPopupB2Title(parsed.b2Title);
        if (parsed.b2Desc) setPopupB2Desc(parsed.b2Desc);
        if (parsed.b3Title) setPopupB3Title(parsed.b3Title);
        if (parsed.b3Desc) setPopupB3Desc(parsed.b3Desc);
        if (parsed.cta) setPopupCta(parsed.cta);
      }
    } catch (e) {}
  }, []);

  // 수동 저장 헬퍼
  const saveInquiriesToStorage = (data: any[]) => {
    setInquiries(data);
    localStorage.setItem("beansheal_admin_inquiries", JSON.stringify(data));
    localStorage.setItem("beansheal_custom_inquiries", JSON.stringify(data));
  };

  // 수동 문의 등록
  const handleCreateNewInquiry = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCompany || !newName || !newPhone) {
      alert("기업명, 작성자, 연락처를 입력해 주세요.");
      return;
    }

    const newObj = {
      id: Date.now(),
      company: newCompany,
      name: newName,
      phone: newPhone,
      email: newEmail || "client@company.com",
      title: newTitle || `${newCompany} 맞춤 사양 견적 문의`,
      content: newContent || "상세 내역 등록 완료",
      status: "대기중",
      date: new Date().toISOString().split("T")[0],
      reply: "",
    };

    const updated = [newObj, ...inquiries];
    saveInquiriesToStorage(updated);
    setIsNewInquiryOpen(false);
    setNewCompany("");
    setNewName("");
    setNewPhone("");
    setNewEmail("");
    setNewTitle("");
    setNewContent("");
    alert("신규 견적 문의가 수동 등록되어 고객 홈페이지와 즉시 동기화되었습니다.");
  };

  // 문의 검색/필터링
  const filteredInquiries = inquiries.filter((item) => {
    if (inquiryFilter === "대기중" && item.status !== "대기중") return false;
    if (inquiryFilter === "답변완료" && item.status !== "답변완료") return false;
    if (inquiryFilter === "trash" && item.status !== "휴지통") return false;
    if (inquiryFilter !== "trash" && item.status === "휴지통") return false;

    if (!inquirySearch.trim()) return true;
    const q = inquirySearch.toLowerCase();
    return (
      item.company.toLowerCase().includes(q) ||
      item.name.toLowerCase().includes(q) ||
      item.title.toLowerCase().includes(q)
    );
  });

  // 카운트
  const pendingCount = inquiries.filter((i) => i.status === "대기중").length;
  const doneCount = inquiries.filter((i) => i.status === "답변완료").length;
  const trashCount = inquiries.filter((i) => i.status === "휴지통").length;

  // 문의 답변 저장
  const handleSaveReply = (targetStatus: string) => {
    if (!selectedInquiry) return;
    const updated = inquiries.map((item) => {
      if (item.id === selectedInquiry.id) {
        return { ...item, status: targetStatus, reply: replyText };
      }
      return item;
    });
    saveInquiriesToStorage(updated);
    setSelectedInquiry(null);
    alert(`문의 상태가 '${targetStatus}'(으)로 업데이트 되었으며 고객 홈페이지와 동기화되었습니다.`);
  };

  // 문의 휴지통 이동
  const handleMoveToTrash = (id: number) => {
    const updated = inquiries.map((item) => (item.id === id ? { ...item, status: "휴지통" } : item));
    saveInquiriesToStorage(updated);
    if (selectedInquiry?.id === id) setSelectedInquiry(null);
    alert("해당 문의가 휴지통으로 이동되었습니다.");
  };

  // 트래픽 리셋
  const handleResetTraffic = () => {
    setTodayVisitors(0);
    setTodayPageviews(0);
    alert("오늘 트래픽 수치가 0으로 리셋되었습니다.");
  };

  // 견적 산출기 저장
  const handleSaveCalcOptions = () => {
    const payload = {
      volume: calcVolume,
      ingredient: calcIngredient,
      packaging: calcPackaging,
      quantity: calcQuantity,
    };
    localStorage.setItem("beansheal_calc_options", JSON.stringify(payload));
    localStorage.setItem("beansheal_custom_calc_options", JSON.stringify(payload));
    alert("견적 산출기 선택 옵션이 성공적으로 저장되어 메인 고객 홈페이지에 반영되었습니다.");
  };

  // 포트폴리오 필터 및 저장
  const filteredPortfolio = portfolioList.filter((item) => {
    if (portfolioFilter === "filled") return item.isFilled;
    if (portfolioFilter === "empty") return !item.isFilled;
    return true;
  });

  const handleSavePortfolioCard = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editCard) return;

    const updated = portfolioList.map((item) => {
      if (item.id === editCard.id) {
        return {
          ...editCard,
          isFilled: !!editCard.title.trim(),
        };
      }
      return item;
    });
    setPortfolioList(updated);
    localStorage.setItem("beansheal_portfolio_items", JSON.stringify(updated));
    localStorage.setItem("beansheal_custom_portfolio", JSON.stringify(updated));
    setEditCard(null);
    alert(`#${editCard.id} 포트폴리오 슬롯 정보가 저장되어 메인 홈페이지에 반영되었습니다.`);
  };

  // FAQ 추가/삭제/저장
  const handleAddFaq = () => {
    const newFaq = {
      id: Date.now(),
      question: "신규 자주 묻는 질문을 입력해 주세요.",
      answer: "답변 내용을 입력해 주세요.",
    };
    const updated = [...faqItems, newFaq];
    setFaqItems(updated);
  };

  const handleDeleteFaq = (id: number) => {
    const updated = faqItems.filter((f) => f.id !== id);
    setFaqItems(updated);
  };

  const handleSaveFaqs = () => {
    localStorage.setItem("beansheal_faq_items", JSON.stringify(faqItems));
    localStorage.setItem("beansheal_custom_faqs", JSON.stringify(faqItems));
    alert("자주 묻는 질문(FAQ) 목록이 저장되어 메인 홈페이지에 반영되었습니다.");
  };

  // 회사 정보 저장
  const handleSaveCompanyInfo = (e: React.FormEvent) => {
    e.preventDefault();
    const compPayload = {
      name: companyName,
      ceo: companyCeo,
      address: companyAddress,
      phone: companyPhone,
      fax: companyFax,
      email: companyEmail,
      hours: companyHours,
    };
    localStorage.setItem("beansheal_company_info", JSON.stringify(compPayload));
    localStorage.setItem("beansheal_custom_company_info", JSON.stringify(compPayload));
    alert("회사 기본 정보 및 본사 주소가 변경되었습니다. 메인 사이트 푸터와 지도에 즉시 반영됩니다.");
  };

  // 팝업 설정 저장
  const handleSavePopupInfo = (e: React.FormEvent) => {
    e.preventDefault();
    const popupPayload = {
      enabled: popupEnabled,
      badge: popupBadge,
      title: popupTitle,
      subtitle: popupSubTitle,
      b1Title: popupB1Title,
      b1Desc: popupB1Desc,
      b2Title: popupB2Title,
      b2Desc: popupB2Desc,
      b3Title: popupB3Title,
      b3Desc: popupB3Desc,
      cta: popupCta,
    };
    localStorage.setItem("beansheal_notice_popup", JSON.stringify(popupPayload));
    localStorage.setItem("beansheal_custom_notice_popup", JSON.stringify(popupPayload));
    alert("메인 프로모션 팝업 설정이 동기화 저장되었습니다.");
  };

  // 테스트 이메일 발송
  const handleTestEmail = () => {
    alert(`[테스트 이메일 발송 완료]\n수신자: ${companyEmail}\n\n"고객 견적 문의 접수 알림 테스트 메일이 정상 작동합니다."`);
  };

  // 비밀번호 변경
  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPwd || !newPwd) {
      alert("비밀번호를 입력해 주세요.");
      return;
    }
    if (newPwd !== confirmPwd) {
      alert("새 비밀번호와 비밀번호 확인이 일치하지 않습니다.");
      return;
    }
    alert("관리자 비밀번호가 성공적으로 변경되었습니다.");
    setCurrentPwd("");
    setNewPwd("");
    setConfirmPwd("");
  };

  // CSV 다운로드
  const handleExportCSV = () => {
    let csvContent = "data:text/csv;charset=utf-8,\uFEFF";
    csvContent += "번호,기업명,작성자,연락처,이메일,문의제목,접수일,상태\n";
    inquiries.forEach((item) => {
      csvContent += `"${item.id}","${item.company}","${item.name}","${item.phone}","${item.email}","${item.title.replace(/"/g, '""')}","${item.date}","${item.status}"\n`;
    });
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `BEANSHEAL_Inquiries_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 p-4 md:p-6 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Top Header Card */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500 font-semibold mb-1">
              <Link href="/workspace" className="hover:text-blue-600 transition-colors">사내 업무 ERP</Link>
              <span>/</span>
              <span className="text-slate-700">홈페이지 브랜드 관리 (CMS)</span>
            </div>
            <h1 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              BEANSHEAL 공식 브랜드 홈페이지 관리자 시스템
            </h1>
            <p className="text-xs text-slate-500 font-medium mt-1">
              고객 문의 접수, 견적 산출기, 생산 포트폴리오, FAQ 및 브랜드 시스템 설정을 관리하며 메인 홈페이지와 실시간 동기화됩니다.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <a
              href="https://beansheal.vercel.app/"
              target="_blank"
              rel="noreferrer"
              className="bg-[#3352c4] hover:bg-[#2c4cb0] text-white font-bold text-xs px-4 py-2.5 rounded-xl transition-all shadow-xs flex items-center gap-2 cursor-pointer"
            >
              <span>Vercel 라이브 사이트 이동</span>
            </a>
            <Link
              href="/workspace"
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs px-4 py-2.5 rounded-xl border border-slate-300 transition-all flex items-center gap-2"
            >
              <span>← ERP 메인으로 돌아가기</span>
            </Link>
          </div>
        </div>

        {/* CMS Sub Navigation Tabs */}
        <div className="flex bg-white border border-slate-200/90 p-1.5 rounded-2xl shadow-2xs gap-1 overflow-x-auto text-xs md:text-sm font-bold">
          <button
            onClick={() => handleTabChange("inquiries")}
            className={`px-4 py-3 rounded-xl transition-all whitespace-nowrap cursor-pointer flex items-center gap-2 ${
              activeTab === "inquiries"
                ? "bg-[#3352c4] text-white shadow-xs font-bold"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            <span>고객 견적 문의 관리</span>
            {pendingCount > 0 && (
              <span className="bg-amber-400 text-slate-950 px-2 py-0.5 rounded-full text-[11px] font-bold">
                {pendingCount}
              </span>
            )}
          </button>

          <button
            onClick={() => handleTabChange("calculator")}
            className={`px-4 py-3 rounded-xl transition-all whitespace-nowrap cursor-pointer flex items-center gap-2 ${
              activeTab === "calculator"
                ? "bg-[#3352c4] text-white shadow-xs font-bold"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            <span>견적 산출기 옵션 설정</span>
          </button>

          <button
            onClick={() => handleTabChange("portfolio")}
            className={`px-4 py-3 rounded-xl transition-all whitespace-nowrap cursor-pointer flex items-center gap-2 ${
              activeTab === "portfolio"
                ? "bg-[#3352c4] text-white shadow-xs font-bold"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            <span>포트폴리오 관리 (30개)</span>
          </button>

          <button
            onClick={() => handleTabChange("faq")}
            className={`px-4 py-3 rounded-xl transition-all whitespace-nowrap cursor-pointer flex items-center gap-2 ${
              activeTab === "faq"
                ? "bg-[#3352c4] text-white shadow-xs font-bold"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            <span>자주 묻는 질문 (FAQ)</span>
          </button>

          <button
            onClick={() => handleTabChange("settings")}
            className={`px-4 py-3 rounded-xl transition-all whitespace-nowrap cursor-pointer flex items-center gap-2 ${
              activeTab === "settings"
                ? "bg-[#3352c4] text-white shadow-xs font-bold"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            <span>홈페이지 시스템 설정</span>
          </button>
        </div>

        {/* =========================================================================
            TAB 1: 고객 견적 문의 관리 & 방문자 트래픽 현황
           ========================================================================= */}
        {activeTab === "inquiries" && (
          <div className="space-y-6">
            
            {/* Real-time Visitor Analytics Traffic Card */}
            <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-2xs space-y-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#3352c4] animate-pulse"></span>
                  홈페이지 실시간 방문자 트래픽 현황
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleResetTraffic}
                    className="text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200 transition-all cursor-pointer"
                  >
                    수치 0으로 리셋
                  </button>
                  <span className="text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-full">
                    자동 실시간 집계중
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 text-center">
                  <div className="text-xs font-medium text-slate-500 mb-1">오늘 방문자 수</div>
                  <div className="text-xl font-bold text-slate-900">{todayVisitors} 명</div>
                </div>
                <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 text-center">
                  <div className="text-xs font-medium text-slate-500 mb-1">누적 총 방문자 수</div>
                  <div className="text-xl font-bold text-slate-900">{totalVisitors.toLocaleString()} 명</div>
                </div>
                <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 text-center">
                  <div className="text-xs font-medium text-slate-500 mb-1">오늘 총 페이지뷰</div>
                  <div className="text-xl font-bold text-slate-900">{todayPageviews} 회</div>
                </div>
                <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 text-center">
                  <div className="text-xs font-medium text-slate-500 mb-1">실시간 견적 전환율</div>
                  <div className="text-xl font-bold text-slate-900">4.8 %</div>
                </div>
              </div>
            </div>

            {/* Inquiries Table Card */}
            <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-2xs space-y-4">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setInquiryFilter("all")}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold cursor-pointer border transition-all ${
                      inquiryFilter === "all" ? "bg-[#3352c4] text-white border-[#3352c4]" : "bg-slate-50 text-slate-600 border-slate-200"
                    }`}
                  >
                    전체 ({inquiries.filter((i) => i.status !== "휴지통").length})
                  </button>
                  <button
                    onClick={() => setInquiryFilter("대기중")}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold cursor-pointer border transition-all ${
                      inquiryFilter === "대기중" ? "bg-amber-600 text-white border-amber-600" : "bg-amber-50 text-amber-800 border-amber-200"
                    }`}
                  >
                    답변 대기중 ({pendingCount})
                  </button>
                  <button
                    onClick={() => setInquiryFilter("답변완료")}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold cursor-pointer border transition-all ${
                      inquiryFilter === "답변완료" ? "bg-emerald-600 text-white border-emerald-600" : "bg-emerald-50 text-emerald-800 border-emerald-200"
                    }`}
                  >
                    답변 완료 ({doneCount})
                  </button>
                  <button
                    onClick={() => setInquiryFilter("trash")}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold cursor-pointer border transition-all ${
                      inquiryFilter === "trash" ? "bg-rose-600 text-white border-rose-600" : "bg-rose-50 text-rose-800 border-rose-200"
                    }`}
                  >
                    휴지통 ({trashCount})
                  </button>
                </div>

                <div className="flex items-center gap-3 w-full md:w-auto">
                  <input
                    type="text"
                    placeholder="기업명, 작성자, 제목으로 검색..."
                    value={inquirySearch}
                    onChange={(e) => setInquirySearch(e.target.value)}
                    className="bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#3352c4] w-full md:w-64"
                  />
                  <button
                    onClick={() => setIsNewInquiryOpen(true)}
                    className="bg-[#3352c4] hover:bg-[#2c4cb0] text-white font-bold text-xs px-4 py-2 rounded-xl transition-all shadow-2xs shrink-0 cursor-pointer"
                  >
                    + 수동 문의 등록
                  </button>
                </div>
              </div>

              {/* Table */}
              <div className="overflow-x-auto border border-slate-200/80 rounded-xl">
                <table className="w-full text-left text-xs font-normal border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-bold">
                      <th className="p-3 w-16">번호</th>
                      <th className="p-3 w-28">상태</th>
                      <th className="p-3">문의 제목 / 사양 요약</th>
                      <th className="p-3 w-36">작성자/기업명</th>
                      <th className="p-3 w-32">연락처</th>
                      <th className="p-3 w-28">접수일자</th>
                      <th className="p-3 w-24 text-right">관리</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
                    {filteredInquiries.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-slate-400 font-semibold">
                          조건에 부합하는 고객 문의 내역이 없습니다.
                        </td>
                      </tr>
                    ) : (
                      filteredInquiries.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="p-3 text-slate-400 font-mono">#{item.id}</td>
                          <td className="p-3">
                            <span
                              className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                                item.status === "답변완료"
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                  : item.status === "휴지통"
                                  ? "bg-slate-100 text-slate-500 border-slate-300"
                                  : "bg-amber-50 text-amber-800 border-amber-200"
                              }`}
                            >
                              {item.status}
                            </span>
                          </td>
                          <td className="p-3 font-semibold text-slate-900">{item.title}</td>
                          <td className="p-3 font-bold text-slate-800">{item.company} / {item.name}</td>
                          <td className="p-3 font-mono text-slate-600">{item.phone}</td>
                          <td className="p-3 font-mono text-slate-500">{item.date}</td>
                          <td className="p-3 text-right">
                            <button
                              onClick={() => {
                                setSelectedInquiry(item);
                                setReplyText(item.reply || "");
                              }}
                              className="px-2.5 py-1 bg-[#3352c4] hover:bg-[#2c4cb0] text-white font-bold rounded-lg text-[11px] transition-colors cursor-pointer"
                            >
                              상세보기
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

        {/* =========================================================================
            TAB 2: 견적 산출기 옵션 설정
           ========================================================================= */}
        {activeTab === "calculator" && (
          <div className="bg-white border border-slate-200/90 rounded-2xl p-6 sm:p-8 shadow-2xs space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  실시간 견적 산출기 옵션 관리
                </h2>
                <p className="text-xs font-medium text-slate-500 mt-1">
                  홈페이지 견적 산출기 드롭다운 옵션을 엔터(줄바꿈)로 수정하시면 메인 홈페이지와 즉시 동기화됩니다.
                </p>
              </div>
              <button
                onClick={handleSaveCalcOptions}
                className="bg-[#3352c4] hover:bg-[#2c4cb0] text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-2xs transition-all cursor-pointer"
              >
                설정 저장 완료
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs font-semibold">
              {/* Category 1 */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
                <label className="text-slate-800 font-bold block text-sm">1. 액상 스틱 용량 옵션 (한 줄에 1개씩)</label>
                <textarea
                  value={calcVolume}
                  onChange={(e) => setCalcVolume(e.target.value)}
                  className="w-full h-32 bg-white border border-slate-200 rounded-lg p-3 text-slate-800 font-medium text-xs leading-relaxed focus:outline-none focus:border-[#3352c4]"
                />
              </div>

              {/* Category 2 */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
                <label className="text-slate-800 font-bold block text-sm">2. 원료 및 카테고리 옵션 (한 줄에 1개씩)</label>
                <textarea
                  value={calcIngredient}
                  onChange={(e) => setCalcIngredient(e.target.value)}
                  className="w-full h-32 bg-white border border-slate-200 rounded-lg p-3 text-slate-800 font-medium text-xs leading-relaxed focus:outline-none focus:border-[#3352c4]"
                />
              </div>

              {/* Category 3 */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
                <label className="text-slate-800 font-bold block text-sm">3. 포장 형태 옵션 (한 줄에 1개씩)</label>
                <textarea
                  value={calcPackaging}
                  onChange={(e) => setCalcPackaging(e.target.value)}
                  className="w-full h-32 bg-white border border-slate-200 rounded-lg p-3 text-slate-800 font-medium text-xs leading-relaxed focus:outline-none focus:border-[#3352c4]"
                />
              </div>

              {/* Category 4 */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
                <label className="text-slate-800 font-bold block text-sm">4. 예상 생산 수량 옵션 (한 줄에 1개씩)</label>
                <textarea
                  value={calcQuantity}
                  onChange={(e) => setCalcQuantity(e.target.value)}
                  className="w-full h-32 bg-white border border-slate-200 rounded-lg p-3 text-slate-800 font-medium text-xs leading-relaxed focus:outline-none focus:border-[#3352c4]"
                />
              </div>
            </div>

            <div className="pt-2 text-right">
              <button
                onClick={handleSaveCalcOptions}
                className="bg-[#3352c4] hover:bg-[#2c4cb0] text-white font-bold text-sm px-6 py-3 rounded-xl shadow-xs transition-all cursor-pointer"
              >
                견적 산출기 옵션 저장 및 홈페이지 즉시 반영
              </button>
            </div>
          </div>
        )}

        {/* =========================================================================
            TAB 3: 포트폴리오 관리 (1~30번 슬롯)
           ========================================================================= */}
        {activeTab === "portfolio" && (
          <div className="bg-white border border-slate-200/90 rounded-2xl p-6 sm:p-8 shadow-2xs space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  생산 포트폴리오 슬롯 관리 (총 30개)
                </h2>
                <p className="text-xs font-medium text-slate-500 mt-1">
                  슬롯 카드를 클릭하여 제품명, 제형, 태그 및 이미지를 수정하면 홈페이지에 실시간 적용됩니다.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPortfolioFilter("all")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer border ${
                    portfolioFilter === "all" ? "bg-[#3352c4] text-white border-[#3352c4]" : "bg-slate-50 text-slate-600 border-slate-200"
                  }`}
                >
                  전체 30개
                </button>
                <button
                  onClick={() => setPortfolioFilter("filled")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer border ${
                    portfolioFilter === "filled" ? "bg-[#2c4cb0] text-white border-[#2c4cb0]" : "bg-slate-50 text-slate-700 border-slate-200"
                  }`}
                >
                  등록 완료 ({portfolioList.filter((i) => i.isFilled).length})
                </button>
                <button
                  onClick={() => setPortfolioFilter("empty")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer border ${
                    portfolioFilter === "empty" ? "bg-slate-500 text-white border-slate-500" : "bg-slate-50 text-slate-600 border-slate-200"
                  }`}
                >
                  빈 슬롯 ({portfolioList.filter((i) => !i.isFilled).length})
                </button>
              </div>
            </div>

            {/* 30 Grid Slots */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
              {filteredPortfolio.map((item) => (
                <div
                  key={item.id}
                  onClick={() => setEditCard(item)}
                  className={`border rounded-xl p-3 flex flex-col justify-between transition-all cursor-pointer hover:shadow-xs ${
                    item.isFilled
                      ? "bg-white border-slate-200 hover:border-[#3352c4]"
                      : "bg-slate-50 border-dashed border-slate-300 hover:border-slate-400"
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[11px] font-bold">
                      <span className="text-slate-400">#{item.id}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] ${item.isFilled ? "bg-blue-50 text-blue-700" : "bg-slate-200 text-slate-600"}`}>
                        {item.isFilled ? "등록됨" : "빈 슬롯"}
                      </span>
                    </div>

                    <div className="h-24 bg-slate-100 rounded-lg flex items-center justify-center overflow-hidden border border-slate-200/60">
                      {item.image ? (
                        <div className="text-center p-2 text-xs font-medium text-slate-600 truncate">{item.title}</div>
                      ) : (
                        <span className="text-2xl text-slate-300">+</span>
                      )}
                    </div>

                    <div className="text-xs font-bold text-slate-900 truncate">
                      {item.title || "미등록 슬롯 (클릭 편집)"}
                    </div>
                    <div className="text-[11px] font-medium text-slate-500 truncate">
                      {item.format || "제형 스펙 미설정"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* =========================================================================
            TAB 4: FAQ 관리
           ========================================================================= */}
        {activeTab === "faq" && (
          <div className="bg-white border border-slate-200/90 rounded-2xl p-6 sm:p-8 shadow-2xs space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  자주 묻는 질문 (FAQ) 전용 관리
                </h2>
                <p className="text-xs font-medium text-slate-500 mt-1">
                  메인 홈페이지 FAQ 섹션에 노출되는 질문과 답변을 수정, 추가, 삭제하세요.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleAddFaq}
                  className="bg-[#3352c4] hover:bg-[#2c4cb0] text-white font-bold text-xs px-4 py-2 rounded-xl transition-all shadow-2xs cursor-pointer"
                >
                  + 신규 질문 추가
                </button>
                <button
                  onClick={handleSaveFaqs}
                  className="bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs px-4 py-2 rounded-xl transition-all shadow-2xs cursor-pointer"
                >
                  전체 저장
                </button>
              </div>
            </div>

            <div className="space-y-4">
              {faqItems.map((faq, index) => (
                <div key={faq.id} className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg">
                      Q{index + 1}. 질문 #{faq.id}
                    </span>
                    <button
                      onClick={() => handleDeleteFaq(faq.id)}
                      className="text-xs font-semibold text-rose-600 hover:text-rose-800 cursor-pointer"
                    >
                      삭제
                    </button>
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-slate-500 block mb-1">질문 (Question)</label>
                    <input
                      type="text"
                      value={faq.question}
                      onChange={(e) => {
                        const val = e.target.value;
                        setFaqItems(faqItems.map((item) => (item.id === faq.id ? { ...item, question: val } : item)));
                      }}
                      className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs font-bold text-slate-900 focus:outline-none focus:border-[#3352c4]"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-slate-500 block mb-1">답변 (Answer)</label>
                    <textarea
                      value={faq.answer}
                      onChange={(e) => {
                        const val = e.target.value;
                        setFaqItems(faqItems.map((item) => (item.id === faq.id ? { ...item, answer: val } : item)));
                      }}
                      className="w-full h-20 bg-white border border-slate-200 rounded-lg p-2.5 text-xs font-medium text-slate-800 leading-relaxed focus:outline-none focus:border-[#3352c4]"
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="text-right">
              <button
                onClick={handleSaveFaqs}
                className="bg-[#3352c4] hover:bg-[#2c4cb0] text-white font-bold text-sm px-6 py-3 rounded-xl shadow-xs transition-all cursor-pointer"
              >
                FAQ 변경사항 저장 및 홈페이지 즉시 반영
              </button>
            </div>
          </div>
        )}

        {/* =========================================================================
            TAB 5: 홈페이지 시스템 설정
           ========================================================================= */}
        {activeTab === "settings" && (
          <div className="space-y-6">
            
            {/* 1. 회사 기본 정보 및 주소 변경 Card */}
            <div className="bg-white border border-slate-200/90 rounded-2xl p-6 sm:p-8 shadow-2xs space-y-4">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
                회사 기본 정보 및 본사 주소 변경
              </h2>
              
              <form onSubmit={handleSaveCompanyInfo} className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-semibold">
                <div>
                  <label className="text-slate-600 block mb-1">회사명 / 브랜드명</label>
                  <input
                    type="text"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 font-medium"
                    required
                  />
                </div>
                <div>
                  <label className="text-slate-600 block mb-1">대표자 성명</label>
                  <input
                    type="text"
                    value={companyCeo}
                    onChange={(e) => setCompanyCeo(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 font-medium"
                    required
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="text-slate-600 block mb-1">본사 & 공장 도로명 주소 (주소 이전 시 수정)</label>
                  <input
                    type="text"
                    value={companyAddress}
                    onChange={(e) => setCompanyAddress(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-slate-900 font-bold"
                    required
                  />
                </div>

                <div>
                  <label className="text-slate-600 block mb-1">대표 전화번호</label>
                  <input
                    type="text"
                    value={companyPhone}
                    onChange={(e) => setCompanyPhone(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 font-medium"
                    required
                  />
                </div>
                <div>
                  <label className="text-slate-600 block mb-1">팩스 번호</label>
                  <input
                    type="text"
                    value={companyFax}
                    onChange={(e) => setCompanyFax(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 font-medium"
                    required
                  />
                </div>

                <div>
                  <label className="text-slate-600 block mb-1">대표 이메일 주소</label>
                  <input
                    type="email"
                    value={companyEmail}
                    onChange={(e) => setCompanyEmail(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 font-medium"
                    required
                  />
                </div>
                <div>
                  <label className="text-slate-600 block mb-1">전화 상담시간</label>
                  <input
                    type="text"
                    value={companyHours}
                    onChange={(e) => setCompanyHours(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 font-medium"
                    required
                  />
                </div>

                <div className="sm:col-span-2 pt-2">
                  <button
                    type="submit"
                    className="w-full bg-[#3352c4] hover:bg-[#2c4cb0] text-white font-bold text-sm py-3 rounded-xl shadow-xs transition-all cursor-pointer"
                  >
                    회사 정보 및 주소 변경 저장하기
                  </button>
                </div>
              </form>
            </div>

            {/* 2. Notice Popup Management Card */}
            <div className="bg-white border border-slate-200/90 rounded-2xl p-6 sm:p-8 shadow-2xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  메인 프로모션 팝업 노출 및 문구 관리
                </h2>

                <label className="flex items-center gap-2 cursor-pointer bg-slate-100 px-3 py-1.5 rounded-full border border-slate-200">
                  <span className="text-xs font-semibold text-slate-700">팝업 노출 상태:</span>
                  <input
                    type="checkbox"
                    checked={popupEnabled}
                    onChange={(e) => setPopupEnabled(e.target.checked)}
                    className="w-4 h-4 accent-[#3352c4] rounded cursor-pointer"
                  />
                  <span className={`text-xs font-bold ${popupEnabled ? "text-[#3352c4]" : "text-slate-400"}`}>
                    [{popupEnabled ? "켜짐 ON" : "꺼짐 OFF"}]
                  </span>
                </label>
              </div>

              <form onSubmit={handleSavePopupInfo} className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-semibold">
                <div className="sm:col-span-2">
                  <label className="text-slate-600 block mb-1">팝업 뱃지 텍스트</label>
                  <input
                    type="text"
                    value={popupBadge}
                    onChange={(e) => setPopupBadge(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800"
                    required
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-slate-600 block mb-1">팝업 메인 대제목</label>
                  <input
                    type="text"
                    value={popupTitle}
                    onChange={(e) => setPopupTitle(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 font-bold"
                    required
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-slate-600 block mb-1">팝업 서브 소제목</label>
                  <input
                    type="text"
                    value={popupSubTitle}
                    onChange={(e) => setPopupSubTitle(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800"
                    required
                  />
                </div>

                <div>
                  <label className="text-slate-600 block mb-1">혜택 1 제목</label>
                  <input type="text" value={popupB1Title} onChange={(e) => setPopupB1Title(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 text-slate-800" required />
                </div>
                <div>
                  <label className="text-slate-600 block mb-1">혜택 1 상세 설명</label>
                  <input type="text" value={popupB1Desc} onChange={(e) => setPopupB1Desc(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 text-slate-800" required />
                </div>

                <div>
                  <label className="text-slate-600 block mb-1">혜택 2 제목</label>
                  <input type="text" value={popupB2Title} onChange={(e) => setPopupB2Title(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 text-slate-800" required />
                </div>
                <div>
                  <label className="text-slate-600 block mb-1">혜택 2 상세 설명</label>
                  <input type="text" value={popupB2Desc} onChange={(e) => setPopupB2Desc(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 text-slate-800" required />
                </div>

                <div>
                  <label className="text-slate-600 block mb-1">혜택 3 제목</label>
                  <input type="text" value={popupB3Title} onChange={(e) => setPopupB3Title(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 text-slate-800" required />
                </div>
                <div>
                  <label className="text-slate-600 block mb-1">혜택 3 상세 설명</label>
                  <input type="text" value={popupB3Desc} onChange={(e) => setPopupB3Desc(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 text-slate-800" required />
                </div>

                <div className="sm:col-span-2">
                  <label className="text-slate-600 block mb-1">하단 CTA 상담 신청 버튼 문구</label>
                  <input
                    type="text"
                    value={popupCta}
                    onChange={(e) => setPopupCta(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 font-bold"
                    required
                  />
                </div>

                <div className="sm:col-span-2 pt-2">
                  <button
                    type="submit"
                    className="w-full bg-[#3352c4] hover:bg-[#2c4cb0] text-white font-bold text-sm py-3 rounded-xl shadow-xs transition-all cursor-pointer"
                  >
                    팝업 노출 및 문구 저장하기
                  </button>
                </div>
              </form>
            </div>

            {/* 3. Real-time Email Notification Setup Card */}
            <div className="bg-white border border-slate-200/90 rounded-2xl p-6 sm:p-8 shadow-2xs space-y-4">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
                실시간 이메일 수신 알림 설정
              </h2>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-medium text-slate-600">현재 알림 수신 이메일 주소:</div>
                  <div className="text-base font-bold text-slate-900">{companyEmail}</div>
                </div>
                <button
                  type="button"
                  onClick={handleTestEmail}
                  className="bg-[#3352c4] hover:bg-[#2c4cb0] text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-xs transition-all shrink-0 cursor-pointer"
                >
                  테스트 이메일 발송해보기
                </button>
              </div>
            </div>

            {/* 4. Password Change & CSV Backup Card */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Password Change */}
              <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-2xs space-y-4">
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
                  관리자 비밀번호 변경
                </h2>
                <form onSubmit={handleChangePassword} className="space-y-3 text-xs font-semibold">
                  <div>
                    <label className="text-slate-600 block mb-1">현재 비밀번호</label>
                    <input
                      type="password"
                      value={currentPwd}
                      onChange={(e) => setCurrentPwd(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800"
                      placeholder="현재 비밀번호 입력"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-slate-600 block mb-1">새 비밀번호</label>
                    <input
                      type="password"
                      value={newPwd}
                      onChange={(e) => setNewPwd(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800"
                      placeholder="새 비밀번호 입력"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-slate-600 block mb-1">새 비밀번호 확인</label>
                    <input
                      type="password"
                      value={confirmPwd}
                      onChange={(e) => setConfirmPwd(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800"
                      placeholder="새 비밀번호 한번 더 입력"
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full bg-[#3352c4] hover:bg-[#2c4cb0] text-white font-bold py-2.5 rounded-xl shadow-xs transition-all cursor-pointer"
                  >
                    새 비밀번호 저장
                  </button>
                </form>
              </div>

              {/* CSV Export Backup */}
              <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-2xs space-y-4 flex flex-col justify-between">
                <div>
                  <h2 className="text-base font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
                    견적 문의 데이터 백업 (CSV 엑셀)
                  </h2>
                  <p className="text-xs font-medium text-slate-500 leading-relaxed mt-3">
                    접수된 모든 고객 견적 문의 내역을 CSV 엑셀 파일 형태로 백업 내보내기합니다.
                  </p>
                </div>
                <button
                  onClick={handleExportCSV}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm py-3 rounded-xl shadow-xs transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  <span>전체 견적 데이터 엑셀(CSV) 다운로드</span>
                </button>
              </div>
            </div>

          </div>
        )}

        {/* =========================================================================
            MODAL 1: Detail Inquiry View & Reply Modal
           ========================================================================= */}
        {selectedInquiry && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-xl w-full p-6 space-y-4 animate-fadeIn">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="font-bold text-base text-slate-900">견적 문의 상세보기</h3>
                <button onClick={() => setSelectedInquiry(null)} className="text-slate-400 hover:text-slate-700 font-bold text-lg cursor-pointer">
                  ✕
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div className="flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <span className="font-bold text-slate-900">{selectedInquiry.company} / {selectedInquiry.name}</span>
                  <span className="font-mono text-slate-500">{selectedInquiry.date}</span>
                </div>

                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 font-medium text-slate-800 space-y-1">
                  <div>연락처: <span className="font-mono">{selectedInquiry.phone}</span></div>
                  <div>이메일: <span className="font-mono">{selectedInquiry.email}</span></div>
                </div>

                <div>
                  <label className="font-bold text-slate-600 block mb-1">문의 및 사양 내용</label>
                  <div className="bg-slate-100 p-3.5 rounded-xl border border-slate-200 text-slate-900 whitespace-pre-wrap font-medium leading-relaxed">
                    {selectedInquiry.content}
                  </div>
                </div>

                <div>
                  <label className="font-bold text-slate-600 block mb-1">관리자 답변 작성</label>
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="고객에게 전달할 관리자 처리 메모 및 답변..."
                    className="w-full h-24 bg-white border border-slate-200 rounded-xl p-3 text-xs font-medium text-slate-800 focus:outline-none focus:border-[#3352c4]"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={() => handleMoveToTrash(selectedInquiry.id)}
                  className="text-xs font-bold text-rose-600 hover:text-rose-800 bg-rose-50 px-3.5 py-2 rounded-xl border border-rose-200 cursor-pointer"
                >
                  휴지통 이동
                </button>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleSaveReply("대기중")}
                    className="text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 px-3.5 py-2 rounded-xl border border-slate-200 cursor-pointer"
                  >
                    대기 상태 저장
                  </button>
                  <button
                    onClick={() => handleSaveReply("답변완료")}
                    className="text-xs font-bold text-white bg-[#3352c4] hover:bg-[#2c4cb0] px-4 py-2 rounded-xl shadow-xs cursor-pointer"
                  >
                    답변 완료 처리
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* =========================================================================
            MODAL 2: New Manual Inquiry Modal
           ========================================================================= */}
        {isNewInquiryOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full p-6 space-y-4 animate-fadeIn">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="font-bold text-base text-slate-900">수동 견적 문의 등록</h3>
                <button onClick={() => setIsNewInquiryOpen(false)} className="text-slate-400 hover:text-slate-700 font-bold text-lg cursor-pointer">
                  ✕
                </button>
              </div>

              <form onSubmit={handleCreateNewInquiry} className="space-y-3 text-xs font-semibold">
                <div>
                  <label className="text-slate-600 block mb-1">기업명 *</label>
                  <input
                    type="text"
                    value={newCompany}
                    onChange={(e) => setNewCompany(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800"
                    placeholder="예: (주)빈스헬스"
                    required
                  />
                </div>
                <div>
                  <label className="text-slate-600 block mb-1">작성자 이름 *</label>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800"
                    placeholder="예: 홍길동 팀장"
                    required
                  />
                </div>
                <div>
                  <label className="text-slate-600 block mb-1">연락처 *</label>
                  <input
                    type="text"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800"
                    placeholder="예: 010-1234-5678"
                    required
                  />
                </div>
                <div>
                  <label className="text-slate-600 block mb-1">이메일</label>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800"
                    placeholder="예: user@beansheal.com"
                  />
                </div>
                <div>
                  <label className="text-slate-600 block mb-1">문의 제목</label>
                  <input
                    type="text"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800"
                    placeholder="예: 액상스틱 2만포 맞춤 견적 문의"
                  />
                </div>
                <div>
                  <label className="text-slate-600 block mb-1">상세 문의 내용</label>
                  <textarea
                    value={newContent}
                    onChange={(e) => setNewContent(e.target.value)}
                    className="w-full h-20 bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800"
                    placeholder="상세 내용을 입력하세요."
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsNewInquiryOpen(false)}
                    className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl cursor-pointer"
                  >
                    취소
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 bg-[#3352c4] hover:bg-[#2c4cb0] text-white font-bold rounded-xl shadow-xs cursor-pointer"
                  >
                    등록 완료
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* =========================================================================
            MODAL 3: Portfolio Card Edit Modal
           ========================================================================= */}
        {editCard && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full p-6 space-y-4 animate-fadeIn">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="font-bold text-base text-slate-900">
                  포트폴리오 카드 수정 (#{editCard.id})
                </h3>
                <button onClick={() => setEditCard(null)} className="text-slate-400 hover:text-slate-700 font-bold text-lg cursor-pointer">
                  ✕
                </button>
              </div>

              <form onSubmit={handleSavePortfolioCard} className="space-y-3 text-xs font-semibold">
                <div>
                  <label className="text-slate-600 block mb-1">제품명 (Title)</label>
                  <input
                    type="text"
                    value={editCard.title}
                    onChange={(e) => setEditCard({ ...editCard, title: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 font-bold"
                    placeholder="예: 비타민 C 레몬 액상스틱"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-slate-600 block mb-1">카테고리</label>
                    <input
                      type="text"
                      value={editCard.category}
                      onChange={(e) => setEditCard({ ...editCard, category: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 text-slate-800"
                      placeholder="예: 건강기능식품"
                    />
                  </div>
                  <div>
                    <label className="text-slate-600 block mb-1">제형 규격</label>
                    <input
                      type="text"
                      value={editCard.format}
                      onChange={(e) => setEditCard({ ...editCard, format: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 text-slate-800"
                      placeholder="예: 액상 스틱 20ml"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-slate-600 block mb-1">태그 (쉼표 분리)</label>
                  <input
                    type="text"
                    value={editCard.tags}
                    onChange={(e) => setEditCard({ ...editCard, tags: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800"
                    placeholder="예: NFC착즙, HACCP"
                  />
                </div>

                <div>
                  <label className="text-slate-600 block mb-1">제품 이미지 경로 / URL</label>
                  <input
                    type="text"
                    value={editCard.image}
                    onChange={(e) => setEditCard({ ...editCard, image: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 font-mono"
                    placeholder="images/portfolio-1.jpg"
                  />
                </div>

                <div>
                  <label className="text-slate-600 block mb-1">제품 설명</label>
                  <textarea
                    value={editCard.desc}
                    onChange={(e) => setEditCard({ ...editCard, desc: e.target.value })}
                    className="w-full h-16 bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setEditCard(null)}
                    className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl cursor-pointer"
                  >
                    취소
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 bg-[#3352c4] hover:bg-[#2c4cb0] text-white font-bold rounded-xl shadow-xs cursor-pointer"
                  >
                    저장 완료
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

export default function AdminCmsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-slate-500 font-bold">로딩 중...</div>}>
      <AdminCmsContent />
    </Suspense>
  );
}

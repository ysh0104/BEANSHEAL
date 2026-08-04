// (주)빈스힐 관리자 시스템 통합 JS (js/admin.js)
import { DATA } from './data.js';

let inquiriesData = [];
let portfolioData = [];
let currentFilter = 'all';
let currentPFilter = 'all';
let selectedInquiryId = null;
let currentEditingIndex = null;

document.addEventListener('DOMContentLoaded', () => {
  initAdminAuth();
  loadDataStores();
  bindGlobalAdminEvents();
});

/* ==========================================================================
   1. Admin Authentication
   ========================================================================== */
function getAdminPassword() {
  return localStorage.getItem('beansheal_admin_password') || 'beansheal1234';
}

function initAdminAuth() {
  const isAuthed = sessionStorage.getItem('beansheal_admin_authed') === 'true';
  const authScreen = document.getElementById('admin-auth-screen');
  const adminApp = document.getElementById('admin-app');

  if (isAuthed) {
    if (authScreen) authScreen.style.display = 'none';
    if (adminApp) adminApp.style.display = 'flex';
    refreshDashboard();
  } else {
    if (authScreen) authScreen.style.display = 'flex';
    if (adminApp) adminApp.style.display = 'none';
  }
}

window.handleAdminLogin = function(e) {
  e.preventDefault();
  const pwdInput = document.getElementById('admin-password-input');
  const errorMsg = document.getElementById('login-error-msg');

  if (pwdInput && pwdInput.value === getAdminPassword()) {
    sessionStorage.setItem('beansheal_admin_authed', 'true');
    if (errorMsg) errorMsg.style.display = 'none';
    initAdminAuth();
  } else {
    if (errorMsg) errorMsg.style.display = 'block';
  }
};

window.handleAdminLogout = function() {
  sessionStorage.removeItem('beansheal_admin_authed');
  initAdminAuth();
};

/* ==========================================================================
   2. Data Store Initialization
   ========================================================================== */
let trashInquiriesData = [];

function loadDataStores() {
  // Load Inquiries
  const savedInquiries = localStorage.getItem('beansheal_custom_inquiries');
  if (savedInquiries) {
    try {
      inquiriesData = JSON.parse(savedInquiries);
    } catch (err) {
      inquiriesData = [...DATA.recentInquiries];
    }
  } else {
    inquiriesData = [...DATA.recentInquiries];
  }

  // Load Trash Inquiries
  const savedTrash = localStorage.getItem('beansheal_trash_inquiries');
  if (savedTrash) {
    try {
      trashInquiriesData = JSON.parse(savedTrash);
    } catch (err) {
      trashInquiriesData = [];
    }
  } else {
    trashInquiriesData = [];
  }

  // Load Portfolio
  const savedPortfolio = localStorage.getItem('beansheal_custom_portfolio');
  if (savedPortfolio) {
    try {
      portfolioData = JSON.parse(savedPortfolio);
    } catch (err) {
      portfolioData = [...DATA.portfolio];
    }
  } else {
    portfolioData = [...DATA.portfolio];
  }
}

function refreshDashboard() {
  renderStats();
  renderInquiriesTable();
  renderPortfolioAdminGrid();
}

function renderStats() {
  const total = inquiriesData.length;
  const pending = inquiriesData.filter(i => i.status !== '답변완료').length;
  const done = inquiriesData.filter(i => i.status === '답변완료').length;
  const trash = trashInquiriesData.length;

  const totalElem = document.getElementById('stat-total-inquiries');
  if (totalElem) totalElem.textContent = total;
  const pendingElem = document.getElementById('stat-pending-inquiries');
  if (pendingElem) pendingElem.textContent = pending;
  const doneElem = document.getElementById('stat-done-inquiries');
  if (doneElem) doneElem.textContent = done;

  const cntAll = document.getElementById('cnt-all');
  if (cntAll) cntAll.textContent = total;
  const cntPending = document.getElementById('cnt-pending');
  if (cntPending) cntPending.textContent = pending;
  const cntDone = document.getElementById('cnt-done');
  if (cntDone) cntDone.textContent = done;
  const cntTrash = document.getElementById('cnt-trash');
  if (cntTrash) cntTrash.textContent = trash;

  const badgePending = document.getElementById('badge-pending-count');
  if (badgePending) {
    badgePending.textContent = pending > 0 ? pending : total;
  }

  // Portfolio filled count
  const filledCount = portfolioData.filter(p => p.image && !p.image.startsWith('data:image/svg+xml')).length;
  const badgePortfolio = document.getElementById('badge-portfolio-count');
  if (badgePortfolio) {
    badgePortfolio.textContent = `${filledCount}/30`;
  }

  // Visitor Traffic Stats
  let vStats = { todayVisitors: 0, totalVisitors: 0, todayPageviews: 0 };
  try {
    const savedV = localStorage.getItem('beansheal_visitor_stats');
    if (savedV) {
      const parsedV = JSON.parse(savedV);
      if (parsedV && (parsedV.totalVisitors >= 100 || parsedV.todayVisitors >= 100)) {
        localStorage.removeItem('beansheal_visitor_stats');
      } else {
        vStats = parsedV;
      }
    }
  } catch (e) {}

  const todayV = vStats.todayVisitors || 0;
  const totalV = vStats.totalVisitors || 0;
  const todayPv = vStats.todayPageviews || 0;
  const convRate = todayV > 0 ? ((total / todayV) * 100).toFixed(1) : '0.0';

  if (document.getElementById('stat-today-visitors')) {
    document.getElementById('stat-today-visitors').textContent = todayV.toLocaleString();
  }
  if (document.getElementById('stat-total-visitors')) {
    document.getElementById('stat-total-visitors').textContent = totalV.toLocaleString();
  }

  if (document.getElementById('dash-today-visitors')) {
    document.getElementById('dash-today-visitors').textContent = `${todayV.toLocaleString()} 명`;
  }
  if (document.getElementById('dash-total-visitors')) {
    document.getElementById('dash-total-visitors').textContent = `${totalV.toLocaleString()} 명`;
  }
  if (document.getElementById('dash-today-pageviews')) {
    document.getElementById('dash-today-pageviews').textContent = `${todayPv.toLocaleString()} 회`;
  }
  if (document.getElementById('dash-conversion-rate')) {
    document.getElementById('dash-conversion-rate').textContent = `${convRate}%`;
  }
}

window.resetVisitorStats = function() {
  if (confirm("방문자 집계 수치를 0으로 완전히 초기화하시겠습니까?")) {
    localStorage.removeItem('beansheal_visitor_stats');
    sessionStorage.removeItem('beansheal_session_id');
    refreshDashboard();
    alert("방문자 수치가 0으로 초기화되었습니다.");
  }
};

/* ==========================================================================
   3. Tab Navigation
   ========================================================================== */
window.switchAdminTab = function(tabId) {
  document.querySelectorAll('.sidebar-nav .nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
  });

  document.querySelectorAll('.admin-tab-content').forEach(content => {
    content.classList.toggle('active', content.id === tabId);
  });

  const pageTitle = document.getElementById('admin-page-title');
  if (tabId === 'tab-inquiries') {
    if (pageTitle) pageTitle.textContent = "견적 문의 관리 대시보드";
  } else if (tabId === 'tab-calculator') {
    if (pageTitle) pageTitle.textContent = "실시간 견적 산출기 옵션 설정";
    loadCalcOptionsAdmin();
  } else if (tabId === 'tab-portfolio') {
    if (pageTitle) pageTitle.textContent = "생산 포트폴리오 관리 (30종)";
  } else if (tabId === 'tab-faq') {
    if (pageTitle) pageTitle.textContent = "자주 묻는 질문 (FAQ) 전용 관리";
    loadFaqAdminList();
  } else if (tabId === 'tab-settings') {
    if (pageTitle) pageTitle.textContent = "시스템 설정 및 팝업/회사정보 관리";
    loadCompanyInfoAdmin();
    loadNoticePopupAdmin();
  }
};

function getDefaultFaqList() {
  return [
    {
      id: 1,
      q: "최소 생산 수량(MOQ)은 얼마나 되나요?",
      a: "(주)빈스힐은 신규 브랜드 및 스타트업을 위해 100포 극소량 시험 생산(PILOT)부터 정식 표준 배치인 10,000포 ~ 30,000포 생산까지 맞춤 지원합니다. 부담 없이 시제품을 제작하여 시장 반응을 테스팅해 보실 수 있습니다."
    },
    {
      id: 2,
      q: "샘플 제작 및 맛·향 배합 컨설팅 기간은 얼마나 걸리나요?",
      a: "원료 선정 및 맞춤 포뮬러 설계 후 약 3일 ~ 5일 이내에 시험 샘플을 발송해 드립니다. 빈스힐 전담 연구진이 액상 이스케이프 포뮬러 기술을 적용하여 쓴맛·잡미 마스킹 및 층분리 방지 무료 컨설팅을 함께 제공합니다."
    },
    {
      id: 3,
      q: "식약처 품목제조신고 및 원스톱 행정 절차도 대행해 주시나요?",
      a: "네, 그렇습니다. 건강기능식품 및 기능성 음료 생산에 필수적인 식약처 품목제조신고(FHR), 성분 표시 검토, GMP/HACCP 안전 패키지 가이드까지 전문 행정팀이 원스톱으로 신속하게 전담 대행해 드립니다."
    },
    {
      id: 4,
      q: "제품 포장 형태(스틱 파우치, 단상자 등)는 어떤 종류가 가능한가요?",
      a: "15ml~35ml 액상 스틱 파우치(이지컷 무균 충진), 7포/14포/30포 단상자 패키지, 선물용 아웃박스 및 디스플레이 팝업 박스 등 고객사가 희망하는 모든 포장 사양으로 완제품 제조가 가능합니다."
    },
    {
      id: 5,
      q: "원료를 직접 제공(사급 원료)해도 생산이 가능한가요?",
      a: "가능합니다. 고객사 보유 사급 원료의 지표성분 시험성적서(COA) 및 식약처 기준 적합성을 검토한 후 생산 라인에 투입할 수 있으며, 빈스힐의 특허원료 및 프리미엄 개별인정형 원료를 조합하는 것도 가능합니다."
    },
    {
      id: 6,
      q: "정식 생산 계약 후 완제품 출고까지 총 소요 기간은 얼마인가요?",
      a: "원부자재(스틱 동판, 단상자) 입고 및 품목제조신고 완료 기준 약 14일 ~ 21일 이내에 완제품 출고가 가능합니다. 긴급 생산 가동 요청 시 우선 배치 생산이 지원됩니다."
    }
  ];
}

let faqAdminList = [];

function loadFaqAdminList() {
  faqAdminList = getDefaultFaqList();
  try {
    const saved = localStorage.getItem('beansheal_custom_faqs');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) faqAdminList = parsed;
    }
  } catch (e) {}
  renderFaqAdminList();
}

function renderFaqAdminList() {
  const container = document.getElementById('faq-admin-list-container');
  if (!container) return;

  container.innerHTML = faqAdminList.map((item, idx) => `
    <div class="admin-card" style="padding: 28px 32px; border-radius: 18px; box-shadow: 0 6px 20px rgba(0,0,0,0.04); text-align: left;">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid #F1F5F9;">
        <div style="display: flex; align-items: center; gap: 10px;">
          <span style="background: #E0F2FE; color: #0284C7; font-weight: 900; padding: 4px 12px; border-radius: 980px; font-size: 0.9rem;">Q${idx + 1}</span>
          <strong style="color: #0F172A; font-size: 1rem;">FAQ 질문 & 답변 항목 #${item.id}</strong>
        </div>
        <button type="button" onclick="deleteFaqItemAdmin(${item.id})" class="btn btn-outline" style="color: #EF4444; border-color: #FECDD3; font-weight: 700; font-size: 0.8rem; padding: 6px 14px; border-radius: 8px;">
          <i class="fas fa-trash-alt"></i> 삭제
        </button>
      </div>

      <div style="display: flex; flex-direction: column; gap: 14px;">
        <div>
          <label style="font-size: 0.85rem; font-weight: 700; color: #1E293B; display: block; margin-bottom: 6px;">질문 (Question) *</label>
          <input type="text" id="faq-q-${item.id}" class="form-input" value="${item.q.replace(/"/g, '&quot;')}" style="height: 44px; font-size: 0.95rem; font-weight: 700; color: #0F172A;">
        </div>
        <div>
          <label style="font-size: 0.85rem; font-weight: 700; color: #1E293B; display: block; margin-bottom: 6px;">답변 (Answer) *</label>
          <textarea id="faq-a-${item.id}" class="form-textarea" style="min-height: 84px; font-size: 0.9rem; line-height: 1.6; padding: 12px;">${item.a}</textarea>
        </div>
      </div>
    </div>
  `).join('');
}

window.addNewFaqItemAdmin = function() {
  const newId = Date.now();
  faqAdminList.push({
    id: newId,
    q: "새로운 FAQ 질문을 입력해 주세요.",
    a: "상세한 답변 내용을 입력해 주세요."
  });
  renderFaqAdminList();
};

window.deleteFaqItemAdmin = function(id) {
  if (confirm('이 FAQ 질문 항목을 삭제하시겠습니까?')) {
    faqAdminList = faqAdminList.filter(f => f.id !== id);
    renderFaqAdminList();
  }
};

window.saveAllFaqsAdmin = function() {
  const updatedList = [];
  faqAdminList.forEach((item) => {
    const qVal = document.getElementById(`faq-q-${item.id}`)?.value || item.q;
    const aVal = document.getElementById(`faq-a-${item.id}`)?.value || item.a;
    updatedList.push({
      id: item.id,
      q: qVal,
      a: aVal
    });
  });

  faqAdminList = updatedList;
  localStorage.setItem('beansheal_custom_faqs', JSON.stringify(faqAdminList));
  alert(`[저장 완료] 총 ${faqAdminList.length}개의 FAQ 질문/답변이 성공적으로 저장되었습니다!\n메인 홈페이지에 실시간 반영됩니다.`);
};

function getDefaultNoticePopupConfig() {
  return {
    enabled: true,
    badge: "BEANSHEAL PROMOTION",
    title: "빈스힐 (BEANSHEAL) <br><span class=\"highlight\">소량 액상 건기식 OEM/ODM</span> 특가 프로모션",
    subtitle: "액상 전용 무균 충진 및 신규 브랜드 전격 지원 혜택",
    b1Title: "100포 극소량 액상 시험 생산(PILOT) 지원",
    b1Desc: "부담 없는 최소 배치(MOQ)로 시장 반응 및 샘플 테스팅 가능",
    b2Title: "빈스힐 액상 맛·향 배합 무료 컨설팅",
    b2Desc: "마스킹 및 층분리 방지 액상 이스케이프 포뮬러 맞춤 설계",
    b3Title: "식약처 행정 신속 원스톱 케어",
    b3Desc: "액상 품목제조신고 대행 및 GMP/HACCP 안전 패키지 가이드 제공",
    ctaText: "지금 빈스힐 무료 상담 신청하기"
  };
}

function loadNoticePopupAdmin() {
  let cfg = getDefaultNoticePopupConfig();
  try {
    const saved = localStorage.getItem('beansheal_custom_notice_popup');
    if (saved) cfg = { ...cfg, ...JSON.parse(saved) };
  } catch (e) {}

  const enabledInput = document.getElementById('popup-edit-enabled');
  if (enabledInput) {
    enabledInput.checked = cfg.enabled !== false;
    toggleNoticePopupStatus(enabledInput.checked);
  }

  if (document.getElementById('popup-edit-badge')) document.getElementById('popup-edit-badge').value = cfg.badge;
  if (document.getElementById('popup-edit-title')) document.getElementById('popup-edit-title').value = cfg.title;
  if (document.getElementById('popup-edit-subtitle')) document.getElementById('popup-edit-subtitle').value = cfg.subtitle;
  if (document.getElementById('popup-edit-b1-title')) document.getElementById('popup-edit-b1-title').value = cfg.b1Title;
  if (document.getElementById('popup-edit-b1-desc')) document.getElementById('popup-edit-b1-desc').value = cfg.b1Desc;
  if (document.getElementById('popup-edit-b2-title')) document.getElementById('popup-edit-b2-title').value = cfg.b2Title;
  if (document.getElementById('popup-edit-b2-desc')) document.getElementById('popup-edit-b2-desc').value = cfg.b2Desc;
  if (document.getElementById('popup-edit-b3-title')) document.getElementById('popup-edit-b3-title').value = cfg.b3Title;
  if (document.getElementById('popup-edit-b3-desc')) document.getElementById('popup-edit-b3-desc').value = cfg.b3Desc;
  if (document.getElementById('popup-edit-cta')) document.getElementById('popup-edit-cta').value = cfg.ctaText;
}

window.toggleNoticePopupStatus = function(isEnabled) {
  const txt = document.getElementById('popup-status-text');
  if (txt) {
    if (isEnabled) {
      txt.textContent = "[ 🟢 켜짐 ON ]";
      txt.style.color = "#2E7D32";
    } else {
      txt.textContent = "[ 🔴 꺼짐 OFF ]";
      txt.style.color = "#EF4444";
    }
  }
};

window.handleSaveNoticePopup = function(e) {
  e.preventDefault();
  const isEnabled = document.getElementById('popup-edit-enabled')?.checked ?? true;
  const newCfg = {
    enabled: isEnabled,
    badge: document.getElementById('popup-edit-badge')?.value || 'BEANSHEAL PROMOTION',
    title: document.getElementById('popup-edit-title')?.value || '',
    subtitle: document.getElementById('popup-edit-subtitle')?.value || '',
    b1Title: document.getElementById('popup-edit-b1-title')?.value || '',
    b1Desc: document.getElementById('popup-edit-b1-desc')?.value || '',
    b2Title: document.getElementById('popup-edit-b2-title')?.value || '',
    b2Desc: document.getElementById('popup-edit-b2-desc')?.value || '',
    b3Title: document.getElementById('popup-edit-b3-title')?.value || '',
    b3Desc: document.getElementById('popup-edit-b3-desc')?.value || '',
    ctaText: document.getElementById('popup-edit-cta')?.value || '지금 빈스힐 무료 상담 신청하기'
  };

  localStorage.setItem('beansheal_custom_notice_popup', JSON.stringify(newCfg));
  alert(`메인 프로모션 팝업 설정이 저장되었습니다!\n- 팝업 노출 상태: ${isEnabled ? '🟢 켜짐(ON)' : '🔴 꺼짐(OFF)'}`);
};

function getDefaultCompanyInfo() {
  return {
    name: "(주) 빈스힐",
    ceo: "주미정",
    address: "경기도 고양시 일산동구 견달산로 359 (주)빈스힐",
    phone: "031-969-2428",
    fax: "031-969-2429",
    email: "beansheal@beansheal.com",
    hours: "평일 09:00 ~ 18:00 (토/일/공휴일 휴무)"
  };
}

function loadCompanyInfoAdmin() {
  let info = getDefaultCompanyInfo();
  try {
    const saved = localStorage.getItem('beansheal_custom_company_info');
    if (saved) info = { ...info, ...JSON.parse(saved) };
  } catch (e) {}

  if (document.getElementById('company-edit-name')) document.getElementById('company-edit-name').value = info.name;
  if (document.getElementById('company-edit-ceo')) document.getElementById('company-edit-ceo').value = info.ceo;
  if (document.getElementById('company-edit-address')) document.getElementById('company-edit-address').value = info.address;
  if (document.getElementById('company-edit-phone')) document.getElementById('company-edit-phone').value = info.phone;
  if (document.getElementById('company-edit-fax')) document.getElementById('company-edit-fax').value = info.fax;
  if (document.getElementById('company-edit-email')) document.getElementById('company-edit-email').value = info.email;
  if (document.getElementById('company-edit-hours')) document.getElementById('company-edit-hours').value = info.hours;
  if (document.getElementById('admin-email-target-display')) document.getElementById('admin-email-target-display').textContent = info.email;
}

window.handleSaveCompanyInfo = function(e) {
  e.preventDefault();
  const newInfo = {
    name: document.getElementById('company-edit-name')?.value || '(주) 빈스힐',
    ceo: document.getElementById('company-edit-ceo')?.value || '주미정',
    address: document.getElementById('company-edit-address')?.value || '',
    phone: document.getElementById('company-edit-phone')?.value || '031-969-2428',
    fax: document.getElementById('company-edit-fax')?.value || '031-969-2429',
    email: document.getElementById('company-edit-email')?.value || 'beansheal@beansheal.com',
    hours: document.getElementById('company-edit-hours')?.value || '평일 09:00 ~ 18:00 (토/일/공휴일 휴무)'
  };

  localStorage.setItem('beansheal_custom_company_info', JSON.stringify(newInfo));
  if (document.getElementById('admin-email-target-display')) {
    document.getElementById('admin-email-target-display').textContent = newInfo.email;
  }
  alert(`(주)빈스힐 기본 정보 및 수신 이메일 주소가 성공적으로 저장되었습니다!\n- 수신 이메일: ${newInfo.email}`);
};

window.testSendEmailNotification = function() {
  let targetEmail = 'beansheal@beansheal.com';
  try {
    const saved = localStorage.getItem('beansheal_custom_company_info');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && parsed.email) targetEmail = parsed.email;
    }
  } catch (e) {}

  const formData = new FormData();
  formData.append('_subject', `[빈스힐 알림 테스트] 실시간 이메일 연동 테스트 메일입니다.`);
  formData.append('_template', 'table');
  formData.append('_captcha', 'false');
  formData.append('수신이메일', targetEmail);
  formData.append('발송시각', new Date().toLocaleString());
  formData.append('메시지', '(주)빈스힐 웹사이트 견적 문의 실시간 이메일 알림 연동 테스트 메일입니다.');

  fetch(`https://formsubmit.co/ajax/${targetEmail}`, {
    method: 'POST',
    body: formData
  }).then(res => res.json())
    .then(data => {
      alert(`[테스트 발송 성공] 수신함(${targetEmail})을 확인해주세요.\n(※ 최초 수신 시 FormSubmit 이메일 승인 1-Click 인증이 필요할 수 있습니다.)`);
    })
    .catch(err => {
      alert(`[테스트 발송 시도] ${targetEmail} 로 테스트 알림 메일 요청을 전송하였습니다.`);
    });
};

/* ==========================================================================
   3-B. Calculator Options Management
   ========================================================================== */
function getDefaultCalcOptions() {
  return {
    volume: [
      "15ml ~ 20ml (착즙/고농축)",
      "25ml ~ 30ml (다이어트/커피)",
      "35ml ~ 50ml (프리미엄/빅스틱)",
      "기타 (맞춤 용량)"
    ],
    ingredient: [
      "다이어트 & 건강기능커피",
      "유기농 원료 (NFC 100% 착즙)",
      "기능성 표시 식품 (밀크씨슬/가르시니아)",
      "과·채주스 & 효소 음료",
      "기타 (맞춤 원료 개발)"
    ],
    packaging: [
      "7포 / 14포 단상자 패키지",
      "30포 / 50포 대용량 벌크 파우치",
      "디스플레이 RRP 박스 포장",
      "기타 (맞춤 포장)"
    ],
    quantity: [
      "10,000 포 (소량배치)",
      "30,000 포 (표준배치)",
      "50,000 포 (대량생산)",
      "100,000 포 이상",
      "기타 (맞춤 수량)"
    ]
  };
}

function loadCalcOptionsAdmin() {
  let opts = getDefaultCalcOptions();
  try {
    const saved = localStorage.getItem('beansheal_custom_calc_options');
    if (saved) opts = JSON.parse(saved);
  } catch (e) {}

  if (document.getElementById('calc-admin-volume-lines')) {
    document.getElementById('calc-admin-volume-lines').value = (opts.volume || []).join('\n');
  }
  if (document.getElementById('calc-admin-ingredient-lines')) {
    document.getElementById('calc-admin-ingredient-lines').value = (opts.ingredient || []).join('\n');
  }
  if (document.getElementById('calc-admin-packaging-lines')) {
    document.getElementById('calc-admin-packaging-lines').value = (opts.packaging || []).join('\n');
  }
  if (document.getElementById('calc-admin-quantity-lines')) {
    document.getElementById('calc-admin-quantity-lines').value = (opts.quantity || []).join('\n');
  }
}

window.saveCalcOptionsAdmin = function() {
  const volVal = document.getElementById('calc-admin-volume-lines')?.value || '';
  const ingVal = document.getElementById('calc-admin-ingredient-lines')?.value || '';
  const packVal = document.getElementById('calc-admin-packaging-lines')?.value || '';
  const qtyVal = document.getElementById('calc-admin-quantity-lines')?.value || '';

  const parseLines = (str) => str.split('\n').map(s => s.trim()).filter(Boolean);

  const newOpts = {
    volume: parseLines(volVal),
    ingredient: parseLines(ingVal),
    packaging: parseLines(packVal),
    quantity: parseLines(qtyVal)
  };

  localStorage.setItem('beansheal_custom_calc_options', JSON.stringify(newOpts));
  alert("실시간 견적 산출기 옵션이 성공적으로 저장되었습니다. 사용자 메인 홈페이지에 즉시 반영됩니다!");
};

/* ==========================================================================
   4. Inquiries Management
   ========================================================================== */
window.setInquiryFilter = function(filter) {
  currentFilter = filter;
  document.querySelectorAll('.filter-btn-group .filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-filter') === filter);
  });
  renderInquiriesTable();
};

window.filterInquiries = function() {
  renderInquiriesTable();
};

function renderInquiriesTable() {
  const tbody = document.getElementById('inquiry-table-body');
  const searchVal = (document.getElementById('inquiry-search-input')?.value || '').toLowerCase();

  if (!tbody) return;

  const isTrashView = currentFilter === 'trash';
  let sourceArray = isTrashView ? trashInquiriesData : inquiriesData;

  let list = sourceArray.filter(item => {
    if (isTrashView) return true;
    if (currentFilter === '대기중') return item.status === '대기중' || item.status === '답변대기' || item.status === '검토중';
    if (currentFilter === '답변완료') return item.status === '답변완료';
    return true;
  });

  if (searchVal) {
    list = list.filter(item => 
      (item.title && item.title.toLowerCase().includes(searchVal)) ||
      (item.company && item.company.toLowerCase().includes(searchVal)) ||
      (item.author && item.author.toLowerCase().includes(searchVal))
    );
  }

  if (!list.length) {
    const emptyTxt = isTrashView ? "휴지통이 비어 있습니다." : "접수된 견적 문의 내역이 없습니다.";
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 40px; color: #94A3B8;">${emptyTxt}</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map((item) => `
    <tr>
      <td><strong>#${item.id}</strong></td>
      <td>
        <span class="status-badge ${item.status === '답변완료' ? 'status-done' : 'status-pending'}">
          ${item.status}
        </span>
      </td>
      <td>
        <div style="font-weight: 700; color: #1E293B; margin-bottom: 2px;">${item.title}</div>
        <div style="font-size: 0.8rem; color: #64748B;">${item.desc || item.content || ''}</div>
      </td>
      <td><strong>${item.company || item.author || '고객사'}</strong></td>
      <td><span style="font-family: monospace; font-size: 0.85rem;">${item.contact || '010-***-****'}</span></td>
      <td><span style="font-size: 0.825rem; color: #64748B;">${item.date}</span></td>
      <td>
        <div style="display: flex; gap: 6px; flex-wrap: nowrap;">
          ${isTrashView ? `
            <button onclick="restoreInquiryFromTrash(${item.id})" class="btn btn-outline btn-sm" style="padding: 3px 8px; font-size: 0.775rem; color: #059669; border-color: #A7F3D0; background: #ECFDF5;">
              <i class="fas fa-undo"></i> 복원
            </button>
            <button onclick="purgeInquiryPermanently(${item.id})" class="btn btn-outline btn-sm" style="padding: 3px 8px; font-size: 0.775rem; color: #EF4444; border-color: #FCA5A5; background: #FEF2F2;">
              <i class="fas fa-times"></i> 삭제
            </button>
          ` : `
            <button onclick="openInquiryDetail(${item.id})" class="btn btn-outline btn-sm" style="padding: 3px 8px; font-size: 0.775rem; color: #2E7D32; border-color: #A5D6A7;">
              <i class="fas fa-eye"></i> 상세보기
            </button>
            <button onclick="deleteInquiryToTrash(${item.id})" class="btn btn-outline btn-sm" style="padding: 3px 8px; font-size: 0.775rem; color: #EF4444; border-color: #FCA5A5;">
              <i class="fas fa-trash-alt"></i>
            </button>
          `}
        </div>
      </td>
    </tr>
  `).join('');
}

window.deleteInquiryToTrash = function(id) {
  const itemIdx = inquiriesData.findIndex(i => i.id === id);
  if (itemIdx === -1) return;

  const [removed] = inquiriesData.splice(itemIdx, 1);
  trashInquiriesData.unshift(removed);

  localStorage.setItem('beansheal_custom_inquiries', JSON.stringify(inquiriesData));
  localStorage.setItem('beansheal_trash_inquiries', JSON.stringify(trashInquiriesData));

  refreshDashboard();
};

window.deleteCurrentInquiryToTrash = function() {
  if (selectedInquiryId === null) return;
  if (confirm("해당 문의를 휴지통으로 이동하시겠습니까?\n(휴지통에서 언제든 다시 복원하실 수 있습니다.)")) {
    deleteInquiryToTrash(selectedInquiryId);
    closeDetailModal();
  }
};

window.restoreInquiryFromTrash = function(id) {
  const itemIdx = trashInquiriesData.findIndex(i => i.id === id);
  if (itemIdx === -1) return;

  const [restored] = trashInquiriesData.splice(itemIdx, 1);
  inquiriesData.unshift(restored);

  localStorage.setItem('beansheal_custom_inquiries', JSON.stringify(inquiriesData));
  localStorage.setItem('beansheal_trash_inquiries', JSON.stringify(trashInquiriesData));

  refreshDashboard();
  alert("문의건이 성공적으로 복원되었습니다.");
};

window.purgeInquiryPermanently = function(id) {
  if (!confirm("이 문의를 영구 삭제하시겠습니까? 삭제된 후에는 복구할 수 없습니다.")) return;

  const itemIdx = trashInquiriesData.findIndex(i => i.id === id);
  if (itemIdx !== -1) {
    trashInquiriesData.splice(itemIdx, 1);
    localStorage.setItem('beansheal_trash_inquiries', JSON.stringify(trashInquiriesData));
  }

  refreshDashboard();
};

window.openInquiryDetail = function(id) {
  selectedInquiryId = id;
  const item = inquiriesData.find(i => i.id === id);
  if (!item) return;

  const modal = document.getElementById('inquiry-detail-modal');
  document.getElementById('detail-modal-title').textContent = `견적 문의 #${item.id} 상세보기`;
  document.getElementById('detail-status-badge').textContent = item.status;
  document.getElementById('detail-status-badge').className = `status-badge ${item.status === '답변완료' ? 'status-done' : 'status-pending'}`;
  document.getElementById('detail-date').textContent = item.date;
  document.getElementById('detail-author').textContent = `${item.company || '기업미지정'} / ${item.author || '담당자'}`;
  document.getElementById('detail-contact-info').textContent = `${item.contact || '010-0000-0000'} | ${item.email || '문의내용 참조'}`;
  document.getElementById('detail-content-box').textContent = item.content || item.desc || item.title;

  document.getElementById('admin-reply-input').value = item.reply || '';

  if (modal) modal.classList.add('active');
};

window.closeDetailModal = function() {
  const modal = document.getElementById('inquiry-detail-modal');
  if (modal) modal.classList.remove('active');
};

window.saveAdminReply = function(newStatus) {
  if (selectedInquiryId === null) return;
  const replyTxt = document.getElementById('admin-reply-input').value;

  const itemIdx = inquiriesData.findIndex(i => i.id === selectedInquiryId);
  if (itemIdx !== -1) {
    inquiriesData[itemIdx].status = newStatus;
    inquiriesData[itemIdx].reply = replyTxt;
    localStorage.setItem('beansheal_custom_inquiries', JSON.stringify(inquiriesData));
  }

  closeDetailModal();
  refreshDashboard();
};

window.openNewInquiryModal = function() {
  const newId = inquiriesData.length ? Math.max(...inquiriesData.map(i => i.id)) + 1 : 1;
  const company = prompt("기업명/성함을 입력하세요:");
  if (!company) return;
  const title = prompt("문의 제목을 입력하세요:", "[신규전화접수] 액상 스틱 30ml 3만포 생산 견적");
  if (!title) return;

  const todayStr = new Date().toISOString().split('T')[0];
  inquiriesData.unshift({
    id: newId,
    title: title,
    author: company,
    company: company,
    contact: "전화접수",
    date: todayStr,
    status: "대기중",
    desc: "관리자 직접 전화접수 등록",
    content: "관리자 수동 등록 문의건"
  });

  localStorage.setItem('beansheal_custom_inquiries', JSON.stringify(inquiriesData));
  refreshDashboard();
};

/* ==========================================================================
   5. Portfolio Admin Management (1~30)
   ========================================================================== */
window.setPortfolioFilter = function(pfilter) {
  currentPFilter = pfilter;
  document.querySelectorAll('#tab-portfolio .filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-pfilter') === pfilter);
  });
  renderPortfolioAdminGrid();
};

function renderPortfolioAdminGrid() {
  const grid = document.getElementById('portfolio-admin-grid');
  if (!grid) return;

  let list = portfolioData;
  if (currentPFilter === 'filled') {
    list = portfolioData.filter(p => p.image && !p.image.startsWith('data:image/svg+xml'));
  } else if (currentPFilter === 'empty') {
    list = portfolioData.filter(p => !p.image || p.image.startsWith('data:image/svg+xml'));
  }

  grid.innerHTML = list.map((item) => {
    const isFilled = item.image && !item.image.startsWith('data:image/svg+xml');
    return `
      <div class="p-card-admin" onclick="openPortfolioEditModal(${item.id - 1})">
        <span class="card-badge" style="background: ${isFilled ? '#2E7D32' : '#94A3B8'};">#${item.id}</span>
        <div class="card-img-wrap">
          <img src="${item.image}" alt="${item.title}">
        </div>
        <div class="card-title">${item.title}</div>
        <div class="card-meta">${item.category} | ${item.format}</div>
        <button class="btn btn-outline btn-sm" style="margin-top: 10px; width: 100%; font-size: 0.75rem; padding: 4px;">
          <i class="fas fa-edit"></i> 수정하기
        </button>
      </div>
    `;
  }).join('');
}

window.openPortfolioEditModal = function(idx) {
  currentEditingIndex = idx;
  const item = portfolioData[idx];
  if (!item) return;

  document.getElementById('edit-card-id').textContent = `#${item.id}`;
  document.getElementById('edit-item-index').value = idx;
  document.getElementById('edit-item-title').value = item.title;
  document.getElementById('edit-item-category').value = item.category;
  document.getElementById('edit-item-format').value = item.format;
  document.getElementById('edit-item-tags').value = (item.tags || []).join(', ');
  document.getElementById('edit-item-image').value = item.image;
  document.getElementById('edit-item-desc').value = item.desc;
  document.getElementById('edit-img-preview').src = item.image;

  const modal = document.getElementById('portfolio-edit-modal');
  if (modal) modal.classList.add('active');
};

window.updateImagePreview = function(url) {
  const img = document.getElementById('edit-img-preview');
  if (img) img.src = url;
};

window.closePortfolioEditModal = function() {
  const modal = document.getElementById('portfolio-edit-modal');
  if (modal) modal.classList.remove('active');
};

window.handleSavePortfolioCard = function(e) {
  e.preventDefault();
  if (currentEditingIndex === null) return;

  const idx = currentEditingIndex;
  const title = document.getElementById('edit-item-title').value;
  const category = document.getElementById('edit-item-category').value;
  const format = document.getElementById('edit-item-format').value;
  const tagsStr = document.getElementById('edit-item-tags').value;
  const image = document.getElementById('edit-item-image').value;
  const desc = document.getElementById('edit-item-desc').value;

  portfolioData[idx] = {
    ...portfolioData[idx],
    title,
    category,
    format,
    tags: tagsStr.split(',').map(t => t.trim()).filter(Boolean),
    image,
    desc
  };

  localStorage.setItem('beansheal_custom_portfolio', JSON.stringify(portfolioData));
  closePortfolioEditModal();
  refreshDashboard();
};

/* ==========================================================================
   6. Settings & CSV Export
   ========================================================================== */
window.handleChangePassword = function(e) {
  e.preventDefault();
  const currentVal = document.getElementById('current-pwd').value;
  const newVal = document.getElementById('new-pwd').value;
  const confirmVal = document.getElementById('confirm-pwd').value;

  if (currentVal !== getAdminPassword()) {
    alert("현재 비밀번호가 일치하지 않습니다.");
    return;
  }
  if (newVal !== confirmVal) {
    alert("새 비밀번호가 서로 일치하지 않습니다.");
    return;
  }

  localStorage.setItem('beansheal_admin_password', newVal);
  alert("관리자 비밀번호가 성공적으로 변경되었습니다.");
  document.getElementById('current-pwd').value = '';
  document.getElementById('new-pwd').value = '';
  document.getElementById('confirm-pwd').value = '';
};

window.exportInquiriesCSV = function() {
  if (!inquiriesData.length) {
    alert("내보낼 문의 데이터가 없습니다.");
    return;
  }

  let csvContent = "\uFEFF번호,상태,문의제목,작성자,연락처,접수일자,내용\n";
  inquiriesData.forEach(item => {
    const row = [
      item.id,
      `"${item.status}"`,
      `"${(item.title || '').replace(/"/g, '""')}"`,
      `"${(item.company || item.author || '').replace(/"/g, '""')}"`,
      `"${(item.contact || '').replace(/"/g, '""')}"`,
      `"${item.date}"`,
      `"${(item.desc || item.content || '').replace(/"/g, '""')}"`
    ];
    csvContent += row.join(",") + "\n";
  });

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.setAttribute("download", `beansheal_inquiries_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

function bindGlobalAdminEvents() {
  // ESC Key modal close
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeDetailModal();
      closePortfolioEditModal();
    }
  });
}

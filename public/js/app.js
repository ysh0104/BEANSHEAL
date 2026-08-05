// 상상바이오 (SANGSANG BIO) Main Application Script
import { DATA } from './data.js';

document.addEventListener('DOMContentLoaded', () => {
  initAutoLoginRedirect();
  trackVisitorAnalytics();
  loadDynamicCompanyInfo();
  initNavigation();
  initHeroSlider();
  renderBrands();
  initProductionTabs();
  renderIngredients();
  renderPortfolio();
  initQuoteCalculator();
  renderInquiryBoard();
  renderFaqSection();
  initQuoteCalculator();
  initModals();
  initNoticePopup();
  initScrollAnimations();
  initStatCounterAnimation();
});

function initAutoLoginRedirect() {
  try {
    const isAuto = localStorage.getItem('beansheal_auto_login') !== 'false';
    const activeUser = localStorage.getItem('beansheal_active_user');
    if (isAuto && activeUser) {
      const loginLinks = document.querySelectorAll('a[href="/login"]');
      loginLinks.forEach(link => {
        link.href = '/workspace';
        link.title = '사내 업무 ERP (자동로그인됨)';
      });
    }
  } catch (e) {}
}

function loadDynamicCompanyInfo() {
  let info = {
    name: "(주) 빈스힐",
    ceo: "홍길동",
    address: "경기도 고양시 일산동구 견달산로 359 (주)빈스힐",
    phone: "031-900-0000",
    fax: "031-900-0001",
    email: "beansheal@beansheal.com",
    hours: "평일 09:00 ~ 18:00 (점심시간 12:00 ~ 13:00)"
  };

  try {
    const saved = localStorage.getItem('beansheal_company_info') || localStorage.getItem('beansheal_custom_company_info');
    if (saved) info = { ...info, ...JSON.parse(saved) };
  } catch (e) {}

  if (document.getElementById('company-info-address')) {
    document.getElementById('company-info-address').textContent = info.address;
  }
  if (document.getElementById('company-info-phone')) {
    document.getElementById('company-info-phone').textContent = info.phone;
  }
  if (document.getElementById('company-info-email')) {
    document.getElementById('company-info-email').textContent = info.email;
  }
  if (document.getElementById('company-info-hours')) {
    document.getElementById('company-info-hours').textContent = info.hours;
  }

  const encodedAddr = encodeURIComponent(info.address);
  if (document.getElementById('company-info-map-naver')) {
    document.getElementById('company-info-map-naver').href = `https://map.naver.com/v5/search/${encodedAddr}`;
  }
  if (document.getElementById('company-info-map-kakao')) {
    document.getElementById('company-info-map-kakao').href = `https://map.kakao.com/?q=${encodedAddr}`;
  }
  if (document.getElementById('company-info-iframe')) {
    document.getElementById('company-info-iframe').src = `https://maps.google.com/maps?q=${encodedAddr}&t=&z=16&ie=UTF8&iwloc=&output=embed`;
  }

  if (document.getElementById('footer-company-name')) {
    document.getElementById('footer-company-name').textContent = info.name;
  }
  if (document.getElementById('footer-company-info-header')) {
    document.getElementById('footer-company-info-header').innerHTML = `<strong>${info.name}</strong> | BEANSHEAL Co., Ltd. | 대표자: ${info.ceo}`;
  }
  if (document.getElementById('footer-company-address')) {
    document.getElementById('footer-company-address').textContent = `본사 & 공장: ${info.address}`;
  }
  if (document.getElementById('footer-company-tel')) {
    document.getElementById('footer-company-tel').textContent = `TEL : ${info.phone} | FAX : ${info.fax} | 전화상담시간: ${info.hours}`;
  }
}

function trackVisitorAnalytics() {
  const todayStr = new Date().toISOString().split('T')[0];
  let stats = {
    todayDate: todayStr,
    todayVisitors: 0,
    totalVisitors: 0,
    todayPageviews: 0
  };

  try {
    const saved = localStorage.getItem('beansheal_visitor_stats');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed === 'object') {
        // 기존 임의 가상 수치(100 이상)가 남아있는 경우 0으로 완전 초기화
        if ((parsed.totalVisitors && parsed.totalVisitors >= 100) || (parsed.todayVisitors && parsed.todayVisitors >= 100)) {
          localStorage.removeItem('beansheal_visitor_stats');
        } else {
          stats = { ...stats, ...parsed };
        }
      }
    }
  } catch (e) {}

  if (stats.todayDate !== todayStr) {
    stats.todayDate = todayStr;
    stats.todayVisitors = 0;
    stats.todayPageviews = 0;
  }

  const sessionId = sessionStorage.getItem('beansheal_session_id');
  if (!sessionId) {
    const newSessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    sessionStorage.setItem('beansheal_session_id', newSessionId);
    stats.todayVisitors += 1;
    stats.totalVisitors += 1;
  }

  stats.todayPageviews += 1;
  localStorage.setItem('beansheal_visitor_stats', JSON.stringify(stats));
}

/* ==========================================================================
   Scroll Reveal Observer (Luxurious Scroll Animations)
   ========================================================================== */
let globalScrollObserver = null;

function initScrollAnimations() {
  const revealElements = document.querySelectorAll('.reveal-on-scroll');

  const observerOptions = {
    root: null,
    rootMargin: '0px 0px -40px 0px',
    threshold: 0.1
  };

  globalScrollObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('revealed');
      } else {
        // Remove class when out of view so animation plays again when scrolling back!
        entry.target.classList.remove('revealed');
      }
    });
  }, observerOptions);

  revealElements.forEach(el => globalScrollObserver.observe(el));
}

function observeNewRevealElements(container) {
  if (!container || !globalScrollObserver) return;
  const elements = container.querySelectorAll('.reveal-on-scroll');
  elements.forEach(el => globalScrollObserver.observe(el));
}

/* ==========================================================================
   Stat Number Counter Animation (Repeatable on Scroll)
   ========================================================================== */
function initStatCounterAnimation() {
  const statNumbers = document.querySelectorAll('.stat-number');
  if (!statNumbers.length) return;

  const counterObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      const el = entry.target;
      const targetVal = parseFloat(el.getAttribute('data-target'));
      const suffix = el.getAttribute('data-suffix') || '';

      if (entry.isIntersecting) {
        if (!isNaN(targetVal)) {
          let startVal = 0;
          const duration = 1600; // ms
          const startTime = performance.now();

          function updateCounter(now) {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const easeProgress = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
            const currentVal = (startVal + (targetVal - startVal) * easeProgress);

            if (targetVal % 1 !== 0) {
              el.textContent = currentVal.toFixed(1) + suffix;
            } else {
              el.textContent = Math.floor(currentVal).toLocaleString() + suffix;
            }

            if (progress < 1) {
              requestAnimationFrame(updateCounter);
            }
          }

          requestAnimationFrame(updateCounter);
        }
      } else {
        // Reset to 0 when out of view
        if (!isNaN(targetVal)) {
          el.textContent = "0" + suffix;
        }
      }
    });
  }, { threshold: 0.3 });

  statNumbers.forEach(num => counterObserver.observe(num));
}

/* ==========================================================================
   Notice Popup Logic (오늘 하루 보지 않기)
   ========================================================================== */
function initNoticePopup() {
  const noticeModal = document.getElementById('notice-popup-modal');
  const closeHeaderBtn = document.getElementById('notice-header-close');
  const closeFooterBtn = document.getElementById('popup-close-btn');
  const hideCheckbox = document.getElementById('popup-hide-today-checkbox');
  const ctaBtn = document.getElementById('notice-cta-btn');

  if (!noticeModal) return;

  // Load custom admin popup config
  let popupConfig = {
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

  try {
    const saved = localStorage.getItem('beansheal_notice_popup') || localStorage.getItem('beansheal_custom_notice_popup');
    if (saved) popupConfig = { ...popupConfig, ...JSON.parse(saved) };
  } catch (e) {}

  // If admin turned popup OFF, do not show!
  if (popupConfig.enabled === false) return;

  // Update elements dynamically
  if (document.getElementById('notice-badge-text')) {
    document.getElementById('notice-badge-text').innerHTML = `<i class="fas fa-bullhorn"></i> ${popupConfig.badge}`;
  }
  if (document.getElementById('notice-title-box')) {
    document.getElementById('notice-title-box').innerHTML = popupConfig.title;
  }
  if (document.getElementById('notice-subtitle-box')) {
    document.getElementById('notice-subtitle-box').textContent = popupConfig.subtitle;
  }
  if (document.getElementById('notice-b1-title')) document.getElementById('notice-b1-title').textContent = popupConfig.b1Title;
  if (document.getElementById('notice-b1-desc')) document.getElementById('notice-b1-desc').textContent = popupConfig.b1Desc;
  if (document.getElementById('notice-b2-title')) document.getElementById('notice-b2-title').textContent = popupConfig.b2Title;
  if (document.getElementById('notice-b2-desc')) document.getElementById('notice-b2-desc').textContent = popupConfig.b2Desc;
  if (document.getElementById('notice-b3-title')) document.getElementById('notice-b3-title').textContent = popupConfig.b3Title;
  if (document.getElementById('notice-b3-desc')) document.getElementById('notice-b3-desc').textContent = popupConfig.b3Desc;
  if (ctaBtn) {
    ctaBtn.innerHTML = `<i class="fas fa-paper-plane"></i> ${popupConfig.ctaText}`;
  }

  const todayStr = new Date().toISOString().split('T')[0];
  const savedHideDate = localStorage.getItem('sangsang_notice_hide_date');

  // Check if hidden today
  if (savedHideDate !== todayStr) {
    setTimeout(() => {
      noticeModal.classList.add('active');
    }, 600);
  }

  function closeNotice() {
    if (hideCheckbox && hideCheckbox.checked) {
      localStorage.setItem('sangsang_notice_hide_date', todayStr);
    }
    noticeModal.classList.remove('active');
  }

  if (closeHeaderBtn) closeHeaderBtn.addEventListener('click', closeNotice);
  if (closeFooterBtn) closeFooterBtn.addEventListener('click', closeNotice);

  if (ctaBtn) {
    ctaBtn.addEventListener('click', () => {
      closeNotice();
      const inquiryModal = document.getElementById('inquiry-modal');
      const titleInput = document.getElementById('form-title');
      if (titleInput) titleInput.value = "[프로모션 문의] 소량 건기식 OEM/ODM 특가 및 원료 배합 상담";
      if (inquiryModal) inquiryModal.classList.add('active');
    });
  }
}

/* ==========================================================================
   1. Navigation & Header
   ========================================================================== */
function initNavigation() {
  const header = document.querySelector('.site-header');
  const mobileToggle = document.querySelector('.mobile-toggle');
  const gnbNav = document.querySelector('.gnb-nav');
  const navBackdrop = document.getElementById('nav-backdrop');

  const closeMobileNav = () => {
    if (!gnbNav) return;
    gnbNav.classList.remove('active');
    if (mobileToggle) mobileToggle.setAttribute('aria-expanded', 'false');
    if (navBackdrop) {
      navBackdrop.classList.remove('is-open');
      navBackdrop.hidden = true;
    }
    document.body.classList.remove('nav-open');
  };

  const openMobileNav = () => {
    if (!gnbNav) return;
    gnbNav.classList.add('active');
    if (mobileToggle) mobileToggle.setAttribute('aria-expanded', 'true');
    if (navBackdrop) {
      navBackdrop.hidden = false;
      requestAnimationFrame(() => navBackdrop.classList.add('is-open'));
    }
    document.body.classList.add('nav-open');
  };

  window.addEventListener('scroll', () => {
    if (!header) return;
    if (window.scrollY > 30) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
  });

  if (mobileToggle && gnbNav) {
    mobileToggle.addEventListener('click', () => {
      if (gnbNav.classList.contains('active')) closeMobileNav();
      else openMobileNav();
    });
  }

  if (navBackdrop) {
    navBackdrop.addEventListener('click', closeMobileNav);
  }

  // Smooth scroll for internal links
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      const targetId = this.getAttribute('href');
      if (targetId === '#') return;

      const targetElement = document.querySelector(targetId);
      if (targetElement) {
        e.preventDefault();
        closeMobileNav();
        const headerOffset = 80;
        const elementPosition = targetElement.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

        window.scrollTo({
          top: offsetPosition,
          behavior: 'smooth'
        });
      }
    });
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMobileNav();
  });
}

/* ==========================================================================
   2. Hero Slider
   ========================================================================== */
function initHeroSlider() {
  const slides = document.querySelectorAll('.hero-slide');
  const dotsContainer = document.querySelector('.slider-dots');
  let currentSlide = 0;
  let slideInterval;

  if (!slides.length) return;

  // Create dots
  slides.forEach((_, index) => {
    const dot = document.createElement('div');
    dot.classList.add('dot');
    if (index === 0) dot.classList.add('active');
    dot.addEventListener('click', () => goToSlide(index));
    dotsContainer.appendChild(dot);
  });

  const dots = document.querySelectorAll('.dot');

  function goToSlide(n) {
    slides[currentSlide].classList.remove('active');
    dots[currentSlide].classList.remove('active');
    currentSlide = (n + slides.length) % slides.length;
    slides[currentSlide].classList.add('active');
    dots[currentSlide].classList.add('active');
  }

  function nextSlide() {
    goToSlide(currentSlide + 1);
  }

  slideInterval = setInterval(nextSlide, 4500);

  const sliderWrap = document.querySelector('.hero-slider-wrap');
  if (sliderWrap) {
    sliderWrap.addEventListener('mouseenter', () => clearInterval(slideInterval));
    sliderWrap.addEventListener('mouseleave', () => slideInterval = setInterval(nextSlide, 4500));
  }
}

/* ==========================================================================
   3. OEM / ODM / OBM Production Tabs
   ========================================================================== */
function initProductionTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  const displayContainer = document.getElementById('production-detail-container');

  if (!tabBtns.length || !displayContainer) return;

  function renderTabContent(typeId) {
    const typeData = DATA.productionTypes.find(t => t.id === typeId);
    if (!typeData) return;

    displayContainer.innerHTML = `
      <div class="process-card animated fadeIn">
        <div class="process-card-header">
          <div>
            <h3 class="process-type-title">${typeData.title}</h3>
            <p class="process-type-subtitle">${typeData.subtitle}</p>
          </div>
          <span class="type-badge"><i class="fas fa-certificate"></i> ${typeData.badge}</span>
        </div>
        <p class="process-desc">${typeData.description}</p>
        <div class="process-target-box">
          <p><i class="fas fa-bullseye" style="color: var(--accent); margin-right: 8px;"></i> <strong>추천 대상:</strong> ${typeData.target}</p>
        </div>
        <h4 class="feature-list-title">핵심 제공 서비스 & 특장점</h4>
        <div class="feature-grid">
          ${typeData.features.map(f => `
            <div class="feature-item">
              <i class="fas fa-check-circle"></i>
              <span>${f}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const targetType = btn.getAttribute('data-target');
      renderTabContent(targetType);
    });
  });

  // Initial render
  renderTabContent('odm');
}

/* ==========================================================================
   4. Render Formulations & Packaging
   ========================================================================== */
function renderFormulations() {
  const container = document.getElementById('formulations-grid');
  if (!container) return;

  container.innerHTML = DATA.formulations.map(item => `
    <div class="card-hover-item reveal-on-scroll stagger-item reveal-scale">
      <div class="card-thumb">
        <img src="${item.image}" alt="${item.name}" loading="lazy">
        <div class="card-icon-badge">
          <i class="fas ${item.icon}"></i>
        </div>
      </div>
      <div class="card-body">
        <h3 class="card-title">${item.name}</h3>
        <p class="card-english">${item.english}</p>
        <p class="card-text">${item.description}</p>
        <div class="tag-list">
          ${item.details.map(d => `<span class="tag"># ${d}</span>`).join('')}
        </div>
      </div>
    </div>
  `).join('');

  observeNewRevealElements(container);
}

function renderPackaging() {
  const container = document.getElementById('packaging-grid');
  if (!container) return;

  container.innerHTML = DATA.packagingList.map(item => `
    <div class="card-hover-item reveal-on-scroll stagger-item reveal-scale">
      <div class="pkg-card-img">
        <img src="${item.image}" alt="${item.name}" onerror="this.onerror=null; this.src='${item.fallbackImg}';">
      </div>
      <div class="card-body">
        <h3 class="card-title">${item.name}</h3>
        <p class="card-english">${item.english}</p>
        <p class="card-text">${item.desc}</p>
        <div class="tag-list">
          ${item.specs.map(s => `<span class="tag"><i class="fas fa-check"></i> ${s}</span>`).join('')}
        </div>
      </div>
    </div>
  `).join('');

  observeNewRevealElements(container);
}

/* ==========================================================================
   5. Patented Ingredients Catalog & Modal
   ========================================================================== */
function renderIngredients(categoryFilter = 'all') {
  const container = document.getElementById('ingredients-grid');
  const filterChips = document.querySelectorAll('.filter-chip');

  if (!container) return;

  filterChips.forEach(chip => {
    chip.addEventListener('click', () => {
      filterChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      const cat = chip.getAttribute('data-filter');
      renderIngredients(cat);
    });
  });

  const filteredData = categoryFilter === 'all' 
    ? DATA.patentedIngredients 
    : DATA.patentedIngredients.filter(i => i.category === categoryFilter);

  container.innerHTML = filteredData.map(item => `
    <div class="ingredient-card reveal-on-scroll stagger-item reveal-scale ing-detail-btn" data-id="${item.id}" style="cursor: pointer;">
      <div class="ing-header">
        <span class="ing-cat">${item.category}</span>
        <span style="font-size: 0.8rem; color: var(--gray-500); font-weight: 600;">${item.maker}</span>
      </div>
      <h3 class="ing-title">${item.name}</h3>
      <p class="ing-subtitle">${item.subtitle}</p>
      <div class="ing-patents">
        <i class="fas fa-award"></i> ${item.patents}
      </div>
      <p class="ing-summary">${item.summary}</p>
      <div class="card-hover-prompt">
        <span>상세 임상·특허 데이터 보기</span>
        <i class="fas fa-arrow-right"></i>
      </div>
    </div>
  `).join('');

  observeNewRevealElements(container);

  // Attach modal listeners
  document.querySelectorAll('.ing-detail-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const ingId = btn.getAttribute('data-id');
      showIngredientModal(ingId);
    });
  });
}

function showIngredientModal(ingId) {
  const item = DATA.patentedIngredients.find(i => i.id === ingId);
  if (!item) return;

  const modalOverlay = document.getElementById('ingredient-modal');
  const modalBody = modalOverlay.querySelector('.modal-body');

  modalBody.innerHTML = `
    <span class="ing-cat" style="margin-bottom: 12px; display: inline-block;">${item.category}</span>
    <h2 style="font-size: 1.8rem; font-weight: 900; color: var(--navy-900); margin-bottom: 8px;">${item.name}</h2>
    <p style="color: var(--primary-dark); font-weight: 700; margin-bottom: 16px;">${item.subtitle}</p>
    
    <div class="ing-patents" style="margin-bottom: 24px;">
      <i class="fas fa-certificate"></i> ${item.patents}
    </div>

    <h4 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 12px;">핵심 요약 & 메커니즘</h4>
    <p style="color: var(--gray-700); line-height: 1.7; margin-bottom: 24px;">${item.summary}</p>

    <h4 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 12px;">보유 임상시험 및 학술 데이터</h4>
    <ul style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 28px;">
      ${item.details.map(d => `
        <li style="display: flex; align-items: center; gap: 10px; font-weight: 600; color: var(--navy-800);">
          <i class="fas fa-check-circle" style="color: var(--primary);"></i> ${d}
        </li>
      `).join('')}
    </ul>

    <button class="btn btn-primary btn-lg" onclick="openInquiryModalWithIngredient('${item.name}')" style="width: 100%;">
      이 원료로 OEM/ODM 생산 문의하기
    </button>
  `;

  modalOverlay.classList.add('active');
}

/* ==========================================================================
   6. Render Portfolio (samjungbio.com 카드 팬 부채꼴 카루셀 100% 동일 이식)
   ========================================================================== */
var SJFanPositions = [
  { rot: -21, scale: 0.88, x: -36, y: 7.5, zIndex: 1 },
  { rot: -14, scale: 0.93, x: -25, y: 4.2, zIndex: 2 },
  { rot: -7,  scale: 0.97, x: -12.5, y: 1.4, zIndex: 3 },
  { rot: 0,   scale: 1.0,  x: 0,     y: 0.0, zIndex: 10 },
  { rot: 7,   scale: 0.97, x: 12.5,  y: 1.4, zIndex: 3 },
  { rot: 14,  scale: 0.93, x: 25,    y: 4.2, zIndex: 2 },
  { rot: 21,  scale: 0.88, x: 36,    y: 7.5, zIndex: 1 }
];

function getFanResponsiveMultiplier(w) {
  if (w < 480) return 0.28;
  if (w < 640) return 0.38;
  if (w < 768) return 0.5;
  if (w < 1024) return 0.75;
  return 1.0;
}

function getFanHeightMultiplier(w) {
  var idealPx;
  if (w < 480) idealPx = 22 * 16;
  else if (w < 640) idealPx = 26 * 16;
  else if (w < 768) idealPx = 28 * 16;
  else if (w < 1024) idealPx = 34 * 16;
  else idealPx = 38 * 16;
  var available = window.innerHeight * 0.7;
  if (available >= idealPx) return 1;
  return available / idealPx;
}

function getCombinedPortfolio() {
  try {
    const saved = localStorage.getItem('beansheal_portfolio_items') || localStorage.getItem('beansheal_custom_portfolio');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.filter(item => item.isFilled);
      }
    }
  } catch (err) {}
  return DATA.portfolio;
}

function renderPortfolio() {
  const root = document.getElementById('fanRoot');
  const cards = getCombinedPortfolio();
  if (!root || !cards || !cards.length) return;

  const total = cards.length;
  const MAX_VISIBLE = 7;
  const HALF = 3;
  const needsPagination = true; // Always display arrow buttons and dot track
  let centerIndex = HALF;
  let isAnimating = false;
  let hasEntered = false;
  let direction = null;
  let prevVisible = new Set();
  let cleanupHover = null;
  let autoTimer = null;
  let hovering = false;

  // DOM Layout
  root.innerHTML = '';
  const wrap = document.createElement('div'); wrap.className = 'fan-wrap';
  const layoutEl = document.createElement('div'); layoutEl.className = 'fan-layout';
  wrap.appendChild(layoutEl);
  root.appendChild(wrap);

  const cardEls = cards.map((card, idx) => {
    const el = document.createElement('div');
    el.className = 'fan-card';
    el.innerHTML = `<div class="fan-img"><img src="${card.image}" alt="${card.title}" loading="lazy"></div>`;
    layoutEl.appendChild(el);
    return el;
  });

  let dotEls = [];
  if (needsPagination) {
    const controls = document.createElement('div'); controls.className = 'fan-controls';
    const prev = document.createElement('button'); prev.className = 'fan-arrow'; prev.setAttribute('aria-label', '이전');
    prev.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><polyline points="15 18 9 12 15 6"></polyline></svg>`;
    
    const next = document.createElement('button'); next.className = 'fan-arrow'; next.setAttribute('aria-label', '다음');
    next.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><polyline points="9 18 15 12 9 6"></polyline></svg>`;
    
    const dots = document.createElement('div'); dots.className = 'fan-dots';
    cards.forEach((_, idx) => {
      const s = document.createElement('span'); s.className = 'fan-dot';
      s.addEventListener('click', () => {
        if (idx !== centerIndex) {
          jumpTo(idx);
          restartAuto();
        }
      });
      dots.appendChild(s); dotEls.push(s);
    });

    prev.addEventListener('click', () => { cycle('left'); restartAuto(); });
    next.addEventListener('click', () => { cycle('right'); restartAuto(); });
    controls.appendChild(prev); controls.appendChild(dots); controls.appendChild(next);
    root.appendChild(controls);
  }

  function getVisibleMap(center) {
    const map = new Map();
    if (!needsPagination) {
      cards.forEach((_, i) => map.set(i, i));
      return map;
    }
    for (let slot = 0; slot < MAX_VISIBLE; slot++) {
      map.set(((center + slot - HALF) % total + total) % total, slot);
    }
    return map;
  }

  function updateDots() {
    dotEls.forEach((d, i) => d.classList.toggle('on', i === centerIndex));
  }

  function cycle(dir) {
    if (isAnimating && hasEntered) return;
    isAnimating = true; direction = dir;
    centerIndex = dir === 'right' ? (centerIndex + 1) % total : (centerIndex - 1 + total) % total;
    updateDots();
    runLayout();
  }

  function jumpTo(targetIdx) {
    if (targetIdx === centerIndex || (isAnimating && hasEntered)) return;
    isAnimating = true;
    direction = targetIdx > centerIndex ? 'right' : 'left';
    centerIndex = ((targetIdx % total) + total) % total;
    updateDots();
    runLayout();
  }

  function runLayout() {
    if (cleanupHover) cleanupHover();
    cleanupHover = layout();
  }

  function stopAuto() { if (autoTimer) { clearInterval(autoTimer); autoTimer = null; } }
  function startAuto() {
    stopAuto();
    if (!needsPagination || hovering) return;
    autoTimer = setInterval(() => {
      if (hovering) { stopAuto(); return; }
      if (!isAnimating) cycle('right');
    }, 3800);
  }
  function restartAuto() { if (autoTimer) startAuto(); }

  if (needsPagination) {
    root.addEventListener('mouseenter', () => { hovering = true; stopAuto(); });
    root.addEventListener('mouseleave', () => { hovering = false; startAuto(); });

    // Touch Swipe Support for Mobile Devices
    let touchStartX = 0;
    let touchEndX = 0;
    root.addEventListener('touchstart', (e) => {
      if (e.touches && e.touches.length > 0) {
        touchStartX = e.touches[0].clientX;
      }
    }, { passive: true });

    root.addEventListener('touchend', (e) => {
      if (e.changedTouches && e.changedTouches.length > 0) {
        touchEndX = e.changedTouches[0].clientX;
        const diff = touchStartX - touchEndX;
        if (Math.abs(diff) > 35) {
          if (diff > 0) {
            cycle('right');
          } else {
            cycle('left');
          }
          restartAuto();
        }
      }
    }, { passive: true });

    startAuto();
  }

  function getSlotConfig(totalCards, slot) {
    if (totalCards >= MAX_VISIBLE) return SJFanPositions[slot];
    var center = totalCards >> 1;
    var distance = totalCards > 1 ? (slot - center) / center : 0;
    var absDistance = Math.abs(distance);
    return {
      rot: distance * 21,
      scale: 1.0 - 0.12 * absDistance,
      x: distance * 30,
      y: absDistance * absDistance * 7.3,
      zIndex: 10 - Math.abs(slot - center)
    };
  }

  function layout() {
    const visibleMap = getVisibleMap(centerIndex);
    const previouslyVisible = prevVisible;
    const dir = direction;
    const isFirstMount = !hasEntered;
    const mult = getFanResponsiveMultiplier(window.innerWidth);
    const hMult = getFanHeightMultiplier(window.innerWidth);
    const slotCount = needsPagination ? MAX_VISIBLE : total;
    const config = (slot) => getSlotConfig(slotCount, slot);

    if (isFirstMount) isAnimating = true;

    let completed = 0;
    const visibleCount = visibleMap.size;
    const onDone = () => {
      if (++completed >= visibleCount) {
        isAnimating = false;
        if (isFirstMount) hasEntered = true;
      }
    };

    cardEls.forEach((card, ci) => {
      const slot = visibleMap.get(ci);
      const wasVisible = previouslyVisible.has(ci);

      if (slot !== undefined) {
        const c = config(slot);
        const target = { x: (c.x * mult) + 'rem', y: (c.y * hMult) + 'rem', rotation: c.rot, scale: c.scale, opacity: 1, zIndex: c.zIndex };
        if (isFirstMount && typeof gsap !== 'undefined') {
          gsap.set(card, { x: 0, y: (12 * hMult) + 'rem', rotation: 0, scale: 0.5, opacity: 0 });
          gsap.to(card, Object.assign({}, target, { duration: 1.2, ease: 'elastic.out(1.05,.78)', delay: 0.2 + slot * 0.06, onComplete: onDone }));
        } else if (!wasVisible && typeof gsap !== 'undefined') {
          const enterX = dir === 'right' ? 55 : -55;
          gsap.set(card, { x: enterX + 'rem', y: (c.y * hMult) + 'rem', rotation: dir === 'right' ? 35 : -35, scale: 0.5, opacity: 0 });
          gsap.to(card, Object.assign({}, target, { duration: 0.6, ease: 'power2.out', onComplete: onDone }));
        } else if (typeof gsap !== 'undefined') {
          gsap.to(card, Object.assign({}, target, { duration: 0.5, ease: 'power2.out', onComplete: onDone }));
        } else {
          card.style.transform = `translate(${target.x}, ${target.y}) rotate(${target.rotation}deg) scale(${target.scale})`;
          card.style.opacity = '1';
          card.style.zIndex = target.zIndex;
          onDone();
        }
      } else if (wasVisible && typeof gsap !== 'undefined') {
        const exitX = dir === 'right' ? -55 : 55;
        gsap.to(card, { x: exitX + 'rem', opacity: 0, scale: 0.5, rotation: dir === 'right' ? -35 : 35, duration: 0.4, ease: 'power2.in', zIndex: 0 });
      } else if (isFirstMount && typeof gsap !== 'undefined') {
        gsap.set(card, { opacity: 0, scale: 0.3, x: 0, y: 0, zIndex: 0 });
      }
    });

    prevVisible = new Set(visibleMap.keys());

    // Hover & Click Interaction
    const visibleEntries = [];
    cardEls.forEach((el, i) => {
      const slot = visibleMap.get(i);
      if (slot !== undefined) visibleEntries.push({ el, slot, cardIndex: i });
    });
    visibleEntries.sort((a, b) => a.slot - b.slot);

    let activeSlot = null;
    let leaveTimer = null;
    const centerSlot = visibleEntries.length >> 1;

    function updateHoverLayout(hoveredSlot) {
      const m = getFanResponsiveMultiplier(window.innerWidth);
      const hM = getFanHeightMultiplier(window.innerWidth);

      visibleEntries.forEach((entry) => {
        const { el, slot } = entry;
        const base = config(slot);
        let targetX = base.x * m;
        let targetY = base.y * hM;
        let targetRot = base.rot;
        let targetScale = base.scale;
        let delay = 0;

        if (hoveredSlot !== null) {
          const distance = Math.abs(slot - hoveredSlot);
          delay = distance * 0.02;
          if (slot === hoveredSlot) {
            targetY -= 2.5 * hM;
            targetScale *= 1.08;
          } else {
            const normalized = centerSlot > 0 ? (slot - centerSlot) / centerSlot : 0;
            const pushStrength = 8 * (1 - Math.abs(normalized)) * (1 + 0.2 * Math.max(0, 3 - distance));
            if (slot < hoveredSlot) {
              targetX -= pushStrength * m;
              targetRot -= 3 / (distance + 1);
            } else {
              targetX += pushStrength * m;
              targetRot += 3 / (distance + 1);
            }
          }
        } else {
          delay = Math.abs(slot - centerSlot) * 0.02;
        }

        if (typeof gsap !== 'undefined') {
          gsap.to(el, { x: targetX + 'rem', y: targetY + 'rem', rotation: targetRot, scale: targetScale, duration: 0.5, delay: delay, ease: 'elastic.out(1,.75)', overwrite: 'auto' });
          gsap.set(el, { zIndex: base.zIndex });
        }
      });
    }

    const enterHandlers = visibleEntries.map((entry) => {
      const handler = () => {
        if (isAnimating) return;
        if (leaveTimer) { clearTimeout(leaveTimer); leaveTimer = null; }
        if (activeSlot !== entry.slot) {
          activeSlot = entry.slot;
          updateHoverLayout(entry.slot);
        }
      };
      entry.el.addEventListener('mouseenter', handler);
      entry.el.addEventListener('click', () => {
        if (entry.cardIndex !== centerIndex) {
          jumpTo(entry.cardIndex);
          restartAuto();
        }
      });
      return { el: entry.el, handler };
    });

    const onMouseLeave = () => {
      if (isAnimating) return;
      if (leaveTimer) clearTimeout(leaveTimer);
      leaveTimer = setTimeout(() => {
        activeSlot = null;
        updateHoverLayout(null);
      }, 50);
    };
    layoutEl.addEventListener('mouseleave', onMouseLeave);

    const onResize = () => { if (!isAnimating) updateHoverLayout(activeSlot); };
    window.addEventListener('resize', onResize);

    return () => {
      enterHandlers.forEach(h => h.el.removeEventListener('mouseenter', h.handler));
      layoutEl.removeEventListener('mouseleave', onMouseLeave);
      window.removeEventListener('resize', onResize);
      if (leaveTimer) clearTimeout(leaveTimer);
    };
  }

  updateDots();
  runLayout();
}

/* ==========================================================================
   7. Instant Quote Calculator
   ========================================================================== */
let quoteState = {
  formulation: "액상 스틱 파우치 (전용 라인)",
  volume: "25ml ~ 30ml (다이어트 & 액상커피)",
  ingredient: "다이어트 & 건강기능커피",
  packaging: "7포 / 14포 단상자 패키지",
  quantity: "30,000 포 (표준 생산 배치)"
};

function loadDynamicCalcButtons() {
  try {
    const saved = localStorage.getItem('beansheal_calc_options') || localStorage.getItem('beansheal_custom_calc_options');
    if (!saved) return;
    const opts = JSON.parse(saved);
    if (!opts) return;

    ['volume', 'ingredient', 'packaging', 'quantity'].forEach(group => {
      let rawVal = opts[group];
      let valArray = Array.isArray(rawVal) ? rawVal : (typeof rawVal === 'string' ? rawVal.split('\n').filter(s => s.trim()) : []);
      if (valArray.length > 0) {
        const firstBtn = document.querySelector(`.calc-opt-btn[data-group="${group}"]`);
        if (firstBtn && firstBtn.parentElement) {
          firstBtn.parentElement.innerHTML = valArray.map((val, idx) => `
            <button class="opt-btn calc-opt-btn ${idx === 0 ? 'selected' : ''}" data-group="${group}" data-value="${val}">${val}</button>
          `).join('');
          quoteState[group] = valArray[0];
        }
      }
    });
  } catch (e) {}
}

function initQuoteCalculator() {
  loadDynamicCalcButtons();

  const calcContainer = document.getElementById('calculator');
  if (!calcContainer) return;

  calcContainer.addEventListener('click', (e) => {
    const btn = e.target.closest('.calc-opt-btn');
    if (!btn) return;

    const group = btn.getAttribute('data-group');
    const value = btn.getAttribute('data-value');

    btn.parentElement.querySelectorAll('.calc-opt-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');

    quoteState[group] = value;
    updateQuoteSummary();
  });

  updateQuoteSummary();
}

function updateQuoteSummary() {
  const summaryContainer = document.getElementById('quote-summary-list');
  const priceDisplay = document.getElementById('estimated-price-display');

  if (!summaryContainer || !priceDisplay) return;

  summaryContainer.innerHTML = `
    <div class="result-row">
      <span>기본 제형:</span>
      <strong>${quoteState.formulation}</strong>
    </div>
    <div class="result-row">
      <span>스틱 용량:</span>
      <strong>${quoteState.volume}</strong>
    </div>
    <div class="result-row">
      <span>원료 카테고리:</span>
      <strong>${quoteState.ingredient}</strong>
    </div>
    <div class="result-row">
      <span>포장 형태:</span>
      <strong>${quoteState.packaging}</strong>
    </div>
    <div class="result-row">
      <span>예상 생산수량:</span>
      <strong>${quoteState.quantity}</strong>
    </div>
  `;

  let basePrice = 3500000;
  if (quoteState.quantity.includes('10,000')) basePrice = 3500000;
  else if (quoteState.quantity.includes('30,000')) basePrice = 8500000;
  else if (quoteState.quantity.includes('50,000')) basePrice = 13500000;
  else if (quoteState.quantity.includes('100,000')) basePrice = 24000000;

  if (quoteState.volume.includes('35ml')) basePrice *= 1.15;
  if (quoteState.ingredient.includes('유기농')) basePrice *= 1.1;

  priceDisplay.textContent = `약 ${Math.round(basePrice).toLocaleString()} 원 ~`;
}

window.openQuoteInquiryModal = function() {
  const inquiryModal = document.getElementById('inquiry-modal');
  const titleInput = document.getElementById('form-title');
  const contentInput = document.getElementById('form-content');

  if (titleInput) {
    titleInput.value = `[액상스틱 견적문의] ${quoteState.volume} / ${quoteState.ingredient} / ${quoteState.quantity}`;
  }
  if (contentInput) {
    contentInput.value = `안녕하세요, 빈스힐 간편 견적 산출기 조건으로 생산 문의드립니다.\n\n[선택 사양 요약]\n- 제조 제형: 액상 스틱 파우치 (전용 무균 라인)\n- 스틱 용량: ${quoteState.volume}\n- 원료/라인업: ${quoteState.ingredient}\n- 포장 형태: ${quoteState.packaging}\n- 예상 생산 수량: ${quoteState.quantity}\n\n[추가 문의 및 전달사항]\n`;
  }
  if (inquiryModal) {
    inquiryModal.classList.add('active');
  }
};

/* ==========================================================================
   8. Real-Time Inquiry Board
   ========================================================================== */
function getCombinedInquiries() {
  try {
    const saved = localStorage.getItem('beansheal_admin_inquiries') || localStorage.getItem('beansheal_custom_inquiries');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.filter(item => item.status !== '휴지통');
      }
    }
  } catch (err) {}
  return DATA.recentInquiries;
}

let currentUnlockId = null;

function renderInquiryBoard() {
  const container = document.getElementById('inquiry-board-list');
  if (!container) return;

  const list = getCombinedInquiries();

  container.innerHTML = list.map(item => `
    <div class="board-item" onclick="openInquiryUnlockModal(${item.id})">
      <div class="board-item-main">
        <span class="status-badge ${item.status === '답변완료' ? 'status-done' : 'status-pending'}">
          ${item.status}
        </span>
        <h4 class="board-item-title">
          <i class="fas fa-lock" style="font-size: 0.85rem; color: var(--gray-400);"></i>
          ${item.title}
        </h4>
      </div>
      <div class="board-item-meta">
        <span>${item.author}</span>
        <span>${item.date}</span>
      </div>
    </div>
  `).join('');
}

window.openInquiryUnlockModal = function(id) {
  currentUnlockId = id;
  const list = getCombinedInquiries();
  const item = list.find(i => i.id === id);
  if (!item) return;

  document.getElementById('unlock-modal-title').innerHTML = `<i class="fas fa-lock" style="color: var(--primary);"></i> 비밀글 답변 열람 (#${item.id})`;
  document.getElementById('unlock-password-input').value = '';
  document.getElementById('unlock-error-msg').style.display = 'none';

  document.getElementById('unlock-form-step').style.display = 'block';
  document.getElementById('unlock-result-step').style.display = 'none';

  const modal = document.getElementById('inquiry-unlock-modal');
  if (modal) modal.classList.add('active');
};

window.closeInquiryUnlockModal = function() {
  const modal = document.getElementById('inquiry-unlock-modal');
  if (modal) modal.classList.remove('active');
};

window.verifyInquiryUnlock = function() {
  if (!currentUnlockId) return;
  const list = getCombinedInquiries();
  const item = list.find(i => i.id === currentUnlockId);
  if (!item) return;

  const pwdInput = document.getElementById('unlock-password-input')?.value || '';
  const errorMsg = document.getElementById('unlock-error-msg');

  // Allow match if password matches OR phone last 4 digits match OR default fallback "1234"
  const phoneDigits = (item.contact || '').replace(/[^0-9]/g, '');
  const lastFourPhone = phoneDigits.length >= 4 ? phoneDigits.slice(-4) : '';
  const expectedPwd = item.password || '1234';

  if (pwdInput === expectedPwd || (lastFourPhone && pwdInput === lastFourPhone) || pwdInput === '1234') {
    if (errorMsg) errorMsg.style.display = 'none';

    document.getElementById('unlock-form-step').style.display = 'none';
    document.getElementById('unlock-result-step').style.display = 'block';

    document.getElementById('user-view-status').textContent = item.status;
    document.getElementById('user-view-status').className = `status-badge ${item.status === '답변완료' ? 'status-done' : 'status-pending'}`;
    document.getElementById('user-view-date').textContent = item.date;
    document.getElementById('user-view-title').textContent = item.title;
    document.getElementById('user-view-desc').textContent = item.content || item.desc || item.title;

    const replyBox = document.getElementById('user-view-reply-box');
    if (replyBox) {
      if (item.status === '답변완료' && item.reply) {
        replyBox.style.background = '#E8F5E9';
        replyBox.style.borderColor = '#C8E6C9';
        replyBox.style.color = '#1B5E20';
        replyBox.innerHTML = `<strong>[답변 완료]</strong><br>${item.reply}`;
      } else {
        replyBox.style.background = '#FEF3C7';
        replyBox.style.borderColor = '#FDE68A';
        replyBox.style.color = '#92400E';
        replyBox.innerHTML = `<strong>[답변 검토중]</strong><br>(주)빈스힐 전담 연구진이 문의 사양을 검토 중입니다. 24시간 이내에 세부 답변 작성 및 연락드리겠습니다.`;
      }
    }
  } else {
    if (errorMsg) errorMsg.style.display = 'block';
  }
};

window.openPrivacyModal = function() {
  const m = document.getElementById('privacy-modal');
  if (m) m.classList.add('active');
};

window.closePrivacyModal = function() {
  const m = document.getElementById('privacy-modal');
  if (m) m.classList.remove('active');
};

window.openTermsModal = function() {
  const m = document.getElementById('terms-modal');
  if (m) m.classList.add('active');
};

window.closeTermsModal = function() {
  const m = document.getElementById('terms-modal');
  if (m) m.classList.remove('active');
};

/* ==========================================================================
   9. Modals & Forms
   ========================================================================== */
function initModals() {
  const modalOverlays = document.querySelectorAll('.modal-overlay');
  const closeBtns = document.querySelectorAll('.modal-close');

  closeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      modalOverlays.forEach(m => m.classList.remove('active'));
    });
  });

  modalOverlays.forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.remove('active');
      }
    });
  });

  // Inquiry Form Submission
  const inquiryForm = document.getElementById('inquiry-form');
  if (inquiryForm) {
    inquiryForm.addEventListener('submit', (e) => {
      e.preventDefault();
      
      const name = document.getElementById('form-name').value;
      const phone = document.getElementById('form-phone').value;
      const email = document.getElementById('form-email').value;
      const title = document.getElementById('form-title').value;
      const password = document.getElementById('form-password')?.value || '1234';
      const content = document.getElementById('form-content').value;
      const todayStr = new Date().toISOString().split('T')[0];

      const newInquiry = {
        id: Date.now(),
        title: title || "액상 스틱 OEM/ODM 생산 문의드립니다.",
        author: name,
        company: name,
        contact: phone,
        email: email,
        password: password,
        date: todayStr,
        status: "대기중",
        desc: content,
        content: content
      };

      // Add to runtime DATA and localStorage (synced with Admin CMS)
      DATA.recentInquiries.unshift(newInquiry);
      try {
        let saved = JSON.parse(localStorage.getItem('beansheal_admin_inquiries') || localStorage.getItem('beansheal_custom_inquiries') || '[]');
        saved.unshift(newInquiry);
        localStorage.setItem('beansheal_admin_inquiries', JSON.stringify(saved));
        localStorage.setItem('beansheal_custom_inquiries', JSON.stringify(saved));
      } catch (err) {}

      renderInquiryBoard();

      // Real-Time Email Notification Dispatch
      sendInquiryEmailNotification(newInquiry);

      // Close modal & notify
      document.getElementById('inquiry-modal').classList.remove('active');
      alert(`[접수 완료] ${name}님, 생산 문의가 성공적으로 접수되었습니다.\n(주)빈스힐 대표 이메일로 실시간 알림 전송 및 설정하신 비밀번호(${password})로 언제든 답변을 확인하실 수 있습니다.`);
      inquiryForm.reset();
    });
  }
}

function sendInquiryEmailNotification(inquiry) {
  let targetEmail = 'beansheal@beansheal.com';
  try {
    const savedInfo = localStorage.getItem('beansheal_company_info') || localStorage.getItem('beansheal_custom_company_info');
    if (savedInfo) {
      const parsed = JSON.parse(savedInfo);
      if (parsed && parsed.email) targetEmail = parsed.email;
    }
  } catch (e) {}

  const formData = new FormData();
  formData.append('_subject', `[빈스힐 OEM/ODM 신규문의] ${inquiry.author} - ${inquiry.title}`);
  formData.append('_template', 'table');
  formData.append('_captcha', 'false');
  formData.append('회사명/담당자', inquiry.author);
  formData.append('연락처', inquiry.contact);
  formData.append('이메일', inquiry.email || '미입력');
  formData.append('문의제목', inquiry.title);
  formData.append('상세문의내용', inquiry.content || '없음');
  formData.append('답변비밀번호', inquiry.password);
  formData.append('접수일자', inquiry.date);

  fetch(`https://formsubmit.co/ajax/${targetEmail}`, {
    method: 'POST',
    body: formData
  }).then(res => res.json())
    .then(data => {
      console.log('이메일 전송 성공:', data);
    })
    .catch(err => {
      console.warn('이메일 전송 처리 완료:', err);
    });
}

// Global window helpers for inline calls
window.openInquiryModal = function() {
  const modal = document.getElementById('inquiry-modal');
  if (modal) modal.classList.add('active');
};

window.openInquiryModalWithIngredient = function(ingredientName) {
  document.getElementById('ingredient-modal').classList.remove('active');
  const inquiryModal = document.getElementById('inquiry-modal');
  if (inquiryModal) {
    const titleInput = document.getElementById('form-title');
    if (titleInput) titleInput.value = `[특허원료 문의] ${ingredientName} 배합 OEM/ODM 생산 견적 요청`;
    inquiryModal.classList.add('active');
  }
};

window.toggleFaq = function(qEl) {
  const item = qEl.parentElement;
  const answer = item.querySelector('.faq-answer');
  const icon = qEl.querySelector('.faq-icon');
  const isOpen = item.classList.contains('active');

  document.querySelectorAll('.faq-item').forEach(other => {
    other.classList.remove('active');
    other.style.borderColor = '#E2E8F0';
    other.style.background = '#F8FAFC';
    const ans = other.querySelector('.faq-answer');
    if (ans) {
      ans.style.maxHeight = '0px';
      ans.style.borderTopColor = 'transparent';
    }
    const ic = other.querySelector('.faq-icon');
    if (ic) ic.style.transform = 'rotate(0deg)';
  });

  if (!isOpen) {
    item.classList.add('active');
    item.style.borderColor = '#A5D6A7';
    item.style.background = '#FFFFFF';
    answer.style.maxHeight = (answer.scrollHeight + 60) + 'px';
    answer.style.borderTopColor = '#F1F5F9';
    icon.style.transform = 'rotate(180deg)';
  }
};

function getDefaultFaqListApp() {
  return [
    {
      id: 1,
      question: "최소 생산 수량(MOQ)은 얼마나 되나요?",
      answer: "(주)빈스힐은 신규 브랜드 및 스타트업을 위해 <strong>100포 극소량 시험 생산(PILOT)</strong>부터 정식 표준 배치인 <strong>10,000포 ~ 30,000포</strong> 생산까지 맞춤 지원합니다. 부담 없이 시제품을 제작하여 시장 반응을 테스팅해 보실 수 있습니다."
    },
    {
      id: 2,
      question: "샘플 제작 및 맛·향 배합 컨설팅 기간은 얼마나 걸리나요?",
      answer: "원료 선정 및 맞춤 포뮬러 설계 후 <strong>약 3일 ~ 5일 이내</strong>에 시험 샘플을 발송해 드립니다. 빈스힐 전담 연구진이 액상 이스케이프 포뮬러 기술을 적용하여 쓴맛·잡미 마스킹 및 층분리 방지 무료 컨설팅을 함께 제공합니다."
    },
    {
      id: 3,
      question: "식약처 품목제조신고 및 원스톱 행정 절차도 대행해 주시나요?",
      answer: "네, 그렇습니다. 건강기능식품 및 기능성 음료 생산에 필수적인 <strong>식약처 품목제조신고(FHR), 성분 표시 검토, GMP/HACCP 안전 패키지 가이드</strong>까지 전문 행정팀이 원스톱으로 신속하게 전담 대행해 드립니다."
    },
    {
      id: 4,
      question: "제품 포장 형태(스틱 파우치, 단상자 등)는 어떤 종류가 가능한가요?",
      answer: "15ml~35ml 액상 스틱 파우치(이지컷 무균 충진), 7포/14포/30포 단상자 패키지, 선물용 아웃박스 및 디스플레이 팝업 박스 등 고객사가 희망하는 모든 포장 사양으로 완제품 제조가 가능합니다."
    },
    {
      id: 5,
      question: "원료를 직접 제공(사급 원료)해도 생산이 가능한가요?",
      answer: "가능합니다. 고객사 보유 사급 원료의 지표성분 시험성적서(COA) 및 식약처 기준 적합성을 검토한 후 생산 라인에 투입할 수 있으며, 빈스힐의 특허원료 및 프리미엄 개별인정형 원료를 조합하는 것도 가능합니다."
    },
    {
      id: 6,
      question: "정식 생산 계약 후 완제품 출고까지 총 소요 기간은 얼마인가요?",
      answer: "원부자재(스틱 동판, 단상자) 입고 및 품목제조신고 완료 기준 <strong>약 14일 ~ 21일 이내</strong>에 완제품 출고가 가능합니다. 긴급 생산 가동 요청 시 우선 배치 생산이 지원됩니다."
    }
  ];
}

function renderFaqSection() {
  const container = document.getElementById('faq-accordion-list');
  if (!container) return;

  let faqs = getDefaultFaqListApp();
  try {
    const saved = localStorage.getItem('beansheal_faq_items') || localStorage.getItem('beansheal_custom_faqs');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) faqs = parsed;
    }
  } catch (e) {}

  container.innerHTML = faqs.map((item, idx) => `
    <div class="faq-item" style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 16px; overflow: hidden; transition: all 0.3s ease;">
      <div class="faq-question" onclick="toggleFaq(this)" style="padding: 22px 28px; display: flex; align-items: center; justify-content: space-between; cursor: pointer; user-select: none;">
        <div style="display: flex; align-items: center; gap: 14px;">
          <span style="font-weight: 900; font-size: 1.1rem; color: #2E7D32;">Q${idx + 1}.</span>
          <strong style="font-size: 1.05rem; color: #0F172A; font-weight: 800;">${item.question || item.q}</strong>
        </div>
        <i class="fas fa-chevron-down faq-icon" style="color: #64748B; transition: transform 0.3s ease;"></i>
      </div>
      <div class="faq-answer" style="max-height: 0; overflow: hidden; transition: max-height 0.35s ease, padding 0.35s ease; background: #FFFFFF; border-top: 1px solid transparent;">
        <div style="padding: 20px 28px 24px 58px; font-size: 0.95rem; color: #334155; line-height: 1.85;">
          ${item.answer || item.a}
        </div>
      </div>
    </div>
  `).join('');
}

/* ==========================================================================
   Render Brand Showcase Cards
   ========================================================================== */
function renderBrands() {
  const container = document.getElementById('brands-grid');
  if (!container || !DATA.brands) return;

  container.innerHTML = DATA.brands.map(brand => `
    <div style="background: #FFFFFF; border-radius: 22px; border: 1px solid #E2E8F0; overflow: hidden; box-shadow: 0 8px 28px rgba(0,0,0,0.05); transition: transform 0.3s ease, box-shadow 0.3s ease; display: flex; flex-direction: column;">
      <!-- Perfectly Balanced Image Banner Header (Height 260px) -->
      <div style="height: 260px; background-image: linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.7) 100%), url('${brand.bgImage}'); background-size: cover; background-position: center; padding: 26px; display: flex; flex-direction: column; justify-content: space-between; position: relative;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 0.8rem; font-weight: 700; background: rgba(255,255,255,0.95); color: ${brand.color}; padding: 5px 14px; border-radius: 980px; backdrop-filter: blur(8px); box-shadow: 0 2px 8px rgba(0,0,0,0.08);">${brand.badge}</span>
          <div style="width: 42px; height: 42px; background: rgba(255,255,255,0.95); color: ${brand.color}; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.15rem; backdrop-filter: blur(8px); box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
            <i class="fas ${brand.icon}"></i>
          </div>
        </div>
        <div>
          <span style="font-size: 0.85rem; color: rgba(255,255,255,0.9); font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase;">${brand.name}</span>
          <h3 style="font-size: 1.55rem; font-weight: 800; color: #FFFFFF; margin-top: 4px; text-shadow: 0 2px 6px rgba(0,0,0,0.3);">${brand.koreanName}</h3>
        </div>
      </div>

      <!-- Compact & Elegant Body Content -->
      <div style="padding: 30px; display: flex; flex-direction: column; flex-grow: 1;">
        <p style="font-size: 1rem; font-weight: 700; color: ${brand.color}; margin-bottom: 10px;">
          "${brand.tagline}"
        </p>
        <p style="font-size: 0.92rem; color: #6E6E73; line-height: 1.65; margin-bottom: 20px; flex-grow: 1;">
          ${brand.description}
        </p>

        <div style="background: #F8FAFC; border: 1px solid #F1F5F9; border-radius: 14px; padding: 18px 20px; margin-bottom: 20px;">
          <span style="font-size: 0.82rem; font-weight: 800; color: #1D1D1F; display: block; margin-bottom: 10px;">주요 브랜드 시그니처 제조 라인업:</span>
          <ul style="list-style: none; padding: 0; margin: 0; font-size: 0.88rem; color: #334155; line-height: 1.9;">
            ${brand.products.map(p => `<li><i class="fas fa-check-circle" style="color: ${brand.color}; margin-right: 8px;"></i> ${p}</li>`).join('')}
          </ul>
        </div>

        <button class="btn btn-primary btn-lg" style="width: 100%; border-radius: 980px; margin-top: auto;" onclick="openInquiryModal()">
          <i class="fas fa-paper-plane"></i> ${brand.koreanName} 대량생산 견적 문의
        </button>
      </div>
    </div>
  `).join('');
}

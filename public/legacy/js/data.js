// 빈스힐 (BEANSHEAL) 데이터 모듈 - 4대 전문 제조 영역 (핸드드립커피, 건기식, 일반식품, 기능성표시식품)

export const DATA = {
  // 회사 기본 정보
  company: {
    name: "(주)빈스힐",
    englishName: "BEANSHEAL",
    fullTitle: "액상 핸드드립 커피 · 건강기능식품 · 일반식품 · 기능성표시식품 제조 전문 (주)빈스힐",
    slogan: "액상 핸드드립 커피부터 식약처 인증 건기식, 기능성표시식품, 일반음료까지 완벽 대량생산 원스톱 솔루션",
    phone: "02-6956-0956",
    fax: "02-501-0914",
    hours: "09:30 ~ 18:00 (주말 및 공휴일 휴무)",
    ceos: ["최무신", "박균배"],
    categories: [
      {
        id: "coffee",
        name: "액상 핸드드립 커피",
        badge: "대량생산 라인",
        desc: "전문 바리스타 저온 드립 추출 자동화, 원두 아로마 에스테르 보존, 스틱/앰플/1L B2B 파우치 충진"
      },
      {
        id: "health-functional",
        name: "건강기능식품 (GMP)",
        badge: "식약처 GMP 인증",
        desc: "식약처 고시형/개별인정형 기능성 원료 고농축 액상화, 층분리 방지 기술 및 완벽 무균 자동 포장"
      },
      {
        id: "functional-label",
        name: "기능성 표시 식품",
        badge: "식약처 등록 솔루션",
        desc: "일반 식품 및 음료 포맷에 혈당, 면역, 체중조절 등 검증된 기능성 원료를 표시 가공하는 최신 트렌드 제형"
      },
      {
        id: "general-food",
        name: "일반식품 & 음료 (HACCP)",
        badge: "HACCP 무균 충진",
        desc: "과즙 엑기스, 무설탕 액상 젤리, 에너지 샷, 콜드브루 커피 등 대중적인 고품질 일반 식품 전용 라인"
      }
    ],
    offices: [
      {
        name: "서울 사무소 & R&D 센터",
        address: "서울특별시 강남구 선릉로 577 CR타워 3층 [선정릉역 4번 출구]",
        tag: "액상 제형 & 드립 추출 연구소 / 본사"
      },
      {
        name: "당진 1공장 (핸드드립 & 건기식 스마트 라인)",
        address: "충청남도 당진시 합덕읍 합덕산단4로 29",
        tag: "GMP / HACCP / FDA / SQF 자동 충진 대량생산 공장"
      },
      {
        name: "화순 2공장 (핸드드립 & 천연물 고농축 추출)",
        address: "전라남도 화순군 화순읍 산단길 12-51",
        tag: "HGMP / GMP / HACCP 고농축 추출 공장"
      }
    ],
    stats: [
      { number: "4대 라인", label: "핸드드립·건기식·기능성표시·일반식" },
      { number: "10만포+", label: "일일 액상 대량생산 CAPA" },
      { number: "100포", label: "소량 시제품부터 대량 생산 대응" },
      { number: "99.8%", label: "고객 품질 및 아로마 만족도" }
    ]
  },

  // (주)빈스힐 대표 브랜드 라인업
  brands: [
    {
      id: "brand-coffee",
      name: "BEANSHEAL Hand-Drip Coffee",
      koreanName: "빈스힐 액상 핸드드립 커피",
      tagline: "1초 만에 피어오르는 정통 저온 드립 원액의 깊은 아로마",
      badge: "Signature Coffee Brand",
      icon: "fa-mug-hot",
      color: "#2E7D32",
      bgImage: "images/brand-signature.jpg",
      description: "전문 바리스타의 정통 저온 드립 추출 노하우를 스마트 무균 자동 충진 시스템에 이식하여 만든 (주)빈스힐 프리미엄 액상 핸드드립 시그니처 브랜드입니다.",
      products: ["액상 핸드드립 12ml~30ml Easy-Cut 스틱", "20ml~50ml 마시는 고농축 커피 원액 앰플 샷", "70ml~150ml 스파우트 & 레토르트 핸드드립 파우치"]
    }
  ],

  // 생산 방식 (OEM, ODM, OBM - 액상 핸드드립 커피 & 건기식 특화)
  productionTypes: [
    {
      id: "oem",
      title: "OEM (Original Equipment Manufacturing)",
      subtitle: "빈스힐 액상 핸드드립 커피 위탁 대량생산",
      description: "고객사의 전용 스페셜티 원두 및 액상 배합 레시피를 빈스힐의 고성능 드립 추출·무균 자동 충진 라인에서 대량 수량(일일 10만포 이상)으로 맞춤 제조·포장하는 위탁 생산 방식입니다.",
      target: "자체 커피 원두 배합이나 액상 커피 레시피를 보유하고 대량 위탁 제조 공장이 필요한 기업에 추천합니다.",
      badge: "액상 커피 원두/레시피 보유 고객 추천",
      features: [
        "정통 핸드드립 저온 자동 추출 및 향미 에스테르 보존",
        "액상 커피 스틱, 앰플, 파우치 무균 자동 충진",
        "HACCP/GMP 표준 무균 살균 공정에 따른 엄격한 품질 관리",
        "소량 액상 시험 생산(PILOT) 지원 및 대량생산 캐파 보유"
      ]
    },
    {
      id: "odm",
      title: "ODM (Original Development Manufacturing)",
      subtitle: "빈스힐 액상 핸드드립 커피 개발·대량생산 풀케어",
      description: "빈스힐 전문 바리스타 & 연구진이 스페셜티 원두 로스팅 배합부터 드립 추출 조건, 산미·바디감 핑거 테스팅, 패키지 디자인, 대량생산까지 완벽하게 전담하는 풀케어 생산 방식입니다.",
      target: "액상 핸드드립 커피 파우치, 커피 앰플, 기능성 커피 샷 신규 브랜드를 론칭하려는 기업에 최적화되어 있습니다.",
      badge: "인기 No.1 액상 커피 풀케어 솔루션",
      features: [
        "빈스힐 전담 바리스타의 정통 드립 아로마 이식 포뮬러",
        "원두 로스팅 및 드립 배합 핑거 테스팅 지원",
        "식약처 식품 품목제조신고 행정 절차 풀케어",
        "트렌디한 액상 커피 스틱/앰플 전용 무균 포장 디자인"
      ]
    },
    {
      id: "obm",
      title: "OBM (Original Brand Manufacturing)",
      subtitle: "빈스힐 액상 핸드드립 커피 브랜드 개발·수출 솔루션",
      description: "액상 핸드드립 커피 브랜딩부터 제품 개발, 대량이행, 글로벌 수출용 규격(FDA, Halal 등) 충족, B2B 유통망 연계까지 추진하는 토탈 브랜드 솔루션입니다.",
      target: "액상 커피 브랜딩 수립부터 대량 납품 및 해외 수출을 원하시는 기업에 추천합니다.",
      badge: "액상 커피 브랜딩 & 해외 수출 패키지",
      features: [
        "액상 핸드드립 커피 브랜드 컨셉 링킹 및 상표 자문",
        "해외 수출용 커피 규격(FDA, Halal, SQF 등) 대량 대응",
        "B2B 유통망 및 마케팅 채널 연계 지원",
        "액상 커피 전용 안심 물류 파트너 매칭"
      ]
    }
  ],

  // 제형 (Liquid Hand-Drip Coffee Specialized Formulations)
  formulations: [
    {
      id: "handdrip-stick",
      name: "액상 핸드드립 커피 스틱",
      english: "Liquid Hand-Drip Coffee Stick",
      icon: "fa-mug-hot",
      image: "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=600&q=80",
      description: "전문 바리스타 정통 드립 방식을 대규모 저온 드립 추출하여 원두 본연의 풍부한 아로마와 깊은 맛을 10ml~30ml에 고농축한 프리미엄 커피 스틱입니다.",
      details: ["정통 드립 자동 추출", "물/우유에 바로 타먹는 1초 커피", "Easy-Cut 무균 스틱", "일일 대량생산 대응"]
    },
    {
      id: "handdrip-vial",
      name: "액상 핸드드립 마시는 앰플 샷",
      english: "Concentrated Hand-Drip Ampoule Shot",
      icon: "fa-wine-bottle",
      image: "https://images.unsplash.com/photo-1517701604599-bb29b565090c?auto=format&fit=crop&w=600&q=80",
      description: "20ml~50ml 고급 밀봉 바이알에 담긴 고농축 핸드드립 커피 원액 샷으로, 마시는 순간 풍부한 아로마가 피어오르는 프리미엄 커피 앰플제형입니다.",
      details: ["20ml~50ml 고급 바이알 충진", "고농축 핸드드립 원액", "아로마 밀봉 기술", "프리미엄 선물용 세트"]
    },
    {
      id: "convergence-coffee-shot",
      name: "이중제형 액상 커피 샷 (Coffee + Tablet Shot)",
      english: "Convergence Coffee & Vita Shot",
      icon: "fa-vial-circle-check",
      image: "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=600&q=80",
      description: "상부 캡에는 비타민/테아닌 정제를, 하부 용기에는 고농축 액상 핸드드립 커피를 담아 물 없이 한번에 마시는 트렌디 이중제형 샷입니다.",
      details: ["액상 커피 + 정제 이중제형", "에너지 & 집중력 샷", "물 없이 섭취 가능", "특허 이중 캡 용기"]
    },
    {
      id: "spout-pouch",
      name: "스파우트 파우치 액상 핸드드립/음료",
      english: "Spout Pouch Liquid Coffee & Beverage",
      icon: "fa-prescription-bottle",
      image: "https://images.unsplash.com/photo-1582058091505-f87a2e55a40f?auto=format&fit=crop&w=600&q=80",
      description: "Cap이 달린 캡형 파우치로 70ml~150ml 대용량 음료 및 아이/성인용 액상 젤리 섭취에 편리한 제형입니다.",
      details: ["세이프티 캡 적용", "어린이 키즈 음료", "대용량 액상 엑기스", "재밀봉 가공"]
    },
    {
      id: "liquid-pouch",
      name: "일반 액상 파우치 (Pouch)",
      english: "Standard Liquid Pouch",
      icon: "fa-box-tissue",
      image: "https://images.unsplash.com/photo-1615485290382-441e4d049cb5?auto=format&fit=crop&w=600&q=80",
      description: "50ml~100ml 전통 즙, 파우치 차, 웰니스 한방 및 과즙 추출액을 레토르트 파우치에 안전 충진합니다.",
      details: ["3면 레토르트 파우치", "저온 가열 파우치", "전통 과즙/한방 엑기스", "대량충진 호환"]
    },
    {
      id: "dual-shot",
      name: "이중제형 액상 샷 (Dual Shot)",
      english: "Liquid + Cap Dual Shot",
      icon: "fa-flask",
      image: "https://images.unsplash.com/photo-1471864190281-a93a3070b6de?auto=format&fit=crop&w=600&q=80",
      description: "상부 캡(정제/캡슐) + 하부 병(고농축 액상)을 결합하여 물 없이 액상과 정제를 동시에 마시는 최고급 샷 제형입니다.",
      details: ["원스톱 섭취 샷", "상하부 듀얼 충진", "선풍적 히트 샷 포맷", "흡수율 극대화"]
    },
    {
      id: "liquid-concentrate",
      name: "고농축 원액 / 농축차",
      english: "Liquid Concentrates & Tea",
      icon: "fa-wine-glass-alt",
      image: "https://images.unsplash.com/photo-1607613009820-a29f7bb81c04?auto=format&fit=crop&w=600&q=80",
      description: "대용량 병 및 대용량 파우치용 고농축 유동성 추출 원액으로 희석용 또는 즉석 음료용으로 제조됩니다.",
      details: ["고점도/저점도 충진", "유기농 과즙 원액", "콜라겐 액상 원액", "희석용 농축 차"]
    }
  ],

  // 포장 방식 (Liquid Packaging List)
  packagingList: [
    {
      id: "liquid-stick-pkg",
      name: "액상 스틱 포장 (Liquid Stick)",
      english: "Stick Pouch Packaging",
      image: "https://cdn.imweb.me/thumbnail/20210621/0ebe3ea9fd8fc.png",
      fallbackImg: "https://images.unsplash.com/photo-1527661591475-527312dd65f5?auto=format&fit=crop&w=400&q=80",
      desc: "휴대성이 최고인 Easy-Cut 3면/4면 액상 전용 스틱 포장 방식입니다.",
      specs: ["10ml~30ml 액상 충진", "이지컷(Easy-Cut) 가공", "알루미늄 3중 차단 필름"]
    },
    {
      id: "liquid-ampoule-pkg",
      name: "액상 앰플 / 바이알 포장",
      english: "Ampoule & Bottle Packaging",
      image: "https://cdn.imweb.me/thumbnail/20210621/0d3b4867b3d25.png",
      fallbackImg: "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=400&q=80",
      desc: "고급 유리 및 PET 앰플에 액상을 담아 밀봉하는 프리미엄 포장 방식입니다.",
      specs: ["20ml~50ml 앰플 담지", "안전 가스켓 밀봉 캡", "고급 선물세트 패키징"]
    },
    {
      id: "spout-pkg",
      name: "스파우트 파우치 포장",
      english: "Spout Pouch Packaging",
      image: "https://cdn.imweb.me/thumbnail/20250422/7426bd9b67ec1.jpg",
      fallbackImg: "https://images.unsplash.com/photo-1582058091505-f87a2e55a40f?auto=format&fit=crop&w=400&q=80",
      desc: "안전 세이프티 캡이 장착된 캡형 파우치로 아이와 성인 모두 편하게 마시는 포장입니다.",
      specs: ["70ml~150ml 용량", "어린이 세이프티 캡", "손쉬운 재밀봉"]
    },
    {
      id: "convergence-pkg",
      name: "이중제형 액상 샷 포장",
      english: "Dual Formulation Shot",
      image: "https://cdn.imweb.me/thumbnail/20230718/b95998b1998e8.png",
      fallbackImg: "https://images.unsplash.com/photo-1471864190281-a93a3070b6de?auto=format&fit=crop&w=400&q=80",
      desc: "상부(정제/캡슐) + 하부(액상 샷) 형태를 결합하여 물 없이 마시는 원스톱 샷 포장입니다.",
      specs: ["액상 + 정제 동시 섭취", "프리미엄 샷 용기", "선풍적 히트 포맷"]
    },
    {
      id: "liquid-box-pkg",
      name: "액상 전용 디스플레이 박스",
      english: "Liquid Display Box",
      image: "https://cdn.imweb.me/thumbnail/20210621/b52f417e03dbc.png",
      fallbackImg: "https://images.unsplash.com/photo-1615485290382-441e4d049cb5?auto=format&fit=crop&w=400&q=80",
      desc: "액상 스틱 및 앰플을 10포/30포 단위로 트렌디하게 담아내는 전용 인박스 포장입니다.",
      specs: ["10포 / 30포 세트 박스", "고급 무광/유광 코팅", "선물용 트레이 포함"]
    }
  ],

  // 특허원료 (Patented Ingredients - 액상 배합 적합)
  patentedIngredients: [
    {
      id: "pep2dia",
      name: "Pep2Dia ® (액상 특화)",
      category: "혈당조절",
      subtitle: "혈당 상승 수치 억제 프랑스 특허 디펩티드",
      maker: "Ingredia (France) / 빈스힐 액상 배합 특허",
      patents: "프랑스/국제 특허, 인체적용시험 완료",
      summary: "우유에서 추출한 활성 디펩티드 AP 성분으로, 빈스힐의 액상 샷 제형에 적용하여 식후 혈당 급증을 방지하는 상쾌한 액상 원료입니다.",
      details: [
        "프랑스 Ingredia 사 연구소 10년 연구 특허 원료",
        "액상 이스케이프 포뮬러 적용으로 층분리 없는 원액 배합",
        "당뇨 전단계 및 혈당 케어 액상 샷 히트 성분",
        "유단백 가수분해물 기반 높은 체내 흡수율"
      ]
    },
    {
      id: "q186",
      name: "Q186 컴플렉스",
      category: "남성건강",
      subtitle: "남성 갱년기 개별인정형 특허 원료",
      maker: "(주)내츄럴엔도텍 / 빈스힐 액상 독점 라인업",
      patents: "한국 특허 1건, SCIE 논문 3건, 임상시험 완료",
      summary: "대학병원 인체적용시험 결과 남성호르몬 수치 상승을 입증한 원료로 빈스힐 액상 앰플 및 스틱 제품에 완벽 적용됩니다.",
      details: [
        "충남대병원 / 가톨릭대 성모병원 인체적용시험 완료",
        "SCIE 급 국제 학술지 논문 3편 게재",
        "액상 맛 마스킹 기술 적용으로 부드러운 목넘김",
        "안전한 식물성 복합 추출물"
      ]
    },
    {
      id: "farro",
      name: "파로 (Farro Liquid Extract)",
      category: "체중조절/혈당",
      subtitle: "이탈리아 토스카나산 고대 곡물 농축액",
      maker: "이탈리아 유기농 농가 직수입",
      patents: "저당/고단백/고식이섬유 임상 데이터",
      summary: "카로티노이드, 식이섬유가 풍부한 고대 곡물 파로를 빈스힐 고농축 액상차 공법으로 추출하여 부담 없이 마시는 혈당/체중 케어 원액입니다.",
      details: [
        "백미 대비 식이섬유 5배, 저당 고단백 액상 엑기스",
        "포만감 유지 및 장내 미생물 유익균 증식 도움",
        "맛있는 곡물 풍미 액상 스틱 제조 가능",
        "유기농 인증 완료 안전 원료"
      ]
    },
    {
      id: "quercetin",
      name: "퀘르세틴 & 브로멜라인 액상 샷",
      category: "면역/항염",
      subtitle: "플라보노이드 항산화 액상 콤보",
      maker: "고순도 파이토케미컬 추출라인",
      patents: "체내 흡수율 증대 액상 배합 특허",
      summary: "양파 추출 퀘르세틴과 파인애플 추출 브로멜라인을 빈스힐 액상 미세 수용화 공법으로 배합하여 체내 흡수율을 300% 높인 샷 원료입니다.",
      details: [
        "액상 수용화 기술 적용으로 체내 흡수율 극대화",
        "기관지 건강, 항알레르기, 부종 완화 특화",
        "상큼한 과일 맛 마스킹 액상 포뮬라",
        "고농축 비건 액상 샷"
      ]
    }
  ],

  // 생산 완료 포트폴리오 (Liquid Portfolio)
  // 생산 완료 포트폴리오 (Liquid Portfolio - 1번 업로드 완료 & 2~30번 하얀 빈칸)
  portfolio: [
    {
      id: 1,
      title: "DAYSEED 리얼 원샷 다이어트 클렌즈 (모로오렌지맛)",
      category: "건강기능식품",
      format: "액상 스틱 (30ml X 14포)",
      tags: ["가르시니아", "난소화성말토덱스트린", "모로오렌지"],
      image: "images/portfolio-item-1.jpg",
      desc: "체지방 감소 및 식후 혈당 상승 억제에 도움을 주는 프리미엄 액상 다이어트 클렌즈"
    },
    {
      id: 2,
      title: "몸슬 빼림 다이어트 카페",
      category: "건강기능식품",
      format: "액상 스틱 (30ml x 14포)",
      tags: ["가르시니아", "프락토올리고당", "탄수화물CUT"],
      image: "images/portfolio-item-2.jpg",
      desc: "가르시니아와 프락토 올리고당이 함유되어 탄수화물 및 체지방 컷을 돕는 마시는 다이어트 카페"
    },
    {
      id: 3,
      title: "Luona 컷핏 다이어트",
      category: "건강기능식품",
      format: "액상 스틱 (30ml x 7포)",
      tags: ["가르시니아", "프락토올리고당", "2중기능성"],
      image: "images/portfolio-item-3.jpg",
      desc: "가르시니아캄보지아추출물과 프락토올리고당 2중 기능성 프리미엄 액상 다이어트 스틱"
    },
    {
      id: 4,
      title: "SERY BOX 세리컷 프레소 V2",
      category: "건강기능식품",
      format: "액상 스틱 (14ml x 7포)",
      tags: ["가르시니아", "난소화성말토덱스트린", "혈당배변케어"],
      image: "images/portfolio-item-4.jpg",
      desc: "가르시니아와 난소화성말토덱스트린이 체지방, 혈당 케어 및 배변활동 원활을 돕는 액상 프레소 V2"
    },
    {
      id: 5,
      title: "SERY BOX 세리컷 프레소 V2 (14포 세트)",
      category: "건강기능식품",
      format: "액상 스틱 (14ml x 14포)",
      tags: ["가르시니아", "난소화성말토덱스트린", "14포세트"],
      image: "images/portfolio-item-5.jpg",
      desc: "다이어트 & 혈당 케어를 돕는 세리컷 프레소 V2 14포 기획 세트"
    },
    {
      id: 6,
      title: "SERYCUT PRESSO V2 RENEWAL (50sticks)",
      category: "건강기능식품",
      format: "액상 스틱 (14ml x 50sticks)",
      tags: ["SERYBOX", "PRESSOV2", "50sticks"],
      image: "images/portfolio-item-6.jpg",
      desc: "글로벌 리뉴얼 대용량 50스틱 에디션 마시는 다이어트 & 혈당 케어 액상 스틱"
    },
    {
      id: 7,
      title: "가능해 다이어트 가르시니아 카페",
      category: "건강기능식품",
      format: "액상 스틱 (30ml x 14포)",
      tags: ["가르시니아", "HydroxycitricAcid", "가능해카페"],
      image: "images/portfolio-item-7.jpg",
      desc: "고순도 Hydroxycitric Acid 함유 블랙 모던 디자인 마시는 다이어트 가르시니아 카페"
    },
    {
      id: 8,
      title: "김소형원방 다이어트카페 리얼 MUKAVE",
      category: "건강기능식품",
      format: "액상 스틱 (30ml x 14포)",
      tags: ["김소형원방", "가르시니아", "난소화성말토덱스트린"],
      image: "images/portfolio-item-8.jpg",
      desc: "한의학 박사 김소형원방 배합 기술로 만든 가르시니아 & 난소화성말토덱스트린 더블컷 3중 기능성 다이어트카페"
    },
    {
      id: 9,
      title: "푸름웰니스 살뺄리카노",
      category: "건강기능식품",
      format: "액상 스틱 (30ml x 7포)",
      tags: ["푸름웰니스", "가르시니아", "난소화성말토덱스트린"],
      image: "images/portfolio-item-9.jpg",
      desc: "체지방 감소와 배변활동에 도움을 주는 가르시니아 & 난소화성말토덱스트린 2중 기능성 강화 마시는 다이어트 케어"
    },
    {
      id: 10,
      title: "경남제약헬스케어 케어플러스 리셋프레소",
      category: "건강기능식품",
      format: "액상 스틱 (30ml x 10포)",
      tags: ["경남제약", "케어플러스", "가르시니아"],
      image: "images/portfolio-item-10.jpg",
      desc: "경남제약헬스케어의 프리미엄 커피 플레버 마시는 가르시니아 케어플러스 리셋프레소"
    },
    {
      id: 11,
      title: "참밀밀 원데이 마이너스 원다이어트 (모로오렌지맛)",
      category: "건강기능식품",
      format: "액상 스틱 (30ml x 7포)",
      tags: ["참밀밀", "모로오렌지", "가르시니아"],
      image: "images/portfolio-item-11.jpg",
      desc: "가르시니아와 프락토올리고당이 함유된 모로오렌지맛 일일 다이어트 원데이 마이너스 원다이어트"
    },
    {
      id: 12,
      title: "빼자까페 다이어트 FAT AWAY (50sticks 대용량)",
      category: "건강기능식품",
      format: "액상 스틱 (30ml x 50포)",
      tags: ["빼자까페", "FATAWAY", "50sticks"],
      image: "images/portfolio-item-12.jpg",
      desc: "체지방 감소에 도움을 주는 프리미엄 빼자까페 FAT AWAY 대용량 50스틱 에디션"
    },
    {
      id: 13,
      title: "빼자까페 다이어트 FAT AWAY (7포 세트)",
      category: "건강기능식품",
      format: "액상 스틱 (30ml x 7포)",
      tags: ["빼자까페", "FATAWAY", "가르시니아"],
      image: "images/portfolio-item-13.jpg",
      desc: "체지방 감소 기능성 가르시니아 함유 레트로 감성 시그니처 빼자까페 7포 스틱 세트"
    },
    {
      id: 14,
      title: "빼자까페 더블컷 다이어트",
      category: "건강기능식품",
      format: "액상 스틱 (30ml x 7포)",
      tags: ["빼자까페", "더블컷", "2중기능성"],
      image: "images/portfolio-item-14.jpg",
      desc: "프락토올리고당과 가르시니아캄보지아추출물 2중 기능성 강화 마시는 다이어트 빼자까페 더블컷"
    },
    {
      id: 15,
      title: "빼자커피 핸드드립 액상커피 (콜롬비아 후일라)",
      category: "핸드드립커피",
      format: "액상 스틱 (30ml x 7포)",
      tags: ["콜롬비아후일라", "스페셜티원두", "액상커피"],
      image: "images/portfolio-item-15.jpg",
      desc: "콜롬비아 후일라 스페셜티급 100% 추출 원액으로 추출한 고농축 저온 액상 핸드드립 커피"
    },
    {
      id: 16,
      title: "빼자까페 해장커피 (밀크씨슬 & 헛개나무)",
      category: "기능성표시식품",
      format: "액상 스틱 (30ml x 7포)",
      tags: ["밀크씨슬", "헛개나무", "해장커피"],
      image: "images/portfolio-item-16.jpg",
      desc: "밀크씨슬추출물 0.3%와 헛개나무열매 5%가 함유된 숙취해소 및 리프레시를 돕는 빼자까페 해장커피"
    },
    {
      id: 17,
      title: "Beansheal 허니 모로 오렌지C",
      category: "일반식품음료",
      format: "과·채주스 (30ml x 10포)",
      tags: ["모로오렌지", "이탈리아산", "HACCP"],
      image: "images/portfolio-item-17.jpg",
      desc: "이탈리아산 100% 모로 블러드 오렌지 농축액 80% 함유 상큼함과 미네랄이 가득한 과채주스"
    },
    {
      id: 18,
      title: "청호담 그대로 짜낸 리얼 100 유기농 푸룬즙",
      category: "일반식품음료",
      format: "과·채주스 (20g x 14포)",
      tags: ["미국산푸룬", "NFC착즙", "유기농푸룬"],
      image: "images/portfolio-item-18.jpg",
      desc: "미국산 100% 유기농 푸룬 착즙액으로 물 없이 그대로 짜낸 NFC 오가닉 100% 리얼 푸룬즙"
    },
    {
      id: 19,
      title: "ARDIEM 오리지널 NFC 유기농 레몬자몽즙",
      category: "일반식품음료",
      format: "과·채주스 (20g x 14포)",
      tags: ["유기농레몬", "유기농자몽", "NFC착즙"],
      image: "images/portfolio-item-19.jpg",
      desc: "유기농 레몬 착즙액 50%와 유기농 자몽 착즙액 50%의 프리미엄 100% 상큼한 과채주스"
    },
    {
      id: 20,
      title: "ARDIEM 오리지널 NFC 유기농 레몬석류즙",
      category: "일반식품음료",
      format: "과·채주스 (20g x 14포)",
      tags: ["유기농레몬", "유기농석류", "NFC착즙"],
      image: "images/portfolio-item-20.jpg",
      desc: "유기농 레몬 착즙액 50%와 유기농 석류 착즙액 50%의 새콤달콤 뷰티 밸런스 과채주스"
    },
    {
      id: 21,
      title: "ARDIEM 오리지널 NFC 유기농 레몬즙",
      category: "일반식품음료",
      format: "과·채주스 (20g x 14포)",
      tags: ["유기농레몬", "NFC착즙100%", "상큼케어"],
      image: "images/portfolio-item-21.jpg",
      desc: "물 한 방울 섞지 않은 100% 유기농 레몬 착즙액 오리지널 NFC 상쾌한 과채주스"
    },
    {
      id: 22,
      title: "메리앤 발틱 베리 북유럽 유기농 씨베리 NFC 주스",
      category: "일반식품음료",
      format: "과·채주스 (20g x 14포)",
      tags: ["북유럽씨베리", "유기농비타민", "NFC100%"],
      image: "images/portfolio-item-22.jpg",
      desc: "북유럽 청정 유기농 씨베리(비타민나무열매) 100% NFC 영양 가득 착즙 주스"
    },
    {
      id: 23,
      title: "3679 BALTIC BERRY 발틱 베리",
      category: "일반식품음료",
      format: "과·채주스 (20g x 14포)",
      tags: ["3679", "BALTICBERRY", "씨베리100%"],
      image: "images/portfolio-item-23.jpg",
      desc: "Organic Seaberry NFC 100% 유기농 비타민 씨베리원액 힙스터 캐릭터 패키지 과채주스"
    },
    { id: 24, 
      title: "하루 1레몬 유기농 레몬즙", 
      category: "일반식품음료", 
      format: "과·채주스 (25g x 14포)", 
      tags: ["보딩패스", "유기농 레몬", "NFC 착즙 100%"], 
      image: "images/portfolio-item-24.jpg",
      desc: "레몬을 통째로 하루 1레몬 유기농 레몬 착즙액" },
    { id: 25, title: "생산 포트폴리오 준비중 25", category: "생산라인업", format: "하얀 빈칸", tags: ["빈스힐"], image: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='400' height='600' viewBox='0 0 400 600'><rect width='100%' height='100%' fill='%23FFFFFF'/><rect x='20' y='20' width='360' height='560' rx='16' fill='%23F8FAFC' stroke='%23E2E8F0' stroke-width='2' stroke-dasharray='8 8'/><text x='50%' y='48%' font-family='sans-serif' font-size='22' font-weight='800' fill='%2394A3B8' text-anchor='middle'>BEANSHEAL</text><text x='50%' y='53%' font-family='sans-serif' font-size='15' font-weight='600' fill='%23CBD5E1' text-anchor='middle'>생산 포트폴리오 준비중</text></svg>", desc: "빈스힐 생산 제품 이미지 준비중" },
    { id: 26, title: "생산 포트폴리오 준비중 26", category: "생산라인업", format: "하얀 빈칸", tags: ["빈스힐"], image: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='400' height='600' viewBox='0 0 400 600'><rect width='100%' height='100%' fill='%23FFFFFF'/><rect x='20' y='20' width='360' height='560' rx='16' fill='%23F8FAFC' stroke='%23E2E8F0' stroke-width='2' stroke-dasharray='8 8'/><text x='50%' y='48%' font-family='sans-serif' font-size='22' font-weight='800' fill='%2394A3B8' text-anchor='middle'>BEANSHEAL</text><text x='50%' y='53%' font-family='sans-serif' font-size='15' font-weight='600' fill='%23CBD5E1' text-anchor='middle'>생산 포트폴리오 준비중</text></svg>", desc: "빈스힐 생산 제품 이미지 준비중" },
    { id: 27, title: "생산 포트폴리오 준비중 27", category: "생산라인업", format: "하얀 빈칸", tags: ["빈스힐"], image: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='400' height='600' viewBox='0 0 400 600'><rect width='100%' height='100%' fill='%23FFFFFF'/><rect x='20' y='20' width='360' height='560' rx='16' fill='%23F8FAFC' stroke='%23E2E8F0' stroke-width='2' stroke-dasharray='8 8'/><text x='50%' y='48%' font-family='sans-serif' font-size='22' font-weight='800' fill='%2394A3B8' text-anchor='middle'>BEANSHEAL</text><text x='50%' y='53%' font-family='sans-serif' font-size='15' font-weight='600' fill='%23CBD5E1' text-anchor='middle'>생산 포트폴리오 준비중</text></svg>", desc: "빈스힐 생산 제품 이미지 준비중" },
    { id: 28, title: "생산 포트폴리오 준비중 28", category: "생산라인업", format: "하얀 빈칸", tags: ["빈스힐"], image: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='400' height='600' viewBox='0 0 400 600'><rect width='100%' height='100%' fill='%23FFFFFF'/><rect x='20' y='20' width='360' height='560' rx='16' fill='%23F8FAFC' stroke='%23E2E8F0' stroke-width='2' stroke-dasharray='8 8'/><text x='50%' y='48%' font-family='sans-serif' font-size='22' font-weight='800' fill='%2394A3B8' text-anchor='middle'>BEANSHEAL</text><text x='50%' y='53%' font-family='sans-serif' font-size='15' font-weight='600' fill='%23CBD5E1' text-anchor='middle'>생산 포트폴리오 준비중</text></svg>", desc: "빈스힐 생산 제품 이미지 준비중" },
    { id: 29, title: "생산 포트폴리오 준비중 29", category: "생산라인업", format: "하얀 빈칸", tags: ["빈스힐"], image: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='400' height='600' viewBox='0 0 400 600'><rect width='100%' height='100%' fill='%23FFFFFF'/><rect x='20' y='20' width='360' height='560' rx='16' fill='%23F8FAFC' stroke='%23E2E8F0' stroke-width='2' stroke-dasharray='8 8'/><text x='50%' y='48%' font-family='sans-serif' font-size='22' font-weight='800' fill='%2394A3B8' text-anchor='middle'>BEANSHEAL</text><text x='50%' y='53%' font-family='sans-serif' font-size='15' font-weight='600' fill='%23CBD5E1' text-anchor='middle'>생산 포트폴리오 준비중</text></svg>", desc: "빈스힐 생산 제품 이미지 준비중" },
    { id: 30, title: "생산 포트폴리오 준비중 30", category: "생산라인업", format: "하얀 빈칸", tags: ["빈스힐"], image: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='400' height='600' viewBox='0 0 400 600'><rect width='100%' height='100%' fill='%23FFFFFF'/><rect x='20' y='20' width='360' height='560' rx='16' fill='%23F8FAFC' stroke='%23E2E8F0' stroke-width='2' stroke-dasharray='8 8'/><text x='50%' y='48%' font-family='sans-serif' font-size='22' font-weight='800' fill='%2394A3B8' text-anchor='middle'>BEANSHEAL</text><text x='50%' y='53%' font-family='sans-serif' font-size='15' font-weight='600' fill='%23CBD5E1' text-anchor='middle'>생산 포트폴리오 준비중</text></svg>", desc: "빈스힐 생산 제품 이미지 준비중" }
  ],

  // 최근 액상 생산 문의 게시판 (Mock Data)
  recentInquiries: [
    {
      id: 1,
      title: "혈당케어 액상 샷 (이중제형) OEM 생산 최소수량 및 견적 문의",
      author: "성*은 (유통사)",
      date: "10분 전",
      status: "대기중",
      content: "액상 20ml + 정제 2정 구조의 이중제형 포장으로 3,000세트 소량 생산이 가능한지 견적 부탁드립니다."
    },
    {
      id: 2,
      title: "액상 스틱 15ml 유산균/비타민 소량 생산 ODM 개발 문의",
      author: "이*희 (스타트업)",
      date: "35분 전",
      status: "대기중",
      content: "여성용 액상 스틱 제품을 원료 기획부터 포장 디자인까지 빈스힐 ODM으로 진행하고자 합니다."
    },
    {
      id: 3,
      title: "Q186 남성갱년기 액상 앰플 배합 시 생산 리드타임 문의",
      author: "박*준 (헬스케어)",
      date: "2시간 전",
      status: "답변완료",
      content: "Q186 원료 사용 승인 및 액상 앰플 충진 포장 시 첫 생산 완료까지 몇 주 정도 소요되나요?"
    },
    {
      id: 4,
      title: "마시는 글루타치온 액상 파우치 OEM 견적 및 품목신고 절차",
      author: "최*서 (뷰티 브랜드)",
      date: "4시간 전",
      status: "답변완료",
      content: "액상 파우치 30포 입 박스 포장 사양으로 시험 생산 수량 및 식약처 신고 절차 문의드립니다."
    },
    {
      id: 5,
      title: "펫 전용 마시는 액상 영양제 소량제조 최소 수량(MOQ)",
      author: "정*우 (바이오)",
      date: "6시간 전",
      status: "답변완료",
      content: "강아지/고양이 스파우트 액상 70ml 포장으로 minimum batch 수량 조건 확인 부탁드립니다."
    }
  ]
};

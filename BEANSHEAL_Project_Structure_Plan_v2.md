# BEANSHEAL 프로젝트 구조 개편안

> **메인 웹(Storefront) 및 업무 플랫폼(Workplace) 분리 및 구조화 설계서**

## 1. 서비스 영역 구별 & 네이밍 스키마

| 구분 | 영역명 (Domain) | 네이밍 스키마 | Next.js 라우트 그룹 | 주요 대상 | 핵심 역할 및 상세 설명 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 영역 1 | 메인 웹 / 랜딩 | BEANSHEAL Storefront | `(storefront)` | 일반 고객 | 원두 및 브랜드 제품 소개, 브랜드 홍보 페이지, 퍼블릭 랜딩 페이지 |
| 영역 2 | 업무 플랫폼 | BEANSHEAL Workplace | `(workspace)` | 사원 / 관리직 | 재고 관리, 생산 계획(Lot), 라벨, 레시피, 수주/발주, 작업지시서, 시뮬레이터 |
| 인증 | 사내 인증 | BEANSHEAL Identity | `/login` | 임직원 | 사내 아이디 및 ECOUNT ERP 스타일 통합 로그인, 세션/권한 관리 |

## 2. 단계별 마이그레이션 실행 계획

| 단계 | 단계명 | 주요 작업 내용 | 대상 파일 / 경로 | 검증 및 완료 기준 |
| :--- | :--- | :--- | :--- | :--- |
| 1단계 | 파일 격리 (Isolation) | 루트 폴더의 레거시 파일 및 원본 데이터 전용 위치로 이동 | `master.xlsx`, `stock.xlsx` ➔ data/<br>`admin.html`, `index.html`, css/, js/ ➔ public/legacy/ | 루트 경로 청소 완료, 레거시 파일 참조 깨짐 방지 |
| 2단계 | App Router 그룹화 | Next.js 15 App Router 구조에 맞춰 라우트 그룹 및 페이지 재배치 | src/app/(storefront)/<br>src/app/(workspace)/ 하위 페이지 구성 | 각 URL 접근 시 올바른 레이아웃 및 컴포넌트 렌더링 확인 |
| 3단계 | 권한 통제 (Middleware) | middleware.ts 연동을 통한 업무 영역 접근 권한 격리 및 보호 | middleware.ts, src/app/login/ | 비인가 사용자의 /(workspace) 접근 차단 및 로그인 리다이렉트 |
| 4단계 | 빌드 및 검증 (Verification) | 타입 체크 및 정적 빌드 테스트를 통한 마이그레이션 안정성 확보 | `npx tsc --noEmit`<br>`npm run build` | 빌드 에러 0건, 타입 체크 통과, Vercel 정상 배포 |

## 3. BEANSHEAL-main 개편 디렉토리 상세 명세

> **폴더/파일별 위치, 구분, 상태 및 세부 역할**

| 경로 (Path) | 구분/레이어 | 상태/처리 | 역할 및 상세 설명 |
| :--- | :--- | :--- | :--- |
| `BEANSHEAL-main/` | Root Directory | 🔄 기존 유지 | 프로젝트 최상위 루트 디렉토리 |
| `├── data/` | Data Directory | **[격리]** | master.xlsx, stock.xlsx 원본 데이터 전용 보관소 |
| `├── downloads/` | Download Storage | 🔄 기존 유지 | 생성된 엑셀, PDF 등 다운로드 파일 저장 위치 |
| `├── scripts/` | Automation Scripts | 🔄 기존 유지 | 자동화 파싱 및 배치 스크립트 (sync_inventory.py 등) |
| `├── public/` | Public Static Assets | 🔄 기존 유지 | 정적 에셋 (이미지, 파비콘 등) |
| `│   ├── favicon.ico` | Asset | 🔄 기존 유지 | 브라우저 파비콘 아이콘 |
| `│   ├── images/` | Asset Folder | 🔄 기존 유지 | 서비스용 이미지 데이터 |
| `│   └── legacy/` | Legacy Storage | **[격리]** | admin.html, index.html, css/, js/ 레거시 자원 격리 보관 |
| `├── src/` | Source Directory | 🔄 기존 유지 | 애플리케이션 핵심 소스 코드 |
| `│   ├── app/` | App Router | 🔄 기존 구조화 | Next.js 15 App Router 라우팅 계층 |
| `│   │   ├── (storefront)/` | Route Group (1) | **[영역 1]** | 사용자용 브랜드 & 랜딩 페이지 영역 |
| `│   │   │   └── page.tsx` | Page | ✨ `신규` | 메인 웹 랜딩 페이지 |
| `│   │   ├── (workspace)/` | Route Group (2) | **[영역 2]** | 사원/관리자 업무 ERP 플랫폼 영역 |
| `│   │   │   ├── layout.tsx` | Layout | ✨ `신규` | 업무 플랫폼 공통 레이아웃 (Sidebar, Navbar) |
| `│   │   │   ├── dashboard/` | Page Module | ✨ `신규` | 대시보드 (월간 생산 계획표, 메모) |
| `│   │   │   ├── inventory/` | Page Module | ✨ `신규` | 재고 현황 관리 |
| `│   │   │   ├── orders/` | Page Module | ✨ `신규` | 수주 / 발주 계획 관리 |
| `│   │   │   ├── recipes/` | Page Module | ✨ `신규` | 레시피(처방전) 관리 |
| `│   │   │   ├── work-order/` | Page Module | ✨ `신규` | 작업지시서 관리 |
| `│   │   │   ├── LotGenerator/` | Page Module | ✨ `신규` | 생산 LOT 번호 발행기 |
| `│   │   │   ├── labels/` | Page Module | ✨ `신규` | 바코드 / 라벨 출력 |
| `│   │   │   ├── scan/` | Page Module | ✨ `신규` | 바코드 스캔 검수 |
| `│   │   │   ├── audit/` | Page Module | ✨ `신규` | QC 및 감사이력 |
| `│   │   │   └── simulator/` | Page Module | ✨ `신규` | 생산 라인 시뮬레이터 |
| `│   │   ├── api/` | API Routes | 🔄 기존 유지 | 백엔드 API 라우트 |
| `│   │   ├── login/` | Page Module | ✨ `신규/재배치` | 사내 ERP 로그인 페이지 |
| `│   │   ├── globals.css` | Global Style | 🔄 기존 유지 | 전역 글로벌 스타일시트 |
| `│   │   └── layout.tsx` | Root Layout | 🔄 기존 유지 | 최상위 루트 레이아웃 |
| `│   ├── components/` | Components | 🔄 기존 구조화 | UI 컴포넌트 모듈 (common, storefront, workspace) |
| `│   ├── context/` | React Context | 🔄 기존 유지 | AuthContext 등 글로벌 상태 |
| `│   ├── lib/` | Utilities SDK | 🔄 기존 유지 | Supabase 등 유틸리티 SDK |
| `│   └── middleware.ts` | Middleware | 기존 개선 | 퍼블릭 / 업무 영역 권한 보호 미들웨어 |
| `├── package.json` | Config | 🔄 기존 유지 | 프로젝트 패키지 의존성 관리 |
| `└── tsconfig.json` | Config | 🔄 기존 유지 | TypeScript 설정 파일 |

## 4. BEANSHEAL-main 전체 텍스트 구조도 (Tree Diagram)

> **터미널 및 문서 공유용 전체 아스키 트리 구조**

### 디렉토리 구조도

```text
BEANSHEAL-main/
├── data/                       # [격리] master.xlsx, stock.xlsx 원본 데이터 전용
├── downloads/                  # 생성된 엑셀/PDF 다운로드 파일
├── scripts/                    # 자동화 파싱 및 배치 스크립트 (sync_inventory.py 등)
├── public/                     # 정적 에셋 (이미지, 파비콘)
│   ├── favicon.ico
│   ├── images/
│   └── legacy/                 # [격리] admin.html, index.html, css/, js/ 레거시 격리
├── src/
│   ├── app/                    # Next.js 15 App Router 라우팅 계층
│   │   ├── (storefront)/       # [영역 1] 사용자용 브랜드 & 랜딩 페이지
│   │   │   └── page.tsx
│   │   ├── (workspace)/        # [영역 2] 사원/관리자 업무 ERP 플랫폼
│   │   │   ├── layout.tsx      # 업무 플랫폼 공통 레이아웃 (Sidebar, Navbar)
│   │   │   ├── dashboard/      # 대시보드 (월간 생산 계획표, 메모)
│   │   │   ├── inventory/      # 재고 현황 관리
│   │   │   ├── orders/         # 수주 / 발주 계획 관리
│   │   │   ├── recipes/        # 레시피(처방전) 관리
│   │   │   ├── work-order/     # 작업지시서 관리
│   │   │   ├── LotGenerator/   # 생산 LOT 번호 발행기
│   │   │   ├── labels/         # 바코드 / 라벨 출력
│   │   │   ├── scan/           # 바코드 스캔 검수
│   │   │   ├── audit/          # QC 및 감사이력
│   │   │   └── simulator/      # 생산 라인 시뮬레이터
│   │   ├── api/                # 백엔드 API 라우트
│   │   ├── login/              # 사내 ERP 로그인 페이지
│   │   ├── globals.css
│   │   └── layout.tsx
│   ├── components/             # UI 컴포넌트 모듈 (common, storefront, workspace)
│   ├── context/                # AuthContext 등 글로벌 상태
│   ├── lib/                    # Supabase 등 유틸리티 SDK
│   └── middleware.ts           # 퍼블릭 / 업무 영역 권한 보호 미들웨어
├── package.json
└── tsconfig.json
```

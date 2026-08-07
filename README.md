# BEANSHEAL StockTrace

(주)빈스힐 **액상 건기식·음료 OEM/ODM** 고객 홈페이지와 사내 **생산 ERP**를 하나의 Next.js 앱으로 운영하는 저장소입니다.

## 구성

| 영역 | 진입 URL | 설명 |
|------|----------|------|
| 고객 홈페이지 | `/` | `public/homepage.html` (견적, 문의, 포트폴리오) |
| 로그인 | `/login` | Supabase Auth (이메일 / Google) |
| ERP 대시보드 | `/workspace` | 생산 계획·Notion 달력·메모 위젯 |
| 제조/품질 | `/orders`, `/audit`, `/LotGenerator` … | 제조지시기록서, HACCP, 로트 |
| 기준정보 | `/recipes`, `/inventory`, `/simulator` | 레시피, 이카운트 재고, 발주 계산 |
| 홈페이지 CMS | `/admin/cms` | 견적 문의·포트폴리오·FAQ 관리 |

`/``는 middleware에서 `homepage.html`로 rewrite됩니다. ERP 화면은 `LayoutContent` + `Sidebar` 레이아웃을 사용합니다.

## 시작하기

```bash
npm install
npm run dev
```

- 고객 사이트: [http://localhost:3000](http://localhost:3000)
- ERP: 로그인 후 [http://localhost:3000/workspace](http://localhost:3000/workspace)

```bash
npm run build   # 프로덕션 빌드
npm run start   # 프로덕션 서버
npm run lint    # ESLint
```

## 환경 변수 (`.env.local`)

| 변수 | 용도 |
|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (클라이언트·Server Actions) |
| `SUPABASE_SERVICE_ROLE_KEY` | 서버 전용 작업 (선택) |
| `ECOUNT_COM_CODE`, `ECOUNT_ID`, `ECOUNT_PW` | 이카ount Playwright 봇 |
| `ECOUNT_USER_ID`, `ECOUNT_API_KEY` | 이카ount OAPI (Server Actions) |
| `NOTION_API_KEY`, `NOTION_DATABASE_ID` | 생산 계획 Notion 연동 (선택, UI에서도 설정 가능) |

## 폴더 구조

```
public/
  homepage.html      # 고객 마케팅·OEM 메인 페이지
  css/styles.css     # 고객 사이트 스타일
  js/app.js          # 견적기, 문의 게시판, 슬라이더, CMS 연동
  js/data.js         # 브랜드·포트폴리오·FAQ 시드 데이터
  images/            # 로고, 제품·슬라이드 이미지

src/app/
  page.tsx           # / → homepage iframe
  login/             # ERP 로그인
  (workspace)/       # ERP 페이지 (orders, inventory, recipes, …)
  actions/           # Supabase Server Actions (recipe, inventory, notion, ecount)
  api/               # sync-inventory, run-bot, generate-qc-doc 등

src/components/      # 제조기록서 탭, Sidebar, LayoutContent, …
src/context/           # AuthContext (ADMIN / QA / WORKER)
src/lib/supabase.ts    # Supabase 클라이언트
src/middleware.ts      # / → homepage rewrite, 레거시 HTML 리다이렉트

scripts/               # 이카ount 재고 스크래핑·Supabase 업로드 (tsx)
.cursor/rules/         # Cursor Agent용 프로젝트 규칙
```

## 주요 ERP 경로

| 경로 | 기능 |
|------|------|
| `/workspace` | 대시보드 (Notion 생산 계획, 메모) |
| `/recipes` | 제품·레시피 마스터 |
| `/orders` | 제조지시기록서 (표지·칭량·CCP·출하 등) |
| `/inventory` | 이카운트 재고 현황 |
| `/simulator` | 발주 자동 계산 |
| `/admin/cms` | 고객 홈페이지 CMS |

## 스크립트 (로컬 / CI)

```bash
npx tsx scripts/ecountBot.ts    # Playwright 이카ount 로그인·스크래핑
npx tsx scripts/syncStock.ts      # 이카ount API → Supabase
```

GitHub Actions: `.github/workflows/sync-inventory.yml`

## 기술 스택

Next.js 15 · React 19 · Tailwind CSS 4 · Supabase · Notion API · Playwright · Vercel

## Git

기본 브랜치는 **`main`**입니다. 변경 후 `git pull origin main` → commit → `git push origin main`으로 배포합니다.

## 브랜드 에셋

- 워드마크: `public/images/beansheal-logo.png` (밝은 배경), `beansheal-logo-white.png` (어두운 배경)
- 파비콘: `public/favicon.ico`

<!-- Trigger Vercel Build 2026-08-07 -->

# 이카ount 엑셀 봇 자동 동기화 설정

직원은 `/inventory`에서 **「엑셀 봇 자동 동기화」** 버튼만 누르면 됩니다.  
PC에 프로그램 설치 **불필요** — GitHub 클라우드에서 Playwright 봇이 실행됩니다.

## 전체 흐름

```text
[직원] /inventory → 「엑셀 봇 자동 동기화」 클릭
    ↓
[Vercel] POST /api/sync-inventory → GitHub repository_dispatch
    ↓
[GitHub Actions] scripts/ecountBot.ts
    · login.ecount.com 웹 로그인
    · 재고현황 → 엑셀 다운로드 (downloads/ecount_stock.xlsx)
    · parseEcountStockExcel → Supabase ecount_items (소수점 포함)
    ↓
[직원] 1~2분 후 새로고침 → 재고 반영
```

수동 업로드와 **동일한 파서·DB 경로**를 사용합니다.

---

## 1단계 — 워크스페이스에서 로그인 정보 입력 (가장 쉬움)

1. Supabase SQL Editor에서 `supabase/migrations/20260831_ecount_bot_config.sql` 실행
2. 배포 후 **`/admin/ecount-bot`** 접속
3. 이카ount **웹 로그인** 회사코드 · ID · 비밀번호 저장

→ GitHub Actions가 Supabase에서 자동으로 읽습니다. **GitHub에 비번 넣을 필요 없음.**

---

## 2단계 — GitHub Repository Secrets (최소 2개)

GitHub → `ysh0104/BEANSHEAL` → **Settings → Secrets → Actions**

| Secret | 값 |
|--------|-----|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service Role Key |

(선택) env 변수로 직접 넣으려면: `ECOUNT_COM_CODE`, `ECOUNT_ID`, `ECOUNT_PW`

---

## ~~1단계~~ 구 방식 — GitHub에 이카ount 비번 직접 (선택)

메뉴를 못 찾을 때 **재고현황 URL**을 먼저 설정하세요 (권장):

| Secret | 예시 |
|--------|------|
| `ECOUNT_STOCK_MENU_URL` | PC에서 재고현황 화면 주소창 URL 전체 |

또는 CSS selector (URL 대신):

| Secret | 예시 |
|--------|------|
| `ECOUNT_STOCK_MENU_DEPTH1` | `#link_depth1_MENUTREE_xxxxxx` |
| `ECOUNT_STOCK_MENU_DEPTH2` | `#link_depth2_MENUTREE_yyyyyy` |

### 재고현황 URL 찾는 법 (권장)

1. PC 브라우저에서 이카ount ERP 로그인
2. **재고(1) → 재고현황** 클릭 (엑셀 버튼 보이는 화면)
3. 주소창 URL 전체 복사 → `/admin/ecount-bot` 또는 GitHub Secret `ECOUNT_STOCK_MENU_URL`

### 메뉴 selector 찾는 법 (대안)

1. PC 브라우저에서 이카ount ERP 로그인
2. **재고 → 재고현황** 클릭
3. F12 → Elements → 해당 메뉴 `<a id="link_depth1_...">` 우클릭 → Copy selector
4. GitHub Secrets에 저장

---

## 2단계 — Vercel Environment Variables

Vercel 프로젝트 → **Settings** → **Environment Variables**

| 변수 | 값 | 용도 |
|------|-----|------|
| `GITHUB_TOKEN` | GitHub Personal Access Token | 봇 트리거 |
| `GITHUB_REPO` | `ysh0104/BEANSHEAL` | 대상 repo |

### GITHUB_TOKEN 만들기

1. GitHub → Settings → Developer settings → **Personal access tokens**
2. **Fine-grained token** (또는 classic)
3. Repository: `BEANSHEAL` only
4. Permission: **Actions → Read and write**, **Contents → Read**
5. 생성된 토큰 → Vercel `GITHUB_TOKEN`에 붙여넣기
6. **Redeploy**

---

## 3단계 — GitHub Actions에서 수동 테스트

1. GitHub → **Actions** → **Sync Ecount Inventory (Excel Bot)**
2. **Run workflow** → Branch: `main`, target: `stock`
3. 약 2~5분 후 로그 확인:
   - `✅ 로그인 성공`
   - `✅ 엑셀 저장`
   - `🎉 DB 반영 완료: N건`

실패 시 **Artifacts → ecount-bot-debug** 에 스크린샷(`ecount-bot-error.png`) 확인.

---

## 4단계 — 운영에서 사용

1. Vercel 배포 완료 후 `/inventory` 접속
2. **「엑셀 봇 자동 동기화」** 클릭
3. "약 1~2분 후 반영" 안내 → 새로고침

---

## 로컬 테스트 (개발자용)

`.env.local`에 `ECOUNT_COM_CODE`, `ECOUNT_ID`, `ECOUNT_PW`, Supabase 키 설정 후:

```bash
npx playwright install chromium
npx tsx scripts/ecountBot.ts
```

이미 받은 엑셀만 업로드:

```bash
npx tsx scripts/uploadEcountStockExcel.ts ~/Downloads/재고현황.xlsx
```

---

## 자주 나는 문제

| 증상 | 해결 |
|------|------|
| 버튼 눌러도 API(정수)만 동기화 | Vercel에 `GITHUB_TOKEN`/`GITHUB_REPO` 미설정 |
| GitHub Actions 로그인 실패 | `ECOUNT_ID`/`ECOUNT_PW` 확인, 2FA/ IP 제한 여부 |
| 메뉴 못 찾음 / 엑셀 버튼 없음 | `/admin/ecount-bot`에 **재고현황 URL** 저장 (또는 `ECOUNT_STOCK_MENU_URL`) |
| DB 업로드 실패 | `SUPABASE_SERVICE_ROLE_KEY` 설정 |
| Hobby cron 배포 실패 | `vercel.json` cron은 하루 1회만 (`0 18 * * *`) |

---

## API vs 봇

| 방식 | 소수점 | 설치 |
|------|--------|------|
| Open API 동기화 | ❌ 정수만 | 없음 |
| 수동 엑셀 업로드 | ✅ | 없음 |
| **엑셀 봇 (GitHub Actions)** | ✅ | **직원 PC 없음** |

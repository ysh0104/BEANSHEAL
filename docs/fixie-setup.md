# Fixie 고정 IP — 이카운트 API 연동 (Vercel)

Vercel 서버는 IP가 매번 바뀝니다. **Fixie**를 쓰면 고정 IP 2개로 이카운트 Open API를 호출할 수 있습니다.

## 1. Fixie 계정 + Vercel 연동

1. [Fixie Vercel Integration](https://vercel.com/integrations/fixie) 설치 → **Connect Account**
2. [Fixie 대시보드](https://app.usefixie.com) → **+ NEW PROXY APPLICATION**
3. 설정:
   - Project: `beansheal`
   - **Link to Vercel project**: ON
   - **production** 체크
   - Proxy Type: **HTTP/HTTPS**
   - Region: **US East** (아무 US 리전 OK)
   - Plan: **Tricycle** (테스트) 또는 **Commuter** (자동 동기화)
4. 연동 후 Vercel에 `FIXIE_URL` 환경변수가 자동 생성됨

### ⚠️ Fixie Apps가 비어 있는데 Vercel에만 FIXIE_URL이 있는 경우

`Connect Account`만 하고 Proxy 생성을 중간에 멈추면 이런 상태가 됩니다.  
Fixie에는 앱이 없는데, Vercel에는 `FIXIE_URL`이 있어서 **production 체크가 회색(충돌)** 으로 막힙니다.

**해결 (방법 A — 권장): Vercel 변수 지우고 다시 연결**

1. **Vercel** → BEANSHEAL → Settings → **Environment Variables**
2. `FIXIE_URL`, `FIXIE_SOCKS_HOST` 가 있으면 **전부 삭제** (Save)
3. **Fixie** → **+ NEW PROXY APPLICATION**
4. Link to Vercel **ON** → **production** 체크 가능해짐 → Create
5. Vercel에 `FIXIE_URL` 다시 생겼는지 확인 → **Redeploy**

**해결 (방법 B): Vercel 연결 없이 수동 생성**

1. Fixie → **+ NEW PROXY APPLICATION**
2. **Link to Vercel project** → **OFF** (끄기)
3. Proxy Type: HTTP/HTTPS, Region: US East, Plan 선택 → Create
4. 생성된 앱 상세에서 **Proxy URL** 복사 (`http://user:pass@host:port`)
5. **Vercel** → Environment Variables → `FIXIE_URL` = 위 URL **수동 추가** (Production)
6. **Redeploy**

Fixie Apps 목록에 `beansheal` 이 보이면 성공입니다.

## 2. Vercel 환경변수 확인

Vercel → Project → Settings → Environment Variables:

| 변수 | 필수 | 설명 |
|------|------|------|
| `FIXIE_URL` | ✅ | Fixie 연동 시 자동 생성 (`http://user:pass@host:port`) |
| `ECOUNT_COM_CODE` | ✅ | 이카운트 회사 코드 |
| `ECOUNT_USER_ID` | ✅ | API 사용자 ID |
| `ECOUNT_API_KEY` | ✅ | API 인증키 |
| `ECOUNT_ZONE` | | 기본 `AC` |

**주의:** Fixie 사용 시 `ECOUNT_API_BASE_URL`(사무실 프록시)은 비우거나 제거하세요. 충돌 방지.

설정 후 **Redeploy** 필수.

## 3. Fixie Outbound IP → 이카운트 등록

1. 배포 후 브라우저에서 **`/api/debug-fixie`** 또는 재고 화면 **「Fixie / IP 연결 확인」** 클릭
2. `outbound_ips`에 나온 **IP 2개**를 복사
3. **이카운트 ERP** → Self-Customizing → 정보관리 → **API인증키발급** → **IP등록**
4. 위 IP **전부** 추가 후 저장
5. 다시 「Fixie / IP 연결 확인」→ `ecount_login_ok: true` 확인

> `54.x` 대역(Vercel 동적 IP)은 등록하지 마세요.

## 4. 재고 동기화

`/inventory` → **「이카운트 재고 동기화」** 버튼

자동 동기화: `vercel.json` cron — 4시간마다 `/api/ecount/sync`

## 5. 로컬 개발

```bash
vercel env pull   # FIXIE_URL을 .env.local로 받기
npm run dev
```

## 트러블슈팅

| 증상 | 조치 |
|------|------|
| Fixie Apps 비어 있음 + production 회색 | Vercel의 `FIXIE_URL` 삭제 후 Proxy 재생성 (위 §1 참고) 또는 Link OFF로 수동 생성 |
| `conflicting environment variable` | Vercel에 FIXIE_URL만 남은 상태 → 삭제 후 재생성 |
| `허용되지 않은 IP` | debug-fixie의 outbound_ips 전부 이카운트 등록 |
| Fixie 실패 후 54.x IP 오류 | FIXIE_URL 형식·비밀번호 확인, Redeploy |
| 로그인 성공, 재고 0건 | pageSize·API 엔드포인트 — `/api/ecount/sync` 로그 확인 |

## 참고

- Fixie 공식: https://usefixie.com/documentation/vercel
- 사무실 PC 프록시 대안: `desktop/ecount-office-proxy/README.md`

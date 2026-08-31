# Fixie 고정 IP — 이카운트 API 연동 (Vercel)

Vercel 서버는 IP가 매번 바뀝니다. **Fixie**를 쓰면 고정 IP 2개로 이카운트 Open API를 호출할 수 있습니다.

## 1. Fixie 계정 + Vercel 연동

1. [Fixie Vercel Integration](https://vercel.com/integrations/fixie) 설치
2. [Fixie 대시보드](https://app.usefixie.com) → **New Proxy** 생성
3. 연결 대상: **BEANSHEAL** Vercel 프로젝트 (Production + Preview 권장)
4. 연동 후 Vercel에 `FIXIE_URL` 환경변수가 자동 생성됨

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
| `FIXIE_NOT_CONFIGURED` | Vercel Integration + Redeploy |
| `허용되지 않은 IP` | debug-fixie의 outbound_ips 전부 이카운트 등록 |
| Fixie 실패 후 54.x IP 오류 | FIXIE_URL 형식·비밀번호 확인, Redeploy |
| 로그인 성공, 재고 0건 | pageSize·API 엔드포인트 — `/api/ecount/sync` 로그 확인 |

## 참고

- Fixie 공식: https://usefixie.com/documentation/vercel
- 사무실 PC 프록시 대안: `desktop/ecount-office-proxy/README.md`

# 사무실 PC 고정 IP → 이카운트 관문 (방법 A)

웹(Vercel)이 이카운트에 **직접** 붙지 않고, **사무실 PC**를 거쳐 나가게 합니다.  
이카운트가 보는 IP = 사무실 공인 IP (`222.120.156.62` 등).

```text
[브라우저] → [Vercel BEANSHEAL]
                    ↓  ECOUNT_API_BASE_URL
              [Cloudflare Tunnel URL]
                    ↓
              [사무실 PC 프록시 :8787]
                    ↓
              [이카운트 oapi{ZONE}.ecount.com]
```

## 준비물

- 사무실 Windows/Mac PC (항상 켜두거나 동기화할 때만 켜도 됨)
- Node.js 18+
- [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/)
- 이카운트 API 키에 **이 PC 공인 IP** 등록됨

## 1) 이카운트에 IP 등록

1. ifconfig.me 로 공인 IP 확인  
2. 이카운트 → API 인증키 → 허용 IP에 등록

## 2) 사무실 PC에서 프록시 실행

```bat
cd desktop\ecount-office-proxy
npm start
```

Mac/Linux:

```bash
cd desktop/ecount-office-proxy
npm start
```

브라우저로 `http://localhost:8787/health` → `"ok": true` 확인.

### (선택) Zone / 도메인

실서버 API Key 기본값: `oapi` + Zone `AC` → `https://oapiac.ecount.com`

```bash
# Windows PowerShell 예
$env:ECOUNT_ZONE="AC"
$env:ECOUNT_DOMAIN="oapi"   # Test Key면 sboapi
$env:PROXY_SECRET="원하는긴비밀번호"
npm start
```

## 3) Cloudflare Tunnel로 외부에 노출

같은 PC에서 **다른 터미널**:

```bash
cloudflared tunnel --url http://localhost:8787
```

출력에 나오는 URL 예:

`https://random-words-xxxx.trycloudflare.com`

이 주소를 복사합니다.  
(PC/터널을 재시작하면 URL이 바뀔 수 있음 → Vercel 값도 갱신)

## 4) Vercel 환경변수

Vercel → Project → Settings → Environment Variables:

| Name | Value |
|------|--------|
| `ECOUNT_API_BASE_URL` | `https://xxxx.trycloudflare.com` (3번 URL, 끝 `/` 없이) |
| `ECOUNT_PROXY_SECRET` | 2번에서 쓴 `PROXY_SECRET`과 **동일** (썼다면) |
| `ECOUNT_COM_CODE` | 기존 유지 |
| `ECOUNT_USER_ID` | 기존 유지 |
| `ECOUNT_API_KEY` | 기존 유지 |
| `ECOUNT_ZONE` | `AC` (회사 Zone) |

저장 후 **Redeploy** 한 번 필요합니다.

## 5) 테스트

1. 사무실 PC: 프록시 + cloudflared **둘 다 실행 중**  
2. 웹 `/admin/users` → **이카운트 사원 동기화**  
3. 거절이 아니라 목록/성공 메시지가 나오면 성공  

실패 시:

- PC `/health` 되는지  
- Tunnel URL이 Vercel과 같은지  
- `PROXY_SECRET` 양쪽 동일인지  
- 이카운트 허용 IP가 **그 PC**인지  
- Zone이 `oapiac` 맞는지 (틀리면 `ECOUNT_ZONE` / `ECOUNT_DOMAIN` 조정)

## 운영 팁

- 퀵 터널 URL은 재시작마다 바뀜 → 자주 쓰면 **Named Tunnel + 고정 도메인** 권장  
- 프록시/터널이 꺼지면 웹 이카운트 연동은 다시 실패함  
- 당장 동기화가 급하면 예전처럼 **PC에서만** 돌리고, 웹은 수동 매칭도 가능  

## 보안

`PROXY_SECRET`을 꼭 쓰세요. Tunnel URL이 노출되면 외부에서 이 관문을 쓸 수 있습니다.

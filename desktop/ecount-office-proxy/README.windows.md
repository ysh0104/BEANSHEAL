# 사무실 Windows PC → 이카운트 고정 IP 관문

웹(Vercel) → Cloudflare Tunnel → **이 Windows PC** → 이카운트  
이카운트가 보는 IP = 이 PC 공인 IP (`222.120.156.62` 등)

---

## 0) 한 번만 설치

### Node.js
1. https://nodejs.org 에서 **LTS** 설치  
2. 새 CMD에서 `node -v` 나오면 OK

### cloudflared (터널)
1. https://github.com/cloudflare/cloudflared/releases 에서  
   `cloudflared-windows-amd64.exe` 다운로드  
2. 이름을 `cloudflared.exe` 로 바꾸고  
   이 폴더(`desktop\ecount-office-proxy`)에 넣거나, PATH에 추가

### 이카운트
API 인증키 **허용 IP**에 이 PC 공인 IP 등록 (ifconfig.me 확인)

---

## 1) 매번 동기화할 때 (창 2개)

### 창 A — 프록시
이 폴더에서 `start-proxy.bat` 더블클릭  
또는:

```bat
cd desktop\ecount-office-proxy
npm start
```

브라우저에서 http://localhost:8787/health → `"ok": true`

### 창 B — 터널
`start-tunnel.bat` 더블클릭  
(또는 `cloudflared.exe tunnel --url http://localhost:8787`)

화면에 나오는 주소 복사:

```text
https://xxxx.trycloudflare.com
```

---

## 2) Vercel 설정 (URL 바뀔 때마다)

Vercel → Settings → Environment Variables

| Name | Value |
|------|--------|
| `ECOUNT_API_BASE_URL` | `https://xxxx.trycloudflare.com` (끝 `/` 없이) |
| `ECOUNT_COM_CODE` / `ECOUNT_USER_ID` / `ECOUNT_API_KEY` | 기존 값 |

저장 후 **Redeploy**

(선택) 비밀번호:

```bat
set PROXY_SECRET=아무긴비밀번호
npm start
```

Vercel에도 `ECOUNT_PROXY_SECRET` = 같은 값

---

## 3) 테스트

1. Windows에서 **프록시 + 터널 둘 다 실행 중**  
2. 웹 `/admin/users` → **이카운트 사원 동기화**

---

## 주의

- 퀵터널 URL은 **재시작마다 바뀜** → Vercel 값도 다시 넣기  
- 프록시/터널 끄면 웹 이카운트 연동 실패  
- Zone이 다르면: `set ECOUNT_ZONE=AC` / Test Key면 `set ECOUNT_DOMAIN=sboapi`

---

## 파일이 이 PC에 없으면

개발 Mac에서 이 폴더를 USB/공유로 복사하거나, git pull 후:

```bat
cd BEANSHEAL\desktop\ecount-office-proxy
```

@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ========================================
echo  Cloudflare Tunnel
echo  아래에 나오는 https://....trycloudflare.com
echo  주소를 Vercel ECOUNT_API_BASE_URL 에 넣으세요.
echo  이 창을 닫지 마세요.
echo ========================================
echo.

if exist "%~dp0cloudflared.exe" (
  "%~dp0cloudflared.exe" tunnel --url http://localhost:8787
) else (
  where cloudflared >nul 2>nul
  if errorlevel 1 (
    echo [ERROR] cloudflared 가 없습니다.
    echo 1^) https://github.com/cloudflare/cloudflared/releases
    echo 2^) cloudflared-windows-amd64.exe 다운로드
    echo 3^) 이 폴더에 cloudflared.exe 로 이름 바꿔 저장
    pause
    exit /b 1
  )
  cloudflared tunnel --url http://localhost:8787
)

echo.
echo 터널이 종료되었습니다.
pause

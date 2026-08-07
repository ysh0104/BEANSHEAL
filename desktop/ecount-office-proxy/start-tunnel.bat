@echo off
cd /d "%~dp0"

echo ========================================
echo  BEANSHEAL Cloudflare Tunnel
echo  Copy the URL: https://....trycloudflare.com
echo  Set it in Vercel ECOUNT_API_BASE_URL
echo  Do not close this window.
echo ========================================
echo.

if exist "%~dp0cloudflared.exe" (
  "%~dp0cloudflared.exe" tunnel --url http://localhost:8787
) else (
  where cloudflared >nul 2>nul
  if errorlevel 1 (
    echo [ERROR] cloudflared.exe not found.
    echo 1) Download from https://github.com/cloudflare/cloudflared/releases
    echo 2) Save as cloudflared.exe in this folder.
    pause
    exit /b 1
  )
  cloudflared tunnel --url http://localhost:8787
)

echo.
echo Tunnel has stopped.
pause

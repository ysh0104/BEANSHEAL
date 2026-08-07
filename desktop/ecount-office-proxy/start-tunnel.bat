@echo off
cd /d "%~dp0"

echo ========================================
echo  BEANSHEAL Cloudflare Tunnel
echo ========================================
echo.

if not exist "%~dp0cloudflared.exe" (
  echo [ERROR] cloudflared.exe not found in this folder.
  pause
  exit /b 1
)

echo Requesting Tunnel URL...
echo.
"%~dp0cloudflared.exe" tunnel --url http://localhost:8787

echo.
echo Tunnel has stopped.
pause

@echo off
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js 가 없습니다. https://nodejs.org 에서 LTS 설치 후 다시 실행하세요.
  pause
  exit /b 1
)

echo ========================================
echo  BEANSHEAL 이카운트 사무실 프록시
echo  http://localhost:8787
echo  이 창을 닫지 마세요.
echo ========================================
echo.

REM 실서버 API Key 기본: oapi + AC
if "%ECOUNT_ZONE%"=="" set ECOUNT_ZONE=AC
if "%ECOUNT_DOMAIN%"=="" set ECOUNT_DOMAIN=oapi

echo ZONE=%ECOUNT_ZONE%  DOMAIN=%ECOUNT_DOMAIN%
echo.
node server.mjs
echo.
echo 프록시가 종료되었습니다.
pause

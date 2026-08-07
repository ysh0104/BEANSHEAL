@echo off
cd /d "%~dp0"

echo ========================================
echo  BEANSHEAL ECOUNT Office Proxy
echo  http://localhost:8787
echo  Do not close this window.
echo ========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js is not installed.
  echo Please install Node.js from https://nodejs.org
  pause
  exit /b 1
)

if "%ECOUNT_ZONE%"=="" set ECOUNT_ZONE=AC
if "%ECOUNT_DOMAIN%"=="" set ECOUNT_DOMAIN=oapi

echo ZONE=%ECOUNT_ZONE%  DOMAIN=%ECOUNT_DOMAIN%
echo.
node server.mjs
echo.
echo Proxy has stopped.
pause

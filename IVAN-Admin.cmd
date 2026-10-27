@echo off
setlocal
title IVAN Base Drive - Local Admin
cd /d "%~dp0"
where node.exe >nul 2>nul
if errorlevel 1 (
  echo Khong tim thay Node.js. Hay cai Node.js 24.15 tro len, sau do mo lai launcher.
  pause
  exit /b 1
)
node.exe scripts\launch-admin.mjs
if errorlevel 1 (
  echo.
  echo Khoi dong that bai. Xem thong bao phia tren.
  pause
  exit /b 1
)

@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js belum terpasang. Halaman unduhan akan dibuka.
  echo Setelah selesai memasang, klik dua kali start.bat lagi.
  start "" https://nodejs.org
  pause
  exit /b
)
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:3000"
node server.js
pause

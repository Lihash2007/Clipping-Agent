@echo off
setlocal
cd /d "%~dp0"
title PicClip Studio Pro - Public Cloud Host
echo ============================================================
echo   PicClip Studio Pro - Hosting Engine & Public Cloud Tunnel
echo ============================================================
echo.

echo [*] Starting Local AI Engine on port 8000...
set PYTHONPATH=backend
start /b "" "backend\venv\Scripts\python.exe" -m uvicorn backend.main:app --host 127.0.0.1 --port 8000

timeout /t 3 /nobreak >nul

echo [*] Initializing Cloudflare Public HTTPS Tunnel...
echo.
echo ============================================================
echo   Your public HTTPS URL will appear below:
echo   (Open that link on your phone, tablet, or another device!)
echo ============================================================
"backend\bin\cloudflared.exe" tunnel --url http://127.0.0.1:8000
pause

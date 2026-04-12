@echo off
echo =========================================
echo       Starting AnimeStudio (Core)
echo =========================================

echo.
echo [1/2] Starting Backend (FastAPI)...
:: Mở một cửa sổ dòng lệnh mới cho Backend
start "AnimeStudio Backend" cmd /k "python backend\main.py"

echo [2/2] Starting Frontend (Vite/React)...
:: Mở một cửa sổ dòng lệnh mới cho Frontend
start "AnimeStudio Frontend" cmd /k "cd frontend-react && npm run dev"

echo.
echo Both servers are launching in separate windows!
echo Backend:  http://127.0.0.1:8001
echo Frontend: http://localhost:5173
echo.
echo You can close this window now.
pause

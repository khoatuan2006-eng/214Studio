@echo off
chcp 65001 >nul 2>&1
title AnimeStudio - Backend Server

echo ========================================
echo   AnimeStudio Backend Server
echo   http://localhost:8001
echo ========================================
echo.

cd /d "%~dp0"

:: Check if Python is available
where python >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python is not installed or not in PATH!
    echo Please install Python 3.10+ and try again.
    pause
    exit /b 1
)

:: Install dependencies if needed
if not exist "backend\__pycache__" (
    echo [INFO] Installing Python dependencies...
    pip install -r requirements.txt
    echo.
)

echo [INFO] Starting FastAPI backend on http://localhost:8001 ...
echo [INFO] Press Ctrl+C to stop the server.
echo.

python -m uvicorn backend.main:app --host 127.0.0.1 --port 8001 --reload

pause

@echo off
chcp 65001 >nul 2>&1
title AnimeStudio - Dev Launcher

echo ========================================
echo   AnimeStudio Dev Launcher
echo   Backend:  http://localhost:8001
echo   Frontend: http://localhost:5173
echo ========================================
echo.

cd /d "%~dp0"

:: Check Python
where python >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python is not installed or not in PATH!
    pause
    exit /b 1
)

:: Check Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH!
    pause
    exit /b 1
)

:: Install Python deps if needed
pip install -r requirements.txt >nul 2>&1

:: Install npm deps if needed
if not exist "frontend-react\node_modules" (
    echo [INFO] Installing npm dependencies...
    cd /d "%~dp0frontend-react"
    npm install
    cd /d "%~dp0"
)

echo [INFO] Starting Backend server...
start "AnimeStudio Backend" cmd /k "cd /d "%~dp0" && python -m uvicorn backend.main:app --host 127.0.0.1 --port 8001 --reload"

:: Wait a moment for backend to initialize
timeout /t 3 /nobreak >nul

echo [INFO] Starting Frontend dev server...
start "AnimeStudio Frontend" cmd /k "cd /d "%~dp0frontend-react" && npm run dev"

echo.
echo ========================================
echo   Both servers are starting!
echo   Backend:  http://localhost:8001
echo   Frontend: http://localhost:5173
echo ========================================
echo.
echo Close the opened terminal windows to stop the servers.
echo.

pause

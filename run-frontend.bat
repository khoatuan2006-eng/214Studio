@echo off
chcp 65001 >nul 2>&1
title AnimeStudio - Frontend Dev Server

echo ========================================
echo   AnimeStudio Frontend Dev Server
echo   http://localhost:5173
echo ========================================
echo.

cd /d "%~dp0frontend-react"

:: Check if Node.js is available
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH!
    echo Please install Node.js 18+ and try again.
    pause
    exit /b 1
)

:: Install dependencies if needed
if not exist "node_modules" (
    echo [INFO] Installing npm dependencies...
    npm install
    echo.
)

echo [INFO] Starting Vite dev server on http://localhost:5173 ...
echo [INFO] Press Ctrl+C to stop the server.
echo.

npm run dev

pause

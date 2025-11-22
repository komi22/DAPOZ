@echo off
title Dapoz Security Dashboard
echo ========================================
echo  Starting Dapoz Security Dashboard...
echo ========================================
echo.

echo [1/3] Installing dependencies...
npm install
if errorlevel 1 (
    echo.
    echo Error: npm install failed
    echo.
    pause
    exit /b 1
)

echo.
echo [2/3] Starting backend server in new terminal...
start "Dapoz Backend Server" cmd /k "cd /d %cd% && echo Starting backend server... && node server/index.cjs"

echo.
echo [3/3] Starting frontend dev server...
echo Frontend will start in 3 seconds...
timeout /t 3 /nobreak >nul
npm run dev

echo.
echo ========================================
echo  Dapoz Security Dashboard Started
echo ========================================
echo Backend: Running in separate terminal
echo Frontend: Check above for dev server URL
echo.
echo Press any key to close this window...
pause >nul

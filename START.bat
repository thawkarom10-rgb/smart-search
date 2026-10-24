@echo off
title Smart Search v2
color 0B
echo.
echo  ================================================
echo    Smart Search v2
echo    Backend: backend\server.js
echo    Frontend: frontend\public\index.html
echo  ================================================
echo.
set "PATH=%PATH%;C:\Program Files\nodejs;%APPDATA%\npm"
node --version >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo  [ERROR] Node.js not found.
    echo  Download from https://nodejs.org then run again.
    pause
    exit /b 1
)
if not exist "%~dp0backend\node_modules" (
    echo  [..] Installing dependencies...
    cd /d "%~dp0backend"
    call npm install
    if %ERRORLEVEL% neq 0 (
        echo  [ERROR] npm install failed.
        pause
        exit /b 1
    )
)
cd /d "%~dp0backend"
echo  [OK] Starting server...
start "" /b cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:3000"
echo.
echo  ================================================
echo   Running at  http://localhost:3000
echo   Keep this window open while using the site
echo   Press Ctrl+C to stop
echo  ================================================
echo.
node server.js
echo.
echo  Server stopped.
pause
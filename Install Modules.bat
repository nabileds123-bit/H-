@echo off
cd /d "%~dp0"
set NODE_VER="10.16.0"
where node >nul 2>nul
if errorlevel 1 (
    start https://nodejs.org/dist/v%NODE_VER%/node-v%NODE_VER%-x86.msi
    echo Install Node.js first, then run this file again.
    pause
    exit /b 1
) else (
    echo Node.js found.
)
npm install


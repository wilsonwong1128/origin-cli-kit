@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Origin Git Graph
echo.
echo  Origin Git Graph
echo  This installs the desktop app if needed, then opens it.
echo.

where node >nul 2>nul
if %ERRORLEVEL%==0 goto have_node

if exist "%~dp0.tools\node\node.exe" (
  set "PATH=%~dp0.tools\node;%PATH%"
  goto have_node
)

echo Node not found. Downloading a portable copy (does not change your system)...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\bootstrap-node.ps1"
if exist "%~dp0.tools\node\node.exe" (
  set "PATH=%~dp0.tools\node;%PATH%"
  goto have_node
)

echo.
echo Could not prepare Node. Install Node.js 20+ and click again:
echo https://nodejs.org/
echo.
pause
exit /b 1

:have_node
if not exist "%~dp0node_modules\electron" (
  echo Installing packages with npm...
  call npm install
  if %ERRORLEVEL% NEQ 0 (
    echo.
    echo npm install failed.
    pause
    exit /b 1
  )
)
node "%~dp0scripts\install-and-open.mjs"
if %ERRORLEVEL% NEQ 0 (
  echo.
  echo Install or launch failed.
  pause
  exit /b 1
)
endlocal
exit /b 0

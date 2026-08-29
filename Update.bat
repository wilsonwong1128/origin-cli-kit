@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Origin Git Graph Update
echo.
echo  Origin Git Graph — Update
echo  Pulls the latest main (fast-forward only), rebuilds, then opens the app.
echo.
if exist "%~dp0.tools\node\node.exe" set "PATH=%~dp0.tools\node;%PATH%"
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
  echo Node not found. Run Install-and-Open.bat first.
  pause
  exit /b 1
)
node "%~dp0scripts\update-app.mjs"
if %ERRORLEVEL% NEQ 0 (
  echo Update failed.
  pause
  exit /b 1
)
endlocal
exit /b 0

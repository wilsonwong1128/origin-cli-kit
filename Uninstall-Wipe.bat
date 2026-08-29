@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Origin Git Graph Uninstall
echo.
echo  This deletes shortcuts, caches, AND this app folder.
echo  Type UNINSTALL to continue.
set /p CONFIRM=^> 
if /I not "%CONFIRM%"=="UNINSTALL" (
  echo Cancelled.
  pause
  exit /b 1
)
if exist "%~dp0.tools\node\node.exe" set "PATH=%~dp0.tools\node;%PATH%"
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
  echo Node not found. Cannot run the full uninstaller.
  pause
  exit /b 1
)
node "%~dp0scripts\uninstall-app.mjs" --remove-app-dir --confirm=UNINSTALL
endlocal
exit /b 0

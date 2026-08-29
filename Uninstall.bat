@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Origin Git Graph Uninstall
echo.
echo  Origin Git Graph — Uninstall
echo  Removes shortcuts, caches, node_modules, and portable Node.
echo  Source files stay. To delete this folder too, run Uninstall-Wipe.bat
echo.
pause
if exist "%~dp0.tools\node\node.exe" set "PATH=%~dp0.tools\node;%PATH%"
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
  echo Node not found. Removing shortcuts only...
  del /q "%USERPROFILE%\Desktop\Origin Git Graph.lnk" 2>nul
  del /q "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Origin Git Graph.lnk" 2>nul
  echo Done.
  pause
  exit /b 0
)
node "%~dp0scripts\uninstall-app.mjs"
if %ERRORLEVEL% NEQ 0 (
  echo Uninstall failed.
  pause
  exit /b 1
)
echo Uninstall finished.
pause
endlocal
exit /b 0

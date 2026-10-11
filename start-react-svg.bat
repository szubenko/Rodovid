@echo off
setlocal
chcp 65001 >nul
title Rodovid - React SVG atlas
cd /d "%~dp0"
if errorlevel 1 goto failed
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. See README.md for the required version.
  goto failed
)
where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo npm is not available. Reinstall Node.js, then try again.
  goto failed
)
if not exist "node_modules\.bin\vite.cmd" (
  call npm.cmd ci
  if errorlevel 1 goto failed
)
echo Starting the React SVG atlas at http://127.0.0.1:5175
echo Keep this window open. Press Ctrl+C to stop.
set "RODOVID_ATLAS_OPEN=--open"
if /i "%~1"=="--no-open" set "RODOVID_ATLAS_OPEN="
call npm.cmd run dev:react-svg -- %RODOVID_ATLAS_OPEN%
if errorlevel 1 goto failed
exit /b 0
:failed
echo.
echo The atlas could not start. See the error above.
echo If port 5175 is busy, close the previous atlas window and try again.
pause
exit /b 1

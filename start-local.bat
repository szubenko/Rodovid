@echo off
setlocal
chcp 65001 >nul
title Rodovid - local site
cd /d "%~dp0"
if errorlevel 1 goto failed

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install the version listed in README.md.
  goto failed
)
where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo npm is not available. Reinstall Node.js, then try again.
  goto failed
)
if not exist "node_modules\.bin\vite.cmd" (
  echo Installing project dependencies...
  call npm.cmd ci
  if errorlevel 1 goto failed
)

echo Starting Rodovid at http://127.0.0.1:5173
echo Keep this window open. Press Ctrl+C to stop the site.
echo After replacing files in Data, stop the site and run this file again.
set "RODOVID_OPEN=--open"
if /i "%~1"=="--no-open" set "RODOVID_OPEN="
call npm.cmd run dev -- %RODOVID_OPEN%
if errorlevel 1 goto failed
exit /b 0

:failed
echo.
echo Rodovid could not start. See the error above.
echo If port 5173 is busy, close the previous Rodovid window and try again.
echo Import errors are also written to tmp\data-conversion.json.md.
pause
exit /b 1

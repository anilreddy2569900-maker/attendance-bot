@echo off
title Attendance Bot - Setup
cd /d "%~dp0"
echo.
echo ============================================
echo   Attendance Bot - one-time setup
echo ============================================
echo.

rem ---- 1. Find Python -------------------------------------------------------
echo [1/4] Checking Python...
set "PY="
where py >nul 2>nul && set "PY=py -3"
if not defined PY (
    python --version >nul 2>nul && set "PY=python"
)
if not defined PY goto :nopython
%PY% --version >nul 2>nul || goto :nopython
for /f "delims=" %%v in ('%PY% --version') do echo       Found %%v
echo.

rem ---- 2. Python packages ---------------------------------------------------
echo [2/4] Installing Python packages (playwright, openpyxl)...
%PY% -m pip install --disable-pip-version-check -q "playwright>=1.40" "openpyxl>=3.1"
if errorlevel 1 goto :failed
echo       Done.
echo.

rem ---- 3. Headless browser --------------------------------------------------
echo [3/4] Downloading the headless browser (about 150 MB, first time only)...
%PY% -m playwright install chromium
if errorlevel 1 goto :failed
echo       Done.
echo.

rem ---- 4. Shortcuts ---------------------------------------------------------
echo [4/4] Creating shortcuts...
rem Folder path goes in via an env var so odd characters (like ') can't break the command.
set "BOT_DIR=%~dp0"
powershell -NoProfile -Command "$s = New-Object -ComObject WScript.Shell; foreach ($d in [Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs')) { $p = Join-Path $d 'Submit (enter OTP).lnk'; $l = $s.CreateShortcut($p); $l.TargetPath = Join-Path $env:BOT_DIR 'run.bat'; $l.WorkingDirectory = $env:BOT_DIR; $l.IconLocation = (Join-Path $env:SystemRoot 'System32\shell32.dll') + ',167'; $l.Save(); Write-Host ('      Created: ' + $p) }"
if errorlevel 1 goto :failed
echo.

echo ============================================
echo   Setup complete!
echo.
echo   1. Put your students in students.xlsx
echo      (Name in column A, number like 20292 in column B)
echo   2. Double-click "Submit (enter OTP)" on your Desktop
echo   3. Type the OTP and press Enter
echo ============================================
echo.
pause
exit /b 0

:nopython
echo.
echo   Python was not found.
echo.
echo   1. Install it from https://www.python.org/downloads/
echo   2. On the first install screen, TICK "Add python.exe to PATH"
echo   3. Run setup.bat again
echo.
pause
exit /b 1

:failed
echo.
echo   Setup failed at the step above. Check your internet connection
echo   and run setup.bat again. If it keeps failing, copy the error
echo   text above and report it.
echo.
pause
exit /b 1

@echo off
title Submit (enter OTP)
cd /d "%~dp0"

rem Prefer the "py" launcher, fall back to "python".
set "PY="
where py >nul 2>nul && set "PY=py -3"
if not defined PY set "PY=python"

%PY% bulk_submit.py students.xlsx
echo.
pause

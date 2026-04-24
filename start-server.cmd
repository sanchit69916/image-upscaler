@echo off
setlocal
set "APP_DIR=%~dp0"
set "PYTHON_EXE=C:\Users\sanchit\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"

cd /d "%APP_DIR%"

echo.
echo PixelLift Photo 4K Lab
echo ======================
echo Starting local server on http://127.0.0.1:8000
echo Keep this window open while using the app.
echo.

start "" http://127.0.0.1:8000
"%PYTHON_EXE%" -m uvicorn server:app --host 127.0.0.1 --port 8000

echo.
echo Server stopped. Press any key to close.
pause >nul
endlocal

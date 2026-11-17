@echo off
cd /d "%~dp0"
if not exist .venv python -m venv .venv
call .venv\Scripts\activate.bat
python -m pip install -r requirements.txt
if errorlevel 1 (pause & exit /b 1)
echo Open http://127.0.0.1:8000 in your browser after startup.
python run.py
pause

@echo off
cd /d "%~dp0"
if not exist .venv python -m venv .venv
call .venv\Scripts\activate.bat
python -m pip install "torch>=2.6,<3" --index-url https://download.pytorch.org/whl/cpu
if errorlevel 1 (pause & exit /b 1)
python -m pip install -r requirements-ai.txt
if errorlevel 1 (pause & exit /b 1)
python -m ml.setup_pretrained
if errorlevel 1 (pause & exit /b 1)
echo AI ready. Open http://127.0.0.1:8000 after server startup.
python run.py
pause

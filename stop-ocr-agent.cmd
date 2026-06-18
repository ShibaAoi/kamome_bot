@echo off
cd /d C:\kamome_bot
if not exist temp\ocr-agent.pid (
  echo OCR agent is not running.
  exit /b 0
)
set /p OCR_PID=<temp\ocr-agent.pid
taskkill /PID %OCR_PID% /T
if exist temp\ocr-agent.pid del /q temp\ocr-agent.pid

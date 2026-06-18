@echo off
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
copy /Y "%~dp0ocr-agent-startup.vbs" "%STARTUP%\KamomeOcrAgent.vbs" >nul
if errorlevel 1 (
  echo Failed to install OCR automatic startup.
  pause
  exit /b 1
)
echo Kamome OCR agent will start automatically when you sign in to Windows.
pause

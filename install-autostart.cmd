@echo off
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
copy /Y "%~dp0kamome-bot-startup.vbs" "%STARTUP%\KamomeMenuBot.vbs" >nul
if errorlevel 1 (
  echo Failed to install automatic startup.
  pause
  exit /b 1
)
echo Kamome Menu Bot will start automatically when you sign in to Windows.
pause


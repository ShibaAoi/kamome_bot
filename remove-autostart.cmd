@echo off
set "TARGET=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\KamomeMenuBot.vbs"
if exist "%TARGET%" del /q "%TARGET%"
echo Automatic startup has been removed.
pause


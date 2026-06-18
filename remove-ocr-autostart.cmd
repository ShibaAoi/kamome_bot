@echo off
set "TARGET=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\KamomeOcrAgent.vbs"
if exist "%TARGET%" del /q "%TARGET%"
echo OCR automatic startup has been removed.
pause


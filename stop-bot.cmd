@echo off
cd /d C:\kamome_bot
if not exist temp\bot.pid (
  echo Bot is not running.
  exit /b 0
)
set /p BOT_PID=<temp\bot.pid
taskkill /PID %BOT_PID% /T
if exist temp\bot.pid del /q temp\bot.pid


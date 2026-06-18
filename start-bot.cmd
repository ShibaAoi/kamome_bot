@echo off
cd /d C:\kamome_bot
if not exist logs mkdir logs
node src\runner.js >> logs\bot.log 2>&1


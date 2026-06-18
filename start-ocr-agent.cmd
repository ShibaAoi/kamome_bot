@echo off
cd /d C:\kamome_bot
if not exist logs mkdir logs
node local-ocr\agent.js >> logs\ocr-agent.log 2>&1


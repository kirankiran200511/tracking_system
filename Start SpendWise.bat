@echo off
title SpendWise
cd /d "%~dp0"
start "" http://localhost:5173
node dev-server.js

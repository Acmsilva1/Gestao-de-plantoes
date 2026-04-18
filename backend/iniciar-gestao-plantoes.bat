@echo off
setlocal
cd /d "%~dp0.."

REM Porta da API Node (Express). O Vite usa GDP_API_PORT no proxy (/api -> 127.0.0.1:esta porta) — ver frontend\vite.config.js.
set "GDP_API_PORT=3000"

REM Porta do front (Vite); deve coincidir com o script frontend:dev:5180 no package.json da raiz.
set "GDP_WEB_PORT=5180"

echo Liberando portas %GDP_API_PORT% e %GDP_WEB_PORT%...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\free-ports-gestao.ps1" -Ports @(%GDP_API_PORT%, %GDP_WEB_PORT%)

echo Iniciando Gestao de Plantoes (API: %GDP_API_PORT%, Web: %GDP_WEB_PORT%)...
call npm run dev:full:5180
pause

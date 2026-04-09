@echo off
set "GDP_API_PORT=3000"
echo Liberando portas 3000 e 5180...
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts/free-ports-gestao.ps1" -Ports @(3000, 5180)
echo Iniciando Gestao de Plantoes (Porta API: 3000, Porta Web: 5180)...
npm run dev:full:5180
pause

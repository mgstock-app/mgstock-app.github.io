@echo off
cd /d "%~dp0"
node connector.mjs
echo El conector se detuvo. Podes copiar el mensaje de error (sin claves).
pause

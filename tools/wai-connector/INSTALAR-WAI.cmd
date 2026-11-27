@echo off
cd /d "%~dp0"
where node >nul 2>nul || (echo Instala Node.js LTS desde https://nodejs.org/en/download & pause & exit /b 1)
node -e "if (+process.versions.node.split('.')[0]<22) { console.error('Se necesita Node.js 22 o superior'); process.exit(1) }" || (pause & exit /b 1)
echo Instalando dependencias de ensayo...
call npm ci --ignore-scripts --no-audit --no-fund
if errorlevel 1 (echo No se pudo instalar. Revisa internet. & pause & exit /b 1)
node --test session.test.mjs pilot.test.mjs config.test.mjs
if errorlevel 1 (echo Las pruebas no terminaron correctamente. & pause & exit /b 1)
echo Instalacion lista. Si ya tenes el JSON privado del portal, importalo ahora.
choice /C SN /N /M "Importar configuracion ahora? (S/N): "
if errorlevel 2 goto fin
if errorlevel 1 node setup.mjs
:fin
pause

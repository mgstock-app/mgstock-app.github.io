@echo off
cd /d "%~dp0"
echo GESTLOK WAI - PRODUCCION (gestlok.com.ar)
echo Deja esta ventana abierta y la PC encendida con internet.
node connector.mjs produccion
echo El conector de produccion se detuvo. Podes copiar el mensaje de error (sin claves).
pause

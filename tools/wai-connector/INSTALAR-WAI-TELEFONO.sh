#!/data/data/com.termux/files/usr/bin/bash
# GESTLOK WAI · teléfono Android de respaldo (Termux). Uso:
#   bash INSTALAR-WAI-TELEFONO.sh ~/storage/downloads/gestlok-wai-produccion.json
set -e
cd "$(dirname "$0")"
echo "GESTLOK WAI · instalando el respaldo en este teléfono…"
pkg update -y >/dev/null 2>&1 || true
command -v node >/dev/null 2>&1 || pkg install -y nodejs-lts
node -e "if(+process.versions.node.split('.')[0]<22){console.error('Se necesita Node.js 22 o superior');process.exit(1)}"
npm ci --ignore-scripts --no-audit --no-fund
node --test session.test.mjs config.test.mjs remote-auth.test.mjs
if [ -n "$1" ]; then node setup.mjs "$1"; else node setup.mjs; fi
echo "Listo. Borrá el JSON de Descargas después de importarlo (queda guardado en la carpeta privada)."
echo "Para iniciar: bash INICIAR-WAI-TELEFONO.sh"

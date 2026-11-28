#!/data/data/com.termux/files/usr/bin/bash
# GESTLOK WAI · respaldo en el teléfono. Queda en espera mientras la PC atiende;
# si la PC deja de dar señal (apagada o sin internet), en menos de un minuto atiende el teléfono
# con la MISMA vinculación (no hace falta escanear QR). Si se reinicia, vuelve a arrancar solo.
cd "$(dirname "$0")"
termux-wake-lock 2>/dev/null || true
while true; do
  node connector.mjs produccion
  echo "El conector se detuvo. Reinicia en 10 segundos (Ctrl+C para salir)."
  sleep 10
done

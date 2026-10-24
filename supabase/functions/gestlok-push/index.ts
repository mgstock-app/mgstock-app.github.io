// GestLok Web Push quedó desactivado por decisión de la administradora.
// No registra dispositivos, no envía notificaciones y no procesa tareas de envío.
Deno.serve(() => new Response(JSON.stringify({
  ok: false,
  disabled: true,
  message: "Las notificaciones push de GestLok están desactivadas."
}), {
  status: 410,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
}));

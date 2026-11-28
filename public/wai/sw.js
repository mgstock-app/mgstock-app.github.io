/* GESTLOK WAI · app instalable. Sin caché de datos: todo pasa por la red
 * (conversaciones y pedidos siempre al día). Sin conexión muestra un aviso. */
const OFFLINE='<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>GESTLOK WAI · Sin conexión</title><body style="font:16px system-ui;margin:0;display:grid;place-items:center;min-height:100vh;background:#f4f7fb;color:#142d44"><main style="max-width:420px;padding:24px;text-align:center"><h1 style="font-size:22px">Sin conexión</h1><p>GESTLOK WAI necesita internet para mostrar tus conversaciones. Revisá la conexión y volvé a intentar.</p><p><a href="/wai/" style="color:#142d44;font-weight:700">Reintentar</a></p></main></body></html>';
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',e=>{
  if(e.request.mode!=='navigate')return;
  e.respondWith(fetch(e.request).catch(()=>new Response(OFFLINE,{headers:{'content-type':'text/html; charset=utf-8'}})));
});

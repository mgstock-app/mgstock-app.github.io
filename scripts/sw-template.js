/* Generated into public/sw.js before each build. Never clear another app's cache. */
const BASE = new URL('.', self.location.href).pathname.replace(/\/$/, '');
const PREFIX = `mgstock:${BASE || '/'}:`;
const CACHE = PREFIX + '__BUILD_VERSION__';
const SHELL = ['/', '/stock/gestlok-offline.js', '/stock/app.js', '/stock/gestlok-pwa-update.js', '/stock/gestlok-visitor-demo.js', '/stock/munro-daily.js', '/stock/munro-motos.js', '/stock/mi-gusto-resenas.js', '/stock/mi-gusto-cierre-online.js', '/stock/gestlok-sidebar-polish.js', '/stock/gestlok-mobile-dock.js', '/stock/gestlok-sidebar-polish.css', '/stock/gestlok-commerce.js', '/stock/gestlok-tienda.js', '/stock/gestlok-demo.js', '/stock/gestlok-demo-metrics.js', '/stock/gestlok-creator.js', '/stock/gestlok-support.js', '/stock/gestlok-role-switcher.js', '/stock/gestlok-provider-pdf.js', '/stock/gestlok-updates.js', '/stock/gestlok-push.js', '/stock/auth.js', '/stock/gestlok-registration.js', '/stock/gestlok-owner-areas.js', '/stock/gestlok-pilot.js', '/stock/gestlok-pedidos.js', '/stock/gestlok-precios-stock.js', '/stock/gestlok-future-pricing.js', '/stock/gestlok-creator-mode.js', '/stock/gestlok-creator-support.js', '/stock/gestlok-creator-home.js', '/stock/ingreso.js', '/stock/config.js', '/vendor/supabase.js', '/manifest.webmanifest', '/icons/gestlok.svg', '/icons/gestlok-wordmark.svg', '/icons/gestlok-app-v2-192.png', '/icons/gestlok-app-v2-512.png', '/icons/gestlok-maskable-v2-512.png', '/icons/gestlok-apple-v2-180.png', '/icons/gestlok-favicon-v2-32.png', '/plantillas/GESTLOK-plantilla-horarios.xlsx', '/plantillas/GESTLOK-demo-horarios-ficticio.xlsx', '/plantillas/demo-horarios.json', '/stock/gestlok-demo-horarios.js', '/stock/gestlok-demo-tour.js', '/stock/gestlok-demo-tour.css', '/stock/gestlok-demo-showcase.css', '/stock/gestlok-demo-mobile.css'].map(path => BASE + path);
// Páginas y recursos de «Administrar a los empleados» (/empleados/), listados en cada publicación
// por scripts/sw-precache.mjs. Así las dos áreas se abren y navegan sin conexión.
const EMPLEADOS = /*__EMPLEADOS_PRECACHE__*/[];
const OFFLINE_PAGE = '<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>GESTLOK · Sin conexión</title><body style="font:16px system-ui;margin:0;display:grid;place-items:center;min-height:100vh;background:#f4f7fb;color:#0f2d44"><main style="max-width:420px;padding:24px;text-align:center"><h1 style="font-size:22px">Sin conexión</h1><p>Esta sección todavía no se descargó en este equipo. Abrila una vez con internet y después vas a poder usarla sin conexión.</p><p><a href="__HOME__" style="color:#0f2d44;font-weight:700">Volver al inicio de GESTLOK</a></p></main></body></html>';
self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(SHELL.map(path => new Request(path, {cache:'reload'})));
    const html = await (await cache.match(BASE + '/')).text();
    const assets = [...html.matchAll(/(?:src|href)="([^" ]*\/_next\/static\/[^" ]+)"/g)].map(m => m[1].replaceAll('&amp;', '&'));
    await cache.addAll([...new Set(assets)]);
    // Empleados: de a tandas y sin frenar la instalación si algún archivo falla.
    const extra = EMPLEADOS.map(path => BASE + path);
    for (let i = 0; i < extra.length; i += 20) {
      await Promise.allSettled(extra.slice(i, i + 20).map(u => cache.add(new Request(u, {cache:'reload'}))));
    }
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith(PREFIX) && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;
  const same = url.origin === self.location.origin;
  // «Administrar a los empleados»: primero la red; sin conexión, la copia guardada (también la navegación interna de Next).
  if (same && url.pathname.startsWith(BASE + '/empleados/')) {
    e.respondWith(fetch(req).then(res => {
      if (res.ok && !url.searchParams.has('_rsc') && !req.headers.has('RSC')) {
        const copy = res.clone(); e.waitUntil(caches.open(CACHE).then(c => c.put(new Request(url.origin + url.pathname), copy)));
      }
      return res;
    }).catch(async () => (await caches.match(url.origin + url.pathname, {ignoreSearch:true})) ||
      (req.mode === 'navigate' ? new Response(OFFLINE_PAGE.replace('__HOME__', BASE + '/'), {headers:{'content-type':'text/html; charset=utf-8'}}) : Response.error())));
    return;
  }
  if (req.headers.has('RSC') || url.searchParams.has('_rsc')) return;
  const allowed = same && (SHELL.includes(url.pathname) || ['/_next/static/', '/icons/', '/img/', '/plantillas/'].map(p => BASE + p).some(p => url.pathname.startsWith(p)));
  const cdn = ['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname);
  if (!allowed && !cdn) return;
  e.respondWith(fetch(req).then(res => {
    if (res.ok || res.type === 'opaque') {
      const copy = res.clone(); e.waitUntil(caches.open(CACHE).then(c => c.put(req, copy)));
    }
    return res;
  }).catch(async () => (await caches.match(req)) || (same && SHELL.includes(url.pathname) && await caches.match(url.origin + url.pathname)) || Response.error()));
});

// Recepción preparada. No hay envíos automáticos ni programación activa.
self.addEventListener('push', event => {
  event.waitUntil((async () => {
    if (!event.data) return;
    let payload;
    try { payload=event.data.json(); } catch { return; }
    if (!payload || typeof payload !== 'object') return;
    const title=String(payload.title||'GestLok').slice(0,100);
    const body=String(payload.body||'').slice(0,240);
    const route=typeof payload.path==='string' && /^\/(?!\/)[a-zA-Z0-9/_-]{0,120}$/.test(payload.path)
      ? payload.path : '/';
    await self.registration.showNotification(title,{
      body,icon:BASE+'/icons/gestlok-app-v2-192.png',
      badge:BASE+'/icons/gestlok-favicon-v2-32.png',
      tag:String(payload.tag||'gestlok').slice(0,70),
      data:{url:BASE+route,
        local:typeof payload.local==='string' && /^[A-Za-z0-9_-]{1,80}$/.test(payload.local)?payload.local:'',
        view:['chat','proveedores','vencimientos','avisos'].includes(payload.view)?payload.view:'inicio'}
    });
  })());
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const url=new URL(event.notification.data?.url||BASE+'/',self.location.origin);
  if(url.origin!==self.location.origin)return;
  event.waitUntil((async()=>{
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    const opened=windows.find(w=>new URL(w.url).origin===url.origin && new URL(w.url).pathname.startsWith(BASE+'/'));
    const local=event.notification.data?.local,view=event.notification.data?.view;
    if(opened){
      await opened.focus();
      opened.postMessage({type:'gestlok-push-open',local,view});
      return;
    }
    if(local && view){url.searchParams.set('gl_local',local);url.searchParams.set('gl_view',view);}
    await self.clients.openWindow(url.href);
  })());
});

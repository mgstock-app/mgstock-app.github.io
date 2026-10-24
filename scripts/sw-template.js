/* Generated into public/sw.js before each build. Never clear another app's cache. */
const BASE = new URL('.', self.location.href).pathname.replace(/\/$/, '');
const PREFIX = `mgstock:${BASE || '/'}:`;
const CACHE = PREFIX + '__BUILD_VERSION__';
const SHELL = ['/', '/stock/app.js', '/stock/gestlok-updates.js', '/stock/gestlok-push.js', '/stock/auth.js', '/stock/ingreso.js', '/stock/config.js', '/vendor/supabase.js', '/manifest.webmanifest', '/icons/gestlok.svg', '/icons/gestlok-wordmark.svg', '/icons/gestlok-app-v2-192.png', '/icons/gestlok-app-v2-512.png', '/icons/gestlok-maskable-v2-512.png', '/icons/gestlok-apple-v2-180.png', '/icons/gestlok-favicon-v2-32.png'].map(path => BASE + path);
self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(SHELL);
    const html = await (await cache.match(BASE + '/')).text();
    const assets = [...html.matchAll(/(?:src|href)="([^" ]*\/_next\/static\/[^" ]+)"/g)].map(m => m[1].replaceAll('&amp;', '&'));
    await cache.addAll([...new Set(assets)]);
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith(PREFIX) && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || req.headers.has('RSC') || url.searchParams.has('_rsc')) return;
  const same = url.origin === self.location.origin;
  const allowed = same && (SHELL.includes(url.pathname) || ['/_next/static/', '/icons/', '/img/'].map(p => BASE + p).some(p => url.pathname.startsWith(p)));
  const cdn = ['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname);
  if (!allowed && !cdn) return;
  e.respondWith(fetch(req).then(res => {
    if (res.ok || res.type === 'opaque') {
      const copy = res.clone(); e.waitUntil(caches.open(CACHE).then(c => c.put(req, copy)));
    }
    return res;
  }).catch(async () => (await caches.match(req)) || Response.error()));
});


/* Notificaciones visibles, solo para dispositivos que dieron permiso explícito. */
self.addEventListener('push', event => {
  let payload={};
  try {payload=event.data?.json() || {};} catch {payload={title:'GestLok',body:'Tenés una novedad en tu negocio.'};}
  const title=String(payload.title || 'GestLok').slice(0,100);
  const body=String(payload.body || 'Hay una actualización para revisar.').slice(0,260);
  event.waitUntil(self.registration.showNotification(title,{
    body,icon:BASE+'/icons/gestlok-app-v2-192.png',
    badge:BASE+'/icons/gestlok-favicon-v2-32.png',
    tag: typeof payload.tag==='string'?payload.tag.slice(0,100):'gestlok-alert',
    data:{path:BASE+'/'},renotify:false
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const path=BASE+'/';
  event.waitUntil((async()=>{
    const windows=await clients.matchAll({type:'window',includeUncontrolled:true});
    const current=windows.find(w=>new URL(w.url).origin===self.location.origin);
    if(current){await current.focus();return;}
    await clients.openWindow(path);
  })());
});

import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import {releaseAudience,fileAudience,TENANTS} from '../scripts/pwa-release-scope.mjs';
const read = p => readFileSync(p, 'utf8');
function fixture(controlled = true, scope = null, tenant = TENANTS.miGusto) {
  const handlers = {}, elements = [];
  let reloads = 0, currentTenant = tenant, channel;
  const element = () => ({style:{},children:[],listeners:{},setAttribute(){},append(...c){this.children.push(...c);},addEventListener(n,f){this.listeners[n]=f;}});
  const controller = scope == null ? {} : {
    postMessage(message) { channel.port1.onmessage({data:{type:message.type,audience:scope}}); }
  };
  const navigator = {onLine:true,serviceWorker:{controller:controlled?controller:null,addEventListener(n,f){handlers[n]=f;}}};
  const window = {location:{reload(){reloads++;}},GestLokNavContext:()=>({tenant:currentTenant})};
  const document = {createElement:element,body:{appendChild(e){elements.push(e);}}};
  const MessageChannel = scope == null ? undefined : class {
    constructor(){channel=this;this.port1={onmessage:null,close(){}};this.port2={};}
  };
  vm.runInNewContext(read('public/stock/gestlok-pwa-update.js'), {
    navigator,window,document,MessageChannel,setTimeout:()=>123,clearTimeout(){}
  });
  return {handlers,elements,navigator,window,reloads:()=>reloads,setTenant:x=>{currentTenant=x;}};
}
test('Una instalación nueva no pide recargar; una actualización avisa solo una vez', () => {
  const first=fixture(false);first.handlers.controllerchange();assert.equal(first.elements.length,0);
  first.handlers.controllerchange();assert.equal(first.elements.length,1);
  first.handlers.controllerchange();assert.equal(first.elements.length,1);
  assert.equal(first.reloads(),0);
});
test('Actualizar requiere una elección explícita, conexión y ningún cambio pendiente', () => {
  const f=fixture();f.handlers.controllerchange();
  const [message,button]=f.elements[0].children;
  button.listeners.click();assert.equal(f.reloads(),0);
  assert.match(message.textContent,/Guardá/);
  f.window.GestLokPWAUpdate.attach(()=>false);
  f.navigator.onLine=false;button.listeners.click();assert.equal(f.reloads(),0);
  f.navigator.onLine=true;button.listeners.click();assert.equal(f.reloads(),1);
});
test('Todos los controladores del arranque están disponibles en la caché sin conexión', () => {
  const runtime=read('components/stock-runtime.tsx'), worker=read('scripts/sw-template.js');
  for(const [,asset] of runtime.matchAll(/"(\/(?:stock|vendor)\/[^"?]+\.js)(?:\?[^"\n]*)?"/g)) {
    assert.ok(worker.includes("'"+asset+"'"),asset);
  }
});
test('La PWA puede recuperar app.js versionado sin conexión, sin interceptar datos privados',async()=>{
  const handlers={},lookups=[];
  const cached=new Response('controller');
  vm.runInNewContext(read('scripts/sw-template.js'),{URL,Response,fetch:async()=>{throw Error('offline');},self:{
    location:{href:'https://example.com/sw.js',origin:'https://example.com'},addEventListener(n,f){handlers[n]=f;}
  },caches:{match:async key=>{lookups.push(key);return key==='https://example.com/stock/app.js'?cached:undefined;}}});
  let result;
  handlers.fetch({request:{url:'https://example.com/stock/app.js?rev=new',method:'GET',headers:new Headers()},respondWith(p){result=p;}});
  assert.equal(await (await result).text(),'controller');
  assert.equal(lookups.length,2);
});

test('Administrar a los empleados se abre sin conexión desde la copia guardada, también con parámetros', async () => {
  const handlers = {}, stored = new Map([['https://example.com/empleados/horarios/', 'horarios'], ['https://example.com/empleados/horarios/index.txt', 'rsc']]);
  vm.runInNewContext(read('scripts/sw-template.js'), {URL, Response, Request, fetch: async () => { throw Error('offline'); }, self: {
    location: {href: 'https://example.com/sw.js', origin: 'https://example.com'}, addEventListener(n, f) { handlers[n] = f; }
  }, caches: {match: async (key) => stored.has(String(key)) ? new Response(stored.get(String(key))) : undefined}});
  const ask = async (url, extra = {}) => { let p; handlers.fetch({request: {url, method: 'GET', mode: extra.mode || 'cors', headers: new Headers(extra.headers || {})}, respondWith(x) { p = x; }, waitUntil() {}}); return p && (await p); };
  assert.equal(await (await ask('https://example.com/empleados/horarios/?empresa=1', {mode: 'navigate'})).text(), 'horarios');
  assert.equal(await (await ask('https://example.com/empleados/horarios/index.txt?_rsc=abc', {headers: {RSC: '1'}})).text(), 'rsc');
  const missing = await ask('https://example.com/empleados/nunca-abierta/', {mode: 'navigate'});
  assert.match(await missing.text(), /todavía no se descargó/);
});

test('cada publicación lista las páginas de Empleados en el service worker', async () => {
  const {mkdtempSync, mkdirSync, writeFileSync, readFileSync: rf} = await import('node:fs');
  const {join} = await import('node:path');
  const {tmpdir} = await import('node:os');
  const {execFileSync} = await import('node:child_process');
  const out = mkdtempSync(join(tmpdir(), 'gl-sw-'));
  mkdirSync(join(out, 'empleados/horarios'), {recursive: true});
  mkdirSync(join(out, 'empleados/_next/static/chunks'), {recursive: true});
  writeFileSync(join(out, 'empleados/index.html'), '<html></html>');
  writeFileSync(join(out, 'empleados/horarios/index.html'), '<html></html>');
  writeFileSync(join(out, 'empleados/horarios/index.txt'), 'rsc');
  writeFileSync(join(out, 'empleados/_next/static/chunks/a.js'), '1');
  writeFileSync(join(out, 'sw.js'), read('scripts/sw-template.js'));
  execFileSync(process.execPath, ['scripts/sw-precache.mjs', out]);
  const sw = rf(join(out, 'sw.js'), 'utf8');
  for (const p of ['/empleados/', '/empleados/horarios/', '/empleados/horarios/index.txt', '/empleados/_next/static/chunks/a.js']) assert.ok(sw.includes(JSON.stringify(p)), p);
  assert.ok(!sw.includes('__EMPLEADOS_PRECACHE__'));
});

test('Cambios de Molino y ZAYRO no muestran Actualizar en Mi Gusto',()=>{
  for(const other of [TENANTS.molino,TENANTS.zayro]){
    const f=fixture(true,[other],TENANTS.miGusto);
    f.handlers.controllerchange();
    assert.equal(f.elements.length,0,'Mi Gusto no debe ver novedades de '+other);
    f.handlers.controllerchange();
    assert.equal(f.elements.length,0);
  }
});
test('El aviso sí llega a la empresa afectada, incluso si el contexto se carga después',()=>{
  const f=fixture(true,[TENANTS.molino],null);
  f.handlers.controllerchange();
  assert.equal(f.elements.length,0);
  f.setTenant(TENANTS.miGusto);f.window.GestLokPWAUpdate.refresh();
  assert.equal(f.elements.length,0);
  f.setTenant(TENANTS.molino);f.window.GestLokPWAUpdate.refresh();
  assert.equal(f.elements.length,1);
  f.window.GestLokPWAUpdate.refresh();
  assert.equal(f.elements.length,1,'Nunca duplica el aviso');
});
test('Los cambios globales siguen apareciendo y los de infraestructura sin impacto no molestan',()=>{
  const shared=fixture(true,['*'],TENANTS.miGusto);
  shared.handlers.controllerchange();assert.equal(shared.elements.length,1);
  const silent=fixture(true,[],TENANTS.miGusto);
  silent.handlers.controllerchange();assert.equal(silent.elements.length,0);
});
test('La clasificación separa actualizaciones por empresa y conserva alertas de seguridad',()=>{
  assert.deepEqual(fileAudience('public/stock/gestlok-molino-pya.css'),[TENANTS.molino]);
  assert.deepEqual(fileAudience('public/stock/gestlok-zayro-admin.js'),[TENANTS.zayro]);
  assert.deepEqual(fileAudience('public/stock/mi-gusto-cierre-online.js'),[TENANTS.miGusto]);
  assert.deepEqual(releaseAudience(['public/stock/gestlok-molino-pya.css','tests/el-molino-pedidosya.test.mjs']),[TENANTS.molino]);
  assert.deepEqual(releaseAudience(['public/stock/gestlok-zayro-admin.js','public/stock/gestlok-molino-pya.js']),[TENANTS.molino,TENANTS.zayro].sort());
  assert.deepEqual(releaseAudience(['docs/tiendanube-integration-plan.md']),[]);
  assert.deepEqual(releaseAudience(['public/stock/gestlok-pwa-update.js','scripts/version-cache.mjs']),[]);
  assert.deepEqual(releaseAudience(['scripts/sw-template.js']),['*']);
  assert.deepEqual(releaseAudience(['public/stock/app.js']),['*']);
});
test('Un cambio aislado de arranque de Molino no activa el cartel en Mi Gusto',()=>{
  const patches={
    'components/stock-runtime.tsx':'+      if (!visitor) await load("/stock/gestlok-molino-pya.js?rev=pedidosya-20261110");',
    'app/layout.tsx':'+import "./gestlok-molino-pya.css";'
  };
  assert.deepEqual(releaseAudience(Object.keys(patches),patches),[TENANTS.molino]);
});
test('El enganche de PWAUpdate en el inicio no implica cambio funcional de otros locales',()=>{
  const patches={'public/stock/app.js':'+  // Cuando llega el tenant real, comprobar si el aviso PWA corresponde a esta empresa.\n+  window.GestLokPWAUpdate?.refresh?.();'};
  assert.deepEqual(releaseAudience(['public/stock/app.js'],patches),[]);
  assert.match(read('public/stock/app.js'),/GestLokPWAUpdate\?\.refresh\?\.\(\)/);
  assert.match(read('scripts/sw-template.js'),/gestlok-update-audience/);
  assert.match(read('scripts/version-cache.mjs'),/releaseAudience/);
});

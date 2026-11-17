import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import {releaseAudience,fileAudience,TENANTS,LOCAL_AUDIENCE} from '../scripts/pwa-release-scope.mjs';
const read = p => readFileSync(p, 'utf8');
function fixture(controlled = true, scope = null, tenant = TENANTS.miGusto, local = 'munro') {
  const handlers = {}, elements = [];
  let reloads = 0, currentTenant = tenant, currentLocal = local, channel, timerId = 0;
  const intervals=new Map();
  const element = () => ({style:{},children:[],listeners:{},removed:false,setAttribute(){},append(...c){this.children.push(...c);},addEventListener(n,f){this.listeners[n]=f;},remove(){this.removed=true;}});
  const controller = scope == null ? {} : {
    postMessage(message) { channel.port1.onmessage({data:{type:message.type,audience:scope}}); }
  };
  const navigator = {onLine:true,serviceWorker:{controller:controlled?controller:null,addEventListener(n,f){handlers[n]=f;}}};
  const window = {location:{reload(){reloads++;}},GestLokNavContext:()=>({tenant:currentTenant,local:currentLocal})};
  const document = {createElement:element,body:{appendChild(e){elements.push(e);}}};
  const MessageChannel = scope == null ? undefined : class {
    constructor(){channel=this;this.port1={onmessage:null,close(){}};this.port2={};}
  };
  vm.runInNewContext(read('public/stock/gestlok-pwa-update.js'), {
    navigator,window,document,MessageChannel,setTimeout:()=>123,clearTimeout(){},
    setInterval:fn=>{const id=++timerId;intervals.set(id,fn);return id;},
    clearInterval:id=>intervals.delete(id)
  });
  return {handlers,elements,navigator,window,reloads:()=>reloads,setTenant:x=>{currentTenant=x;},setLocal:x=>{currentLocal=x;},replaceController:()=>{navigator.serviceWorker.controller={...controller};},tick:()=>{for(const fn of [...intervals.values()])fn();},timerCount:()=>intervals.size};
}
test('Una instalación nueva no pide recargar; una actualización verificada avisa solo una vez', () => {
  const first=fixture(false,['*']);first.handlers.controllerchange();assert.equal(first.elements.length,0);
  const updated=fixture(true,['*']);
  updated.handlers.controllerchange();assert.equal(updated.elements.length,1);
  updated.handlers.controllerchange();assert.equal(updated.elements.length,1);
  assert.equal(updated.reloads(),0);
});
test('Actualizar requiere una elección explícita, conexión y ningún cambio pendiente', () => {
  const f=fixture(true,['*']);f.handlers.controllerchange();
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
  assert.deepEqual(fileAudience('public/stock/mi-gusto-conteo.js'),[TENANTS.miGusto]);
  assert.deepEqual(fileAudience('app/mi-gusto-conteo.css'),[TENANTS.miGusto]);
  assert.deepEqual(fileAudience('public/stock/munro-motos.js'),[LOCAL_AUDIENCE.munro]);
  assert.deepEqual(fileAudience('public/stock/munro-daily.js'),[LOCAL_AUDIENCE.munro]);
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
test('El actualizador revisa el tenant sin modificar el controlador principal protegido',()=>{
  assert.deepEqual(releaseAudience(['public/stock/app.js']),['*']);
  assert.match(read('public/stock/app.js'),/window\.GestLokNavContext=/);
  assert.match(read('public/stock/gestlok-pwa-update.js'),/setTimeout\(\(\) => \{ retryQueued = false; checkAudience\(\); \}, 1800\)/);
  assert.match(read('scripts/sw-template.js'),/gestlok-update-audience/);
  assert.match(read('scripts/version-cache.mjs'),/releaseAudience/);
});

test('Una actualización de Conteo Munro no muestra Actualizar en Torcuato ni otras empresas',()=>{
 const s=[LOCAL_AUDIENCE.munro];
 for(const [tenant,local] of [[TENANTS.miGusto,'torcuato'],[TENANTS.molino,'acassuso'],
                                [TENANTS.molino,'san-isidro'],[TENANTS.zayro,'']]){
  const f=fixture(true,s,tenant,local);
  f.handlers.controllerchange();
  assert.equal(f.elements.length,0,tenant+'/'+local+' no tuvo cambios');
 }
 const munro=fixture(true,s,TENANTS.miGusto,'munro');
 munro.handlers.controllerchange();
 assert.equal(munro.elements.length,1,'Munro recibe su actualización real');
});
test('Al cambiar de Munro a Torcuato se retira el aviso; solo vuelve en Munro',()=>{
 const f=fixture(true,[LOCAL_AUDIENCE.munro],TENANTS.miGusto,'munro');
 f.handlers.controllerchange();
 assert.equal(f.elements.length,1);
 f.setLocal('torcuato');f.window.GestLokPWAUpdate.refresh();
 assert.equal(f.elements[0].removed,true,'No deja un aviso falso al entrar a Torcuato');
 f.setLocal('munro');f.window.GestLokPWAUpdate.refresh();
 assert.equal(f.elements.length,2,'La actualización sigue pendiente para Munro');
 assert.equal(f.elements[1].removed,false);
});
test('El cartel se retira automáticamente al cambiar a Torcuato, aun sin llamar refresh',()=>{
 const f=fixture(true,[LOCAL_AUDIENCE.munro],TENANTS.miGusto,'munro');
 f.handlers.controllerchange();
 assert.equal(f.elements.length,1);
 assert.equal(f.timerCount(),1);
 f.setLocal('torcuato');f.tick();
 assert.equal(f.elements[0].removed,true);
 assert.equal(f.timerCount(),0,'No queda una comprobación en segundo plano');
});
test('Deslizar descarta el cartel sin volver a mostrarlo hasta la próxima versión',()=>{
 const f=fixture(true,[LOCAL_AUDIENCE.munro],TENANTS.miGusto,'munro');
 f.handlers.controllerchange();
 const banner=f.elements[0];
 banner.listeners.touchstart({touches:[{clientX:140,clientY:80}]});
 banner.listeners.touchend({changedTouches:[{clientX:30,clientY:84}]});
 assert.equal(banner.removed,true);
 assert.equal(f.timerCount(),0);
 f.window.GestLokPWAUpdate.refresh();
 assert.equal(f.elements.length,1,'No reabrir un aviso que la persona descartó');
 f.handlers.controllerchange();
 assert.equal(f.elements.length,1,'Un evento duplicado del mismo worker no cuenta como nueva versión');
 f.replaceController();f.handlers.controllerchange();
 assert.equal(f.elements.length,2,'Nueva publicación relevante se puede anunciar');
});
test('Worker anterior o sin audiencia no causa avisos globales inventados',()=>{
 const f=fixture(true,null,TENANTS.molino,'acassuso');
 f.handlers.controllerchange();assert.equal(f.elements.length,0);
 const silent=fixture(true,[],TENANTS.miGusto,'munro');
 silent.handlers.controllerchange();assert.equal(silent.elements.length,0);
});
test('Diff real de Conteo en una línea con comercio compartido avisa SOLO a Munro',()=>{
 const patch=[
   '@@ -20,7 +20,7 @@ function preloadStartupScripts(visitor: boolean) {',
   '   const common = [',
   '-    "/stock/gestlok-commerce.js", "/stock/mi-gusto-conteo.js?rev=old",',
   '+    "/stock/gestlok-commerce.js", "/stock/mi-gusto-conteo.js?rev=new",',
   '       if (!visitor) await load("/stock/mi-gusto-conteo.js?rev=old");',
   '-      if (!visitor) await load("/stock/mi-gusto-conteo.js?rev=old");',
   '+      if (!visitor) await load("/stock/mi-gusto-conteo.js?rev=new");'
 ].join('\n');
 assert.deepEqual(releaseAudience(['components/stock-runtime.tsx'],{'components/stock-runtime.tsx':patch}),[TENANTS.miGusto]);
 assert.deepEqual(releaseAudience(['components/stock-runtime.tsx','public/stock/mi-gusto-conteo.js','tests/munro-conteo.test.mjs'],
   {'components/stock-runtime.tsx':patch}),[TENANTS.miGusto]);
});
test('Cambios realmente compartidos siguen notificando a todos; cambios de backend sin pantalla no',()=>{
 const diff='-      if (!visitor) await load("/stock/app.js?rev=v1");\n'+
            '+      if (!visitor) await load("/stock/app.js?rev=v2");';
 assert.deepEqual(releaseAudience(['components/stock-runtime.tsx'],{'components/stock-runtime.tsx':diff}),['*']);
 assert.deepEqual(releaseAudience(['public/stock/app.js']),['*']);
 assert.deepEqual(releaseAudience(['scripts/sw-template.js']),['*']);
 assert.deepEqual(releaseAudience(['supabase/migrations/20261115_munro.sql','tests/pwa-update.test.mjs']),[]);
 assert.deepEqual(releaseAudience(['public/stock/gestlok-pwa-update.js','scripts/pwa-release-scope.mjs','scripts/version-cache.mjs']),[]);
});
test('No inferir local de cambios de lógica que no son importaciones ni referencias',()=>{
 assert.deepEqual(releaseAudience(['components/stock-runtime.tsx'],
   {'components/stock-runtime.tsx':'-  if (visitor) return;\n+  if (!visitor) return;'}),['*']);
 assert.deepEqual(releaseAudience(['components/stock-runtime.tsx'],{}),['*']);
 assert.deepEqual(releaseAudience(['public/stock/mi-gusto-cierre-online.js']),[TENANTS.miGusto]);
});

test('El único cambio de orden Staff de Munro no avisa a Torcuato ni a otras empresas',()=>{
 const lines=read('public/stock/app.js').split('\n');
 const newTop=lines.find(x=>x.startsWith('  const html = `')&&x.includes('snav-loc snav-back')&&x.includes('${pagosDiarios ? '));
 const nested=lines.find(x=>x.startsWith('    (puedeVerStaffMunro() ? '));
 const newGuard=lines.find(x=>x.includes('if (!puedeVerMotos() && !puedeVerStaffMunro()'));
 assert.ok(newTop&&nested&&newGuard);
 const oldStaff=nested.replace(/^    \(puedeVerStaffMunro\(\) \? /,'${staffMunro ? ').replace(/'\) \+$/, "'}");
 const oldTop=newTop.replace('${pagosDiarios ? ',oldStaff+'${pagosDiarios ? ');
 const oldGuard=newGuard.replace('!puedeVerStaffMunro() && ','');
 const patch=['-  const staffMunro = puedeVerStaffMunro();','-'+oldTop,'+'+newTop,'+'+nested,'-'+oldGuard,'+'+newGuard].join('\n');
 assert.deepEqual(releaseAudience(['public/stock/app.js','tests/gerente-inicio.test.mjs','scripts/version-cache.mjs'],{'public/stock/app.js':patch}),[LOCAL_AUDIENCE.munro]);
 assert.deepEqual(releaseAudience(['public/stock/app.js'],{'public/stock/app.js':patch+'\n+  console.log("extra");'}),['*'],'cualquier otro cambio de app.js mantiene aviso compartido');
});

test('Cambios en Staff semanal de Munro no generan carteles falsos en Torcuato ni otras empresas',()=>{
 const paths=[
  'modules/empleados/components/schedules/MunroWeeklySchedule.tsx',
  'modules/empleados/components/schedules/MunroEmployeeLinks.tsx',
  'modules/empleados/components/schedules/EmployeeMunroWeeklySummary.tsx',
  'modules/empleados/components/schedules/munro-employee-links.css',
  'modules/empleados/components/schedules/employee-munro-weekly-summary.css',
  'modules/empleados/components/schedules/munro-weekly.css',
  'modules/empleados/features/schedules/munro-model.ts',
  'supabase/migrations/20261116094500_munro_staff_cierre_semanal.sql'
 ];
 assert.deepEqual(releaseAudience(paths),[LOCAL_AUDIENCE.munro]);
 assert.deepEqual(releaseAudience(
  ['modules/empleados/components/schedules/EmployeeScheduleLink.tsx'],
  {'modules/empleados/components/schedules/EmployeeScheduleLink.tsx':
   '+import { EmployeeMunroWeeklySummary } from "./EmployeeMunroWeeklySummary";\n+    {user.local_id==="munro"&&<EmployeeMunroWeeklySummary />}'}
 ),[LOCAL_AUDIENCE.munro]);
 assert.deepEqual(releaseAudience(['modules/empleados/components/schedules/HorariosHub.tsx']),['*'],
   'otros componentes compartidos no deben clasificar erróneamente como Munro');
});

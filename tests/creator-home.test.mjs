import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source = readFileSync('public/stock/gestlok-creator-home.js', 'utf8');
const DASH = {
  scope: 'creator_dashboard', generated_at: '2026-10-26T03:46:27Z',
  totals: {companies: 2, companies_new_week: 1, users: 9, users_with_login: 6, users_never: 3, users_new_week: 9, locals: 3, employees: 7, employees_new_week: 3, employees_pending: 0, modules_enabled: 2, audit: 3},
  roles: {creadora: 1, dueno: 3, gerente: 4, editor: 1, lectura: 0},
  employees_roles: {owner: 4, manager: 2, employee: 0, gestlok_gerentes: 5},
  series: [{d: '2026-09-26', empresas: 0, usuarios: 0, empleados: 0}, {d: '2026-10-26', empresas: 2, usuarios: 9, empleados: 7}],
  period: {companies: 2, users: 9, employees: 7, modules: 1},
  recent_companies: [{tenant_id: 't-2', name: 'Perfumes <b>', created_at: '2026-10-25T04:55:45Z', locals: 1, people: 1, employees_module: true}, {tenant_id: 't-1', name: 'Mi Gusto', created_at: '2026-10-24T06:16:50Z', locals: 2, people: 8, employees_module: true}],
  activity: [{at: '2026-10-26T03:31:42Z', kind: 'audit', what: 'employee_space_created', who: null, company: 'Perfumes'}, {at: '2026-10-26T03:22:11Z', kind: 'login', what: 'login', who: 'kmu***@gmail.com', company: 'Mi Gusto'}],
  system: {accounts: 6, confirmed_accounts: 6, verified_links: 2, editing_open: false, support_open: false}
};
function load(rpc, {creadora = true, permanent = false, tenant = 't-1', existingStore, molinoOpen} = {}) {
  const listeners = {}, calls = [], argsLog = [], store = existingStore || new Map(), notices = [], opened = [];
  let renders = 0, reloads = 0, invalidations = 0;
  const window = {
    GestLokCreatorMode: {state: () => ({permanent})},
    GestLokMolino: {open: tab => { opened.push(tab); molinoOpen?.(tab); }},
    GestLokOffline: {pending: async () => 0, invalidateContext: async () => { invalidations++; }},
    location: {reload(){reloads++;}},
    sessionStorage: {getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: k => store.delete(k)},
    scrollTo() {},
    GestLokSupabase: {rpc: async (fn,args) => { calls.push(fn); argsLog.push(args); return rpc(fn,args); }}
  };
  const document = {addEventListener(n, f) { listeners[n] = f; }, visibilityState: 'visible'};
  vm.runInNewContext(source, {window, document, setInterval: () => 0, clearInterval() {}, Date, queueMicrotask});
  const h = window.GestLokCreatorHome;
  h.attach({S: {me: {email: 'kmu15lopez@gmail.com', tenant_id: tenant}}, isCreadora: () => creadora,
    render: () => { renders++; }, toast: (msg,bad) => { notices.push({msg,bad}); }});
  return {h, calls, argsLog, listeners, renders: () => renders, store, window, notices,
    opened, reloads: () => reloads, invalidations: () => invalidations};
}
const tick = () => new Promise(r => setTimeout(r, 0));
test('Quien no es creadora nunca consulta el resumen ni ve el panel', async () => {
  const r = load(async () => ({data: DASH, error: null}), {creadora: false});
  assert.equal(r.h.mode(), 'off');
  await tick();
  assert.equal(r.calls.length, 0);
});
test('La primera consulta carga el resumen, pasa a listo y vuelve a dibujar', async () => {
  const r = load(async () => ({data: DASH, error: null}));
  assert.equal(r.h.mode(), 'loading');
  await tick(); await tick();
  assert.deepEqual(r.calls, ['gestlok_creator_dashboard']);
  assert.equal(r.h.mode(), 'ready');
  assert.ok(r.renders() >= 1);
});
test('Si el servidor rechaza o responde algo inesperado, se muestra el panel anterior (falla cerrada)', async () => {
  for (const reply of [{data: null, error: {code: '42501'}}, {data: {scope: 'otra_cosa', totals: {}, series: []}, error: null}, {data: {scope: 'creator_dashboard'}, error: null}]) {
    const r = load(async () => reply);
    r.h.mode(); await tick(); await tick();
    assert.equal(r.h.mode(), 'off');
  }
});
test('El inicio muestra los datos reales, escapa textos y no inventa planes ni suscripciones', async () => {
  const r = load(async () => ({data: DASH, error: null}));
  r.h.mode(); await tick(); await tick();
  const html = r.h.view({pending: 2, parts: {}});
  for (const t of ['Empresas activas', 'Administración y herramientas', 'Mi Gusto', 'Usuarios y accesos', 'Empleados y horarios']) assert.ok(html.includes(t), t);
  assert.ok(!/Suscripcion|Planes|Enterprise|Profesional/i.test(html));
  assert.ok(html.includes('Perfumes &lt;b&gt;') && !html.includes('Perfumes <b>'));
  assert.ok(!html.includes('Crecimiento de GESTLOK'));
  assert.ok(!html.includes('<h2>Mis empresas</h2>') && !html.includes('<h2>Mis locales</h2>'));
  assert.ok(!html.includes('Tu empresa'));
});
test('Las pestañas muestran el contenido existente y recuerdan la elegida', async () => {
  const r = load(async () => ({data: DASH, error: null}));
  r.h.mode(); await tick(); await tick();
  const parts = {companies: '<i>REGISTRO</i>', users: '<i>USUARIOS</i>', locales: '<i>LOCALES</i>', tools: '<i>HERRAMIENTAS</i>', prepare: '<i>PREPARAR</i>'};
  r.listeners.click({preventDefault() {}, target: {closest: sel => sel === '[data-ch-tab]' ? {dataset: {chTab: 'empresas'}} : null}});
  let html = r.h.view({pending: 0, parts});
  assert.ok(html.includes('REGISTRO') && html.includes('PREPARAR') && !html.includes('Crecimiento de GESTLOK'));
  assert.equal(r.store.get('gestlok-admin-tab'), 'empresas');
  r.h.setTab('empleados');
  html = r.h.view({pending: 0, parts});
  assert.ok(html.includes('Abrir Administración de empleados') && html.includes('href="empleados/"'));
  r.h.setTab('no-existe');
  assert.equal(r.h.tab(), 'empleados');
});
test('Alertas del estado: edición abierta o consulta abierta se marcan para revisar', async () => {
  const r = load(async () => ({data: {...DASH, system: {...DASH.system, editing_open: true, support_open: true}}, error: null}));
  r.h.mode(); await tick(); await tick();
  const html = r.h.view({pending: 0, parts: {}});
  assert.ok(html.includes('Administración y herramientas') && !html.includes('Para revisar'));
});

test('El panel central informa edición permanente sin pedir cerrarla', async () => {
 const r=load(async()=>({data:DASH,error:null}),{permanent:true});
 r.h.mode(); await tick(); await tick();
 const html=r.h.view({pending:0,parts:{}});
 assert.match(html,/Empresas activas/);
 assert.doesNotMatch(html,/Tu cuenta está en solo lectura|cerrala al terminar/);
});

test('Inicio multiempresa: todas las empresas y sus locales se muestran con el acceso autorizado correcto', async () => {
 const r=load(async()=>({data:DASH,error:null}));
 r.h.mode();await tick();await tick();
 const companies=[
  {tenant_id:'t-1',name:'Mi Gusto',locals:[{id:'munro',name:'Munro'},{id:'torcuato',name:'Don Torcuato'}]},
  {tenant_id:'t-2',name:'Perfumes',locals:[{id:'l-per',name:'Belisa Parfum'}]},
  {tenant_id:'t-3',name:'Empresa <script>',locals:[{id:'l-3',name:'Local <externo>'}]},
 ];
 const html=r.h.view({pending:0,parts:{},companies,quickLocals:'SOLO MI GUSTO'});
 for (const name of ['Empresas activas','Mis microapps','Caja','Stock Local','Precios','Sistema de Ventas','Plan Scanner','Horarios','Empleados']) {
  assert.ok(html.includes(name),name);
 }
 assert.ok(html.includes('data-act="local" data-id="munro"'));
 assert.ok(html.includes('data-act="local" data-id="torcuato"'));
 assert.ok(html.includes('data-company-local="l-per" data-company-tenant="t-2"'));
 assert.ok(html.includes('data-company-local="l-3" data-company-tenant="t-3"'));
 assert.ok(html.includes('Empresa &lt;script&gt;')&&!html.includes('Empresa <script>'));
 assert.ok(html.includes('Local &lt;externo&gt;'));
 assert.ok(!html.includes('SOLO MI GUSTO'),'No existe una sección separada de Mis locales');
 assert.ok(!html.includes('<h2>Mis locales</h2>'));
 assert.ok(!html.includes('<h2>Mis empresas</h2>'));
 assert.equal((html.match(/class="gl-ch-company-card"/g)||[]).length,3,'Una tarjeta por empresa');
 assert.equal((html.match(/class="gl-ch-company-locals"/g)||[]).length,3,'Cada empresa contiene sus locales');
 assert.equal((html.match(/class="gl-ch-company-local-grid"/g)||[]).length,3);
 assert.equal((html.match(/data-creator-company=/g)||[]).length,3);
 assert.equal((html.match(/class="gl-ch-quick-local gl-ch-company-local"/g)||[]).length,4,'Cada local tiene tarjeta y apertura propia');
 assert.equal((html.match(/class="gl-ch-microapp"/g)||[]).length,12);
 assert.match(html,/<h2>Operaciones entre sucursales<\/h2>/);
 for (const operation of ['precios','pedidos','envios','devoluciones','historial']) {
  assert.ok(html.includes('data-ch-molino="'+operation+'"'),'Falta operación '+operation);
 }
 assert.ok(html.includes('El Molino Café') && html.includes('San Isidro y Acassuso'));
 assert.ok(html.includes('data-ch-tab="locales"'),'Se conserva la navegación de Locales');
 assert.ok(html.includes('aria-label="Elegir local para Plan Scanner"'),'Scanner solicita local autorizado');
 assert.ok(!html.includes('class="gl-ch-logout"')&&!html.includes('class="gl-ch-out"'),'Cerrar sesión solo desde Mi perfil');
});


test('Solo creadora: empresa nueva genera automáticamente una tarjeta separada, sin cambiar otros paneles',async()=>{
 const r=load(async()=>({data:DASH,error:null}));
 r.h.mode();await tick();await tick();
 const companies=[
  {tenant_id:'t-1',name:'Mi Gusto',locals:[{id:'munro',name:'Munro'}]},
  {tenant_id:'t-2',name:'Perfumes',locals:[{id:'perfumes',name:'Tienda'}]},
  {tenant_id:'t-3',name:'El Molino Café',locals:[{id:'acassuso',name:'Acassuso'},{id:'sanisidro',name:'San Isidro'}]},
  {tenant_id:'t-4',name:'Empresa nueva',locals:[{id:'nuevo',name:'Sucursal nueva'}]}
 ];
 const html=r.h.view({pending:0,parts:{},companies});
 for(const c of companies){
   assert.ok(html.includes('data-creator-company="'+c.tenant_id+'"'),'Falta tarjeta: '+c.name);
   assert.ok(html.includes(c.name));
 }
 assert.equal((html.match(/class="gl-ch-company-card"/g)||[]).length,4);
 assert.equal((html.match(/class="gl-ch-quick-local gl-ch-company-local"/g)||[]).length,5);
 assert.ok(html.includes('data-company-local="nuevo" data-company-tenant="t-4"'));
 assert.ok(html.includes('data-act="local" data-id="munro"'));
 assert.doesNotMatch(html,/<h2>Mis locales<\/h2>|<h2>Mis empresas<\/h2>|Tu empresa/);
 assert.match(html,/<h2>Empresas activas<\/h2>/);
 assert.match(html,/class="gl-ch-company-grid"/);
});

test('El índice de empresas mantiene accesos correctos cuando no se cargó el detalle de locales',async()=>{
 const r=load(async()=>({data:DASH,error:null}));
 r.h.mode();await tick();await tick();
 const html=r.h.view({pending:0,parts:{},companies:[{tenant_id:'x',name:'Local en preparación',locals:2}]});
 assert.ok(html.includes('Local en preparación'));
 assert.ok(html.includes('data-ch-tab="locales"'));
 assert.ok(!html.includes('Sin locales registrados'));
});

const MOLINO = '6c8717ea-5f78-426b-9458-74a5dcac6e4e';
const clickMolino = (r, section) => r.listeners.click({
  preventDefault(){},
  target:{closest:sel=>sel==='[data-ch-molino]'?{dataset:{chMolino:section}}:null}
});
test('Operaciones entre sucursales abre la pestaña exacta sin cambiar empresa si ya es El Molino Café',async()=>{
 const r=load(async fn=>fn==='gestlok_creator_dashboard'?{data:DASH,error:null}:{error:{message:'No esperado'}},{tenant:MOLINO});
 r.h.mode();await tick();await tick();
 clickMolino(r,'envios');
 assert.deepEqual(r.opened,['envios']);
 assert.equal(r.reloads(),0);
 assert.deepEqual(r.calls,['gestlok_creator_dashboard']);
});
test('Desde la creadora se cambia de empresa solo con rol autorizado y se recupera la sección solicitada',async()=>{
 const authorized=async(fn,args)=>{
   if(fn==='gestlok_creator_dashboard')return {data:DASH,error:null};
   if(fn==='gestlok_my_role_contexts')return {data:[{tenant_id:MOLINO,role:'creadora'}],error:null};
   if(fn==='gestlok_choose_role_context')return {data:{tenant_id:MOLINO,role:'creadora'},error:null};
   return {error:{message:'Inesperado: '+fn}};
 };
 const r=load(authorized);
 r.h.mode();await tick();await tick();
 clickMolino(r,'devoluciones');await tick();await tick();
 assert.equal(r.reloads(),1);
 assert.equal(r.invalidations(),1);
 assert.equal(r.calls.includes('gestlok_my_role_contexts'),true);
 assert.equal(r.calls.includes('gestlok_choose_role_context'),true);
 assert.equal(r.argsLog[r.calls.indexOf('gestlok_choose_role_context')].p_tenant,MOLINO);
 assert.equal(r.store.get('gestlok-admin-tab'),'inicio');
 assert.equal(JSON.parse(r.store.get('gestlok:creator-molino-microapp:v1')).section,'devoluciones');
 const next=load(authorized,{tenant:MOLINO,existingStore:r.store});
 next.h.mode();await tick();await tick();
 next.h.view({pending:0,parts:{}});await tick();
 assert.deepEqual(next.opened,['devoluciones']);
 assert.equal(next.store.has('gestlok:creator-molino-microapp:v1'),false);
});
test('No se concede acceso a otras empresas, ni se abren enlaces no autorizados',async()=>{
 const r=load(async fn=>{
   if(fn==='gestlok_creator_dashboard')return {data:DASH,error:null};
   if(fn==='gestlok_my_role_contexts')return {data:[{tenant_id:MOLINO,role:'gerente'}],error:null};
   throw Error('No se debe elegir otro tenant');
 });
 r.h.mode();await tick();await tick();
 clickMolino(r,'precios');await tick();await tick();
 assert.equal(r.reloads(),0);
 assert.equal(r.invalidations(),0);
 assert.equal(r.calls.includes('gestlok_choose_role_context'),false);
 assert.ok(r.notices.some(x=>x.bad&&x.msg.includes('no tiene habilitado')));
 clickMolino(r,'funcion-inventada');await tick();
 assert.equal(r.calls.includes('gestlok_choose_role_context'),false);
 const other=load(async()=>({data:DASH,error:null}),{creadora:false,tenant:MOLINO});
 clickMolino(other,'envios');await tick();
 assert.deepEqual(other.opened,[]);
});

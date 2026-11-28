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
function load(rpc, {creadora = true, permanent = false, tenant = 't-1', existingStore, molinoOpen, email = 'kmu15lopez@gmail.com', fetcher, invoke, confirm=()=>true} = {}) {
  const listeners = {}, calls = [], argsLog = [], store = existingStore || new Map(), notices = [], opened = [];
  let renders = 0, reloads = 0, invalidations = 0;
  const window = {
    GestLokCreatorMode: {state: () => ({permanent})},
    GestLokHqTeamGapMs: 0,
    GestLokMolino: {open: tab => { opened.push(tab); molinoOpen?.(tab); }},
    GestLokOffline: {pending: async () => 0, invalidateContext: async () => { invalidations++; }},
    location: {reload(){reloads++;}},
    sessionStorage: {getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: k => store.delete(k)},
    scrollTo() {}, confirm,
    GestLokSupabase: {functions:{invoke},rpc: async (fn,args) => { calls.push(fn); argsLog.push(args); return rpc(fn,args); }}
  };
  const document = {addEventListener(n, f) { listeners[n] = f; }, visibilityState: 'visible'};
  const intervals=[];
  vm.runInNewContext(source, {window, document, setInterval: (fn,ms) => {intervals.push({fn,ms});return intervals.length;}, clearInterval() {}, Date, queueMicrotask, fetch: fetcher});
  const h = window.GestLokCreatorHome;
  h.attach({S: {me: {email, tenant_id: tenant}}, isCreadora: () => creadora,
    render: () => { renders++; }, toast: (msg,bad) => { notices.push({msg,bad}); }});
  return {h, calls, argsLog, listeners, intervals, document, renders: () => renders, store, window, notices,
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
 for (const name of ['Empresas activas','Mis microapps','Caja','Stock Local','Precios','Sistema de Ventas','Plan Scanner','Horarios','Empleados','GESTLOK Chat']) {
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
 assert.equal((html.match(/class="gl-ch-microapp"/g)||[]).length,13);
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

test('HQ retirado: no aparece, una pestaña vieja vuelve a Inicio y no se consulta el motor', async()=>{
  const existingStore=new Map([['gestlok-admin-tab','hq']]);
  let invocations=0, fetches=0;
  const r=load(async fn=>({data:fn==='gestlok_creator_dashboard'?DASH:[],error:null}),{
    existingStore, invoke:async()=>{invocations++;}, fetcher:async()=>{fetches++;}
  });
  r.h.mode();await tick();await tick();
  assert.equal(r.h.tab(),'inicio');
  assert.equal(existingStore.get('gestlok-admin-tab'),'inicio');
  const html=r.h.view({parts:{}});
  assert.doesNotMatch(html,/data-ch-tab="hq"|data-hq-office-slot|Oficina virtual GESTLOK HQ/);
  r.h.setTab('hq');assert.equal(r.h.tab(),'inicio');
  r.listeners.click({preventDefault(){},target:{closest:s=>s==='[data-ch-tab]'?{dataset:{chTab:'hq'}}:null}});
  assert.equal(r.h.tab(),'inicio');
  for(const interval of r.intervals)interval.fn();
  await r.window.GestLokHQPushLogout();await tick();
  assert.equal(invocations,0);assert.equal(fetches,0);
  assert.ok(!r.calls.some(fn=>fn.startsWith('gestlok_hq_')));
  r.h.setTab('contacto');assert.equal(r.h.tab(),'contacto');
  r.h.setTab('resenas');assert.equal(r.h.tab(),'resenas');
  r.h.setTab('wai');assert.equal(r.h.tab(),'wai');
});

test('La administradora tiene seis grupos, y las trece secciones conservan su destino', async () => {
  const r=load(async fn=>({data:fn==='gestlok_creator_dashboard'?DASH:[],error:null}));
  r.window.GestLokContactoWeb={unread:()=>3};
  r.h.mode();await tick();await tick();
  const rendered=r.h.view({pending:2,parts:{}});
  const main=rendered.match(/<nav class="gl-ch-nav gl-ch-group-nav"[^>]*>(.*?)<\/nav>/s)?.[1];
  assert.ok(main);
  assert.deepEqual([...main.matchAll(/data-ch-group="([^"]+)"/g)].map(x=>x[1]),['inicio','locales','gestlok-chat','wai','contacto','herramientas']);
  assert.match(main,/Comercios<\/span><b>2<\/b>/);
  assert.match(main,/Comunicación<\/span><b>3<\/b>/);
  assert.match(rendered,/Accesos frecuentes/);
  assert.match(rendered,/Habilitación GESTLOK Chat/);
  assert.match(rendered,/<details class="gl-ch-admin-more">/);
  for (const [members,group] of [[['locales','empresas','usuarios','empleados'],'Comercios'],[['gestlok-chat','habilitacion','chat-prueba'],'GESTLOK Chat'],[['contacto','resenas'],'Comunicación'],[['herramientas','nfc'],'Herramientas']]) {
    for(const leaf of members){
      r.h.setTab(leaf);
      const html=r.h.view({pending:2,parts:{}});
      const visibleNav=html.match(/<nav class="gl-ch-section-tools" aria-label="([^"]+)">([\s\S]*?)<\/nav>/);
      assert.equal(visibleNav?.[1],'Secciones de '+group);
      assert.match(visibleNav[2],new RegExp('data-ch-tab="'+leaf+'" class="on" aria-current="page"'));
      assert.equal((html.match(/<nav class="gl-ch-section-tools"[^>]* hidden>/g)||[]).length,3);
    }
  }
});
test('Los controles de Chat tienen una sola ubicación principal para la administradora',async()=>{
  const r=load(async fn=>({data:fn==='gestlok_creator_dashboard'?DASH:[],error:null}));
  r.h.mode();await tick();await tick();
  for(const tab of ['gestlok-chat','herramientas']){
    r.h.setTab(tab);
    const html=r.h.view({parts:{}});
    assert.doesNotMatch(html,/aria-label="GESTLOK Chat por empresa"/);
    if(tab==='gestlok-chat')assert.match(html,/Ir a Habilitación/);
  }
  r.h.setTab('habilitacion');
  const html=r.h.view({parts:{}});
  assert.match(html,/aria-label="GESTLOK Chat por empresa"/);
  assert.match(html,/GESTLOK WAI/);
  assert.doesNotMatch(html,/GESTLOK Chat Premium/);
  const other=load(async()=>({data:DASH,error:null}),{email:'otra@empresa.com'});
  other.h.mode();await tick();await tick();
  assert.doesNotMatch(other.h.view({parts:{}}),/gl-ch-group-nav|gl-ch-admin-summary|data-ch-tab="habilitacion"/);
});


test('WAI comercial: panel exclusivo, lectura real y controles por empresa y local',async()=>{
 const data=[{tenant:'a',local_id:'uno',slug:'a-uno',empresa:'A',nombre:'Munro',rubro:'gastronomia',activo:true,numeros:[{id:'n1',numero:'+5491100000001',registrado:true,activo:true,estado:'conectado'}]},{tenant:'b',local_id:'uno',slug:'b-uno',empresa:'B',nombre:'Torcuato',activo:false,numeros:[]}];
 const org=[{tenant:'a',local_id:'uno',responsable_id:'o1',responsable:'Dueña A',plantilla:true,duenos:[{id:'o1',nombre:'Dueña A'}]},{tenant:'b',local_id:'uno',duenos:[]}];
 const r=load(async fn=>({data:fn==='gestlok_creator_dashboard'?DASH:fn==='gestlok_chat_wai_admin_organizacion'?org:data}));
 r.h.mode();await tick();await tick();r.h.setTab('wai');r.h.view({parts:{}});await tick();
 const html=r.h.view({parts:{}});
 assert.match(html,/GESTLOK WAI · Prueba/);assert.match(html,/Empresa A/);assert.match(html,/Dueño: Dueña A/);assert.match(html,/Configuración base de empresa/);assert.match(html,/href="\/chat\/wai\/prueba\/"/);assert.match(html,/href="\/wai\/"/);assert.match(html,/1 activos · 1 inactivos/);assert.match(html,/Munro/);assert.match(html,/Torcuato/);assert.match(html,/Gastronomía/);assert.match(html,/href="\/wai\/\?local=a-uno"/);assert.match(html,/Abrir local · ajustes y QR/);
 r.listeners.click({preventDefault(){},target:{closest:s=>s==='[data-wai-commercial]'?{dataset:{waiCommercial:'numero',row:'0',number:'0'}}:null}});await tick();
 const i=r.calls.lastIndexOf('gestlok_chat_wai_admin_comercial');assert.equal(r.argsLog[i].p_tenant,'a');assert.equal(r.argsLog[i].p_local,'uno');assert.equal(r.argsLog[i].p_id,'n1');assert.equal(r.argsLog[i].p_activo,false);
 const other=load(async()=>({data:DASH}),{email:'other@example.com'});other.h.mode();await tick();other.h.setTab('wai');assert.notEqual(other.h.tab(),'wai');assert.doesNotMatch(other.h.view({parts:{}}),/data-ch-tab="wai"/);
});

test('WAI: rubro declarado por local, herencia visible y motor disponible para todos los rubros',async()=>{
 const data=[{tenant:'a',local_id:'uno',slug:'a-uno',empresa:'A',nombre:'Munro',rubro:'gastronomia',activo:true,numeros:[]},{tenant:'b',local_id:'uno',slug:'b-uno',empresa:'B',nombre:'Tienda',activo:false,numeros:[]}];
 const org=[{tenant:'a',local_id:'uno',rubro:'gastronomia',duenos:[]},{tenant:'b',local_id:'uno',rubro:'perfumeria',duenos:[]}];
 const r=load(async(fn,args)=>{if(fn==='gestlok_chat_wai_admin_rubro'){org[1].rubro=args.p_rubro;return {data:args.p_rubro};}return {data:fn==='gestlok_creator_dashboard'?DASH:fn==='gestlok_chat_wai_admin_organizacion'?org:data};});
 r.h.mode();await tick();await tick();r.h.setTab('wai');r.h.view({parts:{}});await tick();
 let html=r.h.view({parts:{}});
 assert.match(html,/Perfumería o cosmética/);
 assert.match(html,/data-row="1">Activar WAI/);
 assert.doesNotMatch(html,/motor específico en preparación/);
 assert.doesNotMatch(html,/data-wai-commercial-register data-row="1"/,'sin activar no se registran números');
 assert.match(html,/href="\/wai\/\?local=a-uno"/);assert.doesNotMatch(html,/Cloudflare/);
 r.listeners.submit({preventDefault(){},target:{matches:s=>s==='[data-wai-rubro-form]',dataset:{row:'1'},elements:{rubro:{value:'servicios'}}}});await tick();await tick();
 const i=r.calls.lastIndexOf('gestlok_chat_wai_admin_rubro');assert.ok(i>=0);
 assert.deepEqual(JSON.parse(JSON.stringify(r.argsLog[i])),{p_tenant:'b',p_local:'uno',p_rubro:'servicios'});
 html=r.h.view({parts:{}});assert.match(html,/Rubro: Servicios/);assert.match(html,/Rubro: Gastronomía/);
});

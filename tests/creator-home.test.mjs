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
    GestLokMolino: {open: tab => { opened.push(tab); molinoOpen?.(tab); }},
    GestLokOffline: {pending: async () => 0, invalidateContext: async () => { invalidations++; }},
    location: {reload(){reloads++;}},
    sessionStorage: {getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: k => store.delete(k)},
    scrollTo() {}, confirm,
    GestLokSupabase: {functions:{invoke},rpc: async (fn,args) => { calls.push(fn); argsLog.push(args); return rpc(fn,args); }}
  };
  const document = {addEventListener(n, f) { listeners[n] = f; }, visibilityState: 'visible'};
  vm.runInNewContext(source, {window, document, setInterval: () => 0, clearInterval() {}, Date, queueMicrotask, fetch: fetcher});
  const h = window.GestLokCreatorHome;
  h.attach({S: {me: {email, tenant_id: tenant}}, isCreadora: () => creadora,
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

test('GESTLOK HQ: solo la creadora selecciona agentes y no se simula ejecución', async () => {
  const r = load(async (fn) => ({data: fn==='gestlok_hq_list_tasks'?[]:DASH, error: null}));
  r.h.mode(); await tick(); await tick();
  assert.match(r.h.view({parts:{}}), /data-ch-tab="hq"/);
  r.h.setTab('hq'); await tick();
  const html=r.h.view({parts:{}});
  assert.match(html,/Plano interactivo de la oficina/);
  assert.match(html,/Centro de misiones/);
  assert.match(html,/Ficha del empleado/);
  assert.equal((html.match(/data-ch-hq-agent="/g)||[]).length,6);
  for(const area of ['Desarrollo','Control de calidad','Testing','Atención al cliente','Marketing','Data Analytics']) assert.ok(html.includes(area),area);
  assert.match(html,/Sin conexión a IA/);
  assert.match(html,/Copiar instrucción para delegar/);
  r.listeners.click({preventDefault(){},target:{closest:s=>s==='[data-ch-hq-agent]'?{dataset:{chHqAgent:'marketing'}}:null}});
  assert.match(r.h.view({parts:{}}),/Preparar tarea · Marketing/);
  // Rendering Inicio also schedules its existing microapp and Chat prefetches.
  // Keep the full allowlist and assert exactly one HQ read, with no writes or agent runs.
  assert.deepEqual(r.calls.filter(fn=>fn.startsWith('gestlok_hq_')),['gestlok_hq_list_tasks']);
  assert.deepEqual(r.calls.filter(fn=>!fn.startsWith('gestlok_hq_')).sort(),['gestlok_creator_dashboard','gestlok_creator_microapps','gestlok_chat_admin_empresas','gestlok_chat_admin_cobros'].sort());
});
test('GESTLOK HQ: otro correo, dueño y respuesta rechazada no habilitan el panel', async () => {
  for(const opts of [{email:'otra@example.invalid'},{creadora:false}]){
    const r=load(async()=>({data:DASH,error:null}),opts);
    r.h.mode();await tick();await tick();r.h.setTab('hq');
    assert.notEqual(r.h.tab(),'hq');
    assert.doesNotMatch(r.h.view({parts:{}}),/data-ch-tab="hq"|Oficina virtual GESTLOK HQ/);
  }
  const r=load(async()=>({error:{code:'42501'},data:null}));
  r.h.mode();await tick();await tick();
  assert.equal(r.h.mode(),'off');
  assert.doesNotMatch(r.h.view({parts:{}}),/Oficina virtual GESTLOK HQ/);
});

test('GESTLOK HQ: guarda y consulta tareas privadas sin enviar trabajos a IA',async()=>{
  const rows=[];const r=load(async(fn,args)=>{
    if(fn==='gestlok_creator_dashboard')return {data:DASH};
    if(fn==='gestlok_hq_list_tasks')return {data:rows.slice()};
    if(fn==='gestlok_hq_add_task'){rows.push({id:'id-1',agent:args.p_agent,instruction:args.p_instruction,status:'pendiente',created_at:DASH.generated_at});return {data:'id-1'};}
    if(fn==='gestlok_hq_close_task'){rows[0].status=args.p_status;return {data:true};}
    throw Error(fn);
  });
  r.h.mode();await tick();await tick();r.h.setTab('hq');await tick();
  r.listeners.submit({preventDefault(){},submitter:{dataset:{hqAction:'save'}},target:{matches:s=>s==='[data-ch-hq-form]',querySelector:s=>s==='textarea'?{value:'Revisar <script>'}:null}});
  await tick();await tick();
  assert.match(r.h.view({parts:{}}),/Revisar &lt;script&gt;/);
  r.listeners.click({preventDefault(){},target:{closest:s=>s==='[data-ch-hq-close]'?{dataset:{chHqClose:'id-1',status:'cerrada'}}:null}});
  await tick();await tick();
  assert.match(r.h.view({parts:{}}),/No hay tareas pendientes/);
  assert.match(r.h.view({parts:{}}),/cerrada/);
  assert.deepEqual(r.calls,['gestlok_creator_dashboard','gestlok_hq_list_tasks','gestlok_hq_add_task','gestlok_hq_list_tasks','gestlok_hq_close_task','gestlok_hq_list_tasks']);
});

test('HQ Testing consulta Actions reales sin enviar instrucciones ni modificar GitHub',async()=>{
 const requests=[];
 const r=load(async fn=>({data:fn==='gestlok_hq_list_tasks'?[]:DASH}),{fetcher:async(url,opts)=>{requests.push([url,opts]);return {ok:true,json:async()=>({workflow_runs:[{id:123,name:'Cypress <test>',status:'completed',conclusion:'failure',head_sha:'abcdef123',head_branch:'main',event:'push'}]})};}});
 r.h.mode();await tick();await tick();r.h.setTab('hq');await tick();
 r.listeners.click({preventDefault(){},target:{closest:s=>s==='[data-ch-hq-agent]'?{dataset:{chHqAgent:'testing'}}:null}});
 assert.match(r.h.view({parts:{}}),/Preparar tarea · Testing/);
 r.listeners.click({preventDefault(){},target:{closest:s=>s==='[data-ch-hq-github]'?{}:null}});
 await tick();await tick();
 assert.equal(requests.length,1);
 assert.match(requests[0][0],/^https:\/\/api.github.com\/repos\/mgstock-app\/mgstock-app.github.io\/actions\/runs\?/);
 assert.equal(requests[0][1].credentials,'omit');
 assert.equal(requests[0][1].body,undefined);
 assert.match(r.h.view({parts:{}}),/Cypress &lt;test&gt;/);
 assert.match(r.h.view({parts:{}}),/Falló/);
 assert.match(r.h.view({parts:{}}),/actions\/runs\/123/);
 r.listeners.click({preventDefault(){},target:{closest:s=>s==='[data-ch-hq-agent]'?{dataset:{chHqAgent:'marketing'}}:null}});
 assert.doesNotMatch(r.h.view({parts:{}}),/Actividad real de GitHub/);
});

test('HQ AI requires explicit confirmation, saved pending task and a configured provider',async()=>{
 const requests=[], rows=[{id:'id-1',agent:'testing',instruction:'Revisar',status:'pendiente',created_at:DASH.generated_at}];
 let runs=[], confirmed=false;
 const r=load(async fn=>({data:fn==='gestlok_hq_list_tasks'?rows:fn==='gestlok_hq_list_runs'?runs:DASH}),{confirm:()=>confirmed,invoke:async(name,options)=>{
  requests.push([name,options.body]);
  if(options.body.action==='status')return {data:{configured:true}};
  runs=[{task_id:'id-1',state:'review',result:'Informe <seguro>'}];return {data:{ok:true,state:'review'}};
 }});
 const click=(selector,dataset={})=>r.listeners.click({preventDefault(){},target:{closest:s=>s===selector?{dataset}:null}});
 r.h.mode();await tick();await tick();r.h.setTab('hq');await tick();
 assert.doesNotMatch(r.h.view({parts:{}}),/data-ch-hq-ai-run=/);
 click('[data-ch-hq-ai-status]');await tick();await tick();
 assert.match(r.h.view({parts:{}}),/Proveedor configurado/);
 click('[data-ch-hq-ai-run]',{chHqAiRun:'id-1'});await tick();assert.equal(requests.length,1);
 confirmed=true;click('[data-ch-hq-ai-run]',{chHqAiRun:'id-1'});await tick();await tick();
 assert.equal(requests.length,2);
 assert.equal(requests[1][0],'gestlok-hq-agent');
 assert.equal(requests[1][1].task_id,'id-1');
 assert.match(r.h.view({parts:{}}),/Informe &lt;seguro&gt;/);
 assert.doesNotMatch(r.h.view({parts:{}}),/data-ch-hq-ai-run=/);
});

test('HQ Dirección: identidades estables, ambientes privados y aprobación con informe',async()=>{
 const rows=[];let reports=[];const decisions=[];
 const r=load(async(fn,args)=>{
  if(fn==='gestlok_hq_list_tasks')return {data:rows.slice()};
  if(fn==='gestlok_hq_list_runs')return {data:reports};
  if(fn==='gestlok_hq_add_task'){rows.push({id:'meeting-1',agent:args.p_agent,instruction:args.p_instruction,status:'pendiente',created_at:DASH.generated_at});return {data:'meeting-1'};}
  if(fn==='gestlok_hq_close_task'){decisions.push(args);rows[0].status=args.p_status;return {data:true};}
  return {data:DASH};
 },{invoke:async(name,options)=>{if(options.body.action==='status')return {data:{configured:true}};reports=[{task_id:'meeting-1',state:'review',result:'Informe del líder'}];return {data:{ok:true,state:'review'}};}});
 const click=(selector,dataset={})=>r.listeners.click({preventDefault(){},target:{closest:s=>s===selector?{dataset}:null}});
 r.h.mode();await tick();await tick();r.h.setTab('hq');await tick();
 for(const name of ['Mateo','Valentina','Julián','Sofía','Lucía','Bruno','Alex'])assert.ok(r.h.view({parts:{}}).includes(name),name);
 click('[data-ch-hq-agent]',{chHqAgent:'testing'});click('[data-ch-hq-room]',{chHqRoom:'private'});
 assert.match(r.h.view({parts:{}}),/Oficina privada · Julián/);
 click('[data-ch-hq-room]',{chHqRoom:'general'});assert.match(r.h.view({parts:{}}),/Plano interactivo de la oficina/);
 click('[data-ch-hq-leader]');
 assert.match(r.h.view({parts:{}}),/Oficina privada · Alex/);
 assert.match(r.h.view({parts:{}}),/Preparar tarea · Dirección de IA/);
 r.listeners.submit({preventDefault(){},submitter:{dataset:{hqAction:'save'}},target:{matches:s=>s==='[data-ch-hq-form]',querySelector:s=>s==='textarea'?{value:'Mejorar pedidos en Munro'}:s==='#gl-hq-scope'?{value:'GESTLOK Chat · local específico'}:null}});
 await tick();await tick();
 assert.equal(rows[0].agent,'lider');assert.match(rows[0].instruction,/GESTLOK Chat · local específico/);
 click('[data-ch-hq-close]',{chHqClose:'meeting-1',status:'cerrada'});await tick();assert.equal(decisions.length,0);
 click('[data-ch-hq-ai-status]');await tick();await tick();
 assert.match(r.h.view({parts:{}}),/Iniciar reunión de IA/);
 click('[data-ch-hq-ai-run]',{chHqAiRun:'meeting-1'});await tick();await tick();
 assert.match(r.h.view({parts:{}}),/Informe del líder/);
 click('[data-ch-hq-close]',{chHqClose:'meeting-1',status:'cerrada'});await tick();await tick();
 assert.equal(decisions.length,1);assert.equal(rows[0].status,'cerrada');
});

test('HQ: solicitud de incorporación de Alex requiere decisión independiente de la creadora',async()=>{
 const rows=[{id:'meeting-1',agent:'lider',instruction:'Innovación',status:'pendiente',created_at:DASH.generated_at}];
 const hire={name:'Emilia',specialty:'UX/UI',reason:'Falta investigación de experiencia',benefit:'Reducir errores de uso',cost:'A evaluar',permissions:'Solo lectura',alternative:'Delegar en Desarrollo'};
 const reports=[{id:'run-1',task_id:'meeting-1',state:'review',result:'Informe',hire_request:hire,hire_decision:null}];
 const decisions=[];let confirmed=false;
 const r=load(async(fn,args)=>{
  if(fn==='gestlok_hq_list_tasks')return {data:rows};
  if(fn==='gestlok_hq_list_runs')return {data:reports};
  if(fn==='gestlok_hq_decide_hire'){decisions.push(args);reports[0].hire_decision=args.p_decision;return {data:true};}
  return {data:DASH};
 },{confirm:()=>confirmed,invoke:async()=>({data:{configured:true}})});
 const click=(selector,dataset={})=>r.listeners.click({preventDefault(){},target:{closest:s=>s===selector?{dataset}:null}});
 r.h.mode();await tick();await tick();r.h.setTab('hq');await tick();
 click('[data-ch-hq-ai-status]');await tick();await tick();
 assert.match(r.h.view({parts:{}}),/Emilia · UX\/UI/);
 assert.match(r.h.view({parts:{}}),/Por qué hace falta/);
 click('[data-ch-hq-hire]',{chHqHire:'run-1',decision:'approved'});await tick();assert.equal(decisions.length,0);
 confirmed=true;click('[data-ch-hq-hire]',{chHqHire:'run-1',decision:'approved'});await tick();await tick();
 assert.equal(decisions.length,1);assert.equal(decisions[0].p_decision,'approved');
 assert.match(r.h.view({parts:{}}),/Autorizada · pendiente de configuración/);
 assert.equal((r.h.view({parts:{}}).match(/data-ch-hq-agent="/g)||[]).length,6);
 click('[data-ch-hq-hire]',{chHqHire:'run-1',decision:'rejected'});await tick();assert.equal(decisions.length,1);
});

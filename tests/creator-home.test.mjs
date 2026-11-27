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

test('GESTLOK HQ: solo la creadora selecciona agentes y no se simula ejecución', async () => {
  const r = load(async (fn) => ({data: ['gestlok_hq_list_tasks','gestlok_hq_list_runs'].includes(fn)?[]:DASH, error: null}));
  r.h.mode(); await tick(); await tick();
  assert.match(r.h.view({parts:{}}), /data-ch-tab="hq"/);
  r.h.setTab('hq'); await tick();
  const html=r.h.view({parts:{}});
  assert.match(html,/Plano interactivo de la oficina/);
  assert.match(html,/Centro de misiones/);
  assert.match(html,/Ficha del empleado/);
  assert.equal((html.match(/data-ch-hq-agent="/g)||[]).length,9);
  for(const area of ['Desarrollo','Control de calidad','Testing','Atención al cliente','Marketing','Data Analytics']) assert.ok(html.includes(area),area);
  assert.match(html,/IA pendiente de verificación/);
  assert.match(html,/Copiar instrucción para delegar/);
  r.listeners.click({preventDefault(){},target:{closest:s=>s==='[data-ch-hq-agent]'?{dataset:{chHqAgent:'marketing'}}:null}});
  assert.match(r.h.view({parts:{}}),/Preparar tarea · Marketing/);
  // Rendering Inicio also schedules its existing microapp and Chat prefetches.
  // Keep the full allowlist for HQ reads, including Facundo evidence, with no writes or agent runs.
  assert.deepEqual(r.calls.filter(fn=>fn.startsWith('gestlok_hq_')&&fn!=='gestlok_hq_pulso'),['gestlok_hq_list_tasks','gestlok_hq_list_runs','gestlok_hq_support_status']);
  assert.ok(r.calls.filter(fn=>fn==='gestlok_hq_pulso').length<=1);
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
    if(fn==='gestlok_hq_list_runs')return {data:[]};
    if(fn==='gestlok_hq_support_status')return {data:{checks:[],worker:null}};
    if(fn==='gestlok_hq_pulso')return {data:{sucursales:[],conteo:{}}};
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
  // El pulso de la oficina es una lectura más; nunca agrega escrituras ni ejecuciones.
  assert.deepEqual(r.calls.filter(fn=>fn!=='gestlok_hq_pulso'),['gestlok_creator_dashboard','gestlok_hq_list_tasks','gestlok_hq_list_runs','gestlok_hq_support_status','gestlok_hq_add_task','gestlok_hq_list_tasks','gestlok_hq_list_runs','gestlok_hq_close_task','gestlok_hq_list_tasks','gestlok_hq_list_runs']);
  assert.ok(r.calls.filter(fn=>fn==='gestlok_hq_pulso').length<=1);
});

test('HQ Testing consulta Actions reales sin enviar instrucciones ni modificar GitHub',async()=>{
 const requests=[];
 const r=load(async fn=>({data:['gestlok_hq_list_tasks','gestlok_hq_list_runs'].includes(fn)?[]:DASH}),{fetcher:async(url,opts)=>{requests.push([url,opts]);return {ok:true,json:async()=>({workflow_runs:[{id:123,name:'Cypress <test>',status:'completed',conclusion:'failure',head_sha:'abcdef123',head_branch:'main',event:'push'}]})};}});
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
  if(options.body.action==='status')return {data:{configured:true,verified:true}};
  runs=[{task_id:'id-1',state:'review',result:'Informe <seguro>'}];return {data:{ok:true,state:'review'}};
 }});
 const click=(selector,dataset={})=>r.listeners.click({preventDefault(){},target:{closest:s=>s===selector?{dataset}:null}});
 r.h.mode();await tick();await tick();r.h.setTab('hq');await tick();
 assert.doesNotMatch(r.h.view({parts:{}}),/data-ch-hq-ai-run=/);
 click('[data-ch-hq-ai-status]');await tick();await tick();
 assert.match(r.h.view({parts:{}}),/Groq · conexión disponible \(respuesta de IA aún no verificada\)/);
 click('[data-ch-hq-ai-run]',{chHqAiRun:'id-1'});await tick();assert.equal(requests.length,1);
 confirmed=true;click('[data-ch-hq-ai-run]',{chHqAiRun:'id-1'});await tick();await tick();
 assert.equal(requests.length,2);
 assert.equal(requests[1][0],'gestlok-hq-agent');
 assert.equal(requests[1][1].task_id,'id-1');
 assert.match(r.h.view({parts:{}}),/Informe &lt;seguro&gt;/);
 assert.doesNotMatch(r.h.view({parts:{}}),/data-ch-hq-ai-run=/);
});

test('HQ Dirección: identidades estables, ambientes privados y aprobación con informe',async()=>{
 const rows=[];let reports=[];const decisions=[];const executed=[];
 const r=load(async(fn,args)=>{
  if(fn==='gestlok_hq_list_tasks')return {data:rows.slice()};
  if(fn==='gestlok_hq_list_runs')return {data:reports};
  if(fn==='gestlok_hq_add_task'){rows.push({id:'meeting-1',agent:args.p_agent,instruction:args.p_instruction,status:'pendiente',created_at:DASH.generated_at});return {data:'meeting-1'};}
  if(fn==='gestlok_hq_delegate_mission'){for(const agent of ['desarrollo','calidad','testing','atencion','marketing','datos','soporte'])if(!rows.some(t=>t.parent_task_id===args.p_task&&t.agent===agent))rows.push({id:agent,agent,parent_task_id:args.p_task,status:'pendiente',instruction:'Misión',created_at:DASH.generated_at});return {data:true};}
  if(fn==='gestlok_hq_close_task'){decisions.push(args);rows[0].status=args.p_status;return {data:true};}
  return {data:DASH};
 },{invoke:async(name,options)=>{if(options.body.action==='status')return {data:{configured:true,verified:true}};executed.push(options.body.task_id);reports=[...reports,{task_id:options.body.task_id,state:'review',result:options.body.task_id==='meeting-1'?'Informe del líder':'Propuesta',quota_units:1,created_at:new Date().toISOString()}];return {data:{ok:true,state:'review'}};}});
 const click=(selector,dataset={})=>r.listeners.click({preventDefault(){},target:{closest:s=>s===selector?{dataset}:null}});
 r.h.mode();await tick();await tick();r.h.setTab('hq');await tick();
 for(const name of ['Nicolás','Camila','Tomás','Renata','Martina','Santiago','Alex'])assert.ok(r.h.view({parts:{}}).includes(name),name);
 click('[data-ch-hq-agent]',{chHqAgent:'testing'});click('[data-ch-hq-room]',{chHqRoom:'private'});
 assert.match(r.h.view({parts:{}}),/Oficina privada · Tomás/);
 click('[data-ch-hq-room]',{chHqRoom:'general'});assert.match(r.h.view({parts:{}}),/Plano interactivo de la oficina/);
 click('[data-ch-hq-leader]');
 assert.match(r.h.view({parts:{}}),/Oficina privada · Alex/);
 assert.match(r.h.view({parts:{}}),/Preparar tarea · Dirección de IA/);
 r.listeners.submit({preventDefault(){},submitter:{dataset:{hqAction:'save'}},target:{matches:s=>s==='[data-ch-hq-form]',querySelector:s=>s==='textarea'?{value:'Mejorar pedidos en Munro'}:s==='#gl-hq-scope'?{value:'GESTLOK Chat · local específico'}:null}});
 await tick();await tick();
 assert.equal(rows[0].agent,'lider');assert.match(rows[0].instruction,/GESTLOK Chat · local específico/);
 click('[data-ch-hq-close]',{chHqClose:'meeting-1',status:'cerrada'});await tick();assert.equal(decisions.length,0);
 click('[data-ch-hq-ai-status]');await tick();await tick();
 assert.match(r.h.view({parts:{}}),/Distribuir misión/);
 click('[data-ch-hq-team]',{chHqTeam:'meeting-1'});await tick();await tick();assert.equal(executed.length,0);assert.equal(rows.length,8);
 assert.match(r.h.view({parts:{}}),/7 sectores asignados/);
 click('[data-ch-hq-team]',{chHqTeam:'meeting-1'});for(let i=0;i<24;i++)await tick();assert.equal(executed.length,8);assert.equal(executed.at(-1),'meeting-1');
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
 },{confirm:()=>confirmed,invoke:async()=>({data:{configured:true,verified:true}})});
 const click=(selector,dataset={})=>r.listeners.click({preventDefault(){},target:{closest:s=>s===selector?{dataset}:null}});
 r.h.mode();await tick();await tick();r.h.setTab('hq');await tick();
 click('[data-ch-hq-ai-status]');await tick();await tick();
 assert.match(r.h.view({parts:{}}),/Emilia · UX\/UI/);
 assert.match(r.h.view({parts:{}}),/Por qué hace falta/);
 click('[data-ch-hq-hire]',{chHqHire:'run-1',decision:'approved'});await tick();assert.equal(decisions.length,0);
 confirmed=true;click('[data-ch-hq-hire]',{chHqHire:'run-1',decision:'approved'});await tick();await tick();
 assert.equal(decisions.length,1);assert.equal(decisions[0].p_decision,'approved');
 assert.match(r.h.view({parts:{}}),/Autorizada · pendiente de configuración/);
 assert.equal((r.h.view({parts:{}}).match(/data-ch-hq-agent="/g)||[]).length,9);
 click('[data-ch-hq-hire]',{chHqHire:'run-1',decision:'rejected'});await tick();assert.equal(decisions.length,1);
});

test('HQ shows executive decisions automatically without invoking a paid model',async()=>{
 const rows=[{id:'meeting-1',agent:'lider',instruction:'Revisión de microapps',status:'pendiente',created_at:DASH.generated_at}];
 const reports=[{id:'run-1',task_id:'meeting-1',state:'review',result:'Informe <seguro>',hire_request:{name:'Emilia',specialty:'UX/UI'},hire_decision:null}];
 let invoked=0;
 const r=load(async fn=>({data:fn==='gestlok_hq_list_tasks'?rows:fn==='gestlok_hq_list_runs'?reports:DASH}),{invoke:async()=>{invoked++;return {data:{configured:true,verified:true}};}});
 r.h.mode();await tick();await tick();r.h.setTab('hq');await tick();await tick();
 const html=r.h.view({parts:{}});
 assert.match(html,/Bandeja ejecutiva de Alex/);
 assert.match(html,/1 informes para revisar · 1 incorporaciones para decidir/);
 assert.match(html,/Informe &lt;seguro&gt;/);
 assert.match(html,/Ver informe completo y respaldo/);
 assert.match(html,/Marcar revisado/);
 assert.match(html,/Activar en este dispositivo/);
 assert.equal(invoked,0);
});


test('HQ: la oficina animada es independiente de la ejecución y la oficina privada enfoca al empleado',async()=>{
 const rows=[{id:'work-1',agent:'testing',instruction:'Revisar',status:'pendiente',created_at:DASH.generated_at}];
 const runs=[{task_id:'work-1',state:'working'}];let invoked=0;
 const r=load(async fn=>({data:fn==='gestlok_hq_list_tasks'?rows:fn==='gestlok_hq_list_runs'?runs:DASH}),{invoke:async()=>{invoked++;return {data:{configured:true,verified:true}};}});
 r.h.mode();await tick();await tick();r.h.setTab('hq');await tick();await tick();
 const html=r.h.view({parts:{}});
 assert.equal((html.match(/data-hq-office-slot/g)||[]).length,1);
 assert.equal((html.match(/data-ch-hq-agent="/g)||[]).length,9);
 assert.equal((html.match(/data-ch-hq-leader/g)||[]).length,1);
 assert.equal((html.match(/· En ejecución"/g)||[]).length,1);
 assert.match(html,/Tomás · Testing · En ejecución/);
 assert.match(html,/estados de ejecución corresponden únicamente a tareas reales/);
 assert.match(html,/eso es animación/);
 const click=(selector,dataset={})=>r.listeners.click({preventDefault(){},target:{closest:s=>s===selector?{dataset}:null}});
 click('[data-ch-hq-agent]',{chHqAgent:'testing'});click('[data-ch-hq-room]',{chHqRoom:'private'});
 const room=r.h.view({parts:{}});
 assert.match(room,/Oficina privada · Tomás/);
 assert.match(room,/data-hq-office-slot data-hq-focus="testing"/);
 assert.equal(invoked,0);
});

test('HQ: cada empleado conserva su identidad en la oficina, la ficha y el módulo animado',async()=>{
 const office=readFileSync('public/stock/gestlok-hq-office.mjs','utf8');
 const r=load(async fn=>({data:['gestlok_hq_list_tasks','gestlok_hq_list_runs'].includes(fn)?[]:DASH}));
 r.h.mode();await tick();await tick();r.h.setTab('hq');await tick();await tick();
 const people=[['desarrollo','Nicolás'],['calidad','Camila'],['testing','Tomás'],['atencion','Renata'],['marketing','Martina'],['datos','Santiago'],['soporte','Facundo'],['difusion','Valentina'],['soporte_general','Lucas'],['lider','Alex']];
 const click=(selector,dataset={})=>r.listeners.click({preventDefault(){},target:{closest:q=>q===selector?{dataset}:null}});
 for(const [id,name] of people){
  assert.ok(office.includes("{id: '"+id+"', name: '"+name+"', avatar: 'Humano'"),id);
  if(id==='lider')click('[data-ch-hq-leader]');else{click('[data-ch-hq-agent]',{chHqAgent:id});click('[data-ch-hq-room]',{chHqRoom:'private'});}
  const room=r.h.view({parts:{}});
  assert.ok(room.includes('Oficina privada · '+name),id);
  assert.ok(room.includes(name+' · Avatar humano · asistente IA'),id);
 }
});

test('HQ: la oficina es un módulo propio, sin IA, sin base y con movimiento reducido',()=>{
 const office=readFileSync('public/stock/gestlok-hq-office.mjs','utf8');
 assert.doesNotMatch(office,/\bfetch\s*\(|\.rpc\s*\(|functions\.invoke|https?:\/\/|import\s/);
 assert.match(office,/export function attach/);
 assert.match(office,/export function update/);
 assert.match(office,/export function buildInsights/);
 assert.match(office,/prefers-reduced-motion/);
 assert.match(office,/if \(!STATE\.root\.isConnected\) return;/);
 assert.match(office,/localStorage\.(get|set)Item\(IDEAS_KEY/);
 assert.doesNotMatch(office,/gestlok-hq-3d/);
 assert.match(source,/import\('\.\/gestlok-hq-office\.mjs\?rev=/);
 assert.match(source,/data-hq-office-slot/);
 assert.doesNotMatch(source,/data-hq-3d-host|gestlok-hq-3d/);
});

test('HQ: only an actual pending execution activates work or a meeting',async()=>{
 for(const [rows,runs,meeting,working] of [
  [[],[],false,0],
  [[{id:'m',agent:'lider',status:'pendiente',instruction:'Planificar'}],[],false,0],
  [[{id:'m',agent:'lider',status:'pendiente',instruction:'Planificar'}],[{task_id:'m',state:'working'}],true,1],
  [[{id:'m',agent:'lider',status:'cerrada',instruction:'Planificar'}],[{task_id:'m',state:'working'}],false,0],
  [[{id:'w',agent:'testing',status:'pendiente',instruction:'Revisar'}],[{task_id:'w',state:'working'}],false,1],
  [[{id:'m',agent:'lider',status:'pendiente',instruction:'Planificar'}],[{task_id:'m',state:'review'}],false,0]
 ]){
  const r=load(async fn=>({data:fn==='gestlok_hq_list_tasks'?rows:fn==='gestlok_hq_list_runs'?runs:DASH}));
  r.h.mode();await tick();await tick();r.h.setTab('hq');await tick();await tick();
  const html=r.h.view({parts:{}});
  assert.ok(html.includes('data-hq-meeting="'+meeting+'"'));
  assert.equal((html.match(/· En ejecución"/g)||[]).length,working);
  if(!working)assert.match(html,/Sin tareas en ejecución · equipo disponible/);
 }
});

test('HQ: comentarios con datos reales del pulso y proveedor gratuito dedicado',async()=>{
 const office=await import('../public/stock/gestlok-hq-office.mjs');
 const backend=readFileSync('supabase/functions/gestlok-hq-agent/index.ts','utf8');
 const pulse={sucursales:[{slug:'a',nombre:'Centro',empresa:'Demo <b>',activa:true,habilitada:true,ia_activa:true,conv_7d:20,ped_7d:2,pendientes:2,pendiente_max_min:7,reclamos_pendientes:1,productos_agotados:3,aceptados_7d:1,ticket_7d:12000,promos_dia:[]}],conteo:{}};
 const ins=office.buildInsights({pulse,now:'2026-11-25T15:00:00Z'});
 assert.ok(ins.some(i=>i.agent==='atencion'&&i.level===3&&/2 pedidos sin abrir \(el más viejo, hace 7 min\)/.test(i.text)));
 assert.ok(ins.some(i=>i.agent==='atencion'&&/1 reclamo sin responder/.test(i.text)));
 assert.ok(ins.some(i=>i.agent==='datos'&&/20 conversaciones y 2 pedidos en 7 días \(10% termina en pedido\)/.test(i.text)&&i.idea));
 assert.ok(ins.some(i=>i.agent==='calidad'&&/3 productos agotados/.test(i.text)));
 assert.equal(ins[0].level,3);
 const ideas=office.buildIdeas(ins,{});
 assert.ok(ideas.some(i=>i.source==='dato')&&ideas.some(i=>i.source==='propuesta'));
 assert.match(backend,/GESTLOK_HQ_GROQ_FREE_API_KEY/);
 assert.match(backend,/https:\/\/api\.groq\.com\/openai\/v1\/chat\/completions/);
 assert.match(backend,/openai\/gpt-oss-20b/);
 assert.doesNotMatch(backend,/api\.openai\.com|GESTLOK_HQ_OPENAI_API_KEY/);
 assert.match(backend,/gestlok_hq_claim_run/);
 assert.match(backend,/gestlok_hq_finish_director/);
});

test('HQ synchronizes persisted runs across devices without invoking AI or disrupting a draft',async()=>{
 let rows=[],runs=[],invocations=0;
 const r=load(async fn=>({data:fn==='gestlok_hq_list_tasks'?rows:fn==='gestlok_hq_list_runs'?runs:DASH}),{invoke:async()=>{invocations++;return {data:{configured:true,verified:true}};}});
 r.h.mode();await tick();await tick();r.h.setTab('hq');await tick();await tick();
 const poll=r.intervals.find(x=>x.ms===4000);assert.ok(poll);
 rows=[{id:'remote-meeting',agent:'lider',status:'pendiente',instruction:'Remota',created_at:DASH.generated_at}];
 runs=[{task_id:'remote-meeting',state:'working'}];
 poll.fn();await tick();await tick();
 assert.match(r.h.view({parts:{}}),/data-hq-meeting="true"/);
 const renderCount=r.renders();poll.fn();await tick();await tick();assert.equal(r.renders(),renderCount);
 r.document.activeElement={id:'gl-hq-task'};
 runs=[{task_id:'remote-meeting',state:'review',result:'Resultado remoto'}];
 poll.fn();await tick();await tick();assert.match(r.h.view({parts:{}}),/data-hq-meeting="true"/);
 r.document.activeElement=null;poll.fn();await tick();await tick();
 assert.match(r.h.view({parts:{}}),/Resultado remoto/);assert.match(r.h.view({parts:{}}),/data-hq-meeting="false"/);
 assert.equal(invocations,0);r.h.setTab('inicio');const count=r.calls.length;poll.fn();await tick();assert.equal(r.calls.length,count);
});
test('HQ provider diagnosis distinguishes credential failure and limits, with no parallel burst',()=>{
 const backend=readFileSync('supabase/functions/gestlok-hq-agent/index.ts','utf8');
 assert.match(backend,/safeProviderError/);assert.match(backend,/code===401/);assert.match(backend,/code===429/);
 assert.match(backend,/models\/openai\/gpt-oss-20b/);
 assert.match(backend,/for\(const \[area,profile\] of Object.entries\(profiles\)\.filter\(\(\[a\]\)=>LEGACY_AREAS\.includes\(a\)\)\)/);
 assert.doesNotMatch(backend,/Promise\.allSettled\(Object\.entries\(profiles\)/);
});

test('HQ Facundo is an independent read-only technical support area',async()=>{
 const r=load(async fn=>({data:['gestlok_hq_list_tasks','gestlok_hq_list_runs'].includes(fn)?[]:DASH}));
 r.h.mode();await tick();await tick();r.h.setTab('hq');await tick();await tick();
 const click=(selector,dataset={})=>r.listeners.click({preventDefault(){},target:{closest:q=>q===selector?{dataset}:null}});
 click('[data-ch-hq-agent]',{chHqAgent:'soporte'});click('[data-ch-hq-room]',{chHqRoom:'private'});
 const html=r.h.view({parts:{}});
 assert.match(html,/Oficina privada · Facundo/);assert.match(html,/Control preventivo · solo lectura/);
 assert.match(html,/Preparar tarea · Servicio técnico/);assert.match(html,/Solo la administradora puede autorizar/);
 const backend=readFileSync('supabase/functions/gestlok-hq-agent/index.ts','utf8');
 assert.match(backend,/soporte:"Facundo/);assert.match(backend,/Solo la administradora puede autorizar cambios/);
 assert.match(backend,/api\.groq\.com/);assert.doesNotMatch(backend,/api\.openai\.com/);
});

test('HQ: el pulso es de solo lectura, exclusivo de la creadora y sin datos personales',()=>{
 const sql=readFileSync('supabase/migrations/20261125150000_gestlok_hq_pulso.sql','utf8');
 assert.match(sql,/gestlok_hq_private\.require_creator\(\)/);
 assert.match(sql,/stable security definer set search_path = ''/);
 assert.match(sql,/revoke all on function gestlok_hq_private\.pulso\(\) from public, anon, authenticated/);
 assert.doesNotMatch(sql,/'cliente_nombre'|'cliente_telefono'|'direccion'|'texto'|'detalle'|'nota'/);
 assert.doesNotMatch(sql,/\b(insert|update|delete)\b\s/i);
 assert.match(sql,/not coalesce\(p\.es_prueba, false\)/);
});

test('HQ verifies Groq automatically without executing tasks and reports credential errors',async()=>{
 let invocations=[],verified=false;
 const r=load(async fn=>({data:['gestlok_hq_list_tasks','gestlok_hq_list_runs'].includes(fn)?[]:DASH}),{invoke:async(name,opts)=>{invocations.push(opts.body.action);return {data:verified?{configured:true,verified:true}:{configured:true,verified:false,diagnostic:'Groq rechazó la clave (401).'}};}});
 r.h.mode();await tick();await tick();r.h.setTab('hq');await tick();await tick();
 assert.match(r.h.view({parts:{}}),/IA pendiente de verificación/);
 const poll=r.intervals.find(x=>x.ms===2000);assert.ok(poll);
 poll.fn();await tick();await tick();
 assert.deepEqual(invocations,['status']);assert.match(r.h.view({parts:{}}),/Groq rechazó la clave \(401\)/);
 poll.fn();await tick();assert.equal(invocations.length,1);
 verified=true;r.listeners.click({preventDefault(){},target:{closest:q=>q==='[data-ch-hq-ai-status]'?{}:null}});await tick();await tick();
 assert.match(r.h.view({parts:{}}),/Groq · conexión disponible/);
 assert.deepEqual(invocations,['status','status']);
 r.h.setTab('inicio');poll.fn();await tick();assert.equal(invocations.length,2);
});


test('HQ shows Facundo and persisted pending tasks even without a provider connection',async()=>{
 const rows=[{id:'support-pending',agent:'soporte',status:'pendiente',instruction:'Control preventivo',created_at:DASH.generated_at}];
 const r=load(async fn=>({data:fn==='gestlok_hq_list_tasks'?rows:fn==='gestlok_hq_list_runs'?[]:DASH}));
 r.h.mode();await tick();await tick();r.h.setTab('hq');await tick();await tick();
 const html=r.h.view({parts:{}});
 assert.match(html,/Facundo · Servicio técnico · Tarea pendiente · sin iniciar/);
 assert.match(html,/data-ch-hq-agent="soporte"/);
});


test('HQ exposes remaining reserved quota and blocks a second full meeting without consuming tokens',async()=>{
 const now=new Date().toISOString();
 const rows=[{id:'failed',agent:'lider',status:'pendiente',instruction:'Primera reunión',created_at:now},{id:'next',agent:'lider',status:'pendiente',instruction:'Segunda reunión',created_at:now},{id:'support',agent:'soporte',status:'pendiente',instruction:'Control preventivo',created_at:now}];
 const runs=[{task_id:'failed',state:'error',created_at:now}];
 let invoked=0;
 const r=load(async fn=>({data:fn==='gestlok_hq_list_tasks'?rows:fn==='gestlok_hq_list_runs'?runs:DASH}),{invoke:async()=>{invoked++;return {data:{configured:true,verified:true}};}});
 r.h.mode();await tick();await tick();r.h.setTab('hq');await tick();await tick();
 const html=r.h.view({parts:{}});
 assert.match(html,/Cuota interna: 22 de 30 consultas disponibles/);
 assert.match(html,/Distribuir misión/);
 assert.doesNotMatch(html,/data-ch-hq-ai-run="next"/);
 assert.equal(invoked,0);
});


test('HQ staged SQL preserves prior quota and protects the mission and sector relation',()=>{
 const sql=readFileSync('docs/hq-staged-delegation-migration.sql','utf8');
 assert.match(sql,/unique index hq_one_sector_per_mission/);
 assert.match(sql,/require_creator\(\)/);
 assert.match(sql,/pg_advisory_xact_lock/);
 assert.match(sql,/sum\(quota_units\)/);
 assert.match(sql,/quota_units=8/);
 assert.match(sql,/Sectores pendientes/);
 assert.match(sql,/revoke all on function public.gestlok_hq_delegate_mission/);
 const backend=readFileSync('supabase/functions/gestlok-hq-agent/index.ts','utf8');
 assert.match(backend,/Array.isArray\(claim.entries\)/);
 assert.match(backend,/if\(!staged\)for/);
});


test('HQ autonomous worker is opt-in, has a server-only credential and observes public evidence',()=>{
 const sql=readFileSync('docs/hq-autonomous-worker-migration.sql','utf8');
 const schedule=readFileSync('docs/hq-autonomous-worker-schedule.sql','utf8');
 const worker=readFileSync('supabase/functions/gestlok-hq-worker/index.ts','utf8');
 assert.match(sql,/auto_enabled boolean not null default false/);
 assert.match(sql,/require_creator\(\)/);
 assert.match(sql,/sum\(quota_units\)/);
 assert.match(sql,/pg_try_advisory_xact_lock/);
 assert.match(sql,/state='working' and created_at<now\(\)-interval '15 minutes'/);
 assert.match(sql,/revoke all on function public.gestlok_hq_worker_claim\(text\) from public,anon,authenticated/);
 assert.match(sql,/grant execute on function public.gestlok_hq_worker_claim\(text\) to service_role/);
 assert.match(schedule,/vault.decrypted_secrets/);
 assert.match(worker,/auth.error\|\|auth.data!==true/);
 assert.match(worker,/GESTLOK_HQ_GROQ_FREE_API_KEY/);
 assert.match(worker,/No se confirma|No se confirmó/);
 assert.doesNotMatch(worker,/api\.openai\.com/);
 assert.match(source,/Autorizar trabajo autónomo/);
 assert.match(source,/Pausar trabajo autónomo/);
 assert.match(source,/gestlok_hq_support_status/);
 assert.match(source,/No acredita pruebas autenticadas/);
});


test('HQ Facundo displays recorded server evidence and never starts an AI run on entry',async()=>{
 const status={worker:{last_tick:new Date().toISOString(),paused_until:null},checks:[{checked_at:new Date().toISOString(),conclusion:'Sin alerta pública observada',detail:'<evidencia> HTTP 200'}]};
 let calls=0;
 const r=load(async fn=>({data:fn==='gestlok_hq_support_status'?status:['gestlok_hq_list_tasks','gestlok_hq_list_runs'].includes(fn)?[]:DASH}),{invoke:async()=>{calls++;return {data:{configured:true,verified:true}};}});
 r.h.mode();await tick();await tick();r.h.setTab('hq');await tick();await tick();
 const html=r.h.view({parts:{}});
 assert.match(html,/Sin alerta pública observada/);
 assert.match(html,/&lt;evidencia&gt; HTTP 200/);
 assert.match(html,/No acredita pruebas autenticadas/);
 assert.equal(calls,0);
});

test('HQ: la jornada diaria se ve en el motor y se pausa solo con confirmación',async()=>{
 let daily=true;const calls=[];let confirmed=false;
 const r=load(async(fn,args)=>{calls.push([fn,args]);
  if(fn==='gestlok_hq_list_tasks'||fn==='gestlok_hq_list_runs')return {data:[]};
  if(fn==='gestlok_hq_pulso')return {data:{sucursales:[],conteo:{},jornada:{activa:daily,ultima:'2026-11-25'},cupo:{limite:40}}};
  if(fn==='gestlok_hq_set_daily'){daily=args.p_enabled;return {data:true};}
  return {data:DASH};},{confirm:()=>confirmed});
 r.h.mode();await tick();await tick();r.h.setTab('hq');await tick();
 r.h.view({parts:{}});await tick();await tick();await tick();
 let html=r.h.view({parts:{}});
 assert.match(html,/Jornada diaria automática: activa/);
 assert.match(html,/Última jornada: 25\/11\/2026/);
 const click=(selector,dataset={})=>r.listeners.click({preventDefault(){},target:{closest:q=>q===selector?{dataset}:null}});
 click('[data-ch-hq-daily]',{enabled:'false'});await tick();
 assert.equal(calls.filter(c=>c[0]==='gestlok_hq_set_daily').length,0);
 confirmed=true;click('[data-ch-hq-daily]',{enabled:'false'});for(let i=0;i<6;i++)await tick();
 assert.equal(JSON.stringify(calls.filter(c=>c[0]==='gestlok_hq_set_daily').map(c=>c[1])),'[{"p_enabled":false}]');
 html=r.h.view({parts:{}});
 assert.match(html,/Jornada diaria automática: pausada/);
 assert.match(html,/Activar jornada diaria/);
});

test('HQ: si Groq pide esperar, la tarea sigue pendiente, no se gasta cupo y se informa',async()=>{
 const rows=[{id:'t-1',agent:'datos',instruction:'Comparar locales',status:'pendiente',created_at:DASH.generated_at}];
 const r=load(async fn=>({data:fn==='gestlok_hq_list_tasks'?rows:fn==='gestlok_hq_list_runs'?[]:DASH}),{invoke:async(name,o)=>o.body.action==='status'?{data:{configured:true,verified:true}}:{data:{ok:false,state:'released',diagnostic:'Cuota gratuita o límite temporal de Groq alcanzado (429). La tarea sigue pendiente y no se gastó cupo.'}}});
 const click=(selector,dataset={})=>r.listeners.click({preventDefault(){},target:{closest:q=>q===selector?{dataset}:null}});
 r.h.mode();await tick();await tick();r.h.setTab('hq');await tick();
 click('[data-ch-hq-ai-status]');await tick();await tick();
 click('[data-ch-hq-ai-run]',{chHqAiRun:'t-1'});for(let i=0;i<6;i++)await tick();
 const html=r.h.view({parts:{}});
 assert.match(html,/límite temporal de Groq alcanzado \(429\)\. La tarea sigue pendiente y no se gastó cupo/);
 assert.match(html,/data-ch-hq-ai-run="t-1"/);
});

test('HQ: el trabajo diario es opt-out, de solo lectura y respeta el plan gratuito',()=>{
 const sql=readFileSync('supabase/migrations/20261125160000_gestlok_hq_trabajo_diario.sql','utf8');
 const worker=readFileSync('supabase/functions/gestlok-hq-worker/index.ts','utf8');
 const agent=readFileSync('supabase/functions/gestlok-hq-agent/index.ts','utf8');
 assert.match(sql,/revoke all on function gestlok_hq_private\.daily_mission\(\) from public, anon, authenticated/);
 assert.match(sql,/function gestlok_hq_private\.set_daily\(p_enabled boolean\)[\s\S]*require_creator\(\)/);
 assert.match(sql,/grant execute on function public\.gestlok_hq_release_run\(uuid, uuid\) to service_role/);
 assert.doesNotMatch(sql,/grant execute on function public\.gestlok_hq_release_run\(uuid, uuid\) to authenticated/);
 assert.match(sql,/grant execute on function public\.gestlok_hq_worker_pulso\(text\) to service_role/);
 assert.match(sql,/\+units>40/);
 assert.match(sql,/>=40 then return null/);
 assert.match(sql,/perform gestlok_hq_private\.daily_mission\(\)/);
 assert.match(sql,/hora < 8/);
 assert.match(sql,/t\.auto_enabled\) then return null/);
 assert.match(sql,/schedule := '\*\/10 \* \* \* \*'/);
 assert.match(worker,/gestlok_hq_worker_pulso/);
 assert.match(worker,/gestlok_hq_release_run/);
 assert.match(worker,/si un dato no está, decilo y no lo inventes/);
 assert.match(agent,/gestlok_hq_release_run/);
 assert.match(agent,/state:"released"/);
 assert.doesNotMatch(worker+agent,/api\.openai\.com/);
});

test('HQ: cada empleado tiene un límite diario y el plan gratuito nunca se agota',async()=>{
 const now=new Date().toISOString();
 const rows=[...[1,2,3,4].map(i=>({id:'d'+i,agent:'datos',instruction:'Métrica '+i,status:'cerrada',created_at:now})),{id:'d5',agent:'datos',instruction:'Otra',status:'pendiente',created_at:now}];
 const runs=[1,2,3,4].map(i=>({task_id:'d'+i,state:'review',result:'ok',quota_units:1,created_at:now}));
 let invoked=0;
 const r=load(async fn=>({data:fn==='gestlok_hq_list_tasks'?rows:fn==='gestlok_hq_list_runs'?runs:DASH}),{invoke:async(n,o)=>{if(o.body.action!=='status')invoked++;return {data:{configured:true,verified:true}};}});
 const click=(selector,dataset={})=>r.listeners.click({preventDefault(){},target:{closest:q=>q===selector?{dataset}:null}});
 r.h.mode();await tick();await tick();r.h.setTab('hq');await tick();
 click('[data-ch-hq-ai-status]');await tick();await tick();
 let html=r.h.view({parts:{}});
 assert.match(html,/Santiago 4\/4/);
 assert.match(html,/Alex 0\/8/);
 assert.match(html,/30 consultas para todo el equipo, 4 por empleado \(Alex 8\)/);
 click('[data-ch-hq-ai-run]',{chHqAiRun:'d5'});await tick();await tick();
 html=r.h.view({parts:{}});
 assert.match(html,/Límite diario de Santiago: 4 consultas por 24 horas \(plan gratuito\)/);
 assert.equal(invoked,0);
 const sql=readFileSync('supabase/migrations/20261125170000_gestlok_hq_limites_plan_gratis.sql','utf8');
 assert.match(sql,/'consultas_dia', 30, 'por_empleado', 4, 'alex', 8/);
 assert.match(sql,/'tokens_dia', 150000/);
 assert.match(sql,/Límite diario de este empleado/);
 assert.match(sql,/exception when sqlstate '22023' then return null/);
 assert.match(sql,/grant execute on function public\.gestlok_hq_record_tokens\(uuid, uuid, integer\) to service_role/);
 assert.doesNotMatch(sql,/gestlok_hq_record_tokens\(uuid, uuid, integer\) to authenticated/);
 for(const f of ['supabase/functions/gestlok-hq-agent/index.ts','supabase/functions/gestlok-hq-worker/index.ts'])assert.match(readFileSync(f,'utf8'),/gestlok_hq_record_tokens/);
});

test('HQ: un informe esperando aprobación no frena la jornada diaria',()=>{
 const sql=readFileSync('supabase/migrations/20261125180000_gestlok_hq_jornada_no_bloquea.sql','utf8');
 assert.match(sql,/t\.auto_enabled\s+and not exists\(select 1 from gestlok_hq_private\.agent_runs r where r\.task_id = t\.id\)\) then return null/);
 assert.match(sql,/revoke all on function gestlok_hq_private\.daily_mission\(\) from public, anon, authenticated/);
});

test('HQ: Marketing de GESTLOK Chat y Soporte general trabajan con datos reales y solo canales gratis',async()=>{
 const office=await import('../public/stock/gestlok-hq-office.mjs');
 const ids=office.TEAM.map(p=>p.id);
 assert.ok(ids.includes('difusion')&&ids.includes('soporte_general'));
 assert.equal(office.TEAM.length,10);
 const pulse={sucursales:[],conteo:{},
  plataforma:{empresas_chat:2,altas_pendientes:1,gerentes_pendientes:0,mensajes_web_sin_leer:2,suscripciones_en_mora:0,suscripciones_pendientes:0,locales_sin_carta:1},
  difusion:[{id:'instagram',nombre:'Instagram de GESTLOK',url:'https://www.instagram.com/',estado:'publicado',prioridad:1,como:'Perfil gratis'},
   {id:'capterra',nombre:'Capterra',url:'https://www.capterra.es/company/vendors',estado:'pendiente',prioridad:2,como:'Listado básico gratis'},
   {id:'search-console',nombre:'Google Search Console',url:'https://search.google.com/search-console',estado:'pendiente',prioridad:1,como:'Alta gratis del sitio'}]};
 const ins=office.buildInsights({pulse,now:'2026-11-25T15:00:00Z'});
 assert.ok(ins.some(i=>i.agent==='soporte_general'&&i.level===3&&/1 comercio espera el alta/.test(i.text)));
 assert.ok(ins.some(i=>i.agent==='soporte_general'&&/2 mensajes del formulario de gestlok\.com\.ar sin leer/.test(i.text)&&i.idea));
 assert.ok(ins.some(i=>i.agent==='soporte_general'&&/1 local de GESTLOK Chat no tiene productos activos/.test(i.text)));
 assert.ok(ins.some(i=>i.agent==='difusion'&&/1 sitio publicado y 2 pendientes, todos gratis/.test(i.text)));
 assert.ok(ins.some(i=>i.agent==='difusion'&&/Próximo sitio para publicar GESTLOK Chat: Google Search Console/.test(i.text)));
 const sql=readFileSync('supabase/migrations/20261125190000_gestlok_hq_marketing_soporte_general.sql','utf8');
 assert.match(sql,/'difusion','soporte_general','lider'/);
 assert.match(sql,/revoke all on gestlok_hq_private\.difusion_canales from public, anon, authenticated/);
 assert.match(sql,/function gestlok_hq_private\.difusion_estado[\s\S]*require_creator\(\)/);
 assert.match(sql,/revoke all on function gestlok_hq_private\.pulso_plataforma\(\) from public, anon, authenticated/);
 assert.doesNotMatch(sql.slice(sql.indexOf('pulso_plataforma() returns'),sql.indexOf('pulso_difusion() returns')),/payer_email|email|telefono|nombre_publico|mp_preapproval/);
 const seeds=[...sql.matchAll(/^ \('([a-z0-9-]+)', '[^']+', '([^']+)'/gm)];
 assert.ok(seeds.length>=10);
 for(const [,,url] of seeds)assert.match(url,/^https:\/\//);
 assert.doesNotMatch(sql,/costo[^\n]*\$|USD|pago por clic es obligatorio/);
 assert.match(sql,/Google no admite empresas que solo operan online/);
 assert.match(sql,/\('difusion', 'Valentina · Marketing de GESTLOK Chat/);
 assert.match(sql,/\('soporte_general', 'Lucas · Soporte general/);
 assert.match(sql,/creator_id=p_user\)<7 or exists/);
 assert.match(sql,/t\.auto_enabled\s+and not exists\(select 1 from gestlok_hq_private\.agent_runs r where r\.task_id = t\.id\)\) then return null/);
 for(const f of ['supabase/functions/gestlok-hq-agent/index.ts','supabase/functions/gestlok-hq-worker/index.ts']){
  const code=readFileSync(f,'utf8');
  assert.match(code,/difusion:"Valentina · Marketing de GESTLOK Chat/);
  assert.match(code,/soporte_general:"Lucas · Soporte general de GESTLOK/);
  assert.match(code,/no compr\w+ publicidad ni publi\w+ nada/);
 }
 const home=readFileSync('public/stock/gestlok-creator-home.js','utf8');
 assert.match(home,/rpc\('gestlok_hq_difusion_estado',\{p_id:id,p_estado:estado\}\)/);
 assert.match(home,/\['pendiente','publicado','descartado'\]\.includes\(estado\)/);
});

test('La administradora tiene seis grupos, y las catorce secciones conservan su destino', async () => {
  const r=load(async fn=>({data:fn==='gestlok_creator_dashboard'?DASH:[],error:null}));
  r.window.GestLokContactoWeb={unread:()=>3};
  r.h.mode();await tick();await tick();
  const rendered=r.h.view({pending:2,parts:{}});
  const main=rendered.match(/<nav class="gl-ch-nav gl-ch-group-nav"[^>]*>(.*?)<\/nav>/s)?.[1];
  assert.ok(main);
  assert.deepEqual([...main.matchAll(/data-ch-group="([^"]+)"/g)].map(x=>x[1]),['inicio','locales','gestlok-chat','wai','hq','herramientas']);
  assert.match(main,/Comercios<\/span><b>2<\/b>/);
  assert.match(main,/Oficina<\/span><b>3<\/b>/);
  assert.match(rendered,/Accesos frecuentes/);
  assert.match(rendered,/Habilitación GESTLOK Chat/);
  assert.match(rendered,/<details class="gl-ch-admin-more">/);
  for (const [members,group] of [[['locales','empresas','usuarios','empleados'],'Comercios'],[['gestlok-chat','habilitacion','chat-prueba'],'GESTLOK Chat'],[['hq','contacto','resenas'],'Oficina'],[['herramientas','nfc'],'Herramientas']]) {
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


test('HQ: conversa en privado y en reunión, separa las salas y conserva las respuestas reales',async()=>{
 const tasks=[],runs=[],calls=[];let accepted=true;
 const rpc=async(fn,args)=>{
  if(fn==='gestlok_hq_list_tasks')return {data:tasks.slice()};
  if(fn==='gestlok_hq_list_runs')return {data:runs.slice()};
  if(fn==='gestlok_hq_add_task'){const id='c'+(tasks.length+1);tasks.unshift({id,agent:args.p_agent,instruction:args.p_instruction,status:'pendiente',created_at:new Date().toISOString()});return {data:id};}
  if(fn==='gestlok_hq_close_task'){tasks.find(t=>t.id===args.p_id).status=args.p_status;return {data:true};}
  return {data:DASH};
 };
 const r=load(rpc,{confirm:()=>accepted,invoke:async(name,o)=>{
  if(o.body.action==='status')return {data:{configured:true,verified:true}};
  calls.push(o.body);runs.unshift({task_id:o.body.task_id,state:'review',result:'Respuesta de IA <'+o.body.task_id+'>',quota_units:1,created_at:new Date().toISOString()});
  return {data:{state:'review'}};
 }});
 const click=(sel,dataset={})=>r.listeners.click({preventDefault(){},target:{closest:q=>q===sel?{dataset}:null}});
 const submit=message=>r.listeners.submit({preventDefault(){},target:{matches:q=>q==='[data-hq-chat-form]',querySelector:()=>({value:message})}});
 const wait=async()=>{for(let i=0;i<7;i++)await tick();};
 r.h.mode();await wait();r.h.setTab('hq');await wait();
 click('[data-ch-hq-ai-status]');await wait();
 click('[data-ch-hq-leader]');await wait();
 accepted=false;submit('No se envía');await wait();assert.equal(tasks.length,0);
 accepted=true;submit('Pregunta privada de Alex');await wait();
 assert.equal(tasks.length,1);assert.equal(tasks[0].agent,'lider');assert.equal(tasks[0].status,'cerrada');
 assert.deepEqual(JSON.parse(tasks[0].instruction.slice('HQ_CHAT_V1\n'.length)),{mode:'private',message:'Pregunta privada de Alex'});
 assert.equal(calls.length,1);assert.equal(calls[0].action,'chat');
 assert.match(r.h.view({parts:{}}),/Respuesta de IA &lt;c1&gt;/);
 click('[data-ch-hq-agent]',{chHqAgent:'testing'});click('[data-ch-hq-room]',{chHqRoom:'private'});
 assert.doesNotMatch(r.h.view({parts:{}}),/Pregunta privada de Alex/);
 click('[data-hq-chat-open]',{hqChatOpen:'meeting'});
 assert.match(r.h.view({parts:{}}),/Sala de reuniones/);
 assert.doesNotMatch(r.h.view({parts:{}}),/Pregunta privada de Alex/);
 // The user selects a recipient using the meeting select (the document's earlier listener).
 submit('Pregunta pública de la reunión');await wait();
 assert.equal(calls.length,2);assert.equal(JSON.parse(tasks[0].instruction.slice('HQ_CHAT_V1\n'.length)).mode,'meeting');
 assert.match(r.h.view({parts:{}}),/Pregunta pública de la reunión/);
 click('[data-ch-hq-leader]');
 assert.doesNotMatch(r.h.view({parts:{}}),/Pregunta pública de la reunión/);
 assert.match(r.h.view({parts:{}}),/Pregunta privada de Alex/);
});

test('HQ: avatares humanos, ampliación de la oficina y cupo servidor exclusivo',async()=>{
 const office=await import('../public/stock/gestlok-hq-office.mjs');
 assert.equal(office.TEAM.length,10);assert.ok(office.TEAM.every(p=>p.avatar==='Humano'&&p.skin&&p.hair&&p.shirt));
 const c={fillStyle:'',fillRect(){}};
 for(const p of office.TEAM)office.__test.drawPerson(c,p,{x:24,y:24,t:0,dir:'down'});
 const js=readFileSync('public/stock/gestlok-hq-office.mjs','utf8');
 assert.match(js,/data-hqo-private/);assert.match(js,/onMeeting/);assert.match(js,/width:max\(100%,720px\)/);
 const sql=readFileSync('supabase/migrations/20261127031100_gestlok_hq_conversation.sql','utf8');
 assert.match(sql,/pg_advisory_xact_lock/);assert.match(sql,/values\(p_task,p_user,1\)/);
 assert.match(sql,/revoke all on function public\.gestlok_hq_claim_chat\(uuid,uuid\) from public,anon,authenticated/);
 assert.match(sql,/grant execute on function public\.gestlok_hq_claim_chat\(uuid,uuid\) to service_role/);
 assert.match(sql,/tokens_usados/);
});


test('WAI comercial: panel exclusivo, lectura real y controles por empresa y local',async()=>{
 const data=[{tenant:'a',local_id:'uno',slug:'a-uno',empresa:'A',nombre:'Munro',rubro:'gastronomia',activo:true,numeros:[{id:'n1',numero:'+5491100000001',registrado:true,activo:true,estado:'conectado'}]},{tenant:'b',local_id:'uno',slug:'b-uno',empresa:'B',nombre:'Torcuato',activo:false,numeros:[]}];
 const org=[{tenant:'a',local_id:'uno',responsable_id:'o1',responsable:'Dueña A',plantilla:true,duenos:[{id:'o1',nombre:'Dueña A'}]},{tenant:'b',local_id:'uno',duenos:[]}];
 const r=load(async fn=>({data:fn==='gestlok_creator_dashboard'?DASH:fn==='gestlok_chat_wai_admin_organizacion'?org:data}));
 r.h.mode();await tick();await tick();r.h.setTab('wai');r.h.view({parts:{}});await tick();
 const html=r.h.view({parts:{}});
 assert.match(html,/GESTLOK WAI · Prueba/);assert.match(html,/Empresa A/);assert.match(html,/Dueño: Dueña A/);assert.match(html,/Configuración base de empresa/);assert.match(html,/href="\/chat\/wai\/prueba\/"/);assert.match(html,/href="\/wai\/"/);assert.match(html,/1 activos · 1 inactivos/);assert.match(html,/Munro/);assert.match(html,/Torcuato/);assert.match(html,/Gastronomía/);assert.match(html,/wai-a-uno.gestlok.com.ar/);assert.match(html,/Abrir local · ajustes y QR/);
 r.listeners.click({preventDefault(){},target:{closest:s=>s==='[data-wai-commercial]'?{dataset:{waiCommercial:'numero',row:'0',number:'0'}}:null}});await tick();
 const i=r.calls.lastIndexOf('gestlok_chat_wai_admin_comercial');assert.equal(r.argsLog[i].p_tenant,'a');assert.equal(r.argsLog[i].p_local,'uno');assert.equal(r.argsLog[i].p_id,'n1');assert.equal(r.argsLog[i].p_activo,false);
 const other=load(async()=>({data:DASH}),{email:'other@example.com'});other.h.mode();await tick();other.h.setTab('wai');assert.notEqual(other.h.tab(),'wai');assert.doesNotMatch(other.h.view({parts:{}}),/data-ch-tab="wai"/);
});

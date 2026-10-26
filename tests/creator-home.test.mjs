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
function load(rpc, {creadora = true, permanent = false} = {}) {
  const listeners = {}, calls = [], store = new Map();
  let renders = 0;
  const window = {GestLokCreatorMode: {state: () => ({permanent})}, sessionStorage: {getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: k => store.delete(k)}, scrollTo() {}, GestLokSupabase: {rpc: async fn => { calls.push(fn); return rpc(fn); }}};
  const document = {addEventListener(n, f) { listeners[n] = f; }, visibilityState: 'visible'};
  vm.runInNewContext(source, {window, document, setInterval: () => 0, clearInterval() {}, Date});
  const h = window.GestLokCreatorHome;
  h.attach({S: {me: {email: 'kmu15lopez@gmail.com', tenant_id: 't-1'}}, isCreadora: () => creadora, render: () => { renders++; }});
  return {h, calls, listeners, renders: () => renders, store};
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
  for (const t of ['Empresas activas', 'Usuarios totales', 'Personas en Empleados', '2 de 2', 'Crecimiento de GESTLOK', 'Personas por rol', 'Estado de la plataforma', '3 invitaciones sin ingresar', 'Todo en orden', 'Ingresaste vos', 'Espacio de empleados creado']) assert.ok(html.includes(t), t);
  assert.ok(!/Suscripcion|Planes|Enterprise|Profesional/i.test(html));
  assert.ok(html.includes('Perfumes &lt;b&gt;') && !html.includes('Perfumes <b>'));
  assert.ok(html.includes('26/09') && html.includes('26/10'));
  assert.ok(html.includes('Tu empresa'));
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
  assert.ok(html.includes('Para revisar') && html.includes('Edición habilitada') && html.includes('consulta de empresa abierta'));
});

test('El panel central informa edición permanente sin pedir cerrarla', async () => {
 const r=load(async()=>({data:DASH,error:null}),{permanent:true});
 r.h.mode(); await tick(); await tick();
 const html=r.h.view({pending:0,parts:{}});
 assert.match(html,/Edición de creadora sin límite de tiempo/);
 assert.doesNotMatch(html,/Tu cuenta está en solo lectura|cerrala al terminar/);
});

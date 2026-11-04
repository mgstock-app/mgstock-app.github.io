// Caja diaria exclusiva por empresa (pedido #200): base (PGlite), pantalla y conexión con la app.
// Las pruebas de concurrencia con sesiones simultáneas están en tests/db/ (PostgreSQL real).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {PGlite} from '@electric-sql/pglite';

const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const MIGRATION = 'supabase/migrations/20261101190000_gestlok_caja_diaria_empresa.sql';
const PERF = '2a97bf8d-7d08-4aa7-b051-5d1a4dc80103';
const MG = 'cb0dc04a-9a13-434f-a3d0-47f1d8f39670';

test('Base: reglas, seguridad, cierre automático y RLS por empresa (PGlite)', async () => {
  const db = new PGlite();
  try {
    await db.exec(read('tests/fixtures/caja-diaria/base.sql'));
    await db.exec(read(MIGRATION));
    // Como psql: cada bloque en su propia transacción.
    const blocks = read('tests/fixtures/caja-diaria/logica.sql').match(/^do \$\$[\s\S]*?^end \$\$;/gm);
    assert(blocks.length >= 11, 'Se esperaban los 11 bloques de la prueba');
    for (const block of blocks) await db.exec(block);
    const empresas = await db.query('select tenant_id::text as t from gestlok_caja_private.empresas order by 1');
    assert.deepEqual(empresas.rows.map(r => r.t), [PERF, '33333333-3333-4333-8333-333333333333']);
  } finally { await db.close(); }
});

test('Migración: sin tocar Mi Gusto, sin foto, sin permisos anónimos y con cierre 23:59 en el servidor', () => {
  const sql = read(MIGRATION);
  assert.match(sql, /constraint gl_caja_un_turno_por_dia unique \(tenant_id, dia\)/);
  assert.match(sql, /check \(metodo in \('efectivo','transferencia'\)\)/);
  assert.match(sql, /\(p_dia \+ time '23:59'\) at time zone 'America\/Argentina\/Buenos_Aires'/);
  assert.match(sql, /cron\.schedule\('gestlok-caja-diaria-cierre-2359-ar', '59 \* \* \* \*'/);
  assert.match(sql, /revoke all on schema gestlok_caja_private from public, anon, authenticated/);
  assert.match(sql, /revoke all on all functions in schema gestlok_caja_private from public, anon, authenticated/);
  assert.doesNotMatch(sql, /\bgrant\b[^;]*\bto\s+anon\b/i);
  assert.doesNotMatch(sql, /^\s*(foto|photo|imagen|archivo)\w*\s+(text|bytea|jsonb|uuid)/im, 'Sin columnas de foto');
  // Ningún cambio sobre tablas o funciones existentes (Mi Gusto, docs, Pagos Online).
  assert.doesNotMatch(sql, /(alter|update|delete from|insert into|drop)\s+(table\s+)?public\.docs/i);
  assert.doesNotMatch(sql, /gestlok_mg_online|mi_gusto/i);
  assert.doesNotMatch(sql, /create or replace function public\.(mi_rol|mi_acceso|puede_editar_local)/i);
  assert.doesNotMatch(sql, new RegExp(MG));
  // Todas las funciones privilegiadas fijan search_path vacío.
  for (const fn of sql.match(/create function [\s\S]*?\$\$;/g)) assert.match(fn, /set search_path = ''/, fn.slice(0, 80));
  // No guarda el email de la solicitante en el repositorio público.
  assert.doesNotMatch(sql + read('public/stock/gestlok-caja-diaria.js'), /camilab\.lopez99|@gmail\.com/i);
});

function client({role = 'dueno', tenant = PERF, rpc} = {}) {
  const listeners = {}, renders = [];
  const document = {addEventListener: (n, f) => { listeners[n] = f; }, querySelector: () => null, body: {classList: {add() {}, remove() {}}}, visibilityState: 'visible'};
  const window = {GestLokSupabase: {rpc: rpc || (async () => ({data: {habilitada: false}, error: null}))}};
  runInNewContext(read('public/stock/gestlok-caja-diaria.js'), {window, document, navigator: {onLine: true}, Intl, Date, Math, Number, String, Object, Array, JSON, Uint8Array, globalThis: {}, setInterval, clearInterval, console});
  const mod = window.GestLokCajaDiaria;
  const host = {S: {me: {tenant_id: tenant}, offline: false}, role: () => role, render: () => renders.push(1)};
  return {mod, host, renders, listeners};
}

test('Pantalla: solo aparece cuando el servidor habilita la empresa de la sesión', async () => {
  const calls = [];
  const ok = client({rpc: async name => { calls.push(name); return {data: {habilitada: true, tenant_id: PERF, hoy: '2026-11-01'}, error: null}; }});
  await ok.mod.refresh(ok.host);
  assert.deepEqual(calls, ['gestlok_caja_acceso']);
  assert.match(ok.mod.homeTile(), /data-caja-open/);
  assert(ok.mod.permitido());
  await ok.mod.refresh(ok.host);
  assert.equal(calls.length, 1, 'No repite la consulta para la misma empresa y rol');

  // Mi Gusto: el servidor dice que no → no hay tarjeta.
  const mg = client({tenant: MG});
  await mg.mod.refresh(mg.host);
  assert.equal(mg.mod.homeTile(), '');
  // El servidor responde con otra empresa: se descarta.
  const raro = client({rpc: async () => ({data: {habilitada: true, tenant_id: MG}, error: null})});
  await raro.mod.refresh(raro.host);
  assert.equal(raro.mod.homeTile(), '');
  // Error de red o permiso: nada visible.
  const roto = client({rpc: async () => ({data: null, error: {code: '42501', message: 'Sin permiso'}})});
  await roto.mod.refresh(roto.host);
  assert.equal(roto.mod.homeTile(), '');
  // Roles sin caja: ni siquiera consulta.
  for (const role of ['lectura', 'colaborador', 'creadora', '']) {
    const asked = [];
    const c = client({role, rpc: async n => { asked.push(n); return {data: {habilitada: true, tenant_id: PERF}, error: null}; }});
    await c.mod.refresh(c.host);
    assert.equal(c.mod.homeTile(), '', role);
    assert.equal(asked.length, 0, role);
  }
  // Gerente habilitado por el servidor.
  const ger = client({role: 'gerente', rpc: async () => ({data: {habilitada: true, tenant_id: PERF}, error: null})});
  await ger.mod.refresh(ger.host);
  assert.match(ger.mod.homeTile(), /Caja diaria|CAJA DIARIA/);
});

test('GESTLOK Caja: reemplaza la caja diaria solo donde el servidor la habilita', async () => {
  // Perfumes: caja diaria apagada y GESTLOK Caja habilitada → acceso a /caja/ con el alta precargada.
  const calls = [];
  const app = client({rpc: async name => {
    calls.push(name);
    return name === 'gestlok_caja_app_acceso'
      ? {data: {habilitada: true, tenant_id: PERF, url: '/caja/', locales: ['Belisa Parfum'], yo: 'Camila'}, error: null}
      : {data: {habilitada: false}, error: null};
  }});
  await app.mod.refresh(app.host);
  assert.deepEqual(calls, ['gestlok_caja_acceso', 'gestlok_caja_app_acceso']);
  const tile = app.mod.homeTile();
  assert.match(tile, /GESTLOK CAJA/);
  assert.match(tile, /href="\/caja\/\?desde=gestlok&amp;comercio=Belisa%20Parfum&amp;local=Belisa%20Parfum&amp;yo=Camila"/);
  assert.doesNotMatch(tile, /data-caja-open/, 'No muestra la caja diaria');
  assert(app.mod.appPermitida());
  assert(!app.mod.permitido());
  await app.mod.refresh(app.host);
  assert.equal(calls.length, 2, 'No repite las consultas para la misma empresa y rol');

  // Si la empresa sigue con la caja diaria, no se pregunta por GESTLOK Caja.
  const diaria = [];
  const d = client({rpc: async name => { diaria.push(name); return {data: {habilitada: true, tenant_id: PERF}, error: null}; }});
  await d.mod.refresh(d.host);
  assert.deepEqual(diaria, ['gestlok_caja_acceso']);
  assert.match(d.mod.homeTile(), /data-caja-open/);

  // Mi Gusto (ambas dicen que no), otra empresa en la respuesta, errores y roles sin caja: nada visible.
  const mg = client({tenant: MG});
  await mg.mod.refresh(mg.host);
  assert.equal(mg.mod.homeTile(), '');
  const otra = client({rpc: async name => ({data: name === 'gestlok_caja_app_acceso' ? {habilitada: true, tenant_id: MG} : {habilitada: false}, error: null})});
  await otra.mod.refresh(otra.host);
  assert.equal(otra.mod.homeTile(), '');
  const roto = client({rpc: async name => (name === 'gestlok_caja_app_acceso' ? {data: null, error: {code: '42501', message: 'Sin permiso'}} : {data: {habilitada: false}, error: null})});
  await roto.mod.refresh(roto.host);
  assert.equal(roto.mod.homeTile(), '');
  for (const role of ['lectura', 'colaborador', '']) {
    const c = client({role, rpc: async () => ({data: {habilitada: true, tenant_id: PERF}, error: null})});
    await c.mod.refresh(c.host);
    assert.equal(c.mod.homeTile(), '', role);
  }
  // Nombres raros no rompen el enlace.
  const raro = client({rpc: async name => ({data: name === 'gestlok_caja_app_acceso' ? {habilitada: true, tenant_id: PERF, locales: ['Local "1" & <b>'], yo: 'Ana'} : {habilitada: false}, error: null})});
  await raro.mod.refresh(raro.host);
  assert.doesNotMatch(raro.mod.homeTile(), /<b>|"1"/);
});

test('GESTLOK Caja: migración sin permisos anónimos, sin tocar Mi Gusto y sin habilitar a nadie por sí sola', () => {
  const sql = read('supabase/migrations/20261102130000_gestlok_caja_app_por_empresa.sql');
  assert.doesNotMatch(sql, /\bgrant\b[^;]*\bto\s+anon\b/i);
  assert.match(sql, /revoke all on function public\.gestlok_caja_app_acceso\(\) from public, anon;/);
  assert.match(sql, /revoke all on table gestlok_caja_private\.caja_app_empresas from public, anon, authenticated;/);
  assert.doesNotMatch(sql, /^\s*(insert|update|delete)\b/im, 'La migración no cambia datos');
  assert.doesNotMatch(sql, /(alter|drop)\s+(table|function)\s+(public\.docs|gestlok_caja_private\.empresas|public\.gestlok_caja_(acceso|estado|abrir))/i);
  assert.doesNotMatch(sql, new RegExp(MG));
  assert.doesNotMatch(sql, /gestlok_mg_online|mi_gusto/i);
  for (const fn of sql.match(/create function [\s\S]*?\$\$;/g)) assert.match(fn, /set search_path = ''/, fn.slice(0, 80));
  const op = read('supabase/operaciones/gestlok-caja-app-perfumes.sql');
  assert.doesNotMatch(op, /delete|drop|truncate/i, 'La operación no borra nada');
  assert.doesNotMatch(op, new RegExp(MG));
  assert.equal((op.match(/2a97bf8d-7d08-4aa7-b051-5d1a4dc80103/g) || []).length >= 2, true);
  assert.doesNotMatch(sql + op, /camilab\.lopez99|@gmail\.com/i);
});

test('Importes en formato argentino y fechas sin corrimiento de zona', () => {
  const {mod} = client();
  const p = mod._test.parseMonto;
  assert.equal(p('1.500,50'), 1500.5);
  assert.equal(p('$ 2.000'), 2000);
  assert.equal(p('1500.50'), 1500.5);
  assert.equal(p('15000'), 15000);
  assert.equal(p('1.234.567,89'), 1234567.89);
  for (const bad of ['', '0', '-5', '1,005', 'abc', '10000000000', '1.5.5']) assert.equal(p(bad), null, bad);
  assert.equal(mod._test.fecha('2026-11-01'), '01/11/2026');
  assert.equal(mod._test.fecha('2026-11-01', true), 'Domingo 01/11/2026');
  assert.match(mod._test.newOp(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('Vista del día: abierta, cerrada sin reabrir y sin foto', async () => {
  const {mod, host} = client({rpc: async () => ({data: {habilitada: true, tenant_id: PERF}, error: null})});
  await mod.refresh(host);
  const base = {tenant_id: PERF, hoy: '2026-11-01', puede_abrir: false, historial: []};
  mod._test.setEstado({...base, puede_abrir: true, turno: null});
  let html = mod._test.vistaHoy();
  assert.match(html, /id="gl-caja-abrir"/);
  assert.match(html, /name="responsable" required minlength="2"/);
  const abierta = {id: 't1', dia: '2026-11-01', estado: 'abierto', responsable: 'Ana', efectivo: 1500.5, transferencia: 2000, total: 3500.5, ventas: 2,
    movimientos: [{id: 'm1', metodo: 'efectivo', monto: 1500.5, nota: '', registrado_at: '2026-11-01T15:00:00Z', anulado: false},
      {id: 'm2', metodo: 'transferencia', monto: 2000, nota: 'perfume', registrado_at: '2026-11-01T16:00:00Z', anulado: false}]};
  mod._test.setEstado({...base, turno: abierta});
  html = mod._test.vistaHoy();
  assert.match(html, /id="gl-caja-venta" autocomplete="off"/);
  assert.match(html, /value="efectivo" checked/);
  assert.match(html, /value="transferencia"/);
  assert.match(html, /data-caja-cerrar /);
  assert.match(html, /data-caja-anular="m1"/);
  assert.match(html, /name="operacion" value="[0-9a-f-]{36}"/);
  assert.match(html, /1\.500,50/);
  assert.match(html, /3\.500,50/);
  assert.doesNotMatch(html, /type="file"|foto|cámara|camera/i);
  mod._test.setEstado({...base, turno: {...abierta, estado: 'cerrado', tipo_cierre: 'automatico', cerrado_at: '2026-11-02T02:59:00Z'}});
  html = mod._test.vistaHoy();
  assert.match(html, /Caja cerrada/);
  assert.match(html, /Cierre automático a las 23:59/);
  assert.match(html, /no se reabre/);
  assert.doesNotMatch(html, /data-caja-cerrar |id="gl-caja-venta"|data-caja-anular|id="gl-caja-abrir"/);
});

test('Conexión con la app sin afectar a otras empresas', () => {
  const runtime = read('components/stock-runtime.tsx'), owner = read('public/stock/gestlok-owner-areas.js');
  assert.match(runtime, /if \(!visitor\) await load\("\/stock\/gestlok-caja-diaria\.js\?rev=caja-integrada-20261104"\)/);
  assert.match(owner, /window\.GestLokCajaDiaria\?\.refresh\?\.\(api\)/);
  assert.match(owner, /const caja=window\.GestLokCajaDiaria\?\.homeTile\?\.\(\)\|\|''/);
  assert.match(owner, /'<\/div>'\+\(isSoloOwner\(\)\?'':caja\)\+pilot\+futurePrices\+/);
  assert.match(owner, /\(window\.GestLokCajaDiaria\?\.homeTile\?\.\(\)\|\|''\)\+\s*\(window\.GestLokUpdates/);
  assert.match(read('app/layout.tsx'), /import "\.\/gestlok-caja-diaria\.css";/);
  assert.match(read('scripts/sw-template.js'), /'\/stock\/gestlok-caja-diaria\.js'/);
  assert.match(read('scripts/audit-live-responsive.mjs'), /'stock\/gestlok-caja-diaria\.js'/);
  // La pantalla no guarda ventas ni importes en el equipo.
  const js = read('public/stock/gestlok-caja-diaria.js');
  assert.doesNotMatch(js, /localStorage|sessionStorage|indexedDB/);
  assert.doesNotMatch(js, /\.from\(/, 'Solo RPC, nunca tablas directas');
  assert.doesNotMatch(read('app/gestlok-caja-diaria.css'), /\.mg-on-|#mg-online|\.gl-owner-landing\s*\{/, 'No cambia estilos de Mi Gusto');
});

// Caja diaria (issue #200) sobre PostgreSQL real: reglas, seguridad y CONCURRENCIA con varias
// sesiones simultáneas (como dos o más equipos). Necesita psql y CAJA_PG_URL, por ejemplo
//   CAJA_PG_URL=postgresql://postgres:postgres@127.0.0.1:5432/postgres node --test tests/db/
// En GitHub Actions corre en el flujo «Caja diaria · PostgreSQL». Sin CAJA_PG_URL se omite.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn, spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const URL_BASE = process.env.CAJA_PG_URL;
const root = fileURLToPath(new URL('../../', import.meta.url));
const DB = 'caja_prueba_' + process.pid;
const PERF = '2a97bf8d-7d08-4aa7-b051-5d1a4dc80103';
const OTRA = '33333333-3333-4333-8333-333333333333';
const skip = !URL_BASE && 'Definí CAJA_PG_URL para correr las pruebas sobre PostgreSQL';

function urlFor(db) {
  const u = new URL(URL_BASE);
  u.pathname = '/' + db;
  return u.toString();
}
function psqlSync(db, args) {
  const r = spawnSync('psql', [urlFor(db), '-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', ...args], {cwd: root, encoding: 'utf8'});
  if (r.status !== 0) throw new Error((r.stderr || r.stdout || 'psql falló').trim());
  return r.stdout.trim();
}
const sql = q => psqlSync(DB, ['-c', q]);
// Una sesión independiente; devuelve la última línea no vacía (el resultado de la RPC) o el error.
function session(q) {
  return new Promise(resolve => {
    const p = spawn('psql', [urlFor(DB), '-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-c', q], {cwd: root});
    let out = '', err = '';
    p.stdout.on('data', d => { out += d; });
    p.stderr.on('data', d => { err += d; });
    p.on('close', code => {
      const lines = out.split('\n').map(x => x.trim()).filter(Boolean);
      resolve(code === 0 ? {ok: true, value: lines.at(-1)} : {ok: false, error: err.trim()});
    });
  });
}
// Todas las sesiones esperan una misma barrera (bloqueo consultivo) y arrancan juntas.
async function together(queries) {
  const holder = spawn('psql', [urlFor(DB), '-X', '-q', '-c', 'select pg_advisory_lock(4200); select pg_sleep(1.5);'], {cwd: root});
  const released = new Promise(r => holder.on('close', r));
  await new Promise(r => setTimeout(r, 400));
  const runs = queries.map(q => session('select pg_advisory_lock_shared(4200); ' + q));
  const results = await Promise.all(runs);
  await released;
  return results;
}
const as = (email, call) => `select prueba.como('${email}'); select (${call})::text;`;

const MAINTENANCE = () => new URL(URL_BASE).pathname.slice(1) || 'postgres';
// Base nueva: funciones de sesión de prueba + migración real, sin cajas.
function fresh() {
  psqlSync(MAINTENANCE(), ['-c', `drop database if exists ${DB} with (force)`, '-c', `create database ${DB}`]);
  psqlSync(DB, ['-f', 'tests/fixtures/caja-diaria/base.sql']);
  psqlSync(DB, ['-f', 'supabase/migrations/20261101190000_gestlok_caja_diaria_empresa.sql']);
  psqlSync(DB, ['-f', 'supabase/migrations/20261102130000_gestlok_caja_app_por_empresa.sql']);
}

test('Caja diaria en PostgreSQL real', {skip}, async t => {
  try {
    await t.test('reglas de negocio y seguridad (cada sentencia en su transacción)', () => {
      fresh();
      assert.match(psqlSync(DB, ['-f', 'tests/fixtures/caja-diaria/logica.sql']), /CAJA DIARIA: OK/);
    });

    await t.test('GESTLOK Caja por empresa: Perfumes la ve, Mi Gusto y el resto no', () => {
      fresh();
      psqlSync(DB, ['-f', 'supabase/operaciones/gestlok-caja-app-perfumes.sql']);
      assert.match(psqlSync(DB, ['-f', 'tests/fixtures/caja-diaria/caja-app.sql']), /GESTLOK CAJA: OK/);
    });

    // Base limpia para la concurrencia, con una segunda empresa habilitada.
    fresh();
    sql(`insert into gestlok_caja_private.empresas (tenant_id) values ('${OTRA}') on conflict do nothing`);

    await t.test('dos o más equipos abren a la vez: una sola caja y una sola apertura', async () => {
      const emails = ['dueno@otra.example'];
      const res = await together(Array.from({length: 8}, (_, i) => as(emails[0], `public.gestlok_caja_abrir('Equipo ${i + 1}')`)));
      assert(res.every(r => r.ok), JSON.stringify(res));
      const nuevos = res.map(r => JSON.parse(r.value)).filter(v => v.nuevo);
      assert.equal(nuevos.length, 1);
      assert.equal(new Set(res.map(r => JSON.parse(r.value).turno.id)).size, 1);
      assert.equal(sql(`select count(*) from gestlok_caja_private.turnos where tenant_id = '${OTRA}' and dia = gestlok_caja_private.dia_ar()`), '1');
      assert.equal(sql(`select count(*) from gestlok_caja_private.auditoria where tenant_id = '${OTRA}' and accion = 'apertura'`), '1');
    });

    const turno = sql(`select id from gestlok_caja_private.turnos where tenant_id = '${OTRA}' and dia = gestlok_caja_private.dia_ar()`);

    await t.test('el mismo envío repetido en paralelo se guarda una sola vez', async () => {
      const op = '9f000000-0000-4000-8000-000000000001';
      const res = await together(Array.from({length: 8}, () => as('dueno@otra.example',
        `public.gestlok_caja_registrar('${turno}', 'efectivo', 250.25, 'doble toque', '${op}')`)));
      assert(res.every(r => r.ok), JSON.stringify(res));
      assert.equal(res.map(r => JSON.parse(r.value)).filter(v => !v.repetida).length, 1);
      assert.equal(sql(`select count(*) from gestlok_caja_private.movimientos where turno_id = '${turno}' and operacion = '${op}'`), '1');
    });

    await t.test('ventas distintas en paralelo: todas se guardan y suman bien', async () => {
      const res = await together(Array.from({length: 10}, (_, i) => as('dueno@otra.example',
        `public.gestlok_caja_registrar('${turno}', '${i % 2 ? 'transferencia' : 'efectivo'}', 100, '', gen_random_uuid())`)));
      assert(res.every(r => r.ok), JSON.stringify(res));
      const s = JSON.parse(sql(as('dueno@otra.example', 'public.gestlok_caja_estado()')).split('\n').at(-1)).turno;
      assert.equal(Number(s.efectivo), 750.25);
      assert.equal(Number(s.transferencia), 500);
      assert.equal(Number(s.total), 1250.25);
      assert.equal(s.ventas, 11);
    });

    await t.test('ventas y cierres simultáneos: un solo cierre y totales coherentes', async () => {
      const ventas = Array.from({length: 6}, () => as('dueno@otra.example',
        `public.gestlok_caja_registrar('${turno}', 'transferencia', 10, '', gen_random_uuid())`));
      const cierres = Array.from({length: 6}, (_, i) => as('dueno@otra.example', `public.gestlok_caja_cerrar('${turno}', 'Responsable ${i + 1}')`));
      const res = await together([...ventas, ...cierres].sort(() => Math.random() - 0.5));
      const closes = res.filter(r => r.ok && r.value.includes('ya_cerrado')).map(r => JSON.parse(r.value));
      assert.equal(closes.length, 6);
      assert.equal(closes.filter(v => !v.ya_cerrado).length, 1, 'Exactamente un cierre real');
      // Las ventas que llegaron después del cierre se rechazan; ninguna queda fuera del total.
      for (const r of res.filter(r => !r.ok)) assert.match(r.error, /cerrada/);
      assert.equal(sql(`select count(*) from gestlok_caja_private.auditoria where turno_id = '${turno}' and accion = 'cierre_manual'`), '1');
      assert.equal(sql(`select (t.total = (select coalesce(sum(m.monto), 0) from gestlok_caja_private.movimientos m where m.turno_id = t.id and m.anulado_at is null)
        and t.ventas = (select count(*) from gestlok_caja_private.movimientos m where m.turno_id = t.id and m.anulado_at is null)
        and not exists (select 1 from gestlok_caja_private.movimientos m where m.turno_id = t.id and m.registrado_at > t.cerrado_at))::text
        from gestlok_caja_private.turnos t where t.id = '${turno}'`), 'true');
    });

    await t.test('cierre automático del servidor repetido en paralelo junto a un cierre manual', async () => {
      // Caja de Perfumes de ayer que quedó abierta (sin ventas): varias ejecuciones del cron a la vez.
      sql(`insert into gestlok_caja_private.turnos (tenant_id, dia, responsable, abierto_por)
           values ('${PERF}', gestlok_caja_private.dia_ar() - 1, 'Ayer', 'a0000000-0000-4000-8000-000000000001')`);
      const id = sql(`select id from gestlok_caja_private.turnos where tenant_id = '${PERF}' and dia = gestlok_caja_private.dia_ar() - 1`);
      const res = await together([
        ...Array.from({length: 5}, () => 'select gestlok_caja_private.cerrar_vencidos()::text;'),
        as('duena@perfumes.example', `public.gestlok_caja_cerrar('${id}', 'Ana')`),
        as('duena@perfumes.example', 'public.gestlok_caja_estado()')
      ]);
      assert(res.every(r => r.ok), JSON.stringify(res));
      assert.equal(sql(`select count(*) from gestlok_caja_private.auditoria where turno_id = '${id}' and accion in ('cierre_manual','cierre_automatico')`), '1');
      assert.equal(sql(`select estado || '|' || tipo_cierre || '|' || total || '|' || (cerrado_at = gestlok_caja_private.limite(dia)) from gestlok_caja_private.turnos where id = '${id}'`),
        'cerrado|automatico|0.00|true');
    });

    await t.test('sin datos de otras empresas modificados', () => {
      assert.equal(sql(`select count(*) from public.docs where tenant_id = 'cb0dc04a-9a13-434f-a3d0-47f1d8f39670'`), '5');
      assert.equal(sql(`select count(*) from gestlok_caja_private.turnos where tenant_id = 'cb0dc04a-9a13-434f-a3d0-47f1d8f39670'`), '0');
    });
  } finally {
    psqlSync(MAINTENANCE(), ['-c', `drop database if exists ${DB} with (force)`]);
  }
});

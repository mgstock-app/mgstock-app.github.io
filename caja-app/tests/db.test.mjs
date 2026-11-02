// Caja app sobre PostgreSQL real: reglas y seguridad (fixtures/logica.sql) y CONCURRENCIA con varias
// sesiones a la vez (como varios celulares). Necesita psql y CAJA_PG_URL, por ejemplo
//   CAJA_PG_URL=postgresql://postgres:postgres@127.0.0.1:5432/postgres node --test caja-app/tests/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn, spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const URL_BASE = process.env.CAJA_PG_URL;
const dir = fileURLToPath(new URL('..', import.meta.url));
const DB = 'caja_app_prueba_' + process.pid;
const skip = !URL_BASE && 'Definí CAJA_PG_URL para correr las pruebas sobre PostgreSQL';
const urlFor = db => { const u = new URL(URL_BASE); u.pathname = '/' + db; return u.toString(); };
const MAINT = () => new URL(URL_BASE).pathname.slice(1) || 'postgres';
function psql(db, args) {
  const r = spawnSync('psql', [urlFor(db), '-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', ...args], {cwd: dir, encoding: 'utf8'});
  if (r.status !== 0) throw new Error((r.stderr || r.stdout || 'psql falló').trim());
  return r.stdout.trim();
}
const sql = q => psql(DB, ['-c', q]);
function fresh() {
  psql(MAINT(), ['-c', `drop database if exists ${DB} with (force)`, '-c', `create database ${DB}`]);
  psql(DB, ['-f', 'tests/fixtures/base.sql']);
  psql(DB, ['-f', 'supabase/migrations/20261102050000_caja_app_base.sql']);
  psql(DB, ['-f', 'supabase/migrations/20261102170000_caja_app_sin_pin.sql']);
}
function session(q) {
  return new Promise(resolve => {
    const p = spawn('psql', [urlFor(DB), '-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-c', q], {cwd: dir});
    let out = '', err = '';
    p.stdout.on('data', d => { out += d; });
    p.stderr.on('data', d => { err += d; });
    p.on('close', code => {
      const lines = out.split('\n').map(x => x.trim()).filter(Boolean);
      resolve(code === 0 ? {ok: true, value: lines.at(-1)} : {ok: false, error: err.trim()});
    });
  });
}
// Todas las sesiones esperan la misma barrera y arrancan juntas.
async function together(queries) {
  const holder = spawn('psql', [urlFor(DB), '-X', '-q', '-c', 'select pg_advisory_lock(4300); select pg_sleep(1.5);'], {cwd: dir});
  const released = new Promise(r => holder.on('close', r));
  await new Promise(r => setTimeout(r, 400));
  const results = await Promise.all(queries.map(q => session('select pg_advisory_lock_shared(4300); ' + q)));
  await released;
  return results;
}
const asA = call => `select prueba.como('duena.a@example.com'); select (${call})::text;`;

test('Caja app en PostgreSQL real', {skip}, async t => {
  try {
    await t.test('reglas de negocio y seguridad', () => {
      fresh();
      assert.match(psql(DB, ['-f', 'tests/fixtures/logica.sql']), /CAJA APP: OK/);
    });

    fresh();
    const alta = JSON.parse(sql(`select prueba.como('duena.a@example.com'); select public.caja_app_crear_comercio('Comercio', 'Centro', 'Sofía', '1234')::text;`).split('\n').at(-1));
    // GESTLOK Caja entra con la cuenta, sin PIN. Varios equipos de la misma cuenta entran a la vez:
    // todos usan la misma persona (la dueña del alta) y cada uno recibe su propia sesión.
    await t.test('varios equipos entran a la vez con la misma cuenta: una sola persona', async () => {
      const res = await together(Array.from({length: 8}, () => asA(`public.caja_app_entrar_cuenta('${alta.local_id}')`)));
      assert(res.every(r => r.ok), JSON.stringify(res));
      const vals = res.map(r => JSON.parse(r.value));
      assert(vals.every(v => v.ok && v.persona.id === alta.persona_id), JSON.stringify(vals));
      assert.equal(new Set(vals.map(v => v.token)).size, 8);
      assert.equal(sql(`select count(*) from caja_app.personas where user_id is not null`), '1');
      assert.equal(sql(`select count(*) from caja_app.personas`), '1');
    });
    const token = JSON.parse(sql(`select prueba.como('duena.a@example.com'); select public.caja_app_entrar_cuenta('${alta.local_id}')::text;`).split('\n').at(-1)).token;

    await t.test('varios celulares abren a la vez: una sola caja', async () => {
      const res = await together(Array.from({length: 8}, () => asA(`public.caja_app_abrir('${token}', 20000, true)`)));
      assert(res.every(r => r.ok), JSON.stringify(res));
      assert.equal(res.map(r => JSON.parse(r.value)).filter(v => v.nueva).length, 1);
      assert.equal(sql(`select count(*) from caja_app.cajas`), '1');
      assert.equal(sql(`select count(*) from caja_app.auditoria where accion = 'apertura'`), '1');
    });
    const caja = sql(`select id from caja_app.cajas`);

    await t.test('el mismo envío repetido en paralelo se guarda una vez', async () => {
      const op = '9f000000-0000-4000-8000-000000000001';
      const res = await together(Array.from({length: 8}, () => asA(`public.caja_app_registrar('${token}', '${caja}', '${op}', 'cobro', 'Efectivo', 250.25, null, '')`)));
      assert(res.every(r => r.ok), JSON.stringify(res));
      assert.equal(sql(`select count(*) from caja_app.movimientos where operacion = '${op}'`), '1');
    });

    await t.test('movimientos y cierres a la vez: un solo cierre y totales coherentes', async () => {
      sql(`insert into caja_app.fotos (caja_id, comercio_id, pedido, path, subida_por) select id, comercio_id, 'otra', comercio_id || '/' || id || '/foto12345678.jpg', abierta_por from caja_app.cajas`);
      const movs = Array.from({length: 6}, (_, i) => asA(`public.caja_app_registrar('${token}', '${caja}', gen_random_uuid(), '${i % 2 ? 'gasto' : 'cobro'}', 'Efectivo', 100, ${i % 2 ? "'Otro'" : 'null'}, '')`));
      const cierres = Array.from({length: 6}, () => asA(`public.caja_app_cerrar('${token}', '${caja}', 20000, null, null, null, 0, null, null)`));
      const res = await together([...movs, ...cierres].sort(() => Math.random() - 0.5));
      const closes = res.filter(r => r.ok && r.value.includes('ya_cerrada')).map(r => JSON.parse(r.value));
      assert.equal(closes.length, 6);
      assert.equal(closes.filter(v => !v.ya_cerrada).length, 1, 'Un único cierre real');
      for (const r of res.filter(r => !r.ok)) assert.match(r.error, /cerrada/);
      assert.equal(sql(`select count(*) from caja_app.auditoria where accion = 'cierre_manual'`), '1');
      assert.equal(sql(`select (c.saldo_teorico = c.caja_inicial
          + (select coalesce(sum(monto) filter (where tipo = 'cobro'), 0) - coalesce(sum(monto) filter (where tipo = 'gasto'), 0)
             from caja_app.movimientos m where m.caja_id = c.id and m.anulado_at is null)
          and not exists (select 1 from caja_app.movimientos m where m.caja_id = c.id and m.registrado_at > c.cerrada_at))::text
        from caja_app.cajas c`), 'true');
    });

    await t.test('cierre automático en paralelo con el cierre manual', async () => {
      const ayer = JSON.parse(sql(`select json_build_object('c', comercio_id, 'l', local_id, 'p', abierta_por)::text from caja_app.cajas limit 1`));
      const id = sql(`insert into caja_app.cajas (comercio_id, local_id, dia, modo_carga, caja_inicial, inicial_coincide, abierta_por, abierta_por_user)
        values ('${ayer.c}', '${ayer.l}', caja_app.dia_ar() - 1, 'cobro', 0, true, '${ayer.p}', 'a1000000-0000-4000-8000-000000000001') returning id`).split('\n')[0];
      const res = await together([
        ...Array.from({length: 5}, () => 'select caja_app.cerrar_vencidos()::text;'),
        asA(`public.caja_app_estado('${token}')`)
      ]);
      assert(res.every(r => r.ok), JSON.stringify(res));
      assert.equal(sql(`select count(*) from caja_app.auditoria where caja_id = '${id}' and accion = 'cierre_automatico'`), '1');
    });
  } finally {
    psql(MAINT(), ['-c', `drop database if exists ${DB} with (force)`]);
  }
});

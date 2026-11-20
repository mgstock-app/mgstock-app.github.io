// GESTLOK Chat sobre PostgreSQL real y vacío: aplica la migración dos veces (repetible) y corre las pruebas
// de aislamiento entre empresas, permisos por rol, pedidos y seguridad. No usa la base de producción.
//   CHAT_PG_URL=postgresql://postgres:postgres@127.0.0.1:5432/postgres node --test tests/db/gestlok-chat-postgres.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const URL_BASE = process.env.CHAT_PG_URL;
const root = fileURLToPath(new URL('../../', import.meta.url));
const DB = 'gestlok_chat_prueba_' + process.pid;
const skip = !URL_BASE && 'Definí CHAT_PG_URL para correr las pruebas sobre PostgreSQL';
const MIG = 'supabase/migrations/20261119210000_gestlok_chat_base.sql';
const MIG2 = 'supabase/migrations/20261119233500_gestlok_chat_comercializar.sql';

function urlFor(db) { const u = new URL(URL_BASE); u.pathname = '/' + db; return u.toString(); }
function psql(db, args) {
  return spawnSync('psql', [urlFor(db), '-X', '-q', '-v', 'ON_ERROR_STOP=1', ...args], {cwd: root, encoding: 'utf8'});
}
function ok(db, args) {
  const r = psql(db, args);
  if (r.status !== 0) throw new Error((r.stderr || r.stdout || 'psql falló').trim());
}

test('GESTLOK Chat · aislamiento, permisos, pedidos y seguridad', {skip}, async t => {
  ok('postgres', ['-c', `drop database if exists ${DB}`, '-c', `create database ${DB}`]);
  t.after(() => psql('postgres', ['-c', `drop database if exists ${DB} with (force)`]));
  ok(DB, ['-f', 'tests/fixtures/chat/base.sql']);
  ok(DB, ['-f', MIG]);
  ok(DB, ['-f', MIG]); // repetible
  ok(DB, ['-f', MIG2]);
  ok(DB, ['-f', MIG2]); // repetible
  for (const name of [
    '20261120000406_gestlok_chat_confirmacion_manual.sql',
    '20261120010751_gestlok_chat_pagos_por_entrega.sql',
    '20261120010908_gestlok_chat_pagos_retiro_delivery_columnas.sql',
    '20261120013358_gestlok_chat_stock_interno_permisos_gerente.sql',
    '20261120014204_gestlok_chat_gerente_no_ampliar_editor.sql',
    '20261120020052_gestlok_chat_soporte_reclamos_gerente.sql',
    '20261120021122_gestlok_chat_soporte_seguimiento_hasta_cierre.sql',
    '20261120024146_gestlok_chat_turnos_programacion_reportes.sql',
    '20261120024820_gestlok_chat_reportes_fecha_local.sql',
    '20261120024908_gestlok_chat_turnos_privilegios_privados.sql',
    '20261120031746_gestlok_chat_munro_prueba_temporal_eliminacion_segura.sql',
  ]) {
    ok(DB, ['-f', 'supabase/migrations/' + name]);
    ok(DB, ['-f', 'supabase/migrations/' + name]); // idempotencia
  }
  const r = psql(DB, ['-f', 'supabase/tests/gestlok-chat-permisos.sql']);
  const out = (r.stderr || '') + (r.stdout || '');
  assert.match(out, /ERROR:\s+INFORME/, out);
  const informe = out.slice(out.indexOf('INFORME') + 7).split('\nCONTEXT')[0];
  const lines = informe.split('\n').map(s => s.trim()).filter(Boolean);
  assert.deepEqual(lines.filter(l => l.startsWith('FALLA')), [], informe);
  assert.ok(lines.filter(l => l.startsWith('OK')).length >= 80, informe);
});

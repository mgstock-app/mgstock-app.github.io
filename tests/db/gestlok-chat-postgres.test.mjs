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
  const r = psql(DB, ['-f', 'supabase/tests/gestlok-chat-permisos.sql']);
  const out = (r.stderr || '') + (r.stdout || '');
  assert.match(out, /ERROR:\s+INFORME/, out);
  const informe = out.slice(out.indexOf('INFORME') + 7).split('\nCONTEXT')[0];
  const lines = informe.split('\n').map(s => s.trim()).filter(Boolean);
  assert.deepEqual(lines.filter(l => l.startsWith('FALLA')), [], informe);
  assert.ok(lines.filter(l => l.startsWith('OK')).length >= 80, informe);
});

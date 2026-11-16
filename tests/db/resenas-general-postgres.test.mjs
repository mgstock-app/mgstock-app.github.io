// Reseñas con cupón general sobre PostgreSQL real y vacío: aplica la migración (dos veces, para confirmar que es
// repetible) y corre las pruebas de permisos, aislamiento entre empresas y reglas. No usa la base de producción.
//   RESENAS_PG_URL=postgresql://postgres:postgres@127.0.0.1:5432/postgres node --test tests/db/resenas-general-postgres.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const URL_BASE = process.env.RESENAS_PG_URL || process.env.CAJA_PG_URL;
const root = fileURLToPath(new URL('../../', import.meta.url));
const DB = 'resenas_gen_prueba_' + process.pid;
const skip = !URL_BASE && 'Definí RESENAS_PG_URL para correr las pruebas sobre PostgreSQL';
const MIG = 'supabase/migrations/20261116150000_gestlok_resenas_general.sql';
function psql(db, args) {
  const u = new URL(URL_BASE); u.pathname = '/' + db;
  const r = spawnSync('psql', [u.toString(), '-X', '-q', '-v', 'ON_ERROR_STOP=1', ...args], {cwd: root, encoding: 'utf8'});
  if (r.status !== 0) throw new Error((r.stderr || r.stdout || 'psql falló').trim());
  return r.stdout;
}
test('Reseñas general · permisos, aislamiento entre empresas y reglas', {skip}, t => {
  psql('postgres', ['-c', `drop database if exists ${DB}`, '-c', `create database ${DB}`]);
  t.after(() => psql('postgres', ['-c', `drop database if exists ${DB} with (force)`]));
  psql(DB, ['-f', 'tests/fixtures/resenas-general/base.sql']);
  psql(DB, ['-f', MIG]);
  psql(DB, ['-f', MIG]); // repetible
  assert.match(psql(DB, ['-f', 'supabase/tests/resenas-general.sql']), /RESENAS GENERAL: OK/);
});

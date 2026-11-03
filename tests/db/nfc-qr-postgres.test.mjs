// NFC y QR por comercio y sucursal sobre PostgreSQL real y vacío: aplica las dos migraciones (dos veces, para
// confirmar que son repetibles) y corre las pruebas de permisos y reglas. No usa la base de producción.
// Necesita psql y NFC_PG_URL (o CAJA_PG_URL), por ejemplo
//   NFC_PG_URL=postgresql://postgres:postgres@127.0.0.1:5432/postgres node --test tests/db/nfc-qr-postgres.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const URL_BASE = process.env.NFC_PG_URL || process.env.CAJA_PG_URL;
const root = fileURLToPath(new URL('../../', import.meta.url));
const DB = 'nfc_prueba_' + process.pid;
const skip = !URL_BASE && 'Definí NFC_PG_URL para correr las pruebas sobre PostgreSQL';
const MIGS = ['supabase/migrations/20261031163500_gestlok_nfc_qr_placas.sql',
  'supabase/migrations/20261102213000_gestlok_nfc_comercios_sucursales.sql'];

function urlFor(db) { const u = new URL(URL_BASE); u.pathname = '/' + db; return u.toString(); }
function psql(db, args) {
  return spawnSync('psql', [urlFor(db), '-X', '-q', '-v', 'ON_ERROR_STOP=1', ...args], {cwd: root, encoding: 'utf8'});
}
function ok(db, args) {
  const r = psql(db, args);
  if (r.status !== 0) throw new Error((r.stderr || r.stdout || 'psql falló').trim());
}
// Las pruebas terminan con «INFORME» a propósito (para deshacer todo): devuelve ese texto.
function informe(file) {
  const r = psql(DB, ['-f', file]);
  const out = (r.stderr || '') + (r.stdout || '');
  assert.match(out, /ERROR:\s+INFORME/, out);
  return out.slice(out.indexOf('INFORME') + 7).split('\nCONTEXT')[0];
}

test('NFC y QR · comercios, sucursales, permisos y seguridad', {skip}, async t => {
  ok('postgres', ['-c', `drop database if exists ${DB}`, '-c', `create database ${DB}`]);
  t.after(() => psql('postgres', ['-c', `drop database if exists ${DB} with (force)`]));
  ok(DB, ['-f', 'tests/fixtures/nfc/base.sql']);
  for (const m of MIGS) ok(DB, ['-f', m]);
  ok(DB, ['-f', MIGS[1]]); // repetible

  const nuevo = informe('supabase/tests/nfc-comercios-permisos.sql');
  const lines = nuevo.split('\n').map(s => s.trim()).filter(Boolean);
  assert.deepEqual(lines.filter(l => l.startsWith('FALLA')), [], nuevo);
  assert.ok(lines.filter(l => l.startsWith('OK')).length >= 45, nuevo);

  const anterior = informe('supabase/tests/nfc-qr-permisos.sql');
  assert.ok(!/FALLA/.test(anterior) && !/ false$/m.test(anterior), anterior);
});

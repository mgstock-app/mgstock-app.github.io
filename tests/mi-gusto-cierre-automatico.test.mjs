import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const leer = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const sql = leer('supabase/migrations/20261123130000_mi_gusto_cierre_automatico_0050.sql');

test('la base cierra sola a las 00:50 (Argentina) Conteo y Stock Local de Munro y Don Torcuato', () => {
  assert.match(sql, /cron\.schedule\('mi-gusto-cierre-0050-ar', '50 3 \* \* \*'/);
  assert.match(sql, /cron\.schedule\('mi-gusto-cierre-respaldo', '\*\/15 \* \* \* \*'/);
  for (const local of ['munro', 'torcuato']) {
    assert.match(sql, new RegExp('update gestlok_' + local + '_conteo_private\\.shifts\\s+set status = \'finalizado\''));
  }
  assert.match(sql, /array\['munro', 'torcuato'\]/);
  assert.match(sql, /time '00:50'/);
  assert.match(sql, /v_ahora::time < time '06:00'/);
  assert.match(sql, /'cierre-' \|\| v_hoja_id \|\| '-' \|\| to_char\(v_dia, 'YYYY-MM-DD'\)/);
  assert.match(sql, /on conflict do nothing/);
  assert.match(sql, /revoke all on function gestlok_platform\.mi_gusto_cierre_automatico\(timestamp\) from anon, authenticated/);
  assert.doesNotMatch(sql, /delete from|drop table|truncate/i);
});

test('las pantallas avisan el cierre automático y conservan el cierre manual', () => {
  const app = leer('public/stock/app.js'), conteo = leer('public/stock/mi-gusto-conteo.js');
  assert.match(app, /new Date\(Date\.now\(\) - 50 \* 60000\)/);
  assert.match(app, /si nadie lo cierra, se cierra solo a las 00:50/);
  assert.match(app, /Turno cerrado automáticamente a las 00:50/);
  assert.match(app, /data-act="stock-local-close"/);
  assert.match(conteo, /Si queda abierto, se cierra solo a las 00:50\./);
  assert.match(conteo, /data-gcm-finalize/);
  const runtime = leer('components/stock-runtime.tsx');
  assert.equal((runtime.match(/app\.js\?rev=stock-local-cierre-0050-20261123/g) || []).length, 2);
  assert.equal((runtime.match(/mi-gusto-conteo\.js\?rev=conteo-cierre-0050-20261123/g) || []).length, 2);
});

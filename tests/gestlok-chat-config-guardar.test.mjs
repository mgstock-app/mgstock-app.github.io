import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const leer = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('guardar ajustes mantiene opciones de pago válidas por tipo de entrega', () => {
  const sql = leer('supabase/migrations/20261121214500_gestlok_chat_ajustes_medios_pago_consistentes.sql');
  assert.match(sql, /gestlok_chat_private\.exigir\(p_sucursal, 'gestionar'\)/);
  assert.match(sql, /v_nivel <> 'configurar'/);
  assert.match(sql, /where id = p_sucursal and version = p_version/i);
  assert.match(sql, /gestlok_chat_private\.auditar/);
  assert.match(sql, /medios_pago_retiro = case when v_medios is null/);
  assert.match(sql, /medios_pago_envio = case when v_medios is null/);
  assert.match(sql, /unnest\(medios_pago_retiro\)/);
  assert.match(sql, /unnest\(medios_pago_envio\)/);
  assert.match(sql, /where u\.metodo = any\(v_medios\)/);
  assert.match(sql, /v_medios\)\), v_medios\) end/);
  assert.match(sql, /Seleccioná al menos un medio de pago válido/);
  assert.doesNotMatch(sql, /drop (table|constraint)|disable row level security|grant execute to anon/i);
});
test('el panel comunica el error y valida límites antes de guardar', () => {
  const js = leer('public/chat/panel/panel.js');
  const page = leer('public/chat/panel/index.html');
  const central = leer('public/stock/gestlok-chat-central.js');
  assert.match(js, /r\.error\.code === '23514'/);
  assert.match(js, /costoEnvio >= 1000000/);
  assert.match(js, /pedidoMinimo >= 10000000/);
  assert.match(js, /if \(!elegidos\.length\)/);
  assert.match(js, /p_sucursal: S\.suc\.id, p_version: a\.version/);
  assert.match(page, /panel\.js\?v=20261121ajustesfix1/);
  assert.match(central, /VERSION_PANEL='20261121ajustesfix1'/);
});

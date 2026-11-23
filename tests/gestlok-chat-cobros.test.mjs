import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const leer = r => readFileSync(new URL("../" + r, import.meta.url), "utf8");

test("cobros: la base solo cobra a empresas marcadas y pausa pasados los días de gracia", () => {
  const sql = leer("supabase/migrations/20261123200000_gestlok_chat_cobros_mercado_pago.sql");
  assert.match(sql, /cuota numeric\(12,2\) not null default 70000/);
  assert.match(sql, /adaptacion numeric\(12,2\) not null default 50000/);
  assert.match(sql, /gracia_dias integer not null default 3/);
  // Empresas existentes sin fila de suscripción: el disparador no hace nada.
  assert.match(sql, /select \* into r from gestlok_chat_private\.suscripciones where tenant_id = new\.tenant_id and requiere_cobro;\n    if found then/);
  assert.match(sql, /El chat está pausado por falta de pago/);
  assert.match(sql, /mora_desde \+ make_interval\(days => coalesce\(v_gracia, 3\)\) < now\(\)/);
  // Lo que llega de Mercado Pago solo lo toca la función (service_role).
  assert.match(sql, /revoke all on function public\.gestlok_cobros_srv_evento\(text, jsonb\) from public, anon, authenticated;/);
  assert.match(sql, /grant execute on function public\.gestlok_cobros_srv_evento\(text, jsonb\) to service_role;/);
  assert.match(sql, /if v_ref !~ '\^cuota:\[0-9a-f-\]\{36\}\$'/);
  assert.match(sql, /new\.action = 'chat_alta_aprobada'/);
});

test("cobros: la función vuelve a pedir el recurso a Mercado Pago y no guarda la clave en el código", () => {
  const fn = leer("supabase/functions/gestlok-cobros/index.ts");
  assert.match(fn, /Deno\.env\.get\("MP_ACCESS_TOKEN"\)/);
  assert.doesNotMatch(fn, /APP_USR-[0-9]/, "sin claves en el código");
  assert.match(fn, /const r = await mp\(ruta\[1\] \+ encodeURIComponent\(id\)\);/);
  assert.match(fn, /rpc\("gestlok_chat_cobro_preparar"/);
  assert.match(fn, /external_reference: "cuota:" \+ tenant/);
  assert.match(fn, /frequency: 1, frequency_type: "months"/);
});

test("cobros: el dueño ve su suscripción en Ajustes y la administradora los links por empresa", () => {
  const panel = leer("public/chat/panel/panel.js");
  assert.match(panel, /rpc\('panel_suscripcion', \{p_sucursal: S\.suc\.id\}\)/);
  assert.match(panel, /sb\.functions\.invoke\('gestlok-cobros'/);
  assert.match(panel, /const suscripcion = editable \? bloqueSuscripcion\(\) : null;/);
  const home = leer("public/stock/gestlok-creator-home.js");
  assert.match(home, /rpc\('gestlok_chat_admin_cobros'\)/);
  assert.match(home, /functions\.invoke\('gestlok-cobros'/);
  assert.match(home, /if\(!premiumAdmin\(\)\|\|!c\)return '';/);
});

import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const sql=readFileSync("supabase/migrations/20261108173000_zayro_public_shop.sql","utf8");
const js=readFileSync("public/stock/gestlok-zayro-admin.js","utf8");
const page=readFileSync("app/zayro/zayro-store-client.tsx","utf8");
const shell=readFileSync("app/zayro/page.tsx","utf8");

test("ZAYRO conserva exclusividad de empresa y Dueña",()=>{
  assert.match(sql,/gestlok_zayro_is_owner/);
  assert.match(sql,/d\.col='equipo'/);
  assert.match(sql,/gestlok_zayro_admin_product/);
  assert.match(sql,/gestlok_zayro_admin_settings/);
  assert.match(sql,/auth\.uid\(\)/);
  assert.match(sql,/where p\.tenant_id='2a97bf8d-7d08-4aa7-b051-5d1a4dc80103'/);
  assert.match(sql,/owner_uid=\(select auth\.uid\(\)\)/);
  assert.match(sql,/revoke all on public\.gestlok_zayro_publications from public,anon,authenticated/);
  assert.match(sql,/revoke all on public\.gestlok_zayro_settings from public,anon,authenticated/);
  assert.match(sql,/enable row level security/);
});
test("Catálogo anónimo solo ve productos publicados, activos, con precio y stock; no expone costo",()=>{
  assert.match(sql,/create or replace function public\.gestlok_zayro_public_catalog\(\)/);
  assert.match(sql,/grant execute on function public\.gestlok_zayro_public_catalog\(\) to anon,authenticated/);
  assert.match(sql,/z\.published is true and p\.active is true and p\.in_stock is true/);
  assert.match(sql,/coalesce\(p\.stock_quantity,0\)>0/);
  assert.match(sql,/coalesce\(p\.manual_sale_price,p\.unit_price,0\)>0/);
  const segment=sql.slice(sql.indexOf("create or replace function public.gestlok_zayro_public_catalog()"),
    sql.indexOf("-- Panel privado"));
  assert.doesNotMatch(segment,/'cost_price'|'markup_percent'|'owner_uid'|'customer'|'user_id'/);
  assert.match(segment,/'enabled'/);
  assert.doesNotMatch(sql,/\btruncate\b|\bdrop\s+table\b/i);
});
test("ZAYRO usa un carrito que consulta por WhatsApp, nunca confirma pagos o venta automática",()=>{
  assert.match(page,/gestlok_zayro_public_catalog/);
  assert.match(page,/Agregar al carrito/);
  assert.match(page,/Enviar pedido por WhatsApp/);
  assert.match(page,/No se cobra ni se reserva stock desde esta página/);
  assert.doesNotMatch(page,/\.from\(["'](?:docs|gestlok_pilot_orders|gestlok_pilot_products)/);
  assert.doesNotMatch(page,/gestlok_zayro_admin_product|gestlok_zayro_admin_settings/);
});
test("Panel privado no ofrece la tienda a cuentas y tenants ajenos",()=>{
  assert.doesNotThrow(()=>new vm.Script(js));
  const listeners={},window={};const document={addEventListener:(k,cb)=>listeners[k]=cb};
  vm.runInNewContext(js,{window,document});
  const g=window.GestLokZayroAdmin;
  const ctx=(tenant,email,role="dueno")=>({S:{me:{tenant_id:tenant,email}},role:()=>role});
  const good=g.homeTile(ctx("2a97bf8d-7d08-4aa7-b051-5d1a4dc80103","camilab.lopez99@gmail.com"));
  assert.match(good,/Tienda Online · ZAYRO/);
  assert.equal(g.homeTile(ctx("00000000-0000-0000-0000-000000000002","camilab.lopez99@gmail.com")),"");
  assert.equal(g.homeTile(ctx("2a97bf8d-7d08-4aa7-b051-5d1a4dc80103","otro@example.invalid")),"");
  assert.equal(g.homeTile(ctx("2a97bf8d-7d08-4aa7-b051-5d1a4dc80103","camilab.lopez99@gmail.com","colaborador")),"");
});
test("El script y sus enlaces se cargan solo para usuarios autenticados",()=>{
  const runtime=readFileSync("components/stock-runtime.tsx","utf8");
  const owner=readFileSync("public/stock/gestlok-owner-areas.js","utf8");
  assert.match(runtime,/if \(!visitor\) await load\("\/stock\/gestlok-zayro-admin\.js/);
  assert.match(owner,/GestLokZayroAdmin\?\.homeTile\?\.\(api\)/);
  assert.match(page,/className="zayro"/);
});

test("El render de la vidriera se inicia en el navegador sin provocar hidratación de HTML variable",()=>{
  assert.ok(shell.includes('dynamic(() => import("./zayro-store-client")'));
  assert.ok(shell.includes("ssr: false"));
  assert.ok(shell.includes("Preparando la tienda ZAYRO"));
});

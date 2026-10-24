import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
const file = path => readFileSync(new URL('../'+path,import.meta.url),'utf8');
const admin=file('public/stock/gestlok-tienda.js');
const shop=file('public/stock/tienda-publica.js');
const sql=file('supabase/migrations/20261024_gestlok_tienda_publica.sql');
const html=file('public/tienda.html');
const app=file('public/stock/app.js');

test('La tienda comercial y sus scripts tienen sintaxis válida',()=>{
  assert.doesNotThrow(()=>new Script(admin));
  assert.doesNotThrow(()=>new Script(shop));
});

test('El menú mantiene física como base y solamente habilita la nueva vista en online o mixta',()=>{
  const commerce=file('public/stock/gestlok-commerce.js');
  assert.match(commerce,/const tipo = \(\) => TIPOS\[cfg\?\.tipo\] \? cfg\.tipo : 'fisica'/);
  assert.match(app,/S\.view === 'tienda-online'/);
  assert.match(app,/v === 'tienda-online' && window\.GestLokCommerce\?\.online\(\)/);
  assert.match(app,/GestLokTienda\?\.attach/);
  assert.match(file('components/stock-runtime.tsx'),/gestlok-tienda\.js/);
  assert.match(file('public/stock/auth.js'),/window\.GestLokSupabase = sb/);
});

test('El catálogo es independiente del inventario de Mi Gusto y arranca despublicado',()=>{
  assert.match(sql,/create table if not exists public\.gestlok_tiendas/);
  assert.match(sql,/create table if not exists public\.gestlok_productos_tienda/);
  assert.match(sql,/visible boolean not null default false/);
  assert.match(sql,/publicado boolean not null default false/);
  assert.match(sql,/foreign key \(tienda_id,tenant_id\)/);
  assert.doesNotMatch(sql,/drop table|truncate|delete from public\.docs|update public\.docs/i);
  assert.doesNotMatch(admin,/C\('productos'\)|C\('conteos'\)|\.from\('docs'\)/);
  assert.doesNotMatch(shop,/\.insert\(|\.upsert\(|\.update\(|\.delete\(/);
});

test('Aislamiento RLS por empresa y local, escritura de tienda solo dueña/creadora',()=>{
  assert.match(sql,/alter table public\.gestlok_tiendas enable row level security/);
  assert.match(sql,/alter table public\.gestlok_productos_tienda enable row level security/);
  assert.match(sql,/tenant_id = \(select gestlok_tenancy\.current_tenant_id\(\)\)/);
  assert.match(sql,/public\.mi_rol\(\) in \('creadora','dueno'\)/);
  assert.match(sql,/public\.puede_editar_local\(t\.local_id\)/);
  assert.match(sql,/public\.gestlok_modo_tienda_publico/);
  assert.match(sql,/grant select on public\.gestlok_tiendas, public\.gestlok_productos_tienda to anon, authenticated/);
  assert.doesNotMatch(sql,/grant\s+(insert|update|delete)[^;]+to anon/i);
});

test('La vidriera tiene carrito, filtros, condiciones de entrega y WhatsApp voluntario',()=>{
  for(const field of ['id="catalog"','id="search"','id="category"','id="sort"','id="cart"','id="checkout"','id="delivery"']){
    assert.ok(html.includes(field),field);
  }
  assert.match(shop,/https:\/\/wa\.me\//);
  assert.match(shop,/window\.open\(url/);
  assert.match(shop,/Math\.min\(p\.stock/);
  assert.match(shop,/entrega/);
  assert.match(html,/No se registran pagos ni se reserva stock automáticamente/);
});

test('Vista comercial deshabilitada en perfiles no aptos; sin activar tiendas nuevas',async()=>{
  const handlers={};
  const document={addEventListener:(event,handler)=>{handlers[event]=handler;},querySelector:()=>null};
  const w={GestLokCommerce:{online:()=>true},GestLokSupabase:null};
  new Script(admin).runInNewContext({window:w,document,location:{origin:'https://ejemplo.test'},Date,Number,String,Intl,Promise});
  const user={tenant_id:'11111111-1111-4111-8111-111111111111'};
  w.GestLokTienda.attach({S:{me:user,local:'sucursal1',offline:false,view:'tienda-online'},miRol:()=> 'gerente',
    localNombre:()=> 'Sucursal Uno',canW:()=>true,render:()=>{},toast:()=>{}});
  const view=w.GestLokTienda.view();
  assert.match(view,/Cargando configuración/);
});

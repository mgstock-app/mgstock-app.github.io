import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const sql=readFileSync(new URL('../supabase/migrations/20261105035000_scanner_pos_ventas_atomicas.sql',import.meta.url),'utf8');
const tenantA='11111111-1111-4111-8111-111111111111';
const tenantB='22222222-2222-4222-8222-222222222222';
const ownerA='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ownerB='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const prodA='33333333-3333-4333-8333-333333333333';
const prodB='44444444-4444-4444-8444-444444444444';
const prodOther='55555555-5555-4555-8555-555555555555';
const requestId='66666666-6666-4666-8666-666666666666';

test('Scanner: venta atomica, solo un descuento, aislamiento por empresa y stock no negativo',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`
    create role authenticated; create role anon;
    create schema auth;
    create function auth.uid() returns uuid language sql as
      $$ select nullif(current_setting('request.uid',true),'')::uuid $$;
    create table public.gestlok_pilot_access(
      tenant_id uuid primary key,owner_uid uuid not null,enabled boolean not null,
      plan_code text not null default 'scanner'
    );
    create table public.gestlok_pilot_products(
      id uuid primary key,tenant_id uuid not null,owner_uid uuid not null,
      name text not null,unit_price numeric,stock_quantity integer,active boolean not null default true
    );
    insert into public.gestlok_pilot_access values
      ('${tenantA}','${ownerA}',true,'scanner'),
      ('${tenantB}','${ownerB}',true,'scanner');
    insert into public.gestlok_pilot_products values
      ('${prodA}','${tenantA}','${ownerA}','Producto A',99.50,5,true),
      ('${prodB}','${tenantA}','${ownerA}','Producto B',65,1,true),
      ('${prodOther}','${tenantB}','${ownerB}','Producto otro local',500,7,true);
  `);
  await db.exec(sql);
  const sale=async(tenant,request,payment,lines)=>
   db.query('select public.gestlok_pos_checkout($1::uuid,$2::uuid,$3::text,$4::jsonb) as id',
    [tenant,request,payment,JSON.stringify(lines)]);

  await db.query('select set_config($1,$2,false)',['request.uid',ownerA]);
  // Seguro en origen: ventas reales NO estan habilitadas por defecto.
  await assert.rejects(sale(tenantA,requestId,'efectivo',[{product_id:prodA,quantity:1}]),/no habilitadas/i);
  await db.query('update public.gestlok_pilot_access set pos_live_enabled=true where tenant_id=$1',[tenantA]);
  const lines=[{product_id:prodA,quantity:2}];
  const first=await sale(tenantA,requestId,'transferencia',lines);
  const second=await sale(tenantA,requestId,'transferencia',lines);
  assert.equal(first.rows[0].id,second.rows[0].id,'mismo request id devuelve misma venta');
  const state=await db.query('select stock_quantity from public.gestlok_pilot_products where id=$1',[prodA]);
  assert.equal(state.rows[0].stock_quantity,3,'descuenta una sola vez');
  const sales=await db.query('select total,payment_method,request_lines,items from public.gestlok_pilot_pos_sales');
  assert.equal(sales.rows.length,1);
  assert.equal(Number(sales.rows[0].total),199);
  assert.equal(sales.rows[0].payment_method,'transferencia');
  assert.equal(sales.rows[0].items[0].name,'Producto A');
  await assert.rejects(sale(tenantA,requestId,'efectivo',lines),/otro carrito/i);
  await assert.rejects(sale(tenantA,'77777777-7777-4777-8777-777777777777','efectivo',[
    {product_id:prodA,quantity:1},{product_id:prodB,quantity:2}
  ]),/sin precio o stock/i);
  assert.equal((await db.query('select stock_quantity from public.gestlok_pilot_products where id=$1',[prodA])).rows[0].stock_quantity,3,'error revierte toda la venta');
  await assert.rejects(sale(tenantA,'88888888-8888-4888-8888-888888888888','efectivo',[{product_id:prodOther,quantity:1}]),/sin precio o stock/i);
  assert.equal((await db.query('select stock_quantity from public.gestlok_pilot_products where id=$1',[prodOther])).rows[0].stock_quantity,7);

  await db.query('select set_config($1,$2,false)',['request.uid',ownerB]);
  await assert.rejects(sale(tenantA,'99999999-9999-4999-8999-999999999999','transferencia',lines),/no habilitadas/i);
  await assert.rejects(sale(tenantB,'aaaaaaaa-bbbb-4aaa-8aaa-aaaaaaaaaaaa','transferencia',[{product_id:prodOther,quantity:1}]),/no habilitadas/i);
  assert.equal((await db.query('select count(*)::integer as n from public.gestlok_pilot_pos_sales')).rows[0].n,1);

  assert.equal((await db.query("select has_table_privilege('authenticated','public.gestlok_pilot_pos_sales','INSERT') as can_insert")).rows[0].can_insert,false);
  assert.equal((await db.query("select has_function_privilege('anon','public.gestlok_pos_checkout(uuid,uuid,text,jsonb)','EXECUTE') as can_exec")).rows[0].can_exec,false);
 }finally{await db.close();}
});

test('Scanner: migracion no modifica Mi Gusto, ni abre la venta por defecto',()=>{
 assert.match(sql,/pos_live_enabled boolean not null default false/);
 assert.match(sql,/and a\.pos_live_enabled/);
 assert.match(sql,/for update/i);
 assert.match(sql,/pg_catalog\.pg_advisory_xact_lock/);
 assert.match(sql,/alter table public\.gestlok_pilot_pos_sales enable row level security/);
 assert.match(sql,/revoke all on table public\.gestlok_pilot_pos_sales from public, anon, authenticated/);
 assert.doesNotMatch(sql,/\b(?:truncate|drop table|delete from)\b/i);
});

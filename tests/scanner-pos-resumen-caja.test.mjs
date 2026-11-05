import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {Script} from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const sql=read('supabase/migrations/20261105050500_scanner_resumen_cobros_sin_duplicar_caja.sql');
const pilot=read('public/stock/gestlok-pilot.js');
const pos=read('public/stock/sistema-venta/pos-preview.js');
const tenantA='11111111-1111-4111-8111-111111111111';
const tenantB='22222222-2222-4222-8222-222222222222';
const ownerA='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ownerB='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

test('Scanner: resumen de Caja lee comprobantes sin duplicar y respeta día argentino',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`
   create role authenticated;create role anon;
   create schema auth;
   create function auth.uid() returns uuid language sql as
    $$ select nullif(current_setting('request.uid',true),'')::uuid $$;
   create table public.gestlok_pilot_access(
    tenant_id uuid primary key,owner_uid uuid not null,enabled boolean not null,
    plan_code text not null default 'scanner'
   );
   create table public.gestlok_pilot_pos_sales(
    id uuid primary key,tenant_id uuid not null,operator_uid uuid not null,
    payment_method text not null,total numeric(14,2) not null,created_at timestamptz not null
   );
   insert into public.gestlok_pilot_access values
    ('${tenantA}','${ownerA}',true,'scanner'),
    ('${tenantB}','${ownerB}',true,'scanner');
   insert into public.gestlok_pilot_pos_sales values
    ('11111111-3333-4333-8333-111111111111','${tenantA}','${ownerA}','efectivo',300,'2026-11-05T03:10:00+00'),
    ('11111111-4444-4444-8444-111111111111','${tenantA}','${ownerA}','transferencia',700,'2026-11-05T23:10:00+00'),
    ('11111111-5555-4555-8555-111111111111','${tenantA}','${ownerA}','transferencia',900,'2026-11-05T02:10:00+00'),
    ('11111111-6666-4666-8666-111111111111','${tenantB}','${ownerB}','efectivo',1500,'2026-11-05T03:10:00+00');
  `);
  await db.exec(sql);
  await db.query('select set_config($1,$2,false)',['request.uid',ownerA]);
  const query=async(day,tenant=tenantA)=>db.query(
   'select public.gestlok_scanner_pos_resumen($1::uuid,$2::date) as r',
   [tenant,day]
  );
  const report=(await query('2026-11-05')).rows[0].r;
  assert.equal(report.sales,2);
  assert.equal(Number(report.efectivo),300);
  assert.equal(Number(report.transferencia),700);
  assert.equal(Number(report.total),1000);
  assert.equal(report.source,'scanner_pos');
  assert.equal(report.synced_to_caja,false);
  const yesterday=(await query('2026-11-04')).rows[0].r;
  assert.equal(yesterday.sales,1);
  assert.equal(Number(yesterday.transferencia),900);
  await assert.rejects(query('2026-11-05',tenantB),/no autorizado/i);
  await db.query('select set_config($1,$2,false)',['request.uid',ownerB]);
  await assert.rejects(query('2026-11-05',tenantA),/no autorizado/i);
  const other=(await query('2026-11-05',tenantB)).rows[0].r;
  assert.equal(other.sales,1);
  assert.equal(Number(other.total),1500);
  assert.equal((await db.query('select count(*)::int as n from public.gestlok_pilot_pos_sales')).rows[0].n,4);
  assert.equal((await db.query("select has_function_privilege('anon','public.gestlok_scanner_pos_resumen(uuid,date)','EXECUTE') as allowed")).rows[0].allowed,false);
 }finally{await db.close();}
});

test('Scanner: reporte read-only, sin sumar cobros en Caja externa ni abrir permisos de Mi Gusto',()=>{
 assert.match(sql,/security invoker/i);
 assert.match(sql,/and a\.owner_uid = v_uid/);
 assert.match(sql,/and a\.plan_code = 'scanner'/);
 assert.match(sql,/and s\.operator_uid=v_uid/);
 assert.match(sql,/America\/Argentina\/Buenos_Aires/);
 assert.doesNotMatch(sql,/\b(?:insert into|update caja_app|delete from|truncate)\b/i);
 new Script(pilot);new Script(pos);
 assert.match(pilot,/gestlok_scanner_pos_resumen/);
 assert.match(pos,/gl-pos-reconcile/);
 assert.match(pos,/synced_to_caja|todavía no se suma automáticamente/);
 assert.match(pos,/if\(uncertain\|\|submitting\)return/);
});

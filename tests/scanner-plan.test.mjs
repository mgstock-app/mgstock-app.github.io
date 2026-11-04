import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const migration=readFileSync('supabase/migrations/20261104192116_scanner_shared_navigation.sql','utf8');
test('Scanner: precios funcionan para clientes actuales y futuros y rechazan otra identidad',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create schema auth; create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.uid',true),'')::uuid $$;
   create table public.gestlok_pilot_access(tenant_id uuid primary key,owner_uid uuid,enabled boolean);
   insert into public.gestlok_pilot_access values ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
   create table public.gestlok_pilot_products(tenant_id uuid,cost_price numeric,markup_percent numeric,unit_price numeric,stock_quantity integer,in_stock boolean);`);
  await db.exec(migration);
  await db.exec(`create trigger calculate before insert or update on public.gestlok_pilot_products for each row execute function public.gl_pilot_product_calculate_prices();
   insert into public.gestlok_pilot_access(tenant_id,owner_uid,enabled) values ('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);`);
  for(const [tenant,owner]of [['11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'],['22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb']]){
   await db.query("select set_config('request.uid',$1,false)",[owner]);
   const result=await db.query('insert into public.gestlok_pilot_products values ($1,100,50,null,4,null) returning unit_price,in_stock',[tenant]);
   assert.equal(Number(result.rows[0].unit_price),150);assert.equal(result.rows[0].in_stock,true);
  }
  await assert.rejects(db.query("insert into public.gestlok_pilot_products values ('11111111-1111-4111-8111-111111111111',100,50,null,4,null)"));
  await db.exec("update public.gestlok_pilot_access set enabled=false where tenant_id='22222222-2222-4222-8222-222222222222'");
  await assert.rejects(db.query("insert into public.gestlok_pilot_products values ('22222222-2222-4222-8222-222222222222',100,50,null,4,null)"));
  assert.equal((await db.query('select count(*)::int as n from public.gestlok_pilot_products')).rows[0].n,2);
 }finally{await db.close();}
});

test('Scanner limpia el catálogo anterior al cerrar o cambiar de empresa',async()=>{
 const {runInNewContext}=await import('node:vm');
 const q={select:()=>q,eq:()=>q,order:()=>q,limit:()=>Promise.resolve({data:[{id:'p1',name:'Solo empresa anterior',active:true,stock_quantity:1}],error:null})};
 const window={GestLokPilot:{authorized:()=>true,tenantId:()=> 'tenant-a',rerender(){}},GestLokSupabase:{auth:{getUser:async()=>({data:{user:{id:'a'}}})},from:()=>q}};
 runInNewContext(readFileSync('public/stock/gestlok-precios-stock.js','utf8'),{window,document:{addEventListener(){},querySelector(){return null;}},Intl,Date});
 await window.GestLokPreciosStock.open('stock');
 assert.match(window.GestLokPreciosStock.render(),/Solo empresa anterior/);
 window.GestLokPreciosStock.reset();
 assert.doesNotMatch(window.GestLokPreciosStock.render(),/Solo empresa anterior/);
});

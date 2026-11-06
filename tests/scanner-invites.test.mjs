import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';

const ownerA='a1000000-0000-4000-8000-000000000001';
const ownerB='b1000000-0000-4000-8000-000000000001';
const guest='c1000000-0000-4000-8000-000000000001';
const otherGuest='c2000000-0000-4000-8000-000000000001';
const tenantA='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const tenantB='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const productA='aaaa0000-0000-4000-8000-000000000002';
const productB='bbbb0000-0000-4000-8000-000000000002';
const permissions=(...allowed)=>JSON.stringify(Object.fromEntries(['caja','ventas','stock','precios','historial','reportes'].map(k=>[k,allowed.includes(k)])));
const migrations=[
 '20261029053000_piloto_control_total_perfumes.sql',
 '20261029055000_piloto_pedidos_perfumes.sql',
 '20261029115000_piloto_precios_stock_cami.sql',
 '20261104192116_scanner_shared_navigation.sql',
 '20261105035000_scanner_pos_ventas_atomicas.sql',
 '20261105125000_scanner_split_payments.sql',
 '20261105134500_scanner_split_payment_report.sql',
 '20261106035000_scanner_precio_final_manual.sql',
 '20261106173000_scanner_invites_owner_permissions.sql',
 '20261106174327_scanner_guest_redemption.sql',
];

test('Scanner: redemption, independent grants, scoped module writes and revocation',async()=>{
 const db=new PGlite({extensions:{pgcrypto}});
 try{
  await db.exec(readFileSync('caja-app/tests/fixtures/base.sql','utf8'));
  await db.exec(`create schema gestlok_caja_private;
    create table gestlok_caja_private.caja_app_empresas(tenant_id uuid primary key,habilitada boolean);
    create function public.mi_rol() returns text language sql stable as $$
      select case when auth.uid() in ('${ownerA}','${ownerB}') then 'dueno' end
    $$;
    insert into auth.users values ('${otherGuest}','segundo@example.com',null);`);
  for(const file of ['20261102050000_caja_app_base.sql','20261102170000_caja_app_sin_pin.sql'])await db.exec(readFileSync('caja-app/supabase/migrations/'+file,'utf8'));
  for(const file of migrations)await db.exec(readFileSync('supabase/migrations/'+file,'utf8'));
  const q=async(sql,params=[]) => (await db.query(sql,params)).rows;
  const scalar=async(sql,params=[]) => Object.values((await q(sql,params))[0])[0];
  const identity=async(uid,role='authenticated')=>{
   await db.exec('reset role');
   await q("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:uid,role})]);
   await db.exec(role==='anon'?'set role anon':'set role authenticated');
  };
  await q('insert into public.gestlok_pilot_access(tenant_id,owner_uid,enabled,pos_live_enabled) values ($1,$2,true,true),($3,$4,true,true)',[tenantA,ownerA,tenantB,ownerB]);
  await q('insert into gestlok_caja_private.caja_app_empresas values($1,true),($2,true)',[tenantA,tenantB]);
  await q("insert into public.gestlok_scanner_payment_methods values($1,'efectivo','Efectivo',true),($2,'efectivo','Efectivo',true)",[tenantA,tenantB]);
  const makeProduct=async(tenant,id)=>q("insert into public.gestlok_pilot_products(id,tenant_id,name,cost_price,manual_sale_price,stock_quantity) values($1,$2,'Producto de prueba',50,100,8)",[id,tenant]);
  const createBox=()=>scalar("select public.caja_app_crear_comercio('Comercio de prueba','Local de prueba','Dueño ficticio','1234')");
  await identity(ownerB);await makeProduct(tenantB,productB);const boxB=await createBox();
  await identity(ownerA);await makeProduct(tenantA,productA);const boxA=await createBox();
  await assert.rejects(q('select public.gestlok_scanner_caja_link($1,$2)',[tenantA,boxB.comercio_id]),/Caja no autorizada/);
  await q('select public.gestlok_scanner_caja_link($1,$2)',[tenantA,boxA.comercio_id]);
  const save=(tenant,id,email,grants)=>scalar("select public.gestlok_scanner_invite_save($1,$2,'Nombre','Apellido','+5491100000000',$3,$4)",[tenant,id,email,grants]);
  const id=await save(tenantA,null,'intruso@example.com',permissions('stock','caja','ventas'));
  const second=await save(tenantA,null,'segundo@example.com',permissions('reportes'));
  assert.notEqual(id,second);
  await assert.rejects(save(tenantB,null,'segundo@example.com',permissions()),/Acceso denegado/);
  await assert.rejects(q("update public.gestlok_scanner_invites set status='accepted'"),/permission denied/);
  await assert.rejects(save(tenantA,null,'segundo@example.com','{"caja":true}'),/check constraint/);
  const issue=invite=>scalar('select public.gestlok_scanner_invite_issue($1)',[invite]);
  const oldToken=await issue(id),token=await issue(id),token2=await issue(second);
  await identity(ownerB);
  assert.equal(await scalar('select count(*)::int from public.gestlok_scanner_invites'),0);
  await assert.rejects(issue(id),/no disponible/);
  const redeem=t=>scalar('select public.gestlok_scanner_invite_redeem($1)',[t]);
  await assert.rejects(redeem(token),/no disponible/);
  await identity(otherGuest);await assert.rejects(redeem(token2),/no disponible/);
  await identity(null,'anon');await assert.rejects(redeem(token),/permission denied/);
  await identity(guest);await assert.rejects(redeem(oldToken),/no disponible/);
  assert.equal(await redeem(token),tenantA);
  await assert.rejects(redeem(token),/no disponible/);
  const module=(tenant,key)=>scalar('select public.gestlok_scanner_guest_module($1,$2)',[tenant,key]);
  assert.equal(await scalar('select count(*)::int from public.gestlok_pilot_products'),0);
  assert.equal(await scalar('select count(*)::int from public.gestlok_scanner_invites'),0);
  await assert.rejects(module(tenantB,'stock'),/no autorizado/);
  for(const key of ['precios','historial','reportes'])await assert.rejects(module(tenantA,key),/no autorizado/);
  const [stock]=await module(tenantA,'stock');
  assert.equal(stock.id,productA);assert.equal(stock.cost_price,undefined);
  const write=(key,id,version,value,cost=null)=>q('select public.gestlok_scanner_guest_update_product($1,$2,$3,$4,$5,$6)',[tenantA,key,id,version,value,cost]);
  await assert.rejects(write('stock',productB,stock.updated_at,6),/producto cambió/i);
  await assert.rejects(write('precios',productA,stock.updated_at,150,60),/no autorizado/);
  await write('stock',productA,stock.updated_at,6);
  const sale=()=>scalar('select public.gestlok_pos_checkout_split($1,$2,$3,$4)',[tenantA,'dddd0000-0000-4000-8000-000000000001',JSON.stringify([{method:'efectivo',amount:100}]),JSON.stringify([{product_id:productA,quantity:1}])]);
  const saleId=await sale();assert.equal(await sale(),saleId);
  assert.equal((await module(tenantA,'stock'))[0].stock_quantity,5);
  assert.equal(await scalar('select count(*)::int from public.gestlok_pilot_pos_sales'),0);
  assert.equal((await scalar('select public.gestlok_scanner_guest_receipt($1,$2)',[tenantA,saleId])).id,saleId);
  assert.equal(await scalar('select public.gestlok_scanner_guest_caja($1)',[tenantA]),boxA.comercio_id);
  await assert.rejects(q('select public.caja_app_entrar_cuenta($1)',[boxB.local_id]),/Sin acceso/);
  const boxSession=await scalar('select public.caja_app_entrar_cuenta($1)',[boxA.local_id]);
  assert.equal(boxSession.persona.rol,'cajero');
  assert.ok(await scalar('select public.caja_app_estado($1)',[boxSession.token]));
  await identity(ownerA);
  assert.equal(await scalar('select operator_uid from public.gestlok_pilot_pos_sales'),guest);
  await save(tenantA,id,'intruso@example.com',permissions('precios','historial'));
  await identity(guest);
  await assert.rejects(sale(),/no habilitadas/);
  await assert.rejects(q('select public.caja_app_estado($1)',[boxSession.token]),/sesión de caja venció/);
  const [price]=await module(tenantA,'precios');
  await write('precios',productA,price.updated_at,123.45,60);
  assert.equal((await module(tenantA,'precios'))[0].unit_price,123.45);
  assert.equal((await module(tenantA,'historial'))[0].id,saleId);
  await db.exec('reset role');await q('update auth.users set email_confirmed_at=now() where id=$1',[otherGuest]);
  await identity(otherGuest);assert.equal(await redeem(token2),tenantA);
  assert.equal((await module(tenantA,'reportes'))[0].total,100);
  await assert.rejects(module(tenantA,'historial'),/no autorizado/);
  await identity(ownerA);await q('select public.gestlok_scanner_invite_revoke($1)',[id]);
  await identity(guest);assert.equal(await scalar('select public.gestlok_scanner_guest_context()'),null);
  await assert.rejects(module(tenantA,'precios'),/no autorizado/);
  await identity(otherGuest);assert.equal((await module(tenantA,'reportes')).length,1);
 }finally{await db.close();}
});

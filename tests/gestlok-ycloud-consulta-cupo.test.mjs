import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {commercialNumberKey,reserveSimulatedQuota} from '../supabase/functions/gestlok-ycloud-adapter/quota.mjs';
import {dispatchSinglePilotReply} from '../supabase/functions/gestlok-ycloud-adapter/one-shot.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('consulta de cupo: historial compartido por número, sucursal aislada, aviso 800, pausa antes de cargo, decisión sin salida',async()=>{
 const db=new PGlite({extensions:{pgcrypto}});
 const t='a0000000-0000-4000-8000-00000000000a',tb='b0000000-0000-4000-8000-00000000000b';
 const munro='a0000000-0000-4000-8000-000000000001',torcuato='a0000000-0000-4000-8000-000000000002',centro='b0000000-0000-4000-8000-000000000003';
 const a=await commercialNumberKey('+5491100000001'),b=await commercialNumberKey('+5491100000002');
 const q=async(sql,params=[]) => (await db.query(sql,params)).rows[0];
 const as=async(id,email)=>{
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:'c0000000-0000-4000-8000-00000000000'+id,email,role:'authenticated'})]);
  await db.exec('set role authenticated');
 };
 const srv=async()=>{await db.exec("reset role; set role service_role");};
 const panel=async(sucursal,accion='ver',id=null)=>(await q('select public.gestlok_chat_panel_whatsapp_cupo($1,$2,$3) as r',[sucursal,accion,id])).r;
 const reserve=async(sucursal,key,msg,units)=>(await q('select public.gestlok_ycloud_pilot_reserve_quota_y_avisar($1,$2,$3,$4) as r',[sucursal,key,msg.repeat(64),units])).r;
 try{
  await db.exec(read('tests/fixtures/chat/base.sql'));
  for(const f of ['20261119210000_gestlok_chat_base.sql','20261119233500_gestlok_chat_comercializar.sql','20261120014204_gestlok_chat_gerente_no_ampliar_editor.sql','20261126133655_gestlok_chat_whatsapp_consulta_cupo.sql']){
   await db.exec(read('supabase/migrations/'+f));
  }
  // Fictitious stage markers. No live DB or provider.
  await db.exec("create schema entorno_control; alter table gestlok_chat_private.pedidos add column es_prueba boolean not null default true; create schema gestlok_ycloud_pilot_private; grant usage on schema gestlok_ycloud_pilot_private to service_role");
  await db.exec(read('supabase/operaciones/gestlok-ycloud-cupo-pruebas.sql'));
  await db.exec(read('supabase/operaciones/gestlok-ycloud-consulta-cupo-pruebas.sql'));
  await db.query("insert into gestlok_chat_private.empresas(tenant_id,nombre_publico,habilitada) values ($1,'Empresa A',true),($2,'Empresa B',true)",[t,tb]);
  await db.query("insert into gestlok_chat_private.sucursales(id,tenant_id,local_id,slug,nombre) values ($1,$2,'munro','empa-munro','Munro'),($3,$2,'torcuato','empa-torcuato','Torcuato'),($4,$5,'centro','empb-centro','Centro')",[munro,t,torcuato,centro,tb]);
  await db.query("insert into gestlok_ycloud_pilot_private.quota_windows(sender_key,period_start,period_end,observed_at,used_upper_bound,unresolved_upper_bound,evidence_key) values ($1,now()-interval '1 day',now()+interval '29 days',now(),789,1,repeat('a',64)),($2,now()-interval '1 day',now()+interval '29 days',now(),0,0,repeat('b',64))",[a,b]);
  await as(3,'gerente.munro@prueba.example');
  assert.equal((await panel(munro)).estado,'sin_datos');
  await assert.rejects(panel(torcuato),e=>e.code==='42501');
  await assert.rejects(reserve(munro,a,'1',10),e=>e.code==='42501');
  await srv();
  const warn=await reserve(munro,a,'1',10);assert.equal(warn.aviso,'cerca_del_limite');assert.equal(warn.remaining,100);
  assert.equal(warn.sendAllowed,false);
  const other=await reserve(torcuato,b,'2',1);assert.equal(other.aviso,'normal');
  await assert.rejects(reserve(centro,a,'3',1));
  // Consume the remaining 100 synthetic units, with explicit per-message reservations.
  for(const char of '456789abcdef') {
   const r=await reserve(munro,a,char,10);
   if(r.pausado){assert.equal(r.aviso,'consulta');break;}
  }
  const blocked=await reserve(munro,a,'0',1);assert.equal(blocked.reserved,false);assert.equal(blocked.pausado,true);
  await as(3,'gerente.munro@prueba.example');
  const alert=await panel(munro);assert.equal(alert.estado,'consulta');assert.equal(alert.puede_decidir,false);
  await assert.rejects(panel(munro,'continuar',alert.consulta_id),e=>e.code==='42501');
  await as(6,'duena.b@prueba.example');
  await assert.rejects(panel(munro),e=>e.code==='42501');
  await as(2,'duena.a@prueba.example');
  assert.equal((await panel(torcuato)).estado,'normal');
  await assert.rejects(panel(torcuato,'continuar',alert.consulta_id),e=>e.code==='22023');
  const yes=await panel(munro,'continuar',alert.consulta_id);
  assert.equal(yes.estado,'continuacion_solicitada');assert.equal(yes.envio_habilitado,false);
  assert.equal((await dispatchSinglePilotReply(yes)).attempted,false);
  await srv();assert.equal((await reserve(munro,a,'3',1)).reserved,false);
  await as(2,'duena.a@prueba.example');
  assert.equal((await panel(munro,'mantener_pausa',alert.consulta_id)).estado,'pausa_confirmada');
  await db.exec('reset role');
  const n=await q("select count(*)::int as n from gestlok_chat_private.auditoria where accion='whatsapp_cupo_decision'");
  assert.equal(n.n,2);
  assert.equal((await q("select count(*)::int as n from gestlok_ycloud_pilot_private.quota_reservations where sender_key=$1",[a])).n,11);
  await db.exec('set role anon');
  await assert.rejects(panel(munro),e=>e.code==='42501');
 }finally{await db.close();}
});
test('el adaptador devuelve consulta antes de superar el límite y jamás permite enviar',async()=>{
 const result=await reserveSimulatedQuota({sucursal:'a0000000-0000-4000-8000-000000000001',from:'+5491100000001',messageKey:'a'.repeat(64),units:1,rpc:async(name,args)=>{
  assert.equal(name,'gestlok_ycloud_pilot_reserve_quota_y_avisar');assert.equal(args.p_sucursal,'a0000000-0000-4000-8000-000000000001');
  return {data:{simulated:true,sendAllowed:false,reserved:false,reason:'limit_reached',remaining:0,aviso:'consulta',pausado:true}};
 }});
 assert.equal(result.requiereConfirmacion,true);assert.equal(result.reserved,false);assert.equal(result.sendAllowed,false);
});

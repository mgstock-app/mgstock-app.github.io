import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { verifyPartnerPhone } from '../supabase/functions/gestlok-ycloud-partner-prueba/partner.mjs';
import { parsePartnerEvent } from '../supabase/functions/gestlok-ycloud-partner-events-prueba/events.mjs';
const id='00000000-0000-4000-8000-000000000010', other='00000000-0000-4000-8000-000000000020';
const number='+5491100000010', waba='123456789', realPhone={id:'1234567890',wabaId:waba,phoneNumber:'+541100000010'};
const secret='fictitious-secret-test-only-12345678';
const time=1800000000000;
const ev={id:'test-event-1',type:'whatsapp.business_account.updated',whatsappBusinessAccount:{id:waba,updateEvent:'PARTNER_ADDED',partnerCustomerId:id,paymentMethodAttached:false}};
function signed(payload, stamp=time, key=secret, tamper=false){
 const body=JSON.stringify(payload), t=String(Math.floor(stamp/1000));
 const signature=createHmac('sha256',key).update(t+'.'+body).digest('hex');
 return new Request('https://example.invalid/webhook',{method:'POST',headers:{'ycloud-signature':'t='+t+',s='+signature},body:tamper?body+' ':body});
}
test('signed event links only opaque ID and account; no message routing',async()=>{
 assert.deepEqual(await parsePartnerEvent(signed(ev),secret,time),{status:200,args:{p_accion:'cuenta',p_id:id,p_waba:waba,p_pago:false,p_evento:ev.id}});
 assert.equal((await parsePartnerEvent(signed(ev,time,'wrong-key'),secret,time)).status,403);
 assert.equal((await parsePartnerEvent(signed(ev,time-301000),secret,time)).status,403);
 assert.equal((await parsePartnerEvent(signed(ev,time,secret,true),secret,time)).status,403);
 assert.equal((await parsePartnerEvent(signed({...ev,type:'whatsapp.inbound_message.received'}),secret,time)).status,204);
 assert.equal((await parsePartnerEvent(signed({...ev,whatsappBusinessAccount:{...ev.whatsappBusinessAccount,partnerCustomerId:'not-a-uuid'}}),secret,time)).status,400);
});
test('verification reads provider only; exact WABA and normalized phone',async()=>{
 const args={apiKey:'fake',waba,number,fetcher:async(url,options)=>{
    assert.equal(new URL(url).searchParams.get('filter.wabaId'),waba);assert.equal(options.method,'GET');
    return new Response(JSON.stringify({items:[realPhone]}));
 }};
 assert.deepEqual(await verifyPartnerPhone(args),{waba,phoneId:realPhone.id,phone:realPhone.phoneNumber});
 for(const items of [[],[{...realPhone,wabaId:'999'}],[{...realPhone,phoneNumber:'+541100000011'}],[realPhone,realPhone]]){
   await assert.rejects(verifyPartnerPhone({...args,fetcher:async()=>new Response(JSON.stringify({items}))}),e=>e.status===409);
 }
 await assert.rejects(verifyPartnerPhone({...args,fetcher:async()=>new Response('',{status:503})}),e=>e.status===502);
});
test('database authorization, replay and competing tenant; never activates sending',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role;
   create schema gestlok_chat_private;create schema gestlok_tenancy;create schema gestlok_platform;create schema entorno_control;
   create table gestlok_chat_private.pedidos(es_prueba boolean default true);
   create table gestlok_tenancy.tenants(id uuid primary key,code text not null);
   create table public.docs(tenant_id uuid not null,col text not null,id text not null,data jsonb,primary key(tenant_id,col,id));
   create table gestlok_chat_private.empresas(tenant_id uuid primary key,nombre_publico text);
   create function gestlok_platform.require_admin() returns uuid language plpgsql as $$begin if current_setting('test.admin',true) is distinct from 'yes' then raise exception 'Acceso exclusivo' using errcode='42501';end if;return '${id}';end$$;
   insert into gestlok_tenancy.tenants values ('${id}','one'),('${other}','two');
   insert into public.docs values ('${id}','locales','a','{}'),('${other}','locales','b','{}');`);
  await db.exec(readFileSync(new URL('../supabase/migrations/20261126165000_gestlok_chat_premium_habilitacion.sql',import.meta.url),'utf8'));
  const sql=readFileSync(new URL('../supabase/operaciones/gestlok-ycloud-partner-vinculacion-prueba.sql',import.meta.url),'utf8');
  await db.exec(sql); await db.exec(sql);
  await db.exec(`insert into gestlok_chat_private.whatsapp_premium_habilitaciones(id,tenant_id,local_id,numero,creada_por,actualizada_por) values ('${id}','${id}','a','${number}','${id}','${id}'),('${other}','${other}','b','+15550000020','${id}','${id}');`);
  const rpc=(action,i=id,expires=null,wa=null,payment=null,event=null,phoneId=null,phone=null)=>db.query('select public.gestlok_chat_partner_prueba_estado($1,$2,$3,$4,$5,$6,$7,$8) as data',[action,i,expires,wa,payment,event,phoneId,phone]).then(r=>r.rows[0].data);
  const list=()=>db.query('select public.gestlok_chat_admin_whatsapp_conexiones_prueba() as data').then(r=>r.rows[0].data);
  await db.exec('set role authenticated;set test.admin=\'no\'');
  await assert.rejects(list(),/Acceso exclusivo/);
  await assert.rejects(rpc('consultar'),/permission denied/);
  await db.exec("set test.admin='yes'");assert.deepEqual(await list(),{});
  await db.exec('reset role;set role service_role');
  assert.equal(await rpc('cuenta',id,null,waba,false,'first'),null);
  const expiry=new Date(Date.now()+3600000).toISOString();
  assert.ok((await rpc('enlace',id,expiry)).enlace_vence);
  assert.ok((await rpc('cuenta',id,null,waba,false,'first')).waba);
  assert.equal(await rpc('cuenta',id,null,waba,true,'first'),null);
  assert.equal(await rpc('cuenta',id,null,'888',true,'wrong-waba'),null);
  assert.equal(await rpc('verificar',id,null,waba,null,null,realPhone.id,'+541100000011'),null);
  assert.ok((await rpc('verificar',id,null,waba,null,null,realPhone.id,realPhone.phoneNumber)).verificado_at);
  assert.ok((await rpc('enlace',other,expiry)).enlace_vence);
  assert.equal(await rpc('cuenta',other,null,waba,true,'other-event'),null);
  await db.exec('reset role;set role authenticated');assert.equal((await list())[id].estado,'numero_verificado');
  await db.exec(`reset role;update gestlok_chat_private.whatsapp_premium_habilitaciones set habilitada=false where id='${id}';set role service_role;`);
  assert.equal(await rpc('consultar'),null);
  await db.exec('reset role;set role authenticated');assert.equal((await list())[id].estado,'pausado');
 }finally{await db.close();}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHmac} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {parseEvent} from '../supabase/functions/gestlok-ycloud-events/events.mjs';
import {sendSingleReply} from '../supabase/functions/gestlok-ycloud-inbox/send.mjs';
import {createPartnerLink,verifyPartnerPhone} from '../supabase/functions/gestlok-ycloud-partner/partner.mjs';
const tenant='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002',
 sc='10000000-0000-4000-8000-000000000003',sc2='10000000-0000-4000-8000-000000000004',h='10000000-0000-4000-8000-000000000005',actor='10000000-0000-4000-8000-000000000006';
const wa='123456789',to='+15550000001',from='+15550000002',now=Date.now(),secret='mock-signature-secret-not-real-0123456789';
const payload={type:'whatsapp.inbound_message.received',apiVersion:'v2',id:'mock-event',whatsappInboundMessage:{id:'mock-message',wabaId:wa,to,from,type:'text',text:{body:'Hola, quiero ver el menú'},sendTime:new Date(now).toISOString()}};
function signed(body,stamp=now,key=secret,tamper=false){
 const t=String(Math.floor(stamp/1000)),b=JSON.stringify(body);
 return new Request('https://example.invalid/webhook',{method:'POST',headers:{'ycloud-signature':'t='+t+',s='+createHmac('sha256',key).update(t+'.'+b).digest('hex')},body:tamper?b+' ':b});
}
test('webhook accepts only signed direct text with provider timestamp',async()=>{
 const valid=await parseEvent(signed(payload),secret,now);assert.equal(valid.kind,'inbound');assert.deepEqual(valid.args,{p_waba:wa,p_to:to,p_from:from,p_evento:'mock-event',p_mensaje:'mock-message',p_texto:'Hola, quiero ver el menú',p_fecha:new Date(now).toISOString()});
 assert.equal((await parseEvent(signed(payload,now,'wrong'),secret,now)).status,403);
 assert.equal((await parseEvent(signed(payload,now-301000),secret,now)).status,403);
 assert.equal((await parseEvent(signed(payload,now,secret,true),secret,now)).status,403);
 for(const changes of [{groupId:'group'}, {type:'image'}, {sendTime:'2020-01-01'}, {sendTime:null},{from:to}]){
   assert.equal((await parseEvent(signed({...payload,whatsappInboundMessage:{...payload.whatsappInboundMessage,...changes}}),secret,now)).status,204);
 }
});
test('production provider link remains locked without approval, and exact phone verification refuses another number',async()=>{
 const opts={projectUrl:'https://vgsepaaewbctjsjcpeta.supabase.co',approved:false,apiKey:'fake',authorization:'Bearer dummy',id:h,onboardingType:'WHATSAPP_BUSINESS_APP',authorize:async()=>({id:h,habilitada:true,local_existe:true}),fetcher:async()=>{throw Error('must not call');}};
 await assert.rejects(createPartnerLink(opts),e=>e.status===503);
 await assert.rejects(verifyPartnerPhone({apiKey:'fake',waba:wa,number:to,fetcher:async()=>new Response(JSON.stringify({items:[{id:'99',wabaId:wa,phoneNumber:from}]}))}),e=>e.status===409);
});
test('manual response: no send without balance, fresh authorization, exact server route; one attempt',async()=>{
 const route={id:h,from:to,to:from,text:'¡Hola! Te paso el menú.'},calls=[];
 const fetcher=async(url,opts)=>{calls.push([url,opts]);return new Response(JSON.stringify(url.endsWith('/balance')?{currency:'USD',amount:.5}:{id:'mock-confirmation'}));};
 const args={route,apiKey:'fake',enabled:true,validate:async()=>true,fetcher};
 assert.equal((await sendSingleReply({...args,enabled:false})).status,'bloqueada');assert.equal(calls.length,0);
 assert.equal((await sendSingleReply({...args,validate:async()=>false})).status,'bloqueada');assert.equal(calls.length,1);calls.length=0;
 const r=await sendSingleReply(args);assert.equal(r.status,'aceptada');assert.equal(calls.length,2);
 assert.deepEqual(JSON.parse(calls[1][1].body),{from:to,to:from,type:'text',externalId:'gestlok-manual-'+h,ttlSeconds:60,text:{body:route.text}});
 let count=0;const uncertain=await sendSingleReply({...args,fetcher:async()=>{count++;if(count===1)return new Response(JSON.stringify({currency:'USD',amount:.5}));throw Error('timeout');}});assert.equal(uncertain.status,'incierta');assert.equal(count,2);
});
test('database full pilot: authorized admin -> signed inbound -> manager -> one reply; reject wrong branch, excluded & replay',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema gestlok_chat_private;create schema gestlok_tenancy;create schema gestlok_platform;
  create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$select '${actor}'::uuid$$;
  create function public.mi_rol() returns text language sql stable as $$select current_setting('test.role',true)$$;
  create table gestlok_tenancy.tenants(id uuid primary key,code text not null);
  create table public.docs(tenant_id uuid,col text,id text,data jsonb,primary key(tenant_id,col,id));
  create table gestlok_chat_private.empresas(tenant_id uuid primary key,nombre_publico text,habilitada bool not null default true);
  create table gestlok_chat_private.sucursales(id uuid primary key,tenant_id uuid,local_id text,unique(tenant_id,id));
  create function gestlok_platform.require_admin() returns uuid language plpgsql as $$begin if current_setting('test.role',true) is distinct from 'creadora' then raise exception 'Acceso exclusivo' using errcode='42501';end if;return '${actor}';end$$;
  create function gestlok_chat_private.exigir(s uuid,n text) returns text language plpgsql as $$begin if current_setting('test.local',true) is distinct from s::text and current_setting('test.role',true) is distinct from 'creadora' then raise exception 'No tenés permiso' using errcode='42501';end if;return 'gestionar';end$$;
  create function gestlok_chat_private.auditar(uuid,text,jsonb) returns void language sql as $$select null::void$$;
  insert into auth.users values ('${actor}');insert into gestlok_tenancy.tenants values ('${tenant}','one'),('${other}','two');
  insert into gestlok_chat_private.empresas(tenant_id,nombre_publico) values ('${tenant}','one'),('${other}','two');
  insert into gestlok_chat_private.sucursales values ('${sc}','${tenant}','a'),('${sc2}','${other}','b');
  insert into public.docs values ('${tenant}','locales','a','{}'),('${other}','locales','b','{}');`);
  for(const filename of ['20261126165000_gestlok_chat_premium_habilitacion.sql','20261126125750_gestlok_chat_whatsapp_exclusiones.sql','20261126180000_gestlok_chat_whatsapp_conexiones.sql','20261126181000_gestlok_chat_whatsapp_bandeja_piloto.sql']){
   const sql=readFileSync(new URL('../supabase/migrations/'+filename,import.meta.url),'utf8');await db.exec(sql);await db.exec(sql);
  }
  const call=async(fn,params)=>{const args=params.map((_,i)=>'$'+(i+1)).join(',');return (await db.query('select public.'+fn+'('+args+') as data',params)).rows[0].data;};
  const admin=(num=from)=>call('gestlok_chat_admin_whatsapp_piloto',[h,num,'autorizar']);
  const reserve=(s,i,text)=>call('gestlok_chat_panel_whatsapp_piloto_reservar',[s,i,text]);
  const receive=(sender=from,waba=wa,msg='m1',ev='e1')=>call('gestlok_chat_srv_whatsapp_piloto_recibir',[waba,to,sender,ev,msg,'Hola',new Date().toISOString()]);
  await db.exec(`insert into gestlok_chat_private.whatsapp_premium_habilitaciones(id,tenant_id,local_id,numero,creada_por,actualizada_por) values ('${h}','${tenant}','a','${to}','${actor}','${actor}');set role authenticated;set test.role='creadora';set test.local='${sc}';`);
  await assert.rejects(admin(),/Comprobá/);
  await db.exec('reset role;set role service_role');
  await call('gestlok_chat_partner_estado',['enlace',h,new Date(now+3600000).toISOString(),null,null,null,null,null]);
  await call('gestlok_chat_partner_estado',['cuenta',h,null,wa,false,'mock-account',null,null]);
  await call('gestlok_chat_partner_estado',['verificar',h,null,wa,null,null,'999',to]);
  await db.exec('reset role;set role authenticated');
  const pilot=await admin();assert.ok(pilot);await assert.rejects(admin(),/prueba vigente/);
  await db.exec("set test.role='gerente'");
  await assert.rejects(admin(),/Acceso exclusivo/);
  await assert.rejects(call('gestlok_chat_srv_whatsapp_piloto_recibir',[wa,to,from,'b','a','x',new Date().toISOString()]),/permission denied/);
  await db.exec('reset role;set role service_role');
  assert.equal(await receive('+15550000099'),false);assert.equal(await receive(from,'9999'),false);assert.equal(await receive(),true);assert.equal(await receive(from,wa,'m1','e2'),false);
  await db.exec('reset role;set role authenticated');
  const rows=await call('gestlok_chat_panel_whatsapp_bandeja',[sc]);assert.equal(rows.pilotos[0].texto,'Hola');assert.equal(rows.pilotos[0].puede_responder,true);
  await assert.rejects(call('gestlok_chat_panel_whatsapp_bandeja',[sc2]),/permiso/);
  await assert.rejects(reserve(sc2,pilot,'no'),/permiso/);
  await call('gestlok_chat_panel_whatsapp_excluidos',[sc,'agregar',from,'Prueba']);
  assert.equal(await reserve(sc,pilot,'Hola'),null);
  await call('gestlok_chat_panel_whatsapp_excluidos',[sc,'quitar',from,null]);
  const route=await reserve(sc,pilot,'Acá tenés el menú');assert.equal(route.to,from);assert.equal(route.from,to);
  assert.equal(await reserve(sc,pilot,'duplicada'),null);
  await db.exec('reset role;set role service_role');assert.equal(await call('gestlok_chat_srv_whatsapp_piloto_validar',[pilot]),true);
  assert.equal(await call('gestlok_chat_srv_whatsapp_piloto_finalizar',[pilot,'aceptada','mock-confirmation']),true);
  assert.equal(await call('gestlok_chat_srv_whatsapp_piloto_validar',[pilot]),false);
  await db.exec('reset role;set role authenticated');assert.equal((await call('gestlok_chat_panel_whatsapp_bandeja',[sc])).pilotos[0].estado,'aceptada');
 }finally{await db.close();}
});

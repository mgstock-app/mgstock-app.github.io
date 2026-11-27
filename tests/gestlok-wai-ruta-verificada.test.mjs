import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {resolveWaiRoute} from '../supabase/functions/gestlok-ycloud-events/wai-route.mjs';

const uuid=n=>'10000000-0000-4000-8000-'+String(n).padStart(12,'0');
const tenant=uuid(1),other=uuid(2),actor=uuid(3),s1=uuid(4),s2=uuid(5),s3=uuid(6),h1=uuid(7),h2=uuid(8),h3=uuid(9);
const wa='12345678',wa2='98765432',one='+5491100000001',two='+5491100000002',future='+5491100000003',sender='+5491100000010';
const load=f=>readFileSync(new URL('../supabase/'+f,import.meta.url),'utf8');

test('routing preflight accepts only inbound events and never authorizes the send',async()=>{
 const event={kind:'inbound',status:200,args:{p_waba:wa,p_to:one,p_from:sender,p_texto:'private'}};
 const route={habilitacion_id:h1,tenant_id:tenant,sucursal_id:s1,local_id:'uno',slug:'sucursal-uno',telefono_id:'9',numero_proveedor:one,verificado_at:new Date().toISOString(),send_allowed:false};
 let calls=0;
 const rpc=async(fn,args)=>{calls++;assert.equal(fn,'gestlok_chat_srv_wai_ruta_verificada');assert.deepEqual(args,{p_waba:wa,p_to:one,p_from:sender});return {data:route,error:null};};
 assert.deepEqual(await resolveWaiRoute(rpc,event),{status:'route_verified',route,sendAllowed:false});
 assert.deepEqual(await resolveWaiRoute(rpc,{...event,status:403}),{status:'ignored',sendAllowed:false});
 assert.equal(calls,1);
 assert.deepEqual(await resolveWaiRoute(async()=>({data:null,error:null}),event),{status:'ineligible',sendAllowed:false});
 await assert.rejects(resolveWaiRoute(async()=>({data:null,error:{message:'db'}}),event),/lookup failed/);
 await assert.rejects(resolveWaiRoute(async()=>({data:{...route,send_allowed:true},error:null}),event),/Invalid WAI route/);
});

test('verified routing isolates both current locals and future registrations; pauses, exclusions, stale debt, and unauthenticated access are blocked',async()=>{
 const db=new PGlite();
 try{
 await db.exec(`
 create role anon;create role authenticated;create role service_role;
 create schema auth;create schema gestlok_chat_private;create schema gestlok_tenancy;create schema gestlok_platform;
 create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$select '${actor}'::uuid$$;
 create function public.mi_rol() returns text language sql stable as $$select 'creadora'::text$$;
 create table gestlok_tenancy.tenants(id uuid primary key,code text not null);
 create table public.docs(tenant_id uuid,col text,id text,data jsonb,primary key(tenant_id,col,id));
 create table gestlok_chat_private.empresas(tenant_id uuid primary key,nombre_publico text,habilitada bool not null default true);
 create table gestlok_chat_private.sucursales(id uuid primary key,tenant_id uuid,local_id text,slug text unique,activa bool not null default true,unique(tenant_id,id),unique(tenant_id,local_id));
 create table gestlok_chat_private.cobro_ajustes(id bool primary key,gracia_dias integer not null);
 create table gestlok_chat_private.suscripciones(tenant_id uuid primary key,requiere_cobro bool not null,estado text not null,pausada_por_cobro bool not null default false,mora_desde timestamptz);
 create function gestlok_platform.require_admin() returns uuid language sql as $$select '${actor}'::uuid$$;
 create function gestlok_chat_private.exigir(uuid,text) returns text language sql as $$select 'gestionar'::text$$;
 create function gestlok_chat_private.auditar(uuid,text,jsonb) returns void language sql as $$select null::void$$;
 insert into auth.users values ('${actor}');
 insert into gestlok_tenancy.tenants values ('${tenant}','one'),('${other}','two');
 insert into gestlok_chat_private.empresas(tenant_id,nombre_publico) values ('${tenant}','one'),('${other}','two');
 insert into gestlok_chat_private.sucursales(id,tenant_id,local_id,slug) values ('${s1}','${tenant}','uno','sucursal-uno'),('${s2}','${tenant}','dos','sucursal-dos'),('${s3}','${other}','tres','sucursal-tres');
 insert into public.docs values ('${tenant}','locales','uno','{}'),('${tenant}','locales','dos','{}'),('${other}','locales','tres','{}');
 insert into gestlok_chat_private.suscripciones(tenant_id,requiere_cobro,estado) values ('${tenant}',false,'sin_suscripcion'),('${other}',true,'activa');
 insert into gestlok_chat_private.cobro_ajustes values (true,3);
 `);
 for(const f of ['20261126165000_gestlok_chat_premium_habilitacion.sql','20261126125750_gestlok_chat_whatsapp_exclusiones.sql','20261126180000_gestlok_chat_whatsapp_conexiones.sql'])await db.exec(load('migrations/'+f));
 await db.exec(load('operaciones/gestlok_wai_ruta_verificada_pendiente.sql'));
 const insertNumber=async(id,t,l,n)=>db.query('insert into gestlok_chat_private.whatsapp_premium_habilitaciones(id,tenant_id,local_id,numero,creada_por,actualizada_por) values ($1,$2,$3,$4,$5,$5)',[id,t,l,n,actor]);
 const call=async(fn,args)=>{
  const data=await db.query('select public.'+fn+'('+args.map((_,i)=>'$'+(i+1)).join(',')+') as data',args);
  return data.rows[0].data;
 };
 const verify=async(id,waba,number,phoneid)=>{
  await db.exec('set role service_role');
  assert.ok(await call('gestlok_chat_partner_estado',['enlace',id,new Date(Date.now()+60000).toISOString(),null,null,null,null,null]));
  assert.ok(await call('gestlok_chat_partner_estado',['cuenta',id,null,waba,false,'event-'+phoneid,null,null]));
  assert.ok(await call('gestlok_chat_partner_estado',['verificar',id,null,waba,null,null,phoneid,number]));
  await db.exec('reset role');
 };
 const route=async(waba,to,from=sender)=>{
  await db.exec('set role service_role');
  try{return await call('gestlok_chat_srv_wai_ruta_verificada',[waba,to,from]);}finally{await db.exec('reset role');}
 };
 await insertNumber(h1,tenant,'uno',one);
 await insertNumber(h2,tenant,'dos',two);
 assert.equal(await route(wa,one),null);
 await verify(h1,wa,one,'100');
 await verify(h2,wa,two,'200');
 assert.equal((await route(wa,one)).sucursal_id,s1);
 assert.equal((await route(wa,two)).sucursal_id,s2);
 assert.equal((await route(wa,one)).send_allowed,false);
 assert.equal((await route(wa,one.replace('+549','+54'))).sucursal_id,s1);
 assert.equal(await route(wa,one,one.replace('+549','+54')),null);
 assert.equal(await route(wa2,one),null);
 assert.equal(await route(wa,'+5491100000999'),null);
 // A new authorized local becomes routable without touching code or env.
 await insertNumber(h3,other,'tres',future);
 assert.equal(await route(wa2,future),null);
 await verify(h3,wa2,future,'300');
 assert.equal((await route(wa2,future)).sucursal_id,s3);
 assert.equal((await route(wa2,future)).tenant_id,other);
 assert.equal(await route(wa,future),null);
 await db.exec(`update gestlok_chat_private.whatsapp_premium_habilitaciones set habilitada=false where id='${h1}'`);
 assert.equal(await route(wa,one),null);assert.equal((await route(wa,two)).sucursal_id,s2);
 await db.exec(`update gestlok_chat_private.whatsapp_premium_habilitaciones set habilitada=true where id='${h1}'`);
 await db.exec(`update gestlok_chat_private.sucursales set activa=false where id='${s1}'`);
 assert.equal(await route(wa,one),null);assert.equal((await route(wa,two)).sucursal_id,s2);
 await db.exec(`update gestlok_chat_private.sucursales set activa=true where id='${s1}'`);
 await db.exec(`insert into gestlok_chat_private.whatsapp_excluidos(tenant_id,sucursal_id,numero,clave,nombre,creado_por) values ('${tenant}','${s1}','${sender}',gestlok_chat_private.whatsapp_exclusion_key('${sender}'),'excluido','${actor}')`);
 assert.equal(await route(wa,one),null);assert.equal(await route(wa,one,sender.replace('+549','+54')),null);
 assert.equal((await route(wa,two)).sucursal_id,s2);
 await db.exec(`update gestlok_chat_private.suscripciones set pausada_por_cobro=true where tenant_id='${other}'`);
 assert.equal(await route(wa2,future),null);
 await db.exec(`update gestlok_chat_private.suscripciones set pausada_por_cobro=false,estado='en_mora',mora_desde=now()-interval '2 days' where tenant_id='${other}'`);
 assert.equal((await route(wa2,future)).sucursal_id,s3);
 await db.exec(`update gestlok_chat_private.suscripciones set mora_desde=now()-interval '4 days' where tenant_id='${other}'`);
 assert.equal(await route(wa2,future),null);
 await db.exec(`update gestlok_chat_private.suscripciones set estado='activa' where tenant_id='${other}';update gestlok_chat_private.empresas set habilitada=false where tenant_id='${other}'`);
 assert.equal(await route(wa2,future),null);
 await db.exec(`update gestlok_chat_private.empresas set habilitada=true where tenant_id='${other}';delete from public.docs where tenant_id='${other}' and id='tres'`);
 assert.equal(await route(wa2,future),null);
 await db.exec('set role authenticated');
 await assert.rejects(call('gestlok_chat_srv_wai_ruta_verificada',[wa,two,sender]),/permission denied/);
 await db.exec('reset role;set role anon');
 await assert.rejects(call('gestlok_chat_srv_wai_ruta_verificada',[wa,two,sender]),/permission denied/);
 }finally{await db.close();}
});

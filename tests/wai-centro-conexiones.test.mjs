import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
const read=name=>readFileSync(name,'utf8');
const sql=read('supabase/migrations/20261127133630_gestlok_wai_centro_conexiones.sql');
const A='10000000-0000-4000-8000-000000000001',B='10000000-0000-4000-8000-000000000002',
 S='10000000-0000-4000-8000-000000000003',T='10000000-0000-4000-8000-000000000004',
 H='10000000-0000-4000-8000-000000000005',I='10000000-0000-4000-8000-000000000006',U='10000000-0000-4000-8000-000000000007';

test('WAI: credenciales por número, señal real reciente, QR temporal, recuperación aislada y pausa',async()=>{
 const db=new PGlite({extensions:{pgcrypto}});
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create schema auth;create schema extensions;create extension pgcrypto with schema extensions;
 create schema gestlok_chat_private;create schema gestlok_platform;create schema gestlok_tenancy;
 create table gestlok_tenancy.tenants(id uuid primary key,code text);
 create table public.docs(tenant_id uuid,col text,id text,data jsonb,primary key(tenant_id,col,id));
 create table gestlok_chat_private.empresas(tenant_id uuid primary key,nombre_publico text,habilitada boolean);
 create table gestlok_chat_private.sucursales(id uuid primary key,tenant_id uuid,local_id text);
 create function auth.uid() returns uuid language sql stable as $$select '${U}'::uuid$$;
 create function gestlok_platform.require_admin() returns uuid language plpgsql as $$begin if current_setting('test.role',true) is distinct from 'creadora' then raise exception 'Sin permiso';end if;return '${U}';end$$;
 create function gestlok_chat_private.es_creadora_chat() returns boolean language sql stable as $$select coalesce(current_setting('test.role',true)='creadora',false)$$;
 create function gestlok_chat_private.exigir(s uuid,p text) returns text language plpgsql as $$begin if current_setting('test.role',true) is distinct from 'gerente' or current_setting('test.local',true) is distinct from s::text then raise exception 'Sin permiso' using errcode='42501';end if;return 'gestionar';end$$;
 insert into gestlok_tenancy.tenants values ('${A}','a'),('${B}','b');
 insert into gestlok_chat_private.empresas values ('${A}','Empresa A',true),('${B}','Empresa B',true);
 insert into gestlok_chat_private.sucursales values ('${S}','${A}','uno'),('${T}','${B}','uno');
 insert into public.docs values ('${A}','locales','uno','{"nombre":"A uno"}'),('${B}','locales','uno','{"nombre":"B uno"}');`);
 await db.exec(read('supabase/migrations/20261126165000_gestlok_chat_premium_habilitacion.sql'));
 await db.exec(sql);await db.exec(sql);
 await db.exec(`insert into gestlok_chat_private.whatsapp_premium_habilitaciones(id,tenant_id,local_id,numero,creada_por,actualizada_por) values ('${H}','${A}','uno','+5491100000001','${U}','${U}'),('${I}','${B}','uno','+5491100000002','${U}','${U}');`);
 const admin=()=>db.exec("reset role;set role authenticated;set test.role='creadora'");
 const gerente=()=>db.exec(`reset role;set role authenticated;set test.role='gerente';set test.local='${S}'`);
 const anon=()=>db.exec('reset role;set role anon');
 const change=()=>db.exec('reset role');
 const call=async(fn,args)=>(await db.query('select public.'+fn+'('+args.map((_,i)=>'$'+(i+1)).join(',')+') as r',args)).rows[0].r;
 const ui=(s=null,a='listar',i=null)=>call('gestlok_chat_wai_conexiones',[s,a,i]);
 const signal=(id,key,rev=null,state=null,n=null,qr=null)=>call('gestlok_chat_wai_senal',[id,key,rev,state,n,qr]);
 const age=async(id,field,interval)=>{await change();await db.query(`update gestlok_chat_private.wai_sesiones set ${field}=now()-$1::interval where habilitacion_id=$2`,[interval,id]);};
 await anon();await assert.rejects(ui(),/permission denied/);await assert.rejects(db.query('select * from gestlok_chat_private.wai_sesiones'),/permission denied/);
 await admin();assert.equal((await ui()).length,2);assert.ok((await ui()).every(r=>r.estado==='sin_conector'));
 const a=await ui(null,'preparar',H),b=await ui(null,'preparar',I);
 assert.match(a.clave,/^[a-f0-9]{64}$/);assert.notEqual(a.clave,b.clave);
 await assert.rejects(ui(null,'preparar',H),/ya preparado/);
 assert.equal((await ui())[0].estado,'sin_senal');assert.ok(!JSON.stringify(await ui()).includes(a.clave));
 await gerente();assert.equal((await ui(S)).length,1);await assert.rejects(ui(T),/permiso/);
 await assert.rejects(ui(S,'rotar_clave',H),/administradora/);await assert.rejects(ui(S,'qr',I),/habilitado/);
 await anon();assert.equal(await signal(I,a.clave),null);
 const x=await signal(H,a.clave),y=await signal(I,b.clave);
 assert.equal(x.numero,'+5491100000001');
 await signal(H,a.clave,x.revision,'conectado','+5491100000002');
 await gerente();assert.equal((await ui(S))[0].estado,'desconectado');
 const qr='mock-qr-token-not-real-0123456789';
 await anon();await signal(H,a.clave,x.revision,'qr',null,qr);await signal(I,b.clave,y.revision,'conectado','+5491100000002');
 await gerente();const first=(await ui(S))[0];assert.equal(first.estado,'qr');assert.equal(first.qr,qr);
 await anon();await signal(H,a.clave,x.revision,'qr',null,qr);
 await gerente();assert.equal((await ui(S))[0].qr_vence,first.qr_vence);
 await age(H,'qr_vence','1 second');await gerente();assert.equal((await ui(S))[0].estado,'qr_vencido');assert.equal((await ui(S))[0].qr,null);
 await age(H,'solicitada_at','15 seconds');await gerente();await ui(S,'reconectar',H);assert.equal((await ui(S))[0].estado,'reconectando');
 await anon();const retry=await signal(H,a.clave,x.revision,'conectado','+5491100000001');assert.notEqual(retry.revision,x.revision);
 await admin();assert.equal((await ui()).find(r=>r.id===H).estado,'reconectando');assert.equal((await ui()).find(r=>r.id===I).estado,'conectado');
 await anon();await signal(H,a.clave,retry.revision,'conectado','+541100000001');await gerente();assert.equal((await ui(S))[0].estado,'conectado');await assert.rejects(ui(S,'qr',H),/ya conectado/);
 await age(H,'senal_at','91 seconds');await admin();assert.equal((await ui()).find(r=>r.id===H).estado,'sin_senal');assert.equal((await ui()).find(r=>r.id===I).estado,'conectado');
 const rotated=await ui(null,'rotar_clave',H);await anon();assert.equal(await signal(H,a.clave),null);assert.ok((await signal(H,rotated.clave)).habilitada);
 await change();await db.query('update gestlok_chat_private.whatsapp_premium_habilitaciones set habilitada=false where id=$1',[H]);await anon();assert.deepEqual(await signal(H,rotated.clave),{habilitada:false});
 await admin();assert.equal((await ui()).find(r=>r.id===H).estado,'pausado');
 }finally{await db.close();}
});

test('paneles existentes integran recuperación sin habilitar transporte',()=>{
 const admin=read('public/stock/gestlok-creator-home.js'),local=read('public/chat/panel/panel.js');
 assert.match(admin,/cur === 'usuarios'[^\n]*waiSupportView/);
 assert.match(admin,/data-wai-support="reconectar"/);
 assert.match(admin,/data-wai-support="qr"/);
 assert.match(admin,/if\(!premiumAdmin\(\)\|\|tab!=='usuarios'/);
 assert.match(local,/rpc\('wai_conexiones',\{p_sucursal:sucursal/);
 assert.match(local,/if\(DEMO\|\|!puede\('gestionar'\)\)return/);
 assert.doesNotMatch(sql,/net\.http|https?:|whatsapp\.send/);
});

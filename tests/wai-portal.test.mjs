import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
const read=p=>readFileSync(p,'utf8');
const [A,B,S,T,H,I,U,E]=Array.from({length:8},(_,i)=>'10000000-0000-4000-8000-00000000000'+(i+1));
const keyA='a'.repeat(64),keyB='b'.repeat(64),contact='+5491100000003',jid='5491100000003@s.whatsapp.net';
test('portal WAI: slug no concede permiso; la mensajería exige entorno, permiso, prueba, número y revisión',async()=>{
 const db=new PGlite({extensions:{pgcrypto}});
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create schema auth;create schema extensions;create extension pgcrypto with schema extensions;
 create schema gestlok_chat_private;create schema gestlok_platform;create schema gestlok_tenancy;
 create table gestlok_tenancy.tenants(id uuid primary key,code text);
 create table public.docs(tenant_id uuid,col text,id text,data jsonb,primary key(tenant_id,col,id));
 create table gestlok_chat_private.empresas(tenant_id uuid primary key,nombre_publico text,habilitada boolean);
 create table gestlok_chat_private.sucursales(id uuid primary key,tenant_id uuid,local_id text,slug text,nombre text,datos_transferencia text default '',horario text default '10 a 20',direccion text default 'Calle 123',acepta_retiro boolean default true,acepta_envio boolean default true,envio_zona text default 'Barrio',envio_costo numeric default 100,carta_imagen_url text default '',mensajes jsonb default '{}'::jsonb);
 create table gestlok_chat_private.categorias(id uuid primary key,activa boolean default true);
 create table gestlok_chat_private.productos(id uuid default gen_random_uuid(),sucursal_id uuid,categoria_id uuid,nombre text,precio numeric,activo boolean default true,disponible boolean default true,orden int default 0);
 create function auth.uid() returns uuid language sql stable as $$select coalesce(nullif(current_setting('test.uid',true),''),'${U}')::uuid$$;
 create function public.mi_rol() returns text language sql stable as $$select current_setting('test.role',true)$$;
 create function gestlok_platform.require_admin() returns uuid language plpgsql as $$begin if current_setting('test.role',true) is distinct from 'creadora' then raise exception 'Sin permiso';end if;return '${U}';end$$;
 create function gestlok_chat_private.es_creadora_chat() returns boolean language sql stable as $$select coalesce(current_setting('test.role',true)='creadora',false)$$;
 create function gestlok_chat_private.nivel(s uuid) returns text language sql stable as $$select case when current_setting('test.local',true)=s::text and current_setting('test.role',true)='gerente' then 'gestionar' when current_setting('test.local',true)=s::text and current_setting('test.role',true)='dueno' then 'configurar' end$$;
 create function gestlok_chat_private.exigir(s uuid,p text) returns text language plpgsql as $$begin if gestlok_chat_private.nivel(s) is null then raise exception 'Sin permiso' using errcode='42501';end if;return gestlok_chat_private.nivel(s);end$$;
 create function gestlok_chat_private.whatsapp_exclusion_key(n text) returns text language sql immutable as $$select regexp_replace(n,'^\\+549([0-9]{10})$','+54\\1')$$;
 create function public.gestlok_chat_srv_whatsapp_excluido(s uuid,n text) returns boolean language sql stable as $$select coalesce(current_setting('test.excluded',true)=n,false)$$;
 insert into gestlok_tenancy.tenants values ('${A}','a'),('${B}','b');
 insert into gestlok_chat_private.empresas values ('${A}','Empresa A',true),('${B}','Empresa B',true);
 insert into gestlok_chat_private.sucursales(id,tenant_id,local_id,slug,nombre) values ('${S}','${A}','uno','a-uno','Uno'),('${T}','${B}','uno','b-uno','Uno');
 insert into public.docs values ('${A}','locales','uno','{"nombre":"A uno"}'),('${B}','locales','uno','{"nombre":"B uno"}');`);
 for(const path of ['20261126165000_gestlok_chat_premium_habilitacion.sql','20261127133630_gestlok_wai_centro_conexiones.sql','20261127140000_gestlok_chat_wai_portal.sql'])await db.exec(read('supabase/migrations/'+path));
 await db.exec(`insert into gestlok_chat_private.whatsapp_premium_habilitaciones(id,tenant_id,local_id,numero,creada_por,actualizada_por) values ('${H}','${A}','uno','+5491100000001','${U}','${U}'),('${I}','${B}','uno','+5491100000002','${U}','${U}');
 insert into gestlok_chat_private.wai_sesiones(habilitacion_id,clave_hash,estado,senal_at) values ('${H}',encode(sha256(convert_to('${keyA}','UTF8')),'hex'),'conectado',now()),('${I}',encode(sha256(convert_to('${keyB}','UTF8')),'hex'),'conectado',now());`);
 const rev=(await db.query('select revision from gestlok_chat_private.wai_sesiones where habilitacion_id=$1',[H])).rows[0].revision;
 const role=(r,l=S)=>db.exec(`reset role;set test.role='${r}';set test.local='${l}';set role authenticated`);
 const anon=()=>db.exec("reset role;set test.role='';set role anon");
 const call=async(fn,args)=>(await db.query('select public.gestlok_chat_'+fn+'('+args.map((_,i)=>'$'+(i+1)).join(',')+') as x',args)).rows[0].x;
 const start=s=>call('wai_portal_inicio',[s]),authorize=(s,h,n,action='autorizar')=>call('wai_piloto_autorizar',[s,h,n,action]),inbox=(s,action='listar',p=null,t=null,e=null)=>call('wai_bandeja',[s,action,p,t,e]);
 const motor=(h=H,k=keyA,a='control',p=null,j=null,e=null,t=null,m=null,st=null,r=rev)=>call('wai_piloto_motor',[h,k,r,a,p,j,e,t,m,st]);
 await anon();await assert.rejects(start('a-uno'),/permission denied/);assert.equal(await motor(),null);
 await role('gerente');assert.equal((await start('a-uno')).locales[0].slug,'a-uno');assert.equal((await start('b-uno')).locales.length,0);await assert.rejects(inbox(T),/Sin permiso/);await assert.rejects(authorize(S,H,contact),/Solo administradora/);
 await role('colaborador');assert.equal((await start(null)).locales.length,0);
 await role('creadora');assert.equal((await start(null)).locales.length,2);assert.equal((await start(null)).piloto_disponible,false);await assert.rejects(authorize(S,H,contact),/Prueba no autorizada/);
 await db.exec('reset role;update gestlok_chat_private.wai_piloto_entorno set habilitado=true');
 await role('creadora');const p=await authorize(S,H,contact);await assert.rejects(authorize(S,H,contact),/Ya hay una prueba/);await assert.rejects(authorize(S,I,contact),/Número no disponible/);
 await role('gerente');await assert.rejects(inbox(S,'responder',p,'hola',E),/Esperá un mensaje/);
 await anon();assert.equal(await motor(H,keyB),null);assert.equal(await motor(I,keyA),null);
 assert.equal((await motor()).id,p);assert.equal(await motor(H,keyA,'recibir',p,'5491100009999@s.whatsapp.net','one','IGNORAR'),null);
 assert.equal(await motor(H,keyA,'recibir',p,'1234@lid','two','IGNORAR'),null);
 assert.deepEqual(await motor(H,keyA,'recibir',p,jid,'three','Hola'),{ok:true});await motor(H,keyA,'recibir',p,jid,'three','duplicado');
 await role('gerente');const c=(await inbox(S)).chats[0];assert.equal(c.mensajes.length,1);assert.equal(c.mensajes[0].texto,'Hola');assert.equal(c.puede_responder,true);
 await assert.rejects(inbox(T,'responder',p,'robo',E),/Sin permiso/);await inbox(S,'responder',p,'Respuesta de prueba',E);await inbox(S,'responder',p,'Respuesta de prueba',E);
 await anon();const job=await motor(H,keyA,'tomar',p);assert.equal(job.jid,jid);assert.equal(job.texto,'Respuesta de prueba');assert.equal(await motor(H,keyA,'tomar',p),null);
 await motor(H,keyA,'resultado',p,null,null,null,job.id,'aceptado');
 await role('gerente');assert.equal((await inbox(S)).chats[0].mensajes.filter(x=>x.direccion==='salida').length,1);
 await db.exec(`reset role;set test.excluded='${contact}'`);
 await anon();assert.equal(await motor(),null);await role('gerente');assert.equal((await inbox(S)).chats.length,0);
 await db.exec("reset role;set test.excluded='';update gestlok_chat_private.wai_pilotos set vence_at=now()-interval '1 second',creado_at=now()-interval '2 seconds'");
 await anon();assert.equal(await motor(),null);await role('gerente');assert.equal((await inbox(S)).chats.length,0);
 // New protocol: a legacy heartbeat never earns a green status; only the verified connector does.
 await db.exec("reset role;"+read('entornos/sql/wai-verificacion-y-qr.sql')+";update gestlok_chat_private.wai_sesiones set solicitada_at=now()-interval '1 minute',senal_at=now(),estado='conectado'");
 const connections=(s,action='listar',h=null)=>call('wai_conexiones',[s,action,h]);
 const signal=(fn,h,k,r,state,n,qr=null)=>call(fn,[h,k,r,state,n,qr]);
 await role('creadora');assert.equal((await connections(S))[0].estado,'verificando');
 await assert.rejects(authorize(S,H,contact),/conexión no verificada/);
 await anon();await signal('wai_senal_v2',H,keyA,rev,'conectado','+5491100000001');
 await role('creadora');assert.equal((await connections(S))[0].estado,'conectado');
 const p2=await authorize(S,H,contact);assert.ok(p2);
 await db.exec('reset role;'+read('entornos/sql/wai-piloto-entrega-pendiente.sql'));await anon();const grant=await motor();assert.equal(grant.id,p2);assert.ok(Date.parse(grant.creado_at)<Date.parse(grant.vence_at));assert.ok(Date.parse(grant.hora_servidor));
 await db.exec('reset role;'+read('entornos/sql/wai-mensajes-no-leidos.sql'));
 await anon();await motor(H,keyA,'recibir',p2,jid,'unread-1','Nuevo');
 await role('gerente');let thread=(await inbox(S)).chats[0];assert.equal(thread.mensajes[0].leido,false);
 const first=thread.mensajes[0].id;const mark=(s,p,ids)=>call('wai_marcar_leidos',[s,p,ids]);
 // Polling alone does not consume unread messages.
 assert.equal((await inbox(S)).chats[0].mensajes[0].leido,false);
 await anon();await assert.rejects(mark(S,p2,[first]),/permission denied/);
 await motor(H,keyA,'recibir',p2,jid,'unread-2','Segundo');
 await role('gerente',T);await assert.rejects(mark(S,p2,[first]),/Sin permiso/);
 await role('gerente');await assert.rejects(mark(S,p2,[first,E]),/Mensaje no disponible/);
 assert.equal(await mark(S,p2,[first]),1);assert.equal(await mark(S,p2,[first]),1);
 thread=(await inbox(S)).chats[0];assert.equal(thread.mensajes.filter(m=>!m.leido).length,1);assert.equal(thread.mensajes.find(m=>m.id===first).leido,true);
 await db.exec(`reset role;set test.uid='${E}'`);
 await role('gerente');assert.equal((await inbox(S)).chats[0].mensajes.filter(m=>!m.leido).length,2);
 await db.exec("reset role;set test.uid=''");
 await role('gerente');assert.equal((await inbox(S)).chats[0].mensajes.filter(m=>!m.leido).length,1);


 // Real WhatsApp key, delivery receipt and explicit correction workflow only within this pilot.
 await db.exec('reset role;'+read('entornos/sql/wai-acciones-y-entrega.sql'));
 await anon();assert.deepEqual((await motor()).salientes,[]);
 await role('gerente');await inbox(S,'responder',p2,'Texto original',E);
 await anon();const out=await motor(H,keyA,'tomar',p2);assert.ok(out.id);
 assert.equal((await motor(H,keyA,'resultado',p2,jid,'WA-ORIGINAL',null,out.id,'aceptado')).ok,true);
 await anon();assert.deepEqual((await motor()).salientes,[{wa_id:'WA-ORIGINAL',ruta:jid,accion_id:null}]);
 await role('gerente');let row=(await inbox(S)).chats[0].mensajes.find(m=>m.id===out.id);assert.equal(row.entregado,false);assert.equal(row.puede_editar,true);assert.equal(row.puede_eliminar,true);
 const action=(s,p,m,a,t=null)=>call('wai_mensaje_accion',[s,p,m,a,t]);
 await role('gerente',T);await assert.rejects(action(S,p2,out.id,'editar','Robo'),/Sin permiso/);
 await db.exec(`reset role;set test.uid='${E}'`);await role('gerente');await assert.rejects(action(S,p2,out.id,'eliminar'),/no admite/);
 await db.exec("reset role;set test.uid=''");await role('gerente');
 await assert.rejects(action(S,p2,first,'eliminar'),/no admite/);
 await anon();assert.equal((await motor(H,keyA,'entrega',p2,null,'unknown')).ok,false);assert.equal((await motor(H,keyA,'entrega',p2,null,'WA-ORIGINAL')).ok,true);
 await role('gerente');row=(await inbox(S)).chats[0].mensajes.find(m=>m.id===out.id);assert.equal(row.entregado,true);assert.equal(await action(S,p2,out.id,'editar','Texto corregido'),true);
 await assert.rejects(action(S,p2,out.id,'eliminar'),/no admite/);
 await anon();const edit=await motor(H,keyA,'tomar_accion',p2);assert.equal(edit.wa_id,'WA-ORIGINAL');assert.equal(edit.tipo,'editar');assert.equal(edit.ruta,jid);assert.equal(edit.texto,'Texto corregido');assert.equal(await motor(H,keyA,'tomar_accion',p2),null);
 await motor(H,keyA,'resultado_accion',p2,null,'WA-EDIT',null,out.id,'aceptado');
 await role('gerente');row=(await inbox(S)).chats[0].mensajes.find(m=>m.id===out.id);assert.equal(row.texto,'Texto corregido');assert.equal(row.editado,true);assert.equal(row.accion_entregada,false);
 await anon();assert.equal((await motor(H,keyA,'entrega',p2,null,'WA-EDIT')).ok,true);
 await role('gerente');row=(await inbox(S)).chats[0].mensajes.find(m=>m.id===out.id);assert.equal(row.accion_entregada,true);await action(S,p2,out.id,'eliminar');
 await anon();const del=await motor(H,keyA,'tomar_accion',p2);assert.equal(del.tipo,'eliminar');await motor(H,keyA,'resultado_accion',p2,null,'WA-DELETE',null,out.id,'aceptado');
 await role('gerente');row=(await inbox(S)).chats[0].mensajes.find(m=>m.id===out.id);assert.equal(row.eliminado,true);assert.equal(row.texto,'Mensaje eliminado');assert.equal(row.puede_editar,false);assert.equal(row.puede_eliminar,false);

 // Alias survives a new pilot and belongs to the local; phone agenda belongs to the line.
 await db.exec('reset role;'+read('entornos/sql/wai-contactos-alias-agenda.sql'));
 await db.exec(read('entornos/sql/wai-control-salientes-correccion.sql'));
 await anon();assert.deepEqual((await motor()).salientes,[{wa_id:'WA-ORIGINAL',ruta:jid,accion_id:'WA-DELETE'}]);
 const alias=(s,p,a)=>call('wai_contacto_alias',[s,p,a]);
 await role('gerente');assert.equal(await alias(S,p2,'Cliente frecuente'),true);
 await role('gerente',T);await assert.rejects(alias(S,p2,'Otro local'),/Sin permiso/);
 await anon();await assert.rejects(alias(S,p2,'Cambio sin permiso'),/permission denied/);
 assert.equal(await motor(H,keyA,'agenda',p2,'5491100009999@s.whatsapp.net',null,'Nombre ajeno'),null);
 assert.equal((await motor(H,keyA,'agenda',p2,jid,null,'Nombre agendado')).ok,true);
 await role('gerente');let contactRow=(await inbox(S)).chats[0];assert.equal(contactRow.alias,'Cliente frecuente');assert.equal(contactRow.nombre_agenda,'Nombre agendado');
 await alias(S,p2,null);assert.equal((await inbox(S)).chats[0].alias,null);
 await alias(S,p2,'Cliente frecuente');
 await db.exec('reset role');const revOther=(await db.query('select revision from gestlok_chat_private.wai_sesiones where habilitacion_id=$1',[I])).rows[0].revision;
 await anon();await signal('wai_senal_v2',I,keyB,revOther,'conectado','+5491100000002');
 await role('creadora');const otherPilot=await authorize(T,I,contact);assert.equal((await inbox(T)).chats[0].alias,null);assert.equal((await inbox(T)).chats[0].nombre_agenda,null);
 await authorize(T,I,null,'cancelar');await anon();await signal('wai_senal',I,keyB,revOther,'conectado','+5491100000002');
 await role('gerente',T);await assert.rejects(connections(T,'revalidar',H),/Número no habilitado/);
 await role('gerente');assert.equal((await connections(S,'revalidar',H))[0].estado,'reconectando');
 await anon();const cmd=await signal('wai_senal',H,keyA,rev,'conectado','+5491100000001');assert.equal(cmd.orden,'qr_forzado');
 await signal('wai_senal',H,keyA,cmd.revision,'conectado','+5491100000001');
 await role('creadora');assert.equal((await connections(S))[0].estado,'reconectando');assert.equal((await connections(T))[0].estado,'verificando');
 await anon();await signal('wai_senal_v2',H,keyA,cmd.revision,'qr',null,'test-qr-no-real-code');await role('creadora');assert.equal((await connections(S))[0].estado,'qr');
 await anon();await signal('wai_senal_v2',H,keyA,cmd.revision,'conectado','+5491100000001');await role('creadora');assert.equal((await connections(S))[0].estado,'conectado');
 assert.equal((await inbox(S)).chats.length,0);
 const p3=await authorize(S,H,contact);assert.ok(p3);const renamed=(await inbox(S)).chats[0];assert.equal(renamed.alias,'Cliente frecuente');assert.equal(renamed.nombre_agenda,'Nombre agendado');
 await anon();await signal('wai_senal',H,keyA,cmd.revision,'conectado','+5491100000001');await role('creadora');assert.equal((await connections(S))[0].estado,'verificando');
 // Persist already authorized history when disconnected/expired; never use it as permission to send.
 await db.exec('reset role;'+read('entornos/sql/wai-historial-persistente.sql'));
 await role('gerente');let hist=(await inbox(S)).chats[0];assert.equal(hist.id,p);assert.equal(hist.piloto_activo,p3);assert.equal(hist.conexion_activa,false);assert.equal(hist.puede_responder,false);
 assert.equal(hist.mensajes.length,5);assert.equal(hist.alias,'Cliente frecuente');assert.ok(hist.mensajes.every(m=>!m.puede_editar&&!m.puede_eliminar));
 const historicalIncoming=hist.mensajes.filter(m=>m.direccion==='entrada').map(m=>m.id);
 assert.equal(await mark(S,hist.id,historicalIncoming),3);assert.equal((await inbox(S)).chats[0].mensajes.filter(m=>m.direccion==='entrada'&&!m.leido).length,0);
 await assert.rejects(inbox(S,'responder',hist.id,'No enviar desconectado',E),/Prueba no disponible/);
 await role('gerente',T);await assert.rejects(inbox(S),/Sin permiso/);await assert.rejects(mark(S,hist.id,historicalIncoming),/Sin permiso/);
 await anon();await signal('wai_senal_v2',H,keyA,cmd.revision,'conectado','+5491100000001');
 await role('gerente');hist=(await inbox(S)).chats[0];assert.equal(hist.id,p);assert.equal(hist.puede_responder,true);
 await inbox(S,'responder',hist.id,'Continuación del mismo contacto',E);
 await anon();const continuation=await motor(H,keyA,'tomar',p3,null,null,null,null,null,cmd.revision);assert.ok(continuation.id);assert.equal(continuation.jid,jid);
 await motor(H,keyA,'resultado',p3,jid,'WA-CONTINUATION',null,continuation.id,'aceptado',cmd.revision);
 await role('creadora');await authorize(S,H,null,'cancelar');
 hist=(await inbox(S)).chats[0];assert.equal(hist.id,p);assert.equal(hist.archivado,true);assert.equal(hist.piloto_activo,null);assert.equal(hist.puede_responder,false);assert.equal(hist.mensajes.length,6);
 assert.equal(await alias(S,hist.id,'Alias aun sin ensayo'),true);
 const p4=await authorize(S,H,contact);hist=(await inbox(S)).chats[0];assert.equal(hist.id,p);assert.equal(hist.piloto_activo,p4);assert.equal(hist.alias,'Alias aun sin ensayo');assert.equal(hist.puede_responder,true);assert.equal(hist.mensajes.length,6);


 // Linked-phone mirror: no send queue, no cross-contact capture, no echo duplicates.
 await db.exec('reset role;'+read('entornos/sql/wai-sincronizar-telefono.sql'));
 await anon();await signal('wai_senal_v2',H,keyA,cmd.revision,'desconectado',null);
 const preflight=(h,k,r)=>call('wai_ensayo_autorizado',[h,k,r]);
 assert.equal(await preflight(H,keyB,cmd.revision),null);assert.equal(await preflight(H,keyA,rev),null);
 assert.equal((await preflight(H,keyA,cmd.revision)).id,p4);assert.equal(await motor(H,keyA,'control',null,null,null,null,null,null,cmd.revision),null);
 await signal('wai_senal_v2',H,keyA,cmd.revision,'conectado','+5491100000001');
 assert.equal(await motor(H,keyA,'recibir_salida',p4,'5491100009999@s.whatsapp.net','OTHER','No guardar',null,'enviado',cmd.revision),null);
 assert.ok((await motor(H,keyA,'recibir_salida',p4,jid,'PHONE-ONE','Desde teléfono',null,'enviado',cmd.revision)).ok);
 assert.ok((await motor(H,keyA,'recibir_salida',p4,jid,'PHONE-ONE','Duplicado',null,'enviado',cmd.revision)).ok);
 assert.equal(await motor(H,keyA,'tomar',p4,null,null,null,null,null,cmd.revision),null);
 await role('gerente');hist=(await inbox(S)).chats[0];assert.equal(hist.id,p);assert.equal(hist.mensajes.length,7);
 const phoneMsg=hist.mensajes.find(m=>m.origen==='telefono');assert.equal(phoneMsg.texto,'Desde teléfono');assert.equal(phoneMsg.direccion,'salida');assert.equal(phoneMsg.entregado,false);assert.notEqual(phoneMsg.puede_editar,true);
 assert.equal(hist.puede_responder,true);
 await anon();assert.ok((await motor(H,keyA,'entrega',p4,null,'PHONE-ONE',null,null,null,cmd.revision)).ok);
 await role('gerente');assert.equal((await inbox(S)).chats[0].mensajes.find(m=>m.origen==='telefono').entregado,true);
 await role('creadora');await authorize(S,H,null,'cancelar');await anon();assert.equal(await preflight(H,keyA,cmd.revision),null);
 await role('creadora');hist=(await inbox(S)).chats[0];assert.equal(hist.archivado,true);assert.equal(hist.mensajes.length,7);

 // Order tracking: local settings, real scheduled messages, feedback and complaints.
 const validator=read('supabase/migrations/20261120070000_gestlok_chat_resena_cierre.sql');
 await db.exec('reset role;'+validator.slice(validator.indexOf('create or replace function gestlok_chat_private.url_resena_valida'),validator.indexOf('create or replace function gestlok_chat_private.mensajes_validos')));
 await db.exec(read('entornos/sql/wai-pedidos-seguimiento.sql'));
 await db.exec(`update gestlok_chat_private.sucursales set datos_transferencia='Alias: ejemplo.local',mensajes='{"resena_url":"https://g.page/ejemplo/review"}' where id='${S}'`);
 await anon();await signal('wai_senal_v2',H,keyA,cmd.revision,'conectado','+5491100000001');
 await role('creadora');const p5=await authorize(S,H,contact);
 const order=(action,o=null,mode=null,delay=2,event=E,local=S,hilo=p)=>call('wai_pedido',[local,hilo,action,o,mode,delay,event]);
 const feedback=(token,a='ver',detail=null,photo=null)=>call('wai_valoracion',[token,a,detail,photo]);
 const photo=(local,o)=>call('wai_pedido_foto',[local,o]);
 const sendJob=async()=>{const j=await motor(H,keyA,'tomar',p5,null,null,null,null,null,cmd.revision);assert.ok(j);await motor(H,keyA,'resultado',p5,jid,'WA-'+j.id,null,j.id,'aceptado',cmd.revision);return j.texto;};
 await role('gerente',T);await assert.rejects(order('transferencia'),/Sin permiso/);
 await role('gerente');assert.equal(await order('transferencia'),true);assert.equal(await order('transferencia'),true);
 assert.equal(await order('aceptar',null,'retiro',2),true);assert.equal(await order('aceptar',null,'retiro',2),true);
 let o=(await inbox(S)).chats[0].pedidos[0];assert.equal(o.estado,'preparacion');
 assert.equal((await inbox(S)).chats[0].transferencia_configurada,true);
 await assert.rejects(order('entregado',o.id),/Primero/);
 await anon();assert.match(await sendJob(),/Alias: ejemplo.local/);assert.match(await sendJob(),/en preparación/);
 await role('gerente');assert.equal(await order('listo',o.id),true);assert.equal(await order('listo',o.id),true);
 await anon();assert.match(await sendJob(),/listo para retirar/);
 assert.ok((await motor(H,keyA,'control',null,null,null,null,null,null,cmd.revision)).id);
 assert.equal(await motor(H,keyA,'tomar',p5,null,null,null,null,null,cmd.revision),null);
 await role('gerente');assert.equal(await order('entregado',o.id),true);
 await anon();assert.match(await sendJob(),/https:\/\/g\.page\/ejemplo\/review/);
 await db.exec(`reset role;update gestlok_chat_private.wai_pedidos set consulta_at=now()-interval '1 second' where id='${o.id}';update gestlok_chat_private.wai_mensajes set reservado_at=now()-interval '3 minutes' where piloto_id='${p5}' and estado='aceptado'`);
 await anon();await motor(H,keyA,'control',null,null,null,null,null,null,cmd.revision);
 await motor(H,keyA,'control',null,null,null,null,null,null,cmd.revision);
 const survey=await sendJob();const token=survey.match(/#([a-f0-9]{64})$/)[1];assert.equal(await feedback('a'.repeat(64)),null);
 assert.equal((await feedback(token)).valoracion,null);
 assert.equal((await feedback(token,'problema')).valoracion,'problema');
 assert.equal((await feedback(token,'bien')).valoracion,'problema');
 assert.equal((await feedback(token,'detalle','Llegó frío','/9j/AAAA')).detalles_enviados,true);
 await motor(H,keyA,'control',null,null,null,null,null,null,cmd.revision);
 assert.match(await sendJob(),/Lamentamos mucho/);
 await role('gerente');let rowOrder=(await inbox(S)).chats[0];assert.equal(rowOrder.reclamo_pendiente,true);assert.equal(rowOrder.pedidos[0].detalle,'Llegó frío');assert.equal(await photo(S,o.id),'/9j/AAAA');
 assert.ok(rowOrder.mensajes.some(m=>m.origen==='valoracion'&&m.texto.includes('Tuve un problema')));
 await mark(S,rowOrder.id,rowOrder.mensajes.filter(m=>m.direccion==='entrada'&&!m.leido).map(m=>m.id));
 assert.equal((await inbox(S)).chats[0].reclamo_pendiente,true);
 await role('gerente',T);await assert.rejects(photo(S,o.id),/Sin permiso/);assert.equal(await photo(T,o.id),null);
 await role('gerente');assert.equal(await order('resolver',o.id),true);assert.equal((await inbox(S)).chats[0].reclamo_pendiente,false);
 // Reauthorization does not resend the earlier survey. Test positive with delivery.
 await role('creadora');await authorize(S,H,null,'cancelar');const p6=await authorize(S,H,contact);
 await role('gerente');assert.equal(await order('aceptar',null,'delivery',1,U),true);
 const o2=(await inbox(S)).chats[0].pedidos[0];assert.equal(o2.modalidad,'delivery');assert.equal(await order('listo',o2.id),true);
 await anon();const drain=async()=>{const j=await motor(H,keyA,'tomar',p6,null,null,null,null,null,cmd.revision);assert.ok(j);await motor(H,keyA,'resultado',p6,jid,'WA-'+j.id,null,j.id,'aceptado',cmd.revision);return j.texto;};
 assert.match(await drain(),/preparación/);assert.match(await drain(),/en camino/);
 await db.exec(`reset role;update gestlok_chat_private.wai_pedidos set consulta_at=now()-interval '1 second' where id='${o2.id}';update gestlok_chat_private.wai_mensajes set reservado_at=now()-interval '2 minutes' where piloto_id='${p6}' and estado='aceptado'`);
 await anon();await motor(H,keyA,'control',null,null,null,null,null,null,cmd.revision);
 const survey2=await drain(),token2=survey2.match(/#([a-f0-9]{64})$/)[1];
 // Feedback is recorded even if WhatsApp goes offline, and acknowledgement waits for real signal.
 await signal('wai_senal_v2',H,keyA,cmd.revision,'desconectado',null);
 assert.equal((await feedback(token2,'bien')).valoracion,'bien');assert.equal(await motor(H,keyA,'control',null,null,null,null,null,null,cmd.revision),null);
 await signal('wai_senal_v2',H,keyA,cmd.revision,'conectado','+5491100000001');
 await motor(H,keyA,'control',null,null,null,null,null,null,cmd.revision);assert.match(await drain(),/Muchas gracias/);
 await role('creadora');await authorize(S,H,null,'cancelar');
 await anon();assert.equal(await feedback(token2),null);assert.equal(await feedback(token),null);
 await role('gerente');assert.equal((await inbox(S)).chats[0].pedidos.length,2);

 // Native selection protocol, reusable menu per local, authorized handoff and
 // backwards compatibility with the previous text-only connector.
 await db.exec('reset role;'+read('entornos/sql/wai-interacciones-generales.sql'));
 const cfg=(local,c=null)=>call('wai_atencion_config',[local,c]);
 const att=(action,local=S,hilo=p,event=E)=>call('wai_atencion_accion',[local,hilo,action,event]);
 const settings={pregunta:'¿Qué servicio necesitás?',opciones:[{label:'Consultar disponibilidad',respuesta:'Atendemos con turno previo.',humano:false},{label:'Hablar con una persona',respuesta:'',humano:true}],bienvenida_auto:true,pedidos:false};
 await role('gerente');assert.equal((await cfg(S)).bienvenida_auto,false);assert.equal((await cfg(S,settings)).pregunta,settings.pregunta);
 await assert.rejects(cfg(S,{...settings,opciones:[settings.opciones[0],settings.opciones[0]]}),/diferentes/);
 await role('gerente',T);assert.equal((await cfg(T)).bienvenida_auto,false);await assert.rejects(cfg(S),/Sin permiso/);await assert.rejects(att('manual'),/Sin permiso/);
 await role('creadora');const p7=await authorize(S,H,contact);
 const native=(action,pid=p7,j=null,event=null,text=null,msg=null,state='opciones_v1')=>motor(H,keyA,action,pid,j,event,text,msg,state,cmd.revision);
 await anon();
 assert.equal((await native('control',null)).id,p7);assert.equal(await native('tomar'),null); // no inbound yet
 await motor(H,keyA,'recibir',p7,jid,'NEW','Hola',null,null,cmd.revision);
 await motor(H,keyA,'control',null,null,null,null,null,null,cmd.revision);
 assert.equal(await motor(H,keyA,'tomar',p7,null,null,null,null,null,cmd.revision),null); // legacy connector never auto-sends menu
 await role('gerente');await assert.rejects(att('enviar'),/Actualizá el conector/);
 await anon();await native('control',null);await native('control',null);
 assert.equal(await motor(H,keyA,'tomar',p7,null,null,null,null,null,cmd.revision),null); // legacy does not claim native queue
 const menu=await native('tomar');assert.equal(menu.interaccion.pregunta,settings.pregunta);assert.equal(menu.interaccion.opciones.length,2);
 await native('resultado',p7,jid,'WA-MENU',null,menu.id,'aceptado');
 assert.equal(await native('voto',p7,'5491100009999@s.whatsapp.net','WA-MENU','op1'),null);
 assert.equal(await native('voto',p7,jid,'WA-MENU','inventada'),null);
 assert.equal(await native('voto',p7,jid,'UNKNOWN','op1'),null);
 assert.ok((await native('voto',p7,jid,'WA-MENU','op1')).ok);
 assert.ok((await native('voto',p7,jid,'WA-MENU','op1')).ok);
 await native('control',null);await native('control',null);
 const answer=await native('tomar');assert.equal(answer.texto,'Atendemos con turno previo.');await native('resultado',p7,jid,'WA-ANSWER',null,answer.id,'aceptado');
 assert.equal(await native('tomar'),null);
 // Customer changes their vote and requests a person.
 assert.ok((await native('voto',p7,jid,'WA-MENU','op2')).ok);
 await native('control',null);assert.equal(await native('tomar'),null);
 await role('gerente');let c7=(await inbox(S)).chats[0];assert.equal(c7.atencion_manual,true);assert.equal(c7.atencion_pendiente,true);assert.equal(c7.pedidos_habilitados,false);
 assert.ok(c7.mensajes.some(m=>m.origen==='opcion'&&m.texto.includes('Hablar con una persona')));
 assert.equal(await att('atendido'),true);assert.equal((await inbox(S)).chats[0].atencion_pendiente,false);
 assert.equal(await att('asistido'),true);assert.equal((await inbox(S)).chats[0].atencion_manual,false);
 await assert.rejects(order('aceptar',null,'retiro',2,'10000000-0000-4000-8000-000000000099'),/desactivado/);
 // Retiring a module does not erase or block completion of prior orders.
 assert.equal(await order('entregado',o2.id),true);
 await cfg(S,{...settings,pedidos:true,bienvenida_auto:false});
 // Use a native survey for the next order; complaint overrides earlier positive choice.
 const ref='10000000-0000-4000-8000-000000000099';
 assert.equal(await order('aceptar',null,'retiro',1,ref),true);
 const o3=(await inbox(S)).chats[0].pedidos[0];assert.equal(await order('listo',o3.id),true);
 await anon();const sendNative=async id=>{const j=await native('tomar');assert.ok(j);await native('resultado',p7,jid,id,null,j.id,'aceptado');return j;};
 // Delivery notice, preparation, ready notice are all queued.
 for(let i=1;i<=3;i++)await sendNative('WA-P'+i);
 await db.exec(`reset role;update gestlok_chat_private.wai_pedidos set consulta_at=now()-interval '1 second' where id='${o3.id}';update gestlok_chat_private.wai_mensajes set reservado_at=now()-interval '2 minutes' where piloto_id='${p7}' and estado='aceptado'`);
 await anon();await native('control',null);const ns=await sendNative('WA-SURVEY');
 assert.equal(ns.interaccion.opciones[0].id,'bien');assert.equal(ns.interaccion.opciones[1].id,'problema');
 assert.ok((await native('voto',p7,jid,'WA-SURVEY','bien')).ok);
 await native('control',null);assert.match((await sendNative('WA-THANK')).texto,/Muchas gracias/);
 assert.ok((await native('voto',p7,jid,'WA-SURVEY','problema')).ok);
 await native('control',null);assert.match((await sendNative('WA-SORRY')).texto,/Lamentamos mucho/);
 await role('gerente');assert.equal((await inbox(S)).chats[0].reclamo_pendiente,true);
 // Configurable global timers, assistant native selection and durable cycles.
 await order('resolver',o3.id);
 await db.exec(`reset role;update gestlok_chat_private.wai_pedidos set estado='entregado' where id='${o3.id}';insert into gestlok_chat_private.productos(sucursal_id,nombre,precio) values ('${S}','Producto A',500),('${T}','Producto secreto B',999);`);
 await db.exec(read('entornos/sql/wai-asistente-y-cierre.sql'));
 assert.equal((await db.query("select gestlok_chat_private.wai_modalidad('¿Tienen delivery?') as x")).rows[0].x,null);
 assert.equal((await db.query("select gestlok_chat_private.wai_modalidad('Retiro o delivery') as x")).rows[0].x,null);
 assert.equal((await db.query("select gestlok_chat_private.wai_modalidad('Paso a buscar el pedido') as x")).rows[0].x,'retiro');
 await role('gerente');
 assert.equal((await cfg(S)).agente_activo,false);
 await assert.rejects(cfg(S,{...settings,seguimiento_min:21}),/rango/);
 assert.equal((await cfg(S,{...settings,pedidos:true,bienvenida_auto:false,agente_activo:true,seguimiento_min:3,cierre_auto:true,cierre_min:5})).seguimiento_min,3);
 await role('gerente',T);assert.equal((await cfg(T)).agente_activo,false);await assert.rejects(att('finalizar',S),/Sin permiso/);
 await role('creadora');await authorize(S,H,null,'cancelar');const p8=await authorize(S,H,contact);
 const v8=(action,pid=p8,j=null,event=null,txt=null,msg=null,state='opciones_v1')=>motor(H,keyA,action,pid,j,event,txt,msg,state,cmd.revision);
 const job8=async id=>{const j=await v8('tomar');assert.ok(j);await v8('resultado',p8,jid,id,null,j.id,'aceptado');return j;};
 await anon();await v8('control',null);assert.equal(await v8('tomar'),null);
 await v8('recibir',p8,jid,'CYCLE-HI','Hola');await v8('control',null);await v8('control',null);
 const greet=await job8('WA-CYCLE-GREET');assert.equal(greet.interaccion.opciones[2].id,'pedido');
 await v8('voto',p8,jid,'WA-CYCLE-GREET','pedido');await v8('control',null);
 const modePoll=await job8('WA-MODE');assert.equal(modePoll.interaccion.opciones[1].id,'delivery');
 await role('gerente');let cc=(await inbox(S)).chats[0];const cycle1=cc.ciclo_activo;assert.ok(cycle1);assert.equal(cc.modalidad_detectada,null);
 await assert.rejects(order('aceptar',null,'retiro',1,E),/confirme/);
 await anon();await v8('voto',p8,jid,'WA-MODE','delivery');await v8('control',null);assert.match((await job8('WA-MODE-ANSWER')).texto,/delivery/);
 await role('gerente');cc=(await inbox(S)).chats[0];assert.equal(cc.modalidad_detectada,'delivery');assert.equal(cc.seguimiento_min,3);
 // Ignore caller-supplied modality and delay, using detected and configured values.
 await order('aceptar',null,'retiro',1,'10000000-0000-4000-8000-000000000088');
 const o4=(await inbox(S)).chats[0].pedidos[0];assert.equal(o4.modalidad,'delivery');assert.equal(o4.demora_min,3);
 await assert.rejects(att('finalizar'),/pendientes/);
 await order('listo',o4.id);await order('entregado',o4.id);
 await anon();await job8('WA-PREP');await job8('WA-ONWAY');await job8('WA-DONE');
 await role('gerente');const histCount=(await inbox(S)).chats[0].mensajes.length;assert.equal(await att('finalizar'),true);cc=(await inbox(S)).chats[0];assert.ok(cc.cerrado_at);assert.equal(cc.puede_responder,false);assert.equal(cc.mensajes.length,histCount);
 await assert.rejects(inbox(S,'responder',p,'viejo',E),/finalizada/);
 await anon();assert.equal(await v8('voto',p8,jid,'WA-MODE','retiro'),null);
 await v8('recibir',p8,jid,'CYCLE-AGAIN','Hola');await v8('control',null);const again=await job8('WA-AGAIN');assert.equal(again.interaccion.opciones[2].id,'pedido');
 await role('gerente');cc=(await inbox(S)).chats[0];assert.notEqual(cc.ciclo_activo,cycle1);assert.equal(cc.cerrado_at,null);assert.equal(cc.modalidad_detectada,null);assert.ok(cc.mensajes.length>histCount);const cycle2=cc.ciclo_activo;
 await anon();await v8('recibir',p8,jid,'CYCLE-TEXT','Voy a retirar');await v8('control',null);assert.match((await job8('WA-RETIRO')).texto,/retiro/);
 await role('gerente');assert.equal((await inbox(S)).chats[0].modalidad_detectada,'retiro');
 await db.exec(`reset role;update gestlok_chat_private.wai_mensajes set creado_at=now()-interval '6 minutes' where ciclo_id=(select ciclo_id from gestlok_chat_private.wai_atencion_hilos where hilo_id='${p}');update gestlok_chat_private.wai_ciclos set inicio_at=now()-interval '6 minutes' where hilo_id='${p}' and cerrado_at is null;update gestlok_chat_private.wai_atencion_hilos set actualizado_at=now()-interval '6 minutes' where hilo_id='${p}';`);
 await anon();await v8('control',null);
 await role('gerente');cc=(await inbox(S)).chats[0];assert.ok(cc.cerrado_at);assert.equal(cc.ciclos.find(x=>x.id===cycle2).motivo,'inactividad');
 // Photo menu pages per business and short colloquial order requests.
 await db.exec(`reset role;insert into gestlok_chat_private.productos(sucursal_id,nombre,precio) values ('${S}','Empanada de jamón y queso (DEMO)',500);`);
 await db.exec(read('entornos/sql/wai-carta-y-pedidos.sql'));
 const photoUrl='https://gestlok-prueba.vercel.app/chat/carta-wai/empanadas-sabores.jpg';
 await db.exec(`insert into gestlok_chat_private.wai_carta_paginas values ('${S}','empanadas','Empanadas clásicas y premium','${photoUrl}',1),('${S}','pizzas','Pizzas Family','https://gestlok-prueba.vercel.app/chat/carta-wai/pizzas-family.jpg',2)`);
 assert.equal((await db.query(`select gestlok_chat_private.wai_pedido_texto('${S}','Dos de jamón y queso','retiro') as x`)).rows[0].x,true);
 assert.equal((await db.query(`select gestlok_chat_private.wai_pedido_texto('${T}','Dos de jamón y queso',null) as x`)).rows[0].x,false);
 assert.equal((await db.query(`select gestlok_chat_private.wai_pedido_texto('${S}','¿Tienen jamón y queso?','retiro') as x`)).rows[0].x,false);
 assert.equal((await db.query(`select gestlok_chat_private.wai_menu_paginas('${T}') as x`)).rows[0].x.length,0);
 assert.equal((await db.query(`select gestlok_chat_private.wai_imagen_permitida('${S}','https://127.0.0.1/foto.jpg') as x`)).rows[0].x,false);
 await role('creadora');await authorize(S,H,null,'cancelar');const p9=await authorize(S,H,contact);
 const v9=(action,pid=p9,j=null,event=null,txt=null,msg=null,state='opciones_imagen_v1')=>motor(H,keyA,action,pid,j,event,txt,msg,state,cmd.revision);
 const job9=async id=>{const j=await v9('tomar');assert.ok(j);await v9('resultado',p9,jid,id,null,j.id,'aceptado');return j;};
 await anon();await v9('control',null);
 await v9('recibir',p9,jid,'MENU','Pasame el menú');await v9('control',null);
 const pages=await job9('WA-PAGES');assert.equal(pages.interaccion.opciones[0].id,'carta_empanadas');
 await v9('voto',p9,jid,'WA-PAGES','carta_empanadas');await v9('control',null);
 // A previous connector cannot claim an image placeholder as a text message.
 assert.equal(await v9('tomar',p9,null,null,null,null,'opciones_v1'),null);
 const imageJob=await job9('WA-PHOTO');assert.equal(imageJob.imagen_url,photoUrl);
 await v9('recibir',p9,jid,'MODE','Paso a buscar');await v9('control',null);assert.match((await job9('WA-RETIRO2')).texto,/retiro/);
 await v9('recibir',p9,jid,'ORDER','Dos de jamón y queso');await v9('control',null);
 const acknow=await job9('WA-ORDER');assert.match(acknow.texto,/Anoté tu solicitud/);
 await role('gerente');cc=(await inbox(S)).chats[0];assert.equal(cc.pedido_pendiente,true);assert.equal(cc.pedido_texto,'Dos de jamón y queso');assert.equal(cc.atencion_manual,false);assert.equal(cc.modalidad_detectada,'retiro');
 assert.ok(cc.mensajes.some(m=>m.imagen_url===photoUrl&&m.estado==='aceptado'));
 await assert.rejects(att('finalizar'),/pendientes/);
 assert.equal(await order('aceptar',null,null,2,'10000000-0000-4000-8000-000000000077'),true);
 cc=(await inbox(S)).chats[0];assert.equal(cc.pedido_pendiente,false);assert.equal(cc.pedidos[0].estado,'preparacion');
 await anon();assert.match((await job9('WA-PREP2')).texto,/en preparación/);
 // New protocol: immediate responses, captionless image, follow-up after accepted photo,
 // and never survey an old or not-yet-delivered order in another conversation.
 await db.exec('reset role;'+read('entornos/sql/wai-respuestas-rapidas.sql'));
 await role('gerente');const o5=(await inbox(S)).chats[0].pedidos[0];
 await order('listo',o5.id);
 await anon();assert.match((await job9('WA-READY3')).texto,/listo para retirar/);
 await db.exec(`reset role;update gestlok_chat_private.wai_pedidos set consulta_at=now()-interval '3 minutes' where id='${o5.id}';update gestlok_chat_private.wai_mensajes set reservado_at=now()-interval '3 minutes' where piloto_id='${p9}' and estado='aceptado'`);
 await anon();await v9('control',null);assert.equal(await v9('tomar'),null); // not delivered yet
 await role('gerente');await order('entregado',o5.id);
 await anon();assert.match((await job9('WA-DELIVERED3')).texto,/entregado/);
 await role('gerente');assert.equal(await att('finalizar'),true);
 await db.exec(`reset role;update gestlok_chat_private.wai_pedidos set consulta_at=now()-interval '1 second' where id='${o5.id}';update gestlok_chat_private.wai_mensajes set reservado_at=now()-interval '3 minutes' where piloto_id='${p9}' and estado='aceptado'`);
 await anon();
 await v9('recibir',p9,jid,'QUICK-MENU','Pasame el menú'); // no extra control request
 const quickMenu=await job9('WA-QUICK-MENU');assert.equal(quickMenu.interaccion.pregunta,'Elegí qué parte de la carta querés ver');
 await v9('voto',p9,jid,'WA-QUICK-MENU','carta_empanadas'); // selection immediately enqueues image
 const quickPhoto=await job9('WA-QUICK-PHOTO');assert.equal(quickPhoto.imagen_url,photoUrl);assert.equal(quickPhoto.texto,'');
 const follow=await job9('WA-FOLLOW');assert.equal(follow.interaccion.pregunta,'¿Qué te gustaría hacer ahora?');assert.equal(follow.interaccion.opciones[1].label,'Hacer un pedido');
 await v9('voto',p9,jid,'WA-FOLLOW','menu_mas');
 const more=await job9('WA-MORE');assert.equal(more.interaccion.pregunta,'Elegí qué parte de la carta querés ver');
 await v9('voto',p9,jid,'WA-MORE','carta_pizzas');const pic2=await v9('tomar');
 assert.ok(pic2.imagen_url);await v9('resultado',p9,null,null,null,pic2.id,'incierto');
 assert.equal(await v9('tomar'),null); // never offer next actions after an unconfirmed image
 await role('gerente');cc=(await inbox(S)).chats[0];assert.equal(cc.pedidos[0].consulta_cancelada,true);
 assert.ok(cc.mensajes.some(m=>m.imagen_url===photoUrl&&m.estado==='aceptado'));
 // A fresh delivered order receives a survey only after its configured delay.
 await role('creadora');await authorize(S,H,null,'cancelar');const p10=await authorize(S,H,contact);
 const v10=(action,pid=p10,j=null,event=null,txt=null,msg=null,state='opciones_imagen_v1')=>motor(H,keyA,action,pid,j,event,txt,msg,state,cmd.revision);
 const job10=async id=>{const j=await v10('tomar');assert.ok(j);await v10('resultado',p10,jid,id,null,j.id,'aceptado');return j;};
 await anon();await v10('control',null);await v10('recibir',p10,jid,'NEW-MODE','Retiro en el local');await job10('WA-NEW-MODE');
 await v10('recibir',p10,jid,'NEW-PROD','Dos de jamón y queso');await job10('WA-NEW-PROD');
 await role('gerente');assert.equal(await order('aceptar',null,null,2,'10000000-0000-4000-8000-000000000066'),true);
 const o6=(await inbox(S)).chats[0].pedidos[0];
 await role('gerente');await order('listo',o6.id);await order('entregado',o6.id);
 await anon();await job10('WA-NEW-PREP');await job10('WA-NEW-READY');await job10('WA-NEW-DELIVERY');assert.equal(await v10('tomar'),null);
 await db.exec(`reset role;update gestlok_chat_private.wai_pedidos set consulta_at=now()-interval '1 second' where id='${o6.id}';update gestlok_chat_private.wai_mensajes set reservado_at=now()-interval '4 minutes' where piloto_id='${p10}' and estado='aceptado'`);
 await anon();await v10('control',null);const newSurvey=await job10('WA-VALID-SURVEY');assert.equal(newSurvey.interaccion.opciones[0].id,'bien');
 await v10('voto',p10,jid,'WA-VALID-SURVEY','bien');assert.match((await job10('WA-THANK-YOU')).texto,/Muchas gracias/);


 }finally{await db.close();}
});
test('rutas y ajustes WAI no tienen acceso público ni heredan un local arbitrario',()=>{
 const w=read('public/chat/wai/wai.js'),p=read('public/chat/panel/panel.js');
 for(const slug of ['mi-gusto-munro','mi-gusto-torcuato'])assert.match(read('public/gestlok-wai-'+slug+'/index.html'),/chat\/wai\/wai.js/);
 assert.match(w,/auth\.getUser/);assert.match(w,/s\.slug===slug/);assert.match(w,/waiSlug:slug/);
 assert.match(p,/s=>s.slug===WAI_SLUG/);assert.match(p,/S.sucursales=\[a\]/);
 assert.match(w, /data-expira/);assert.match(w, /pendingUnknown/);
});

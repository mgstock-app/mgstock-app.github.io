import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const sql=readFileSync('entornos/sql/wai-latencia-admin.sql','utf8');
const ui=readFileSync('public/chat/wai/wai.js','utf8');
test('indicadores de latencia privados: umbrales, muestras recientes, aislamiento y permisos',async()=>{
 const db=new PGlite();
 try{
 await db.exec(`create role anon;create role authenticated;
 create schema auth;create schema gestlok_chat_private;create schema gestlok_platform;
 create function auth.uid() returns uuid language sql as $$select '00000000-0000-4000-8000-000000000001'::uuid$$;
 create function gestlok_chat_private.es_creadora_chat() returns boolean language sql as $$select coalesce(current_setting('test.role',true)='admin',false)$$;
 create function gestlok_platform.require_admin() returns uuid language plpgsql as $$begin if current_setting('test.role',true) is distinct from 'admin' then raise exception 'Sin permiso';end if;return '00000000-0000-4000-8000-000000000001';end$$;
 create table gestlok_chat_private.whatsapp_premium_habilitaciones(id text primary key,habilitada boolean);
 create table gestlok_chat_private.wai_pilotos(id text primary key,habilitacion_id text);
 create table gestlok_chat_private.wai_mensajes(piloto_id text,direccion text,origen text,estado text,creado_at timestamptz,entregado_at timestamptz);
 insert into gestlok_chat_private.whatsapp_premium_habilitaciones values ('a',true),('b',true),('c',false);
 insert into gestlok_chat_private.wai_pilotos values ('pa','a'),('pb','b'),('pc','c');
 insert into gestlok_chat_private.wai_mensajes values
 ('pa','salida','wai','aceptado',now()-interval '60 seconds',now()-interval '55 seconds'),
 ('pa','salida','wai','aceptado',now()-interval '60 seconds',now()-interval '50 seconds'),
 ('pa','salida','wai','aceptado',now()-interval '60 seconds',now()-interval '40 seconds'),
 ('pa','salida','wai','aceptado',now()-interval '60 seconds',now()-interval '27 seconds'),
 ('pa','salida','wai','reservado',now()-interval '25 seconds',null),
 ('pa','salida','wai','incierto',now()-interval '30 seconds',null),
 ('pa','salida','wai','pendiente',now()-interval '2 seconds',null),
 ('pa','salida','wai','aceptado',now()-interval '16 minutes',now()),
 ('pa','salida','manual','aceptado',now()-interval '60 seconds',now()),
 ('pa','entrada','wai','aceptado',now()-interval '60 seconds',now()),
 ('pb','salida','wai','aceptado',now()-interval '60 seconds',now()-interval '58 seconds'),
 ('pc','salida','wai','aceptado',now()-interval '60 seconds',now())`);
 await db.exec(sql);await db.exec(sql);
 const call=async()=>(await db.query('select public.gestlok_chat_wai_latencia_admin() as r')).rows[0].r;
 await db.exec("set role anon");await assert.rejects(call(),/permission denied/);
 await db.exec("reset role;set role authenticated;set test.role='owner'");await assert.rejects(call(),/Sin permiso/);
 await db.exec("set test.role='admin'");const rows=await call();
 assert.deepEqual(rows.map(r=>r.id),['a','b']);assert.deepEqual(rows[0],{id:'a',total:7,hasta5:1,hasta10:1,hasta20:1,demora:3,sin_confirmar:2,inciertos:1,max_entrega:33});
 assert.deepEqual(rows[1],{id:'b',total:1,hasta5:1,hasta10:0,hasta20:0,demora:0,sin_confirmar:0,inciertos:0,max_entrega:2});
 }finally{await db.close();}
});
test('el panel muestra latencia y agrega avisos sin duplicar comercios',()=>{
 assert.match(ui,/rpc\('wai_latencia_admin'\)/);
 assert.match(ui,/new Set\(\[\.\.\.data\.filter/);
 assert.match(ui,/Sin muestras|sin muestras/);
 assert.match(ui,/Medición no disponible/);
});

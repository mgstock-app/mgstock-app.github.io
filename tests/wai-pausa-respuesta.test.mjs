import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const sql=readFileSync('entornos/sql/wai-pausa-respuesta.sql','utf8');
test('la pausa de 5 s no reserva antes de tiempo ni salta mensajes y excluye manuales',async()=>{
 const db=new PGlite();
 try{
 await db.exec(`create schema gestlok_chat_private;
 create table gestlok_chat_private.wai_mensajes(id int,origen text,creado_at timestamptz,estado text,reservado_at timestamptz);
 create function public.gestlok_chat_wai_piloto_motor(uuid,text,uuid,p_accion text,uuid,text,text,text,uuid,text) returns jsonb language plpgsql as $$
 declare m gestlok_chat_private.wai_mensajes%rowtype;
 begin
 if p_accion='control' then return null;
 elsif p_accion='tomar' then
  select * into m from gestlok_chat_private.wai_mensajes where estado='pendiente' order by creado_at,id limit 1 for update;
  if not found then return null;end if;
  update gestlok_chat_private.wai_mensajes set estado='reservado',reservado_at=now() where id=m.id;
  return to_jsonb(m.id);
 end if;return null;end$$;
 insert into gestlok_chat_private.wai_mensajes values (1,'wai',clock_timestamp()-interval '1 second','pendiente',null),(2,'manual',clock_timestamp(),'pendiente',null);`);
 await db.exec(sql);await db.exec(sql);
 const take=async()=>(await db.query("select public.gestlok_chat_wai_piloto_motor(null,null,null,'tomar',null,null,null,null,null,null) as id")).rows[0].id;
 assert.equal(await take(),null);
 assert.equal((await db.query("select count(*)::int as n from gestlok_chat_private.wai_mensajes where estado='reservado'")).rows[0].n,0);
 await db.exec("update gestlok_chat_private.wai_mensajes set creado_at=clock_timestamp()-interval '6 seconds' where id=1");
 assert.equal(await take(),1);assert.equal(await take(),2);assert.equal(await take(),null);
 }finally{await db.close();}
});
test('el laboratorio muestra el nombre solicitado en todas las zonas y producción conserva su local',()=>{
 const ui=readFileSync('public/chat/wai/wai.js','utf8');
 assert.ok(ui.includes("const displayLocalName=(empresa,local)=>trialPanel?'Mi Gusto (Prueba)':empresa+' · '+local;"));
 assert.ok(ui.includes('displayLocalName(s.empresa,s.nombre)'));
 assert.equal((ui.match(/displayLocalName\(r\.empresa,r\.local\)/g)||[]).length,2);
 assert.equal((ui.match(/displayLocalName\(l\.empresa,l\.nombre\)/g)||[]).length,2);
 assert.ok(ui.includes('displayLocalName(sessionLocal.empresa,sessionLocal.nombre)'));
 assert.ok(ui.includes('brand(label)'));
});

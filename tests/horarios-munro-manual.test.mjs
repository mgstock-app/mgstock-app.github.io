import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const migration=(name)=>readFileSync(new URL("../supabase/migrations/"+name,import.meta.url),"utf8");
const tabla={
  values:[["Colaborador","Lunes"],["Persona ficticia","18:00–23:30"]],
  backgrounds:[["#1e2f52","#1e2f52"],["#ffffff","#fff2cc"]],
  colors:[["#ffffff","#ffffff"],["#111827","#111827"]],
  headerRows:1, merges:[]
};
const tablas=JSON.stringify({Resumen:tabla,Semana:tabla});

test("Munro: archivo manual seguro, unico e inmutable",async()=>{
 const db=new PGlite();
 try {
  const setup=[
    "create role anon",
    "create role authenticated",
    "create schema rm_test_private",
    "create schema extensions",
    "create schema auth",
    "create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('t.uid',true),'')::uuid$$",
    "create function extensions.digest(text,text) returns bytea language sql immutable as $$select decode(md5($1),'hex')$$",
    "create function rm_test_private.horarios_fecha(text) returns date language sql immutable as $$select to_date($1,'YYYY-MM-DD')$$",
    "create function rm_test_private.horarios_puede_ver(text) returns boolean language sql stable as $$select $1=current_setting('t.local',true)$$",
    "create function rm_test_private.horarios_puede_administrar(text) returns boolean language sql stable as $$select $1=current_setting('t.local',true) and current_setting('t.admin',true)='yes'$$",
    "create table rm_test_private.horarios_conexiones(local_id text primary key,token_hash text,ultimo_envio_at timestamptz,envios int default 0)",
    "create table rm_test_private.horarios_semanas(local_id text,semana_desde date,semana_hasta date,filas jsonb,recibido_at timestamptz default now(),actualizaciones int default 1,primary key(local_id,semana_desde),constraint horarios_semanas_check check(extract(isodow from semana_desde)=1 and semana_hasta=semana_desde+6))",
    "create table rm_test_private.horarios_pagos(local_id text,semana_desde date,colaborador text,pagado boolean,marcado_at timestamptz default now())"
  ].join(";\n")+";";
  await db.exec(setup);
  for(const name of [
   "20261103173453_horarios_archivos_pdf.sql",
   "20261103234000_horarios_tablas_munro.sql",
   "20261104124000_horarios_en_vivo_munro.sql",
   "20261109153000_munro_horarios_archivo_manual.sql"
  ])await db.exec(migration(name));
  const monday=(await db.query("select (date_trunc('week',timezone('America/Argentina/Buenos_Aires',now())))::date::text d")).rows[0].d;
  const sunday=(await db.query("select ($1::date + 6)::text d",[monday])).rows[0].d;
  const filas=JSON.stringify([{colaborador:"Persona ficticia",total:"40",puesto:"Turno"}]);
  await db.query("insert into rm_test_private.horarios_conexiones(local_id,token_hash) values('munro',encode(extensions.digest('codigo-falso','sha256'),'hex'))");
  await db.query("insert into rm_test_private.horarios_semanas(local_id,semana_desde,semana_hasta,filas) values('munro',$1,$2,$3::jsonb)",[monday,sunday,filas]);
  await db.query("insert into rm_test_private.horarios_en_vivo(local_id,semana_desde,semana_hasta,tablas,actualizado_at) values('munro',$1,$2,$3::jsonb,now())",[monday,sunday,tablas]);
  const timestamp=async()=>(await db.query("select actualizado_at::text t from rm_test_private.horarios_en_vivo where local_id='munro'")).rows[0].t;
  const rpc=async(name,args)=>(await db.query("select public."+name+"("+args.map((_,i)=>"$"+(i+1)).join(",")+") r",args)).rows[0].r;
  const version=await timestamp();
  await db.exec("set t.local='munro';set t.admin='yes';set t.uid='00000000-0000-0000-0000-000000000111';set role authenticated;");
  await assert.rejects(()=>rpc("rm_horarios_archivar_manual",["torcuato",monday,version]),/Munro/);
  await db.exec("set t.admin='no'");
  await assert.rejects(()=>rpc("rm_horarios_archivar_manual",["munro",monday,version]),/administracion/);
  await db.exec("set t.admin='yes'");
  await assert.rejects(()=>rpc("rm_horarios_archivar_manual",["munro",monday,"2000-01-01T00:00:00Z"]),/cambios nuevos/);
  await db.exec("reset role");
  await db.exec("update rm_test_private.horarios_en_vivo set actualizado_at=now()-interval '2 hours' where local_id='munro'");
  const stale=await timestamp();
  await db.exec("set role authenticated");
  await assert.rejects(()=>rpc("rm_horarios_archivar_manual",["munro",monday,stale]),/desactualizada/);
  await db.exec("reset role");
  await db.exec("update rm_test_private.horarios_en_vivo set actualizado_at=now() where local_id='munro'");
  const fresh=await timestamp();
  await db.exec("set role authenticated");
  const saved=await rpc("rm_horarios_archivar_manual",["munro",monday,fresh]);
  assert.equal(saved.ok,true);
  assert.equal(saved.archivada,false);
  const again=await rpc("rm_horarios_archivar_manual",["munro",monday,fresh]);
  assert.equal(again.archivada,true);
  const archivedTable=await rpc("rm_horarios_tabla",["munro",saved.archivo_id,"Semana"]);
  assert.deepEqual(archivedTable.tabla,tabla);
  assert.equal(archivedTable.tiene_pdf,false);
  await assert.rejects(()=>rpc("rm_horarios_archivo",["munro",saved.archivo_id,"Semana"]),/Archivo no encontrado/);
  await db.exec("reset role");
  assert.equal((await db.query("select count(*) n from rm_test_private.horarios_archivos")).rows[0].n,1);
  assert.equal((await db.query("select has_function_privilege('anon','public.rm_horarios_archivar_tablas(text,text,text,jsonb,text,text,jsonb)','execute') v")).rows[0].v,false);
  await db.exec("update rm_test_private.horarios_en_vivo set tablas=jsonb_set(tablas,'{Semana,values,1,1}','\"OFF\"'::jsonb) where local_id='munro'");
  await db.exec("set role authenticated");
  assert.equal((await rpc("rm_horarios_tabla",["munro",saved.archivo_id,"Semana"])).tabla.values[1][1],"18:00–23:30");
 } finally {await db.close();}
});

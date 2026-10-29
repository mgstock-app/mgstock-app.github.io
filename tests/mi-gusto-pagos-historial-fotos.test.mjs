import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {PGlite} from "@electric-sql/pglite";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const T="cb0dc04a-9a13-434f-a3d0-47f1d8f39670";
const ID="11111111-1111-4111-8111-111111111111";

test("Fotos de cierre: autenticación, local, historia y datos previos",async()=>{
 const db=new PGlite();
 try{
  await db.exec([
   "create role authenticated;create role anon;create schema auth;create schema gestlok_tenancy;",
   "create schema storage;create table storage.objects(bucket_id text,name text);",
   "create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('t.uid',true),'')::uuid$$;",
   "create function gestlok_tenancy.current_tenant_id() returns uuid language sql stable as $$select nullif(current_setting('t.tenant',true),'')::uuid$$;",
   "create function public.mi_rol() returns text language sql stable as $$select current_setting('t.role',true)$$;",
   "create function public.puede_editar_local(p text) returns boolean language sql stable as $$select p=any(string_to_array(current_setting('t.locals',true),','))$$;"
  ].join("\n"));
  await db.exec(read("supabase/migrations/20261029150000_mi_gusto_cierre_online.sql"));
  await db.exec(read("supabase/migrations/20261029190000_mi_gusto_pagos_observaciones.sql"));
  const context=async(role="dueno",locals="munro")=>{
   for(const [key,val] of Object.entries({uid:ID,tenant:T,role,locals}))
    await db.query("select set_config($1,$2,false)",["t."+key,val]);
  };
  await context();
  await db.exec("set role authenticated");
  async function rpc(name,...args){
   const stmt="select public.gestlok_mg_online_"+name+"("+args.map((_,i)=>"$"+(i+1)).join(",")+") as result";
   return (await db.query(stmt,args)).rows[0].result;
  }
  const active=(await rpc("state","munro")).active;
  await rpc("save_note","munro",active.id,null,"44","mercado_pago",30000,true,"Observación anterior");
  await db.exec("reset role");
  await db.exec(read("supabase/migrations/20261029193500_mi_gusto_pagos_fotos_cierres.sql"));
  await db.exec("set role authenticated");
  await assert.rejects(()=>rpc("photo_access","munro",active.id),/turnos cerrados/);
  const closed=await rpc("close","munro",active.id);
  const id=closed.closed.id;
  const path="munro/"+id+"/cierre.jpg";
  assert.equal((await rpc("photo_access","munro",id)).photo_path,null);
  await assert.rejects(()=>rpc("photo_register","munro",id),/No se encontró/);
  await db.exec("reset role");
  await db.query("insert into storage.objects(bucket_id,name) values($1,$2)",["mg-online-closures",path]);
  await db.exec("set role authenticated");
  const linked=await rpc("photo_register","munro",id);
  assert.equal(linked.photo_path,path);
  assert.equal(linked.movements[0].observacion,"Observación anterior");
  assert.equal(Number(linked.total_ventas),30000);
  assert.equal((await rpc("photo_access","munro",id)).photo_path,path);
  assert.equal((await rpc("photo_register","munro",id)).photo_path,path);
  await assert.rejects(()=>rpc("photo_access","torcuato",id),/turnos cerrados|acceso/);
  await context("gerente","torcuato");
  await assert.rejects(()=>rpc("photo_access","munro",id),/Sin acceso/);
  await context("colaborador","munro");
  await assert.rejects(()=>rpc("photo_register","munro",id),/Sin acceso/);
  await db.exec("reset role;set role anon");
  await assert.rejects(()=>rpc("photo_access","munro",id),/permission denied/);
  await db.exec("reset role");
  const count=(await db.query("select count(*)::int n from gestlok_mg_online_private.movements")).rows[0].n;
  assert.equal(count,1);
 }finally{await db.close();}
});

test("Historial por día, ventana con Mañana/Noche/Día Completo y foto privada",()=>{
 const js=read("public/stock/mi-gusto-cierre-online.js");
 const css=read("app/mi-gusto-pagos-online.css");
 const edge=read("supabase/functions/mg-online-closure-photo/index.ts");
 assert.match(js,/shiftName=x=>x==='manana'\?'Mañana':'Noche'/);
 assert.match(js,/data-mgon-open-day/);
 assert.match(js,/role="dialog" aria-modal="true"/);
 assert.match(js,/Día Completo/);
 assert.match(js,/data-mgon-modal-tab/);
 assert.match(js,/data-mgon-modal-close/);
 assert.match(js,/data-mgon-photo/);
 assert.match(js,/photoUrls/);
 assert.match(js,/mg-online-closure-photo/);
 assert.match(js,/compressPhoto/);
 assert.match(js,/capture="environment"/);
 assert.match(css,/\.mg-on-modal-backdrop/);
 assert.match(edge,/allowOrigins/);
 assert.match(edge,/getUser\(token\)/);
 assert.match(edge,/gestlok_mg_online_photo_access/);
 assert.match(edge,/gestlok_mg_online_photo_register/);
 assert.match(edge,/public:false/);
 assert.match(edge,/upsert:false/);
 assert.doesNotMatch(edge,/getPublicUrl/);
});

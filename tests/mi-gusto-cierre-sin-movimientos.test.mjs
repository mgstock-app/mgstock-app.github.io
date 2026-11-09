import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const sql=p=>readFileSync(new URL('../supabase/migrations/'+p,import.meta.url),'utf8');
const tenant='cb0dc04a-9a13-434f-a3d0-47f1d8f39670';

test('Mi Gusto: Sin movimientos cierra solo turno vacío y lo registra; pagos con movimientos siguen exigiendo foto',async()=>{
 const db=new PGlite();
 try{
  await db.exec([
   "create role authenticated;create role anon;create schema auth;create schema gestlok_tenancy;create schema storage;",
   "create table storage.objects(bucket_id text,name text);",
   "create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('t.uid',true),'')::uuid$$;",
   "create function gestlok_tenancy.current_tenant_id() returns uuid language sql stable as $$select nullif(current_setting('t.tenant',true),'')::uuid$$;",
   "create function public.mi_rol() returns text language sql stable as $$select current_setting('t.role',true)$$;",
   "create function public.puede_editar_local(p text) returns boolean language sql stable as $$select p=any(string_to_array(current_setting('t.locals',true),','))$$;"
  ].join('\n'));
  for(const m of [
   '20261029150000_mi_gusto_cierre_online.sql',
   '20261029190000_mi_gusto_pagos_observaciones.sql',
   '20261029193500_mi_gusto_pagos_fotos_cierres.sql',
   '20261030120000_mi_gusto_foto_obligatoria_antes_cierre.sql',
   '20261030193000_mi_gusto_foto_turnos_abiertos_cerrados.sql',
   '20261102182000_mi_gusto_fotos_multiples_observaciones.sql',
   '20261104203000_mi_gusto_efectivo_descuento.sql',
   '20261105010500_mi_gusto_efectivo_ok.sql',
   '20261109190000_mi_gusto_cierre_sin_movimientos.sql'
  ]){try{await db.exec(sql(m));}catch(e){throw new Error(m+': '+e.message,{cause:e});}}
  const ctx=async(role='gerente',locals='munro',tenantId=tenant)=>{
    for(const [key,value] of Object.entries({uid:'11111111-1111-4111-8111-111111111111',role,tenant:tenantId,locals}))
      await db.query('select set_config($1,$2,false)',['t.'+key,value]);
  };
  const rpc=async(name,...args)=>(await db.query(
    'select public.gestlok_mg_online_'+name+'('+args.map((_,i)=>'$'+(i+1)).join(',')+') result',args)).rows[0].result;
  await ctx();await db.exec('set role authenticated');
  const open=(await rpc('state','munro')).active;
  assert.equal(open.movements.length,0);
  await assert.rejects(()=>rpc('close','munro',open.id),/Cargá al menos una/);
  await assert.rejects(()=>rpc('close_sin_movimientos','torcuato',open.id),/otro local|inexistente|cerrado|Sin permiso/i);
  await assert.rejects(()=>rpc('close_sin_movimientos','dt',open.id),/Sin permiso/);
  const result=await rpc('close_sin_movimientos','munro',open.id);
  assert.equal(result.closed.status,'cerrado');
  assert.equal(result.closed.photo_path,null);
  assert.equal(result.closed.sin_movimientos,true);
  assert.equal(result.closed.movements.length,0);
  assert.equal(Number(result.closed.total_ventas),0);
  assert.equal(result.active.sin_movimientos,false);
  assert.equal(result.active.turno,'tarde');
  assert.equal((await rpc('state','munro')).history.find(s=>s.id===open.id)?.sin_movimientos,true);
  await assert.rejects(()=>rpc('close_sin_movimientos','munro',open.id),/cerrado/);
  await db.exec('reset role');
  const count=(await db.query("select count(*)::int n from gestlok_mg_online_private.audit where shift_id=$1 and action='cerrado' and after_data->>'sin_movimientos'='true'",[open.id])).rows[0].n;
  assert.equal(count,1);
  await db.exec('set role authenticated');
  const second=result.active;
  await rpc('save_note','munro',second.id,null,'123','transferencia',2000,false,'test');
  await assert.rejects(()=>rpc('close_sin_movimientos','munro',second.id),/movimientos/);
  await assert.rejects(()=>rpc('close','munro',second.id),/Subí la foto/);
  await db.exec('reset role');
  await db.query("update gestlok_mg_online_private.shifts set photo_path='munro/test/cierre.jpg',photo_at=now(),photo_by='11111111-1111-4111-8111-111111111111' where id=$1",[second.id]);
  await db.exec('set role authenticated');
  const normal=await rpc('close','munro',second.id);
  assert.equal(normal.closed.sin_movimientos,false);
  assert.equal(normal.closed.movements.length,1);
  assert.equal(Number(normal.closed.total_ventas),2000);
  await ctx('gerente','torcuato');
  await assert.rejects(()=>rpc('state','munro'),/permiso/);
  const torcuato=(await rpc('state','torcuato')).active;
  assert.equal((await rpc('close_sin_movimientos','torcuato',torcuato.id)).closed.sin_movimientos,true);
  await ctx('gerente','torcuato','22222222-2222-4222-8222-222222222222');
  await assert.rejects(()=>rpc('state','torcuato'),/permiso/);
  await ctx('colaborador','torcuato');
  await assert.rejects(()=>rpc('close_sin_movimientos','torcuato',torcuato.id),/Sin permiso/);
  await ctx('gerente','munro');
  await assert.rejects(()=>rpc('close_sin_movimientos','torcuato',torcuato.id),/Sin permiso/);
  await db.exec('reset role;set role anon');
  await assert.rejects(()=>rpc('close_sin_movimientos','munro',second.id),/permission denied/);
 }finally{await db.close();}
});

test('La interfaz ofrece Sin movimientos solo en un turno sin comandas; fotos obligatorias si las hay',()=>{
 const js=readFileSync(new URL('../public/stock/mi-gusto-cierre-online.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../app/mi-gusto-pagos-online.css',import.meta.url),'utf8');
 assert.match(js,/data-mgon-empty/);
 assert.match(js,/emptySelected\(s\)/);
 assert.match(js,/hasMoves&&!!s\.photo_path/);
 assert.ok(js.includes("hasMoves||!writable()?'disabled '"),'Sin movimientos must remain visible but disabled when there are orders');
 assert.match(js,/gestlok_mg_online_close_sin_movimientos/);
 assert.match(js,/Sin movimientos/);
 assert.match(css,/\.mg-on-empty-choice/);
 assert.doesNotMatch(js,/localStorage\.setItem\([^)]*emptyCheckedFor/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {PGlite} from '@electric-sql/pglite';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const tenant='cb0dc04a-9a13-434f-a3d0-47f1d8f39670';
const uid='11111111-1111-4111-8111-111111111111';

test('Corrección histórica aislada: recalcula, audita y no mueve turnos ni comandas',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`
   create role authenticated;create role anon;create schema auth;create schema gestlok_tenancy;create schema storage;
   create table storage.objects(bucket_id text,name text);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('t.uid',true),'')::uuid$$;
   create function gestlok_tenancy.current_tenant_id() returns uuid language sql stable as $$select nullif(current_setting('t.tenant',true),'')::uuid$$;
   create function public.mi_rol() returns text language sql stable as $$select current_setting('t.role',true)$$;
   create function public.puede_editar_local(p text) returns boolean language sql stable as $$select p=any(string_to_array(current_setting('t.locals',true),','))$$;
  `);
  for(const file of [
   '20261029150000_mi_gusto_cierre_online.sql',
   '20261029190000_mi_gusto_pagos_observaciones.sql',
   '20261029193500_mi_gusto_pagos_fotos_cierres.sql',
   '20261030120000_mi_gusto_foto_obligatoria_antes_cierre.sql',
   '20261030193000_mi_gusto_foto_turnos_abiertos_cerrados.sql',
   '20261102182000_mi_gusto_fotos_multiples_observaciones.sql',
   '20261104203000_mi_gusto_efectivo_descuento.sql',
   '20261105010500_mi_gusto_efectivo_ok.sql',
   '20261109190000_mi_gusto_cierre_sin_movimientos.sql',
   '20261109202000_mi_gusto_cierre_solo_efectivo.sql',
   '20261111030000_mi_gusto_cierre_foto_solo_posnet.sql',
   '20261123024500_mi_gusto_pya_simbolico_pagos_online.sql',
   '20261127190307_mi_gusto_editar_cierre_online.sql'
  ]) await db.exec(read('supabase/migrations/'+file));
  const ctx=async(role='gerente',locals='munro',tenantId=tenant)=>{
   for(const [key,value] of Object.entries({uid,role,locals,tenant:tenantId}))
    await db.query('select set_config($1,$2,false)',['t.'+key,value]);
  };
  const rpc=async(name,...args)=>(await db.query('select public.gestlok_mg_online_'+name+'('+args.map((_,i)=>'$'+(i+1)).join(',')+') as result',args)).rows[0].result;
  const edit=(local,shift,m,method='transferencia',amount=2500,app=true,pya=false)=>rpc('edit_closed',local,shift,m.id,m.updated_at,m.comanda,method,amount,app,'corrección',pya);
  await ctx('dueno','munro,torcuato');await db.exec('set role authenticated');
  for(const loc of ['munro','torcuato']){
   const active=(await rpc('state',loc)).active;
   await rpc('save_note_pya',loc,active.id,null,'11','transferencia',1000,false,'',false);
   const withTwo=await rpc('save_note_pya',loc,active.id,null,'12','transferencia',500,false,'',false);
   await assert.rejects(()=>edit(loc,active.id,withTwo.movements[0]),/Cierre no encontrado/);
   const closed=await rpc('close_sin_movimientos',loc,active.id);
   const [first,second]=closed.closed.movements;
   const next=await rpc('save_note_pya',loc,closed.active.id,null,'99','transferencia',300,false,'',false);
   await assert.rejects(()=>edit(loc,active.id,first,'getnet'),/foto del Posnet/);
   const updated=await edit(loc,active.id,first);
   assert.equal(updated.status,'cerrado');
   assert.equal(updated.closed_at,closed.closed.closed_at);
   assert.equal(updated.comandas,2);
   assert.equal(updated.total_ventas,3000);
   assert.equal(updated.total_app,2500);
   assert.equal(updated.online_local,500);
   assert.deepEqual(updated.movements.find(m=>m.id===second.id),second);
   assert.equal(updated.movements.find(m=>m.id===first.id).created_at,first.created_at);
   await assert.rejects(()=>edit(loc,active.id,first),/Otra persona/);
   const cash=await edit(loc,active.id,updated.movements.find(m=>m.id===first.id),'efectivo',1000,false);
   assert.equal(cash.efectivo,900);
   assert.equal(cash.total_ventas,500);
   const symbolic=await edit(loc,active.id,cash.movements.find(m=>m.id===first.id),'transferencia',1000,false,true);
   assert.equal(symbolic.total_pya,1000);
   assert.equal(symbolic.total_ventas,500);
   const state=await rpc('state',loc);
   assert.deepEqual(state.active,next,'turno en curso intacto');
   assert.deepEqual(state.history.find(s=>s.id===active.id),symbolic);
   const other=loc==='munro'?'torcuato':'munro';
   await assert.rejects(()=>edit(other,active.id,first),/Cierre no encontrado/);
   await ctx('gerente',other);await assert.rejects(()=>edit(loc,active.id,first),/Sin permiso/);
   await ctx('colaborador',loc);await assert.rejects(()=>edit(loc,active.id,first),/Sin permiso/);
   await ctx('gerente',loc,'22222222-2222-4222-8222-222222222222');await assert.rejects(()=>edit(loc,active.id,first),/Sin permiso/);
   await ctx('dueno','munro,torcuato');
   await db.exec('reset role');
   const audits=(await db.query("select before_data,after_data from gestlok_mg_online_private.audit where shift_id=$1 and action='editado' order by id",[active.id])).rows;
   assert.equal(audits.length,3);
   assert.equal(audits[0].before_data.amount,1000);
   assert.equal(audits[0].after_data.amount,2500);
   await db.exec('set role authenticated');
   await db.exec('reset role; set role anon');
   await assert.rejects(()=>edit(loc,active.id,first),/permission denied/);
   await db.exec('reset role; set role authenticated');
  }
 }finally{await db.close();}
});

test('El reporte muestra Editar cierre y formulario precargado solo con autorización',()=>{
 const source=read('public/stock/mi-gusto-cierre-online.js');
 const instrumented=source.replace(/\}\)\(\);\s*$/, 'window.__test={reportTurn,configure:(shift,movement)=>{archivedShift=shift;archivedMovement=movement;}};\n})();');
 const window={};
 const state={local:'munro',me:{tenant_id:tenant},offline:false};
 let role='gerente';
 runInNewContext(instrumented,{window,document:{addEventListener(){}},navigator:{onLine:true},Intl,Date,String,Number,Array,Object,console,queueMicrotask(){}});
 window.GestLokMiGustoOnline.attach({S:state,miRol:()=>role,misLocales:()=>['munro'],render(){}});
 const shift={id:'s',day:'2026-11-26',turno:'tarde',status:'cerrado',movements:[{id:'m',comanda:'12',method:'transferencia',amount:1500,gross_amount:1500,observacion:'nota'}]};
 assert.match(window.__test.reportTurn(shift,'tarde'),/data-mgon-archive-edit="s"[^>]*>Editar cierre/);
 window.__test.configure('s','m');
 const html=window.__test.reportTurn(shift,'tarde');
 assert.match(html,/id="mg-online-history-form"/);
 assert.match(html,/data-draft-key="s:m"/);
 assert.match(html,/name="amount"[^>]*value="1\.500"/);
 assert.match(html,/name="comanda"[^>]*value="12"/);
 assert.match(html,/data-mgon-archive-cancel/);
 role='colaborador';
 assert.doesNotMatch(window.__test.reportTurn(shift,'tarde'),/data-mgon-archive-edit|mg-online-history-form/);
});

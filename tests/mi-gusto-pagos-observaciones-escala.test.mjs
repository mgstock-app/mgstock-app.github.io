import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {PGlite} from '@electric-sql/pglite';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const TENANT='cb0dc04a-9a13-434f-a3d0-47f1d8f39670';
const USER='11111111-1111-4111-8111-111111111111';

test('Observaciones: conserva comandas existentes, historial, cambios de APP y aislamiento',async()=>{
 const db=new PGlite();
 try{
  await db.exec(
   'create role authenticated;create role anon;create schema auth;create schema gestlok_tenancy;'+
   "create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;"+
   "create function gestlok_tenancy.current_tenant_id() returns uuid language sql stable as $$select nullif(current_setting('test.tenant',true),'')::uuid$$;"+
   "create function public.mi_rol() returns text language sql stable as $$select current_setting('test.role',true)$$;"+
   "create function public.puede_editar_local(p text) returns boolean language sql stable as $$select p=any(string_to_array(current_setting('test.locals',true),','))$$;"
  );
  await db.exec(read('supabase/migrations/20261029150000_mi_gusto_cierre_online.sql'));
  for(const [name,value] of Object.entries({uid:USER,tenant:TENANT,role:'gerente',locals:'munro'}))
   await db.query('select set_config($1,$2,false)',['test.'+name,value]);
  await db.exec('set role authenticated');
  async function rpc(fn,...args){
    const sql='select public.gestlok_mg_online_'+fn+'('+args.map((_,i)=>'$'+(i+1)).join(',')+') as result';
    return (await db.query(sql,args)).rows[0].result;
  }
  const old=await rpc('state','munro');const shift=old.active.id;
  const oldMov=await rpc('save','munro',shift,null,'43','getnet',39500,false);
  assert.equal(oldMov.movements.length,1);
  assert.equal(Number(oldMov.total_ventas),39500);
  await db.exec('reset role');
  await db.exec(read('supabase/migrations/20261029190000_mi_gusto_pagos_observaciones.sql'));
  await db.exec('set role authenticated');
  const legacy=await rpc('state','munro');
  assert.equal(legacy.active.movements[0].observacion,'');
  const newMov=await rpc('save_note','munro',shift,null,'44','transferencia',144200,true,'  Pedido por teléfono  ');
  assert.equal(newMov.movements.find(x=>x.comanda==='44').observacion,'Pedido por teléfono');
  assert.equal(Number(newMov.total_app),144200);
  assert.equal(Number(newMov.total_ventas),183700);
  assert.equal(Number(newMov.online_local),39500);
  const noteId=newMov.movements.find(x=>x.comanda==='44').id;
  const edited=await rpc('save_note','munro',shift,noteId,'44','transferencia',144200,false,'Retiró una hora más tarde');
  assert.equal(edited.movements.find(x=>x.id===noteId).observacion,'Retiró una hora más tarde');
  assert.equal(Number(edited.online_local),183700,'La nota no modifica importes');
  const toggle=await rpc('save_note','munro',shift,noteId,'44','transferencia',144200,true,'Retiró una hora más tarde');
  assert.equal(toggle.movements.find(x=>x.id===noteId).observacion,'Retiró una hora más tarde','El switch APP conserva la nota');
  assert.equal(Number(toggle.online_local),39500);
  await assert.rejects(()=>rpc('save_note','munro',shift,null,'45','getnet',100,false,'A'.repeat(301)),/observación|300/);
  await assert.rejects(()=>rpc('save_note','torcuato',shift,null,'45','getnet',100,false,'nota'),/permiso/);
  const ended=await rpc('close','munro',shift);
  assert.equal(ended.closed.status,'cerrado');
  await assert.rejects(()=>rpc('save_note','munro',shift,noteId,'44','transferencia',144200,false,'modificación ilegal'),/cerrado/);
  const history=await rpc('state','munro');
  assert.equal(history.history.length,1);
  assert.equal(history.history[0].movements.find(x=>x.id===noteId).observacion,'Retiró una hora más tarde');
  assert.equal(history.history[0].movements.find(x=>x.comanda==='43').observacion,'');
  await db.exec('reset role');
  await db.query("select set_config('test.role','lectura',false)");
  await db.exec('set role authenticated');
  await assert.rejects(()=>rpc('save_note','munro',ended.active.id,null,'46','getnet',500,false,'nota'),/permiso/);
  await assert.rejects(()=>db.query('select * from gestlok_mg_online_private.movements'),/permission denied/);
  await db.exec('reset role;set role anon');
  await assert.rejects(()=>rpc('save_note','munro',ended.active.id,null,'46','getnet',500,false,'nota'),/permission denied/);
  await db.exec('reset role');
  const logs=(await db.query("select count(*)::int n from gestlok_mg_online_private.audit where action='editado'")).rows[0].n;
  assert.equal(logs,2);
 }finally{await db.close();}
});

test('Interfaz: observación opcional en carga e historial y escala de 85–110%',()=>{
 const js=read('public/stock/mi-gusto-cierre-online.js'),css=read('app/mi-gusto-pagos-online.css');
 assert.match(js,/name="observacion" maxlength="300"/);
 assert.match(js,/r\?\.observacion\|\|''/);
 assert.match(js,/m\.observacion\|\|'—'/);
 assert.match(js,/r\.observacion\?'<span title=/);
 assert.match(js,/p_observacion:m\.observacion\|\|''/);
 assert.match(js,/p_observacion:observacion/);
 assert.match(js,/gestlok_mg_online_save_note/);
 assert.match(js,/gestlok:pagos-online:escala-v1/);
 assert.match(js,/data-mgon-scale="up"/);
 assert.match(js,/data-mgon-scale="down"/);
 assert.match(js,/style="zoom:/);
 assert.match(css,/\.mg-on-observation textarea/);
 const events={},saved=new Map(),nodes={
  '.mg-on-page':{style:{}},
  '#mg-on-scale-value':{textContent:''},
  '[data-mgon-scale="down"]':{disabled:false},
  '[data-mgon-scale="up"]':{disabled:false},
 };
 const document={querySelector:s=>nodes[s]||null,addEventListener:(k,fn)=>{events[k]=fn;}};
 const window={matchMedia:()=>({matches:false})};
 const storage={getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v)};
 runInNewContext(js,{window,document,navigator:{onLine:false},Intl,Date,console,queueMicrotask:()=>{},localStorage:storage});
 const m=window.GestLokMiGustoOnline;
 m.attach({S:{me:{tenant_id:TENANT},local:'munro',offline:false,view:'cierre-online'},miRol:()=> 'gerente',misLocales:()=>['munro'],render:()=>{}});
 assert.match(m.view(),/95%/);
 const emit=dir=>events.click({target:{closest:q=>q==='[data-mgon-scale]'?{dataset:{mgonScale:dir}}:null}});
 emit('down');assert.equal(saved.get('gestlok:pagos-online:escala-v1'),'90');
 assert.equal(nodes['.mg-on-page'].style.zoom,'0.9');
 emit('down');assert.equal(nodes['#mg-on-scale-value'].textContent,'85%');
 emit('down');assert.equal(nodes['#mg-on-scale-value'].textContent,'85%');
 for(let i=0;i<5;i++)emit('up');
 assert.equal(nodes['#mg-on-scale-value'].textContent,'110%');
 assert.equal(nodes['[data-mgon-scale="up"]'].disabled,true);
 assert.equal(m._test.clampScale(200),110);
 assert.equal(m._test.clampScale(10),85);
});

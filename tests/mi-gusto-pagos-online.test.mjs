import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {PGlite} from '@electric-sql/pglite';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const TENANT='cb0dc04a-9a13-434f-a3d0-47f1d8f39670';
function client(role='gerente',local='munro',tenant=TENANT,locals=[local]){
 const document={querySelector:()=>null,addEventListener:()=>{}};
 const window={};
 runInNewContext(read('public/stock/mi-gusto-cierre-online.js'),{
  document,window,Intl,Date,String,Number,Array,Object,console,navigator:{onLine:true},queueMicrotask:()=>{}
 });
 const mod=window.GestLokMiGustoOnline;
 mod.attach({S:{me:{tenant_id:tenant},local,offline:false,view:'cierre-online'},miRol:()=>role,misLocales:()=>locals,render:()=>{}});
 return mod;
}
test('Pagos Online: exclusivamente Mi Gusto, dueño y gerente autorizado',()=>{
 for(const loc of ['munro','torcuato'])for(const role of ['dueno','gerente']){
  const m=client(role,loc);assert(m.permitido());
  const html=m.view();assert.match(html,/Pagos Online/);
  assert.match(html,/Resumen del turno e historial/);
  assert.match(html,/Carga de pedidos/);
  assert.doesNotMatch(html,/data-mgon-tab="historial"/);
 }
 for(const role of ['creadora','colaborador','lectura','editor',null])assert(!client(role).permitido());
 assert(!client('gerente','munro',TENANT,['torcuato']).permitido());
 assert(!client('gerente','torcuato',TENANT,['munro']).permitido());
 assert(!client('dueno','munro','aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa').permitido());
 assert(!client('dueno','otro').permitido());
 assert.equal(client()._test.date('2026-10-29'),'29/10/26');
});
test('Pagos Online: switches APP, fórmulas y RLS/flujo de componentes',()=>{
 const js=read('public/stock/mi-gusto-cierre-online.js');
 const sql=read('supabase/migrations/20261029150000_mi_gusto_cierre_online.sql');
 assert.match(js,/window\.GestLokSupabase\.rpc\(name,\{p_local:local\(\),\.\.\.args\}\)/);
 assert.match(js,/role="switch" aria-label="APP de comanda/);
 assert.match(js,/p_app:!m\.app/);
 assert.match(js,/data-mgon-jump-history/);
 // Solo se guarda la escala de presentación por dispositivo: nunca comandas, montos ni históricos.
 assert.doesNotMatch(js,/\bindexedDB\b/);
 assert.match(js,/localStorage\.setItem\(SCALE_KEY,String\(pageScale\)\)/);
 assert.doesNotMatch(js,/localStorage\.(?:setItem|getItem)\(\s*['"](?:movimientos|comandas|pagos|turnos|historial)/);
 assert.match(sql,/sum\(m\.amount\) filter\(where m\.app\)/);
 assert.match(sql,/'online_local',z\.total_ventas-z\.total_app/);
 assert.match(sql,/next_turno:=case when s\.turno='manana' then 'tarde' else 'manana' end/);
 assert.match(sql,/next_day:=s\.day\+case when s\.turno='tarde' then 1 else 0 end/);
 assert.match(sql,/revoke all on all tables in schema gestlok_mg_online_private from public,anon,authenticated/);
 assert.match(read('public/stock/app.js'),/data-go="cierre-online"/);
 assert.match(read('components/stock-runtime.tsx'),/if \(!visitor\) await load\("\/stock\/mi-gusto-cierre-online\.js/);
 assert.match(read('app/mi-gusto-pagos-online.css'),/grid-template-columns:1fr 1fr/);
});
test('Historial del día agrupa mañana y tarde, y conserva totales sin repetir APP',()=>{
 const m=client();
 const rows=[
  {id:'m1',day:'2026-10-29',turno:'manana',total_ventas:1000,total_app:200,online_local:800,transferencia:600,getnet:300,mercado_pago:100,comandas:3},
  {id:'t1',day:'2026-10-29',turno:'tarde',total_ventas:2500,total_app:500,online_local:2000,transferencia:1000,getnet:1000,mercado_pago:500,comandas:4},
  {id:'m2',day:'2026-10-28',turno:'manana',total_ventas:400,total_app:0,online_local:400,transferencia:400,getnet:0,mercado_pago:0,comandas:1},
 ];
 const groups=m._test.historyGroups(rows);
 assert.equal(groups.length,2);
 assert.equal(groups[0].day,'2026-10-29');
 assert.equal(groups[0].shifts.length,2);
 assert.equal(groups[0].total_ventas,3500);
 assert.equal(groups[0].total_app,700);
 assert.equal(groups[0].online_local,2800);
 assert.equal(groups[0].transferencia,1600);
 assert.equal(groups[0].getnet,1300);
 assert.equal(groups[0].mercado_pago,600);
 assert.equal(groups[0].comandas,7);
 assert.equal(groups[1].online_local,400);
 const script=read('public/stock/mi-gusto-cierre-online.js');
 assert.match(script,/id="mg-on-history-view"/);
 assert.match(script,/id="mg-on-turn-filter"/);
 assert.match(script,/id="mg-on-date-filter"/);
 assert.match(script,/data-mgon-clear-filters/);
 assert.match(script,/shiftHistoryCard\(s\)/);
 assert.match(script,/oldRows\(s\)/);
});
test('Base aislada: total 3 medios menos APP, cierres encadenados y aislamiento',async()=>{
 const db=new PGlite();
 try{
  await db.exec([
   'create role anon; create role authenticated;',
   'create schema auth; create schema gestlok_tenancy;',
   "create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;",
   "create function gestlok_tenancy.current_tenant_id() returns uuid language sql stable as $$ select nullif(current_setting('test.tenant',true),'')::uuid $$;",
   "create function public.mi_rol() returns text language sql stable as $$ select current_setting('test.role',true) $$;",
   "create function public.puede_editar_local(p text) returns boolean language sql stable as $$ select p=any(string_to_array(current_setting('test.local',true),',')) $$;"
  ].join('\n'));
  await db.exec(read('supabase/migrations/20261029150000_mi_gusto_cierre_online.sql'));
  async function context(role='dueno',tenant=TENANT,locals='munro,torcuato'){
   for(const [k,v] of Object.entries({uid:'11111111-1111-4111-8111-111111111111',role,tenant,local:locals}))
    await db.query('select set_config($1,$2,false)',['test.'+k,v]);
  }
  await context();
  await db.exec('set role authenticated');
  async function rpc(name,...args){
   const r=await db.query('select public.gestlok_mg_online_'+name+'('+args.map((_,i)=>'$'+(i+1)).join(',')+') as result',args);
   return r.rows[0].result;
  }
  const state=loc=>rpc('state',loc);
  const save=(loc,shift,id,number,method,amount,app)=>rpc('save',loc,shift,id,number,method,amount,app);
  const close=(loc,id)=>rpc('close',loc,id);
  const m=(await state('munro')).active,t=(await state('torcuato')).active;
  assert.equal(m.turno,'manana');assert.equal(t.local,'torcuato');assert.notEqual(t.id,m.id);
  await assert.rejects(()=>close('munro',m.id),/Cargá al menos una/);
  await save('munro',m.id,null,'36','transferencia',15900,false);
  const mp=await save('munro',m.id,null,'32','mercado_pago',39500,true);
  const last=await save('munro',m.id,null,'24','getnet',10900,false);
  assert.equal(Number(last.total_ventas),66300);
  assert.equal(Number(last.total_app),39500);
  assert.equal(Number(last.online_local),26800);
  const id=mp.movements.find(x=>x.comanda==='32').id;
  assert.equal(Number((await save('munro',m.id,id,'32','mercado_pago',39500,false)).online_local),66300);
  assert.equal(Number((await save('munro',m.id,id,'32','mercado_pago',39500,true)).online_local),26800);
  await assert.rejects(()=>save('torcuato',m.id,null,'2','getnet',100,false),/local/);
  await assert.rejects(()=>save('munro',m.id,null,'abc','getnet',100,false),/comanda/);
  const first=await close('munro',m.id);
  assert.equal(first.closed.status,'cerrado');assert.equal(first.active.turno,'tarde');
  assert.equal(first.active.day,first.closed.day);
  assert.equal((await state('munro')).history[0].movements.length,3);
  await assert.rejects(()=>save('munro',m.id,null,'44','transferencia',100,false),/cerrado/);
  await save('munro',first.active.id,null,'88','transferencia',100,false);
  const second=await close('munro',first.active.id);
  assert.equal(second.active.turno,'manana');
  const tomorrow=new Date(first.closed.day+'T00:00:00Z');tomorrow.setUTCDate(tomorrow.getUTCDate()+1);
  assert.equal(second.active.day,tomorrow.toISOString().slice(0,10));
  assert.equal((await state('torcuato')).active.movements.length,0);
  await context('gerente',TENANT,'munro');
  await assert.rejects(()=>state('torcuato'),/permiso/);
  await context('gerente',TENANT,'torcuato');
  await assert.rejects(()=>state('munro'),/permiso/);
  await context('dueno','22222222-2222-4222-8222-222222222222');
  await assert.rejects(()=>state('munro'),/permiso/);
  await context('lectura');
  await assert.rejects(()=>state('munro'),/permiso/);
  await db.exec('reset role;set role anon');
  await assert.rejects(()=>state('munro'),/permission denied/);
  await db.exec('reset role;set role authenticated');
  await context();
  await assert.rejects(()=>db.query('select * from gestlok_mg_online_private.shifts'),/permission denied/);
  await db.exec('reset role');
  const audit=await db.query("select count(*)::integer as n from gestlok_mg_online_private.audit where action='cerrado'");
  assert.equal(audit.rows[0].n,2);
 }finally{await db.close();}
});

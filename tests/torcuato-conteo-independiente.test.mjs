import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const src=fs.readFileSync(new URL('../public/stock/mi-gusto-conteo.js',import.meta.url),'utf8');
const sql=fs.readFileSync(new URL('../supabase/migrations/20261116033000_torcuato_conteo_independiente.sql',import.meta.url),'utf8');
const tick=()=>new Promise(r=>setImmediate(r));
const TENANT='cb0dc04a-9a13-434f-a3d0-47f1d8f39670';

function mount({local='torcuato',role='gerente',access=[local],tenant=TENANT}={}){
 const events=new Map(),calls=[],draws=[];
 const window={};
 const storage=new Map();
 window.localStorage={
  getItem:k=>storage.get(k)||null,
  setItem:(k,v)=>storage.set(k,v)
 };
 const document={addEventListener:(t,fn)=>events.set(t,fn),querySelector:()=>null};
 vm.runInNewContext(src,{window,document,navigator:{onLine:true},Intl,Date,Promise,Set,Map,Object,JSON,Number,String,Math,console});
 const state={
  products:[{id:'c1',name:local==='munro'?'Munro producto':'Torcuato producto',section:'EMPANADAS',units_per_chapa:30,position:101,active:true}],
  counts:[],history:[],settings:{locked:true,hidden_sections:['GASEOSAS 500 CC']}
 };
 window.GestLokSupabase={rpc:async (name,args)=>{
  calls.push({name,args});
  if(name.endsWith('_state'))return {data:state,error:null};
  if(name.endsWith('_history'))return {data:[],error:null};
  return {data:{ok:true},error:null};
 }};
 const mod=window.GestLokMunroConteo;
 const S={me:{id:'u1',tenant_id:tenant},local,view:'conteo-munro',ro:false,offline:false};
 mod.attach({S,miRol:()=>role,misLocales:()=>access,render:()=>draws.push(S.local),toast:()=>{}});
 return {mod,S,calls,events,draws,storage,state};
}

test('Torcuato usa el mismo conteo visual y muestra su propia sucursal',async()=>{
 const x=mount();
 assert.equal(x.mod.permitido(),true);
 x.mod.view();await tick();
 const html=x.mod.view();
 assert.match(html,/MI GUSTO · DON TORCUATO/);
 assert.match(html,/<strong>Don Torcuato<\/strong>/);
 assert.match(html,/data-gcm-history-open/);
 assert.match(html,/gcm-count-screen/);
 assert.match(html,/Torcuato producto/);
 assert.doesNotMatch(html,/Munro producto/);
 assert.deepEqual(x.calls.map(c=>c.name),['gestlok_torcuato_conteo_state']);
 assert.equal(x.state.counts.length,0,'Torcuato inicia sin conteos');
 assert.equal(x.state.history.length,0,'Torcuato inicia sin historial');
});
test('Munro mantiene sus funciones originales y su historial especial de 14/11',async()=>{
 const x=mount({local:'munro'});
 x.mod.view();await tick();
 assert.match(x.mod.view(),/MI GUSTO · MUNRO/);
 assert.deepEqual(x.calls.map(c=>c.name),['gestlok_munro_conteo_state']);
 assert.equal(x.mod._test.historyShiftLabel({day:'2026-11-14',shift:'manana_entrada'}),'Noche · salida');
});
test('El 14/11 no se renombra en el historial de Torcuato',()=>{
 const x=mount({local:'torcuato'});
 assert.equal(x.mod._test.historyShiftLabel({day:'2026-11-14',shift:'manana_entrada'}),'Mañana · entrada');
});
test('Cambio de sucursal reinicia memoria, usa el RPC nuevo y no reutiliza conteos',async()=>{
 const x=mount({local:'munro',role:'dueno',access:['munro','torcuato']});
 x.mod.view();await tick();assert.match(x.mod.view(),/Munro producto/);
 x.S.local='torcuato';x.mod.reset();
 // El backend cambia por local, no por los datos cargados anteriormente.
 x.state.products=[{id:'t1',name:'Solo Don Torcuato',section:'EMPANADAS',units_per_chapa:30,position:100,active:true}];
 x.mod.view();await tick();const view=x.mod.view();
 assert.match(view,/Solo Don Torcuato/);assert.doesNotMatch(view,/Munro producto/);
 assert.deepEqual(x.calls.map(c=>c.name),['gestlok_munro_conteo_state','gestlok_torcuato_conteo_state']);
});
test('Un gerente de Munro no puede abrir Conteo de Torcuato ni viceversa',()=>{
 assert.equal(mount({local:'torcuato',access:['munro']}).mod.permitido(),false);
 assert.equal(mount({local:'munro',access:['torcuato']}).mod.permitido(),false);
 assert.equal(mount({local:'torcuato',tenant:'otra-empresa'}).mod.permitido(),false);
 assert.equal(mount({local:'torcuato',role:'colaborador'}).mod.permitido(),false);
});
test('La migración solo clona catálogo y preferencias, nunca registros ni historial',()=>{
 assert.match(sql,/create schema gestlok_torcuato_conteo_private/);
 assert.match(sql,/create table gestlok_torcuato_conteo_private\.products/);
 assert.match(sql,/create table gestlok_torcuato_conteo_private\.shifts/);
 assert.match(sql,/insert into gestlok_torcuato_conteo_private\.products/);
 assert.match(sql,/insert into gestlok_torcuato_conteo_private\.settings/);
 assert.doesNotMatch(sql,/insert into gestlok_torcuato_conteo_private\.shifts/i);
 assert.match(sql,/select count\(\*\) from gestlok_torcuato_conteo_private\.shifts\)<>0/);
 assert.match(sql,/revoke all on schema gestlok_torcuato_conteo_private from public,anon,authenticated/);
 assert.match(sql,/grant execute on function .* to authenticated/);
 assert.match(sql,/puede_ver_local/);
});

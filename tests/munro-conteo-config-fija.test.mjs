import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const src=fs.readFileSync(new URL('../public/stock/mi-gusto-conteo.js',import.meta.url),'utf8');
const migration=fs.readFileSync(new URL('../supabase/migrations/20261114235000_munro_conteo_fijar_categorias.sql',import.meta.url),'utf8');
const tick=()=>new Promise(r=>setImmediate(r));

function app(role='gerente'){
 const window={confirm:()=>true},listeners=new Map(),rpcCalls=[];
 const document={addEventListener:(type,fn)=>listeners.set(type,fn),querySelector:()=>null};
 vm.runInNewContext(src,{window,document,navigator:{onLine:true},Intl,Date,Promise,Set,Map,Array,Object,JSON,String,Number,Math,console});
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const get=k=>parts.find(x=>x.type===k).value,day=get('year')+'-'+get('month')+'-'+get('day');
 const hidden=['GASEOSAS 500 CC','AGUAS SABORIZADAS 500 CC','AGUAS SABORIZADAS 1,5 L'];
 const state={settings:{locked:true,hidden_sections:hidden},products:[
  {id:'a',name:'AC',section:'EMPANADAS',active:true,units_per_chapa:30,position:101},
  {id:'s',name:'Ajo',section:'SALSAS',active:true,units_per_chapa:0,position:201},
  {id:'g',name:'Coca-Cola',section:'GASEOSAS 500 CC',active:true,units_per_chapa:0,position:701}
 ],counts:[{day,shift:'manana_entrada',status:'borrador',hidden_sections:[],decomiso:{},decomiso_visible:false,consumption:[],waste:[],waste_visible:false,responsable:'Cami',data:{}}],history:[]};
 window.GestLokSupabase={rpc:async(name,args)=>{rpcCalls.push({name,args});return {data:name==='gestlok_munro_conteo_state'?state:{ok:true},error:null};}};
 const mod=window.GestLokMunroConteo;
 mod.attach({S:{me:{tenant_id:'cb0dc04a-9a13-434f-a3d0-47f1d8f39670'},local:'munro',view:'conteo-munro',ro:false,offline:false},
  miRol:()=>role,misLocales:()=>['munro'],render:()=>{},toast:()=>{}});
 return {mod,state,listeners,rpcCalls};
}
test('categorías fijadas se respetan incluso en turno que aún no tiene registro',async()=>{
 const {mod}=app();
 mod.view();await tick();
 const h=mod.view();
 assert.match(h,/data-gcm-section="EMPANADAS"/);
 assert.match(h,/data-gcm-section="SALSAS"/);
 assert.doesNotMatch(h,/data-gcm-section="GASEOSAS 500 CC"/);
});
test('gerente no ve Quitar ni ajustes, no puede modificar categorías pero puede contar',async()=>{
 const {mod,listeners,rpcCalls}=app('gerente');
 mod.view();await tick();
 const h=mod.view();
 assert.doesNotMatch(h,/data-gcm-hide-section/);
 assert.doesNotMatch(h,/data-gcm-section-visible/);
 assert.match(h,/Categorías fijas de Munro/);
 assert.match(h,/data-gcm-plus="a"/);
 const button={dataset:{gcmHideSection:'SALSAS'},hasAttribute:x=>x==='data-gcm-hide-section'};
 await listeners.get('click')({target:{closest:what=>what==='button'?button:{}},preventDefault(){},stopPropagation(){}});
 await tick();
 assert.ok(!rpcCalls.some(x=>x.name==='gestlok_munro_conteo_set_section'));
});
test('administradora puede modificar selección y la tienda adopta la nueva lista',async()=>{
 const {mod,listeners,state,rpcCalls}=app('creadora');
 mod.view();await tick();
 let h=mod.view();
 assert.match(h,/data-gcm-hide-section="SALSAS"/);
 assert.match(h,/data-gcm-section-visible="GASEOSAS 500 CC"/);
 const button={dataset:{gcmHideSection:'SALSAS'},hasAttribute:x=>x==='data-gcm-hide-section'};
 await listeners.get('click')({target:{closest:what=>what==='button'?button:{}},preventDefault(){},stopPropagation(){}});
 await tick();
 h=mod.view();
 assert.doesNotMatch(h,/data-gcm-section="SALSAS"/);
 assert.ok(state.settings.hidden_sections.includes('SALSAS'));
 assert.ok(rpcCalls.some(x=>x.name==='gestlok_munro_conteo_set_section'&&x.args.p_section==='SALSAS'&&x.args.p_visible===false));
});
test('bloqueo de servidor: solo administradora modifica categorías; desperdicios sigue disponible',()=>{
 assert.match(migration,/create table if not exists gestlok_munro_conteo_private\.settings/);
 assert.match(migration,/locked boolean not null default true/);
 assert.match(migration,/where day=date '2026-11-14' and shift='manana_entrada'/);
 assert.match(migration,/require_access\(true,true\)/);
 assert.match(migration,/p_section<>'_waste'/);
 assert.match(migration,/where status='borrador'/);
 assert.match(migration,/before insert on gestlok_munro_conteo_private\.shifts/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../public/stock/mi-gusto-conteo.js',import.meta.url),'utf8');
const sql=fs.readFileSync(new URL('../supabase/migrations/20261114214500_munro_conteo_secciones_desperdicios.sql',import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));

function setup(){
 const listeners=new Map();
 const window={confirm:()=>true};
 const document={
  addEventListener:(name,fn)=>listeners.set(name,fn),
  querySelector:()=>null
 };
 vm.runInNewContext(source,{window,document,navigator:{onLine:true},Intl,Date,Promise,Set,Map,Math,Array,Object,Number,String,JSON,console});
 const mod=window.GestLokMunroConteo;
 const p=new Intl.DateTimeFormat('en-GB',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const v=k=>p.find(x=>x.type===k).value;
 const day=v('year')+'-'+v('month')+'-'+v('day');
 const rec={day,shift:'manana_entrada',data:{},responsable:'Cami',decomiso:{},decomiso_visible:false,
  hidden_sections:[],waste_visible:false,consumption:[],waste:[],status:'borrador'};
 const db={products:[
  {id:'p1',name:'AC',section:'EMPANADAS',active:true,units_per_chapa:30,position:1},
  {id:'p2',name:'Ajo',section:'SALSAS',active:true,units_per_chapa:0,position:2}
 ],counts:[rec],history:[]};
 const calls=[];
 window.GestLokSupabase={rpc:async(name,args)=>{
  calls.push({name,args});
  if(name==='gestlok_munro_conteo_state')return {data:JSON.parse(JSON.stringify(db)),error:null};
  if(name==='gestlok_munro_conteo_set_section'){
   if(args.p_section==='_waste')rec.waste_visible=args.p_visible;
   else rec.hidden_sections=args.p_visible?
    rec.hidden_sections.filter(x=>x!==args.p_section):[...new Set([...rec.hidden_sections,args.p_section])];
  }
  if(name==='gestlok_munro_conteo_set_extra'){
   if(args.p_kind==='waste'&&!rec.waste_visible)return {error:{message:'Desperdicios está apagado'}};
   rec[args.p_kind]=JSON.parse(JSON.stringify(args.p_items));
  }
  return {data:{ok:true},error:null};
 }};
 mod.attach({S:{me:{tenant_id:'cb0dc04a-9a13-434f-a3d0-47f1d8f39670'},local:'munro',view:'conteo-munro',ro:false,offline:false},
  miRol:()=> 'gerente',misLocales:()=>['munro'],render:()=>{},toast:()=>{}});
 const input=async({id='',attr='',dataset={},checked=false})=>{
  const target={id,checked,dataset,hasAttribute:x=>x===attr,closest:()=>({})};
  await listeners.get('change')({target});await tick();
  return target;
 };
 const button=async(attr,dataset={})=>{
  const el={dataset,hasAttribute:x=>x===attr};
  await listeners.get('click')({target:{closest:sel=>sel==='button'?el:{}},preventDefault:()=>{},stopPropagation:()=>{}});
  await tick();
 };
 return {mod,db,rec,calls,input,button};
}

test('Consumo visible y Desperdicios oculto por defecto',async()=>{
 const {mod}=setup();mod.view();await tick();
 const html=mod.view();
 assert.match(html,/>CONSUMO<\/h3>/);
 assert.doesNotMatch(html,/>DESPERDICIOS<\/h3>/);
 assert.match(html,/id="gcm-waste-toggle"/);
 assert.match(html,/Personalizar secciones/);
});
test('gerente oculta y restaura secciones sin modificar el catálogo',async()=>{
 const {mod,db,rec,input}=setup();mod.view();await tick();
 let html=mod.view();assert.match(html,/data-gcm-section="SALSAS"/);
 await input({attr:'data-gcm-section-visible',dataset:{gcmSectionVisible:'SALSAS'},checked:false});
 html=mod.view();
 assert.doesNotMatch(html,/data-gcm-section="SALSAS"/);
 assert.equal(rec.hidden_sections.join(','),'SALSAS');
 assert.equal(db.products.length,2);
 await input({attr:'data-gcm-section-visible',dataset:{gcmSectionVisible:'SALSAS'},checked:true});
 assert.match(mod.view(),/data-gcm-section="SALSAS"/);
});
test('Consumos tiene 10 filas fijas y no permite agregar ni quitar colaboradores',async()=>{
 const {mod,button,rec}=setup();mod.view();await tick();
 const html=mod.view();
 for(let i=0;i<10;i++){
  assert.match(html,new RegExp('data-gcm-extra="consumption" data-row="'+i+'" data-field="name"'));
  assert.match(html,new RegExp('data-gcm-extra="consumption" data-row="'+i+'" data-field="value"'));
 }
 assert.doesNotMatch(html,/data-gcm-extra-add="consumption"/);
 assert.doesNotMatch(html,/data-gcm-extra-remove="consumption"/);
 await button('data-gcm-extra-add',{gcmExtraAdd:'consumption'});
 await button('data-gcm-extra-remove',{gcmExtraRemove:'consumption',row:'9'});
 assert.equal(rec.consumption.length,0);
});
test('Desperdicios solo aparece y se guarda cuando gerente lo activa',async()=>{
 const {mod,input,button,rec,calls}=setup();mod.view();await tick();
 await input({id:'gcm-waste-toggle',checked:true});
 assert.equal(rec.waste_visible,true);
 assert.match(mod.view(),/>DESPERDICIOS<\/h3>/);
 await button('data-gcm-extra-add',{gcmExtraAdd:'waste'});
 assert.equal(rec.waste.length,2);
 await input({id:'gcm-waste-toggle',checked:false});
 assert.equal(rec.waste_visible,false);
 assert.doesNotMatch(mod.view(),/>DESPERDICIOS<\/h3>/);
 assert.equal(rec.waste.length,2); // queda preservado, sin estar visible ni editable
 assert.ok(calls.some(x=>x.name==='gestlok_munro_conteo_set_section'&&x.args.p_section==='_waste'));
});
test('las RPC privadas validan permisos y requieren activar Desperdicios',()=>{
 assert.match(sql,/gestlok_munro_conteo_private\.require_access\(true,false\)/);
 assert.match(sql,/if not r\.waste_visible then raise exception/);
 assert.match(sql,/grant execute on function public\.gestlok_munro_conteo_set_section/);
 assert.match(sql,/revoke all on function public\.gestlok_munro_conteo_set_section/);
});

test('gerente puede quitar SALSAS desde el botón visible en su barra y restaurarla',async()=>{
 const {mod,db,rec,calls,button,input}=setup();
 mod.view();await tick();
 let html=mod.view();
 assert.match(html,/data-gcm-hide-section="SALSAS"/);
 assert.match(html,/data-gcm-hide-section="EMPANADAS"/);
 await button('data-gcm-hide-section',{gcmHideSection:'SALSAS'});
 assert.equal(rec.hidden_sections.join(','),'SALSAS');
 html=mod.view();
 assert.doesNotMatch(html,/data-gcm-section="SALSAS"/);
 assert.equal(db.products.length,2);
 assert.ok(calls.some(x=>x.name==='gestlok_munro_conteo_set_section'&&x.args.p_section==='SALSAS'&&x.args.p_visible===false));
 await input({attr:'data-gcm-section-visible',dataset:{gcmSectionVisible:'SALSAS'},checked:true});
 assert.match(mod.view(),/data-gcm-section="SALSAS"/);
});

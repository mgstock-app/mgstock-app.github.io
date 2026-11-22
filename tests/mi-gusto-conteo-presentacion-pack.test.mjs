import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const src=fs.readFileSync(new URL('../public/stock/mi-gusto-conteo.js',import.meta.url),'utf8');
const sql=fs.readFileSync(new URL('../supabase/migrations/20261122224500_mi_gusto_conteo_presentacion_pack.sql',import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));

async function setup(local='munro',role='gerente'){
 const listeners=new Map(),calls=[],notices=[];
 const p=new Intl.DateTimeFormat('en-GB',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const g=k=>p.find(x=>x.type===k)?.value||'',day=g('year')+'-'+g('month')+'-'+g('day');
 const state={settings:{locked:true,hidden_sections:[]},categories:[{name:'SALSAS',position:200}],
  products:[{id:'ajo',name:'Ajo',section:'SALSAS',active:true,units_per_chapa:0,pack_kind:'caja',position:201},
   {id:'palito',name:'Caja Palito',section:'SALSAS',active:true,units_per_chapa:45,pack_kind:'caja',position:202}],
  counts:role==='dueno'?[]:[{day,shift:'manana_entrada',status:'borrador',data:{},decomiso:{},responsable:'Cami'}],
  history:[]};
 const win={confirm:()=>true,prompt:()=>null};
 const doc={addEventListener:(name,fn)=>listeners.set(name,fn),querySelector:()=>null};
 vm.runInNewContext(src,{window:win,document:doc,navigator:{onLine:true},Date,Intl,Promise,Set,Map,Array,Object,Number,String,Math,JSON,console});
 win.GestLokSupabase={rpc:async(name,args={})=>{
  calls.push({name,args});
  if(name.endsWith('_state'))return {data:JSON.parse(JSON.stringify(state)),error:null};
  if(name.endsWith('_history'))return {data:[],error:null};
  if(name.endsWith('_save_product_config')){
   const item=state.products.find(p=>p.id===args.p_id);
   if(item){item.units_per_chapa=args.p_units_per_pack;item.pack_kind=args.p_pack_kind;
      return {data:{ok:true,product:item},error:null};}
   const p={id:'nuevo',name:args.p_name,section:args.p_section,active:true,
    units_per_chapa:args.p_units_per_pack,pack_kind:args.p_pack_kind,position:203};
   state.products.push(p);
   return {data:{ok:true,product:p},error:null};
  }
  return {data:{ok:true},error:null};
 }};
 const mod=win.GestLokMunroConteo;
 mod.attach({S:{me:{tenant_id:'cb0dc04a-9a13-434f-a3d0-47f1d8f39670'},local,view:'conteo-munro',ro:false,offline:false},
 miRol:()=>role,misLocales:()=>[local],render:()=>{},toast:m=>notices.push(m)});
 mod.view();await tick();await tick();
 const fields={title:{textContent:''},type:{value:'0'},units:{value:'0',focus(){}},kind:{value:'caja'},wrap:{hidden:false},status:{textContent:''}};
 const dialog={open:false,dataset:{},showModal(){this.open=true},close(){this.open=false},
 querySelector:key=>({
  '[data-gcm-product-config-title]':fields.title,
  '[data-gcm-product-config-type]':fields.type,
  '[data-gcm-product-config-pack-units]':fields.units,
  '[data-gcm-product-config-kind]':fields.kind,
  '[data-gcm-product-config-pack-wrap]':fields.wrap,
  '[data-gcm-product-config-error]':fields.status
 })[key]||null};
 const root={querySelector:key=>key==='.gcm-product-config-dialog'?dialog:null};
 async function click(attr,dataset={}){
  const b={dataset,disabled:false,hasAttribute:k=>k===attr,closest:k=>k==='.gcm-product-config-dialog'?dialog:null};
  await listeners.get('click')({target:{closest:k=>k==='.gcm-page'?root:k==='button'?b:null},
   preventDefault(){},stopPropagation(){}});
  await tick();await tick();
 }
 return {mod,state,calls,click,dialog,fields,listeners,notices};
}

for(const loc of ['munro','torcuato']){
 test(loc+': gerente ve la edición por pack de un producto existente',async()=>{
  const x=await setup(loc,'gerente');
  assert.match(x.mod.view(),/data-gcm-config-product="palito"/);
  assert.match(x.mod.view(),/data-gcm-add-product-open="SALSAS"/);
  await x.click('data-gcm-config-product',{gcmConfigProduct:'palito'});
  assert.equal(x.dialog.open,true);
  assert.equal(x.fields.units.value,'45');
  x.fields.units.value='48';
  x.fields.type.value='1';
  await x.click('data-gcm-product-config-save');
  assert.equal(x.dialog.open,false);
  assert.equal(x.state.products[1].units_per_chapa,48);
  assert.ok(x.calls.some(c=>c.name==='gestlok_'+loc+'_conteo_save_product_config'&&
    c.args.p_id==='palito'&&c.args.p_units_per_pack===48&&c.args.p_pack_kind==='caja'));
 });
 test(loc+': dueño accede a configuración de productos, sin editar conteo activo',async()=>{
  const x=await setup(loc,'dueno');
  assert.match(x.mod.view(),/data-gcm-catalog-open/);
  await x.click('data-gcm-catalog-open');
  const html=x.mod.view();
  assert.match(html,/Configurar productos/);
  assert.match(html,/data-gcm-add-product-open="SALSAS"/);
  assert.match(html,/data-gcm-config-product="ajo"/);
  assert.doesNotMatch(html,/data-gcm-finalize/);
  assert.doesNotMatch(html,/data-gcm-sin-stock/);
  assert.doesNotMatch(html,/data-gcm-rename-category=/);
  await x.click('data-gcm-config-product',{gcmConfigProduct:'ajo'});
  x.fields.type.value='1';x.fields.units.value='12';
  await x.click('data-gcm-product-config-save');
  assert.ok(x.calls.some(c=>c.name==='gestlok_'+loc+'_conteo_save_product_config'&&c.args.p_id==='ajo'));
 });
}
test('administradora mantiene acciones de catálogo y configuración de presentaciones',async()=>{
 const x=await setup('munro','creadora');
 const h=x.mod.view();
 assert.match(h,/data-gcm-config-product="ajo"/);
 assert.match(h,/data-gcm-remove-products-open="SALSAS"/);
 assert.match(h,/data-gcm-rename="ajo"/);
});
test('solo quedan habilitados pack enteros de 1 a 1000 unidades',async()=>{
 const x=await setup();
 await x.click('data-gcm-config-product',{gcmConfigProduct:'ajo'});
 x.fields.type.value='1';x.fields.units.value='1500';
 await x.click('data-gcm-product-config-save');
 assert.equal(x.dialog.open,true);
 assert.match(x.fields.status.textContent,/1 a 1000/);
 assert.ok(!x.calls.some(c=>c.name.endsWith('_save_product_config')));
});
test('SQL conserva equivalencia por turno y separa permisos locales',()=>{
 assert.match(sql,/create table if not exists gestlok_munro_conteo_private\.pack_rate_snapshots/);
 assert.match(sql,/create table if not exists gestlok_torcuato_conteo_private\.pack_rate_snapshots/);
 assert.match(sql,/require_access\(true,false\)/);
 assert.match(sql,/public\.mi_rol\(\) not in \('creadora','dueno','gerente'\)/);
 assert.match(sql,/on conflict\(day,shift,product_id\) do nothing/);
 assert.match(sql,/status='borrador'/);
 assert.match(sql,/product_config_audit/);
 assert.match(sql,/pack_rates/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const src=fs.readFileSync(new URL('../public/stock/mi-gusto-conteo.js',import.meta.url),'utf8');
const sql=fs.readFileSync(new URL('../supabase/migrations/20261122225500_mi_gusto_conteo_packs_personalizables.sql',import.meta.url),'utf8');
const tick=()=>new Promise(r=>setImmediate(r));

async function setup(role='dueno',local='munro'){
 const listeners=new Map(),calls=[],confirms=[];
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const g=k=>parts.find(x=>x.type===k).value,day=g('year')+'-'+g('month')+'-'+g('day');
 const product={id:'p1',name:'Ajo',section:'SALSAS',units_per_chapa:12,pack_label:'caja',position:100,active:true};
 const db={categories:[{name:'SALSAS',position:100}],products:[product],
  settings:{locked:true,hidden_sections:[]},
  counts:[{day,shift:'manana_entrada',status:'borrador',data:{},decomiso:{},pack_units:{p1:12},hidden_sections:[]}],
  history:[{day:'2026-11-20',shift:'noche_salida',status:'finalizado',data:{p1:{v1:{chapas:2,sueltas:0,qty:0}}},decomiso:{},pack_units:{p1:12}}]};
 const window={confirm:s=>{confirms.push(s);return true}};
 const document={addEventListener:(n,fn)=>listeners.set(n,fn),querySelector:()=>null};
 const editor={
  mode:{value:'pack'},packLabel:{value:'caja'},units:{value:'12'},
  name:{value:'Ajo',readOnly:false,focus(){}},title:{textContent:''},
  status:{textContent:''},fields:{hidden:false}
 };
 const dialog={open:false,dataset:{},showModal(){this.open=true;},close(){this.open=false;},
  querySelector:selector=>({
   '[data-gcm-pack-name]':editor.name,'[data-gcm-pack-mode]':editor.mode,
   '[data-gcm-pack-label]':editor.packLabel,'[data-gcm-pack-units]':editor.units,
   '[data-gcm-pack-title]':editor.title,'[data-gcm-pack-error]':editor.status,
   '[data-gcm-pack-fields]':editor.fields
  })[selector]||null
 };
 const root={querySelector:s=>s==='.gcm-pack-editor'?dialog:null};
 vm.runInNewContext(src,{window,document,navigator:{onLine:true},Intl,Date,Promise,Set,Map,Math,Array,Object,Number,String,JSON,console});
 window.GestLokSupabase={rpc:async(name,args)=>{
  calls.push({name,args});
  if(name.endsWith('_state'))return {data:JSON.parse(JSON.stringify(db)),error:null};
  if(name.endsWith('_history'))return {data:db.history,error:null};
  if(name.endsWith('_save_product_pack')){
   if(args.p_id){
    Object.assign(product,{units_per_chapa:args.p_units_per_pack,pack_label:args.p_pack_label});
    return {data:{ok:true,product:{...product}},error:null};
   }
   const p={id:'p2',name:args.p_name,section:args.p_section,active:true,position:101,
    units_per_chapa:args.p_units_per_pack,pack_label:args.p_pack_label};
   db.products.push(p);
   return {data:{ok:true,product:p},error:null};
  }
  return {data:{ok:true},error:null};
 }};
 const mod=window.GestLokMunroConteo;
 mod.attach({S:{me:{tenant_id:'cb0dc04a-9a13-434f-a3d0-47f1d8f39670'},local,view:'conteo-munro',ro:false,offline:false},
  miRol:()=>role,misLocales:()=>[local],render(){},toast(){}});
 mod.view();await tick();await tick();
 async function click(attr,dataset={}){
  const button={dataset,hasAttribute:s=>s===attr,disabled:false,
   closest:s=>s==='.gcm-pack-editor'?dialog:null};
  const e={target:{closest:s=>s==='.gcm-page'?root:s==='button'?button:null},
   preventDefault(){},stopPropagation(){}};
  await listeners.get('click')(e);await tick();await tick();
 }
 return {mod,product,db,calls,editor,dialog,click,confirms};
}

for(const local of ['munro','torcuato']){
 test('dueño ve Gestión de productos '+local+' y edita equivalencia 12 → 24',async()=>{
  const x=await setup('dueno',local);
  const history=x.mod.view();
  assert.match(history,/data-gcm-products-open/);
  await x.click('data-gcm-products-open');
  const catalog=x.mod.view();
  assert.match(catalog,/data-gcm-pack-edit="p1"/);
  assert.match(catalog,/1 caja = 12 unidades/);
  assert.match(catalog,/data-gcm-pack-add="SALSAS"/);
  await x.click('data-gcm-pack-edit',{gcmPackEdit:'p1'});
  assert.equal(x.dialog.open,true);
  assert.equal(x.editor.units.value,'12');
  assert.equal(x.editor.name.readOnly,true);
  x.editor.units.value='24';x.editor.packLabel.value='pack';
  await x.click('data-gcm-pack-save');
  assert.equal(x.dialog.open,false);
  assert.equal(x.product.units_per_chapa,24);
  assert.equal(x.db.history[0].pack_units.p1,12);
  assert.equal(x.db.history[0].data.p1.v1.chapas,2);
  assert.ok(x.calls.some(c=>c.name==='gestlok_'+local+'_conteo_save_product_pack'&&c.args.p_id==='p1'&&c.args.p_units_per_pack===24&&c.args.p_pack_label==='pack'));
  assert.ok(x.confirms.some(s=>s.includes('Las cantidades anteriores conservarán su equivalencia')));
 });
}
test('gerente puede elegir unidades, caja/pack y el número de piezas',async()=>{
 const x=await setup('gerente');
 assert.match(x.mod.view(),/data-gcm-products-open/);
 await x.click('data-gcm-products-open');
 await x.click('data-gcm-pack-edit',{gcmPackEdit:'p1'});
 x.editor.mode.value='unidad';
 await x.click('data-gcm-pack-save');
 assert.equal(x.product.units_per_chapa,0);
 assert.equal(x.product.pack_label,'unidad');
 assert.ok(x.calls.some(c=>c.name==='gestlok_munro_conteo_save_product_pack'&&c.args.p_units_per_pack===0));
});
test('presentación inválida no se guarda',async()=>{
 const x=await setup('creadora');
 await x.click('data-gcm-products-open');
 await x.click('data-gcm-pack-edit',{gcmPackEdit:'p1'});
 x.editor.units.value='1001';
 await x.click('data-gcm-pack-save');
 assert.match(x.editor.status.textContent,/1 a 1000/);
 assert.equal(x.dialog.open,true);
 assert.equal(x.calls.filter(x=>x.name.endsWith('_save_product_pack')).length,0);
});
test('reglas SQL: roles y snapshots independientes del catálogo',()=>{
 assert.match(sql,/v_role not in \('creadora','dueno','gerente'\)/);
 assert.match(sql,/pack_units jsonb not null/);
 assert.match(sql,/product_pack_audit/);
 assert.match(sql,/before insert or update of data,decomiso/);
 assert.match(sql,/coalesce\(\(r\.pack_units->>p_product\)::integer,per\)/);
 assert.match(sql,/coalesce\(\(b\.pack_units->>p\.id\)::integer,p\.units_per_chapa\)/);
 assert.match(sql,/coalesce\(\(m\.pack_units->>p\.id\)::integer,p\.units_per_chapa\)/);
 assert.match(sql,/pack_label in \('unidad','caja','pack','chapa'\)/);
 assert.match(src,/function productForRecord\(rec,p\)/);
 assert.match(src,/productForRecord\(rec,catalog\.get\(id\)\)/);
});

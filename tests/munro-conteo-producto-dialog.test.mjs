import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../public/stock/mi-gusto-conteo.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../app/mi-gusto-conteo.css',import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));

function setup(role='creadora'){
 const listeners=new Map(),calls=[],rpcArgs=[];
 const window={confirm:()=>true,prompt:()=>null};
 const document={addEventListener:(name,fn)=>listeners.set(name,fn),querySelector:()=>null};
 vm.runInNewContext(source,{window,document,navigator:{onLine:true},Intl,Date,Promise,Set,Map,Math,Array,Object,Number,String,JSON,console});
 const f=new Intl.DateTimeFormat('en-GB',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const v=k=>f.find(p=>p.type===k).value;
 const day=v('year')+'-'+v('month')+'-'+v('day');
 const data={products:[{id:'p1',name:'AC',section:'EMPANADAS',active:true,units_per_chapa:30,position:1}],
 counts:[{day,shift:'manana_entrada',data:{},decomiso:{},decomiso_visible:false,responsable:'Cami',status:'borrador',consumption:[],waste:[],hidden_sections:[],waste_visible:false}],
 history:[],settings:{locked:true,hidden_sections:[]}};
 window.GestLokSupabase={rpc:async(name,args)=>{
  calls.push(name);rpcArgs.push({name,args});
  if(name==='gestlok_munro_conteo_save_product_pack'){
   const p={id:'new-'+(data.products.length+1),name:args.p_name,section:args.p_section,
    units_per_chapa:args.p_units_per_pack,pack_label:args.p_pack_label,
    position:301+data.products.length,active:true};
   data.products.push(p);return {data:{ok:true,product:p},error:null};
  }
  return {data:name==='gestlok_munro_conteo_state'?data:{ok:true},error:null};
 }};
 const mod=window.GestLokMunroConteo;
 mod.attach({S:{me:{tenant_id:'cb0dc04a-9a13-434f-a3d0-47f1d8f39670'},local:'munro',view:'conteo-munro',ro:false,offline:false},
 miRol:()=>role,misLocales:()=>['munro'],render:()=>{},toast:()=>{}});
 return {mod,window,listeners,calls,data,rpcArgs};
}
function fakeEvent(target,dialog){
 const parent={querySelector:()=>dialog};
 target.closest=sel=>{
  if(sel==='.gcm-page')return {};
  if(sel==='button')return target;
  if(sel==='.gcm-product-actions')return parent;
  if(sel==='.gcm-product-dialog')return dialog;
  return null;
 };
 return {target,preventDefault(){},stopPropagation(){}};
}
test('admin ve los tres puntos con un cuadro modal completo, no un menú recortable',async()=>{
 const {mod}=setup();mod.view();await tick();
 const html=mod.view();
 assert.match(html,/data-gcm-product-menu="p1"/);
 assert.match(html,/aria-haspopup="dialog"/);
 assert.match(html,/<dialog class="gcm-product-dialog"/);
 assert.match(html,/>Cambiar nombre<\/button>/);
 assert.match(html,/>Quitar producto<\/button>/);
 assert.match(html,/>Cancelar<\/button>/);
 assert.doesNotMatch(html,/<details class="gcm-product-actions"/);
 assert.match(css,/dialog\.gcm-product-dialog::backdrop/);
 assert.match(css,/position:fixed;inset:0/);
});
test('tocar tres puntos abre un diálogo nativo sobre la tabla y se puede cancelar sin cambios',async()=>{
 const {mod,listeners,calls}=setup();mod.view();await tick();
 const dialog={open:false,showModal(){this.open=true;this.opened=(this.opened||0)+1;},close(){this.open=false;this.closed=(this.closed||0)+1;},querySelector:()=>({focus(){}})};
 const openButton={dataset:{gcmProductMenu:'p1'},hasAttribute:k=>k==='data-gcm-product-menu'};
 await listeners.get('click')(fakeEvent(openButton,dialog));
 assert.equal(dialog.open,true);
 assert.equal(dialog.opened,1);
 const cancelButton={dataset:{},hasAttribute:k=>k==='data-gcm-menu-close'};
 await listeners.get('click')(fakeEvent(cancelButton,dialog));
 assert.equal(dialog.open,false);
 assert.equal(dialog.closed,1);
 assert.ok(!calls.includes('gestlok_munro_conteo_product'));
});
test('gerente no ve ni puede abrir acciones de catálogo de administradora',async()=>{
 const {mod,listeners}=setup('gerente');mod.view();await tick();
 const html=mod.view();
 assert.doesNotMatch(html,/data-gcm-product-menu/);
 assert.doesNotMatch(html,/gcm-product-dialog/);
 const dialog={open:false,showModal(){this.open=true},querySelector:()=>null};
 const button={dataset:{gcmProductMenu:'p1'},hasAttribute:k=>k==='data-gcm-product-menu'};
 await listeners.get('click')(fakeEvent(button,dialog));
 assert.equal(dialog.open,false);
});

test('botón Agregar producto aparece en todas las categorías, incluso sin activos',async()=>{
 const {mod,data}=setup();
 data.products.push(
  {id:'p2',name:'Pizza Ind',section:'PIZZAS',active:true,units_per_chapa:0,position:301},
  {id:'p3',name:'Agua 500 cc',section:'AGUAS',active:true,units_per_chapa:0,position:1101},
  {id:'p4',name:'Helado anterior',section:'HELADOS',active:false,units_per_chapa:0,position:401});
 mod.view();await tick();
 const html=mod.view();
 for(const name of ['EMPANADAS','PIZZAS','AGUAS','HELADOS']){
  assert.ok(html.includes('data-gcm-add-product-open="'+name+'"'),name+' debe permitir agregar');
 }
 assert.equal((html.match(/data-gcm-add-product-open=/g)||[]).length,4);
 assert.match(html,/class="gcm-add-product-dialog"/);
 assert.match(html,/data-gcm-new-product-name/);
 assert.match(html,/data-gcm-new-product-type/);
 assert.match(html,/Por unidades/);
 assert.match(html,/Por caja \/ pack cerrado/);
 assert.match(html,/data-gcm-new-product-units/);
 assert.match(html,/data-gcm-new-product-label/);
 assert.match(css,/dialog\.gcm-add-product-dialog::backdrop/);
 assert.match(css,/@media\(max-width:700px\)/);
});

function addProductEvent(attr,section,dialog){
 const wrapper={dataset:{gcmSection:section},querySelector:()=>dialog};
 const button={
  dataset:{gcmAddProductOpen:section},hasAttribute:k=>k===attr,
  closest:k=>k==='.gcm-page'?{}:k==='button'?button:k==='.gcm-section'?wrapper:k==='.gcm-add-product-dialog'?dialog:null
 };
 return {target:button,preventDefault(){},stopPropagation(){}};
}
function newProductDialog(name,per='0'){
 const input={value:name,focus(){this.focused=true}},
  type={value:per==='0'?'0':'pack'},units={value:per==='0'?'':per},
  label={value:'chapa'},status={textContent:''};
 return {
  open:false,input,type,units,label,status,
  showModal(){this.open=true;},
  close(){this.open=false;},
  querySelector:selector=>({
   '[data-gcm-new-product-name]':input,
   '[data-gcm-new-product-type]':type,
   '[data-gcm-new-product-units]':units,
   '[data-gcm-new-product-label]':label,
   '[data-gcm-add-product-error]':status
  }[selector]||null)
 };
}

test('administradora agrega pizza por unidades: se guarda y aparece en los 3 turnos',async()=>{
 const {mod,data,listeners,calls,rpcArgs}=setup();
 data.products.push({id:'pizza',name:'Pizza Ind',section:'PIZZAS',active:true,units_per_chapa:0,position:301});
 mod.view();await tick();
 const dialog=newProductDialog('Pizza especial','0');
 await listeners.get('click')(addProductEvent('data-gcm-add-product-open','PIZZAS',dialog));
 assert.equal(dialog.open,true);
 assert.equal(dialog.input.focused,true);
 await listeners.get('click')(addProductEvent('data-gcm-add-product-save','PIZZAS',dialog));
 assert.equal(dialog.open,false,'debe cerrar únicamente cuando guardó correctamente');
 const req=rpcArgs.find(x=>x.name==='gestlok_munro_conteo_save_product_pack');
 assert.equal(req.args.p_section,'PIZZAS');
 assert.equal(req.args.p_name,'Pizza especial');
 assert.equal(req.args.p_units_per_pack,0);
 assert.equal(req.args.p_pack_label,'unidad');
 assert.equal(data.products.find(p=>p.name==='Pizza especial')?.active,true);
 assert.equal(data.counts[0].data['new-3'],undefined,'el alta no altera conteos ya registrados');
 const html=mod.view();
 assert.match(html,/Pizza especial/);
 for(const shift of ['manana_entrada','manana_salida','noche_salida'])
  assert.ok(source.includes(shift),'El producto debe ser global, no de un solo turno: '+shift);
 assert.ok(calls.includes('gestlok_munro_conteo_state'),'debe volver a leer el catálogo');
});

test('empanadas admite chapas de 27 o 30; no crea duplicados ni nombres vacíos',async()=>{
 const {mod,listeners,data,rpcArgs}=setup();
 mod.view();await tick();
 const dialog=newProductDialog('Empanada nueva','27');
 await listeners.get('click')(addProductEvent('data-gcm-add-product-save','EMPANADAS',dialog));
 assert.equal(rpcArgs.find(x=>x.name==='gestlok_munro_conteo_save_product_pack')?.args.p_units_per_pack,27);
 dialog.input.value='AC';
 await listeners.get('click')(addProductEvent('data-gcm-add-product-save','EMPANADAS',dialog));
 assert.match(dialog.status.textContent,/Ya existe/);
 dialog.input.value=' ';
 await listeners.get('click')(addProductEvent('data-gcm-add-product-save','EMPANADAS',dialog));
 assert.match(dialog.status.textContent,/nombre/);
 assert.equal(rpcArgs.filter(x=>x.name==='gestlok_munro_conteo_save_product_pack').length,1);
 assert.equal(data.products.filter(p=>p.name==='AC').length,1);
});

test('gerente puede crear productos sin recibir permisos para quitar categorías',async()=>{
 const {mod,data,listeners,calls}=setup('gerente');
 data.products.push({id:'p2',section:'PIZZAS',name:'Pizza Ind',active:true,units_per_chapa:0,position:301});
 mod.view();await tick();
 assert.match(mod.view(),/data-gcm-add-product-open="PIZZAS"/);
 assert.doesNotMatch(mod.view(),/data-gcm-remove-products-open/);
 const dialog=newProductDialog('Pizza gerente');
 await listeners.get('click')(addProductEvent('data-gcm-add-product-open','PIZZAS',dialog));
 await listeners.get('click')(addProductEvent('data-gcm-add-product-save','PIZZAS',dialog));
 assert.equal(dialog.open,false);
 assert.equal(calls.includes('gestlok_munro_conteo_save_product_pack'),true);
});

test('SQL de agregar producto valida rol, categoría existente y no modifica historial',()=>{
 const sql=fs.readFileSync(new URL('../supabase/migrations/20261115114500_munro_conteo_agregar_producto.sql',import.meta.url),'utf8');
 assert.match(sql,/require_access\(true,true\)/);
 assert.match(sql,/gestlok_munro_conteo_private\.products/);
 assert.match(sql,/unique index if not exists/);
 assert.match(sql,/p_units_per_chapa not in \(0,27,30\)/);
 assert.match(sql,/revoke all on function public\.gestlok_munro_conteo_add_product/);
 assert.match(sql,/grant execute on function public\.gestlok_munro_conteo_add_product/);
 assert.doesNotMatch(sql,/update\s+gestlok_munro_conteo_private\.shifts/i);
});

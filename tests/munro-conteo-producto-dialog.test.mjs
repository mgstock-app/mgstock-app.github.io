import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../public/stock/mi-gusto-conteo.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../app/mi-gusto-conteo.css',import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));

function setup(role='creadora'){
 const listeners=new Map(),calls=[];
 const window={confirm:()=>true,prompt:()=>null};
 const document={addEventListener:(name,fn)=>listeners.set(name,fn),querySelector:()=>null};
 vm.runInNewContext(source,{window,document,navigator:{onLine:true},Intl,Date,Promise,Set,Map,Math,Array,Object,Number,String,JSON,console});
 const f=new Intl.DateTimeFormat('en-GB',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const v=k=>f.find(p=>p.type===k).value;
 const day=v('year')+'-'+v('month')+'-'+v('day');
 const data={products:[{id:'p1',name:'AC',section:'EMPANADAS',active:true,units_per_chapa:30,position:1}],
 counts:[{day,shift:'manana_entrada',data:{},decomiso:{},decomiso_visible:false,responsable:'Cami',status:'borrador',consumption:[],waste:[],hidden_sections:[],waste_visible:false}],
 history:[],settings:{locked:true,hidden_sections:[]}};
 window.GestLokSupabase={rpc:async(name,args)=>{calls.push(name);return {data:name==='gestlok_munro_conteo_state'?data:{ok:true},error:null};}};
 const mod=window.GestLokMunroConteo;
 mod.attach({S:{me:{tenant_id:'cb0dc04a-9a13-434f-a3d0-47f1d8f39670'},local:'munro',view:'conteo-munro',ro:false,offline:false},
 miRol:()=>role,misLocales:()=>['munro'],render:()=>{},toast:()=>{}});
 return {mod,window,listeners,calls};
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

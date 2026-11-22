import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../public/stock/mi-gusto-conteo.js',import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));

async function app({local='munro',role='creadora'}={}){
 const listeners=new Map(),calls=[],prompts=[];
 const dateParts=new Intl.DateTimeFormat('en-GB',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const d=k=>dateParts.find(v=>v.type===k).value,day=d('year')+'-'+d('month')+'-'+d('day');
 const history=[{day:'2026-11-21',shift:'noche_salida',status:'finalizado',data:{s1:{v1:{qty:2}}}}];
 const db={settings:{locked:true,hidden_sections:[]},products:[
   {id:'s1',name:'Ajo',section:'SALSAS',units_per_chapa:0,position:10,active:true},
   {id:'s2',name:'BBQ',section:'SALSAS',units_per_chapa:0,position:11,active:true},
   {id:'e1',name:'Carne',section:'EMPANADAS',units_per_chapa:30,position:1,active:true}
  ],counts:[{day,shift:'manana_entrada',status:'borrador',data:{},decomiso:{},hidden_sections:[],waste:[],consumption:[],decomiso_visible:false,responsable:'Cami'}],history};
 const window={confirm:s=>{prompts.push(s);return true;}};
 const document={addEventListener:(name,fn)=>listeners.set(name,fn),querySelector:()=>null};
 vm.runInNewContext(source,{window,document,navigator:{onLine:true},Intl,Date,Promise,Set,Map,Array,Object,JSON,String,Number,Math,console});
 window.GestLokSupabase={rpc:async(name,args)=>{
   calls.push({name,args});
   if(name==='gestlok_munro_conteo_state'||name==='gestlok_torcuato_conteo_state')
    return {data:JSON.parse(JSON.stringify(db)),error:null};
   if(name.endsWith('_product')){
     const item=db.products.find(p=>p.id===args.p_id);
     if(!item)return {error:{message:'No existe el producto'}};
     item.active=args.p_active;return {data:{ok:true},error:null};
   }
   return {data:{ok:true},error:null};
 }};
 const mod=window.GestLokMunroConteo;
 const S={me:{tenant_id:'cb0dc04a-9a13-434f-a3d0-47f1d8f39670'},local,view:'conteo-munro',ro:false,offline:false};
 mod.attach({S,miRol:()=>role,misLocales:()=>[local],render:()=>{},toast:()=>{}});
 mod.view();await tick();
 const checks=db.products.filter(p=>p.section==='SALSAS').map(p=>({
  checked:true,dataset:{gcmRemoveSelected:p.id},focus(){}
 }));
 const status={textContent:''};
 const dialog={open:false,showModal(){this.open=true;},close(){this.open=false;},
   querySelectorAll:sel=>sel==='[data-gcm-remove-selected]'?checks:
    sel==='[data-gcm-remove-selected]:checked'?checks.filter(c=>c.checked):[],
   querySelector:sel=>sel==='[data-gcm-remove-products-error]'?status:
    sel==='[data-gcm-remove-selected]'?checks[0]:null};
 const wrapper={dataset:{gcmSection:'SALSAS'},querySelector:sel=>sel==='.gcm-remove-products-dialog'?dialog:null};
 const root={};
 function button(attr,dataset={}){
  return {dataset,disabled:false,hasAttribute:s=>s===attr,closest:sel=>
   sel==='.gcm-section'?wrapper:sel==='.gcm-remove-products-dialog'?dialog:null};
 }
 async function click(el){
  await listeners.get('click')({target:{closest:sel=>sel==='.gcm-page'?root:sel==='button'?el:null},
   preventDefault(){},stopPropagation(){}});
  await tick();await tick();
 }
 return {mod,db,calls,checks,status,dialog,prompts,button,click};
}

for(const local of ['munro','torcuato']){
 test('«Quitar» en '+local+' desactiva solo productos elegidos y conserva catálogo/historial',async()=>{
  const x=await app({local});
  const html=x.mod.view();
  assert.match(html,/data-gcm-remove-products-open="SALSAS"/);
  assert.match(html,/data-gcm-remove-selected="s1"/);
  assert.match(html,/data-gcm-remove-selected="s2"/);
  assert.doesNotMatch(html,/data-gcm-hide-section/);
  x.checks[1].checked=false;
  await x.click(x.button('data-gcm-remove-products-open',{gcmRemoveProductsOpen:'SALSAS'}));
  assert.equal(x.dialog.open,true);
  // Re-seleccionar: la apertura siempre limpia selecciones anteriores.
  assert.equal(x.checks.every(c=>c.checked===false),true);
  x.checks[0].checked=true;
  await x.click(x.button('data-gcm-remove-products-save'));
  assert.equal(x.dialog.open,false);
  assert.equal(x.db.products[0].active,false);
  assert.equal(x.db.products[1].active,true);
  assert.equal(x.db.products[2].active,true);
  assert.deepEqual(x.db.settings.hidden_sections,[]);
  assert.equal(x.db.history[0].data.s1.v1.qty,2);
  assert.doesNotMatch(x.mod.view(),/data-gcm-morning-row="s1"/);
  assert.ok(x.calls.some(c=>c.name==='gestlok_'+local+'_conteo_product'
    &&c.args.p_id==='s1'&&c.args.p_name==='Ajo'&&c.args.p_active===false));
  assert.ok(!x.calls.some(c=>c.name.endsWith('_set_section')));
  assert.ok(x.prompts.some(s=>s.includes('Los conteos históricos seguirán guardados')));
  await tick();
 });
}

test('si no hay selección, no guarda ni oculta la categoría',async()=>{
 const x=await app();
 await x.click(x.button('data-gcm-remove-products-open',{gcmRemoveProductsOpen:'SALSAS'}));
 await x.click(x.button('data-gcm-remove-products-save'));
 assert.equal(x.dialog.open,true);
 assert.match(x.status.textContent,/Seleccioná al menos un producto/);
 assert.ok(!x.calls.some(c=>c.name.endsWith('_product')));
});

test('gerente no accede al selector ni puede invocar la edición del catálogo',async()=>{
 const x=await app({role:'gerente'});
 const h=x.mod.view();
 assert.doesNotMatch(h,/data-gcm-remove-products-open/);
 await x.click(x.button('data-gcm-remove-products-open',{gcmRemoveProductsOpen:'SALSAS'}));
 assert.equal(x.dialog.open,false);
 assert.ok(!x.calls.some(c=>c.name.endsWith('_product')));
});

test('un producto retirado con cantidades en el turno sigue visible para que no se pierdan',async()=>{
 const x=await app();
 x.db.counts[0].data.s1={v1:{qty:2}};
 x.mod.reset();x.mod.view();await tick();
 await x.click(x.button('data-gcm-remove-products-open',{gcmRemoveProductsOpen:'SALSAS'}));
 x.checks[0].checked=true;
 await x.click(x.button('data-gcm-remove-products-save'));
 await tick();
 const html=x.mod.view();
 assert.match(html,/data-gcm-morning-row="s1"/);
 assert.match(html,/Quitado del catálogo/);
 assert.equal(x.db.counts[0].data.s1.v1.qty,2);
});

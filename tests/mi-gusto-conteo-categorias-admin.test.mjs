import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const src=fs.readFileSync(new URL('../public/stock/mi-gusto-conteo.js',import.meta.url),'utf8');
const migration=fs.readFileSync(new URL('../supabase/migrations/20261122222000_mi_gusto_conteo_categorias_admin.sql',import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));

async function app({local='munro',role='creadora'}={}){
 const listeners=new Map(),calls=[],confirms=[],toasts=[];
 const p=new Intl.DateTimeFormat('en-GB',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const g=k=>p.find(x=>x.type===k).value,day=g('year')+'-'+g('month')+'-'+g('day');
 const db={
  categories:[{name:'EMPANADAS',position:100},{name:'SALSAS',position:200}],
  products:[{id:'p1',name:'Ajo',section:'SALSAS',position:201,active:true,units_per_chapa:0},
   {id:'p2',name:'Ketchup',section:'SALSAS',position:202,active:true,units_per_chapa:0},
   {id:'p3',name:'Carne',section:'EMPANADAS',position:101,active:true,units_per_chapa:30}],
  settings:{locked:true,hidden_sections:['SALSAS']},
  counts:[{day,shift:'manana_entrada',status:'borrador',hidden_sections:['SALSAS'],
    data:{},decomiso:{},consumption:[],waste:[],responsable:'Cami'}],
  history:[{day:'2026-11-19',shift:'noche_salida',status:'finalizado',
     hidden_sections:[],data:{p1:{v1:{qty:8}}}}]
 };
 const ui={title:{textContent:''},note:{textContent:''},
   input:{value:'',focus(){}},status:{textContent:''}};
 const dialog={
  open:false,dataset:{oldCategory:''},showModal(){this.open=true;},close(){this.open=false;},
  querySelector:s=>({
   '[data-gcm-category-editor-title]':ui.title,'[data-gcm-category-editor-note]':ui.note,
   '[data-gcm-category-editor-name]':ui.input,'[data-gcm-category-editor-error]':ui.status
  })[s]||null
 };
 const root={querySelector:s=>s==='.gcm-category-editor-dialog'?dialog:null};
 const window={confirm:s=>{confirms.push(s);return true;}};
 const document={addEventListener:(name,fn)=>listeners.set(name,fn),querySelector:()=>null};
 vm.runInNewContext(src,{window,document,navigator:{onLine:true},Date,Intl,Promise,Set,Map,Array,Object,String,Math,Number,JSON,console});
 window.GestLokSupabase={rpc:async(name,args)=>{
  calls.push({name,args});
  if(name.endsWith('_state'))return {data:JSON.parse(JSON.stringify(db)),error:null};
  if(name.endsWith('_save_category')){
   if(args.p_old_name){
    const cat=db.categories.find(c=>c.name===args.p_old_name);
    if(!cat)return {error:{message:'No existe categoría'}};
    cat.name=args.p_name;
    db.products.filter(p=>p.section===args.p_old_name).forEach(p=>{p.section=args.p_name;});
    db.settings.hidden_sections=db.settings.hidden_sections.map(s=>s===args.p_old_name?args.p_name:s);
    db.counts[0].hidden_sections=db.counts[0].hidden_sections.map(s=>s===args.p_old_name?args.p_name:s);
   }else db.categories.push({name:args.p_name,position:300});
   return {data:{ok:true,name:args.p_name},error:null};
  }
  return {data:{ok:true},error:null};
 }};
 const mod=window.GestLokMunroConteo;
 mod.attach({S:{me:{tenant_id:'cb0dc04a-9a13-434f-a3d0-47f1d8f39670'},
   local,view:'conteo-munro',ro:false,offline:false},
   miRol:()=>role,misLocales:()=>[local],render:()=>{},toast:s=>toasts.push(s)});
 mod.view();await tick();
 async function click(attr,dataset={}){
  const el={dataset,disabled:false,hasAttribute:what=>what===attr,
    closest:s=>s==='.gcm-category-editor-dialog'?dialog:null};
  await listeners.get('click')({target:{closest:s=>s==='.gcm-page'?root:s==='button'?el:null},
    preventDefault(){},stopPropagation(){}});
  await tick();await tick();
 }
 return {mod,db,calls,click,ui,dialog,confirms,toasts};
}

for(const local of ['munro','torcuato']){
 test(local+': administradora crea categoría vacía disponible para agregar productos',async()=>{
  const x=await app({local});
  let h=x.mod.view();
  assert.match(h,/data-gcm-add-category/);
  assert.match(h,/data-gcm-rename-category="SALSAS"/);
  await x.click('data-gcm-add-category');
  assert.equal(x.dialog.open,true);
  assert.equal(x.ui.title.textContent,'Agregar categoría');
  x.ui.input.value='POSTRES';
  await x.click('data-gcm-category-editor-save');
  assert.equal(x.dialog.open,false);
  assert.ok(x.db.categories.some(c=>c.name==='POSTRES'));
  h=x.mod.view();
  assert.match(h,/data-gcm-section="POSTRES"/);
  assert.match(h,/data-gcm-add-product-open="POSTRES"/);
  assert.ok(x.calls.some(c=>c.name==='gestlok_'+local+'_conteo_save_category'
    &&c.args.p_name==='POSTRES'&&c.args.p_old_name===null));
 });
 test(local+': renombrar SALSAS conserva ids, cantidades e historial',async()=>{
  const x=await app({local});
  await x.click('data-gcm-rename-category',{gcmRenameCategory:'SALSAS'});
  assert.equal(x.dialog.open,true);
  assert.equal(x.ui.input.value,'SALSAS');
  x.ui.input.value='ADEREZOS';
  await x.click('data-gcm-category-editor-save');
  assert.equal(x.dialog.open,false);
  assert.deepEqual(x.db.products.map(p=>p.id),['p1','p2','p3']);
  assert.deepEqual(x.db.products.map(p=>p.section),['ADEREZOS','ADEREZOS','EMPANADAS']);
  assert.deepEqual(x.db.settings.hidden_sections,['ADEREZOS']);
  assert.equal(x.db.history[0].data.p1.v1.qty,8);
  assert.equal(x.db.history[0].day,'2026-11-19');
  assert.ok(x.confirms.some(s=>s.includes('Las cantidades históricas se conservarán')));
  assert.ok(x.calls.some(c=>c.name==='gestlok_'+local+'_conteo_save_category'
   &&c.args.p_old_name==='SALSAS'&&c.args.p_name==='ADEREZOS'));
 });
}
test('gerente no ve ni puede agregar o renombrar categorías',async()=>{
 const x=await app({role:'gerente'});
 const h=x.mod.view();
 assert.doesNotMatch(h,/data-gcm-add-category/);
 assert.doesNotMatch(h,/data-gcm-rename-category=/);
 await x.click('data-gcm-add-category');
 await x.click('data-gcm-rename-category',{gcmRenameCategory:'SALSAS'});
 assert.equal(x.dialog.open,false);
 assert.equal(x.calls.filter(c=>c.name.endsWith('_save_category')).length,0);
});
test('validación local rechaza nombres duplicados sin invocar el servidor',async()=>{
 const x=await app();
 await x.click('data-gcm-add-category');
 x.ui.input.value='SALSAS';
 await x.click('data-gcm-category-editor-save');
 assert.match(x.ui.status.textContent,/Ya existe una categoría/);
 assert.equal(x.dialog.open,true);
 assert.equal(x.calls.filter(c=>c.name.endsWith('_save_category')).length,0);
});
test('SQL impone permisos, aislamiento y no reescribe conteos finalizados',()=>{
 assert.match(migration,/gestlok_munro_conteo_private\.require_access\(true,true\)/);
 assert.match(migration,/gestlok_torcuato_conteo_private\.require_access\(true,true\)/);
 assert.match(migration,/create table if not exists gestlok_munro_conteo_private\.categories/);
 assert.match(migration,/create table if not exists gestlok_torcuato_conteo_private\.categories/);
 assert.match(migration,/enable row level security/);
 assert.match(migration,/where status='borrador'/);
 assert.doesNotMatch(migration,/update gestlok_munro_conteo_private\.shifts set data/i);
 assert.doesNotMatch(migration,/update gestlok_torcuato_conteo_private\.shifts set data/i);
 assert.match(migration,/on conflict \(name\) do nothing/);
});

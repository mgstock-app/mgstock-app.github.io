import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const source=read('public/stock/mi-gusto-conteo.js');
const css=read('app/mi-gusto-conteo.css');
const sql=read('supabase/migrations/20261122034500_torcuato_conteo_responsables_gerentes.sql');
const tick=()=>new Promise(resolve=>setImmediate(resolve));

function mount(local){
 const handlers=new Map(),calls=[];
 const window={confirm:()=>true,scrollTo:()=>{}};
 const document={addEventListener:(event,fn)=>handlers.set(event,fn),querySelector:()=>null};
 vm.runInNewContext(source,{window,document,navigator:{onLine:true},Intl,Date,Promise,Set,Map,Math,Array,Object,Number,String,JSON,console});
 const day=window.GestLokMunroConteo._test.plusDays('2026-11-22',0);
 const row={day,shift:'manana_entrada',status:'borrador',responsable:'Cami',data:{},decomiso:{},
  decomiso_visible:false,hidden_sections:[],consumption:[],waste:[],waste_visible:false};
 const products=[{id:'p1',name:'AC',section:'EMPANADAS',active:true,units_per_chapa:30,position:1},
  {id:'p2',name:'SALSA',section:'SALSAS',active:true,units_per_chapa:0,position:2}];
 window.GestLokSupabase={rpc:async(name,args={})=>{
  calls.push({name,args});
  if(name.endsWith('_state'))return {data:{products,counts:[row],history:[],settings:{locked:true,hidden_sections:[]}},error:null};
  return {data:{ok:true},error:null};
 }};
 const mod=window.GestLokMunroConteo;
 mod.attach({S:{local,view:'conteo-munro',me:{tenant_id:'cb0dc04a-9a13-434f-a3d0-47f1d8f39670'},ro:false,offline:false},
  miRol:()=> 'gerente',misLocales:()=>[local],render(){},toast(){}});
 return {mod,handlers,calls,row};
}

for(const [local,options,other] of [
 ['munro',['Cami','Shuli','Tizi'],['Caro','Gabi']],
 ['torcuato',['Cami','Caro','Gabi'],['Shuli','Tizi']]
]){
 test(local+': gerente aparece junto a Cerrar turno con opciones exclusivas del local',async()=>{
  const ctx=mount(local);ctx.mod.view();await tick();
  const html=ctx.mod.view();
  assert.match(html,/id="gcm-cierre"/);
  assert.match(html,/class="gcm-finalize-responsable" for="gcm-responsable"/);
  assert.match(html,/id="gcm-responsable"[^>]*required/);
  const fragment=html.slice(html.indexOf('<div class="gcm-finalize-controls">'),html.indexOf('</select>',html.indexOf('<div class="gcm-finalize-controls">'))+9);
  for(const option of options)assert.match(fragment,new RegExp('value="'+option+'"'));
  for(const invalid of other)assert.doesNotMatch(fragment,new RegExp('value="'+invalid+'"'));
  assert.ok(html.indexOf('id="gcm-responsable"')<html.lastIndexOf('data-gcm-finalize'));
  assert.equal((html.match(/id="gcm-responsable"/g)||[]).length,1);
  assert.match(html,/data-gcm-go-to-close/);
  assert.equal((html.match(/data-gcm-finalize/g)||[]).length,1);
  assert.match(html,/Responsable<\/span><strong>Cami<\/strong>/);
  assert.match(html,/gcm-category-nav-head/);
  assert.match(html,/data-gcm-category-close aria-label="Plegar categorías"/);
 });
 test(local+': guardar responsable usa únicamente RPC del local y aparece en historial',async()=>{
  const ctx=mount(local);ctx.mod.view();await tick();
  const name=local==='torcuato'?'Gabi':'Tizi';
  const input={id:'gcm-responsable',value:name,closest:sel=>sel==='.gcm-page'?{}:null};
  await ctx.handlers.get('change')({target:input});
  assert.equal(ctx.row.responsable,name);
  assert.ok(ctx.calls.some(call=>call.name==='gestlok_'+local+'_conteo_responsable'&&call.args.p_responsable===name));
  assert.ok(!ctx.calls.some(call=>call.name==='gestlok_'+(local==='munro'?'torcuato':'munro')+'_conteo_responsable'));
  assert.match(ctx.mod.view(),new RegExp('<option value="'+name+'" selected>'+name+'</option>'));
 });
}

test('la flecha cierra y vuelve a desplegar Categorías sin guardar ni cambiar cantidades',async()=>{
 const ctx=mount('munro');ctx.mod.view();await tick();
 const classes=new Set(),toggle={innerHTML:'Categorías <span>▸</span>',attrs:{},setAttribute(k,v){this.attrs[k]=v;}};
 const root={
  classList:{
   contains:s=>classes.has(s),
   add:s=>classes.add(s),
   remove:s=>classes.delete(s),
   toggle:(s,state)=>state?classes.add(s):classes.delete(s)
  },
  querySelector:sel=>sel==='.gcm-category-toggle'?toggle:null
 };
 const makeButton=attr=>{
  const btn={
   hasAttribute:x=>x===attr,
   setAttribute(k,v){this[k]=v;},
   closest:sel=>sel==='button'?btn:sel==='.gcm-page'?root:null
  };
  return btn;
 };
 const click=ctx.handlers.get('click');
 const before=ctx.calls.length;
 await click({target:makeButton('data-gcm-category-close')});
 assert.equal(classes.has('is-category-nav-collapsed'),true);
 assert.match(toggle.innerHTML,/Categorías .*▸/);
 assert.match(ctx.mod.view(),/gcm-count-screen is-category-nav-collapsed/);
 const arrow=makeButton('data-gcm-category-toggle');
 await click({target:arrow});
 assert.equal(classes.has('is-category-nav-collapsed'),false);
 assert.match(arrow.innerHTML,/Categorías .*▾/);
 assert.doesNotMatch(ctx.mod.view(),/gcm-count-screen is-category-nav-collapsed/);
 assert.equal(ctx.calls.length,before,'el desplegable no debe escribir en Supabase');
});
test('estilos dan ancho completo al cerrar también en tablet vertical o celular',()=>{
 assert.match(css,/\.gcm-count-screen\.is-category-nav-collapsed \.gcm-count-layout\{[\s\S]*?grid-template-columns:minmax\(0,1fr\)!important/);
 assert.match(css,/\.gcm-count-screen\.is-category-nav-collapsed \.gcm-category-nav\{\s*display:none!important/);
 assert.match(css,/\.gcm-count-screen\.is-category-nav-collapsed \.gcm-category-toggle\{[\s\S]*?display:inline-flex!important/);
 assert.match(css,/\.gcm-count-screen \.gcm-finalize-controls\{/);
 assert.match(css,/@media\(max-width:400px\)/);
});
test('backend de Torcuato distingue opciones nuevas sin sobreescribir historial ni permisos',()=>{
 assert.match(sql,/gestlok_torcuato_conteo_responsable/);
 assert.match(sql,/gestlok_torcuato_conteo_finalize/);
 assert.match(sql,/gestlok_torcuato_conteo_correct_closed/);
 assert.match(sql,/'Cami','Caro','Gabi'/);
 assert.match(sql,/responsable in \('Cami','Caro','Gabi','Shuli','Tizi'\)/);
 assert.doesNotMatch(sql,/update\s+gestlok_torcuato_conteo_private\.shifts\s+set\s+responsable/i);
 assert.match(sql,/require_access|validación de sesión\/local/);
});

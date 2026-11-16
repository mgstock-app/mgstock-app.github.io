import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const js=fs.readFileSync(new URL('../public/stock/mi-gusto-conteo.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../app/mi-gusto-conteo.css',import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const tenant='cb0dc04a-9a13-434f-a3d0-47f1d8f39670';

function mount(local){
 const events=new Map(), calls=[],window={};
 const doc={addEventListener:(name,fn)=>events.set(name,fn),querySelector:()=>null};
 vm.runInNewContext(js,{window,document:doc,navigator:{onLine:true},Date,Intl,Promise,Set,Map,JSON,Object,Math,Number,Array,String,console});
 const products=[
  {id:'ac',name:'AC',section:'EMPANADAS',position:1,units_per_chapa:30,active:true},
  {id:'bb',name:'BB',section:'EMPANADAS',position:2,units_per_chapa:30,active:true},
  {id:'s1',name:'SALSA TEST',section:'SALSAS',position:3,units_per_chapa:0,active:true},
  {id:'g1',name:'AGUA TEST',section:'AGUAS',position:4,units_per_chapa:0,active:true},
  {id:'h1',name:'OCULTA',section:'HELADOS',position:5,units_per_chapa:0,active:true}
 ];
 const state={products,counts:[],history:[],settings:{locked:true,hidden_sections:['HELADOS']}};
 window.GestLokSupabase={rpc:async(name,args)=>{calls.push({name,args});return {error:null,data:state};}};
 const mod=window.GestLokMunroConteo;
 mod.attach({S:{me:{tenant_id:tenant,id:'test'+local},local,view:'conteo-munro',ro:false,offline:false},
 miRol:()=> 'gerente',misLocales:()=>[local],render:()=>{},toast:()=>{}});
 return {mod,events,calls,state};
}

for(const loc of ['munro','torcuato']){
 test('Conteo '+loc+': vencimientos fijos y categorías laterales con los productos de su propia sucursal',async()=>{
  const a=mount(loc);
  a.mod.view();await tick();
  const html=a.mod.view();
  assert.match(html,/class="gcm-count-layout"/);
  assert.match(html,/class="gcm-category-nav"/);
  assert.match(html,/class="gcm-expiry-ruler"/);
  assert.match(html,/data-gcm-nav-section="EMPANADAS"/);
  assert.match(html,/data-gcm-nav-section="SALSAS"/);
  assert.match(html,/data-gcm-nav-section="AGUAS"/);
  assert.doesNotMatch(html,/data-gcm-nav-section="HELADOS"/,'categorías ocultas no deben aparecer en el lateral');
  assert.doesNotMatch(html,/data-gcm-nav-extras="consumption"/);
  assert.match(html,/data-gcm-nav-extras="waste"/);
  for(let n=1;n<=4;n++)assert.match(html,new RegExp('gcm-expiry-ruler-date[^>]*><b>Vto '+n+'<'));
  assert.ok(html.indexOf('data-gcm-nav-section="EMPANADAS"')<html.indexOf('data-gcm-nav-section="SALSAS"'));
  assert.ok(html.indexOf('data-gcm-nav-section="SALSAS"')<html.indexOf('data-gcm-nav-section="AGUAS"'));
  assert.equal(a.calls.length,1);
  assert.equal(a.calls[0].name,'gestlok_'+loc+'_conteo_state');
 });
}

test('Navegar por categoría abre su cuadro y se desplaza sin guardar ni modificar cantidades',async()=>{
 const a=mount('munro');a.mod.view();await tick();
 let navigated=0;
 const section={dataset:{gcmSection:'SALSAS'},open:false,scrollIntoView:()=>{navigated++;}};
 const root={
  classList:{remove:()=>{}},
  querySelectorAll:(sel)=>sel.includes('.gcm-count-main .gcm-section')?[section]:[],
  querySelector:()=>null
 };
 const button={dataset:{gcmNavSection:'SALSAS'},hasAttribute:x=>x==='data-gcm-nav-section',closest:x=>x==='button'?button:null};
 const e={target:{closest:x=>x==='.gcm-page'?root:x==='button'?button:null}};
 const clicks=a.events.get('click');
 assert.equal(typeof clicks,'function');
 await clicks(e);
 assert.equal(section.open,true);
 assert.equal(navigated,1);
 assert.equal(a.calls.length,1,'el cambio de categoría no escribe ni recarga los datos');
 const html=a.mod.view();
 assert.match(html,/data-gcm-section="SALSAS" open/);
});

test('Desplazamiento horizontal de una categoría mantiene alineadas las fechas del encabezado y los demás cuadros',()=>{
 const a=mount('torcuato');
 let x=0;
 const ruler={scrollLeft:0};
 const other={scrollLeft:0};
 const source={scrollLeft:438,matches:s=>s.includes('.gcm-sheet-scroll'),closest:()=>({querySelectorAll:()=>[source,ruler,other]})};
 a.events.get('scroll')({target:source});
 assert.equal(ruler.scrollLeft,438);
 assert.equal(other.scrollLeft,438);
});

test('Estilos conservan columna lateral izquierda, fecha fija y controles grandes en tablet y PC',()=>{
 assert.match(css,/\.gcm-count-screen \.gcm-count-layout\{[\s\S]*?display:grid/);
 assert.match(css,/\.gcm-count-screen \.gcm-category-nav\{[\s\S]*?position:sticky/);
 assert.match(css,/\.gcm-count-screen \.gcm-expiry-ruler\{[\s\S]*?position:sticky/);
 assert.match(css,/\.gcm-count-screen \.gcm-expiry-ruler-grid\{[\s\S]*?repeat\(4,216px\)/);
 assert.match(css,/min-width:1110px/);
 assert.match(css,/@media\(max-width:640px\)/);
 assert.match(css,/is-category-nav-open \.gcm-category-nav/);
});

test('Corrección 16/11: fechas aparecen una sola vez; el encabezado repetido queda oculto',async()=>{
 const a=mount('munro');
 a.mod.view();await tick();
 const html=a.mod.view();
 assert.match(html,/gcm-expiry-ruler-grid/);
 assert.match(html,/<thead class="gcm-repeat-head">/);
 assert.match(css,/\.gcm-count-screen \.gcm-count-main \.gcm-section \.gcm-sheet-scroll thead\.gcm-repeat-head\{\s*display:none!important/);
 assert.match(html,/class="gcm-count-data-table"/);
 assert.match(html,/<colgroup><col class="gcm-col-product">/);
 assert.match(css,/table\.gcm-count-data-table\{\s*table-layout:fixed!important/);
});
test('Categorías quedan apiladas en lateral izquierdo también en tablet vertical',()=>{
 assert.match(css,/@media \(min-width:350px\) and \(max-width:640px\)\{/);
 assert.match(css,/\.gcm-count-screen \.gcm-count-layout\{\s*display:grid!important/);
 assert.match(css,/grid-template-columns:clamp\(104px,24vw,140px\) minmax\(0,1fr\)!important/);
 assert.match(css,/\.gcm-count-screen \.gcm-category-toggle\{display:none!important\}/);
 assert.match(css,/\.gcm-count-screen \.gcm-category-nav\{\s*display:block!important;\s*position:sticky!important/);
 assert.match(css,/\.gcm-count-screen \.gcm-category-nav-items\{\s*flex-direction:column!important/);
});
for(const local of ['munro','torcuato']){
 test('Decomiso '+local+': checkbox guarda y muestra columna amarilla accesible al comienzo de cada fila',async()=>{
  const a=mount(local);
  a.mod.view();await tick();
  assert.doesNotMatch(a.mod.view(),/gcm-expiry-ruler-decomiso/);
  const input={id:'gcm-decomiso-toggle',checked:true,closest:sel=>sel==='.gcm-page'?{}:null};
  await a.events.get('change')({target:input});
  const html=a.mod.view();
  assert.match(html,/id="gcm-decomiso-toggle" checked/);
  assert.match(html,/class="gcm-count-data-table has-decomiso"/);
  assert.ok(html.indexOf('gcm-expiry-ruler-decomiso')<html.indexOf('gcm-expiry-ruler-date'));
  const head=html.slice(html.indexOf('<thead class="gcm-repeat-head">'),html.indexOf('</thead>')+8);
  assert.ok(head.indexOf('>Decomiso</th>')<head.indexOf('Vto 1'));
  const save=a.calls.find(c=>c.name==='gestlok_'+local+'_conteo_decomiso_visible');
  assert.ok(save,'no guardó el cambio de Decomiso en el RPC local');
  assert.equal(save.args.p_visible,true);
  assert.match(css,/\.gcm-count-screen \.gcm-decomp-cell\{/);
  input.checked=false;
  await a.events.get('change')({target:input});
  assert.doesNotMatch(a.mod.view(),/gcm-expiry-ruler-decomiso/);
  assert.ok(a.calls.some(c=>c.name==='gestlok_'+local+'_conteo_decomiso_visible'&&c.args.p_visible===false));
 });
}

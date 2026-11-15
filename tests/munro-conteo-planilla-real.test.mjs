import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../public/stock/mi-gusto-conteo.js',import.meta.url),'utf8');
function makeApp(){
 const events=[],window={};
 const document={addEventListener:(t,f)=>events.push([t,f]),querySelector:()=>null};
 vm.runInNewContext(source,{window,document,navigator:{onLine:true},Intl,Date,Promise,Set,Map,Object,JSON,Number,String,Math,console});
 const mod=window.GestLokMunroConteo;
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const v=k=>parts.find(x=>x.type===k).value;
 const today=v('year')+'-'+v('month')+'-'+v('day');
 window.GestLokSupabase={rpc:async()=>({error:null,data:{
  products:[{id:'mt',section:'EMPANADAS',name:'MT',active:true,units_per_chapa:27,position:102}],
  counts:[{day:today,shift:'manana_entrada',data:{mt:{v1:{chapas:2,sueltas:16,qty:0}}},decomiso:{},decomiso_visible:false,responsable:'Cami',status:'borrador',consumption:[],waste:[]}],
  history:[]
 }})};
 mod.attach({S:{me:{tenant_id:'cb0dc04a-9a13-434f-a3d0-47f1d8f39670'},local:'munro',view:'conteo-munro',ro:false,offline:false},
  miRol:()=> 'gerente',misLocales:()=>['munro'],render:()=>{},toast:()=>{}});
 return {mod};
}
test('planilla real: chapas y unidades sueltas comparten una casilla y 27 por chapa',async()=>{
 const {mod}=makeApp();
 mod.view();await new Promise(r=>setImmediate(r));const html=mod.view();
 assert.match(html,/class="gcm-inline-count"/);
 assert.match(html,/data-gcm-plus="mt" data-idx="1"/);
 assert.match(html,/data-gcm-suelta-plus="mt" data-idx="1"/);
 assert.match(html,/data-gcm-suelta-minus="mt" data-idx="1"/);
 assert.match(html,/data-gcm-suelta="mt" data-idx="1" value="16"/);
 assert.match(html,/data-gcm-suelta="mt"/);
 assert.match(html,/class="gcm-total">70<\/td>/);
 assert.doesNotMatch(html,/gcm-cell-total/);
});
test('planilla real: encabezados Vto 1-4 con las fechas del turno mañana entrada',async()=>{
 const {mod}=makeApp();
 mod.view();await new Promise(r=>setImmediate(r));const html=mod.view();
 for(let n=1;n<=4;n++)assert.match(html,new RegExp('>Vto '+n+'<'));
 assert.equal((html.match(/class="gcm-vto-date"/g)||[]).length,4);
});
test('las cinco marcas forman un cuadrado con diagonal, no una sola chapa',()=>{
 const {mod}=makeApp();
 assert.equal((mod._test.marks(4).match(/<path /g)||[]).length,4);
 assert.equal((mod._test.marks(5).match(/<path /g)||[]).length,5);
 assert.match(mod._test.marks(5),/M5 30L29 4/);
});


test('códigos de producto en una sola columna alineada a la izquierda',async()=>{
 const {mod}=makeApp();mod.view();await new Promise(r=>setImmediate(r));const html=mod.view();
 assert.match(html,/<th scope="col" class="gcm-product-head">Producto<\/th>/);
 assert.match(html,/<th scope="row" class="gcm-product-cell"><span class="gcm-product-name">MT<\/span>/);
 const css=fs.readFileSync(new URL('../app/mi-gusto-conteo.css',import.meta.url),'utf8');
 assert.match(css,/th\.gcm-product-cell/);
 assert.match(css,/text-align:left/);
 assert.match(css,/height:48px/);
});

test('Conteo usa botones fijos y filas separadas para evitar pulsaciones cruzadas',async()=>{
 const {mod}=makeApp();mod.view();await new Promise(r=>setImmediate(r));
 const html=mod.view();
 assert.match(html,/class="gcm-chapas-stepper"/);
 assert.match(html,/class="gcm-units-stepper"/);
 assert.match(html,/data-gcm-suelta-minus="mt"/);
 assert.match(html,/data-gcm-suelta-plus="mt"/);
 const css=fs.readFileSync(new URL('../app/mi-gusto-conteo.css',import.meta.url),'utf8');
 assert.match(css,/border-spacing:0 7px/);
 assert.match(css,/grid-template-rows:42px 42px/);
 assert.match(css,/height:124px/);
});

test('sumar chapa no vuelve a dibujar la pantalla y guarda el valor preciso',async()=>{
 const events=[],renders=[],writes=[],window={};
 const total={textContent:''},unitValue={textContent:''},chapasValue={textContent:''},visual={innerHTML:''};
 const unitMinus={disabled:false},saveStatus={textContent:'',className:''};
 const markButton={title:'',querySelector:(s)=>({'.gcm-mark-visual':visual,'.gcm-chapas-value':chapasValue}[s]||null)};
 const td={dataset:{},querySelector:(s)=>({'.gcm-mark-button':markButton,'.gcm-units-value':unitValue,'.gcm-unit-minus':unitMinus,'.gcm-cell-save':saveStatus}[s]||null),
  closest:(s)=>s==='tr'?{querySelector:()=>total}:null};
 const button={dataset:{gcmPlus:'mt',idx:'1'},hasAttribute:(s)=>s==='data-gcm-plus',
  closest:(s)=>({'.gcm-page':{},button,td}[s]||null)};
 const document={addEventListener:(s,fn)=>events.push([s,fn]),querySelector:()=>null};
 vm.runInNewContext(source,{window,document,navigator:{onLine:true},Intl,Date,Promise,Set,Map,Object,JSON,Number,String,Math,console});
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const get=k=>parts.find(p=>p.type===k).value;
 const day=get('year')+'-'+get('month')+'-'+get('day');
 window.GestLokSupabase={rpc:async(name,args)=>{
  if(name==='gestlok_munro_conteo_set_cell'){writes.push(args);return {error:null,data:{}};}
  return {error:null,data:{products:[{id:'mt',name:'MT',section:'EMPANADAS',active:true,units_per_chapa:27}],
   counts:[{day,shift:'manana_entrada',data:{mt:{v1:{chapas:2,sueltas:16,qty:0}}},status:'borrador'}],history:[]}};
 }};
 const mod=window.GestLokMunroConteo;
 mod.attach({S:{me:{tenant_id:'cb0dc04a-9a13-434f-a3d0-47f1d8f39670'},local:'munro',view:'conteo-munro',ro:false,offline:false},
  miRol:()=> 'gerente',misLocales:()=>['munro'],render:()=>renders.push('render'),toast:()=>{}});
 mod.view();await new Promise(r=>setImmediate(r));
 const before=renders.length;
 await events.find(([name])=>name==='click')[1]({target:button});
 await new Promise(r=>setImmediate(r));
 assert.equal(renders.length,before,'La pantalla no debe re-renderizarse por sumar una chapa');
 assert.equal(chapasValue.textContent,'3');
 assert.equal(unitValue.textContent,'16 u.');
 assert.equal(total.textContent,'97');
 assert.equal(saveStatus.textContent,'✓ Guardado');
 assert.equal(writes.at(-1)?.p_chapas,3);
 assert.equal(writes.at(-1)?.p_sueltas,16);
 // Los botones de unidades trabajan en la misma casilla, sin abrir teclado ni perder posición.
 button.dataset={gcmSueltaPlus:'mt',idx:'1'};
 button.hasAttribute=(s)=>s==='data-gcm-suelta-plus';
 await events.find(([name])=>name==='click')[1]({target:button});
 await new Promise(r=>setImmediate(r));
 assert.equal(unitValue.textContent,'17 u.');
 assert.equal(total.textContent,'98');
 assert.equal(writes.at(-1)?.p_sueltas,17);
 button.dataset={gcmSueltaMinus:'mt',idx:'1'};
 button.hasAttribute=(s)=>s==='data-gcm-suelta-minus';
 await events.find(([name])=>name==='click')[1]({target:button});
 await new Promise(r=>setImmediate(r));
 assert.equal(unitValue.textContent,'16 u.');
 assert.equal(total.textContent,'97');
 assert.equal(writes.at(-1)?.p_sueltas,16);
 assert.equal(saveStatus.textContent,'✓ Guardado');
 assert.equal(renders.length,before,'Ningún cambio de unidades debe redibujar la página');
});

test('recuperación permite seleccionar el día anterior sin convertirlo al día actual',async()=>{
 const {mod}=makeApp();
 mod.view();await new Promise(r=>setImmediate(r));
 const html=mod.view();
 assert.match(html,/data-gcm-day="ayer"/);
 assert.match(html,/data-gcm-manual-save/);
 assert.match(html,/Recuperar conteo de ayer/);
 assert.doesNotMatch(source,/day!==arDay\(\)\s*&&\s*!busy/);
 assert.doesNotMatch(source,/window\.addEventListener\('focus'/);
});

test('se guardan valores numéricos sin cerrar el teclado ni reiniciar la tabla',async()=>{
 const {mod}=makeApp();
 mod.view();await new Promise(r=>setImmediate(r));
 assert.match(source,/document\.addEventListener\('input',/);
 assert.match(source,/saveCellFeedback\(input,task\)/);
 assert.match(source,/input\.hasAttribute\('data-gcm-qty'\)\|\|input\.hasAttribute\('data-gcm-decomp-qty'\)\)return/);
 assert.match(source,/data-gcm-manual-save/);
 assert.match(source,/gestlok_munro_conteo_state',\{p_day:day\}/);
 assert.match(source,/JSON\.stringify\(\[\.\.\.pendingDrafts\.values\(\)\]\)/);
 const css=fs.readFileSync(new URL('../app/mi-gusto-conteo.css',import.meta.url),'utf8');
 assert.match(css,/gcm-day-bar/);
 assert.match(css,/gcm-save-bar/);
});

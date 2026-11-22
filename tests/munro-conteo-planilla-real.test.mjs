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
 const total={textContent:''},unitValue={value:''},chapasValue={textContent:''},visual={innerHTML:''};
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
 assert.equal(unitValue.value,'16');
 assert.equal(total.textContent,'97');
 assert.equal(saveStatus.textContent,'✓ Guardado');
 assert.equal(writes.at(-1)?.p_chapas,3);
 assert.equal(writes.at(-1)?.p_sueltas,16);
 // Los botones de unidades trabajan en la misma casilla, sin abrir teclado ni perder posición.
 button.dataset={gcmSueltaPlus:'mt',idx:'1'};
 button.hasAttribute=(s)=>s==='data-gcm-suelta-plus';
 await events.find(([name])=>name==='click')[1]({target:button});
 await new Promise(r=>setImmediate(r));
 assert.equal(unitValue.value,'17');
 assert.equal(total.textContent,'98');
 assert.equal(writes.at(-1)?.p_sueltas,17);
 button.dataset={gcmSueltaMinus:'mt',idx:'1'};
 button.hasAttribute=(s)=>s==='data-gcm-suelta-minus';
 await events.find(([name])=>name==='click')[1]({target:button});
 await new Promise(r=>setImmediate(r));
 assert.equal(unitValue.value,'16');
 assert.equal(total.textContent,'97');
 assert.equal(writes.at(-1)?.p_sueltas,16);
 assert.equal(saveStatus.textContent,'✓ Guardado');
 assert.equal(renders.length,before,'Ningún cambio de unidades debe redibujar la página');
});

test('la recuperación queda solo en Historial y el conteo no cambia de día automáticamente',async()=>{
 const {mod}=makeApp();
 mod.view();await new Promise(r=>setImmediate(r));
 const html=mod.view();
 assert.doesNotMatch(html,/data-gcm-day=/);
 assert.doesNotMatch(html,/Recuperar conteo de ayer/);
 assert.match(html,/data-gcm-history-open/);
 assert.match(html,/data-gcm-manual-save/);
 assert.match(html,/gcm-header-fields-compact/);
 assert.doesNotMatch(html,/class="gcm-day-bar"/);
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
 assert.match(source,/gestlok_munro_conteo_state',\{p_day:d\}/);
 assert.match(source,/JSON\.stringify\(\[\.\.\.pendingDrafts\.values\(\)\]\)/);
 const css=fs.readFileSync(new URL('../app/mi-gusto-conteo.css',import.meta.url),'utf8');
 assert.match(css,/gcm-header-compact/);
 assert.match(css,/gcm-save-bar/);
});

test('Conteo muestra las cuatro fechas dentro de cada planilla, sin pestañas separadas',async()=>{
 const {mod}=makeApp();mod.view();await new Promise(r=>setImmediate(r));
 const html=mod.view();
 assert.doesNotMatch(html,/class="gcm-expiry-tabs"/);
 assert.doesNotMatch(html,/data-gcm-vto=/);
 for(let n=1;n<=4;n++){
  assert.match(html,new RegExp('data-gcm-idx="'+n+'"'));
  assert.match(html,new RegExp('Vto '+n));
 }
 const header=html.slice(html.indexOf('<thead class="gcm-repeat-head">'),html.indexOf('</thead>')+8);
 assert.ok(header.includes('>Producto</th>'));
 for(let n=1;n<=4;n++)assert.ok(header.indexOf('Vto '+n)>header.indexOf('>Producto</th>'));
 assert.ok(header.indexOf('Vto 1')<header.indexOf('Vto 2'));
 assert.ok(header.indexOf('Vto 2')<header.indexOf('Vto 3'));
 assert.ok(header.indexOf('Vto 3')<header.indexOf('Vto 4'));
 assert.ok(header.indexOf('>Total</th>')>header.indexOf('Vto 4'));
 const css=fs.readFileSync(new URL('../app/mi-gusto-conteo.css',import.meta.url),'utf8');
 assert.match(css,/CONTEO · 4 VENCIMIENTOS A LA VISTA/);
 assert.match(css,/\.gcm-vto-col:not\(\.is-current-vto\)\{[\s\S]*?display:table-cell!important/);
 assert.match(css,/overflow-x:auto!important/);
 assert.match(css,/position:sticky!important;left:0!important/);
});
test('contar no cambia de fecha ni reconstruye la página y no hay selector superior',async()=>{
 assert.doesNotMatch(source,/const nextVto=el\.dataset\.gcmVto/);
 assert.doesNotMatch(source,/data-gcm-vto=/);
 assert.match(source,/syncCountDom\(el,p,i,isDecomp\)/);
 assert.match(source,/saveCellFeedback\(el,task\)/);
 assert.match(source,/dates\.map\(/);
 assert.match(source,/gestlok_munro_conteo_set_cell/);
});
test('productos sin chapas usan filas compactas y botones claros en lugar de raya aislada',async()=>{
 const htmlSource=source;
 assert.match(htmlSource,/function numericCompacta\(/);
 assert.match(htmlSource,/class="gcm-qty-stepper"/);
 assert.match(htmlSource,/data-gcm-qty-plus/);
 assert.match(htmlSource,/data-gcm-qty-minus/);
 assert.match(htmlSource,/gcm-qty-row/);
 assert.doesNotMatch(htmlSource,/placeholder="—"\+disabled\+' aria-label="Cantidad/);
 const css=fs.readFileSync(new URL('../app/mi-gusto-conteo.css',import.meta.url),'utf8');
 assert.match(css,/FILAS COMPACTAS SIN CHAPAS/);
 assert.match(css,/tr\.gcm-qty-row > td\{/);
 assert.match(css,/height:94px!important/);
 assert.match(css,/height:108px!important/);
});

test('botones + y − en bebidas guardan el valor sin re-render ni cambiar de fila',async()=>{
 const events=[],renders=[],writes=[],window={};
 const total={textContent:''},qtyInput={value:'6'},saveStatus={textContent:'',className:''},minus={disabled:false};
 const row={querySelector:(s)=>s==='.gcm-total'?total:null};
 const td={dataset:{},querySelector:(s)=>({'.gcm-qty':qtyInput,'.gcm-qty-minus':minus,'.gcm-cell-save':saveStatus}[s]||null),
  closest:(s)=>s==='tr'?row:null};
 const root={};
 const button={dataset:{gcmQtyPlus:'agua',idx:'1'},hasAttribute:(s)=>s==='data-gcm-qty-plus',
  closest:(s)=>s==='button'?button:s==='td'?td:s==='.gcm-page'?root:null};
 const document={addEventListener:(name,fn)=>events.push([name,fn]),querySelector:()=>null};
 vm.runInNewContext(source,{window,document,navigator:{onLine:true},Intl,Date,Promise,Set,Map,Object,JSON,Number,String,Math,console});
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const get=k=>parts.find(p=>p.type===k).value,day=get('year')+'-'+get('month')+'-'+get('day');
 window.GestLokSupabase={rpc:async(name,args)=>{
  if(name==='gestlok_munro_conteo_set_cell'){writes.push(args);return {error:null,data:{}};}
  return {error:null,data:{products:[{id:'agua',name:'Agua 500 cc',section:'AGUAS',active:true,units_per_chapa:0}],
   counts:[{day,shift:'manana_entrada',data:{agua:{v1:{qty:6,chapas:0,sueltas:0}}},status:'borrador'}],history:[]}};
 }};
 const mod=window.GestLokMunroConteo;
 mod.attach({S:{me:{tenant_id:'cb0dc04a-9a13-434f-a3d0-47f1d8f39670'},local:'munro',view:'conteo-munro',ro:false,offline:false},
  miRol:()=> 'gerente',misLocales:()=>['munro'],render:()=>renders.push('render'),toast:()=>{}});
 mod.view();await new Promise(r=>setImmediate(r));
 const html=mod.view();
 assert.match(html,/class="gcm-qty-row"/);
 assert.match(html,/data-gcm-qty-plus="agua" data-idx="1"/);
 assert.match(html,/data-gcm-qty-minus="agua" data-idx="1"/);
 assert.match(html,/data-gcm-qty="agua" data-idx="1" value="6"/);
 const before=renders.length,click=events.find(([type])=>type==='click')[1];
 await click({target:button});
 await new Promise(r=>setImmediate(r));
 assert.equal(renders.length,before);
 assert.equal(qtyInput.value,'7');
 assert.equal(total.textContent,'7');
 assert.equal(saveStatus.textContent,'✓ Guardado');
 assert.equal(writes.at(-1)?.p_qty,7);
 button.dataset={gcmQtyMinus:'agua',idx:'1'};
 button.hasAttribute=(s)=>s==='data-gcm-qty-minus';
 await click({target:button});
 await new Promise(r=>setImmediate(r));
 assert.equal(qtyInput.value,'6');
 assert.equal(total.textContent,'6');
 assert.equal(writes.at(-1)?.p_qty,6);
 assert.equal(renders.length,before);
});

test('teclado numérico abierto no bloquea el gesto vertical de la planilla',()=>{
 const css=fs.readFileSync(new URL('../app/mi-gusto-conteo.css',import.meta.url),'utf8');
 const fix=css.slice(css.lastIndexOf('/* Conteo · desplazamiento vertical con teclado numérico abierto.'));
 assert.ok(fix,'Debe existir la corrección de scroll para Conteo');
 assert.match(fix,/\.gcm-page \.gcm-section\s*\{\s*overflow:visible!important/);
 assert.match(fix,/\.gcm-page \.gcm-section \.gcm-sheet-scroll\s*\{[\s\S]*?overflow-x:auto!important;[\s\S]*?overflow-y:auto!important/);
 assert.match(fix,/overscroll-behavior-y:auto!important/);
 assert.match(fix,/touch-action:pan-x pan-y pinch-zoom!important/);
 assert.match(fix,/\.gcm-page input\[type="number"\]\s*\{\s*touch-action:pan-y pinch-zoom!important/);
 assert.doesNotMatch(fix,/overflow-y:hidden/);
 // Durante el tipeo, el componente se actualiza por casilla sin reemplazar la pantalla.
 assert.match(source,/document\.addEventListener\('input',/);
 assert.match(source,/syncCountDom\(input,p,i,isDecomp\)/);
 assert.match(source,/saveCellFeedback\(input,task\)/);
 assert.doesNotMatch(source,/window\.addEventListener\('focus'/);
});

test('hoja de carga: metadatos compactos sin botones de turnos; Historial conserva accesos',async()=>{
 const {mod}=makeApp();mod.view();await new Promise(r=>setImmediate(r));
 const html=mod.view();
 assert.match(html,/class="gcm-page gcm-count-screen"/);
 assert.match(html,/class="gcm-header gcm-header-compact"/);
 assert.match(html,/class="gcm-header-fields gcm-header-fields-compact"/);
 assert.match(html,/<span>Local<\/span><strong>Munro<\/strong>/);
 assert.match(html,/class="gcm-finalize-responsable" for="gcm-responsable"/);
 assert.match(html,/class="gcm-field-fecha"><span>Fecha<\/span>/);
 assert.doesNotMatch(html,/gcm-day-bar|Recuperar conteo|data-gcm-day=/);
 assert.doesNotMatch(html,/data-gcm-shift=|<nav class="gcm-tabs"/);
 assert.doesNotMatch(html,/Cerrar turno · Mañana|Cerrar turno · Noche/);
 assert.match(html,/data-gcm-history-open/);
 assert.match(html,/data-gcm-finalize/);
 const css=fs.readFileSync(new URL('../app/mi-gusto-conteo.css',import.meta.url),'utf8');
 assert.match(css,/Munro · hoja de carga enfocada en contar/);
 assert.match(css,/\.gcm-count-screen \.gcm-header-fields-compact/);
 assert.match(css,/@media\(max-width:430px\)/);
 // El avance sigue fijado por siguiente turno y no depende de pulsar pestañas.
 assert.match(source,/nextTurn\(currentDay,currentShift\)/);
 assert.doesNotMatch(source,/const newShift=el\.dataset\.gcmShift/);
});


for(const local of ['munro','torcuato']){
 test('Conteo '+local+': el cero se muestra como placeholder, sin valor numérico escrito',async()=>{
  const window={},events=new Map(),writes=[],renders=[];
  const document={addEventListener:(name,fn)=>events.set(name,fn),querySelector:()=>null};
  vm.runInNewContext(source,{window,document,navigator:{onLine:true},Intl,Date,Promise,Set,Map,Object,JSON,Number,String,Math,console});
  const dateParts=new Intl.DateTimeFormat('en-GB',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const get=k=>dateParts.find(x=>x.type===k).value;
  const today=get('year')+'-'+get('month')+'-'+get('day');
  const state={
   products:[
    {id:'agua',section:'AGUAS',name:'Agua',active:true,units_per_chapa:0,position:1},
    {id:'ac',section:'EMPANADAS',name:'AC',active:true,units_per_chapa:30,position:2}
   ],
   counts:[{
    day:today,shift:'manana_entrada',status:'borrador',responsable:'Cami',
    data:{agua:{v1:{qty:0},v2:{qty:16}},ac:{v1:{chapas:0,sueltas:0}}},
    decomiso:{agua:{qty:0},ac:{chapas:0,sueltas:0}},decomiso_visible:true,
    consumption:[],waste:[]
   }],history:[]
  };
  window.GestLokSupabase={rpc:async(name,args)=>{
   if(name==='gestlok_'+local+'_conteo_state')return {error:null,data:state};
   writes.push({name,args});return {error:null,data:{}};
  }};
  const mod=window.GestLokMunroConteo;
  mod.attach({S:{me:{tenant_id:'cb0dc04a-9a13-434f-a3d0-47f1d8f39670'},local,view:'conteo-munro',ro:false,offline:false},
   miRol:()=> 'gerente',misLocales:()=>[local],render:()=>renders.push('render'),toast:()=>{}});
  mod.view();
  await new Promise(resolve=>setImmediate(resolve));
  const html=mod.view();
  assert.match(html,/data-gcm-qty="agua" data-idx="1" value="" placeholder="0"/);
  assert.match(html,/data-gcm-qty="agua" data-idx="2" value="16" placeholder="0"/);
  assert.match(html,/data-gcm-decomp-qty="agua" value="" placeholder="0"/);
  assert.match(html,/data-gcm-suelta="ac" data-idx="1" value="" placeholder="0"/);
  assert.match(html,/data-gcm-decomp-suelta="ac" value="" placeholder="0"/);
  const initialRenderCount=renders.length;
  const enter=async(attribute,pid,idx,value)=>{
   const input={value,hasAttribute:key=>key===attribute,matches:()=>true,
    dataset:{idx:String(idx),
     gcmQty:attribute==='data-gcm-qty'?pid:undefined,
     gcmDecompQty:attribute==='data-gcm-decomp-qty'?pid:undefined,
     gcmSuelta:attribute==='data-gcm-suelta'?pid:undefined,
     gcmDecompSuelta:attribute==='data-gcm-decomp-suelta'?pid:undefined},
    closest:selector=>selector==='.gcm-page'?{}:null};
   events.get('input')({target:input});
   await new Promise(resolve=>setImmediate(resolve));
  };
  await enter('data-gcm-qty','agua',1,'1');
  assert.equal(writes.at(-1)?.args.p_qty,1,'escribir 1 no debe guardar 10');
  await enter('data-gcm-qty','agua',1,'16');
  assert.equal(writes.at(-1)?.args.p_qty,16,'escribir 16 no debe guardar 160');
  await enter('data-gcm-suelta','ac',1,'1');
  assert.equal(writes.at(-1)?.args.p_sueltas,1);
  await enter('data-gcm-decomp-qty','agua',0,'16');
  assert.equal(writes.at(-1)?.args.p_qty,16);
  await enter('data-gcm-decomp-suelta','ac',0,'1');
  assert.equal(writes.at(-1)?.args.p_sueltas,1);
  assert.equal(writes.length,5,'las cinco entradas se guardan una sola vez');
  assert.ok(writes.every(w=>w.name.startsWith('gestlok_'+local+'_conteo_')),'sin escrituras a otra sucursal');
  assert.equal(renders.length,initialRenderCount,'no redibujar mientras se escribe');
 });
}


for(const local of ['munro','torcuato']){
 test('SALSAS · Caja Palito: una caja suma 45 unidades en '+local+' y no redibuja la planilla',async()=>{
  const handlers=new Map(),writes=[],renders=[];
  const window={};
  const document={addEventListener:(name,fn)=>handlers.set(name,fn),querySelector:()=>null};
  vm.runInNewContext(source,{window,document,navigator:{onLine:true},Intl,Date,Promise,Set,Map,WeakMap,Object,Array,String,Number,JSON,Math,console});
  const dateParts=new Intl.DateTimeFormat('en-GB',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const f=k=>dateParts.find(x=>x.type===k).value;
  const day=f('year')+'-'+f('month')+'-'+f('day');
  const product={id:'c2-palito-45',name:'Caja Palito',section:'SALSAS',units_per_chapa:45,active:true,position:210};
  window.GestLokSupabase={rpc:async(name,args)=>{
   if(name==='gestlok_'+local+'_conteo_state')return {data:{products:[product],counts:[{day,shift:'manana_entrada',status:'borrador',data:{},decomiso:{},decomiso_visible:false,consumption:[],waste:[]}],history:[],settings:{locked:true,hidden_sections:[]}},error:null};
   writes.push({name,args});return {data:{ok:true},error:null};
  }};
  const mod=window.GestLokMunroConteo;
  mod.attach({S:{me:{tenant_id:'cb0dc04a-9a13-434f-a3d0-47f1d8f39670'},local,view:'conteo-munro',ro:false,offline:false},
   miRol:()=> 'gerente',misLocales:()=>[local],render:()=>renders.push('render'),toast:()=>{}});
  mod.view();await new Promise(resolve=>setImmediate(resolve));
  const before=mod.view();
  assert.match(before,/Caja Palito/);
  assert.match(before,/aria-label="Sumar caja Caja Palito del vencimiento 1"/);
  assert.match(before,/title="0 cajas · tocar para sumar"/);
  const renderCount=renders.length;
  const button={dataset:{gcmPlus:'c2-palito-45',idx:'1'},hasAttribute:x=>x==='data-gcm-plus',
   closest:x=>x==='td'?null:null};
  const target={closest:x=>x==='.gcm-page'?{}:x==='button'?button:null};
  await handlers.get('click')({target,preventDefault(){}});
  await new Promise(resolve=>setImmediate(resolve));
  const write=writes.find(x=>x.name==='gestlok_'+local+'_conteo_set_cell');
  assert.ok(write);
  assert.equal(write.args.p_chapas,1);
  assert.equal(write.args.p_sueltas,0);
  assert.equal(write.args.p_qty,0);
  assert.match(mod.view(),/class="gcm-total">45<\/td>/);
  assert.match(mod.view(),/title="1 caja · tocar para sumar"/);
  assert.equal(renders.length,renderCount,'Guardar no debe reconstruir pantalla de Conteo');
  assert.ok(writes.every(x=>x.name.startsWith('gestlok_'+local+'_conteo_')));
 });
}


for(const local of ['munro','torcuato']){
 test('Consumo '+local+': Mañana salida muestra 3 filas, permite agregar una y guarda sin redibujar',async()=>{
  const events=new Map(),writes=[],renders=[],window={};
  let focusCount=0;
  const todayParts=new Intl.DateTimeFormat('en-GB',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const get=k=>todayParts.find(x=>x.type===k).value;
  const day=get('year')+'-'+get('month')+'-'+get('day');
  const initialRows=[];
  const counts=[
   {day,shift:'manana_entrada',status:'finalizado',data:{},consumption:[],waste:[]},
   {day,shift:'manana_salida',status:'borrador',data:{},consumption:initialRows,waste:[]}
  ];
  const document={addEventListener:(type,fn)=>events.set(type,fn),querySelector:()=>null};
  vm.runInNewContext(source,{window,document,navigator:{onLine:true},Intl,Date,Promise,Set,Map,WeakMap,Object,Array,String,Number,JSON,Math,console});
  window.GestLokSupabase={rpc:async(name,args)=>{
   if(name==='gestlok_'+local+'_conteo_state')return {data:{products:[{id:'a',name:'AC',section:'EMPANADAS',active:true,units_per_chapa:30,position:1}],counts,history:[],settings:{locked:true,hidden_sections:[]}},error:null};
   writes.push({name,args});return {data:{ok:true},error:null};
  }};
  const mod=window.GestLokMunroConteo;
  mod.attach({S:{me:{tenant_id:'cb0dc04a-9a13-434f-a3d0-47f1d8f39670'},local,view:'conteo-munro',ro:false,offline:false},
   miRol:()=> 'gerente',misLocales:()=>[local],render:()=>renders.push(true),toast:()=>{}});
  mod.view();await new Promise(resolve=>setImmediate(resolve));
  const first=mod.view();
  const section=first.match(/<section class="gcm-extras" data-gcm-kind="consumption">[\s\S]*?<\/section>/)?.[0];
  assert.ok(section,'Consumo visible en turno Mañana salida');
  assert.equal((section.match(/data-field="name"/g)||[]).length,3);
  assert.match(section,/data-gcm-extra-add="consumption"/);
  const tbody={rows:[{},{},{}],insertAdjacentHTML(where,html){
    assert.equal(where,'beforeend');this.rows.push(html);
   },querySelectorAll(sel){return sel==='tr'?this.rows:[];},lastElementChild:{querySelector:()=>({focus:()=>{focusCount++;}})}};
  const root={querySelector:sel=>sel==='.gcm-extras[data-gcm-kind="consumption"] tbody'?tbody:null};
  const button={dataset:{gcmExtraAdd:'consumption'},disabled:false,hasAttribute:attr=>attr==='data-gcm-extra-add'};
  const target={closest:sel=>sel==='.gcm-page'?root:sel==='button'?button:null};
  const previousRenders=renders.length;
  await events.get('click')({target,preventDefault(){}});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(tbody.rows.length,4);
  assert.equal(focusCount,1);
  assert.equal(renders.length,previousRenders,'Agregar una fila no reconstruye Conteo');
  const firstWrite=writes.at(-1);
  assert.equal(firstWrite?.name,'gestlok_'+local+'_conteo_set_extra');
  assert.equal(firstWrite?.args.p_shift,'manana_salida');
  assert.equal(firstWrite?.args.p_kind,'consumption');
  assert.equal(firstWrite?.args.p_items.length,4);
  const second=mod.view();
  const secondSection=second.match(/<section class="gcm-extras" data-gcm-kind="consumption">[\s\S]*?<\/section>/)?.[0];
  assert.equal((secondSection.match(/data-field="name"/g)||[]).length,4);
  const input={value:'Caro',dataset:{gcmExtra:'consumption',row:'3',field:'name'},
   hasAttribute:attr=>attr==='data-gcm-extra',closest:sel=>sel==='.gcm-page'?root:null};
  await events.get('change')({target:input});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(writes.at(-1).args.p_items[3].name,'Caro');
  assert.equal(writes.at(-1).args.p_items.length,4);
  assert.equal(renders.length,previousRenders,'Guardar nombre no reconstruye el formulario');
  assert.ok(writes.every(w=>w.name.startsWith('gestlok_'+local+'_conteo_')));
 });
 test('Consumo '+local+': el turno Noche salida conserva 10 filas y los datos existentes nunca se ocultan',async()=>{
  const events=new Map(),window={};
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const get=k=>parts.find(x=>x.type===k).value;
  const day=get('year')+'-'+get('month')+'-'+get('day');
  const initialFive=Array.from({length:5},(_,i)=>({name:'Empleado '+(i+1),value:'1'}));
  const doc={addEventListener:(type,fn)=>events.set(type,fn),querySelector:()=>null};
  vm.runInNewContext(source,{window,document:doc,navigator:{onLine:true},Intl,Date,Promise,Set,Map,WeakMap,Object,Array,String,Number,JSON,Math,console});
  let entries=[
   {day,shift:'manana_entrada',status:'finalizado',data:{}},
   {day,shift:'manana_salida',status:'finalizado',data:{},consumption:initialFive},
   {day,shift:'noche_salida',status:'borrador',data:{},consumption:[]}
  ];
  window.GestLokSupabase={rpc:async()=>({error:null,data:{products:[{id:'a',name:'AC',section:'EMPANADAS',active:true,units_per_chapa:30}],counts:entries,history:[]}})};
  const mod=window.GestLokMunroConteo;
  mod.attach({S:{me:{tenant_id:'cb0dc04a-9a13-434f-a3d0-47f1d8f39670'},local,view:'conteo-munro',ro:false,offline:false},
   miRol:()=> 'gerente',misLocales:()=>[local],render:()=>{},toast:()=>{}});
  mod.view();await new Promise(resolve=>setImmediate(resolve));
  const html=mod.view();
  const section=html.match(/<section class="gcm-extras" data-gcm-kind="consumption">[\s\S]*?<\/section>/)?.[0];
  assert.equal((section.match(/data-field="name"/g)||[]).length,10);
  assert.doesNotMatch(section,/data-gcm-extra-add="consumption"/);
 });
}

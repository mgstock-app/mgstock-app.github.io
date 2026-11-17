import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../public/stock/mi-gusto-conteo.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../app/mi-gusto-conteo.css',import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const today=()=>{
 const p=new Intl.DateTimeFormat('en-GB',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const value=k=>p.find(x=>x.type===k).value;
 return value('year')+'-'+value('month')+'-'+value('day');
};

function mount(local,{extraEmpanadas=0}={}){
 const date=today(),drawn=[],calls=[],events=new Map(),canvases=[];
 const ctx={fillRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},
  fillText(value,x,y){drawn.push({text:String(value),x,y,font:this.font});},
  measureText:value=>({width:String(value).length*11})};
 const document={addEventListener:(type,fn)=>events.set(type,fn),querySelector:()=>null,
  createElement:type=>{
   assert.equal(type,'canvas');
   const canvas={width:0,height:0,getContext:()=>ctx,toDataURL:()=> 'data:image/png;base64,AAAA'};
   canvases.push(canvas);return canvas;
  }};
 const window={confirm:()=>true};
 vm.runInNewContext(source,{window,document,navigator:{onLine:true},
  Intl,Date,Promise,Set,Map,Math,Array,Object,Number,String,JSON,console});
 const products=[
  {id:'a',name:'AC',section:'EMPANADAS',units_per_chapa:0,active:true},
  {id:'b',name:'MT',section:'EMPANADAS',units_per_chapa:0,active:true},
  {id:'c',name:'Ketchup',section:'ADEREZOS',units_per_chapa:0,active:true}
 ];
 const data={a:{v1:{qty:local==='munro'?12:21}},b:{v2:{qty:7}},c:{v1:{qty:3}}};
 for(let i=0;i<extraEmpanadas;i++){
  const id='e'+i;
  products.push({id,name:'EMP '+String(i+1).padStart(2,'0'),section:'EMPANADAS',units_per_chapa:0,active:true});
  data[id]={v1:{qty:i+1}};
 }
 const rec={day:date,shift:'manana_entrada',status:'finalizado',responsable:'Cami',data,
  decomiso:{},decomiso_visible:false,consumption:[{name:'Empleado 1',value:'1'}],
  waste:[],waste_visible:false,hidden_sections:[]};
 window.GestLokSupabase={rpc:async(name,args)=>{
  calls.push({name,args});
  if(name==='gestlok_'+local+'_conteo_state')
   return {error:null,data:{products,counts:[rec],history:[rec],settings:{locked:true,hidden_sections:[]}}};
  if(name==='gestlok_'+local+'_conteo_history')return {error:null,data:[rec]};
  return {error:{message:'RPC inesperado: '+name}};
 }};
 const mod=window.GestLokMunroConteo;
 mod.attach({S:{me:{tenant_id:'cb0dc04a-9a13-434f-a3d0-47f1d8f39670'},local,view:'conteo-munro',ro:false,offline:false},
  miRol:()=> 'dueno',misLocales:()=>[local],render:()=>{},toast:()=>{}});
 const click=async(attr,value)=>{
  const button={hasAttribute:key=>key===attr,dataset:{}};
  const key=attr.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase());
  button.dataset[key]=value;
  const target={closest:selector=>selector==='.gcm-page'?{}:button};
  await events.get('click')({target,preventDefault(){},stopPropagation(){}});
  await tick();await tick();
 };
 return {date,mod,click,drawn,calls,canvases};
}

for(const local of ['munro','torcuato']){
 test('Resumen A4 de '+local+' agrupa rubros reales y conserva total y consumos',async()=>{
  const a=mount(local);a.mod.view();await tick();await tick();
  await a.click('data-gcm-history-open');await a.click('data-gcm-history-day',a.date);
  await a.click('data-gcm-history',a.date+'|manana_entrada');
  const html=a.mod.view(),labels=a.drawn.map(v=>v.text);
  const grand=local==='munro'?22:31;
  assert.match(html,/Productos y totales/);
  assert.match(html,/gcm-hd-summary-grid/);
  assert.match(html,/EMPANADAS/);
  assert.match(html,/ADEREZOS/);
  assert.match(html,new RegExp('Total general <strong>'+grand+'</strong>'));
  assert.ok(labels.includes('RESUMEN POR CATEGORÍA'));
  assert.ok(labels.includes('EMPANADAS'));
  assert.ok(labels.includes('ADEREZOS'));
  assert.ok(labels.includes('TOTAL GENERAL'));
  assert.ok(labels.includes(String(grand)));
  assert.ok(!labels.includes('CONSUMOS  ·  10 COLABORADORES'));
  assert.equal(a.canvases[0].width,1240);
  assert.equal(a.canvases[0].height,1754);
  assert.match(html,/Descargar imagen A4 \(PNG\)/);
  assert.ok(a.calls.every(x=>['gestlok_'+local+'_conteo_state','gestlok_'+local+'_conteo_history'].includes(x.name)));
  assert.ok(a.calls.every(x=>!x.name.includes(local==='munro'?'torcuato':'munro')));
 });
}
test('Diseño se adapta a tablet y teléfono sin inventar categorías ni totales',()=>{
 assert.match(css,/\.gcm-hd-summary-grid\{\s*display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(css,/@media\(max-width:700px\)\{\s*\.gcm-hd-summary-grid\{grid-template-columns:minmax\(0,1fr\)/);
 assert.match(source,/function historyGroupedProducts\(rec\)/);
 assert.match(source,/historyGroupedProducts\(rec\)/);
 assert.doesNotMatch(source,/section:'Cocina'|section:'Bebidas'|section:'Salsas y extras'/);
});

for(const local of ['munro','torcuato']){
 test('Historial '+local+' usa panel ancho y Empanadas muestra 26 productos sin dividir la tarjeta',async()=>{
  const a=mount(local,{extraEmpanadas:24});
  a.mod.view();await tick();await tick();
  await a.click('data-gcm-history-open');await a.click('data-gcm-history-day',a.date);
  await a.click('data-gcm-history',a.date+'|manana_entrada');
  const html=a.mod.view(),start=html.indexOf('gcm-hd-summary-group gcm-hd-empanadas');
  const finish=html.indexOf('</section>',start);
  const emp=html.slice(start,finish);
  assert.match(html,/class="gcm-page gcm-history-screen gcm-history-detail gcm-history-wide"/);
  assert.match(html,/<h2>Resumen del conteo<\/h2>/);
  assert.ok(start>0&&finish>start);
  assert.equal((emp.slice(emp.indexOf('<tbody>')).match(/<tr>/g)||[]).length,26);
  assert.match(emp,/>AC<\/strong>/);
  assert.match(emp,/>EMP 24<\/strong>/);
  assert.doesNotMatch(emp,/EMPANADAS \(cont/);
  assert.ok(html.indexOf('<section class="gcm-hd-summary"')<html.indexOf('class="gcm-hd-print"'));
  assert.doesNotMatch(html,/<details class="gcm-hd-consumption"><summary>Consumos <span>10 colaboradores<\/span><\/summary>/);
  assert.match(html,/<details class="gcm-hd-print"><summary>Descargar o imprimir<\/summary>/);
  assert.match(html,/data-gcm-a4-refresh/);
  // La visualización no solicita escrituras ni altera cantidades guardadas.
  assert.ok(a.calls.every(x=>!(/_set_|_finalize|_add_|_remove_/.test(x.name))));
 });
}
test('Empanadas ocupa solo una columna con nombre y total cerca; otros rubros a la derecha',()=>{
 assert.match(css,/\.gcm-history-wide \.gcm-hd-summary-layout\{\s*display:grid;grid-template-columns:minmax\(280px,340px\) minmax\(0,1fr\)/);
 assert.match(css,/\.gcm-history-wide \.gcm-hd-empanadas tbody\{\s*display:flex;flex-direction:column/);
 assert.match(css,/\.gcm-history-wide \.gcm-hd-empanadas tbody tr\{\s*display:grid;grid-template-columns:minmax\(0,125px\) 65px/);
 assert.match(css,/column-gap:10px;min-height:36px;max-width:235px;width:100%/);
 assert.match(css,/\.gcm-history-wide \.gcm-hd-summary-layout > \.gcm-hd-summary-grid\{\s*display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(css,/@media\(max-width:760px\)\{\s*\.gcm-history-wide \.gcm-hd-summary-layout\{\s*grid-template-columns:minmax\(0,1fr\)/);
 assert.match(source,/gcm-hd-empanadas-stack/);
 assert.match(source,/gcm-hd-summary-layout/);
});
for(const local of ['munro','torcuato']){
 test('Empanadas se muestra antes de otros rubros y mantiene los 26 pares producto/total en '+local,async()=>{
  const a=mount(local,{extraEmpanadas:24});
  a.mod.view();await tick();await tick();
  await a.click('data-gcm-history-open');await a.click('data-gcm-history-day',a.date);
  await a.click('data-gcm-history',a.date+'|manana_entrada');
  const html=a.mod.view();
  const empStart=html.indexOf('<div class="gcm-hd-empanadas-stack">');
  const otherStart=html.indexOf('<div class="gcm-hd-summary-grid">');
  assert.ok(empStart>0&&otherStart>empStart,'empanadas tiene su propia columna');
  const emp=html.slice(empStart,otherStart);
  assert.equal((emp.match(/<tr><td><strong>/g)||[]).length,26);
  assert.match(emp,/<strong>AC<\/strong><\/td><td class="gcm-hd-summary-number">/);
  assert.match(emp,/<strong>EMP 24<\/strong><\/td><td class="gcm-hd-summary-number">24<\/td>/);
  assert.match(html.slice(otherStart),/ADEREZOS/);
  assert.ok(a.calls.every(x=>!(/_set_|_finalize|_add_|_remove_/.test(x.name))));
 });
}

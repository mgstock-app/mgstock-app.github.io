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

function mount(local){
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
  assert.ok(labels.includes('CONSUMOS  ·  10 COLABORADORES'));
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

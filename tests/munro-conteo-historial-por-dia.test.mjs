import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../public/stock/mi-gusto-conteo.js',import.meta.url),'utf8');
const sql=fs.readFileSync(new URL('../supabase/migrations/20261114232500_munro_historial_por_dia.sql',import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const date=()=>{
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const v=k=>parts.find(x=>x.type===k).value;
 return v('year')+'-'+v('month')+'-'+v('day');
};
const yesterday=today=>{
 const d=new Date(today+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-1);return d.toISOString().slice(0,10);
};
function app(role='dueno'){
 const listeners=new Map(),calls=[],drawn=[],placed=[],canvases=[];
 const window={confirm:()=>true};
 const canvasContext={fillRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},
  fillText(t,x,y){drawn.push(String(t));placed.push({text:String(t),x,y,font:this.font});},measureText:t=>({width:String(t).length*10})};
 const document={addEventListener:(name,fn)=>listeners.set(name,fn),querySelector:()=>null,
  createElement:type=>{
   if(type!=='canvas')throw Error('Unexpected element: '+type);
   const canvas={width:0,height:0,getContext:()=>canvasContext,toDataURL:type=>{assert.equal(type,'image/png');return 'data:image/png;base64,AAAA';}};
   canvases.push(canvas);return canvas;
  }};
 vm.runInNewContext(source,{window,document,navigator:{onLine:true},Intl,Date,Promise,Set,Map,Math,Array,Object,Number,String,JSON,console});
 const today=date(),older=yesterday(today);
 const products=[{id:'p1',name:'AC',section:'EMPANADAS',units_per_chapa:30,active:true,position:101},
                 {id:'p2',name:'MT',section:'EMPANADAS',units_per_chapa:27,active:true,position:102}];
 const todayEntry={day:today,shift:'manana_entrada',data:{p1:{v1:{chapas:2,sueltas:5,qty:0}}},
  decomiso:{},decomiso_visible:false,consumption:[],waste:[],waste_visible:false,hidden_sections:[],status:'borrador',responsable:'Cami'};
 const todayExit={...todayEntry,shift:'manana_salida',status:'finalizado',responsable:'Shuli',data:{p2:{v1:{chapas:1,sueltas:8,qty:0}}}};
 const old={...todayEntry,day:older,shift:'noche_salida',status:'finalizado',responsable:'Tizi'};
 const rows=[old,todayExit,todayEntry];
 window.GestLokSupabase={rpc:async(name,args)=>{
  calls.push({name,args});
  if(name==='gestlok_munro_conteo_state')return {data:{products,counts:[todayEntry,todayExit],history:[todayExit],settings:{locked:true,hidden_sections:[]}},error:null};
  if(name==='gestlok_munro_conteo_history')return {data:rows,error:null};
  return {data:{ok:true},error:null};
 }};
 const module=window.GestLokMunroConteo;
 module.attach({S:{me:{tenant_id:'cb0dc04a-9a13-434f-a3d0-47f1d8f39670'},local:'munro',view:'conteo-munro',ro:false,offline:false},
  miRol:()=>role,misLocales:()=>['munro'],render:()=>{},toast:()=>{}});
 const click=async(attr,value)=>{
  const button={dataset:{},hasAttribute:x=>x===attr};
  button.dataset[attr.split('-').slice(1).map((p,i)=>i?p[0].toUpperCase()+p.slice(1):p).join('')]=value;
  // Actual names in dataset are camelCase (gcmHistoryDay etc.).
  if(attr==='data-gcm-history')button.dataset.gcmHistory=value;
  if(attr==='data-gcm-history-day')button.dataset.gcmHistoryDay=value;
  const root={};
  const target={closest:s=>s==='.gcm-page'?root:button};
  await listeners.get('click')({target,preventDefault(){},stopPropagation(){}});
  await tick();return module.view();
 };
 return {module,window,today,older,calls,click,listeners,rows,drawn,placed,canvases,products,todayEntry};
}
async function start(role='dueno'){
 const m=app(role);m.module.view();await tick();await tick();
 if(role!=='dueno'){await m.click('data-gcm-history-open');await tick();}
 return {...m,html:m.module.view()};
}
test('dueña ve solo filas por fecha, más reciente primero y ninguna tabla cargada por defecto',async()=>{
 const m=await start('dueno');
 assert.match(m.html,/Historial de conteos/);
 assert.match(m.html,/data-gcm-history-day=/);
 assert.ok(m.html.indexOf('data-gcm-history-day="'+m.today+'"')<m.html.indexOf('data-gcm-history-day="'+m.older+'"'));
 assert.doesNotMatch(m.html,/data-gcm-history=".*\|.*"/);
 assert.doesNotMatch(m.html,/Totales por categoría/);
 assert.doesNotMatch(m.html,/class="gcm-hd-meta"/);
 assert.ok(m.calls.some(x=>x.name==='gestlok_munro_conteo_history'&&x.args.p_month===m.today.slice(0,7)+'-01'));
 assert.doesNotMatch(m.html,/data-gcm-history-exit|gcm-count-screen|data-gcm-finalize|Editar turno cerrado|Volver al conteo/);
 assert.ok(m.calls.some(x=>x.name==='gestlok_munro_conteo_state'),'El catálogo se consulta para mostrar cantidades reales');
 assert.equal(m.calls.some(x=>/gestlok_munro_conteo_set_|gestlok_munro_conteo_finalize/.test(x.name)),false);
});
test('dueña sólo ve turnos archivados, nunca el borrador activo ni sus controles',async()=>{
 const m=await start('dueno');
 let html=await m.click('data-gcm-history-day',m.today);
 assert.equal((html.match(/data-gcm-history="/g)||[]).length,1);
 assert.match(html,/data-gcm-history="[^"]*manana_salida"/);
 assert.doesNotMatch(html,/data-gcm-history="[^"]*manana_entrada"/);
 html=await m.click('data-gcm-history',m.today+'|manana_salida');
 assert.match(html,/Resumen del conteo/);
 assert.doesNotMatch(html,/Editar turno cerrado|data-gcm-history-fix-toggle|data-gcm-finalize|gcm-count-screen/);
 html=await m.click('data-gcm-history-exit');
 assert.match(html,/Resumen del conteo/,'No puede salir del historial para editar el turno');
});

test('dueña siempre recibe tarjetas completas aunque el historial llegue antes que los productos',async()=>{
 const m=app('dueno');
 const rpc=m.window.GestLokSupabase.rpc;
 let releaseState;
 m.window.GestLokSupabase.rpc=(name,args)=>name==='gestlok_munro_conteo_state'
  ? new Promise(resolve=>{releaseState=()=>resolve(rpc(name,args));}):rpc(name,args);
 m.module.view();await tick();await tick();
 assert.equal(typeof releaseState,'function','El catálogo permanece descargándose');
 await m.click('data-gcm-history-day',m.today);
 let html=await m.click('data-gcm-history',m.today+'|manana_salida');
 assert.match(html,/Cargando productos y cantidades del historial/);
 assert.doesNotMatch(html,/Producto sin referencia|No hay productos cargados|data-gcm-a4-refresh|data-gcm-hd-summary-group/);
 assert.equal(m.canvases.length,0,'No genera una imagen incompleta antes de conocer el catálogo');
 releaseState();await tick();await tick();
 html=m.module.view();
 assert.match(html,/Productos y totales/);
 assert.match(html,/<strong>MT<\/strong>/);
 assert.match(html,/Responsable: Shuli/);
 assert.match(html,/>35</);
 assert.equal(m.canvases.length,1,'Regenera A4 usando los datos verdaderos');
 assert.doesNotMatch(html,/data-gcm-finalize|Editar turno cerrado|Producto sin referencia/);
});

test('dueña ve error de catálogo y puede reintentar sin perder el turno seleccionado',async()=>{
 const m=app('dueno'),rpc=m.window.GestLokSupabase.rpc;
 let fails=true;
 m.window.GestLokSupabase.rpc=(name,args)=>name==='gestlok_munro_conteo_state'&&fails
  ? Promise.resolve({data:null,error:{message:'Error transitorio de lectura'}}):rpc(name,args);
 m.module.view();await tick();await tick();
 await m.click('data-gcm-history-day',m.today);
 let html=await m.click('data-gcm-history',m.today+'|manana_salida');
 assert.match(html,/No se pudieron cargar los productos del historial/);
 assert.match(html,/Error transitorio de lectura/);
 assert.match(html,/data-gcm-retry/);
 fails=false;
 html=await m.click('data-gcm-retry');await tick();await tick();
 assert.match(m.module.view(),/<strong>MT<\/strong>/);
 assert.match(m.module.view(),/Responsable: Shuli/);
});

test('flecha del día abre exactamente los tres turnos, sin inventar datos ni horarios',async()=>{
 const m=await start('gerente');
 const html=await m.click('data-gcm-history-day',m.today);
 assert.match(html,/Turno Mañana entrada/i);
 assert.match(html,/Turno Mañana salida/i);
 assert.match(html,/Turno Noche salida/i);
 assert.equal((html.match(/data-gcm-history="/g)||[]).length,2);
 assert.match(html,/Sin cargar/);
 assert.doesNotMatch(html,/(08:00|16:00|23:59) hs/);
 assert.match(html,/En curso/);
 assert.match(html,/Finalizado/);
});
test('Ver detalle abre solo el conteo del turno seleccionado, en lectura',async()=>{
 const m=await start('gerente');
 await m.click('data-gcm-history-day',m.today);
 let html=await m.click('data-gcm-history',m.today+'|manana_entrada');
 assert.match(html,/Vista previa A4/);
 assert.match(html,/class="gcm-a4-preview"/);
 assert.match(html,/data:image\/png;base64,AAAA/);
 assert.match(html,/download="conteo-munro-/);
 assert.match(html,/Productos y totales/);
 assert.match(html,/>Producto<\/th><th>Total<\/th>/);
 assert.doesNotMatch(html,/>Consumos<\/h3>/,'Mañana entrada no tiene Consumos');
 assert.equal(m.canvases.length,1);
 assert.equal(m.canvases[0].width,1240);
 assert.equal(m.canvases[0].height,1754);
 assert.ok(m.drawn.includes('CONTEO DE PRODUCTOS'));
 assert.ok(m.drawn.includes('AC'));
 assert.ok(m.drawn.includes('65'));
 assert.match(html,/Responsable: Cami/);
 assert.match(html,/Turno Mañana entrada/i);
 assert.match(html,/>65</);
 assert.doesNotMatch(html,/data-gcm-plus=/);
 assert.doesNotMatch(html,/data-gcm-finalize/);
 assert.doesNotMatch(html,/data-gcm-history-day=/);
 html=await m.click('data-gcm-history-back');
 assert.match(html,/Historial de conteos/);
 assert.doesNotMatch(html,/class="gcm-a4-preview"/);
});
test('el gerente también puede abrir el historial sin poder editar datos desde detalle',async()=>{
 const m=await start('gerente');await m.click('data-gcm-history-day',m.today);
 const html=await m.click('data-gcm-history',m.today+'|manana_salida');
 assert.match(html,/Responsable: Shuli/);
 assert.match(html,/Finalizado/);
 assert.doesNotMatch(html,/data-gcm-plus=/);
});
test('RPC mensual incluye borradores y finalizados y valida autorización por tenant/local',()=>{
 assert.match(sql,/require_access\(false,false\)/);
 assert.match(sql,/gestlok_munro_conteo_private\.shifts/);
 assert.doesNotMatch(sql,/status='finalizado'/);
 assert.match(sql,/p_month\s*\+\s*interval '1 month'/);
 assert.match(sql,/revoke all on function public\.gestlok_munro_conteo_history/);
 assert.match(sql,/grant execute on function public\.gestlok_munro_conteo_history/);
});

/* Regresión: cerrar cada turno archiva la fecha original y abre el siguiente. */
function sequentialHarness({mismatch=false,finalizeFails=false,allClosed=false}={}){
 const events=new Map(),calls=[],messages=[],renders=[],window={confirm:()=>true,scrollTo:()=>{},alert:()=>{},
  GestLokConteoMorning:{clear(){},row(){return {different:false};},panel(){return ''},schedule(){},
   async load(){return {baseline_ready:true,rows:[]};}}};
 const document={addEventListener:(name,fn)=>events.set(name,fn),querySelector:()=>null};
 vm.runInNewContext(source,{window,document,navigator:{onLine:true},Intl,Date,Promise,Set,Map,Math,Array,Object,Number,String,JSON,console});
 const today=date(),tomorrow=window.GestLokMunroConteo._test.plusDays(today,1);
 const item=(day,shift)=>({day,shift,status:allClosed?'finalizado':'borrador',responsable:'Cami',
  data:{p1:{v1:{chapas:0,sueltas:0,qty:3}}},decomiso:{},decomiso_visible:false,
  consumption:[],waste:[],waste_visible:false,hidden_sections:[]});
 const rows=[item(today,'manana_entrada'),item(today,'manana_salida'),item(today,'noche_salida')];
 const products=[{id:'p1',name:'Agua 500 cc',section:'AGUAS',units_per_chapa:0,position:100,active:true}];
 const clone=obj=>JSON.parse(JSON.stringify(obj));
 window.GestLokSupabase={rpc:async(name,args={})=>{
  calls.push({name,args:clone(args)});
  if(name==='gestlok_munro_conteo_state'){
   const selection=rows.filter(x=>x.day===args.p_day).map(clone);
   if(mismatch&&calls.filter(x=>x.name==='gestlok_munro_conteo_state').length>=2&&selection.length)
    selection[0].data.p1.v1.qty=99;
   return {error:null,data:{counts:selection,products:clone(products),history:rows.filter(x=>x.status==='finalizado').map(clone),settings:{locked:true,hidden_sections:[]}}};
  }
  if(name==='gestlok_munro_conteo_finalize'){
   if(finalizeFails)return {error:{message:'No se pudo archivar'},data:null};
   const row=rows.find(x=>x.day===args.p_day&&x.shift===args.p_shift);
   if(!row||row.status==='finalizado')return {error:{message:'Turno inexistente o cerrado'},data:null};
   row.status='finalizado';return {error:null,data:{ok:true}};
  }
  if(name==='gestlok_munro_conteo_history')return {error:null,data:clone(rows)};
  return {error:null,data:{ok:true}};
 }};
 const mod=window.GestLokMunroConteo;
 mod.attach({S:{me:{tenant_id:'cb0dc04a-9a13-434f-a3d0-47f1d8f39670'},local:'munro',
   view:'conteo-munro',ro:false,offline:false},miRol:()=> 'gerente',misLocales:()=>['munro'],
   render:()=>renders.push('render'),toast:v=>messages.push(v)});
 async function click(name,entry){
  const button={hasAttribute:key=>key===name,dataset:entry?{[name.replace(/^data-/,'').replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]:entry}:{}};
  const target={closest:selector=>selector==='.gcm-page'?{}:selector==='button'?button:null};
  await events.get('click')({target,preventDefault(){},stopPropagation(){}});
  await tick();await tick();
 }
 return {mod,rows,calls,messages,renders,click,today,tomorrow};
}

test('la secuencia es mañana entrada → mañana salida → noche salida → día siguiente',()=>{
 const win={};const doc={addEventListener:()=>{}};
 vm.runInNewContext(source,{window:win,document:doc,navigator:{onLine:true},Intl,Date,Promise,Set,Map,Math,Array,Object,Number,String,JSON,console});
 const seq=win.GestLokMunroConteo._test.nextTurn,today='2026-11-15';
 const a=seq(today,'manana_entrada'),b=seq(a.day,a.shift),c=seq(b.day,b.shift);
 assert.equal(a.shift,'manana_salida');assert.equal(a.day,today);
 assert.equal(b.shift,'noche_salida');assert.equal(b.day,today);
 assert.equal(c.shift,'manana_entrada');assert.equal(c.day,'2026-11-16');
});

test('tres cierres exitosos guardan en historial y abren el próximo turno y día',async()=>{
 const m=sequentialHarness();m.mod.view();await tick();await tick();
 let html=m.mod.view();
 assert.match(html,/data-gcm-finalize/);
 assert.match(html,/class="gcm-mode-nav"/);
 assert.match(html,/data-gcm-history-open/);
 assert.match(html,/data-gcm-history-exit/);
 for(const [i,shift] of ['manana_entrada','manana_salida','noche_salida'].entries()){
  await m.click('data-gcm-finalize');
  assert.equal(m.rows[i].status,'finalizado','Turno '+shift+' debe archivarse');
  html=m.mod.view();
  assert.doesNotMatch(html,/data-gcm-shift=|<nav class="gcm-tabs"/);
  if(i<2)assert.match(html,new RegExp('<span>Fecha</span><strong>'+m.today.split('-').reverse().join('/')+'</strong>'));
  assert.deepEqual(m.calls.filter(x=>x.name==='gestlok_munro_conteo_finalize').map(x=>x.args.p_shift),
   ['manana_entrada','manana_salida','noche_salida'].slice(0,i+1));
 }
 // Noche salida: se muestra el día siguiente, nunca reabre noche ni pisa el día anterior.
 await tick();await tick();
 html=m.mod.view();
 assert.match(html,new RegExp('<span>Fecha</span><strong>'+m.tomorrow.split('-').reverse().join('/')+'</strong>'));
 assert.doesNotMatch(html,/data-gcm-shift=|data-gcm-day=/);
 assert.equal(m.calls.filter(x=>x.name==='gestlok_munro_conteo_finalize').length,3);
 assert.deepEqual(m.calls.filter(x=>x.name==='gestlok_munro_conteo_finalize').map(x=>x.args.p_shift),
  ['manana_entrada','manana_salida','noche_salida']);
 assert.ok(m.calls.filter(x=>x.name==='gestlok_munro_conteo_finalize').every(x=>x.args.p_day===m.today));
 await m.click('data-gcm-history-open');
 html=m.mod.view();
 assert.match(html,/Historial de conteos/);
 assert.match(html,new RegExp('data-gcm-history-day="'+m.today+'"'));
 await m.click('data-gcm-history-day',m.today);
 html=m.mod.view();
 assert.equal((html.match(/class="gcm-history-status is-done"/g)||[]).length,3);
 assert.match(html,/data-gcm-history-exit/);
});

test('una cantidad no confirmada impide archivar y cambiar de turno',async()=>{
 const m=sequentialHarness({mismatch:true});m.mod.view();await tick();await tick();
 await m.click('data-gcm-finalize');
 assert.equal(m.rows[0].status,'borrador');
 assert.equal(m.calls.filter(x=>x.name==='gestlok_munro_conteo_finalize').length,0);
 assert.doesNotMatch(m.mod.view(),/data-gcm-shift=|data-gcm-day=/);
 assert.match(m.mod.view(),new RegExp('<span>Fecha</span><strong>'+m.today.split('-').reverse().join('/')+'</strong>'));
 assert.ok(m.messages.some(x=>x.includes('sin confirmar')));
});

test('si falla el archivo en servidor no se abre el siguiente turno',async()=>{
 const m=sequentialHarness({finalizeFails:true});m.mod.view();await tick();await tick();
 await m.click('data-gcm-finalize');
 assert.equal(m.rows[0].status,'borrador');
 assert.doesNotMatch(m.mod.view(),/data-gcm-shift=|data-gcm-day=/);
 assert.match(m.mod.view(),new RegExp('<span>Fecha</span><strong>'+m.today.split('-').reverse().join('/')+'</strong>'));
 assert.ok(m.messages.some(x=>x.includes('No se pudo archivar')));
});

test('al reabrir Conteo continúa en el primer turno pendiente del día',async()=>{
 const m=sequentialHarness();m.rows[0].status='finalizado';
 m.mod.view();await tick();await tick();
 // El turno pendiente tiene un valor distinto al archivado, sin mostrar pestañas para elegirlo.
 assert.doesNotMatch(m.mod.view(),/data-gcm-shift=|gcm-tabs/);
 assert.match(m.mod.view(),/data-gcm-finalize/);
 const complete=sequentialHarness({allClosed:true});
 complete.mod.view();await tick();await tick();await tick();
 assert.match(complete.mod.view(),new RegExp('<span>Fecha</span><strong>'+complete.tomorrow.split('-').reverse().join('/')+'</strong>'));
});

test('Conteo e Historial están disponibles en teléfono, tablet y PC',()=>{
 const css=fs.readFileSync(new URL('../app/mi-gusto-conteo.css',import.meta.url),'utf8');
 assert.match(css,/\.gcm-page \.gcm-mode-nav/);
 assert.match(css,/position:sticky;top:calc\(70px \+ env\(safe-area-inset-top,0px\)\)/);
 assert.match(css,/@media\(max-width:899px\)/);
 assert.match(css,/@media\(max-width:390px\)/);
 assert.match(css,/\.gcm-page \.gcm-save-bar \.gcm-close-turn/);
});

test('la vista A4 usa valores archivados, no cambia registros y dibuja 10 consumos',async()=>{
 const m=await start('gerente');await m.click('data-gcm-history-day',m.today);
 const before=m.calls.length;
 const html=await m.click('data-gcm-history',m.today+'|manana_entrada');
 assert.match(html,/Hoja A4 completa/);
 assert.match(html,/Descargar imagen A4 \(PNG\)/);
 assert.equal((html.match(/data-gcm-extra="consumption"/g)||[]).length,0);
 assert.ok(!m.drawn.includes('CONSUMOS  ·  10 COLABORADORES'),'Mañana entrada no tiene Consumos');
 assert.deepEqual(m.drawn.filter(x=>/^([1-9]|10)$/.test(x)),[]);
 assert.equal(m.calls.slice(before).filter(x=>x.name==='gestlok_munro_conteo_finalize'||x.name==='gestlok_munro_conteo_set_extra').length,0);
 await m.click('data-gcm-a4-refresh');
 assert.equal(m.canvases.length,2);
 assert.equal(m.canvases[1].height/m.canvases[1].width,1754/1240);
});

test('Mañana entrada sin Consumos; Mañana salida inicia con 3 espacios ampliables',async()=>{
 const m=app('gerente');m.module.view();await tick();await tick();
 let html=m.module.view();
 assert.doesNotMatch(html,/data-gcm-extra="consumption"/);
 assert.doesNotMatch(html,/Consumo de Staff/);
 m.todayEntry.status='finalizado';
 m.rows.find(r=>r.shift==='manana_salida').status='borrador';
 m.module.reset();m.module.view();await tick();await tick();
 html=m.module.view();
 for(let i=0;i<3;i++){
  assert.match(html,new RegExp('data-gcm-extra="consumption" data-row="'+i+'" data-field="name"'));
  assert.match(html,new RegExp('data-gcm-extra="consumption" data-row="'+i+'" data-field="value"'));
 }
 assert.equal((html.match(/data-gcm-extra="consumption" data-row=/g)||[]).length,6);
  assert.match(html,/data-gcm-extra-add="consumption"/);
  assert.match(html,/3 espacios iniciales/);
});

test('A4 respeta el orden de Conteo y pone cada total cerca del producto, con letra grande',async()=>{
 const m=app('gerente');
 // Alfabéticamente sería otro orden. Conteo utiliza el mismo arreglo del catálogo.
 m.todayEntry.data.p2={v1:{chapas:1,sueltas:0,qty:0}};
 const expected=[];
 for(let i=0;i<27;i++){
  const id='extra'+i,name='SKU '+String(27-i).padStart(2,'0');
  expected.push(name);
  m.products.push({id,name,section:'EMPANADAS',position:103+i,active:true,units_per_chapa:0});
  m.todayEntry.data[id]={v1:{chapas:0,sueltas:0,qty:i+1}};
 }
 m.module.view();await tick();await tick();
 await m.click('data-gcm-history-open');await tick();
 await m.click('data-gcm-history-day',m.today);
 const html=await m.click('data-gcm-history',m.today+'|manana_entrada');
 assert.match(html,/Vista previa A4/);
 assert.equal(m.canvases.length,1);
 assert.equal(m.canvases[0].width,1240);
 assert.equal(m.canvases[0].height,1754);
 // El HTML y la imagen usan el catálogo: AC, MT y los 27 productos nuevos.
 const pAC=html.indexOf('<strong>AC</strong>');
 const pMT=html.indexOf('<strong>MT</strong>');
 const pFirst=html.indexOf('<strong>SKU 27</strong>');
 assert.ok(pAC>=0&&pMT>pAC&&pFirst>pMT,'Orden real AC, MT, SKU 27');
 assert.deepEqual(m.drawn.filter(t=>t.startsWith('SKU ')),expected);
 const label=m.placed.find(v=>v.text==='SKU 27');
 const quantity=m.placed.find(v=>v.text==='1'&&v.x>label.x&&
  Math.abs(v.y-label.y)<.01&&v.x-label.x<510);
 assert.ok(quantity,'Total junto al nombre, en la misma fila');
 assert.ok(quantity.x-label.x<510,'El total no debe estar en la otra punta de A4');
 const size=Number(label.font.match(/(\d+)px/)?.[1]||0);
 assert.ok(size>=24,'Producto debe verse en tamaño legible: '+size);
 const totalSize=Number(quantity.font.match(/(\d+)px/)?.[1]||0);
 assert.ok(totalSize>=size,'Los números deben ser igual o más grandes');
 assert.ok(!m.placed.find(v=>v.text==='Consumo'),'Mañana entrada no tiene consumo');
 assert.ok(m.placed.some(v=>v.text==='TOTAL GENERAL'));
 assert.ok(!m.drawn.includes('CONSUMOS  ·  10 COLABORADORES'),'Mañana entrada no tiene Consumos');
});

test('excepción 14/11: solo cambia la etiqueta a Noche salida y conserva turno/datos originales',async()=>{
 const m=app('dueno');
 const original={...m.todayEntry,day:'2026-11-14',shift:'manana_entrada',status:'borrador',
  data:{p1:{v1:{chapas:4,sueltas:9,qty:0}}}};
 m.rows.splice(0,m.rows.length,original);
 m.module.view();await tick();await tick();
 await m.click('data-gcm-history-open');await tick();
 const list=await m.click('data-gcm-history-day','2026-11-14');
 assert.match(list,/Turno Noche salida/);
 assert.doesNotMatch(list,/Turno Mañana entrada|Turno Mañana salida/);
 assert.equal((list.match(/data-gcm-history="2026-11-14\|/g)||[]).length,1);
 assert.match(list,/data-gcm-history="2026-11-14\|manana_entrada"/);
 assert.equal(m.module._test.historyShiftLabel(original),'Noche · salida');
 assert.equal(m.module._test.historyShiftLabel({...original,day:'2026-11-15'}),'Mañana · entrada');
 const detail=await m.click('data-gcm-history','2026-11-14|manana_entrada');
 assert.match(detail,/Turno Noche salida/);
 assert.match(detail,/conteo-munro-2026-11-14-noche_salida\.png/);
 assert.ok(m.drawn.includes('Noche · salida'));
 assert.ok(!m.drawn.includes('Mañana · entrada'),'la vista A4 debe respetar la corrección histórica');
 assert.ok(m.drawn.includes('129')); // 4 chapas x 30 + 9 sueltas
 assert.equal(original.shift,'manana_entrada','no cambia el identificador real');
 assert.equal(original.data.p1.v1.chapas,4);
 assert.equal(original.data.p1.v1.sueltas,9);
 assert.equal(m.calls.filter(x=>/gestlok_munro_conteo_set_|gestlok_munro_conteo_finalize/.test(x.name)).length,0);
});
test('desde el 15/11 el historial sigue mostrando los tres turnos habituales',()=>{
 const win={};vm.runInNewContext(source,{window:win,document:{addEventListener:()=>{}},navigator:{onLine:true},Intl,Date,Promise,Set,Map,Math,Array,Object,Number,String,JSON,console});
 for(const s of ['manana_entrada','manana_salida','noche_salida']){
  const title=win.GestLokMunroConteo._test.historyShiftLabel({day:'2026-11-15',shift:s});
  assert.ok(title&&title.includes(' · '));
 }
});

test('migración conserva el aislamiento de ambas sucursales y bloquea la escritura de dueños',()=>{
 const sql=fs.readFileSync(new URL('../supabase/migrations/20261122164000_mi_gusto_conteo_duenos_historial_solo_lectura.sql',import.meta.url),'utf8');
 for(const local of ['munro','torcuato']){
  assert.match(sql,new RegExp('gestlok_'+local+'_conteo_private\\.require_access'));
  assert.match(sql,new RegExp("puede_ver_local\\('"+local+"'\\)"));
  assert.match(sql,new RegExp('public\\.gestlok_'+local+'_conteo_history'));
  assert.match(sql,new RegExp('public\\.gestlok_'+local+'_conteo_state'));
 }
 assert.equal((sql.match(/if p_write and r='dueno'/g)||[]).length,2);
 assert.equal((sql.match(/'counts',case when public\.mi_rol\(\)='dueno' then '\[\]'::jsonb/g)||[]).length,2);
 assert.equal((sql.match(/s\.status='finalizado'/g)||[]).length,2);
 assert.doesNotMatch(sql,/insert into|delete from|truncate /i);
});

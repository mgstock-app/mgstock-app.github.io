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
 const listeners=new Map(),calls=[];
 const window={confirm:()=>true},document={addEventListener:(name,fn)=>listeners.set(name,fn),querySelector:()=>null};
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
 return {module,today,older,calls,click,listeners,rows};
}
async function start(role){
 const m=app(role);m.module.view();await tick();await tick();
 let html=await m.click('data-gcm-history-open');await tick();html=m.module.view();
 return {...m,html};
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
});
test('flecha del día abre exactamente los tres turnos, sin inventar datos ni horarios',async()=>{
 const m=await start();
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
 const m=await start();
 await m.click('data-gcm-history-day',m.today);
 let html=await m.click('data-gcm-history',m.today+'|manana_entrada');
 assert.match(html,/Detalle del conteo/);
 assert.match(html,/Responsable: Cami/);
 assert.match(html,/Turno Mañana entrada/i);
 assert.match(html,/>65</);
 assert.doesNotMatch(html,/data-gcm-plus=/);
 assert.doesNotMatch(html,/data-gcm-finalize/);
 assert.doesNotMatch(html,/data-gcm-history-day=/);
 html=await m.click('data-gcm-history-back');
 assert.match(html,/Historial de conteos/);
 assert.doesNotMatch(html,/Detalle del conteo/);
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
 const events=new Map(),calls=[],messages=[],renders=[],window={confirm:()=>true,scrollTo:()=>{}};
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
  if(i<2)assert.match(html,new RegExp('data-gcm-shift="'+(['manana_salida','noche_salida'][i])+'" class="is-active"'));
 }
 // Noche salida: se muestra el día siguiente, nunca reabre noche ni pisa el día anterior.
 await tick();await tick();
 html=m.mod.view();
 assert.match(html,new RegExp('Conteo del '+m.tomorrow.split('-').reverse().join('/')));
 assert.match(html,/data-gcm-shift="manana_entrada" class="is-active"/);
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
 assert.match(m.mod.view(),/data-gcm-shift="manana_entrada" class="is-active"/);
 assert.ok(m.messages.some(x=>x.includes('sin confirmar')));
});

test('si falla el archivo en servidor no se abre el siguiente turno',async()=>{
 const m=sequentialHarness({finalizeFails:true});m.mod.view();await tick();await tick();
 await m.click('data-gcm-finalize');
 assert.equal(m.rows[0].status,'borrador');
 assert.match(m.mod.view(),/data-gcm-shift="manana_entrada" class="is-active"/);
 assert.ok(m.messages.some(x=>x.includes('No se pudo archivar')));
});

test('al reabrir Conteo continúa en el primer turno pendiente del día',async()=>{
 const m=sequentialHarness();m.rows[0].status='finalizado';
 m.mod.view();await tick();await tick();
 assert.match(m.mod.view(),/data-gcm-shift="manana_salida" class="is-active"/);
 const complete=sequentialHarness({allClosed:true});
 complete.mod.view();await tick();await tick();await tick();
 assert.match(complete.mod.view(),new RegExp('Conteo del '+complete.tomorrow.split('-').reverse().join('/')));
});

test('Conteo e Historial están disponibles en teléfono, tablet y PC',()=>{
 const css=fs.readFileSync(new URL('../app/mi-gusto-conteo.css',import.meta.url),'utf8');
 assert.match(css,/\.gcm-page \.gcm-mode-nav/);
 assert.match(css,/position:sticky;top:0/);
 assert.match(css,/@media\(max-width:899px\)/);
 assert.match(css,/@media\(max-width:390px\)/);
 assert.match(css,/\.gcm-page \.gcm-save-bar \.gcm-close-turn/);
});

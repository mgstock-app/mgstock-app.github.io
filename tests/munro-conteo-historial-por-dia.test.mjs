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

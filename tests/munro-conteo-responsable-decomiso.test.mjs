import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../public/stock/mi-gusto-conteo.js',import.meta.url),'utf8');
const migrations=fs.readFileSync(new URL('../supabase/migrations/20261114213500_munro_conteo_responsable_decomiso.sql',import.meta.url),'utf8');

function createApp(visible){
 const window={};
 const events=[];
 const document={addEventListener:(type,handler)=>events.push([type,handler]),querySelector:()=>null};
 vm.runInNewContext(source,{window,document,navigator:{onLine:true},Date,Intl,Promise,Set,Map,Math,Array,Object,Number,String,JSON,console});
 const mod=window.GestLokMunroConteo;
 const today=()=>{const p=new Intl.DateTimeFormat('en-GB',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const v=k=>p.find(x=>x.type===k).value;return v('year')+'-'+v('month')+'-'+v('day');};
 const day=today();
 window.GestLokSupabase={rpc:async()=>({error:null,data:{
  products:[{id:'p1',name:'AC',section:'EMPANADAS',units_per_chapa:30,active:true,position:101},{id:'p2',name:'MT',section:'EMPANADAS',units_per_chapa:27,active:true,position:102}],
  counts:[{day,shift:'manana_entrada',data:{p1:{v1:{chapas:2,sueltas:4,qty:0}}},
   decomiso:{p1:{chapas:1,sueltas:2,qty:0}},decomiso_visible:visible,responsable:'Shuli',status:'borrador',consumption:[],waste:[]}],
  history:[]
 }})};
 mod.attach({S:{me:{tenant_id:'cb0dc04a-9a13-434f-a3d0-47f1d8f39670'},local:'munro',view:'conteo-munro',ro:false,offline:false},
  miRol:()=> 'gerente',misLocales:()=>['munro'],render:()=>{},toast:()=>{}});
 return {mod,events};
}
async function renderReady(visible){
 const {mod,events}=createApp(visible);
 mod.view();
 await new Promise(resolve=>setImmediate(resolve));
 return {html:mod.view(),events};
}

test('local fijo Munro, fecha del día argentino y selector de responsables',async()=>{
 const {html}=await renderReady(true);
 assert.match(html,/<strong>Munro<\/strong>/);
 assert.match(html,/Gerente \/ Responsable/);
 for(const name of ['Cami','Shuli','Tizi'])assert.match(html,new RegExp('value="'+name+'"'));
 assert.match(html,/<option value="Shuli" selected>Shuli<\/option>/);
 assert.match(html,/Fecha del conteo/);
 assert.match(html,/Hoy · \d{2}\/\d{2}\/\d{4}/);
 assert.doesNotMatch(html,/type="date"/);
});

test('decomiso visible aparece a la izquierda del producto y suma chapas + sueltas',async()=>{
 const {html}=await renderReady(true);
 assert.match(html,/id="gcm-decomiso-toggle" checked/);
 assert.ok(html.indexOf('>Decomiso</th>')<html.indexOf('>Producto</th>'));
 // Dos chapas normales + cuatro sueltas = 64; una de decomiso + dos sueltas = 32.
 assert.match(html,/class="gcm-total">96<\/td>/);
 assert.match(html,/data-gcm-decomp-plus="p1"/);
 assert.match(html,/data-gcm-decomp-suelta-plus="p1"/);
 assert.match(html,/data-gcm-decomp-suelta-minus="p1"/);
 assert.ok(html.includes('>2 u.</output>'));
});

test('sin activar Decomiso la columna desaparece pero los valores ya guardados siguen en total',async()=>{
 const {html}=await renderReady(false);
 assert.doesNotMatch(html,/>Decomiso<\/th>/);
 assert.match(html,/id="gcm-decomiso-toggle"/);
 assert.match(html,/class="gcm-total">96<\/td>/);
 assert.match(html,/Los totales incluyen el decomiso registrado/);
});

test('funciones SQL guardan responsable y decomiso de forma separada, archivado exige responsable',()=>{
 assert.match(migrations,/gestlok_munro_conteo_responsable/);
 assert.match(migrations,/gestlok_munro_conteo_decomiso_visible/);
 assert.match(migrations,/gestlok_munro_conteo_set_decomiso/);
 assert.match(migrations,/PERFORM gestlok_munro_conteo_private\.require_access\(true,false\)/);
 assert.match(migrations,/r\.responsable IS NULL/);
 assert.match(migrations,/IF NOT r\.decomiso_visible/);
 assert.match(source,/p_chapas:newCell\.chapas,p_sueltas:newCell\.sueltas,p_qty:newCell\.qty/);
});

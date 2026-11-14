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
 assert.match(html,/data-gcm-suelta="mt" data-idx="1" placeholder="u\." value="16"/);
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

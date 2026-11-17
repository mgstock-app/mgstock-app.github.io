import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const main=fs.readFileSync(new URL('../public/stock/mi-gusto-conteo.js',import.meta.url),'utf8');
const morning=fs.readFileSync(new URL('../public/stock/mi-gusto-conteo-morning.js',import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const clone=x=>JSON.parse(JSON.stringify(x));
const arDay=()=>{
 const items=new Intl.DateTimeFormat('en-GB',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const get=k=>items.find(x=>x.type===k)?.value;
 return [get('year'),get('month'),get('day')].join('-');
};
function harness({changeMorningOnServer=false}={}){
 const today=arDay(),prior=new Date(today+'T12:00:00Z');
 prior.setUTCDate(prior.getUTCDate()-1);
 const yesterday=prior.toISOString().slice(0,10);
 const product={id:'a',name:'Empanada Carne',section:'EMPANADAS',active:true,units_per_chapa:30,position:1};
 const base={status:'borrador',responsable:'Tizi',decomiso_visible:true,waste_visible:false,hidden_sections:[],waste:[]};
 const night={...clone(base),day:yesterday,shift:'noche_salida',
  data:{a:{v1:{chapas:1,sueltas:2,qty:0},v2:{chapas:0,sueltas:3,qty:0}}},
  decomiso:{a:{chapas:0,sueltas:1,qty:0}},consumption:[{name:'Gerente',value:'2'}]};
 const day={...clone(base),day:today,shift:'manana_entrada',
  data:{a:{v1:{chapas:1,sueltas:4,qty:0},v2:{chapas:0,sueltas:5,qty:0}}},
  decomiso:{a:{chapas:0,sueltas:2,qty:0}},consumption:[]};
 const snapshotBefore={night:clone(night),morning:clone(day)};
 const handlers=new Map(),calls=[],messages=[];
 const document={addEventListener:(type,handler)=>{(handlers.get(type)||handlers.set(type,[]).get(type)).push(handler);},
  querySelector:()=>null};
 const window={confirm:()=>true,scrollTo:()=>{},
  GestLokSupabase:{rpc:async(name,args={})=>{
   calls.push({name,args:clone(args)});
   if(name==='gestlok_munro_conteo_state'){
    const rec=args.p_day===today?clone(day):clone(night);
    if(changeMorningOnServer&&args.p_day===today&&calls.filter(x=>x.name==='gestlok_munro_conteo_state'&&x.args.p_day===today).length>1)
     rec.data.a.v1.sueltas=999;
    return {error:null,data:{products:[clone(product)],counts:[rec],history:[],settings:{locked:true,hidden_sections:[]}}};
   }
   if(name==='gestlok_munro_conteo_compare_morning')
    return {error:null,data:{previous_day:yesterday,baseline_ready:night.status==='finalizado',first_day:false,rows:[]}};
   if(name==='gestlok_munro_conteo_finalize'){
    assert.equal(args.p_day,yesterday);
    assert.equal(args.p_shift,'noche_salida');
    night.status='finalizado';
    return {error:null,data:{ok:true}};
   }
   throw Error('RPC inesperado '+name);
  }}
 };
 const context={window,document,navigator:{onLine:true},Date,Intl,Promise,Set,Map,Math,Array,Object,Number,String,JSON,console,setTimeout,clearTimeout};
 vm.runInNewContext(morning,context);
 vm.runInNewContext(main,context);
 const mod=window.GestLokMunroConteo;
 mod.attach({S:{me:{tenant_id:'cb0dc04a-9a13-434f-a3d0-47f1d8f39670'},local:'munro',view:'conteo-munro',ro:false,offline:false},
  miRol:()=> 'gerente',misLocales:()=>['munro'],render:()=>{},toast:value=>messages.push(value)});
 const click=async(type)=>{
  const button={hasAttribute:key=>key===type,disabled:false,textContent:'',dataset:{}};
  const target={closest:key=>key==='.gcm-page'?{}:key==='button'?button:null};
  await handlers.get('click').at(-1)({target,preventDefault(){}});
  for(let i=0;i<5;i++)await tick();
  return mod.view();
 };
 return {mod,day,night,today,yesterday,click,calls,messages,snapshotBefore};
}

test('retomar noche anterior conserva ambos conteos, vencimientos, decomiso y consumos',async()=>{
 const h=harness();h.mod.view();
 for(let i=0;i<5;i++)await tick();
 assert.match(h.mod.view(),/Abrir turno noche pendiente/);
 const pending=await h.click('data-gcm-open-pending-night');
 assert.match(pending,/Recuperando/);
 assert.match(pending,/Turno noche/i); // no selector libre, solo el turno correcto
 assert.match(pending,new RegExp(h.yesterday.split('-').reverse().join('/')));
 assert.deepEqual(h.day,h.snapshotBefore.morning);
 assert.deepEqual(h.night,h.snapshotBefore.night);
 assert.equal(h.calls.filter(c=>c.name.includes('_set_cell')||c.name.includes('_set_decomiso')||c.name.includes('_finalize')).length,0);
 await h.click('data-gcm-finalize');
 assert.equal(h.night.status,'finalizado');
 assert.deepEqual({...h.night,status:'borrador'},h.snapshotBefore.night);
 assert.deepEqual(h.day,h.snapshotBefore.morning,'mañana se conserva exactamente igual');
 assert.equal(h.calls.filter(c=>c.name.endsWith('_finalize')).length,1);
 assert.ok(h.calls.some(c=>c.name.endsWith('_state')&&c.args.p_day===h.today),
  'la mañana se vuelve a cargar desde servidor');
 for(let i=0;i<6;i++)await tick();
 const back=h.mod.view();
 assert.match(back,new RegExp(h.today.split('-').reverse().join('/')));
 assert.doesNotMatch(back,/Recuperando/);
});

test('si las cantidades de mañana cambiaron en servidor, no permite navegar ni borrar',async()=>{
 const h=harness({changeMorningOnServer:true});h.mod.view();
 for(let i=0;i<5;i++)await tick();
 const html=await h.click('data-gcm-open-pending-night');
 assert.match(html,new RegExp(h.today.split('-').reverse().join('/')));
 assert.match(html,/sin confirmar en el servidor/);
 assert.deepEqual(h.day,h.snapshotBefore.morning);
 assert.deepEqual(h.night,h.snapshotBefore.night);
 assert.equal(h.calls.some(c=>c.name.endsWith('_finalize')),false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync('public/stock/gestlok-creator-home.js','utf8');
const sql=readFileSync('supabase/migrations/20261122211000_gestlok_admin_microapps_catalogo.sql','utf8');
const companies=[{tenant_id:'t-test',name:'Comercio <nuevo>',locals:[{id:'loc-1',name:'Local principal'}]}];
const apps=[
 {tenant_id:'t-test',app_code:'gestlok_chat',nombre:'GESTLOK Chat',descripcion:'Chat',habilitada:false,estado:'desactivada'},
 {tenant_id:'t-test',app_code:'sistema_ventas',nombre:'Sistema de ventas',descripcion:'POS',habilitada:false,estado:'desactivada'}
];
function setup({email='kmu15lopez@gmail.com',creadora=true}={}){
 const listeners={},calls=[],notices=[];const store=new Map();let renders=0;
 const win={
  GestLokOwnerAreas:{creatorBrands:()=>[],creatorCompanies:()=>companies,
   companyFolders:()=>'<p>Directorio anterior</p>',refreshAdmin:async()=>{}},
  GestLokSupabase:{rpc:async(name,args)=>{
   calls.push({name,args});
   if(name==='gestlok_creator_dashboard')return {data:{scope:'creator_dashboard',generated_at:'2026-11-22T15:00:00Z',
     totals:{companies:1,locals:1},series:[],recent_companies:[]}};
   if(name==='gestlok_creator_microapps')return {data:apps};
   if(name==='gestlok_creator_crear_empresa_microapps')return {data:{tenant_id:'t-new'}};
   if(name==='gestlok_creator_asignar_microapp')return {data:{ok:true}};
   if(name==='gestlok_chat_admin_empresas')return {data:[]};
   return {error:{message:'No simulado'}};
  }},
  confirm:()=>true,sessionStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},
  location:{reload(){}},scrollTo(){}
 };
 const doc={addEventListener:(name,fn)=>{listeners[name]=fn;},querySelector:()=>({value:'gestlok_chat'}),
  visibilityState:'visible'};
 vm.runInNewContext(source,{window:win,document:doc,setInterval:()=>0,clearInterval:()=>{},Date,queueMicrotask,
   FormData:class{constructor(form){this.form=form;}get(name){return this.form.values[name];}}});
 const h=win.GestLokCreatorHome;
 h.attach({S:{me:{email,tenant_id:'t-test'}},isCreadora:()=>creadora,
   render(){renders++;},toast(message,fail){notices.push({message,fail});}});
 return {h,listeners,calls,notices,renders:()=>renders,doc};
}
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
test('Solo la administradora verificada ve empresas, +Apps y enlaces Chat',async()=>{
 const {h}=setup();h.mode();await tick();h.setTab('locales');await tick();
 const html=h.view({parts:{}});
 assert.match(html,/Agregar empresa/);
 assert.match(html,/name="nombre"/);
 assert.match(html,/name="dueno"/);
 assert.match(html,/name="gerente"/);
 assert.match(html,/data-ch-app-add="t-test"/);
 assert.match(html,/Sistema de ventas/);
 assert.match(html,/Comercio &lt;nuevo&gt;/);
 assert.doesNotMatch(html,/Comercio <nuevo>/);
 h.setTab('gestlok-chat');
 const links=h.view({parts:{}});
 assert.match(links,/href="https:\/\/gestlok-prueba\.vercel\.app\/"/);
 assert.match(links,/href="https:\/\/gestlok-testing\.vercel\.app\/"/);
 const another=setup({email:'otra@empresa.com'});another.h.mode();await tick();another.h.setTab('locales');
 const otherHtml=another.h.view({parts:{locales:'ANTERIOR'}});
 assert.doesNotMatch(otherHtml,/data-ch-create-business/);
 assert.doesNotMatch(otherHtml,/data-ch-tab="gestlok-chat"/);
 const owner=setup({creadora:false});assert.equal(owner.h.mode(),'off');
});
test('Alta de empresa llama solo al RPC protegido, con gerente opcional',async()=>{
 const {h,listeners,calls}=setup();h.mode();await tick();h.setTab('locales');await tick();
 let reset=false;
 const form={values:{nombre:'Comercio nuevo',dueno:'DUENO@EJEMPLO.COM',gerente:''},
   reportValidity:()=>true,reset(){reset=true;},querySelector:()=>({disabled:false})};
 listeners.submit({target:{matches:s=>s==='[data-ch-create-business]',...form},preventDefault(){}});
 await tick();await tick();
 const r=calls.find(x=>x.name==='gestlok_creator_crear_empresa_microapps');
 assert.equal(r?.args?.p_nombre,'Comercio nuevo');
 assert.equal(r?.args?.p_dueno_email,'dueno@ejemplo.com');
 assert.equal(r?.args?.p_gerente_email,null);
 assert.equal(reset,true);
});
test('La asignación siempre viaja al backend con tenant y microapp; nunca modifica otras empresas',async()=>{
 const {h,listeners,calls}=setup();h.mode();await tick();h.setTab('locales');await tick();
 listeners.click({target:{closest:s=>s==='[data-ch-app-add]'?{dataset:{chAppAdd:'t-test'}}:null},preventDefault(){}});
 await tick();await tick();
 assert.deepEqual(JSON.parse(JSON.stringify(calls.filter(c=>c.name==='gestlok_creator_asignar_microapp')[0]?.args)),
   {p_tenant:'t-test',p_app:'gestlok_chat',p_habilitar:true});
});
test('El SQL exige la identidad verificada y no actualiza empresas existentes masivamente',()=>{
 assert.match(sql,/gestlok_platform\.require_admin\(\)/);
 assert.match(sql,/lower\(u\.email\)='kmu15lopez@gmail\.com'/);
 assert.match(sql,/enable row level security/);
 assert.match(sql,/revoke all on gestlok_platform\.company_microapps/);
 assert.match(sql,/on conflict\(app_code\) do nothing/);
 assert.doesNotMatch(sql,/update public\.docs\s+set /i);
 assert.match(sql,/p_gerente_email text default null/);
 assert.match(sql,/gestlok_microapps_activar_dueno/);
});

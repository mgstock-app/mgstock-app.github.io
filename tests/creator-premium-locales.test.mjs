import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const script=readFileSync('public/stock/gestlok-creator-home.js','utf8');
const layout=readFileSync('app/layout.tsx','utf8');
const styles=readFileSync('app/creator-premium.css','utf8');
const DASH={
  scope:'creator_dashboard',generated_at:'2026-11-09T12:00:00Z',
  totals:{companies:3,locals:5},series:[],recent_companies:[]
};
const companies=[
  {tenant_id:'mi-gusto',name:'Mi Gusto',locals:[{id:'munro',name:'Munro'},{id:'torcuato',name:'Don Torcuato'}]},
  {tenant_id:'perfumes',name:'Perfumes',locals:[{id:'local-perfumes',name:'Perfumería'}]},
  {tenant_id:'molino',name:'El Molino <Café>',locals:[{id:'munro',name:'Acassuso'},{id:'san-isidro',name:'San Isidro'}]}
];
function load({email='kmu15lopez@gmail.com',role=true,rows=companies}={}){
  const handlers={};const data=new Map();
  const win={
    GestLokOwnerAreas:{
      creatorCompanies:()=>rows,
      companyFolders:()=>'<section aria-label="Empresas y locales">Directorio anterior</section>'
    },
    GestLokCreatorMode:{state:()=>({permanent:true})},
    GestLokSupabase:{rpc:async()=>({data:DASH,error:null})},
    sessionStorage:{getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)},
    location:{reload(){}},scrollTo(){}
  };
  const doc={addEventListener:(n,fn)=>{handlers[n]=fn},visibilityState:'visible'};
  vm.runInNewContext(script,{window:win,document:doc,setInterval:()=>0,clearInterval:()=>{},queueMicrotask,Date});
  const h=win.GestLokCreatorHome;
  h.attach({S:{me:{email,tenant_id:'mi-gusto'}},isCreadora:()=>role,render(){},toast(){}});
  return {h,handlers};
}
const tick=()=>new Promise(r=>setTimeout(r,0));
test('Locales premium: indicadores reales, una tarjeta por empresa y accesos originales por tenant',async()=>{
  const {h}=load();
  h.mode();await tick();h.setTab('locales');
  const html=h.view({pending:0,parts:{locales:'ANTES'}});
  assert.match(html,/class="gl-ch gl-ch-premium"/);
  assert.match(html,/Empresas activas/);
  assert.match(html,/Locales totales/);
  assert.match(html,/>3<\/strong>/);
  assert.match(html,/>5<\/strong>/);
  assert.match(html,/Acceso de administradora/);
  assert.equal((html.match(/class="gl-ch-premium-company"/g)||[]).length,3);
  assert.equal((html.match(/class="gl-ch-premium-local"/g)||[]).length,5);
  assert.match(html,/data-act="local" data-id="munro"/);
  assert.match(html,/data-company-local="munro" data-company-tenant="molino"/);
  assert.match(html,/El Molino &lt;Café&gt;/);
  assert.doesNotMatch(html,/El Molino <Café>/);
  assert.match(html,/Seleccionar empresa/);
  assert.match(html,/data-ch-tab="empresas"/);
  assert.match(html,/data-ch-tab="locales"/);
});
test('El tema premium no se activa para otro correo ni para otras cuentas',async()=>{
  const another=load({email:'otra@ejemplo.com'});
  another.h.mode();await tick();another.h.setTab('locales');
  const plain=another.h.view({parts:{locales:'DIRECTORIO ORIGINAL'}});
  assert.doesNotMatch(plain,/class="gl-ch gl-ch-premium"/);
  assert.match(plain,/Directorio anterior/);
  const owner=load({role:false});
  assert.equal(owner.h.mode(),'off');
});
test('Locales premium funciona con empresas nuevas y sin inventar cifras fijas',async()=>{
  const {h}=load({rows:[{tenant_id:'other',name:'Empresa nueva',locals:[{id:'l-7',name:'Local nuevo'}]}]});
  h.mode();await tick();h.setTab('locales');
  const html=h.view({parts:{}});
  assert.match(html,/Empresa nueva/);
  assert.match(html,/>1<\/strong>/);
  assert.match(html,/1 local/);
  assert.match(html,/data-company-local="l-7" data-company-tenant="other"/);
  assert.doesNotMatch(html,/Mi Gusto|Perfumes|El Molino/);
});
test('CSS premium se importa al final y está limitado al panel privado de la creadora',()=>{
  const last=layout.lastIndexOf('import "./creator-premium.css";');
  assert.ok(last>layout.lastIndexOf('import "./gestlok-experience.css";'));
  assert.match(styles,/#hub \.gl-ch\.gl-ch-premium/);
  assert.match(styles,/#hub \.gl-ch-premium-stats/);
  assert.match(styles,/@media\(max-width:620px\)/);
  assert.doesNotMatch(styles,/#app \.side|\.gl-oh-/);
});

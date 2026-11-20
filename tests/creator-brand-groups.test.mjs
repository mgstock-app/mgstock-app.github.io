import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const code=readFileSync('public/stock/gestlok-owner-areas.js','utf8');
const companies=[
  {tenant_id:'root',name:'Mi Gusto',owners:2,locals:[{id:'munro',name:'Munro'},{id:'torcuato',name:'Torcuato'}]},
  {tenant_id:'nuevo-dueno',name:'Mi Gusto',owners:1,locals:[{id:'loc-3',name:'San Fernando'}]},
  {tenant_id:'cafeteria',name:'Café',owners:1,locals:[{id:'local-cafe',name:'Café Centro'}]}
];
const links=[
  {tenant_id:'root',root_tenant:'root',brand_name:'Mi Gusto'},
  {tenant_id:'nuevo-dueno',root_tenant:'root',brand_name:'Mi Gusto'},
  {tenant_id:'cafeteria',root_tenant:'cafeteria',brand_name:'Café'}
];
function setup(role='creadora'){
  const handlers={},calls=[],notices=[];
  const win={
    addEventListener(){},confirm(){return true;},
    GestLokSupabase:{async rpc(name,args){
      calls.push({name,args});
      if(name==='gestlok_creator_companies_index')return {data:{scope:'metadata_only',companies},error:null};
      if(name==='gestlok_creator_brand_links_index')return {data:{scope:'brand_links',links},error:null};
      if(name==='gestlok_creator_audit')return {data:[],error:null};
      if(name==='gestlok_creator_add_brand_local')return {data:{ok:true,grupo_nuevo:true},error:null};
      throw Error('Unexpected RPC '+name);
    }}
  };
  const doc={addEventListener(name,handler){handlers[name]=handler},visibilityState:'hidden'};
  vm.runInNewContext(code,{window:win,document:doc,Intl,Date,Number,JSON,setTimeout,clearTimeout,queueMicrotask});
  const ui=win.GestLokOwnerAreas;
  ui.attach({role:()=>role,S:{loaded:{e:true},me:{tenant_id:'root'},offline:false},
    render(){},toast(message,bad){notices.push({message,bad})}});
  return {ui,handlers,calls,notices};
}
test('Solo la creadora agrupa bajo Mi Gusto sucursales de dueños y tenants separados',async()=>{
  const {ui}=setup();
  await ui.refreshAdmin();
  const groups=ui.creatorBrands();
  assert.equal(groups.length,2);
  const brand=groups.find(g=>g.name==='Mi Gusto');
  assert.equal(brand.locals.length,3);
  assert.deepEqual([...brand.locals.map(l=>l.tenant_id)].sort(),['nuevo-dueno','root','root']);
  assert.match(ui.companyFolders(),/\+ Agregar local/);
  assert.match(ui.companyFolders(),/data-company-tenant="nuevo-dueno"/);
  assert.match(ui.companyFolders(),/Email del dueño/);
  assert.equal(ui.creatorCompanies().length,3,'Las herramientas administrativas conservan el listado de tenants');
});
test('El formulario envía tenant de la marca, nombre del local y correo del dueño',async()=>{
  const {ui,handlers,calls,notices}=setup();
  await ui.refreshAdmin();
  const button={disabled:false,isConnected:true};
  const form={
    dataset:{creatorAddLocalForm:'root'},
    elements:{namedItem(key){return {value:key==='local'?'San Isidro':'propietaria@example.com'}}},
    reportValidity(){return true},querySelector(){return button}
  };
  await handlers.submit({target:{closest(sel){return sel==='[data-creator-add-local-form]'?form:null}},preventDefault(){}});
  const called=calls.find(c=>c.name==='gestlok_creator_add_brand_local');
  assert.deepEqual(JSON.parse(JSON.stringify(called.args)),{
    p_parent_tenant:'root',p_local_name:'San Isidro',p_owner_email:'propietaria@example.com'});
  assert.ok(notices.some(n=>!n.bad));
});
test('Los dueños no reciben índice de marcas ni formulario administrativo',async()=>{
  const {ui,calls}=setup('dueno');
  await ui.refreshAdmin();
  assert.equal(calls.length,0);
  assert.equal(ui.creatorBrands().length,0);
  assert.equal(ui.creatorAddLocalForm('root'),'');
});
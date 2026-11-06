import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const script=readFileSync('public/stock/gestlok-mis-productos.js','utf8');
const sql=readFileSync('supabase/migrations/20261106053500_cami_mis_productos_privados.sql','utf8');
const runtime=readFileSync('components/stock-runtime.tsx','utf8');
const owner=readFileSync('public/stock/gestlok-owner-areas.js','utf8');
const layout=readFileSync('app/layout.tsx','utf8');
const TENANT='2a97bf8d-7d08-4aa7-b051-5d1a4dc80103';
const email='camilab.lopez99@gmail.com';

test('Mis Productos se carga por separado, solo para dueña de Perfumería, sin Plan Scanner',()=>{
 assert.match(runtime,/if \(!visitor\) await load\("\/stock\/gestlok-mis-productos\.js/);
 assert.match(owner,/GestLokMisProductos\?\.refresh/);
 assert.match(owner,/GestLokMisProductos\?\.homeTile/);
 assert.match(layout,/gestlok-mis-productos\.css/);
 assert.doesNotMatch(script,/plan_code|gestlok_pilot_products|gestlok_scanner_pos|gestlok_pilot_records/);
 assert.match(script,/data-mp-open/);
 assert.match(script,/data-mp-new-tab/);
 assert.match(script,/data-mp-rename/);
 assert.match(script,/data-mp-remove-tab/);
 assert.match(script,/data-mp-delete/);
 assert.match(script,/data-mp-like/);
 assert.match(script,/Me gustó/);
 assert.match(script,/No me gustó/);
 assert.match(script,/data-mp-new/);
});

test('RLS excluye otras cuentas y no depende de habilitación Scanner',()=>{
 assert.match(sql,/gestlok_cami_product_tabs/);
 assert.match(sql,/gestlok_cami_product_items/);
 assert.equal((sql.match(/enable row level security/g)||[]).length,2);
 assert.equal((sql.match(/create policy gestlok_cami_/g)||[]).length,8);
 assert.match(sql,/owner_uid=\(select auth\.uid\(\)\)/);
 assert.match(sql,/foreign key\(tab_id,owner_uid,tenant_id\)/);
 assert.match(sql,/revoke all on public\.gestlok_cami_product_tabs from public,anon,authenticated/);
 assert.doesNotMatch(sql,/gestlok_pilot_access\.enabled|plan_code|\bdrop table\b|\bdelete from public\.docs\b|\bto anon\b/i);
 assert.match(sql,/Perfume Fem/);
 assert.match(sql,/Perfume Masc/);
 assert.match(sql,/Body Splash/);
});

function launch(userEmail=email,role='dueno',tenant=TENANT,dbHasAccess=true){
 const listeners={};
 const root={id:'gl-mp-panel',innerHTML:''};
 let rendered=false,fromCalls=[];
 const d={
  querySelector:s=>s==='#gl-mp-panel'&&rendered?root:null,
  createElement:()=>root,
  body:{append:()=>{rendered=true;},classList:{add(){},remove(){}}},
  addEventListener:(name,fn)=>{listeners[name]=fn;}
 };
 const t=[{id:'t1',name:'Perfume Fem',position:0}];
 const entries=[{id:'e1',tab_id:'t1',product:'Tester 60ml',liked:true,note:'Buen aroma',position:0}];
 const from=(name)=>{
  fromCalls.push(name);
  const q={select(){return q;},eq(){return q;},order(){return q;},
   limit:async()=>({data:dbHasAccess?t.slice(0,1):[],error:null}),
   range:async()=>({data:dbHasAccess?(name.endsWith('tabs')?t:entries):[],error:null})
  };
  return q;
 };
 const host={S:{me:{email:userEmail,tenant_id:tenant}},role:()=>role,render(){},closePanel(){}};
 const ctx={role,tenant_id:tenant};
 const window={GestLokSupabase:{auth:{getUser:async()=>({data:{user:{id:'owner',email:userEmail}},error:null})},from},
  history:{state:{},pushState(){},replaceState(){},back(){}},
  addEventListener(){},confirm:()=>true};
 runInNewContext(script,{window,document:d,Date,FormData,console});
 return {mod:window.GestLokMisProductos,ctx,host,root,fromCalls,listeners};
}
test('La vista privada presenta hoja y preferencias sin editar stock',async()=>{
 const a=launch();
 await a.mod.refresh(a.ctx,a.host);
 assert.equal(a.mod.authorized(),true);
 assert.match(a.mod.homeTile(),/Mis Productos/);
 await a.mod.open();
 assert.match(a.root.innerHTML,/Perfume Fem/);
 assert.match(a.root.innerHTML,/Tester 60ml/);
 assert.match(a.root.innerHTML,/Buen aroma/);
 assert.match(a.root.innerHTML,/Me gustó/);
 assert.match(a.root.innerHTML,/No me gustó/);
 assert.deepEqual(a.fromCalls,[
  'gestlok_cami_product_tabs','gestlok_cami_product_tabs','gestlok_cami_product_items'
 ]);
});
test('Ni otra cuenta ni Mi Gusto pueden ver ni abrir el cuaderno',async()=>{
 for(const [mail,role,tenant] of [
  ['otra@example.com','dueno',TENANT],
  [email,'gerente',TENANT],
  [email,'dueno','cb0dc04a-9a13-434f-a3d0-47f1d8f39670']
 ]){
  const a=launch(mail,role,tenant);
  await a.mod.refresh(a.ctx,a.host);
  assert.equal(a.mod.homeTile(),'');
  assert.equal(a.mod.authorized(),false);
  assert.equal(a.fromCalls.length,0);
 }
 const denied=launch(email,'dueno',TENANT,false);
 await denied.mod.refresh(denied.ctx,denied.host);
 assert.equal(denied.mod.authorized(),false,'La RLS es el último control de acceso');
});

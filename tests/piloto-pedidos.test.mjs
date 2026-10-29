import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const js=read('public/stock/gestlok-pedidos.js');
const sql=read('supabase/migrations/20261029055000_piloto_pedidos_perfumes.sql');
const pilot=read('public/stock/gestlok-pilot.js');
test('Pedidos: está visible como módulo, sin desplegarse en empresas ajenas',()=>{
 const handlers={};
 const root={window:{},document:{addEventListener:(type,callback)=>{handlers[type]=callback;},querySelector:()=>null},Intl,Date};
 vm.runInNewContext(js,root);
 const api=root.window.GestLokPedidos;
 assert.ok(api,'módulo cargado');
 assert.equal(typeof api.render,'function');
 assert.equal(typeof api.getTotals,'function');
 const first=api.render();
 assert.match(first,/Pedidos/);
 assert.match(first,/GESTLOK · PILOTO DE CAMI/);
 assert.match(pilot,/context\.tenant_id===TENANT/);
 assert.match(pilot,/ownerUid!==''/);
 assert.match(pilot,/data-pilot-orders/);
 assert.doesNotMatch(js,/@gmail\.com/);
});
test('Pedidos: distingue productos preparados de unidades realmente vendidas',()=>{
 const handlers={};
 const root={window:{},document:{addEventListener:(type,callback)=>handlers[type]=callback,querySelector:()=>null},Intl,Date};
 vm.runInNewContext(js,root);
 const rows=[
  {status:'preparado',items:[{product_id:'p1',name:'Producto A',category:'Fragancias',unit_price:100,quantity:2}]},
  {status:'entregado',items:[{product_id:'p1',name:'Producto A',category:'Fragancias',unit_price:100,quantity:1},{product_id:'p2',name:'Producto B',category:'Capilar',unit_price:null,quantity:3}]},
  {status:'sin_realizar',items:[{product_id:'p1',name:'Producto A',category:'Fragancias',unit_price:100,quantity:99}]},
  {status:'cancelado',items:[{product_id:'p1',name:'Producto A',category:'Fragancias',unit_price:100,quantity:99}]}
 ];
 const api=root.window.GestLokPedidos;
 const made=api.getTotals(rows,['preparado','entregado']);
 const sold=api.getTotals(rows,['entregado']);
 assert.equal(made.find(x=>x.name==='Producto A').quantity,3);
 assert.equal(sold.find(x=>x.name==='Producto A').quantity,1);
 assert.equal(sold.find(x=>x.name==='Producto B').quantity,3);
 assert.equal(sold.find(x=>x.name==='Producto B').priced,false);
 assert.doesNotMatch(js,/restablecer día/i,'no se borran pedidos reales para reiniciar el día');
});
test('Pedidos: RLS propio, sin borrado de pedidos y conservación de precios del día',()=>{
 for(const table of ['gestlok_pilot_products','gestlok_pilot_orders','gestlok_pilot_order_closures']){
  assert.match(sql,new RegExp('create table if not exists public\\.'+table));
  assert.match(sql,new RegExp('alter table public\\.'+table+' enable row level security'));
 }
 assert.match(sql,/owner_uid=\(select auth\.uid\(\)\)/);
 assert.match(sql,/new\.items=old\.items/);
 assert.match(sql,/new\.day is distinct from old\.day/);
 assert.match(sql,/El día está cerrado/);
 assert.match(sql,/jsonb_array_elements\(new\.items\)/);
 assert.match(sql,/unit_price',p\.unit_price/);
 assert.doesNotMatch(sql,/grant delete/i);
 assert.doesNotMatch(sql,/(delete from public\.docs|update public\.docs|drop table public\.docs)/i);
 assert.match(js,/No se genera una venta automáticamente/);
 assert.match(js,/No es una conciliación contable/);
 assert.match(js,/getUser\(\)/);
});
test('Pedidos: cache PWA, privacidad y acceso por la misma sesión',()=>{
 const runtime=read('components/stock-runtime.tsx');
 const sw=read('scripts/sw-template.js');
 const layout=read('app/layout.tsx');
 assert.match(runtime,/if \(!visitor\) await load\("\/stock\/gestlok-pedidos\.js/);
 assert.match(sw,/'\/stock\/gestlok-pedidos\.js'/);
 assert.match(layout,/gestlok-orders\.css/);
 assert.match(pilot,/active==='pedidos'/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const tenant='2a97bf8d-7d08-4aa7-b051-5d1a4dc80103';
const source=readFileSync('public/stock/gestlok-scanner-readonly.js','utf8');
const menu=readFileSync('public/stock/gestlok-scanner-menu.js','utf8');
const pilot=readFileSync('public/stock/gestlok-pilot.js','utf8');
const migration=readFileSync('supabase/migrations/20261108194500_zayro_scanner_creator_readonly.sql','utf8');
const rollback=readFileSync('docs/rollback-zayro-scanner-creator-readonly.sql','utf8');
const runtime=readFileSync('components/stock-runtime.tsx','utf8');
const fixture={
 gestlok_pilot_products:[{id:'p1',name:'<script>alert(1)</script> Perfume',sku:'N-101',category:'Unisex',cost_price:5000,markup_percent:80,manual_sale_price:10000,unit_price:9000,stock_quantity:5,in_stock:true,active:true}],
 gestlok_pilot_pos_sales:[{id:'v1',total:10000,payment_method:'transferencia',created_at:'2026-11-08T15:00:00Z'}],
 gestlok_pilot_orders:[{id:'o1',day:'2026-11-08',customer:'Cliente ficticio',status:'pendiente',items:[{name:'Perfume',quantity:2}]}],
 gestlok_pilot_order_closures:[{id:'c1',day:'2026-11-07',closed_at:'2026-11-07T22:00:00Z'}],
 gestlok_pilot_records:[{id:'r1',module:'finanzas',title:'Venta manual',direction:'ingreso',amount:10000,occurred_on:'2026-11-08'}],
 gestlok_scanner_payment_methods:[{method_id:'transferencia',label:'Transferencia bancaria',enabled:true}],
 gestlok_pilot_audit:[{id:'a1',module:'stock',action:'actualizado',at:'2026-11-08T15:00:00Z'}]
};
function load(){
 const sandbox={window:{},Intl,Promise,Date};
 vm.runInNewContext(source,sandbox);
 return sandbox.window.GestLokScannerReadOnly;
}
function dbMock(){
 const calls=[];
 return {calls,from(table){
   calls.push({type:'SELECT',table});
   const allowed=fixture[table];
   if(!allowed)throw Error('Tabla no autorizada: '+table);
   const q={
     select(){return q;},
     eq(column,value){if(column!=='tenant_id'||value!==tenant)throw Error('Sin filtro de tenant');return q;},
     order(){return q;},
     limit(){return Promise.resolve({data:allowed,error:null});}
   };
   return q;
 }};
}
test('La creadora consulta 7 tablas reales sin invocar escritura alguna',async()=>{
 const module=load(),db=dbMock();let checked=0;
 const state=await module.load(db,tenant,async()=>{checked++;});
 assert.equal(checked,2);
 assert.equal(db.calls.length,7);
 for(const row of db.calls)assert.equal(row.type,'SELECT');
 assert.equal(state.products.length,1);assert.equal(state.orders.length,1);
});
test('Todas las seis secciones son navegables, muestran datos y no tienen controles de escritura',async()=>{
 const module=load(),data=fixture;
 const expected=new Map([['caja','transferencia'],['sistema_venta','10.000'],
   ['stock','5'],['precios','Costo'],['pedidos','Cliente ficticio'],
   ['dispositivos','Transferencia bancaria']]);
 for(const [key,text] of expected){
   assert.equal(module.validSection(key),true);
   const html=module.render(key,{
     products:data.gestlok_pilot_products,sales:data.gestlok_pilot_pos_sales,
     orders:data.gestlok_pilot_orders,closures:data.gestlok_pilot_order_closures,
     records:data.gestlok_pilot_records,methods:data.gestlok_scanner_payment_methods,audit:data.gestlok_pilot_audit
   });
   assert.ok(html.includes(text),key+' debe mostrar '+text);
   assert.match(html,/Solo lectura/);
   assert.doesNotMatch(html,/<button\b|<input\b|<form\b|data-pilot-save|data-orders-save|data-pos-sale/i);
   assert.doesNotMatch(html,/<script>/,'Se escaparán textos de productos');
 }
});
test('El panel rechazará otro tenant antes de consultar la base',async()=>{
 const module=load();const db=dbMock();
 await assert.rejects(()=>module.load(db,'00000000-0000-4000-8000-000000000002',()=>true),/exclusiva/);
 assert.equal(db.calls.length,0);
});
test('El frontend identifica creadora separada de dueña, sin usar ownerUid de creadora para escribir',()=>{
 assert.match(pilot,/const creatorView=/);
 assert.match(pilot,/readOnly=.*creatorView/);
 assert.match(pilot,/ownerUid=enabled\?data\.owner_uid:/);
 assert.match(pilot,/assertReadOnlyAccess\(\)/);
 assert.match(pilot,/if\(readOnly\)throw Error\('La vista de creadora es solo lectura/);
 assert.match(pilot,/readonlyAuthorized:/);
 assert.match(pilot,/readonlySection:openReadOnlySection/);
 assert.match(menu,/data-scanner-readonly/);
 assert.match(menu,/readonlyAuthorized/);
 assert.match(runtime,/gestlok-scanner-readonly\.js/);
 const i=runtime.indexOf('await load("/stock/gestlok-scanner-readonly.js');
 assert.ok(i>=0&&i<runtime.indexOf('await load("/stock/gestlok-pilot.js'),'visor cargado antes del piloto');
});
test('Ocho políticas SELECT adicionales con rollback, sin crear permisos de escritura',()=>{
 const tables=['gestlok_pilot_access','gestlok_pilot_products','gestlok_pilot_pos_sales',
  'gestlok_pilot_orders','gestlok_pilot_order_closures','gestlok_pilot_records',
  'gestlok_scanner_payment_methods','gestlok_pilot_audit'];
 for(const table of tables){
   assert.match(migration,new RegExp('on public\\.'+table+'\\s+for select to authenticated'));
   assert.ok(rollback.includes('on public.'+table+';'));
 }
 assert.match(migration,/gestlok_platform\.creator_write_active/);
 assert.match(migration,/gestlok_tenancy\.current_tenant_id/);
 assert.match(migration,/a\.owner_uid is distinct from \(select auth\.uid\(\)\)/);
 assert.match(migration,/revoke all on function/);
 assert.match(migration,/p_tenant = '2a97bf8d-7d08-4aa7-b051-5d1a4dc80103'/);
 assert.doesNotMatch(migration,/\bfor\s+(insert|update|delete|all)\b|\bgrant\s+(insert|update|delete|all)\b/i);
});

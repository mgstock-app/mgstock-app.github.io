import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const TENANT='6c8717ea-5f78-426b-9458-74a5dcac6e4e';
const migration=readFileSync('supabase/migrations/20261108235000_molino_acassuso_orders.sql','utf8');
const source=readFileSync('public/stock/gestlok-molino.js','utf8');
const css=readFileSync('public/stock/gestlok-molino.css','utf8');
const dock=readFileSync('public/stock/gestlok-mobile-dock.js','utf8');

function makeModule(tenant=TENANT,role='creadora'){
 const window={};
 const document={addEventListener(){},getElementById(){return null;},
  createElement(){return {setAttribute(){}};},head:{appendChild(){}},querySelector(){return null;}};
 vm.runInNewContext(source,{window,document,Intl,Date,setTimeout:()=>0,clearTimeout,clearInterval,setInterval:()=>0,
   Number,String,Array});
 window.GestLokMolino.attach({S:{me:{tenant_id:tenant},local:'acassuso'},role:()=>role});
 return window.GestLokMolino;
}

test('Pedidos conserva Precios como pestaña separada en El Molino',()=>{
 const m=makeModule();
 const home=m.homeTile(),nav=m.navHTML();
 for(const id of ['precios','pedidos','envios','devoluciones','historial']){
  assert.match(home,new RegExp('data-mol-open="'+id+'"'));
  assert.match(nav,new RegExp('data-mol-nav="'+id+'"'));
 }
 assert.match(source,/\['realizar','Realizar pedido'\],\['seguimiento','Seguimiento'\]/);
 assert.match(source,/data-mol-order-send/);
 assert.match(source,/data-mol-order-ack/);
 assert.match(dock,/\['mol-pedidos','Pedidos','chat',true\]/);
 assert.match(css,/\.gl-molino-order-group/);
 assert.match(css,/@media\(max-width:740px\)/);
 assert.equal(makeModule('cb0dc04a-9a13-434f-a3d0-47f1d8f39670').homeTile(),'');
});

test('El servidor valida permisos de Acassuso y solo OK en San Isidro',()=>{
 assert.match(migration,/gestlok_molino_scope\(\)/);
 assert.match(migration,/v_scope not in \('admin','dueno','acassuso'\)/);
 assert.match(migration,/v_scope not in \('admin','dueno','san_isidro'\)/);
 assert.match(migration,/if v_scope='none' then/);
 assert.match(migration,/seen_at=now\(\),seen_by=auth\.uid\(\)/);
 assert.match(migration,/requested_by,?\s*\)?\s*values|requested_by\s*\)\s*values/);
 assert.match(migration,/auth\.uid\(\)/);
 assert.match(migration,/on public\.gestlok_molino_orders[\s\S]*for select to authenticated/);
 assert.doesNotMatch(migration,/grant\s+(?:all|update|insert|delete)\s+on\s+public\.gestlok_molino_orders\s+to\s+authenticated/i);
 assert.match(migration,/revoke all on public\.gestlok_molino_orders from public,anon,authenticated/);
 assert.match(migration,/where id=p_id and tenant_id='6c8717ea-5f78-426b-9458-74a5dcac6e4e'/);
 assert.doesNotMatch(migration,/\b(?:delete from|truncate table|drop table)\b/i);
});
test('Sin escritura anónima y sin modificar precios, envíos o devoluciones previos',()=>{
 for(const name of ['gestlok_molino_orders_state','gestlok_molino_order_create','gestlok_molino_order_ack']){
  assert.match(migration,new RegExp('revoke all on function public\\.'+name));
  assert.match(migration,new RegExp('grant execute on function public\\.'+name));
 }
 assert.doesNotMatch(migration,/create or replace function public\.gestlok_molino_(?:state|save_price|save_movement|acknowledge)\b/);
 assert.match(source,/gestlok_molino_order_create/);
 assert.match(source,/gestlok_molino_order_ack/);
 assert.match(source,/gestlok_molino_orders_state/);
 assert.match(source,/Math\.abs\(Math\.round\(quantity\*100\)-quantity\*100\)>1e-6/);
});

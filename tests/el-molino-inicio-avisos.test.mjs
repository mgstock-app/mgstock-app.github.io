import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

// Inicio de El Molino Café (09/11/2026): avisos según la sucursal, un solo logo y sin
// repetir los botones del menú. Datos simulados; nunca toca la base real.
const TENANT='6c8717ea-5f78-426b-9458-74a5dcac6e4e';
const ACASSUSO='loc-6c8717ea5f78426b9458';
const SAN_ISIDRO='loc-6c8717ea5f78426b9458-si';
const source=readFileSync('public/stock/gestlok-molino.js','utf8');
const owner=readFileSync('public/stock/gestlok-owner-areas.js','utf8');
const css=readFileSync('public/stock/gestlok-molino.css','utf8');
const now=new Date().toISOString();
const STATE={scope:'admin',day:now.slice(0,10),closed:false,
  prices:[{product:'Café con leche',amount:1000,active:true,updated_at:now}],
  envios:[{id:'e1',product:'Medialunas',quantity:24,created_at:now,acknowledged_at:null}],
  devoluciones:[{id:'d1',product:'Tostados',quantity:2,created_at:now,acknowledged_at:null}]};
const ORDERS={orders:[{id:'o1',request_id:'r1',product:'Budín',quantity:3,requested_at:now,seen_at:null}]};

async function homeFor(local,tenant=TENANT){
 const window={};
 const body={classList:{toggle(){}}};
 const document={addEventListener(){},getElementById(){return null;},body,
  createElement(){return {setAttribute(){},dataset:{}};},head:{appendChild(){}},querySelector(){return null;}};
 const calls=[];
 window.GestLokSupabase={rpc:async name=>{calls.push(name);return {data:name==='gestlok_molino_orders_state'?ORDERS:STATE,error:null};}};
 let renders=0;
 vm.runInNewContext(source,{window,document,navigator:{onLine:true},Intl,Date,setTimeout:()=>0,clearTimeout,clearInterval,setInterval:()=>0,
   Number,String,Array,Promise,Object,JSON});
 window.GestLokMolino.attach({S:{me:{tenant_id:tenant},local},role:()=> 'creadora',render:()=>{renders++;}});
 const first=window.GestLokMolino.homeHTML();
 await new Promise(r=>setImmediate(r));await new Promise(r=>setImmediate(r));
 return {first,html:window.GestLokMolino.homeHTML(),calls,renders};
}

test('Acassuso: avisos de envíos por confirmar, pedidos y devoluciones', async()=>{
 const {first,html,calls,renders}=await homeFor(ACASSUSO);
 assert.match(first,/Cargando los avisos de la sucursal/);
 assert.ok(calls.includes('gestlok_molino_state')&&calls.includes('gestlok_molino_orders_state'));
 assert.ok(renders>=1,'Al llegar los datos vuelve a dibujar el Inicio');
 assert.match(html,/Productos enviados/);assert.match(html,/1 por confirmar/);assert.match(html,/Confirmar recepción/);
 assert.match(html,/Hacer pedido/);assert.match(html,/Nueva devolución/);
 assert.match(html,/Últimos movimientos/);assert.match(html,/San Isidro envió 24 de Medialunas/);
 assert.match(html,/Precios compartidos/);
 // Sin el logo repetido ni la fila de botones del Vínculo.
 assert.doesNotMatch(html,/gl-molino-brand|gl-molino-home-actions/);
});

test('San Isidro: solo avisos de pedidos y devoluciones que manda Acassuso', async()=>{
 const {html}=await homeFor(SAN_ISIDRO);
 assert.match(html,/Pedidos de Acassuso/);assert.match(html,/Devoluciones de Acassuso/);
 assert.match(html,/Confirmar devoluciones/);
 assert.doesNotMatch(html,/Confirmar recepción|Hacer pedido|Nueva devolución|>Productos enviados</);
 assert.match(html,/gl-mol-dash-cards--2/);
});

test('Otra empresa o sin sucursal: no hay Inicio de El Molino', async()=>{
 assert.equal((await homeFor(ACASSUSO,'cb0dc04a-9a13-434f-a3d0-47f1d8f39670')).html,'');
 assert.equal((await homeFor(null)).html,'');
});

test('Inicio, gerentes y menú lateral usan el mismo diseño de El Molino', ()=>{
 assert.match(owner,/GestLokMolino\?\.homeHTML\?\.\(\)/);
 assert.match(css,/body\.gl-molino-tenant #side/);
 assert.match(css,/\.gl-mol-badge--alert/);
});

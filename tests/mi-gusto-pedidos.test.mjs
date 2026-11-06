import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const moduleSource=fs.readFileSync(new URL('../public/stock/mi-gusto-pedidos-clientes.js',import.meta.url),'utf8');
const mainSource=fs.readFileSync(new URL('../public/stock/app.js',import.meta.url),'utf8');
const sql=fs.readFileSync(new URL('../supabase/migrations/20261106204500_mi_gusto_pedidos_clientes_sucursales.sql',import.meta.url),'utf8');
const MG='cb0dc04a-9a13-434f-a3d0-47f1d8f39670';
function setup({tenant=MG,role='gerente',local='munro',locals=['munro']}={}){
  const handlers={};
  const calls=[];
  const data={munro:{local:'munro',whatsapp_number:'5491111111111',orders:[{
    id:'first',local:'munro',customer_name:'Cliente Munro',customer_phone:'11111111',items_detail:'6 carne',total:15000,payment_method:'efectivo',source:'manual',status:'nuevo',created_at:'2026-11-06T20:00:00Z'
  }]},torcuato:{local:'torcuato',whatsapp_number:'5491122222222',orders:[{
    id:'second',local:'torcuato',customer_name:'Cliente Torcuato',customer_phone:'22222222',items_detail:'6 pollo',total:16000,payment_method:'efectivo',source:'manual',status:'nuevo',created_at:'2026-11-06T20:00:00Z'
  }]}};
  const S={me:{tenant_id:tenant},local,view:'pedidos-clientes',ro:false,offline:false};
  const api={S,miRol:()=>role,misLocales:()=>locals,render:()=>{},toast:()=>{}};
  const window={confirm:()=>true,GestLokSupabase:{rpc:async(method,args)=>{
    calls.push({method,...args});
    if(method==='gestlok_mg_orders_catalog')return {data:[],error:null};
    if(method==='gestlok_mg_orders_receive'){
      const item=data[args.p_local]?.orders.find(o=>o.id===args.p_id&&o.status==='nuevo');
      if(!item)return {data:null,error:{message:'Pedido no encontrado o ya realizado.'}};
      item.status='recibido';item.received_at='2026-11-06T21:00:00Z';
      return {data:item,error:null};
    }
    return {data:data[args.p_local],error:null};
  }},GestLokCreatorSupport:{previewRol:()=>null},addEventListener:()=>{},removeEventListener:()=>{}};
  const document={addEventListener:(type,fn)=>{handlers[type]=fn;},hidden:false,activeElement:null};
  const sandbox={window,document,navigator:{onLine:true},setInterval:()=>1,clearInterval:()=>{},Intl,Date,console};
  vm.runInNewContext(moduleSource,sandbox,{filename:'mi-gusto-pedidos-clientes.js'});
  const orders=window.GestLokMiGustoOrders;
  orders.attach(api);
  return {orders,api,S,data,calls,handlers};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('módulo aislado: nunca habilita otras empresas ni colaboradores',()=>{
 const other=setup({tenant:'00000000-0000-0000-0000-000000000999'});
 assert.equal(other.orders.permitido(),false);
 const collaborator=setup({role:'colaborador'});
 assert.equal(collaborator.orders.permitido(),false);
 const manager=setup({role:'gerente',local:'torcuato',locals:['munro']});
 assert.equal(manager.orders.permitido(),false);
 assert.equal(setup().orders.permitido(),true);
});
test('números y pedidos distintos al cambiar de sucursal',async()=>{
 const s=setup({locals:['munro','torcuato']});
 s.orders.subscribe('munro',()=>{});
 await tick();
 assert.match(s.orders.view(),/Cliente Munro/);
 assert.match(s.orders.view(),/5491111111111/);
 assert.doesNotMatch(s.orders.view(),/Cliente Torcuato/);
 s.S.local='torcuato';
 s.orders.reset();
 s.orders.subscribe('torcuato',()=>{});
 await tick();
 assert.match(s.orders.view(),/Cliente Torcuato/);
 assert.match(s.orders.view(),/5491122222222/);
 assert.doesNotMatch(s.orders.view(),/Cliente Munro/);
 assert.deepEqual(s.calls.filter(c=>c.method==='gestlok_mg_orders_state').map(c=>c.p_local),['munro','torcuato']);
 assert.deepEqual(s.calls.filter(c=>c.method==='gestlok_mg_orders_catalog').map(c=>c.p_local),['munro','torcuato']);
});
test('escapa HTML aportado por clientes y no crea cobros automáticos',()=>{
 const s=setup();
 const card=s.orders._test.orderCard({id:'x',customer_name:'<img src=x onerror=alert(1)>',customer_phone:'123',items_detail:'<script>x</script>',notes:'<b>x</b>',total:1000,source:'manual',status:'nuevo',created_at:'2026-11-06T20:00:00Z'});
 assert.doesNotMatch(card,/<script>|<img|<b>x<\/b>/);
 assert.match(card,/&lt;script&gt;/);
 assert.match(mainSource,/puedeVerPedidosClientes/);
 assert.match(mainSource,/data-go="pedidos-clientes"/);
 assert.doesNotMatch(moduleSource,/gestlok_mg_online_save|stock_quantity|caja_register|pos_checkout/);
});
test('servidor preserva efectivo, validación de sucursal y recibidos irreversibles',()=>{
 assert.match(sql,/check\(payment_method='efectivo'\)/);
 assert.match(sql,/gestlok_mg_online_private\.authorized\(p_local\)/);
 assert.match(sql,/where id=p_id and local=p_local and status='nuevo'/);
 assert.match(sql,/unique\(local,source,external_message_id\)/);
 assert.match(sql,/revoke all on gestlok_mg_orders_private\.orders from public, anon, authenticated/);
 assert.match(sql,/p_local text,p_id uuid/);
});

test('Pedidos WhatsApp muestra Todos, Pendientes y Realizados sin mezclar estados',async()=>{
 const s=setup();
 s.data.munro.orders.push({
   id:'ok-2',local:'munro',customer_name:'Cliente realizado',customer_phone:'1133344455',
   items_detail:'1 docena',total:24000,payment_method:'efectivo',source:'whatsapp',
   status:'recibido',created_at:'2026-11-06T19:00:00Z',received_at:'2026-11-06T20:00:00Z'
 });
 s.orders.subscribe('munro',()=>{});await tick();
 const initial=s.orders.view();
 assert.match(initial,/Pedidos WhatsApp/);
 assert.match(initial,/Todos \(2\)/);
 assert.match(initial,/Pendientes \(1\)/);
 assert.match(initial,/Realizados \(1\)/);
 assert.match(initial,/Cliente Munro/);
 assert.doesNotMatch(initial,/Cliente realizado/);
 const clickTab=value=>s.handlers.click({target:{closest:q=>q==='[data-mgp-tab]'?{dataset:{mgpTab:value}}:null}});
 clickTab('todos');
 assert.match(s.orders.view(),/Cliente Munro/);
 assert.match(s.orders.view(),/Cliente realizado/);
 clickTab('realizados');
 assert.doesNotMatch(s.orders.view(),/Cliente Munro/);
 assert.match(s.orders.view(),/Cliente realizado/);
 clickTab('pendientes');
 assert.match(s.orders.view(),/Cliente Munro/);
 assert.doesNotMatch(s.orders.view(),/Cliente realizado/);
});

test('OK con tilde marca solo pedido visto por gerente autorizado y no registra cobro',async()=>{
 const s=setup({role:'gerente',local:'munro',locals:['munro']});
 s.orders.subscribe('munro',()=>{});await tick();
 assert.match(s.orders.view(),/OK · Vista/);
 s.handlers.click({target:{closest:q=>q==='[data-mgp-receive]'?{dataset:{mgpReceive:'first'}}:null}});
 await tick();await tick();
 assert.equal(s.data.munro.orders[0].status,'recibido');
 assert.equal(s.data.torcuato.orders[0].status,'nuevo');
 assert.equal(s.calls.filter(c=>c.method==='gestlok_mg_orders_receive').length,1);
 assert.match(s.orders.view(),/✓ OK · Realizado/);
 assert.match(s.orders.view(),/Visto:/);
 assert.doesNotMatch(s.orders.view(),/data-mgp-receive="first"/);
 assert.doesNotMatch(moduleSource,/gestlok_mg_online_save|stock_quantity|caja_register|pos_checkout/);
});

test('dueño puede marcar OK y colaborador o gerente sin sucursal no puede',()=>{
 const owner=setup({role:'dueno'});
 assert.match(owner.orders._test.orderCard({id:'a',status:'nuevo',customer_name:'Cliente',
    customer_phone:'111',items_detail:'1 producto',total:100,source:'whatsapp'}),/data-mgp-receive="a"/);
 const collaborator=setup({role:'colaborador'});
 assert.equal(collaborator.orders.permitido(),false);
 const managerOther=setup({role:'gerente',local:'torcuato',locals:['munro']});
 assert.equal(managerOther.orders.permitido(),false);
});

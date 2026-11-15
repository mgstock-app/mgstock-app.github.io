// Mi Gusto · Pedidos WhatsApp en Munro y Don Torcuato: sin carga manual, comanda completa,
// mensajes editables y conexión con Meta, cada sucursal con sus propios datos.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const moduleSource=fs.readFileSync(new URL('../public/stock/mi-gusto-pedidos-clientes.js',import.meta.url),'utf8');
const MG='cb0dc04a-9a13-434f-a3d0-47f1d8f39670';
const ORDER={id:'o1',local:'munro',order_number:1,order_code:'MG-001',customer_name:'María G.',customer_phone:'5491122223333',
 items_detail:'6 × Carne suave · $2000\n6 × Jamón y queso · $2000',items:[{id:'a',name:'Carne suave',price:2000,quantity:6},{id:'b',name:'Jamón y queso',price:2000,quantity:6}],
 units:12,total:24000,payment_method:'efectivo',source:'whatsapp',notes:'Sin cebolla',status:'nuevo',created_at:'2026-11-07T00:30:00Z'};
const SETTINGS={local:'munro',can_configure:true,
 settings:{welcome_text:'¡Bienvenido a Mi Gusto! 🥟\n\n¿Cómo podemos ayudarte?',option_order:'Hacer un pedido',option_prices:'Ver carta y precios',
  option_human:'Hablar con el local',human_text:'Ya te atiende alguien.',review_text:'Revisá tu pedido:',confirmed_text:'✅ ¡Pedido confirmado!'},
 meta_app:{app_id:null,config_id:null,has_app_secret:false,verify_token:'a1b2c3d4e5f60718293a4b5c6d7e8f9012ab',webhook_verified_at:null},
 connection:null,last_inbound_at:null,inbound_24h:0};
function setup({role='dueno',local='munro',locals=['munro'],settings=SETTINGS,catalog=[]}={}){
 const handlers={},calls=[];
 const data={munro:{local:'munro',whatsapp_number:'541171446654',orders:[structuredClone(ORDER)]},
  torcuato:{local:'torcuato',whatsapp_number:'541176617182',orders:[]}};
 const S={me:{tenant_id:MG},local,view:'pedidos-clientes',ro:false,offline:false};
 const api={S,miRol:()=>role,misLocales:()=>locals,render:()=>{},toast:()=>{}};
 const window={confirm:()=>true,SPM_CONFIG:{url:'https://vgsepaaewbctjsjcpeta.supabase.co'},
  GestLokSupabase:{rpc:async(method,args)=>{
   calls.push({method,...args});
   if(method==='gestlok_mg_orders_catalog')return {data:catalog,error:null};
   if(method==='gestlok_mg_whatsapp_settings')return {data:{...settings,local:args.p_local},error:null};
   if(method==='gestlok_mg_whatsapp_set_bot')return {data:{...settings,connection:{...settings.connection,bot_enabled:args.p_enabled}},error:null};
   if(method==='gestlok_mg_orders_state')return {data:data[args.p_local],error:null};
   return {data:null,error:null};
  }},GestLokCreatorSupport:{previewRol:()=>null},addEventListener:()=>{},removeEventListener:()=>{}};
 const document={addEventListener:(type,fn)=>{handlers[type]=fn;},removeEventListener:()=>{},hidden:false,activeElement:null,
  body:{appendChild(){}},getElementById:()=>null,createElement:()=>({setAttribute(){},classList:{toggle(){}},querySelector(){return null;},appendChild(){},remove(){}}),
  querySelector:()=>null,querySelectorAll:()=>[]};
 vm.runInNewContext(moduleSource,{window,document,navigator:{onLine:true},setInterval:()=>1,clearInterval:()=>{},setTimeout,Intl,Date,console,URL},{filename:'mi-gusto-pedidos-clientes.js'});
 const orders=window.GestLokMiGustoOrders;orders.attach(api);
 return {orders,api,S,calls,handlers,data};
}
const tick=()=>new Promise(r=>setImmediate(r));
const click=(s,attr,value)=>s.handlers.click({target:{closest:q=>q==='['+attr+']'?{dataset:{[attr.replace(/^data-/,'').replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]:value}}:null}});

test('Munro y Don Torcuato muestran panel de avisos separado, sin la configuración vieja de Meta',async()=>{
 for(const local of ['munro','torcuato']){
  const s=setup({local,locals:[local]});s.orders.subscribe(local,()=>{});await tick();await tick();
  const html=s.orders.view();
  assert.match(html,new RegExp('Vincular WhatsApp Business de '+(local==='munro'?'Munro':'Don Torcuato')));
  assert.match(html,/Avisos de WhatsApp Business/);
  assert.doesNotMatch(html,/Conexión con WhatsApp Business \(Meta\)|Mensajes automáticos de WhatsApp|Guardar datos de Meta/);
  assert.doesNotMatch(html,/Registrar pedido manualmente|mgp-order-form/);
  assert.match(html,/No hay avisos pendientes/);
 }
});
test('La comanda anterior sigue accesible, con sus datos completos',async()=>{
 const s=setup({role:'gerente'});s.orders.subscribe('munro',()=>{});await tick();await tick();
 const html=s.orders.view();
 for(const text of [/#MG-001/,/María G\./,/\+54 9 11 2222-3333/,/https:\/\/wa\.me\/5491122223333/,
 /<b>6 ×<\/b> Carne suave/,/Observaciones:<\/b> Sin cebolla/,/12 unidades/,/Total: \$\s?24\.000/,/✓ OK · Vista/]){
  assert.match(html,text);
 }
 assert.match(html,/Pedidos históricos \(1\)/);
});
test('Solo dueña y administradora generan la clave de un local; gerente ve los avisos',async()=>{
 for(const local of ['munro','torcuato']){
  const dueña=setup({local,locals:[local]});dueña.orders.subscribe(local,()=>{});await tick();await tick();
  assert.match(dueña.orders.view(),/data-mgp-mobile-key/);
  const gerente=setup({role:'gerente',local,locals:[local]});gerente.orders.subscribe(local,()=>{});await tick();await tick();
  assert.match(gerente.orders.view(),/data-mgp-mobile-key/);
  assert.match(gerente.orders.view(),/Avisos de WhatsApp Business/);
 }
});
test('La configuración incluye JSON por sucursal y aclara el límite de notificaciones',async()=>{
 const m=setup();m.orders.subscribe('munro',()=>{});await tick();await tick();
 assert.match(m.orders.view(),/&quot;local&quot;:&quot;munro&quot;/);
 assert.match(m.orders.view(),/\{not_title\}/);
 assert.match(m.orders.view(),/No garantiza detectar un pedido confirmado/);
 const t=setup({local:'torcuato',locals:['torcuato']});t.orders.subscribe('torcuato',()=>{});await tick();await tick();
 assert.match(t.orders.view(),/&quot;local&quot;:&quot;torcuato&quot;/);
 assert.doesNotMatch(t.orders.view(),/&quot;local&quot;:&quot;munro&quot;/);
});
test('No registra ventas ni expone credenciales en el navegador',()=>{
 assert.doesNotMatch(moduleSource,/service_role|SERVICE_ROLE|app_secret_id|decrypted/);
 assert.doesNotMatch(moduleSource,/gestlok_mg_online_save|stock_quantity|caja_register|pos_checkout/);
});

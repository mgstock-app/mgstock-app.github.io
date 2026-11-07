// Munro · Pedidos WhatsApp: sin carga manual, comanda completa, mensajes editables y conexión con Meta.
// Don Torcuato conserva su pantalla (carga interna incluida) hasta que se habilite.
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
   if(method==='gestlok_mg_whatsapp_settings')return args.p_local==='munro'?{data:settings,error:null}:{data:null,error:{message:'no'}};
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

test('Munro no tiene carga manual de pedidos; Don Torcuato sin cambios',async()=>{
 const m=setup();m.orders.subscribe('munro',()=>{});await tick();await tick();
 assert.doesNotMatch(m.orders.view(),/Registrar pedido manualmente|mgp-order-form/);
 const t=setup({local:'torcuato',locals:['torcuato']});t.orders.subscribe('torcuato',()=>{});await tick();await tick();
 assert.match(t.orders.view(),/Registrar pedido manualmente/);
 assert.doesNotMatch(t.orders.view(),/Mensajes automáticos de WhatsApp|Conexión con WhatsApp Business/);
 assert.equal(t.calls.filter(c=>c.method==='gestlok_mg_whatsapp_settings').length,0,'Torcuato no consulta la configuración nueva');
});

test('la comanda muestra N.º, cliente, teléfono, fecha, productos, cantidades, observaciones y total',async()=>{
 const s=setup({role:'gerente'});s.orders.subscribe('munro',()=>{});await tick();await tick();
 const html=s.orders.view();
 assert.match(html,/#MG-001/);
 assert.match(html,/María G\./);
 assert.match(html,/\+54 9 11 2222-3333/);
 assert.match(html,/href="https:\/\/wa\.me\/5491122223333"/);
 assert.match(html,/<b>6 ×<\/b> Carne suave/);
 assert.match(html,/<b>6 ×<\/b> Jamón y queso/);
 assert.match(html,/12 unidades/);
 assert.match(html,/Observaciones:<\/b> Sin cebolla/);
 assert.match(html,/Total: \$\s?24\.000/);
 assert.match(html,/Pago únicamente en efectivo/);
 assert.match(html,/✓ OK · Vista/);
 assert.match(html,/Pendientes \(1\)/);
});

test('mensajes editables y conexión con Meta: solo dueño o administradora en Munro',async()=>{
 const owner=setup();owner.orders.subscribe('munro',()=>{});await tick();await tick();
 const html=owner.orders.view();
 assert.match(html,/Mensajes automáticos de WhatsApp/);
 assert.match(html,/name="welcome_text"[^>]*>¡Bienvenido a Mi Gusto! 🥟/);
 for(const k of ['option_order','option_prices','option_human'])assert.match(html,new RegExp('name="'+k+'" maxlength="20"'));
 assert.match(html,/value="Ver carta y precios"/);
 assert.match(html,/data-mgp-preview="option_human">Hablar con el local/);
 assert.match(html,/Conexión con WhatsApp Business \(Meta\)/);
 assert.match(html,/https:\/\/vgsepaaewbctjsjcpeta\.supabase\.co\/functions\/v1\/mi-gusto-whatsapp/);
 assert.match(html,/a1b2c3d4e5f60718293a4b5c6d7e8f9012ab/);
 assert.match(html,/name="app_secret" type="password"/);
 assert.match(html,/data-mgp-connect disabled/,'sin datos de Meta el botón no se habilita');
 assert.match(html,/Pendiente: conectar este número/);
 const manager=setup({role:'gerente'});manager.orders.subscribe('munro',()=>{});await tick();await tick();
 const mh=manager.orders.view();
 assert.doesNotMatch(mh,/Mensajes automáticos de WhatsApp|Conexión con WhatsApp Business|a1b2c3d4e5f6/);
 assert.match(mh,/Pendiente: conectar este número/);
});

test('estado conectado y activar respuestas solo con carta cargada',async()=>{
 const connected={...SETTINGS,meta_app:{...SETTINGS.meta_app,app_id:'1234567890',config_id:'9876543210',has_app_secret:true,webhook_verified_at:'2026-11-07T01:00:00Z'},
  connection:{display_phone:'+54 9 11 7144-6654',verified_name:'Mi Gusto Munro',is_on_biz_app:true,platform_type:'CLOUD_API',bot_enabled:false,connected_at:'2026-11-07T01:10:00Z',last_event_at:null,sync_status:{}}};
 const empty=setup({settings:connected});empty.orders.subscribe('munro',()=>{});await tick();await tick();
 const html=empty.orders.view();
 assert.match(html,/✓ Conectado con Meta · sigue funcionando en la app del teléfono/);
 assert.match(html,/Respuestas automáticas: <b>desactivadas<\/b>/);
 assert.match(html,/✓ Meta verificó el webhook/);
 assert.match(html,/data-mgp-connect >Volver a conectar|data-mgp-connect\s*>Volver a conectar/);
 click(empty,'data-mgp-bot','on');await tick();
 assert.equal(empty.calls.filter(c=>c.method==='gestlok_mg_whatsapp_set_bot').length,0,'sin productos no se activa');
 assert.match(empty.orders.view(),/Cargá al menos un producto/);
 const ready=setup({settings:connected,catalog:[{id:'p1',name:'Carne suave',price:2000,active:true}]});
 ready.orders.subscribe('munro',()=>{});await tick();await tick();
 click(ready,'data-mgp-bot','on');await tick();await tick();
 assert.deepEqual(ready.calls.filter(c=>c.method==='gestlok_mg_whatsapp_set_bot').map(c=>[c.p_local,c.p_enabled]),[['munro',true]]);
});

test('productos ocultos se pueden volver a mostrar en WhatsApp',async()=>{
 const s=setup({catalog:[{id:'p2',name:'Humita',price:1900,active:false}]});
 s.orders.subscribe('munro',()=>{});await tick();await tick();
 assert.match(s.orders.view(),/Oculto de WhatsApp/);
 click(s,'data-mgp-enable','p2');await tick();await tick();
 const call=s.calls.find(c=>c.method==='gestlok_mg_orders_catalog_save');
 assert.deepEqual([call.p_local,call.p_id,call.p_name,call.p_price],['munro','p2','Humita',1900]);
});

test('el navegador nunca maneja tokens de Meta ni la clave de servicio',()=>{
 assert.doesNotMatch(moduleSource,/access_token|service_role|client_secret/);
 assert.match(moduleSource,/featureType:'whatsapp_business_app_onboarding'/);
 assert.match(moduleSource,/response_type:'code'/);
 assert.match(moduleSource,/host!=='facebook\.com'&&!host\.endsWith\('\.facebook\.com'\)/);
 assert.match(moduleSource,/functions\.invoke\('mi-gusto-whatsapp'/);
});

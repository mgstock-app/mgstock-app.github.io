import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const script=fs.readFileSync(new URL('../public/stock/mi-gusto-pedidos-clientes.js',import.meta.url),'utf8');
const sql=fs.readFileSync(new URL('../supabase/migrations/20261115022000_munro_android_whatsapp_bridge.sql',import.meta.url),'utf8');
const edge=fs.readFileSync(new URL('../supabase/functions/mi-gusto-android-alert/index.ts',import.meta.url),'utf8');
const alert={id:'11111111-1111-4111-8111-111111111111',status:'pendiente',created_at:'2026-11-15T02:10:00Z'};

function make(role='gerente',local='munro'){
 const handlers={};const calls=[];
 const document={
  addEventListener:(k,f)=>{handlers[k]=f},removeEventListener(){},hidden:false,activeElement:null,
  querySelector(){return null},querySelectorAll(){return []},getElementById(){return null},
  createElement(){return {dataset:{},setAttribute(){},appendChild(){},remove(){},classList:{toggle(){}}}},
  body:{appendChild(){}}
 };
 const window={
  confirm:()=>true,addEventListener(){},removeEventListener(){},
  GestLokCreatorSupport:{previewRol:()=>null},
  SPM_CONFIG:{url:'https://vgsepaaewbctjsjcpeta.supabase.co'},
  GestLokSupabase:{rpc:async(name,args)=>{
   calls.push({name,args});
   if(name==='gestlok_mg_orders_state')return {data:{local,whatsapp_number:'541170000000',orders:[]},error:null};
   if(name==='gestlok_mg_orders_catalog')return {data:[],error:null};
   if(name==='gestlok_mg_whatsapp_settings')return {data:null,error:null};
   if(name==='gestlok_mg_android_bridge_state')return {data:{configured:true,last_event_at:alert.created_at,alerts:[alert]},error:null};
   if(name==='gestlok_mg_android_bridge_ack')return {data:true,error:null};
   if(name==='gestlok_mg_android_bridge_create')return {data:{ok:true,token:'b'.repeat(64)},error:null};
   return {data:null,error:null};
  }}
 };
 vm.runInNewContext(script,{window,document,navigator:{onLine:true},setInterval:()=>1,clearInterval:()=>{},setTimeout,Intl,Date,console,URL});
 const api={S:{me:{tenant_id:'cb0dc04a-9a13-434f-a3d0-47f1d8f39670'},local,view:'pedidos-clientes',ro:false,offline:false},
  miRol:()=>role,misLocales:()=>[local],render(){},toast(){}};
 const mod=window.GestLokMiGustoOrders;mod.attach(api);
 return {mod,api,calls,handlers};
}
const tick=()=>new Promise(r=>setImmediate(r));
test('Alerta Android aparece en Pedidos WhatsApp, atajos y contador para gerente de Munro',async()=>{
 const m=make();m.mod.subscribe('munro',()=>{});
 await tick();await tick();
 const html=m.mod.view();
 assert.match(html,/Avisos de WhatsApp Business/);
 assert.match(html,/Revisar conversación en WhatsApp de Munro/);
 assert.match(html,/No significa pedido confirmado/);
 assert.match(html,/data-mgp-mobile-ack="11111111-1111-4111-8111-111111111111"/);
 assert.match(m.mod.navBadge(),/>1<\/span>/);
 assert.match(m.mod.quickAccess(),/avisos para revisar/);
 assert.equal(m.mod.pendingCount(),0,'la señal no se contabiliza falsamente como pedido');
 assert.ok(m.calls.some(c=>c.name==='gestlok_mg_android_bridge_state'&&c.args.p_local==='munro'));
});
test('Gerente ve alertas sin permiso para crear clave; la dueña sí puede configurar',async()=>{
 const gerente=make('gerente');gerente.mod.subscribe('munro',()=>{});await tick();await tick();
 assert.match(gerente.mod.view(),/Conectar avisos del celular/);
 assert.doesNotMatch(gerente.mod.view(),/data-mgp-mobile-key/);
 const duena=make('dueno');duena.mod.subscribe('munro',()=>{});await tick();await tick();
 assert.match(duena.mod.view(),/data-mgp-mobile-key/);
 assert.match(duena.mod.view(),/X-Gestlok-Bridge-Key/);
 assert.match(duena.mod.view(),/mi-gusto-android-alert/);
});
test('Avisos del teléfono solo aplican a Munro, no contaminan Don Torcuato',async()=>{
 const torcuato=make('gerente','torcuato');torcuato.mod.subscribe('torcuato',()=>{});await tick();await tick();
 assert.doesNotMatch(torcuato.mod.view(),/Avisos desde el celular|Revisar conversación en WhatsApp de Munro/);
 assert.ok(!torcuato.calls.some(x=>x.name==='gestlok_mg_android_bridge_state'));
});
test('Servidor recibe señal genérica autenticada, no copia chats ni crea pedidos',()=>{
 assert.match(sql,/gestlok_mg_orders_private\.allowed\(p_local\)/);
 assert.match(sql,/public\.mi_rol\(\) not in \('dueno','creadora'\)/);
 assert.match(sql,/encode\(sha256\(convert_to\(p_token,'UTF8'\)\),'hex'\)/);
 assert.match(sql,/grant execute on function public\.gestlok_mg_android_bridge_ingest\(text,text\) to service_role/);
 assert.match(edge,/x-gestlok-bridge-key/);
 assert.doesNotMatch(edge,/\bmessages\b|\bcustomer_name\b|\bitems_detail\b/);
});

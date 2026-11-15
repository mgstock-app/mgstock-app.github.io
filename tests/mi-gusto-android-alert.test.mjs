import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const script=fs.readFileSync(new URL('../public/stock/mi-gusto-pedidos-clientes.js',import.meta.url),'utf8');
const sql=fs.readFileSync(new URL('../supabase/migrations/20261115022000_munro_android_whatsapp_bridge.sql',import.meta.url),'utf8');
const sqlBoth=fs.readFileSync(new URL('../supabase/migrations/20261115131500_mi_gusto_whatsapp_alertas_dos_locales.sql',import.meta.url),'utf8');
const sqlManager=fs.readFileSync(new URL('../supabase/migrations/20261115154500_mi_gusto_gerente_vinculo_whatsapp_alertas.sql',import.meta.url),'utf8');
const edge=fs.readFileSync(new URL('../supabase/functions/mi-gusto-android-alert/index.ts',import.meta.url),'utf8');
const alert={id:'11111111-1111-4111-8111-111111111111',status:'pendiente',created_at:'2026-11-15T02:10:00Z',customer_phone:'5491122233344'};

function make(role='gerente',local='munro',assignedLocals=[local]){
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
  miRol:()=>role,misLocales:()=>assignedLocals,render(){},toast(){}};
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
 assert.equal(m.mod.pendingCount(),1,'el contador de notificaciones debe incluir los avisos Android');
 assert.match(html,/\+54 9 11 2223-3344|\+5491122233344/);
 assert.match(html,/Copiar número/);
 assert.ok(m.calls.some(c=>c.name==='gestlok_mg_android_bridge_state'&&c.args.p_local==='munro'));
});
test('Gerente autorizado puede generar vínculo de su local, sin editar el número',async()=>{
 for(const loc of ['munro','torcuato']){
  const gerente=make('gerente',loc);gerente.mod.subscribe(loc,()=>{});await tick();await tick();
  const html=gerente.mod.view();
  assert.match(html,/data-mgp-mobile-key/);
  assert.match(html,/X-Gestlok-Bridge-Key/);
  assert.doesNotMatch(html,/mgp-number-form/,'el gerente no administra el número de WhatsApp');
 }
 const dueña=make('dueno');dueña.mod.subscribe('munro',()=>{});await tick();await tick();
 assert.match(dueña.mod.view(),/data-mgp-mobile-key/);
 const ajeno=make('gerente','torcuato',['munro']);ajeno.mod.subscribe('torcuato',()=>{});await tick();
 assert.doesNotMatch(ajeno.mod.view(),/data-mgp-mobile-key/);
 assert.equal(ajeno.mod.permitido(),false,'no se autoriza otro local');
 const colaborador=make('colaborador');assert.equal(colaborador.mod.permitido(),false);
});

test('Torcuato recibe sus propios avisos, sin contaminar Munro',async()=>{
 const t=make('gerente','torcuato');t.mod.subscribe('torcuato',()=>{});await tick();await tick();
 const html=t.mod.view();
 assert.match(html,/Revisar conversación en WhatsApp de Don Torcuato/);
 assert.match(html,/Vincular WhatsApp Business de Don Torcuato/);
 assert.match(html,/Copiar número/);
 assert.ok(t.calls.some(x=>x.name==='gestlok_mg_android_bridge_state'&&x.args.p_local==='torcuato'));
 assert.doesNotMatch(html,/Revisar conversación en WhatsApp de Munro/);
});

test('Servidor recibe señal genérica autenticada, no copia chats ni crea pedidos',()=>{
 assert.match(sql,/gestlok_mg_orders_private\.allowed\(p_local\)/);
 assert.match(sql,/public\.mi_rol\(\) not in \('dueno','creadora'\)/);
 assert.match(sql,/encode\(sha256\(convert_to\(p_token,'UTF8'\)\),'hex'\)/);
 assert.match(sql,/grant execute on function public\.gestlok_mg_android_bridge_ingest\(text,text\) to service_role/);
 assert.match(edge,/x-gestlok-bridge-key/);
 assert.doesNotMatch(edge,/\bmessages\b|\bcustomer_name\b|\bitems_detail\b/);
});

test('La migración separa las claves y guarda solo número, nunca textos del chat',()=>{
 assert.match(sqlBoth,/local in \('munro','torcuato'\)/);
 assert.match(sqlBoth,/customer_phone text/);
 assert.match(sqlBoth,/gestlok_mg_android_bridge_ingest_v2/);
 assert.match(sqlBoth,/where local=p_local and enabled for update/);
 assert.match(sqlBoth,/where id=p_id and local=p_local and status='pendiente'/);
 assert.match(sqlBoth,/to service_role/);
 assert.match(edge,/p_customer_phone:phone/);
 assert.doesNotMatch(sqlBoth,/customer_name|message_text|items_detail/);
});

test('Crear clave en servidor: gerente restringido por sucursal real, sin exponer otros permisos',()=>{
 assert.match(sqlManager,/gestlok_mg_orders_private\.allowed\(p_local\)/);
 assert.match(sqlManager,/public\.mi_rol\(\) not in \('dueno','creadora','gerente'\)/);
 assert.match(sqlManager,/revoke all on function public\.gestlok_mg_android_bridge_create\(text\)/);
 assert.doesNotMatch(sqlManager,/grant execute on function public\.gestlok_mg_android_bridge_ingest_v2/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const script=fs.readFileSync(new URL('../public/stock/mi-gusto-pedidos-clientes.js',import.meta.url),'utf8');
const sql=fs.readFileSync(new URL('../supabase/migrations/20261115022000_munro_android_whatsapp_bridge.sql',import.meta.url),'utf8');
const sqlBoth=fs.readFileSync(new URL('../supabase/migrations/20261115131500_mi_gusto_whatsapp_alertas_dos_locales.sql',import.meta.url),'utf8');
const sqlManager=fs.readFileSync(new URL('../supabase/migrations/20261115154500_mi_gusto_gerente_vinculo_whatsapp_alertas.sql',import.meta.url),'utf8');
const edge=fs.readFileSync(new URL('../supabase/functions/mi-gusto-android-alert/index.ts',import.meta.url),'utf8');
const sqlHistory=fs.readFileSync(new URL('../supabase/migrations/20261115172500_mi_gusto_avisos_whatsapp_historial.sql',import.meta.url),'utf8');
const alert={id:'11111111-1111-4111-8111-111111111111',status:'pendiente',created_at:'2026-11-15T02:10:00Z',customer_phone:'5491122233344'};
const reviewed={id:'22222222-2222-4222-8222-222222222222',status:'visto',created_at:'2026-11-14T02:00:00Z',seen_at:'2026-11-14T02:30:00Z',customer_phone:'5491122244455'};

function make(role='gerente',local='munro',assignedLocals=[local]){
 const handlers={};const calls=[];const qrCalls=[];
 const document={
  addEventListener:(k,f)=>{handlers[k]=f},removeEventListener(){},hidden:false,activeElement:null,
  querySelector(){return null},querySelectorAll(){return []},getElementById(){return null},
  createElement(){return {dataset:{},setAttribute(){},appendChild(){},remove(){},classList:{toggle(){}}}},
  body:{appendChild(){}}
 };
 const window={
  confirm:()=>true,addEventListener(){},removeEventListener(){},
  qrcode:()=>({addData:v=>qrCalls.push(v),make(){},getModuleCount:()=>3,isDark:(r,c)=>r===c}),
  GestLokCreatorSupport:{previewRol:()=>null},
  SPM_CONFIG:{url:'https://vgsepaaewbctjsjcpeta.supabase.co'},
  GestLokSupabase:{rpc:async(name,args)=>{
   calls.push({name,args});
   if(name==='gestlok_mg_orders_state')return {data:{local,whatsapp_number:'541170000000',orders:[]},error:null};
   if(name==='gestlok_mg_orders_catalog')return {data:[],error:null};
   if(name==='gestlok_mg_whatsapp_settings')return {data:null,error:null};
   if(name==='gestlok_mg_android_bridge_state')return {data:{configured:true,last_event_at:alert.created_at,alerts:[alert],reviewed:[reviewed]},error:null};
   if(name==='gestlok_mg_android_bridge_ack')return {data:true,error:null};
   if(name==='gestlok_mg_android_bridge_create')return {data:{ok:true,token:'b'.repeat(64)},error:null};
   return {data:null,error:null};
  }}
 };
 vm.runInNewContext(script,{window,document,navigator:{onLine:true},setInterval:()=>1,clearInterval:()=>{},setTimeout,Intl,Date,console,URL});
 const api={S:{me:{tenant_id:'cb0dc04a-9a13-434f-a3d0-47f1d8f39670'},local,view:'pedidos-clientes',ro:false,offline:false},
  miRol:()=>role,misLocales:()=>assignedLocals,render(){},toast(){}};
 const mod=window.GestLokMiGustoOrders;mod.attach(api);
 return {mod,api,calls,handlers,qrCalls};
}
const tick=()=>new Promise(r=>setImmediate(r));
const clickSection=(m,section)=>m.handlers.click({target:{closest:q=>q==='[data-mgp-section]'?{dataset:{mgpSection:section}}:null}});
const clickFilter=(m,filter)=>m.handlers.click({target:{closest:q=>q==='[data-mgp-alert-filter]'?{dataset:{mgpAlertFilter:filter}}:null}});
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
  clickSection(gerente,'vinculacion');
  const html=gerente.mod.view();
  assert.match(html,/data-mgp-mobile-key/);
  assert.match(html,/X-Gestlok-Bridge-Key/);
  assert.doesNotMatch(html,/mgp-number-form/,'el gerente no administra el número de WhatsApp');
 }
 const dueña=make('dueno');dueña.mod.subscribe('munro',()=>{});await tick();await tick();
 clickSection(dueña,'vinculacion');
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
 assert.match(html,/data-mgp-section="vinculacion"/);
 assert.match(html,/Copiar número/);
 assert.ok(t.calls.some(x=>x.name==='gestlok_mg_android_bridge_state'&&x.args.p_local==='torcuato'));
 assert.doesNotMatch(html,/Revisar conversación en WhatsApp de Munro/);
});

test('Pestaña Avisos separa pendientes y revisados sin perder avisos al marcar OK',async()=>{
 const m=make('gerente','torcuato');m.mod.subscribe('torcuato',()=>{});await tick();await tick();
 assert.match(m.mod.view(),/data-mgp-section="avisos" aria-current="page"/);
 assert.match(m.mod.view(),/Pendientes/);
 assert.match(m.mod.view(),/data-mgp-mobile-ack="11111111-1111-4111-8111-111111111111"/);
 assert.doesNotMatch(m.mod.view(),/Clave \(única visualización\)/);
 clickFilter(m,'revisados');
 const html=m.mod.view();
 assert.match(html,/22222222-2222-4222-8222-222222222222/);
 assert.match(html,/✓ Revisado/);
 assert.doesNotMatch(html,/data-mgp-mobile-ack/);
 assert.equal(m.mod.pendingCount(),1,'revisados no generan contador de avisos pendientes');
 clickSection(m,'vinculacion');
 assert.match(m.mod.view(),/Conectar avisos del WhatsApp Business de Don Torcuato/);
 assert.doesNotMatch(m.mod.view(),/mgp-mobile-alert-item/);
 clickSection(m,'avisos');
 assert.match(m.mod.view(),/data-mgp-section="avisos" aria-current="page"/);
});
test('RPC del historial restringe resultados a la sucursal real y no expone conversaciones',()=>{
 assert.match(sqlHistory,/gestlok_mg_orders_private\.allowed\(p_local\)/);
 assert.match(sqlHistory,/where local=p_local and status='visto'/);
 assert.match(sqlHistory,/where local=p_local and status='pendiente'/);
 assert.match(sqlHistory,/revoke all on function public\.gestlok_mg_android_bridge_state\(text\)/);
 assert.doesNotMatch(sqlHistory,/message_text|items_detail|service_role/);
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

test('QR propio de GESTLOK es legible, específico del local y nunca lleva la clave privada',async()=>{
 for(const loc of ['munro','torcuato']){
  const m=make('gerente',loc);m.mod.subscribe(loc,()=>{});await tick();await tick();
  clickSection(m,'vinculacion');
  const html=m.mod.view();
  const url='https://gestlok.com.ar/vincular-whatsapp/?local='+loc;
  assert.match(html,/Escanear QR de GESTLOK/);
  assert.ok(html.includes('href="'+url+'"'));
  assert.match(html,/<svg[^>]*aria-label="QR de configuración de /);
  assert.equal(m.qrCalls.at(-1),url);
  assert.doesNotMatch(m.qrCalls.join('|'),/b{64}/,'la clave de vínculo no se comparte por QR');
  assert.match(html,/Un QR no puede conectar WhatsApp Business directamente/);
 }
 const ajeno=make('gerente','torcuato',['munro']);
 assert.doesNotMatch(ajeno.mod.view(),/Escanear QR de GESTLOK/);
});

test('Guía pública del QR valida sucursal y no publica ni solicita claves en el enlace',()=>{
 const page=fs.readFileSync(new URL('../public/vincular-whatsapp/index.html',import.meta.url),'utf8');
 assert.match(page,/Object.prototype.hasOwnProperty.call\(locals,local\)/);
 assert.match(page,/X-Gestlok-Bridge-Key/);
 assert.match(page,/WhatsApp Business/);
 assert.match(page,/customer_phone:'\{not_title\}'/);
 assert.match(page,/navigator.clipboard.writeText/);
 assert.doesNotMatch(page,/token=|bridge_key=|localStorage/);
});

test('Vínculo sin falsa conexión: solo una nueva notificación valida la prueba de Munro',async()=>{
 const m=make('gerente','munro');m.mod.subscribe('munro',()=>{});
 await tick();await tick();clickSection(m,'vinculacion');
 const initial=m.mod.view();
 assert.match(initial,/data-mgp-mobile-test/);
 assert.doesNotMatch(initial,/Conectado para avisos/);
 m.mod._test.beginMobileBridgeTest();
 assert.match(m.mod.view(),/Esperando señal nueva del Android de Munro/);
 const old=new Date(Date.now()-120000).toISOString();
 m.mod._test.acceptMobileAlerts({configured:true,last_event_at:old,alerts:[],reviewed:[]},'munro');
 assert.doesNotMatch(m.mod.view(),/Conectado para avisos/,'una señal vieja no confirma la conexión');
 const fresh=new Date(Date.now()+1000).toISOString();
 m.mod._test.acceptMobileAlerts({configured:true,last_event_at:fresh,alerts:[],reviewed:[]},'munro');
 assert.match(m.mod.view(),/Conectado para avisos: se recibió una nueva señal de Munro/);
 assert.doesNotMatch(m.mod.view(),/señal de Don Torcuato/);
});

test('La prueba de vinculación se aísla entre Munro y Torcuato',async()=>{
 const m=make('gerente','torcuato');m.mod.subscribe('torcuato',()=>{});
 await tick();await tick();clickSection(m,'vinculacion');
 m.mod._test.beginMobileBridgeTest();
 m.mod._test.acceptMobileAlerts({configured:true,last_event_at:new Date(Date.now()+2000).toISOString(),alerts:[],reviewed:[]},'munro');
 assert.doesNotMatch(m.mod.view(),/Conectado para avisos/);
 m.mod._test.acceptMobileAlerts({configured:true,last_event_at:new Date(Date.now()+3000).toISOString(),alerts:[],reviewed:[]},'torcuato');
 assert.match(m.mod.view(),/Conectado para avisos: se recibió una nueva señal de Don Torcuato/);
});

test('Botones de prueba muestran progreso y resultado visible sin señal nueva',async()=>{
 const m=make('gerente','munro');m.mod.subscribe('munro',()=>{});
 await tick();await tick();clickSection(m,'vinculacion');
 m.mod._test.beginMobileBridgeTest();
 const started=m.mod.view();
 assert.match(started,/Prueba iniciada para Munro/);
 assert.match(started,/data-mgp-mobile-check/);
 const event={target:{closest:selector=>selector==='[data-mgp-mobile-check]'?{}:null}};
 m.handlers.click(event);
 assert.match(m.mod.view(),/Comprobando si llegó una señal nueva/);
 assert.match(m.mod.view(),/Comprobando…/);
 await tick();await tick();
 const checked=m.mod.view();
 assert.match(checked,/Comprobación 1: todavía no llegó ninguna señal nueva de Munro/);
 assert.match(checked,/Revisá en MacroDroid el registro de la macro/);
 assert.ok(m.calls.some(x=>x.name==='gestlok_mg_android_bridge_state'));
 m.handlers.click(event);await tick();await tick();
 assert.match(m.mod.view(),/Comprobación 2:/,'cada pulsación muestra una respuesta nueva');
});

test('Asistente QR tiene tres etapas, conserva privacidad y aclara el límite de las notificaciones',()=>{
 const page=fs.readFileSync(new URL('../public/vincular-whatsapp/index.html',import.meta.url),'utf8');
 assert.match(page,/data-stage="1"/);
 assert.match(page,/data-stage="2" hidden/);
 assert.match(page,/data-stage="3" hidden/);
 assert.match(page,/showStep\(n\)/);
 assert.match(page,/El QR no conecta WhatsApp por sí solo/);
 assert.match(page,/Iniciar prueba de conexión/);
 assert.match(page,/Comprobar señal/);
 assert.match(page,/Cada sucursal conserva su número, su clave privada y sus avisos independientes/);
 assert.doesNotMatch(page,/\+54 11 7144|\+54 11 7661/,'el QR público no debe incluir los números privados');
});

test('Descarga de MacroDroid: exportación nativa por sucursal con HTTP POST y JSON preconfigurados',async()=>{
 for(const loc of ['munro','torcuato']){
  const m=make('gerente',loc);m.mod.subscribe(loc,()=>{});await tick();await tick();
  clickSection(m,'vinculacion');
  assert.match(m.mod.view(),/Descargar macro preparada para /);
  assert.match(m.mod.view(),/data-mgp-mobile-download/);
  const key='b'.repeat(64);
  const exported=m.mod._test.buildAndroidMacro(loc,key,'PEDIDO DERIVADO');
  assert.equal(exported.macroExportVersion,1);
  assert.equal(exported.macro.m_enabled,false,'se exige revisión y permiso antes de habilitar la macro');
  assert.equal(exported.macro.m_category,'GESTLOK');
  assert.match(exported.macro.m_name,new RegExp(loc==='munro'?'Munro':'Don Torcuato'));
  const trigger=exported.macro.m_triggerList[0];
  assert.equal(trigger.m_classType,'NotificationTrigger');
  assert.equal(trigger.m_packageNameList[0],'com.whatsapp.w4b');
  assert.equal(trigger.m_textContent,'PEDIDO DERIVADO');
  assert.equal(trigger.m_supressMultiples,true);
  const action=exported.macro.m_actionList[0];
  assert.equal(action.m_classType,'HttpRequestAction');
  assert.equal(action.requestConfig.requestType,1,'POST en el ejemplo nativo de MacroDroid');
  assert.match(action.requestConfig.urlToOpen,/\/functions\/v1\/mi-gusto-android-alert$/);
  assert.equal(action.requestConfig.contentType,'application/json');
  assert.equal(JSON.parse(action.requestConfig.contentBodyText).local,loc);
  assert.equal(JSON.parse(action.requestConfig.contentBodyText).customer_phone,'{not_title}');
  const headers=action.requestConfig.headerParams;
  assert.equal(headers.find(h=>h.paramName==='X-Gestlok-Bridge-Key')?.paramValue,key);
  assert.equal(headers.find(h=>h.paramName==='Content-Type')?.paramValue,'application/json');
  assert.equal(new Set([exported.macro.m_GUID,trigger.m_SIGUID,action.m_SIGUID]).size,3);
  assert.ok(!m.qrCalls.join('').includes(key),'la clave jamás debe codificarse en el QR público');
 }
});

test('Se impide generar macros con claves inválidas o de locales desconocidos',()=>{
 const m=make();
 assert.throws(()=>m.mod._test.buildAndroidMacro('otro','b'.repeat(64)),/Vínculo de sucursal inválido/);
 assert.throws(()=>m.mod._test.buildAndroidMacro('munro','clave-invalida'),/Vínculo de sucursal inválido/);
});
test('El asistente QR separa la importación privada del enlace público',()=>{
 const page=fs.readFileSync(new URL('../public/vincular-whatsapp/index.html',import.meta.url),'utf8');
 assert.match(page,/¿Ya tenés MacroDroid instalado\?/);
 assert.match(page,/Descargar macro preparada/);
 assert.match(page,/la clave no viaja en el QR/);
 assert.match(page,/una sesión autorizada/);
 assert.doesNotMatch(page,/b{64}|macrodroid:\/\/|bridge_key=/);
});

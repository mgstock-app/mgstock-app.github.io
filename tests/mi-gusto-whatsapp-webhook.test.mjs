// Ejecuta la Edge Function real (supabase/functions/mi-gusto-whatsapp/index.ts) con Meta y Supabase simulados.
// Recorrido: cliente escribe → bienvenida editable → pedido confirmado con N.º → GESTLOK; conexión por coexistencia.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHmac} from 'node:crypto';
import vm from 'node:vm';
import * as nodeModule from 'node:module';

const source=readFileSync(new URL('../supabase/functions/mi-gusto-whatsapp/index.ts',import.meta.url),'utf8');
async function toJs(src){
 if(typeof nodeModule.stripTypeScriptTypes==='function'){
  process.removeAllListeners('warning');
  return nodeModule.stripTypeScriptTypes(src);
 }
 const ts=(await import('typescript')).default;
 return ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
}
const js=(await toJs(source)).replace(/^import\s*\{\s*createClient\s*\}\s*from\s*"npm:@supabase\/supabase-js@[^"]+";?/m,'const {createClient}=__deps;');
assert.match(js,/const \{createClient\}=__deps;/,'la función importa supabase-js');

const SECRET='0123456789abcdef0123456789abcdef';
const VERIFY='a1b2c3d4e5f60718293a4b5c6d7e8f9012ab';
const PHONE='555444333222111';
const TOKEN='EAAG-token-munro-0123456789';
const JWT='eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1MSJ9.firma-de-prueba';
const TEXTS={welcome_text:'¡Bienvenido a Mi Gusto! 🥟\n\n¿Cómo podemos ayudarte?',option_order:'Hacer un pedido',
 option_prices:'Ver carta y precios',option_human:'Hablar con el local',human_text:'Ya te atiende alguien del local.',
 review_text:'Revisá tu pedido antes de confirmarlo:',confirmed_text:'✅ ¡Pedido confirmado! Ya lo recibió Mi Gusto Munro.'};

function load(over={}){
 const state={enabled:true,secret:SECRET,display:'+54 9 11 7144-6654',sendFail:false,turns:[],sent:[],saved:null,verified:false,
  nextTurn:()=>({type:'welcome',texts:TEXTS,duplicate:false,sent:false}),...over};
 const env={SUPABASE_URL:'https://demo.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'service-key',SUPABASE_ANON_KEY:'anon-key',...(over.env||{})};
 const calls={rpc:[],fetch:[]};
 const createClient=(url,key,opts)=>({rpc:async(name,args)=>{
  const auth=opts?.global?.headers?.Authorization||'';
  calls.rpc.push({name,args,key,auth});
  switch(name){
   case 'gestlok_mg_whatsapp_server_config':return {data:{app_id:'1234567890',verify_token:VERIFY,app_secret:state.secret},error:null};
   case 'gestlok_mg_whatsapp_webhook_verified':state.verified=true;return {data:true,error:null};
   case 'gestlok_mg_whatsapp_route':return {data:args.p_phone_number_id===PHONE?{local:'munro',token:TOKEN,enabled:state.enabled}:null,error:null};
   case 'gestlok_mg_whatsapp_turn':state.turns.push(args);return {data:state.nextTurn(args),error:null};
   case 'gestlok_mg_whatsapp_sent':state.sent.push(args);return {data:true,error:null};
   case 'gestlok_mg_whatsapp_can_connect':
    return key==='anon-key'&&auth==='Bearer '+JWT?{data:{ok:true,expected_number:args.p_local==='torcuato'?'541176617182':'541171446654',user_id:'u1'},error:null}:{data:null,error:{message:'denied'}};
   case 'gestlok_mg_whatsapp_connection_save':state.saved=args;return {data:{ok:true},error:null};
   default:return {data:null,error:{message:'rpc desconocida '+name}};
  }
 }});
 const reply=(status,body)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
 const fetchImpl=async(url,init)=>{
  calls.fetch.push({url:String(url),init,body:init?.body?JSON.parse(init.body):null});
  const u=String(url);
  if(u.includes('/oauth/access_token'))return reply(200,{access_token:'EAAG-business-token-abcdefghijklmnop'});
  if(u.includes('/'+PHONE+'?fields='))return reply(200,{display_phone_number:state.display,verified_name:'Mi Gusto Munro',is_on_biz_app:true,platform_type:'CLOUD_API',id:PHONE});
  if(u.endsWith('/subscribed_apps'))return reply(200,{success:true});
  if(u.endsWith('/smb_app_data'))return reply(200,{success:true});
  if(u.endsWith('/messages'))return state.sendFail?reply(400,{error:{code:131047,message:'Re-engagement message'}}):reply(200,{messages:[{id:'wamid.out'}]});
  return reply(404,{error:{message:'no simulado'}});
 };
 let handler=null;
 const sandbox={
  Deno:{env:{get:k=>env[k]},serve:fn=>{handler=fn;}},__deps:{createClient},fetch:fetchImpl,
  Response,Request,Headers,URL,TextEncoder,TextDecoder,crypto:globalThis.crypto,Intl,AbortController,
  setTimeout,clearTimeout,console:{error(){},log(){}},Uint8Array,JSON,Number,String,Array,Object,Date,Error,
  Boolean,Math,encodeURIComponent,parseInt,Promise
 };
 vm.runInNewContext(js,sandbox,{filename:'mi-gusto-whatsapp/index.ts'});
 assert.equal(typeof handler,'function','Deno.serve registrado');
 return {handler,state,calls};
}
const URL_FN='https://demo.supabase.co/functions/v1/mi-gusto-whatsapp';
function metaPost(payload,{secret=SECRET,signature}={}){
 const body=JSON.stringify(payload);
 const sig=signature??('sha256='+createHmac('sha256',secret).update(body).digest('hex'));
 return new Request(URL_FN,{method:'POST',headers:{'content-type':'application/json','x-hub-signature-256':sig},body});
}
function inbound(msg,{phone=PHONE,field='messages'}={}){
 return {object:'whatsapp_business_account',entry:[{id:'waba',changes:[{field,value:{
  messaging_product:'whatsapp',metadata:{display_phone_number:'5491171446654',phone_number_id:phone},
  contacts:[{wa_id:'5491122223333',profile:{name:'María G.'}}],
  messages:[{id:msg.id||'wamid.IN1',from:'5491122223333',timestamp:'1',...msg}]}}]}]};
}

test('Meta verifica el webhook con el token de GESTLOK, sin encender el bot',async()=>{
 const {handler,state}=load({enabled:false});
 const ok=await handler(new Request(URL_FN+'?hub.mode=subscribe&hub.verify_token='+VERIFY+'&hub.challenge=1158201444'));
 assert.equal(ok.status,200);assert.equal(await ok.text(),'1158201444');assert.equal(state.verified,true);
 const bad=await handler(new Request(URL_FN+'?hub.mode=subscribe&hub.verify_token=otro&hub.challenge=1'));
 assert.equal(bad.status,403);
});

test('sin firma válida de Meta no se procesa nada',async()=>{
 const {handler,state,calls}=load();
 const r1=await handler(metaPost(inbound({type:'text',text:{body:'hola'}}),{signature:'sha256='+'0'.repeat(64)}));
 assert.equal(r1.status,403);
 const r2=await handler(metaPost(inbound({type:'text',text:{body:'hola'}}),{secret:'otro-secreto'}));
 assert.equal(r2.status,403);
 assert.equal(state.turns.length,0);assert.equal(calls.fetch.length,0);
 const noSecret=load({secret:''});
 assert.equal((await noSecret.handler(metaPost(inbound({type:'text',text:{body:'hola'}})))).status,503);
});

test('bot apagado o número desconocido: 200 sin responder (el local atiende desde el teléfono)',async()=>{
 const off=load({enabled:false});
 const r=await off.handler(metaPost(inbound({type:'text',text:{body:'hola'}})));
 assert.equal(r.status,200);assert.equal(off.state.turns.length,0);assert.equal(off.calls.fetch.length,0);
 const other=load();
 await other.handler(metaPost(inbound({type:'text',text:{body:'hola'}},{phone:'999999999999'})));
 assert.equal(other.state.turns.length,0);
});

test('coexistencia: historial, contactos y ecos de la app se aceptan sin generar pedidos',async()=>{
 const {handler,state,calls}=load();
 for(const field of ['history','smb_app_state_sync','smb_message_echoes','account_update']){
  const r=await handler(metaPost(inbound({type:'text',text:{body:'hola'}},{field})));
  assert.equal(r.status,200,field);
 }
 assert.equal(state.turns.length,0);assert.equal(calls.fetch.length,0);
});

test('cliente escribe: bienvenida con los textos y opciones editables de Munro',async()=>{
 const {handler,state,calls}=load();
 const r=await handler(metaPost(inbound({type:'text',text:{body:'Hola'}})));
 assert.equal(r.status,200);
 assert.deepEqual(JSON.parse(JSON.stringify(state.turns[0])),{p_local:'munro',p_sender:'5491122223333',p_message_id:'wamid.IN1',p_text:'Hola',p_profile_name:'María G.'});
 const sent=calls.fetch.find(f=>f.url.endsWith('/'+PHONE+'/messages'));
 assert.ok(sent,'respuesta enviada a Meta');
 assert.match(sent.url,/^https:\/\/graph\.facebook\.com\/v25\.0\//);
 assert.equal(sent.init.headers.Authorization,'Bearer '+TOKEN);
 assert.equal(sent.body.to,'5491122223333');
 assert.equal(sent.body.interactive.type,'button');
 assert.equal(sent.body.interactive.body.text,TEXTS.welcome_text);
 assert.deepEqual(sent.body.interactive.action.buttons.map(b=>b.reply.title),['Hacer un pedido','Ver carta y precios','Hablar con el local']);
 assert.deepEqual(sent.body.interactive.action.buttons.map(b=>b.reply.id),['mi:order','mi:prices','mi:human']);
 assert.deepEqual(JSON.parse(JSON.stringify(state.sent)),[{p_local:'munro',p_message_id:'wamid.IN1'}]);
});

test('botones y listas de WhatsApp llegan como comandos; cantidad con lista',async()=>{
 const {handler,state,calls}=load({nextTurn:()=>({type:'quantity',name:'Carne suave',price:2000})});
 await handler(metaPost(inbound({id:'wamid.L1',type:'interactive',interactive:{type:'list_reply',list_reply:{id:'mi:product:abc',title:'Carne suave'}}})));
 assert.equal(state.turns[0].p_text,'mi:product:abc');
 const list=calls.fetch.at(-1).body.interactive;
 assert.equal(list.type,'list');
 assert.match(list.body.text,/Carne suave/);
 assert.deepEqual(list.action.sections[0].rows.map(r=>r.id),['mi:qty:1','mi:qty:2','mi:qty:3','mi:qty:4','mi:qty:6','mi:qty:12','mi:qty:18','mi:qty:24']);
 assert.ok(list.action.sections[0].rows.every(r=>r.title.length<=24));
 await handler(metaPost(inbound({id:'wamid.B1',type:'interactive',interactive:{type:'button_reply',button_reply:{id:'mi:confirm',title:'Confirmar pedido'}}})));
 assert.equal(state.turns[1].p_text,'mi:confirm');
});

test('resumen y confirmación: total, solo efectivo, observaciones y N.º MG-001',async()=>{
 const cart=[{id:'1',name:'Carne suave',price:2000,quantity:6},{id:'2',name:'Jamón y queso',price:2000,quantity:6}];
 const review=load({nextTurn:()=>({type:'review',cart,total:24000,name:'María G.',notes:'Sin cebolla',texts:TEXTS})});
 await review.handler(metaPost(inbound({type:'interactive',interactive:{type:'button_reply',button_reply:{id:'mi:nonotes'}}})));
 const body=review.calls.fetch.at(-1).body.interactive;
 assert.match(body.body.text,/^Revisá tu pedido antes de confirmarlo:/);
 assert.match(body.body.text,/6 × Carne suave/);
 assert.match(body.body.text,/Total: \$\s?24\.000/);
 assert.match(body.body.text,/PAGO SOLO EN EFECTIVO/);
 assert.match(body.body.text,/Observaciones: Sin cebolla/);
 assert.ok(body.body.text.length<=1024);
 assert.deepEqual(body.action.buttons.map(b=>b.reply.id),['mi:confirm','mi:edit','mi:cancel']);
 const done=load({nextTurn:()=>({type:'confirmed',order_code:'MG-001',order_number:1,total:24000,texts:TEXTS})});
 await done.handler(metaPost(inbound({type:'interactive',interactive:{type:'button_reply',button_reply:{id:'mi:confirm'}}})));
 const msg=done.calls.fetch.at(-1).body.text.body;
 assert.match(msg,/^✅ ¡Pedido confirmado! Ya lo recibió Mi Gusto Munro\./);
 assert.match(msg,/N\.º MG-001/);
 assert.match(msg,/Pago: efectivo/);
});

test('reintento de Meta del mismo mensaje ya respondido: no se repite el envío',async()=>{
 const {handler,calls,state}=load({nextTurn:()=>({type:'confirmed',order_code:'MG-001',duplicate:true,sent:true})});
 const r=await handler(metaPost(inbound({type:'text',text:{body:'x'}})));
 assert.equal(r.status,200);assert.equal(calls.fetch.length,0);assert.equal(state.sent.length,0);
});

test('si Meta rechaza el envío se pide reintento (503) sin exponer el token',async()=>{
 const errors=[];
 const {handler}=load({sendFail:true});
 const r=await handler(metaPost(inbound({type:'text',text:{body:'hola'}})));
 assert.equal(r.status,503);
 const text=await r.text();
 assert.doesNotMatch(text,new RegExp(TOKEN));
 assert.equal(errors.length,0);
});

test('conexión desde GESTLOK: solo dueño/administradora, número propio de cada sucursal y token en Vault',async()=>{
 const connect=(body,{origin='https://gestlok.com.ar',jwt=JWT}={})=>new Request(URL_FN,{method:'POST',headers:{
  origin,'content-type':'application/json','x-gestlok-action':'connect',authorization:'Bearer '+jwt,apikey:'anon-key'},
  body:JSON.stringify(body)});
 const good={local:'munro',code:'AQBhlXsctMxJYbwbrpybxlo9tLPGy-QAmjBJA03jxLos43w',waba_id:'111222333444555',phone_number_id:PHONE};
 const pre=load();
 const opt=await pre.handler(new Request(URL_FN,{method:'OPTIONS',headers:{origin:'https://gestlok.com.ar'}}));
 assert.equal(opt.status,204);assert.equal(opt.headers.get('access-control-allow-origin'),'https://gestlok.com.ar');
 assert.equal((await pre.handler(connect(good,{origin:'https://otro.com'}))).status,403);
 assert.equal((await pre.handler(connect({...good,local:'palermo'}))).status,403,'solo sucursales de Mi Gusto');
 const cross=load();
 const x=await cross.handler(connect({...good,local:'torcuato'}));
 assert.equal(x.status,409,'el número de Munro no se puede conectar en Don Torcuato');
 assert.match((await x.json()).error,/no es el de Don Torcuato/);
 assert.equal(cross.state.saved,null);
 const tor=load({display:'+54 9 11 7661-7182'});
 const tr=await tor.handler(connect({...good,local:'torcuato'}));
 assert.equal(tr.status,200,'Don Torcuato se conecta con su propio número');
 assert.equal(tor.state.saved.p_local,'torcuato');
 const denied=load();
 assert.equal((await denied.handler(connect(good,{jwt:'eyJhbGciOiJIUzI1NiJ9.otro.usuario-sin-permiso'}))).status,403);
 assert.equal(denied.state.saved,null);
 const wrong=load({display:'+54 9 11 7661-7182'});
 const w=await wrong.handler(connect(good));
 assert.equal(w.status,409);assert.equal(wrong.state.saved,null,'otro número: no se guarda nada');
 const ok=load();
 const res=await ok.handler(connect(good));
 const out=await res.json();
 assert.equal(res.status,200,JSON.stringify(out));
 assert.equal(out.ok,true);assert.equal(out.is_on_biz_app,true);
 assert.deepEqual(out.sync,{smb_app_state_sync:'ok',history:'ok'});
 assert.doesNotMatch(JSON.stringify(out),/EAAG|client_secret|0123456789abcdef/);
 const urls=ok.calls.fetch.map(f=>f.url.replace('https://graph.facebook.com/v25.0',''));
 assert.match(urls[0],/^\/oauth\/access_token\?client_id=1234567890&client_secret=0123456789abcdef0123456789abcdef&code=AQB/);
 assert.ok(urls.includes('/111222333444555/subscribed_apps'));
 assert.equal(urls.filter(u=>u==='/'+PHONE+'/smb_app_data').length,2);
 assert.deepEqual(ok.calls.fetch.filter(f=>f.url.endsWith('/smb_app_data')).map(f=>f.body.sync_type),['smb_app_state_sync','history']);
 assert.equal(ok.state.saved.p_local,'munro');
 assert.equal(ok.state.saved.p_phone_number_id,PHONE);
 assert.equal(ok.state.saved.p_token,'EAAG-business-token-abcdefghijklmnop');
 assert.equal(ok.state.saved.p_is_on_biz_app,true);
 assert.ok(ok.calls.rpc.filter(c=>c.name==='gestlok_mg_whatsapp_connection_save').every(c=>c.key==='service-key'));
});

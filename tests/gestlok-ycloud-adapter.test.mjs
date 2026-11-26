import test from 'node:test';import assert from 'node:assert/strict';import {previewWhatsApp,projectWhatsApp,selectPreviewOption,completePreviewProduct,checkoutPreview} from '../supabase/functions/gestlok-ycloud-adapter/preview.mjs';
const sucursal={nombre:'Local ficticio',empresa:'Empresa ficticia',slug:'prueba',acepta_retiro:true,acepta_envio:false,medios_pago:['efectivo']};
const catalogo={categorias:[{id:'c1',nombre:'Empanadas'}],productos:[{id:'p1',categoria_id:'c1',nombre:'Empanada ficticia',precio:1000,activo:true,disponible:true,opciones:[]},{id:'p2',categoria_id:'c1',nombre:'Agotado ficticio',precio:2000,activo:true,disponible:false,opciones:[]}]};
test('reutiliza motor real para bienvenida y carta sin enviar mensajes',async()=>{const r=await previewWhatsApp({sucursal,catalogo,entrada:{inicio:true}});assert.ok(r.projection.messages.length);assert.equal(r.projection.sendAllowed,false);const p=projectWhatsApp({mensajes:[{tipo:'carta',categoria:'c1'}]},catalogo);assert.equal(p.options.length,1);assert.match(p.options[0].label,/Empanada ficticia/);assert.deepEqual(selectPreviewOption(p,'1'),{boton:'elegir:p1:1'});assert.equal(selectPreviewOption(p,'99'),null);});
test('no simula que las opciones obligatorias o los datos ya están resueltos',()=>{const p=projectWhatsApp({mensajes:[{tipo:'producto'},{tipo:'datos'}],accion:{tipo:'crear_pedido'}},catalogo);assert.deepEqual(p.pending,['selector_producto','formulario_datos','accion_crear_pedido']);assert.equal(p.sendAllowed,false);});
test('reclamo no ejecuta IA ni crea tickets reales',async()=>{const p=await previewWhatsApp({sucursal,catalogo,entrada:{boton:'hablar_gerente'}});assert.equal(p.projection.sendAllowed,false);assert.ok(p.projection.pending.includes('derivacion_humana'));});

test('promoción exige todas las variedades y salsas, sin saltar cantidades ni agotados',()=>{
 const cat={...catalogo,productos:[...catalogo.productos,{id:'promo',nombre:'Pack ficticio',precio:5000,activo:true,disponible:true,opciones:[{id:'emp',nombre:'Empanadas',tipo:'cantidad',total:6,valores:[{id:'carne',nombre:'Carne',producto_id:'p1'},{id:'agotada',nombre:'Agotada',producto_id:'p2'}]},{id:'salsas',nombre:'Salsas',tipo:'cantidad',total:2,valores:[{id:'ajo',nombre:'Ajo'}]}]}]};
 const projection=projectWhatsApp({mensajes:[{tipo:'producto',productos:['promo'],cantidad:1}]},cat);
 assert.equal(projection.selectors[0].groups[0].values.length,1);
 const base={projection,catalogo:cat,lotId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'};
 const run=options=>completePreviewProduct({...base,selection:{productId:'promo',quantity:1,options}});
 assert.equal(run({emp:{carne:6}}).ok,false);
 assert.equal(run({emp:{carne:5,agotada:1},salsas:{ajo:2}}).ok,false);
 assert.equal(run({emp:{carne:6},salsas:{ajo:1}}).ok,false);
 const r=run({emp:{carne:6},salsas:{ajo:2}});assert.equal(r.ok,true);assert.equal(r.estimatedTotal,5000);assert.equal(r.entry.agregar_varios[0].producto_id,'promo');
 assert.equal(completePreviewProduct({...base,selection:{productId:'p1',quantity:1,options:{}}}).ok,false);
});

test('checkout ficticio respeta retiro, entrega, pagos y confirmación explícita',()=>{
 const s={...sucursal,acepta_envio:true,medios_pago_envio:['efectivo','transferencia'],medios_pago_retiro:['debito']};
 const estado={carrito:[{producto_id:'p1',cantidad:2,opciones:{}}]};
 const base={sucursal:s,catalogo,estado};const datos={entrega:'envio',nombre:'Persona ficticia',telefono:'+5491100000000',direccion:'Calle ficticia 123',medio_pago:'efectivo'};
 assert.equal(checkoutPreview(base).field,'entrega');
 assert.equal(checkoutPreview({...base,datos:{...datos,telefono:'123'}}).stage,'review');
 assert.equal(checkoutPreview({...base,datos:{...datos,direccion:''}}).field,'direccion');
 assert.equal(checkoutPreview({...base,datos:{...datos,medio_pago:'debito'}}).field,'medio_pago');
 assert.equal(checkoutPreview({...base,datos}).field,'efectivo_abona');
 const complete={...datos,efectivo_abona:'5000'};
 const review=checkoutPreview({...base,datos:complete});assert.equal(review.stage,'confirm');assert.equal(review.action,undefined);
 const result=checkoutPreview({...base,datos:complete,confirmed:true});assert.equal(result.stage,'preview_order');assert.equal(result.action.tipo,'crear_pedido');assert.equal(result.sendAllowed,false);assert.equal(result.estimatedProductsTotal,2000);
 assert.equal(checkoutPreview({...base,datos:{...complete,entrega:'retiro'}}).field,'medio_pago');
});


import {conversationPreview} from '../supabase/functions/gestlok-ycloud-adapter/conversation.mjs';
const ident={empresa:'empresa-ficticia',sucursal:'local-ficticio',phone:'+5491100000000'};
const s2={...sucursal,acepta_envio:true,medios_pago:['efectivo','debito','transferencia'],medios_pago_envio:['efectivo','transferencia'],medios_pago_retiro:['debito']};
const cat2={...catalogo,productos:[...catalogo.productos,{id:'pack',categoria_id:'c1',nombre:'Pack ficticio',precio:5000,activo:true,disponible:true,opciones:[
 {id:'emp',nombre:'Empanadas',tipo:'cantidad',total:6,valores:[{id:'carne',nombre:'Carne',producto_id:'p1'},{id:'queso',nombre:'Queso'},{id:'agotada',nombre:'Agotada',producto_id:'p2'}]},
 {id:'salsa',nombre:'Salsas',tipo:'cantidad',total:2,valores:[{id:'ajo',nombre:'Ajo'},{id:'criolla',nombre:'Criolla'}]},
 {id:'beb',nombre:'Bebida',tipo:'una',obligatorio:true,valores:[{id:'agua',nombre:'Agua'}]}
]}]};
function client(overrides={}){
 let session,last,n=0;
 const ctx={identity:ident,sucursal:s2,catalogo:cat2,...overrides};
 async function say(text,opts={}){
  const r=await conversationPreview({...ctx,session,event:{id:'evt-'+(++n),text},...opts});
  session=JSON.parse(JSON.stringify(r.session));last=r;return r;
 }
 async function pick(id,opts={}){const o=last.options.find(o=>o.id===id);assert.ok(o,'opción '+id+' en '+JSON.stringify(last.options));return say(String(o.number),opts);}
 return {say,pick,get last(){return last;},get session(){return session;}};
}
async function fillProduct(u){
 await u.say('Hola');await u.pick('carta');await u.pick('elegir:pack:1');await u.say('1');
 assert.equal(u.session.stage,'flavor');assert.ok(!u.last.options.some(o=>o.id==='agotada'));
 await u.pick('carne');await u.say('7');assert.equal(u.session.stage,'flavor_qty');await u.say('4');
 await u.pick('queso');await u.say('2');await u.pick('ajo');await u.say('1');await u.pick('criolla');await u.say('1');
 await u.pick('v:agua');assert.equal(u.session.stage,'product_review');await u.pick('add');
 assert.equal(u.session.engine.carrito[0].producto_id,'pack');
}
async function fillCheckout(u,entrega='envio'){
 await u.pick('finalizar');assert.equal(u.session.stage,'checkout');await u.pick(entrega);
 await u.say('Persona ficticia');
 if(entrega==='envio'){await u.say('Calle ficticia 123');await u.pick('efectivo');await u.say('1000');assert.equal(u.session.field,'efectivo_abona');await u.say('7000');}
 else await u.pick('debito');
 assert.equal(u.session.stage,'confirm');assert.equal(u.last.action,undefined);
}
test('conversación completa por mensajes: promoción, delivery, cambio y revisión, sin efectos externos',async()=>{
 const u=client();await fillProduct(u);await fillCheckout(u);
 const r=await u.pick('confirm');
 assert.equal(r.action.type,'simulated_order');assert.equal(r.action.pedido.entrega,'envio');
 assert.equal(r.action.pedido.telefono,ident.phone);assert.deepEqual(r.action.pedido.items[0].opciones,{emp:{carne:4,queso:2},salsa:{ajo:1,criolla:1},beb:['agua']});
 assert.equal(r.sendAllowed,false);assert.equal(r.action.pedido.efectivo_abona,'7000');
 const repeated=await u.say('1',{event:{id:r.action.idempotencyKey,text:'1'}});
 assert.equal(repeated.duplicate,true);assert.equal(repeated.action,undefined);
 const again=await u.say('1');assert.equal(again.action,undefined);
});
test('retiro en otra sucursal, verificando precio antes de confirmar y sin mezclar sesiones',async()=>{
 const identity={...ident,sucursal:'otra-sucursal'};
 const u=client({identity});await fillProduct(u);await fillCheckout(u,'retiro');
 const changed={...cat2,productos:cat2.productos.map(p=>p.id==='pack'?{...p,precio:6000}:p)};
 const review=await u.pick('confirm',{catalogo:changed});assert.equal(review.action,undefined);assert.equal(review.session.stage,'confirm');
 assert.ok(review.messages.some(m=>m.includes('6.000')));
 const r=await u.pick('confirm',{catalogo:changed});assert.equal(r.action.pedido.medio_pago,'debito');assert.equal(r.action.pedido.direccion,'');
 await assert.rejects(conversationPreview({identity:ident,sucursal:s2,catalogo:cat2,session:u.session,event:{id:'other',text:'1'}}),/otra conversación/);
});
test('no pierde productos fuera de la primera página ni duplica selecciones por reintento',async()=>{
 const catalogo={categorias:[{id:'c1',nombre:'Carta'}],productos:Array.from({length:35},(_,i)=>({id:'p'+i,categoria_id:'c1',nombre:'Opción '+(i+1),precio:1000,opciones:[]}))};
 const u=client({catalogo});await u.say('Hola');await u.pick('carta');
 for(let i=0;i<4;i++)await u.say('Siguiente');
 await u.pick('elegir:p34:1');await u.say('2');const r=await u.pick('add');
 assert.equal(r.session.engine.carrito[0].cantidad,2);
 const event={id:r.session.seen.at(-1),text:'1'};const repeated=await u.say('1',{event});
 assert.equal(repeated.duplicate,true);assert.equal(repeated.session.engine.carrito[0].cantidad,2);
});
test('rechaza stock cambiado durante la revisión y mínimo incumplido',async()=>{
 const u=client();await fillProduct(u);await fillCheckout(u);
 const changed={...cat2,productos:cat2.productos.map(p=>p.id==='pack'?{...p,disponible:false}:p)};
 const r=await u.pick('confirm',{catalogo:changed});assert.equal(r.action,undefined);assert.equal(r.session.stage,'menu');
 assert.match(r.messages.join(' '),/no está disponible/);
 const bad=checkoutPreview({sucursal:{...s2,pedido_minimo:6000},catalogo:cat2,estado:{carrito:[{producto_id:'p1',cantidad:1,opciones:{}}]}});
 assert.equal(bad.stage,'review');
});

import {createOfflinePilot} from '../supabase/functions/gestlok-ycloud-adapter/pilot.mjs';
test('ensayo de webhook YCloud, dos sucursales, duplicados concurrentes y bandeja pendiente',async()=>{
 const a={waba:'waba-ficticia',to:'+5491100000001',empresa:'empresa-a',sucursal:'local-a',senders:[ident.phone],config:s2,catalogo};
 const b={...a,empresa:'empresa-b',sucursal:'local-b',to:'+5491100000002'};
 const pilot=createOfflinePilot([a,b]);
 let seq=0,last;
 const payload=(route,text)=>({id:'evt-'+(++seq),type:'whatsapp.inbound_message.received',apiVersion:'v2',whatsappInboundMessage:{id:'msg-'+seq,wamid:'wamid.'+seq,wabaId:route.waba,to:route.to,from:ident.phone,type:'text',text:{body:text}}});
 async function say(text,route=a){last=await pilot.receive(payload(route,text));assert.ok(last.accepted);assert.equal(last.sendAllowed,false);return last;}
 async function pick(id){const o=last.options.find(x=>x.id===id);assert.ok(o,id);return say(String(o.number));}
 const welcome=payload(a,'Hola'); const responses=await Promise.all([pilot.receive(welcome),pilot.receive({...welcome,id:'other-event'})]);
 assert.equal(responses.filter(x=>x.accepted).length,1);assert.equal(responses.filter(x=>x.reason==='duplicate').length,1);
 assert.equal((await pilot.receive({...welcome,type:'whatsapp.smb.history'})).accepted,false);
 const foreign=payload(a,'Hola');foreign.whatsappInboundMessage.from='+5491100000003';assert.equal((await pilot.receive(foreign)).accepted,false);
 const grp=payload(a,'Hola');grp.whatsappInboundMessage.groupId='grupo-ficticio';assert.equal((await pilot.receive(grp)).accepted,false);
 last=responses.find(x=>x.accepted);
 await pick('carta');await pick('elegir:p1:1');await say('2');await pick('add');await pick('finalizar');await pick('retiro');await say('Persona ficticia');await pick('debito');await pick('confirm');
 assert.equal(pilot.listPending({empresa:a.empresa,sucursal:a.sucursal}).length,1);
 assert.equal(pilot.listPending({empresa:b.empresa,sucursal:b.sucursal}).length,0);
 assert.equal(pilot.listPending({empresa:b.empresa,sucursal:a.sucursal}).length,0);
 const welcomeB=await say('Hola',b);assert.equal(welcomeB.stage,'menu');
 const pedido=pilot.listPending({empresa:a.empresa,sucursal:a.sucursal})[0];assert.equal(pedido.status,'pendiente');assert.equal(pedido.pedido.items[0].cantidad,2);
});
test('consulta habitual de demora no deriva automáticamente a gerente',async()=>{
 const u=client({sucursal:{...s2,demora_envio:'30 minutos'}});
 const r=await u.say('¿Cuánto tarda?');assert.equal(r.session.stage,'menu');assert.match(r.messages.join('\n'),/30 minutos/);
 const next=await u.pick('reclamo_demora');assert.equal(next.session.stage,'handoff');assert.equal(next.action.type,'simulated_handoff');assert.equal(next.action.reason,'demora');assert.notEqual(next.action.detail,'1');
});
test('calcula envío y descuento de efectivo antes de aceptar el monto entregado',()=>{
 const estado={carrito:[{producto_id:'p1',cantidad:2,opciones:{}}]};
 const datos={entrega:'envio',nombre:'Persona ficticia',telefono:ident.phone,direccion:'Calle ficticia',medio_pago:'efectivo',efectivo_abona:'2000'};
 const base={sucursal:{...s2,envio_costo:500,descuento_efectivo_pct:10,descuento_efectivo_entrega:'envio'},catalogo,estado};
 assert.equal(checkoutPreview({...base,datos}).field,'efectivo_abona');
 const r=checkoutPreview({...base,datos:{...datos,efectivo_abona:'2300'}});assert.equal(r.stage,'confirm');assert.equal(r.estimatedTotal,2300);
});
test('IA opcional simulada solo se usa cuando el motor guiado no entiende, y nunca crea un pedido',async()=>{
 let calls=0;
 const u=client({privado:{ia_activa:true},iaSimulada:async url=>{
  assert.equal(url,'https://mock.invalid');calls++;
  return {ok:true,json:async()=>({choices:[{message:{content:'Respuesta de IA ficticia.'}}]})};
 }});
 await u.say('Hola');assert.equal(calls,0);
 const r=await u.say('zzz qqq xxx');
 assert.equal(calls,1);assert.match(r.messages.join('\n'),/IA ficticia/);assert.equal(r.action,undefined);assert.equal(r.sendAllowed,false);
});

import {verifyYCloudSignature,createSignedYCloudBridge,createSupabasePilotStore} from '../supabase/functions/gestlok-ycloud-adapter/bridge.mjs';
test('puente firmado: verifica HMAC real, rutas aisladas, no envía y tolera reintentos',async()=>{
 const secret='ficticio-supersecreto-1234567890';
 const timestamp=Math.floor(Date.now()/1000),route={empresa:'empresa-a',sucursal:'sucursal-a',sucursalId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  slug:'local-a',waba:'waba-a',to:'+5491100000001',allowSenders:[ident.phone]};
 const records=new Map(),events=new Set();
 const store={
  async load({scope}){const x=records.get(scope);return {revision:x?.revision||0,state:x?.state||null,sucursal:s2,catalogo,privado:{ia_activa:false}};},
  async commit({scope,revision,messageId,eventId,state,order}){
   if(events.has(eventId)||events.has(messageId))return {status:'duplicate'};
   const previous=records.get(scope);
   if(revision!==(previous?.revision||0))return {status:'conflict'};
   assert.equal(order,null);
   records.set(scope,{state,revision:revision+1});events.add(eventId);events.add(messageId);
   return {status:'committed',revision:revision+1};
  }
 };
 const content={id:'evento-1',type:'whatsapp.inbound_message.received',apiVersion:'v2',whatsappInboundMessage:{id:'mensaje-1',wabaId:'waba-a',from:ident.phone,to:route.to,type:'text',text:{body:'Hola'}}};
 const sign=async x=>{
  const raw=JSON.stringify(x),key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const sig=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(timestamp+'.'+raw));
  return {raw,signature:'t='+timestamp+',s='+Buffer.from(sig).toString('hex')};
 };
 const packet=await sign(content);
 assert.equal(await verifyYCloudSignature({...packet,secret,now:timestamp*1000}),true);
 assert.equal(await verifyYCloudSignature({...packet,secret:'falso',now:timestamp*1000}),false);
 assert.equal(await verifyYCloudSignature({...packet,secret,now:(timestamp+400)*1000}),false);
 assert.equal((await createSignedYCloudBridge({secret,routes:[route],store})({...packet})).status,'disabled');
 const accept=createSignedYCloudBridge({secret,routes:[route],store,enabled:true});
 assert.equal((await accept(packet)).status,'accepted');
 assert.equal((await accept(packet)).status,'duplicate');
 assert.equal(records.size,1);
 const foreign=await sign({...content,id:'evento-2',whatsappInboundMessage:{...content.whatsappInboundMessage,from:'+5491100000002'}});
 assert.equal((await accept(foreign)).status,'not_allowlisted');
 assert.equal((await accept({...packet,signature:'t='+timestamp+',s='+ '0'.repeat(64)})).status,'invalid_signature');
 assert.equal(records.size,1);
 const otherRoute={...route,empresa:'empresa-b',sucursal:'sucursal-b',sucursalId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',to:'+5491100000003',slug:'local-b'};
 const both=createSignedYCloudBridge({secret,routes:[route,otherRoute],store,enabled:true});
 const other=await sign({...content,id:'evento-3',whatsappInboundMessage:{...content.whatsappInboundMessage,id:'mensaje-3',to:otherRoute.to}});
 assert.equal((await both(other)).status,'accepted');assert.equal(records.size,2);
});


test('no queda atrapado cuando una variedad obligatoria se agotó por completo',async()=>{
 const cat={categorias:[{id:'c',nombre:'Combo'}],productos:[{id:'único',categoria_id:'c',nombre:'Combo ficticio',activo:true,disponible:true,precio:1000,opciones:[{id:'var',nombre:'Rellenos',tipo:'cantidad',total:2,valores:[{id:'agotado',nombre:'Sin stock',producto_id:'p2'}]}]}]};
 const u=client({catalogo:{...cat,productos:[...cat.productos,catalogo.productos[1]]}});
 await u.say('Hola');await u.pick('carta');await u.pick('elegir:único:1');const r=await u.say('1');
 assert.equal(r.session.stage,'menu');assert.match(r.messages.join(' '),/no tiene disponibles/);
});
import {projectYCloudText} from '../supabase/functions/gestlok-ycloud-adapter/outbound.mjs';
test('proyección YCloud de respuestas por WhatsApp sin envíos ni plantillas pagas',()=>{
 const now=new Date('2026-11-26T02:00:00Z');
 const base={from:'+5491100000001',to:ident.phone,messages:['Hola','1. Empanada ficticia\n2. Pack ficticio'],now,lastInboundAt:'2026-11-26T01:59:59Z'};
 const p=projectYCloudText(base);assert.equal(p.dispatchAllowed,false);assert.equal(p.payloads.length,1);assert.equal(p.payloads[0].type,'text');assert.match(p.payloads[0].text.body,/Pack ficticio/);
 assert.equal(projectYCloudText({...base,lastInboundAt:'2026-11-24T01:00:00Z'}).reason,'service_window_unverified');
 assert.equal(projectYCloudText({...base,from:ident.phone}).reason,'invalid_numbers');
});

test('nuevo pedido explícito no reutiliza datos personales o carrito de la solicitud anterior ni admite duplicados',async()=>{
 const u=client();await fillProduct(u);await fillCheckout(u,'retiro');
 const old=await u.pick('confirm');
 assert.equal(old.action.type,'simulated_order');
 assert.equal((await u.say('hola')).session.stage,'submitted');
 const started=await u.say('Nuevo pedido');
 assert.equal(started.session.stage,'menu');
 assert.deepEqual(started.session.engine.carrito,[]);
 assert.equal(started.session.data,undefined);
 assert.equal(started.session.review,undefined);
 assert.equal(started.session.product,undefined);
 assert.equal(started.action,undefined);
 const repeat=await u.say('1',{event:{id:old.action.idempotencyKey,text:'1'}});
 assert.equal(repeat.duplicate,true);assert.equal(repeat.action,undefined);
});

test('dos locales: gerente ficticio revisa una sola vez, reclamo queda aislado y no hay envío',async()=>{
 const a={empresa:'empresa-a',sucursal:'munro-ficticio',to:'+5491100000001',waba:'ficticia',senders:[ident.phone],config:s2,catalogo};
 const b={...a,sucursal:'torcuato-ficticio',to:'+5491100000002'};
 const foreign={...a,empresa:'empresa-b'};
 const pilot=createOfflinePilot([a,b]);let seq=0,last;
 async function say(body,route=a){
  const id=String(++seq);
  last=await pilot.receive({id:'e'+id,type:'whatsapp.inbound_message.received',apiVersion:'v2',whatsappInboundMessage:{id:'m'+id,wabaId:route.waba,from:ident.phone,to:route.to,type:'text',text:{body}}});
  assert.equal(last.sendAllowed,false);assert.equal(last.accepted,true);return last;
 }
 async function pick(id){const o=last.options.find(x=>x.id===id);assert.ok(o,id);return say(String(o.number));}
 await say('Hola');await pick('carta');await pick('elegir:p1:1');await say('2');await pick('add');await pick('finalizar');await pick('retiro');await say('Persona ficticia');await pick('debito');await pick('confirm');
 const p=pilot.listPending(a)[0];assert.equal(p.status,'pendiente');
 assert.equal(pilot.reviewPending({...b,id:p.id,decision:'confirmado'}).ok,false);
 assert.equal(pilot.reviewPending({...foreign,id:p.id,decision:'confirmado'}).ok,false);
 assert.equal(pilot.reviewPending({...a,id:p.id,decision:'enviado'}).ok,false);
 assert.deepEqual(pilot.reviewPending({...a,id:p.id,decision:'confirmado'}),{ok:true,status:'confirmado',simulated:true,sendAllowed:false});
 assert.equal(pilot.reviewPending({...a,id:p.id,decision:'rechazado'}).reason,'already_reviewed');
 assert.equal(pilot.listPending(a)[0].status,'confirmado');
 await say('Nuevo pedido');assert.equal(pilot.listPending(a).length,1);
 const r=await say('Me cobraron mal',b);assert.equal(r.stage,'handoff');
 assert.equal(pilot.listHandoffs(a).length,0);assert.equal(pilot.listHandoffs(foreign).length,0);
 assert.equal(pilot.listHandoffs(b)[0].detail,'Me cobraron mal');
 await say('Otro mensaje',b);assert.equal(pilot.listHandoffs(b).length,1);
 assert.equal((await say('MENU',b)).stage,'menu');
});

test('coste cero: la configuración IA por sí sola no ejecuta llamadas externas',async()=>{
 const oldFetch=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;throw Error('Red prohibida');};
 try{
  const u=client({privado:{ia_activa:true}});
  await u.say('Hola');
  const r=await u.say('zzz qqq xxx');
  assert.equal(r.session.stage,'handoff');
  assert.equal(r.action.type,'simulated_handoff');
  assert.equal(r.sendAllowed,false);
  assert.equal(calls,0);
 }finally{globalThis.fetch=oldFetch;}
});

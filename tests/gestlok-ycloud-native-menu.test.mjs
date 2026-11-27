import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {conversationPreview} from '../supabase/functions/gestlok-ycloud-adapter/conversation.mjs';
import {buildNativeMenu,readYCloudInput} from '../supabase/functions/gestlok-ycloud-adapter/native-menu.mjs';
import {projectYCloudTurn} from '../supabase/functions/gestlok-ycloud-adapter/outbound.mjs';
import {createSignedYCloudBridge} from '../supabase/functions/gestlok-ycloud-adapter/bridge.mjs';
import {analizarCarta,requiereRevisionOpciones} from '../public/chat/panel/importar-carta.js';
const now=new Date('2026-11-26T22:00:00Z');
const phone='+5491100000000',biz='+5491100000001';
const identity={empresa:'comercio-ficticio',sucursal:'a',phone};
const sucursal={nombre:'Local ficticio',empresa:'Comercio ficticio',acepta_retiro:true,acepta_envio:true,medios_pago:['efectivo','transferencia'],medios_pago_retiro:['efectivo','transferencia'],medios_pago_envio:['efectivo','transferencia']};
const categories=[{id:'emp',nombre:'Empanadas'},{id:'promo',nombre:'Promociones'},{id:'beb',nombre:'Bebidas'}];
const cat={categorias:categories,productos:[
 {id:'carne',nombre:'Carne',categoria_id:'emp',precio:1200,activo:true,disponible:true,opciones:[]},
 {id:'queso',nombre:'Queso',categoria_id:'emp',precio:1250,activo:true,disponible:true,opciones:[]},
 {id:'agua',nombre:'Agua',categoria_id:'beb',precio:800,activo:true,disponible:true,opciones:[]},
 {id:'combo',nombre:'Combo 2 empanadas + salsa',categoria_id:'promo',precio:3000,activo:true,disponible:true,opciones:[
 {id:'sabores',nombre:'Empanadas',tipo:'cantidad',total:2,valores:[{id:'carne',nombre:'Carne',producto_id:'carne'},{id:'queso',nombre:'Queso',producto_id:'queso'}]},
 {id:'salsa',nombre:'Salsa',tipo:'cantidad',total:1,valores:[{id:'ajo',nombre:'Ajo'}]}]},
 {id:'agotado',nombre:'Agotado ficticio',categoria_id:'emp',precio:999,disponible:false},
 {id:'sinprecio',nombre:'Sin precio',categoria_id:'emp',activo:true,disponible:true}
]};
const nativeIds=n=>n.type==='button'?n.action.buttons.map(b=>b.reply.id):n.action.sections.flatMap(s=>s.rows.map(r=>r.id));
function token(result,optionId){
 const found=result.options.find(o=>o.id===optionId);
 assert.ok(found,'opción '+optionId+' en '+JSON.stringify(result.options));
 const id=Object.keys(result.session.nativeMenu).find(k=>result.session.nativeMenu[k]===String(found.number));
 assert.ok(id,'no tiene ID nativo');assert.ok(nativeIds(result.native).includes(id));return id;
}
function client(overrides={}){
 let st,last,n=0;
 async function send(text,interactiveId,extra={}){
  last=await conversationPreview({identity,sucursal,catalogo:cat,ahora:now,...overrides,session:st,event:{id:'event-'+(++n),text,...(interactiveId?{interactiveId}:{})},...extra});
  st=JSON.parse(JSON.stringify(last.session));return last;
 }
 return {say:(text,extra)=>send(text,undefined,extra),click:(id,extra)=>send('',token(last,id),extra),raw:(id,extra)=>send('',id,extra),get last(){return last;}};
}
test('botones nativos: pedido completo con promo, opciones obligatorias, carrito y gerente pendiente',async()=>{
 const u=client();await u.say('Hola');assert.equal(u.last.native.type,'list');
 await u.click('carta');assert.deepEqual(u.last.options.map(o=>o.id),['carta:emp','carta:promo','carta:beb']);assert.equal(u.last.native.type,'button');
 await u.click('carta:promo');assert.match(u.last.options[0].label,/3\.000/);await u.click('elegir:combo:1');
 await u.click('1');await u.click('carne');await u.click('1');assert.equal(u.last.session.stage,'flavor');
 await u.click('queso');await u.click('1');assert.equal(u.last.session.stage,'flavor');
 await u.click('ajo');await u.click('1');assert.equal(u.last.session.stage,'product_review');
 await u.click('add');assert.equal(u.last.session.engine.carrito.length,1);
 await u.click('finalizar');if(u.last.session.stage==='menu')await u.click('finalizar');await u.click('retiro');await u.say('Cliente ficticio');await u.click('transferencia');
 assert.equal(u.last.session.stage,'confirm');assert.match(u.last.messages.join(' '),/3\.000/);
 const confirm=token(u.last,'confirm');const r=await u.raw(confirm);
 assert.equal(r.action.type,'simulated_order');assert.equal(r.sendAllowed,false);assert.equal(r.session.stage,'submitted');
 assert.equal((await u.raw(confirm)).action,undefined);
 assert.equal((await u.say('Nuevo pedido')).session.engine.carrito.length,0);
});
test('fotos aprobadas y catálogo por sucursal: cambios de precio y disponibilidad se reflejan, jamás datos de otro local',async()=>{
 const imported=analizarCarta('PERFUMES\nCítrico 50 ml $45000\nPROMOCIONES\nPack a elección $60000');
 const importedCat={categorias:imported.map((c,i)=>({id:'c'+i,nombre:c.nombre})),productos:imported.flatMap((c,i)=>c.productos.map((p,j)=>({id:'p'+i+j,categoria_id:'c'+i,nombre:p.nombre,precio:p.precio,activo:true,disponible:!requiereRevisionOpciones(c.nombre,p),opciones:[]})))};
 const u=client({identity:{...identity,sucursal:'b'},catalogo:importedCat});
 await u.say('Hola');await u.click('carta');assert.equal(u.last.options.length,1);
 assert.match(u.last.options[0].label,/Cítrico 50 ml · \$ 45\.000/);assert.doesNotMatch(JSON.stringify(u.last.options),/Pack|Carne/);
 importedCat.productos[0].precio=48000;await u.say('MENU');assert.match(u.last.options[0].label,/48\.000/);
 importedCat.productos[0].disponible=false;await u.say('MENU');assert.ok(!u.last.options.some(o=>o.id.startsWith('elegir:')));
});
test('cambio de precio antes de confirmar obliga a revisar nuevamente; click de otro local o anterior no muta',async()=>{
 const c=structuredClone(cat),a=client({catalogo:c}),b=client({identity:{...identity,sucursal:'b'},catalogo:c});
 await a.say('Hola');const old=token(a.last,'carta');await a.click('carta');await a.click('carta:emp');
 assert.ok(!a.last.options.some(o=>/agotado|sinprecio/.test(o.id)));
 await b.say('Hola');await b.raw(old);assert.equal(b.last.session.engine.carrito.length,0);assert.match(b.last.messages.join(' '),/no está vigente/);
 await a.click('elegir:carne:1');await a.click('2');await a.click('add');await a.click('finalizar');if(a.last.session.stage==='menu')await a.click('finalizar');await a.click('retiro');await a.say('Cliente ficticio');await a.click('transferencia');
 const review=token(a.last,'confirm');c.productos[0].precio=1500;await a.raw(review);
 assert.equal(a.last.action,undefined);assert.equal(a.last.session.stage,'confirm');assert.match(a.last.messages.join(' '),/3\.000/);
 await a.raw(review);assert.equal(a.last.action,undefined);assert.equal(a.last.session.stage,'confirm');
 await a.click('confirm');assert.equal(a.last.action.type,'simulated_order');
});
test('listas de catálogo extensas incluyen navegación y máximo 10 filas; texto de respaldo no se trunca',()=>{
 const p=buildNativeMenu({prompt:['Elegí producto'],options:Array.from({length:8},(_,i)=>({number:i+1,label:'Producto '+(i+1)+' · $ 1000'})),page:1,totalPages:3});
 assert.equal(p.interactive.type,'list');assert.equal(nativeIds(p.interactive).length,10);assert.ok(Object.values(p.mapping).includes('Anterior'));assert.ok(Object.values(p.mapping).includes('Siguiente'));
 assert.equal(buildNativeMenu({prompt:['x'.repeat(1025)],options:[{number:1,label:'Confirmar'}],page:0,totalPages:1}),null);
 assert.equal(readYCloudInput({type:'interactive',interactive:{type:'button_reply',button_reply:{id:'confirm',title:'Confirmar'}}}),null);
});
test('puente YCloud firmado procesa IDs de botones sin confiar en título, respeta exclusión y deduplicación, sin enviar',async()=>{
 const secret='secreto-ficticio-mas-de-24-caracteres',ts=Math.floor(+now/1000),route={empresa:identity.empresa,sucursal:identity.sucursal,sucursalId:'uuid-ficticio',slug:'local-a',waba:'waba-a',to:biz,allowSenders:[phone]};
 let state=null,rev=0,excluded=false;const seen=new Set();
 const store={async isExcluded(){return excluded;},async load(){return {state,revision:rev,sucursal,catalogo:cat};},async commit(x){if(seen.has(x.messageId))return {status:'duplicate'};assert.equal(x.revision,rev);assert.equal(x.order,null);seen.add(x.messageId);rev++;state=structuredClone(x.state);return {status:'committed'};}};
 const accept=createSignedYCloudBridge({secret,routes:[route],store,enabled:true});
 const packet=(id,fields)=>{const raw=JSON.stringify({id:'evt-'+id,apiVersion:'v2',type:'whatsapp.inbound_message.received',whatsappInboundMessage:{id,wabaId:route.waba,from:phone,to:biz,...fields}});return {raw,signature:'t='+ts+',s='+createHmac('sha256',secret).update(ts+'.'+raw).digest('hex'),now:+now};};
 const hello=await accept(packet('h',{type:'text',text:{body:'Hola'}}));assert.ok(hello.native);
 const id=nativeIds(hello.native)[0],click=packet('c',{type:'interactive',interactive:{type:'list_reply',list_reply:{id,title:'Confirmar un pedido ajeno'}}});
 const response=await accept(click);assert.equal(response.status,'accepted');assert.equal(response.sendAllowed,false);assert.ok(response.native);assert.equal(state.stage,'menu');assert.ok(state.menu.some(o=>o.id==='carta:emp'));
 assert.equal((await accept(click)).status,'duplicate');
 excluded=true;assert.equal((await accept(packet('d',{type:'text',text:{body:'Hola'}}))).status,'excluded_sender');
 assert.equal(rev,2);
});
test('proyección oficial de un turno native no envía y nunca pasa 24h',async()=>{
 const u=client();await u.say('Hola');const base={from:biz,to:phone,turn:u.last,lastInboundAt:+now-1000,now};
 const p=projectYCloudTurn(base);assert.equal(p.dispatchAllowed,false);assert.equal(p.payloads.length,1);assert.equal(p.payloads[0].type,'interactive');assert.equal(p.payloads[0].interactive.type,'list');
 assert.equal(projectYCloudTurn({...base,lastInboundAt:+now-86400000}).reason,'service_window_unverified');
});
test('carta web solamente a petición, enlace de la sucursal desde ruta del servidor y carrito separado',async()=>{
 const u=client({publicSlug:'local-ficticio-a'});await u.say('Hola');assert.doesNotMatch(u.last.messages.join(' '),/https:/);await u.click('carta');
 await u.click('carta:emp');await u.click('elegir:carne:1');await u.click('1');await u.click('add');
 await u.say('Ver carta web');assert.match(u.last.messages.join(' '),/https:\/\/gestlok\.com\.ar\/chat\/\?s=local-ficticio-a/);
 assert.equal(u.last.session.engine.carrito.length,1);assert.equal(u.last.action,undefined);
});

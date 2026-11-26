import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from '../public/chat/whatsapp-bot/fixtures.mjs';
import {interactiveTurn,nativeMessages,decodeVerifiedInbound,resumeDemo} from '../public/chat/whatsapp-bot/interactive.mjs';
const count=s=>Array.from(s).length;
function validate(r){
 assert.equal(r.sendAllowed,false);
 for(const p of r.payloads){
  if(p.type==='text'){assert.ok(count(p.text.body)<=4096);continue;}
  const i=p.interactive;assert.ok(count(i.body.text)<=1024);
  if(i.type==='button'){
   assert.ok(i.action.buttons.length<=3);for(const b of i.action.buttons){assert.ok(count(b.reply.title)<=20);assert.match(b.reply.id,/^wa1_[0-9a-f]{32}_\d+$/);}
  }else{
   const rows=i.action.sections.flatMap(s=>s.rows);assert.ok(rows.length<=10);for(const row of rows){assert.ok(count(row.title)<=24);assert.ok(count(row.description||'')<=72);}
  }
 }
}
function client(local='munro',extra={}){
 const base={...fixture(local),...extra};
 let r,n=0;
 async function input(value,opts={}){
  r=await interactiveTurn({...base,session:r?.session,input:{id:'event-'+(++n),...value},...opts});
  validate(r);return r;
 }
 const say=text=>input({text});
 async function pick(id){const c=r.choices.find(x=>x.id===id);assert.ok(c,'Missing '+id+' in '+r.choices.map(x=>x.id));return input({clickId:c.token});}
 return {input,say,pick,base,get r(){return r;}};
}
async function fill(u){
 await u.say('Hola');await u.pick('carta');await u.pick('elegir:pack:1');await u.pick('qty:1');
 assert.equal(u.r.session.stage,'flavor');assert.ok(!u.r.choices.some(c=>c.id==='agotada'));
 await u.pick('carne');await u.say('7');assert.equal(u.r.session.stage,'flavor_qty');await u.say('4');await u.pick('jyq');await u.pick('qty:2');
 assert.equal(u.r.session.product.group,1);await u.pick('ajo');await u.pick('qty:1');await u.pick('criolla');await u.pick('qty:1');
 await u.pick('add');await u.pick('finalizar');if(u.r.session.stage==='menu')await u.pick('finalizar');
}
test('promoción con botones: variedades, salsas, retiro, pedido pendiente solo tras confirmación',async()=>{
 const u=client();await fill(u);assert.equal(u.r.session.stage,'checkout');await u.pick('retiro');await u.say('Persona ficticia');await u.pick('debito');
 assert.equal(u.r.session.stage,'confirm');assert.equal(u.r.action,undefined);
 const r=await u.pick('confirm');assert.equal(r.action.type,'simulated_order');assert.deepEqual(r.action.pedido.items[0].opciones,{emp:{carne:4,jyq:2},salsa:{ajo:1,criolla:1}});
 assert.equal(r.action.pedido.entrega,'retiro');const dup=await u.input({text:'1'},{input:{id:r.action.idempotencyKey,text:'1'}});assert.equal(dup.duplicate,true);assert.equal(dup.action,undefined);
});
test('delivery en otro local, pago, domicilio, revisión de cambios',async()=>{
 const u=client('torcuato');await fill(u);await u.pick('envio');await u.say('Persona ficticia');await u.say('Calle ficticia 123');await u.pick('transferencia');
 assert.equal(u.r.session.stage,'confirm');
 const cat={...u.base.catalogo,productos:u.base.catalogo.productos.map(p=>p.id==='pack'?{...p,precio:12000}:p)};
 const r=await u.input({clickId:u.r.choices.find(x=>x.id==='confirm').token},{catalogo:cat});
 assert.equal(r.action,undefined);assert.equal(r.session.stage,'confirm');assert.match(r.payloads[0].interactive.body.text,/12.000/);
 const result=await u.input({clickId:r.choices.find(x=>x.id==='confirm').token},{catalogo:cat});assert.equal(result.action.pedido.entrega,'envio');
});
test('IDs vencidos, duplicaciones, números excluidos y separación de sucursales',async()=>{
 const u=client(),v=client('torcuato');await u.say('Hola');await v.say('Hola');const old=u.r.choices[0].token;
 await u.pick('carta');const stale=await u.input({clickId:old});assert.equal(stale.reason,'stale');assert.equal(stale.session.engine.carrito.length,0);
 const other=await v.input({clickId:stale.choices[0].token});assert.equal(other.reason,'stale');
 await assert.rejects(interactiveTurn({...v.base,session:stale.session,input:{id:'cross',text:'Hola'}}),/otra conversación/);
 const excluded=await u.input({text:'Hola'},{excluded:true});assert.equal(excluded.reason,'excluded');assert.deepEqual(excluded.payloads,[]);assert.equal(excluded.action,undefined);
});
test('atención del gerente pausa bot; el cliente no puede reactivarlo',async()=>{
 const u=client();await u.say('Hola');await u.say('Hablar con el gerente');const r=await u.pick('hablar_gerente');assert.equal(r.action.type,'simulated_handoff');assert.equal(r.session.waPaused,true);
 const paused=await u.say('menu');assert.equal(paused.reason,'human');assert.equal(paused.payloads.length,0);
 const resumed=resumeDemo(paused.session);const next=await u.input({text:'menu'},{session:resumed});assert.equal(next.session.waPaused,false);assert.ok(next.choices.length);
});
test('más de 10 productos se paginan sin perder opciones ni romper límites',async()=>{
 const f=fixture();const catalogo={categorias:[{id:'emp',nombre:'Carta'}],productos:Array.from({length:35},(_,i)=>({id:'p'+i,categoria_id:'emp',nombre:'Producto '+(i+1),precio:1000,opciones:[]}))};
 const u=client('munro',{catalogo});await u.say('Hola');await u.pick('carta');
 for(let n=0;n<4;n++)await u.pick('next');
 assert.ok(u.r.choices.find(c=>c.id==='elegir:p34:1'));
 await u.pick('elegir:p34:1');await u.pick('qty:2');await u.pick('add');assert.equal(u.r.session.engine.carrito[0].cantidad,2);
});
test('respeta formato nativo, no recorta el resumen y reconoce eventos firmados previamente',()=>{
 const raw='a'.repeat(1100)+'\nTotal: $ 1200';
 const p=nativeMessages(raw,[{label:'Confirmar solicitud',token:'token'}]);assert.equal(p.length,2);assert.match(p.at(-1).interactive.body.text,/Total: \$ 1200/);
 const input={id:'event',type:'whatsapp.inbound_message.received',apiVersion:'v2',whatsappInboundMessage:{id:'message',wamid:'wamid.1',wabaId:'waba',from:'+5491100000000',to:'+5491100000001',type:'interactive',interactive:{type:'button_reply',button_reply:{id:'wa1_'+'a'.repeat(32)+'_0',title:'IGNORADO'}}}};
 assert.deepEqual(decodeVerifiedInbound(input).input,{id:'wamid.1',clickId:'wa1_'+'a'.repeat(32)+'_0'});
 assert.equal(decodeVerifiedInbound({...input,whatsappInboundMessage:{...input.whatsappInboundMessage,groupId:'g'}}),null);
 const list=structuredClone(input);list.whatsappInboundMessage.interactive={type:'list_reply',list_reply:{id:'wa1_'+'b'.repeat(32)+'_1'}};assert.match(decodeVerifiedInbound(list).input.clickId,/^wa1_b/);
});
import {createInteractiveTestBridge} from '../supabase/functions/gestlok-ycloud-interactive-prueba/bridge.mjs';
test('puente de ensayo firmado: ruta exacta, un remitente, exclusión, interacción y deduplicación',async()=>{
 const f=fixture(),now=Date.now(),secret='secreto-ficticio-de-prueba-12345678',route={waba:'waba-demo',to:'+5491100000001',empresa:f.identity.empresa,sucursal:f.identity.sucursal,slug:'demo',sucursalId:'sucursal-demo',allowSenders:[f.identity.phone]};
 let excluded=false,state,revision=0,commits=0;const seen=new Set();
 const store={isExcluded:async()=>excluded,load:async()=>({sucursal:f.sucursal,catalogo:f.catalogo,state,revision}),commit:async v=>{
  if(seen.has(v.wamid))return {status:'duplicate'};if(v.revision!==revision)return {status:'conflict'};
  seen.add(v.wamid);commits++;state=v.state;revision++;return {status:'committed'};
 }};
 const config={projectRef:'irqeitzbfyerxcrogkyh',enabled:true,dryRun:true,secret,routes:[route],store};
 const bridge=createInteractiveTestBridge(config);
 const make=(n,fields={type:'text',text:{body:'Hola'}},from=f.identity.phone)=>({id:'evt'+n,type:'whatsapp.inbound_message.received',apiVersion:'v2',whatsappInboundMessage:{id:'msg'+n,wamid:'wamid.'+n,wabaId:route.waba,from,to:route.to,sendTime:new Date(now).toISOString(),...fields}});
 async function request(event,handler=bridge,wrong=false){
  const t=Math.floor(now/1000),raw=new TextEncoder().encode(JSON.stringify(event)),key=await crypto.subtle.importKey('raw',new TextEncoder().encode(wrong?'secreto-incorrecto':secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const sig=Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(t+'.'+JSON.stringify(event)))),x=>x.toString(16).padStart(2,'0')).join('');
  return handler({raw,signature:'t='+t+',s='+sig,now});
 }
 assert.equal((await request(make(1),createInteractiveTestBridge({...config,projectRef:'production'}))).status,'disabled');
 assert.equal((await request(make(1),bridge,true)).status,'invalid_signature');
 assert.equal((await request(make(1,undefined,'+5491100000002'))).status,'not_allowlisted');
 excluded=true;assert.equal((await request(make(1))).status,'excluded_sender');excluded=false;assert.equal(commits,0);
 const r=await request(make(1));assert.equal(r.status,'accepted');assert.equal(r.sendAllowed,false);assert.equal(r.payloads[0].interactive.type,'list');
 const id=r.payloads[0].interactive.action.sections[0].rows[0].id;
 const next=await request(make(2,{type:'interactive',interactive:{type:'list_reply',list_reply:{id,title:'IGNORADO'}}}));assert.equal(next.status,'accepted');assert.ok(next.payloads[0].interactive.action.sections[0].rows.length>2);
 assert.equal((await request(make(2,{type:'interactive',interactive:{type:'list_reply',list_reply:{id}}}))).status,'duplicate');
 assert.equal(commits,2);
});

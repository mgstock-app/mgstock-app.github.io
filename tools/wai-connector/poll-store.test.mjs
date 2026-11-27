import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createCipheriv,createHash,createHmac,randomBytes} from 'node:crypto';
import {createPollStore,normalizePoll,selectionFromVote} from './poll-store.mjs';
import {pilotTransport} from './pilot.mjs';
const number='+5491100000003',jid=number.slice(1)+'@s.whatsapp.net',me='5491100000001@s.whatsapp.net';
const definition={pregunta:'¿En qué podemos ayudarte?',opciones:[{id:'op1',label:'Consultar catálogo'},{id:'op2',label:'Hablar con una persona'}]};
const digest=s=>createHash('sha256').update(s).digest();
test('el almacén de opciones conserva solamente encuestas propias y autorizadas durante la reconexión',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'wai-poll-')),t=Date.now(),grant={id:'p',tester:number,vence_at:new Date(t+60000).toISOString()};
 try{
  const store=createPollStore(dir,{now:()=>t});assert.ok(normalizePoll(definition));assert.equal(normalizePoll({...definition,opciones:[definition.opciones[0],definition.opciones[0]]}),null);
  const payload=await store.create('POLL',jid,jid,grant,definition);assert.equal(payload.poll.selectableCount,1);assert.equal(payload.poll.messageSecret.length,32);
  const fresh=createPollStore(dir,{now:()=>t}),r=await fresh.get('POLL',grant,jid,jid,t);assert.equal(r.opciones.length,2);
  assert.equal(selectionFromVote(r.opciones,{selectedOptions:[digest('Hablar con una persona')]}),'op2');
  assert.equal(selectionFromVote(r.opciones,{selectedOptions:[]}),null);assert.equal(selectionFromVote(r.opciones,{selectedOptions:[digest('No existe')]}),null);
  assert.equal(await fresh.get('POLL',{...grant,id:'different'},jid,jid,t),null);assert.equal(await fresh.get('POLL',grant,'5491100009999@s.whatsapp.net',jid,t),null);assert.equal(await fresh.get('POLL',grant,jid,jid,t+61000),null);assert.equal(await fresh.get('POLL',grant,'12345@lid',jid,t),null);assert.ok(await fresh.get('POLL',grant,'12345@lid',jid,t,true));assert.equal(await fresh.get('POLL',grant,'5491100009999@s.whatsapp.net',jid,t,true),null);
 }finally{await rm(dir,{recursive:true,force:true});}
});
let lib=null;try{lib=await import('@whiskeysockets/baileys');}catch{}
test('Baileys rc14: selección en encuesta nativa usa el voto cifrado real, incluso después de reiniciar', {skip:!lib},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'wai-crypto-')),t=Date.now(),grant={id:'p',tester:number,creado_at:new Date(t-5000).toISOString(),vence_at:new Date(t+60000).toISOString(),hora_servidor:new Date(t).toISOString()};
 try{
  let job={id:'db1',jid,texto:'Menú',interaccion:definition},sent=null;
  const calls=[],rpc=async(_name,a)=>{calls.push(a);if(a.p_accion==='control')return grant;if(a.p_accion==='tomar'){const next=job;job=null;return next;}if(a.p_accion==='tomar_accion')return null;return {ok:true};};
  const args={now:()=>t,active:()=>true,rpc,socket:{sendMessage:async(target,content,options)=>{sent=content;assert.equal(target,jid);return {key:{id:options.messageId}};}},ownJids:()=>[me],newMessageId:()=> 'POLL1',decryptVote:lib.decryptPollVote};
  const first=pilotTransport({...args,pollStore:createPollStore(dir) });await first.tick('revision');
  assert.equal(sent.poll.name,definition.pregunta);
  // Produce the protocol's authenticated ciphertext using Node's crypto.
  const hmac=(data,key)=>createHmac('sha256',key).update(data).digest();
  const sign=Buffer.concat([Buffer.from('POLL1'),Buffer.from(me),Buffer.from(jid),Buffer.from('Poll Vote'),Buffer.from([1])]);
  const secret=sent.poll.messageSecret,key=hmac(sign,hmac(secret,Buffer.alloc(32))),iv=randomBytes(12);
  const plain=lib.proto.Message.PollVoteMessage.encode({selectedOptions:[digest(definition.opciones[1].label)]}).finish();
  const cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from('POLL1\0'+jid));
  const encPayload=Buffer.concat([cipher.update(plain),cipher.final(),cipher.getAuthTag()]);
  const event=(sender,id,own=false,mutation=false)=>({type:'notify',messages:[{key:{remoteJid:sender,id,fromMe:own},messageTimestamp:Math.floor(t/1000),message:{pollUpdateMessage:{pollCreationMessageKey:{id:'POLL1',fromMe:true,remoteJid:sender},vote:{encPayload:mutation?Buffer.alloc(encPayload.length):encPayload,encIv:iv}}}}]});
  const second=pilotTransport({...args,pollStore:createPollStore(dir),initialGrant:grant});
  await second.tick('revision');
  await second.receive(event('5491100009999@s.whatsapp.net','wrong'));
  await second.receive(event(jid,'self',true));
  await second.receive(event(jid,'tampered',false,true));
  await second.receive(event(jid,'real'));
  await second.tick('revision');
  const votes=calls.filter(a=>a.p_accion==='voto');assert.equal(votes.length,1);assert.equal(votes[0].p_evento,'POLL1');assert.equal(votes[0].p_texto,'op2');assert.equal(votes[0].p_jid,jid);assert.ok(calls.some(a=>a.p_accion==='alerta'&&a.p_estado==='voto_no_descifrado'));
 }finally{await rm(dir,{recursive:true,force:true});}
});

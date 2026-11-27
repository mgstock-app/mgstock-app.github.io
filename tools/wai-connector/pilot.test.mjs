import test from 'node:test';
import assert from 'node:assert/strict';
import {pilotTransport} from './pilot.mjs';
const jid='5491100000003@s.whatsapp.net',other='5491100000004@s.whatsapp.net';
test('piloto Node descarta mensajes ajenos, históricos y duplicados de transporte; envío reservado sin reintentos',async()=>{
 let t=Date.now(),online=true,permit=true,job=null,attempts=0;
 const received=[],states=[],seen=new Set();
 const pilot=pilotTransport({now:()=>t,active:()=>online,socket:{sendMessage:async(j,m)=>{attempts++;assert.equal(j,jid);assert.equal(m.text,'Respuesta');throw Error('timeout');}},rpc:async(name,a)=>{
  assert.equal(name,'gestlok_chat_wai_piloto_motor');
  if(a.p_accion==='control')return permit?{id:'p1',tester:'+5491100000003',vence_at:new Date(t+30000).toISOString()}:null;
  if(a.p_accion==='recibir'){if(!seen.has(a.p_evento)){seen.add(a.p_evento);received.push(a.p_texto);}return {ok:true};}
  if(a.p_accion==='tomar'){const j=job;job=null;return j;}
  if(a.p_accion==='resultado'){states.push(a.p_estado);return {ok:true};}
 }});
 const message=(remoteJid,id,text,fromMe=false,stamp=t)=>({key:{remoteJid,id,fromMe},message:{conversation:text},messageTimestamp:Math.floor(stamp/1000)});
 await pilot.tick('rev');await pilot.receive({type:'append',messages:[message(jid,'hist','Historia')]});
 await pilot.receive({type:'notify',messages:[message(other,'wrong','Otro'),message(jid,'me','Propio',true),message(jid,'old','Viejo',false,t-100000),message('123@lid','lid','No identificado'),message(jid,'yes','Hola'),message(jid,'yes','Hola')]});
 job={id:'j',jid,texto:'Respuesta'};await pilot.tick('rev');await pilot.tick('rev');
 assert.deepEqual(received,['Hola']);assert.equal(attempts,1);assert.deepEqual(states,['incierto']);
 job={id:'bad',jid:other,texto:'NO'};await pilot.tick('rev');assert.equal(attempts,1);
 permit=false;await pilot.tick('rev');await pilot.receive({type:'notify',messages:[message(jid,'after','No')]});await pilot.tick('rev');
 online=false;await pilot.tick('rev');assert.deepEqual(received,['Hola']);
});

test('identidades PN y LID de WhatsApp se verifican contra el único contacto autorizado; nunca se aceptan grupos ni LID desconocidos',async()=>{
 const t=Date.now(),accepted=[],sent=[],state=[];
 let job=null,allow=true;
 const realLid='99999999999@lid',wrongLid='88888888888@lid',conflictLid='77777777777@lid';
 const socket={signalRepository:{lidMapping:{
   getPNForLID:async j=>j===conflictLid?other:j===realLid?jid:null,
   getLIDForPN:async n=>n===jid?realLid:null
 }},sendMessage:async(j,m)=>{sent.push([j,m.text]);return {key:{id:'yes'}};}};
 const engine=pilotTransport({now:()=>t,active:()=>allow,socket,rpc:async(name,a)=>{
  if(a.p_accion==='control')return allow?{id:'p2',tester:'+5491100000003',vence_at:new Date(t+60000).toISOString()}:null;
  if(a.p_accion==='recibir'){accepted.push([a.p_evento,a.p_jid]);return {ok:true};}
  if(a.p_accion==='tomar'){const j=job;job=null;return j;}
  if(a.p_accion==='resultado'){state.push(a.p_estado);return {ok:true};}
 }});
 const msg=(remoteJid,id,remoteJidAlt)=>({key:{remoteJid,id,remoteJidAlt,fromMe:false},message:{conversation:'Hola'},messageTimestamp:Math.floor(t/1000)});
 await engine.tick('rev');
 await engine.receive({type:'notify',messages:[
 msg('123@g.us','group',jid),msg('123@broadcast','broadcast',jid),msg(wrongLid,'unknown'),msg(conflictLid,'conflict',jid),msg(other,'other',jid),
 msg(jid.replace('@',':4@'),'pn'),msg(realLid,'lid-alt',jid),msg(realLid,'lid-mapping')
 ]});
 job={id:'reply',jid,texto:'Hola de vuelta'};await engine.tick('rev');
 assert.deepEqual(accepted,[['pn',jid],['lid-alt',jid],['lid-mapping',jid]]);
 assert.deepEqual(sent,[[realLid,'Hola de vuelta']]);assert.deepEqual(state,['aceptado']);
 allow=false;engine.reset();await engine.receive({type:'notify',messages:[msg(realLid,'expired',jid)]});assert.equal(accepted.length,3);
});
test('un LID sin PN solo se acepta si el proveedor confirma el LID del número autorizado',async()=>{
 const t=Date.now(),received=[],lid='1234567890123@lid';
 const engine=pilotTransport({now:()=>t,active:()=>true,socket:{signalRepository:{lidMapping:{getPNForLID:async()=>null,getLIDForPN:async n=>n===jid?lid:null}}},rpc:async(_n,a)=>{
   if(a.p_accion==='control')return {id:'p3',tester:'+5491100000003',vence_at:new Date(t+60000).toISOString()};
   if(a.p_accion==='recibir'){received.push(a.p_jid);return {ok:true};}
   return null;
 }});
 await engine.tick('rev');
 const m=j=>({key:{remoteJid:j,id:j,fromMe:false},message:{conversation:'Hola'},messageTimestamp:Math.floor(t/1000)});
 await engine.receive({type:'notify',messages:[m('333333333333@lid'),m(lid)]});await engine.tick('rev');
 assert.deepEqual(received,[jid]);
});

test('recibe append reciente solo dentro del consentimiento y compara con la hora del servidor, incluso con reloj local atrasado',async()=>{
 const t=Date.now(),accepted=[],logs=[];
 const engine=pilotTransport({now:()=>t-1000000,active:()=>true,logger:m=>logs.push(m),socket:{signalRepository:{lidMapping:{getLIDForPN:async n=>n==='541100000003@s.whatsapp.net'?'123456@lid':null,getPNForLID:async()=>null}}},rpc:async(_name,a)=>{
   if(a.p_accion==='control')return {id:'p4',tester:'+5491100000003',creado_at:new Date(t-30000).toISOString(),vence_at:new Date(t+900000).toISOString(),hora_servidor:new Date(t).toISOString()};
   if(a.p_accion==='recibir'){accepted.push(a.p_evento);return {ok:true};}
   return null;
 }});
 const m=(remoteJid,id,stamp,message={conversation:'Hola'})=>({key:{remoteJid,id,fromMe:false},message,messageTimestamp:Math.floor(stamp/1000)});
 await engine.tick('rev');
 await engine.receive({type:'append',messages:[m(jid,'history',t-60000),m('123456@lid','queued',t-10000),m(other,'unauthorized',t-10000),m(jid,'ephemeral',t-10000,{ephemeralMessage:{message:{extendedTextMessage:{text:'Hola'}}}})]});
 await engine.tick('rev');
 assert.deepEqual(accepted,['queued','ephemeral']);
 assert.ok(logs.some(x=>x.includes('antigüedad')));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {multiPilotTransport} from './multi-pilot.mjs';
const numbers=['+5491100000011','+5491100000012'],jids=numbers.map(n=>n.slice(1)+'@s.whatsapp.net');
test('one verified line routes two consented contacts independently, revokes access and never crosses replies',async()=>{
 const t=Date.now(),received=[],sent=[],jobs=new Map(),ids=[];
 let online=true;
 const make=(i)=>({id:'p'+i,tester:numbers[i],creado_at:new Date(t-60000).toISOString(),vence_at:new Date(t+3600000).toISOString(),hora_servidor:new Date(t).toISOString()});
 let grants=numbers.map((_,i)=>make(i));
 const socket={signalRepository:{lidMapping:{getPNForLID:async l=>l==='123456@lid'?jids[1]:null,getLIDForPN:async n=>n===jids[1]?'123456@lid':null}},sendMessage:async(j,content)=>{sent.push([j,content.text]);return {key:{id:'wa'+sent.length}};}};
 const worker=multiPilotTransport({rpc:async(name,a)=>{
  if(name==='gestlok_chat_wai_ensayos_autorizados')return {ensayos:grants};
  assert.ok(a.p_piloto,'Every motor request has a specific contact');
  const p=grants.find(g=>g.id===a.p_piloto);if(!p)return null;
  if(a.p_accion==='control'){ids.push(a.p_piloto);return p;}
  if(a.p_accion==='recibir'){assert.equal(a.p_jid,p.tester.slice(1)+'@s.whatsapp.net');received.push([p.id,a.p_texto]);return {ok:true};}
  if(a.p_accion==='tomar'){const job=jobs.get(p.id);jobs.delete(p.id);return job;}
  if(a.p_accion==='resultado')return {ok:true};
  return null;
 },active:()=>online,now:()=>t,socket,initialGrants:grants});
 const msg=(j,id,text,alt)=>({key:{remoteJid:j,id,remoteJidAlt:alt,fromMe:false},message:{conversation:text},messageTimestamp:Math.floor(t/1000)});
 await worker.tick('rev');
 await worker.receive({type:'notify',messages:[msg(jids[0],'a','Carta'),msg('123456@lid','b','Reclamo',jids[1]),msg('5491100000013@s.whatsapp.net','c','No'),msg('123@g.us','d','No',jids[0])]});
 jobs.set('p0',{id:'a',jid:jids[0],texto:'Menú para A'});
 jobs.set('p1',{id:'b',jid:jids[1],texto:'Respuesta para B'});
 await worker.tick('rev');
 assert.deepEqual(received.sort(),[['p0','Carta'],['p1','Reclamo']]);
 assert.deepEqual(sent.sort(),[['123456@lid','Respuesta para B'],[jids[0],'Menú para A']].sort());
 assert.deepEqual([...new Set(ids)].sort(),['p0','p1']);
 grants=[make(1)];await worker.tick('rev');
 await worker.receive({type:'notify',messages:[msg(jids[0],'e','Cancelado'),msg(jids[1],'f','Sigo acá')]});
 await worker.tick('rev');
 assert.deepEqual(received.at(-1),['p1','Sigo acá']);
 assert.equal(received.length,3);
 online=false;worker.reset();
});
test('snapshot with duplicate phone numbers fails closed',async()=>{
 let received=0;const t=Date.now(),a={id:'a',tester:numbers[0],creado_at:new Date(t-60000).toISOString(),vence_at:new Date(t+100000).toISOString(),hora_servidor:new Date(t).toISOString()};
 const multi=multiPilotTransport({rpc:async(name)=>name==='gestlok_chat_wai_ensayos_autorizados'?{ensayos:[a,{...a,id:'b'}]}:(received++,null),socket:{},active:()=>true,now:()=>t});
 await multi.tick('r');await multi.receive({type:'notify',messages:[{key:{remoteJid:jids[0],id:'a'},message:{conversation:'Hola'},messageTimestamp:Math.floor(t/1000)}]});await multi.tick('r');assert.equal(received,0);
});
test('recepción abierta admite únicamente mensajes directos nuevos y el servidor decide exclusiones',async()=>{
 const t=Date.now(),grants=[],received=[],admitted=[],calls=[];
 let open=true;
 const multi=multiPilotTransport({active:()=>true,initialOpen:true,initialRevision:'r',now:()=>t,
  socket:{signalRepository:{lidMapping:{getPNForLID:async l=>l==='555@lid'?jids[1]:null}}},
  workerFactory:({initialGrant})=>({receive:async e=>{for(const m of e.messages)received.push([initialGrant.tester,m.key.id]);},tick:async()=>{},reset:()=>{},receipt:async()=>{},contacts:async()=>{}}),
  rpc:async(name,args)=>{
   if(name==='gestlok_chat_wai_ensayos_autorizados')return {ensayos:grants,recepcion_entrante:open};
   if(name==='gestlok_chat_wai_admitir_entrada'){
    calls.push(args.p_jid);
    if(!jids.includes(args.p_jid))return null; // excluded/unknown
    const grant={id:args.p_jid,tester:'+'+args.p_jid.split('@')[0],creado_at:new Date(t-1000).toISOString(),vence_at:new Date(t+60000).toISOString()};
    admitted.push(grant);grants.push(grant);return grant;
   }return null;
  }});
 const msg=(j,id,fromMe=false,alt)=>({key:{remoteJid:j,id,fromMe,remoteJidAlt:alt},message:{conversation:'Hola'},messageTimestamp:Math.floor(t/1000)});
 await multi.tick('r');await multi.receive({type:'notify',messages:[msg(jids[0],'A'),msg('555@lid','B'),msg('5491100000999@s.whatsapp.net','X'),msg('123@g.us','group'),msg('5491100000998@s.whatsapp.net','out',true)]});
 assert.equal(admitted.length,2);assert.deepEqual(received.sort(),[[numbers[0],'A'],[numbers[1],'B']].sort());
 assert.equal(calls.length,3);
 open=false;grants.length=0;await multi.tick('r');await multi.receive({type:'notify',messages:[msg(jids[0],'off')]});assert.equal(calls.length,3);
});

test('un envío lento de un contacto nuevo no bloquea la atención de otro cliente del mismo lote',async()=>{
 const t=Date.now(),grant=i=>({id:'p'+i,tester:numbers[i],creado_at:new Date(t-1000).toISOString(),vence_at:new Date(t+60000).toISOString()});
 const received=[];let release,started;
 const slow=new Promise(r=>{release=r}),began=new Promise(r=>{started=r});
 const multi=multiPilotTransport({active:()=>true,initialOpen:true,initialRevision:'r',initialGrants:[grant(0)],now:()=>t,socket:{},
  workerFactory:({initialGrant:p})=>({receive:async()=>{received.push(p.id);if(p.id==='p1'){started();await slow;}},tick:async()=>{},reset(){},receipt:async()=>{},contacts:async()=>{}}),
  rpc:async(name)=>name==='gestlok_chat_wai_admitir_entrada'?grant(1):null});
 const msg=(i)=>({key:{remoteJid:jids[i],id:'m'+i,fromMe:false},message:{conversation:'Hola'},messageTimestamp:Math.floor(t/1000)});
 const pending=multi.receive({type:'notify',messages:[msg(1),msg(0)]});
 try{await began;assert.deepEqual(received.sort(),['p0','p1']);}finally{release();await pending;}
});

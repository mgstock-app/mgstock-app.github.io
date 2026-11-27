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
 await pilot.tick('rev');pilot.receive({type:'append',messages:[message(jid,'hist','Historia')]});
 pilot.receive({type:'notify',messages:[message(other,'wrong','Otro'),message(jid,'me','Propio',true),message(jid,'old','Viejo',false,t-100000),message('123@lid','lid','No identificado'),message(jid,'yes','Hola'),message(jid,'yes','Hola')]});
 job={id:'j',jid,texto:'Respuesta'};await pilot.tick('rev');await pilot.tick('rev');
 assert.deepEqual(received,['Hola']);assert.equal(attempts,1);assert.deepEqual(states,['incierto']);
 job={id:'bad',jid:other,texto:'NO'};await pilot.tick('rev');assert.equal(attempts,1);
 permit=false;await pilot.tick('rev');pilot.receive({type:'notify',messages:[message(jid,'after','No')]});await pilot.tick('rev');
 online=false;await pilot.tick('rev');assert.deepEqual(received,['Hola']);
});

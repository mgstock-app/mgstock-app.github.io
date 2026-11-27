// Explicit, short test transport: one consenting number, text only, no auto-reply,
// no history, no bulk messages. A reserved reply is never retried after ambiguity.
import {phoneKey} from './session.mjs';
const pnJid=jid=>{
 const m=/^([1-9]\d{7,14})(?::\d+)?@(?:s\.whatsapp\.net|hosted)$/.exec(jid||'');
 return m?m[1]+'@s.whatsapp.net':null;
};
const lidJid=jid=>{
 const m=/^(\d{1,20})(?::\d+)?@(?:lid|hosted\.lid)$/.exec(jid||'');
 return m?m[1]+'@lid':null;
};
const phone=jid=>{const pn=pnJid(jid);return pn?phoneKey('+'+pn.split('@')[0]):null;};

export function pilotTransport({rpc,socket,active,now=Date.now,logger=()=>{}}){
 let pilot=null,inbox=[],working=false,epoch=0,replyRoute=null,lookup=null,lookupAt=0,serverOffset=0,lastLog=new Map();
 const serverNow=()=>now()+serverOffset;
 function valid(){return !!pilot&&Date.parse(pilot.vence_at)>serverNow();}
 function note(code,message){const t=now();if(!lastLog.has(code)||t-lastLog.get(code)>=15000){lastLog.set(code,t);logger(message);}}
 function matches(jid){return valid()&&phone(jid)!==null&&phone(jid)===phoneKey(pilot.tester);}
 function reset(){pilot=null;inbox=[];replyRoute=null;lookup=null;lookupAt=0;epoch++;}
 async function expectedLid(tester){
  const mapping=socket.signalRepository?.lidMapping;
  if(typeof mapping?.getLIDForPN!=='function')return null;
  if(!lookup||now()-lookupAt>=30000){
   // Resolve only the explicitly authorized phone number, never search arbitrary contacts.
   lookupAt=now();const canonical=phoneKey(tester);const variants=[tester,canonical];if(/^\+54\d{10}$/.test(canonical||''))variants.push('+549'+canonical.slice(3));
   lookup=Promise.all([...new Set(variants)].map(n=>Promise.resolve().then(()=>mapping.getLIDForPN(n.slice(1)+'@s.whatsapp.net')).then(lidJid).catch(()=>null))).then(results=>{const unique=[...new Set(results.filter(Boolean))];return unique.length===1?unique[0]:null;});
  }
  return lookup;
 }
 async function resolveSender(key,tester){
  const direct=pnJid(key?.remoteJid);
  if(direct)return {pn:direct,route:direct};
  const lid=lidJid(key?.remoteJid);
  if(!lid)return null; // Never handle groups, broadcasts, or newsletters.
  const alt=pnJid(key.remoteJidAlt);
  let mapped=null;
  try{mapped=pnJid(await socket.signalRepository?.lidMapping?.getPNForLID?.(key.remoteJid));}catch{/* fail closed below */}
  // Baileys exposes remoteJidAlt from the WhatsApp envelope and its own LID mapping.
  // When both are present they must agree. An opaque LID alone is never a phone number.
  if(alt&&mapped&&phone(alt)!==phone(mapped))return null;
  const pn=alt||mapped;
  if(pn)return {pn,route:lid};
  const expected=await expectedLid(tester);
  if(expected&&expected===lid)return {pn:tester.slice(1)+'@s.whatsapp.net',route:lid};
  return null;
 }
 async function receive(event){
  if(!active()||!['notify','append'].includes(event?.type))return;
  if(!valid()){note('inactive','WhatsApp recibió un evento antes de que el ensayo esté autorizado; reenviá el mensaje cuando indique listo.');return;}
  const mine=epoch,p=pilot;
  for(const m of event.messages||[]){
   if(!active()||mine!==epoch||!valid())return;
   if(m.key?.fromMe||m.broadcast||typeof m.key?.id!=='string'||m.key.id.length<1||m.key.id.length>200)continue;
   const timestamp=Number(m.messageTimestamp)*1000;
   const startedAt=Date.parse(p.creado_at);
   // An append can be a genuine offline-delivered new message. Never import
   // messages sent before consent, and never accept append without a server start.
   if(!Number.isFinite(timestamp)||timestamp>serverNow()+10000||timestamp<serverNow()-(Number.isFinite(startedAt)?120000:60000)||
     (Number.isFinite(startedAt)?timestamp<Math.ceil(startedAt/1000)*1000:event.type==='append')){note('time','Evento descartado por antigüedad o fuera del período autorizado.');continue;}
   const sender=await resolveSender(m.key,p.tester).catch(()=>null);
   if(!active()||mine!==epoch||pilot?.id!==p.id||!valid())return;
   if(!sender||!matches(sender.pn)){note('identity','Evento omitido: WhatsApp no confirmó que sea del contacto de ensayo.');continue;}
   const content=m.message?.ephemeralMessage?.message??m.message;
   const text=content?.conversation??content?.extendedTextMessage?.text;
   if(typeof text!=='string'||!text.trim()||text.length>1000){note('text','Evento del contacto autorizado sin texto simple (puede estar pendiente de descifrado).');continue;}
   if(inbox.length<20){
    // The server validates the canonical phone number again. Keep the verified LID
    // only in this transport's RAM to send replies to the same WhatsApp chat.
    inbox.push({p_piloto:p.id,p_jid:sender.pn,p_evento:m.key.id,p_texto:text});
    replyRoute={phone:phone(sender.pn),jid:sender.route};
    note('queue','Mensaje del contacto autorizado recibido; enviándolo a GESTLOK WAI.');
   }
  }
 }
 async function tick(revision){
  if(working||!active())return;
  working=true;
  try{
   const call=(action,args={})=>rpc('gestlok_chat_wai_piloto_motor',{p_revision:revision,p_accion:action,...args});
   const next=await call('control');
   if(!active())return;
   const remoteTime=Date.parse(next?.hora_servidor);if(Number.isFinite(remoteTime))serverOffset=remoteTime-now();
   if(!next||!phoneKey(next.tester)||Date.parse(next.vence_at)<=serverNow()){if(pilot)logger('Ensayo finalizado.');reset();return;}
   if(pilot?.id!==next.id){reset();logger('Ensayo autorizado. Listo para recibir mensajes del contacto.');}
   pilot=next;
   while(inbox.length&&active()){
    const item=inbox.shift();
    if(item.p_piloto===pilot.id&&matches(item.p_jid)){
     const result=await call('recibir',item);
     if(result?.ok)logger('Mensaje de ensayo recibido por GESTLOK WAI.');else note('server','El servidor no admitió este mensaje de ensayo.');
    }
   }
   if(!active())return;
   const job=await call('tomar',{p_piloto:pilot.id});
   if(!job||!active()||!matches(job.jid)||typeof job.texto!=='string'||job.texto.length>1000)return;
   // Server granted a single atomic claim; no retry even if socket lost after send.
   const target=replyRoute?.phone===phone(job.jid)?replyRoute.jid:job.jid;
   let state='incierto';
   try{const result=await socket.sendMessage(target,{text:job.texto});if(result?.key?.id)state='aceptado';}catch{/* no retry */}
   await call('resultado',{p_piloto:pilot.id,p_mensaje:job.id,p_estado:state});
   logger(state==='aceptado'?'Respuesta entregada al transporte de WhatsApp.':'Resultado de envío incierto. No se reintenta.');
  }catch{note('error','No se pudo consultar o entregar el ensayo al servidor. Se volverá a comprobar.');reset();}finally{working=false;}
 }
 return {receive,tick,reset};
}

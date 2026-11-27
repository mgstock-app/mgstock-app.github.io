// Explicit, short test transport: one consenting number, text only, no auto-reply,
// no history, no bulk messages. A reserved reply is never retried after ambiguity.
import {phoneKey} from './session.mjs';
const pnJid=jid=>{
 const m=/^([1-9]\d{7,14})(?::\d+)?@s\.whatsapp\.net$/.exec(jid||'');
 return m?m[1]+'@s.whatsapp.net':null;
};
const lidJid=jid=>{
 const m=/^(\d{1,20})(?::\d+)?@lid$/.exec(jid||'');
 return m?m[1]+'@lid':null;
};
const phone=jid=>{const pn=pnJid(jid);return pn?phoneKey('+'+pn.split('@')[0]):null;};

export function pilotTransport({rpc,socket,active,now=Date.now,logger=()=>{}}){
 let pilot=null,inbox=[],working=false,epoch=0,replyRoute=null,lookup=null,lookupAt=0;
 function valid(){return !!pilot&&Date.parse(pilot.vence_at)>now();}
 function matches(jid){return valid()&&phone(jid)!==null&&phone(jid)===phoneKey(pilot.tester);}
 function reset(){pilot=null;inbox=[];replyRoute=null;lookup=null;lookupAt=0;epoch++;}
 async function expectedLid(tester){
  const mapping=socket.signalRepository?.lidMapping;
  if(typeof mapping?.getLIDForPN!=='function')return null;
  if(!lookup||now()-lookupAt>=30000){
   // Resolve only the explicitly authorized phone number, never search arbitrary contacts.
   lookupAt=now();lookup=Promise.resolve().then(()=>mapping.getLIDForPN(tester.slice(1)+'@s.whatsapp.net')).then(lidJid).catch(()=>null);
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
  if(!active()||event?.type!=='notify'||!valid())return;
  const mine=epoch,p=pilot;
  for(const m of event.messages||[]){
   if(!active()||mine!==epoch||!valid())return;
   if(m.key?.fromMe||m.broadcast||typeof m.key?.id!=='string'||m.key.id.length<1||m.key.id.length>200)continue;
   const timestamp=Number(m.messageTimestamp)*1000;
   if(!Number.isFinite(timestamp)||timestamp<now()-60000||timestamp>now()+10000)continue;
   const sender=await resolveSender(m.key,p.tester).catch(()=>null);
   if(!active()||mine!==epoch||pilot?.id!==p.id||!valid())return;
   if(!sender||!matches(sender.pn))continue;
   const text=m.message?.conversation??m.message?.extendedTextMessage?.text;
   if(typeof text!=='string'||!text.trim()||text.length>1000)continue;
   if(inbox.length<20){
    // The server validates the canonical phone number again. Keep the verified LID
    // only in this transport's RAM to send replies to the same WhatsApp chat.
    inbox.push({p_piloto:p.id,p_jid:sender.pn,p_evento:m.key.id,p_texto:text});
    replyRoute={phone:phone(sender.pn),jid:sender.route};
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
   if(!next||!phoneKey(next.tester)||Date.parse(next.vence_at)<=now()){if(pilot)logger('Ensayo finalizado.');reset();return;}
   if(pilot?.id!==next.id){reset();logger('Ensayo autorizado. Listo para recibir mensajes del contacto.');}
   pilot=next;
   while(inbox.length&&active()){
    const item=inbox.shift();
    if(item.p_piloto===pilot.id&&matches(item.p_jid)){
     const result=await call('recibir',item);
     if(result?.ok)logger('Mensaje de ensayo recibido por GESTLOK WAI.');
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
  }catch{reset();}finally{working=false;}
 }
 return {receive,tick,reset};
}

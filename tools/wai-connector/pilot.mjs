// Explicit, short test transport: one consenting number, text only, no auto-reply,
// no history, no bulk messages. A reserved reply is never retried after ambiguity.
import {phoneKey} from './session.mjs';
export function pilotTransport({rpc,socket,active,now=Date.now}){
 let pilot=null,inbox=[],working=false;
 function phone(jid){const match=/^(\d{8,15})@s\.whatsapp\.net$/.exec(jid||'');return match?phoneKey('+'+match[1]):null;}
 function matches(jid){return pilot&&Date.parse(pilot.vence_at)>now()&&phone(jid)!==null&&phone(jid)===phoneKey(pilot.tester);}
 function receive(event){
  if(!active()||event?.type!=='notify'||!pilot)return;
  for(const m of event.messages||[]){
   const jid=m.key?.remoteJid;
   if(m.key?.fromMe||!matches(jid)||typeof m.key?.id!=='string'||m.key.id.length>200)continue;
   const text=m.message?.conversation??m.message?.extendedTextMessage?.text;
   const timestamp=Number(m.messageTimestamp)*1000;
   if(typeof text!=='string'||!text.trim()||text.length>1000||!Number.isFinite(timestamp)||timestamp<now()-60000||timestamp>now()+10000)continue;
   if(inbox.length<20)inbox.push({p_piloto:pilot.id,p_jid:jid,p_evento:m.key.id,p_texto:text});
  }
 }
 async function tick(revision){
  if(working||!active())return;
  working=true;
  try{
   const call=(action,args={})=>rpc('gestlok_chat_wai_piloto_motor',{p_revision:revision,p_accion:action,...args});
   const next=await call('control');
   if(!active())return;
   if(!next||!phoneKey(next.tester)||Date.parse(next.vence_at)<=now()){pilot=null;inbox=[];return;}
   if(pilot?.id!==next.id)inbox=[];
   pilot=next;
   while(inbox.length&&active()){
    const item=inbox.shift();
    if(item.p_piloto===pilot.id&&matches(item.p_jid))await call('recibir',item);
   }
   if(!active())return;
   const job=await call('tomar',{p_piloto:pilot.id});
   if(!job||!active()||!matches(job.jid)||typeof job.texto!=='string'||job.texto.length>1000)return;
   // Server granted a single atomic claim; no retry even if socket lost after send.
   let state='incierto';
   try{const result=await socket.sendMessage(job.jid,{text:job.texto});if(result?.key?.id)state='aceptado';}catch{/* no retry */}
   await call('resultado',{p_piloto:pilot.id,p_mensaje:job.id,p_estado:state});
  }catch{pilot=null;inbox=[];}finally{working=false;}
 }
 function reset(){pilot=null;inbox=[];}
 return {receive,tick,reset};
}

// Explicit, short test transport: one consenting number, text and authorized polls.
// Server authorizes scripted replies. No bulk messaging or unrelated history.
// A reserved reply is never retried after ambiguity.
import {phoneKey} from './session.mjs';
import {normalizePoll,selectionFromVote} from './poll-store.mjs';
import {loadMenuImage} from './menu-media.mjs';
const pnJid=jid=>{
 const m=/^([1-9]\d{7,14})(?::\d+)?@(?:s\.whatsapp\.net|hosted)$/.exec(jid||'');
 return m?m[1]+'@s.whatsapp.net':null;
};
const lidJid=jid=>{
 const m=/^(\d{1,20})(?::\d+)?@(?:lid|hosted\.lid)$/.exec(jid||'');
 return m?m[1]+'@lid':null;
};
const phone=jid=>{const pn=pnJid(jid);return pn?phoneKey('+'+pn.split('@')[0]):null;};

export function pilotTransport({rpc,socket,active,now=Date.now,logger=()=>{},newMessageId=()=>null,initialGrant=null,pollStore=null,decryptVote=null,ownJids=()=>[],menuImage=loadMenuImage,immediate=false}){
 let pilot=null,inbox=[],working=false,epoch=0,replyRoute=null,lookup=null,lookupAt=0,serverOffset=0,lastLog=new Map(),pendingName=null,lastName=null,readyLogged=false,syncRequested=false;
 const known=new Map(),delivered=new Set(),alerts=new Set();
 let lastRevision=null,rerun=false,scheduled=false;
 // Only a received authorized event or a confirmed send wakes this worker.
 // Keep the regular verified heartbeat; never spin or retry an uncertain send.
 function wake(){
  if(!immediate||!lastRevision||!active())return;
  if(working){rerun=true;return;}
  if(scheduled)return;scheduled=true;
  queueMicrotask(()=>{scheduled=false;if(active()&&lastRevision)void tick(lastRevision);});
 }
 const keyId=id=>typeof id==='string'&&/^[A-Za-z0-9_-]{1,200}$/.test(id)?id:null;
 const routeOf=j=>pnJid(j)||lidJid(j);
 const serverNow=()=>now()+serverOffset;
 // Preflight only grants permission to identify the already-consenting contact
 // while a new socket opens. The server still has to confirm the live revision.
 if(initialGrant&&phoneKey(initialGrant.tester)&&Number.isFinite(Date.parse(initialGrant.creado_at))){
  const remoteTime=Date.parse(initialGrant.hora_servidor);if(Number.isFinite(remoteTime))serverOffset=remoteTime-now();
  if(Date.parse(initialGrant.vence_at)>serverNow())pilot=initialGrant;
 }
 function valid(){return !!pilot&&Date.parse(pilot.vence_at)>serverNow();}
 function note(code,message){const t=now();if(!lastLog.has(code)||t-lastLog.get(code)>=15000){lastLog.set(code,t);logger(message);}}
 function report(code){alerts.add(code);wake();}
 function matches(jid){return valid()&&phone(jid)!==null&&phone(jid)===phoneKey(pilot.tester);}
 function reset(){rerun=false;pilot=null;inbox=[];replyRoute=null;lookup=null;lookupAt=0;known.clear();delivered.clear();alerts.clear();pendingName=null;lastName=null;readyLogged=false;syncRequested=false;epoch++;}
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
 // The linked session may share saved contact names in authenticated app-state changes.
 // Never import the phone's entire contact book, profile names, or unrelated contacts.
 async function contacts(entries){
  if(!active()||!valid()||!Array.isArray(entries))return;
  const mine=epoch,p=pilot,wanted=phoneKey(p.tester);
  for(const c of entries){
   if(!active()||mine!==epoch||!valid())return;
   if(typeof c?.name!=='string'||!c.name.trim()||c.name.trim().length>100||/[\x00-\x1f\x7f]/.test(c.name)||c.name.trim()===c.username)continue;
   const id=routeOf(c.id);if(!id)continue;
   const direct=[phone(c.id),phone(c.phoneNumber)].filter(Boolean);
   if(direct.some(n=>n!==wanted))continue;
   let verified=direct.includes(wanted);
   if(!verified&&lidJid(id)){
    const expected=await expectedLid(p.tester).catch(()=>null);
    verified=expected===lidJid(id)||(replyRoute?.phone===wanted&&lidJid(replyRoute.jid)===lidJid(id));
   }
   if(!active()||mine!==epoch||pilot?.id!==p.id||!valid())return;
   if(verified&&c.name.trim()!==lastName)pendingName={pilot:p.id,name:c.name.trim(),jid:p.tester.slice(1)+'@s.whatsapp.net'};
  }
 }
 async function receive(event){
  if(!active()||!['notify','append'].includes(event?.type))return;
  if(!valid()){note('inactive','WhatsApp recibió un evento antes de que el ensayo esté autorizado; reenviá el mensaje cuando indique listo.');return;}
  const mine=epoch,p=pilot;let added=false;
  for(const m of event.messages||[]){
   if(!active()||mine!==epoch||!valid())return;
   if(m.broadcast||typeof m.key?.id!=='string'||m.key.id.length<1||m.key.id.length>200)continue;
   const fromPhone=m.key?.fromMe===true;
   if(fromPhone&&(!keyId(m.key.id)||known.has(m.key.id)))continue;
   const timestamp=Number(m.messageTimestamp)*1000;
   const startedAt=Date.parse(p.creado_at);
   // An append can be a genuine offline-delivered new message. Never import
   // messages sent before consent, and never accept append without a server start.
   if(!Number.isFinite(timestamp)||timestamp>serverNow()+10000||(!Number.isFinite(startedAt)&&timestamp<serverNow()-60000)||
     (Number.isFinite(startedAt)?timestamp<Math.ceil(startedAt/1000)*1000:event.type==='append')){note('time','Evento descartado por antigüedad o fuera del período autorizado.');continue;}
   const sender=await resolveSender(m.key,p.tester).catch(()=>null);
   if(!active()||mine!==epoch||pilot?.id!==p.id||!valid())return;
   if(!sender||!matches(sender.pn)){note('identity','Evento omitido: WhatsApp no confirmó que sea del contacto de ensayo.');continue;}
   const content=m.message?.ephemeralMessage?.message??m.message;
   // rc14 exposes the authenticated encrypted poll update through upsert.
   // Only decrypt our own saved poll, from the same consenting contact.
   if(content?.pollUpdateMessage){
    const v=content.pollUpdateMessage,creation=v.pollCreationMessageKey,id=keyId(creation?.id);
    if(!fromPhone&&pollStore&&decryptVote&&id&&inbox.length<40){
     const r=await pollStore.get(id,p,sender.route,sender.pn,serverNow(),true);
     if(r&&active()&&mine===epoch&&valid()){
      const mappedLid=await expectedLid(p.tester).catch(()=>null);
      const voters=[...new Set([sender.route,sender.pn,p.tester.slice(1)+'@s.whatsapp.net',mappedLid].filter(Boolean))],creators=[...new Set(ownJids().map(routeOf).filter(Boolean))];
      let choice=null,withdrawn=false;
      for(const pollCreatorJid of creators){for(const voterJid of voters){
       try{const decoded=decryptVote(v.vote,{pollCreatorJid,pollMsgId:id,pollEncKey:Buffer.from(r.secret,'base64'),voterJid});withdrawn=Array.isArray(decoded?.selectedOptions)&&decoded.selectedOptions.length===0;choice=selectionFromVote(r.opciones,decoded,r.multiple===true);}catch{}
       if(choice)break;
      }if(choice)break;}
      if(choice&&active()&&mine===epoch&&valid()){
       inbox.push({action:'voto',args:{p_piloto:p.id,p_jid:sender.pn,p_evento:id,p_texto:choice}});added=true;
       replyRoute={phone:phone(sender.pn),jid:sender.route};
       note('vote','Opción seleccionada en WhatsApp; sincronizando.');
      }else if(!withdrawn&&active()&&mine===epoch&&valid()){note('vote-decode','No se pudo descifrar una selección autorizada. Se avisará al gerente.');report('voto_no_descifrado');}
     }else if(active()&&mine===epoch&&valid()&&known.has(id)){note('vote-record','No se encontró la encuesta de este ensayo. Se avisará al gerente.');report('voto_no_descifrado');}
    }else if(!fromPhone&&inbox.length>=40){report('cola_llena');}
    continue;
   }
   const text=content?.conversation??content?.extendedTextMessage?.text;
   if(typeof text!=='string'||!text.trim()||text.length>1000){note('text','Evento del contacto autorizado sin texto simple (puede estar pendiente de descifrado).');continue;}
   if(inbox.length<40){
    added=true;
    // The server validates the canonical phone number again. Keep the verified LID
    // only in this transport's RAM to send replies to the same WhatsApp chat.
    const args={p_piloto:p.id,p_jid:sender.pn,p_evento:m.key.id,p_texto:text};
    if(fromPhone){
     known.set(m.key.id,sender.route);
     inbox.push({action:'recibir_salida',args:{...args,p_estado:[3,4,5].includes(Number(m.status))?'entregado':'enviado'}});
     note('phone','Mensaje enviado desde el teléfono al contacto autorizado; sincronizando historial.');
    }else{
     inbox.push({action:'recibir',args});
     replyRoute={phone:phone(sender.pn),jid:sender.route};
     note('queue','Mensaje del contacto autorizado recibido; enviándolo a GESTLOK WAI.');
    }
   }else report('cola_llena');
  }
  if(added)wake();
 }
 // Direct receipts only: no group/status metadata and no identifiers from unrelated messages.
 async function receipt(updates){
  if(!active()||!valid()||!Array.isArray(updates))return;
  const mine=epoch,p=pilot;
  for(const u of updates){
   const id=keyId(u?.key?.id),route=routeOf(u?.key?.remoteJid);
   if(!id||u.key.fromMe!==true||![3,4,5].includes(Number(u.update?.status))||!route||!known.has(id))continue;
   const expected=known.get(id);
   let match=route===expected||phone(route)!==null&&phone(route)===phoneKey(p.tester);
   if(!match){const sender=await resolveSender(u.key,p.tester).catch(()=>null);match=!!sender&&phone(sender.pn)===phoneKey(p.tester);}
   if(!active()||mine!==epoch||!valid())return;
   if(match)delivered.add(id);
  }
 }
 async function transmit(target,content,requestedId=null){
  const proposed=keyId(requestedId||newMessageId());if(proposed)known.set(proposed,target);
  try{
   const result=await socket.sendMessage(target,content,proposed?{messageId:proposed}:{});
   const id=keyId(result?.key?.id);
   if(proposed&&proposed!==id){known.delete(proposed);delivered.delete(proposed);}
   if(id){known.set(id,target);return id;}
  }catch{/* Ambiguous transport result: never retry a message or correction. */}
  if(proposed){known.delete(proposed);delivered.delete(proposed);}
  return null;
 }
 async function tick(revision){
  if(!active())return;
  if(working)return;
  lastRevision=revision;working=true;rerun=false;
  try{
   const call=(action,args={})=>rpc('gestlok_chat_wai_piloto_motor',{p_revision:revision,p_accion:action,...args});
   const capabilities=pollStore&&decryptVote?{p_estado:'opciones_imagen_v2'}:{};
   const next=await call('control',capabilities);
   if(!active())return;
   const remoteTime=Date.parse(next?.hora_servidor);if(Number.isFinite(remoteTime))serverOffset=remoteTime-now();
   if(!next||!phoneKey(next.tester)||Date.parse(next.vence_at)<=serverNow()){if(pilot)logger('Ensayo finalizado.');reset();return;}
   const changed=pilot?.id!==next.id;
   if(changed)reset();
   pilot=next;
   if(!readyLogged){readyLogged=true;logger('Ensayo autorizado. Listo para recibir mensajes del contacto.');}
   // Request incremental app-state contact changes only; no history or full reset.
   // A previously synced/suppressed name may not be exposed by WhatsApp again.
   if(!syncRequested&&typeof socket.resyncAppState==='function'){syncRequested=true;void Promise.resolve().then(()=>socket.resyncAppState(['critical_unblock_low'],false)).catch(()=>{});}
   if(pendingName?.pilot===pilot.id){
    const current=pendingName,result=await call('agenda',{p_piloto:pilot.id,p_jid:current.jid,p_texto:current.name});
    if(result?.ok){lastName=current.name;if(pendingName===current)pendingName=null;}
    else if(pendingName===current)pendingName=null;
   }
   for(const item of Array.isArray(next.salientes)?next.salientes:[]){
    const route=routeOf(item?.ruta);
    if(!route)continue;
    for(const id of [keyId(item.wa_id),keyId(item.accion_id)])if(id)known.set(id,route);
   }
   for(const code of [...alerts]){
    const result=await call('alerta',{p_piloto:pilot.id,p_estado:code});if(result?.ok)alerts.delete(code);
   }
   while(inbox.length&&active()){
    const item=inbox[0],args=item.args;
    if(args.p_piloto===pilot.id&&matches(args.p_jid)){
     const result=await call(item.action,args);
     if(result?.ok)logger(item.action==='voto'?'Selección de WhatsApp registrada.':item.action==='recibir_salida'?'Mensaje del teléfono sincronizado.':'Mensaje de ensayo recibido por GESTLOK WAI.');else {note('server','El servidor no admitió este mensaje de ensayo; se avisará al gerente.');report(item.action==='voto'?'voto_no_registrado':'entrada_no_registrada');}
    }
    inbox.shift();
   }
   for(const id of [...delivered]){
    await call('entrega',{p_piloto:pilot.id,p_evento:id});delivered.delete(id);
   }
   if(!active())return;
   const action=await call('tomar_accion',{p_piloto:pilot.id});
   if(action){
    const id=keyId(action.wa_id),target=routeOf(action.ruta);
    let operation=null;
    // Only the durable routing key of a message created by this pilot may be modified.
    if(active()&&valid()&&id&&target&&known.get(id)===target&&(action.tipo==='eliminar'||action.tipo==='editar'&&typeof action.texto==='string'&&action.texto.trim()&&action.texto.length<=1000)){
     const key={remoteJid:target,id,fromMe:true};
     operation=await transmit(target,action.tipo==='editar'?{text:action.texto,edit:key}:{delete:key});
    }
    await call('resultado_accion',{p_piloto:pilot.id,p_mensaje:action.id,p_estado:operation?'aceptado':'incierto',p_evento:operation});
    logger(operation?'Corrección de ensayo enviada a WhatsApp.':'Corrección no confirmada. No se reintenta.');
    return;
   }
   const job=await call('tomar',{p_piloto:pilot.id,...capabilities});
   if(!job||!active()||!matches(job.jid)||typeof job.texto!=='string'||job.texto.length>1000)return;
   // Server granted a single atomic claim; no retry even if socket lost after send.
   const target=replyRoute?.phone===phone(job.jid)?replyRoute.jid:job.jid;
   let id=null;
   if(job.interaccion){
    const spec=normalizePoll(job.interaccion),proposed=keyId(newMessageId());
    // Never downgrade a queued native selection to an accidental text send.
    if(spec&&proposed&&pollStore&&decryptVote){
     try{
      const content=await pollStore.create(proposed,target,job.jid,pilot,spec);
      if(active()&&valid())id=await transmit(target,content,proposed);
      if(id!==proposed)id=null;
     }catch{}
    }
   }else if(job.imagen_url){
    // Load an approved bounded public asset before attempting WhatsApp; do not retry ambiguous sends.
    try{const media=await menuImage(job.imagen_url);if(active()&&valid()&&matches(job.jid))id=await transmit(target,{...media});}
    catch{note('menu-media','No se pudo descargar la foto de carta. Revisá su configuración en Gestlok.');}
   }else id=await transmit(target,{text:job.texto});
   const state=id?'aceptado':'incierto';
   await call('resultado',{p_piloto:pilot.id,p_mensaje:job.id,p_estado:state,...(id?{p_evento:id,p_jid:target}:{})});
   logger(id?'Respuesta enviada al transporte de WhatsApp.':'Resultado de envío incierto. No se reintenta.');
   if(id)wake();
  }catch{note('error','No se pudo consultar o entregar el ensayo al servidor. Se volverá a comprobar.');if(pilot&&valid()&&inbox.length)alerts.add('sincronizacion_pendiente');/* Preserve unsynced authorized input until the next heartbeat; server deduplicates. */}finally{working=false;if(rerun){rerun=false;wake();}}
 }
 return {receive,receipt,contacts,tick,reset};
}

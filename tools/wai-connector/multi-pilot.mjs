// Shared socket, isolated per-contact workers. Open intake is server-authorized
// for an explicit test line, ONLY from a fresh direct incoming message.
import {pilotTransport} from './pilot.mjs';
import {phoneKey} from './session.mjs';
const pn=jid=>{const m=/^([1-9]\d{7,14})(?::\d+)?@(?:s\.whatsapp\.net|hosted)$/.exec(jid||'');return m?m[1]+'@s.whatsapp.net':null;};
const phoneJid=jid=>pn(jid)?phoneKey('+'+pn(jid).split('@')[0]):null;
const isLid=jid=>/^\d{1,20}(?::\d+)?@(?:lid|hosted\.lid)$/.test(jid||'');
const usable=g=>g&&typeof g.id==='string'&&phoneKey(g.tester)&&Number.isFinite(Date.parse(g.vence_at))&&Number.isFinite(Date.parse(g.creado_at));
export function multiPilotTransport({rpc,active,initialGrants=[],initialOpen=false,initialRevision=null,centralAllowed=false,logger=()=>{},workerFactory=pilotTransport,now=Date.now,...opts}){
 const children=new Map(),admissions=new Map();
 let epoch=0,working=false,open=initialOpen===true,lastRevision=initialRevision,sequence=0;
 function add(g,admitted=false){
  if(!usable(g))return null;
  const old=children.get(g.id);
  if(old){if(phoneKey(old.grant.tester)!==phoneKey(g.tester)){children.delete(g.id);old.worker.reset();}else{old.grant=g;return old;}}
  const entry={grant:g,worker:null,added:admitted?++sequence:0};
  const localRpc=(name,args)=>{
   if(args.p_piloto&&args.p_piloto!==g.id)return Promise.resolve(null);
   if(name!=='gestlok_chat_wai_piloto_motor'&&name!=='gestlok_chat_wai_recibir_imagen')return Promise.resolve(null);
   return rpc(name,{...args,p_piloto:g.id});
  };
  entry.worker=workerFactory({...opts,now,rpc:localRpc,active:()=>active()&&children.get(g.id)===entry,initialGrant:g,logger});
  children.set(g.id,entry);return entry;
 }
 function reconcile(grants,snapshot=sequence){
  // Fail closed on invalid or excessively large test inventory.
  if(!Array.isArray(grants)||grants.length>(open?30:5)||grants.some(g=>!usable(g))||new Set(grants.map(g=>g.id)).size!==grants.length||new Set(grants.map(g=>phoneKey(g.tester))).size!==grants.length)grants=[];
  const ids=new Set(grants.map(g=>g.id));
  for(const [id,c] of children)if(!ids.has(id)&&c.added<=snapshot){children.delete(id);c.worker.reset();}
  for(const g of grants)add(g);
 }
 reconcile(initialGrants);
 async function identity(key){
  const remote=key?.remoteJid,direct=pn(remote);
  if(direct)return direct;
  if(!isLid(remote))return null;
  const alt=pn(key.remoteJidAlt);let mapped=null;
  try{mapped=pn(await opts.socket?.signalRepository?.lidMapping?.getPNForLID?.(remote));}catch{}
  if(alt&&mapped&&phoneJid(alt)!==phoneJid(mapped))return null;
  return alt||mapped;
 }
 async function admit(message,mine){
  if(!open||!lastRevision||!active()||mine!==epoch||message.broadcast||message.key?.fromMe!==false)return null;
  const content=message.message?.ephemeralMessage?.message??message.message;
  const text=content?.conversation??content?.extendedTextMessage?.text;
  if(!(typeof text==='string'&&text.trim()&&text.length<=1000)&&!content?.imageMessage)return null;
  const id=message.key?.id,ts=Number(message.messageTimestamp);
  if(!/^[A-Za-z0-9_-]{1,200}$/.test(id||'')||!Number.isSafeInteger(ts))return null;
  const jid=await identity(message.key);
  if(!jid||!active()||mine!==epoch||!open)return null;
  const number=phoneJid(jid);
  // Serialize admissions for a phone. A duplicate cannot create a second grant.
  let pending=admissions.get(number);
  if(!pending){
   if(admissions.size>=30)return null;
   pending=(async()=>{
    const grant=await rpc('gestlok_chat_wai_admitir_entrada',{p_revision:lastRevision,p_jid:jid,p_evento:id,p_fecha:ts});
    if(!active()||mine!==epoch||!open||!usable(grant)||phoneKey(grant.tester)!==number)return null;
    return add(grant,true);
   })().catch(()=>null);
   admissions.set(number,pending);
  }
  try{return await pending;}finally{if(admissions.get(number)===pending)admissions.delete(number);}
 }
 async function receive(event){
  if(!active()||!['notify','append'].includes(event?.type))return;
  const mine=epoch;
  // Route known contacts independently; opaque LIDs are validated by the worker.
  const messages=event.messages||[];
  // If the administrator just enabled reception, confirm the mode before
  // dropping a fresh direct message. No sender data is sent while mode is off.
  if(!open&&centralAllowed&&lastRevision&&messages.some(m=>m?.key?.fromMe===false&&!m.broadcast&&(pn(m.key.remoteJid)||isLid(m.key.remoteJid)))){
   try{
    const snapshot=sequence,result=await rpc('gestlok_chat_wai_ensayos_autorizados',{p_revision:lastRevision,p_activo:true});
    if(!active()||mine!==epoch)return;
    open=result?.recepcion_entrante===true;reconcile(result?.ensayos,snapshot);
   }catch{}
  }
  const existing=[...children.values()];
  if(open){
   await Promise.allSettled(messages.map(async m=>{
    const direct=await identity(m?.key);if(!direct||mine!==epoch||!active())return;
    const key=phoneJid(direct);
    const found=existing.find(c=>phoneKey(c.grant.tester)===key&&Date.parse(c.grant.vence_at)>now());
    if(found)return; // Existing worker receives it in the normal dispatch below.
    const child=await admit(m,mine);
    if(!child||!active()||mine!==epoch)return;
    await child.worker.receive({...event,messages:[m]});
    if(lastRevision)await child.worker.tick(lastRevision);
   }));
  }
  if(!active()||mine!==epoch)return;
  await Promise.allSettled(existing.map(async c=>{
   const phone=phoneKey(c.grant.tester);
   const matching=messages.filter(m=>{
    const remote=m?.key?.remoteJid;
    const direct=phoneJid(remote);
    if(direct)return direct===phone;
    if(!isLid(remote))return false;
    const alt=phoneJid(m?.key?.remoteJidAlt);
    return !alt||alt===phone;
   });
   if(matching.length)await c.worker.receive({...event,messages:matching});
  }));
 }
 async function receipt(events){if(active())await Promise.allSettled([...children.values()].map(c=>c.worker.receipt(events)));}
 async function contacts(events){if(active())await Promise.allSettled([...children.values()].map(c=>c.worker.contacts(events)));}
 async function tick(revision){
  if(!active()||working)return;
  working=true;const mine=epoch,snapshot=sequence;lastRevision=revision;
  try{
   const result=await rpc('gestlok_chat_wai_ensayos_autorizados',{p_revision:revision,p_activo:true});
   if(!active()||mine!==epoch)return;
   open=result?.recepcion_entrante===true;
   reconcile(result?.ensayos,snapshot);
   const batch=[...children.values()];let i=0;
   await Promise.allSettled(Array.from({length:Math.min(batch.length,8)},async()=>{while(i<batch.length&&active()&&mine===epoch)await batch[i++].worker.tick(revision);}));
  }catch{/* Workers revalidate every control call; never send on unverified control. */}
  finally{working=false;}
 }
 function reset(){epoch++;open=false;lastRevision=null;for(const c of children.values())c.worker.reset();children.clear();admissions.clear();}
 return {receive,receipt,contacts,tick,reset};
}

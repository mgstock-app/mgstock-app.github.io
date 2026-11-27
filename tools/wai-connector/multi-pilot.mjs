// One linked socket, independent per-contact bounded test workers.
// Production onboarding is deliberately not enabled here: the server supplies
// only contacts explicitly authorized by the administrator.
import {pilotTransport} from './pilot.mjs';
import {phoneKey} from './session.mjs';
const phoneJid=jid=>{
 const m=/^([1-9]\d{7,14})(?::\d+)?@(?:s\.whatsapp\.net|hosted)$/.exec(jid||'');
 return m?phoneKey('+'+m[1]):null;
};
const isLid=jid=>/^\d{1,20}(?::\d+)?@(?:lid|hosted\.lid)$/.test(jid||'');
const usable=g=>g&&typeof g.id==='string'&&phoneKey(g.tester)&&Number.isFinite(Date.parse(g.vence_at))&&Number.isFinite(Date.parse(g.creado_at));
export function multiPilotTransport({rpc,active,initialGrants=[],logger=()=>{},...opts}){
 const children=new Map();
 let epoch=0,working=false;
 function reconcile(grants){
  // Malformed or repeated authorization snapshots fail closed.
  if(!Array.isArray(grants)||grants.length>5||grants.some(g=>!usable(g))||new Set(grants.map(g=>g.id)).size!==grants.length||new Set(grants.map(g=>phoneKey(g.tester))).size!==grants.length)grants=[];
  const ids=new Set(grants.map(g=>g.id));
  for(const [id,c] of children)if(!ids.has(id)){children.delete(id);c.worker.reset();}
  for(const g of grants){
   const old=children.get(g.id);
   if(old){if(phoneKey(old.grant.tester)!==phoneKey(g.tester)){children.delete(g.id);old.worker.reset();}else{old.grant=g;continue;}}
   const entry={grant:g,worker:null};
   const localRpc=(name,args)=>{
    if(args.p_piloto&&args.p_piloto!==g.id)return Promise.resolve(null);
    if(name!=='gestlok_chat_wai_piloto_motor'&&name!=='gestlok_chat_wai_recibir_imagen')return Promise.resolve(null);
    return rpc(name,{...args,p_piloto:g.id});
   };
   entry.worker=pilotTransport({...opts,rpc:localRpc,active:()=>active()&&children.get(g.id)===entry,initialGrant:g,logger});
   children.set(g.id,entry);
  }
 }
 reconcile(initialGrants);
 async function receive(event){
  if(!active()||!['notify','append'].includes(event?.type))return;
  // PN events reach only their corresponding worker. Opaque LIDs are checked
  // by each worker against the authenticated mapping; groups never dispatch.
  await Promise.allSettled([...children.values()].map(async c=>{
   const phone=phoneKey(c.grant.tester);
   const messages=(event.messages||[]).filter(m=>{
    const remote=m?.key?.remoteJid;
    const direct=phoneJid(remote);
    if(direct)return direct===phone;
    if(!isLid(remote))return false;
    const alt=phoneJid(m?.key?.remoteJidAlt);
    return !alt||alt===phone;
   });
   if(messages.length)await c.worker.receive({...event,messages});
  }));
 }
 async function receipt(events){if(active())await Promise.allSettled([...children.values()].map(c=>c.worker.receipt(events)));}
 async function contacts(events){if(active())await Promise.allSettled([...children.values()].map(c=>c.worker.contacts(events)));}
 async function tick(revision){
  if(!active()||working)return;
  working=true;const mine=epoch;
  try{
   const result=await rpc('gestlok_chat_wai_ensayos_autorizados',{p_revision:revision,p_activo:true});
   if(!active()||mine!==epoch)return;
   reconcile(result?.ensayos);
   await Promise.allSettled([...children.values()].map(c=>c.worker.tick(revision)));
  }catch{/* Existing workers also validate every control call. Preserve queues on transient failures. */}
  finally{working=false;}
 }
 function reset(){epoch++;for(const c of children.values())c.worker.reset();children.clear();}
 return {receive,receipt,contacts,tick,reset};
}

// In-memory, offline rehearsal only. This is NOT a public webhook and does not
// replace raw-body signature verification. The caller supplies synthetic events
// and a server-controlled allowlist. No network, credentials, storage or sends.
import {conversationPreview} from './conversation.mjs';
import {readYCloudInput} from './native-menu.mjs';
import {prepareExclusions,excludedSender} from './exclusions.mjs';
const e164=/^\+[1-9]\d{7,14}$/;
const id=v=>typeof v==='string'&&v.length>0&&v.length<=200;
export function createOfflinePilot(routes){
 const registry=structuredClone(routes);
 const uniq=new Set();
 for(const r of registry){
  if(!id(r.waba)||!e164.test(r.to)||!id(r.empresa)||!id(r.sucursal)||!Array.isArray(r.senders)||!r.senders.length||r.senders.some(p=>!e164.test(p)||p===r.to))throw Error('Ruta ficticia inválida');
  const k=JSON.stringify([r.waba,r.to]);if(uniq.has(k))throw Error('Ruta ambigua');uniq.add(k);
  r.exclusions=prepareExclusions(r.excludedSenders);
 }
 const sessions=new Map(),seen=new Set(),pending=new Map(),handoffs=new Map();
 let preceding=Promise.resolve();
 function receive(payload,now=new Date()){
  // Serialize simulated turns even when multiple deliveries arrive simultaneously.
  const work=preceding.then(()=>process(structuredClone(payload),now));
  preceding=work.catch(()=>{});
  return work;
 }
 async function process(p,now){
  const drop=reason=>({accepted:false,reason,sendAllowed:false});
  if(p?.type!=='whatsapp.inbound_message.received'||p.apiVersion!=='v2')return drop('other_event');
  const m=p.whatsappInboundMessage;
  if(!id(p.id)||!id(m?.id)||!id(m.wabaId)||m.groupId||!e164.test(m.from)||!e164.test(m.to)||m.from===m.to)return drop('invalid_message');
  const input=readYCloudInput(m);if(!input)return drop('unsupported_message');
  const route=registry.find(r=>r.waba===m.wabaId&&r.to===m.to);
  if(!route)return drop('unmatched_route');
  if(excludedSender(route.exclusions,m.from))return drop('excluded_sender');
  if(!route.senders.includes(m.from))return drop('unmatched_route');
  const scope=JSON.stringify([route.empresa,route.sucursal,m.from]);
  const eventKey=JSON.stringify([scope,p.id]),messageKey=JSON.stringify([scope,m.id]),wamidKey=id(m.wamid)?JSON.stringify([scope,m.wamid]):null;
  if(seen.has(eventKey)||seen.has(messageKey)||wamidKey&&seen.has(wamidKey))return drop('duplicate');
  const result=await conversationPreview({identity:{empresa:route.empresa,sucursal:route.sucursal,phone:m.from},sucursal:route.config,catalogo:route.catalogo,privado:route.privado,session:sessions.get(scope),event:{id:m.id,...input},ahora:now});
  sessions.set(scope,result.session);seen.add(eventKey);seen.add(messageKey);if(wamidKey)seen.add(wamidKey);
  if(result.action?.type==='simulated_order'){
   const requestId=messageKey;
   pending.set(requestId,{id:requestId,empresa:route.empresa,sucursal:route.sucursal,status:'pendiente',pedido:result.action.pedido});
  }
  if(result.action?.type==='simulated_handoff'){
   handoffs.set(messageKey,{id:messageKey,empresa:route.empresa,sucursal:route.sucursal,status:'pendiente',reason:result.action.reason,detail:result.action.detail});
  }
  return {accepted:true,messages:result.messages,options:result.options,stage:result.session.stage,sendAllowed:false,...(result.native?{native:result.native}:{})};
 }
 // Manager review demonstration only: no live order approval or permission system.
 // Actual manager authentication/authorization stays with GESTLOK.
 function listPending({empresa,sucursal}){
  return structuredClone([...pending.values()].filter(x=>x.empresa===empresa&&x.sucursal===sucursal));
 }
 // Fictional operator actions only. These methods are NOT authentication and
 // must never be exposed as endpoints or used against real customer records.
 function listHandoffs({empresa,sucursal}){
  return structuredClone([...handoffs.values()].filter(x=>x.empresa===empresa&&x.sucursal===sucursal));
 }
 function reviewPending({empresa,sucursal,id,decision}){
  if(!['confirmado','rechazado'].includes(decision))return {ok:false,reason:'invalid_decision',sendAllowed:false};
  const record=pending.get(id);
  if(!record||record.empresa!==empresa||record.sucursal!==sucursal)return {ok:false,reason:'not_found',sendAllowed:false};
  if(record.status!=='pendiente')return {ok:false,reason:'already_reviewed',sendAllowed:false};
  record.status=decision;
  return {ok:true,status:decision,simulated:true,sendAllowed:false};
 }
 return {receive,listPending,listHandoffs,reviewPending};
}



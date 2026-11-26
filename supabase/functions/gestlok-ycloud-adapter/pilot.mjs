// In-memory, offline rehearsal only. This is NOT a public webhook and does not
// replace raw-body signature verification. The caller supplies synthetic events
// and a server-controlled allowlist. No network, credentials, storage or sends.
import {conversationPreview} from './conversation.mjs';
const e164=/^\+[1-9]\d{7,14}$/;
const id=v=>typeof v==='string'&&v.length>0&&v.length<=200;
export function createOfflinePilot(routes){
 const registry=structuredClone(routes);
 const uniq=new Set();
 for(const r of registry){
  if(!id(r.waba)||!e164.test(r.to)||!id(r.empresa)||!id(r.sucursal)||!Array.isArray(r.senders)||!r.senders.length||r.senders.some(p=>!e164.test(p)||p===r.to))throw Error('Ruta ficticia inválida');
  const k=JSON.stringify([r.waba,r.to]);if(uniq.has(k))throw Error('Ruta ambigua');uniq.add(k);
 }
 const sessions=new Map(),seen=new Set(),pending=new Map();
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
  if(m.type!=='text'||typeof m.text?.body!=='string'||m.text.body.length>600)return drop('unsupported_message');
  const route=registry.find(r=>r.waba===m.wabaId&&r.to===m.to&&r.senders.includes(m.from));
  if(!route)return drop('unmatched_route');
  const scope=JSON.stringify([route.empresa,route.sucursal,m.from]);
  const eventKey=JSON.stringify([scope,p.id]),messageKey=JSON.stringify([scope,m.id]),wamidKey=id(m.wamid)?JSON.stringify([scope,m.wamid]):null;
  if(seen.has(eventKey)||seen.has(messageKey)||wamidKey&&seen.has(wamidKey))return drop('duplicate');
  const result=await conversationPreview({identity:{empresa:route.empresa,sucursal:route.sucursal,phone:m.from},sucursal:route.config,catalogo:route.catalogo,privado:route.privado,session:sessions.get(scope),event:{id:m.id,text:m.text.body},ahora:now});
  sessions.set(scope,result.session);seen.add(eventKey);seen.add(messageKey);if(wamidKey)seen.add(wamidKey);
  if(result.action?.type==='simulated_order'){
   const requestId=messageKey;
   pending.set(requestId,{id:requestId,empresa:route.empresa,sucursal:route.sucursal,status:'pendiente',pedido:result.action.pedido});
  }
  return {accepted:true,messages:result.messages,options:result.options,stage:result.session.stage,sendAllowed:false};
 }
 // Manager review demonstration only: no live order approval or permission system.
 // Actual manager authentication/authorization stays with GESTLOK.
 function listPending({empresa,sucursal}){
  return structuredClone([...pending.values()].filter(x=>x.empresa===empresa&&x.sucursal===sucursal));
 }
 return {receive,listPending};
}

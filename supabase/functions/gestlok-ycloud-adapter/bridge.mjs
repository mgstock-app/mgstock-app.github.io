// Internal offline bridge between a *verified* signed YCloud inbound event and
// the private test-only RPC. No network client and no WhatsApp response sender.
// Never mount this module as an unauthenticated public endpoint.
import {conversationPreview} from './conversation.mjs';
const enc=new TextEncoder(),e164=/^\+[1-9]\d{7,14}$/;
const good=v=>typeof v==='string'&&v.length>0&&v.length<=200;
const bytes=x=>x instanceof Uint8Array?x:typeof x==='string'?enc.encode(x):null;
const toHex=x=>[...x].map(b=>b.toString(16).padStart(2,'0')).join('');
async function digest(body){return toHex(new Uint8Array(await crypto.subtle.digest('SHA-256',body)));}
export async function verifyYCloudSignature({raw,signature,secret,now=Date.now()}){
 const body=bytes(raw);
 if(!body||body.length>262144||!good(secret)||secret.length<24||typeof signature!=='string')return false;
 const match=/^t=(\d{10}),\s*s=([a-fA-F0-9]{64})$/.exec(signature);
 if(!match||Math.abs(now/1000-Number(match[1]))>300)return false;
 const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
 const signing=new Uint8Array(enc.encode(match[1]+'.').length+body.length);
 signing.set(enc.encode(match[1]+'.'));signing.set(body,enc.encode(match[1]+'.').length);
 return crypto.subtle.verify('HMAC',key,Uint8Array.from(match[2].match(/../g),x=>parseInt(x,16)),signing);
}
export function createSupabasePilotStore(rpc){
 if(typeof rpc!=='function')throw Error('RPC no configurada');
 const call=async(name,args)=>{
  const {data,error}=await rpc(name,args);
  if(error)throw new Error('Error del almacenamiento de pruebas');
  return data;
 };
 return {
  load:({slug,sucursal,scope})=>call('gestlok_ycloud_pilot_load',{p_slug:slug,p_sucursal:sucursal,p_scope:scope}),
  commit:({slug,sucursal,scope,revision,eventId,messageId,wamid,state,customer,reply,order})=>
   call('gestlok_ycloud_pilot_commit',{p_slug:slug,p_sucursal:sucursal,p_scope:scope,p_revision:revision,p_event:eventId,p_message:messageId,
     p_wamid:wamid??null,p_state:state,p_cliente:customer,p_reply:reply,p_order:order??null})
 };
}
export function createSignedYCloudBridge({secret,routes,store,enabled=false}){
 if(!Array.isArray(routes)||!store||typeof store.load!=='function'||typeof store.commit!=='function')throw Error('Configuración incompleta');
 const used=new Set();
 for(const r of routes){
  if(!good(r.waba)||!e164.test(r.to)||!good(r.empresa)||!good(r.sucursal)||!good(r.slug)||!good(r.sucursalId)
   ||!Array.isArray(r.allowSenders)||!r.allowSenders.length||r.allowSenders.some(p=>!e164.test(p)||p===r.to))throw Error('Ruta inválida');
  const key=JSON.stringify([r.waba,r.to]);if(used.has(key))throw Error('Ruta duplicada');used.add(key);
 }
 const drop=reason=>({status:reason,sendAllowed:false});
 return async function accept({raw,signature,now=Date.now()}){
  // Fail closed; pilot cannot accidentally activate with only credentials.
  if(enabled!==true)return drop('disabled');
  if(!await verifyYCloudSignature({raw,signature,secret,now}))return drop('invalid_signature');
  let p;try{p=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes(raw)));}catch{return drop('invalid_json');}
  if(p?.type!=='whatsapp.inbound_message.received'||p.apiVersion!=='v2')return drop('ignored_type');
  const m=p.whatsappInboundMessage;
  if(!good(p.id)||!good(m?.id)||!e164.test(m.from)||!e164.test(m.to)||!good(m.wabaId)||m.groupId)return drop('invalid_message');
  if(m.type!=='text'||typeof m.text?.body!=='string'||m.text.body.length>600)return drop('unsupported_message');
  const route=routes.find(r=>r.waba===m.wabaId&&r.to===m.to&&r.allowSenders.includes(m.from));
  if(!route)return drop('not_allowlisted');
  const scope=await digest(enc.encode(JSON.stringify([route.empresa,route.sucursal,m.from])));
  for(let attempt=0;attempt<3;attempt++){
   const current=await store.load({slug:route.slug,sucursal:route.sucursalId,scope});
   const result=await conversationPreview({identity:{empresa:route.empresa,sucursal:route.sucursal,phone:m.from},sucursal:current.sucursal,
     catalogo:current.catalogo,privado:current.privado||{},session:current.state,
     event:{id:m.id,text:m.text.body},ahora:new Date(now)});
   if(result.duplicate)return drop('duplicate');
   const order=result.action?.type==='simulated_order'?result.action.pedido:null;
   const commit=await store.commit({slug:route.slug,sucursal:route.sucursalId,scope,revision:current.revision,
     eventId:p.id,messageId:m.id,wamid:m.wamid,state:result.session,customer:m.text.body,reply:result.messages,order});
   if(commit.status==='duplicate')return drop('duplicate');
   if(commit.status==='conflict')continue;
   if(commit.status!=='committed')throw Error('Persistencia inesperada');
   return {status:'accepted',orderCode:commit.order_code||null,sendAllowed:false};
  }
  return drop('conflict_retry_later');
 };
}

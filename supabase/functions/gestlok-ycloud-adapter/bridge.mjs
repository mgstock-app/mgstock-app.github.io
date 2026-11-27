// Internal offline bridge between a *verified* signed YCloud inbound event and
// the private test-only RPC. No network client and no WhatsApp response sender.
// Never mount this module as an unauthenticated public endpoint.
import {assertDistinctCommerceCatalogs} from './commerce.mjs';
import {processVerifiedPilotText} from './verified-pilot.mjs';
import {readYCloudInput} from './native-menu.mjs';
import {prepareExclusions} from './exclusions.mjs';
const enc=new TextEncoder(),e164=/^\+[1-9]\d{7,14}$/;
const good=v=>typeof v==='string'&&v.length>0&&v.length<=200;
const bytes=x=>x instanceof Uint8Array?x:typeof x==='string'?enc.encode(x):null;
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
  isExcluded:({sucursal,phone})=>call('gestlok_chat_srv_whatsapp_excluido',{p_sucursal:sucursal,p_numero:phone}),
  load:({slug,sucursal,scope})=>call('gestlok_ycloud_pilot_load',{p_slug:slug,p_sucursal:sucursal,p_scope:scope}),
  commit:({slug,sucursal,scope,revision,eventId,messageId,wamid,state,customer,reply,order})=>
   call('gestlok_ycloud_pilot_commit',{p_slug:slug,p_sucursal:sucursal,p_scope:scope,p_revision:revision,p_event:eventId,p_message:messageId,
     p_wamid:wamid??null,p_state:state,p_cliente:customer,p_reply:reply,p_order:order??null})
 };
}
export function createSignedYCloudBridge({secret,routes,store,enabled=false,geminiClassifier}){
 if(!Array.isArray(routes)||!store||typeof store.isExcluded!=='function'||typeof store.load!=='function'||typeof store.commit!=='function')throw Error('Configuración incompleta');
 assertDistinctCommerceCatalogs(routes);
 const used=new Set(),registry=[];
 for(const r of routes){
  if(!good(r.waba)||!e164.test(r.to)||!good(r.empresa)||!good(r.sucursal)||!good(r.slug)||!good(r.sucursalId)
   ||!Array.isArray(r.allowSenders)||!r.allowSenders.length||r.allowSenders.some(p=>!e164.test(p)||p===r.to))throw Error('Ruta inválida');
  const key=JSON.stringify([r.waba,r.to]);if(used.has(key))throw Error('Ruta duplicada');used.add(key);
  registry.push({...structuredClone(r),exclusions:prepareExclusions(r.excludedSenders)});
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
  const input=readYCloudInput(m);if(!input)return drop('unsupported_message');
  const route=registry.find(r=>r.waba===m.wabaId&&r.to===m.to);
  // Match only the signed sender on the verified business number. Exclusion
  // wins over allowlist, before loading data, invoking AI, committing orders,
  // or preparing an outbound response. The native WhatsApp chat is untouched.
  if(!route)return drop('not_allowlisted');
  return processVerifiedPilotText({route,store,from:m.from,eventId:p.id,messageId:m.id,wamid:m.wamid,customer:input.text,interactiveId:input.interactiveId,cart:input.cart,geminiClassifier,now});
 };
}



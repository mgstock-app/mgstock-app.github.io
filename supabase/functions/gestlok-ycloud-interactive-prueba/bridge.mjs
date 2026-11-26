// Test-only transport bridge. Inactive unless explicitly selected by a trusted
// server. NO outbound requests, real credentials, real orders or production use.
// A future approved pilot must mount this behind a signed, bounded HTTP endpoint
// and use the isolated test RPC store. Never trust caller-provided route identities.
import {decodeVerifiedInbound,interactiveTurn} from '../../../public/chat/whatsapp-bot/interactive.mjs';
const enc=new TextEncoder();
const phone=/^\+[1-9]\d{7,14}$/;
const validId=v=>typeof v==='string'&&v.length>0&&v.length<=200;
async function signed(raw,signature,secret,now){
 if(!(raw instanceof Uint8Array)||raw.byteLength>65536||!validId(secret)||secret.length<24)return false;
 const m=/^t=(\d{10}),\s*s=([a-fA-F0-9]{64})$/.exec(signature||'');
 if(!m||Math.abs(now/1000-Number(m[1]))>300)return false;
 const prefix=enc.encode(m[1]+'.'),body=new Uint8Array(prefix.length+raw.length);body.set(prefix);body.set(raw,prefix.length);
 const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
 return crypto.subtle.verify('HMAC',key,Uint8Array.from(m[2].match(/../g),x=>parseInt(x,16)),body);
}
async function scopeOf(r,from){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(JSON.stringify(['wa-interactive-v1',r.waba,r.to,r.empresa,r.sucursal,from])))),b=>b.toString(16).padStart(2,'0')).join('');}
const drop=status=>({status,sendAllowed:false,payloads:[]});
export function createInteractiveTestBridge({projectRef,enabled=false,dryRun=false,secret,routes,store}){
 const active=projectRef==='irqeitzbfyerxcrogkyh'&&enabled===true&&dryRun===true;
 if(!active)return async()=>drop('disabled');
 if(!Array.isArray(routes)||routes.length!==1||!store||!['isExcluded','load','commit'].every(k=>typeof store[k]==='function'))throw Error('Configuración de pruebas inválida');
 const route=structuredClone(routes[0]);
 if(!['waba','empresa','sucursal','slug','sucursalId'].every(k=>validId(route[k]))||!phone.test(route.to)||!Array.isArray(route.allowSenders)||route.allowSenders.length!==1||!phone.test(route.allowSenders[0])||route.allowSenders[0]===route.to)throw Error('Ruta de prueba inválida');
 return async ({raw,signature,now=Date.now()})=>{
  if(!await signed(raw,signature,secret,now))return drop('invalid_signature');
  let event;try{event=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));}catch{return drop('invalid_json');}
  const m=decodeVerifiedInbound(event);
  const sent=Date.parse(event?.whatsappInboundMessage?.sendTime||'');
  if(!m||!validId(m.eventId)||!validId(m.messageId)||!validId(m.input.id)||!Number.isFinite(sent)||sent>now+300000||sent<now-7200000||m.input.text?.length>600)return drop('unsupported');
  if(m.waba!==route.waba||m.to!==route.to||!route.allowSenders.includes(m.from))return drop('not_allowlisted');
  const excluded=async()=>{
   const value=await store.isExcluded({sucursal:route.sucursalId,phone:m.from});
   if(typeof value!=='boolean')throw Error('No se pudo verificar exclusión');return value;
  };
  const scope=await scopeOf(route,m.from);
  for(let attempt=0;attempt<3;attempt++){
   if(await excluded())return drop('excluded_sender');
   const current=await store.load({slug:route.slug,sucursal:route.sucursalId,scope});
   const r=await interactiveTurn({identity:{empresa:route.empresa,sucursal:route.sucursal,phone:m.from},sucursal:current.sucursal,catalogo:current.catalogo,privado:current.privado,session:current.state??undefined,input:m.input,now:new Date(now)});
   if(r.duplicate)return drop('duplicate');
   if(!r.session)return drop('no_session');
   if(await excluded())return drop('excluded_sender');
   const result=await store.commit({slug:route.slug,sucursal:route.sucursalId,scope,revision:current.revision,eventId:m.eventId,messageId:m.messageId,wamid:m.input.id,state:r.session,customer:m.input.text??'Opción interactiva',reply:r.payloads,order:r.action?.type==='simulated_order'?r.action.pedido:null});
   if(result.status==='duplicate')return drop('duplicate');
   if(result.status==='conflict')continue;
   if(result.status!=='committed')throw Error('Persistencia no confirmada');
   return {status:'accepted',sendAllowed:false,payloads:r.payloads,orderCode:result.order_code??null};
  }
  return drop('conflict_retry_later');
 };
}

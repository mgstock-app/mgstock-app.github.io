// Internal common processor for verified pilot transports only. No provider calls.
// Call only after signature, route, sender and message validation. Both providers
// share the same scope and WhatsApp ID deduplication; never enable both for one number.
import {conversationPreview} from './conversation.mjs';
import {excludedSender} from './exclusions.mjs';
const enc=new TextEncoder();
const digest=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(s))),x=>x.toString(16).padStart(2,'0')).join('');
export async function processVerifiedPilotText({route,store,from,eventId,messageId,wamid,customer,interactiveId,now=Date.now()}){
 const drop=status=>({status,sendAllowed:false});
 if(excludedSender(route.exclusions,from))return drop('excluded_sender');
 if(!route.allowSenders.includes(from))return drop('not_allowlisted');
  const isExcluded=async()=>{
   const value=await store.isExcluded({sucursal:route.sucursalId,phone:from});
   if(typeof value!=='boolean')throw Error('No se pudo verificar la exclusión');
   return value;
  };
  const scope=await digest(JSON.stringify([route.empresa,route.sucursal,from]));
  for(let attempt=0;attempt<3;attempt++){
   if(await isExcluded())return drop('excluded_sender');
   const current=await store.load({slug:route.slug,sucursal:route.sucursalId,scope});
   const result=await conversationPreview({identity:{empresa:route.empresa,sucursal:route.sucursal,phone:from},sucursal:current.sucursal,
     catalogo:current.catalogo,publicSlug:route.slug,privado:current.privado||{},session:current.state,
     event:{id:messageId,text:customer,interactiveId},ahora:new Date(now)});
   if(result.duplicate)return drop('duplicate');
   const order=result.action?.type==='simulated_order'?result.action.pedido:null;
   if(await isExcluded())return drop('excluded_sender');
   const commit=await store.commit({slug:route.slug,sucursal:route.sucursalId,scope,revision:current.revision,
     eventId,messageId,wamid,state:result.session,customer:interactiveId?'Selección interactiva':customer,reply:result.messages,order});
   if(commit.status==='duplicate')return drop('duplicate');
   if(commit.status==='conflict')continue;
   if(commit.status!=='committed')throw Error('Persistencia inesperada');
   return {status:'accepted',orderCode:commit.order_code||null,sendAllowed:false,...(result.native?{native:result.native}:{})};
  }
  return drop('conflict_retry_later');
}


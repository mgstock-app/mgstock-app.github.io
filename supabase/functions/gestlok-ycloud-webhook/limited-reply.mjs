// Explicitly authorized one-shot connectivity test. The existing webhook verifies
// the signed provider event before calling this function. No general bot, templates,
// AI API, customer records, orders, retry or top-up endpoint.
const PROJECT='https://irqeitzbfyerxcrogkyh.supabase.co';
const canon=n=>n.replace(/^\+549(\d{10})$/,'+54$1');
const valid=/^\+[1-9]\d{7,14}$/;
const id=/^[a-zA-Z0-9_.:-]{1,200}$/;
const marker=/^GESTLOK PRUEBA [A-F0-9]{8}$/;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sha=async s=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))].map(x=>x.toString(16).padStart(2,'0')).join('');
export const routeKey=({waba,to,from})=>sha([waba,canon(to),canon(from)].join('|'));
export async function attemptLimitedReply({project,enabled,apiKey,verified,config,event,claim,finish,isExcluded,fetcher=fetch}){
 const m=event?.whatsappInboundMessage;
 if(project!==PROJECT||enabled!==true||verified!==true||!apiKey||
    event?.type!=='whatsapp.inbound_message.received'||!id.test(event?.id||'')||
    !m||m.groupId||m.type!=='text'||!id.test(m.id||'')||!marker.test(m.text?.body||'')||
    !config?.waba||m.wabaId!==config.waba||!valid.test(config.to||'')||!valid.test(config.from||'')||
    m.to!==config.to||m.from!==config.from||m.from===m.to) return 'NOT_ELIGIBLE';
 let already;
 try{
   // Exact authorized phone pair plus unpredictable marker, valid only for
   // the isolated tester. The transaction irreversibly claims the single attempt.
   already=await claim(m.text.body,await routeKey(config),await sha(m.id));
 }catch{return 'CLAIM_UNAVAILABLE';}
 if(!uuid.test(already||''))return 'NOT_ARMED';
 const record=async (state,code=null,provider=null)=>{
   try{await finish(already,state,code,provider);}catch{/* Never retry outbound. */}
   return state.toUpperCase();
 };
 try {
   if(await isExcluded(m.from)!==false)return record('blocked');
   const h={'X-API-Key':apiKey,Accept:'application/json'};
   // Do not send if existing wallet cannot cover a single service reply.
   // The operation never tops up, changes subscription or starts a paid AI call.
   const balance=await fetcher('https://api.ycloud.com/v2/balance',{method:'GET',headers:h,redirect:'error',signal:AbortSignal.timeout(6000)});
   if(!balance.ok){await balance.body?.cancel();return record('blocked',balance.status);}
   const b=await balance.json();
   if(b.currency!=='USD'||typeof b.amount!=='number'||!Number.isFinite(b.amount)||b.amount<0.10)return record('blocked');
   const response=await fetcher('https://api.ycloud.com/v2/whatsapp/messages/sendDirectly',{
     method:'POST',headers:{...h,'Content-Type':'application/json'},redirect:'error',signal:AbortSignal.timeout(10000),
     body:JSON.stringify({from:config.to,to:m.from,type:'text',externalId:'gestlok-prueba-'+already,ttlSeconds:60,
      text:{body:'¡Hola! Soy el asistente de GESTLOK Chat de Mi Gusto Don Torcuato. Tu mensaje de prueba llegó por WhatsApp. ✅ Esta es una única respuesta de ensayo: no se creó ningún pedido.'}})
   });
   if(!response.ok){await response.body?.cancel();return record('error',response.status);}
   const payload=await response.json();
   return record('accepted',response.status,id.test(payload?.id||'')?payload.id:null);
 }catch{return record('unknown');}
}

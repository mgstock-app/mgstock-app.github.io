// Minimal inbound text adapter. No Graph calls, no real order creation.
export function extractPilotMessages(payload,config){
 if(!config||!/^\d{5,25}$/.test(config.waba)||!/^\d{5,25}$/.test(config.phoneId)||payload?.object!=='whatsapp_business_account')return [];
 const out=[],seen=new Set();
 for(const entry of (Array.isArray(payload.entry)?payload.entry:[])){
  if(entry?.id!==config.waba)continue;
  for(const change of (Array.isArray(entry.changes)?entry.changes:[])){
   const v=change?.value;
   if(change?.field!=='messages'||v?.metadata?.phone_number_id!==config.phoneId||v?.messaging_product!=='whatsapp')continue;
   for(const m of (Array.isArray(v.messages)?v.messages:[])){
    if(out.length>=50)return out;
    if(!m||m.type!=='text'||typeof m.id!=='string'||!/^wamid\.[A-Za-z0-9+/_=.-]{1,250}$/.test(m.id)||seen.has(m.id))continue;
    if(typeof m.from!=='string'||!/^\d{8,15}$/.test(m.from)||!config.testSenders?.includes(m.from))continue;
    if(typeof m.text?.body!=='string'||!m.text.body.trim()||m.text.body.length>2000)continue;
    const timestamp=Number(m.timestamp);if(!Number.isSafeInteger(timestamp)||timestamp<=0)continue;
    seen.add(m.id);out.push({messageId:m.id,sender:m.from,text:m.text.body.trim(),timestamp});
   }
  }
 }
 return out;
}
export async function verifySignature(raw,signature,secret,cryptoImpl=globalThis.crypto){
 if(typeof secret!=='string'||secret.length<16||typeof signature!=='string'||!/^sha256=[a-f0-9]{64}$/.test(signature))return false;
 const key=await cryptoImpl.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
 const bytes=Uint8Array.from(signature.slice(7).match(/../g),h=>parseInt(h,16));
 return cryptoImpl.subtle.verify('HMAC',key,bytes,raw);
}

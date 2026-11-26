// Official signed provider events; never log or echo customer bodies.
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const id=/^[A-Za-z0-9_.:-]{1,200}$/;
const phone=/^\+[1-9][0-9]{7,14}$/;
const waba=/^[0-9]{1,30}$/;
export async function parseEvent(request,secret,now=Date.now()){
 const m=(request.headers.get('ycloud-signature')||'').match(/^t=(\d{10}),\s*s=([a-fA-F0-9]{64})$/);
 if(typeof secret!=='string'||secret.length<24||!m||Math.abs(now/1000-Number(m[1]))>300)return {status:403};
 const reader=request.body?.getReader();if(!reader)return {status:400};
 const chunks=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>65536){await reader.cancel();return {status:413};}chunks.push(value);}}catch{return {status:400};}
 const prefix=new TextEncoder().encode(m[1]+'.'),bytes=new Uint8Array(prefix.length+size);bytes.set(prefix);
 let offset=prefix.length;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
 if(!await crypto.subtle.verify('HMAC',key,Uint8Array.from(m[2].match(/../g),x=>parseInt(x,16)),bytes))return {status:403};
 let p;try{p=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(prefix.length)));}catch{return {status:400};}
 if(p?.type==='whatsapp.business_account.updated'){
  const a=p.whatsappBusinessAccount;
  if(a?.updateEvent!=='PARTNER_ADDED')return {status:204};
  if(!id.test(p.id||'')||typeof a.id!=='string'||!waba.test(a.id)||!uuid.test(a.partnerCustomerId||'')||typeof a.paymentMethodAttached!=='boolean')return {status:400};
  return {status:200,kind:'account',args:{p_accion:'cuenta',p_id:a.partnerCustomerId,p_waba:a.id,p_pago:a.paymentMethodAttached,p_evento:p.id}};
 }
 if(p?.type!=='whatsapp.inbound_message.received'||p.apiVersion!=='v2')return {status:204};
 const a=p.whatsappInboundMessage;
 if(!a||a.groupId||a.type!=='text'||typeof a.text?.body!=='string'||a.text.body.length>1000||!a.text.body.trim()||!id.test(p.id||'')||!id.test(a.id||'')||typeof a.wabaId!=='string'||!waba.test(a.wabaId)||!phone.test(a.from||'')||!phone.test(a.to||'')||a.from===a.to)return {status:204};
 const sent=typeof a.sendTime==='string'?Date.parse(a.sendTime):NaN;
 if(!Number.isFinite(sent)||sent>now+300000||sent<now-7200000)return {status:204};
 return {status:200,kind:'inbound',args:{p_waba:a.wabaId,p_to:a.to,p_from:a.from,p_evento:p.id,p_mensaje:a.id,p_texto:a.text.body,p_fecha:new Date(sent).toISOString()}};
}

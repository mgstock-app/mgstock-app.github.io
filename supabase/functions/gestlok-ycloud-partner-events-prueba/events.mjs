export async function parsePartnerEvent(request, secret, now=Date.now()) {
  const match=(request.headers.get('ycloud-signature')||'').match(/^t=(\d{10}),\s*s=([a-fA-F0-9]{64})$/);
  if(typeof secret!=='string'||secret.length<24||!match||Math.abs(now/1000-Number(match[1]))>300) return {status:403};
  const reader=request.body?.getReader();if(!reader)return {status:400};
  let size=0;const chunks=[];
  try {while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>65536){await reader.cancel();return {status:413};}chunks.push(value);}} catch{return {status:400};}
  const prefix=new TextEncoder().encode(match[1]+'.'), bytes=new Uint8Array(prefix.length+size);
  bytes.set(prefix);let offset=prefix.length;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
  const signature=Uint8Array.from(match[2].match(/../g),x=>parseInt(x,16));
  if(!await crypto.subtle.verify('HMAC',key,signature,bytes))return {status:403};
  let data;try {data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(prefix.length)));}catch{return {status:400};}
  const account=data?.whatsappBusinessAccount;
  if(data?.type!=='whatsapp.business_account.updated'||account?.updateEvent!=='PARTNER_ADDED')return {status:204};
  if(typeof data.id!=='string'||!/^[A-Za-z0-9_.:-]{1,200}$/.test(data.id)||typeof account.id!=='string'||!/^[0-9]{1,30}$/.test(account.id)||
    typeof account.partnerCustomerId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(account.partnerCustomerId)||
    typeof account.paymentMethodAttached!=='boolean')return {status:400};
  return {status:200,args:{p_accion:'cuenta',p_id:account.partnerCustomerId,p_waba:account.id,p_pago:account.paymentMethodAttached,p_evento:data.id}};
}

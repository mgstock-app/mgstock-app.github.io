// Pure projection; never calls Graph API, never authorizes dispatch.
// A valid service window alone does not prove the monthly allowance is free.
const e164=/^\+[1-9]\d{7,14}$/;
const phoneId=/^\d{5,25}$/;
export function projectMetaServiceText({from,to,metaPhoneId,messages,lastInboundAt,now=Date.now()}={}){
 const fail=reason=>({reason,payloads:[],dispatchAllowed:false,quotaVerified:false});
 if(typeof from!=='string'||typeof to!=='string'||!e164.test(from)||!e164.test(to)||from===to||
  typeof metaPhoneId!=='string'||!phoneId.test(metaPhoneId))return fail('invalid_route');
 if(!Array.isArray(messages)||messages.some(x=>typeof x!=='string'))return fail('invalid_messages');
 const age=Number(new Date(now))-Number(new Date(lastInboundAt));
 // Avoid assumptions around the closed window or delayed delivery. No template fallback.
 if(lastInboundAt==null||!Number.isFinite(age)||age<0||age>=24*3600000-10*60000)return fail('unverified_service_window');
 const text=messages.filter(m=>m.trim()).join('\n\n');
 if(!text)return fail('empty');
 // Compact text in chunks conservatively within the 4096-character body limit.
 const chunks=[];let rest=Array.from(text);
 while(rest.length){
  const part=rest.splice(0,4000).join('');
  chunks.push({messaging_product:'whatsapp',recipient_type:'individual',to:to.slice(1),type:'text',text:{body:part,preview_url:false}});
  if(chunks.length>10)return fail('too_many_messages');
 }
 return {reason:'preview_only',metaPhoneId,payloads:chunks,units:chunks.length,dispatchAllowed:false,quotaVerified:false};
}

// Pure projection; never calls Graph API, never authorizes dispatch.
// A valid service window alone does not prove the monthly allowance is free.
import {isCommerceProductList} from '../../supabase/functions/gestlok-ycloud-adapter/commerce.mjs';
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


// Pure native-cart message preview: only within the verified service window.
// No provider transport and no authorization to consume quota.
export function projectMetaServiceTurn({turn,...args}={}){
 const fallback=projectMetaServiceText({...args,messages:turn?.messages});
 if(fallback.reason!=='preview_only')return fallback;
 const i=turn?.native;
 // Button/list shapes come only from the deterministic server-generated menu.
 // Its opaque reply IDs must belong to the same turn's persisted mapping.
 const known=id=>typeof id==='string'&&Object.hasOwn(turn.session?.nativeMenu||{},id);
 const buttons=i?.type==='button'&&Array.isArray(i.action?.buttons)&&i.action.buttons.length>=1&&i.action.buttons.length<=3&&
  i.action.buttons.every(b=>b.type==='reply'&&known(b.reply?.id)&&typeof b.reply?.title==='string'&&b.reply.title.length<=20);
 const list=i?.type==='list'&&Array.isArray(i.action?.sections)&&i.action.sections.length===1&&Array.isArray(i.action.sections[0].rows)&&
  i.action.sections[0].rows.length>=1&&i.action.sections[0].rows.length<=10&&i.action.sections[0].rows.every(r=>known(r.id));
 if(!isCommerceProductList(i)&&!(buttons||list))return fallback;
 return {...fallback,units:1,payloads:[{messaging_product:'whatsapp',recipient_type:'individual',to:args.to.slice(1),type:'interactive',interactive:structuredClone(turn.native)}]};
}

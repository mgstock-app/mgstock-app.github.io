// Test-only quota reservation adapter. It cannot authorize dispatch, even when
// its RPC reports available quota. No credentials, transport or provider calls.
const phone=/^\+[1-9]\d{7,14}$/;
const opaque=/^[0-9a-f]{64}$/;
const fail=reason=>({reserved:false,reason,sendAllowed:false,simulated:true});
async function hash(value){
 return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');
}
// Monthly quota belongs to a commercial number, not a company/branch route
// or a customer. The stable key cannot be influenced by inbound customer text.
export async function commercialNumberKey(from){
 if(typeof from!=='string'||!phone.test(from))throw Error('Número comercial inválido');
 return hash(JSON.stringify(['ycloud-service-number',from]));
}
export async function reserveSimulatedQuota({rpc,from,messageKey,units,sucursal}={}){
 if(typeof rpc!=='function'||typeof messageKey!=='string'||!opaque.test(messageKey)||!Number.isInteger(units)||units<1||units>10||(sucursal!==undefined&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sucursal)))return fail('invalid_request');
 try{
  const p_sender_key=await commercialNumberKey(from);
  const args={p_sender_key,p_message_key:messageKey,p_units:units};
  const {data,error}=sucursal===undefined
   ?await rpc('gestlok_ycloud_pilot_reserve_quota',args)
   :await rpc('gestlok_ycloud_pilot_reserve_quota_y_avisar',{...args,p_sucursal:sucursal});
  if(error||!data||data.simulated!==true||data.sendAllowed!==false)return fail('unverified_result');
  const reasons=['invalid_request','duplicate','no_unique_current_evidence','blocked','stale_or_boundary_evidence','limit_reached'];
  const notice=sucursal!==undefined&&['consulta','cerca_del_limite','normal'].includes(data.aviso)&&typeof data.pausado==='boolean'
   ?{aviso:data.aviso,pausado:data.pausado,requiereConfirmacion:data.pausado}:sucursal!==undefined&&['simulated_reservation','limit_reached'].includes(data.reason)?null:{};
  if(notice===null)return fail('unverified_result');
  if(data.reserved!==true)return {...fail(reasons.includes(data.reason)?data.reason:'unverified_result'),...(data.reason==='limit_reached'&&Number.isInteger(data.remaining)&&data.remaining>=0&&data.remaining<=900?{remaining:data.remaining}:{}),...notice};
  if(data.reason!=='simulated_reservation'||!Number.isInteger(data.remaining)||data.remaining<0||data.remaining>900-units)return fail('unverified_result');
  return {reserved:true,reason:'simulated_reservation',remaining:data.remaining,sendAllowed:false,simulated:true,...notice};
 }catch{return fail('unverified_result');}
}

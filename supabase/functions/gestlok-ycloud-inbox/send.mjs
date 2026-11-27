// One manually typed reply to an already received customer-service message.
// No paid AI, templates, bulk sends, top-ups or retry after uncertainty.
const phone=/^\+[1-9][0-9]{7,14}$/;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function sendSingleReply({route,apiKey,enabled,validate,fetcher=fetch}){
 if(enabled!==true||!apiKey||!uuid.test(route?.id||'')||!phone.test(route?.from||'')||!phone.test(route?.to||'')||route.from===route.to||typeof route.text!=='string'||!route.text.trim()||route.text.length>1000)return {status:'bloqueada'};
 const h={'X-API-Key':apiKey,Accept:'application/json'};
 try{
  const b=await fetcher('https://api.ycloud.com/v2/balance',{method:'GET',headers:h,redirect:'error',signal:AbortSignal.timeout(6000)});
  if(!b.ok)return {status:'bloqueada'};
  const balance=await b.json();
  if(balance.currency!=='USD'||typeof balance.amount!=='number'||!Number.isFinite(balance.amount)||balance.amount<0.10||await validate()!==true)return {status:'bloqueada'};
 }catch{return {status:'bloqueada'};}
 try{
  const response=await fetcher('https://api.ycloud.com/v2/whatsapp/messages/sendDirectly',{
   method:'POST',headers:{...h,'Content-Type':'application/json'},redirect:'error',signal:AbortSignal.timeout(10000),
   body:JSON.stringify({from:route.from,to:route.to,type:'text',externalId:'gestlok-manual-'+route.id,ttlSeconds:60,text:{body:route.text}})
  });
  if(!response.ok)return {status:response.status>=500?'incierta':'error'};
  const body=await response.json();
  return typeof body?.id==='string'&&/^[A-Za-z0-9_.:-]{1,200}$/.test(body.id)?{status:'aceptada',provider:body.id}:{status:'incierta'};
 }catch{return {status:'incierta'};}
}

// Unmounted pilot helper. Only trusted server callers may supply verified
// receipt, immutable route, explicit spending approval and atomic claim.
// No automatic retries, even on an ambiguous network failure.
import {projectYCloudText} from './outbound.mjs';
const TEST_PROJECT='irqeitzbfyerxcrogkyh';
const EXTERNAL_ID='gestlok-torcuato-pilot-reply-001';
const e164=/^\+[1-9]\d{7,14}$/;
const deny=reason=>({attempted:false,reason});
export async function dispatchSinglePilotReply({projectId,route,receipt,approval,apiKey,claim,fetchImpl,messages,now=new Date()}){
 if(projectId!==TEST_PROJECT)return deny('not_test_project');
 if(approval?.explicit!==true||approval?.currency!=='USD'||approval?.maxAuthorized!==0.05)return deny('approval_required');
 // This records consent, NOT a provider-enforced price cap.
 if(typeof route?.waba!=='string'||!route.waba||!e164.test(route.from)||!e164.test(route.to)||route.from===route.to)return deny('invalid_route');
 if(receipt?.verified!==true||receipt.waba!==route.waba||receipt.to!==route.from||receipt.from!==route.to||receipt.text!=='GESTLOK PRUEBA 001'||typeof receipt.messageId!=='string'||!receipt.messageId)return deny('unverified_receipt');
 if(typeof claim!=='function'||typeof fetchImpl!=='function'||typeof apiKey!=='string'||!apiKey)return deny('not_configured');
 const preview=projectYCloudText({from:route.from,to:route.to,messages,lastInboundAt:receipt.receivedAt,now});
 if(preview.payloads.length!==1)return deny('not_single_service_message');
 // Claim must be durable, globally unique and committed before contacting YCloud.
 // A failed or uncertain dispatch consumes the claim permanently.
 if(await claim(EXTERNAL_ID)!==true)return deny('already_claimed');
 try{
  const res=await fetchImpl('https://api.ycloud.com/v2/whatsapp/messages/sendDirectly',{
   method:'POST',headers:{'X-API-Key':apiKey,'Content-Type':'application/json','Accept':'application/json'},
   body:JSON.stringify({...preview.payloads[0],externalId:EXTERNAL_ID}),redirect:'error',signal:AbortSignal.timeout(10000)
  });
  if(!res.ok){await res.body?.cancel();return {attempted:true,reason:'provider_http_error',httpStatus:res.status};}
  const d=await res.json();
  const status=['accepted','sent','delivered','read','failed'].includes(d?.status)?d.status:'unknown';
  return {attempted:true,reason:'provider_response',status,providerMessageId:typeof d?.id==='string'?d.id:null,
   reportedPrice:typeof d?.totalPrice==='number'&&Number.isFinite(d.totalPrice)?d.totalPrice:null,
   currency:d?.currency==='USD'?'USD':null,priceFinal:['delivered','read'].includes(status)};
 }catch{return {attempted:true,reason:'uncertain_no_retry'};}
}

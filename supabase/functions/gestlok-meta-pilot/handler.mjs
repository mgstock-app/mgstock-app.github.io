// Real transport exclusively for the official Meta sandbox shown in the test dashboard.
// No commercial identifiers, paid AI, template fallback, retries, or new account registration.
import {processVerifiedPilotText} from '../gestlok-ycloud-adapter/verified-pilot.mjs';
import {prepareExclusions} from '../gestlok-ycloud-adapter/exclusions.mjs';
export const TEST_PROJECT='https://irqeitzbfyerxcrogkyh.supabase.co';
export const TEST_WABA='1669316761264729', TEST_PHONE='1411333342066531', TEST_TO='+15551582584';
const enc=new TextEncoder(), decoder=new TextDecoder('utf-8',{fatal:true});
const hex=b=>Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,'0')).join('');
const hash=async s=>hex(await crypto.subtle.digest('SHA-256',enc.encode(s)));
const list=v=>Array.isArray(v)?v:[];
const resp=(status,body='')=>new Response(body,{status,headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}});
const canonical=p=>p.replace(/^\+549(\d{10})$/,'+54$1');
const diagnosticInt=v=>Number.isSafeInteger(v)&&v>=0&&v<=2147483647?v:null;
const alias=p=>/^\+54\d{10}$/.test(p)?p.replace(/^\+54/,'+549'):p;
export async function signatureValid(raw,sig,secret){
 if(!(raw instanceof Uint8Array)||raw.length>262144||typeof sig!=='string'||!/^sha256=[a-f0-9]{64}$/.test(sig)||typeof secret!=='string'||secret.length<24)return false;
 const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
 return crypto.subtle.verify('HMAC',key,Uint8Array.from(sig.slice(7).match(/../g),s=>parseInt(s,16)),raw);
}
async function readRaw(req){const reader=req.body?.getReader();if(!reader)return null;let size=0;const parts=[];while(true){const x=await reader.read();if(x.done)break;size+=x.value.length;if(size>262144){await reader.cancel();return null;}parts.push(x.value);}const raw=new Uint8Array(size);let at=0;for(const p of parts){raw.set(p,at);at+=p.length;}return raw;}
export function createMetaPilot({project,appSecret,verifyToken,accessToken,testSender,enabled=false,expiresAt,store,reserve,outcome,fetcher=fetch,now=Date.now}={}){
 const sender=typeof testSender==='string'&&/^\+[1-9]\d{7,14}$/.test(testSender)?canonical(testSender):null;
 const validProject=project===TEST_PROJECT;
 const verifyReady=validProject&&typeof verifyToken==='string'&&verifyToken.length>=24;
 const expiry=Date.parse(expiresAt||'');
 const runReady=validProject&&enabled===true&&verifyReady&&typeof appSecret==='string'&&appSecret.length>=24&&typeof accessToken==='string'&&accessToken.length>=40&&sender&&sender!==TEST_TO&&Number.isFinite(expiry)&&store&&typeof reserve==='function'&&typeof outcome==='function';
 const fresh=t=>Number.isFinite(t)&&t<expiry&&expiry-t<=24*3600000;
 const route={waba:TEST_WABA,phoneId:TEST_PHONE,to:TEST_TO,empresa:'gestlok-meta-prueba',sucursal:'Munro ensayo',slug:'mi-gusto-munro',sucursalId:'7e570000-0000-4000-8000-000000000001',allowSenders:[sender],exclusions:prepareExclusions([])};
 return async req=>{
  if(!validProject)return resp(503,'Disabled');
  const url=new URL(req.url),p=url.searchParams;
  if(req.method==='GET'){
   const c=p.get('hub.challenge');
   if(!verifyReady||p.getAll('hub.verify_token').length!==1||p.getAll('hub.challenge').length!==1||p.getAll('hub.mode').length!==1||p.get('hub.mode')!=='subscribe'||!c||!/^[0-9A-Za-z_-]{1,200}$/.test(c))return resp(403,'Forbidden');
   const a=await hash(p.get('hub.verify_token')),b=await hash(verifyToken);let diff=0;for(let i=0;i<64;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);
   return diff?resp(403,'Forbidden'):resp(200,c);
  }
  if(req.method!=='POST')return resp(405);
  if(!runReady||!fresh(now()))return resp(503,'Disabled');
  let raw;try{raw=await readRaw(req);}catch{return resp(400);}if(!raw)return resp(413);
  if(!await signatureValid(raw,req.headers.get('x-hub-signature-256'),appSecret))return resp(403,'Forbidden');
  let payload;try{payload=JSON.parse(decoder.decode(raw));}catch{return resp(400);}
  if(payload?.object!=='whatsapp_business_account')return resp(200,'OK');
  const events=new Map();
  for(const e of list(payload.entry))for(const c of list(e?.changes)){
   const v=c?.value;
   if(e.id!==TEST_WABA||c?.field!=='messages'||v?.messaging_product!=='whatsapp'||v?.metadata?.phone_number_id!==TEST_PHONE)continue;
   for(const m of list(v.messages)){
    if(m?.type!=='text'||m.group_id||m.groupId||m.context?.group_id||typeof m.from!=='string'||!/^\d{8,15}$/.test(m.from)||canonical('+'+m.from)!==sender||typeof m.id!=='string'||!/^wamid\.[A-Za-z0-9+/_=.-]{1,194}$/.test(m.id)||typeof m.text?.body!=='string'||!m.text.body.trim()||m.text.body.length>600||typeof m.timestamp!=='string'||!/^\d{10}$/.test(m.timestamp))continue;
    const age=now()-Number(m.timestamp)*1000;if(age< -30000||age>300000)continue;events.set(m.id,m);
   }
  }
  if(events.size>5)return resp(200,'OK');
  for(const m of events.values()){
   let reserved=false,eventHash;
   try{
    const isExcluded=async()=>{const q=await store.isExcluded({sucursal:route.sucursalId,phone:sender});if(typeof q!=='boolean')throw Error('exclusion');if(q)return true;const other=alias(sender);if(other===sender)return false;const a=await store.isExcluded({sucursal:route.sucursalId,phone:other});if(typeof a!=='boolean')throw Error('exclusion');return a;};
    if(await isExcluded())continue;
    eventHash=await hash(TEST_WABA+'|'+TEST_PHONE+'|'+m.id);
    const claimed=await reserve(eventHash);if(claimed!=='reserved')continue;reserved=true;
    let reply=[];
    const wrapped={...store,isExcluded,commit:async args=>{const res=await store.commit(args);if(res.status==='committed')reply=args.reply;return res;}};
    const result=await processVerifiedPilotText({route,store:wrapped,from:sender,eventId:m.id,messageId:m.id,wamid:m.id,customer:m.text.body,now:now()});
    if(result.status!=='accepted'||!Array.isArray(reply)||!reply.every(x=>typeof x==='string')||!reply.length){await outcome(eventHash,'no_reply');continue;}
    const body='[GESTLOK PRUEBA · sin pedido real]\n'+reply.filter(x=>x.trim()).join('\n\n');
    // No multi-message splitting. Every reserved attempt costs at most one sandbox response.
    if(!body.trim()||Array.from(body).length>4000||await isExcluded()||!fresh(now())){await outcome(eventHash,'excluded');continue;}
    let res;try{res=await fetcher('https://graph.facebook.com/v25.0/'+TEST_PHONE+'/messages',{method:'POST',headers:{'Authorization':'Bearer '+accessToken,'Content-Type':'application/json'},body:JSON.stringify({messaging_product:'whatsapp',recipient_type:'individual',to:m.from,type:'text',text:{body,preview_url:false}}),signal:AbortSignal.timeout(8000),redirect:'error'});}catch{await outcome(eventHash,'uncertain');continue;}
    // Keep only numeric diagnostics. In particular, never log Graph error bodies
    // (which can include tokens, recipient numbers and message content).
    const diagnostic={httpStatus:diagnosticInt(res.status),graphCode:null,graphSubcode:null};
    if(!res.ok)try{const parsed=await res.json();diagnostic.graphCode=diagnosticInt(parsed?.error?.code);diagnostic.graphSubcode=diagnosticInt(parsed?.error?.error_subcode);}catch{/* No valid Graph response. */}
    // Acceptance is not delivery. Do not retry any failed or ambiguous request.
    await outcome(eventHash,res.ok?'accepted':'failed',diagnostic);
   }catch{if(reserved)try{await outcome(eventHash,'uncertain');}catch{}else return resp(503,'Retry');}
  }
  return resp(200,'OK');
 };
}

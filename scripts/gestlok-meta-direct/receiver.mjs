// Node.js direct Meta Cloud API pilot. NOT a commercial webhook.
// No network transport, no access token, no account/device registration,
// no calls to Graph, no outbound messages. The only I/O is an injected
// test-store and (when invoked explicitly) an HTTP listener.
import {createServer} from 'node:http';
import {createHmac,timingSafeEqual} from 'node:crypto';
import {prepareExclusions} from '../../supabase/functions/gestlok-ycloud-adapter/exclusions.mjs';
import {readYCloudInput} from '../../supabase/functions/gestlok-ycloud-adapter/native-menu.mjs';
import {processVerifiedPilotText} from '../../supabase/functions/gestlok-ycloud-adapter/verified-pilot.mjs';
const TEST_PROJECT='irqeitzbfyerxcrogkyh';
const e164=/^\+[1-9]\d{7,14}$/;
const metaId=/^\d{5,25}$/;
const wamid=/^wamid\.[A-Za-z0-9+/_=.-]{1,194}$/;
const good=x=>typeof x==='string'&&x.length>0&&x.length<=200;
const list=x=>Array.isArray(x)?x:[];
const equal=(a,b)=>{if(typeof a!=='string'||typeof b!=='string')return false;const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);};
const response=(status,body='')=>({status,body,sendAllowed:false});
export function verifyMetaSignature(raw,signature,appSecret){
 if(!Buffer.isBuffer(raw)||raw.length>262144||typeof appSecret!=='string'||appSecret.length<24||typeof signature!=='string'||!/^sha256=[a-f0-9]{64}$/.test(signature)) return false;
 return equal(signature,'sha256='+createHmac('sha256',appSecret).update(raw).digest('hex'));
}
export function createMetaDirectHandler({projectRef,appSecret,verifyToken,routes,store,enabled=false,dryRunOnly=false,now=Date.now}={}){
 const active=enabled===true&&dryRunOnly===true&&projectRef===TEST_PROJECT;
 if(!active)return async()=>response(503,'Disabled');
 if(typeof appSecret!=='string'||appSecret.length<24||typeof verifyToken!=='string'||verifyToken.length<24||
  !store||typeof store.isExcluded!=='function'||typeof store.load!=='function'||typeof store.commit!=='function'||
  !Array.isArray(routes)||!routes.length)throw Error('Configuración incompleta de prueba');
 const registry=new Map(),businessNumbers=new Set();
 for(const r of routes){
  if(typeof r.waba!=='string'||typeof r.phoneId!=='string'||!metaId.test(r.waba)||!metaId.test(r.phoneId)||!e164.test(r.to)||!good(r.empresa)||!good(r.sucursal)||!good(r.slug)||!good(r.sucursalId)||
   !Array.isArray(r.allowSenders)||!r.allowSenders.length||r.allowSenders.some(p=>!e164.test(p)||p===r.to))throw Error('Ruta de prueba inválida');
  const k=JSON.stringify([r.waba,r.phoneId]);
  if(registry.has(k)||businessNumbers.has(r.to))throw Error('Ruta duplicada');
  businessNumbers.add(r.to);
  registry.set(k,{...structuredClone(r),exclusions:prepareExclusions(r.excludedSenders)});
 }
 return async({method,url,raw,signature})=>{
  let u;try{u=new URL(url,'http://127.0.0.1');}catch{return response(400,'Bad request');}
  if(u.pathname!=='/webhooks/meta')return response(404,'Not found');
  if(method==='GET'){
   const p=u.searchParams,c=p.get('hub.challenge');
   if(p.getAll('hub.mode').length!==1||p.getAll('hub.verify_token').length!==1||p.getAll('hub.challenge').length!==1||
    p.get('hub.mode')!=='subscribe'||!equal(p.get('hub.verify_token'),verifyToken)||typeof c!=='string'||!/^[0-9A-Za-z_-]{1,200}$/.test(c)) return response(403,'Forbidden');
   return response(200,c);
  }
  if(method!=='POST')return response(405,'Method not allowed');
  if(!Buffer.isBuffer(raw)||raw.length>262144)return response(413,'Too large');
  if(!verifyMetaSignature(raw,signature,appSecret))return response(403,'Forbidden');
  let p;try{p=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));}catch{return response(400,'Bad request');}
  if(p?.object!=='whatsapp_business_account')return response(200,'OK');
  const t=now(),seen=new Set(),eligible=[];
  if(!Number.isFinite(t))return response(503,'Retry');
  for(const e of list(p.entry)){
   for(const change of list(e?.changes)){
    const v=change?.value;
    // Status notifications, synced history, native-app echoes, media and
    // groups are intentionally not processed as a customer request.
    if(change?.field!=='messages'||v?.messaging_product!=='whatsapp')continue;
    const route=registry.get(JSON.stringify([e.id,v?.metadata?.phone_number_id]));
    if(!route)continue;
    for(const m of list(v.messages)){
     const input=readYCloudInput(m);
     if(!input||m.group_id||m.groupId||m.context?.group_id||typeof m.from!=='string'||!/^\d{8,15}$/.test(m.from)||
       typeof m.id!=='string'||!wamid.test(m.id)||(!input.interactiveId&&!input.text.trim())||
       typeof m.timestamp!=='string'||!/^\d{10}$/.test(m.timestamp))continue;
     // Only recent, individually signed test messages. A delayed retry must
     // not turn historical messages into a new order or billable response.
     const age=t-Number(m.timestamp)*1000;if(age< -30000||age>300000)continue;
     const k=JSON.stringify([route.waba,route.phoneId,m.id]);if(seen.has(k))continue;seen.add(k);
     eligible.push({route,m,input,from:'+'+m.from});
    }
   }
  }
  // No partial work on an oversized test batch; Meta can retry.
  if(eligible.length>50)return response(503,'Retry');
  try{for(const {route,m,input,from} of eligible){
   const r=await processVerifiedPilotText({route,store,from,eventId:m.id,messageId:m.id,wamid:m.id,customer:input.text,interactiveId:input.interactiveId,now:t});
   if(r.status==='conflict_retry_later')return response(503,'Retry');
  }}catch{return response(503,'Retry');}
  return response(200,'OK');
 };
}
// Adapter for a Node HTTP server. Factory does not open a port; tests bind to
// loopback. Any future external HTTPS deployment needs a separate review.
export function createMetaDirectServer(options){
 const handle=createMetaDirectHandler(options);
 return createServer(async(req,res)=>{
  const finish=(status,body)=>{res.writeHead(status,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'});res.end(body);};
  try{
   const chunks=[];let size=0;
   if(req.method==='POST'){
    for await(const c of req){size+=c.length;if(size>262144){finish(413,'Too large');return;}chunks.push(c);}
   }
   const r=await handle({method:req.method,url:req.url,raw:Buffer.concat(chunks),signature:req.headers['x-hub-signature-256']});
   finish(r.status,r.body);
  }catch{if(!res.headersSent)finish(503,'Retry');else res.end();}
 });
}


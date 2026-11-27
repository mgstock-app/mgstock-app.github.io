// Experimental QR pairing model for isolated tests. It has no WhatsApp Web
// client, network connection, persistent authentication, or outbound sender.
// A live third-party client would require written platform authorization and
// a separately authorized test account/device. Never use a commercial number.
import {prepareExclusions} from '../../supabase/functions/gestlok-ycloud-adapter/exclusions.mjs';
import {processVerifiedPilotText} from '../../supabase/functions/gestlok-ycloud-adapter/verified-pilot.mjs';
const e164=/^\+[1-9]\d{7,14}$/;
const id=/^[A-Za-z0-9_.:@+-]{1,200}$/;
const testProject='irqeitzbfyerxcrogkyh';
const empty=()=>({state:'disabled',qrAvailable:false,simulated:true,sendAllowed:false});

export function createQrPairingSimulation({projectRef,enabled=false,dryRunOnly=false,route,store,now=Date.now}={}){
 if(enabled!==true||dryRunOnly!==true||projectRef!==testProject)return {
  status:empty,open:()=>false,offerQr:()=>false,readQr:()=>null,pair:()=>false,
  disconnect:()=>false,receive:async()=>({status:'disabled',sendAllowed:false})
 };
 if(!route||!e164.test(route.to)||!Array.isArray(route.allowSenders)||!route.allowSenders.length||
  route.allowSenders.some(x=>!e164.test(x)||x===route.to)||!['empresa','sucursal','sucursalId','slug'].every(k=>typeof route[k]==='string'&&route[k].length>0)||
  !store||typeof store.isExcluded!=='function'||typeof store.load!=='function'||typeof store.commit!=='function')throw Error('Configuración de ensayo inválida');
 const r={...structuredClone(route),exclusions:prepareExclusions(route.excludedSenders)};
 let phase='idle',challenge=null,expires=0,generation=0,queue=Promise.resolve();
 const clear=()=>{challenge=null;expires=0;};
 const status=()=>({state:phase,qrAvailable:phase==='awaiting_qr'&&challenge!==null&&now()<expires,simulated:true,sendAllowed:false});
 function open(){if(phase!=='idle'&&phase!=='disconnected')return false;generation++;clear();phase='awaiting_qr';return true;}
 // Only synthetic challenges from a test fixture; never accept a live auth QR.
 function offerQr(fixture){
  if(phase!=='awaiting_qr'||typeof fixture!=='string'||!/^FICTICIO-QR-[a-zA-Z0-9_-]{8,80}$/.test(fixture))return false;
  challenge=fixture;expires=now()+60_000;return true;
 }
 function readQr(){if(phase!=='awaiting_qr'||challenge===null||now()>=expires){clear();return null;}return challenge;}
 function pair({numero,challenge:provided}={}){
  if(phase!=='awaiting_qr')return false;
  const actual=readQr();clear();
  if(actual===null||provided!==actual||numero!==r.to){phase='disconnected';generation++;return false;}
  phase='paired_simulated';return true;
 }
 function disconnect(){clear();generation++;phase='disconnected';return true;}
 async function receive(message){
  const attempt=generation;
  const perform=async()=>{
   const drop=status=>({status,sendAllowed:false});
   if(phase!=='paired_simulated'||attempt!==generation)return drop('not_paired');
   // Incoming individual test text only; never history, groups or self messages.
   if(message?.synthetic!==true||message.fromMe===true||message.group===true||message.history===true||
    message.type!=='chat'||message.to!==r.to||typeof message.from!=='string'||!e164.test(message.from)||
    typeof message.id!=='string'||!id.test(message.id)||typeof message.body!=='string'||!message.body.trim()||message.body.length>600||
    !Number.isFinite(message.timestamp)||now()-message.timestamp<0||now()-message.timestamp>300000)return drop('invalid_message');
   // Guard each asynchronous store call against a disconnect/relink in flight.
   const alive=()=>{if(phase!=='paired_simulated'||generation!==attempt)throw Error('Sesión de prueba cerrada');};
   const guarded={isExcluded:async a=>{alive();const value=await store.isExcluded(a);alive();return value;},
    load:async a=>{alive();const value=await store.load(a);alive();return value;},
    commit:async a=>{alive();return store.commit(a);}};
   try{return await processVerifiedPilotText({route:r,store:guarded,from:message.from,eventId:message.id,messageId:message.id,customer:message.body,now:now()});}
   catch{return drop('blocked');}
  };
  const result=queue.then(perform,perform);queue=result.catch(()=>{});return result;
 }
 return {status,open,offerQr,readQr,pair,disconnect,receive};
}

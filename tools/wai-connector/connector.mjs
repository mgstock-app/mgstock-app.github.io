import makeWASocket,{useMultiFileAuthState,DisconnectReason,Browsers,generateMessageIDV2,decryptPollVote,downloadMediaMessage} from '@whiskeysockets/baileys';
import pino from 'pino';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createSession,phoneKey} from './session.mjs';
import {pilotTransport} from './pilot.mjs';
import {createPollStore} from './poll-store.mjs';
import {loadConfig,defaultConfig,protectDirectory,privateRoot} from './config.mjs';

process.umask(0o077);
const root=await protectDirectory(privateRoot());
const configFile=resolve(process.argv[2]||defaultConfig());
const config=await loadConfig(configFile);
const url=new URL(config.url);
async function rpc(s,name,args){
 const r=await fetch(new URL('/rest/v1/rpc/'+name,url),{method:'POST',headers:{apikey:config.anonKey,Authorization:'Bearer '+config.anonKey,'Content-Type':'application/json'},body:JSON.stringify({p_id:s.id,p_clave:s.key,...args}),signal:AbortSignal.timeout(7000),redirect:'error'});
 if(!r.ok)throw Error('Control remoto no disponible');
 return r.json();
}
// Bounded media stream, not a public image URL. Do not request view-once
// media or re-upload old messages. The server rechecks file signature.
async function receiveAuthorizedImage(message,metadata){
 const mime=metadata?.mimetype;
 const max=2*1024*1024;
 if(!['image/jpeg','image/png','image/webp'].includes(mime)||Number(metadata.fileLength)>max)return null;
 const stream=await downloadMediaMessage(message,'stream',{options:{signal:AbortSignal.timeout(12000)}},undefined);
 const chunks=[];let size=0;const timer=setTimeout(()=>stream.destroy(Error('Tiempo de descarga vencido')),12000);
 try{
  for await(const chunk of stream){size+=chunk.length;if(size>max){stream.destroy();return null;}chunks.push(Buffer.from(chunk));}
  if(size<12)return null;
  const bytes=Buffer.concat(chunks,size);
  const actual=bytes.subarray(0,3).equals(Buffer.from('ffd8ff','hex'))?'image/jpeg':bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))?'image/png':bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP'?'image/webp':null;
  return actual===mime?{mime,base64:bytes.toString('base64')}:null;
 }finally{clearTimeout(timer);}
}
function transportFor(s){
 return async({reset,revision,onEvent})=>{
  const path=join(root,s.id);
  await mkdir(path,{recursive:true,mode:0o700});
  const pointer=join(path,'active-directory');
  let sub;
  try{sub=(await readFile(pointer,'utf8')).trim();}catch(e){if(e.code!=='ENOENT')throw e;}
  if(reset||!sub){
   sub=randomUUID();
   await writeFile(pointer,sub,{mode:0o600});
  }
  if(!/^[a-f0-9-]{36}$/.test(sub))throw Error('Directorio de sesión inválido');
  const privateDir=join(path,sub);
  await protectDirectory(privateDir);
  const {state,saveCreds}=await useMultiFileAuthState(privateDir);
  const initialGrant=config.enableTestMessages===true&&revision?await rpc(s,'gestlok_chat_wai_ensayo_autorizado',{p_revision:revision}).catch(()=>null):null;
  const sock=makeWASocket({auth:state,logger:pino({level:'silent'}),browser:Browsers.appropriate('Chrome'),
    markOnlineOnConnect:false,syncFullHistory:false,shouldSyncHistoryMessage:()=>false,
    shouldIgnoreJid:jid=>typeof jid==='string'&&(jid.endsWith('@g.us')||jid.endsWith('@broadcast')||jid.endsWith('@newsletter')),
    connectTimeoutMs:15000,defaultQueryTimeoutMs:15000});
  let ended=false,verified=false,save=Promise.resolve();
  const pollStore=createPollStore(privateDir);await pollStore.prune();
  const pilot=config.enableTestMessages===true?pilotTransport({rpc:(name,args)=>rpc(s,name,args),socket:sock,active:()=>!ended&&verified,initialGrant,pollStore,receiveImage:receiveAuthorizedImage,immediate:true,decryptVote:decryptPollVote,ownJids:()=>[sock.user?.id,sock.user?.lid,state.creds.me?.id,state.creds.me?.lid],newMessageId:()=>generateMessageIDV2(sock.user?.id),logger:m=>console.log('[WAI '+s.id.slice(0,8)+'] '+m)}):null;
  if(pilot){sock.ev.on('messages.upsert',pilot.receive);sock.ev.on('messages.update',pilot.receipt);sock.ev.on('contacts.upsert',pilot.contacts);sock.ev.on('contacts.update',pilot.contacts);}
  const close=async()=>{if(ended)return;ended=true;verified=false;pilot?.reset();try{sock.end(undefined);}finally{await save.catch(()=>{});}};
  sock.ev.on('creds.update',()=>{if(!ended)save=save.then(saveCreds).catch(()=>{onEvent({type:'close',retryable:false});void close();});});
  sock.ev.on('connection.update',update=>{
    if(ended)return;
    if(update.qr)onEvent({type:'qr',qr:update.qr});
    if(update.connection==='open'){
      const jid=sock.user?.id||state.creds.me?.id||'';
      const match=/^(\d+)(?::\d+)?@s\.whatsapp\.net$/.exec(jid);
      verified=!!match&&phoneKey('+'+match[1])===phoneKey(s.number);
      onEvent({type:'open',number:match?'+'+match[1]:null});
    }
    if(update.connection==='close'){
      verified=false;pilot?.reset();
      const status=update.lastDisconnect?.error?.output?.statusCode;
      const retryable=[DisconnectReason.connectionClosed,DisconnectReason.connectionLost,DisconnectReason.timedOut,DisconnectReason.restartRequired].includes(status);
      onEvent({type:'close',retryable});void close();
    }
  });
  // Test the authenticated WhatsApp Web transport, not only the Node process or a cached open event.
  const verify=async()=>{
   if(ended||!verified||!sock.ws.isOpen)return false;
   try{
    const r=await sock.query({tag:'iq',attrs:{to:'s.whatsapp.net',type:'get',xmlns:'w:p'},content:[{tag:'ping',attrs:{}}]},4000);
    return !ended&&verified&&sock.ws.isOpen&&r?.tag==='iq'&&r.attrs?.type==='result';
   }catch{return false;}
  };
  return {close,verify,pilotTick:revision=>pilot?.tick(revision)};
 };
}
const sessions=config.sessions.map(s=>createSession({id:s.id,number:s.number,transport:transportFor(s),logger:m=>console.log('[WAI '+s.id.slice(0,8)+'] '+m),
 exchange:report=>rpc(s,'gestlok_chat_wai_senal_v2',report)}));
console.log('GESTLOK WAI · ensayo aislado · '+sessions.length+' sesiones. Mensajes de prueba: '+(config.enableTestMessages===true?'permitidos solo por autorización temporal':'desactivados'));
console.log('La conexión no oficial puede ocasionar restricciones. Usá solo números de ensayo autorizados.');
const tick=()=>Promise.allSettled(sessions.map(s=>s.tick()));
await tick();
const timer=setInterval(()=>void tick(),5000);
let stopping=false;
async function stop(){if(stopping)return;stopping=true;clearInterval(timer);await Promise.allSettled(sessions.map(s=>s.close()));process.exit(0);}
process.on('SIGINT',()=>void stop());process.on('SIGTERM',()=>void stop());

import makeWASocket,{useMultiFileAuthState,DisconnectReason,Browsers} from '@whiskeysockets/baileys';
import pino from 'pino';
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createSession,phoneKey} from './session.mjs';

process.umask(0o077);
const configFile=resolve(process.argv[2]||'config.private.json');
const configMeta=await stat(configFile);
if(configMeta.mode&0o077)throw Error('El archivo de configuración debe ser privado (chmod 600).');
const config=JSON.parse(await readFile(configFile,'utf8'));
const url=new URL(config.url);
if(url.protocol!=='https:'||!/^([a-z0-9]+)\.supabase\.co$/.test(url.hostname)||url.pathname!=='/'||url.search||url.hash)throw Error('URL Supabase inválida.');
if(url.origin!=='https://irqeitzbfyerxcrogkyh.supabase.co')throw Error('Piloto restringido al proyecto de Prueba; no se conecta a producción.');
if(typeof config.anonKey!=='string'||config.anonKey.length<30)throw Error('Usá la clave pública del proyecto.');
const claims=JSON.parse(Buffer.from(config.anonKey.split('.')[1]||'','base64url').toString());
if(claims.role!=='anon'||claims.ref!==url.hostname.split('.')[0])throw Error('Solo se admite la clave anon del proyecto; nunca service_role.');
if(!Array.isArray(config.sessions)||config.sessions.length<1||config.sessions.length>10)throw Error('Configurá de 1 a 10 sesiones de ensayo.');
const ids=new Set(),numbers=new Set();
for(const s of config.sessions){
 if(!/^[a-f0-9-]{36}$/i.test(s.id)||!/^[a-f0-9]{64}$/.test(s.key)||!phoneKey(s.number)||ids.has(s.id)||numbers.has(phoneKey(s.number)))throw Error('Sesión inválida o repetida.');
 ids.add(s.id);numbers.add(phoneKey(s.number));
}
if(config.testOnly!==true)throw Error('Este conector es de prueba: no autoriza números comerciales ni envía mensajes.');
const root=resolve(process.env.HOME||'.','.gestlok-wai-pilot');
await mkdir(root,{recursive:true,mode:0o700});
function transportFor(s){
 return async({reset,onEvent})=>{
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
  await mkdir(privateDir,{recursive:true,mode:0o700});
  const {state,saveCreds}=await useMultiFileAuthState(privateDir);
  const sock=makeWASocket({auth:state,logger:pino({level:'silent'}),browser:Browsers.appropriate('Chrome'),
    markOnlineOnConnect:false,syncFullHistory:false,shouldSyncHistoryMessage:()=>false,
    shouldIgnoreJid:jid=>typeof jid==='string'&&(jid.endsWith('@g.us')||jid.endsWith('@broadcast')||jid.endsWith('@newsletter')),
    connectTimeoutMs:15000,defaultQueryTimeoutMs:15000});
  let ended=false,save=Promise.resolve();
  const close=async()=>{if(ended)return;ended=true;try{sock.end(undefined);}finally{await save.catch(()=>{});}};
  sock.ev.on('creds.update',()=>{if(!ended)save=save.then(saveCreds).catch(()=>{onEvent({type:'close',retryable:false});void close();});});
  sock.ev.on('connection.update',update=>{
    if(ended)return;
    if(update.qr)onEvent({type:'qr',qr:update.qr});
    if(update.connection==='open'){
      const jid=sock.user?.id||state.creds.me?.id||'';
      const match=/^(\d+)(?::\d+)?@s\.whatsapp\.net$/.exec(jid);
      onEvent({type:'open',number:match?'+'+match[1]:null});
    }
    if(update.connection==='close'){
      const status=update.lastDisconnect?.error?.output?.statusCode;
      const retryable=[DisconnectReason.connectionClosed,DisconnectReason.connectionLost,DisconnectReason.timedOut,DisconnectReason.restartRequired].includes(status);
      onEvent({type:'close',retryable});void close();
    }
  });
  return {close};
 };
}
const sessions=config.sessions.map(s=>createSession({id:s.id,number:s.number,transport:transportFor(s),logger:m=>console.log('[WAI '+s.id.slice(0,8)+'] '+m),
 exchange:async report=>{
  const r=await fetch(new URL('/rest/v1/rpc/gestlok_chat_wai_senal',url),{method:'POST',headers:{apikey:config.anonKey,Authorization:'Bearer '+config.anonKey,'Content-Type':'application/json'},body:JSON.stringify({...report,p_clave:s.key}),signal:AbortSignal.timeout(7000),redirect:'error'});
  if(!r.ok)throw Error('Control remoto no disponible');
  return r.json();
 }}));
console.log('GESTLOK WAI · conexión de ensayo sin envío de mensajes · '+sessions.length+' sesiones aisladas.');
console.log('La conexión no oficial puede ocasionar restricciones. Usá solo números de ensayo autorizados.');
const tick=()=>Promise.allSettled(sessions.map(s=>s.tick()));
await tick();
const timer=setInterval(()=>void tick(),5000);
let stopping=false;
async function stop(){if(stopping)return;stopping=true;clearInterval(timer);await Promise.allSettled(sessions.map(s=>s.close()));process.exit(0);}
process.on('SIGINT',()=>void stop());process.on('SIGTERM',()=>void stop());

// Sesión de WhatsApp guardada CIFRADA en GESTLOK (no en un solo equipo), para que la PC
// y el teléfono de respaldo usen la misma vinculación. Solo el equipo que tiene el turno
// del servidor central puede leerla o escribirla (lo controla la base). La base nunca ve
// la clave: se cifra con AES-256-GCM usando una clave derivada del archivo central privado.
import {createCipheriv,createDecipheriv,randomBytes,hkdfSync} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';

const TIPO=/^[a-z][a-z-]{0,39}$/;
export const lineKey=(centralKey,lineId)=>{
 if(!/^[a-f0-9]{64}$/.test(centralKey||'')||!/^[a-f0-9-]{36}$/.test(lineId||''))throw Error('Clave de sesión inválida');
 return Buffer.from(hkdfSync('sha256',Buffer.from(centralKey,'hex'),Buffer.from('gestlok-wai-auth-v1'),Buffer.from(lineId),32));
};
const aad=(lineId,tipo,clave)=>Buffer.from(lineId+'|'+tipo+'|'+clave,'utf8');
export function seal(key,text,lineId,tipo,clave){
 const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key,iv);c.setAAD(aad(lineId,tipo,clave));
 const enc=Buffer.concat([c.update(text,'utf8'),c.final()]);
 return Buffer.concat([iv,c.getAuthTag(),enc]).toString('base64');
}
export function open(key,b64,lineId,tipo,clave){
 const buf=Buffer.from(b64,'base64');if(buf.length<29)throw Error('Dato cifrado inválido');
 const d=createDecipheriv('aes-256-gcm',key,buf.subarray(0,12));d.setAAD(aad(lineId,tipo,clave));d.setAuthTag(buf.subarray(12,28));
 return Buffer.concat([d.update(buf.subarray(28)),d.final()]).toString('utf8');
}

// call(accion,{p_tipo,p_claves,p_cambios}) → RPC gestlok_chat_wai_auth (central key + turno vigente).
export function createRemoteStore({call,lineId,centralKey,chunk=150}){
 const key=lineKey(centralKey,lineId);
 const check=r=>{if(!r||r.ok!==true)throw Error('Sin turno del servidor central para la sesión');return r;};
 async function get(tipo,claves){
  if(!TIPO.test(tipo))throw Error('Tipo inválido');
  const out={};
  for(let i=0;i<claves.length;i+=500){
   const part=claves.slice(i,i+500),r=check(await call('leer',{p_tipo:tipo,p_claves:part}));
   for(const k of part){const v=r.valores?.[k];out[k]=typeof v==='string'?open(key,v,lineId,tipo,k):null;}
  }
  return out;
 }
 async function set(changes){
  const rows=changes.map(({tipo,clave,texto})=>{
   if(!TIPO.test(tipo)||typeof clave!=='string'||!clave||clave.length>300)throw Error('Clave inválida');
   return {t:tipo,k:clave,v:texto==null?null:seal(key,texto,lineId,tipo,clave)};
  });
  for(let i=0;i<rows.length;i+=chunk)check(await call('guardar',{p_cambios:rows.slice(i,i+chunk)}));
 }
 async function clear(){check(await call('borrar',{}));}
 // Almacén simple por tipo (encuestas propias) con la misma protección.
 const kv=tipo=>({
  get:async k=>(await get(tipo,[k]))[k],
  set:async(k,texto)=>set([{tipo,clave:k,texto}])
 });
 return {get,set,clear,kv};
}

// Misma interfaz que useMultiFileAuthState de Baileys, guardada en la base cifrada.
// deps = {initAuthCreds,BufferJSON,proto} (se inyectan para poder probar sin la librería).
export async function useRemoteAuthState(store,{deps,legacyDir=null,logger=()=>{}}){
 const {initAuthCreds,BufferJSON,proto}=deps;
 const enc=v=>JSON.stringify(v,BufferJSON.replacer),dec=t=>JSON.parse(t,BufferJSON.reviver);
 let credsText=(await store.get('creds',['creds'])).creds;
 if(!credsText&&legacyDir){
  const moved=await migrateLegacy(store,legacyDir).catch(()=>0);
  if(moved){credsText=(await store.get('creds',['creds'])).creds;logger('Sesión existente pasada a GESTLOK (cifrada): '+moved+' registros.');}
 }
 const creds=credsText?dec(credsText):initAuthCreds();
 // Caché solo en memoria mientras este equipo tiene el turno; al tomarlo de nuevo se relee.
 const cache=new Map(),ck=(t,i)=>t+'\u0000'+i;
 const keys={
  get:async(type,ids)=>{
   const missing=ids.filter(id=>!cache.has(ck(type,id)));
   if(missing.length){const r=await store.get(type,missing);for(const id of missing)cache.set(ck(type,id),r[id]??null);}
   const data={};
   for(const id of ids){
    const t=cache.get(ck(type,id));let value=t?dec(t):null;
    if(type==='app-state-sync-key'&&value)value=proto.Message.AppStateSyncKeyData.fromObject(value);
    data[id]=value;
   }
   return data;
  },
  set:async data=>{
   const changes=[];
   for(const type in data)for(const id in data[type]){
    const v=data[type][id],texto=v?enc(v):null;
    changes.push({tipo:type,clave:id,texto});
   }
   await store.set(changes);
   for(const c of changes)cache.set(ck(c.tipo,c.clave),c.texto);
  }
 };
 return {state:{creds,keys},saveCreds:async()=>store.set([{tipo:'creds',clave:'creds',texto:enc(creds)}])};
}

// Pasa una sesión guardada en archivos (versión anterior) a la base, una sola vez.
// Las claves de grupos (sender-key) se omiten: el conector ignora grupos.
const LEGACY=['app-state-sync-version','app-state-sync-key','sender-key-memory','sender-key','identity-key','device-list','lid-mapping','pre-key','session','tctoken'];
export async function migrateLegacy(store,dir){
 const files=(await readdir(dir).catch(()=>[])).filter(f=>f.endsWith('.json'));
 if(!files.includes('creds.json'))return 0;
 const changes=[];
 for(const f of files){
  const base=f.slice(0,-5);
  if(base==='creds'){changes.push({tipo:'creds',clave:'creds',texto:await readFile(join(dir,f),'utf8')});continue;}
  const tipo=LEGACY.find(t=>base.startsWith(t+'-'));
  if(!tipo||tipo.startsWith('sender-key'))continue;
  const clave=base.slice(tipo.length+1).replace(/__/g,'/');
  if(!clave||clave.length>300)continue;
  changes.push({tipo,clave,texto:await readFile(join(dir,f),'utf8')});
 }
 // creds al final: si algo falla antes, la próxima vez se vuelve a intentar completa.
 changes.sort((a,b)=>(a.tipo==='creds')-(b.tipo==='creds'));
 await store.set(changes);
 return changes.length;
}

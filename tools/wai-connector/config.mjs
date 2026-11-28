import {mkdir,chmod,readFile,writeFile,rename,lstat} from 'node:fs/promises';
import {homedir} from 'node:os';
import {resolve,join,dirname} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
import {phoneKey} from './session.mjs';
const exec=promisify(execFile);
export const TEST_URL='https://irqeitzbfyerxcrogkyh.supabase.co';
export const PROD_URL='https://vgsepaaewbctjsjcpeta.supabase.co';
// Prueba y Producción guardan configuración y sesiones de WhatsApp en carpetas distintas.
export const ENTORNOS=Object.freeze(['prueba','produccion']);
const entornoValido=e=>e==null?'prueba':ENTORNOS.includes(e)?e:(()=>{throw Error('Entorno inválido.');})();
export const privateRoot=(entorno='prueba')=>resolve(homedir(),entornoValido(entorno)==='produccion'?'.gestlok-wai-produccion':'.gestlok-wai-pilot');
export const defaultConfig=(entorno='prueba')=>join(privateRoot(entorno),'config.private.json');

function publicKey(config,url,nombre){
 if(typeof config.anonKey!=='string'||config.anonKey.length<30)throw Error('Falta la clave pública.');
 let claims;try{claims=JSON.parse(Buffer.from(config.anonKey.split('.')[1]||'','base64url').toString());}catch{throw Error('Clave pública inválida.');}
 if(claims.role!=='anon'||claims.ref!==url.hostname.split('.')[0])throw Error('Solo se admite la clave pública de '+nombre+'; nunca service_role.');
}
function cleanUrl(url){return url.pathname==='/'&&!url.search&&!url.hash&&!url.username&&!url.password;}
export function validateConfig(config){
 const entorno=entornoValido(config?.entorno);
 const url=new URL(config?.url);
 if(entorno==='produccion'){
  // Producción: un único servidor central (INICIAR-WAI en la PC de la administradora).
  // Las líneas, pausas y QR se administran desde gestlok.com.ar; nunca hay líneas sueltas.
  if(url.origin!==PROD_URL||!cleanUrl(url))throw Error('La configuración de producción debe ser de gestlok.com.ar.');
  if(config.testOnly===true)throw Error('Una configuración de ensayo no puede usarse en producción.');
  publicKey(config,url,'producción');
  if(config.central!==true||!/^[a-f0-9]{64}$/.test(config.centralKey||'')||config.sessions?.length)throw Error('Producción requiere la configuración del servidor central.');
  return {entorno,url:url.origin,anonKey:config.anonKey,testOnly:false,enableTestMessages:true,central:true,centralKey:config.centralKey,sessions:[]};
 }
 if(url.origin!==TEST_URL||!cleanUrl(url))throw Error('Solo se admite Gestlok Prueba.');
 if(config.testOnly!==true)throw Error('Falta el indicador de ensayo.');
 publicKey(config,url,'Prueba');
 if(config.central===true){
  if(!/^[a-f0-9]{64}$/.test(config.centralKey||'')||config.sessions?.length)throw Error('Configuración central inválida.');
  return {entorno,url:url.origin,anonKey:config.anonKey,testOnly:true,enableTestMessages:config.enableTestMessages===true,central:true,centralKey:config.centralKey,sessions:[]};
 }
 if(!Array.isArray(config.sessions)||config.sessions.length<1||config.sessions.length>10)throw Error('Configurá de 1 a 10 sesiones de ensayo.');
 const ids=new Set(),num=new Set();
 for(const s of config.sessions){
  if(!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(s.id)||!/^[a-f0-9]{64}$/.test(s.key)||!phoneKey(s.number)||ids.has(s.id)||num.has(phoneKey(s.number)))throw Error('Sesión inválida o repetida.');
  ids.add(s.id);num.add(phoneKey(s.number));
 }
 return {entorno,url:url.origin,anonKey:config.anonKey,testOnly:true,enableTestMessages:config.enableTestMessages===true,sessions:config.sessions.map(s=>({id:s.id,number:s.number,key:s.key}))};
}
// The pilot stores WhatsApp device credentials in this user's home only.
// Windows uses ACLs, not Unix chmod bits; reject symlinks or failed ACL commands.
export async function protectDirectory(path=privateRoot()){
 await mkdir(path,{recursive:true,mode:0o700});
 const meta=await lstat(path);
 if(!meta.isDirectory()||meta.isSymbolicLink())throw Error('Directorio de credenciales inválido.');
 if(process.platform==='win32'){
  const {stdout}=await exec('whoami.exe',['/user','/fo','csv','/nh'],{windowsHide:true});
  const sid=/S-1-\d+(?:-\d+)+/.exec(stdout)?.[0];
  if(!sid)throw Error('No se pudo comprobar el usuario de Windows.');
  await exec('icacls.exe',[path,'/inheritance:r','/grant:r','*'+sid+':(OI)(CI)F'],{windowsHide:true});
 }else await chmod(path,0o700);
 return path;
}
export async function loadConfig(file=defaultConfig()){
 const meta=await lstat(file);
 if(!meta.isFile()||meta.isSymbolicLink())throw Error('Archivo de configuración inválido.');
 if(process.platform!=='win32'&&(meta.mode&0o077))throw Error('La configuración debe ser privada (chmod 600).');
 const checked=validateConfig(JSON.parse(await readFile(file,'utf8')));
 if(process.platform==='win32'&&resolve(dirname(file))!==privateRoot(checked.entorno))throw Error('Importá la configuración con CONFIGURAR-WAI.cmd.');
 return checked;
}
export async function saveConfig(config){
 const checked=validateConfig(config),dir=await protectDirectory(privateRoot(checked.entorno)),dest=defaultConfig(checked.entorno),temp=join(dir,randomUUID()+'.tmp');
 await writeFile(temp,JSON.stringify(checked,null,2),{mode:0o600,flag:'wx'});
 await rename(temp,dest);
 if(process.platform!=='win32')await chmod(dest,0o600);
 return dest;
}

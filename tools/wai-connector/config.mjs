import {mkdir,chmod,readFile,writeFile,rename,lstat} from 'node:fs/promises';
import {homedir} from 'node:os';
import {resolve,join,dirname} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
import {phoneKey} from './session.mjs';
const exec=promisify(execFile);
export const TEST_URL='https://irqeitzbfyerxcrogkyh.supabase.co';
export const privateRoot=()=>resolve(homedir(),'.gestlok-wai-pilot');
export const defaultConfig=()=>join(privateRoot(),'config.private.json');

export function validateConfig(config){
 const url=new URL(config?.url);
 if(url.origin!==TEST_URL||url.pathname!=='/'||url.search||url.hash||url.username||url.password)throw Error('Solo se admite Gestlok Prueba.');
 if(config.testOnly!==true)throw Error('Falta el indicador de ensayo.');
 if(typeof config.anonKey!=='string'||config.anonKey.length<30)throw Error('Falta la clave pública.');
 const claims=JSON.parse(Buffer.from(config.anonKey.split('.')[1]||'','base64url').toString());
 if(claims.role!=='anon'||claims.ref!==url.hostname.split('.')[0])throw Error('Solo se admite la clave pública de Prueba; nunca service_role.');
 if(!Array.isArray(config.sessions)||config.sessions.length<1||config.sessions.length>10)throw Error('Configurá de 1 a 10 sesiones de ensayo.');
 const ids=new Set(),num=new Set();
 for(const s of config.sessions){
  if(!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(s.id)||!/^[a-f0-9]{64}$/.test(s.key)||!phoneKey(s.number)||ids.has(s.id)||num.has(phoneKey(s.number)))throw Error('Sesión inválida o repetida.');
  ids.add(s.id);num.add(phoneKey(s.number));
 }
 return {url:url.origin,anonKey:config.anonKey,testOnly:true,enableTestMessages:config.enableTestMessages===true,sessions:config.sessions.map(s=>({id:s.id,number:s.number,key:s.key}))};
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
 if(process.platform==='win32'&&resolve(dirname(file))!==privateRoot())throw Error('Importá la configuración con INSTALAR-WAI.cmd.');
 return validateConfig(JSON.parse(await readFile(file,'utf8')));
}
export async function saveConfig(config){
 const checked=validateConfig(config),dir=await protectDirectory(),dest=defaultConfig(),temp=join(dir,randomUUID()+'.tmp');
 await writeFile(temp,JSON.stringify(checked,null,2),{mode:0o600,flag:'wx'});
 await rename(temp,dest);
 if(process.platform!=='win32')await chmod(dest,0o600);
 return dest;
}

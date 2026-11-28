import {readFile} from 'node:fs/promises';
import {createInterface} from 'node:readline/promises';
import {stdin,stdout} from 'node:process';
import {validateConfig,saveConfig,loadConfig,defaultConfig} from './config.mjs';
import {phoneKey} from './session.mjs';

console.log('GESTLOK WAI · importar configuración privada (Prueba o Producción)');
console.log('No pegues claves ni configuración en chats. Importá aquí el JSON descargado del portal.');
const rl=createInterface({input:stdin,output:stdout});
try{
 const path=(process.argv[2]||await rl.question('Arrastrá el archivo JSON descargado del panel a esta ventana y presioná Enter: ')).trim().replace(/^["']|["']$/g,'');
 if(!path)throw Error('No se seleccionó un archivo.');
 const next=validateConfig(JSON.parse(await readFile(path,'utf8')));
 let prev=null;try{prev=await loadConfig(defaultConfig(next.entorno));}catch(e){if(e.code!=='ENOENT')throw e;}
 if(prev&&next.central!==true){
  if(prev.central)throw Error('El servidor central ya está configurado. No importes líneas individuales.');
  if(prev.anonKey!==next.anonKey||prev.url!==next.url)throw Error('La configuración no corresponde al mismo proyecto.');
  const merged=new Map(prev.sessions.map(s=>[s.id,s]));
  for(const s of next.sessions){
   const duplicate=[...merged.values()].find(x=>x.id!==s.id&&phoneKey(x.number)===phoneKey(s.number));
   if(duplicate)throw Error('El número ya se configuró con otro identificador.');
   merged.set(s.id,s);
  }
  next.sessions=[...merged.values()];
  next.enableTestMessages=prev.enableTestMessages||next.enableTestMessages;
 }
 await saveConfig(next);
 console.log((next.entorno==='produccion'?'PRODUCCIÓN · ':'PRUEBA · ')+(next.central?'Configuración central importada. Las líneas se incorporarán automáticamente desde tu panel.':'Configuración importada: '+next.sessions.length+' sesión(es).'));
 console.log('Guardada en tu carpeta privada. No compartas el JSON descargado; podés eliminar esa copia después de verificar.');
 console.log(next.entorno==='produccion'?'Abrí INICIAR-WAI-PRODUCCION.cmd (Windows) o ejecutá node connector.mjs produccion.':'Abrí INICIAR-WAI.cmd (Windows) o ejecutá node connector.mjs.');
}catch(e){console.error('No se pudo importar: '+e.message);process.exitCode=1;}
finally{rl.close();}

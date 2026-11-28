// A central control plane discovers all enabled lines, without per-line imports.
// No socket starts unless the signed inventory is valid. Failed inventory closes
// sockets; a fresh snapshot restores them with their private persisted sessions.
import {phoneKey} from './session.mjs';
const uuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
export function validInventory(data){
 if(data?.ok!==true||!Array.isArray(data.sessions)||data.sessions.length>500)return null;
 const ids=new Set(),phones=new Set();
 for(const item of data.sessions){
  const phone=phoneKey(item?.number);
  if(!uuid.test(item?.id||'')||!/^[a-f0-9]{64}$/.test(item?.key||'')||!phone||ids.has(item.id)||phones.has(phone))return null;
  ids.add(item.id);phones.add(phone);
 }
 return data.sessions;
}
export function createCentral({inventory,create,log=()=>{},concurrency=8}){
 const workers=new Map();let working=false,stopped=false,syncing=null,standby=false;
 async function remove(id,worker){workers.delete(id);await worker.session.close();}
 async function clear(){await Promise.allSettled([...workers].map(([id,w])=>remove(id,w)));}
 async function sync(){
  if(stopped)return false;
  if(syncing)return syncing;
  syncing=(async()=>{
   try{
    const data=await inventory('sincronizar');
    if(stopped)return false;
    const lines=validInventory(data);
    // Otro equipo (PC o teléfono) tiene el turno: este queda de respaldo y lo toma si el otro deja de dar señal.
    if(!lines&&data?.ocupado===true&&!standby){standby=true;log('Respaldo en espera: otro equipo está atendiendo. Si deja de dar señal, este equipo toma la atención en menos de un minuto.');}
    if(lines&&standby){standby=false;log('Este equipo tomó la atención de WAI.');}
    if(!lines){if(workers.size)log('Servidor central sin autorización o instancia ocupada. Conexiones pausadas.');await clear();return false;}
    const wanted=new Map(lines.map(line=>[line.id,line]));
    for(const [id,w] of workers){
     const l=wanted.get(id);
     if(!l||l.key!==w.line.key||l.number!==w.line.number)await remove(id,w);
    }
    for(const line of lines){
     if(stopped)return false;
     if(!workers.has(line.id)){
      workers.set(line.id,{line,session:create(line)});
      log('Línea '+line.id.slice(0,8)+' incorporada automáticamente.');
     }
    }
    return true;
   }catch{if(!stopped){log('Control central no disponible. Conexiones pausadas hasta recuperar señal.');await clear();}return false;}
  })();
  try{return await syncing;}finally{syncing=null;}
 }
 async function tick(){
  const ready=await sync();
  if(!ready||working||stopped)return;
  working=true;
  try{
   const batch=[...workers.values()];let next=0;
   await Promise.allSettled(Array.from({length:Math.min(concurrency,batch.length)},async()=>{
    while(!stopped&&next<batch.length){
     const w=batch[next++];
     await Promise.resolve().then(()=>w.session.tick()).catch(()=>{});
    }
   }));
  }finally{working=false;}
 }
 async function close(){stopped=true;await syncing?.catch(()=>{});await clear();await inventory('liberar').catch(()=>{});}
 return {tick,close,size:()=>workers.size};
}

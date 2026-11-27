// Only our own, explicitly authorized single-choice polls. Never persist
// a customer's unrelated messages or their WhatsApp history.
import {randomBytes,createHash} from 'node:crypto';
import {join} from 'node:path';
import {writeFile,readFile,readdir,unlink} from 'node:fs/promises';
import {phoneKey} from './session.mjs';
const idOk=id=>typeof id==='string'&&/^[A-Za-z0-9_-]{1,200}$/.test(id);
const pn=j=>/^([1-9]\d{7,14})(?::\d+)?@s\.whatsapp\.net$/.exec(j||'')?.[1];
const phone=j=>pn(j)?phoneKey('+'+pn(j)):null;
export function normalizePoll(value){
 if(!value||typeof value.pregunta!=='string'||value.pregunta.length<2||value.pregunta.length>120||!Array.isArray(value.opciones)||value.opciones.length<2||value.opciones.length>6)return null;
 const items=value.opciones;
 if(items.some(o=>!o||!/^[-a-z0-9_]{1,40}$/.test(o.id||'')||typeof o.label!=='string'||!o.label.trim()||o.label.length>60)||new Set(items.map(o=>o.id)).size!==items.length||new Set(items.map(o=>o.label)).size!==items.length)return null;
 return {pregunta:value.pregunta,opciones:items.map(({id,label})=>({id,label}))};
}
export function selectionFromVote(options,vote){
 if(!Array.isArray(vote?.selectedOptions)||vote.selectedOptions.length!==1)return null;
 const selected=Buffer.from(vote.selectedOptions[0]);
 if(selected.length!==32)return null;
 return options.find(o=>createHash('sha256').update(o.label,'utf8').digest().equals(selected))?.id||null;
}
export function createPollStore(dir,{now=Date.now}={}){
 const path=id=>join(dir,'wai-poll-'+id+'.json');
 async function create(id,route,canonical,grant,definition){
  const spec=normalizePoll(definition);
  if(!idOk(id)||!grant?.id||phone(canonical)!==phoneKey(grant.tester)||!spec||!Number.isFinite(Date.parse(grant.vence_at)))throw Error('Encuesta inválida');
  const record={id,route,canonical,pilot:grant.id,expires:Date.parse(grant.vence_at),...spec,secret:randomBytes(32).toString('base64')};
  // Persist before granting the network send, so a reconnect can decrypt a vote.
  await writeFile(path(id),JSON.stringify(record),{flag:'wx',mode:0o600});
  return {poll:{name:spec.pregunta,values:spec.opciones.map(o=>o.label),selectableCount:1,messageSecret:Buffer.from(record.secret,'base64')}};
 }
 async function get(id,grant,route,canonical,currentTime=now(),verifiedRoute=false){
  if(!idOk(id)||!grant?.id||phone(canonical)!==phoneKey(grant.tester))return null;
  try{
   const record=JSON.parse(await readFile(path(id),'utf8'));
   if(record.id!==id||record.pilot!==grant.id||record.expires<=currentTime||Date.parse(grant.vence_at)<=currentTime||phone(record.canonical)!==phone(canonical)||!normalizePoll(record)||!(route===record.route||phone(route)===phone(canonical)||route===canonical||verifiedRoute&&/^\d{1,20}@lid$/.test(route))||Buffer.from(record.secret,'base64').length!==32)return null;
   return record;
  }catch{return null;}
 }
 async function prune(){for(const file of await readdir(dir).catch(()=>[])){if(!/^wai-poll-[A-Za-z0-9_-]{1,200}\.json$/.test(file))continue;try{const r=JSON.parse(await readFile(join(dir,file),'utf8'));if(Number.isFinite(r.expires)&&r.expires<now()-86400000)await unlink(join(dir,file));}catch{/* no unrelated files touched */}}}
 return {create,get,prune};
}

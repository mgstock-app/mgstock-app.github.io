// Native WhatsApp interaction preview. Opaque, per-turn IDs are persisted in
// the isolated conversation state, never interpreted as catalogue IDs.
// No provider requests, dispatch or credentials.
const chars=s=>Array.from(String(s??''));
const cut=(s,max)=>chars(s).slice(0,max).join('');
const clean=s=>String(s??'').replace(/\s+/g,' ').trim();
const tokenPattern=/^gc_[a-f0-9]{32}_[1-9][0-9]?$/;
export function isNativeReplyId(id){return typeof id==='string'&&tokenPattern.test(id);}

export function buildNativeMenu({prompt,options,page,totalPages}){
 const choices=options.map(o=>({label:clean(o.label),input:o.input??String(o.number)}));
 if(page>0)choices.push({label:'Anterior',input:'Anterior'});
 if(page+1<totalPages)choices.push({label:'Siguiente',input:'Siguiente'});
 if(!choices.length||choices.length>10||choices.some(o=>!o.label||chars(o.label).length>94))return null;
 const body=(prompt||[]).filter(Boolean).join('\n\n');
 // Never truncate a reviewed order or condition. Long prompts remain text
 // with numbered choices instead of silently omitting information.
 if(!body||chars(body).length>1024)return null;
 const turn=crypto.randomUUID().replaceAll('-','');
 const rows=choices.map((o,i)=>({...o,id:'gc_'+turn+'_'+(i+1)}));
 const mapping=Object.fromEntries(rows.map(o=>[o.id,o.input]));
 if(rows.length<=3&&rows.every(o=>chars(o.label).length<=20)&&new Set(rows.map(o=>o.label)).size===rows.length){
  return {mapping,interactive:{type:'button',body:{text:body},action:{buttons:rows.map(o=>({type:'reply',reply:{id:o.id,title:o.label}}))}}};
 }
 // Prefix with the selected option number (or navigation arrow) so long
 // similar names cannot become indistinguishable when titles are shortened.
 const listRows=rows.map((o,i)=>{
  const prefix=(o.input==='Anterior'?'‹ ':o.input==='Siguiente'?'› ':String(i+1)+'. ');
  const title=prefix+cut(o.label,24-chars(prefix).length);
  const remainder=chars(o.label).slice(24-chars(prefix).length).join('').trim();
  if(chars(remainder).length>72)return null;
  return {id:o.id,title,...(remainder?{description:remainder}:{})};
 });
 if(listRows.some(o=>!o))return null;
 return {mapping,interactive:{type:'list',body:{text:body},action:{button:'Elegir opción',sections:[{rows:listRows}]}}};
}

export function resolveNativeReply(state,id){
 if(!isNativeReplyId(id)||!state?.nativeMenu||!Object.hasOwn(state.nativeMenu,id))return null;
 return state.nativeMenu[id];
}
// YCloud uses the same button_reply / list_reply object shape as Meta.
// Do not accept provider-supplied titles as instructions or product IDs.
export function readYCloudInput(message){
 if(message?.type==='text'&&typeof message.text?.body==='string'&&message.text.body.length<=600)return {text:message.text.body};
 if(message?.type!=='interactive')return null;
 const i=message.interactive;
 if(!['button_reply','list_reply'].includes(i?.type))return null;
 const id=i[i.type]?.id;
 if(!isNativeReplyId(id))return null;
 return {text:'',interactiveId:id};
}

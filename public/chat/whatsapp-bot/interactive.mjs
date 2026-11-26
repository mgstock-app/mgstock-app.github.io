// WhatsApp Cloud-compatible interactive projection. Pure, deterministic business
// rules; IDs are opaque, turn-scoped and never contain a customer number.
// No network, messaging credentials or order persistence in this module.
import {conversationPreview} from './conversation.mjs';
import {visualMenuFor,visualIntent,visualCategories,visualSheet} from './visual-menu.mjs';
const clean=v=>String(v??'').trim();
const chars=v=>Array.from(v);
const cut=(v,n)=>chars(v).slice(0,n).join('');
const length=v=>chars(v).length;
const scopeOf=i=>JSON.stringify([i.empresa,i.sucursal,i.phone]);
const textMessage=body=>({type:'text',text:{body}});
function splitBody(body,limit){
 const out=[];let current='';
 for(const line of body.split('\n')){
  if(length(current)+length(line)+1>limit&&current){out.push(current);current='';}
  let rest=line;
  while(length(rest)>limit){out.push(cut(rest,limit));rest=chars(rest).slice(limit).join('');}
  current+=(current?'\n':'')+rest;
 }
 if(current)out.push(current);return out;
}
export function nativeMessages(body,choices){
 const contents=splitBody(body||'Elegí cómo continuar.',choices.length?1024:4096);
 const final=contents.pop();
 const earlier=contents.map(textMessage);
 if(!choices.length)return [...earlier,textMessage(final)];
 if(choices.length>10)throw Error('Más de diez opciones');
 const labels=choices.map(o=>o.label);
 const direct=choices.length<=3&&labels.every(v=>length(v)<=20)&&new Set(labels).size===labels.length;
 if(direct)return [...earlier,{type:'interactive',interactive:{type:'button',body:{text:final},action:{buttons:choices.map(o=>({type:'reply',reply:{id:o.token,title:o.label}}))}}}];
 const rows=choices.map((o,i)=>{
  const prefix=(i+1)+'. ';
  const title=prefix+cut(o.label,24-length(prefix));
  return {id:o.token,title,...(length(o.label)>24-length(prefix)?{description:cut(o.label,72)}:{})};
 });
 return [...earlier,{type:'interactive',interactive:{type:'list',body:{text:final},action:{button:'Ver opciones',sections:[{title:'Elegí una opción',rows}]}}}];
}
export async function interactiveTurn({identity,sucursal,catalogo,privado={},session,input,now=new Date(),excluded=false,visualOrigin,visualDemonstration=false}){
 if(!identity||!['empresa','sucursal','phone'].every(k=>typeof identity[k]==='string'&&identity[k])||!/^\+[1-9]\d{7,14}$/.test(identity.phone))throw Error('Identidad inválida');
 if(session&&session.scope!==scopeOf(identity))throw Error('Sesión de otra conversación');
 if(!input||typeof input.id!=='string'||!input.id||input.id.length>200||((typeof input.text==='string')===(typeof input.clickId==='string'))||clean(input.text).length>600||clean(input.clickId).length>200)throw Error('Entrada inválida');
 const blocked=(reason,extra={})=>({session,payloads:[],choices:[],sendAllowed:false,reason,...extra});
 if(excluded)return blocked('excluded');
 if(session?.seen?.includes(input.id)||session?.waSeen?.includes(input.id))return blocked('duplicate',{duplicate:true});
 if(session?.waPaused){
  const next={...session,waSeen:[...(session.waSeen||[]).slice(-255),input.id]};
  return blocked('human',{session:next,action:{type:'simulated_human_message',detail:typeof input.text==='string'?input.text:'Selección anterior'}});
 }
 let text=input.text,selected;
 const visual=visualMenuFor({identity,sucursal,origin:visualOrigin,demonstration:visualDemonstration});
 if(typeof input.clickId==='string'){
  selected=session?.waChoices?.find(o=>o.token===input.clickId);
  if(!selected){
   const next=session?{...session,waSeen:[...(session.waSeen||[]).slice(-255),input.id]}:session;
   return {...blocked('stale',{session:next}),payloads:[textMessage('Esa opción ya venció. Elegí una opción del mensaje más reciente.')],choices:session?.waChoices||[]};
  }
  text=selected.value;
 }
 // Visual browsing is deliberately separate from ordering. Only a current
 // scoped option ID or a clear customer inquiry can open a menu sheet.
 const canBrowse=visual&&(!session||session.stage==='menu');
 if(canBrowse&&session?.waChoices?.length&&!selected&&typeof text==='string'&&/^[1-9]\d*$/.test(text.trim())){
  selected=session.waChoices?.[Number(text.trim())-1];
  if(!selected)return {...blocked('invalid_visual_option'),payloads:[textMessage('Elegí una opción del último mensaje.')],choices:session.waChoices||[]};
  text=selected.value;
 }
 let visualGroup=null,sheet=null;
 if(canBrowse){
  if(selected?.id==='visual:menu')visualGroup='all';
  else if(selected?.id==='visual:promos'||selected?.id==='promociones')visualGroup='promos';
  else if(selected?.id==='visual:back')visualGroup=session?.waVisual?.group||'all';
  else if(selected?.id?.startsWith('visual:sheet:'))sheet=visualSheet(visual,selected.id.slice('visual:sheet:'.length));
  else if(!selected)visualGroup=visualIntent(text);
 }
 if(visualGroup||sheet){
  // Initialize a valid shared-engine session without modifying the cart.
  const s=session?structuredClone(session):(await conversationPreview({identity,sucursal,catalogo,privado:{...privado,ia_activa:false},event:{id:input.id,text:'Hola'},ahora:now})).session;
  if(!s.seen.includes(input.id))s.seen=[...s.seen.slice(-255),input.id];
  const group=visualGroup||session?.waVisual?.group||'all';
  s.waVisual={group};
  const raw=sheet?[
   {id:'visual:buy',label:'Hacer un pedido',value:'menu'},
   {id:'visual:back',label:'Ver otra categoría',value:''},
   sheet.groups.includes('promos')?{id:'visual:order_promos',label:'Elegir promoción',value:'ver promociones'}:{id:'visual:promos',label:'Ver promociones',value:''}
  ]:[...visualCategories(visual,group),...(group==='all'?[{id:'visual:buy',label:'Hacer un pedido',value:'menu'}]:[])];
  const token=crypto.randomUUID().replaceAll('-','');
  const choices=raw.map((o,i)=>({...o,token:'wa1_'+token+'_'+i}));
  s.waChoices=choices;
  const body=sheet?sheet.title+'\n'+(visual.demo?'Imagen de referencia. Los precios del pedido son de ensayo.':'Carta de referencia. Los precios y disponibilidad se confirman al armar el pedido.')+'\n¿Qué deseás hacer?':group==='promos'?'Elegí qué promociones querés consultar.':'Elegí qué parte de la carta querés ver.';
  const payloads=nativeMessages(body,choices);
  // Meta allows an image header on reply buttons (not list messages).
  // Three short buttons keep the selected photo and next actions in ONE message.
  if(sheet){
   const p=payloads.at(-1);
   if(p.interactive?.type!=='button')throw Error('Formato visual inválido');
   p.interactive.header={type:'image',image:{link:sheet.link}};
  }
  return {session:s,payloads,choices,sendAllowed:false};
 }
 if(selected?.id?.startsWith('visual:')&&!canBrowse)return blocked('visual_unavailable');
 // When the customer leaves browsing, the existing engine handles the order.
 if(session?.waVisual){session=structuredClone(session);delete session.waVisual;}
 const r=await conversationPreview({identity,sucursal,catalogo,privado:{...privado,ia_activa:false},session,event:{id:input.id,text},ahora:now});
 if(r.duplicate)return blocked('duplicate',{duplicate:true});
 const s=r.session;
 let rawChoices=r.options.map(o=>({id:o.id,label:o.label,value:String(o.number)}));
 if(visual&&s.stage==='menu'&&rawChoices.some(o=>o.id==='horario')&&rawChoices.some(o=>o.id==='carta')&&rawChoices.length<8)rawChoices.splice(1,0,{id:'visual:menu',label:'Ver carta',value:''});
 if(r.options.length&&s.page>0)rawChoices.push({id:'previous',label:'Anterior',value:'Anterior'});
 if(r.options.length&&(s.page+1)*8<s.menu.length)rawChoices.push({id:'next',label:'Siguiente',value:'Siguiente'});
 if(!rawChoices.length&&s.stage==='quantity'){rawChoices=[1,2,3].map(n=>({id:'qty:'+n,label:String(n),value:String(n)}));}
 if(!rawChoices.length&&s.stage==='flavor_qty'){
  const g=s.product.offered.groups[s.product.group];
  const remain=g.total-Object.values(s.product.choices[g.id]||{}).reduce((a,b)=>a+b,0);
  rawChoices=[...new Set([1,Math.min(2,remain),remain])].filter(n=>n>0).map(n=>({id:'qty:'+n,label:String(n),value:String(n)}));
 }
 if(s.stage==='submitted'&&!rawChoices.length&&r.messages.length)rawChoices=[{id:'new_order',label:'Nuevo pedido',value:'nuevo pedido'}];
 if(r.action?.type==='simulated_handoff'){s.waPaused=true;rawChoices=[];}
 // On invalid text, don't reconstruct unrelated menu options from stale state.
 if(!r.messages.length)return {...blocked('silent',{session:s}),action:r.action};
 const token=crypto.randomUUID().replaceAll('-','');
 const choices=rawChoices.map((o,i)=>({...o,token:'wa1_'+token+'_'+i}));
 s.waChoices=choices;
 const prompt=r.options.length&&s.prompt?.length?s.prompt.join('\n'):r.messages.join('\n');
 // Preserve numbered long labels, including prices, instead of cutting them out.
 const extended=choices.filter(o=>length(o.label)>72).map(o=>o.label).join('\n');
 const body=prompt+(extended?'\n'+extended:'');
 return {session:s,payloads:nativeMessages(body,choices),choices,action:r.action,sendAllowed:false};
}
// Trusted manager action ONLY: never reachable from a customer text or click.
export function resumeDemo(session){
 if(!session?.waPaused)return session;
 return {...session,waPaused:false,stage:'menu',waChoices:[],menu:[],page:0,prompt:[]};
}
// The signature, freshness and tenant routing must be verified BEFORE calling.
// YCloud webhook fields are validated; never use the button title as a command.
export function decodeVerifiedInbound(event){
 if(event?.type!=='whatsapp.inbound_message.received'||event.apiVersion!=='v2')return null;
 const m=event.whatsappInboundMessage;
 if(!m||m.groupId||m.fromMe||!['id','wamid','wabaId','from','to'].every(k=>typeof m[k]==='string'&&m[k]))return null;
 let input;
 if(m.type==='text'&&typeof m.text?.body==='string')input={id:m.wamid,text:m.text.body};
 else if(m.type==='interactive'&&['button_reply','list_reply'].includes(m.interactive?.type)){
  const selection=m.interactive[m.interactive.type];
  if(typeof selection?.id==='string'&&/^wa1_[0-9a-f]{32}_\d{1,2}$/.test(selection.id))input={id:m.wamid,clickId:selection.id};
 }
 if(!input)return null;
 return {waba:m.wabaId,to:m.to,from:m.from,eventId:event.id,messageId:m.id,input};
}

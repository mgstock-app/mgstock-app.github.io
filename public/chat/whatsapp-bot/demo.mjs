import {interactiveTurn,resumeDemo} from './interactive.mjs';
import {fixture} from './fixtures.mjs';
import {describirLinea,importeLinea,pesos} from '../motor.js';
const $=id=>document.getElementById(id);
const messages=$('messages'),input=$('input');
let local=$('local').value;
const locals=new Map();
const fresh=()=>({session:undefined,history:[],orders:[],queries:[],active:false,excluded:false,format:[]});
const current=()=>{if(!locals.has(local))locals.set(local,fresh());return locals.get(local);};
function el(tag,content,klass){const e=document.createElement(tag);if(content!==undefined)e.textContent=content;if(klass)e.className=klass;return e;}
let busy=false;
function render(){
 const state=current(),choices=state.session?.waChoices||[];
 $('mode').textContent=state.excluded?'Excluido':state.session?.waPaused?'Atención humana':'Bot guiado';
 $('exclude').checked=state.excluded;
 messages.replaceChildren();
 for(const m of state.history){
  const bubble=el('article',undefined,'bubble '+(m.role==='cliente'?'customer':m.role==='gerente'?'manager-msg':''));
  bubble.append(el('small',m.role==='cliente'?'Cliente':m.role==='gerente'?'Gerente · Gestlok Chat':'Asistente'));
  bubble.append(el('div',m.body));
  if(m.interactive){
   const control=el('div',undefined,'choices'),i=m.interactive;
   const add=(parent,id,title,description)=>{
    const b=el('button',title);b.type='button';b.disabled=busy||state.excluded||state.session?.waPaused||!choices.some(x=>x.token===id);
    if(description)b.append(el('span',description));b.addEventListener('click',()=>turn({clickId:id},title));parent.append(b);
   };
   if(i.type==='button')i.action.buttons.forEach(b=>add(control,b.reply.id,b.reply.title));
   else{const d=el('details');d.append(el('summary',i.action.button));i.action.sections.forEach(s=>s.rows.forEach(r=>add(d,r.id,r.title,r.description)));control.append(d);}
   bubble.append(control);
  }
  messages.append(bubble);
 }
 messages.scrollTop=messages.scrollHeight;
 $('format').textContent=JSON.stringify(state.format,null,2);
 const mgr=$('managerContent');mgr.replaceChildren();
 if(!state.orders.length&&!state.queries.length)mgr.append(el('div','Todavía no hay pedidos ni consultas. Hacé un pedido o elegí ayuda desde la vista del cliente.','empty'));
 const f=fixture(local);
 for(const order of state.orders){
  const card=el('div',undefined,'order');
  card.append(el('strong','Pedido de ensayo · '+order.status),el('p',order.pedido.nombre+' · '+order.pedido.entrega));
  for(const line of order.pedido.items)card.append(el('p',describirLinea(f.catalogo,line)+' · '+pesos(importeLinea(f.catalogo,line))));
  card.append(el('p','Pago: '+order.pedido.medio_pago+(order.pedido.direccion?' · '+order.pedido.direccion:'')));
  if(order.status==='Pendiente de confirmación'){
   const actions=el('div',undefined,'actions');
   for(const [label,status] of [['Confirmar','Confirmado por el gerente'],['Rechazar','Rechazado por el gerente']]){
    const b=el('button',label);b.addEventListener('click',()=>{order.status=status;state.history.push({role:'gerente',body:status+' (ensayo).'});render();});actions.append(b);
   }card.append(actions);
  }mgr.append(card);
 }
 for(const q of state.queries){const card=el('div',undefined,'order');card.append(el('strong','Consulta del cliente'),el('p',q));mgr.append(card);}
 $('managerForm').hidden=!state.session?.waPaused;
 $('composer').querySelector('button').disabled=busy;
 $('local').disabled=busy;$('reset').disabled=busy;$('exclude').disabled=busy;
}
async function turn(value,label){
 if(busy)return;busy=true;const state=current();
 state.history.push({role:'cliente',body:label});render();
 try{
  const r=await interactiveTurn({...fixture(local),session:state.session,input:{id:crypto.randomUUID(),...value},excluded:state.excluded});
  state.session=r.session;state.format=r.payloads;
  for(const p of r.payloads)state.history.push({role:'bot',body:p.type==='text'?p.text.body:p.interactive.body.text,interactive:p.interactive});
  if(r.action?.type==='simulated_order')state.orders.push({pedido:r.action.pedido,status:'Pendiente de confirmación'});
  if(r.action?.type==='simulated_handoff'||r.action?.type==='simulated_human_message')state.queries.push(r.action.detail);
 }catch(e){state.history.push({role:'bot',body:'No pudimos procesar esta selección de ensayo. Reiniciá o volvé a intentar.'});console.error(e);}
 finally{busy=false;render();}
}
$('composer').addEventListener('submit',e=>{e.preventDefault();const text=input.value.trim();if(!text||busy)return;input.value='';turn({text},text);});
$('local').addEventListener('change',()=>{local=$('local').value;render();if(!current().history.length)turn({text:'Hola'},'Hola');});
$('reset').addEventListener('click',()=>{const excluded=current().excluded;locals.set(local,{...fresh(),excluded});render();if(!excluded)turn({text:'Hola'},'Hola');});
$('exclude').addEventListener('change',()=>{current().excluded=$('exclude').checked;render();});
$('managerForm').addEventListener('submit',e=>{e.preventDefault();const text=$('reply').value.trim();if(!text||!current().session?.waPaused)return;current().history.push({role:'gerente',body:text});$('reply').value='';render();});
$('resume').addEventListener('click',()=>{current().session=resumeDemo(current().session);render();turn({text:'menu'},'Volver a la carta');});
render();turn({text:'Hola'},'Hola');

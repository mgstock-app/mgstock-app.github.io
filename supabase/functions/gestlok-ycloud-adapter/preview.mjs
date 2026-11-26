// Preview only: reuse the real chat engine. No persistence, no network by default,
// no provider sends, no order execution. Explicitly report unsupported web UI.
import {responder,clasificarSoporte,consultaAjena,carteleraDelDia} from '../gestlok-chat/motor.js';
import {responderIA} from '../gestlok-chat/ia.js';
const text=v=>String(v??'').trim();
const available=p=>p?.activo!==false&&p?.disponible!==false;
export function projectWhatsApp(turn,catalogo){
 const messages=[];const pending=new Set();const options=[];
 const add=(id,label)=>{if(typeof id!=='string'||!id||options.some(x=>x.id===id)||options.length>=30)return;options.push({id,label:text(label).slice(0,80)});};
 for(const m of turn.mensajes||[]){
  if(m.tipo==='carta'){
   const list=(catalogo?.productos||[]).filter(p=>available(p)&&(!m.categoria||p.categoria_id===m.categoria));
   if(list.length){messages.push('Productos disponibles:');for(const p of list)add('elegir:'+p.id+':1',p.nombre+' · $ '+Number(p.precio).toLocaleString('es-AR'));}
   if(list.length>30)pending.add('paginacion_carta');
  }else if(m.tipo==='producto'){
   pending.add('selector_producto'); // mandatory variants must not be inferred or skipped
  }else if(m.tipo==='datos'){
   pending.add('formulario_datos');
  }else if(m.tipo){
   pending.add('interfaz_'+m.tipo);
  }else if(text(m.texto)){messages.push(text(m.texto));}
  for(const b of m.botones||[])add(b.id,b.texto);
 }
 if(turn.accion)pending.add('accion_'+turn.accion.tipo);
 return {messages,options:options.map((o,i)=>({...o,number:i+1})),pending:[...pending],sendAllowed:false};
}
export async function previewWhatsApp({sucursal,catalogo,privado={},estado,historial=[],entrada,config={},fetchImpl,ahora=new Date()}){
 const active=carteleraDelDia(sucursal,catalogo,ahora);
 const x={sucursal:active.sucursal,catalogo:active.catalogo,estado,entrada,mensajes:privado.mensajes||{},ahora};
 const raw=text(entrada?.texto).slice(0,600);
 if(clasificarSoporte(entrada)||raw&&consultaAjena(raw)){
  return {motor:'guiado',estado,projection:{messages:['Un integrante del local revisará su consulta.'],options:[],pending:['derivacion_humana'],sendAllowed:false}};
 }
 let turn=responder(x),motor='guiado';
 const unknown=t=>t.mensajes?.length===1&&!t.accion&&/^(No (le|te) entendí bien|No (puedo|sabemos) responder)/i.test(text(t.mensajes[0].texto));
 // Only an explicitly injected fake provider is allowed in the preview.
 if(raw&&unknown(turn)&&privado.ia_activa!==false&&config.clave&&typeof fetchImpl==='function'){
  try{turn=await responderIA({...x,privado,historial,texto:raw,config,fetchImpl});motor='ia';}catch{/* same guided fallback */}
 }
 const projection=projectWhatsApp(turn,active.catalogo);
 if(raw&&unknown(turn))projection.pending.push('derivacion_humana');
 return {motor,estado:turn.estado,projection};
}
// Selection maps must be scoped to one conversation and one turn by the future backend.
export function selectPreviewOption(projection,input){
 const s=text(input);if(!/^[1-9][0-9]?$/.test(s))return null;
 const option=projection?.options?.find(x=>x.number===Number(s));
 return option?{boton:option.id}:null;
}

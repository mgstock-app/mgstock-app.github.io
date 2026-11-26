// Preview only: reuse the real chat engine. No persistence, no network by default,
// no provider sends, no order execution. Explicitly report unsupported web UI.
import {responder,clasificarSoporte,consultaAjena,carteleraDelDia,validarLinea,valoresDisponibles,importeLinea,pagosDe,soloEfectivo,totalCarrito,PAGOS} from '../gestlok-chat/motor.js';
import {responderIA} from '../gestlok-chat/ia.js';
const text=v=>String(v??'').trim();
const available=p=>p?.activo!==false&&p?.disponible!==false;
export function projectWhatsApp(turn,catalogo){
 const messages=[];const pending=new Set();const options=[];const selectors=[];
 const add=(id,label)=>{if(typeof id!=='string'||!id||options.some(x=>x.id===id)||options.length>=30)return;options.push({id,label:text(label).slice(0,80)});};
 for(const m of turn.mensajes||[]){
  if(m.tipo==='carta'){
   const list=(catalogo?.productos||[]).filter(p=>available(p)&&(!m.categoria||p.categoria_id===m.categoria));
   if(list.length){messages.push('Productos disponibles:');for(const p of list)add('elegir:'+p.id+':1',p.nombre+' · $ '+Number(p.precio).toLocaleString('es-AR'));}
   if(list.length>30)pending.add('paginacion_carta');
  }else if(m.tipo==='producto'){
   pending.add('selector_producto');
   for(const id of (m.productos||[]).slice(0,30)){
    const p=(catalogo?.productos||[]).find(x=>x.id===id&&available(x));if(!p)continue;
    selectors.push({id:p.id,label:p.nombre,quantity:Number.isInteger(m.cantidad)?m.cantidad:1,basePrice:Number(p.precio),groups:(p.opciones||[]).map(g=>({id:g.id,label:g.nombre,type:g.tipo,required:g.obligatorio===true,total:g.total,max:g.max,values:valoresDisponibles(catalogo,g).map(v=>({id:v.id,label:v.nombre,extra:Number(v.extra)||0}))}))});
   }
  }else if(m.tipo==='datos'){
   pending.add('formulario_datos');
  }else if(m.tipo){
   pending.add('interfaz_'+m.tipo);
  }else if(text(m.texto)){messages.push(text(m.texto));}
  for(const b of m.botones||[])add(b.id,b.texto);
 }
 if(turn.accion)pending.add('accion_'+turn.accion.tipo);
 return {messages,selectors,options:options.map((o,i)=>({...o,number:i+1})),pending:[...pending],sendAllowed:false};
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

 // A preview may build a cart entry only from a product explicitly offered in that turn.
 // The live transport must persist the selector and bind it to its conversation before use.
export function completePreviewProduct({projection,catalogo,selection,lotId}){
 const fail=error=>({ok:false,error});
 const offered=projection?.selectors?.find(x=>x.id===selection?.productId);
 if(!offered)return fail('Producto no ofrecido en este turno.');
 if(typeof lotId!=='string'||!/^[0-9a-f-]{36}$/i.test(lotId))return fail('Selección sin identificador.');
 const p=(catalogo?.productos||[]).find(x=>x.id===offered.id&&available(x));
 if(!p)return fail('Producto no disponible.');
 const choices=selection.options??{};
 if(!choices||typeof choices!=='object'||Array.isArray(choices))return fail('Opciones inválidas.');
 for(const [id,value] of Object.entries(choices)){
  const g=(p.opciones||[]).find(x=>x.id===id);
  if(!g)return fail('Opción desconocida.');
  if(g.tipo==='cantidad'){
   if(!value||typeof value!=='object'||Array.isArray(value)||Object.values(value).some(n=>!Number.isInteger(n)||n<0||n>50))return fail('Cantidad de variedad inválida.');
  }else if(!Array.isArray(value)||value.some(x=>typeof x!=='string'))return fail('Opciones inválidas.');
  const ids=Array.isArray(value)?value:Object.keys(value).filter(x=>value[x]>0);
  if(ids.some(id=>!valoresDisponibles(catalogo,g).some(v=>v.id===id)))return fail('Variedad no disponible.');
 }
 const line={producto_id:p.id,cantidad:selection.quantity,opciones:choices,nota:''};
 const issue=validarLinea(catalogo,line);if(issue)return fail(issue);
 return {ok:true,estimatedTotal:importeLinea(catalogo,line),entry:{agregar_varios:[line],lote_id:lotId}};
}

// Checkout preview only: collect validated fields, never save or confirm a real order.
// Caller must bind state and verified sender to its own tenant/sucursal/conversation.
export function checkoutPreview({sucursal,catalogo,estado,datos={},confirmed=false,ahora=new Date()}){
 const active=carteleraDelDia(sucursal,catalogo,ahora),s=active.sucursal,c=active.catalogo;
 const error=message=>({stage:'review',message,sendAllowed:false});
 const ask=(field,message,options=[])=>({stage:'collect',field,message,options,sendAllowed:false});
 const cart=estado?.carrito;
 if(!Array.isArray(cart)||!cart.length)return error('El pedido está vacío.');
 for(const line of cart){const issue=validarLinea(c,line);if(issue)return error(issue);}
 if(s.atencion?.habilitado&&!s.atencion.abierto&&!estado.programado)return error('El local está cerrado. Primero debe aceptar programar el pedido.');
 const types=[...(s.acepta_retiro?['retiro']:[]),...(s.acepta_envio?['envio']:[])];
 if(!types.length)return error('El local no tiene entregas habilitadas.');
 if(!types.includes(datos.entrega))return ask('entrega','¿Retiro en el local o delivery?',types);
 if(typeof datos.nombre!=='string'||!datos.nombre.trim()||datos.nombre.length>80)return ask('nombre','Indique su nombre.');
 // Telephone comes only from an authenticated inbound sender in the future transport.
 if(typeof datos.telefono!=='string'||!/^\+[1-9]\d{7,14}$/.test(datos.telefono))return error('No se pudo verificar el teléfono.');
 if(datos.entrega==='envio'&&(typeof datos.direccion!=='string'||!datos.direccion.trim()||datos.direccion.length>200))return ask('direccion','Indique su dirección y entrecalles.');
 let payments=pagosDe(s,datos.entrega).filter(p=>Object.hasOwn(PAGOS,p));
 if(soloEfectivo(c,cart))payments=payments.filter(p=>p==='efectivo');
 if(!payments.length)return error('Consulte al gerente los medios de pago.');
 if(!payments.includes(datos.medio_pago))return ask('medio_pago','¿Cómo desea abonar?',payments.map(p=>({id:p,label:PAGOS[p]})));
 if(datos.entrega==='envio'&&datos.medio_pago==='efectivo'&&(typeof datos.efectivo_abona!=='string'||!/^\d{1,12}$/.test(datos.efectivo_abona)))return ask('efectivo_abona','¿Con cuánto abona?');
 const clean={entrega:datos.entrega,nombre:datos.nombre.trim(),telefono:datos.telefono,direccion:datos.entrega==='envio'?datos.direccion.trim():'',medio_pago:datos.medio_pago,efectivo_abona:datos.entrega==='envio'&&datos.medio_pago==='efectivo'?datos.efectivo_abona:'',nota:typeof datos.nota==='string'?datos.nota.slice(0,500):''};
 const total=totalCarrito(c,cart);
 if(confirmed!==true)return {stage:'confirm',message:'Revise el pedido. El gerente debe confirmarlo antes de la preparación.',estimatedProductsTotal:total,deliveryQuotePending:datos.entrega==='envio',sendAllowed:false};
 const turn=responder({sucursal:s,catalogo:c,estado,entrada:{datos:clean},ahora});
 if(turn.accion?.tipo!=='crear_pedido')return error('El pedido necesita revisión antes de enviarlo.');
 return {stage:'preview_order',message:'Pedido simulado, pendiente de validación y confirmación del gerente.',estimatedProductsTotal:total,action:turn.accion,sendAllowed:false};
}

// Offline pilot: a deterministic, serializable conversation. No calls to YCloud,
// Supabase or paid providers. State and event identity must be provided by a
// verified, tenant-bound transport; this module is not an HTTP endpoint.
import {previewWhatsApp,completePreviewProduct,checkoutPreview} from './preview.mjs';
import {buildNativeMenu,resolveNativeReply,isNativeReplyId} from './native-menu.mjs';
import {parseQuantities,parseNamedQuantities,parseCheckoutData,normalizeCash,isCourtesy} from './compact.mjs';
import {carteleraDelDia,describirLinea,importeLinea,pesos,totalCarrito,pagosDe,soloEfectivo,descuentoEfectivoAplica,PAGOS,clasificarSoporte,normalizar,botonesCarrito,estadoInicial} from '../gestlok-chat/motor.js';
const PAGE=8;
const clean=v=>String(v??'').trim();
const choice=(id,label)=>({id,label});
const number=v=>/^[1-9]\d*$/.test(v)?Number(v):NaN;
const clone=structuredClone;
const keys=v=>Object.keys(v||{}).sort();
function canonical(v){
 if(Array.isArray(v))return v.map(canonical);
 if(v&&typeof v==='object')return Object.fromEntries(keys(v).map(k=>[k,canonical(v[k])]));
 return v;
}
function snapshot(c,s,now,st,d){
 const a=carteleraDelDia(s,c,now);
 return JSON.stringify(canonical({cart:st.carrito,prices:st.carrito.map(l=>({total:importeLinea(a.catalogo,l),description:describirLinea(a.catalogo,l)})),
  datos:d,minimum:a.sucursal.pedido_minimo??0,delivery:a.sucursal.envio_costo??null,discount:a.sucursal.descuento_efectivo_pct??0,discountApplies:descuentoEfectivoAplica(a.sucursal,d.entrega),cashOnly:soloEfectivo(a.catalogo,st.carrito),payments:pagosDe(a.sucursal,d.entrega),scheduled:st.programado,at:a.sucursal.atencion?.abierto??null,opens:a.sucursal.atencion?.proxima_apertura??null,board:a.clave}));
}
export async function conversationPreview({identity,sucursal,catalogo,privado={},session,event,iaSimulada,publicSlug,ahora=new Date()}){
 if(!identity||!['empresa','sucursal','phone'].every(k=>typeof identity[k]==='string'&&identity[k].length>0)||!/^\+[1-9]\d{7,14}$/.test(identity.phone))throw Error('Identidad de piloto inválida');
 if(!event||typeof event.id!=='string'||!event.id||event.id.length>200||typeof event.text!=='string'||event.text.length>600||event.interactiveId!==undefined&&!isNativeReplyId(event.interactiveId))throw Error('Evento inválido');
 const scope=JSON.stringify([identity.empresa,identity.sucursal,identity.phone]);
 if(session&&session.scope!==scope)throw Error('Sesión de otra conversación');
 const st=session?clone(session):{scope,engine:estadoInicial(),stage:'menu',seen:[],menu:[],page:0};
 const result=(messages=[],options=[],action,native)=>({session:st,messages,options,sendAllowed:false,...(action?{action}: {}),...(native?{native}: {})});
 // Bounded memory only; a durable transport must deduplicate ALL events atomically.
 if(st.seen.includes(event.id))return {...result(),duplicate:true};
 st.seen=[...st.seen.slice(-255),event.id];
 const clicked=event.interactiveId!==undefined;
 const selectedInput=clicked?resolveNativeReply(st,event.interactiveId):null;
 // Consume the binding before processing. Every new render gets fresh IDs.
 // A reply from a different turn/session never becomes free text.
 delete st.nativeMenu;delete st.nativePreview;
 const input=clean(clicked?selectedInput:event.text), word=normalizar(input);
 const a=carteleraDelDia(sucursal,catalogo,ahora), c=a.catalogo;
 function show(messages,options=[],page=0){
  st.menu=options;st.page=Math.min(Math.max(0,page),Math.max(0,Math.ceil(options.length/PAGE)-1));st.prompt=messages;
  return redraw();
 }
 function redraw(extra=[]){
  const options=st.menu.slice(st.page*PAGE,(st.page+1)*PAGE).map((o,i)=>({...o,number:i+1}));
  const nav=[];
  if(st.page>0)nav.push('Anterior');
  if((st.page+1)*PAGE<st.menu.length)nav.push('Siguiente');
  const lines=options.map(o=>o.number+'. '+o.label);
  const firstProduct=options.find(o=>st.stage==='menu'&&o.id.startsWith('elegir:')||st.stage==='select_product');
  const hint=st.stage==='flavor'&&options.length
   ? ['Puede indicar varias cantidades juntas con el número (ej.: 1x2'+(options.length>1?', 2x1':'')+') o con el nombre exacto de la variedad.']
   : firstProduct?['Para elegir producto y cantidad en un paso, escriba '+firstProduct.number+'x2 (2 unidades).']:[];
  const built=buildNativeMenu({prompt:[...extra,...st.prompt,...(nav.length?['Pág. '+(st.page+1)+'/'+Math.ceil(st.menu.length/PAGE)+'.']:[])],options,page:st.page,totalPages:Math.ceil(st.menu.length/PAGE)});
  if(built){st.nativeMenu=built.mapping;st.nativePreview=built.interactive;}
  return result([...extra,...st.prompt,...(lines.length?[lines.join('\n')]:[]),...(nav.length?['Pág. '+(st.page+1)+'/'+Math.ceil(st.menu.length/PAGE)+'. Escriba '+nav.join(' o ')+'.']:[]),...hint],options,undefined,built?.interactive);
 }
 if(clicked&&selectedInput===null){
  if(st.menu?.length&&Array.isArray(st.prompt))return redraw(['Esa opción ya no está vigente. Elija nuevamente.']);
  return result(['Esa opción ya no está vigente. Escriba MENU para volver a la carta o NUEVO PEDIDO si ya envió una solicitud.']);
 }
 const pageOptions=()=>st.menu.slice(st.page*PAGE,(st.page+1)*PAGE);
 const selected=pageOptions()[number(input)-1]?.id;
 // The web is optional, never a prerequisite to place an order. The slug
 // comes from the verified commercial route, not the customer's text.
 if(!clicked&&['carta web','ver carta web','menu web','ver menu web'].includes(word)){
  const slug=publicSlug??sucursal?.slug;
  const note=typeof slug==='string'&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)&&slug.length<=120
   ? 'Puede consultar la carta web en https://gestlok.com.ar/chat/?s='+slug+'. Su pedido de WhatsApp sigue aquí; no se transfiere a la web.'
   : 'Puede continuar haciendo el pedido en este chat.';
  return st.menu?.length&&Array.isArray(st.prompt)?redraw([note]):result([note]);
 }
 if(word==='siguiente'&&(st.page+1)*PAGE<st.menu.length){st.page++;return redraw();}
 if(word==='anterior'&&st.page>0){st.page--;return redraw();}
 async function run(entrada,explicitQuantity,expectedProductId){
  // Always present a selector on WhatsApp (no ambiguous cart writes).
  const fake=typeof iaSimulada==='function'?{config:{proveedor:'openai',clave:'ficticia',url:'https://mock.invalid'},fetchImpl:iaSimulada}:{};
  const r=await previewWhatsApp({sucursal:{...sucursal,menu_interactivo:true},catalogo,privado,estado:st.engine,entrada,ahora,whatsappCategories:true,...fake});
  st.engine=r.estado??st.engine;
  const p=r.projection;
  if(p.pending.includes('derivacion_humana')||p.pending.some(x=>x==='accion_cancelar'||x==='accion_estado'||x==='accion_derivar')){
   st.stage='handoff';
   const detail=entrada.boton?(st.menu.find(o=>o.id===entrada.boton)?.label||entrada.boton):input;
   const response=show(['Consulta para atención del gerente. En esta simulación no se ha enviado al local. Escriba MENU para volver a la carta.'],[]);
   return {...response,action:{type:'simulated_handoff',idempotencyKey:event.id,detail,reason:clasificarSoporte(entrada)||'consulta'}};
  }
  if(p.pending.includes('formulario_datos')){st.stage='checkout';st.data={telefono:identity.phone};return checkout();}
  if(p.selectors.length){
   st.selectors=p.selectors;
   if(p.selectors.length===1)return startProduct(p.selectors[0],!expectedProductId||p.selectors[0].id===expectedProductId?explicitQuantity:undefined);
   st.stage='select_product';return show([...p.messages,'Elija un producto.'],p.selectors.map(x=>choice(x.id,x.label)));
  }
  st.stage='menu';
  const opts=p.options.map(o=>choice(o.id,o.label));
  if(st.engine.carrito.length){
   for(const b of botonesCarrito(st.engine.carrito))if(!opts.some(o=>o.id===b.id))opts.push(choice(b.id,b.texto));
   if(!opts.some(o=>o.id==='edit_cart'))opts.push(choice('edit_cart','Quitar un producto'));
  }
  return show(p.messages.length?p.messages:['Elija cómo continuar.'],opts);
 }
 function startProduct(p,explicitQuantity){
  st.product={offered:p,qty:p.quantity,choices:clone(p.preset||{}),group:0,flavor:null,lot:globalThis.crypto.randomUUID()};
  // Explicit quantities are still reviewed, with the same required option and
  // stock/price validation as a product chosen in individual steps.
  if(Number.isInteger(explicitQuantity)&&explicitQuantity>=1&&explicitQuantity<=50){st.product.qty=explicitQuantity;return productStep();}
  st.stage='quantity';return show([p.label+'. ¿Cuántas unidades quiere? Elija o escriba una cantidad de 1 a 50. Sugerida: '+p.quantity+'.'],[1,2,3].map(n=>choice(String(n),String(n)+' unidad'+(n===1?'':'es'))));
 }
 function productStep(){
  const p=st.product,g=p.offered.groups[p.group];
  if(!g){
   st.stage='product_review';
   const line={producto_id:p.offered.id,cantidad:p.qty,opciones:p.choices};
   const validation=completePreviewProduct({projection:{selectors:[p.offered]},catalogo:c,selection:{productId:p.offered.id,quantity:p.qty,options:p.choices},lotId:p.lot});
   if(!validation.ok){st.stage='menu';delete st.product;delete st.engine.promo_reemplazo;return show([validation.error,'Vuelva a elegir el producto.'],[choice('carta','Ver carta')]);}
   return show(['Revisar: '+describirLinea(c,line),'Subtotal estimado: '+pesos(validation.estimatedTotal)], [choice('add','Agregar al pedido'),choice('restart','Volver a elegir'),choice('back','Cancelar selección')]);
  }
  const current=p.choices[g.id];
  if(!g.values.length&&(g.required||g.type==='cantidad'&&Number(g.total)>0)){
   st.stage='menu';delete st.product;delete st.engine.promo_reemplazo;
   return show(['Ese producto no tiene disponibles las variedades necesarias. Puede elegir otro.'],[choice('carta','Ver carta'),choice('carrito','Ver mi pedido')]);
  }
  if(g.type==='cantidad'){
   const done=Object.values(current||{}).reduce((sum,v)=>sum+(Number.isInteger(v)?v:0),0);
   if(done===Number(g.total)){p.group++;return productStep();}
   if(done>Number(g.total)){p.choices[g.id]={};return productStep();}
   st.stage='flavor';return show([g.label+': faltan '+(Number(g.total)-done)+' de '+g.total+'. Elija variedad.'],g.values.map(v=>choice(v.id,v.label+(v.extra?' (+'+pesos(v.extra)+')':''))));
  }
  const selectedIds=Array.isArray(current)?current:[];
  st.stage='group';const opts=g.values.filter(v=>!selectedIds.includes(v.id)).map(v=>choice('v:'+v.id,v.label+(v.extra?' (+'+pesos(v.extra)+')':'')));
  const max=g.type==='una'?1:Number(g.max);
  if(selectedIds.length>=max&&selectedIds.length>0){p.group++;return productStep();}
  if(!g.required||selectedIds.length)opts.push(choice('done','Continuar'));
  return show([g.label+(selectedIds.length?' · elegidas: '+selectedIds.map(id=>g.values.find(v=>v.id===id)?.label||id).join(', '):'')],opts);
 }
 function checkout(){
  const r=checkoutPreview({sucursal,catalogo,estado:st.engine,datos:st.data,ahora});
  if(r.stage==='review'){st.stage='menu';delete st.data;delete st.review;return show([r.message],[choice('carrito','Ver mi pedido'),choice('carta','Agregar más'),choice('finalizar','Volver a finalizar')]);}
  if(r.stage==='collect'){
   st.stage='checkout';st.field=r.field;delete st.review;
   const hint=r.field==='entrega'?[['También puede completar varios datos juntos (separe los campos con punto y coma):','datos: entrega=retiro; nombre=su nombre; pago=medio de pago','Para delivery use entrega=delivery, incluya dirección=calle y número; si paga en efectivo, abono=importe.'].join('\n')]:[];
   return show([r.message,...hint],r.options.map(o=>typeof o==='string'?choice(o,o==='envio'?'Delivery':'Retiro en el local'):choice(o.id,o.label)));
  }
  st.stage='confirm';st.review=snapshot(catalogo,sucursal,ahora,st.engine,st.data);
  return show(['Revise su pedido:',...st.engine.carrito.map(l=>'• '+describirLinea(c,l)+' · '+pesos(importeLinea(c,l))),
   'Productos (estimado, antes de descuentos): '+pesos(totalCarrito(c,st.engine.carrito)),
   ...(r.discount?['Descuento estimado: '+pesos(r.discount)]:[]),...(st.data.entrega==='envio'?['Envío estimado: '+pesos(r.delivery)]:[]),'Total estimado: '+pesos(r.estimatedTotal),
   'Entrega: '+(st.data.entrega==='envio'?'Delivery · el gerente debe validar costo y dirección':'Retiro en el local'),
   'Nombre: '+st.data.nombre,...(st.data.entrega==='envio'?['Dirección: '+st.data.direccion]:[]),
   'Medio de pago: '+(PAGOS[st.data.medio_pago]||st.data.medio_pago),...(st.data.efectivo_abona?['Abona con: '+pesos(Number(st.data.efectivo_abona))]:[]),r.message],
  [choice('confirm','Confirmar solicitud'),choice('edit_data','Modificar datos'),choice('back','Volver al carrito')]);
 }
 // A completed request remains immutable. Only an explicit new-order command
 // resets the local draft; the persisted event history is never reset.
 if(st.stage==='submitted'){
  if(word==='nuevo pedido'||word==='hacer otro pedido'||clicked&&selectedInput==='1'&&st.menu?.[0]?.id==='new_order'){
   const seen=st.seen;
   for(const k of Object.keys(st))delete st[k];
   Object.assign(st,{scope,engine:estadoInicial(),stage:'menu',seen,menu:[],page:0});
   return run({inicio:true});
  }
  if(isCourtesy(input))return result();
  return show(['La solicitud de prueba ya fue registrada. No se creó un pedido real. Para empezar otro, escriba NUEVO PEDIDO.'],[choice('new_order','Nuevo pedido')]);
 }
 if(st.stage==='handoff'&&word!=='menu'&&word!=='volver al menu')return isCourtesy(input)?result():show(['La consulta requiere atención del gerente. No se ha enviado al local en esta simulación. Escriba MENU para volver a la carta.'],[]);
 if(word==='hablar con el gerente'||word==='ayuda con mi pedido'||clasificarSoporte({texto:input})&&st.stage==='menu')return run({texto:input});
 if(word==='menu'||word==='volver al menu'){
  delete st.product;delete st.data;delete st.review;delete st.engine.promo_reemplazo;return run({boton:'carta'});
 }
 let quantities=['menu','select_product','flavor'].includes(st.stage)?parseQuantities(input):null;
 if(!quantities&&st.stage==='flavor'){
  const values=st.product.offered.groups[st.product.group].values;
  quantities=parseNamedQuantities(input,pageOptions().map((o,i)=>({number:i+1,label:values.find(v=>v.id===o.id)?.label||o.label})));
 }
 if(quantities){
  const invalid=()=>result(['Selección inválida. Use los números de esta página y cantidades válidas (ej.: 1x2). No se modificó el pedido.']);
  if(!quantities.ok)return invalid();
  const entries=quantities.entries.map(e=>({...e,id:pageOptions()[e.option-1]?.id}));
  if(entries.some(e=>!e.id))return invalid();
  if(st.stage==='flavor'){
   const p=st.product,g=p.offered.groups[p.group],current=p.choices[g.id]??{};
   const remain=Number(g.total)-Object.values(current).reduce((sum,v)=>sum+v,0);
   if(entries.some(e=>!g.values.some(v=>v.id===e.id))||entries.reduce((sum,e)=>sum+e.quantity,0)>remain)return invalid();
   const next={...current};for(const e of entries)next[e.id]=(next[e.id]||0)+e.quantity;
   p.choices[g.id]=next;return productStep();
  }
  if(entries.length!==1)return invalid();
  const {id,quantity}=entries[0];
  if(st.stage==='select_product'){
   const p=st.selectors.find(x=>x.id===id);return p?startProduct(p,quantity):invalid();
  }
  if(!id.startsWith('elegir:'))return invalid();
  return run({boton:id},quantity);
 }
 if(st.stage==='select_product'){
  const p=st.selectors.find(x=>x.id===selected);return p?startProduct(p):redraw();
 }
 if(st.stage==='quantity'){
  const qty=number(input);if(!Number.isInteger(qty)||qty>50)return result(['Indique una cantidad de 1 a 50.']);
  st.product.qty=qty;return productStep();
 }
 if(st.stage==='flavor'){
  const p=st.product,g=p.offered.groups[p.group];
  if(!g.values.some(v=>v.id===selected))return redraw();
  p.flavor=selected;st.stage='flavor_qty';
  const done=Object.values(p.choices[g.id]||{}).reduce((sum,v)=>sum+v,0);
  return show(['¿Cuántas de '+g.values.find(v=>v.id===selected).label+'? Faltan '+(g.total-done)+'. Elija o escriba la cantidad.'],Array.from({length:Math.min(3,g.total-done)},(_,i)=>choice(String(i+1),String(i+1))));
 }
 if(st.stage==='flavor_qty'){
  const p=st.product,g=p.offered.groups[p.group],current=p.choices[g.id]??{};
  const qty=number(input),remain=Number(g.total)-Object.values(current).reduce((sum,v)=>sum+v,0);
  if(!Number.isInteger(qty)||qty>remain)return result(['Cantidad inválida. Faltan '+remain+'.']);
  p.choices[g.id]={...current,[p.flavor]:(current[p.flavor]||0)+qty};return productStep();
 }
 if(st.stage==='group'){
  const p=st.product,g=p.offered.groups[p.group];
  if(selected==='done'){p.group++;return productStep();}
  if(!selected?.startsWith('v:'))return redraw();
  const id=selected.slice(2);if(!g.values.some(v=>v.id===id))return redraw();
  p.choices[g.id]=[...(p.choices[g.id]||[]),id];return productStep();
 }
 if(st.stage==='product_review'){
  if(selected==='restart')return startProduct(st.product.offered);
  if(selected==='back'){delete st.product;delete st.engine.promo_reemplazo;return run({boton:'carrito'});}
  if(selected!=='add')return redraw();
  const p=st.product,validation=completePreviewProduct({projection:{selectors:[p.offered]},catalogo:c,selection:{productId:p.offered.id,quantity:p.qty,options:p.choices},lotId:p.lot});
  delete st.product;
  if(!validation.ok){st.stage='menu';delete st.engine.promo_reemplazo;return show([validation.error],[choice('carta','Ver carta'),choice('carrito','Ver mi pedido')]);}
  return run(validation.entry);
 }
 if(st.stage==='remove'){
  if(selected==='back')return run({boton:'carrito'});
  if(!selected?.startsWith('remove:'))return redraw();
  return run({quitar:Number(selected.slice(7))});
 }
 if(st.stage==='checkout'){
  const field=st.field, data=st.data;
  const batch=parseCheckoutData(input);
  if(batch){
   const invalid=()=>result(['Datos inválidos. Use datos: entrega=retiro; nombre=su nombre; pago=medio de pago. No se modificaron sus datos.']);
   if(!batch.ok)return invalid();
   const next={...data};
   if(batch.data.entrega&&batch.data.entrega!==data.entrega){delete next.direccion;delete next.medio_pago;delete next.efectivo_abona;}
   if(batch.data.medio_pago&&batch.data.medio_pago!==next.medio_pago)delete next.efectivo_abona;
   Object.assign(next,batch.data);
   const allowedDelivery=[...(a.sucursal.acepta_retiro?['retiro']:[]),...(a.sucursal.acepta_envio?['envio']:[])];
   if(next.entrega&&!allowedDelivery.includes(next.entrega))return invalid();
   if(batch.data.medio_pago&&next.entrega&&(!pagosDe(a.sucursal,next.entrega).includes(next.medio_pago)||soloEfectivo(c,st.engine.carrito)&&next.medio_pago!=='efectivo'))return invalid();
   if(next.entrega==='retiro'){delete next.direccion;delete next.efectivo_abona;}
   if(next.medio_pago&&next.medio_pago!=='efectivo')delete next.efectivo_abona;
   st.data=next;return checkout();
  }
  if(st.menu.length&&!selected)return redraw();
  if(field==='efectivo_abona'&&!selected)data[field]=normalizeCash(input);
  else data[field]=selected??input;return checkout();
 }
 if(st.stage==='confirm'){
  if(selected==='edit_data'){st.data={telefono:identity.phone};return checkout();}
  if(selected==='back'){delete st.data;delete st.review;return run({boton:'carrito'});}
  if(selected!=='confirm')return redraw();
  // Revalidate catalogue, checkout, prices, business rules and reviewed fields.
  if(st.review!==snapshot(catalogo,sucursal,ahora,st.engine,st.data))return checkout();
  const r=checkoutPreview({sucursal,catalogo,estado:st.engine,datos:st.data,confirmed:true,ahora});
  if(r.stage!=='preview_order')return checkout();
  st.stage='submitted';st.menu=[];st.prompt=[];delete st.review;delete st.data;delete st.field;
  return {...show([r.message],[choice('new_order','Nuevo pedido')]),action:{type:'simulated_order',idempotencyKey:event.id,pedido:r.action.pedido}};
 }
 if(selected==='edit_cart'){st.stage='remove';return show(['Elija una línea para quitar.'],[...st.engine.carrito.map((l,i)=>choice('remove:'+i,describirLinea(c,l))),choice('back','Volver')]);}
 if(selected)return run({boton:selected});
 if(Number.isInteger(number(input))&&st.menu.length)return redraw();
 if(!session&&(!input||/^(hola|buenas|buen dia|buenos dias|buenas tardes|buenas noches)[!. ]*$/.test(word)))return run({inicio:true});
 // Use an explicitly stated quantity only for an exact, unambiguous catalogue
 // name, and only if the shared motor returns the same single product.
 const named=/^([1-9]\d?)\s+(?:de\s+)?(.+)$/i.exec(input);
 if(st.stage==='menu'&&named&&Number(named[1])<=50){
  const matches=(c.productos||[]).filter(p=>p.activo!==false&&p.disponible!==false&&normalizar(p.nombre)===normalizar(named[2]));
  if(matches.length===1)return run({texto:input},Number(named[1]),matches[0].id);
 }
 return run({texto:input});
}



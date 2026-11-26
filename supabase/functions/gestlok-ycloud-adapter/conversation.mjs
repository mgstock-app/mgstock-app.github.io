// Offline pilot: a deterministic, serializable conversation. No calls to YCloud,
// Supabase or paid providers. State and event identity must be provided by a
// verified, tenant-bound transport; this module is not an HTTP endpoint.
import {previewWhatsApp,completePreviewProduct,checkoutPreview} from './preview.mjs';
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
export async function conversationPreview({identity,sucursal,catalogo,privado={},session,event,iaSimulada,ahora=new Date()}){
 if(!identity||!['empresa','sucursal','phone'].every(k=>typeof identity[k]==='string'&&identity[k].length>0)||!/^\+[1-9]\d{7,14}$/.test(identity.phone))throw Error('Identidad de piloto inválida');
 if(!event||typeof event.id!=='string'||!event.id||event.id.length>200||typeof event.text!=='string'||event.text.length>600)throw Error('Evento inválido');
 const scope=JSON.stringify([identity.empresa,identity.sucursal,identity.phone]);
 if(session&&session.scope!==scope)throw Error('Sesión de otra conversación');
 const st=session?clone(session):{scope,engine:estadoInicial(),stage:'menu',seen:[],menu:[],page:0};
 const result=(messages=[],options=[],action)=>({session:st,messages,options,sendAllowed:false,...(action?{action}: {})});
 // Bounded memory only; a durable transport must deduplicate ALL events atomically.
 if(st.seen.includes(event.id))return {...result(),duplicate:true};
 st.seen=[...st.seen.slice(-255),event.id];
 const input=clean(event.text), word=normalizar(input);
 const a=carteleraDelDia(sucursal,catalogo,ahora), c=a.catalogo;
 function show(messages,options=[],page=0){
  st.menu=options;st.page=Math.min(Math.max(0,page),Math.max(0,Math.ceil(options.length/PAGE)-1));st.prompt=messages;
  return redraw();
 }
 function redraw(){
  const options=st.menu.slice(st.page*PAGE,(st.page+1)*PAGE).map((o,i)=>({...o,number:i+1}));
  const nav=[];
  if(st.page>0)nav.push('Anterior');
  if((st.page+1)*PAGE<st.menu.length)nav.push('Siguiente');
  const lines=options.map(o=>o.number+'. '+o.label);
  return result([...st.prompt,...(lines.length?[lines.join('\n')]:[]),...(nav.length?['Pág. '+(st.page+1)+'/'+Math.ceil(st.menu.length/PAGE)+'. Escriba '+nav.join(' o ')+'.']:[])],options);
 }
 const selected=st.menu.slice(st.page*PAGE,(st.page+1)*PAGE)[number(input)-1]?.id;
 if(word==='siguiente'&&(st.page+1)*PAGE<st.menu.length){st.page++;return redraw();}
 if(word==='anterior'&&st.page>0){st.page--;return redraw();}
 async function run(entrada){
  // Always present a selector on WhatsApp (no ambiguous cart writes).
  const fake=typeof iaSimulada==='function'?{config:{proveedor:'openai',clave:'ficticia',url:'https://mock.invalid'},fetchImpl:iaSimulada}:{};
  const r=await previewWhatsApp({sucursal:{...sucursal,menu_interactivo:true},catalogo,privado,estado:st.engine,entrada,ahora,...fake});
  st.engine=r.estado??st.engine;
  const p=r.projection;
  if(p.pending.includes('derivacion_humana')||p.pending.some(x=>x==='accion_cancelar'||x==='accion_estado'||x==='accion_derivar')){
   st.stage='handoff';return show(['Consulta para atención del gerente. En esta simulación no se ha enviado al local.'],[]);
  }
  if(p.pending.includes('formulario_datos')){st.stage='checkout';st.data={telefono:identity.phone};return checkout();}
  if(p.selectors.length){
   st.selectors=p.selectors;
   if(p.selectors.length===1)return startProduct(p.selectors[0]);
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
 function startProduct(p){
  st.product={offered:p,qty:p.quantity,choices:clone(p.preset||{}),group:0,flavor:null,lot:globalThis.crypto.randomUUID()};
  st.stage='quantity';return show([p.label+'. ¿Cuántas unidades quiere? Escriba una cantidad de 1 a 50. Sugerida: '+p.quantity+'.']);
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
   return show([r.message],r.options.map(o=>typeof o==='string'?choice(o,o==='envio'?'Delivery':'Retiro en el local'):choice(o.id,o.label)));
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
 if(st.stage==='submitted')return show(['La solicitud de prueba ya fue registrada en esta conversación. No se creó un pedido real.'],[]);
 if(st.stage==='handoff')return show(['La consulta requiere atención del gerente. No se ha enviado al local en esta simulación.'],[]);
 if(word==='hablar con el gerente'||word==='ayuda con mi pedido'||clasificarSoporte({texto:input})&&st.stage==='menu')return run({texto:input});
 if(word==='menu'||word==='volver al menu'){
  delete st.product;delete st.data;delete st.review;delete st.engine.promo_reemplazo;return run({boton:'carta'});
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
  return show(['¿Cuántas de '+g.values.find(v=>v.id===selected).label+'? Faltan '+(g.total-done)+'.']);
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
  if(st.menu.length&&!selected)return redraw();
  if(field==='efectivo_abona'&&!selected)data[field]=input.replace(/^\$\s*/, '').replace(/^(\d{1,3}(?:\.\d{3})+)(,\d{1,2})?$/,(_,whole,decimal='')=>whole.replaceAll('.','')+decimal.replace(',','.')).replace(',','.');
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
  return result([r.message],[],{type:'simulated_order',idempotencyKey:event.id,pedido:r.action.pedido});
 }
 if(selected==='edit_cart'){st.stage='remove';return show(['Elija una línea para quitar.'],[...st.engine.carrito.map((l,i)=>choice('remove:'+i,describirLinea(c,l))),choice('back','Volver')]);}
 if(selected)return run({boton:selected});
 if(Number.isInteger(number(input))&&st.menu.length)return redraw();
 if(!session&&(!input||/^(hola|buenas|buen dia|buenos dias|buenas tardes|buenas noches)[!. ]*$/.test(word)))return run({inicio:true});
 return run({texto:input});
}

/* El Molino Café: tablero compartido exclusivamente para sus dos sucursales.
   Todas las mutaciones y roles se validan nuevamente mediante RPC / RLS.
   No usar documentos de otra empresa ni conceder permisos por controles UI. */
(()=>{
'use strict';
const TENANT='6c8717ea-5f78-426b-9458-74a5dcac6e4e';
const money=n=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:2}).format(Number(n||0));
const escapeHTML=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtDate=s=>{if(!s)return '';const a=String(s).slice(0,10).split('-');return a.length===3?a.reverse().join('/'):String(s);};
const fmtQty=n=>new Intl.NumberFormat('es-AR',{maximumFractionDigits:3}).format(Number(n||0));
const localDay=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
let api=null,opened=false,section='precios',state=null,historyData=null,orderState=null,orderMode='realizar',orderDraft=[],selectedDay='',historyMode='diario',monthlyData=null,selectedMonth=localDay().slice(0,7),busy=false,fetching=false,warning='',message='',editPrice=null,editMove=null,channel=null,timer=null,stale=false,priorFocus=null;
const $=s=>document.querySelector(s);
const hasTenant=()=>api?.S?.me?.tenant_id===TENANT;
const role=()=>state?.scope||'none';
// La vista respeta la sucursal activa incluso para administradores y dueños.
// Los permisos reales siguen verificándose en las RPC del servidor.
const ACASSUSO='loc-6c8717ea5f78426b9458';
const SAN_ISIDRO='loc-6c8717ea5f78426b9458-si';
const activeBranch=()=>{
 const loc=api?.S?.local;
 if(loc===ACASSUSO||loc==='acassuso')return 'acassuso';
 if(loc===SAN_ISIDRO||loc==='san_isidro')return 'san_isidro';
 return role()==='acassuso'?'acassuso':role()==='san_isidro'?'san_isidro':null;
};
const canPrices=()=>['admin','dueno','san_isidro'].includes(role())&&activeBranch()!=='acassuso';
const canSend=()=>['admin','dueno','san_isidro'].includes(role())&&activeBranch()!=='acassuso';
const canReturn=()=>['admin','dueno','acassuso'].includes(role())&&activeBranch()!=='san_isidro';
const canAckSent=()=>['admin','dueno','acassuso'].includes(role());
const canAckReturned=()=>['admin','dueno','san_isidro'].includes(role());
const canOrder=()=>['admin','dueno','acassuso'].includes(role())&&activeBranch()!=='san_isidro';
const canOrderAck=()=>['admin','dueno','san_isidro'].includes(role())&&activeBranch()!=='acassuso';
const canEdit=k=>k==='envio'?canSend():canReturn();
const scopeName=()=>({admin:'Administración general · ambos locales',dueno:'Dueño · ambos locales',san_isidro:'Gerente · San Isidro',acassuso:'Gerente · Acassuso'})[role()]||'Verificando acceso';
function css(){
 if(document.getElementById('gl-molino-css'))return;
 const l=document.createElement('link');l.id='gl-molino-css';l.rel='stylesheet';l.href='/stock/gestlok-molino.css?rev=devoluciones33-20261108';document.head.appendChild(l);
}
function homeTile(){
 if(!hasTenant()||!['creadora','dueno','gerente'].includes(api?.role?.()))return '';
 return '<section class="gl-molino-home" aria-label="Vínculo entre San Isidro y Acassuso">'+
  '<div class="gl-molino-home-head"><span class="gl-molino-home-symbol" aria-hidden="true">⇄</span><div><small>EL MOLINO CAFÉ · DOS SUCURSALES</small><h2>Vínculo entre sucursales</h2>'+
  '<p>San Isidro envía, Acassuso recibe. Todo queda registrado y actualizado en vivo.</p></div></div>'+
  '<div class="gl-molino-home-actions">'+
  '<button type="button" data-mol-open="precios">◈ <span>Precios</span></button>'+
  '<button type="button" data-mol-open="pedidos">▤ <span>Pedidos</span></button>'+ 
  '<button type="button" data-mol-open="envios">▣ <span>Productos enviados</span></button>'+
  '<button type="button" data-mol-open="devoluciones">↩ <span>Devoluciones</span></button>'+
  '<button type="button" data-mol-open="historial">▤ <span>Historial</span></button>'+
  '</div></section>';
}
// Menú lateral de El Molino Café: solo su microapp (pedido 08/11/2026).
// Dueño, gerentes y creadora ven las mismas entradas; cada acción se valida en el servidor.
const NAV=[
 ['precios','Precios','<path d="M20 12 12 20 4 12V4h8z"/><circle cx="8.5" cy="8.5" r="1.5"/>'],
 ['pedidos','Pedidos','<path d="M4 4h16v16H4zM8 9h8M8 13h8M8 17h5"/>'],
 ['envios','Productos enviados','<path d="M3 7h11v9H3zM14 10h4l3 3v3h-7z"/><circle cx="7" cy="18" r="1.6"/><circle cx="17" cy="18" r="1.6"/>'],
 ['devoluciones','Devoluciones','<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>'],
 ['historial','Historial','<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>']
];
function navHTML(){
 if(!hasTenant())return '';
 return '<p class="snav-group gl-molino-navgroup">Vínculo entre sucursales</p>'+
  NAV.map(([id,label,d])=>'<button type="button" data-mol-open="'+id+'" data-mol-nav="'+id+'"><svg class="i" viewBox="0 0 24 24" aria-hidden="true">'+d+'</svg><span class="nl">'+label+'</span></button>').join('');
}
const sectionName=()=>opened?(NAV.find(x=>x[0]===section)||[])[1]||'':'';
function mount(){
 css();
 if($('#gl-molino-panel'))return;
 const node=document.createElement('div');node.id='gl-molino-panel';
 node.className='gl-molino-backdrop';node.setAttribute('role','presentation');
 document.body.appendChild(node);document.body.classList.add('gl-molino-open');
}
function unmount(){
 opened=false;state=null;historyData=null;monthlyData=null;orderState=null;orderDraft=[];editPrice=null;editMove=null;stale=false;
 if(timer){clearInterval(timer);timer=null;}
 if(channel&&window.GestLokSupabase?.removeChannel)try{window.GestLokSupabase.removeChannel(channel);}catch{}
 channel=null;$('#gl-molino-panel')?.remove();document.body.classList.remove('gl-molino-open');
 try{priorFocus?.focus?.();}catch{}priorFocus=null;
}
async function rpc(name,args){
 if(!hasTenant()||!window.GestLokSupabase)throw Error('Ingresá a El Molino Café con tu cuenta autorizada.');
 if(typeof navigator!=='undefined'&&navigator.onLine===false)throw Error('Necesitás conexión para sincronizar entre sucursales.');
 const r=await window.GestLokSupabase.rpc(name,args||{});
 if(r.error)throw r.error;
 return r.data;
}
async function reload(silent=false){
 if(!opened||fetching||busy)return;
 fetching=true;if(!silent)warning='';
 try{
  const result=await rpc('gestlok_molino_state');
  const nextOrders=section==='pedidos'?await rpc('gestlok_molino_orders_state'):orderState;
  if(!opened)return;
  if(!result||!['admin','dueno','san_isidro','acassuso'].includes(result.scope))throw Error('Sin autorización.');
  // Nunca interrumpir los formularios mientras el gerente está escribiendo.
  if(silent&&$('#gl-molino-panel form:focus-within, #gl-molino-panel input[data-mol-ack-note]:focus, #gl-molino-panel textarea[data-mol-ack-note]:focus')){
    stale=true;const b=$('#gl-molino-updated');if(b)b.hidden=false;return;
  }
  state=result;orderState=nextOrders;stale=false;render();
 }catch(e){if(opened){warning=e?.message||'No se pudieron cargar los datos.';render();}}
 finally{fetching=false;}
}
function watch(){
 if(timer||!opened)return;
 timer=setInterval(()=>{if(!opened)return;void reload(true);},12000);
 const client=window.GestLokSupabase;
 if(!client?.channel)return;
 try{
  channel=client.channel('gestlok-molino-'+TENANT+'-'+Math.random().toString(36).slice(2))
    .on('postgres_changes',{event:'*',schema:'public',table:'gestlok_molino_prices'},()=>void reload(true))
    .on('postgres_changes',{event:'*',schema:'public',table:'gestlok_molino_movements'},()=>void reload(true))
    .on('postgres_changes',{event:'*',schema:'public',table:'gestlok_molino_daily_archive'},()=>void reload(true))
    .on('postgres_changes',{event:'*',schema:'public',table:'gestlok_molino_orders'},()=>void reload(true))
    .subscribe();
 }catch{channel=null;}
}
function begin(tab){
 if(!hasTenant())return;
 priorFocus=document.activeElement;
 opened=true;historyMode='diario';monthlyData=null;selectedMonth=localDay().slice(0,7);section=['precios','pedidos','envios','devoluciones','historial'].includes(tab)?tab:'precios';
 warning='';message='';state=null;historyData=null;orderState=null;orderMode='realizar';orderDraft=[];editPrice=null;editMove=null;
 mount();render();void reload();watch();window.GestLokSupport?.render?.();
 setTimeout(()=>$('#gl-molino-close')?.focus(),0);
}
function tabs(){
 return [['precios','Precios'],['pedidos','Pedidos'],['envios','Productos enviados'],['devoluciones','Devoluciones'],['historial','Historial']].map(x=>
  '<button type="button" role="tab" aria-selected="'+(section===x[0])+'" class="'+(section===x[0]?'active':'')+'" data-mol-tab="'+x[0]+'">'+x[1]+'</button>'
 ).join('');
}
function priceForm(){
 if(!canPrices())return '<p class="gl-molino-tip">San Isidro administra la lista. Acassuso ve los mismos precios en tiempo real, sin modificar.</p>';
 const p=editPrice?(state?.prices||[]).find(x=>x.id===editPrice):null;
 return '<form id="gl-molino-price-form" class="gl-molino-form">'+
  '<label>Producto<input name="product" maxlength="140" autocomplete="off" placeholder="Nombre del producto" value="'+escapeHTML(p?.product||'')+'" required></label>'+
  '<label>Precio venta ($)<input name="amount" type="number" min="0" max="999999999" step=".01" inputmode="decimal" value="'+escapeHTML(p?.amount??'')+'" placeholder="0,00" required></label>'+
  '<label>Precio por<select name="basis" aria-label="Base de precio"><option value="unidad" '+((p?.price_basis||'unidad')==='unidad'?'selected':'')+'>Unidad</option><option value="kg" '+(p?.price_basis==='kg'?'selected':'')+'>Kilo (kg)</option></select></label>'+
  '<button type="submit" class="gl-molino-main-btn">'+(p?'Guardar cambio':'Agregar precio')+'</button>'+
  (p?'<button type="button" data-mol-cancel="price" class="gl-molino-cancel">Cancelar</button>':'')+
  '</form>';
}
function prices(){
 const records=state?.prices||[];
 return '<div class="gl-molino-section-title"><h3>Precios compartidos</h3><p>San Isidro carga el producto y su precio. Acassuso visualiza la misma lista en vivo.</p></div>'+
 priceForm()+
 '<div class="gl-molino-count">'+records.length+' productos en la lista</div>'+
 (records.length?'<div class="gl-molino-tablewrap"><table class="gl-molino-table"><thead><tr><th>Producto</th><th>Precio</th><th>Último cambio</th>'+(canPrices()?'<th>Acciones</th>':'')+'</tr></thead><tbody>'+
 records.map(p=>'<tr><td><strong>'+escapeHTML(p.product)+'</strong></td><td class="gl-molino-money">'+money(p.amount)+' / '+(p.price_basis==='kg'?'kg':'unidad')+'</td><td>'+fmtDate(p.updated_at)+'</td>'+
 (canPrices()?'<td><div class="gl-molino-row-actions"><button type="button" data-mol-price-edit="'+escapeHTML(p.id)+'">Editar</button><button type="button" class="warn" data-mol-price-remove="'+escapeHTML(p.id)+'" data-name="'+escapeHTML(p.product)+'">Quitar</button></div></td>':'')+
 '</tr>').join('')+'</tbody></table></div>':'<p class="gl-molino-empty">Todavía no se cargaron productos ni precios.</p>');
}
function movementForm(kind){
 if(state?.closed)return '<p class="gl-molino-note">El día cerró a las 23:59. El registro de hoy ya está en el historial.</p>';
 if(!canEdit(kind))return '<p class="gl-molino-tip">'+(kind==='envio'?'Acassuso visualiza los envíos y confirma cada producto recibido.':'San Isidro ve las devoluciones y confirma cada producto recibido.')+'</p>';
 const p=editMove?(state?.[kind==='envio'?'envios':'devoluciones']||[]).find(x=>x.id===editMove):null;
 const isReturn=kind==='devolucion';
 return '<form id="gl-molino-movement-form-'+kind+'" data-mol-movement-form data-kind="'+kind+'" class="gl-molino-form">'+
 '<label>Producto<input name="product" list="gl-molino-products" maxlength="140" autocomplete="off" placeholder="Nombre del producto" value="'+escapeHTML(p?.product||'')+'" required></label>'+
 '<label>Cantidad<input type="number" name="quantity" min=".001" max="999999" step="'+(isReturn?'.001':'.01')+'" inputmode="decimal" placeholder="'+(isReturn?'Ej. 9.500':'0')+'" value="'+escapeHTML(p?.quantity??'')+'" required></label>'+
 (isReturn?'<label>Unidad<select name="unit" aria-label="Unidad de devolución"><option value="unidad" '+((p?.unit||'unidad')==='unidad'?'selected':'')+'>Unidades</option><option value="kg" '+(p?.unit==='kg'?'selected':'')+'>Kilos (kg)</option><option value="g" '+(p?.unit==='g'?'selected':'')+'>Gramos (g)</option></select></label>':'')+
 (isReturn?'<label class="gl-molino-full">Observación opcional<textarea name="note" maxlength="1000" rows="2" placeholder="Estado del producto, motivo, etc.">'+escapeHTML(p?.note||'')+'</textarea></label>':'')+
 '<button type="submit" class="gl-molino-main-btn">'+(p?'Guardar cambio':isReturn?'Agregar devolución':'Agregar envío')+'</button>'+
 (p?'<button type="button" data-mol-cancel="movement" class="gl-molino-cancel">Cancelar</button>':'')+
 '</form>';
}
function movementItem(m,kind,fromHistory=false){
 const isSent=kind==='envio';
 const ok=!!m.acknowledged_at;
 const canAck=(isSent?canAckSent():canAckReturned())&&!fromHistory&&!state?.closed&&!ok;
 const canChange=canEdit(kind)&&!fromHistory&&!state?.closed&&!ok;
 const label=isSent?'Recibido por Acassuso':'Recibido por San Isidro';
 return '<article class="gl-molino-item'+(ok?' is-confirmed':'')+'">'+
 '<div class="gl-molino-item-top"><div><strong>'+escapeHTML(m.product)+'</strong><small>Cantidad: <b>'+fmtQty(m.quantity)+' '+(kind==='devolucion'?(m.unit==='g'?'g':m.unit==='kg'?'kg':'unidades'):'')+'</b></small></div>'+
 '<span class="gl-molino-status '+(ok?'ok':'pending')+'">'+(ok?'✓ OK · '+label:'Pendiente de recepción')+'</span></div>'+
 (kind==='devolucion'&&m.net_total!=null?'<div class="gl-molino-return-metrics"><span>Precio: <b>'+money(m.unit_price)+' / '+(m.price_basis==='kg'?'kg':'unidad')+'</b></span><span>Venta: <b>'+money(m.gross_total)+'</b></span><span>Desc. 33%: <b>−'+money(m.discount_amount)+'</b></span><span>Resultante: <b>'+money(m.net_total)+'</b></span></div>':'')+
 (m.note?'<p class="gl-molino-comment"><b>Observación de Acassuso:</b> '+escapeHTML(m.note)+'</p>':'')+
 (m.acknowledgement_note?'<p class="gl-molino-comment"><b>Observación al recibir:</b> '+escapeHTML(m.acknowledgement_note)+'</p>':'')+
 (canChange?'<button type="button" class="gl-molino-inline" data-mol-move-edit="'+escapeHTML(m.id)+'" data-kind="'+kind+'">Editar detalle</button>':'')+
 (canAck?'<div class="gl-molino-ack"><label>Observación al recibir (opcional)<input data-mol-ack-note="'+escapeHTML(m.id)+'" maxlength="1000" placeholder="Escribí una observación si necesitás" value="'+escapeHTML(m.acknowledgement_note||'')+'"></label><div class="gl-molino-ack-actions">'+(isSent?'<button type="button" class="gl-molino-note-btn" data-mol-note="'+escapeHTML(m.id)+'">Guardar observación</button>':'')+'<button type="button" class="gl-molino-ack-btn" data-mol-ack="'+escapeHTML(m.id)+'">✓ Marcar OK</button></div></div>':'')+
 (ok?'<p class="gl-molino-confirmed-note">Confirmación registrada y compartida en ambos locales.</p>':'')+
 '</article>';
}

function returnLedger(records,caption='Cuadro de devoluciones'){
 const items=records||[];
 const gross=items.reduce((total,x)=>total+Number(x.gross_total||0),0);
 const discount=items.reduce((total,x)=>total+Number(x.discount_amount||0),0);
 const net=items.reduce((total,x)=>total+Number(x.net_total||0),0);
 const missing=items.filter(x=>x.net_total==null).length;
 return '<section class="gl-molino-return-ledger" aria-label="'+escapeHTML(caption)+'"><h4>'+escapeHTML(caption)+'</h4>'+
  '<div class="gl-molino-return-totals"><span>Venta: <b>'+money(gross)+'</b></span>'+
   '<span>Descuento 33%: <b>−'+money(discount)+'</b></span>'+
   '<span>Importe resultante: <b>'+money(net)+'</b></span></div>'+
  (missing?'<p class="gl-molino-tip">'+missing+' registros antiguos sin precio consolidado. No se les asignó un importe inventado.</p>':'')+
  (items.length?'<div class="gl-molino-tablewrap"><table class="gl-molino-table"><thead><tr>'+
   '<th>Producto</th><th>Cantidad</th><th>Precio venta</th><th>Venta</th><th>Desc. 33%</th><th>Resultante</th><th>Estado</th>'+
   '</tr></thead><tbody>'+items.map(x=>'<tr>'+
   '<td><strong>'+escapeHTML(x.product)+'</strong></td>'+
   '<td>'+fmtQty(x.quantity)+' '+(x.unit==='kg'?'kg':x.unit==='g'?'g':'unid.')+'</td>'+
   '<td>'+(x.unit_price!=null?money(x.unit_price)+' / '+(x.price_basis==='kg'?'kg':'unid.'):'Pendiente')+'</td>'+
   '<td>'+(x.gross_total!=null?money(x.gross_total):'—')+'</td>'+
   '<td>'+(x.discount_amount!=null?'−'+money(x.discount_amount):'—')+'</td>'+
   '<td><b>'+(x.net_total!=null?money(x.net_total):'—')+'</b></td>'+
   '<td>'+(x.acknowledged_at?'✓ OK':'Pendiente')+'</td></tr>').join('')+'</tbody></table></div>':
   '<p class="gl-molino-empty">Todavía no hay devoluciones en este período.</p>')+'</section>';
}
function monthView(){
 const data=monthlyData;
 let html='<div class="gl-molino-section-title"><h3>Resumen mensual de devoluciones</h3>'+
  '<p>Conciliación entre Acassuso y San Isidro. Detalle por producto y totales de cada día; precios congelados al registrar.</p></div>'+
  '<label class="gl-molino-month-label">Mes <input type="month" id="gl-molino-month" value="'+escapeHTML(selectedMonth)+'" min="2026-11" max="'+escapeHTML(localDay().slice(0,7))+'"></label>';
 if(!data||data.month!==selectedMonth)return html+'<p class="gl-molino-tip" role="status">Cargando resumen del mes…</p>';
 html+='<div class="gl-molino-return-totals gl-molino-month-totals">'+
  '<span>Venta: <b>'+money(data.gross)+'</b></span>'+
  '<span>Descuento 33%: <b>−'+money(data.discount)+'</b></span>'+
  '<span>Importe resultante: <b>'+money(data.net)+'</b></span>'+
  '<span>Productos devueltos: <b>'+Number(data.total_items||0)+'</b></span></div>';
 if(data.unpriced_items)html+='<p class="gl-molino-tip">'+data.unpriced_items+' movimientos anteriores no tienen valoración; los totales no los incluyen.</p>';
 if(!(data.days||[]).length)return html+'<p class="gl-molino-empty">Sin devoluciones en el mes seleccionado.</p>';
 return html+(data.days||[]).slice().reverse().map(d=>
  '<section class="gl-molino-month-day"><h4>'+fmtDate(d.day)+' · '+Number(d.items||0)+' productos</h4>'+
  returnLedger((d.details||[]).map(x=>({...x,gross_total:x.gross,discount_amount:x.discount,net_total:x.net})),
  'Detalle del '+fmtDate(d.day))+
  '</section>').join('');
}
async function loadMonth(month=selectedMonth){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))return;
 selectedMonth=month;monthlyData=null;warning='';render();
 try{
  const data=await rpc('gestlok_molino_returns_month',{p_month:month});
  if(opened&&selectedMonth===month){monthlyData=data;render();}
 }catch(e){warning=e?.message||'No se pudo cargar el resumen mensual.';render();}
}

function movements(kind){
 const sent=kind==='envio';
 const records=state?.[sent?'envios':'devoluciones']||[];
 return '<div class="gl-molino-section-title"><h3>'+(sent?'Productos enviados · San Isidro → Acassuso':'Devoluciones · Acassuso → San Isidro')+'</h3>'+
 '<p>'+(sent?'San Isidro carga producto y cantidad. Acassuso confirma cada unidad de la lista por separado.':'Acassuso carga producto, cantidad y observación. San Isidro confirma la recepción de cada renglón.')+'</p></div>'+
 '<div class="gl-molino-dailybar"><span>Fecha del movimiento: <b>'+fmtDate(state?.day)+'</b></span><span>'+records.length+' productos · '+records.filter(m=>m.acknowledged_at).length+' con OK</span></div>'+
 movementForm(kind)+
 (!sent?returnLedger(records,'Cuadro diario de devoluciones · '+fmtDate(state?.day)):'')+
 (records.length?'<div class="gl-molino-items">'+records.map(x=>movementItem(x,kind)).join('')+'</div>':sent?'<p class="gl-molino-empty">Sin envíos registrados hoy.</p>':'');
}

function orderGroups(){
 const groups=new Map();
 for(const item of orderState?.orders||[]){
  const id=String(item.request_id||item.id);
  if(!groups.has(id))groups.set(id,[]);
  groups.get(id).push(item);
 }
 return [...groups.values()];
}
function ordersView(){
 if(!orderState)return '<p class="gl-molino-empty" role="status">Consultando los pedidos de Acassuso a San Isidro…</p>';
 const sender=canOrder(),receiver=canOrderAck();
 const subnav='<div class="gl-molino-order-tabs" role="tablist" aria-label="Pedidos entre sucursales">'+
  [['realizar','Realizar pedido'],['seguimiento','Seguimiento']].map(([id,label])=>
   '<button type="button" role="tab" aria-selected="'+(orderMode===id)+'" class="'+(orderMode===id?'active':'')+'" data-mol-order-mode="'+id+'">'+label+'</button>').join('')+'</div>';
 const draft=orderDraft.length?'<section class="gl-molino-order-draft" aria-label="Pedido en preparación"><h4>Pedido en preparación · '+orderDraft.length+' productos</h4>'+
  orderDraft.map((item,i)=>'<div class="gl-molino-order-draft-row"><span><b>'+escapeHTML(item.product)+'</b> · '+fmtQty(item.quantity)+
   (item.note?'<small>'+escapeHTML(item.note)+'</small>':'')+'</span><button type="button" data-mol-order-remove="'+i+'" aria-label="Quitar '+escapeHTML(item.product)+'">Quitar</button></div>').join('')+
  '<button type="button" class="gl-molino-main-btn" data-mol-order-send '+(busy?'disabled':'')+'>Enviar pedido a San Isidro</button></section>':'';
 const form=sender?'<form id="gl-molino-order-form" class="gl-molino-form gl-molino-order-form">'+
  '<label>Producto<input name="product" list="gl-molino-products" placeholder="Nombre del producto" maxlength="140" autocomplete="off" required></label>'+
  '<label>Cantidad<input name="quantity" type="number" min=".01" max="999999" step=".01" inputmode="decimal" required></label>'+
  '<label class="gl-molino-full">Observación (opcional)<textarea name="note" maxlength="500" rows="2" placeholder="Indicaciones para San Isidro"></textarea></label>'+
  '<button type="submit" class="gl-molino-main-btn" '+(busy?'disabled':'')+'>Agregar producto al pedido</button></form>'+draft:
  '<p class="gl-molino-tip">Los pedidos se realizan desde Acassuso. San Isidro puede consultarlos y marcar OK cuando los ve; no puede cambiar productos ni cantidades.</p>';
 const groups=orderGroups();
 const results=groups.length?'<div class="gl-molino-order-groups">'+groups.map(items=>{
  const completed=items.filter(x=>x.seen_at).length;
  return '<section class="gl-molino-order-group"><header><strong>Pedido del '+fmtDate(items[0].day)+'</strong>'+
   '<span class="gl-molino-status '+(completed===items.length?'ok':'pending')+'">'+completed+' de '+items.length+' vistos</span></header>'+
   items.map(item=>'<article class="gl-molino-item'+(item.seen_at?' is-confirmed':'')+'"><div class="gl-molino-item-top"><div><strong>'+escapeHTML(item.product)+'</strong>'+
    '<small>Cantidad solicitada: <b>'+fmtQty(item.quantity)+'</b></small></div>'+
    '<span class="gl-molino-status '+(item.seen_at?'ok':'pending')+'">'+(item.seen_at?'✓ OK · Visto por San Isidro':'Pendiente de OK')+'</span></div>'+
    (item.note?'<p class="gl-molino-comment">'+escapeHTML(item.note)+'</p>':'')+
    (receiver&&!item.seen_at?'<button type="button" class="gl-molino-ack-btn gl-molino-order-ack" data-mol-order-ack="'+escapeHTML(item.id)+'" '+(busy?'disabled':'')+'>✓ Marcar OK</button>':'')+
    (item.seen_at?'<p class="gl-molino-confirmed-note">Confirmado '+escapeHTML(fmtDate(item.seen_at))+' · Visible en ambas sucursales.</p>':'')+'</article>').join('')+
   '</section>';
 }).join('')+'</div>':'<p class="gl-molino-empty">Todavía no hay pedidos enviados de Acassuso a San Isidro.</p>';
 return '<div class="gl-molino-section-title"><h3>Pedidos · Acassuso → San Isidro</h3>'+
  '<p>Acassuso envía la solicitud. San Isidro ve el detalle y confirma con OK cada producto, sin modificar el pedido.</p></div>'+
  subnav+(orderMode==='realizar'?form:'<p class="gl-molino-tip">Seguimiento de los pedidos enviados y de sus confirmaciones de lectura.</p>')+
  '<div class="gl-molino-dailybar"><span>'+groups.length+' pedidos registrados</span><span>'+ (orderState.orders||[]).filter(x=>!x.seen_at).length+' productos pendientes de OK</span></div>'+results;
}
async function sendOrder(){
 if(busy||!canOrder()||!orderDraft.length)return;
 busy=true;warning='';message='';
 try{
  await rpc('gestlok_molino_order_create',{p_items:orderDraft});
  orderDraft=[];orderState=await rpc('gestlok_molino_orders_state');
  message='Pedido enviado a San Isidro. Cada producto quedará pendiente hasta su OK.';
 }catch(e){warning=e?.message||'No se pudo enviar el pedido.';}
 finally{busy=false;render();}
}
async function ackOrder(id){
 if(busy||!canOrderAck())return;
 busy=true;warning='';message='';
 try{
  await rpc('gestlok_molino_order_ack',{p_id:id});
  orderState=await rpc('gestlok_molino_orders_state');
  message='OK registrado y compartido con Acassuso.';
 }catch(e){warning=e?.message||'No se pudo marcar OK.';}
 finally{busy=false;render();}
}

function history(){
 const modeTabs='<div class="gl-molino-order-tabs" role="tablist" aria-label="Historial de devoluciones"><button type="button" data-mol-history-mode="diario" class="'+(historyMode==='diario'?'active':'')+'" aria-selected="'+(historyMode==='diario')+'">Historial diario</button><button type="button" data-mol-history-mode="mensual" class="'+(historyMode==='mensual'?'active':'')+'" aria-selected="'+(historyMode==='mensual')+'">Resumen mensual</button></div>';
 if(historyMode==='mensual')return modeTabs+monthView();
 const dates=state?.history||[];
 let body=modeTabs+'<div class="gl-molino-section-title"><h3>Historial diario</h3><p>Todos los movimientos quedan guardados por fecha. Incluye el OK individual, observaciones y cambios de precios.</p></div>';
 if(!dates.length)return body+'<p class="gl-molino-empty">El primer historial estará disponible al cierre de las 23:59 (Argentina).</p>';
 body+='<div class="gl-molino-history-list">'+dates.map(d=>
  '<button type="button" class="'+(selectedDay===d.day?'active':'')+'" data-mol-history="'+escapeHTML(d.day)+'"><b>'+fmtDate(d.day)+'</b><small>'+d.envios+' envíos · '+d.devoluciones+' devoluciones · '+d.cambios_precios+' cambios de precios</small></button>'
 ).join('')+'</div>';
 if(!selectedDay)return body+'<p class="gl-molino-tip">Elegí un día para consultar su archivo.</p>';
 if(!historyData||String(historyData.day)!==selectedDay)return body+'<p class="gl-molino-tip">Cargando el día seleccionado…</p>';
 const e=historyData.envios||[],d=historyData.devoluciones||[],p=historyData.cambios_precios||[];
 return body+'<div class="gl-molino-history-detail"><h4>Archivo del '+fmtDate(selectedDay)+'</h4>'+
 '<h5>Productos enviados</h5>'+(e.length?e.map(x=>movementItem(x,'envio',true)).join(''):'<p>Sin envíos.</p>')+
 '<h5>Devoluciones</h5>'+returnLedger(d,'Cuadro diario del '+fmtDate(selectedDay))+(d.length?d.map(x=>movementItem(x,'devolucion',true)).join(''):'<p>Sin devoluciones.</p>')+
 '<h5>Cambios de precios</h5>'+(p.length?p.map(x=>'<div class="gl-molino-price-history"><b>'+escapeHTML(x.product)+'</b><span>'+ (x.previous_amount==null?'Alta':money(x.previous_amount))+' → '+(x.amount==null?'Retirado':money(x.amount))+'</span></div>').join(''):'<p>Sin cambios de precios.</p>')+
 '</div>';
}
function render(){
 if(!opened)return;
 mount();
 const root=$('#gl-molino-panel');if(!root)return;
 const active=!!state;
 const panel=active?(section==='precios'?prices():section==='pedidos'?ordersView():section==='envios'?movements('envio')+'<section class="gl-molino-return-panel"><p class="gl-molino-return-label">DEVOLUCIONES VINCULADAS A ESTE ENVÍO DIARIO</p>'+movements('devolucion')+'</section>':section==='devoluciones'?movements('devolucion'):history()):
 '<p class="gl-molino-empty">Verificando permisos y cargando el vínculo entre sucursales…</p>';
 root.innerHTML='<div class="gl-molino-screen" role="dialog" aria-modal="true" aria-labelledby="gl-molino-title">'+
  '<header class="gl-molino-header"><div><small>GESTLOK · EL MOLINO CAFÉ</small><h2 id="gl-molino-title">Vínculo entre sucursales</h2>'+
  '<p>'+scopeName()+' · Información compartida en vivo</p></div>'+
  '<button type="button" id="gl-molino-close" data-mol-close aria-label="Cerrar">×</button></header>'+
  '<nav class="gl-molino-tabs" role="tablist" aria-label="Funciones compartidas">'+tabs()+'</nav>'+
  '<div class="gl-molino-main"><div class="gl-molino-alert" id="gl-molino-updated" '+(!stale?'hidden':'')+'><span>Hay cambios nuevos en el otro local.</span><button type="button" data-mol-refresh>Actualizar</button></div>'+
  (warning?'<div class="gl-molino-error" role="alert">'+escapeHTML(warning)+'</div>':'')+
  (message?'<div class="gl-molino-success" role="status">'+escapeHTML(message)+'</div>':'')+
  panel+'<datalist id="gl-molino-products">'+(state?.prices||[]).map(p=>'<option value="'+escapeHTML(p.product)+'"></option>').join('')+'</datalist></div><footer class="gl-molino-foot">Sincronizado entre San Isidro y Acassuso · '+(state?.closed?'Día cerrado':'Cierre diario 23:59 hs (Argentina)')+'</footer></div>';
}
async function save(fn,args,done){
 if(busy)return;
 busy=true;warning='';message='';
 try{
  await rpc(fn,args);
  editPrice=null;editMove=null;
  // La transacción termina antes de recargar, evitando estados parcialmente confirmados.
  if(done)message=done;
  state=await rpc('gestlok_molino_state');
  if(opened){if(section==='historial'&&selectedDay)historyData=await rpc('gestlok_molino_history',{p_day:selectedDay});render();}
 }catch(e){warning=e?.message||'No se pudo guardar.';render();}
 finally{busy=false;}
}
async function loadHistory(day){
 selectedDay=day;historyData=null;warning='';render();
 try{const data=await rpc('gestlok_molino_history',{p_day:day});if(opened&&selectedDay===day){historyData=data;render();}}
 catch(e){warning=e?.message||'No se pudo abrir el archivo.';render();}
}
document.addEventListener('click',e=>{
 const op=e.target.closest('[data-mol-open]');if(op){
   e.preventDefault();
   // Desde el menú del celular: cerrar el menú lateral antes de abrir la sección.
   if(op.closest('#snav')){document.getElementById('app')?.classList.remove('open');const scrim=document.getElementById('scrim');if(scrim)scrim.hidden=true;}
   begin(op.dataset.molOpen);return;
 }
 if(!opened)return;
 if(e.target.closest('[data-mol-close]')||e.target.id==='gl-molino-panel'){e.preventDefault();unmount();return;}
 const tab=e.target.closest('[data-mol-tab]');
 if(tab){section=tab.dataset.molTab;editPrice=null;editMove=null;warning='';message='';if(section==='pedidos'){orderState=null;render();void reload();}else render();return;}
 if(e.target.closest('[data-mol-refresh]')){stale=false;if(section==='historial'&&historyMode==='mensual')void loadMonth();else void reload();return;}
 const histMode=e.target.closest('[data-mol-history-mode]');
 if(histMode&&section==='historial'){historyMode=histMode.dataset.molHistoryMode==='mensual'?'mensual':'diario';if(historyMode==='mensual')void loadMonth();else render();return;}

 const orderTab=e.target.closest('[data-mol-order-mode]');
 if(orderTab&&section==='pedidos'){orderMode=orderTab.dataset.molOrderMode==='seguimiento'?'seguimiento':'realizar';render();return;}
 const orderRemove=e.target.closest('[data-mol-order-remove]');
 if(orderRemove&&section==='pedidos'&&canOrder()){const i=Number(orderRemove.dataset.molOrderRemove);if(Number.isInteger(i)&&i>=0&&i<orderDraft.length){orderDraft.splice(i,1);render();}return;}
 if(e.target.closest('[data-mol-order-send]')&&section==='pedidos'){void sendOrder();return;}
 const orderAck=e.target.closest('[data-mol-order-ack]');
 if(orderAck&&section==='pedidos'){void ackOrder(orderAck.dataset.molOrderAck);return;}
 const hi=e.target.closest('[data-mol-history]');if(hi){void loadHistory(hi.dataset.molHistory);return;}
 const pe=e.target.closest('[data-mol-price-edit]');if(pe&&canPrices()){editPrice=pe.dataset.molPriceEdit;render();$('#gl-molino-price-form [name="product"]')?.focus();return;}
 const pm=e.target.closest('[data-mol-price-remove]');if(pm){
   if(!canPrices())return;
   if(confirm('¿Quitar '+pm.dataset.name+' de Precios? El cambio quedará en el historial.'))
     void save('gestlok_molino_remove_price',{p_id:pm.dataset.molPriceRemove},'Producto retirado de la lista.');
   return;
 }
 const me=e.target.closest('[data-mol-move-edit]');if(me&&canEdit(me.dataset.kind)){if(section!=='envios')section=me.dataset.kind==='envio'?'envios':'devoluciones';editMove=me.dataset.molMoveEdit;render();$('#gl-molino-movement-form-'+me.dataset.kind+' [name="product"]')?.focus();return;}
 const c=e.target.closest('[data-mol-cancel]');if(c){editPrice=null;editMove=null;render();return;}
 const noteButton=e.target.closest('[data-mol-note]');
 if(noteButton){
   const id=noteButton.dataset.molNote;
   const note=$('#gl-molino-panel input[data-mol-ack-note="'+id+'"]')?.value||'';
   void save('gestlok_molino_save_observation',{p_id:id,p_note:note},'Observación compartida con San Isidro; el producto sigue pendiente de OK.');
   return;
 }
 const ack=e.target.closest('[data-mol-ack]');
 if(ack){
   const id=ack.dataset.molAck;
   const note=$('#gl-molino-panel input[data-mol-ack-note="'+id+'"]')?.value||'';
   void save('gestlok_molino_acknowledge',{p_id:id,p_note:note},'OK guardado para este producto.');
 }
});
document.addEventListener('submit',e=>{
 if(!opened)return;

 const order=e.target.closest('#gl-molino-order-form');
 if(order){
  e.preventDefault();
  if(busy||section!=='pedidos'||!canOrder()||orderDraft.length>=40)return;
  const data=new FormData(order);
  const product=String(data.get('product')||'').trim();
  const quantity=Number(data.get('quantity'));
  const note=String(data.get('note')||'').trim();
  if(!product||product.length>140||!Number.isFinite(quantity)||quantity<=0||quantity>999999||Math.abs(Math.round(quantity*100)-quantity*100)>1e-6||note.length>500){
   warning='Revisá producto, cantidad y observación.';render();return;
  }
  orderDraft.push({product,quantity,note});
  warning='';render();return;
 }
 const price=e.target.closest('#gl-molino-price-form');
 if(price){
  e.preventDefault();if(busy||!canPrices())return;
  const d=new FormData(price);
  void save('gestlok_molino_save_price_basis',{
    p_id:editPrice||null,p_product:String(d.get('product')||'').trim(),
    p_amount:Number(d.get('amount')),p_basis:String(d.get('basis')||'unidad')
  },'Precio guardado y compartido.');
  return;
 }
 const move=e.target.closest('form[data-mol-movement-form]');
 if(move){
  e.preventDefault();if(busy||!canEdit(move.dataset.kind))return;
  const d=new FormData(move);
  void save(move.dataset.kind==='devolucion'?'gestlok_molino_save_return':'gestlok_molino_save_movement',{
    ...(move.dataset.kind==='devolucion'?{p_unit:String(d.get('unit')||'unidad')}:{p_kind:'envio'}),p_id:editMove||null,
    p_product:String(d.get('product')||'').trim(),
    p_quantity:Number(d.get('quantity')),
    p_note:move.dataset.kind==='devolucion'?String(d.get('note')||'').trim():''
  },'Producto registrado y compartido.');
 }
});
document.addEventListener('change',e=>{if(!opened||section!=='historial'||historyMode!=='mensual')return;if(e.target?.id==='gl-molino-month'){void loadMonth(String(e.target.value||''));}});
document.addEventListener('keydown',e=>{if(opened&&e.key==='Escape'){e.preventDefault();unmount();}});
window.GestLokMolino=Object.freeze({attach(ctx){api=ctx;css();},homeTile,navHTML,sectionName,open:begin,close:unmount});
})();

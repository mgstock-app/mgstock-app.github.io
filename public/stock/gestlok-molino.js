/* El Molino Café: tablero compartido exclusivamente para sus dos sucursales.
   Todas las mutaciones y roles se validan nuevamente mediante RPC / RLS.
   No usar documentos de otra empresa ni conceder permisos por controles UI. */
(()=>{
'use strict';
const TENANT='6c8717ea-5f78-426b-9458-74a5dcac6e4e';
const money=n=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:2}).format(Number(n||0));
const escapeHTML=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtDate=s=>{if(!s)return '';const a=String(s).slice(0,10).split('-');return a.length===3?a.reverse().join('/'):String(s);};
const fmtQty=n=>new Intl.NumberFormat('es-AR',{maximumFractionDigits:2}).format(Number(n||0));
const localDay=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
let api=null,opened=false,section='precios',state=null,historyData=null,selectedDay='',busy=false,fetching=false,warning='',message='',editPrice=null,editMove=null,channel=null,timer=null,stale=false,priorFocus=null;
const $=s=>document.querySelector(s);
const hasTenant=()=>api?.S?.me?.tenant_id===TENANT;
const role=()=>state?.scope||'none';
const canPrices=()=>['admin','dueno','san_isidro'].includes(role());
const canSend=()=>['admin','dueno','san_isidro'].includes(role());
const canReturn=()=>['admin','dueno','acassuso'].includes(role());
const canAckSent=()=>['admin','dueno','acassuso'].includes(role());
const canAckReturned=()=>['admin','dueno','san_isidro'].includes(role());
const canEdit=k=>k==='envio'?canSend():canReturn();
const scopeName=()=>({admin:'Administración general · ambos locales',dueno:'Dueño · ambos locales',san_isidro:'Gerente · San Isidro',acassuso:'Gerente · Acassuso'})[role()]||'Verificando acceso';
function css(){
 if(document.getElementById('gl-molino-css'))return;
 const l=document.createElement('link');l.id='gl-molino-css';l.rel='stylesheet';l.href='/stock/gestlok-molino.css?rev=molino-live-20261107';document.head.appendChild(l);
}
function homeTile(){
 if(!hasTenant()||!['creadora','dueno','gerente'].includes(api?.role?.()))return '';
 return '<section class="gl-molino-home" aria-label="Vínculo entre San Isidro y Acassuso">'+
  '<div class="gl-molino-home-head"><span class="gl-molino-home-symbol" aria-hidden="true">⇄</span><div><small>EL MOLINO CAFÉ · DOS SUCURSALES</small><h2>Vínculo entre sucursales</h2>'+
  '<p>San Isidro envía, Acassuso recibe. Todo queda registrado y actualizado en vivo.</p></div></div>'+
  '<div class="gl-molino-home-actions">'+
  '<button type="button" data-mol-open="precios">◈ <span>Precios</span></button>'+
  '<button type="button" data-mol-open="envios">▣ <span>Productos enviados</span></button>'+
  '<button type="button" data-mol-open="devoluciones">↩ <span>Devoluciones</span></button>'+
  '<button type="button" data-mol-open="historial">▤ <span>Historial</span></button>'+
  '</div></section>';
}
function mount(){
 css();
 if($('#gl-molino-panel'))return;
 const node=document.createElement('div');node.id='gl-molino-panel';
 node.className='gl-molino-backdrop';node.setAttribute('role','presentation');
 document.body.appendChild(node);document.body.classList.add('gl-molino-open');
}
function unmount(){
 opened=false;state=null;historyData=null;editPrice=null;editMove=null;stale=false;
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
  if(!opened)return;
  if(!result||!['admin','dueno','san_isidro','acassuso'].includes(result.scope))throw Error('Sin autorización.');
  // Nunca interrumpir los formularios mientras el gerente está escribiendo.
  if(silent&&$('#gl-molino-panel form:focus-within, #gl-molino-panel input[data-mol-ack-note]:focus, #gl-molino-panel textarea[data-mol-ack-note]:focus')){
    stale=true;const b=$('#gl-molino-updated');if(b)b.hidden=false;return;
  }
  state=result;stale=false;render();
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
    .subscribe();
 }catch{channel=null;}
}
function begin(tab){
 if(!hasTenant())return;
 priorFocus=document.activeElement;
 opened=true;section=['precios','envios','devoluciones','historial'].includes(tab)?tab:'precios';
 warning='';message='';state=null;historyData=null;editPrice=null;editMove=null;
 mount();render();void reload();watch();
 setTimeout(()=>$('#gl-molino-close')?.focus(),0);
}
function tabs(){
 return [['precios','Precios'],['envios','Productos enviados'],['devoluciones','Devoluciones'],['historial','Historial']].map(x=>
  '<button type="button" role="tab" aria-selected="'+(section===x[0])+'" class="'+(section===x[0]?'active':'')+'" data-mol-tab="'+x[0]+'">'+x[1]+'</button>'
 ).join('');
}
function priceForm(){
 if(!canPrices())return '<p class="gl-molino-tip">San Isidro administra la lista. Acassuso ve los mismos precios en tiempo real, sin modificar.</p>';
 const p=editPrice?(state?.prices||[]).find(x=>x.id===editPrice):null;
 return '<form id="gl-molino-price-form" class="gl-molino-form">'+
  '<label>Producto<input name="product" maxlength="140" autocomplete="off" placeholder="Nombre del producto" value="'+escapeHTML(p?.product||'')+'" required></label>'+
  '<label>Precio ($)<input name="amount" type="number" min="0" max="999999999" step=".01" inputmode="decimal" value="'+escapeHTML(p?.amount??'')+'" placeholder="0,00" required></label>'+
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
 records.map(p=>'<tr><td><strong>'+escapeHTML(p.product)+'</strong></td><td class="gl-molino-money">'+money(p.amount)+'</td><td>'+fmtDate(p.updated_at)+'</td>'+
 (canPrices()?'<td><div class="gl-molino-row-actions"><button type="button" data-mol-price-edit="'+escapeHTML(p.id)+'">Editar</button><button type="button" class="warn" data-mol-price-remove="'+escapeHTML(p.id)+'" data-name="'+escapeHTML(p.product)+'">Quitar</button></div></td>':'')+
 '</tr>').join('')+'</tbody></table></div>':'<p class="gl-molino-empty">Todavía no se cargaron productos ni precios.</p>');
}
function movementForm(kind){
 if(state?.closed)return '<p class="gl-molino-note">El día cerró a las 23:59. El registro de hoy ya está en el historial.</p>';
 if(!canEdit(kind))return '<p class="gl-molino-tip">'+(kind==='envio'?'Acassuso visualiza los envíos y confirma cada producto recibido.':'San Isidro ve las devoluciones y confirma cada producto recibido.')+'</p>';
 const p=editMove?(state?.[kind==='envio'?'envios':'devoluciones']||[]).find(x=>x.id===editMove):null;
 const isReturn=kind==='devolucion';
 return '<form id="gl-molino-movement-form" data-kind="'+kind+'" class="gl-molino-form">'+
 '<label>Producto<input name="product" maxlength="140" autocomplete="off" placeholder="Nombre del producto" value="'+escapeHTML(p?.product||'')+'" required></label>'+
 '<label>Cantidad<input type="number" name="quantity" min=".01" max="999999" step=".01" inputmode="decimal" placeholder="0" value="'+escapeHTML(p?.quantity??'')+'" required></label>'+
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
 '<div class="gl-molino-item-top"><div><strong>'+escapeHTML(m.product)+'</strong><small>Cantidad: <b>'+fmtQty(m.quantity)+'</b></small></div>'+
 '<span class="gl-molino-status '+(ok?'ok':'pending')+'">'+(ok?'✓ OK · '+label:'Pendiente de recepción')+'</span></div>'+
 (m.note?'<p class="gl-molino-comment"><b>Observación de Acassuso:</b> '+escapeHTML(m.note)+'</p>':'')+
 (m.acknowledgement_note?'<p class="gl-molino-comment"><b>Observación al recibir:</b> '+escapeHTML(m.acknowledgement_note)+'</p>':'')+
 (canChange?'<button type="button" class="gl-molino-inline" data-mol-move-edit="'+escapeHTML(m.id)+'" data-kind="'+kind+'">Editar detalle</button>':'')+
 (canAck?'<div class="gl-molino-ack"><label>Observación al recibir (opcional)<input data-mol-ack-note="'+escapeHTML(m.id)+'" maxlength="1000" placeholder="Escribí una observación si necesitás"></label><button type="button" class="gl-molino-ack-btn" data-mol-ack="'+escapeHTML(m.id)+'">✓ Marcar OK</button></div>':'')+
 (ok?'<p class="gl-molino-confirmed-note">Confirmación registrada y compartida en ambos locales.</p>':'')+
 '</article>';
}
function movements(kind){
 const sent=kind==='envio';
 const records=state?.[sent?'envios':'devoluciones']||[];
 return '<div class="gl-molino-section-title"><h3>'+(sent?'Productos enviados · San Isidro → Acassuso':'Devoluciones · Acassuso → San Isidro')+'</h3>'+
 '<p>'+(sent?'San Isidro carga producto y cantidad. Acassuso confirma cada unidad de la lista por separado.':'Acassuso carga producto, cantidad y observación. San Isidro confirma la recepción de cada renglón.')+'</p></div>'+
 '<div class="gl-molino-dailybar"><span>Fecha del movimiento: <b>'+fmtDate(state?.day)+'</b></span><span>'+records.length+' productos · '+records.filter(m=>m.acknowledged_at).length+' con OK</span></div>'+
 movementForm(kind)+
 (records.length?'<div class="gl-molino-items">'+records.map(x=>movementItem(x,kind)).join('')+'</div>':'<p class="gl-molino-empty">Sin '+(sent?'envíos':'devoluciones')+' registrados hoy.</p>');
}
function history(){
 const dates=state?.history||[];
 let body='<div class="gl-molino-section-title"><h3>Historial diario</h3><p>Todos los movimientos quedan guardados por fecha. Incluye el OK individual, observaciones y cambios de precios.</p></div>';
 if(!dates.length)return body+'<p class="gl-molino-empty">El primer historial estará disponible al cierre de las 23:59 (Argentina).</p>';
 body+='<div class="gl-molino-history-list">'+dates.map(d=>
  '<button type="button" class="'+(selectedDay===d.day?'active':'')+'" data-mol-history="'+escapeHTML(d.day)+'"><b>'+fmtDate(d.day)+'</b><small>'+d.envios+' envíos · '+d.devoluciones+' devoluciones · '+d.cambios_precios+' cambios de precios</small></button>'
 ).join('')+'</div>';
 if(!selectedDay)return body+'<p class="gl-molino-tip">Elegí un día para consultar su archivo.</p>';
 if(!historyData||String(historyData.day)!==selectedDay)return body+'<p class="gl-molino-tip">Cargando el día seleccionado…</p>';
 const e=historyData.envios||[],d=historyData.devoluciones||[],p=historyData.cambios_precios||[];
 return body+'<div class="gl-molino-history-detail"><h4>Archivo del '+fmtDate(selectedDay)+'</h4>'+
 '<h5>Productos enviados</h5>'+(e.length?e.map(x=>movementItem(x,'envio',true)).join(''):'<p>Sin envíos.</p>')+
 '<h5>Devoluciones</h5>'+(d.length?d.map(x=>movementItem(x,'devolucion',true)).join(''):'<p>Sin devoluciones.</p>')+
 '<h5>Cambios de precios</h5>'+(p.length?p.map(x=>'<div class="gl-molino-price-history"><b>'+escapeHTML(x.product)+'</b><span>'+ (x.previous_amount==null?'Alta':money(x.previous_amount))+' → '+(x.amount==null?'Retirado':money(x.amount))+'</span></div>').join(''):'<p>Sin cambios de precios.</p>')+
 '</div>';
}
function render(){
 if(!opened)return;
 mount();
 const root=$('#gl-molino-panel');if(!root)return;
 const active=!!state;
 const panel=active?(section==='precios'?prices():section==='envios'?movements('envio'):section==='devoluciones'?movements('devolucion'):history()):
 '<p class="gl-molino-empty">Verificando permisos y cargando el vínculo entre sucursales…</p>';
 root.innerHTML='<div class="gl-molino-screen" role="dialog" aria-modal="true" aria-labelledby="gl-molino-title">'+
  '<header class="gl-molino-header"><div><small>GESTLOK · EL MOLINO CAFÉ</small><h2 id="gl-molino-title">Vínculo entre sucursales</h2>'+
  '<p>'+scopeName()+' · Información compartida en vivo</p></div>'+
  '<button type="button" id="gl-molino-close" data-mol-close aria-label="Cerrar">×</button></header>'+
  '<nav class="gl-molino-tabs" role="tablist" aria-label="Funciones compartidas">'+tabs()+'</nav>'+
  '<div class="gl-molino-main"><div class="gl-molino-alert" id="gl-molino-updated" '+(!stale?'hidden':'')+'><span>Hay cambios nuevos en el otro local.</span><button type="button" data-mol-refresh>Actualizar</button></div>'+
  (warning?'<div class="gl-molino-error" role="alert">'+escapeHTML(warning)+'</div>':'')+
  (message?'<div class="gl-molino-success" role="status">'+escapeHTML(message)+'</div>':'')+
  panel+'</div><footer class="gl-molino-foot">Sincronizado entre San Isidro y Acassuso · '+(state?.closed?'Día cerrado':'Cierre diario 23:59 hs (Argentina)')+'</footer></div>';
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
 const op=e.target.closest('[data-mol-open]');if(op){e.preventDefault();begin(op.dataset.molOpen);return;}
 if(!opened)return;
 if(e.target.closest('[data-mol-close]')||e.target.id==='gl-molino-panel'){e.preventDefault();unmount();return;}
 const tab=e.target.closest('[data-mol-tab]');
 if(tab){section=tab.dataset.molTab;editPrice=null;editMove=null;warning='';message='';render();return;}
 if(e.target.closest('[data-mol-refresh]')){stale=false;void reload();return;}
 const hi=e.target.closest('[data-mol-history]');if(hi){void loadHistory(hi.dataset.molHistory);return;}
 const pe=e.target.closest('[data-mol-price-edit]');if(pe){editPrice=pe.dataset.molPriceEdit;render();$('#gl-molino-price-form [name="product"]')?.focus();return;}
 const pm=e.target.closest('[data-mol-price-remove]');if(pm){
   if(confirm('¿Quitar '+pm.dataset.name+' de Precios? El cambio quedará en el historial.'))
     void save('gestlok_molino_remove_price',{p_id:pm.dataset.molPriceRemove},'Producto retirado de la lista.');
   return;
 }
 const me=e.target.closest('[data-mol-move-edit]');if(me){section=me.dataset.kind==='envio'?'envios':'devoluciones';editMove=me.dataset.molMoveEdit;render();$('#gl-molino-movement-form [name="product"]')?.focus();return;}
 const c=e.target.closest('[data-mol-cancel]');if(c){editPrice=null;editMove=null;render();return;}
 const ack=e.target.closest('[data-mol-ack]');
 if(ack){
   const id=ack.dataset.molAck;
   const note=$('#gl-molino-panel input[data-mol-ack-note="'+id+'"]')?.value||'';
   void save('gestlok_molino_acknowledge',{p_id:id,p_note:note},'OK guardado para este producto.');
 }
});
document.addEventListener('submit',e=>{
 if(!opened)return;
 const price=e.target.closest('#gl-molino-price-form');
 if(price){
  e.preventDefault();if(busy)return;
  const d=new FormData(price);
  void save('gestlok_molino_save_price',{
    p_id:editPrice||null,p_product:String(d.get('product')||'').trim(),
    p_amount:Number(d.get('amount'))
  },'Precio guardado y compartido.');
  return;
 }
 const move=e.target.closest('#gl-molino-movement-form');
 if(move){
  e.preventDefault();if(busy)return;
  const d=new FormData(move);
  void save('gestlok_molino_save_movement',{
    p_kind:move.dataset.kind,p_id:editMove||null,
    p_product:String(d.get('product')||'').trim(),
    p_quantity:Number(d.get('quantity')),
    p_note:move.dataset.kind==='devolucion'?String(d.get('note')||'').trim():''
  },'Producto registrado y compartido.');
 }
});
document.addEventListener('keydown',e=>{if(opened&&e.key==='Escape'){e.preventDefault();unmount();}});
window.GestLokMolino=Object.freeze({attach(ctx){api=ctx;css();},homeTile,open:begin,close:unmount});
})();

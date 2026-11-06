/* Mi Gusto: Pedidos WhatsApp por sucursal. El bot requiere activación de Meta.
 * Visualización y alertas de comandas nuevas también fuera de la pantalla Pedidos.
 * Caja, Pagos Online, Stock y pedidos de proveedores permanecen independientes. */
(()=>{
'use strict';
const TENANT='cb0dc04a-9a13-434f-a3d0-47f1d8f39670';
const LOCALS={munro:'Munro',torcuato:'Don Torcuato'};
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pesos=x=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:2}).format(Number(x)||0);
const date=x=>x?new Intl.DateTimeFormat('es-AR',{timeZone:'America/Argentina/Buenos_Aires',dateStyle:'short',timeStyle:'short'}).format(new Date(x)):'—';
let api=null,items=[],catalog=[],phone='',tab='pendientes',loading=false,busy=false,error='',notice='',epoch=0,loaded=false;
let polling=false,firstSnapshot=true,knownOrderIds=new Set(),lastNewOrderId='',lastUiSig='',lastAlertSig='';
const PAUSE_MS=12000;
const waIcon='<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"><path d="M21 11.5a9.1 9.1 0 0 1-13.3 8L3 21l1.5-4.7A9.1 9.1 0 1 1 21 11.5Z"/><path d="M8 8.6c0 3 4.4 7.3 7.2 7.3.5 0 1.4-.5 1.6-1.1l-2-1.1-1.2 1c-1.8-.8-2.7-1.7-3.5-3.5l1-1.2-1.1-2c-.6.2-2 1-2 2.7Z"/></svg>';
const userIcon='<svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="7.5" r="4.2"/><path d="M3.5 21c.1-4.3 3.4-7 8.5-7s8.4 2.7 8.5 7Z"/></svg>';
const cutleryIcon='<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 3v7a3 3 0 0 0 6 0V3M7 3v18M16 3c-2 3-3 6-3 10h5V3M18 13v8"/></svg>';
const local=()=>api?.S?.local;
const allowed=()=>!!api && api.S?.me?.tenant_id===TENANT && local() in LOCALS &&
  !window.GestLokCreatorSupport?.previewRol?.() &&
  (api.miRol()==='dueno'||(api.miRol()==='gerente'&&api.misLocales().includes(local()))||
   (api.miRol()==='creadora'&&!api.S?.ro));
const online=()=>!!api&&!api.S?.offline&&navigator.onLine!==false;
const canEdit=()=>allowed()&&online()&&!busy&&!!window.GestLokSupabase;
const canSetNumber=()=>allowed()&&['dueno','creadora'].includes(api.miRol());
const escapeLines=x=>esc(x).replace(/\n/g,'<br>');
const formatPhone=x=>{const v=String(x||'').replace(/[^0-9]/g,'');return /^5411[0-9]{8}$/.test(v)?'+54 11 '+v.slice(4,8)+'-'+v.slice(8):v?'+'+v:'Pendiente de configurar';};
const pendingOrders=()=>items.filter(x=>x.status==='nuevo');
const pendingCount=()=>allowed()?pendingOrders().length:0;
const navBadge=()=>pendingCount()?'<span class="mgp-nav-count" data-mgp-nav-count aria-label="'+pendingCount()+' pedidos pendientes">'+Math.min(99,pendingCount())+(pendingCount()>99?'+':'')+'</span>':'';
function quickAccess(){
 if(!allowed())return '';
 return '<nav class="mgp-shift-quick" aria-label="Atajos de turno de Mi Gusto">'+
  '<button type="button" data-go="cierre-online" class="mgp-shift-button"><span class="mgp-shift-symbol" aria-hidden="true">▤</span><span><strong>Pagos Online</strong><small>Movimientos y cierre</small></span></button>'+
  '<button type="button" data-go="pedidos-clientes" class="mgp-shift-button mgp-shift-whatsapp">'+waIcon+'<span><strong>Pedidos WhatsApp</strong><small><span data-mgp-quick-count>'+pendingCount()+'</span> pendientes de OK</small></span></button>'+
 '</nav>';
}
const signature=rows=>rows.map(x=>[x.id,x.status,x.created_at,x.received_at].join(':')).join('|');
function indicators(){
 if(!allowed())return hideAlert();
 const count=pendingCount(),pending=pendingOrders();
 // Contadores visibles tanto en el menú lateral como en el atajo del Inicio.
 const nav=document.querySelector?.('#snav button[data-go="pedidos-clientes"]');
 if(nav&&document.createElement){
   let badge=nav.querySelector('[data-mgp-nav-count]');
   if(count){
     if(!badge){badge=document.createElement('span');badge.className='mgp-nav-count';badge.dataset.mgpNavCount='';nav.appendChild(badge);}
     badge.textContent=String(Math.min(99,count))+(count>99?'+':'');
     badge.setAttribute('aria-label',count+' pedidos pendientes');
   }else badge?.remove();
 }
 document.querySelectorAll?.('[data-mgp-quick-count]')?.forEach(el=>{el.textContent=String(count);});
 window.GestLokMobileDock?.refresh?.();
 let banner=document.getElementById?.('mgp-global-alert');
 if(!count){banner?.remove();lastAlertSig='';lastNewOrderId='';return;}
 if(!banner){
   if(!document.createElement||!document.body)return;
   banner=document.createElement('aside');banner.id='mgp-global-alert';banner.className='mgp-global-alert';
   banner.setAttribute('role','status');banner.setAttribute('aria-live','polite');
   document.body.appendChild(banner);
 }
 const latest=pending.find(o=>o.id===lastNewOrderId);
 const sig=[local(),count,lastNewOrderId,latest?.customer_name,online()].join('|');
 if(sig===lastAlertSig)return;
 lastAlertSig=sig;
 banner.classList.toggle('mgp-global-alert-new',!!latest);
 const title=latest?(latest.source==='whatsapp'?'¡Nueva comanda por WhatsApp!':'¡Nueva comanda pendiente!'):'Pedidos WhatsApp pendientes';
 const desc=latest?esc(latest.customer_name)+' · '+count+' pendiente'+(count===1?'':'s')+' de OK':count+' pedido'+(count===1?'':'s')+' por revisar en '+esc(LOCALS[local()]);
 banner.innerHTML='<span class="mgp-alert-icon">'+waIcon+'</span><div class="mgp-alert-copy"><strong>'+title+'</strong><small>'+desc+'</small></div>'+
  '<button type="button" data-go="pedidos-clientes" class="mgp-alert-open">Ver pedidos</button>';
}
function hideAlert(){
 document.getElementById?.('mgp-global-alert')?.remove();
 lastAlertSig='';
}
function acceptOrders(rows,loc){
 if(loc!==local()||!allowed())return false;
 const next=Array.isArray(rows)?rows.filter(x=>x.local===loc):[];
 const nextSig=signature(next),was=lastUiSig;
 if(!firstSnapshot){
   const fresh=next.find(x=>x.status==='nuevo'&&!knownOrderIds.has(String(x.id)));
   if(fresh)lastNewOrderId=fresh.id;
 }
 for(const item of next)knownOrderIds.add(String(item.id));
 firstSnapshot=false;items=next;lastUiSig=nextSig;
 if(lastNewOrderId&&!next.some(x=>x.id===lastNewOrderId&&x.status==='nuevo'))lastNewOrderId='';
 indicators();
 return nextSig!==was;
}
async function checkIncoming(){
 if(!allowed()||!online()||polling||busy||loading)return;
 const request=epoch,loc=local();polling=true;
 try{
  const state=await rpc('gestlok_mg_orders_state');
  if(request!==epoch||loc!==local()||!allowed())return;
  const changed=acceptOrders(state?.orders,loc);
  if(changed&&api?.S.view==='pedidos-clientes')update();
 }catch(e){
  // No se ocultan comandas previamente recibidas por un corte momentáneo.
  if(loc===local()&&api?.S.view==='pedidos-clientes')error=e.message||'No se pudieron actualizar los pedidos.';
 }finally{polling=false;}
}
function update(force=false,preserve=true){
 if(api?.S.view!=='pedidos-clientes'||!allowed())return;
 // El refresco periódico no debe cortar la escritura de un pedido.
 if(!force&&document.activeElement?.closest?.('#mgp-order-form,#mgp-number-form,#mgp-catalog-form'))return;
 const forms=preserve?Array.from(document.querySelectorAll?.('#mgp-order-form,#mgp-number-form,#mgp-catalog-form')||[]).map(f=>({
  id:f.id,open:!!f.closest('details')?.open,
  fields:Array.from(f.elements).filter(el=>el.name&&'value' in el).map(el=>({name:el.name,value:el.value}))
 })):[];
 api.render();
 for(const snapshot of forms){
  const form=document.getElementById?.(snapshot.id);
  if(!form)continue;
  const details=form.closest('details');if(details)details.open=snapshot.open;
  for(const field of snapshot.fields){
   const el=form.elements.namedItem(field.name);
   if(el&&'value' in el)el.value=field.value;
  }
 }
}
async function rpc(method,args={}){
 if(!allowed()||!window.GestLokSupabase)throw new Error('No tenés acceso a los pedidos de esta sucursal.');
 if(!online())throw new Error('Para actualizar Pedidos necesitás conexión.');
 const {data,error:e}=await window.GestLokSupabase.rpc(method,{p_local:local(),...args});
 if(e)throw new Error(e.message||'No se pudo completar la operación.');
 return data;
}
async function refresh(){
 if(!allowed()||loading||busy||!online())return;
 const request=++epoch,loc=local();
 loading=!loaded;update();
 try{
  const [result,prices]=await Promise.all([rpc('gestlok_mg_orders_state'),rpc('gestlok_mg_orders_catalog')]);
  if(request!==epoch||loc!==local())return;
  catalog=Array.isArray(prices)?prices:[];
  acceptOrders(result?.orders,loc);
  phone=String(result?.whatsapp_number||'');loaded=true;error='';
 }catch(e){if(request===epoch&&loc===local())error=e.message||'No pudimos consultar los pedidos.';}
 finally{if(request===epoch){loading=false;update();}}
}
function orderCard(o){
 const done=o.status==='recibido',isWA=o.source==='whatsapp';
 return '<article class="mgp-card"><div class="mgp-card-head">'+
  '<span class="mgp-avatar">'+userIcon+'</span><div class="mgp-customer"><strong>'+esc(o.customer_name)+'</strong>'+
  '<small>'+esc(o.customer_phone)+'</small><small>'+date(o.created_at)+'</small></div>'+
  '<span class="mgp-source '+(isWA?'mgp-source-wa':'mgp-source-manual')+'">'+(isWA?waIcon+' WhatsApp':'Carga interna')+'</span></div>'+
  '<div class="mgp-detail">'+escapeLines(o.items_detail)+'</div>'+
  (o.notes?'<p class="mgp-note">Nota: '+escapeLines(o.notes)+'</p>':'')+
  '<div class="mgp-card-bottom"><span><b>Total: '+pesos(o.total)+'</b><small>Pago únicamente en efectivo</small>'+
  '<small class="mgp-state '+(done?'done':'pending')+'">'+(done?'✓ OK · Realizado':'Pendiente')+'</small></span>'+
  (done?'<span class="mgp-received">✓ Visto: '+date(o.received_at)+'</span>':
  '<button type="button" class="mgp-button mgp-ok" aria-label="Marcar OK: comanda vista por el local" data-mgp-receive="'+esc(o.id)+'" '+(!canEdit()?'disabled':'')+'>✓ OK · Vista</button>')+'</div></article>';
}
function view(){
 if(!allowed())return '<p class="lead">No tenés acceso a los pedidos de esta sucursal.</p>';
 const pending=items.filter(x=>x.status==='nuevo'),done=items.filter(x=>x.status==='recibido');
 const selected=tab==='todos'?items:tab==='realizados'?done:pending;
 const config=canSetNumber()?'<details class="mgp-config"><summary>Configurar WhatsApp de '+esc(LOCALS[local()])+'</summary>'+
  '<p>Esta sucursal tendrá su propio número y sus pedidos separados. La automatización requiere conectar después la API oficial de Meta.</p>'+
  '<form id="mgp-number-form"><label>Número con código de país (ej.: 54911... )<input name="number" inputmode="tel" autocomplete="tel" required minlength="10" maxlength="24" value="'+esc(phone)+'" placeholder="54911..." '+(!canEdit()?'disabled':'')+'></label>'+
  '<button class="mgp-button" type="submit" '+(!canEdit()?'disabled':'')+'>Guardar número</button></form></details>':'';
 const catalogPanel='<section class="mgp-catalog-card" aria-label="Carta y precios de WhatsApp">'+
  '<header class="mgp-catalog-head"><span class="mgp-catalog-icon">'+cutleryIcon+'</span><div><strong>Carta y precios para WhatsApp</strong><small>'+catalog.filter(x=>x.active).length+' productos activos en '+esc(LOCALS[local()])+'</small></div></header>'+
  '<div class="mgp-menu-list">'+(catalog.length?catalog.map(x=>'<div class="mgp-menu-item"><div class="mgp-menu-name"><span class="mgp-menu-empanada" aria-hidden="true">◡</span><span><strong>'+esc(x.name)+'</strong>'+(!x.active?'<small>Oculto de WhatsApp</small>':'')+'</span></div><span class="mgp-menu-price">'+pesos(x.price)+'</span>'+
    (canSetNumber()?'<div class="mgp-menu-actions"><button type="button" data-mgp-edit="'+esc(x.id)+'">Editar</button>'+(x.active?'<button type="button" data-mgp-disable="'+esc(x.id)+'">Ocultar</button>':'')+'</div>':'')+'</div>').join(''):'<p class="mgp-catalog-empty">Todavía no hay productos cargados. Agregá la carta y precios de esta sucursal.</p>')+'</div>'+
  (canSetNumber()?'<details class="mgp-config mgp-catalog-editor" id="mgp-catalog"><summary>+ Agregar producto / Editar carta</summary>'+
    '<p>Los precios son independientes por sucursal. No se modifica Stock Local.</p>'+
    '<form id="mgp-catalog-form" class="mgp-form"><input type="hidden" name="id" value=""><label>Producto<input name="name" minlength="2" maxlength="120" required placeholder="Ej.: Empanada de carne" '+(!canEdit()?'disabled':'')+'></label>'+
    '<label>Precio final en pesos<input name="price" type="number" min="0.01" max="999999.99" step="0.01" required inputmode="decimal" placeholder="0" '+(!canEdit()?'disabled':'')+'></label>'+
    '<button class="mgp-button" type="submit" '+(!canEdit()?'disabled':'')+'>Guardar en la carta</button></form></details>':'')+'</section>';
 const manual='<details class="mgp-config" id="mgp-add-details"><summary>Registrar pedido manualmente (para control interno)</summary>'+
 '<form id="mgp-order-form" class="mgp-form"><label>Nombre del cliente<input name="customer" required minlength="2" maxlength="120" autocomplete="off" placeholder="Nombre y apellido" '+(!canEdit()?'disabled':'')+'></label>'+
 '<label>Teléfono<input name="phone" inputmode="tel" required maxlength="25" autocomplete="off" placeholder="11..." '+(!canEdit()?'disabled':'')+'></label>'+
 '<label>Pedido y cantidades<textarea name="items" required minlength="2" maxlength="4000" rows="3" placeholder="Ej.: 6 carne, 6 jamón y queso" '+(!canEdit()?'disabled':'')+'></textarea></label>'+
 '<label>Total en efectivo ($)<input name="total" type="number" required min="0.01" step="0.01" inputmode="decimal" placeholder="0" '+(!canEdit()?'disabled':'')+'></label>'+
 '<label>Observaciones (opcional)<textarea name="notes" maxlength="1000" rows="2" '+(!canEdit()?'disabled':'')+'></textarea></label>'+
 '<button class="mgp-button" type="submit" '+(!canEdit()?'disabled':'')+'>Guardar pedido</button></form></details>';
 return '<section class="mgp-page" aria-label="Pedidos WhatsApp de Mi Gusto"><header class="mgp-head"><div><small>Mi Gusto · '+esc(LOCALS[local()])+'</small>'+
 '<h2><span class="mgp-title-icon">'+waIcon+'</span> Pedidos WhatsApp</h2><p>Pedidos confirmados por WhatsApp. Pago únicamente en efectivo.</p></div>'+
 '<button type="button" class="mgp-reload" data-mgp-reload '+(!online()?'disabled':'')+'>Actualizar</button></header>'+
 '<div class="mgp-status"><span class="mgp-phone-icon">'+waIcon+'</span><div class="mgp-phone-detail"><span>WhatsApp del local</span><strong>'+esc(formatPhone(phone))+'</strong>'+
 '<small>'+(phone?'Número configurado para '+esc(LOCALS[local()])+' · conexión con Meta pendiente':'Cada sucursal utiliza su propio número')+'</small></div>'+
 (phone?'<a class="mgp-phone-open" href="https://wa.me/'+esc(phone.replace(/[^0-9]/g,''))+'" target="_blank" rel="noopener noreferrer" aria-label="Abrir WhatsApp del local">↗</a>':'')+'</div>'+
 (error?'<p role="alert" class="mgp-error">'+esc(error)+'</p>':'')+
 (notice?'<p role="status" class="mgp-success">'+esc(notice)+'</p>':'')+
 (!online()?'<p role="status" class="mgp-error">Sin conexión: los pedidos solo se consultan y confirman online.</p>':'')+
 catalogPanel+
 '<nav class="mgp-tabs" aria-label="Filtrar pedidos de WhatsApp">'+
 '<button type="button" data-mgp-tab="todos" aria-current="'+(tab==='todos'?'page':'false')+'">Todos ('+items.length+')</button>'+
 '<button type="button" data-mgp-tab="pendientes" aria-current="'+(tab==='pendientes'?'page':'false')+'">Pendientes ('+pending.length+')</button>'+
 '<button type="button" data-mgp-tab="realizados" aria-current="'+(tab==='realizados'?'page':'false')+'">Realizados ('+done.length+')</button></nav>'+
 (loading?'<p role="status">Cargando pedidos…</p>':
 '<div class="mgp-list">'+(selected.length?selected.map(orderCard).join(''):'<p class="mgp-empty">'+(tab==='todos'?'Todavía no hay pedidos registrados.':tab==='pendientes'?'No hay pedidos pendientes.':'Todavía no hay pedidos marcados como realizados.')+'</p>')+'</div>')+
 manual+config+
 '<p class="mgp-footnote">El OK significa que el dueño o gerente vio la comanda, no que se preparó o entregó. No registra cobros ni modifica Caja, Stock o Pagos Online.</p></section>';
}
async function action(method,args,success){
 if(!canEdit())return;
 const targetLocal=local();
 busy=true;error='';notice='';update();
 let saved=false;
 try{
  await rpc(method,args);
  if(local()!==targetLocal)return;
  saved=true;notice=success;await refreshAfterSave();
 }catch(e){error=e.message||'No se pudo guardar.';}
 finally{if(local()===targetLocal){busy=false;update(true,!saved);}}
}
async function refreshAfterSave(){
 const request=++epoch,loc=local();
 try{
  const [result,prices]=await Promise.all([rpc('gestlok_mg_orders_state'),rpc('gestlok_mg_orders_catalog')]);
  if(request===epoch&&loc===local()){
   catalog=Array.isArray(prices)?prices:[];
   acceptOrders(result?.orders,loc);
   phone=String(result?.whatsapp_number||'');loaded=true;
  }
 }catch(e){error='Guardado, pero no se pudo actualizar la lista: '+(e.message||'');}
}
function attach(h){
 if(api)return;api=h;
 document.addEventListener('click',e=>{
  if(api?.S.view!=='pedidos-clientes'||!allowed())return;
  const tabBtn=e.target.closest('[data-mgp-tab]');
  if(tabBtn){const choice=tabBtn.dataset.mgpTab;if(['todos','pendientes','realizados'].includes(choice)){tab=choice;notice='';update();}return;}
  if(e.target.closest('[data-mgp-reload]')){void refresh();return;}
  const edit=e.target.closest('[data-mgp-edit]');
  if(edit&&canSetNumber()&&canEdit()){
   const found=catalog.find(x=>x.id===edit.dataset.mgpEdit);
   const form=document.getElementById('mgp-catalog-form');
   if(found&&form){
     form.elements.namedItem('id').value=found.id;
     form.elements.namedItem('name').value=found.name;
     form.elements.namedItem('price').value=found.price;
     const details=form.closest('details');if(details)details.open=true;
     form.elements.namedItem('name').focus();
   }
   return;
  }
  const disable=e.target.closest('[data-mgp-disable]');
  if(disable&&canEdit()&&canSetNumber()){
    if(window.confirm('¿Ocultar este producto de la carta de WhatsApp?'))
      void action('gestlok_mg_orders_catalog_disable',{p_id:disable.dataset.mgpDisable},'Producto oculto de WhatsApp.');
    return;
  }
  const button=e.target.closest('[data-mgp-receive]');
  if(button&&canEdit()){
   if(!window.confirm('¿Confirmás que el local ya vio esta comanda? Se marcará como Realizado (OK) solo para control interno.'))return;
   void action('gestlok_mg_orders_receive',{p_id:button.dataset.mgpReceive},'✓ OK registrado: comanda vista por el local.');
  }
 });
 document.addEventListener('submit',e=>{
  if(api?.S.view!=='pedidos-clientes'||!allowed())return;
  if(e.target.id==='mgp-order-form'){
   e.preventDefault();if(!canEdit())return;
   const values=new FormData(e.target);
   const total=Number(values.get('total'));
   if(!Number.isFinite(total)||total<=0){error='Ingresá un total válido.';update();return;}
   void action('gestlok_mg_orders_add',{
     p_customer_name:String(values.get('customer')||''),
     p_customer_phone:String(values.get('phone')||''),
     p_items_detail:String(values.get('items')||''),
     p_total:total,p_notes:String(values.get('notes')||'')
   },'Pedido registrado.').then(()=>{if(!error){tab='pendientes';update(true,false);}});
  }
  if(e.target.id==='mgp-catalog-form'){
   e.preventDefault();if(!canEdit()||!canSetNumber())return;
   const values=new FormData(e.target), id=String(values.get('id')||'');
   const price=Number(values.get('price'));
   if(!Number.isFinite(price)||price<=0){error='Ingresá un precio válido.';update();return;}
   void action('gestlok_mg_orders_catalog_save',{
     p_id:id||null,p_name:String(values.get('name')||''),p_price:price
   },'Carta de WhatsApp actualizada.');
  }
  if(e.target.id==='mgp-number-form'){
   e.preventDefault();if(!canEdit()||!canSetNumber())return;
   const number=String(new FormData(e.target).get('number')||'');
   void action('gestlok_mg_orders_set_whatsapp',{p_number:number},'Número de WhatsApp guardado para esta sucursal.');
  }
 });
}
function subscribe(loc,push){
 if(!allowed()||!(loc in LOCALS))return;
 void refresh();
 // La alerta se consulta durante cualquier pantalla, incluso Pagos Online.
 // Se evita redibujar formularios ajenos: solo se actualizan el aviso flotante y los contadores.
 const timer=setInterval(()=>{if(!document.hidden)void checkIncoming();},PAUSE_MS);
 const focused=()=>{void checkIncoming();};
 const visible=()=>{if(!document.hidden)void checkIncoming();};
 window.addEventListener('focus',focused);
 document.addEventListener('visibilitychange',visible);
 push(()=>{clearInterval(timer);window.removeEventListener('focus',focused);document.removeEventListener('visibilitychange',visible);hideAlert();});
}
function reset(){
 epoch++;items=[];catalog=[];phone='';tab='pendientes';loading=false;busy=false;polling=false;
 error='';notice='';loaded=false;firstSnapshot=true;knownOrderIds=new Set();lastNewOrderId='';lastUiSig='';hideAlert();
}
window.GestLokMiGustoOrders=Object.freeze({attach,subscribe,reset,view,permitido:allowed,pendingCount,navBadge,quickAccess,
 _test:{esc,pesos,orderCard,acceptOrders,indicators,formatPhone,checkIncoming}});
})();
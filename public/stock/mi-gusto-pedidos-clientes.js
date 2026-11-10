/* Mi Gusto: Pedidos WhatsApp por sucursal. Los pedidos entran solo desde WhatsApp (API oficial de Meta).
 * Munro y Don Torcuato trabajan por separado: número, conexión con Meta (coexistencia con la app del
 * teléfono), carta, mensajes y pedidos propios. Sin carga manual.
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
let settings=null,fbReady=null,fbAppId='',signupInfo=null;
let polling=false,firstSnapshot=true,knownOrderIds=new Set(),lastNewOrderId='',lastUiSig='',lastAlertSig='';
const PAUSE_MS=12000;
const GRAPH_VERSION='v25.0';
const FORM_IDS='#mgp-order-form,#mgp-number-form,#mgp-catalog-form,#mgp-messages-form,#mgp-meta-form';
const MSG_FIELDS=[['welcome_text','Mensaje de bienvenida',900,'textarea'],['option_order','Opción 1 · pedido',20],['option_prices','Opción 2 · carta',20],
 ['option_human','Opción 3 · local',20],['review_text','Antes de confirmar (resumen)',300,'textarea'],['confirmed_text','Pedido confirmado',600,'textarea'],
 ['human_text','Al elegir «Hablar con el local»',900,'textarea']];
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
const metaLocal=()=>local() in LOCALS;
const localName=()=>LOCALS[local()]||'';
const canConfigure=()=>metaLocal()&&canSetNumber()&&settings?.can_configure===true;
const webhookUrl=()=>String(window.SPM_CONFIG?.url||'https://vgsepaaewbctjsjcpeta.supabase.co').replace(/\/$/,'')+'/functions/v1/mi-gusto-whatsapp';
const customerPhone=x=>{const v=String(x||'').replace(/[^0-9]/g,'');
 if(/^549(11|15)[0-9]{8}$/.test(v))return '+54 9 '+v.slice(3,5)+' '+v.slice(5,9)+'-'+v.slice(9);
 return v?'+'+v:'—';};
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
 if(!force&&document.activeElement?.closest?.(FORM_IDS))return;
 const forms=preserve?Array.from(document.querySelectorAll?.(FORM_IDS)||[]).map(f=>({
  id:f.id,open:!!f.closest('details')?.open,
  // Solo se conserva lo que la persona escribió; lo que vino de la base se vuelve a dibujar actualizado.
  fields:Array.from(f.elements).filter(el=>el.name&&'value' in el&&el.value!==el.defaultValue).map(el=>({name:el.name,value:el.value}))
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
// Mensajes del bot y estado de la conexión de la sucursal. Un error acá no oculta los pedidos.
async function loadSettings(){
 if(!metaLocal())return null;
 const loc=local();
 try{const d=await rpc('gestlok_mg_whatsapp_settings');return d&&typeof d==='object'&&d.local===loc?d:null;}
 catch{return settings;}
}
async function refresh(){
 if(!allowed()||loading||busy||!online())return;
 const request=++epoch,loc=local();
 loading=!loaded;update();
 try{
  const [result,prices,conf]=await Promise.all([rpc('gestlok_mg_orders_state'),rpc('gestlok_mg_orders_catalog'),loadSettings()]);
  if(request!==epoch||loc!==local())return;
  catalog=Array.isArray(prices)?prices:[];settings=conf;
  acceptOrders(result?.orders,loc);
  phone=String(result?.whatsapp_number||'');loaded=true;error='';
 }catch(e){if(request===epoch&&loc===local())error=e.message||'No pudimos consultar los pedidos.';}
 finally{if(request===epoch){loading=false;update();}}
}
function itemsHtml(o){
 const rows=Array.isArray(o.items)?o.items:[];
 if(!rows.length)return escapeLines(o.items_detail);
 return '<ul class="mgp-items">'+rows.map(r=>'<li><span><b>'+esc(r.quantity)+' ×</b> '+esc(r.name)+'</span><span>'+pesos(Number(r.quantity)*Number(r.price))+'</span></li>').join('')+'</ul>';
}
function orderCard(o){
 const done=o.status==='recibido',isWA=o.source==='whatsapp';
 const digits=String(o.customer_phone||'').replace(/[^0-9]/g,'');
 const units=Number(o.units)||0;
 return '<article class="mgp-card'+(done?'':' mgp-card-new')+'"><div class="mgp-card-head">'+
  '<span class="mgp-avatar">'+userIcon+'</span><div class="mgp-customer">'+
  (o.order_code?'<span class="mgp-code">#'+esc(o.order_code)+'</span>':'')+'<strong>'+esc(o.customer_name)+'</strong>'+
  '<small>'+(digits?'<a class="mgp-tel" href="https://wa.me/'+esc(digits)+'" target="_blank" rel="noopener noreferrer">'+esc(customerPhone(digits))+'</a>':'—')+'</small><small>'+date(o.created_at)+'</small></div>'+
  '<span class="mgp-source '+(isWA?'mgp-source-wa':'mgp-source-manual')+'">'+(isWA?waIcon+' WhatsApp':'Carga interna')+'</span></div>'+
  '<div class="mgp-detail">'+itemsHtml(o)+(units?'<small class="mgp-units">'+units+(units===1?' unidad':' unidades')+'</small>':'')+'</div>'+
  (o.notes?'<p class="mgp-note"><b>Observaciones:</b> '+escapeLines(o.notes)+'</p>':'')+
  '<div class="mgp-card-bottom"><span><b>Total: '+pesos(o.total)+'</b><small>Pago únicamente en efectivo</small>'+
  '<small class="mgp-state '+(done?'done':'pending')+'">'+(done?'✓ OK · Realizado':'Pendiente')+'</small></span>'+
  (done?'<span class="mgp-received">✓ Visto: '+date(o.received_at)+'</span>':
  '<button type="button" class="mgp-button mgp-ok" aria-label="Marcar OK: comanda vista por el local" data-mgp-receive="'+esc(o.id)+'" '+(!canEdit()?'disabled':'')+'>✓ OK · Vista</button>')+'</div></article>';
}
function connectionStatus(){
 const c=settings?.connection;
 if(!c)return '<small>Pendiente: conectar este número con WhatsApp Business (Meta). Mientras tanto, el local atiende desde la app del teléfono.</small>';
 return '<small>✓ Conectado con Meta'+(c.is_on_biz_app?' · sigue funcionando en la app del teléfono':'')+'</small>'+
  '<small>Respuestas automáticas: <b>'+(c.bot_enabled?'activadas':'desactivadas')+'</b>'+
  (settings?.last_inbound_at?' · último mensaje: '+date(settings.last_inbound_at):'')+'</small>';
}
function messagesPanel(){
 if(!canConfigure())return '';
 const v=settings?.settings||{};
 const field=([k,label,max,kind])=>'<label>'+label+(kind==='textarea'?
  '<textarea name="'+k+'" maxlength="'+max+'" rows="'+(k==='welcome_text'?4:2)+'" required '+(!canEdit()?'disabled':'')+'>'+esc(v[k]||'')+'</textarea>':
  '<input name="'+k+'" maxlength="'+max+'" minlength="2" required value="'+esc(v[k]||'')+'" '+(!canEdit()?'disabled':'')+'>')+'</label>';
 return '<details class="mgp-config mgp-messages" id="mgp-messages"><summary>Mensajes automáticos de WhatsApp</summary>'+
  '<p>Lo que recibe el cliente al escribir a '+esc(localName())+'. Las opciones son botones de WhatsApp: hasta 20 letras cada una.</p>'+
  '<div class="mgp-wa-preview" aria-label="Vista previa de la bienvenida"><div class="mgp-wa-bubble" data-mgp-preview="welcome_text">'+escapeLines(v.welcome_text||'')+'</div>'+
  ['option_order','option_prices','option_human'].map((k,i)=>'<div class="mgp-wa-option"><span>'+(i+1)+'.</span> <span data-mgp-preview="'+k+'">'+esc(v[k]||'')+'</span></div>').join('')+'</div>'+
  '<form id="mgp-messages-form" class="mgp-form mgp-messages-form">'+MSG_FIELDS.map(field).join('')+
  '<p class="mgp-hint">Al confirmar, el cliente recibe además el N.º de pedido, el total y «Pago: efectivo». Para volver al menú automático puede escribir MENU.</p>'+
  '<button class="mgp-button" type="submit" '+(!canEdit()?'disabled':'')+'>Guardar mensajes</button></form></details>';
}
function copyRow(label,value,id){
 return '<div class="mgp-copy"><span>'+label+'</span><code id="'+id+'">'+esc(value)+'</code><button type="button" data-mgp-copy="'+id+'">Copiar</button></div>';
}
function metaPanel(){
 if(!canConfigure())return '';
 const m=settings?.meta_app||{},c=settings?.connection;
 const ready=!!(m.app_id&&m.config_id&&m.has_app_secret);
 return '<details class="mgp-config mgp-meta" id="mgp-meta"'+(c?'':' open')+'><summary>Conexión con WhatsApp Business (Meta)</summary>'+
  '<ol class="mgp-steps">'+
  '<li><strong>Webhook en Meta</strong><span>En tu app de Meta → WhatsApp → Configuración, pegá estos dos datos y suscribí: messages, account_update, history, smb_app_state_sync y smb_message_echoes.</span>'+
   copyRow('URL de devolución de llamada',webhookUrl(),'mgp-webhook-url')+copyRow('Token de verificación',m.verify_token||'','mgp-verify-token')+
   '<small class="'+(m.webhook_verified_at?'mgp-ok-text':'mgp-wait-text')+'">'+(m.webhook_verified_at?'✓ Meta verificó el webhook: '+date(m.webhook_verified_at):'Meta todavía no verificó el webhook')+'</small></li>'+
  '<li><strong>Datos de la app de Meta</strong><span>Se guardan protegidos. El App Secret no se vuelve a mostrar.</span>'+
   '<p class="mgp-hint">Desde octubre de 2026, la conexión requiere una configuración de <strong>WhatsApp Embedded Signup v4</strong> en Meta. Si Meta indica «no puede registrar clientes», verificá el estado Activo, la autorización de proveedor y la revisión de permisos en developers.facebook.com. El webhook verificado no reemplaza esa autorización. No desconectes WhatsApp Business del teléfono.</p>'+
   '<form id="mgp-meta-form" class="mgp-form"><label>App ID<input name="app_id" inputmode="numeric" pattern="[0-9]{5,25}" required value="'+esc(m.app_id||'')+'" '+(!canEdit()?'disabled':'')+'></label>'+
   '<label>ID de configuración (Inicio de sesión para empresas)<input name="config_id" inputmode="numeric" pattern="[0-9]{5,25}" required value="'+esc(m.config_id||'')+'" '+(!canEdit()?'disabled':'')+'></label>'+
   '<label>App Secret '+(m.has_app_secret?'<small>(guardado ✓ · dejalo vacío para no cambiarlo)</small>':'')+'<input name="app_secret" type="password" autocomplete="off" spellcheck="false" maxlength="64" '+(m.has_app_secret?'':'required ')+(!canEdit()?'disabled':'')+'></label>'+
   '<button class="mgp-button" type="submit" '+(!canEdit()?'disabled':'')+'>Guardar datos de Meta</button></form></li>'+
  '<li><strong>Conectar el número de '+esc(localName())+'</strong><span>Se abre Meta: elegí conectar tu cuenta existente de WhatsApp Business, ingresá el número del local y escaneá el código QR desde la app del teléfono. Los chats del teléfono se conservan.</span>'+
   (c?'<small class="mgp-ok-text">✓ Conectado: '+esc(c.display_phone||'')+(c.verified_name?' · '+esc(c.verified_name):'')+' · '+date(c.connected_at)+'</small>':'')+
   '<button type="button" class="mgp-button mgp-connect" data-mgp-connect '+(!ready||!canEdit()?'disabled':'')+'>'+(c?'Volver a conectar':'Conectar WhatsApp de '+esc(localName()))+'</button>'+
   (!ready?'<small class="mgp-wait-text">Primero guardá App ID, ID de configuración y App Secret.</small>':'')+'</li>'+
  '<li><strong>Respuestas automáticas</strong><span>Con la carta cargada, activalas para que el bot tome los pedidos. Apagadas, el local atiende todo desde el teléfono.</span>'+
   '<button type="button" class="mgp-button '+(c?.bot_enabled?'mgp-bot-off':'mgp-bot-on')+'" data-mgp-bot="'+(c?.bot_enabled?'off':'on')+'" '+(!c||!canEdit()?'disabled':'')+'>'+(c?.bot_enabled?'Desactivar respuestas automáticas':'Activar respuestas automáticas')+'</button></li>'+
  '</ol></details>';
}
function view(){
 if(!allowed())return '<p class="lead">No tenés acceso a los pedidos de esta sucursal.</p>';
 const pending=items.filter(x=>x.status==='nuevo'),done=items.filter(x=>x.status==='recibido');
 const selected=tab==='todos'?items:tab==='realizados'?done:pending;
 const config=canSetNumber()?'<details class="mgp-config"><summary>Número de WhatsApp de '+esc(LOCALS[local()])+'</summary>'+
  '<p>Número propio de esta sucursal. Al conectar con Meta se comprueba que sea este mismo.</p>'+
  '<form id="mgp-number-form"><label>Número con código de país (ej.: 54911... )<input name="number" inputmode="tel" autocomplete="tel" required minlength="10" maxlength="24" value="'+esc(phone)+'" placeholder="54911..." '+(!canEdit()?'disabled':'')+'></label>'+
  '<button class="mgp-button" type="submit" '+(!canEdit()?'disabled':'')+'>Guardar número</button></form></details>':'';
 const catalogPanel='<section class="mgp-catalog-card" aria-label="Carta y precios de WhatsApp">'+
  '<header class="mgp-catalog-head"><span class="mgp-catalog-icon">'+cutleryIcon+'</span><div><strong>Carta y precios para WhatsApp</strong><small>'+catalog.filter(x=>x.active).length+' productos activos en '+esc(LOCALS[local()])+'</small></div></header>'+
  '<div class="mgp-menu-list">'+(catalog.length?catalog.map(x=>'<div class="mgp-menu-item"><div class="mgp-menu-name"><span class="mgp-menu-empanada" aria-hidden="true">◡</span><span><strong>'+esc(x.name)+'</strong>'+(!x.active?'<small>Oculto de WhatsApp</small>':'')+'</span></div><span class="mgp-menu-price">'+pesos(x.price)+'</span>'+
    (canSetNumber()?'<div class="mgp-menu-actions"><button type="button" data-mgp-edit="'+esc(x.id)+'">Editar</button>'+(x.active?'<button type="button" data-mgp-disable="'+esc(x.id)+'">Ocultar</button>':'<button type="button" data-mgp-enable="'+esc(x.id)+'">Mostrar</button>')+'</div>':'')+'</div>').join(''):'<p class="mgp-catalog-empty">Todavía no hay productos cargados. Agregá la carta y precios de esta sucursal.</p>')+'</div>'+
  (canSetNumber()?'<details class="mgp-config mgp-catalog-editor" id="mgp-catalog"><summary>+ Agregar producto / Editar carta</summary>'+
    '<p>Los precios son independientes por sucursal. No se modifica Stock Local.</p>'+
    '<form id="mgp-catalog-form" class="mgp-form"><input type="hidden" name="id" value=""><label>Producto<input name="name" minlength="2" maxlength="120" required placeholder="Ej.: Empanada de carne" '+(!canEdit()?'disabled':'')+'></label>'+
    '<label>Precio final en pesos<input name="price" type="number" min="0.01" max="999999.99" step="0.01" required inputmode="decimal" placeholder="0" '+(!canEdit()?'disabled':'')+'></label>'+
    '<button class="mgp-button" type="submit" '+(!canEdit()?'disabled':'')+'>Guardar en la carta</button></form></details>':'')+'</section>';
 // Los pedidos entran solo desde WhatsApp: sin carga manual en ninguna sucursal de Mi Gusto.
 const manual=metaLocal()?'':'<details class="mgp-config" id="mgp-add-details"><summary>Registrar pedido manualmente (para control interno)</summary>'+
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
 (metaLocal()?connectionStatus():'<small>'+(phone?'Número configurado para '+esc(LOCALS[local()])+' · conexión con Meta pendiente':'Cada sucursal utiliza su propio número')+'</small>')+'</div>'+
 (phone?'<a class="mgp-phone-open" href="https://wa.me/'+esc(phone.replace(/[^0-9]/g,''))+'" target="_blank" rel="noopener noreferrer" aria-label="Abrir WhatsApp del local">↗</a>':'')+'</div>'+
 (error?'<p role="alert" class="mgp-error">'+esc(error)+'</p>':'')+
 (notice?'<p role="status" class="mgp-success">'+esc(notice)+'</p>':'')+
 (!online()?'<p role="status" class="mgp-error">Sin conexión: los pedidos solo se consultan y confirman online.</p>':'')+
 '<nav class="mgp-tabs" aria-label="Filtrar pedidos de WhatsApp">'+
 '<button type="button" data-mgp-tab="todos" aria-current="'+(tab==='todos'?'page':'false')+'">Todos ('+items.length+')</button>'+
 '<button type="button" data-mgp-tab="pendientes" aria-current="'+(tab==='pendientes'?'page':'false')+'">Pendientes ('+pending.length+')</button>'+
 '<button type="button" data-mgp-tab="realizados" aria-current="'+(tab==='realizados'?'page':'false')+'">Realizados ('+done.length+')</button></nav>'+
 (loading?'<p role="status">Cargando pedidos…</p>':
 '<div class="mgp-list">'+(selected.length?selected.map(orderCard).join(''):'<p class="mgp-empty">'+(tab==='todos'?'Todavía no hay pedidos registrados.':tab==='pendientes'?'No hay pedidos pendientes.':'Todavía no hay pedidos marcados como realizados.')+'</p>')+'</div>')+
 catalogPanel+messagesPanel()+metaPanel()+manual+config+
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
  const [result,prices,conf]=await Promise.all([rpc('gestlok_mg_orders_state'),rpc('gestlok_mg_orders_catalog'),loadSettings()]);
  if(request===epoch&&loc===local()){
   catalog=Array.isArray(prices)?prices:[];settings=conf;
   acceptOrders(result?.orders,loc);
   phone=String(result?.whatsapp_number||'');loaded=true;
  }
 }catch(e){error='Guardado, pero no se pudo actualizar la lista: '+(e.message||'');}
}
// ---- Meta Embedded Signup (coexistencia): la persona autorizada conecta el número desde GESTLOK ----
function loadFacebook(appId){
 if(fbReady)return fbReady;
 fbReady=new Promise((resolve,reject)=>{
  window.fbAsyncInit=()=>{try{window.FB.init({appId,autoLogAppEvents:true,xfbml:false,version:GRAPH_VERSION});fbAppId=appId;resolve(window.FB);}catch(e){reject(e);}};
  const tag=document.createElement('script');
  tag.async=true;tag.defer=true;tag.crossOrigin='anonymous';tag.src='https://connect.facebook.net/es_LA/sdk.js';
  tag.onerror=()=>{fbReady=null;reject(new Error('No se pudo abrir Meta. Revisá la conexión e intentá de nuevo.'));};
  document.head.appendChild(tag);
 });
 return fbReady;
}
function onMetaMessage(event){
 let host='';try{host=new URL(event.origin).hostname;}catch{return;}
 if(host!=='facebook.com'&&!host.endsWith('.facebook.com'))return;
 let data=event.data;
 try{if(typeof data==='string')data=JSON.parse(data);}catch{return;}
 if(data?.type!=='WA_EMBEDDED_SIGNUP')return;
 if(String(data.event||'').startsWith('FINISH'))signupInfo={waba_id:String(data.data?.waba_id||''),phone_number_id:String(data.data?.phone_number_id||'')};
}
async function finishConnection(code,targetLocal){
 for(let i=0;i<30&&!signupInfo?.waba_id;i++)await new Promise(r=>setTimeout(r,200));
 if(!signupInfo?.waba_id)throw new Error('Meta no informó la cuenta de WhatsApp. Tocá «Conectar» de nuevo.');
 const {data,error:e}=await window.GestLokSupabase.functions.invoke('mi-gusto-whatsapp',{
  headers:{'x-gestlok-action':'connect'},
  body:{local:targetLocal,code,waba_id:signupInfo.waba_id,phone_number_id:signupInfo.phone_number_id||''}
 });
 if(e){let msg=e.message||'No se pudo completar la conexión.';try{const b=await e.context?.json?.();if(b?.error)msg=b.error;}catch{/* sin detalle */}throw new Error(msg);}
 if(!data?.ok)throw new Error(data?.error||'No se pudo completar la conexión.');
 return data;
}
function connectMeta(){
 if(!canEdit()||!canConfigure())return;
 const m=settings?.meta_app||{};
 if(!m.app_id||!m.config_id||!m.has_app_secret){error='Primero guardá App ID, ID de configuración y App Secret.';update(true);return;}
 // FB.login tiene que abrirse en el mismo toque para que el navegador no bloquee la ventana de Meta.
 if(!window.FB){
  notice='Preparando Meta…';update(true);
  loadFacebook(m.app_id).then(()=>{notice='Listo. Tocá «Conectar WhatsApp de '+localName()+'» otra vez.';update(true);})
   .catch(e=>{error=e.message;notice='';update(true);});
  return;
 }
 if(fbAppId!==m.app_id){window.FB.init({appId:m.app_id,autoLogAppEvents:true,xfbml:false,version:GRAPH_VERSION});fbAppId=m.app_id;}
 const targetLocal=local(),targetName=localName();
 signupInfo=null;error='';notice='Completá los pasos en la ventana de Meta…';busy=true;update(true);
 window.FB.login(response=>{
  const code=response?.authResponse?.code;
  if(!code){busy=false;notice='';error='La conexión con Meta se canceló. No se cambió nada.';update(true);return;}
  notice='Guardando la conexión…';update(true);
  finishConnection(code,targetLocal).then(d=>{
   notice='✓ WhatsApp de '+targetName+' conectado: '+(d.display_phone||'')+(d.is_on_biz_app?' · sigue funcionando en la app del teléfono.':'.');
  }).catch(e=>{error=e.message||'No se pudo completar la conexión.';notice='';})
   .finally(()=>{busy=false;void refreshAfterSave().then(()=>update(true,false));});
 },{config_id:m.config_id,response_type:'code',override_default_response_type:true,
   // Registro insertado v4: Meta retiró los flujos v2/v3 el 15/10/2026.
   // Coexistencia: conservar la app WhatsApp Business del teléfono.
   extras:{setup:{},featureType:'whatsapp_business_app_onboarding',version:'v4'}});
}
async function copyText(id){
 const value=document.getElementById(id)?.textContent||'';
 try{await navigator.clipboard.writeText(value);notice='Copiado.';}
 catch{notice='Seleccioná el texto y copialo a mano.';}
 update(true);
}
function attach(h){
 if(api)return;api=h;
 window.addEventListener('message',onMetaMessage);
 // Al abrir «Conexión con Meta» se prepara el botón de Meta para que el toque abra la ventana.
 document.addEventListener('toggle',e=>{
  if(e.target?.id==='mgp-meta'&&e.target.open&&canConfigure()&&settings?.meta_app?.app_id)
   loadFacebook(settings.meta_app.app_id).catch(()=>{});
 },true);
 document.addEventListener('input',e=>{
  if(api?.S.view!=='pedidos-clientes'||!e.target?.closest?.('#mgp-messages-form'))return;
  const name=e.target.name;
  document.querySelectorAll?.('[data-mgp-preview="'+name+'"]')?.forEach(el=>{
   if(name==='welcome_text')el.innerHTML=escapeLines(e.target.value);else el.textContent=e.target.value;
  });
 });
 document.addEventListener('click',e=>{
  if(api?.S.view!=='pedidos-clientes'||!allowed())return;
  const tabBtn=e.target.closest('[data-mgp-tab]');
  if(tabBtn){const choice=tabBtn.dataset.mgpTab;if(['todos','pendientes','realizados'].includes(choice)){tab=choice;notice='';update();}return;}
  if(e.target.closest('[data-mgp-reload]')){void refresh();return;}
  const copy=e.target.closest('[data-mgp-copy]');
  if(copy){void copyText(copy.dataset.mgpCopy);return;}
  if(e.target.closest('[data-mgp-connect]')){connectMeta();return;}
  const bot=e.target.closest('[data-mgp-bot]');
  if(bot&&canConfigure()&&canEdit()){
   const on=bot.dataset.mgpBot==='on';
   if(on&&!catalog.some(x=>x.active)){error='Cargá al menos un producto con precio en la carta antes de activar las respuestas automáticas.';update(true);return;}
   if(window.confirm(on?'¿Activar las respuestas automáticas en el WhatsApp de '+localName()+'? Los clientes van a recibir la bienvenida y podrán hacer pedidos.':'¿Desactivar las respuestas automáticas de '+localName()+'? El local atiende todo desde el teléfono.'))
    void action('gestlok_mg_whatsapp_set_bot',{p_enabled:on},on?'Respuestas automáticas activadas.':'Respuestas automáticas desactivadas.');
   return;
  }
  const enable=e.target.closest('[data-mgp-enable]');
  if(enable&&canEdit()&&canSetNumber()){
   const found=catalog.find(x=>x.id===enable.dataset.mgpEnable);
   if(found)void action('gestlok_mg_orders_catalog_save',{p_id:found.id,p_name:found.name,p_price:Number(found.price)},'Producto visible otra vez en WhatsApp.');
   return;
  }
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
  if(e.target.id==='mgp-messages-form'){
   e.preventDefault();if(!canEdit()||!canConfigure())return;
   const values=new FormData(e.target),payload={};
   for(const [k] of MSG_FIELDS)payload[k]=String(values.get(k)||'').trim();
   void action('gestlok_mg_whatsapp_settings_save',{p_settings:payload},'Mensajes de WhatsApp guardados.');
  }
  if(e.target.id==='mgp-meta-form'){
   e.preventDefault();if(!canEdit()||!canConfigure())return;
   const values=new FormData(e.target);
   const secret=String(values.get('app_secret')||'').trim();
   void action('gestlok_mg_whatsapp_meta_app_save',{
    p_app_id:String(values.get('app_id')||'').trim(),p_config_id:String(values.get('config_id')||'').trim(),
    p_app_secret:secret||null
   },'Datos de Meta guardados.').then(()=>{const f=document.getElementById('mgp-meta-form');if(f?.elements?.namedItem('app_secret'))f.elements.namedItem('app_secret').value='';});
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
 epoch++;items=[];catalog=[];phone='';settings=null;signupInfo=null;tab='pendientes';loading=false;busy=false;polling=false;
 error='';notice='';loaded=false;firstSnapshot=true;knownOrderIds=new Set();lastNewOrderId='';lastUiSig='';hideAlert();
}
window.GestLokMiGustoOrders=Object.freeze({attach,subscribe,reset,view,permitido:allowed,pendingCount,navBadge,quickAccess,
 _test:{esc,pesos,orderCard,acceptOrders,indicators,formatPhone,checkIncoming,customerPhone,messagesPanel,metaPanel,setSettings:v=>{settings=v;}}});
})();
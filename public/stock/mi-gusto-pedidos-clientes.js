/* Mi Gusto: Pedidos de clientes. No se conecta a WhatsApp hasta configurar Meta.
 * Cada sucursal tiene su propio número y sus propios pedidos en servidor.
 * Caja, Pagos Online, Stock y pedidos de proveedores permanecen independientes. */
(()=>{
'use strict';
const TENANT='cb0dc04a-9a13-434f-a3d0-47f1d8f39670';
const LOCALS={munro:'Munro',torcuato:'Don Torcuato'};
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pesos=x=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:2}).format(Number(x)||0);
const date=x=>x?new Intl.DateTimeFormat('es-AR',{timeZone:'America/Argentina/Buenos_Aires',dateStyle:'short',timeStyle:'short'}).format(new Date(x)):'—';
let api=null,items=[],phone='',tab='nuevos',loading=false,busy=false,error='',notice='',epoch=0,loaded=false;
const local=()=>api?.S?.local;
const allowed=()=>!!api && api.S?.me?.tenant_id===TENANT && local() in LOCALS &&
  !window.GestLokCreatorSupport?.previewRol?.() &&
  (api.miRol()==='dueno'||(api.miRol()==='gerente'&&api.misLocales().includes(local()))||
   (api.miRol()==='creadora'&&!api.S?.ro));
const online=()=>!!api&&!api.S?.offline&&navigator.onLine!==false;
const canEdit=()=>allowed()&&online()&&!busy&&!!window.GestLokSupabase;
const canSetNumber=()=>allowed()&&['dueno','creadora'].includes(api.miRol());
const escapeLines=x=>esc(x).replace(/\n/g,'<br>');
function update(force=false,preserve=true){
 if(api?.S.view!=='pedidos-clientes'||!allowed())return;
 // El refresco periódico no debe cortar la escritura de un pedido.
 if(!force&&document.activeElement?.closest?.('#mgp-order-form,#mgp-number-form'))return;
 const forms=preserve?Array.from(document.querySelectorAll?.('#mgp-order-form,#mgp-number-form')||[]).map(f=>({
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
  const result=await rpc('gestlok_mg_orders_state');
  if(request!==epoch||loc!==local())return;
  items=Array.isArray(result?.orders)?result.orders.filter(x=>x.local===loc):[];
  phone=String(result?.whatsapp_number||'');loaded=true;error='';
 }catch(e){if(request===epoch&&loc===local())error=e.message||'No pudimos consultar los pedidos.';}
 finally{if(request===epoch){loading=false;update();}}
}
function orderCard(o){
 const done=o.status==='recibido';
 return '<article class="mgp-card"><div class="mgp-card-head"><div><strong>'+esc(o.customer_name)+'</strong><small>'+date(o.created_at)+' · '+(o.source==='whatsapp'?'WhatsApp':'Carga interna')+'</small></div>'+
 '<span class="mgp-state '+(done?'done':'pending')+'">'+(done?'✓ Recibido':'Nuevo')+'</span></div>'+
 '<div class="mgp-detail">'+escapeLines(o.items_detail)+'</div>'+
 (o.notes?'<p class="mgp-note">Nota: '+escapeLines(o.notes)+'</p>':'')+
 '<div class="mgp-card-bottom"><span><b>'+pesos(o.total)+'</b><small>Solo efectivo · '+esc(o.customer_phone)+'</small></span>'+
 (done?'<span class="mgp-received">✓ Marcado '+date(o.received_at)+'</span>':
 '<button type="button" class="mgp-button" data-mgp-receive="'+esc(o.id)+'" '+(!canEdit()?'disabled':'')+'>✓ Marcar recibido</button>')+'</div></article>';
}
function view(){
 if(!allowed())return '<p class="lead">No tenés acceso a los pedidos de esta sucursal.</p>';
 const pending=items.filter(x=>x.status==='nuevo'),done=items.filter(x=>x.status==='recibido');
 const selected=tab==='recibidos'?done:pending;
 const config=canSetNumber()?'<details class="mgp-config"><summary>Configurar WhatsApp de '+esc(LOCALS[local()])+'</summary>'+
  '<p>Esta sucursal tendrá su propio número y sus pedidos separados. La automatización requiere conectar después la API oficial de Meta.</p>'+
  '<form id="mgp-number-form"><label>Número con código de país (ej.: 54911... )<input name="number" inputmode="tel" autocomplete="tel" required minlength="10" maxlength="24" value="'+esc(phone)+'" placeholder="54911..." '+(!canEdit()?'disabled':'')+'></label>'+
  '<button class="mgp-button" type="submit" '+(!canEdit()?'disabled':'')+'>Guardar número</button></form></details>':'';
 const manual='<details class="mgp-config" id="mgp-add-details"><summary>Registrar pedido manualmente (para control interno)</summary>'+
 '<form id="mgp-order-form" class="mgp-form"><label>Nombre del cliente<input name="customer" required minlength="2" maxlength="120" autocomplete="off" placeholder="Nombre y apellido" '+(!canEdit()?'disabled':'')+'></label>'+
 '<label>Teléfono<input name="phone" inputmode="tel" required maxlength="25" autocomplete="off" placeholder="11..." '+(!canEdit()?'disabled':'')+'></label>'+
 '<label>Pedido y cantidades<textarea name="items" required minlength="2" maxlength="4000" rows="3" placeholder="Ej.: 6 carne, 6 jamón y queso" '+(!canEdit()?'disabled':'')+'></textarea></label>'+
 '<label>Total en efectivo ($)<input name="total" type="number" required min="0.01" step="0.01" inputmode="decimal" placeholder="0" '+(!canEdit()?'disabled':'')+'></label>'+
 '<label>Observaciones (opcional)<textarea name="notes" maxlength="1000" rows="2" '+(!canEdit()?'disabled':'')+'></textarea></label>'+
 '<button class="mgp-button" type="submit" '+(!canEdit()?'disabled':'')+'>Guardar pedido</button></form></details>';
 return '<section class="mgp-page" aria-label="Pedidos de clientes de Mi Gusto"><header class="mgp-head"><div><small>Mi Gusto · '+esc(LOCALS[local()])+'</small>'+
 '<h2>Pedidos de clientes</h2><p>Pedidos confirmados, control de recepción e historial. Pago únicamente en efectivo.</p></div>'+
 '<button type="button" class="mgp-reload" data-mgp-reload '+(!online()?'disabled':'')+'>Actualizar</button></header>'+
 '<div class="mgp-status"><span>WhatsApp del local</span><strong>'+(phone?'+'+esc(phone):'Pendiente de configurar')+'</strong>'+
 '<small>'+(phone?'Número guardado · conexión automática pendiente':'Cada sucursal utiliza su propio número')+'</small></div>'+
 (error?'<p role="alert" class="mgp-error">'+esc(error)+'</p>':'')+
 (notice?'<p role="status" class="mgp-success">'+esc(notice)+'</p>':'')+
 (!online()?'<p role="status" class="mgp-error">Sin conexión: los pedidos solo se consultan y confirman online.</p>':'')+
 config+manual+
 '<nav class="mgp-tabs" aria-label="Estados de los pedidos"><button type="button" data-mgp-tab="nuevos" aria-current="'+(tab==='nuevos'?'page':'false')+'">Nuevos ('+pending.length+')</button>'+
 '<button type="button" data-mgp-tab="recibidos" aria-current="'+(tab==='recibidos'?'page':'false')+'">Recibidos ('+done.length+')</button></nav>'+
 (loading?'<p role="status">Cargando pedidos…</p>':
 '<div class="mgp-list">'+(selected.length?selected.map(orderCard).join(''):'<p class="mgp-empty">'+(tab==='nuevos'?'No hay pedidos nuevos.':'Todavía no hay pedidos recibidos.')+'</p>')+'</div>')+
 '<p class="mgp-footnote">Este módulo no registra cobros, no descuenta stock y no modifica Caja ni Pagos Online.</p></section>';
}
async function action(method,args,success){
 if(!canEdit())return;
 busy=true;error='';notice='';update();
 let saved=false;
 try{
  await rpc(method,args);
  saved=true;notice=success;await refreshAfterSave();
 }catch(e){error=e.message||'No se pudo guardar.';}
 finally{busy=false;update(true,!saved);}
}
async function refreshAfterSave(){
 const request=++epoch,loc=local();
 try{
  const result=await rpc('gestlok_mg_orders_state');
  if(request===epoch&&loc===local()){
   items=Array.isArray(result?.orders)?result.orders.filter(x=>x.local===loc):[];
   phone=String(result?.whatsapp_number||'');loaded=true;
  }
 }catch(e){error='Guardado, pero no se pudo actualizar la lista: '+(e.message||'');}
}
function attach(h){
 if(api)return;api=h;
 document.addEventListener('click',e=>{
  if(api?.S.view!=='pedidos-clientes'||!allowed())return;
  const tabBtn=e.target.closest('[data-mgp-tab]');
  if(tabBtn){tab=tabBtn.dataset.mgpTab;notice='';update();return;}
  if(e.target.closest('[data-mgp-reload]')){void refresh();return;}
  const button=e.target.closest('[data-mgp-receive]');
  if(button&&canEdit()){
   if(!window.confirm('¿Confirmás que el local recibió este pedido?'))return;
   void action('gestlok_mg_orders_receive',{p_id:button.dataset.mgpReceive},'Pedido marcado como recibido.');
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
   },'Pedido registrado.').then(()=>{if(!error)tab='nuevos';});
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
 const timer=setInterval(()=>{if(api?.S.view==='pedidos-clientes'&&!document.hidden&&!busy)void refresh();},20000);
 const focused=()=>{if(api?.S.view==='pedidos-clientes')void refresh();};
 window.addEventListener('focus',focused);
 push(()=>{clearInterval(timer);window.removeEventListener('focus',focused);});
}
function reset(){epoch++;items=[];phone='';tab='nuevos';loading=false;busy=false;error='';notice='';loaded=false;}
window.GestLokMiGustoOrders=Object.freeze({attach,subscribe,reset,view,permitido:allowed,_test:{esc,pesos,orderCard}});
})();
/* ZAYRO · TiendaNube: panel privado de movimientos, sin afectar Caja ni Scanner.
   Los datos llegan exclusivamente del espejo RLS de Supabase. Nunca hay token TN en el navegador. */
(()=>{
 'use strict';
 if(window.GestLokTiendaNube)return;
 const TENANT='2a97bf8d-7d08-4aa7-b051-5d1a4dc80103';
 const OWNER='camilab.lopez99@gmail.com', CREATOR='kmu15lopez@gmail.com';
 const STATE='gestlok_zayro_tn_state', ORDERS='gestlok_zayro_tn_orders';
 const $=s=>document.querySelector(s);
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const money=n=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:2}).format(Number(n)||0);
 const stamp=n=>n?new Intl.DateTimeFormat('es-AR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Argentina/Buenos_Aires'}).format(new Date(n)):'Nunca';
 const orderStates={open:'Abierto',closed:'Cerrado',cancelled:'Cancelado'};
 const payStates={paid:'Pagado',pending:'Pendiente',authorized:'Autorizado',partially_paid:'Pago parcial',refunded:'Reembolsado',partially_refunded:'Reembolso parcial',voided:'Anulado',expired:'Vencido',abandoned:'Abandonado',chargeback:'Contracargo'};
 const shipStates={unfulfilled:'Sin preparar',unpacked:'Sin preparar',in_preparation:'En preparación',packed:'Preparado',shipped:'Enviado',dispatched:'Despachado',fulfilled:'Cumplido',delivered:'Entregado',pickup_ready:'Listo para retirar',ready_for_pickup:'Listo para retirar',unshipped:'Sin enviar'};
 let api=null,ctx=null,allowed=false,checking=false,checked=false,generation=0;
 let visible=false,busy=false,loading=false,notice='',error='',state=null,orders=[],filter='todos';
 const db=()=>window.GestLokSupabase;
 function contextOK(c,h){
  if(c?.tenant_id!==TENANT||c?.role!=='dueno'||h?.S?.me?.tenant_id!==TENANT)return false;
  const email=String(h.S.me.email||'').toLowerCase();
  return (h?.role?.()==='dueno'&&email===OWNER)||
   (h?.role?.()==='creadora'&&h?.isCreadora?.()===true&&email===CREATOR);
 }
 function userOK(u){return !!u?.id&&[OWNER,CREATOR].includes(String(u.email||'').toLowerCase());}
 function reset(){
  generation++;allowed=false;checking=false;checked=false;api=null;ctx=null;state=null;orders=[];
  if(visible)close(false);
 }
 async function refresh(c,h){
  if(!contextOK(c,h)){reset();return;}
  ctx=c;api=h;
  if(checked||checking)return;
  checking=true;const ticket=generation;
  try{
   const auth=await db().auth.getUser();
   if(ticket!==generation)return;
   if(auth.error||!userOK(auth.data?.user))throw Error('Cuenta sin autorización');
   const r=await db().from(STATE).select('tenant_id').eq('tenant_id',TENANT).limit(1);
   if(r.error)throw r.error;
   allowed=!!r.data?.length;
  }catch{if(ticket===generation)allowed=false;}
  finally{if(ticket===generation){checked=true;checking=false;h.render?.();}}
 }
 function authorized(){return allowed&&contextOK(ctx,api);}
 function homeTile(){
  if(!authorized())return '';
  return '<section class="gl-tn-entry"><div><small>VENTAS ONLINE · ZAYRO</small><h2>TiendaNube</h2>'+
   '<p>Consultá pedidos, cobros y entregas de tu tienda online desde GESTLOK.</p></div>'+
   '<button type="button" data-tn-open>Abrir movimientos →</button></section>';
 }
 async function verify(){
  if(!authorized())throw Error('Sin permisos para ver esta tienda.');
  const r=await db().auth.getUser();
  if(r.error||!userOK(r.data?.user))throw Error('Necesitás una sesión autorizada.');
 }
 async function load({preserveMessage=false}={}){
  loading=true;if(!preserveMessage)error='';render();
  try{
   await verify();
   const [s,o]=await Promise.all([
    db().from(STATE).select('connection_state,store_domain,last_sync_at,last_sync_count,last_error').eq('tenant_id',TENANT).single(),
    db().from(ORDERS).select('order_id,order_number,order_status,payment_status,fulfillment_status,total_amount,currency,shipping_method,item_count,created_at_tn').eq('tenant_id',TENANT).order('created_at_tn',{ascending:false}).limit(100)
   ]);
   if(s.error)throw s.error;if(o.error)throw o.error;
   state=s.data;orders=o.data||[];
  }catch(e){error=e.message||'No se pudieron cargar los movimientos.';}
  finally{loading=false;render();}
 }
 const badge=(s,type)=>'<span class="gl-tn-chip '+(type==='payment'&&s==='paid'?'is-paid':s==='cancelled'?'is-cancelled':'')+'">'+
  esc((type==='payment'?payStates:type==='shipping'?shipStates:orderStates)[s]||s||'Sin datos')+'</span>';
 function render(){
  const root=$('#gl-tn-root');if(!root)return;
  root.hidden=!visible;if(!visible){root.innerHTML='';return;}
  const paid=orders.filter(o=>o.payment_status==='paid'&&o.order_status!=='cancelled');
  const pending=orders.filter(o=>['pending','authorized','partially_paid'].includes(o.payment_status)&&o.order_status!=='cancelled');
  const inTransit=orders.filter(o=>['shipped','dispatched'].includes(o.fulfillment_status));
  const found=orders.filter(o=>filter==='todos'||(filter==='pagados'&&paid.includes(o))||
    (filter==='pendientes'&&pending.includes(o))||(filter==='envios'&&inTransit.includes(o)));
  const connected=state?.connection_state==='connected';
  root.innerHTML='<div class="gl-tn-backdrop" data-tn-background><section class="gl-tn-panel" role="dialog" aria-modal="true" aria-labelledby="gl-tn-title">'+
    '<header class="gl-tn-header"><div><small>ZAYRO · TIENDA ONLINE</small><h1 id="gl-tn-title">TiendaNube</h1>'+
    '<p>Movimientos de pedidos, pagos y envíos. Consulta independiente de la Caja.</p></div>'+
    '<button type="button" data-tn-close class="gl-tn-close" aria-label="Volver al local">✕</button></header>'+
    '<main class="gl-tn-main">'+
    (error?'<p class="gl-tn-alert" role="alert">'+esc(error)+'</p>':'')+
    (notice?'<p class="gl-tn-notice" role="status">'+esc(notice)+'</p>':'')+
    '<div class="gl-tn-connection"><div><strong>'+ (connected?'Tienda vinculada':state?.connection_state==='error'?'Revisar conexión':'Conexión pendiente de autorización')+'</strong>'+
    '<p>'+ (connected?'Última sincronización: '+esc(stamp(state?.last_sync_at))+' · '+esc(state?.last_sync_count)+' pedidos consultados':
       'La tienda ZAYRO ya existe en Tiendanube, pero todavía falta autorizar el acceso de GESTLOK. La conexión de ChatGPT no se transfiere a esta aplicación.')+
    '</p>'+(state?.last_error&&!connected?'<p role="alert">'+esc(state.last_error)+'</p>':'')+
    '</div><button type="button" data-tn-refresh '+(busy||loading?'disabled':'')+'>'+
      (busy?'Comprobando…':connected?'Actualizar movimientos':'Verificar conexión')+'</button></div>'+
    (!connected?'<details class="gl-tn-connect-help"><summary>Cómo conectar ZAYRO con GESTLOK</summary>'+
      '<p>La dueña debe autorizar una aplicación GESTLOK en Tiendanube con permiso de lectura de pedidos (<code>read_orders</code>).</p>'+
      '<p>Una vez autorizada, la persona que administra Supabase debe guardar el ID de tienda, el ID de aplicación y el token en los secretos privados del proyecto. No compartas tokens ni contraseñas por chat.</p>'+
      '<p>Después, tocá <strong>Verificar conexión</strong>. GESTLOK importará los estados de pedidos, pagos y entregas sin modificar Caja, ventas ni stock.</p>'+
      '<a href="https://tiendanube.dev/docs-api/authentication" target="_blank" rel="noopener noreferrer">Instrucciones oficiales de Tiendanube</a></details>':'')+
    (loading?'<p role="status" class="gl-tn-loading">Consultando movimientos…</p>':
    '<div class="gl-tn-summary" aria-label="Resumen de pedidos importados">'+
     [['Pedidos',orders.length],['Pagados',paid.length],['Pendientes',pending.length],['En envío',inTransit.length]].map(([label,value])=>
       '<div><small>'+label+'</small><strong>'+value+'</strong></div>').join('')+'</div>'+
     '<div class="gl-tn-toolbar"><div><h2>Movimientos de TiendaNube</h2><p>Últimos 100 pedidos sincronizados. Los importes no se suman a la Caja de GESTLOK.</p></div>'+
     '<a href="https://zayroparfum.mitiendanube.com" target="_blank" rel="noopener noreferrer">Ver tienda ↗</a></div>'+
     '<div class="gl-tn-filters">'+[['todos','Todos'],['pagados','Pagados'],['pendientes','Pendientes'],['envios','En envío']].map(([id,label])=>
        '<button type="button" data-tn-filter="'+id+'" '+(filter===id?'aria-pressed="true"':'aria-pressed="false"')+'>'+label+'</button>').join('')+'</div>'+
     (found.length?'<div class="gl-tn-orders">'+found.map(o=>
       '<article class="gl-tn-order"><div class="gl-tn-order-head"><div><small>Pedido</small><strong>#'+esc(o.order_number||o.order_id)+'</strong></div>'+
        '<strong>'+esc(money(o.total_amount))+'</strong></div>'+
        '<div class="gl-tn-order-tags">'+badge(o.order_status,'order')+badge(o.payment_status,'payment')+
         badge(o.fulfillment_status,'shipping')+'</div>'+
        '<p>'+esc(o.item_count)+' producto(s) · '+esc(o.shipping_method||'Entrega sin especificar')+
         ' · '+esc(stamp(o.created_at_tn))+'</p></article>').join('')+'</div>':
       '<div class="gl-tn-empty"><strong>'+(!connected?'Todavía sin sincronizar':'No hay movimientos en este filtro')+'</strong><p>'+
          (!connected?'Una vez vinculada la tienda, acá vas a ver sus movimientos reales. No se inventan ventas ni importes.':
            'Los pedidos nuevos aparecerán después de la próxima sincronización.')+'</p></div>'))+
    '<div class="gl-tn-footer"><button type="button" data-tn-close>Volver al local</button></div></main></section></div>';
 }
 function ensureRoot(){
  let root=$('#gl-tn-root');if(!root){root=document.createElement('div');root.id='gl-tn-root';document.body.append(root);}
 }
 async function open(){
  if(!authorized()||visible)return;
  visible=true;filter='todos';notice='';error='';ensureRoot();
  window.history?.pushState({...window.history.state,glTiendaNube:true},'');
  render();await load();
 }
 function close(back=true){
  visible=false;render();
  if(back&&window.history?.state?.glTiendaNube)window.history.back?.();
 }
 async function sync(){
  if(busy||loading)return;
  busy=true;notice='';error='';render();
  try{
   await verify();
   const result=await db().functions.invoke('zayro-tiendanube-sync',{body:{action:'sync'}});
   if(result.error){
    // En respuestas 409 de Edge Functions, supabase-js entrega el detalle en error.context.
    // Mostrar el motivo de autorización sin exponer tokens ni mensajes internos del servidor.
    let detail=result.data;
    if(!detail&&result.error.context?.json){
      try{detail=await result.error.context.json();}catch{}
    }
    throw Error(typeof detail?.message==='string'?detail.message:
      result.error?.message||'No se pudo sincronizar.');
   }
   if(result.data?.ok!==true)throw Error(result.data?.message||'Sincronización no disponible.');
   notice='Movimientos actualizados.';
  }catch(e){error=e.message||'No se pudo actualizar.';}
  finally{busy=false;await load({preserveMessage:true});if(visible)render();}
 }
 document.addEventListener('click',e=>{
  const t=e.target;
  if(t.closest?.('[data-tn-open]')){e.preventDefault();void open();return;}
  if(!visible)return;
  if(t.closest?.('[data-tn-close]')||(t.hasAttribute?.('data-tn-background'))){e.preventDefault();close();return;}
  if(t.closest?.('[data-tn-refresh]')){e.preventDefault();void sync();return;}
  const item=t.closest?.('[data-tn-filter]');
  if(item){filter=item.dataset.tnFilter;render();}
 });
 window.addEventListener?.('popstate',()=>{if(visible&&!window.history?.state?.glTiendaNube)close(false);});
 document.addEventListener('keydown',e=>{if(visible&&e.key==='Escape')close();});
 window.GestLokTiendaNube=Object.freeze({refresh,homeTile,authorized,open,reset});
})();

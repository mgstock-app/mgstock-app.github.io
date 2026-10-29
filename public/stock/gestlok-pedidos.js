/* GESTLOK Pedidos · módulo privado de la tienda piloto Perfumes.
 * Productos propios sin artículos ficticios. Precios opcionales.
 * RLS + validación de snapshots y cierre irreversible en Supabase.
 */
(() => {
 'use strict';
 const TENANT='2a97bf8d-7d08-4aa7-b051-5d1a4dc80103';
 const $=sel=>document.querySelector(sel);
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
 const fmt=n=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS'}).format(Number(n));
 function currentDate(){
  const p=Object.fromEntries(new Intl.DateTimeFormat('es-AR',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(x=>[x.type,x.value]));
  return p.year+'-'+p.month+'-'+p.day;
 }
 function shift(date,days){const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
 function dayLabel(date){return new Intl.DateTimeFormat('es-AR',{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(date+'T12:00:00Z'));}
 let day=currentDate(),tab='cargar',products=[],orders=[],closures=[],draft={},draftMeta={customer:'',reference:'',notes:''},search='',busy=false,loading=false,error='',notice='',ready=false,historyDays=7;
 const statuses={pendiente:'Pendiente',preparado:'Preparado',entregado:'Entregado',sin_realizar:'Sin realizar',cancelado:'Cancelado'};
 function db(){return window.GestLokSupabase;}
 function authorized(){return window.GestLokPilot?.authorized?.()===true;}
 async function check(){
  if(!authorized())throw Error('Sin acceso autorizado a Pedidos.');
  const {data,error:e}=await db().auth.getUser();
  if(e||!data?.user)throw Error('Debés iniciar sesión para consultar pedidos.');
  return data.user;
 }
 async function load(){
  loading=true;error='';renderParent();
  try{
   await check();
   const from=shift(currentDate(),-45);
   const [p,o,c]=await Promise.all([
    db().from('gestlok_pilot_products')
      .select('id,name,category,sku,unit_price,in_stock,active').eq('tenant_id',TENANT)
      .order('name',{ascending:true}).limit(500),
    db().from('gestlok_pilot_orders')
      .select('id,day,customer,reference,status,reason,notes,items,created_at,updated_at')
      .eq('tenant_id',TENANT).gte('day',from).order('created_at',{ascending:false}).limit(900),
    db().from('gestlok_pilot_order_closures')
      .select('id,day,closed_at').eq('tenant_id',TENANT).gte('day',from)
      .order('day',{ascending:false}).limit(60)
   ]);
   if(p.error)throw p.error;if(o.error)throw o.error;if(c.error)throw c.error;
   products=p.data||[];orders=o.data||[];closures=c.data||[];
   if(closures.some(x=>x.day===day)&&day===currentDate())day=shift(day,1);
   ready=true;
  }catch(e){error=e.message||'No pudimos consultar pedidos.';ready=false;}
  finally{loading=false;renderParent();}
 }
 function renderParent(){window.GestLokPilot?.rerender?.();}
 function statusDay(){return closures.some(x=>x.day===day);}
 function ordersDay(){return orders.filter(o=>o.day===day);}
 function totalItems(rows,states){
  const totals=new Map();
  for(const o of rows)if(states.includes(o.status))for(const line of o.items||[]){
   const key=String(line.product_id);
   const item=totals.get(key)||{name:line.name,category:line.category,quantity:0,money:0,priced:true};
   item.quantity+=Number(line.quantity)||0;
   if(line.unit_price==null)item.priced=false;
   else item.money+=Number(line.unit_price)*Number(line.quantity);
   totals.set(key,item);
  }
  return [...totals.values()].sort((a,b)=>b.quantity-a.quantity||a.name.localeCompare(b.name,'es'));
 }
 function kpis(rows){
  return [
   ['Pedidos preparados',rows.filter(o=>o.status==='preparado'||o.status==='entregado').length],
   ['Pedidos entregados',rows.filter(o=>o.status==='entregado').length],
   ['Pendientes / sin realizar',rows.filter(o=>o.status==='pendiente'||o.status==='sin_realizar').length],
   ['Productos sin stock',products.filter(p=>p.active&&!p.in_stock).length]
  ];
 }
 function lineItems(o){return (o.items||[]).map(x=>esc(x.name)+' × '+x.quantity).join(', ')||'Sin productos asociados';}
 function badge(o){return '<span class="gl-order-status gl-order-status-'+esc(o.status)+'">'+esc(statuses[o.status]||o.status)+'</span>';}
 function list(rows,withActions=false){
  if(!rows.length)return '<div class="gl-order-empty">Todavía no hay pedidos en esta sección.</div>';
  return '<div class="gl-order-list">'+rows.map(o=>{
   const canChange=withActions&&!statusDay()&&day===o.day;
   return '<article class="gl-order-item"><div class="gl-order-item-head"><b>Pedido #'+esc(o.id.slice(0,8).toUpperCase())+'</b>'+badge(o)+'</div>'+
   '<p>'+esc(o.customer||'Cliente no indicado')+(o.reference?' · Ref. '+esc(o.reference):'')+'</p>'+
   '<small>'+lineItems(o)+'</small>'+(o.reason?'<small>Motivo: '+esc(o.reason)+'</small>':'')+
   (canChange?'<div class="gl-order-item-actions">'+
    (o.status==='pendiente'?'<button data-orders-status="preparado" data-orders-id="'+o.id+'">Preparado</button>':'')+
    (o.status==='preparado'?'<button data-orders-status="entregado" data-orders-id="'+o.id+'">Entregado</button>':'')+
    (['pendiente','preparado'].includes(o.status)?'<button data-orders-status="sin_realizar" data-orders-id="'+o.id+'">Sin realizar</button><button data-orders-status="cancelado" data-orders-id="'+o.id+'">Anular</button>':'')+
    '</div>':'')+'</article>';
  }).join('')+'</div>';
 }
 function productsUI(){
  const available=products.filter(p=>p.active);
  if(!available.length)return '<div class="gl-order-empty"><b>No hay productos cargados.</b><p>En Catálogo podés ingresar tus perfumes y productos capilares. Nada se importó ni inventó.</p><button data-orders-tab="catalogo">Ir a Catálogo</button></div>';
  const categories=[...new Set(available.map(p=>p.category||'Sin categoría'))];
  return '<label class="gl-order-search">Buscar producto<input type="search" data-orders-search placeholder="Nombre o código..." value="'+esc(search)+'"></label>'+
   '<div class="gl-order-products">'+categories.map(cat=>
    '<section class="gl-order-product-group"><h3>'+esc(cat)+'</h3>'+
    available.filter(p=>(p.category||'Sin categoría')===cat).map(p=>
    '<div class="gl-order-product" data-orders-product="'+p.id+'" data-order-name="'+esc((p.name+' '+p.sku).toLowerCase())+'">'+
    '<div><strong>'+esc(p.name)+'</strong><small>'+(p.sku?esc(p.sku)+' · ':'')+
     (p.unit_price==null?'Precio sin cargar':fmt(p.unit_price))+'</small></div>'+
    (p.in_stock?'<div class="gl-order-qty">'+
      '<button type="button" data-orders-minus="'+p.id+'" aria-label="Restar '+esc(p.name)+'">−</button>'+
      '<output aria-label="Cantidad">'+(draft[p.id]||0)+'</output>'+
      '<button type="button" data-orders-plus="'+p.id+'" aria-label="Agregar '+esc(p.name)+'">+</button></div>':
      '<span class="gl-order-no-stock">Sin stock</span>')+'</div>').join('')+'</section>'
   ).join('')+'</div>';
 }
 function orderForm(){
  const count=Object.values(draft).reduce((s,x)=>s+x,0);
  return '<div class="gl-order-caption"><h2>Armar un pedido</h2><p>Agregá productos con + y −. Cada pedido queda guardado con fecha y cantidades.</p></div>'+
   '<form id="gl-orders-create"><div class="gl-order-fields"><label>Cliente (opcional)<input name="customer" maxlength="120" value="'+esc(draftMeta.customer)+'" placeholder="Nombre o referencia"></label>'+
   '<label>N.º de pedido externo (opcional)<input name="reference" maxlength="100" value="'+esc(draftMeta.reference)+'" placeholder="Ej.: número de Tiendanube"></label></div>'+
   '<label>Notas (opcional)<textarea name="notes" rows="2" maxlength="800" placeholder="Detalle de entrega o preparación">'+esc(draftMeta.notes)+'</textarea></label>'+
   productsUI()+
   '<div class="gl-order-actionbar"><div><strong>'+count+' unidades seleccionadas</strong><small>Los precios son opcionales. No se genera una venta automáticamente.</small></div>'+
   '<button type="submit" '+(!count||busy||statusDay()?'disabled':'')+'>Guardar pedido preparado</button>'+
   '<button type="button" data-orders-save-pending '+(!count||busy||statusDay()?'disabled':'')+'>Guardar pendiente</button></div></form>';
 }
 function notDone(){
  return '<div class="gl-order-caption"><h2>Pedidos sin realizar</h2><p>Registrá solicitudes que no pudieron completarse y el motivo.</p></div>'+
   (!statusDay()?'<form id="gl-orders-not-done" class="gl-order-not-done">'+
    '<label>N.º o referencia (opcional)<input name="reference" maxlength="100" placeholder="Pedido #"></label>'+
    '<label>Motivo<input name="reason" maxlength="300" required placeholder="Ej.: cliente canceló"></label>'+
    '<button type="submit" '+(busy?'disabled':'')+'>Registrar sin realizar</button></form>':'')+
   list(ordersDay().filter(o=>o.status==='sin_realizar'||o.status==='cancelado'))+
   '<h3>Pendientes</h3>'+list(ordersDay().filter(o=>o.status==='pendiente'),true);
 }
 function closeUI(){
  const rows=ordersDay(),made=totalItems(rows,['preparado','entregado']),sold=totalItems(rows,['entregado']);
  const delivered=rows.filter(o=>o.status==='entregado');
  const knownRevenue=delivered.every(o=>(o.items||[]).every(x=>x.unit_price!=null));
  const revenue=knownRevenue?fmt(delivered.reduce((s,o)=>s+(o.items||[]).reduce((a,x)=>a+Number(x.unit_price)*Number(x.quantity),0),0)):'Sin calcular: faltan precios';
  return '<div class="gl-order-caption"><h2>Cierre del día</h2><p>Pedidos preparados, entregas, faltantes y cantidades por producto.</p></div>'+
   '<div class="gl-order-summary"><div><small>Realizados</small><strong>'+rows.filter(x=>['preparado','entregado'].includes(x.status)).length+'</strong></div>'+
    '<div><small>Sin realizar</small><strong>'+rows.filter(x=>['sin_realizar','cancelado'].includes(x.status)).length+'</strong></div>'+
    '<div><small>Entregados</small><strong>'+delivered.length+'</strong></div></div>'+
   '<div class="gl-order-chart"><h3>Productos más preparados</h3>'+ranking(made)+
    '<h3>Productos más vendidos (entregados)</h3>'+ranking(sold)+
    '<p><strong>Valor de pedidos entregados: '+esc(revenue)+'</strong></p>'+
    '<small>No incluye pedidos pendientes, preparados sin entregar ni cancelados. No es una conciliación contable.</small></div>'+
   '<h3>Pedidos realizados</h3>'+list(rows.filter(x=>['preparado','entregado'].includes(x.status)),true)+
   '<h3>Productos sin stock</h3>'+
   (products.some(x=>x.active&&!x.in_stock)?'<div class="gl-order-list">'+products.filter(x=>x.active&&!x.in_stock).map(x=>'<div class="gl-order-item">'+esc(x.name)+' <b class="gl-order-red">Sin stock</b></div>').join('')+'</div>':
    '<div class="gl-order-empty">Sin productos marcados como faltantes.</div>')+
   (!statusDay()?'<div class="gl-order-finalize"><p>Al finalizar el día, el cierre queda bloqueado para conservar el historial.</p>'+
    '<button type="button" data-orders-close '+(busy?'disabled':'')+'>Finalizar día →</button></div>':
    '<div class="gl-order-finalized">Día finalizado: los pedidos de esta fecha quedan en modo lectura.</div>');
 }
 function ranking(rows){
  if(!rows.length)return '<p class="gl-order-empty">Sin productos registrados en esta categoría.</p>';
  return '<ol class="gl-order-ranking">'+rows.map((r,i)=>'<li><span>'+esc(r.name)+'</span><b>'+r.quantity+' u.</b></li>').join('')+'</ol>';
 }
 function catalog(){
  return '<div class="gl-order-caption"><h2>Catálogo de Cami</h2><p>Ingresá solamente tus productos reales. Los nombres, categorías y precios son configurables.</p></div>'+
   '<form id="gl-orders-product" class="gl-order-catalog-form">'+
    '<label>Producto<input required minlength="2" maxlength="140" name="name" placeholder="Nombre del perfume o producto"></label>'+
    '<label>Categoría<input name="category" maxlength="80" placeholder="Categoría"></label>'+
    '<label>Código (opcional)<input name="sku" maxlength="80" placeholder="SKU"></label>'+
    '<label>Precio unitario (opcional, ARS)<input name="unit_price" type="number" step="0.01" min="0" placeholder="Dejar vacío si todavía no tiene precio"></label>'+
    '<button type="submit" '+(busy?'disabled':'')+'>Agregar producto</button></form>'+
   '<h3>Mis productos ('+products.filter(x=>x.active).length+')</h3>'+
   (!products.some(x=>x.active)?'<div class="gl-order-empty">Todavía no hay productos. Agregalos arriba.</div>':
    '<div class="gl-order-list">'+products.filter(x=>x.active).map(x=>
     '<div class="gl-order-item gl-order-catalog-item"><div><b>'+esc(x.name)+'</b><small>'+esc(x.category||'Sin categoría')+
     (x.sku?' · '+esc(x.sku):'')+' · '+(x.unit_price==null?'Sin precio':fmt(x.unit_price))+'</small></div>'+
     '<button type="button" data-orders-stock="'+x.id+'" '+(busy?'disabled':'')+'>'+
      (x.in_stock?'Marcar sin stock':'Marcar disponible')+'</button></div>').join('')+'</div>');
 }
 function historyUI(){
  const history=Array.from({length:historyDays},(_,i)=>shift(currentDate(),-i));
  return '<div class="gl-order-caption"><h2>Historial de pedidos</h2><p>Seleccioná un día para revisar sus pedidos y productos.</p></div>'+
   '<div class="gl-order-history-choices"><button type="button" data-orders-period="7" '+(historyDays===7?'aria-pressed="true"':'')+'>7 días</button>'+
   '<button type="button" data-orders-period="30" '+(historyDays===30?'aria-pressed="true"':'')+'>30 días</button></div>'+
   '<div class="gl-order-list">'+history.map(date=>{
    const rows=orders.filter(x=>x.day===date);
    return '<button type="button" class="gl-order-day" data-orders-day="'+date+'"><strong>'+esc(dayLabel(date))+'</strong>'+
     '<span>'+rows.length+' pedidos · '+(closures.some(x=>x.day===date)?'Cerrado':'Abierto')+'</span></button>';
   }).join('')+'</div>';
 }
 function render(){
  const rows=ordersDay();
  return '<section class="gl-orders"><header class="gl-order-header"><div><small>GESTLOK · PILOTO DE CAMI</small>'+
   '<h2>Pedidos</h2><p>Control diario de la tienda Perfumes</p></div>'+
   '<div class="gl-order-date"><button type="button" data-orders-prev aria-label="Día anterior">‹</button>'+
   '<strong>'+esc(dayLabel(day))+'</strong><button type="button" data-orders-next aria-label="Día siguiente">›</button></div></header>'+
   (error?'<p role="alert" class="gl-order-error">'+esc(error)+'</p>':'')+
   (notice?'<p role="status" class="gl-order-notice">'+esc(notice)+'</p>':'')+
   (loading?'<p role="status">Cargando pedidos de tu empresa…</p>':!ready?'<p>No se pudo verificar esta sección. Volvé a intentar.</p>'+
    '<button type="button" data-orders-refresh>Reintentar</button>':
    '<div class="gl-order-stats">'+kpis(rows).map(([a,b])=>
     '<div><small>'+esc(a)+'</small><strong>'+b+'</strong></div>').join('')+'</div>'+
    (statusDay()?'<div class="gl-order-finalized">Jornada finalizada · Consulta de solo lectura</div>':'')+
    '<nav class="gl-order-tabs" aria-label="Secciones de pedidos">'+[
      ['cargar','Cargar pedido'],['sin_realizar','Sin realizar'],['cierre','Cierre'],['historial','Historial'],['catalogo','Catálogo']
     ].map(([id,name])=>'<button type="button" data-orders-tab="'+id+'" '+(tab===id?'aria-current="page"':'')+'>'+name+'</button>').join('')+'</nav>'+
    (tab==='cargar'?(statusDay()?'<div class="gl-order-empty">Esta jornada ya está finalizada.</div>':orderForm())+
       '<h3>Pedidos del día</h3>'+list(rows.filter(x=>['pendiente','preparado','entregado'].includes(x.status)),true):
      tab==='sin_realizar'?notDone():tab==='cierre'?closeUI():tab==='historial'?historyUI():catalog())
    )+'</section>';
 }
 async function open(){tab='cargar';draft={};draftMeta={customer:'',reference:'',notes:''};notice='';await load();}
 async function execute(request,success){
  if(busy)return;
  busy=true;error='';notice='';renderParent();
  try{await check();const {error:e}=await request();if(e)throw e;notice=success;await load();}
  catch(e){error=e.message||'No se pudo guardar la operación.';}
  finally{busy=false;renderParent();}
 }
 async function saveOrder(form,status){
  if(statusDay())return;
  const fields=Object.fromEntries(new FormData(form).entries());
  const items=Object.entries(draft).filter(([id,q])=>q>0).map(([id,quantity])=>({product_id:id,quantity}));
  if(!items.length){error='Agregá al menos un producto.';renderParent();return;}
  await execute(()=>db().from('gestlok_pilot_orders').insert({
   tenant_id:TENANT,day,customer:String(fields.customer||'').trim(),
   reference:String(fields.reference||'').trim(),notes:String(fields.notes||'').trim(),
   items,status
  }),status==='preparado'?'Pedido preparado guardado.':'Pedido pendiente guardado.');
  if(!error){draft={};draftMeta={customer:'',reference:'',notes:''};}
 }
 async function noOrder(form){
  const d=Object.fromEntries(new FormData(form).entries());
  await execute(()=>db().from('gestlok_pilot_orders').insert({
   tenant_id:TENANT,day,reference:String(d.reference||'').trim(),
   reason:String(d.reason||'').trim(),status:'sin_realizar',items:[]
  }),'Pedido sin realizar registrado.');
 }
 async function newProduct(form){
  const d=Object.fromEntries(new FormData(form).entries());
  const amount=String(d.unit_price||'').trim();
  await execute(()=>db().from('gestlok_pilot_products').insert({
   tenant_id:TENANT,name:String(d.name||'').trim(),category:String(d.category||'').trim(),
   sku:String(d.sku||'').trim(),unit_price:amount===''?null:Number(amount)
  }),'Producto agregado al catálogo privado.');
 }
 async function updateOrder(id,status){
  if(statusDay()||!statuses[status])return;
  if(status==='cancelado'&&!confirm('¿Anular este pedido? No contará como realizado ni vendido.'))return;
  const o=orders.find(x=>x.id===id&&x.day===day);
  if(!o)return;
  if(!(['pendiente','preparado'].includes(o.status)))return;
  await execute(()=>db().from('gestlok_pilot_orders').update({status}).eq('tenant_id',TENANT).eq('id',id),
    'Estado del pedido actualizado.');
 }
 async function toggleStock(id){
  const p=products.find(x=>x.id===id&&x.active);if(!p)return;
  await execute(()=>db().from('gestlok_pilot_products').update({in_stock:!p.in_stock})
   .eq('tenant_id',TENANT).eq('id',id),'Disponibilidad actualizada.');
 }
 async function closeDay(){
  if(statusDay())return;
  if(day>currentDate()){error='No se puede cerrar una fecha futura.';renderParent();return;}
  if(!confirm('¿Finalizar el día '+dayLabel(day)+'? Los pedidos quedarán bloqueados.'))return;
  if(!confirm('Confirmación final: ¿guardar el cierre y abrir el próximo día?'))return;
  const closingDay=day;
  await execute(()=>db().from('gestlok_pilot_order_closures').insert({tenant_id:TENANT,day}),
    'Jornada finalizada. El historial quedó conservado.');
  if(!error){day=shift(closingDay,1);tab='cargar';draft={};draftMeta={customer:'',reference:'',notes:''};renderParent();}
 }
 document.addEventListener('click',e=>{
  if(!$('#gl-pilot-panel'))return;
  const t=e.target.closest('[data-orders-tab]');if(t){tab=t.dataset.ordersTab;error='';notice='';renderParent();return;}
  if(e.target.closest('[data-orders-prev]')){day=shift(day,-1);notice='';error='';renderParent();return;}
  if(e.target.closest('[data-orders-next]')){day=shift(day,1);notice='';error='';renderParent();return;}
  const p=e.target.closest('[data-orders-plus]');if(p){const id=p.dataset.ordersPlus;draft[id]=Math.min(999,(draft[id]||0)+1);renderParent();return;}
  const m=e.target.closest('[data-orders-minus]');if(m){const id=m.dataset.ordersMinus;draft[id]=Math.max(0,(draft[id]||0)-1);renderParent();return;}
  const b=e.target.closest('[data-orders-save-pending]');if(b){const form=$('#gl-orders-create');if(form)void saveOrder(form,'pendiente');return;}
  const state=e.target.closest('[data-orders-status]');if(state){void updateOrder(state.dataset.ordersId,state.dataset.ordersStatus);return;}
  const stock=e.target.closest('[data-orders-stock]');if(stock){void toggleStock(stock.dataset.ordersStock);return;}
  const length=e.target.closest('[data-orders-period]');if(length){historyDays=Number(length.dataset.ordersPeriod);renderParent();return;}
  const d=e.target.closest('[data-orders-day]');if(d){day=d.dataset.ordersDay;tab='cierre';renderParent();return;}
  if(e.target.closest('[data-orders-close]')){void closeDay();return;}
  if(e.target.closest('[data-orders-refresh]')){void load();}
 });
 document.addEventListener('input',e=>{
  if(e.target.closest('#gl-orders-create')&&e.target.name in draftMeta){draftMeta[e.target.name]=e.target.value;return;}
  if(!e.target.matches('[data-orders-search]'))return;
  search=e.target.value.toLowerCase().trim();
  document.querySelectorAll('#gl-pilot-panel [data-orders-product]').forEach(node=>{
   node.hidden=!node.dataset.orderName.includes(search);
  });
 });
 document.addEventListener('submit',e=>{
  if(e.target.id==='gl-orders-create'){e.preventDefault();void saveOrder(e.target,'preparado');}
  else if(e.target.id==='gl-orders-product'){e.preventDefault();void newProduct(e.target);}
  else if(e.target.id==='gl-orders-not-done'){e.preventDefault();void noOrder(e.target);}
 });
 window.GestLokPedidos=Object.freeze({render,open,refresh:load,getDay:()=>day,getTotals:totalItems});
})();

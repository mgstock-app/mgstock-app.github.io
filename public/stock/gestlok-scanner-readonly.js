/* GESTLOK · panel de consulta del Plan Scanner para la creadora.
 * Se carga SOLO desde GestLokPilot, luego de verificar el contexto y su RLS.
 * Nunca instala lector, cámara, carrito o formularios y NUNCA ejecuta escrituras. */
(() => {
 'use strict';
 if(window.GestLokScannerReadOnly)return;
 const TENANT='2a97bf8d-7d08-4aa7-b051-5d1a4dc80103';
 const CODES=Object.freeze(['caja','sistema_venta','stock','precios','pedidos','dispositivos']);
 const TITLES=Object.freeze({caja:'Caja',sistema_venta:'Sistema de ventas',
   stock:'Stock de productos',precios:'Precios',pedidos:'Pedidos',dispositivos:'Dispositivos'});
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const money=v=>Number.isFinite(Number(v))?new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:2}).format(Number(v)):'—';
 const date=x=>{if(!x)return '—';const dt=new Date(x);return Number.isNaN(dt.valueOf())?esc(x):esc(dt.toLocaleString('es-AR'));};
 const val=(x,empty='—')=>x===null||x===undefined||String(x).trim()===''?empty:esc(x);
 const quantity=x=>Number.isInteger(Number(x))?esc(x):'Sin contar';
 const yes=x=>x===true?'Sí':'No';
 const empty=message=>'<p class="gl-pilot-empty">'+esc(message)+'</p>';
 const tbl=(heads,rows)=>rows.length?
  '<div class="gl-pilot-table-scroll"><table class="gl-scanner-ro-table"><thead><tr>'+
  heads.map(x=>'<th scope="col">'+esc(x)+'</th>').join('')+
  '</tr></thead><tbody>'+rows.map(cols=>'<tr>'+cols.map(x=>'<td>'+x+'</td>').join('')+'</tr>').join('')+
  '</tbody></table></div>':empty('No hay registros para mostrar en esta sección.');
 const labels=()=>CODES.map(k=>[k,TITLES[k]]);
 const rows=s=>Array.isArray(s)?s:[];
 async function load(db, tenant, verify){
  if(tenant!==TENANT)throw Error('La consulta es exclusiva de ZAYRO.');
  if(typeof verify!=='function')throw Error('Falta validar los permisos de la sesión.');
  await verify();
  const specs=[
   ['products','gestlok_pilot_products','id,name,category,sku,cost_price,markup_percent,manual_sale_price,unit_price,stock_quantity,stock_minimum,in_stock,active,updated_at','name',500],
   ['sales','gestlok_pilot_pos_sales','id,total,payment_method,created_at,payment_breakdown,items','created_at',400],
   ['orders','gestlok_pilot_orders','id,day,customer,reference,status,reason,items,created_at','created_at',500],
   ['closures','gestlok_pilot_order_closures','id,day,closed_at','day',150],
   ['records','gestlok_pilot_records','id,module,title,note,amount,direction,status,occurred_on','occurred_on',300],
   ['methods','gestlok_scanner_payment_methods','method_id,label,enabled','method_id',30],
   ['audit','gestlok_pilot_audit','id,module,action,at','at',120]
  ];
  const output=await Promise.all(specs.map(async([key,table,columns,order,max])=>{
   const query=db.from(table).select(columns).eq('tenant_id',TENANT).order(order,{ascending:order==='name'||order==='method_id'}).limit(max);
   const result=await query;
   if(result.error)throw result.error;
   return [key,rows(result.data)];
  }));
  // La sesión podría haber cambiado durante los fetches; comprobar de nuevo.
  await verify();
  return Object.fromEntries(output);
 }
 function productsView(s,prices){
  const list=rows(s.products);
  const values=list.map(p=>[
   '<strong>'+esc(p.name)+'</strong>',
   val(p.sku),val(p.category),
   prices?money(p.cost_price):quantity(p.stock_quantity),
   prices?val(p.markup_percent==null?'':p.markup_percent+'%'):val(yes(p.in_stock)),
   prices?money(p.manual_sale_price??p.unit_price):money(p.manual_sale_price??p.unit_price),
   val(p.active?'Activo':'Inactivo')
  ]);
  return '<p>Información real del catálogo de la empresa · Solo lectura.</p>'+
   tbl(prices?['Producto','Código','Categoría','Costo','Margen','Precio de venta','Estado']:
    ['Producto','Código','Categoría','Unidades','Disponible','Precio','Estado'],values);
 }
 function salesView(s){
  const values=rows(s.sales);
  const total=values.reduce((sum,x)=>sum+Number(x.total||0),0);
  return '<div class="gl-scanner-ro-summary"><div><small>Ventas consultadas</small><strong>'+values.length+'</strong></div>'+
     '<div><small>Total de las ventas consultadas</small><strong>'+money(total)+'</strong></div></div>'+
     '<small>Últimas '+values.length+' ventas visibles; no es un cierre contable ni reserva stock.</small>'+
     tbl(['Fecha','Forma de pago','Total'],values.map(x=>[date(x.created_at),val(x.payment_method),money(x.total)]));
 }
 function cashView(s){
  const sales=rows(s.sales);
  const byPayment=new Map();
  for(const sale of sales){
   const method=String(sale.payment_method||'No indicada');
   byPayment.set(method,(byPayment.get(method)||0)+Number(sale.total||0));
  }
  const closing=rows(s.records).filter(x=>['apertura_cierre','finanzas'].includes(x.module));
  return '<p>Consulta de cobros del Plan Scanner. El efectivo y las transferencias se muestran separados de otros registros.</p>'+
    '<small>Las cifras suman únicamente las ventas recuperadas en esta consulta, no representan el saldo real de Caja Diaria.</small>'+
    tbl(['Medio de pago','Total consultado'],[...byPayment].map(([m,n])=>[esc(m),money(n)]))+
    '<h3>Movimientos manuales de caja</h3>'+
    tbl(['Fecha','Movimiento','Tipo','Importe'],closing.map(r=>[val(r.occurred_on),val(r.title),val(r.direction),money(r.amount)]));
 }
 function orderView(s){
  const orderRows=rows(s.orders);
  return '<p>Pedidos registrados en el negocio; sin botones para cambiar estados ni cerrar jornadas.</p>'+
   tbl(['Fecha','Cliente','Estado','Productos'],orderRows.map(x=>[
     val(x.day),val(x.customer),val(x.status),
     val(Array.isArray(x.items)?x.items.map(z=>String(z.name||'Producto')+' × '+String(z.quantity||'')).join(', '):'')
   ]))+
   '<h3>Jornadas cerradas</h3>'+tbl(['Día','Cierre'],rows(s.closures).map(x=>[val(x.day),date(x.closed_at)]));
 }
 function deviceView(s){
  return '<p>Formas de pago configuradas para el local. Los lectores USB, Bluetooth y las impresoras físicas dependen de cada dispositivo y no pueden gestionarse a distancia.</p>'+
   tbl(['Medio','Identificador','Habilitado'],rows(s.methods).map(m=>[val(m.label),val(m.method_id),esc(yes(m.enabled))]))+
   '<p class="gl-scanner-ro-hint">Configuración de hardware: solo consulta; no se modifican dispositivos, cámaras ni impresoras.</p>';
 }
 function render(section,s){
  if(!CODES.includes(section))return empty('Elegí una sección de consulta.');
  const title='<header class="gl-scanner-ro-heading"><small>PLAN SCANNER · VISTA DE CREADORA</small><h2>'+esc(TITLES[section])+'</h2>'+
    '<p class="gl-scanner-ro-indicator">Solo lectura · Datos reales de ZAYRO · No se permiten cobros, cambios ni eliminaciones.</p></header>';
  const body=section==='stock'?productsView(s,false):section==='precios'?productsView(s,true):
   section==='caja'?cashView(s):section==='sistema_venta'?salesView(s):
   section==='pedidos'?orderView(s):deviceView(s);
  return '<section class="gl-scanner-ro-section">'+title+body+'</section>';
 }
 window.GestLokScannerReadOnly=Object.freeze({load,render,sections:labels(),validSection:x=>CODES.includes(x)});
})();
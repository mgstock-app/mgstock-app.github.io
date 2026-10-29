/* GESTLOK | Precios y Stock manual para Perfumes, habilitado por el piloto.
   Una única fuente para el catálogo de Pedidos; ninguna integración externa
   ni modificación de Mi Gusto, otros tenants o su inventario. */
(() => {
 'use strict';
 const TENANT='2a97bf8d-7d08-4aa7-b051-5d1a4dc80103';
 const sel=s=>document.querySelector(s);
 const esc=s=>String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
 const money=n=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(n));
 const amount=v=>v==null?'':String(v);
 const price=(cost,percentage)=>Math.round((Number(cost)*(1+Number(percentage)/100)+Number.EPSILON)*100)/100;
 const profit=(cost,percentage)=>Math.round((price(cost,percentage)-Number(cost)+Number.EPSILON)*100)/100;
 const db=()=>window.GestLokSupabase;
 let mode='precios',rows=[],busy=false,loading=false,ready=false,error='',notice='',editing='',stockEditing='',search='';
 function permitted(){return window.GestLokPilot?.authorized?.()===true;}
 async function assertAccess(){
  if(!permitted())throw Error('No tenés permiso para este espacio privado.');
  const {data,error:e}=await db().auth.getUser();
  if(e||!data?.user)throw Error('Necesitás ingresar con tu cuenta autorizada.');
  return data.user;
 }
 function update(){window.GestLokPilot?.rerender?.();}
 async function refresh(){
  loading=true;error='';update();
  try{
   await assertAccess();
   const {data,error:e}=await db().from('gestlok_pilot_products')
    .select('id,name,category,sku,cost_price,markup_percent,unit_price,stock_quantity,stock_minimum,in_stock,active,updated_at')
    .eq('tenant_id',TENANT).eq('active',true).order('name',{ascending:true}).limit(500);
   if(e)throw e;
   rows=data||[];ready=true;
  }catch(e){ready=false;error=e.message||'Error al leer el catálogo privado.';}
  finally{loading=false;update();}
 }
 async function open(section){
  mode=section==='stock'?'stock':'precios';
  editing='';stockEditing='';search='';notice='';error='';
  await refresh();
 }
 function badge(p){
  if(p.stock_quantity==null)return '<span class="gl-ps-badge">Sin contar</span>';
  if(!p.stock_quantity)return '<span class="gl-ps-badge is-zero">Sin stock</span>';
  if(p.stock_quantity<=Number(p.stock_minimum))return '<span class="gl-ps-badge is-low">Stock bajo</span>';
  return '<span class="gl-ps-badge is-ok">Disponible</span>';
 }
 function countStats(){
  const priced=rows.filter(p=>p.cost_price!=null&&p.markup_percent!=null);
  const withCount=rows.filter(p=>p.stock_quantity!=null);
  return [
   ['Productos',rows.length],
   ['Con costo y precio',priced.length],
   ['Sin stock',withCount.filter(p=>p.stock_quantity===0).length],
   ['Stock bajo',withCount.filter(p=>p.stock_quantity>0&&p.stock_quantity<=p.stock_minimum).length]
  ];
 }
 function inventoryTotals(){
  const counted=rows.filter(x=>x.active&&x.stock_quantity!=null&&x.cost_price!=null&&x.unit_price!=null);
  return {
   products:counted.length,
   cost:counted.reduce((a,p)=>a+Number(p.cost_price)*p.stock_quantity,0),
   sale:counted.reduce((a,p)=>a+Number(p.unit_price)*p.stock_quantity,0)
  };
 }
 function rowCard(p){
  const calculated=p.cost_price!=null&&p.markup_percent!=null;
  const cost=calculated?money(p.cost_price):'Sin cargar';
  const sale=p.unit_price!=null?money(p.unit_price):'Sin calcular';
  const gain=calculated?money(Number(p.unit_price)-Number(p.cost_price)):'Sin calcular';
  const id=esc(p.id);
  return '<article class="gl-ps-item" data-ps-row data-ps-search="'+esc((p.name+' '+p.category+' '+p.sku).toLowerCase())+'">'+
   '<header><div><b>'+esc(p.name)+'</b><small>'+esc(p.category||'Sin categoría')+(p.sku?' · '+esc(p.sku):'')+'</small></div>'+
   (mode==='stock'?badge(p):'<span class="gl-ps-badge">'+(calculated?'Calculado':'Sin configurar')+'</span>')+'</header>'+
   (mode==='precios'?'<div class="gl-ps-cell-grid"><div><small>Costo</small><strong>'+cost+'</strong></div>'+
     '<div><small>Recargo</small><strong>'+(p.markup_percent==null?'—':esc(p.markup_percent)+'%')+'</strong></div>'+
     '<div><small>Precio a vender</small><strong>'+sale+'</strong></div>'+
     '<div><small>Ganancia bruta / u.</small><strong>'+gain+'</strong></div></div>':
     '<div class="gl-ps-cell-grid gl-ps-stock-grid"><div><small>Unidades disponibles</small><strong>'+(p.stock_quantity==null?'Sin contar':esc(p.stock_quantity))+'</strong></div>'+
     '<div><small>Aviso de stock bajo</small><strong>'+esc(p.stock_minimum)+'</strong></div></div>')+
   '<footer><small>Actualizado '+esc(new Date(p.updated_at).toLocaleDateString('es-AR'))+'</small>'+
   '<button type="button" data-ps-edit="'+id+'">'+(mode==='precios'?'Editar precios':'Actualizar stock')+'</button></footer></article>';
 }
 function priceForm(){
  const p=rows.find(x=>x.id===editing);
  const input=(key)=>esc(amount(p?.[key]));
  const current=p?.cost_price!=null&&p?.markup_percent!=null;
  const a=current?money(p.unit_price):'—',b=current?money(Number(p.unit_price)-Number(p.cost_price)):'—';
  return '<form id="gl-ps-price-form" class="gl-ps-form"><div class="gl-ps-form-title"><h3>'+(p?'Editar precios':'Nuevo producto')+'</h3>'+
    '<button type="button" data-ps-cancel aria-label="Cerrar formulario">Cerrar ×</button></div>'+
   '<div class="gl-ps-fields"><label>Nombre del producto<input name="name" value="'+input('name')+'" minlength="2" maxlength="140" required placeholder="Ej.: perfume o tratamiento"></label>'+
   '<label>Categoría (opcional)<input name="category" maxlength="80" value="'+input('category')+'" placeholder="Perfumes / Cuidado capilar"></label>'+
   '<label>Código (opcional)<input name="sku" maxlength="80" value="'+input('sku')+'" placeholder="SKU"></label>'+
   '<label>Precio costo (ARS)<input name="cost_price" type="number" inputmode="decimal" min="0" max="9999999999.99" step="0.01" required value="'+input('cost_price')+'" placeholder="0.00"></label>'+
   '<label>Porcentaje de recargo (%)<input name="markup_percent" type="number" inputmode="decimal" min="0" max="5000" step="0.01" required value="'+input('markup_percent')+'" placeholder="Ej.: 70"></label></div>'+
   '<div class="gl-ps-preview" aria-live="polite"><div><small>Precio a vender</small><strong data-ps-sale>'+a+'</strong></div>'+
   '<div><small>Ganancia bruta por unidad</small><strong data-ps-profit>'+b+'</strong></div></div>'+
   '<p class="gl-ps-help">El porcentaje se suma al costo. Ejemplo: $10.000 + 70% = $17.000 de venta y $7.000 de ganancia bruta. No descuenta impuestos, comisiones ni otros gastos.</p>'+
   '<button type="submit" '+(busy?'disabled':'')+'>'+(busy?'Guardando…':'Guardar producto y precios')+'</button></form>';
 }
 function stockForm(){
  const p=rows.find(x=>x.id===stockEditing);
  if(!p)return '';
  return '<form id="gl-ps-stock-form" class="gl-ps-form"><div class="gl-ps-form-title"><div><small>Actualizar inventario</small><h3>'+esc(p.name)+'</h3></div>'+
   '<button type="button" data-ps-cancel aria-label="Cerrar formulario">Cerrar ×</button></div>'+
   '<div class="gl-ps-fields"><label>Unidades actuales<input required name="stock_quantity" type="number" min="0" max="100000000" step="1" inputmode="numeric" value="'+esc(amount(p.stock_quantity))+'" placeholder="Ingresá el conteo real"></label>'+
   '<label>Alerta de stock bajo (unidades)<input required name="stock_minimum" type="number" min="0" max="100000000" step="1" value="'+esc(p.stock_minimum)+'"></label></div>'+
   '<p class="gl-ps-help">Este valor se carga manualmente. Los pedidos no descuentan stock automáticamente. Un valor de cero marca el producto sin stock.</p>'+
   '<button type="submit" '+(busy?'disabled':'')+'>'+(busy?'Guardando…':'Guardar stock')+'</button></form>';
 }
 function render(){
  const pricing=mode==='precios',list=rows.filter(x=>x.active);
  return '<section class="gl-ps"><header class="gl-ps-head"><div><small>GESTLOK · EMPRESA PILOTO</small><h2>'+(pricing?'Precios':'Stock')+'</h2>'+
   '<p>'+(pricing?'Costo, porcentaje de recargo, precio de venta y ganancia por unidad.':'Control manual de las cantidades por producto y avisos de faltantes.')+'</p></div>'+
   '<button type="button" data-ps-refresh>Actualizar</button></header>'+
   (error?'<p class="gl-ps-error" role="alert">'+esc(error)+'</p>':'')+
   (notice?'<p class="gl-ps-success" role="status">'+esc(notice)+'</p>':'')+
   (loading?'<p role="status">Cargando productos de tu empresa…</p>':
    !ready?'<p>No se pudo acceder a la información. Usá Actualizar.</p>':
    '<div class="gl-ps-stats">'+countStats().map(([label,value])=>'<div><small>'+esc(label)+'</small><strong>'+value+'</strong></div>').join('')+'</div>'+
    (!pricing?'<div class="gl-ps-inventory-summary"><div><small>Inversión en stock registrado</small><strong>'+money(inventoryTotals().cost)+'</strong></div>'+
     '<div><small>Valor potencial de venta</small><strong>'+money(inventoryTotals().sale)+'</strong></div>'+
     '<div><small>Ganancia bruta potencial</small><strong>'+money(inventoryTotals().sale-inventoryTotals().cost)+'</strong></div></div>'+
     '<p class="gl-ps-help">Calculado solo con productos que tienen costo, precio y cantidad cargados. No representa dinero ganado ni ventas realizadas.</p>':'')+
    '<div class="gl-ps-toolbar"><label>Buscar producto<input type="search" data-ps-search placeholder="Nombre, categoría o código" value="'+esc(search)+'"></label>'+
     (pricing?'<button type="button" data-ps-new>+ Agregar producto</button>':
     '<button type="button" data-ps-new>+ Nuevo producto en Precios</button>')+'</div>'+
    ((pricing&&editing==='new')||pricing&&rows.some(x=>x.id===editing)?priceForm():'')+
    ((!pricing&&stockEditing)?stockForm():'')+
    (list.length?'<div class="gl-ps-items">'+list.map(rowCard).join('')+'</div>':
     '<div class="gl-ps-empty"><h3>No hay productos cargados</h3><p>Agregá el primer producto en Precios. Se usará también en Stock y Pedidos.</p>'+
     '<button type="button" data-ps-new>Agregar producto</button></div>')+
    '<p class="gl-ps-help gl-ps-end">Los valores corresponden solo a esta empresa. Stock y precios son manuales; no generan compras, egresos, cobros ni actualizaciones automáticas en Tiendanube.</p>')+'</section>';
 }
 function validMoney(x,min,max){return x!==''&&Number.isFinite(Number(x))&&Number(x)>=min&&Number(x)<=max;}
 function integer(x){return /^\d+$/.test(String(x))&&Number.isSafeInteger(Number(x))&&Number(x)<=100000000;}
 async function savePrice(form){
  if(busy)return;
  const p=rows.find(x=>x.id===editing);
  const d=Object.fromEntries(new FormData(form).entries());
  const name=String(d.name||'').trim();
  const c=String(d.cost_price||'').trim(),pct=String(d.markup_percent||'').trim();
  if(name.length<2||name.length>140||!validMoney(c,0,9999999999.99)||!validMoney(pct,0,5000)||price(c,pct)>9999999999.99){
    error='Comprobá el nombre, el costo y el porcentaje de recargo.';update();return;
  }
  const fields={name,category:String(d.category||'').trim(),sku:String(d.sku||'').trim(),
   cost_price:Number(c),markup_percent:Number(pct)};
  busy=true;error='';notice='';update();
  try{
   await assertAccess();
   let query=p
    ?db().from('gestlok_pilot_products').update(fields).eq('id',p.id).eq('tenant_id',TENANT).eq('updated_at',p.updated_at)
    :db().from('gestlok_pilot_products').insert({tenant_id:TENANT,...fields});
   const {data,error:e}=await query.select('id').maybeSingle();
   if(e)throw e;
   if(!data)throw Error('Otro dispositivo actualizó el producto. Actualizá antes de guardar.');
   editing='';await refresh();notice='Precios guardados correctamente.';
  }catch(e){error=e.message||'No pudimos guardar precios.';}
  finally{busy=false;update();}
 }
 async function saveStock(form){
  if(busy)return;
  const p=rows.find(x=>x.id===stockEditing);if(!p)return;
  const d=Object.fromEntries(new FormData(form).entries());
  if(!integer(d.stock_quantity)||!integer(d.stock_minimum)){
   error='Ingresá cantidades enteras entre 0 y 100.000.000.';update();return;
  }
  busy=true;error='';notice='';update();
  try{
   await assertAccess();
   const {data,error:e}=await db().from('gestlok_pilot_products')
     .update({stock_quantity:Number(d.stock_quantity),stock_minimum:Number(d.stock_minimum)})
     .eq('tenant_id',TENANT).eq('id',p.id).eq('updated_at',p.updated_at).select('id').maybeSingle();
   if(e)throw e;
   if(!data)throw Error('El stock cambió en otro dispositivo. Actualizá antes de guardar.');
   stockEditing='';await refresh();notice='Stock guardado correctamente.';
  }catch(e){error=e.message||'No pudimos guardar stock.';}
  finally{busy=false;update();}
 }
 document.addEventListener('click',e=>{
  if(!sel('#gl-pilot-panel')||!permitted())return;
  const el=e.target.closest('[data-ps-edit],[data-ps-new],[data-ps-cancel],[data-ps-refresh]');
  if(!el)return;
  if(el.matches('[data-ps-refresh]')){void refresh();return;}
  if(el.matches('[data-ps-cancel]')){editing='';stockEditing='';error='';update();return;}
  if(el.matches('[data-ps-new]')){
   if(mode==='stock'){window.GestLokPilot?.switchSection?.('precios');return;}
   editing='new';stockEditing='';error='';update();return;
  }
  const id=el.dataset.psEdit,exists=rows.some(x=>x.id===id);
  if(!exists)return;
  if(mode==='precios'){editing=id;stockEditing='';}
  else{stockEditing=id;editing='';}
  error='';update();
 });
 document.addEventListener('input',e=>{
  if(!sel('#gl-pilot-panel')||!permitted())return;
  if(e.target.matches('[data-ps-search]')){
   search=e.target.value.toLowerCase().trim();
   document.querySelectorAll('#gl-pilot-panel [data-ps-row]').forEach(node=>{
    node.hidden=!node.dataset.psSearch.includes(search);
   });
  }
  if(e.target.closest('#gl-ps-price-form')&&['cost_price','markup_percent'].includes(e.target.name)){
   const form=e.target.form;
   const c=form.elements.namedItem('cost_price').value,p=form.elements.namedItem('markup_percent').value;
   const ready=validMoney(c,0,9999999999.99)&&validMoney(p,0,5000)&&price(c,p)<=9999999999.99;
   const sale=form.querySelector('[data-ps-sale]'),gain=form.querySelector('[data-ps-profit]');
   if(sale)sale.textContent=ready?money(price(c,p)):'—';
   if(gain)gain.textContent=ready?money(profit(c,p)):'—';
  }
 });
 document.addEventListener('submit',e=>{
  if(e.target.id==='gl-ps-price-form'){e.preventDefault();void savePrice(e.target);}
  if(e.target.id==='gl-ps-stock-form'){e.preventDefault();void saveStock(e.target);}
 });
 window.GestLokPreciosStock=Object.freeze({render,open,price,profit,inventoryTotals,refresh});
})();

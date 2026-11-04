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
 const SUGGESTED_MARKUP=70;
 const suggestedPrice=cost=>validMoney(cost,0.01,9999999999.99)&&price(cost,SUGGESTED_MARKUP)<=9999999999.99?price(cost,SUGGESTED_MARKUP):null;
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
     '<div><small>Ganancia bruta / u.</small><strong>'+gain+'</strong></div>'+
     '<div><small>Precio de venta sugerido · 70%</small><strong>'+(suggestedPrice(p.cost_price)==null?'Cargá el costo':money(suggestedPrice(p.cost_price)))+'</strong></div></div>'+
     '<p class="gl-ps-help">Referencia sobre costo con 70% de recargo. No es un precio de mercado.</p>':
     '<div class="gl-ps-cell-grid gl-ps-stock-grid"><div><small>Unidades disponibles</small><strong>'+(p.stock_quantity==null?'Sin contar':esc(p.stock_quantity))+'</strong></div>'+
     '<div><small>Aviso de stock bajo</small><strong>'+esc(p.stock_minimum)+'</strong></div></div>')+
   '<footer><small>Actualizado '+esc(new Date(p.updated_at).toLocaleDateString('es-AR'))+'</small>'+
   '<button type="button" data-ps-label="'+id+'" '+(!/^\d{13}$/.test(String(p.sku||''))?'disabled title="Código EAN-13 pendiente"':'')+'>Descargar etiqueta</button>'+ 
   '<button type="button" data-ps-print="'+id+'" '+(!/^\d{13}$/.test(String(p.sku||''))?'disabled title="Código EAN-13 pendiente"':'')+'>Imprimir etiqueta</button>'+ 
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
   '<label>Código de barras (automático)<input name="sku" readonly value="'+(p?input('sku'):'Se genera al guardar')+'" aria-label="Código de barras generado automáticamente"></label>'+
   '<label>Precio costo (ARS)<input name="cost_price" type="number" inputmode="decimal" min="0" max="9999999999.99" step="0.01" required value="'+input('cost_price')+'" placeholder="0.00"></label>'+
   '<label>Porcentaje de recargo (%)<input name="markup_percent" type="number" inputmode="decimal" min="0" max="5000" step="0.01" required value="'+input('markup_percent')+'" placeholder="Ej.: 70"></label></div>'+
   '<div class="gl-ps-suggestion" aria-live="polite"><div><small>Precio de venta sugerido</small>'+
   '<strong data-ps-suggested>'+(suggestedPrice(p?.cost_price)==null?'Cargá el costo':money(suggestedPrice(p.cost_price)))+'</strong>'+
   '<p class="gl-ps-help">Referencia inicial: costo + 70% de recargo. Podés cambiar el porcentaje. No es un precio de mercado y no incluye impuestos, comisiones ni otros gastos.</p></div>'+
   '<button type="button" data-ps-use-suggested '+(suggestedPrice(p?.cost_price)==null?'disabled':'')+'>Usar sugerido (70%)</button></div>'+
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
  const fields={name,category:String(d.category||'').trim(),
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
 async function downloadLabel(id,printWindow){
  await assertAccess();
  const p=rows.find(x=>x.id===id&&x.active);
  if(!p||!/^\d{13}$/.test(String(p.sku||'')))throw Error('Este producto todavía no tiene código EAN-13.');
  if(!window.GestLokPosEAN13){await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/stock/sistema-venta/ean13-label.js';script.onload=resolve;script.onerror=()=>reject(Error('No se pudo cargar la etiqueta.'));document.head.append(script);});}
  const svg=window.GestLokPosEAN13.svg(p.sku);
  // NIIMBOT accepts image imports more reliably than SVG. Rasterize locally,
  // preserving a white background and the original barcode proportions.
  const blob=new Blob([svg],{type:'image/svg+xml;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  try{
   const img=new Image();
   await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error('No se pudo preparar la imagen de la etiqueta.'));img.src=url;});
   const canvas=document.createElement('canvas');
   // Full-bleed D110_M label: 240px along feed × 96px across head.
   canvas.width=240;canvas.height=96;
   const ctx=canvas.getContext('2d');
   if(!ctx)throw Error('El navegador no permite generar la etiqueta.');
   ctx.fillStyle='#fff';ctx.fillRect(0,0,240,96);
   const rawName=String(p.name||'Producto').trim().replace(/\s+/g,' ');
   const title=rawName.length>38?rawName.slice(0,37)+'…':rawName;
   // Center on the full 240px feed axis. Never translate the raster: it clips EAN bars.
   ctx.fillStyle='#000';ctx.textAlign='center';ctx.textBaseline='middle';
   let fontSize=18;
   do{ctx.font='bold '+fontSize+'px Arial, sans-serif';if(ctx.measureText(title).width<=232)break;fontSize--;}while(fontSize>8);
   ctx.fillText(title,120,11,234);
   // Widen the complete EAN-13 proportionally while preserving quiet zones.
   // Draw at native 2-dot modules, then stretch the raster with nearest-neighbor
   // so thin bars stay crisp rather than becoming grey from antialiasing.
   const bits=window.GestLokPosEAN13.bits(p.sku);
   const barCanvas=document.createElement('canvas');
   barCanvas.width=190;barCanvas.height=61;
   const barCtx=barCanvas.getContext('2d');
   for(let i=0;i<bits.length;i++){
    if(bits[i]==='1')barCtx.fillRect(i*2,0,2,61);
   }
   ctx.imageSmoothingEnabled=false;
   ctx.drawImage(barCanvas,0,0,190,61,15,22,210,61);
   ctx.imageSmoothingEnabled=true;
   // Keep 15px white quiet zones on both sides of the wider barcode.
   ctx.font='bold 11px monospace';ctx.textAlign='center';ctx.fillText(p.sku,120,91,190);
   const png=await new Promise((resolve,reject)=>canvas.toBlob(x=>x?resolve(x):reject(Error('No se pudo exportar PNG.')),'image/png'));
   if(printWindow){
    const dataUrl=canvas.toDataURL('image/png');
    const doc=printWindow.contentDocument;
    if(!doc)throw Error('No se pudo abrir la vista de impresión.');
    doc.open();doc.write('<!doctype html><html><head><meta charset="utf-8"><title>Etiqueta de producto</title><style>@page{size:30mm 12mm;margin:0}html,body{margin:0;padding:0;width:30mm;height:12mm}img{display:block;width:30mm;height:12mm}</style></head><body><img alt="Etiqueta" src="'+dataUrl+'"></body></html>');doc.close();
    const image=doc.querySelector('img');
    const portrait=document.createElement('canvas');
    portrait.width=96;portrait.height=240;
    const portraitCtx=portrait.getContext('2d');
    portraitCtx.fillStyle='#fff';portraitCtx.fillRect(0,0,96,240);
    portraitCtx.translate(96,0);portraitCtx.rotate(Math.PI/2);
    portraitCtx.drawImage(canvas,0,0,240,96);
    // Keep the actual 30×12 mm preview centered and scaled to the available area.
    const previewStyle=doc.createElement('style');
    previewStyle.textContent='@media screen{html,body{width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#f5f5f5}img{width:calc(min(94vw, 280px));height:auto;aspect-ratio:2.5;object-fit:fill}}';
    doc.head.append(previewStyle);
    printWindow.closest('[data-ps-print-preview]').dataset.niimbotImage=portrait.toDataURL('image/png');
    const modal=printWindow.closest('[data-ps-print-preview]');
    const readyButton=modal?.querySelector('[data-ps-confirm-print]');
    if(readyButton){readyButton.disabled=false;readyButton.textContent='Imprimir ahora';}
    return;
   }
   const pngUrl=URL.createObjectURL(png);
   const a=document.createElement('a');a.href=pngUrl;a.download='etiqueta-'+p.sku+'-30x12mm.png';document.body.append(a);a.click();a.remove();
   setTimeout(()=>URL.revokeObjectURL(pngUrl),30000);
  }finally{URL.revokeObjectURL(url);}
 }
 document.addEventListener('click',e=>{
  if(!sel('#gl-pilot-panel')||!permitted())return;
  if(e.target.closest('[data-ps-niimbot-print]')){
   e.preventDefault();
   const modal=document.querySelector('[data-ps-print-preview]');
   const btn=modal?.querySelector('[data-ps-niimbot-print]');
   const image=modal?.dataset.niimbotImage;
   if(!window.Niimbot?.isSupported?.()){modal.querySelector('p').textContent='Abrí GESTLOK en Chrome para Android y activá Bluetooth.';return;}
   if(!image){modal.querySelector('p').textContent='Todavía se está preparando la etiqueta.';return;}
   btn.disabled=true;btn.textContent='Conectando e imprimiendo…';
   const model={id:2320,label:'Niimbot D110_M',name_prefixes:['D110'],task:'v4',protocol:'v4',dpi:203,density:3,label_type:1,speed:1};
   const size={w_px:96,h_px:240,offset_y_px:0};
   void window.Niimbot.printImage(image,{model,size,density:3}).then(()=>{
    modal.querySelector('p').textContent='Etiqueta enviada a NIIMBOT D110_M.';
   }).catch(err=>{
    modal.querySelector('p').textContent='Error Bluetooth: '+(err?.message||'No se pudo imprimir.');
   }).finally(()=>{btn.disabled=false;btn.textContent='Imprimir con NIIMBOT D110_M';});
   return;
  }
  if(e.target.closest('[data-ps-close-print]')){e.preventDefault?.();document.querySelector('[data-ps-print-preview]')?.remove();return;}
  if(e.target.closest('[data-ps-confirm-print]')){e.preventDefault?.();const frame=document.querySelector('[data-ps-print-preview] iframe');if(frame?.contentWindow){frame.contentWindow.focus();frame.contentWindow.print();}return;}
  const print=e.target.closest('[data-ps-print]');
  if(print?.matches?.('[data-ps-print]')){
   e.preventDefault?.();
   document.querySelector('[data-ps-print-preview]')?.remove();
   const modal=document.createElement('div');
   modal.dataset.psPrintPreview='true';
   modal.setAttribute('role','dialog');modal.setAttribute('aria-label','Vista previa de etiqueta');
   modal.style.cssText='position:fixed;z-index:2147483647;inset:0;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;padding:16px';
   modal.innerHTML='<div style="background:white;color:#172a42;padding:20px;border-radius:12px;max-width:95vw;width:420px;box-shadow:0 12px 40px #0005"><h3>Imprimir etiqueta</h3><p>Vista previa de 30 × 12 mm. No se descargará ningún archivo.</p><iframe title="Etiqueta lista para imprimir" style="width:300px;max-width:100%;height:120px;border:1px solid #ccc;background:white"></iframe><p style="display:flex;gap:10px;flex-wrap:wrap"><button type="button" data-ps-niimbot-print disabled>Preparando Bluetooth…</button><button type="button" data-ps-confirm-print disabled>Imprimir con sistema</button><button type="button" data-ps-close-print>Cerrar</button></p></div>';
   document.body.append(modal);
   const frame=modal.querySelector('iframe');
   const btButton=modal.querySelector('[data-ps-niimbot-print]');
   const enableBluetooth=()=>{btButton.disabled=false;btButton.textContent=window.Niimbot?.isSupported?.()?'Imprimir con NIIMBOT D110_M':'Bluetooth web no disponible';};
   if(window.Niimbot)enableBluetooth();
   else{const script=document.createElement('script');script.src='/stock/sistema-venta/niimbot-driver.js';script.onload=enableBluetooth;script.onerror=()=>{btButton.textContent='No se pudo cargar Bluetooth';};document.head.append(script);}
   void downloadLabel(print.dataset.psPrint,frame).catch(err=>{modal.querySelector('p').textContent=err.message||'No se pudo preparar la etiqueta.';modal.querySelector('[data-ps-confirm-print]').textContent='Error de impresión';});return;
  }
  const label=e.target.closest('[data-ps-label]');
  if(label?.matches?.('[data-ps-label]')){e.preventDefault?.();void downloadLabel(label.dataset.psLabel).catch(err=>{error=err.message||'No se pudo generar la etiqueta.';update();});return;}
  const el=e.target.closest('[data-ps-edit],[data-ps-new],[data-ps-cancel],[data-ps-refresh],[data-ps-use-suggested]');
  if(!el)return;
  if(el.matches('[data-ps-use-suggested]')){
   const form=el.closest('#gl-ps-price-form');
   if(!form||suggestedPrice(form.elements.namedItem('cost_price').value)==null)return;
   const input=form.elements.namedItem('markup_percent');
   input.value=String(SUGGESTED_MARKUP);input.dispatchEvent(new Event('input',{bubbles:true}));return;
  }
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
   const suggestion=suggestedPrice(c);
   const suggested=form.querySelector('[data-ps-suggested]'),apply=form.querySelector('[data-ps-use-suggested]');
   if(suggested)suggested.textContent=suggestion==null?'Cargá un costo válido':money(suggestion);
   if(apply)apply.disabled=suggestion==null;
   const sale=form.querySelector('[data-ps-sale]'),gain=form.querySelector('[data-ps-profit]');
   if(sale)sale.textContent=ready?money(price(c,p)):'—';
   if(gain)gain.textContent=ready?money(profit(c,p)):'—';
  }
 });
 document.addEventListener('submit',e=>{
  if(e.target.id==='gl-ps-price-form'){e.preventDefault();void savePrice(e.target);}
  if(e.target.id==='gl-ps-stock-form'){e.preventDefault();void saveStock(e.target);}
 });
 window.GestLokPreciosStock=Object.freeze({render,open,price,profit,suggestedPrice,inventoryTotals,refresh});
})();

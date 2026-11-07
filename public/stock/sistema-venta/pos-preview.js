/* Plan Scanner POS: pagos recibidos, ventas idempotentes y stock actualizado en servidor. */
(function(root){
'use strict';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS'}).format(n);
let activeCleanup=null,activeUpdate=null;
function dispose(){activeCleanup?.();activeCleanup=null;activeUpdate=null;}
function render(container,products,{checkoutEnabled=false,paymentMethods=[],onSale,recentSales=[],report=null,onReportDay,guest=false,getReceipt}={}){
 dispose();
 if(!container)throw Error('Contenedor requerido');
 let catalog=root.GestLokPosCatalog?.catalog(products)||[];
 const cart=new Map();
 const stockInfo=(p,qty=0)=>{if(!Number.isInteger(p.stock))return '<span style="color:#64748b">Stock sin contar · cargá unidades antes de vender</span>';const left=p.stock-qty,color=left<=0?'#b91c1c':left<=3?'#a16207':'#15803d';const label=left<=0?'Sin stock':left<=3?'Últimas '+left+' unidades':left+' unidades disponibles';return '<span style="font-size:12px;color:'+color+';font-weight:600">▣ '+label+'</span>';};
 const salesHtml=list=>list.length?list.slice(0,8).map(s=>'<div class="gl-pos-sale"><span>'+esc(new Date(s.created_at).toLocaleString('es-AR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}))+' · '+esc(s.payment_method==='combinado'?'Combinado':paymentMethods.find(m=>m.id===s.payment_method)?.label||s.payment_method)+'</span><strong>'+money(Number(s.total))+'</strong></div>').join(''):'<p>No hay ventas registradas todavía.</p>';
 const reportHtml=r=>{
  if(!r)return '<p>Sin resumen disponible.</p>';
  const methods=r.methods&&typeof r.methods==='object'?Object.entries(r.methods):[['efectivo',r.efectivo||0],['transferencia',r.transferencia||0]];
  return '<div class="gl-pos-reconcile-grid">'+[
   ['Ventas',String(Number(r.sales||0))],
   ...methods.map(([id,amount])=>[paymentMethods.find(m=>m.id===id)?.label||id,money(Number(amount))]),
   ['Total del Scanner',money(Number(r.total||0))]
  ].map(([label,value])=>'<div><small>'+esc(label)+'</small><strong>'+esc(value)+'</strong></div>').join('')+'</div>';
 };
 container.innerHTML='<section class="gl-pos"><header class="gl-pos-heading"><div><small>GESTLOK · PUNTO DE VENTA</small><h2>Nueva venta</h2><button type="button" data-pilot-devices class="gl-pos-devices-link">Configurar dispositivos</button></div><span class="gl-pos-mode">'+(checkoutEnabled?'Ventas habilitadas':'Modo prueba')+'</span></header><div class="gl-pos-layout"><div class="gl-pos-card"><h3>Buscar o escanear producto</h3><label for="gl-pos-search">Código de barras o nombre</label><input id="gl-pos-search" type="search" autocomplete="off" placeholder="Buscar producto..."><div class="gl-pos-camera-actions"><button type="button" id="gl-pos-camera">📷 Abrir escáner de cámara</button></div><p id="gl-pos-scan-message" role="status"></p><div id="gl-pos-results"></div></div><div class="gl-pos-card"><h3>Carrito</h3><div id="gl-pos-cart"></div><p id="gl-pos-total" class="gl-pos-total"></p><label for="gl-pos-payment">Medio de pago</label><select id="gl-pos-payment"><option value="efectivo">Efectivo</option><option value="transferencia">Transferencia</option></select><div id="gl-pos-split"><label><input id="gl-pos-split-enabled" type="checkbox"> Combinar medios de pago</label><div id="gl-pos-split-lines" hidden></div></div><button type="button" id="gl-pos-checkout" disabled>'+(checkoutEnabled?'Registrar venta cobrada':'Confirmar venta')+'</button><p id="gl-pos-sale-message" role="status"></p><small class="gl-pos-note">'+(checkoutEnabled?'Confirmá únicamente pagos recibidos. Se guarda la venta y se descuenta stock en una sola operación.':'La prueba no registra ventas ni descuenta stock.')+'</small></div></div>'+(checkoutEnabled&&!guest?'<section class="gl-pos-reconcile" aria-label="Resumen de cobros del Scanner"><header><h3>Resumen de ventas · Scanner</h3><label for="gl-pos-report-day">Fecha <input id="gl-pos-report-day" type="date" value="'+esc(String(report?.day||''))+'"></label></header><div id="gl-pos-reconcile-body" aria-live="polite">'+reportHtml(report)+'</div><p class="gl-pos-reconcile-help">Fuente: ventas registradas en el Plan Scanner. Este resumen todavía no se suma automáticamente a GESTLOK Caja. Conciliá los cobros antes de cargarlos allí para evitar duplicados.</p></section>':'')+(checkoutEnabled&&!guest?'<section class="gl-pos-sales" aria-label="Últimas ventas confirmadas"><h3>Últimas ventas registradas</h3><div class="gl-pos-sales-list">'+salesHtml(recentSales)+'</div></section>':'')+'</section>';
 if(guest)container.querySelector('[data-pilot-devices]')?.remove();
 const search=container.querySelector('#gl-pos-search');
 const results=container.querySelector('#gl-pos-results');
 const cartBox=container.querySelector('#gl-pos-cart');
 const total=container.querySelector('#gl-pos-total');
 const camera=container.querySelector('#gl-pos-camera');
 const message=container.querySelector('#gl-pos-scan-message');
 const confirm=container.querySelector('#gl-pos-checkout');
 const saleMessage=container.querySelector('#gl-pos-sale-message');
 const paymentSelect=container.querySelector('#gl-pos-payment');
 const splitEnabled=container.querySelector('#gl-pos-split-enabled');
 const splitLines=container.querySelector('#gl-pos-split-lines');
 const availableMethods=(root.GestLokPosPayments?.normalizeMethods&&paymentMethods.length)?root.GestLokPosPayments.normalizeMethods(paymentMethods):[];
 paymentSelect.innerHTML=availableMethods.map(m=>'<option value="'+esc(m.id)+'">'+esc(m.label)+'</option>').join('');
 if(!availableMethods.length){splitEnabled.disabled=true;paymentSelect.disabled=true;confirm.disabled=true;saleMessage.textContent='No hay medios de pago habilitados para este local.';}
 function drawSplit(){
  const active=splitEnabled.checked;
  paymentSelect.hidden=active;splitLines.hidden=!active;
  if(!active)return;
  if(!splitLines.children.length){
   splitLines.innerHTML='<div class="gl-pos-split-row"><select aria-label="Primer medio de pago"></select><input aria-label="Primer importe" type="number" min="0.01" step="0.01" placeholder="Importe"></div><div class="gl-pos-split-row"><select aria-label="Segundo medio de pago"></select><input aria-label="Segundo importe" type="number" min="0.01" step="0.01" placeholder="Importe"></div><button type="button" id="gl-pos-add-payment">Agregar otro medio</button>';
   splitLines.querySelectorAll('select').forEach((select,i)=>{select.innerHTML=paymentSelect.innerHTML;select.selectedIndex=Math.min(i,availableMethods.length-1);});
   splitLines.querySelector('#gl-pos-add-payment').addEventListener('click',()=>{
    if(splitLines.querySelectorAll('.gl-pos-split-row').length>=20)return;
    const row=root.document.createElement('div');row.className='gl-pos-split-row';
    row.innerHTML='<select aria-label="Medio de pago"></select><input aria-label="Importe" type="number" min="0.01" step="0.01" placeholder="Importe">';
    row.querySelector('select').innerHTML=paymentSelect.innerHTML;
    splitLines.insertBefore(row,splitLines.lastElementChild);
   });
  }
 }
 splitEnabled.addEventListener('change',drawSplit);

 const receiptButton=root.document.createElement('button');
 receiptButton.type='button';receiptButton.textContent='Imprimir ticket';receiptButton.hidden=true;
 const paperLabel=root.document.createElement('label');
 paperLabel.textContent='Ancho del ticket: ';
 const paperSelect=root.document.createElement('select');
 paperSelect.setAttribute('aria-label','Ancho del ticket térmico');
 [['58mm','58 mm'],['80mm','80 mm']].forEach(([value,label])=>{const option=root.document.createElement('option');option.value=value;option.textContent=label;paperSelect.appendChild(option);});
 paperLabel.appendChild(paperSelect);
 const printerSettings=root.document.createElement('div');
 printerSettings.appendChild(paperLabel);
 saleMessage.insertAdjacentElement('afterend',printerSettings);
 printerSettings.insertAdjacentElement('afterend',receiptButton);
 const tenantKey=String(root.GestLokPilot?.tenantId?.()||'').trim();
 const hardware=root.GestLokPosDevices;
 if(hardware)paperSelect.value=hardware.load(tenantKey).paper;
 paperSelect.addEventListener('change',()=>{try{hardware?.save(tenantKey,{paper:paperSelect.value});}catch(_){}});
 receiptButton.addEventListener('click',()=>{
  if(!lastReceipt)return;
  try{
   if(!hardware?.load(tenantKey).printerEnabled)throw Error('Habilitá la impresora en Dispositivos para imprimir el ticket.');
   hardware.printTicket(lastReceipt,paperSelect.value);
  }catch(e){saleMessage.textContent=e.message||'No se pudo imprimir el comprobante.';}
 });
 const reportDay=container.querySelector('#gl-pos-report-day');
 const reportBody=container.querySelector('#gl-pos-reconcile-body');
 reportDay?.addEventListener('change',async()=>{
  if(!reportBody||typeof onReportDay!=='function')return;
  const selected=reportDay.value;
  reportDay.disabled=true;
  reportBody.textContent='Consultando cobros del Scanner…';
  try{
   const data=await onReportDay(selected);
   if(!disposed)reportBody.innerHTML=reportHtml(data);
  }catch(e){
   if(!disposed)reportBody.textContent=e.message||'No se pudo consultar este día.';
  }finally{if(!disposed)reportDay.disabled=false;}
 });
 let submitting=false,pendingRequestId=null,uncertain=false,lastReceipt=null,pendingPayment=null;
 search.setAttribute('aria-label','Código de barras o nombre del producto');
 camera.setAttribute('aria-label','Abrir cámara para escanear código de barras');
 let stopScan=null,disposed=false,scanModal=null,scanAttempt=0,sound=true,audio=null,scannedCount=0;
 const scanKeydown=e=>{if(e.key==='Escape'&&scanModal){e.preventDefault();finishScan();}};
 const scanVisibility=()=>{if(root.document.hidden&&scanModal)finishScan();};
 function finishScan(){
  scanAttempt++;
  stopScan?.();stopScan=null;
  if(scanModal){scanModal.remove();scanModal=null;}
  root.document.body.classList.remove('gl-pos-scanning');
  root.document.removeEventListener('keydown',scanKeydown);
  root.document.removeEventListener('visibilitychange',scanVisibility);
  try{audio?.close?.();}catch(_){}
  audio=null;
  if(!disposed){camera.disabled=false;camera.focus?.();}
 }
 function beep(){
  if(!sound||!audio)return;
  try{
   if(audio.state==='suspended')void audio.resume();
   const start=audio.currentTime+0.01;
   [980,1280].forEach((frequency,i)=>{
    const osc=audio.createOscillator(),gain=audio.createGain();
    osc.type='sine';osc.frequency.value=frequency;
    const at=start+i*.085;
    gain.gain.setValueAtTime(0,at);
    gain.gain.linearRampToValueAtTime(.16,at+.012);
    gain.gain.exponentialRampToValueAtTime(.001,at+.072);
    osc.connect(gain);gain.connect(audio.destination);
    osc.start(at);osc.stop(at+.085);
   });
  }catch(_){/* Algunos teléfonos bloquean audio en modo silencio. */}
  try{root.navigator?.vibrate?.(75);}catch(_){}
 }
 function acceptCode(code){
  if(uncertain||submitting)return false;
  const product=catalog.find(p=>p.barcode===code);
  search.value=code;paint();
  if(!product){message.textContent='Código no encontrado: '+code;return false;}
  if(product.price!==null&&Number.isInteger(product.stock)&&product.stock>(cart.get(product.id)||0)){
   cart.set(product.id,(cart.get(product.id)||0)+1);
   message.textContent='✓ '+product.name+' agregado al carrito.';
   paint();return product.name;
  }
  message.textContent='Producto sin precio o sin unidades disponibles.';
  return false;
 }
 search.addEventListener('keydown',e=>{
  if(uncertain)return;
  if(e.key==='Enter'){e.preventDefault();acceptCode(search.value.trim());}
 });
 camera.addEventListener('click',async()=>{
  if(disposed||scanModal)return;
  if(!root.GestLokPosScanner?.supported?.()){
   message.textContent='Cámara no disponible en este equipo. Usá el celular, un lector Bluetooth o ingresá el código.';return;
  }
  camera.disabled=true;scannedCount=0;
  const modal=root.document.createElement('div');
  modal.className='gl-pos-scan-modal';
  modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');
  modal.setAttribute('aria-label','Escáner de productos con cámara');
  modal.innerHTML='<div class="gl-pos-scan-shell"><header class="gl-pos-scan-header">'+
   '<div><small>GESTLOK · PLAN SCANNER</small><strong>Escanear productos</strong></div>'+
   '<button type="button" data-scan-close aria-label="Cerrar escáner">✕</button></header>'+
   '<div class="gl-pos-scan-stage"><video class="gl-pos-scan-video" playsinline muted autoplay></video>'+
   '<div class="gl-pos-scan-reticle" aria-hidden="true"><span class="gl-pos-scan-beam"></span></div>'+
   '<p class="gl-pos-scan-guide">Centrá el código de barras dentro del recuadro</p></div>'+
   '<div class="gl-pos-scan-bottom"><div class="gl-pos-scan-feedback" role="status" aria-live="polite">Activando cámara…</div>'+
   '<div class="gl-pos-scan-actions"><button type="button" data-scan-sound>🔊 Sonido activado</button>'+
   '<button type="button" data-scan-close>Volver al carrito</button></div></div></div>';
  modal.querySelectorAll('[data-scan-close]').forEach(b=>b.addEventListener('click',finishScan));
  modal.querySelector('[data-scan-sound]').addEventListener('click',e=>{
   sound=!sound;e.currentTarget.textContent=sound?'🔊 Sonido activado':'🔇 Sonido desactivado';
   e.currentTarget.setAttribute('aria-pressed',String(!sound));
  });
  scanModal=modal;
  root.document.body.appendChild(modal);
  root.document.body.classList.add('gl-pos-scanning');
  root.document.addEventListener('keydown',scanKeydown);
  root.document.addEventListener('visibilitychange',scanVisibility);
  modal.querySelector('[data-scan-close]')?.focus();
  // AudioContext se crea en el toque del usuario para respetar las políticas móviles.
  try{
   const Ctx=root.AudioContext||root.webkitAudioContext;
   if(Ctx){audio=new Ctx();void audio.resume?.().catch?.(()=>{});}
  }catch(_){}
  const attempt=++scanAttempt;
  const video=modal.querySelector('video'),feedback=modal.querySelector('.gl-pos-scan-feedback');
  try{
   const stop=await root.GestLokPosScanner.scan(video,code=>{
    if(disposed||scanModal!==modal)return;
    const productName=acceptCode(code);
    if(productName){
     scannedCount++;
     feedback.textContent='✓ '+productName+' agregado · '+scannedCount+' escaneado'+(scannedCount===1?'':'s');
     feedback.classList.add('is-good');
     beep();
    }else{
     feedback.textContent=message.textContent||'No se pudo agregar el producto.';
     feedback.classList.remove('is-good');
    }
   },{continuous:true});
   if(disposed||attempt!==scanAttempt||scanModal!==modal)stop();
   else{stopScan=stop;feedback.textContent='Cámara activa · apuntá al código de barras';}
  }catch(e){
   if(attempt===scanAttempt&&!disposed){
    finishScan();message.textContent=e.message||'No se pudo abrir la cámara.';
   }
  }
 });
 const stopReader=root.GestLokPosDevices?.bindKeyboard(tenantKey,code=>{if(!disposed)acceptCode(code);})||(()=>{});
 activeCleanup=()=>{disposed=true;finishScan();stopReader();};
 confirm.addEventListener('click',async()=>{
  if(submitting||!checkoutEnabled||!cart.size||!availableMethods.length)return;
  const lines=[...cart].map(([product_id,quantity])=>({product_id,quantity}));
  const payment=paymentSelect.value;
  const estimated=lines.reduce((sum,line)=>sum+(catalog.find(p=>p.id===line.product_id)?.price||0)*line.quantity,0);
  let payments=null;
  try{
   if(splitEnabled.checked){
    const parts=[...splitLines.querySelectorAll('.gl-pos-split-row')].map(row=>({method:row.querySelector('select').value,amount:row.querySelector('input').value}));
    payments=root.GestLokPosPayments.validateSplit({total:estimated,parts,methods:availableMethods});
   }else if(!availableMethods.some(m=>m.id===payment))throw Error('Medio de pago no habilitado.');
   else payments=root.GestLokPosPayments.validateSplit({total:estimated,parts:[{method:payment,amount:estimated}],methods:availableMethods});
  }catch(e){saleMessage.textContent=e.message;return;}
  const paymentLabel=payments?payments.map(p=>p.method+': '+money(p.amount)).join(', '):payment;
  if(uncertain&&pendingPayment!==JSON.stringify({payment,payments,estimated})){
   saleMessage.textContent='No cambies los importes ni el medio de pago mientras se verifica una venta pendiente.';return;
  }
  if(!pendingRequestId&&root.confirm&&!root.confirm('¿Ya recibiste '+money(estimated)+' por '+paymentLabel+'? Se guardará la venta y se descontará stock.'))return;
  pendingRequestId ||= root.crypto?.randomUUID();
  if(!pendingPayment)pendingPayment=JSON.stringify({payment,payments,estimated});
  if(!pendingRequestId){saleMessage.textContent='No se pudo generar un identificador de venta seguro.';return;}
  submitting=true;confirm.disabled=true;saleMessage.textContent='Registrando venta…';
  try{
   const result=await root.GestLokPosCheckout.checkout({
    db:root.GestLokSupabase,lines,payment,payments,methods:availableMethods,total:estimated,requestId:pendingRequestId
   });
   pendingRequestId=null;pendingPayment=null;uncertain=false;
   if(disposed)return;
   // El ticket se genera solo con importes confirmados por el servidor.
   lastReceipt=null;receiptButton.hidden=true;
   let saved={data:null,error:true};
   try{saved=getReceipt?await getReceipt(result):await root.GestLokSupabase.from('gestlok_pilot_pos_sales')
    .select('id,total,items,payment_method,payment_breakdown,created_at')
    .eq('tenant_id',result.tenantId).eq('id',result.saleId).single();}catch(_){}
   if(!saved.error&&saved.data&&Array.isArray(saved.data.items)){
    const sale=saved.data;
    const breakdown=sale.payment_breakdown&&typeof sale.payment_breakdown==='object'
     ?Object.entries(sale.payment_breakdown).map(([method,amount])=>method+': '+money(Number(amount))).join(', ')
     :sale.payment_method;
    lastReceipt={id:sale.id,date:new Date(sale.created_at).toLocaleString('es-AR'),
     payment:breakdown,lines:sale.items.map(item=>({name:item.name,quantity:Number(item.quantity),price:Number(item.unit_price)})),
     total:Number(sale.total)};
    receiptButton.hidden=false;
   }
   catalog=catalog.map(p=>({...p,stock:Number.isInteger(p.stock)?p.stock-(cart.get(p.id)||0):p.stock}));
   cart.clear();paint();
   saleMessage.textContent='✓ Venta registrada correctamente. Comprobante '+result.saleId.slice(0,8)+'.';
   if(typeof onSale==='function'){
    try{await onSale(result);}catch{if(!disposed)saleMessage.textContent+=' Actualizá la pantalla para consultar el stock.';}
   }
  }catch(e){
   if(['22023','42501'].includes(e.code)){pendingRequestId=null;pendingPayment=null;uncertain=false;}
   else uncertain=true;
   if(!disposed)saleMessage.textContent=(e.message||'No se pudo confirmar la venta.')+(uncertain?' Reintentá sin modificar el carrito para evitar duplicados.':'');
  }finally{if(!disposed){submitting=false;paint();}}
 });

 function paint(){
  const q=search.value.toLocaleLowerCase('es-AR').trim();
  confirm.disabled=!checkoutEnabled||!cart.size||submitting||!availableMethods.length;
  confirm.textContent=!checkoutEnabled?'Confirmar venta':uncertain?'Reintentar la misma venta':'Registrar venta cobrada';
  search.disabled=uncertain||submitting;
  const paymentSelect=container.querySelector('#gl-pos-payment');
  if(paymentSelect)paymentSelect.disabled=uncertain||submitting||!availableMethods.length;
  splitEnabled.disabled=uncertain||submitting||!availableMethods.length;
  splitLines.querySelectorAll('select,input,button').forEach(el=>{el.disabled=uncertain||submitting;});
  results.innerHTML=(q?catalog.filter(p=>(p.name+' '+p.barcode).toLocaleLowerCase('es-AR').includes(q)).slice(0,30):[]).map(p=>'<article class="gl-pos-product"><div><strong>'+esc(p.name)+'</strong><small style="display:block;margin-top:4px">'+stockInfo(p,cart.get(p.id)||0)+'</small></div><strong>'+(p.price===null?'Sin precio':money(p.price))+'</strong><button type="button" data-add="'+esc(p.id)+'" '+(p.price===null||!Number.isInteger(p.stock)||p.stock<=(cart.get(p.id)||0)||uncertain?'disabled':'')+'>Agregar</button></article>').join('');
  const lines=[...cart].map(([id,qty])=>({p:catalog.find(p=>p.id===id),qty}));
  cartBox.innerHTML=lines.map(({p,qty})=>'<div class="gl-pos-cart-line"><div><strong>'+esc(p.name)+'</strong><small style="display:block">'+money(p.price*qty)+'</small><small style="display:block;margin-top:3px">'+stockInfo(p,qty)+'</small></div><div class="gl-pos-quantity"><button type="button" data-decrease="'+esc(p.id)+'" aria-label="Restar una unidad de '+esc(p.name)+'">−</button><span>'+qty+'</span><button type="button" data-increase="'+esc(p.id)+'" aria-label="Sumar una unidad de '+esc(p.name)+'" '+(!Number.isInteger(p.stock)||qty>=p.stock||uncertain?'disabled':'')+'>+</button><button type="button" data-remove="'+esc(p.id)+'" aria-label="Quitar '+esc(p.name)+'">×</button></div></div>').join('')||'<p class="gl-pos-empty">Todavía no agregaste productos.</p>';
  total.textContent='Total estimado: '+money(lines.reduce((s,{p,qty})=>s+p.price*qty,0));
 }
 search.addEventListener('input',paint);
 container.addEventListener('click',e=>{
  if(uncertain)return;
  const add=e.target.closest('[data-add]'),remove=e.target.closest('[data-remove]'),increase=e.target.closest('[data-increase]'),decrease=e.target.closest('[data-decrease]');
  if(add){const p=catalog.find(p=>p.id===add.dataset.add);if(p&&p.price!==null&&Number.isInteger(p.stock)&&p.stock>(cart.get(p.id)||0))cart.set(p.id,(cart.get(p.id)||0)+1);}
  if(increase){const p=catalog.find(p=>p.id===increase.dataset.increase);if(p&&Number.isInteger(p.stock)&&p.stock>(cart.get(p.id)||0))cart.set(p.id,(cart.get(p.id)||0)+1);}
  if(decrease){const id=decrease.dataset.decrease,qty=cart.get(id)||0;if(qty<=1)cart.delete(id);else cart.set(id,qty-1);}
  if(remove)cart.delete(remove.dataset.remove);
  paint();
 });
 paint();
 activeUpdate=({products:newProducts,recentSales:newSales,report:newReport,reportDay:newDay}={})=>{
  if(disposed)return;
  if(Array.isArray(newProducts))catalog=root.GestLokPosCatalog?.catalog(newProducts)||[];
  if(Array.isArray(newSales)){
   const list=container.querySelector('.gl-pos-sales-list');
   if(list)list.innerHTML=salesHtml(newSales);
  }
  if(newReport&&reportBody&&reportDay?.value===newDay)reportBody.innerHTML=reportHtml(newReport);
  paint();
 };
}
function update(values){activeUpdate?.(values);}
root.GestLokPosPreview=Object.freeze({render,dispose,update});
})(typeof window!=='undefined'?window:globalThis);

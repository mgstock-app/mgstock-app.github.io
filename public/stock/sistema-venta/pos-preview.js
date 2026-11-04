/* Mobile-first POS view. Preview only: checkout disabled until secure RPC is reviewed. */
(function(root){
'use strict';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS'}).format(n);
let activeCleanup=null;
function dispose(){activeCleanup?.();activeCleanup=null;}
function render(container,products,{checkoutEnabled=false,onSale}={}){
 dispose();
 if(!container)throw Error('Contenedor requerido');
 const catalog=root.GestLokPosCatalog?.catalog(products)||[];
 const cart=new Map();
 const stockInfo=(p,qty=0)=>{if(!Number.isInteger(p.stock))return '<span style="color:#64748b">Stock sin contar</span>';const left=p.stock-qty,color=left<=0?'#b91c1c':left<=3?'#a16207':'#15803d';const label=left<=0?'Sin stock':left<=3?'Últimas '+left+' unidades':left+' unidades disponibles';return '<span style="font-size:12px;color:'+color+';font-weight:600">▣ '+label+'</span>';};
 container.innerHTML='<section class="gl-pos"><header class="gl-pos-heading"><div><small>GESTLOK · PUNTO DE VENTA</small><h2>Nueva venta</h2></div><span class="gl-pos-mode">Modo prueba</span></header><div class="gl-pos-layout"><div class="gl-pos-card"><h3>Buscar o escanear producto</h3><label for="gl-pos-search">Código de barras o nombre</label><input id="gl-pos-search" type="search" autocomplete="off" placeholder="Buscar producto..."><div class="gl-pos-camera-actions"><button type="button" id="gl-pos-camera">📷 Escanear con cámara</button><button type="button" id="gl-pos-stop" hidden>Detener cámara</button></div><video id="gl-pos-video" playsinline muted style="display:none;width:100%;max-height:260px"></video><p id="gl-pos-scan-message" role="status"></p><div id="gl-pos-results"></div></div><div class="gl-pos-card"><h3>Carrito</h3><div id="gl-pos-cart"></div><p id="gl-pos-total" class="gl-pos-total"></p><label for="gl-pos-payment">Medio de pago</label><select id="gl-pos-payment"><option value="efectivo">Efectivo</option><option value="transferencia">Transferencia</option></select><button type="button" id="gl-pos-checkout" '+(checkoutEnabled?'':'disabled')+'>Confirmar venta</button><p id="gl-pos-sale-message" role="status"></p><small class="gl-pos-note">La prueba no registra ventas ni descuenta stock.</small></div></div></section>';
 const search=container.querySelector('#gl-pos-search');
 const results=container.querySelector('#gl-pos-results');
 const cartBox=container.querySelector('#gl-pos-cart');
 const total=container.querySelector('#gl-pos-total');
 const video=container.querySelector('#gl-pos-video');
 const camera=container.querySelector('#gl-pos-camera');
 const stopButton=container.querySelector('#gl-pos-stop');
 const message=container.querySelector('#gl-pos-scan-message');
 const confirm=container.querySelector('#gl-pos-checkout');
 const saleMessage=container.querySelector('#gl-pos-sale-message');
 let submitting=false;
 search.setAttribute('aria-label','Código de barras o nombre del producto');
 camera.setAttribute('aria-label','Abrir cámara para escanear código de barras');
 let stopScan=null,disposed=false;
 function finishScan(){
  stopScan?.();stopScan=null;
  video.style.display='none';stopButton.hidden=true;camera.disabled=false;
 }
 function acceptCode(code){
  const product=catalog.find(p=>p.barcode===code);
  search.value=code;paint();
  if(!product){message.textContent='Código no encontrado: '+code;return;}
  message.textContent='Detectado: '+product.name;
  if(product.price!==null&&(!Number.isInteger(product.stock)||product.stock>(cart.get(product.id)||0))){
   cart.set(product.id,(cart.get(product.id)||0)+1);paint();
  }else message.textContent='Producto sin precio o sin unidades disponibles.';
 }
 search.addEventListener('keydown',e=>{
  if(e.key==='Enter'){e.preventDefault();acceptCode(search.value.trim());}
 });
 camera.addEventListener('click',async()=>{
  if(!root.GestLokPosScanner?.supported?.()){
   message.textContent='Cámara no disponible. Ingresá el código manualmente o con lector Bluetooth.';return;
  }
  camera.disabled=true;video.style.display='block';stopButton.hidden=false;
  try{
   const stop=await root.GestLokPosScanner.scan(video,code=>{if(disposed)return;finishScan();acceptCode(code);});
   if(disposed||stopButton.hidden)stop();else stopScan=stop;
  }catch(e){finishScan();message.textContent=e.message||'No se pudo abrir la cámara.';}
 });
 stopButton.addEventListener('click',finishScan);
 activeCleanup=()=>{disposed=true;finishScan();};
 confirm.addEventListener('click',async()=>{
  if(submitting||!checkoutEnabled||!cart.size)return;
  submitting=true;confirm.disabled=true;saleMessage.textContent='Registrando venta…';
  const lines=[...cart].map(([product_id,quantity])=>({product_id,quantity}));
  try{
   const result=await root.GestLokPosCheckout.checkout({
    db:root.GestLokSupabase,lines,
    payment:container.querySelector('#gl-pos-payment').value
   });
   if(disposed)return;
   cart.clear();paint();
   saleMessage.textContent='Venta confirmada · '+result.saleId;
   if(typeof onSale==='function')await onSale(result);
  }catch(e){if(!disposed)saleMessage.textContent=e.message||'No se pudo confirmar la venta.';}
  finally{if(!disposed){submitting=false;confirm.disabled=false;}}
 });

 function paint(){
  const q=search.value.toLocaleLowerCase('es-AR').trim();
  results.innerHTML=(q?catalog.filter(p=>(p.name+' '+p.barcode).toLocaleLowerCase('es-AR').includes(q)).slice(0,30):[]).map(p=>'<article class="gl-pos-product"><div><strong>'+esc(p.name)+'</strong><small style="display:block;margin-top:4px">'+stockInfo(p,cart.get(p.id)||0)+'</small></div><strong>'+(p.price===null?'Sin precio':money(p.price))+'</strong><button type="button" data-add="'+esc(p.id)+'" '+(p.price===null||Number.isInteger(p.stock)&&p.stock<=(cart.get(p.id)||0)?'disabled':'')+'>Agregar</button></article>').join('');
  const lines=[...cart].map(([id,qty])=>({p:catalog.find(p=>p.id===id),qty}));
  cartBox.innerHTML=lines.map(({p,qty})=>'<div class="gl-pos-cart-line"><div><strong>'+esc(p.name)+'</strong><small style="display:block">'+money(p.price*qty)+'</small><small style="display:block;margin-top:3px">'+stockInfo(p,qty)+'</small></div><div class="gl-pos-quantity"><button type="button" data-decrease="'+esc(p.id)+'" aria-label="Restar una unidad de '+esc(p.name)+'">−</button><span>'+qty+'</span><button type="button" data-increase="'+esc(p.id)+'" aria-label="Sumar una unidad de '+esc(p.name)+'" '+(Number.isInteger(p.stock)&&qty>=p.stock?'disabled':'')+'>+</button><button type="button" data-remove="'+esc(p.id)+'" aria-label="Quitar '+esc(p.name)+'">×</button></div></div>').join('')||'<p class="gl-pos-empty">Todavía no agregaste productos.</p>';
  total.textContent='Total estimado: '+money(lines.reduce((s,{p,qty})=>s+p.price*qty,0));
 }
 search.addEventListener('input',paint);
 container.addEventListener('click',e=>{
  const add=e.target.closest('[data-add]'),remove=e.target.closest('[data-remove]'),increase=e.target.closest('[data-increase]'),decrease=e.target.closest('[data-decrease]');
  if(add){const p=catalog.find(p=>p.id===add.dataset.add);if(p&&p.price!==null&&(!Number.isInteger(p.stock)||p.stock>(cart.get(p.id)||0)))cart.set(p.id,(cart.get(p.id)||0)+1);}
  if(increase){const p=catalog.find(p=>p.id===increase.dataset.increase);if(p&&(!Number.isInteger(p.stock)||p.stock>(cart.get(p.id)||0)))cart.set(p.id,(cart.get(p.id)||0)+1);}
  if(decrease){const id=decrease.dataset.decrease,qty=cart.get(id)||0;if(qty<=1)cart.delete(id);else cart.set(id,qty-1);}
  if(remove)cart.delete(remove.dataset.remove);
  paint();
 });
 paint();
}
root.GestLokPosPreview=Object.freeze({render,dispose});
})(typeof window!=='undefined'?window:globalThis);

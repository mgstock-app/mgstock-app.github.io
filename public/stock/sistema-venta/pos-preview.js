/* Mobile-first POS view. Preview only: checkout disabled until secure RPC is reviewed. */
(function(root){
'use strict';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS'}).format(n);
let activeCleanup=null;
function dispose(){activeCleanup?.();activeCleanup=null;}
function render(container,products){
 dispose();
 if(!container)throw Error('Contenedor requerido');
 const catalog=root.GestLokPosCatalog?.catalog(products)||[];
 const cart=new Map();
 container.innerHTML='<section class="gl-pos"><h2>Sistema de venta</h2><p>Vista previa · sin cobros habilitados</p><label>Buscar código o producto<input id="gl-pos-search" type="search" autocomplete="off" placeholder="Código de barras o nombre"></label><button type="button" id="gl-pos-camera">Escanear con cámara</button><button type="button" id="gl-pos-stop" hidden>Detener cámara</button><video id="gl-pos-video" playsinline muted style="display:none;width:100%;max-height:260px"></video><p id="gl-pos-scan-message" role="status"></p><div id="gl-pos-results"></div><h3>Carrito</h3><div id="gl-pos-cart"></div><p id="gl-pos-total"></p><button type="button" disabled>Confirmar venta (pendiente)</button></section>';
 const search=container.querySelector('#gl-pos-search');
 const results=container.querySelector('#gl-pos-results');
 const cartBox=container.querySelector('#gl-pos-cart');
 const total=container.querySelector('#gl-pos-total');
 const video=container.querySelector('#gl-pos-video');
 const camera=container.querySelector('#gl-pos-camera');
 const stopButton=container.querySelector('#gl-pos-stop');
 const message=container.querySelector('#gl-pos-scan-message');
 search.setAttribute('aria-label','Código de barras o nombre del producto');
 camera.setAttribute('aria-label','Abrir cámara para escanear código de barras');
 let stopScan=null;
 function finishScan(){
  stopScan?.();stopScan=null;
  video.style.display='none';stopButton.hidden=true;camera.disabled=false;
 }
 function acceptCode(code){
  const product=catalog.find(p=>p.barcode===code);
  search.value=code;paint();
  if(!product){message.textContent='Código no encontrado: '+code;return;}
  message.textContent='Detectado: '+product.name;
  if(product.price!==null&&Number.isInteger(product.stock)&&product.stock>(cart.get(product.id)||0)){
   cart.set(product.id,(cart.get(product.id)||0)+1);paint();
  }else message.textContent='Producto sin precio o stock disponible.';
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
   const stop=await root.GestLokPosScanner.scan(video,code=>{finishScan();acceptCode(code);});
   if(stopButton.hidden)stop();else stopScan=stop;
  }catch(e){finishScan();message.textContent=e.message||'No se pudo abrir la cámara.';}
 });
 stopButton.addEventListener('click',finishScan);
 activeCleanup=finishScan;

 function paint(){
  const q=search.value.toLocaleLowerCase('es-AR').trim();
  results.innerHTML=catalog.filter(p=>!q||(p.name+' '+p.barcode).toLocaleLowerCase('es-AR').includes(q)).slice(0,30).map(p=>'<article><strong>'+esc(p.name)+'</strong> · '+(p.price===null?'Sin precio':money(p.price))+' · Stock '+(p.stock??'Sin contar')+' <button type="button" data-add="'+esc(p.id)+'" '+(p.price===null||!Number.isInteger(p.stock)||p.stock<1?'disabled':'')+'>Agregar</button></article>').join('');
  const lines=[...cart].map(([id,qty])=>({p:catalog.find(p=>p.id===id),qty}));
  cartBox.innerHTML=lines.map(({p,qty})=>'<p>'+esc(p.name)+' × '+qty+' · '+money(p.price*qty)+' <button type="button" data-remove="'+esc(p.id)+'">Quitar</button></p>').join('')||'<p>Sin productos</p>';
  total.textContent='Total estimado: '+money(lines.reduce((s,{p,qty})=>s+p.price*qty,0));
 }
 search.addEventListener('input',paint);
 container.addEventListener('click',e=>{
  const add=e.target.closest('[data-add]'),remove=e.target.closest('[data-remove]');
  if(add){const p=catalog.find(p=>p.id===add.dataset.add);if(p&&p.price!==null&&Number.isInteger(p.stock)&&p.stock>(cart.get(p.id)||0))cart.set(p.id,(cart.get(p.id)||0)+1);}
  if(remove)cart.delete(remove.dataset.remove);
  paint();
 });
 paint();
}
root.GestLokPosPreview=Object.freeze({render,dispose});
})(typeof window!=='undefined'?window:globalThis);

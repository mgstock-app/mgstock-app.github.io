/* Mobile-first POS view. Preview only: checkout disabled until secure RPC is reviewed. */
(function(root){
'use strict';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS'}).format(n);
function render(container,products){
 if(!container)throw Error('Contenedor requerido');
 const catalog=root.GestLokPosCatalog?.catalog(products)||[];
 const cart=new Map();
 container.innerHTML='<section class="gl-pos"><h2>Sistema de venta</h2><p>Vista previa · sin cobros habilitados</p><label>Buscar código o producto<input id="gl-pos-search" type="search" autocomplete="off" placeholder="Código de barras o nombre"></label><div id="gl-pos-results"></div><h3>Carrito</h3><div id="gl-pos-cart"></div><p id="gl-pos-total"></p><button type="button" disabled>Confirmar venta (pendiente)</button></section>';
 const search=container.querySelector('#gl-pos-search');
 const results=container.querySelector('#gl-pos-results');
 const cartBox=container.querySelector('#gl-pos-cart');
 const total=container.querySelector('#gl-pos-total');
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
root.GestLokPosPreview=Object.freeze({render});
})(typeof window!=='undefined'?window:globalThis);

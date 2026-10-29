/* Precios/Stock de nuevos locales (NO Mi Gusto): módulo separado del piloto Cami.
 * La membresía autorizada viene de RPC y RLS, nunca del correo/URL o de la vista.
 */
(()=>{
 'use strict';
 const ex=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const pesos=v=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS'}).format(Number(v));
 const price=(c,p)=>Math.round((Number(c)*(1+Number(p)/100)+Number.EPSILON)*100)/100;
 const money=v=>v==null?'':String(v);
 const $=s=>document.querySelector(s);
 let scope=null,host=null,tenant='',checked=false,busy=false,openPanel=false,mode='precios',local='',rows=[],error='',notice='',loading=false,editing='',search='',fetchNonce=0;
 function reset(){
  scope=null;host=null;tenant='';checked=false;busy=false;openPanel=false;local='';rows=[];error='';notice='';editing='';fetchNonce++;
  $('#gl-future-panel')?.remove();document.body.classList.remove('gl-future-open');
 }
 function allowedIds(){return Array.isArray(scope?.local_ids)?scope.local_ids:[];}
 function allowed(){return !!scope?.enabled&&host?.role?.()==='dueno'&&host?.S?.me?.tenant_id===tenant&&scope?.tenant_id===tenant&&allowedIds().length>0;}
 function localName(id){return (host?.S?.localesDB||[]).find(x=>x.id===id)?.nombre||id;}
 async function refresh(context,api){
  if(!context||context.role!=='dueno'||api?.role?.()!=='dueno'||context.tenant_id!==api?.S?.me?.tenant_id){reset();return;}
  const newTenant=context.tenant_id;
  if(checked&&tenant===newTenant&&host===api)return;
  tenant=newTenant;host=api;checked=true;scope=null;
  try{
   const {data,error:e}=await window.GestLokSupabase.rpc('gestlok_future_pricing_scope');
   if(e)throw e;
   if(data?.enabled&&data?.tenant_id===tenant&&Array.isArray(data?.local_ids)){
    scope=data;
    if(!allowedIds().includes(local))local=allowedIds().includes(api.S.local)?api.S.local:allowedIds()[0];
   }
  }catch{scope=null;}
  if(allowed())host?.render?.();
 }
 function homeTile(context,api){
  if(!allowed()||context?.tenant_id!==tenant||api!==host)return '';
  return '<section class="gl-future-shortcuts" aria-label="Control de precios y stock de locales nuevos">'+
   '<div><small>GESTIÓN POR LOCAL</small><strong>Precios y Stock</strong><p>Controlá costos, recargos y unidades de cada local.</p></div>'+
   '<div><button type="button" data-future-open="precios">Precios</button><button type="button" data-future-open="stock">Stock</button></div></section>';
 }
 async function assertAccess(){
  if(!allowed()||!allowedIds().includes(local))throw Error('No tenés acceso a este local.');
  const {data,error:e}=await window.GestLokSupabase.auth.getUser();
  if(e||!data?.user)throw Error('Iniciá sesión con tu cuenta autorizada.');
  return data.user;
 }
 async function load(){
  const nonce=++fetchNonce;loading=true;error='';render();
  try{
   await assertAccess();
   const {data,error:e}=await window.GestLokSupabase.from('gestlok_future_local_prices_stock')
    .select('id,name,category,sku,cost_price,markup_percent,sale_price,stock_quantity,stock_minimum,active,updated_at')
    .eq('tenant_id',tenant).eq('local_id',local).eq('active',true).order('name',{ascending:true}).limit(500);
   if(e)throw e;
   if(nonce!==fetchNonce)return;
   rows=data||[];
  }catch(e){if(nonce===fetchNonce)error=e.message||'No pudimos cargar este local.';}
  finally{if(nonce===fetchNonce){loading=false;render();}}
 }
 function start(section){
  if(!allowed())return;
  mode=section==='stock'?'stock':'precios';editing='';search='';notice='';error='';
  if(!allowedIds().includes(local))local=allowedIds()[0];
  openPanel=true;render();void load();
 }
 function close(){
  openPanel=false;fetchNonce++;rows=[];error='';editing='';
  $('#gl-future-panel')?.remove();document.body.classList.remove('gl-future-open');
 }
 function inventory(){
  const counted=rows.filter(p=>p.cost_price!=null&&p.sale_price!=null&&p.stock_quantity!=null);
  const cost=counted.reduce((v,p)=>v+Number(p.cost_price)*p.stock_quantity,0);
  const sale=counted.reduce((v,p)=>v+Number(p.sale_price)*p.stock_quantity,0);
  return {cost,sale,profit:sale-cost};
 }
 function badge(p){
  if(p.stock_quantity==null)return ['Sin contar',''];
  if(p.stock_quantity===0)return ['Sin stock','is-zero'];
  if(p.stock_quantity<=p.stock_minimum)return ['Stock bajo','is-low'];
  return ['Disponible','is-ok'];
 }
 function item(p){
  const priced=p.cost_price!=null&&p.sale_price!=null;
  const [status,klass]=badge(p);
  return '<article class="gl-ps-item" data-future-row data-future-search="'+ex((p.name+' '+p.category+' '+p.sku).toLowerCase())+'">'+
   '<header><div><b>'+ex(p.name)+'</b><small>'+ex(p.category||'Sin categoría')+(p.sku?' · '+ex(p.sku):'')+'</small></div>'+
   '<span class="gl-ps-badge '+klass+'">'+(mode==='stock'?status:priced?'Calculado':'Sin configurar')+'</span></header>'+
   (mode==='precios'?'<div class="gl-ps-cell-grid"><div><small>Costo</small><strong>'+(priced?pesos(p.cost_price):'Sin cargar')+'</strong></div>'+
      '<div><small>Recargo</small><strong>'+(p.markup_percent!=null?ex(p.markup_percent)+'%':'—')+'</strong></div>'+
      '<div><small>Precio a vender</small><strong>'+(priced?pesos(p.sale_price):'—')+'</strong></div>'+
      '<div><small>Ganancia bruta / unidad</small><strong>'+(priced?pesos(Number(p.sale_price)-Number(p.cost_price)):'—')+'</strong></div></div>':
      '<div class="gl-ps-cell-grid gl-ps-stock-grid"><div><small>Unidades disponibles</small><strong>'+(p.stock_quantity==null?'Sin contar':ex(p.stock_quantity))+'</strong></div>'+
      '<div><small>Alerta de stock bajo</small><strong>'+ex(p.stock_minimum)+'</strong></div></div>')+
   '<footer><small>Actualizado '+ex(new Date(p.updated_at).toLocaleDateString('es-AR'))+'</small><button type="button" data-future-edit="'+ex(p.id)+'">Editar '+(mode==='precios'?'precios':'stock')+'</button></footer></article>';
 }
 function form(){
  const p=rows.find(x=>x.id===editing);
  const inp=k=>ex(money(p?.[k]));
  const priced=p?.cost_price!=null&&p?.markup_percent!=null;
  const title='<div class="gl-ps-form-title"><h3>'+(mode==='precios'?(p?'Editar precios':'Agregar producto'):'Actualizar stock · '+ex(p?.name||''))+'</h3>'+
   '<button type="button" data-future-cancel>Cerrar ×</button></div>';
  if(mode==='stock'&&!p)return '';
  return '<form class="gl-ps-form" id="gl-future-form">'+title+
   (mode==='precios'?'<div class="gl-ps-fields"><label>Nombre del producto<input name="name" required minlength="2" maxlength="140" value="'+inp('name')+'" placeholder="Nombre"></label>'+
    '<label>Categoría (opcional)<input name="category" maxlength="80" value="'+inp('category')+'"></label>'+
    '<label>Código (opcional)<input name="sku" maxlength="80" value="'+inp('sku')+'"></label>'+
    '<label>Precio costo (ARS)<input name="cost_price" required type="number" inputmode="decimal" min="0" max="9999999999.99" step=".01" value="'+inp('cost_price')+'"></label>'+
    '<label>Porcentaje de recargo (%)<input name="markup_percent" required type="number" inputmode="decimal" min="0" max="5000" step=".01" value="'+inp('markup_percent')+'"></label></div>'+
    '<div class="gl-ps-preview" aria-live="polite"><div><small>Precio a vender</small><strong data-future-sale>'+(priced?pesos(p.sale_price):'—')+'</strong></div>'+
     '<div><small>Ganancia bruta por unidad</small><strong data-future-gain>'+(priced?pesos(Number(p.sale_price)-Number(p.cost_price)):'—')+'</strong></div></div>'+
    '<p class="gl-ps-help">El porcentaje es un recargo sobre costo. No descuenta impuestos, comisiones ni gastos adicionales.</p>':
    '<div class="gl-ps-fields"><label>Unidades disponibles<input name="stock_quantity" required type="number" inputmode="numeric" step="1" min="0" max="100000000" value="'+inp('stock_quantity')+'"></label>'+
    '<label>Mínimo para alerta<input name="stock_minimum" required type="number" inputmode="numeric" step="1" min="0" max="100000000" value="'+ex(p.stock_minimum)+'"></label></div>'+
    '<p class="gl-ps-help">Se guarda manualmente. Las ventas no descuentan cantidades en esta etapa.</p>')+
    '<button type="submit" '+(busy?'disabled':'')+'>'+(busy?'Guardando…':'Guardar cambios')+'</button></form>';
 }
 function view(){
  const c=inventory(),stock=mode==='stock';
  return '<section class="gl-ps"><header class="gl-ps-head"><div><small>GESTLOK · '+ex(localName(local))+'</small><h2>'+(stock?'Stock':'Precios')+'</h2>'+
   '<p>'+(stock?'Cantidad real de productos por local.':'Costo, recargo y ganancia bruta por unidad.')+'</p></div><button type="button" data-future-refresh>Actualizar</button></header>'+
   (error?'<p class="gl-ps-error" role="alert">'+ex(error)+'</p>':'')+
   (notice?'<p class="gl-ps-success" role="status">'+ex(notice)+'</p>':'')+
   (loading?'<p role="status">Cargando productos del local…</p>':
    '<div class="gl-ps-stats">'+[
      ['Productos',rows.length],['Con precios',rows.filter(x=>x.cost_price!=null).length],
      ['Sin stock',rows.filter(x=>x.stock_quantity===0).length],
      ['Stock bajo',rows.filter(x=>x.stock_quantity>0&&x.stock_quantity<=x.stock_minimum).length]
     ].map(([l,n])=>'<div><small>'+l+'</small><strong>'+n+'</strong></div>').join('')+'</div>'+
    (stock?'<div class="gl-ps-inventory-summary">'+[
      ['Costo del stock registrado',pesos(c.cost)],
      ['Venta potencial',pesos(c.sale)],['Ganancia bruta potencial',pesos(c.profit)]
     ].map(([l,n])=>'<div><small>'+l+'</small><strong>'+n+'</strong></div>').join('')+'</div>':'')+
    '<div class="gl-ps-toolbar"><label>Buscar producto<input type="search" data-future-search placeholder="Producto, categoría o código" value="'+ex(search)+'"></label>'+
    '<button type="button" data-future-new>'+(stock?'Agregar en Precios':'+ Agregar producto')+'</button></div>'+
    (editing?form():'')+
    (rows.length?'<div class="gl-ps-items">'+rows.map(item).join('')+'</div>':
     '<div class="gl-ps-empty"><h3>Este local todavía no tiene productos.</h3><p>Agregá el primer producto en Precios.</p><button data-future-new>Agregar producto</button></div>')+
    '<p class="gl-ps-help gl-ps-end">Registro manual exclusivo de este local. No mueve dinero real, no registra ventas ni descuenta Pedidos automáticamente.</p>')+
   '</section>';
 }
 function render(){
  if(!openPanel||!allowed())return;
  let root=$('#gl-future-panel');
  if(!root){root=document.createElement('div');root.id='gl-future-panel';document.body.appendChild(root);}
  root.innerHTML='<div class="gl-pilot-shell" role="dialog" aria-modal="true" aria-labelledby="gl-future-title">'+
   '<header class="gl-pilot-top"><div><small>GESTLOK · GESTIÓN POR LOCAL</small><h1 id="gl-future-title">Precios y Stock</h1>'+
   '<span>'+ex(scope.company_name||'Mi empresa')+'</span></div><button type="button" data-future-close>Cerrar ×</button></header>'+
   '<div class="gl-future-controls"><label>Local<select data-future-local>'+allowedIds().map(id=>
    '<option value="'+ex(id)+'" '+(id===local?'selected':'')+'>'+ex(localName(id))+'</option>').join('')+'</select></label>'+
   '<div role="tablist" aria-label="Administración por local"><button data-future-tab="precios" '+(mode==='precios'?'aria-selected="true"':'')+'>Precios</button>'+
   '<button data-future-tab="stock" '+(mode==='stock'?'aria-selected="true"':'')+'>Stock</button></div></div>'+
   '<main class="gl-pilot-content">'+view()+'</main></div>';
  document.body.classList.add('gl-future-open');
 }
 function numeric(v,min,max){return String(v)!==''&&Number.isFinite(Number(v))&&Number(v)>=min&&Number(v)<=max;}
 function whole(v){return /^\d+$/.test(String(v))&&Number(v)<=100000000&&Number.isSafeInteger(Number(v));}
 async function save(f){
  if(busy||!allowed())return;
  const d=Object.fromEntries(new FormData(f).entries()),p=rows.find(x=>x.id===editing);
  let fields;
  if(mode==='precios'){
   const name=String(d.name||'').trim(),c=String(d.cost_price||''),m=String(d.markup_percent||'');
   if(name.length<2||name.length>140||!numeric(c,0,9999999999.99)||!numeric(m,0,5000)||price(c,m)>9999999999.99){
    error='Revisá nombre, costo y porcentaje.';render();return;
   }
   fields={name,category:String(d.category||'').trim(),sku:String(d.sku||'').trim(),cost_price:Number(c),markup_percent:Number(m)};
  }else{
   if(!p||!whole(d.stock_quantity)||!whole(d.stock_minimum)){error='Ingresá cantidades enteras válidas.';render();return;}
   fields={stock_quantity:Number(d.stock_quantity),stock_minimum:Number(d.stock_minimum)};
  }
  busy=true;error='';notice='';
  // Keep form mounted during save to avoid losing typed fields on network latency.
  f.querySelector('[type="submit"]').disabled=true;
  try{
   await assertAccess();
   let q=p?window.GestLokSupabase.from('gestlok_future_local_prices_stock').update(fields)
      .eq('tenant_id',tenant).eq('local_id',local).eq('id',p.id).eq('updated_at',p.updated_at):
     window.GestLokSupabase.from('gestlok_future_local_prices_stock')
      .insert({tenant_id:tenant,local_id:local,...fields});
   const {data,error:e}=await q.select('id').maybeSingle();
   if(e)throw e;
   if(!data)throw Error('El producto cambió en otro dispositivo. Actualizá para continuar.');
   editing='';await load();notice='Cambios guardados correctamente.';
  }catch(e){error=e.message||'No se pudo guardar.';}
  finally{busy=false;render();}
 }
 document.addEventListener('click',e=>{
  const launch=e.target.closest('[data-future-open]');
  if(launch){e.preventDefault();start(launch.dataset.futureOpen);return;}
  if(!openPanel||!$('#gl-future-panel'))return;
  if(e.target.closest('[data-future-close]')){close();return;}
  const tab=e.target.closest('[data-future-tab]');
  if(tab){mode=tab.dataset.futureTab==='stock'?'stock':'precios';editing='';search='';notice='';error='';render();return;}
  if(e.target.closest('[data-future-refresh]')){void load();return;}
  if(e.target.closest('[data-future-cancel]')){editing='';error='';render();return;}
  if(e.target.closest('[data-future-new]')){
   mode='precios';editing='new';notice='';error='';render();return;
  }
  const edit=e.target.closest('[data-future-edit]');
  if(edit&&rows.some(x=>x.id===edit.dataset.futureEdit)){
   editing=edit.dataset.futureEdit;error='';render();return;
  }
 });
 document.addEventListener('change',e=>{
  if(!openPanel||!e.target.matches('[data-future-local]'))return;
  if(!allowedIds().includes(e.target.value))return;
  local=e.target.value;editing='';search='';rows=[];notice='';void load();
 });
 document.addEventListener('input',e=>{
  if(!openPanel)return;
  if(e.target.matches('[data-future-search]')){
   search=e.target.value.toLowerCase().trim();
   document.querySelectorAll('#gl-future-panel [data-future-row]').forEach(x=>x.hidden=!x.dataset.futureSearch.includes(search));
  }
  if(e.target.closest('#gl-future-form')&&['cost_price','markup_percent'].includes(e.target.name)){
   const f=e.target.form,c=f.elements.namedItem('cost_price').value,m=f.elements.namedItem('markup_percent').value;
   const valid=numeric(c,0,9999999999.99)&&numeric(m,0,5000)&&price(c,m)<=9999999999.99;
   f.querySelector('[data-future-sale]').textContent=valid?pesos(price(c,m)):'—';
   f.querySelector('[data-future-gain]').textContent=valid?pesos(price(c,m)-Number(c)):'—';
  }
 });
 document.addEventListener('submit',e=>{
  if(e.target.id==='gl-future-form'){e.preventDefault();void save(e.target);}
 });
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&openPanel)close();});
 window.GestLokFuturePricing=Object.freeze({refresh,homeTile,price,start,allowed,localIds:allowedIds});
})();

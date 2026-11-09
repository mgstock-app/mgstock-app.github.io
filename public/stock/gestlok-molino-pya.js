/* El Molino Café · Acassuso · Precios PedidosYa (09/11/2026).
   Planilla de precios para cargar a mano en PedidosYa: Precio Local editable y Precio PYA
   calculado con el porcentaje (50 % inicial). No se conecta con PedidosYa.
   Exclusiva de Acassuso: todas las lecturas y escrituras pasan por RPC gestlok_molino_pya_*
   que validan empresa, sucursal y rol en el servidor (la administradora es la única que
   cambia nombres, categorías, orden, porcentaje y marca «ya actualizado»). */
(()=>{
'use strict';
if(window.GestLokMolinoPYA)return;
const TENANT='6c8717ea-5f78-426b-9458-74a5dcac6e4e';
const ACASSUSO='loc-6c8717ea5f78426b9458';
let api=null,opened=false,data=null,error='',busy=false,msg='',filter='todos',search='',collapsed=new Set(),
  drafts=new Map(),editing=null,conflicts=null,pollTimer=null,priorFocus=null;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const $=s=>document.querySelector(s);
const inAcassuso=()=>api?.S?.me?.tenant_id===TENANT&&api?.S?.local===ACASSUSO;
const money=n=>n==null||n===''||Number.isNaN(Number(n))?'—':'$ '+new Intl.NumberFormat('es-AR',{maximumFractionDigits:2}).format(Number(n));
const pct=()=>Number(data?.percent??50);
const pya=(p,percent=pct())=>p==null||p===''||Number.isNaN(Number(p))?null:Math.ceil(Math.round(Number(p)*(100+Number(percent)))/10000)*100;
const fmtDate=t=>{try{return new Intl.DateTimeFormat('es-AR',{timeZone:'America/Argentina/Buenos_Aires',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(t));}catch{return '';}};
// «2.500», «$ 2500», «2500,50» → número. Vacío → null (sin precio).
function parsePrice(v){
 const s=String(v??'').replace(/\$/g,'').replace(/\s/g,'');
 if(!s)return null;
 const norm=s.includes(',')?s.replace(/\./g,'').replace(',','.'):(/^\d{1,3}(\.\d{3})+$/.test(s)?s.replace(/\./g,''):s);
 const n=Number(norm);
 return Number.isFinite(n)&&n>=0&&n<=99999999?Math.round(n*100)/100:NaN;
}
async function rpc(name,args){
 if(!window.GestLokSupabase)throw Error('Sin conexión con GESTLOK.');
 if(typeof navigator!=='undefined'&&navigator.onLine===false)throw Error('Necesitás conexión para guardar los precios.');
 const r=await window.GestLokSupabase.rpc(name,args||{});
 if(r.error)throw r.error;
 return r.data;
}
async function reload(){
 try{data=await rpc('gestlok_molino_pya_state');error='';}
 catch(e){error=e?.message||'No se pudo cargar PedidosYa.';}
 render();
}
const products=()=>data?.products||[];
const priceOf=p=>drafts.has(p.id)?drafts.get(p.id).value:p.price_local;
const isDraft=p=>drafts.has(p.id);
const counts=()=>{const ps=products();return {todos:ps.length,modificados:ps.filter(p=>p.pending_pya||isDraft(p)).length,sin:ps.filter(p=>priceOf(p)==null).length};};
function visible(p){
 if(search&&!p.name.toLowerCase().includes(search.toLowerCase()))return false;
 if(filter==='modificados')return p.pending_pya||isDraft(p);
 if(filter==='sin')return priceOf(p)==null;
 return true;
}
function sourceTag(p){
 if(!p.linked_price_id)return '<span class="gl-pya-tag">Precio manual</span>';
 const si=p.san_isidro_amount;
 if(p.price_source==='san_isidro'&&Number(si)===Number(p.price_local))return '<span class="gl-pya-tag gl-pya-tag--link">Vinculado a San Isidro</span>';
 return '<span class="gl-pya-tag gl-pya-tag--manual">Manual · San Isidro '+esc(money(si))+'</span>';
}
function productRow(p,i,list){
 const admin=!!data?.can_admin,draft=isDraft(p),price=priceOf(p),bad=draft&&Number.isNaN(drafts.get(p.id).value);
 const ch=p.last_change;
 const pending=p.pending_pya&&!draft?'<div class="gl-pya-change"><b>Actualizar en PedidosYa</b>'+
   (ch?' · '+(ch.reason==='porcentaje'?'PYA '+esc(money(ch.old_pya))+' → '+esc(money(ch.new_pya))+' (cambió el porcentaje)':'Antes '+esc(money(ch.old_price))+' → ahora '+esc(money(ch.new_price)))+' · '+esc(fmtDate(ch.changed_at)):'')+
   (admin?' <button type="button" class="gl-pya-mini" data-pya-done="'+esc(p.id)+'">Ya lo actualicé</button>':'')+'</div>':'';
 const tools=admin?'<span class="gl-pya-tools">'+
   '<button type="button" class="gl-pya-icon" data-pya-edit-product="'+esc(p.id)+'" aria-label="Editar '+esc(p.name)+'" title="Editar">✎</button>'+
   '<button type="button" class="gl-pya-icon" data-pya-move="'+esc(p.id)+'" data-dir="-1" aria-label="Subir '+esc(p.name)+'" title="Subir"'+(i===0?' disabled':'')+'>↑</button>'+
   '<button type="button" class="gl-pya-icon" data-pya-move="'+esc(p.id)+'" data-dir="1" aria-label="Bajar '+esc(p.name)+'" title="Bajar"'+(i===list.length-1?' disabled':'')+'>↓</button></span>':'';
 if(editing?.type==='product'&&editing.id===p.id)return '<div class="gl-pya-row gl-pya-row--edit">'+productForm(p)+'</div>';
 return '<div class="gl-pya-row'+(draft?' is-draft':p.pending_pya?' is-pending':'')+(price==null&&!draft?' is-empty':'')+'" data-pya-row="'+esc(p.id)+'">'+
  '<div class="gl-pya-name"><span class="gl-pya-pname">'+esc(p.name)+'</span>'+tools+
   (draft?'<span class="gl-pya-flag">✎ Modificado</span>':'')+'<div class="gl-pya-meta">'+sourceTag(p)+'</div>'+pending+'</div>'+
  '<label class="gl-pya-price"><span class="gl-pya-sr">Precio local de '+esc(p.name)+'</span><span class="gl-pya-cur">$</span>'+
   '<input inputmode="decimal" autocomplete="off" data-pya-price="'+esc(p.id)+'" value="'+esc(draft?drafts.get(p.id).raw:(p.price_local==null?'':new Intl.NumberFormat('es-AR').format(p.price_local)))+'" placeholder="Sin precio"'+(bad?' aria-invalid="true"':'')+'></label>'+
  '<div class="gl-pya-pya"><span class="gl-pya-sr">Precio PedidosYa</span>'+(bad?'—':esc(money(pya(price))))+'</div>'+
 '</div>';
}
function productForm(p){
 const cats=data.categories||[],si=data.san_isidro_prices||[];
 return '<form class="gl-pya-form" data-pya-product-form="'+esc(p?.id||'')+'">'+
  '<label>Nombre del producto<input name="name" maxlength="120" required value="'+esc(p?.name||'')+'"></label>'+
  '<label>Categoría<select name="category">'+cats.map(c=>'<option value="'+esc(c.id)+'"'+((p?.category_id||editing?.category)===c.id?' selected':'')+'>'+esc(c.name)+'</option>').join('')+'</select></label>'+
  (p?'':'<label>Precio local<input name="price" inputmode="decimal" placeholder="Opcional"></label>')+
  '<label>Vincular con la lista de San Isidro<select name="linked"><option value="">Sin vincular (precio manual)</option>'+
   si.map(x=>'<option value="'+esc(x.id)+'"'+(p?.linked_price_id===x.id?' selected':'')+'>'+esc(x.product)+' · '+esc(money(x.amount))+'</option>').join('')+'</select></label>'+
  '<div class="gl-pya-form-actions"><button type="submit" class="gl-pya-btn gl-pya-btn--primary">'+(p?'Guardar producto':'Agregar producto')+'</button>'+
  '<button type="button" class="gl-pya-btn" data-pya-cancel-edit>Cancelar</button>'+
  (p?'<button type="button" class="gl-pya-btn gl-pya-btn--danger" data-pya-delete-product="'+esc(p.id)+'">Eliminar producto</button>':'')+'</div></form>';
}
function catMove(c){
 const ids=(data?.categories||[]).map(x=>x.id),i=ids.indexOf(c.id);
 return '<button type="button" class="gl-pya-icon" data-pya-cat-move="'+esc(c.id)+'" data-dir="-1" aria-label="Subir categoría '+esc(c.name)+'" title="Subir categoría"'+(i<=0?' disabled':'')+'>↑</button>'+
  '<button type="button" class="gl-pya-icon" data-pya-cat-move="'+esc(c.id)+'" data-dir="1" aria-label="Bajar categoría '+esc(c.name)+'" title="Bajar categoría"'+(i<0||i>=ids.length-1?' disabled':'')+'>↓</button>';
}
function categoryBlock(c){
 const admin=!!data?.can_admin,all=products().filter(p=>p.category_id===c.id),list=all.filter(visible);
 if(!list.length&&(search||filter!=='todos'))return '';
 const open=!collapsed.has(c.id)||!!search||filter!=='todos';
 const head=editing?.type==='category'&&editing.id===c.id?
  '<form class="gl-pya-catform" data-pya-category-form="'+esc(c.id)+'"><label class="gl-pya-sr" for="gl-pya-cat-'+esc(c.id)+'">Nombre de la categoría</label><input id="gl-pya-cat-'+esc(c.id)+'" name="name" maxlength="80" required value="'+esc(c.name)+'">'+
  '<button type="submit" class="gl-pya-btn gl-pya-btn--primary">Guardar</button><button type="button" class="gl-pya-btn" data-pya-cancel-edit>Cancelar</button>'+
  '<button type="button" class="gl-pya-btn gl-pya-btn--danger" data-pya-delete-category="'+esc(c.id)+'">Eliminar categoría</button></form>':
  '<button type="button" class="gl-pya-cat-toggle" data-pya-toggle="'+esc(c.id)+'" aria-expanded="'+open+'"><span aria-hidden="true">'+(open?'▾':'▸')+'</span> '+esc(c.name)+' <small>('+all.length+')</small></button>'+
  (admin?'<button type="button" class="gl-pya-icon" data-pya-edit-category="'+esc(c.id)+'" aria-label="Editar categoría '+esc(c.name)+'" title="Editar categoría">✎</button>'+
   catMove(c)+
   '<button type="button" class="gl-pya-mini" data-pya-new-product="'+esc(c.id)+'">+ Producto</button>':'');
 const adding=editing?.type==='new-product'&&editing.category===c.id?'<div class="gl-pya-row gl-pya-row--edit">'+productForm(null)+'</div>':'';
 return '<section class="gl-pya-cat" aria-label="'+esc(c.name)+'"><div class="gl-pya-cat-head">'+head+'</div>'+
  (open?adding+list.map((p,i)=>productRow(p,i,list)).join('')+(list.length?'':'<p class="gl-pya-empty">Sin productos en esta categoría.</p>'):'')+'</section>';
}
function render(){
 const panel=$('#gl-pya-panel');if(!panel)return;
 const c=counts(),admin=!!data?.can_admin;
 const dirty=drafts.size>0,invalid=[...drafts.values()].some(d=>Number.isNaN(d.value));
 let body;
 if(error&&!data)body='<div class="gl-pya-alert" role="alert">'+esc(error)+' <button type="button" class="gl-pya-btn" data-pya-retry>Reintentar</button></div>';
 else if(!data)body='<p class="gl-pya-empty" role="status">Cargando la planilla de PedidosYa…</p>';
 else{
  const cats=(data.categories||[]).map(categoryBlock).join('');
  body=(conflicts?conflictBox():'')+
   '<div class="gl-pya-filters" role="toolbar" aria-label="Filtros">'+
    [['todos','Todos',c.todos],['modificados','Modificados',c.modificados],['sin','Sin precio',c.sin]].map(([k,l,n])=>
     '<button type="button" class="gl-pya-filter'+(filter===k?' active':'')+'" aria-pressed="'+(filter===k)+'" data-pya-filter="'+k+'">'+l+' ('+n+')</button>').join('')+
    '<label class="gl-pya-search"><span class="gl-pya-sr">Buscar producto</span><input type="search" data-pya-search placeholder="Buscar producto…" value="'+esc(search)+'"></label>'+
   '</div>'+
   (admin?'<div class="gl-pya-admin"><button type="button" class="gl-pya-btn" data-pya-new-category>+ Nueva categoría</button>'+
    '<button type="button" class="gl-pya-btn" data-pya-sync>Traer precios de San Isidro</button>'+
    (c.modificados&&!dirty?'<button type="button" class="gl-pya-btn" data-pya-done-all>Marcar todo como actualizado en PedidosYa</button>':'')+'</div>':
    '<div class="gl-pya-admin"><button type="button" class="gl-pya-btn" data-pya-sync>Traer precios de San Isidro</button></div>')+
   (editing?.type==='new-category'?'<form class="gl-pya-catform gl-pya-newcat" data-pya-category-form=""><label class="gl-pya-sr" for="gl-pya-newcat">Nombre de la nueva categoría</label><input id="gl-pya-newcat" name="name" maxlength="80" required placeholder="Nombre de la categoría"><button type="submit" class="gl-pya-btn gl-pya-btn--primary">Crear</button><button type="button" class="gl-pya-btn" data-pya-cancel-edit>Cancelar</button></form>':'')+
   '<div class="gl-pya-table"><div class="gl-pya-thead" aria-hidden="true"><span>Producto</span><span>Precio Local</span><span>Precio PYA (+'+esc(pct())+'%)</span></div>'+
   (cats||'<p class="gl-pya-empty">'+(products().length||search||filter!=='todos'?'No hay productos para este filtro.':(admin?'Todavía no hay categorías. Creá la primera con «+ Nueva categoría».':'La administradora todavía no cargó productos.'))+'</p>')+'</div>';
 }
 const pctBox=admin?'<form class="gl-pya-pct" data-pya-percent><label>Porcentaje PYA<span><input name="percent" inputmode="decimal" value="'+esc(pct())+'" aria-label="Porcentaje PYA">%</span></label><button type="submit" class="gl-pya-mini">Aplicar</button></form>':
  '<div class="gl-pya-pct"><span>Porcentaje PYA</span><b>'+esc(pct())+'%</b></div>';
 panel.innerHTML='<div class="gl-pya-wrap">'+
  '<header class="gl-pya-head"><div class="gl-pya-title"><span class="gl-pya-logo" aria-hidden="true"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5 5.5 4h13L20 9.5"/><path d="M4 9.5h16v1.2a2.7 2.7 0 0 1-5.3.6 2.7 2.7 0 0 1-5.4 0 2.7 2.7 0 0 1-5.3-.6z"/><path d="M5.5 13v7h13v-7M10 20v-4h4v4"/></svg></span>'+
   '<div><small>Acassuso / PedidosYa</small><h2 id="gl-pya-title">Precios PedidosYa <span class="gl-pya-chip">Exclusivo para Molino Acassuso</span></h2>'+
   '<p>Actualizá los precios del menú. El precio de PedidosYa se calcula solo, según el porcentaje configurado, y se redondea hacia arriba a múltiplos de $100.</p></div></div>'+
   '<div class="gl-pya-headside">'+pctBox+'<span class="gl-pya-status'+(dirty?' is-dirty':'')+'" role="status">'+(dirty?'Cambios sin guardar':'Todo guardado')+'</span>'+
   '<button type="button" class="gl-pya-close" data-pya-close aria-label="Cerrar PedidosYa">×</button></div></header>'+
  (admin?'':'<p class="gl-pya-info">Solo la administradora puede editar nombres de categorías y productos, ordenarlos o cambiar el porcentaje.</p>')+
  (msg?'<div class="gl-pya-msg" role="status">'+esc(msg)+'</div>':'')+(error&&data?'<div class="gl-pya-alert" role="alert">'+esc(error)+'</div>':'')+
  body+'</div>'+
  '<footer class="gl-pya-foot"><span>'+(dirty?drafts.size+(drafts.size===1?' producto modificado':' productos modificados')+(invalid?' · revisá los precios marcados':''):c.modificados?c.modificados+' para actualizar en PedidosYa':'Sin cambios pendientes')+'</span>'+
  '<div><button type="button" class="gl-pya-btn" data-pya-cancel'+(dirty?'':' disabled')+'>Cancelar</button>'+
  '<button type="button" class="gl-pya-btn gl-pya-btn--primary" data-pya-save'+(dirty&&!invalid&&!busy?'':' disabled')+'>Guardar cambios</button></div></footer>';
}
function conflictBox(){
 return '<section class="gl-pya-conflicts" role="alertdialog" aria-label="Precios manuales distintos de San Isidro"><h3>Estos productos tienen un precio manual distinto al de San Isidro</h3>'+
  '<p>Elegí cuáles reemplazar con el precio de San Isidro. Los demás conservan su precio manual.</p>'+
  conflicts.map(x=>'<label class="gl-pya-conflict"><input type="checkbox" data-pya-conflict="'+esc(x.id)+'"> <b>'+esc(x.name)+'</b> · Acassuso '+esc(money(x.price_local))+' → San Isidro '+esc(money(x.san_isidro_amount))+'</label>').join('')+
  '<div class="gl-pya-form-actions"><button type="button" class="gl-pya-btn gl-pya-btn--primary" data-pya-conflict-apply>Reemplazar los elegidos</button><button type="button" class="gl-pya-btn" data-pya-conflict-skip>Mantener todos los manuales</button></div></section>';
}
function position(){
 const panel=$('#gl-pya-panel');if(!panel)return;
 const side=document.getElementById('side');
 const r=side&&window.innerWidth>=1024?side.getBoundingClientRect():null;
 panel.style.left=r&&r.width>0&&r.right>0?Math.round(r.right)+'px':'0';
}
function open(){
 if(!inAcassuso()){api?.toast?.('PedidosYa es exclusivo de Molino Café · Acassuso.',true);return;}
 if(opened){position();return;}
 opened=true;priorFocus=document.activeElement;css();
 const panel=document.createElement('div');panel.id='gl-pya-panel';panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-labelledby','gl-pya-title');
 document.body.appendChild(panel);document.body.classList.add('gl-pya-open');
 document.getElementById('app')?.classList.remove('open');const scrim=document.getElementById('scrim');if(scrim)scrim.hidden=true;
 position();render();void reload();
 pollTimer=setInterval(()=>{if(opened&&!drafts.size&&!editing&&!busy&&!conflicts&&!document.querySelector('#gl-pya-panel input:focus'))void reload();},30000);
}
function close(force=false){
 if(!opened)return;
 if(drafts.size&&!force&&!window.confirm('Tenés cambios sin guardar. ¿Salir sin guardarlos?'))return;
 opened=false;drafts.clear();editing=null;conflicts=null;msg='';error='';
 clearInterval(pollTimer);pollTimer=null;$('#gl-pya-panel')?.remove();document.body.classList.remove('gl-pya-open');
 try{priorFocus?.focus?.();}catch{}
}
function css(){
 if(document.getElementById('gl-pya-css'))return;
 const l=document.createElement('link');l.id='gl-pya-css';l.rel='stylesheet';l.href='/stock/gestlok-molino-pya.css?rev=pedidosya-20261109';document.head.appendChild(l);
}
async function act(fn,okMsg){
 if(busy)return;busy=true;msg='';error='';render();
 try{await fn();msg=okMsg||'';await reload();}
 catch(e){error=e?.message||'No se pudo guardar.';}
 finally{busy=false;render();}
}
document.addEventListener('click',e=>{
 const t=e.target;
 if(t.closest?.('[data-pya-open]')){e.preventDefault();open();return;}
 if(!opened||!t.closest?.('#gl-pya-panel'))return;
 const q=s=>t.closest(s);
 let el;
 if(q('[data-pya-close]')){e.preventDefault();close();return;}
 if(q('[data-pya-retry]')){e.preventDefault();void reload();return;}
 if((el=q('[data-pya-filter]'))){filter=el.dataset.pyaFilter;render();return;}
 if((el=q('[data-pya-toggle]'))){const id=el.dataset.pyaToggle;if(collapsed.has(id))collapsed.delete(id);else collapsed.add(id);render();return;}
 if(q('[data-pya-cancel]')){drafts.clear();msg='Se descartaron los cambios sin guardar.';render();return;}
 if(q('[data-pya-save]')){
  const changes=[...drafts.entries()].map(([id,d])=>({id,price:d.value}));
  void act(async()=>{const n=await rpc('gestlok_molino_pya_save_prices',{p_changes:changes});drafts.clear();msg=n+' '+(n===1?'precio guardado':'precios guardados')+'. Quedan marcados para actualizar en PedidosYa.';},null);
  return;
 }
 if((el=q('[data-pya-done]'))){const id=el.dataset.pyaDone;void act(()=>rpc('gestlok_molino_pya_mark_updated',{p_ids:[id]}),'Marcado como actualizado en PedidosYa.');return;}
 if(q('[data-pya-done-all]')){const ids=products().filter(p=>p.pending_pya).map(p=>p.id);if(!ids.length)return;
  if(!window.confirm('¿Ya actualizaste en PedidosYa los '+ids.length+' productos pendientes?'))return;
  void act(()=>rpc('gestlok_molino_pya_mark_updated',{p_ids:ids}),'Todos los productos quedaron actualizados en PedidosYa.');return;}
 if(q('[data-pya-sync]')){
  if(drafts.size){error='Guardá o cancelá los cambios antes de traer precios de San Isidro.';render();return;}
  void act(async()=>{const r=await rpc('gestlok_molino_pya_sync',{p_confirm:[]});conflicts=(r?.conflicts||[]).length?r.conflicts:null;
   msg=(r?.updated||0)+' precios actualizados desde San Isidro.'+(conflicts?' Revisá los precios manuales distintos.':'');},null);return;}
 if(q('[data-pya-conflict-skip]')){conflicts=null;msg='Se conservaron los precios manuales.';render();return;}
 if(q('[data-pya-conflict-apply]')){const ids=[...document.querySelectorAll('[data-pya-conflict]:checked')].map(x=>x.dataset.pyaConflict);
  if(!ids.length){conflicts=null;render();return;}
  void act(async()=>{const r=await rpc('gestlok_molino_pya_sync',{p_confirm:ids});conflicts=null;msg=(r?.updated||0)+' precios reemplazados con los de San Isidro.';},null);return;}
 if(!data?.can_admin)return;
 if(q('[data-pya-new-category]')){editing={type:'new-category'};render();$('#gl-pya-newcat')?.focus();return;}
 if((el=q('[data-pya-edit-category]'))){editing={type:'category',id:el.dataset.pyaEditCategory};render();return;}
 if((el=q('[data-pya-new-product]'))){editing={type:'new-product',category:el.dataset.pyaNewProduct};collapsed.delete(el.dataset.pyaNewProduct);render();return;}
 if((el=q('[data-pya-edit-product]'))){editing={type:'product',id:el.dataset.pyaEditProduct};render();return;}
 if(q('[data-pya-cancel-edit]')){editing=null;render();return;}
 if((el=q('[data-pya-delete-category]'))){const c=(data.categories||[]).find(x=>x.id===el.dataset.pyaDeleteCategory);
  const n=products().filter(p=>p.category_id===c?.id).length;
  if(!window.confirm('¿Eliminar la categoría «'+(c?.name||'')+'»'+(n?' y sus '+n+' productos':'')+'? No se puede deshacer.'))return;
  editing=null;void act(()=>rpc('gestlok_molino_pya_category_delete',{p_id:c.id}),'Categoría eliminada.');return;}
 if((el=q('[data-pya-delete-product]'))){const p=products().find(x=>x.id===el.dataset.pyaDeleteProduct);
  if(!window.confirm('¿Eliminar «'+(p?.name||'')+'»? No se puede deshacer.'))return;
  editing=null;drafts.delete(p.id);void act(()=>rpc('gestlok_molino_pya_product_delete',{p_id:p.id}),'Producto eliminado.');return;}
 if((el=q('[data-pya-cat-move]'))){const list=(data?.categories||[]).map(x=>x.id);const i=list.indexOf(el.dataset.pyaCatMove),j=i+Number(el.dataset.dir);
  if(i<0||j<0||j>=list.length)return;[list[i],list[j]]=[list[j],list[i]];
  void act(()=>rpc('gestlok_molino_pya_category_reorder',{p_ids:list}),'Orden de categorías actualizado.');return;}
 if((el=q('[data-pya-move]'))){const p=products().find(x=>x.id===el.dataset.pyaMove);if(!p)return;
  const list=products().filter(x=>x.category_id===p.category_id).map(x=>x.id);const i=list.indexOf(p.id),j=i+Number(el.dataset.dir);
  if(j<0||j>=list.length)return;[list[i],list[j]]=[list[j],list[i]];
  void act(()=>rpc('gestlok_molino_pya_reorder',{p_category:p.category_id,p_ids:list}),'Orden actualizado.');return;}
});
document.addEventListener('input',e=>{
 if(!opened)return;
 const t=e.target;
 if(t.matches?.('[data-pya-search]')){search=t.value;const pos=t.selectionStart;render();const s=$('[data-pya-search]');if(s){s.focus();try{s.setSelectionRange(pos,pos);}catch{}}return;}
 if(t.matches?.('[data-pya-price]')){
  const id=t.dataset.pyaPrice,p=products().find(x=>x.id===id);if(!p)return;
  const value=parsePrice(t.value);
  if(!Number.isNaN(value)&&value===(p.price_local==null?null:Number(p.price_local)))drafts.delete(id);
  else drafts.set(id,{raw:t.value,value});
  const row=t.closest('[data-pya-row]');
  if(row){
   row.classList.toggle('is-draft',drafts.has(id));
   const out=row.querySelector('.gl-pya-pya');if(out)out.innerHTML='<span class="gl-pya-sr">Precio PedidosYa</span>'+esc(Number.isNaN(value)?'—':money(pya(value)));
   t.toggleAttribute('aria-invalid',Number.isNaN(value));
  }
  // Actualizar contadores y botones sin redibujar los campos (no se pierde el foco).
  const panel=$('#gl-pya-panel'),c=counts(),dirty=drafts.size>0,invalid=[...drafts.values()].some(d=>Number.isNaN(d.value));
  const st=panel?.querySelector('.gl-pya-status');if(st){st.textContent=dirty?'Cambios sin guardar':'Todo guardado';st.classList.toggle('is-dirty',dirty);}
  const foot=panel?.querySelector('.gl-pya-foot span');if(foot)foot.textContent=dirty?drafts.size+(drafts.size===1?' producto modificado':' productos modificados')+(invalid?' · revisá los precios marcados':''):(c.modificados?c.modificados+' para actualizar en PedidosYa':'Sin cambios pendientes');
  const save=panel?.querySelector('[data-pya-save]');if(save)save.disabled=!dirty||invalid||busy;
  const cancel=panel?.querySelector('[data-pya-cancel]');if(cancel)cancel.disabled=!dirty;
  for(const b of panel?.querySelectorAll('[data-pya-filter]')||[]){const k=b.dataset.pyaFilter;b.textContent=(k==='todos'?'Todos':k==='modificados'?'Modificados':'Sin precio')+' ('+(k==='todos'?c.todos:k==='modificados'?c.modificados:c.sin)+')';}
 }
});
document.addEventListener('submit',e=>{
 if(!opened)return;
 const f=e.target;
 if(f.matches?.('[data-pya-percent]')){e.preventDefault();const v=parsePrice(new FormData(f).get('percent'));
  if(v==null||Number.isNaN(v)||v>500){error='Ingresá un porcentaje entre 0 y 500.';render();return;}
  if(v===pct())return;
  if(!window.confirm('Al cambiar el porcentaje a '+v+'%, todos los precios PYA cambian y quedan marcados para actualizar en PedidosYa. ¿Continuar?'))return;
  void act(()=>rpc('gestlok_molino_pya_set_percent',{p_percent:v}),'Porcentaje actualizado a '+v+'%.');return;}
 if(f.matches?.('[data-pya-category-form]')){e.preventDefault();const name=String(new FormData(f).get('name')||'').trim();if(!name)return;
  const id=f.dataset.pyaCategoryForm||null;editing=null;
  void act(()=>rpc('gestlok_molino_pya_category_save',{p_id:id,p_name:name}),id?'Categoría actualizada.':'Categoría creada.');return;}
 if(f.matches?.('[data-pya-product-form]')){e.preventDefault();const fd=new FormData(f),id=f.dataset.pyaProductForm||null;
  const name=String(fd.get('name')||'').trim(),category=String(fd.get('category')||''),linked=String(fd.get('linked')||'')||null;
  const price=id?null:parsePrice(fd.get('price'));
  if(!name||!category)return;
  if(Number.isNaN(price)){error='Revisá el precio del producto.';render();return;}
  editing=null;
  void act(()=>rpc('gestlok_molino_pya_product_save',{p_id:id,p_category:category,p_name:name,p_price:price,p_linked:linked}),id?'Producto actualizado.':'Producto agregado.');return;}
});
document.addEventListener('keydown',e=>{if(opened&&e.key==='Escape'&&!editing&&!conflicts){e.preventDefault();close();}});
window.addEventListener('resize',()=>{if(opened)position();});
window.GestLokMolinoPYA=Object.freeze({attach(ctx){api=ctx;},open,close:()=>close(true),parsePrice,pya,isOpen:()=>opened});
})();

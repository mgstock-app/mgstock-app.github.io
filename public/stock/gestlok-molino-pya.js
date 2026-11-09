/* El Molino Café · Acassuso · PedidosYa (09/11/2026).
   Planilla para cargar a mano en PedidosYa: Precio Local editable y Precio PYA calculado con el
   porcentaje (50 % inicial), redondeado hacia arriba a múltiplos de $100. No se conecta con PedidosYa.
   Vistas separadas: Categorías · Productos · Sin precio · Modificados · Todos.
   Exclusiva de Acassuso: todas las lecturas y escrituras pasan por RPC gestlok_molino_pya_*
   que validan empresa, sucursal y rol en el servidor (la administradora es la única que
   cambia nombres, categorías, orden, porcentaje y marca «ya actualizado»). */
(()=>{
'use strict';
if(window.GestLokMolinoPYA)return;
const TENANT='6c8717ea-5f78-426b-9458-74a5dcac6e4e';
const ACASSUSO='loc-6c8717ea5f78426b9458';
let api=null,opened=false,data=null,error='',busy=false,msg='',view='categorias',search='',collapsed=new Set(),
  drafts=new Map(),editing=null,conflicts=null,pollTimer=null,priorFocus=null,ordering=false,menuOpen=false,dragId=null,sideObs=null;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const $=s=>document.querySelector(s);
const inAcassuso=()=>api?.S?.me?.tenant_id===TENANT&&api?.S?.local===ACASSUSO;
const money=n=>n==null||n===''||Number.isNaN(Number(n))?'—':'$ '+new Intl.NumberFormat('es-AR',{maximumFractionDigits:2}).format(Number(n));
const pct=()=>Number(data?.percent??50);
const pya=(p,percent=pct())=>p==null||p===''||Number.isNaN(Number(p))?null:Math.ceil(Math.round(Number(p)*(100+Number(percent)))/10000)*100;
const fmtDate=t=>{try{return new Intl.DateTimeFormat('es-AR',{timeZone:'America/Argentina/Buenos_Aires',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(t));}catch{return '';}};
const fold=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
const ICON={
 bag:'<path d="M5 8h14l-1.2 12H6.2L5 8z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/>',
 layers:'<path d="m12 3 9 5-9 5-9-5 9-5z"/><path d="m3 12.5 9 5 9-5"/><path d="m3 16.5 9 5 9-5"/>',
 box:'<path d="M21 8 12 3 3 8v8l9 5 9-5V8z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
 warn:'<path d="M12 4 2.5 20h19L12 4z"/><path d="M12 10v4.5M12 17.5v.01"/>',
 pencil:'<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="m13.5 6.5 4 4"/>',
 list:'<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>',
 trash:'<path d="M4 7h16M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13M9 7V4h6v3"/>',
 sort:'<path d="M8 20V4M4 8l4-4 4 4M16 4v16M12 16l4 4 4-4"/>',
 plus:'<path d="M12 5v14M5 12h14"/>',
 check:'<circle cx="12" cy="12" r="9"/><path d="m8 12.2 2.8 2.8L16 9.5"/>',
 dots:'<path d="M12 5.5v.01M12 12v.01M12 18.5v.01"/>',
 up:'<path d="M12 19V5M6 11l6-6 6 6"/>',
 down:'<path d="M12 5v14M6 13l6 6 6-6"/>',
 grip:'<path d="M9 6v.01M15 6v.01M9 12v.01M15 12v.01M9 18v.01M15 18v.01"/>',
 close:'<path d="M6 6l12 12M18 6 6 18"/>',
 search:'<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>',
 chev:'<path d="m9 6 6 6-6 6"/>'
};
const svg=(k,s=20,w=1.8)=>'<svg viewBox="0 0 24 24" width="'+s+'" height="'+s+'" fill="none" stroke="currentColor" stroke-width="'+(k==='dots'||k==='grip'?3:w)+'" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+ICON[k]+'</svg>';
const VIEWS=[['categorias','Categorías','layers'],['productos','Productos','box'],['sin','Sin precio','warn'],['modificados','Modificados','pencil'],['todos','Todos','list']];
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
const categories=()=>data?.categories||[];
const priceOf=p=>drafts.has(p.id)?drafts.get(p.id).value:p.price_local;
const isDraft=p=>drafts.has(p.id);
const counts=()=>{const ps=products();return {todos:ps.length,modificados:ps.filter(p=>p.pending_pya||isDraft(p)).length,sin:ps.filter(p=>priceOf(p)==null).length,pendientes:ps.filter(p=>p.pending_pya).length};};
function visible(p){
 if(search&&!fold(p.name).includes(fold(search)))return false;
 if(view==='modificados')return p.pending_pya||isDraft(p);
 if(view==='sin')return priceOf(p)==null;
 return true;
}
function sourceTag(p){
 if(!p.linked_price_id)return '<span class="gl-pya-tag">Precio manual</span>';
 const si=p.san_isidro_amount;
 if(p.price_source==='san_isidro'&&Number(si)===Number(p.price_local))return '<span class="gl-pya-tag gl-pya-tag--link">Vinculado a San Isidro</span>';
 return '<span class="gl-pya-tag gl-pya-tag--manual">Manual · San Isidro '+esc(money(si))+'</span>';
}
function productRow(p,i,list,flat){
 const admin=!!data?.can_admin,draft=isDraft(p),price=priceOf(p),bad=draft&&Number.isNaN(drafts.get(p.id).value);
 const ch=p.last_change;
 const pending=p.pending_pya&&!draft?'<div class="gl-pya-change"><b>Actualizar en PedidosYa</b>'+
   (ch?' · '+(ch.reason==='porcentaje'?'PYA '+esc(money(ch.old_pya))+' → '+esc(money(ch.new_pya))+' (cambió el porcentaje)':'Antes '+esc(money(ch.old_price))+' → ahora '+esc(money(ch.new_price)))+' · '+esc(fmtDate(ch.changed_at)):'')+
   (admin?' <button type="button" class="gl-pya-mini" data-pya-done="'+esc(p.id)+'">Ya lo actualicé</button>':'')+'</div>':'';
 const cat=flat?(categories().find(c=>c.id===p.category_id)?.name||''):'';
 const tools=admin?'<span class="gl-pya-tools">'+
   '<button type="button" class="gl-pya-icon" data-pya-edit-product="'+esc(p.id)+'" aria-label="Editar '+esc(p.name)+'" title="Editar">'+svg('pencil',16)+'</button>'+
   (flat?'':'<button type="button" class="gl-pya-icon" data-pya-move="'+esc(p.id)+'" data-dir="-1" aria-label="Subir '+esc(p.name)+'" title="Subir"'+(i===0?' disabled':'')+'>'+svg('up',16)+'</button>'+
   '<button type="button" class="gl-pya-icon" data-pya-move="'+esc(p.id)+'" data-dir="1" aria-label="Bajar '+esc(p.name)+'" title="Bajar"'+(i===list.length-1?' disabled':'')+'>'+svg('down',16)+'</button>')+'</span>':'';
 if(editing?.type==='product'&&editing.id===p.id)return '<div class="gl-pya-row gl-pya-row--edit">'+productForm(p)+'</div>';
 return '<div class="gl-pya-row'+(draft?' is-draft':p.pending_pya?' is-pending':'')+(price==null&&!draft?' is-empty':'')+'" data-pya-row="'+esc(p.id)+'">'+
  '<div class="gl-pya-name"><span class="gl-pya-pname">'+esc(p.name)+'</span>'+tools+
   (draft?'<span class="gl-pya-flag">Modificado</span>':'')+'<div class="gl-pya-meta">'+(cat?'<span class="gl-pya-tag gl-pya-tag--cat">'+esc(cat)+'</span>':'')+sourceTag(p)+'</div>'+pending+'</div>'+
  '<label class="gl-pya-price"><span class="gl-pya-sr">Precio local de '+esc(p.name)+'</span><span class="gl-pya-cur">$</span>'+
   '<input inputmode="decimal" autocomplete="off" data-pya-price="'+esc(p.id)+'" value="'+esc(draft?drafts.get(p.id).raw:(p.price_local==null?'':new Intl.NumberFormat('es-AR').format(p.price_local)))+'" placeholder="Sin precio"'+(bad?' aria-invalid="true"':'')+'></label>'+
  '<div class="gl-pya-pya"><span class="gl-pya-sr">Precio PedidosYa</span>'+(bad?'—':esc(money(pya(price))))+'</div>'+
 '</div>';
}
function productForm(p){
 const cats=categories(),si=data.san_isidro_prices||[];
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
// ── Vista Categorías: tabla ordenada con editar, eliminar y ordenar (solo administradora).
function catMove(c){
 const ids=categories().map(x=>x.id),i=ids.indexOf(c.id);
 return '<button type="button" class="gl-pya-sq" data-pya-cat-move="'+esc(c.id)+'" data-dir="-1" aria-label="Subir categoría '+esc(c.name)+'" title="Subir"'+(i<=0?' disabled':'')+'>'+svg('up',18)+'</button>'+
  '<button type="button" class="gl-pya-sq" data-pya-cat-move="'+esc(c.id)+'" data-dir="1" aria-label="Bajar categoría '+esc(c.name)+'" title="Bajar"'+(i<0||i>=ids.length-1?' disabled':'')+'>'+svg('down',18)+'</button>';
}
function catRow(c,i){
 const admin=!!data?.can_admin,n=products().filter(p=>p.category_id===c.id).length;
 if(admin&&editing?.type==='category'&&editing.id===c.id)return '<div class="gl-pya-crow is-editing" role="row"><span role="cell"></span><span class="gl-pya-num" role="cell">'+(i+1)+'</span>'+
  '<form class="gl-pya-catform" data-pya-category-form="'+esc(c.id)+'" role="cell"><label class="gl-pya-sr" for="gl-pya-cat-'+esc(c.id)+'">Nombre de la categoría</label><input id="gl-pya-cat-'+esc(c.id)+'" name="name" maxlength="80" required value="'+esc(c.name)+'">'+
  '<button type="submit" class="gl-pya-btn gl-pya-btn--primary">Guardar</button><button type="button" class="gl-pya-btn" data-pya-cancel-edit>Cancelar</button></form></div>';
 const actions=!admin?'':ordering?catMove(c):
  '<button type="button" class="gl-pya-sq" data-pya-edit-category="'+esc(c.id)+'" aria-label="Editar categoría '+esc(c.name)+'" title="Editar">'+svg('pencil',18)+'</button>'+
  '<button type="button" class="gl-pya-sq gl-pya-sq--danger" data-pya-delete-category="'+esc(c.id)+'" aria-label="Eliminar categoría '+esc(c.name)+'" title="Eliminar">'+svg('trash',18)+'</button>';
 return '<div class="gl-pya-crow" role="row" data-pya-cat-row="'+esc(c.id)+'"'+(admin?' draggable="true"':'')+'>'+
  '<span class="gl-pya-grip" role="cell">'+(admin?svg('grip',18):'')+'</span><span class="gl-pya-num" role="cell">'+(i+1)+'</span>'+
  '<span class="gl-pya-cname" role="cell"><button type="button" data-pya-goto-cat="'+esc(c.id)+'" title="Ver los productos de '+esc(c.name)+'">'+esc(c.name)+'</button></span>'+
  '<span class="gl-pya-ccount" role="cell">'+n+(n===1?' producto':' productos')+'</span>'+
  '<span class="gl-pya-cact" role="cell">'+actions+'</span></div>';
}
function sectionHead(icon,title,sub,actions){
 return '<div class="gl-pya-sechead"><span class="gl-pya-secicon">'+svg(icon,26,1.6)+'</span><div class="gl-pya-sectext"><h3>'+title+'</h3><p>'+sub+'</p></div>'+
  (actions?'<div class="gl-pya-secactions">'+actions+'</div>':'')+'</div>';
}
function categoriesView(){
 const admin=!!data?.can_admin,cats=categories();
 const actions=admin?'<button type="button" class="gl-pya-btn'+(ordering?' is-on':'')+'" data-pya-ordering aria-pressed="'+ordering+'">'+svg('sort',18)+(ordering?'Listo':'Ordenar')+'</button>'+
  '<button type="button" class="gl-pya-btn gl-pya-btn--primary" data-pya-new-category>'+svg('plus',18)+'Nueva categoría</button>':'';
 const form=admin&&editing?.type==='new-category'?'<form class="gl-pya-catform gl-pya-newcat" data-pya-category-form=""><label class="gl-pya-sr" for="gl-pya-newcat">Nombre de la nueva categoría</label><input id="gl-pya-newcat" name="name" maxlength="80" required placeholder="Nombre de la categoría"><button type="submit" class="gl-pya-btn gl-pya-btn--primary">Crear</button><button type="button" class="gl-pya-btn" data-pya-cancel-edit>Cancelar</button></form>':'';
 const hint=admin&&ordering?'<p class="gl-pya-hint">Arrastrá las filas o usá las flechas. El orden se guarda al instante.</p>':'';
 const table=cats.length?'<div class="gl-pya-ctable'+(admin?' is-admin':'')+(ordering?' is-ordering':'')+'" role="table" aria-label="Categorías">'+
   '<div class="gl-pya-crow gl-pya-chead" role="row"><span role="columnheader"><span class="gl-pya-sr">Mover</span></span><span role="columnheader">#</span><span role="columnheader">Categoría</span><span role="columnheader">Productos</span><span role="columnheader"><span class="gl-pya-sr">Acciones</span></span></div>'+
   cats.map(catRow).join('')+'</div>':
  '<p class="gl-pya-empty">'+(admin?'Todavía no hay categorías. Creá la primera con «Nueva categoría».':'La administradora todavía no cargó categorías.')+'</p>';
 return sectionHead('layers','Categorías ('+cats.length+')','Organizá las categorías de tu menú en PedidosYa.',actions)+form+hint+table;
}
// ── Vistas de productos: Productos (por categoría), Sin precio, Modificados (agrupadas) y Todos (lista).
function categoryBlock(c){
 const admin=!!data?.can_admin,all=products().filter(p=>p.category_id===c.id),list=all.filter(visible);
 const adding=editing?.type==='new-product'&&editing.category===c.id;
 if(!list.length&&!adding&&(search||view!=='productos'))return '';
 const has=list.length>0||adding,open=has&&(!collapsed.has(c.id)||!!search||view!=='productos'||adding);
 const head='<button type="button" class="gl-pya-cat-toggle" data-pya-toggle="'+esc(c.id)+'" aria-expanded="'+open+'"'+(has?'':' disabled')+'>'+
   '<span class="gl-pya-chev'+(open?' is-open':'')+'" aria-hidden="true">'+svg('chev',16,2)+'</span>'+esc(c.name)+' <small>('+all.length+')</small></button>'+
  (admin?'<button type="button" class="gl-pya-mini" data-pya-new-product="'+esc(c.id)+'">'+svg('plus',14,2)+'Producto</button>':'');
 return '<section class="gl-pya-cat" id="gl-pya-catsec-'+esc(c.id)+'" aria-label="'+esc(c.name)+'"><div class="gl-pya-cat-head">'+head+'</div>'+
  (open?(adding?'<div class="gl-pya-row gl-pya-row--edit">'+productForm(null)+'</div>':'')+list.map((p,i)=>productRow(p,i,list,false)).join(''):'')+'</section>';
}
function productsView(){
 const admin=!!data?.can_admin,c=counts(),dirty=drafts.size>0;
 const meta={productos:['box','Productos ('+c.todos+')','Cargá el precio local de cada producto. El precio PYA se calcula solo.'],
  sin:['warn','Sin precio ('+c.sin+')','Productos que todavía no tienen precio local.'],
  modificados:['pencil','Modificados ('+c.modificados+')','Precios que cambiaron y tenés que pasar a PedidosYa. Quedan marcados hasta que confirmes que los actualizaste.'],
  todos:['list','Todos ('+c.todos+')','Todos los productos en una sola lista, con su categoría.']}[view];
 const actions='<label class="gl-pya-search">'+svg('search',18)+'<span class="gl-pya-sr">Buscar producto</span><input type="search" data-pya-search placeholder="Buscar producto…" value="'+esc(search)+'"></label>'+
  (admin&&(view==='productos'||view==='todos')&&categories().length?'<button type="button" class="gl-pya-btn gl-pya-btn--primary" data-pya-new-product="'+esc(categories()[0].id)+'">'+svg('plus',18)+'Nuevo producto</button>':'')+
  (admin&&view==='modificados'&&c.pendientes&&!dirty?'<button type="button" class="gl-pya-btn" data-pya-done-all>'+svg('check',18)+'Marcar todo como actualizado</button>':'');
 let rows='';
 if(view==='todos'){
  const order=new Map(categories().map((x,i)=>[x.id,i]));
  const list=products().filter(visible).sort((a,b)=>(order.get(a.category_id)??999)-(order.get(b.category_id)??999)||(a.position-b.position));
  rows=(editing?.type==='new-product'?'<div class="gl-pya-row gl-pya-row--edit">'+productForm(null)+'</div>':'')+list.map((p,i)=>productRow(p,i,list,true)).join('');
 }else rows=categories().map(categoryBlock).join('');
 const empty=view==='sin'?'Todos los productos tienen precio.':view==='modificados'?'No hay precios modificados para pasar a PedidosYa.':
  search?'No hay productos con ese nombre.':!categories().length?(admin?'Primero creá una categoría en «Categorías».':'La administradora todavía no cargó categorías.'):(admin?'Todavía no hay productos. Agregá el primero con «Nuevo producto».':'La administradora todavía no cargó productos.');
 const showEmpty=view==='todos'||view==='productos'?!products().filter(visible).length&&!(editing?.type==='new-product'):!rows;
 return sectionHead(meta[0],meta[1],meta[2],actions)+
  '<p class="gl-pya-note">Precio PYA = precio local + '+esc(pct())+' %, redondeado hacia arriba a múltiplos de $100.</p>'+
  '<div class="gl-pya-table"><div class="gl-pya-thead" aria-hidden="true"><span>Producto</span><span>Precio Local</span><span>Precio PYA (+'+esc(pct())+'%)</span></div>'+
  (view==='productos'?rows+(showEmpty?'<p class="gl-pya-empty gl-pya-empty--foot">'+empty+'</p>':''):(showEmpty?'<p class="gl-pya-empty">'+empty+'</p>':rows))+'</div>';
}
function statusHTML(dirty){
 if(busy)return '<span class="gl-pya-status is-busy" role="status">Guardando…</span>';
 return dirty?'<span class="gl-pya-status is-dirty" role="status">'+svg('pencil',16)+'Cambios sin guardar</span>':'<span class="gl-pya-status" role="status">'+svg('check',18)+'Guardado</span>';
}
function tabsHTML(c){
 return '<div class="gl-pya-tabs" role="tablist" aria-label="Vistas de PedidosYa">'+VIEWS.map(([k,l,ic])=>{
  const n=k==='sin'?c.sin:k==='modificados'?c.modificados:0;
  return '<button type="button" role="tab" class="gl-pya-tab'+(view===k?' active':'')+'" aria-selected="'+(view===k)+'" data-pya-view="'+k+'">'+svg(ic,20)+'<span>'+l+'</span>'+
   '<b class="gl-pya-badge" data-pya-badge="'+k+'"'+(n?'':' hidden')+'>'+(n||'')+'</b></button>';}).join('')+'</div>';
}
function footText(c,dirty,invalid){
 return dirty?drafts.size+(drafts.size===1?' producto modificado':' productos modificados')+(invalid?' · revisá los precios marcados':''):c.modificados?c.modificados+' para actualizar en PedidosYa':'Sin cambios pendientes';
}
function render(){
 const panel=$('#gl-pya-panel');if(!panel)return;
 const c=counts(),admin=!!data?.can_admin;
 const dirty=drafts.size>0,invalid=[...drafts.values()].some(d=>Number.isNaN(d.value));
 let body;
 if(error&&!data)body='<div class="gl-pya-alert" role="alert">'+esc(error)+' <button type="button" class="gl-pya-btn" data-pya-retry>Reintentar</button></div>';
 else if(!data)body='<p class="gl-pya-empty" role="status">Cargando PedidosYa…</p>';
 else body=(conflicts?conflictBox():'')+'<div class="gl-pya-view" role="tabpanel" aria-label="'+esc((VIEWS.find(v=>v[0]===view)||[])[1]||'')+'">'+(view==='categorias'?categoriesView():productsView())+'</div>';
 const pctBox=admin?'<form class="gl-pya-pct" data-pya-percent><label for="gl-pya-pct-in">Porcentaje PYA</label><span class="gl-pya-pct-row"><input id="gl-pya-pct-in" name="percent" inputmode="decimal" value="'+esc(pct())+'"><span>%</span><button type="submit" class="gl-pya-btn gl-pya-btn--primary gl-pya-btn--sm">Aplicar</button></span></form>':
  '<div class="gl-pya-pct"><span class="gl-pya-pct-label">Porcentaje PYA</span><b>'+esc(pct())+' %</b></div>';
 const menu='<div class="gl-pya-menuwrap"><button type="button" class="gl-pya-sq" data-pya-menu aria-haspopup="menu" aria-expanded="'+menuOpen+'" aria-label="Más opciones" title="Más opciones">'+svg('dots',20)+'</button>'+
  (menuOpen?'<div class="gl-pya-menu" role="menu"><button type="button" role="menuitem" data-pya-sync>Traer precios de San Isidro</button>'+
   (admin&&c.pendientes&&!dirty?'<button type="button" role="menuitem" data-pya-done-all>Marcar todo como actualizado en PedidosYa</button>':'')+
   '<button type="button" role="menuitem" data-pya-close>Cerrar PedidosYa</button></div>':'')+'</div>';
 panel.innerHTML='<div class="gl-pya-wrap">'+
  '<nav class="gl-pya-crumbs" aria-label="Ubicación"><span>Molino Café</span>'+svg('chev',14,2)+'<b>Acassuso</b></nav>'+
  '<header class="gl-pya-head"><div class="gl-pya-title"><span class="gl-pya-logo" aria-hidden="true">'+svg('bag',26,2)+'</span>'+
   '<div><h2 id="gl-pya-title">PedidosYa</h2><p>Administrá las categorías, productos y precios de tu local en PedidosYa.</p></div>'+
   '<button type="button" class="gl-pya-close" data-pya-close aria-label="Cerrar PedidosYa" title="Cerrar">'+svg('close',22)+'</button></div>'+
   '<div class="gl-pya-headside">'+pctBox+statusHTML(dirty)+menu+'</div></header>'+
  tabsHTML(c)+
  (admin||!data?'':'<p class="gl-pya-info">Solo la administradora puede crear, editar, eliminar u ordenar categorías y productos, y cambiar el porcentaje.</p>')+
  (msg?'<div class="gl-pya-msg" role="status">'+esc(msg)+'</div>':'')+(error&&data?'<div class="gl-pya-alert" role="alert">'+esc(error)+'</div>':'')+
  body+'</div>'+
  (view!=='categorias'||dirty?'<footer class="gl-pya-foot"><span>'+footText(c,dirty,invalid)+'</span>'+
  '<div><button type="button" class="gl-pya-btn" data-pya-cancel'+(dirty?'':' disabled')+'>Cancelar</button>'+
  '<button type="button" class="gl-pya-btn gl-pya-btn--primary" data-pya-save'+(dirty&&!invalid&&!busy?'':' disabled')+'>Guardar cambios</button></div></footer>':'');
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
 // Si el menú lateral se contrae o se expande, la planilla se acomoda al ancho nuevo.
 const side=document.getElementById('side');
 if(side&&typeof ResizeObserver==='function'){sideObs=new ResizeObserver(()=>position());sideObs.observe(side);}
 position();render();void reload();
 pollTimer=setInterval(()=>{if(opened&&!drafts.size&&!editing&&!busy&&!conflicts&&!dragId&&!document.querySelector('#gl-pya-panel input:focus'))void reload();},30000);
}
function close(force=false){
 if(!opened)return true;
 if(drafts.size&&!force&&!window.confirm('Tenés cambios sin guardar. ¿Salir sin guardarlos?'))return false;
 opened=false;drafts.clear();editing=null;conflicts=null;msg='';error='';ordering=false;menuOpen=false;dragId=null;
 clearInterval(pollTimer);pollTimer=null;sideObs?.disconnect();sideObs=null;$('#gl-pya-panel')?.remove();document.body.classList.remove('gl-pya-open');
 try{priorFocus?.focus?.();}catch{}
 return true;
}
function css(){
 if(document.getElementById('gl-pya-css'))return;
 const l=document.createElement('link');l.id='gl-pya-css';l.rel='stylesheet';l.href='/stock/gestlok-molino-pya.css?rev=pedidosya-diseno-20261109';document.head.appendChild(l);
}
async function act(fn,okMsg){
 if(busy)return;busy=true;msg='';error='';render();
 try{await fn();msg=okMsg||'';await reload();}
 catch(e){error=e?.message||'No se pudo guardar.';}
 finally{busy=false;render();}
}
function saveCategoryOrder(list){void act(()=>rpc('gestlok_molino_pya_category_reorder',{p_ids:list}),'Orden de categorías actualizado.');}
// Al tocar otra sección del menú lateral, PedidosYa se cierra (pregunta si hay cambios sin guardar).
document.addEventListener('click',e=>{
 if(!opened)return;
 const b=e.target.closest?.('#side button,#side a');
 if(!b||b.matches('[data-pya-open],.gl-sidebar-collapse-button,.xside'))return;
 if(!close()){e.preventDefault();e.stopPropagation();}
},true);
document.addEventListener('click',e=>{
 const t=e.target;
 if(t.closest?.('[data-pya-open]')){e.preventDefault();open();return;}
 if(!opened||!t.closest?.('#gl-pya-panel'))return;
 const q=s=>t.closest(s);
 let el;
 if(q('[data-pya-menu]')){menuOpen=!menuOpen;render();return;}
 if(menuOpen){menuOpen=false;render();}
 if(q('[data-pya-close]')){e.preventDefault();close();return;}
 if(q('[data-pya-retry]')){e.preventDefault();void reload();return;}
 if((el=q('[data-pya-view]'))){view=el.dataset.pyaView;if(view!=='categorias')ordering=false;if(editing?.type==='category'||editing?.type==='new-category')editing=null;render();return;}
 if((el=q('[data-pya-goto-cat]'))){const id=el.dataset.pyaGotoCat;view='productos';search='';collapsed.delete(id);ordering=false;render();
  document.getElementById('gl-pya-catsec-'+id)?.scrollIntoView?.({block:'start',behavior:'smooth'});return;}
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
 if(q('[data-pya-ordering]')){ordering=!ordering;editing=null;render();return;}
 if(q('[data-pya-new-category]')){editing={type:'new-category'};ordering=false;render();$('#gl-pya-newcat')?.focus();return;}
 if((el=q('[data-pya-edit-category]'))){editing={type:'category',id:el.dataset.pyaEditCategory};render();$('#gl-pya-cat-'+el.dataset.pyaEditCategory)?.focus();return;}
 if((el=q('[data-pya-new-product]'))){const cat=el.dataset.pyaNewProduct;if(view==='categorias'||view==='sin'||view==='modificados')view='productos';
  editing={type:'new-product',category:cat};collapsed.delete(cat);render();
  if(view==='productos')document.getElementById('gl-pya-catsec-'+cat)?.scrollIntoView?.({block:'start',behavior:'smooth'});
  $('#gl-pya-panel [data-pya-product-form] input[name="name"]')?.focus();return;}
 if((el=q('[data-pya-edit-product]'))){editing={type:'product',id:el.dataset.pyaEditProduct};render();return;}
 if(q('[data-pya-cancel-edit]')){editing=null;render();return;}
 if((el=q('[data-pya-delete-category]'))){const c=categories().find(x=>x.id===el.dataset.pyaDeleteCategory);
  const n=products().filter(p=>p.category_id===c?.id).length;
  if(!window.confirm('¿Eliminar la categoría «'+(c?.name||'')+'»'+(n?' y sus '+n+' productos':'')+'? No se puede deshacer.'))return;
  editing=null;void act(()=>rpc('gestlok_molino_pya_category_delete',{p_id:c.id}),'Categoría eliminada.');return;}
 if((el=q('[data-pya-delete-product]'))){const p=products().find(x=>x.id===el.dataset.pyaDeleteProduct);
  if(!window.confirm('¿Eliminar «'+(p?.name||'')+'»? No se puede deshacer.'))return;
  editing=null;drafts.delete(p.id);void act(()=>rpc('gestlok_molino_pya_product_delete',{p_id:p.id}),'Producto eliminado.');return;}
 if((el=q('[data-pya-cat-move]'))){const list=categories().map(x=>x.id);const i=list.indexOf(el.dataset.pyaCatMove),j=i+Number(el.dataset.dir);
  if(i<0||j<0||j>=list.length)return;[list[i],list[j]]=[list[j],list[i]];
  void act(()=>rpc('gestlok_molino_pya_category_reorder',{p_ids:list}),'Orden de categorías actualizado.');return;}
 if((el=q('[data-pya-move]'))){const p=products().find(x=>x.id===el.dataset.pyaMove);if(!p)return;
  const list=products().filter(x=>x.category_id===p.category_id).map(x=>x.id);const i=list.indexOf(p.id),j=i+Number(el.dataset.dir);
  if(j<0||j>=list.length)return;[list[i],list[j]]=[list[j],list[i]];
  void act(()=>rpc('gestlok_molino_pya_reorder',{p_category:p.category_id,p_ids:list}),'Orden actualizado.');return;}
});
// Arrastrar filas de categorías (computadora). En celular se usan las flechas de «Ordenar».
document.addEventListener('dragstart',e=>{
 const r=e.target.closest?.('[data-pya-cat-row]');
 if(!opened||!r||!data?.can_admin||busy)return;
 dragId=r.dataset.pyaCatRow;r.classList.add('is-dragging');
 try{e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',dragId);}catch{}
});
document.addEventListener('dragover',e=>{
 if(!dragId)return;const r=e.target.closest?.('[data-pya-cat-row]');if(!r)return;
 e.preventDefault();const box=r.getBoundingClientRect(),after=e.clientY>box.top+box.height/2;
 for(const x of document.querySelectorAll('.gl-pya-crow.drop-before,.gl-pya-crow.drop-after'))if(x!==r)x.classList.remove('drop-before','drop-after');
 r.classList.toggle('drop-after',after);r.classList.toggle('drop-before',!after);
});
document.addEventListener('drop',e=>{
 if(!dragId)return;const r=e.target.closest?.('[data-pya-cat-row]');e.preventDefault();
 const from=dragId;dragId=null;
 if(!r||r.dataset.pyaCatRow===from){render();return;}
 const list=categories().map(x=>x.id).filter(id=>id!==from);
 let k=list.indexOf(r.dataset.pyaCatRow);if(r.classList.contains('drop-after'))k+=1;
 list.splice(k,0,from);
 if(list.join()===categories().map(x=>x.id).join()){render();return;}
 saveCategoryOrder(list);
});
document.addEventListener('dragend',()=>{if(!opened)return;dragId=null;for(const x of document.querySelectorAll('.gl-pya-crow.is-dragging,.gl-pya-crow.drop-before,.gl-pya-crow.drop-after'))x.classList.remove('is-dragging','drop-before','drop-after');});
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
  const st=panel?.querySelector('.gl-pya-status');if(st)st.outerHTML=statusHTML(dirty);
  const foot=panel?.querySelector('.gl-pya-foot span');if(foot)foot.textContent=footText(c,dirty,invalid);
  const save=panel?.querySelector('[data-pya-save]');if(save)save.disabled=!dirty||invalid||busy;
  const cancel=panel?.querySelector('[data-pya-cancel]');if(cancel)cancel.disabled=!dirty;
  for(const b of panel?.querySelectorAll('[data-pya-badge]')||[]){const k=b.dataset.pyaBadge,n=k==='sin'?c.sin:k==='modificados'?c.modificados:0;b.textContent=n||'';b.hidden=!n;}
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
document.addEventListener('keydown',e=>{
 if(!opened||e.key!=='Escape')return;
 if(menuOpen){e.preventDefault();menuOpen=false;render();return;}
 if(!editing&&!conflicts){e.preventDefault();close();}
});
window.addEventListener('resize',()=>{if(opened)position();});
window.GestLokMolinoPYA=Object.freeze({attach(ctx){api=ctx;},open,close:()=>close(true),parsePrice,pya,isOpen:()=>opened});
})();

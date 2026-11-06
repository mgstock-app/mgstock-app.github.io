/* GESTLOK · Mis Productos (cuaderno privado de Camila).
 * No pertenece al Plan Scanner: no consulta ni modifica ventas, precios, stock o caja.
 * El acceso definitivo lo impone RLS sobre las tablas privadas.
 */
(()=>{
 'use strict';
 if(window.GestLokMisProductos)return;
 const TENANT='2a97bf8d-7d08-4aa7-b051-5d1a4dc80103';
 const EMAIL='camilab.lopez99@gmail.com';
 const TABS='gestlok_cami_product_tabs', ITEMS='gestlok_cami_product_items';
 const $=s=>document.querySelector(s);
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
 let api=null,context=null,allowed=false,checked=false,checking=false,epoch=0;
 let visible=false,tabs=[],items=[],tabId='',loading=false,busy=false,error='',notice='',editing='',itemForm=false;
 const db=()=>window.GestLokSupabase;
 const validContext=(ctx,host)=>ctx?.tenant_id===TENANT&&ctx?.role==='dueno'&&host?.role?.()==='dueno'
  &&host?.S?.me?.tenant_id===TENANT&&String(host.S.me.email||'').toLowerCase()===EMAIL;
 const own=(u)=>String(u?.email||'').toLowerCase()===EMAIL&&!!u?.id;
 async function assertAccess(){
  if(!allowed||!validContext(context,api))throw Error('Este cuaderno es privado y no está habilitado para esta cuenta.');
  const result=await db().auth.getUser();
  if(result.error||!own(result.data?.user))throw Error('Iniciá sesión con la cuenta autorizada.');
  return result.data.user;
 }
 function reset(){
  epoch++;allowed=false;checked=false;checking=false;context=null;api=null;
  tabs=[];items=[];tabId='';editing='';itemForm=false;error='';notice='';
  close(false);
 }
 async function refresh(ctx,host){
  if(!validContext(ctx,host)){reset();return;}
  context=ctx;api=host;
  if(checked||checking)return;
  checking=true;const ticket=epoch;
  try{
   const auth=await db().auth.getUser();
   if(ticket!==epoch)return;
   if(auth.error||!own(auth.data?.user))throw Error('Sin acceso');
   // RLS: another tenant or identity sees no rows, even if it sends forged fields.
   const r=await db().from(TABS).select('id').eq('tenant_id',TENANT).order('position',{ascending:true}).limit(1);
   if(r.error)throw r.error;
   allowed=(r.data||[]).length>0;
  }catch{if(ticket===epoch)allowed=false;}
  finally{
   if(ticket===epoch){checked=true;checking=false;host.render?.();}
  }
 }
 function homeTile(){
  if(!allowed||!validContext(context,api))return '';
  return '<section class="gl-mp-entry" aria-label="Mis Productos"><div><small>LISTA PERSONAL · PERFUMERÍA</small><h2>Mis Productos</h2><p>Guardá los que probaste, marcá cuáles te gustaron y organizalos en tus propias pestañas.</p></div><button type="button" data-mp-open>Ver mis productos →</button></section>';
 }
 async function allRows(table,select,sort,extra){
  const result=[];
  for(let offset=0;offset<10000000;offset+=500){
   let q=db().from(table).select(select).eq('tenant_id',TENANT);
   if(extra)q=q.eq(extra.key,extra.value);
   const r=await q.order(sort,{ascending:true}).range(offset,offset+499);
   if(r.error)throw r.error;
   result.push(...(r.data||[]));
   if(!r.data||r.data.length<500)break;
  }
  return result;
 }
 async function load(){
  const ticket=epoch;
  await assertAccess();
  const nextTabs=await allRows(TABS,'id,name,position,created_at','position');
  if(ticket!==epoch||!visible)return;
  tabs=nextTabs;
  if(!tabs.some(t=>t.id===tabId))tabId=tabs[0]?.id||'';
  await loadItems();
 }
 async function loadItems(){
  const ticket=epoch,selected=tabId;
  if(!selected){items=[];render();return;}
  const next=await allRows(ITEMS,'id,tab_id,product,liked,note,position,created_at','position',{key:'tab_id',value:selected});
  if(ticket!==epoch||tabId!==selected||!visible)return;
  items=next;render();
 }
 function status(value,selected,id,label){
  const isSelected=value===selected;
  return '<button type="button" data-mp-like="'+esc(id)+'" data-value="'+(value?'yes':'no')+'" class="gl-mp-vote '+(isSelected?(value?'is-yes':'is-no'):'')+'" aria-pressed="'+isSelected+'">'+(value?'✓ Me gustó':'✕ No me gustó')+'</button>';
 }
 function row(item){
  return '<tr><td class="gl-mp-product">'+esc(item.product)+'</td><td><div class="gl-mp-votes">'+
    status(true,item.liked,item.id,'Me gustó')+status(false,item.liked,item.id,'No me gustó')+
    '</div></td><td class="gl-mp-note">'+(item.note?esc(item.note):'<span class="gl-mp-muted">Sin nota</span>')+'</td>'+
    '<td><div class="gl-mp-actions"><button type="button" data-mp-edit="'+esc(item.id)+'" aria-label="Editar '+esc(item.product)+'">Editar</button>'+
    '<button type="button" data-mp-delete="'+esc(item.id)+'" class="is-danger" aria-label="Eliminar '+esc(item.product)+'">Eliminar</button></div></td></tr>';
 }
 function form(){
  const item=items.find(x=>x.id===editing);
  return '<form id="gl-mp-form" class="gl-mp-form"><h3>'+(item?'Editar producto':'Agregar producto')+'</h3>'+
   '<label>Producto<input name="product" required maxlength="160" placeholder="Ej.: perfume, marca y tamaño" value="'+esc(item?.product||'')+'"></label>'+
   '<label>Resultado<select name="liked"><option value="" '+(item?.liked==null?'selected':'')+'>Sin evaluar</option>'+
    '<option value="yes" '+(item?.liked===true?'selected':'')+'>Me gustó</option>'+
    '<option value="no" '+(item?.liked===false?'selected':'')+'>No me gustó</option></select></label>'+
   '<label>Nota<textarea name="note" maxlength="2000" rows="2" placeholder="Aroma, duración o detalles...">'+esc(item?.note||'')+'</textarea></label>'+
   '<div class="gl-mp-form-actions"><button type="submit" '+(busy?'disabled':'')+'>'+(busy?'Guardando…':'Guardar producto')+'</button>'+
   '<button type="button" data-mp-cancel>Cancelar</button></div></form>';
 }
 function render(){
  if(!visible)return;
  let root=$('#gl-mp-panel');
  if(!root){root=document.createElement('div');root.id='gl-mp-panel';document.body.append(root);}
  const current=tabs.find(t=>t.id===tabId);
  root.innerHTML='<div class="gl-mp-shell" role="dialog" aria-modal="true" aria-labelledby="gl-mp-title">'+
   '<header class="gl-mp-header"><div><small>GESTLOK · PERFUMERÍA</small><h1 id="gl-mp-title">Mis Productos</h1><p>Tu lista personal para decidir qué productos volver a traer.</p></div>'+
   '<button type="button" class="gl-mp-back" data-mp-close>← Volver al inicio</button></header>'+
   '<div class="gl-mp-body"><aside class="gl-mp-side" aria-label="Secciones">'+
   '<strong>Mi local</strong><button type="button" data-mp-close>Inicio</button><button class="is-active" aria-current="page" type="button">★ Mis Productos</button>'+
   '<p>Una lista independiente del stock y de las ventas.</p></aside>'+
   '<main class="gl-mp-main"><div class="gl-mp-toolbar"><div><h2>Mis Productos</h2><p>Organizá tus productos por categoría.</p></div>'+
   '<button type="button" data-mp-new-tab class="gl-mp-primary">+ Nueva pestaña</button></div>'+
   (error?'<p class="gl-mp-error" role="alert">'+esc(error)+'</p>':'')+
   (notice?'<p class="gl-mp-success" role="status">'+esc(notice)+'</p>':'')+
   '<nav class="gl-mp-tabs" aria-label="Pestañas de productos">'+tabs.map(t=>
    '<button type="button" data-mp-tab="'+esc(t.id)+'" class="'+(t.id===tabId?'is-active':'')+'" aria-current="'+(t.id===tabId?'page':'false')+'">'+esc(t.name)+'</button>').join('')+'</nav>'+
   (loading?'<p role="status">Cargando tu lista privada…</p>':!current?'<div class="gl-mp-empty"><p>Todavía no tenés pestañas. Creá una para empezar.</p></div>':
    '<section class="gl-mp-sheet"><header class="gl-mp-listhead"><div><h3>'+esc(current.name)+'</h3><small>'+items.length+' productos</small></div>'+
      '<div class="gl-mp-tab-actions"><button type="button" data-mp-rename>Renombrar pestaña</button><button type="button" data-mp-remove-tab class="is-danger">Eliminar pestaña</button></div></header>'+
      '<div class="gl-mp-list-controls"><button type="button" class="gl-mp-primary" data-mp-new>+ Agregar producto</button></div>'+
      (itemForm?form():'')+
      '<div class="gl-mp-scroll"><table class="gl-mp-table"><thead><tr><th>Producto</th><th>Me gustó / No me gustó</th><th>Nota</th><th>Acciones</th></tr></thead>'+
      '<tbody>'+(items.length?items.map(row).join(''):'<tr><td colspan="4" class="gl-mp-empty">Tu hoja está vacía. Agregá el primer producto.</td></tr>')+'</tbody></table></div>'+
      '<p class="gl-mp-hint">Podés agregar todos los productos que necesites. Cada pestaña conserva su propia lista.</p></section>')+
   '</main></div></div>';
  document.body.classList.add('gl-mp-open');
 }
 async function open(){
  if(visible)return;
  if(!allowed||!validContext(context,api))return;
  visible=true;loading=true;error='';notice='';
  window.history?.pushState({...window.history.state,glMisProductos:true},'');
  render();
  try{await load();}catch(err){error=err.message||'No pudimos cargar tus productos.';}
  finally{loading=false;render();}
 }
 function close(back=true){
  if(!visible)return;
  visible=false;$('#gl-mp-panel')?.remove();document.body.classList.remove('gl-mp-open');
  if(window.history?.state?.glMisProductos){
   if(back)window.history.back();
   else window.history.replaceState({...window.history.state,glMisProductos:false},'');
  }
 }
 async function changeTab(id){
  if(!tabs.some(t=>t.id===id)||busy)return;
  tabId=id;itemForm=false;editing='';error='';notice='';loading=true;render();
  try{await assertAccess();await loadItems();}catch(e){error=e.message||'No se pudo abrir la lista.';}
  finally{loading=false;render();}
 }
 async function run(task,message){
  if(busy)return;
  busy=true;error='';notice='';render();
  try{await assertAccess();await task();notice=message||'Cambios guardados.';}
  catch(e){error=e.message||'No se pudo guardar.';}
  finally{busy=false;render();}
 }
 async function saveTab(newName,old){
  const name=String(newName||'').trim().replace(/\s+/g,' ');
  if(!name||name.length>60){error='Ingresá un nombre de pestaña de hasta 60 caracteres.';render();return;}
  if(tabs.some(t=>t.id!==old&&t.name.trim().toLowerCase()===name.toLowerCase())){error='Ya existe una pestaña con ese nombre.';render();return;}
  await run(async()=>{
   const q=old?db().from(TABS).update({name}).eq('id',old).eq('tenant_id',TENANT)
    :db().from(TABS).insert({name,tenant_id:TENANT,position:tabs.length});
   const r=await q.select('id').single();if(r.error)throw r.error;
   tabId=old||r.data.id;await load();
  },'Pestaña guardada.');
 }
 async function deleteTab(){
  if(!tabId)return;
  const tab=tabs.find(t=>t.id===tabId);
  if(!tab||!window.confirm('¿Eliminar la pestaña «'+tab.name+'» y sus '+items.length+' productos? Esta acción no se puede deshacer.'))return;
  await run(async()=>{
   const r=await db().from(TABS).delete().eq('id',tabId).eq('tenant_id',TENANT);
   if(r.error)throw r.error;
   tabId='';itemForm=false;editing='';await load();
  },'Pestaña eliminada.');
 }
 async function saveItem(formEl){
  if(!tabId||busy)return;
  const values=Object.fromEntries(new FormData(formEl).entries());
  const product=String(values.product||'').trim().replace(/\s+/g,' ');
  const note=String(values.note||'').trim();
  if(!product||product.length>160||note.length>2000){error='Revisá el producto y la nota.';render();return;}
  const liked=values.liked==='yes'?true:values.liked==='no'?false:null;
  await run(async()=>{
   const fields={product,liked,note,updated_at:new Date().toISOString()};
   const q=editing
    ? db().from(ITEMS).update(fields).eq('id',editing).eq('tenant_id',TENANT).eq('tab_id',tabId)
    : db().from(ITEMS).insert({...fields,tab_id:tabId,tenant_id:TENANT,position:items.length});
   const r=await q.select('id').single();if(r.error)throw r.error;
   editing='';itemForm=false;await loadItems();
  },'Producto guardado.');
 }
 async function vote(id,value){
  const item=items.find(x=>x.id===id);
  if(!item)return;
  await run(async()=>{
   const liked=item.liked===value?null:value;
   const r=await db().from(ITEMS).update({liked,updated_at:new Date().toISOString()})
    .eq('id',id).eq('tab_id',tabId).eq('tenant_id',TENANT).select('id').single();
   if(r.error)throw r.error;
   await loadItems();
  },'Preferencia guardada.');
 }
 async function deleteItem(id){
  const item=items.find(x=>x.id===id);
  if(!item||!window.confirm('¿Eliminar «'+item.product+'» de tu lista?'))return;
  await run(async()=>{
   const r=await db().from(ITEMS).delete().eq('id',id).eq('tab_id',tabId).eq('tenant_id',TENANT);
   if(r.error)throw r.error;
   await loadItems();
  },'Producto eliminado.');
 }
 document.addEventListener('click',e=>{
  if(e.target.closest('[data-mp-open]')){e.preventDefault();api?.closePanel?.();void open();return;}
  if(!visible||!e.target.closest('#gl-mp-panel'))return;
  const el=e.target;
  if(el.closest('[data-mp-close]')){e.preventDefault();close();return;}
  const t=el.closest('[data-mp-tab]');if(t){void changeTab(t.dataset.mpTab);return;}
  if(el.closest('[data-mp-new-tab]')){
   const name=window.prompt('Nombre de la nueva pestaña:');
   if(name!==null)void saveTab(name);return;
  }
  if(el.closest('[data-mp-rename]')){
   const current=tabs.find(x=>x.id===tabId);
   if(!current)return;
   const name=window.prompt('Nuevo nombre de la pestaña:',current.name);
   if(name!==null)void saveTab(name,current.id);return;
  }
  if(el.closest('[data-mp-remove-tab]')){void deleteTab();return;}
  if(el.closest('[data-mp-new]')){editing='';itemForm=true;notice='';render();$('#gl-mp-form input[name="product"]')?.focus();return;}
  if(el.closest('[data-mp-cancel]')){editing='';itemForm=false;render();return;}
  const edit=el.closest('[data-mp-edit]');
  if(edit){editing=edit.dataset.mpEdit;itemForm=true;notice='';render();$('#gl-mp-form input[name="product"]')?.focus();return;}
  const del=el.closest('[data-mp-delete]');if(del){void deleteItem(del.dataset.mpDelete);return;}
  const like=el.closest('[data-mp-like]');if(like){void vote(like.dataset.mpLike,like.dataset.value==='yes');return;}
 });
 document.addEventListener('submit',e=>{
  if(e.target.id!=='gl-mp-form')return;
  e.preventDefault();void saveItem(e.target);
 });
 window.addEventListener?.('popstate',()=>{if(visible&&!window.history?.state?.glMisProductos)close(false);});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&visible)close();});
 window.GestLokMisProductos=Object.freeze({refresh,homeTile,open,reset,authorized:()=>allowed&&validContext(context,api)});
})();

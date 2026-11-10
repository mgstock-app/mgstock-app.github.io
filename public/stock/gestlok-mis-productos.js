/* GESTLOK · Mis Productos (cuaderno privado de Camila).
 * No pertenece al Plan Scanner: no consulta ni modifica ventas, precios, stock o caja.
 * El acceso definitivo lo impone RLS sobre las tablas privadas.
 */
(()=>{
 'use strict';
 if(window.GestLokMisProductos)return;
 const TENANT='2a97bf8d-7d08-4aa7-b051-5d1a4dc80103';
 const EMAIL='camilab.lopez99@gmail.com';
 const CREATOR_EMAIL='kmu15lopez@gmail.com';
 const OWNER_UID='8ddf2c6c-8d62-44de-8ce8-27eb5759daa3';
 const TABS='gestlok_cami_product_tabs', ITEMS='gestlok_cami_product_items';
 const PHOTO_BUCKET='gestlok-cami-product-photos',photoUrls=new Map();
 const $=s=>document.querySelector(s);
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
 let api=null,context=null,allowed=false,checked=false,checking=false,epoch=0;
 let visible=false,tabs=[],items=[],tabId='',loading=false,busy=false,error='',notice='',editing='',itemForm=false,searchTerm='';
 const db=()=>window.GestLokSupabase;
 // previewOwner devuelve contexto de dueña incluso a la creadora; su rol real se verifica en host y RLS.
 const validContext=(ctx,host)=>ctx?.tenant_id===TENANT&&host?.S?.me?.tenant_id===TENANT&&(
   (ctx?.role==='dueno'&&host?.role?.()==='dueno'&&String(host.S.me.email||'').toLowerCase()===EMAIL)||
   (ctx?.role==='dueno'&&host?.role?.()==='creadora'&&host?.isCreadora?.()===true&&
     String(host.S.me.email||'').toLowerCase()===CREATOR_EMAIL));
 const own=(u)=>!!u?.id&&[EMAIL,CREATOR_EMAIL].includes(String(u?.email||'').toLowerCase());
 async function assertAccess(){
  if(!allowed||!validContext(context,api))throw Error('Este cuaderno es privado y no está habilitado para esta cuenta.');
  const result=await db().auth.getUser();
  if(result.error||!own(result.data?.user))throw Error('Iniciá sesión con la cuenta autorizada.');
  return result.data.user;
 }
 function reset(){
  epoch++;allowed=false;checked=false;checking=false;context=null;api=null;
  tabs=[];items=[];photoUrls.clear();tabId='';editing='';itemForm=false;searchTerm='';error='';notice='';
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
  const next=await allRows(ITEMS,'id,tab_id,product,fragrance_type,liked,note,photo_path,original_photo_path,position,created_at','position',{key:'tab_id',value:selected});
  if(ticket!==epoch||tabId!==selected||!visible)return;
  // Fecha de alta, no fecha de edición: las preferencias no alteran el orden.
  items=next.sort((a,b)=>(Date.parse(b.created_at)||0)-(Date.parse(a.created_at)||0)
   ||(Number(b.position)||0)-(Number(a.position)||0)||String(b.id).localeCompare(String(a.id)));
  photoUrls.clear();render();
  const paths=items.filter(x=>x.photo_path).map(x=>x.photo_path);
  if(!paths.length)return;
  try{
   const signed=await db().storage.from(PHOTO_BUCKET).createSignedUrls(paths,3600);
   if(signed.error)throw signed.error;
   if(ticket!==epoch||tabId!==selected||!visible)return;
   for(const entry of signed.data||[]){
    if(entry.signedUrl&&!entry.error){
     const item=items.find(x=>x.photo_path===entry.path);
     if(item)photoUrls.set(item.id,entry.signedUrl);
    }
   }
   updateCards();
  }catch(err){console.warn('No se pudieron mostrar algunas fotos privadas.',err);}
 }
 function status(value,selected,id,label){
  const isSelected=value===selected;
  return '<button type="button" data-mp-like="'+esc(id)+'" data-value="'+(value?'yes':'no')+'" class="gl-mp-vote '+(isSelected?(value?'is-yes':'is-no'):'')+'" aria-pressed="'+isSelected+'">'+(value?'✓ Me gustó':'✕ No me gustó')+'</button>';
 }
 function fragranceSelect(item){return '<select class="gl-mp-fragrance" data-mp-fragrance="'+esc(item.id)+'" aria-label="Tipo de fragancia de '+esc(item.product)+'"><option value="" '+(!item.fragrance_type?'selected':'')+'>Elegir tipo</option>'+[['fem','Fem'],['hombre','Hombre'],['unisex','Unisex']].map(([v,t])=>'<option value="'+v+'" '+(item.fragrance_type===v?'selected':'')+'>'+t+'</option>').join('')+'</select>';}
 function row(item){
  const id=esc(item.id),name=esc(item.product),photo=photoUrls.get(item.id);
  return '<article class="gl-mp-card" data-mp-item="'+id+'">'+
   '<div class="gl-mp-card-top"><div class="gl-mp-photo">'+
   (photo?'<img src="'+esc(photo)+'" loading="lazy" alt="Foto de '+name+'">':
    '<div class="gl-mp-no-photo" aria-hidden="true"><span>▧</span><small>Sin foto</small></div>')+
   '<button type="button" class="gl-mp-photo-edit" data-mp-photo-btn="'+id+'">'+(item.photo_path?'Cambiar foto':'Elegir foto')+'</button>'+
   '<button type="button" class="gl-mp-photo-camera" data-mp-photo-camera="'+id+'">📷 Sacar foto</button>'+
   '<input type="file" hidden data-mp-photo-input="'+id+'" aria-label="Elegir foto de '+name+'" accept="image/jpeg,image/png,image/webp">'+
   '<input type="file" hidden data-mp-photo-camera-input="'+id+'" aria-label="Sacar foto de '+name+'" accept="image/*" capture="environment"></div>'+
   '<div class="gl-mp-card-info"><h4 title="'+name+'">'+name+'</h4>'+
   '<div class="gl-mp-card-attributes"><span>Fragancia</span>'+fragranceSelect(item)+'</div>'+
   '<div class="gl-mp-votes">'+status(true,item.liked,item.id,'Me gustó')+status(false,item.liked,item.id,'No me gustó')+'</div>'+
   (item.note?'<p class="gl-mp-card-note"><b>Nota:</b> '+esc(item.note)+'</p>':'')+
   '</div></div><div class="gl-mp-actions">'+
   '<button type="button" data-mp-print="'+id+'" aria-label="Imprimir nombre de '+name+' en NIIMBOT D110">Imprimir nombre</button>'+
   '<button type="button" data-mp-edit="'+id+'" aria-label="Editar '+name+'">Editar</button>'+
   (item.original_photo_path?'<button type="button" data-mp-photo-original="'+id+'">Ver original</button>':'')+
   (item.photo_path?'<button type="button" data-mp-photo-remove="'+id+'">Quitar foto</button>':'')+
   '<button type="button" data-mp-delete="'+id+'" class="is-danger" aria-label="Eliminar '+name+'">Eliminar</button></div></article>';
 }
 function updateCards(){const list=$('#gl-mp-panel [data-mp-cards]');if(list)list.innerHTML=rowsHtml();}
 function matchesSearch(item){
  const norm=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es').trim();
  return norm(item.product).includes(norm(searchTerm));
 }
 function matchingItems(){return searchTerm.trim()?items.filter(matchesSearch):items;}
 function rowsHtml(){
  const found=matchingItems();
  return found.length?found.map(row).join(''):items.length
   ?'<div class="gl-mp-empty">No encontramos productos con ese nombre.</div>'
   :'<div class="gl-mp-empty">Tu hoja está vacía. Agregá el primer producto.</div>';
 }
 function resultLabel(){return searchTerm.trim()?matchingItems().length+' de '+items.length+' productos':'Más recientes primero';}
 function form(){
  const item=items.find(x=>x.id===editing);
  return '<form id="gl-mp-form" class="gl-mp-form"><h3>'+(item?'Editar producto':'Agregar producto')+'</h3>'+
   '<label>Producto<input name="product" required maxlength="160" placeholder="Ej.: perfume, marca y tamaño" value="'+esc(item?.product||'')+'"></label>'+
   '<label>Tipo de fragancia<select name="fragrance_type"><option value="">Sin clasificar</option>'+[['fem','Fem'],['hombre','Hombre'],['unisex','Unisex']].map(([v,t])=>'<option value="'+v+'" '+(item?.fragrance_type===v?'selected':'')+'>'+t+'</option>').join('')+'</select></label>'+ 
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
      '<div class="gl-mp-list-controls"><button type="button" class="gl-mp-primary" data-mp-new>+ Agregar producto</button>'+
      '<label class="gl-mp-search" for="gl-mp-search"><span>Buscar producto</span><input id="gl-mp-search" type="search" data-mp-search placeholder="Buscar por nombre…" autocomplete="off" value="'+esc(searchTerm)+'"></label>'+
      '<small class="gl-mp-result-count" data-mp-count role="status">'+resultLabel()+'</small></div>'+
      (itemForm?form():'')+
      '<div class="gl-mp-cards" data-mp-cards>'+rowsHtml()+'</div>'+
      '<p class="gl-mp-hint">Podés agregar todos los productos que necesites. Cada pestaña conserva su propia lista.</p></section>')+
   '</main></div></div>';
  document.body.classList.add('gl-mp-open');
 }
 async function open(){
  if(visible)return;
  if(!allowed||!validContext(context,api))return;
  visible=true;loading=true;searchTerm='';error='';notice='';
  window.history?.pushState({...window.history.state,glMisProductos:true},'');
  render();
  try{await load();}catch(err){error=err.message||'No pudimos cargar tus productos.';}
  finally{loading=false;render();}
 }
 function close(back=true){
  removePrintModal();
  if(!visible)return;
  visible=false;searchTerm='';photoUrls.clear();$('#gl-mp-panel')?.remove();document.body.classList.remove('gl-mp-open');
  if(window.history?.state?.glMisProductos){
   if(back)window.history.back();
   else window.history.replaceState({...window.history.state,glMisProductos:false},'');
  }
 }
 async function changeTab(id){
  if(!tabs.some(t=>t.id===id)||busy)return;
  removePrintModal();
  tabId=id;photoUrls.clear();itemForm=false;editing='';searchTerm='';error='';notice='';loading=true;render();
  try{await assertAccess();await loadItems();}catch(e){error=e.message||'No se pudo abrir la lista.';}
  finally{loading=false;render();}
 }
 async function run(task,message){
  if(busy)return;
  busy=true;error='';notice='Procesando foto… la primera vez puede descargar el modelo de fondo blanco.';render();
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
    :db().from(TABS).insert({name,owner_uid:OWNER_UID,tenant_id:TENANT,position:tabs.length});
   const r=await q.select('id').single();if(r.error)throw r.error;
   tabId=old||r.data.id;if(!old)searchTerm='';await load();
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
  const fragrance_type=['fem','hombre','unisex'].includes(values.fragrance_type)?values.fragrance_type:null;
  await run(async()=>{
   const fields={product,fragrance_type,liked,note,updated_at:new Date().toISOString()};
   const q=editing
    ? db().from(ITEMS).update(fields).eq('id',editing).eq('tenant_id',TENANT).eq('tab_id',tabId)
    : db().from(ITEMS).insert({...fields,owner_uid:OWNER_UID,tab_id:tabId,tenant_id:TENANT,position:items.length});
   const r=await q.select('id').single();if(r.error)throw r.error;
   editing='';itemForm=false;await loadItems();
  },'Producto guardado.');
 }

 function compressPhoto(file){
  if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Elegí una imagen JPG, PNG o WebP.');
  if(file.size>20*1024*1024)throw Error('La foto es demasiado grande. Elegí una de hasta 20 MB.');
  return new Promise((resolve,reject)=>{
   const url=URL.createObjectURL(file),image=new Image();
   image.onload=()=>{
    URL.revokeObjectURL(url);
    try{
     const factor=Math.min(1,1200/Math.max(image.naturalWidth,image.naturalHeight));
     const canvas=document.createElement('canvas');
     canvas.width=Math.max(1,Math.round(image.naturalWidth*factor));
     canvas.height=Math.max(1,Math.round(image.naturalHeight*factor));
     const ctx=canvas.getContext('2d');
     if(!ctx)throw Error('No se pudo preparar la imagen.');
     ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);
     ctx.drawImage(image,0,0,canvas.width,canvas.height);
     canvas.toBlob(blob=>{
      if(!blob)return reject(Error('No se pudo preparar la foto.'));
      if(blob.size>3*1024*1024)return reject(Error('La foto comprimida supera 3 MB.'));
      resolve(blob);
     },'image/jpeg',0.78);
    }catch(e){reject(e);}
   };
   image.onerror=()=>{URL.revokeObjectURL(url);reject(Error('No se pudo abrir la foto. Probá con JPG o PNG.'));};
   image.src=url;
  });
 }

 async function uploadPhoto(id,file){
  // Capturamos ID + pestaña ANTES de cualquier operación asíncrona; no usamos
  // la tarjeta visible al terminar el recorte ni vinculamos por nombre.
  const item=items.find(x=>x.id===id&&x.tab_id===tabId);
  if(!item||!file||busy)return;
  const targetTab=item.tab_id, targetId=item.id;
  await run(async()=>{
   await assertAccess();
   const original=await compressPhoto(file);
   // Modelo descargado al primer uso: el recorte se hace sin subir la imagen a terceros.
   const {whiteBackground}=await import('/stock/gestlok-product-white-bg.mjs?rev=20261110');
   const edited=await whiteBackground(original);
   if(tabId!==targetTab||!items.some(x=>x.id===targetId&&x.tab_id===targetTab)){
    throw Error('Cambiaste de producto o pestaña. No se guardó la foto.');
   }
   const storage=db().storage.from(PHOTO_BUCKET);
   const prefix=OWNER_UID+'/'+targetId+'/';
   const suffix=()=>Date.now()+'-'+(window.crypto?.randomUUID?.()||Math.random().toString(36).slice(2))+'.jpg';
   const originalPath=prefix+suffix(),editedPath=prefix+suffix();
   const uploaded=[];
   try{
    for(const [path,blob] of [[originalPath,original],[editedPath,edited]]){
     const up=await storage.upload(path,blob,{contentType:'image/jpeg',cacheControl:'3600',upsert:false});
     if(up.error)throw up.error;
     uploaded.push(path);
    }
    // El servidor verifica tenant, dueño, pestaña e ID, además de la RLS del almacenamiento.
    const saved=await db().from(ITEMS).update({
      photo_path:editedPath,original_photo_path:originalPath,updated_at:new Date().toISOString()
     }).eq('id',targetId).eq('tab_id',targetTab).eq('tenant_id',TENANT)
       .eq('owner_uid',OWNER_UID).select('id').single();
    if(saved.error||saved.data?.id!==targetId)throw saved.error||Error('No se pudo asociar la foto al producto correcto.');
    const old=[item.photo_path,item.original_photo_path].filter(p=>p&&!uploaded.includes(p));
    if(old.length)await storage.remove(old);
    await loadItems();
   }catch(err){
    if(uploaded.length)await storage.remove(uploaded);
    throw err;
   }
  },'Foto con fondo blanco guardada en «'+item.product+'». Original conservado.');
 }
 async function viewOriginalPhoto(id){
  const item=items.find(x=>x.id===id&&x.tab_id===tabId);
  if(!item?.original_photo_path)return;
  try{
   await assertAccess();
   const result=await db().storage.from(PHOTO_BUCKET).createSignedUrl(item.original_photo_path,120);
   if(result.error)throw result.error;
   window.open(result.data.signedUrl,'_blank','noopener,noreferrer');
  }catch(e){error=e.message||'No se pudo abrir el original.';render();}
 }
 async function removePhoto(id){
  const item=items.find(x=>x.id===id&&x.tab_id===tabId);
  if(!item?.photo_path||!window.confirm('¿Quitar ambas fotos de «'+item.product+'»?'))return;
  await run(async()=>{
   const old=[item.photo_path,item.original_photo_path].filter(Boolean);
   const saved=await db().from(ITEMS).update({
    photo_path:null,original_photo_path:null,updated_at:new Date().toISOString()
   }).eq('id',id).eq('tab_id',tabId).eq('tenant_id',TENANT).eq('owner_uid',OWNER_UID).select('id').single();
   if(saved.error)throw saved.error;
   if(old.length)await db().storage.from(PHOTO_BUCKET).remove(old);
   await loadItems();
  },'Fotos eliminadas de este producto.');
 }
 async function changeFragrance(id,value){
  if(!items.some(x=>x.id===id)||!['','fem','hombre','unisex'].includes(value))return;
  await run(async()=>{
   const r=await db().from(ITEMS).update({fragrance_type:value||null,updated_at:new Date().toISOString()}).eq('id',id).eq('tab_id',tabId).eq('tenant_id',TENANT).select('id').single();
   if(r.error)throw r.error;
   await loadItems();
  },'Tipo de fragancia guardado.');
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
   const photos=[item.photo_path,item.original_photo_path].filter(Boolean);
   if(photos.length)await db().storage.from(PHOTO_BUCKET).remove(photos);
   await loadItems();
  },'Producto eliminado.');
 }

 // Impresión de nombre únicamente; el cuaderno no depende del catálogo del Scanner.
 // NIIMBOT D110_M: 30 × 12 mm = 240 × 96 px a 203 dpi, giro a 96 × 240 para Bluetooth.
 function removePrintModal(){document.querySelector('[data-mp-label-modal]')?.remove();}
 function labelArtwork(value,fragranceType){
  const name=String(value||'').trim().replace(/\s+/g,' ');
  if(!name)throw Error('Escribí un nombre para la etiqueta.');
  const typeName={fem:'FEM',hombre:'HOMBRE',unisex:'UNISEX'}[fragranceType]||'';
  const canvas=document.createElement('canvas');
  canvas.width=240;canvas.height=96;
  const ctx=canvas.getContext('2d');
  if(!ctx)throw Error('No se pudo generar la imagen de la etiqueta.');
  ctx.fillStyle='#fff';ctx.fillRect(0,0,240,96);
  ctx.fillStyle='#000';ctx.textAlign='center';ctx.textBaseline='middle';
  // Georgia seminegrita: serif sobria, con trazos visibles en impresión térmica.
  // Ajuste automático, con margen a ambos lados; nunca recortar silenciosamente.
  let chosen=null;
  for(const size of (typeName?[24,22,20,18,16,14,12]:[29,27,25,23,21,19,17,15])){
   ctx.font='600 '+size+'px Georgia, "Times New Roman", serif';
   const lines=[];let line='';
   for(const word of name.split(' ')){
    const next=line?line+' '+word:word;
    if(ctx.measureText(next).width<=224){line=next;continue;}
    if(line){lines.push(line);line='';}
    if(ctx.measureText(word).width<=224){line=word;continue;}
    let part='';
    for(const ch of word){
     if(ctx.measureText(part+ch).width>224&&part){lines.push(part);part=ch;}
     else part+=ch;
    }
    line=part;
   }
   if(line)lines.push(line);
   const step=Math.ceil(size*1.18);
   if(lines.length<=(typeName?2:4)&&lines.length*step<=(typeName?54:84)){chosen={lines,size,step};break;}
  }
  if(!chosen)throw Error('El nombre es muy largo para imprimirse con claridad. Acortá el texto de la etiqueta (no cambia el producto guardado).');
  ctx.font='600 '+chosen.size+'px Georgia, "Times New Roman", serif';
  const start=(typeName?34:48)-(chosen.lines.length-1)*chosen.step/2;
  chosen.lines.forEach((line,i)=>ctx.fillText(line,120,start+i*chosen.step,224));
  if(typeName){ctx.fillRect(26,69,188,1);ctx.font='600 15px Arial, sans-serif';ctx.fillText(typeName,120,83,220);}
  const portrait=document.createElement('canvas');
  portrait.width=96;portrait.height=240;
  const rotated=portrait.getContext('2d');
  if(!rotated)throw Error('No se pudo preparar la etiqueta para D110.');
  rotated.fillStyle='#fff';rotated.fillRect(0,0,96,240);
  rotated.translate(96,0);rotated.rotate(Math.PI/2);
  rotated.imageSmoothingEnabled=false;
  rotated.drawImage(canvas,0,0,240,96);
  return {screen:canvas.toDataURL('image/png'),printer:portrait.toDataURL('image/png'),lines:chosen.lines};
 }
 function updateLabelPreview(modal){
  const status=modal.querySelector('[data-mp-label-message]');
  const bt=modal.querySelector('[data-mp-label-bluetooth]');
  const system=modal.querySelector('[data-mp-label-system]');
  bt.disabled=true;system.disabled=true;
  modal.dataset.printImage='';
  try{
   const artwork=labelArtwork(modal.querySelector('[data-mp-label-text]').value,modal.dataset.fragranceType);
   modal.dataset.printImage=artwork.printer;
   modal.querySelector('[data-mp-label-preview]').src=artwork.screen;
   const frame=modal.querySelector('[data-mp-label-frame]');
   const doc=frame.contentDocument;
   if(!doc)throw Error('No se pudo preparar la impresión desde el navegador.');
   // Imagen PNG local: sin contenido de texto inyectado ni datos de ventas.
   doc.open();
   doc.write('<!doctype html><html><head><meta charset="utf-8"><title>Nombre de producto</title><style>@page{size:30mm 12mm;margin:0}html,body{width:30mm;height:12mm;margin:0;padding:0}img{display:block;width:30mm;height:12mm}</style></head><body><img src="'+artwork.screen+'" alt="Etiqueta"></body></html>');
   doc.close();
   system.disabled=false;
   bt.disabled=!window.Niimbot?.isSupported?.();
   status.textContent='Vista previa lista · 30 × 12 mm. Se imprime el nombre y, si está seleccionado, el tipo de fragancia.';
  }catch(err){
   modal.querySelector('[data-mp-label-preview]').removeAttribute('src');
   status.textContent=err.message||'No se pudo preparar la etiqueta.';
  }
 }
 function prepareBluetooth(modal){
  const button=modal.querySelector('[data-mp-label-bluetooth]');
  const refresh=()=>{
   if(!modal.isConnected)return;
   const supported=!!window.Niimbot?.isSupported?.();
   button.disabled=!supported||!modal.dataset.printImage;
   button.textContent=supported?'Imprimir con NIIMBOT D110':'Bluetooth no disponible';
  };
  if(window.Niimbot){refresh();return;}
  button.disabled=true;button.textContent='Preparando Bluetooth…';
  const script=document.createElement('script');
  script.src='/stock/sistema-venta/niimbot-driver.js';
  script.onload=refresh;
  script.onerror=()=>{
   if(modal.isConnected)modal.querySelector('[data-mp-label-message]').textContent='No se pudo cargar la conexión Bluetooth. Podés usar la impresión del sistema.';
   button.textContent='Bluetooth no disponible';
  };
  document.head.append(script);
 }
 async function openLabel(item){
  try{
   await assertAccess();
   if(!visible||!items.some(x=>x.id===item.id))return;
   removePrintModal();
   const modal=document.createElement('div');
   modal.dataset.mpLabelModal='true';
   modal.dataset.fragranceType=item.fragrance_type||'';
   modal.setAttribute('role','presentation');
   modal.innerHTML='<div class="gl-mp-label-card" role="dialog" aria-modal="true" aria-labelledby="gl-mp-label-title">'+
    '<header><h2 id="gl-mp-label-title">Etiqueta para NIIMBOT D110</h2><button type="button" data-mp-label-close aria-label="Cerrar etiqueta">✕</button></header>'+
    '<p>Nombre y tipo de fragancia centrados, sin código de barras.</p>'+
    '<label>Nombre que se imprimirá<input type="text" data-mp-label-text maxlength="160" value="'+esc(item.product)+'"></label>'+
    '<div class="gl-mp-label-display"><img data-mp-label-preview alt="Vista previa de nombre para etiqueta 30 por 12 milímetros"></div>'+
    '<p class="gl-mp-label-status" data-mp-label-message role="status">Preparando etiqueta…</p>'+
    '<div class="gl-mp-label-buttons"><button type="button" data-mp-label-bluetooth disabled>Imprimir con NIIMBOT D110</button>'+
    '<button type="button" data-mp-label-system disabled>Imprimir desde sistema</button>'+
    '<button type="button" data-mp-label-close>Cerrar</button></div>'+
    '<small>Usá etiquetas de 30 × 12 mm. Si tu navegador no admite Bluetooth, elegí la impresión del sistema. Cambiar este nombre no modifica tu lista.</small>'+
    '<iframe data-mp-label-frame title="Documento de impresión" tabindex="-1" aria-hidden="true"></iframe></div>';
   document.body.append(modal);
   updateLabelPreview(modal);
   prepareBluetooth(modal);
   modal.querySelector('[data-mp-label-text]')?.focus({preventScroll:true});
  }catch(err){error=err.message||'No se pudo abrir la impresión.';render();}
 }
 function printBluetooth(modal){
  const btn=modal.querySelector('[data-mp-label-bluetooth]');
  const status=modal.querySelector('[data-mp-label-message]');
  if(btn.disabled||!modal.dataset.printImage)return;
  if(!window.Niimbot?.isSupported?.()){status.textContent='Bluetooth no disponible. Probá con Chrome en Android o usá impresión del sistema.';return;}
  const model={id:2320,label:'Niimbot D110_M',name_prefixes:['D110'],task:'v4',protocol:'v4',dpi:203,density:3,label_type:1,speed:1};
  const size={w_px:96,h_px:240,offset_y_px:0};
  btn.disabled=true;btn.textContent='Conectando e imprimiendo…';
  // Mantener esta llamada dentro del clic directo: Web Bluetooth requiere gesto del usuario.
  void window.Niimbot.printImage(modal.dataset.printImage,{model,size,density:3}).then(()=>{
   if(modal.isConnected)status.textContent='La impresora confirmó la etiqueta.';
  }).catch(err=>{
   if(modal.isConnected)status.textContent='Error Bluetooth: '+(err?.message||'Revisá la conexión y el papel.');
  }).finally(()=>{
   if(modal.isConnected){btn.disabled=false;btn.textContent='Imprimir con NIIMBOT D110';}
  });
 }
 function printSystem(modal){
  const frame=modal.querySelector('[data-mp-label-frame]');
  if(!modal.dataset.printImage||!frame?.contentWindow)return;
  frame.contentWindow.focus();
  frame.contentWindow.print();
 }

 document.addEventListener('click',e=>{
  if(e.target.closest('[data-mp-open]')){e.preventDefault();api?.closePanel?.();void open();return;}
  const modal=e.target.closest('[data-mp-label-modal]');
  if(modal){
   if(e.target.closest('[data-mp-label-close]')){e.preventDefault();removePrintModal();return;}
   if(e.target.closest('[data-mp-label-bluetooth]')){e.preventDefault();printBluetooth(modal);return;}
   if(e.target.closest('[data-mp-label-system]')){e.preventDefault();printSystem(modal);return;}
   return;
  }
  if(!visible||!e.target.closest('#gl-mp-panel'))return;
  const el=e.target;
  const print=el.closest('[data-mp-print]');
  const photo=el.closest('[data-mp-photo-btn]');
  if(photo){e.preventDefault();photo.closest('.gl-mp-photo')?.querySelector('[data-mp-photo-input]')?.click();return;}
  const camera=el.closest('[data-mp-photo-camera]');
  if(camera){e.preventDefault();camera.closest('.gl-mp-photo')?.querySelector('[data-mp-photo-camera-input]')?.click();return;}
  const original=el.closest('[data-mp-photo-original]');
  if(original){e.preventDefault();void viewOriginalPhoto(original.dataset.mpPhotoOriginal);return;}
  const remove=el.closest('[data-mp-photo-remove]');
  if(remove){e.preventDefault();void removePhoto(remove.dataset.mpPhotoRemove);return;}
  if(print){
   e.preventDefault();
   const item=items.find(x=>x.id===print.dataset.mpPrint);
   if(item)void openLabel(item);
   return;
  }
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
 document.addEventListener('input',e=>{
  const search=e.target.closest('[data-mp-search]');
  if(search&&visible){
   searchTerm=search.value;
   // Filtrar solo las filas: el input mantiene el foco en Android.
   const count=$('#gl-mp-panel [data-mp-count]');
   updateCards();
   if(count)count.textContent=resultLabel();
   return;
  }
  const field=e.target.closest('[data-mp-label-text]');
  const modal=field?.closest('[data-mp-label-modal]');
  if(modal)updateLabelPreview(modal);
 });
 document.addEventListener('change',e=>{
  const photo=e.target.closest('[data-mp-photo-input],[data-mp-photo-camera-input]');
  if(photo&&visible){
   const file=photo.files?.[0];
   if(file)void uploadPhoto(photo.dataset.mpPhotoInput||photo.dataset.mpPhotoCameraInput,file);
   photo.value='';
   return;
  }
  const select=e.target.closest('[data-mp-fragrance]');
  if(select&&visible){void changeFragrance(select.dataset.mpFragrance,select.value);}
 });
 document.addEventListener('submit',e=>{
  if(e.target.id!=='gl-mp-form')return;
  e.preventDefault();void saveItem(e.target);
 });
 window.addEventListener?.('popstate',()=>{if(visible&&!window.history?.state?.glMisProductos)close(false);});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&visible)close();});
 window.GestLokMisProductos=Object.freeze({refresh,homeTile,open,reset,authorized:()=>allowed&&validContext(context,api)});
})();

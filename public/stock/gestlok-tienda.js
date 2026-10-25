/* GestLok · organización INTERNA de tienda online por empresa y sucursal.
 * No muestra vidrieras ni permite comprar. Datos protegidos por RLS y tenant/local.
 * El stock de esta sección no modifica ni reemplaza las planillas existentes. */
(() => {
  'use strict';
  let api = null;
  const empty = local => ({local,loaded:false,loading:false,loadingPage:false,saving:false,workspace:null,
    items:[],alerts:[],stats:{total:0,activos:0,alertas:0,archivados:0,categorias:0},
    categories:[],categoriesLoaded:false,editing:null,editingProduct:null,
    tab:'resumen',filter:'activos',q:'',category:'',supplier:'',categoryQuery:'',
    page:0,cursors:[null],hasMore:false,serial:0,error:''});
  let state=empty(null);
  const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = n => new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:2}).format(Number(n)||0);
  const client = () => window.GestLokSupabase;
  const canView = () => !!(api?.S?.me?.tenant_id && api?.S?.local && window.GestLokCommerce?.online());
  const isOwner = () => ['creadora','dueno'].includes(api?.miRol?.());
  const canEdit = () => canView() && !!api?.canW?.() && !api.S.offline && !!client();
  const shortage = p => Number(p.minimo)>0 && Number(p.stock)<=Number(p.minimo);
  const low = () => state.items.filter(p=>p.activo!==false && shortage(p));
  const err = e => String(e?.message || 'No se pudo completar la operación.').slice(0,180);
  function reset(){const loc=api?.S?.local||null;if(state.local!==loc)state=empty(loc);}
  function render(){if(api?.S?.view==='tienda-online')api.render();}
  async function load(force=false){
    reset();
    if(!canView()||state.loading||(state.loaded&&!force))return;
    const local=state.local,tenant=api.S.me.tenant_id,sb=client();
    if(!sb){state.error='No se pudo iniciar el catálogo.';state.loaded=true;return;}
    state.loading=true;state.error='';
    try{
      const a=await sb.from('gestlok_tiendas').select('*').eq('tenant_id',tenant).eq('local_id',local).maybeSingle();
      if(a.error)throw a.error;
      if(local!==state.local)return;
      state.workspace=a.data||null;state.loaded=true;
      if(state.workspace){
        await Promise.all([loadPage(),loadStats(),loadAlerts()]);
      }
    }catch(e){if(local===state.local){state.error=err(e);state.loaded=true;}}
    finally{if(local===state.local){state.loading=false;render();}}
  }
  const resetPage=()=>{state.page=0;state.cursors=[null];state.hasMore=false;};
  async function loadPage(){
    if(!state.workspace||!canView())return;
    const serial=++state.serial,local=state.local;
    const cursor=state.cursors[state.page]||null;
    state.loadingPage=true;state.error='';
    try{
      const r=await client().rpc('gestlok_catalogo_pagina',{
        p_tienda:state.workspace.id,p_consulta:state.q.trim(),
        p_categoria:state.category.trim(),p_proveedor:state.supplier.trim(),
        p_estado:state.filter,p_cursor_nombre:cursor?.nombre||null,
        p_cursor_id:cursor?.id||null,p_limite:50
      });
      if(r.error)throw r.error;
      if(serial!==state.serial||local!==state.local)return;
      state.items=Array.isArray(r.data?.items)?r.data.items:[];
      state.hasMore=r.data?.hasMore===true;
      if(state.page>0&&!state.items.length){state.page--;return await loadPage();}
    }catch(e){if(serial===state.serial&&local===state.local){
      state.error='No se pudo consultar el catálogo: '+err(e);state.items=[];state.hasMore=false;
    }}
    finally{if(serial===state.serial&&local===state.local){state.loadingPage=false;render();}}
  }
  async function loadStats(){
    if(!state.workspace)return;
    const local=state.local;
    try{
      const r=await client().rpc('gestlok_catalogo_resumen',{p_tienda:state.workspace.id});
      if(r.error)throw r.error;
      if(local===state.local)state.stats=r.data||state.stats;
    }catch(e){if(local===state.local)state.error='No se pudo cargar el resumen: '+err(e);}
  }
  async function loadAlerts(){
    if(!state.workspace)return;
    const local=state.local;
    try{
      const r=await client().rpc('gestlok_catalogo_pagina',{
        p_tienda:state.workspace.id,p_consulta:'',p_categoria:'',p_proveedor:'',
        p_estado:'alertas',p_cursor_nombre:null,p_cursor_id:null,p_limite:6
      });
      if(r.error)throw r.error;
      if(local===state.local)state.alerts=Array.isArray(r.data?.items)?r.data.items:[];
    }catch(e){if(local===state.local)state.alerts=[];}
  }
  async function loadCategories(){
    if(!state.workspace)return;
    const local=state.local;
    try{
      const r=await client().rpc('gestlok_catalogo_categorias',{
        p_tienda:state.workspace.id,p_consulta:state.categoryQuery.trim()
      });
      if(r.error)throw r.error;
      if(local===state.local){state.categories=Array.isArray(r.data)?r.data:[];state.categoriesLoaded=true;render();}
    }catch(e){if(local===state.local){state.error='No se pudieron cargar las categorías: '+err(e);render();}}
  }

  function metrics(){
    const st=state.stats;
    const cards=[
      ['Productos registrados',Number(st.total)||0,'Control interno, sin publicar'],
      ['Productos activos',Number(st.activos)||0,'Disponibles para organizar'],
      ['Alertas de reposición',Number(st.alertas)||0,'Bajo el mínimo definido'],
      ['Categorías',Number(st.categorias)||0,'Grupos de productos']
    ];
    return '<section class="gl-demo-metrics">'+cards.map(x=>
      '<article><small>'+x[0]+'</small><strong>'+Number(x[1]).toLocaleString('es-AR')+
      '</strong><span>'+x[2]+'</span></article>').join('')+'</section>';
  }
  function summary(){
    const items=state.alerts;
    return metrics()+'<div class="gl-demo-two"><section class="card pad"><div class="gl-demo-section-title"><h3>Faltantes para revisar</h3><button class="btn sm" data-gl-alerts>Ver todos</button></div>'+
    (items.length?items.map(p=>'<article class="gl-demo-line"><div><b>'+esc(p.nombre)+'</b><small>'+
      esc(p.sku||'Sin SKU')+' · Stock '+esc(p.stock)+' · Mínimo '+esc(p.minimo)+
      '</small></div><span class="gl-demo-critical">Reponer</span></article>').join(''):
      '<p class="lead">Sin alertas registradas.</p>')+
    '</section><section class="card pad"><h3>Operación de canales externos</h3>'+
    '<p class="lead">Usá <b>Pedidos online</b> para organizar órdenes recibidas desde Instagram, WhatsApp u otras plataformas.</p>'+
    '<button class="btn primary" data-go="pedidos-online">Gestionar pedidos</button>'+
    '<p class="note">GestLok organiza pedidos, no vende al público.</p></section></div>'+
    '<section class="card pad"><h3>Organización interna</h3><p class="lead">'+
    'El catálogo funciona por sucursal con búsqueda y paginación en el servidor. No altera las planillas generales.</p></section>';
  }
  function productRows(){
    if(state.loadingPage)return '<p class="lead" role="status">Buscando productos…</p>';
    return state.items.length?state.items.map(p=>'<article class="gl-tienda-item">'+
      '<span class="gl-tienda-placeholder" aria-hidden="true">📦</span><div><b>'+esc(p.nombre)+'</b>'+
      '<small>'+esc(p.sku||'Sin SKU')+' · '+esc(p.categoria||'Sin categoría')+
      ' · '+esc(p.proveedor||'Sin proveedor')+'</small>'+
      '<small>Ubicación: '+esc(p.ubicacion||'Sin asignar')+' · Stock '+esc(p.stock)+' '+
      esc(p.unidad||'unidad')+' · Mín. '+esc(p.minimo??0)+'</small>'+
      '<small>Precio de referencia: '+money(p.precio)+'</small>'+
      (p.activo===false?'<small>Archivado</small>':shortage(p)?'<small class="gl-demo-critical">Reposición pendiente</small>':'<small>En control</small>')+
      '</div>'+(canEdit()?'<div class="gl-tienda-actions"><button class="btn sm" data-gl-edit="'+esc(p.id)+'">Editar</button>'+
      '<button class="btn sm" data-gl-archive="'+esc(p.id)+'" data-next-active="'+(p.activo===false?'true':'false')+
      '">'+(p.activo===false?'Restaurar':'Archivar')+'</button></div>':'')+
      '</article>').join(''):'<p class="lead">No hay productos con estos filtros.</p>';
  }
  function productForm(){
    if(!canEdit())return '';
    const p=state.editingProduct||{};
    const val=(k,def='')=>esc(p[k]??def);
    return '<form id="gl-tienda-product-form" class="card pad gl-commerce-order-form"><h3>'+(p.id?'Editar producto':'Agregar producto a la organización')+'</h3>'+
      '<div class="gl-commerce-fields">'+
      '<label>Nombre<input name="nombre" required minlength="2" maxlength="140" value="'+val('nombre')+'"></label>'+
      '<label>SKU / Código<input name="sku" maxlength="80" value="'+val('sku')+'"></label>'+
      '<label>Categoría<input name="categoria" required maxlength="80" value="'+val('categoria','General')+'"></label>'+
      '<label>Proveedor<input name="proveedor" maxlength="120" value="'+val('proveedor')+'"></label>'+
      '<label>Stock de control<input name="stock" type="number" min="0" max="100000000" step="1" required value="'+val('stock',0)+'"></label>'+
      '<label>Stock mínimo<input name="minimo" type="number" min="0" max="100000000" step="1" required value="'+val('minimo',0)+'"></label>'+
      '<label>Unidad<input name="unidad" maxlength="30" required value="'+val('unidad','unidad')+'"></label>'+
      '<label>Ubicación / estante<input name="ubicacion" maxlength="120" value="'+val('ubicacion')+'"></label>'+
      '<label>Precio de referencia (ARS)<input name="precio" type="number" min="0" max="9999999999" step="0.01" required value="'+val('precio',0)+'"></label>'+
      '<label>Costo (ARS, opcional)<input name="costo" type="number" min="0" max="9999999999" step="0.01" value="'+val('costo')+'"></label>'+
      '<label class="gl-commerce-wide">Notas del producto<textarea name="descripcion" maxlength="1000" rows="2">'+val('descripcion')+'</textarea></label>'+
      '</div><div class="gl-tienda-toggles"><label><input name="activo" type="checkbox" '+(p.activo===false?'':'checked')+'> Producto activo en la organización</label></div>'+
      '<div class="gl-tienda-actions"><button type="submit" class="btn primary" '+(state.saving?'disabled':'')+'>Guardar producto</button>'+
      (p.id?'<button type="button" class="btn" data-gl-cancel>Cancelar edición</button>':'')+'</div></form>';
  }
  function products(){
    return '<section class="card pad"><h3>Catálogo interno de productos</h3>'+
      '<p class="lead">Buscá y organizá tus productos sin cargar todo el catálogo en el dispositivo. Hasta 50 por página.</p>'+
      '<div class="gl-demo-tools gl-catalog-filters">'+
      '<label>Buscar por producto, SKU, proveedor o ubicación<input id="gl-tienda-search" type="search" minlength="3" maxlength="80" placeholder="Escribí 3 caracteres o más" value="'+esc(state.q)+'"></label>'+
      '<label>Categoría exacta<input id="gl-tienda-category" type="search" maxlength="80" placeholder="Todas las categorías" value="'+esc(state.category)+'"></label>'+
      '<label>Proveedor exacto<input id="gl-tienda-supplier" type="search" maxlength="120" placeholder="Todos los proveedores" value="'+esc(state.supplier)+'"></label>'+
      '<label>Estado<select id="gl-tienda-filter">'+
       [['activos','Activos'],['todos','Todos'],['alertas','Para reponer'],['archivados','Archivados']].map(([v,n])=>
       '<option value="'+v+'" '+(state.filter===v?'selected':'')+'>'+n+'</option>').join('')+
      '</select></label></div>'+
      (state.q.trim().length>0&&state.q.trim().length<3?'<p class="note">Ingresá al menos 3 caracteres para buscar.</p>':'')+
      '<div class="gl-tienda-items" id="gl-tienda-list">'+productRows()+'</div>'+
      '<div class="gl-demo-section-title gl-catalog-pagination"><small>Página '+(state.page+1)+
      ' · 50 productos como máximo · Total del catálogo: '+Number(state.stats.total||0).toLocaleString('es-AR')+
      '</small><div class="gl-tienda-actions">'+
      '<button class="btn sm" type="button" data-gl-page="-1" '+(state.page===0||state.loadingPage?'disabled':'')+'>Anterior</button>'+
      '<button class="btn sm" type="button" data-gl-page="1" '+(!state.hasMore||state.loadingPage?'disabled':'')+'>Siguiente</button>'+
      '</div></div><p class="note">Las cantidades son de control interno. Archivar un producto no borra sus datos.</p></section>'+
      productForm();
  }
  function categories(){
    if(!state.categoriesLoaded)Promise.resolve().then(()=>loadCategories());
    return '<section class="card pad"><h3>Categorías de productos</h3>'+
      '<p class="lead">Agrupá el catálogo por categoría para localizar productos. Mostramos hasta 200 categorías por búsqueda; no cargamos todos los artículos.</p>'+
      '<div class="gl-demo-tools"><label>Buscar categoría<input id="gl-tienda-cat-search" type="search" maxlength="80" placeholder="Ej.: Indumentaria" value="'+esc(state.categoryQuery)+'"></label></div>'+
      (state.categories.length?state.categories.map(c=>'<article class="gl-demo-line"><div><b>'+esc(c.categoria)+'</b>'+
      '<small>'+Number(c.productos||0).toLocaleString('es-AR')+' productos · '+Number(c.alertas||0)+' para reponer</small></div>'+
      '<button class="btn sm" data-gl-open-category="'+esc(c.categoria)+'">Ver productos</button></article>').join(''):
      '<p class="lead">No hay categorías que coincidan.</p>')+'</section>';
  }
  function workspace(){
    return '<section class="card pad"><h3>Espacio de gestión privado</h3><p class="lead">Nombre: <b>'+esc(state.workspace.nombre)+'</b>. Este espacio no está publicado ni permite vender a clientes desde GestLok.</p>'+
      '<p class="note">Proveedores, conteos, hojas y pedidos del local están disponibles en el menú habitual. Los datos privados solo pueden verlos los usuarios autorizados de la empresa.</p></section>';
  }
  function view(){
    reset();
    if(!canView())return '<section class="card pad"><h3>Organización de productos</h3><p>La dueña debe seleccionar la modalidad online o mixta de la empresa.</p></section>';
    if(!state.loaded&&!state.loading)Promise.resolve().then(()=>load());
    if(!state.loaded||state.loading)return '<section class="card pad"><h3>Organización online</h3><p>Cargando datos internos de la sucursal…</p></section>';
    return '<div class="gl-commerce-page gl-online-admin">'+
      '<section class="card pad"><p class="eyebrow">GESTLOK / GESTIÓN INTERNA · '+esc(api.localNombre())+'</p><h3>Organización de productos</h3>'+
      '<p class="lead">Gestioná los productos, el stock mínimo y los pedidos que recibís por otras plataformas. Esta herramienta no publica una tienda ni vende a clientes.</p>'+
      (state.error?'<p class="note warn" role="alert">'+esc(state.error)+'</p><button class="btn" data-gl-refresh>Reintentar</button>':'')+
      '</section>'+
      (!state.workspace?
        '<section class="card pad"><h3>Empezar a organizar este local</h3><p class="lead">Se creará un espacio administrativo privado, vacío y exclusivo de esta empresa y sucursal. No se copiarán productos, ni se habilitarán ventas.</p>'+
        (isOwner()&&canEdit()?'<button class="btn primary" data-gl-create>Crear espacio de gestión privado</button>':'<p class="note">La dueña debe habilitar el espacio antes de cargar productos.</p>')+'</section>':
        '<nav class="gl-demo-nav" aria-label="Organización online">'+
        ['resumen','productos','categorias'].map(t=>'<button data-gl-tab="'+t+'" aria-current="'+(state.tab===t?'page':'false')+'">'+({resumen:'Resumen',productos:'Productos',categorias:'Categorías'}[t])+'</button>').join('')+'</nav>'+
        (state.tab==='resumen'?summary():state.tab==='productos'?products():categories())+workspace())+
      '</div>';
  }
  async function createWorkspace(){
    if(!canView()||!canEdit()||!isOwner()||state.workspace||state.saving)return;
    state.saving=true;
    try{
      const tenant=api.S.me.tenant_id,local=api.S.local;
      const slug='interno-'+String(tenant).replace(/-/g,'').slice(0,16)+'-'+String(local).toLowerCase().replace(/[^a-z0-9-]/g,'-').slice(0,16);
      const r=await client().from('gestlok_tiendas').insert({tenant_id:tenant,local_id:local,
        nombre:api.localNombre(),slug,visible:false,descripcion:'Gestión administrativa privada',whatsapp:'',permite_retiro:false,permite_envio:false}).select('id').single();
      if(r.error)throw r.error;
      api.toast('Espacio de organización creado.');await load(true);
    }catch(e){api.toast('No se pudo crear el espacio: '+err(e),true);}
    finally{state.saving=false;render();}
  }
  async function saveProduct(form){
    if(!canEdit()||!state.workspace||state.saving)return;
    const f=new FormData(form),get=n=>String(f.get(n)||'').trim();
    const stock=Number(get('stock')),minimo=Number(get('minimo')),precio=Number(get('precio'));
    const costo=get('costo')===''?null:Number(get('costo'));
    if(get('nombre').length<2||!get('categoria')||!get('unidad')||
      !Number.isInteger(stock)||stock<0||stock>100000000||
      !Number.isInteger(minimo)||minimo<0||minimo>100000000||
      !Number.isFinite(precio)||precio<0||precio>9999999999||
      (costo!==null&&(!Number.isFinite(costo)||costo<0||costo>9999999999))){
        api.toast('Revisá el nombre, stock, mínimo, precio y costo.',true);return;
      }
    const payload={nombre:get('nombre').slice(0,140),sku:get('sku').slice(0,80),
      categoria:get('categoria').slice(0,80),proveedor:get('proveedor').slice(0,120),
      stock,minimo,unidad:get('unidad').slice(0,30),ubicacion:get('ubicacion').slice(0,120),
      precio,costo,descripcion:get('descripcion').slice(0,1000),activo:f.has('activo'),
      publicado:false,destacado:false,imagen_url:'',precio_anterior:null,
      actualizado:new Date().toISOString()};
    state.saving=true;
    try{
      const sb=client(),tenant=api.S.me.tenant_id,id=state.editing;
      const r=id?await sb.from('gestlok_productos_tienda').update(payload).eq('id',id).eq('tienda_id',state.workspace.id).eq('tenant_id',tenant).select('id').single()
        :await sb.from('gestlok_productos_tienda').insert({...payload,tenant_id:tenant,tienda_id:state.workspace.id}).select('id').single();
      if(r.error)throw r.error;
      state.editing=null;state.editingProduct=null;
      api.toast('Producto guardado en el control interno.');
      resetPage();await Promise.all([loadPage(),loadStats(),loadAlerts()]);
    }catch(e){api.toast(e?.code==='23505'?'Ese SKU ya existe en este local.': 'No se guardó el producto: '+err(e),true);}
    finally{state.saving=false;render();}
  }
  async function archiveProduct(id,nextActive){
    if(!canEdit()||!state.workspace||state.saving)return;
    const p=state.items.find(x=>x.id===id);
    if(!p)return;
    if(!window.confirm(nextActive?'¿Restaurar este producto archivado?':
      '¿Archivar este producto? No se borra ni se modifica el stock de las otras hojas.'))return;
    state.saving=true;
    try{
      const r=await client().from('gestlok_productos_tienda').update({
        activo:nextActive,actualizado:new Date().toISOString()
      }).eq('id',id).eq('tienda_id',state.workspace.id)
        .eq('tenant_id',api.S.me.tenant_id).select('id').single();
      if(r.error)throw r.error;
      api.toast(nextActive?'Producto restaurado.':'Producto archivado sin borrar datos.');
      await Promise.all([loadStats(),loadPage(),loadAlerts()]);
    }catch(e){api.toast('No se pudo actualizar el producto: '+err(e),true);}
    finally{state.saving=false;render();}
  }

  document.addEventListener('submit',e=>{if(e.target.id==='gl-tienda-product-form'){e.preventDefault();saveProduct(e.target);}});
  let searchDebounce=null;
  const filteredReload=()=>{
    clearTimeout(searchDebounce);
    searchDebounce=setTimeout(()=>{
      if(state.q.trim().length===1||state.q.trim().length===2)return;
      resetPage();loadPage();
    },300);
  };
  document.addEventListener('click',e=>{
    const t=e.target.closest('[data-gl-tab],[data-gl-page],[data-gl-create],[data-gl-refresh],[data-gl-edit],[data-gl-archive],[data-gl-cancel],[data-gl-open-category],[data-gl-alerts]');
    if(!t)return;
    e.preventDefault();
    if(t.hasAttribute('data-gl-page')){
      if(state.loadingPage)return;
      const next=Number(t.dataset.glPage)||0;
      if(next===1){
        if(!state.hasMore||!state.items.length)return;
        const last=state.items[state.items.length-1];
        state.cursors[state.page+1]={nombre:last.nombre,id:last.id};
        state.page++;
      }else if(next===-1&&state.page>0){state.page--;}else return;
      loadPage();return;
    }
    if(t.hasAttribute('data-gl-create')){createWorkspace();return;}
    if(t.hasAttribute('data-gl-refresh')){state.loaded=false;load(true);return;}
    if(t.hasAttribute('data-gl-archive')){archiveProduct(t.dataset.glArchive,t.dataset.nextActive==='true');return;}
    if(t.hasAttribute('data-gl-edit')){
      state.editing=t.dataset.glEdit;
      state.editingProduct=state.items.find(p=>p.id===state.editing)||null;
      state.tab='productos';
    }
    if(t.hasAttribute('data-gl-cancel')){state.editing=null;state.editingProduct=null;}
    if(t.hasAttribute('data-gl-open-category')){
      state.category=t.dataset.glOpenCategory;
      state.tab='productos';resetPage();loadPage();
    }
    if(t.hasAttribute('data-gl-alerts')){
      state.tab='productos';state.filter='alertas';resetPage();loadPage();
    }
    if(t.dataset.glTab&&['resumen','productos','categorias'].includes(t.dataset.glTab)){
      state.tab=t.dataset.glTab;state.editing=null;state.editingProduct=null;
      if(t.dataset.glTab==='categorias')loadCategories();
    }
    render();
  });
  document.addEventListener('input',e=>{
    const input=e.target;
    if(input.id==='gl-tienda-search')state.q=input.value;
    else if(input.id==='gl-tienda-category')state.category=input.value;
    else if(input.id==='gl-tienda-supplier')state.supplier=input.value;
    else if(input.id==='gl-tienda-cat-search'){
      state.categoryQuery=input.value;state.categoriesLoaded=true;
      clearTimeout(searchDebounce);searchDebounce=setTimeout(loadCategories,350);return;
    }else return;
    filteredReload();
  });
  document.addEventListener('change',e=>{
    if(e.target.id!=='gl-tienda-filter')return;
    state.filter=e.target.value;resetPage();loadPage();
  });
  window.GestLokTienda=Object.freeze({attach(ctx){api=ctx;},view,reset(){state=empty(null);}});
})();

/* GestLok · organización INTERNA de tienda online por empresa y sucursal.
 * No muestra vidrieras ni permite comprar. Datos protegidos por RLS y tenant/local.
 * El stock de esta sección no modifica ni reemplaza las planillas existentes. */
(() => {
  'use strict';
  let api = null;
  const empty = local => ({local,loaded:false,loading:false,saving:false,workspace:null,items:[],editing:null,tab:'resumen',filter:'todos',q:'',error:''});
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
    if(!canView() || state.loading || (state.loaded&&!force))return;
    const local=state.local, tenant=api.S.me.tenant_id, sb=client();
    if(!sb){state.error='No se pudo iniciar el espacio de gestión.';state.loaded=true;return;}
    state.loading=true;state.error='';
    try{
      const a=await sb.from('gestlok_tiendas').select('*').eq('tenant_id',tenant).eq('local_id',local).maybeSingle();
      if(a.error)throw a.error;
      let products=[];
      if(a.data){
        const b=await sb.from('gestlok_productos_tienda').select('*').eq('tenant_id',tenant).eq('tienda_id',a.data.id).order('nombre');
        if(b.error)throw b.error;
        products=b.data||[];
      }
      if(local!==state.local)return;
      state.workspace=a.data||null;state.items=products;state.loaded=true;
    }catch(e){if(local===state.local){state.error=err(e);state.loaded=true;}}
    finally{if(local===state.local){state.loading=false;render();}}
  }
  function metrics(){
    const live=state.items.filter(p=>p.activo!==false), alert=live.filter(shortage);
    const categories=new Set(live.map(p=>p.categoria)), suppliers=new Set(live.map(p=>p.proveedor).filter(Boolean));
    const cards=[
      ['Productos registrados',live.length,'Control interno de este local'],
      ['Alertas de reposición',alert.length,'Stock en mínimo o menor'],
      ['Categorías',categories.size,'Organización del catálogo'],
      ['Proveedores asociados',suppliers.size,'Referencia por producto']
    ];
    return '<section class="gl-demo-metrics">'+cards.map(x=>'<article><small>'+x[0]+'</small><strong>'+x[1]+'</strong><span>'+x[2]+'</span></article>').join('')+'</section>';
  }
  function summary(){
    const items=low();
    return metrics() + '<div class="gl-demo-two"><section class="card pad"><div class="gl-demo-section-title"><h3>Faltantes para revisar</h3><button class="btn sm" data-gl-tab="productos">Ver productos</button></div>'+
    (items.length?items.map(p=>'<article class="gl-demo-line"><div><b>'+esc(p.nombre)+'</b><small>'+esc(p.sku||'Sin SKU')+' · Disponible '+esc(p.stock)+' · Mínimo '+esc(p.minimo)+'</small></div><span class="gl-demo-critical">Reponer</span></article>').join(''):'<p class="lead">Sin alertas de reposición.</p>')+
    '</section><section class="card pad"><h3>Operación de ventas externas</h3><p class="lead">Usá <b>Pedidos online</b> para registrar las órdenes que recibís por WhatsApp, Instagram, marketplace u otros canales.</p><button class="btn primary" data-go="pedidos-online">Gestionar pedidos</button><p class="note">GestLok registra y organiza pedidos; no les vende a tus clientes.</p></section></div>'+
    '<section class="card pad"><h3>Gestión unificada</h3><p class="lead">Productos, existencias, mínimos y proveedores por sucursal. Los conteos y el stock histórico anterior permanecen separados y disponibles.</p></section>';
  }
  function productRows(){
    const q=state.q.toLocaleLowerCase('es').trim();
    const rows=state.items.filter(p => (state.filter==='todos'||(state.filter==='alertas' && shortage(p))||(state.filter==='activos'&&p.activo!==false)) &&
      (!q||[p.nombre,p.sku,p.categoria,p.proveedor,p.ubicacion].join(' ').toLocaleLowerCase('es').includes(q)));
    return rows.length ? rows.map(p=>'<article class="gl-tienda-item">'+
      '<span class="gl-tienda-placeholder" aria-hidden="true">📦</span><div><b>'+esc(p.nombre)+'</b><small>'+esc(p.sku||'Sin SKU')+' · '+esc(p.categoria)+' · '+esc(p.proveedor||'Sin proveedor')+'</small>'+
      '<small>Stock: '+esc(p.stock)+' '+esc(p.unidad||'unidad')+' · Mínimo: '+esc(p.minimo??0)+' · Precio ref.: '+money(p.precio)+'</small>'+
      (p.activo===false?'<small>Archivado</small>':shortage(p)?'<small class="gl-demo-critical">Reposición pendiente</small>':'<small>En control</small>')+'</div>'+
      (canEdit()?'<div class="gl-tienda-actions"><button class="btn sm" data-gl-edit="'+esc(p.id)+'">Editar</button><button class="btn sm" data-gl-delete="'+esc(p.id)+'">Quitar</button></div>':'')+
      '</article>').join('') : '<p class="lead">No hay productos que coincidan.</p>';
  }
  function productForm(){
    if(!canEdit())return '';
    const p=state.items.find(x=>x.id===state.editing)||{};
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
    return '<section class="card pad"><h3>Productos y stock de control</h3><p class="lead">Organizá lo que administrás en tu negocio online, aunque vendas en una plataforma externa.</p>'+
      '<div class="gl-demo-tools"><label>Buscar<input id="gl-tienda-search" type="search" placeholder="Producto, SKU o proveedor" value="'+esc(state.q)+'"></label>'+
      '<label>Ver<select id="gl-tienda-filter"><option value="todos" '+(state.filter==='todos'?'selected':'')+'>Todos</option><option value="activos" '+(state.filter==='activos'?'selected':'')+'>Activos</option><option value="alertas" '+(state.filter==='alertas'?'selected':'')+'>Con alerta</option></select></label></div>'+
      '<div class="gl-tienda-items" id="gl-tienda-list">'+productRows()+'</div>'+
      '<p class="note">Este stock de control es independiente del stock de las planillas generales. Los cambios se guardan solo en la sucursal autorizada.</p></section>'+
      productForm();
  }
  function categories(){
    const cats=[...new Set(state.items.map(p=>p.categoria))].sort();
    return '<section class="card pad"><h3>Organización por categoría</h3>'+
      '<p class="lead">Totales y mínimos registrados para esta sucursal, sin publicar productos ni abrir un comercio público.</p>'+
      (cats.length?cats.map(cat=>{
        const rows=state.items.filter(p=>p.categoria===cat && p.activo!==false);
        return '<article class="gl-demo-line"><div><b>'+esc(cat)+'</b><small>'+rows.length+' productos · '+rows.filter(shortage).length+' con alerta</small></div><strong>'+rows.reduce((n,p)=>n+(Number(p.stock)||0),0)+' unidades</strong></article>';
      }).join(''):'<p class="lead">Agregá productos y categorías desde la sección Productos.</p>')+'</section>';
  }
  function workspace(){
    return '<section class="card pad"><h3>Espacio de gestión privado</h3><p class="lead">Nombre: <b>'+esc(state.workspace.nombre)+'</b>. Este espacio no está publicado ni permite vender a clientes desde GestLok.</p>'+
      '<p class="note">Proveedores, conteos, hojas y pedidos del local están disponibles en el menú habitual. Los datos privados solo pueden verlos los usuarios autorizados de la empresa.</p></section>';
  }
  function view(){
    reset();
    if(!canView())return '<section class="card pad"><h3>Organización de tienda online</h3><p>La dueña debe seleccionar la modalidad online o mixta de la empresa.</p></section>';
    if(!state.loaded&&!state.loading)Promise.resolve().then(()=>load());
    if(!state.loaded||state.loading)return '<section class="card pad"><h3>Organización online</h3><p>Cargando datos internos de la sucursal…</p></section>';
    return '<div class="gl-commerce-page gl-online-admin">'+
      '<section class="card pad"><p class="eyebrow">GESTLOK / GESTIÓN INTERNA · '+esc(api.localNombre())+'</p><h3>Organización de tienda online</h3>'+
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
      state.editing=null;api.toast('Producto guardado en el control interno.');await load(true);
    }catch(e){api.toast('No se guardó el producto: '+err(e),true);}
    finally{state.saving=false;render();}
  }
  async function removeProduct(id){
    if(!canEdit()||!state.workspace||state.saving||!state.items.some(p=>p.id===id))return;
    if(!window.confirm('¿Quitar este producto de la organización online? No modifica las planillas generales.'))return;
    state.saving=true;
    try{
      const r=await client().from('gestlok_productos_tienda').delete().eq('id',id).eq('tienda_id',state.workspace.id).eq('tenant_id',api.S.me.tenant_id);
      if(r.error)throw r.error;api.toast('Producto quitado del control online.');await load(true);
    }catch(e){api.toast('No se pudo quitar: '+err(e),true);}
    finally{state.saving=false;render();}
  }
  document.addEventListener('submit',e=>{if(e.target.id==='gl-tienda-product-form'){e.preventDefault();saveProduct(e.target);}});
  document.addEventListener('click',e=>{
    const t=e.target.closest('[data-gl-tab],[data-gl-create],[data-gl-refresh],[data-gl-edit],[data-gl-delete],[data-gl-cancel]');
    if(!t)return;
    e.preventDefault();
    if(t.hasAttribute('data-gl-create')){createWorkspace();return;}
    if(t.hasAttribute('data-gl-refresh')){state.loaded=false;load(true);return;}
    if(t.hasAttribute('data-gl-delete')){removeProduct(t.dataset.glDelete);return;}
    if(t.hasAttribute('data-gl-edit')){state.editing=t.dataset.glEdit;state.tab='productos';}
    if(t.hasAttribute('data-gl-cancel'))state.editing=null;
    if(t.dataset.glTab&&['resumen','productos','categorias'].includes(t.dataset.glTab)){state.tab=t.dataset.glTab;state.editing=null;}
    render();
  });
  document.addEventListener('input',e=>{
    if(e.target.id!=='gl-tienda-search')return;
    state.q=e.target.value;
    const list=document.getElementById('gl-tienda-list');
    if(list)list.innerHTML=productRows();
  });
  document.addEventListener('change',e=>{
    if(e.target.id!=='gl-tienda-filter')return;
    state.filter=e.target.value;render();
  });
  window.GestLokTienda=Object.freeze({attach(ctx){api=ctx;},view,reset(){state=empty(null);}});
})();

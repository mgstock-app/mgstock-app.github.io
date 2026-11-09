/* ZAYRO · administración privada de la microapp Tienda Online.
 * Afecta únicamente el tenant de Camila. La seguridad real reside en RPC/RLS.
 * Nunca habilita ventas o productos por el hecho de abrir este panel. */
(() => {
  'use strict';
  if(window.GestLokZayroAdmin)return;
  const TENANT='2a97bf8d-7d08-4aa7-b051-5d1a4dc80103';
  const UID='8ddf2c6c-8d62-44de-8ce8-27eb5759daa3';
  const EMAIL='camilab.lopez99@gmail.com';
  let host=null,open=false,preview=false,loading=false,saving=false,info=null,error='',notice='';
  const $=s=>document.querySelector(s);
  const db=()=>window.GestLokSupabase;
  const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','"':'&quot;'}[c]));
  const money=n=>n==null?'Sin precio':new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS'}).format(Number(n));
  function allowed(){
    return !!(host?.S?.me?.tenant_id===TENANT &&
      String(host?.S?.me?.email||'').toLowerCase()===EMAIL &&
      host?.role?.()==='dueno');
  }
  function homeTile(api){
    host=api;
    if(!allowed())return '';
    return '<section class="gl-zayro-entry" aria-label="Tienda Online ZAYRO">'+
      '<div class="gl-zayro-entry-copy"><small>MICROAPP EXCLUSIVA</small><h2>Tienda Online · ZAYRO</h2>'+
      '<p>Elegí qué productos publicar, cargá sus fotos y configurá el WhatsApp de ventas. La tienda nace desactivada.</p></div>'+
      '<div class="gl-zayro-entry-buttons"><button type="button" data-zayro-open>Administrar tienda</button>'+
      '<a href="/zayro/" target="_blank" rel="noopener noreferrer">Ver página pública ↗</a>'+
      '<a href="/zayro/?diseno=1" target="_blank" rel="noopener noreferrer" data-zayro-design>✎ Diseñar mi tienda</a></div></section>';
  }
  async function verify(){
    if(!allowed()||!db())throw Error('La tienda pertenece únicamente a la cuenta de Camila.');
    const {data,error:e}=await db().auth.getUser();
    if(e||data?.user?.id!==UID || String(data?.user?.email||'').toLowerCase()!==EMAIL)
      throw Error('La sesión no está autorizada para administrar ZAYRO.');
  }
  function style(){
    if($('#gl-zayro-admin-style'))return;
    const l=document.createElement('link');l.id='gl-zayro-admin-style';l.rel='stylesheet';
    l.href='/stock/gestlok-zayro-admin.css';document.head.append(l);
  }
  function ensureRoot(){
    let el=$('#gl-zayro-admin-root');
    if(!el){el=document.createElement('div');el.id='gl-zayro-admin-root';document.body.append(el);}
    return el;
  }
  function render(){
    const root=ensureRoot();
    root.hidden=!open;
    if(!open){root.innerHTML='';return;}
    const products=Array.isArray(info?.products)?info.products:[];
    const publicProducts=products.filter(p=>p.published===true&&p.active===true&&
      Number(p.stock)>0&&Number(p.price)>0);
    const validImage=url=>/^https:\/\/[^ "'<>]+$/i.test(String(url||''));
    const opts=[['mujer','Perfumes mujer'],['hombre','Perfumes hombre'],['unisex','Perfumes unisex'],['capilar','Cuidado capilar']];
    root.innerHTML='<div class="gl-zayro-admin-overlay" data-zayro-close-background>'+
      '<section class="gl-zayro-admin" role="dialog" aria-modal="true" aria-labelledby="gl-zayro-title">'+
      '<header><div><small>GESTLOK · CUENTA DE CAMILA</small><h2 id="gl-zayro-title">Tienda Online · ZAYRO</h2>'+
      '<p>Administración privada de publicaciones. Los compradores solo verán productos autorizados.</p></div>'+
      '<button type="button" data-zayro-close aria-label="Cerrar panel">×</button></header>'+
      (error?'<p class="gl-zayro-error" role="alert">'+escape(error)+'</p>':'')+
      (notice?'<p class="gl-zayro-notice" role="status">'+escape(notice)+'</p>':'')+
      (loading?'<p class="gl-zayro-loading">Cargando productos reales de tu Plan Scanner…</p>':
      !info?'<button type="button" data-zayro-retry>Volver a intentar</button>':
      '<form class="gl-zayro-config" data-zayro-settings>'+
        '<h3>Configuración de la tienda pública</h3>'+
        '<p>Dirección de la tienda: <a href="/zayro/" target="_blank" rel="noopener noreferrer">gestlok.com.ar/zayro</a> · <a href="/zayro/?diseno=1" target="_blank" rel="noopener noreferrer" data-zayro-design>✎ Diseñar la tienda</a></p>'+
        '<label>WhatsApp de ventas <input name="telefono" type="tel" placeholder="+54 11 1234-5678" value="'+escape(info.sales_whatsapp||'')+'"></label>'+
        '<label class="gl-zayro-toggle"><input name="habilitada" type="checkbox" '+(info.enabled?'checked':'')+'> Habilitar tienda pública</label>'+
        '<p class="gl-zayro-help">Al habilitar, se mostrarán solamente los productos publicados con precio y stock positivo. Los pedidos se consultan por WhatsApp; no se cobra ni reserva inventario automáticamente.</p>'+
        '<button type="submit" '+(saving?'disabled':'')+'>Guardar configuración</button>'+
      '</form>'+
      '<section class="gl-zayro-private-preview" aria-label="Vista previa de la tienda ZAYRO">'+
        '<div class="gl-zayro-preview-head"><div><h3>Vista previa privada</h3>'+
        '<p>Así se verán tus productos publicados, aunque la tienda todavía esté desactivada. Solo vos podés ver esta vista.</p></div>'+
        '<button type="button" data-zayro-preview-toggle aria-expanded="'+(preview?'true':'false')+'">'+
        (preview?'Cerrar vista previa':'Ver cómo queda mi tienda')+'</button></div>'+
        (preview?'<div class="gl-zayro-preview-window"><div class="gl-zayro-preview-brand">✧ ZAYRO <small>VISTA PREVIA · NO PÚBLICA</small></div>'+
          (publicProducts.length?
            '<div class="gl-zayro-preview-grid">'+publicProducts.map(p=>
              '<article class="gl-zayro-preview-product"><div class="gl-zayro-preview-image">'+
              (validImage(p.image_url)?'<img loading="lazy" referrerpolicy="no-referrer" alt="'+escape(p.name)+'" src="'+escape(p.image_url)+'">':
                '<span aria-hidden="true">✧</span>')+'</div><div class="gl-zayro-preview-content">'+
              '<small>'+escape(p.audience||'unisex')+'</small><strong>'+escape(p.name)+'</strong>'+
              '<b>'+escape(money(p.price))+'</b></div></article>'
            ).join('')+'</div>':
            '<p class="gl-zayro-preview-empty">Todavía no hay productos marcados como publicados con precio y stock. Marcá uno y guardalo para verlo acá.</p>')+
          '</div>':'')+
      '</section>'+
      '<section class="gl-zayro-products"><h3>Publicar productos</h3>'+
      '<p>El nombre, precio y stock vienen de tu Plan Scanner. Las fotos, categorías y publicaciones se administran acá.</p>'+
      (!products.length?'<p>No hay productos cargados en tu cuenta.</p>':products.map(p=>
      '<form data-zayro-product="'+escape(p.id)+'" class="gl-zayro-product-form">'+
        '<div class="gl-zayro-product-head"><div><strong>'+escape(p.name)+'</strong>'+
        '<small>'+escape(money(p.price))+' · Stock '+escape(p.stock??'Sin cantidad')+'</small></div>'+
        '<label><input type="checkbox" name="publicado" '+(p.published?'checked':'')+'> Publicado</label></div>'+
        '<div class="gl-zayro-product-fields"><label>Categoría<select name="audience">'+
          opts.map(([key,label])=>'<option value="'+key+'" '+(p.audience===key?'selected':'')+'>'+label+'</option>').join('')+
        '</select></label>'+
        '<label>URL de foto (HTTPS)<input name="image_url" type="url" maxlength="650" placeholder="https://…" value="'+escape(p.image_url||'')+'"></label></div>'+
        '<label>Descripción pública<textarea name="descripcion" maxlength="700" rows="2">'+escape(p.description||'')+'</textarea></label>'+
        '<button type="submit" '+(saving?'disabled':'')+'>Guardar producto</button>'+
      '</form>').join(''))+'</section>')+
      '</section></div>';
  }
  async function load(){
    if(loading)return;
    loading=true;error='';notice='';render();
    try{
      await verify();
      const r=await db().rpc('gestlok_zayro_admin_catalog');
      if(r.error)throw r.error;
      if(!r.data||!Array.isArray(r.data.products))throw Error('No se pudo leer el catálogo');
      info=r.data;
    }catch(e){error=String(e?.message||'No pudimos cargar los productos.').slice(0,200);}
    finally{loading=false;render();}
  }
  async function start(){
    if(!allowed())return;
    style();open=true;render();await load();
  }
  function close(){open=false;preview=false;error='';notice='';render();}
  async function saveSettings(form){
    if(saving)return;saving=true;error='';notice='';render();
    try{
      await verify();
      const values=new FormData(form);
      const enabled=values.get('habilitada')==='on';
      const phone=String(values.get('telefono')||'').trim();
      const r=await db().rpc('gestlok_zayro_admin_settings',{p_enabled:enabled,p_phone:phone});
      if(r.error)throw r.error;
      notice='Configuración guardada. '+(enabled?'La tienda quedó habilitada.':'La tienda permanece desactivada.');
      const d=await db().rpc('gestlok_zayro_admin_catalog');if(d.error)throw d.error;info=d.data;
    }catch(e){error=String(e?.message||'No se pudo guardar la configuración.').slice(0,200);}
    finally{saving=false;render();}
  }
  async function saveProduct(form,id){
    if(saving)return;saving=true;error='';notice='';
    const values=new FormData(form);
    try{
      await verify();
      const r=await db().rpc('gestlok_zayro_admin_product',{
        p_product:id,
        p_published:values.get('publicado')==='on',
        p_audience:String(values.get('audience')||'unisex'),
        p_image:String(values.get('image_url')||'').trim(),
        p_description:String(values.get('descripcion')||'').trim()
      });
      if(r.error)throw r.error;
      notice='Producto actualizado. El catálogo público muestra únicamente las publicaciones habilitadas.';
      const d=await db().rpc('gestlok_zayro_admin_catalog');if(d.error)throw d.error;info=d.data;
    }catch(e){error=String(e?.message||'No se pudo guardar el producto.').slice(0,200);}
    finally{saving=false;render();}
  }
  document.addEventListener('click',e=>{
    const t=e.target.closest?.('[data-zayro-open],[data-zayro-close],[data-zayro-retry],[data-zayro-preview-toggle],[data-zayro-close-background]');
    if(!t)return;
    if(t.matches('[data-zayro-open]')){e.preventDefault();start();}
    else if(t.matches('[data-zayro-close]')){e.preventDefault();close();}
    else if(t.matches('[data-zayro-retry]')){e.preventDefault();load();}
    else if(t.matches('[data-zayro-preview-toggle]')){e.preventDefault();preview=!preview;render();}
    else if(e.target===t){close();}
  });
  document.addEventListener('submit',e=>{
    if(e.target.matches?.('[data-zayro-settings]')){
      e.preventDefault();saveSettings(e.target);
    }else if(e.target.matches?.('[data-zayro-product]')){
      e.preventDefault();saveProduct(e.target,e.target.dataset.zayroProduct);
    }
  },true);
  window.GestLokZayroAdmin=Object.freeze({homeTile});
})();
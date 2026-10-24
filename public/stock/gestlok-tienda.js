/* GestLok · administración de la vidriera pública por sucursal.
 * Catálogo comercial separado del inventario histórico; RLS obligatorio en Supabase.
 * Los pedidos de visitantes se envían voluntariamente por WhatsApp, sin cobros ni débitos de stock. */
(() => {
  'use strict';
  let api = null;
  let state = {local:null, loaded:false, loading:false, saving:false, store:null, items:[], editing:null, error:''};
  const $ = s => document.querySelector(s);
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const client = () => window.GestLokSupabase;
  const authorized = () => api && api.S.me && api.S.me.tenant_id && api.S.local && window.GestLokCommerce?.online();
  const owner = () => api && ['creadora','dueno'].includes(api.miRol());
  const editable = () => api && api.canW() && !api.S.offline && !!client();
  const fmt = n => new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS'}).format(Number(n)||0);
  const link = slug => location.origin + '/tienda.html?slug=' + encodeURIComponent(slug);
  const errMessage = e => String(e?.message || 'No se pudo completar la operación.').slice(0,220);
  function reset() {
    const loc = api?.S?.local || null;
    if (state.local !== loc) state = {local:loc, loaded:false, loading:false, saving:false, store:null, items:[], editing:null, error:''};
  }
  async function load(force) {
    reset();
    if (!authorized() || state.loading || (state.loaded && !force)) return;
    const local = state.local, tenant = api.S.me.tenant_id, sb = client();
    if (!sb) { state.error = 'No se pudo iniciar el catálogo comercial.'; state.loaded = true; return; }
    state.loading = true; state.error = '';
    try {
      const a = await sb.from('gestlok_tiendas').select('*').eq('tenant_id',tenant).eq('local_id',local).maybeSingle();
      if (a.error) throw a.error;
      const store = a.data || null;
      let items = [];
      if (store) {
        const b = await sb.from('gestlok_productos_tienda').select('*').eq('tenant_id',tenant).eq('tienda_id',store.id).order('nombre');
        if (b.error) throw b.error;
        items = b.data || [];
      }
      if (state.local !== local) return;
      state.store = store; state.items = items; state.loaded = true;
    } catch(e) { if (state.local === local) {state.error = errMessage(e); state.loaded = true;} }
    finally { if(state.local===local){state.loading=false;if(api.S.view==='tienda-online')api.render();} }
  }
  function settingsForm() {
    const t = state.store || {}, locked = !owner() || !editable() || state.saving;
    return '<form id="gl-tienda-settings" class="card pad gl-commerce-order-form">' +
      '<h3>' + (t.id ? 'Configuración de tu tienda' : 'Prepará tu tienda online') + '</h3>' +
      '<p class="lead">La dueña controla la publicación. Nada se publica automáticamente y cada sucursal tiene su vidriera.</p>' +
      '<fieldset class="gl-tienda-fieldset" ' + (locked ? 'disabled' : '') + '><div class="gl-commerce-fields">' +
      '<label>Nombre público de tienda<input name="nombre" required maxlength="100" minlength="2" value="' + esc(t.nombre || api.localNombre()) + '"></label>' +
      '<label>Enlace único (sin espacios)<input name="slug" required pattern="[a-z0-9][a-z0-9-]{2,55}" maxlength="56" value="' + esc(t.slug || '') + '" placeholder="mi-comercio-centro"></label>' +
      '<label>WhatsApp de pedidos (código país sin +)<input name="whatsapp" inputmode="numeric" pattern="[1-9][0-9]{7,14}" value="' + esc(t.whatsapp || '') + '" placeholder="54911XXXXXXXX"></label>' +
      '<label>Dirección para retiros<input name="direccion" maxlength="240" value="' + esc(t.direccion || '') + '"></label>' +
      '<label class="gl-commerce-wide">Presentación<textarea name="descripcion" rows="2" maxlength="800">' + esc(t.descripcion || '') + '</textarea></label>' +
      '</div><div class="gl-tienda-toggles">' +
      '<label><input name="permite_retiro" type="checkbox" ' + (t.permite_retiro !== false ? 'checked' : '') + '> Retiro en local</label>' +
      '<label><input name="permite_envio" type="checkbox" ' + (t.permite_envio ? 'checked' : '') + '> Envío a coordinar</label>' +
      '<label><input name="visible" type="checkbox" ' + (t.visible ? 'checked' : '') + '> Publicar mi tienda</label>' +
      '</div><button class="btn primary" type="submit">Guardar tienda</button></fieldset>' +
      (!owner() ? '<p class="note">Solo la dueña o creadora puede cambiar estos datos.</p>' : '') + '</form>';
  }
  function productForm() {
    if (!editable() || !state.store) return '';
    const p = state.items.find(x => x.id === state.editing) || {};
    return '<form id="gl-tienda-product-form" class="card pad gl-commerce-order-form">' +
      '<h3>' + (p.id ? 'Editar producto' : 'Agregar producto al catálogo') + '</h3>' +
      '<div class="gl-commerce-fields">' +
      '<label>Nombre<input name="nombre" maxlength="140" required value="' + esc(p.nombre || '') + '"></label>' +
      '<label>Categoría<input name="categoria" maxlength="80" required value="' + esc(p.categoria || 'General') + '"></label>' +
      '<label>Precio (ARS)<input name="precio" type="number" step="0.01" min="0" max="9999999999" required value="' + esc(p.precio ?? '') + '"></label>' +
      '<label>Precio anterior (oferta)<input name="precio_anterior" type="number" step="0.01" min="0" value="' + esc(p.precio_anterior ?? '') + '"></label>' +
      '<label>Unidades disponibles para venta online<input name="stock" type="number" min="0" max="100000000" step="1" required value="' + esc(p.stock ?? 0) + '"></label>' +
      '<label>Código / SKU<input name="sku" maxlength="80" value="' + esc(p.sku || '') + '"></label>' +
      '<label class="gl-commerce-wide">Imagen (URL HTTPS)<input name="imagen_url" type="url" maxlength="600" pattern="https://.*" value="' + esc(p.imagen_url || '') + '" placeholder="https://..."></label>' +
      '<label class="gl-commerce-wide">Descripción<textarea name="descripcion" rows="2" maxlength="1000">' + esc(p.descripcion || '') + '</textarea></label>' +
      '</div><div class="gl-tienda-toggles">' +
      '<label><input name="publicado" type="checkbox" ' + (p.publicado ? 'checked' : '') + '> Mostrar este producto</label>' +
      '<label><input name="destacado" type="checkbox" ' + (p.destacado ? 'checked' : '') + '> Destacado</label>' +
      '</div><div class="gl-tienda-actions"><button class="btn primary" type="submit" ' + (state.saving ? 'disabled' : '') + '>Guardar producto</button>' +
      (p.id ? '<button type="button" class="btn" data-gl-cancel>Cancelar edición</button>' : '') + '</div></form>';
  }
  function productsList() {
    const list = state.items;
    return '<section class="card pad"><h3>Catálogo de la sucursal</h3>' +
      '<p class="lead">' + list.length + ' productos · ' + list.filter(p => p.publicado).length + ' visibles al publicar la tienda.</p>' +
      (!list.length ? '<p class="note">Todavía no se cargaron productos. Empezá con el formulario anterior.</p>' :
      '<div class="gl-tienda-items">' + list.map(p =>
      '<article class="gl-tienda-item">' +
      (p.imagen_url ? '<img src="' + esc(p.imagen_url) + '" alt="" loading="lazy" referrerpolicy="no-referrer">' : '<span class="gl-tienda-placeholder" aria-hidden="true">🛍️</span>') +
      '<div><b>' + esc(p.nombre) + '</b><small>' + esc(p.categoria) + ' · SKU ' + esc(p.sku || '—') + '</small>' +
      '<small>' + fmt(p.precio) + ' · ' + esc(p.stock) + ' unidades · ' + (p.publicado ? 'En catálogo' : 'Oculto') + '</small></div>' +
      (editable() ? '<div class="gl-tienda-actions"><button type="button" class="btn sm" data-gl-edit="' + esc(p.id) + '">Editar</button><button type="button" class="btn sm" data-gl-delete="' + esc(p.id) + '">Quitar</button></div>' : '') +
      '</article>').join('') + '</div>') +
      '<p class="note">El stock comercial de este catálogo es independiente del inventario físico. Al recibir ventas por WhatsApp registrá manualmente sus movimientos para mantener ambos actualizados.</p>' +
      '</section>';
  }
  function view() {
    reset();
    if (!authorized()) return '<section class="card pad"><h3>Tienda online</h3><p>Disponible cuando la dueña elige Tienda online o Tienda mixta.</p></section>';
    if (!state.loaded && !state.loading) Promise.resolve().then(() => load(false));
    if (state.loading || !state.loaded) return '<section class="card pad"><h3>Tienda online</h3><p>Cargando configuración y catálogo...</p></section>';
    return '<div class="gl-commerce-page">' +
      '<section class="card pad"><p class="eyebrow">GestLok · ' + esc(api.localNombre()) + '</p><h3>Tu tienda online</h3>' +
      '<p class="lead">Catálogo, precios, ofertas, disponibilidad, WhatsApp y retiros o envíos. Solo la dueña puede activar la vidriera pública.</p>' +
      (state.error ? '<p class="note warn" role="alert">' + esc(state.error) + '</p><button class="btn" data-gl-refresh>Reintentar</button>' : '') +
      (state.store ? '<div class="gl-tienda-status"><span>' + (state.store.visible ? '🟢 Publicación solicitada' : '⚪ Borrador privado') + '</span><a href="' + esc(link(state.store.slug)) + '" target="_blank" rel="noopener noreferrer">Ver vidriera ' + esc(state.store.slug) + ' ↗</a></div>' : '') +
      '<p class="note">La tienda pública solo es visible si la dueña la publica y la empresa está en modalidad online o mixta. Pedidos por WhatsApp, sin pagos automáticos.</p></section>' +
      settingsForm() + (state.store ? productForm() + productsList() : '') + '</div>';
  }
  async function saveStore(form) {
    if (!owner() || !editable() || state.saving || !authorized()) return;
    const f=new FormData(form), tenant=api.S.me.tenant_id, local=api.S.local;
    const get=n=>String(f.get(n)||'').trim();
    const slug=get('slug').toLowerCase(), phone=get('whatsapp');
    const retiro=f.has('permite_retiro'), envio=f.has('permite_envio'), visible=f.has('visible');
    if (!/^[a-z0-9][a-z0-9-]{2,55}$/.test(slug) || get('nombre').length<2 ||
        (!retiro&&!envio) || (phone && !/^[1-9][0-9]{7,14}$/.test(phone)) || (visible&&!phone)) {
      api.toast('Revisá el enlace, las formas de entrega y el WhatsApp para publicar.',true); return;
    }
    const payload={nombre:get('nombre').slice(0,100),slug,whatsapp:phone,
      direccion:get('direccion').slice(0,240),descripcion:get('descripcion').slice(0,800),
      permite_retiro:retiro,permite_envio:envio,visible,actualizado:new Date().toISOString()};
    state.saving=true;
    try {
      let r;
      if(state.store) r=await client().from('gestlok_tiendas').update(payload).eq('id',state.store.id).eq('tenant_id',tenant).eq('local_id',local).select('id').single();
      else r=await client().from('gestlok_tiendas').insert({...payload,tenant_id:tenant,local_id:local}).select('id').single();
      if(r.error) throw r.error;
      api.toast('Configuración comercial guardada.'); await load(true);
    } catch(e){api.toast('No se guardó la tienda: ' + errMessage(e),true);}
    finally{state.saving=false;if(api.S.view==='tienda-online')api.render();}
  }
  async function saveProduct(form) {
    if(!editable() || !authorized() || !state.store || state.saving)return;
    const f=new FormData(form),get=n=>String(f.get(n)||'').trim();
    const price=Number(get('precio')),prev=get('precio_anterior')===''?null:Number(get('precio_anterior'));
    const stock=Number(get('stock')),img=get('imagen_url');
    if(get('nombre').length<2 || !Number.isFinite(price) || price<0 || !Number.isInteger(stock) ||
       stock<0 || (prev!==null && (!Number.isFinite(prev)||prev<=price)) ||
       (img && (!/^https:\/\/[^\s]+$/i.test(img)||img.length>600))) {
      api.toast('Revisá nombre, precios, stock e imagen HTTPS.',true);return;
    }
    const payload={nombre:get('nombre').slice(0,140),categoria:get('categoria').slice(0,80)||'General',
      descripcion:get('descripcion').slice(0,1000),sku:get('sku').slice(0,80),
      precio:price,precio_anterior:prev,stock,imagen_url:img,publicado:f.has('publicado'),
      destacado:f.has('destacado'),actualizado:new Date().toISOString()};
    state.saving=true;
    try{
      const sb=client(),id=state.editing,tenant=api.S.me.tenant_id;
      const r=id ? await sb.from('gestlok_productos_tienda').update(payload).eq('id',id).eq('tienda_id',state.store.id).eq('tenant_id',tenant).select('id').single()
        : await sb.from('gestlok_productos_tienda').insert({...payload,tenant_id:tenant,tienda_id:state.store.id}).select('id').single();
      if(r.error)throw r.error;
      state.editing=null;api.toast('Producto guardado.');await load(true);
    }catch(e){api.toast('No se guardó el producto: '+errMessage(e),true);}
    finally{state.saving=false;if(api.S.view==='tienda-online')api.render();}
  }
  async function removeProduct(id) {
    if(!editable() || !state.store || !state.items.some(p=>p.id===id) || state.saving)return;
    if(!window.confirm('¿Quitar este producto de la vidriera? No se elimina ningún registro de stock.'))return;
    state.saving=true;
    try{
      const r=await client().from('gestlok_productos_tienda').delete().eq('id',id).eq('tienda_id',state.store.id).eq('tenant_id',api.S.me.tenant_id);
      if(r.error)throw r.error;api.toast('Producto quitado del catálogo.');await load(true);
    }catch(e){api.toast('No se pudo quitar: '+errMessage(e),true);}
    finally{state.saving=false;if(api.S.view==='tienda-online')api.render();}
  }
  document.addEventListener('submit',e=>{
    if(e.target.id==='gl-tienda-settings'){e.preventDefault();saveStore(e.target);}
    if(e.target.id==='gl-tienda-product-form'){e.preventDefault();saveProduct(e.target);}
  });
  document.addEventListener('click',e=>{
    const b=e.target.closest('[data-gl-edit],[data-gl-delete],[data-gl-cancel],[data-gl-refresh]');
    if(!b)return;
    e.preventDefault();
    if(b.hasAttribute('data-gl-refresh')){state.loaded=false;load(true);return;}
    if(b.hasAttribute('data-gl-cancel'))state.editing=null;
    if(b.hasAttribute('data-gl-edit'))state.editing=b.dataset.glEdit;
    if(b.hasAttribute('data-gl-delete')){removeProduct(b.dataset.glDelete);return;}
    api?.render();
  });
  window.GestLokTienda=Object.freeze({
    attach(ctx){api=ctx;},
    view,
    reset(){state.local=null;reset();},
    link,
  });
})();
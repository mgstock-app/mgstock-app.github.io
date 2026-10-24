/* GestLok · catálogo público en modo lectura. Ninguna operación escribe en Supabase.
 * Los pedidos se comparten a WhatsApp por elección explícita del comprador. */
(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = value => new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS'}).format(Number(value)||0);
  const slug = new URLSearchParams(location.search).get('slug') || '';
  const basket = new Map();
  let store = null, products = [];
  const uuid = v => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
  const btn = $('#open-cart'), dialog = $('#cart');
  function unavailable(text){
    $('#shop-title').textContent = 'Tienda no disponible';
    $('#shop-description').textContent = text || 'Este comercio no tiene una tienda pública habilitada.';
    $('#shop-address').textContent = '';
    $('#shop-content').hidden = true;
    btn.disabled = true;
  }
  function renderCatalog(){
    const query = $('#search').value.toLocaleLowerCase('es-AR').trim();
    const category = $('#category').value, sort = $('#sort').value;
    const list = products.filter(p => (!category || p.categoria===category) && (!query || (p.nombre+' '+p.descripcion+' '+p.categoria).toLocaleLowerCase('es-AR').includes(query)));
    list.sort((a,b) => sort==='precio' ? a.precio-b.precio : sort==='precio-desc' ? b.precio-a.precio : (b.destacado === true)-(a.destacado === true) || a.nombre.localeCompare(b.nombre,'es'));
    $('#catalog').innerHTML = list.length ? list.map(p =>
      '<article class="product">' +
      (p.imagen_url ? '<img src="'+esc(p.imagen_url)+'" alt="'+esc(p.nombre)+'" loading="lazy" referrerpolicy="no-referrer">' : '<span class="placeholder" aria-hidden="true">🛍️</span>') +
      '<div class="body"><span class="category">'+esc(p.categoria)+(p.destacado ? ' · Destacado' : '')+'</span>' +
      '<h3>'+esc(p.nombre)+'</h3><div><strong class="price">'+money(p.precio)+'</strong>' +
      (p.precio_anterior!=null ? ' <small class="old">'+money(p.precio_anterior)+'</small>' : '')+'</div>' +
      '<p class="description">'+esc(p.descripcion || '')+'</p>' +
      '<span class="stock">'+(p.stock>0 ? 'Disponibles: '+Number(p.stock) : 'Agotado')+'</span>' +
      '<button type="button" class="btn" data-add="'+esc(p.id)+'" '+(p.stock<1?'disabled':'')+'>Agregar al carrito</button></div></article>'
    ).join('') : '<p class="empty">No hay productos que coincidan con tu búsqueda.</p>';
  }
  function count(){let n=0;for(const q of basket.values())n+=q;return n;}
  function cartTotal(){let n=0;for(const [id,qty] of basket){const p=products.find(x=>x.id===id);if(p)n+=Number(p.precio)*qty;}return n;}
  function renderCart(){
    $('#cart-count').textContent=String(count());
    const content=[];
    for(const [id,qty] of basket){
      const p=products.find(x=>x.id===id);if(!p)continue;
      content.push('<div class="cartrow"><div><b>'+esc(p.nombre)+'</b><small style="display:block">'+money(p.precio*qty)+'</small></div>'+
      '<div class="qty"><button type="button" data-minus="'+esc(id)+'" aria-label="Quitar una unidad de '+esc(p.nombre)+'">−</button><span>'+qty+'</span><button type="button" data-plus="'+esc(id)+'" '+(qty>=p.stock?'disabled':'')+' aria-label="Agregar una unidad de '+esc(p.nombre)+'">+</button></div></div>');
    }
    $('#cart-items').innerHTML=content.length?content.join(''):'<p class="empty">Tu carrito está vacío.</p>';
    $('#cart-total').textContent=money(cartTotal());
    $('#checkout').hidden=!count();
  }
  function modify(id,delta){
    const p=products.find(x=>x.id===id);
    if(!p)return;
    const next=Math.max(0,Math.min(p.stock,(basket.get(id)||0)+delta));
    if(next)basket.set(id,next);else basket.delete(id);
    renderCart();
  }
  function renderDelivery(){
    const opts=[];
    if(store.permite_retiro)opts.push('<option value="retiro">Retiro en local</option>');
    if(store.permite_envio)opts.push('<option value="envio">Envío a coordinar</option>');
    $('#delivery').innerHTML=opts.join('');
    refreshDelivery();
  }
  function refreshDelivery(){
    const sending=$('#delivery').value==='envio';
    $('#address-label').hidden=!sending;
    $('#address-label input').required=sending;
  }
  function checkout(e){
    e.preventDefault();
    if(!store || !count() || !store.whatsapp || !/^[1-9][0-9]{7,14}$/.test(store.whatsapp))return;
    const form=new FormData(e.target),name=String(form.get('nombre')||'').trim().slice(0,100);
    const method=String(form.get('entrega')||'');
    const address=String(form.get('direccion')||'').trim().slice(0,240);
    const note=String(form.get('nota')||'').trim().slice(0,350);
    if(!name || !['retiro','envio'].includes(method) || (method==='envio' && !address) ||
       (method==='retiro' && !store.permite_retiro) || (method==='envio' && !store.permite_envio))return;
    const lines=['Hola, quisiera consultar por este pedido en '+store.nombre+':',''];
    for(const [id,qty] of basket){const p=products.find(x=>x.id===id);if(p)lines.push('• '+qty+' × '+p.nombre+' — '+money(p.precio*qty));}
    lines.push('','Total estimado: '+money(cartTotal()),'Cliente: '+name,
      'Entrega: '+(method==='retiro'?'Retiro en local':'Envío a coordinar'));
    if(method==='envio')lines.push('Dirección: '+address);
    if(note)lines.push('Observaciones: '+note);
    lines.push('','Pedido sujeto a confirmación de stock, entrega y precio por el comercio. Sin pago realizado.');
    const url='https://wa.me/'+store.whatsapp+'?text='+encodeURIComponent(lines.join('\n'));
    // Nunca se realiza un envío silencioso: WhatsApp abre el mensaje listo para revisar.
    window.open(url,'_blank','noopener,noreferrer');
  }
  async function init(){
    if(!/^[a-z0-9][a-z0-9-]{2,55}$/.test(slug)){unavailable('Revisá el enlace de la tienda.');return;}
    try {
      if(!window.supabase?.createClient || !window.SPM_CONFIG?.url)throw new Error('Sin conexión');
      const sb=window.supabase.createClient(window.SPM_CONFIG.url,window.SPM_CONFIG.key,
        {auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
      const r=await sb.from('gestlok_tiendas').select('id,nombre,descripcion,whatsapp,direccion,permite_retiro,permite_envio,visible').eq('slug',slug).eq('visible',true).maybeSingle();
      if(r.error)throw r.error;
      if(!r.data || !uuid(r.data.id))return unavailable();
      store=r.data;
      const p=await sb.from('gestlok_productos_tienda').select('id,nombre,categoria,descripcion,sku,precio,precio_anterior,stock,imagen_url,publicado,destacado').eq('tienda_id',store.id).eq('publicado',true).order('nombre');
      if(p.error)throw p.error;
      products=(p.data||[]).filter(row=>uuid(row.id));
      $('#shop-title').textContent=store.nombre;
      $('#shop-description').textContent=store.descripcion || 'Explorá nuestro catálogo y consultá por WhatsApp.';
      $('#shop-address').textContent=store.permite_retiro&&store.direccion?'Retirá en '+store.direccion:'';
      document.title=store.nombre+' · GestLok';
      const cats=[...new Set(products.map(item=>item.categoria))].sort((a,b)=>a.localeCompare(b,'es'));
      $('#category').innerHTML='<option value="">Todas las categorías</option>'+cats.map(c=>'<option value="'+esc(c)+'">'+esc(c)+'</option>').join('');
      btn.disabled=!store.whatsapp || !(store.permite_retiro||store.permite_envio);
      $('#shop-content').hidden=false;
      renderDelivery();renderCatalog();renderCart();
    } catch(e){unavailable('No pudimos cargar el catálogo. Volvé a intentar en unos minutos.');}
  }
  $('#search').addEventListener('input',renderCatalog);
  $('#category').addEventListener('change',renderCatalog);
  $('#sort').addEventListener('change',renderCatalog);
  $('#delivery').addEventListener('change',refreshDelivery);
  $('#checkout').addEventListener('submit',checkout);
  btn.addEventListener('click',()=>{renderCart();dialog.showModal();});
  $('#close-cart').addEventListener('click',()=>dialog.close());
  document.addEventListener('click',e=>{
    const el=e.target.closest('[data-add],[data-plus],[data-minus]');
    if(!el)return;
    if(el.hasAttribute('data-add')){modify(el.dataset.add,1);return;}
    if(el.hasAttribute('data-plus')){modify(el.dataset.plus,1);return;}
    if(el.hasAttribute('data-minus'))modify(el.dataset.minus,-1);
  });
  init();
})();
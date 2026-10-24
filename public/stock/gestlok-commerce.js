/* GestLok · modalidad de negocio por empresa y pedidos online por local.
   No procesa pagos ni descuenta stock automáticamente. */
(() => {
  'use strict';
  const TIPOS = {
    fisica: {nombre:'Tienda física', detalle:'Inventario, conteos, mercadería, proveedores y operación presencial.', icono:'🏬'},
    online: {nombre:'Tienda online', detalle:'Catálogo, pedidos online, preparación y entregas, stock y proveedores.', icono:'🛒'},
    mixta: {nombre:'Tienda mixta', detalle:'Unificá el trabajo presencial y los pedidos online por sucursal.', icono:'🏬'}
  };
  const ESTADOS = {nuevo:'Nuevo', preparando:'Preparando', listo:'Listo para entregar', entregado:'Entregado', cancelado:'Cancelado'};
  const CANALES = {web:'Tienda web', whatsapp:'WhatsApp', instagram:'Instagram', otro:'Otro'};
  let api = null, cfg = null, orders = [], ordersLocal = '', busy = false;
  const $ = q => document.querySelector(q);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const tipo = () => TIPOS[cfg?.tipo] ? cfg.tipo : 'fisica';
  const online = () => tipo() === 'online' || tipo() === 'mixta';
  const esDueno = () => ['creadora','dueno'].includes(api?.miRol?.());
  const disponible = () => !!(api?.S?.db && !api.S.offline);
  const etiqueta = () => TIPOS[tipo()].nombre;
  function card() {
    if (!api?.S?.db || !api.S.loaded.e) return '';
    return `<section class="gl-commerce-card card pad" aria-label="Modalidad de tu negocio">
      <div class="gl-commerce-heading"><div><p class="eyebrow">Configuración de empresa</p><h3>¿Cómo vendés en tu negocio?</h3><p class="lead">La modalidad se aplica a todos tus locales. Los registros existentes se conservan al cambiarla.</p></div><span class="gl-commerce-current">${esc(etiqueta())}</span></div>
      <div class="gl-commerce-options">${Object.entries(TIPOS).map(([id,t]) => `
        <button type="button" data-commerce-mode="${id}" class="gl-commerce-choice ${tipo() === id ? 'is-selected' : ''}" aria-pressed="${tipo() === id}" ${!esDueno() || !disponible() || busy ? 'disabled' : ''}>
        <span class="gl-commerce-emoji" aria-hidden="true">${t.icono}</span><b>${t.nombre}</b><small>${t.detalle}</small></button>`).join('')}</div>
      <p class="gl-commerce-foot">${esDueno() ? 'Solo la dueña o creadora puede cambiar esta configuración.' : 'La modalidad la configura la dueña de la empresa.'} ${online() ? 'Pedidos online: registro y seguimiento interno; no incluye tienda pública, cobros ni descuento automático del stock.' : ''}</p>
    </section>`;
  }
  function summary() {
    const pending = orders.filter(o => o.estado === 'nuevo' || o.estado === 'preparando').length;
    return `<section class="gl-commerce-today card pad"><div><p class="eyebrow">${esc(etiqueta())}</p><h4>${online() ? 'Pedidos de la tienda online' : 'Operación de tienda física'}</h4><p class="lead">${online() ? pending+' pedidos pendientes de preparación en este local.' : 'Usá el inventario, los conteos y los proveedores para organizar la tienda.'}</p></div>${online() ? '<button class="btn primary" data-go="pedidos-online">Ver pedidos online</button>' : ''}</section>`;
  }
  function view() {
    if (!online()) return '<section class="card pad"><h3>Pedidos online</h3><p>Habilitá Tienda online o Tienda mixta desde Inicio para ver esta sección.</p></section>';
    const loc = api.S.local;
    const all = ordersLocal === loc ? orders : [];
    const pending = all.filter(o => o.estado === 'nuevo' || o.estado === 'preparando').length;
    const opts = (map, val) => Object.entries(map).map(([k,v]) => `<option value="${k}" ${k === val ? 'selected' : ''}>${esc(v)}</option>`).join('');
    return `<div class="gl-commerce-page">
      <section class="card pad"><p class="eyebrow">${esc(etiqueta())} · ${esc(api.localNombre())}</p><h3>Pedidos online</h3>
        <p class="lead">Registrá pedidos que recibís por web, redes o WhatsApp y seguí su preparación por sucursal.</p>
        <div class="gl-commerce-counts"><span><b>${all.length}</b>Pedidos registrados</span><span><b>${pending}</b>Pendientes</span><span><b>${all.filter(o=>o.estado==='entregado').length}</b>Entregados</span></div>
        <p class="note">Este registro es interno: no cobra, no crea una tienda web y no modifica automáticamente el stock. Actualizá las existencias desde las planillas correspondientes.</p>
      </section>
      ${api.canW() ? `<form id="gl-commerce-order-form" class="card pad gl-commerce-order-form">
        <h3>Registrar pedido online</h3><div class="gl-commerce-fields">
        <label>Cliente / referencia<input name="cliente" type="text" maxlength="100" required placeholder="Nombre o código del pedido" autocomplete="off"></label>
        <label>Producto / detalle<input name="producto" type="text" maxlength="180" required placeholder="Producto solicitado" autocomplete="off"></label>
        <label>Cantidad<input name="cantidad" type="number" min="1" max="1000000" step="1" required value="1"></label>
        <label>Canal<select name="canal">${opts(CANALES,'web')}</select></label>
        <label class="gl-commerce-wide">Observaciones<input name="nota" type="text" maxlength="240" placeholder="Entrega, retiro, indicaciones (opcional)"></label>
        </div><button class="btn primary" type="submit" ${busy ? 'disabled' : ''}>Guardar pedido</button></form>` : ''}
      <section class="card pad"><h3>Seguimiento de pedidos</h3>
        ${all.length ? `<div class="gl-commerce-order-list">${all.map(o => `<article class="gl-commerce-order">
          <div><b>${esc(o.cliente)}</b><small>${esc(o.producto)} · ${esc(o.cantidad)} unidad(es) · ${esc(CANALES[o.canal]||'Otro')}</small>
          ${o.nota ? `<small>${esc(o.nota)}</small>` : ''}<small>${o.fecha ? new Date(o.fecha).toLocaleString('es-AR') : ''}</small></div>
          <div><label>Estado<select data-commerce-status="${esc(o.id)}" ${api.canW() && disponible() && !busy ? '' : 'disabled'}>${opts(ESTADOS,o.estado)}</select></label></div>
        </article>`).join('')}</div>` : '<p class="lead">Todavía no hay pedidos online en este local.</p>'}
      </section>
    </div>`;
  }
  async function changeMode(mode) {
    if (!TIPOS[mode] || !esDueno() || !disponible() || busy || mode === tipo()) return;
    const previo = tipo();
    if (!window.confirm(`¿Cambiar la modalidad a ${TIPOS[mode].nombre}? Se adaptarán las secciones visibles para toda la empresa. No se borrará ningún registro.`)) return;
    busy = true;
    try {
      const ref = api.C('configuracion_negocio').doc('principal');
      const current = await ref.get();
      const payload = {tipo:mode, actualizado:Date.now(), actualizadoPor:api.S.me?.email || ''};
      if (current.exists) await ref.update(payload); else await ref.set(payload);
      cfg = {...(cfg||{}), ...payload};
      if (api.S.local && mode === 'online' && ['fabrica','ingreso'].includes(api.S.view)) api.go('inicio');
      api.render();
      api.toast('Modalidad actualizada: '+TIPOS[mode].nombre+'.');
    } catch(e) { cfg = {...(cfg||{}),tipo:previo}; api.fail(e); }
    finally { busy = false; api.render(); }
  }
  async function addOrder(form) {
    if (!online() || !api.canW() || !disponible() || busy) return;
    const d = new FormData(form);
    const cliente = String(d.get('cliente')||'').trim().slice(0,100);
    const producto = String(d.get('producto')||'').trim().slice(0,180);
    const cantidad = Number(d.get('cantidad'));
    const canal = String(d.get('canal')||'web');
    const nota = String(d.get('nota')||'').trim().slice(0,240);
    if (!cliente || !producto || !Number.isInteger(cantidad) || cantidad<1 || cantidad>1000000 || !CANALES[canal]) { api.toast('Revisá los datos del pedido.',true);return; }
    busy=true;
    try {
      const ahora=Date.now();
      await api.C('pedidos_online').add({cliente,producto,cantidad,canal,nota,estado:'nuevo',fecha:ahora,actualizado:ahora,autor:api.S.me?.email||'',historial:[{estado:'nuevo',fecha:ahora}]});
      form.reset(); api.toast('Pedido online registrado.');
    }catch(e){api.fail(e);}
    finally{busy=false;api.render();}
  }
  async function changeStatus(id, estado, select) {
    if (!online() || !api.canW() || !disponible() || !ESTADOS[estado] || busy) return;
    const order=orders.find(o=>o.id===id);
    if(!order || !ESTADOS[order.estado] || order.estado===estado) return;
    const previo=order.estado, stamp=Date.now();
    busy=true; select.disabled=true;
    try{
      await api.C('pedidos_online').doc(id).update({estado,actualizado:stamp,historial:[...(Array.isArray(order.historial)?order.historial.slice(-99):[]),{estado,fecha:stamp}]});
      api.toast('Estado actualizado.');
    }catch(e){select.value=previo;api.fail(e);}
    finally{busy=false; api.render();}
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-commerce-mode]');
    if (b) { e.preventDefault(); changeMode(b.dataset.commerceMode); }
  });
  document.addEventListener('submit', e => {
    if (e.target.id === 'gl-commerce-order-form') {e.preventDefault(); addOrder(e.target);}
  });
  document.addEventListener('change', e => {
    const sel = e.target.closest('[data-commerce-status]');
    if (sel) changeStatus(sel.dataset.commerceStatus, sel.value, sel);
  });
  window.GestLokCommerce = Object.freeze({
    attach(ctx) { api=ctx; },
    config(data) { cfg=data && typeof data==='object'?data:null; },
    orders(local,rows) {ordersLocal=local;orders=Array.isArray(rows)?rows.slice().sort((a,b)=>(b.fecha||0)-(a.fecha||0)):[];},
    mode: tipo, online, card, summary, view, etiqueta
  });
})();
/* GestLok · modalidad de negocio por empresa y pedidos online por local.
   No procesa pagos ni descuenta stock automáticamente. */
(() => {
  'use strict';
  const TIPOS = {
    fisica: {nombre:'Tienda física', detalle:'Inventario, conteos, mercadería, proveedores y operación presencial.', icono:'🏬'},
    online: {nombre:'Tienda online', detalle:'Gestión privada de productos, stock, pedidos recibidos por otros canales y proveedores.', icono:'🗂️'},
    mixta: {nombre:'Tienda mixta', detalle:'Combiná la administración presencial con la organización de pedidos y productos online.', icono:'🏬'}
  };
  const ESTADOS = {nuevo:'Nuevo', preparando:'Preparando', listo:'Listo para entregar', enviado:'Enviado', entregado:'Entregado', cancelado:'Cancelado', devuelto:'Devuelto'};
  const CANALES = {web:'Tienda web', whatsapp:'WhatsApp', instagram:'Instagram', otro:'Otro'};
  let api = null, cfg = null, orders = [], ordersLocal = '', busy = false, orderFilter='todos', orderPage=0;
  const $ = q => document.querySelector(q);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const tipo = () => TIPOS[cfg?.tipo] ? cfg.tipo : 'fisica';
  const online = () => tipo() === 'online' || tipo() === 'mixta';
  const esDueno = () => ['creadora','dueno'].includes(api?.miRol?.());
  const disponible = () => !!(api?.S?.db && !api.S.offline);
  const etiqueta = () => TIPOS[tipo()].nombre;
  const configId = () => api?.S?.me?.tenant_id ? 'empresa-' + String(api.S.me.tenant_id) : null;
  function card() {
    if (!api?.S?.db || !api.S.loaded.e) return '';
    return `<section class="gl-commerce-card card pad" aria-label="Modalidad de tu negocio">
      <div class="gl-commerce-heading"><div><p class="eyebrow">Configuración de empresa</p><h3>¿Cómo vendés en tu negocio?</h3><p class="lead">La modalidad se aplica a todos tus locales. Los registros existentes se conservan al cambiarla.</p></div><span class="gl-commerce-current">${esc(etiqueta())}</span></div>
      <div class="gl-commerce-options">${Object.entries(TIPOS).map(([id,t]) => `
        <button type="button" data-commerce-mode="${id}" class="gl-commerce-choice ${tipo() === id ? 'is-selected' : ''}" aria-pressed="${tipo() === id}" ${!esDueno() || !disponible() || busy ? 'disabled' : ''}>
        <span class="gl-commerce-emoji" aria-hidden="true">${t.icono}</span><b>${t.nombre}</b><small>${t.detalle}</small></button>`).join('')}</div>
      <p class="gl-commerce-foot">${esDueno() ? 'Solo la dueña o creadora puede cambiar esta configuración.' : 'La modalidad la configura la dueña de la empresa.'} ${online() ? 'Registro y seguimiento administrativo; no es una tienda para compradores, no cobra ni descuenta stock automáticamente.' : ''}</p>
    </section>`;
  }
  function summary() {
    const pending = orders.filter(o => o.estado === 'nuevo' || o.estado === 'preparando').length;
    return `<section class="gl-commerce-today card pad"><div><p class="eyebrow">${esc(etiqueta())}</p><h4>${online() ? 'Organización de pedidos online' : 'Operación de tienda física'}</h4><p class="lead">${online() ? pending+' pedidos pendientes de preparación en este local.' : 'Usá el inventario, los conteos y los proveedores para organizar la tienda.'}</p></div>${online() ? '<button class="btn primary" data-go="pedidos-online">Ver pedidos online</button>' : ''}</section>`;
  }
  function view() {
    if (!online()) return '<section class="card pad"><h3>Pedidos online</h3><p>Habilitá Tienda online o Tienda mixta desde Inicio para ver esta sección.</p></section>';
    const loc = api.S.local;
    const all = ordersLocal === loc ? orders : [];
    const pending = all.filter(o => o.estado === 'nuevo' || o.estado === 'preparando').length;
    const filtered=all.filter(o => orderFilter==='todos'||o.estado===orderFilter);
    const maxPage=Math.max(1,Math.ceil(filtered.length/40));
    orderPage=Math.max(0,Math.min(orderPage,maxPage-1));
    const shown=filtered.slice(orderPage*40,(orderPage+1)*40);
    const logged=all.filter(o=>o.estado==='entregado'&&Number.isFinite(Number(o.total)));
    const total=logged.reduce((sum,o)=>sum+Number(o.total||0),0);
    const peso=n=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS'}).format(Number(n)||0);
    const opts = (map, val) => Object.entries(map).map(([k,v]) => `<option value="${k}" ${k === val ? 'selected' : ''}>${esc(v)}</option>`).join('');
    return `<div class="gl-commerce-page">
      <section class="card pad"><p class="eyebrow">${esc(etiqueta())} · ${esc(api.localNombre())}</p><h3>Pedidos online</h3>
        <p class="lead">Registrá pedidos que recibís por web, redes o WhatsApp y seguí su preparación por sucursal.</p>
        <div class="gl-commerce-counts"><span><b>${all.length}</b>Pedidos registrados</span><span><b>${pending}</b>Pendientes</span><span><b>${all.filter(o=>o.estado==='entregado').length}</b>Entregados</span></div>
        <p class="note">Pedidos internos de canales externos. No cobra ni descuenta stock automáticamente; registrá sus movimientos en las planillas.</p>
        <p class="lead"><b>Importe de pedidos entregados con precio informado:</b> ${peso(total)}. No equivale a facturación contable.</p>
        <div class="gl-tienda-actions">
          <label>Filtrar estado <select id="gl-order-filter"><option value="todos">Todos</option>${opts(ESTADOS,orderFilter)}</select></label>
          <button class="btn" type="button" data-commerce-export>Exportar pedidos CSV</button>
        </div>
      </section>
      ${api.canW() ? `<form id="gl-commerce-order-form" class="card pad gl-commerce-order-form">
        <h3>Registrar pedido online</h3><div class="gl-commerce-fields">
        <label>Cliente / referencia<input name="cliente" type="text" maxlength="100" required placeholder="Nombre o código del pedido" autocomplete="off"></label>
        <label class="gl-commerce-wide">Productos (uno por línea: producto | cantidad | precio unitario)<textarea name="lineas" rows="4" maxlength="4000" required placeholder="Café 500g | 2 | 8500&#10;Chocolate 100g | 3 | 1200"></textarea></label>
        <label>Canal<select name="canal">${opts(CANALES,'web')}</select></label>
        <label>Entrega<select name="entrega"><option value="retiro">Retiro</option><option value="envio">Envío</option><option value="coordinar">A coordinar</option></select></label>
        <label>Fecha acordada<input name="fecha_entrega" type="date"></label>
        <label>Transportista (opcional)<input name="transportista" maxlength="100" placeholder="Correo o repartidor"></label>
        <label>Seguimiento (opcional)<input name="tracking" maxlength="100" placeholder="Código externo"></label>
        <label class="gl-commerce-wide">Observaciones<input name="nota" type="text" maxlength="240" placeholder="Indicaciones (opcional)"></label>
        </div><button class="btn primary" type="submit" ${busy ? 'disabled' : ''}>Guardar pedido</button></form>` : ''}
      <section class="card pad"><h3>Seguimiento de pedidos</h3>
        ${filtered.length ? `<div class="gl-commerce-order-list">${shown.map(o => `<article class="gl-commerce-order">
          <div><b>${esc(o.cliente)}</b><small>${Array.isArray(o.items)?o.items.map(i=>esc(i.nombre)+' ×'+Number(i.cantidad)).join(' · '):esc(o.producto)+' · '+esc(o.cantidad)+' unidad(es)'} · ${esc(CANALES[o.canal]||'Otro')}</small>
          ${Number.isFinite(Number(o.total))&&o.total!=null?'<small>Importe informado: '+peso(o.total)+'</small>':''}
          ${o.entrega?'<small>Entrega: '+esc(o.entrega)+(o.fechaEntrega?' · '+esc(o.fechaEntrega):'')+'</small>':''}
          ${o.tracking?'<small>Seguimiento: '+esc(o.tracking)+'</small>':''}
          ${o.nota ? `<small>${esc(o.nota)}</small>` : ''}<small>${o.fecha ? new Date(o.fecha).toLocaleString('es-AR') : ''}</small></div>
          <div><label>Estado<select data-commerce-status="${esc(o.id)}" ${api.canW() && disponible() && !busy ? '' : 'disabled'}>${opts(ESTADOS,o.estado)}</select></label></div>
        </article>`).join('')}</div>` : '<p class="lead">No hay pedidos con este filtro.</p>'}
        <div class="gl-tienda-actions" style="margin-top:10px">
          <small>Página ${orderPage+1} de ${maxPage} · ${filtered.length} pedidos</small>
          <button class="btn sm" data-commerce-page="-1" ${orderPage===0?'disabled':''}>Anterior</button>
          <button class="btn sm" data-commerce-page="1" ${orderPage+1>=maxPage?'disabled':''}>Siguiente</button>
        </div>
      </section>
    </div>`;
  }
  async function changeMode(mode) {
    if (!TIPOS[mode] || !esDueno() || !disponible() || busy || mode === tipo()) return;
    if (!configId()) {api.toast('No pudimos verificar la empresa de tu cuenta. Volvé a iniciar sesión.',true);return;}
    const previo = tipo();
    if (!window.confirm(`¿Cambiar la modalidad a ${TIPOS[mode].nombre}? Se adaptarán las secciones visibles para toda la empresa. No se borrará ningún registro.`)) return;
    busy = true;
    try {
      const ref = api.C('configuracion_negocio').doc(configId());
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
    const lines=String(d.get('lineas')||'').split(/\r?\n/).map(v=>v.trim()).filter(Boolean);
    if(!lines.length||lines.length>30){api.toast('Indicá entre 1 y 30 renglones de productos.',true);return;}
    const items=[];
    for(const line of lines){
      const [nombre,q,precio,...extra]=line.split('|').map(x=>x.trim());
      const cantidad=Number(q),unit=Number(precio);
      if(extra.length||!nombre||nombre.length>140||!Number.isInteger(cantidad)||cantidad<1||cantidad>100000
         ||!precio||!Number.isFinite(unit)||unit<0||unit>9999999999){
         api.toast('Usá: Producto | cantidad | precio, en cada línea.',true);return;
      }
      items.push({nombre,cantidad,precio:unit});
    }
    const producto=items.map(i=>i.nombre).join(', ').slice(0,180);
    const cantidad=items.reduce((n,i)=>n+i.cantidad,0);
    const total=items.reduce((n,i)=>n+i.cantidad*i.precio,0);
    const canal = String(d.get('canal')||'web');
    const nota = String(d.get('nota')||'').trim().slice(0,240);
    const entrega=String(d.get('entrega')||'coordinar');
    const fechaEntrega=String(d.get('fecha_entrega')||'');
    const transportista=String(d.get('transportista')||'').trim().slice(0,100);
    const tracking=String(d.get('tracking')||'').trim().slice(0,100);
    if(!cliente||!producto||cantidad<1||cantidad>1000000||!Number.isFinite(total)||total>999999999999
       ||!CANALES[canal]||!['retiro','envio','coordinar'].includes(entrega)
       ||(fechaEntrega&&!/^\d{4}-\d{2}-\d{2}$/.test(fechaEntrega))){
      api.toast('Revisá los datos del pedido.',true);return;
    }
    busy=true;
    try {
      const ahora=Date.now();
      await api.C('pedidos_online').add({cliente,producto,cantidad,items,total,canal,nota,entrega,fechaEntrega,transportista,tracking,estado:'nuevo',fecha:ahora,actualizado:ahora,autor:api.S.me?.email||'',historial:[{estado:'nuevo',fecha:ahora}]});
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
  function exportOrders(){
    if(!online()||!api?.S?.local)return;
    const quote=v=>'"'+String(v??'').replaceAll('"','""')+'"';
    const lines=[['Fecha','Cliente','Canal','Productos','Unidades','Total ARS','Estado','Entrega','Fecha entrega','Transportista','Seguimiento']];
    for(const o of orders){
      lines.push([o.fecha?new Date(o.fecha).toLocaleString('es-AR'):'',o.cliente,
        CANALES[o.canal]||o.canal,Array.isArray(o.items)?o.items.map(x=>x.nombre+' x'+x.cantidad).join(' | '):o.producto,
        o.cantidad,o.total??'',ESTADOS[o.estado]||o.estado,o.entrega||'',o.fechaEntrega||'',o.transportista||'',o.tracking||'']);
    }
    const content='﻿'+lines.map(r=>r.map(quote).join(';')).join('\r\n');
    const u=URL.createObjectURL(new Blob([content],{type:'text/csv;charset=utf-8'}));
    const a=document.createElement('a');a.href=u;a.download='gestlok-pedidos-'+api.S.local+'.csv';
    document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(u);
  }
  document.addEventListener('click', e => {
    const page=e.target.closest('[data-commerce-page]');
    if(page){orderPage+=Number(page.dataset.commercePage)||0;api.render();return;}
    const exportBtn=e.target.closest('[data-commerce-export]');
    if(exportBtn){exportOrders();return;}
    const b = e.target.closest('[data-commerce-mode]');
    if (b) { e.preventDefault(); changeMode(b.dataset.commerceMode); }
  });
  document.addEventListener('submit', e => {
    if (e.target.id === 'gl-commerce-order-form') {e.preventDefault(); addOrder(e.target);}
  });
  document.addEventListener('change', e => {
    if(e.target.id==='gl-order-filter'){orderFilter=e.target.value;orderPage=0;api.render();return;}
    const sel = e.target.closest('[data-commerce-status]');
    if (sel) changeStatus(sel.dataset.commerceStatus, sel.value, sel);
  });
  window.GestLokCommerce = Object.freeze({
    attach(ctx) { api=ctx; },
    config(data) { cfg=data && typeof data==='object'?data:null; },
    orders(local,rows) {ordersLocal=local;orders=Array.isArray(rows)?rows.slice().sort((a,b)=>(b.fecha||0)-(a.fecha||0)):[];},
    mode: tipo, online, card, summary, view, etiqueta, configId
  });
})();
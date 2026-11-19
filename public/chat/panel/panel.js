/* GESTLOK Chat · panel en GESTLOK (dueño, gerente y creadora).
 * Usa la misma sesión de GESTLOK (mismo dominio). Cada acción la autoriza la base: este archivo solo muestra
 * lo que el servidor devuelve según el nivel (configurar, gestionar o ver). Nunca innerHTML con datos.
 * Modo demostración sin red: ?demo=1.
 */
(function () {
  'use strict';
  const CFG = window.GESTLOK_CHAT_CONFIG || {};
  const DEMO = new URLSearchParams(location.search).get('demo') === '1';
  const $ = id => document.getElementById(id);
  const el = (tag, props = {}, ...hijos) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v === true ? '' : v);
    }
    for (const h of hijos.flat()) if (h !== null && h !== undefined && h !== false) n.append(h instanceof Node ? h : document.createTextNode(String(h)));
    return n;
  };
  const pesos = n => '$ ' + String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const hora = t => { try { return new Date(t).toLocaleString('es-AR', {day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'}); } catch { return ''; } };
  const PAGOS = {efectivo: 'Efectivo', transferencia: 'Transferencia', mercado_pago: 'Mercado Pago', debito: 'Débito', credito: 'Crédito'};
  const ESTADOS = {pendiente: 'Pendiente', confirmado: 'Confirmado', rechazado: 'Rechazado', cancelado: 'Cancelado por el cliente'};

  const S = {sucursales: [], suc: null, pestana: 'pedidos', filtro: 'pendiente', sondeo: 0, pendientesVistos: null, ocupado: false};
  let sb = null;
  if (!DEMO) {
    try { sb = window.supabase.createClient(CFG.url, CFG.key, {auth: {persistSession: true, autoRefreshToken: true, detectSessionInUrl: false}}); }
    catch { /* se informa abajo */ }
  }
  async function rpc(fn, args) {
    if (DEMO) return demoRpc(fn, args || {});
    let r;
    try { r = await sb.rpc('gestlok_chat_' + fn, args || {}); } catch { throw new Error('Sin conexión. Revisá internet y probá de nuevo.'); }
    if (r.error) {
      const m = r.error.message || '';
      if (r.error.code === '42501') throw new Error(m.includes('permiso') ? m : 'No tenés permiso para esta acción.');
      if (['P0001', '22023', '40001', 'P0002'].includes(r.error.code)) throw new Error(m);
      throw new Error('No se pudo completar. Probá de nuevo.');
    }
    return r.data;
  }
  let avisoT = 0;
  function aviso(texto, error) {
    const a = $('aviso'); a.textContent = texto; a.className = 'aviso' + (error ? ' error' : ''); a.hidden = false;
    clearTimeout(avisoT); avisoT = setTimeout(() => { a.hidden = true; }, error ? 6000 : 3000);
  }
  const contenido = $('contenido');
  const nivel = () => S.suc?.nivel;
  const puede = min => min === 'ver' ? !!nivel() : min === 'gestionar' ? ['gestionar', 'configurar'].includes(nivel()) : nivel() === 'configurar';

  // ------------------------------------------------------------------------------------------- inicio
  function fijo(titulo, texto, enlace) {
    $('panel').setAttribute('aria-busy', 'false');
    contenido.replaceChildren(el('div', {class: 'vacio'}, el('h2', {text: titulo}), el('p', {text: texto}),
      enlace ? el('a', {class: 'boton principal', href: enlace[1], text: enlace[0]}) : null));
  }
  async function iniciar() {
    if (!DEMO && !sb) return fijo('No se pudo iniciar', 'Recargá la página.');
    if (!DEMO) {
      const {data} = await sb.auth.getSession();
      if (!data?.session) return fijo('Entrá a GESTLOK', 'Iniciá sesión en GESTLOK con tu cuenta y volvé a abrir el panel.', ['Ir a GESTLOK', '/']);
    }
    let r;
    try { r = await rpc('panel_inicio'); } catch (e) { return fijo('No pudimos abrir el panel', e.message); }
    if (!r.habilitado) return fijo('GESTLOK Chat no está activo', 'GESTLOK Chat no está habilitado para la empresa que tenés elegida en GESTLOK. Si tenés varias empresas, elegí la correcta en GESTLOK y volvé.', ['Ir a GESTLOK', '/']);
    if (!r.sucursales.length) return fijo('Sin sucursales para vos', 'Tu usuario no tiene sucursales con GESTLOK Chat. Pedile acceso al dueño.');
    S.sucursales = r.sucursales;
    $('empresa').textContent = r.empresa;
    const sel = $('sucursal');
    sel.replaceChildren(...r.sucursales.map(s => el('option', {value: s.id, text: s.nombre + (s.pendientes ? ' (' + s.pendientes + ')' : '')})));
    let guardada = null; try { guardada = localStorage.getItem('gestlok-chat-panel:sucursal'); } catch { /* sin almacenamiento */ }
    S.suc = r.sucursales.find(s => s.id === guardada) || r.sucursales[0];
    sel.value = S.suc.id; sel.hidden = r.sucursales.length < 2;
    sel.onchange = () => {
      S.suc = S.sucursales.find(s => s.id === sel.value); S.pendientesVistos = null;
      try { localStorage.setItem('gestlok-chat-panel:sucursal', S.suc.id); } catch { /* nada */ }
      mostrar();
    };
    $('pestanas').hidden = false;
    $('panel').setAttribute('aria-busy', 'false');
    mostrar();
  }
  $('pestanas').addEventListener('click', e => {
    const b = e.target.closest('[data-p]'); if (!b) return;
    S.pestana = b.dataset.p; mostrar();
  });
  function mostrar() {
    for (const b of $('pestanas').querySelectorAll('[data-p]')) {
      b.setAttribute('aria-selected', String(b.dataset.p === S.pestana));
      if (b.dataset.p === 'ajustes') b.hidden = !puede('ver');
      if (b.dataset.p === 'charlas') b.hidden = !puede('gestionar');
    }
    clearTimeout(S.sondeo);
    ({pedidos: verPedidos, carta: verCarta, ajustes: verAjustes, charlas: verCharlas})[S.pestana]();
  }

  // ------------------------------------------------------------------------------------------- pedidos
  async function verPedidos() {
    const filtros = [['pendiente', 'Pendientes'], ['confirmado', 'Confirmados'], ['rechazado', 'Rechazados'], ['todos', 'Todos']];
    const cabeza = el('div', {class: 'filtros', role: 'toolbar', 'aria-label': 'Filtrar pedidos'}, filtros.map(([v, t]) =>
      el('button', {type: 'button', class: 'chip', 'aria-pressed': String(S.filtro === v), text: t, onclick: () => { S.filtro = v; verPedidos(); }})));
    const lista = el('div', {class: 'tarjetas'}, el('p', {class: 'nota', text: 'Cargando pedidos…'}));
    contenido.replaceChildren(cabeza, lista);
    await cargarPedidos(lista);
  }
  async function cargarPedidos(lista) {
    let r;
    try { r = await rpc('panel_pedidos', {p_sucursal: S.suc.id, p_estado: S.filtro, p_limite: 60}); }
    catch (e) { lista.replaceChildren(el('p', {class: 'error', text: e.message})); return programar(lista); }
    const pend = r.pedidos.filter(p => p.estado === 'pendiente').length;
    if (S.filtro === 'pendiente') {
      $('globo').textContent = String(pend); $('globo').hidden = !pend;
      document.title = (pend ? '(' + pend + ') ' : '') + 'GESTLOK Chat · Panel';
      if (S.pendientesVistos !== null && pend > S.pendientesVistos) {
        aviso('Llegó un pedido nuevo');
        try { navigator.vibrate?.([120, 80, 120]); } catch { /* nada */ }
      }
      S.pendientesVistos = pend;
    }
    lista.replaceChildren(...(r.pedidos.length ? r.pedidos.map(tarjetaPedido)
      : [el('p', {class: 'nota', text: S.filtro === 'pendiente' ? 'No hay pedidos esperando confirmación.' : 'No hay pedidos para mostrar.'})]));
    programar(lista);
  }
  function programar(lista) {
    clearTimeout(S.sondeo);
    if (S.pestana !== 'pedidos') return;
    S.sondeo = setTimeout(() => { if (document.hidden || S.ocupado) return programar(lista); cargarPedidos(lista); }, 15000);
  }
  function tarjetaPedido(p) {
    const tel = String(p.cliente_telefono || '');
    const wa = tel.length === 10 ? '549' + tel : tel;
    const acciones = el('div', {class: 'acciones'});
    if (p.estado === 'pendiente' && puede('gestionar')) {
      const motivo = el('input', {type: 'text', maxlength: '300', placeholder: 'Motivo para el cliente (ej.: sin stock)', 'aria-label': 'Motivo del rechazo'});
      const caja = el('div', {class: 'rechazo', hidden: true}, motivo,
        el('button', {type: 'button', class: 'boton peligro', text: 'Rechazar pedido', onclick: () => decidir(p, 'rechazado', motivo.value)}));
      acciones.append(
        el('button', {type: 'button', class: 'boton principal', text: 'Confirmar', onclick: () => decidir(p, 'confirmado', '')}),
        el('button', {type: 'button', class: 'boton', text: 'Rechazar…', onclick: () => { caja.hidden = !caja.hidden; if (!caja.hidden) motivo.focus(); }}),
        caja);
    }
    return el('article', {class: 'tarjeta ' + p.estado},
      el('header', {}, el('strong', {text: p.codigo}), el('span', {class: 'estado ' + p.estado, text: ESTADOS[p.estado] || p.estado}), el('small', {text: hora(p.creado_at)})),
      el('p', {class: 'cliente'}, el('b', {text: p.cliente_nombre}), ' · ',
        el('a', {href: 'tel:+' + (tel.length === 10 ? '54' + tel : tel), text: tel}), ' · ',
        el('a', {href: 'https://wa.me/' + wa, target: '_blank', rel: 'noopener', text: 'WhatsApp'})),
      el('p', {class: 'entrega', text: (p.entrega === 'envio' ? 'Envío a ' + p.direccion : 'Retira en el local') +
        ' · ' + (PAGOS[p.medio_pago] || p.medio_pago) + (p.horario ? ' · Para: ' + p.horario : '')}),
      el('ul', {class: 'items'}, (p.items || []).map(i => el('li', {},
        el('span', {text: i.cantidad + ' × ' + i.nombre + ((i.opciones || []).length ? ' (' + i.opciones.map(o => o.valores.join(', ')).join(' · ') + ')' : '') + (i.nota ? ' — ' + i.nota : '')}),
        el('span', {text: pesos(i.importe)})))),
      p.nota ? el('p', {class: 'nota-cliente', text: 'Aclaración: ' + p.nota}) : null,
      el('p', {class: 'totales', text: (Number(p.envio) > 0 ? 'Envío ' + pesos(p.envio) + ' · ' : '') + 'Total ' + pesos(p.total)}),
      p.motivo && p.estado !== 'pendiente' ? el('p', {class: 'nota', text: 'Motivo: ' + p.motivo}) : null,
      acciones);
  }
  async function decidir(p, decision, motivo) {
    if (S.ocupado) return;
    if (decision === 'rechazado' && String(motivo || '').trim().length < 3) return aviso('Escribí el motivo para el cliente.', true);
    S.ocupado = true;
    try {
      await rpc('panel_decidir', {p_pedido: p.id, p_decision: decision, p_motivo: motivo || ''});
      aviso(decision === 'confirmado' ? 'Pedido ' + p.codigo + ' confirmado' : 'Pedido ' + p.codigo + ' rechazado');
      if (S.pendientesVistos) S.pendientesVistos -= 1;
    } catch (e) { aviso(e.message, true); }
    finally { S.ocupado = false; }
    verPedidos();
  }

  // ------------------------------------------------------------------------------------------- carta
  async function verCarta() {
    contenido.replaceChildren(el('p', {class: 'nota', text: 'Cargando la carta…'}));
    let c;
    try { c = await rpc('panel_catalogo', {p_sucursal: S.suc.id}); } catch (e) { return contenido.replaceChildren(el('p', {class: 'error', text: e.message})); }
    const config = puede('configurar');
    const porCat = [...c.categorias, {id: null, nombre: 'Sin categoría'}].map(cat => ({cat, prods: c.productos.filter(p => (p.categoria_id || null) === cat.id)}))
      .filter(x => x.prods.length || (x.cat.id && config));
    contenido.replaceChildren(
      el('p', {class: 'nota', text: config ? 'Cargá lo que ofrecés por chat. «Agotado» lo puede marcar también el gerente.' : 'Marcá «Agotado» lo que no haya hoy. Los precios los cambia el dueño.'}),
      config ? el('div', {class: 'fila-botones'},
        el('button', {type: 'button', class: 'boton principal', text: '+ Producto', onclick: () => editarProducto(null, c)}),
        el('button', {type: 'button', class: 'boton', text: '+ Categoría', onclick: () => editarCategoria(null)})) : null,
      porCat.length ? el('div', {}, porCat.map(({cat, prods}) => el('section', {class: 'categoria'},
        el('h3', {}, cat.nombre, cat.id && cat.activa === false ? el('small', {text: ' · oculta'}) : null,
          config && cat.id ? el('button', {type: 'button', class: 'enlace', text: 'Editar', onclick: () => editarCategoria(cat)}) : null),
        prods.map(p => el('div', {class: 'producto' + (p.activo ? '' : ' inactivo')},
          el('div', {class: 'producto-texto'}, el('strong', {text: p.nombre}),
            el('small', {text: pesos(p.precio) + ((p.opciones || []).length ? ' · con opciones' : '') + (p.activo ? '' : ' · no figura en la carta')})),
          puede('gestionar') ? el('label', {class: 'interruptor'},
            el('input', {type: 'checkbox', checked: p.disponible, 'aria-label': 'Disponible: ' + p.nombre, onchange: async ev => {
              try { await rpc('panel_disponible', {p_producto: p.id, p_disponible: ev.target.checked}); aviso(p.nombre + (ev.target.checked ? ' disponible' : ' agotado')); }
              catch (e) { ev.target.checked = !ev.target.checked; aviso(e.message, true); }
            }}), el('span', {text: 'Hay'})) : el('span', {class: p.disponible ? 'ok' : 'agotado', text: p.disponible ? 'Disponible' : 'Agotado'}),
          config ? el('button', {type: 'button', class: 'enlace', text: 'Editar', onclick: () => editarProducto(p, c)}) : null)))))
        : el('div', {class: 'vacio'}, el('p', {text: 'Todavía no hay productos.'})));
  }

  function editarCategoria(cat) {
    const nombre = el('input', {type: 'text', maxlength: '60', required: true}); nombre.value = cat?.nombre || '';
    const orden = el('input', {type: 'number', min: '0', max: '10000', inputmode: 'numeric'}); orden.value = String(cat?.orden ?? 0);
    const activa = el('input', {type: 'checkbox', checked: cat ? cat.activa : true});
    dialogo(cat ? 'Editar categoría' : 'Nueva categoría', [
      campo('Nombre', nombre), campo('Orden (menor primero)', orden), el('label', {class: 'check'}, activa, ' Se muestra en la carta')],
    async () => {
      await rpc('panel_categoria_guardar', {p_sucursal: S.suc.id, p_id: cat?.id || null, p_nombre: nombre.value.trim(), p_orden: Number(orden.value) || 0, p_activa: activa.checked});
      aviso('Categoría guardada'); verCarta();
    });
  }

  // Editor de opciones: cada grupo con valores «Nombre | extra».
  function editorOpciones(opciones) {
    const caja = el('div', {class: 'opciones'});
    const grupos = (opciones || []).map(g => ({...g, texto: g.valores.map(v => v.nombre + (Number(v.extra) ? ' | ' + v.extra : '')).join('\n')}));
    const pintar = () => caja.replaceChildren(...grupos.map((g, i) => {
      const nombre = el('input', {type: 'text', maxlength: '60', placeholder: 'Ej.: Tamaño'}); nombre.value = g.nombre || '';
      nombre.oninput = () => { g.nombre = nombre.value; };
      const tipo = el('select', {}, el('option', {value: 'una', text: 'Elige una'}), el('option', {value: 'varias', text: 'Elige varias'}));
      tipo.value = g.tipo || 'una'; tipo.onchange = () => { g.tipo = tipo.value; pintar(); };
      const max = el('input', {type: 'number', min: '1', max: '30', inputmode: 'numeric'}); max.value = String(g.max || 2); max.oninput = () => { g.max = Number(max.value); };
      const obl = el('input', {type: 'checkbox', checked: !!g.obligatorio}); obl.onchange = () => { g.obligatorio = obl.checked; };
      const valores = el('textarea', {rows: '3', placeholder: 'Un valor por renglón. Con recargo: Grande | 2000'}); valores.value = g.texto || '';
      valores.oninput = () => { g.texto = valores.value; };
      return el('fieldset', {class: 'grupo'}, el('legend', {text: 'Opción ' + (i + 1)}),
        campo('Nombre', nombre), el('div', {class: 'dos'}, campo('Tipo', tipo), g.tipo === 'varias' ? campo('Máximo', max) : el('span')),
        el('label', {class: 'check'}, obl, ' Obligatoria'), campo('Valores', valores),
        el('button', {type: 'button', class: 'enlace peligro', text: 'Quitar opción', onclick: () => { grupos.splice(i, 1); pintar(); }}));
    }), el('button', {type: 'button', class: 'boton', text: '+ Agregar opción (tamaño, sabor, extras…)',
      onclick: () => { if (grupos.length < 8) { grupos.push({nombre: '', tipo: 'una', obligatorio: true, texto: ''}); pintar(); } }}));
    pintar();
    const slug = t => String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30) || 'x';
    caja.leer = () => grupos.map((g, i) => {
      const usados = new Set();
      const valores = String(g.texto || '').split('\n').map(l => l.trim()).filter(Boolean).map(l => {
        const [n, e] = l.split('|').map(x => x.trim());
        let id = slug(n); while (usados.has(id)) id = (id + '_').slice(0, 30); usados.add(id);
        return {id, nombre: n.slice(0, 60), extra: Math.max(0, Number(String(e || '0').replace(/[^0-9.]/g, '')) || 0)};
      });
      if (!String(g.nombre || '').trim() || !valores.length) throw new Error('Completá el nombre y los valores de la opción ' + (i + 1) + '.');
      return {id: (slug(g.nombre) + '_' + i).slice(0, 30), nombre: g.nombre.trim().slice(0, 60), tipo: g.tipo || 'una', obligatorio: !!g.obligatorio,
        ...(g.tipo === 'varias' ? {max: Math.min(30, Math.max(1, Math.round(Number(g.max) || 1)))} : {}), valores};
    });
    return caja;
  }
  function editarProducto(p, c) {
    const nombre = el('input', {type: 'text', maxlength: '120', required: true}); nombre.value = p?.nombre || '';
    const desc = el('input', {type: 'text', maxlength: '300'}); desc.value = p?.descripcion || '';
    const precio = el('input', {type: 'number', min: '1', step: '0.01', inputmode: 'decimal', required: true}); precio.value = p ? String(p.precio) : '';
    const cat = el('select', {}, el('option', {value: '', text: 'Sin categoría'}), c.categorias.map(k => el('option', {value: k.id, text: k.nombre})));
    cat.value = p?.categoria_id || '';
    const orden = el('input', {type: 'number', min: '0', max: '10000', inputmode: 'numeric'}); orden.value = String(p?.orden ?? 0);
    const activo = el('input', {type: 'checkbox', checked: p ? p.activo : true});
    const disp = el('input', {type: 'checkbox', checked: p ? p.disponible : true});
    const ops = editorOpciones(p?.opciones);
    dialogo(p ? 'Editar producto' : 'Nuevo producto', [campo('Nombre', nombre), campo('Descripción (opcional)', desc),
      el('div', {class: 'dos'}, campo('Precio', precio), campo('Orden', orden)), campo('Categoría', cat),
      el('label', {class: 'check'}, activo, ' Figura en la carta'), el('label', {class: 'check'}, disp, ' Hay hoy (disponible)'),
      el('h4', {text: 'Opciones'}), ops],
    async () => {
      const opciones = ops.leer();
      await rpc('panel_producto_guardar', {p_sucursal: S.suc.id, p_producto: {id: p?.id, nombre: nombre.value.trim(), descripcion: desc.value.trim(),
        precio: Number(precio.value), categoria_id: cat.value || null, orden: Number(orden.value) || 0, activo: activo.checked, disponible: disp.checked, opciones}});
      aviso('Producto guardado'); verCarta();
    });
  }

  // ------------------------------------------------------------------------------------------- ajustes
  async function verAjustes() {
    contenido.replaceChildren(el('p', {class: 'nota', text: 'Cargando…'}));
    let a;
    try { a = await rpc('panel_config', {p_sucursal: S.suc.id}); } catch (e) { return contenido.replaceChildren(el('p', {class: 'error', text: e.message})); }
    const editable = puede('configurar');
    const enlace = 'https://gestlok.com.ar/chat/?s=' + encodeURIComponent(a.slug);
    const final = 'https://chat.gestlok.com.ar/' + a.slug;
    const qr = el('div', {class: 'qr', 'aria-label': 'Código QR del chat'});
    try { const q = window.qrcode(0, 'M'); q.addData(enlace); q.make(); qr.append(el('img', {alt: 'QR del chat', src: q.createDataURL(5, 2)})); } catch { /* sin QR */ }
    const f = {};
    const inp = (k, attrs) => { const i = el(attrs.tag || 'input', {...attrs, tag: undefined, disabled: !editable}); i.value = a[k] ?? ''; f[k] = i; return i; };
    const chk = (k, texto) => { const i = el('input', {type: 'checkbox', checked: !!a[k], disabled: !editable}); f[k] = i; return el('label', {class: 'check'}, i, ' ' + texto); };
    const medios = Object.entries(PAGOS).map(([v, t]) => { const i = el('input', {type: 'checkbox', value: v, checked: (a.medios_pago || []).includes(v), disabled: !editable}); return el('label', {class: 'check'}, i, ' ' + t); });
    const form = el('form', {class: 'ajustes', onsubmit: async e => {
      e.preventDefault();
      const elegidos = medios.map(l => l.querySelector('input')).filter(i => i.checked).map(i => i.value);
      if (!elegidos.length) return aviso('Elegí al menos un medio de pago.', true);
      if (!f.acepta_retiro.checked && !f.acepta_envio.checked) return aviso('Elegí retiro, envío o ambos.', true);
      try {
        await rpc('panel_config_guardar', {p_sucursal: S.suc.id, p_version: a.version, p_config: {
          activa: f.activa.checked, bienvenida: f.bienvenida.value, horario: f.horario.value, direccion: f.direccion.value,
          acepta_retiro: f.acepta_retiro.checked, acepta_envio: f.acepta_envio.checked, envio_costo: Number(f.envio_costo.value) || 0,
          envio_zona: f.envio_zona.value, pedido_minimo: Number(f.pedido_minimo.value) || 0, medios_pago: elegidos}});
        aviso('Ajustes guardados'); verAjustes();
      } catch (err) { aviso(err.message, true); }
    }},
    el('section', {class: 'bloque'}, el('h3', {text: 'Enlace para clientes'}),
      el('p', {class: 'enlace-publico'}, el('a', {href: enlace, target: '_blank', rel: 'noopener', text: enlace})),
      el('div', {class: 'fila-botones'}, el('button', {type: 'button', class: 'boton', text: 'Copiar enlace', onclick: async () => {
        try { await navigator.clipboard.writeText(enlace); aviso('Enlace copiado'); } catch { aviso('No se pudo copiar', true); } }})),
      qr, el('p', {class: 'nota', text: 'Cuando esté listo el subdominio, el enlace será ' + final + '.'})),
    el('section', {class: 'bloque'}, el('h3', {text: 'Estado'}), chk('activa', 'Chat abierto: los clientes pueden escribir y pedir')),
    el('section', {class: 'bloque'}, el('h3', {text: 'Lo que ve el cliente'}),
      campo('Mensaje de bienvenida (opcional)', inp('bienvenida', {tag: 'textarea', rows: '2', maxlength: '500'})),
      campo('Horario', inp('horario', {type: 'text', maxlength: '300', placeholder: 'Ej.: Todos los días de 11 a 15 y de 19 a 23'})),
      campo('Dirección del local', inp('direccion', {type: 'text', maxlength: '200'}))),
    el('section', {class: 'bloque'}, el('h3', {text: 'Entrega y pago'}), chk('acepta_retiro', 'Retiro en el local'), chk('acepta_envio', 'Envío a domicilio'),
      el('div', {class: 'dos'}, campo('Costo de envío', inp('envio_costo', {type: 'number', min: '0', step: '1', inputmode: 'numeric'})),
        campo('Pedido mínimo', inp('pedido_minimo', {type: 'number', min: '0', step: '1', inputmode: 'numeric'}))),
      campo('Zona de envío', inp('envio_zona', {type: 'text', maxlength: '300', placeholder: 'Ej.: Munro, Florida y Carapachay'})),
      el('p', {class: 'etiqueta', text: 'Medios de pago'}), el('div', {class: 'medios'}, medios)),
    editable ? el('button', {type: 'submit', class: 'boton principal ancho', text: 'Guardar ajustes'})
      : el('p', {class: 'nota', text: 'Solo el dueño puede cambiar estos ajustes.'}));
    contenido.replaceChildren(form);
  }

  // ------------------------------------------------------------------------------------------- conversaciones
  async function verCharlas() {
    contenido.replaceChildren(el('p', {class: 'nota', text: 'Cargando…'}));
    let r;
    try { r = await rpc('panel_conversaciones', {p_sucursal: S.suc.id, p_limite: 40}); } catch (e) { return contenido.replaceChildren(el('p', {class: 'error', text: e.message})); }
    contenido.replaceChildren(el('p', {class: 'nota', text: 'Solo lectura. Se borran solas a los 60 días; los pedidos quedan.'}),
      r.length ? el('div', {class: 'tarjetas'}, r.map(c => el('button', {type: 'button', class: 'charla', onclick: () => abrirCharla(c)},
        el('span', {class: 'charla-cab'}, el('strong', {text: hora(c.ultima_at)}), c.pedido ? el('span', {class: 'estado', text: c.pedido}) : null),
        el('span', {class: 'charla-ult', text: c.ultimo || ''})))) : el('p', {class: 'nota', text: 'Todavía no hay conversaciones.'}));
  }
  async function abrirCharla(c) {
    let m;
    try { m = await rpc('panel_conversacion', {p_conversacion: c.id}); } catch (e) { return aviso(e.message, true); }
    dialogo('Conversación · ' + hora(c.creada_at), [el('div', {class: 'hilo'}, m.map(x => el('p', {class: 'msj ' + x.rol, text: x.texto})))], null);
  }

  // ------------------------------------------------------------------------------------------- utilidades
  function campo(texto, control) { return el('label', {class: 'campo'}, el('span', {text: texto}), control); }
  function dialogo(titulo, cuerpo, guardar) {
    const d = el('dialog', {class: 'dialogo', 'aria-label': titulo});
    const error = el('p', {class: 'error', role: 'alert', hidden: true});
    const form = el('form', {method: 'dialog', onsubmit: async e => {
      if (!guardar) return;
      e.preventDefault();
      const b = form.querySelector('[type=submit]'); b.disabled = true; error.hidden = true;
      try { await guardar(); d.close(); } catch (err) { error.textContent = err.message; error.hidden = false; }
      finally { b.disabled = false; }
    }}, el('header', {}, el('h2', {text: titulo}), el('button', {type: 'button', class: 'cerrar', 'aria-label': 'Cerrar', text: '×', onclick: () => d.close()})),
    el('div', {class: 'dialogo-cuerpo'}, cuerpo), error,
    guardar ? el('footer', {}, el('button', {type: 'button', class: 'boton', text: 'Cancelar', onclick: () => d.close()}),
      el('button', {type: 'submit', class: 'boton principal', text: 'Guardar'})) : null);
    d.append(form); document.body.append(d);
    d.addEventListener('close', () => d.remove());
    d.showModal();
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && S.pestana === 'pedidos' && S.suc) verPedidos(); });

  // ------------------------------------------------------------------------------------------- demostración
  const D = {
    nivel: 'configurar',
    suc: [{id: 's1', nombre: 'Munro', slug: 'demo', activa: true, nivel: 'configurar', pendientes: 1}, {id: 's2', nombre: 'Don Torcuato', slug: 'demo-2', activa: false, nivel: 'configurar', pendientes: 0}],
    cats: [{id: 'c1', nombre: 'Empanadas', orden: 1, activa: true}, {id: 'c2', nombre: 'Pizzas', orden: 2, activa: true}],
    prods: [{id: 'p1', categoria_id: 'c1', nombre: 'Empanada de carne', descripcion: '', precio: 1200, activo: true, disponible: true, orden: 0, opciones: []},
      {id: 'p2', categoria_id: 'c1', nombre: 'Empanada de humita', descripcion: '', precio: 1200, activo: true, disponible: false, orden: 0, opciones: []},
      {id: 'p3', categoria_id: 'c2', nombre: 'Pizza muzzarella', descripcion: '', precio: 7500, activo: true, disponible: true, orden: 0, opciones: [
        {id: 'tam_0', nombre: 'Tamaño', tipo: 'una', obligatorio: true, valores: [{id: 'chica', nombre: 'Chica', extra: 0}, {id: 'grande', nombre: 'Grande', extra: 3000}]}]}],
    pedidos: [{id: 'x1', codigo: 'MM-0007', estado: 'pendiente', motivo: '', cliente_nombre: 'Ana Pérez', cliente_telefono: '1155551234', entrega: 'envio',
      direccion: 'Av. Mitre 2200, 3° B', horario: '21:30', medio_pago: 'transferencia', nota: 'Tocar timbre B', subtotal: 13900, envio: 800, total: 14700,
      creado_at: new Date().toISOString(), items: [{cantidad: 6, nombre: 'Empanada de carne', opciones: [], nota: '', importe: 7200},
        {cantidad: 1, nombre: 'Pizza muzzarella', opciones: [{grupo: 'Tamaño', valores: ['Chica']}], nota: 'bien cocida', importe: 7500}]},
      {id: 'x2', codigo: 'MM-0006', estado: 'confirmado', motivo: '', cliente_nombre: 'Beto', cliente_telefono: '1144443333', entrega: 'retiro', direccion: '',
        horario: '', medio_pago: 'efectivo', nota: '', subtotal: 3600, envio: 0, total: 3600, creado_at: new Date(Date.now() - 3600e3).toISOString(),
        items: [{cantidad: 3, nombre: 'Empanada de carne', opciones: [], nota: '', importe: 3600}]}],
    config: {slug: 'mi-gusto-munro', nombre: 'Munro', empresa: 'Mi Gusto', bienvenida: '', horario: 'Todos los días de 11 a 23', direccion: 'Av. Mitre 100',
      acepta_retiro: true, acepta_envio: true, envio_costo: 800, envio_zona: 'Munro y Florida', pedido_minimo: 3000, medios_pago: ['efectivo', 'transferencia'],
      activa: true, prefijo: 'MM', version: 3},
  };
  async function demoRpc(fn, a) {
    await new Promise(r => setTimeout(r, 120));
    switch (fn) {
      case 'panel_inicio': return {habilitado: true, empresa: 'Mi Gusto (demostración)', sucursales: D.suc};
      case 'panel_pedidos': return {nivel: D.nivel, pedidos: D.pedidos.filter(p => a.p_estado === 'todos' || p.estado === a.p_estado)};
      case 'panel_decidir': { const p = D.pedidos.find(x => x.id === a.p_pedido); if (p.estado !== 'pendiente') throw new Error('Este pedido ya fue resuelto'); p.estado = a.p_decision; p.motivo = a.p_motivo; return {ok: true}; }
      case 'panel_catalogo': return {categorias: D.cats, productos: D.prods, nivel: D.nivel};
      case 'panel_disponible': D.prods.find(p => p.id === a.p_producto).disponible = a.p_disponible; return {ok: true};
      case 'panel_producto_guardar': { const x = a.p_producto; if (x.id) Object.assign(D.prods.find(p => p.id === x.id), x); else D.prods.push({...x, id: 'n' + Date.now()}); return {ok: true}; }
      case 'panel_categoria_guardar': if (a.p_id) Object.assign(D.cats.find(c => c.id === a.p_id), {nombre: a.p_nombre, orden: a.p_orden, activa: a.p_activa}); else D.cats.push({id: 'k' + Date.now(), nombre: a.p_nombre, orden: a.p_orden, activa: a.p_activa}); return {ok: true};
      case 'panel_config': return {...D.config, nivel: D.nivel};
      case 'panel_config_guardar': Object.assign(D.config, a.p_config, {version: D.config.version + 1}); return {ok: true};
      case 'panel_conversaciones': return [{id: 'v1', creada_at: new Date().toISOString(), ultima_at: new Date().toISOString(), mensajes: 6, ultimo: '¡Listo! Enviamos tu pedido MM-0007 al local.', pedido: 'MM-0007 · pendiente'}];
      case 'panel_conversacion': return [{rol: 'asistente', texto: '¡Hola! ¿Qué te preparamos hoy?'}, {rol: 'cliente', texto: 'media docena de carne y una pizza chica'}, {rol: 'asistente', texto: 'Agregué: …'}];
      default: throw new Error('Demostración: ' + fn);
    }
  }

  iniciar();
})();

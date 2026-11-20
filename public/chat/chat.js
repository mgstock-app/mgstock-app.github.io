/* GESTLOK Chat · chat público para clientes (celular primero).
 * Habla solo con la función segura «gestlok-chat». Nunca usa innerHTML con datos: todo va por textContent.
 * Modo demostración sin red: ?demo=1 (usa el mismo motor con una carta de ejemplo).
 */
import {describirLinea, esCantidad, faltantes, pesos, responder, textoEstadoPedido, totalCarrito, unidades, urlResena, validarLinea, valoresDisponibles, PAGOS} from './motor.js?v=20261120sugerida1';

const CFG = window.GESTLOK_CHAT_CONFIG || {};
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

// replaceChildren sin «null» sueltos (se ignoran los hijos vacíos).
const poner = (nodo, ...hijos) => nodo.replaceChildren(...hijos.flat().filter(h => h !== null && h !== undefined && h !== false));
const params = new URLSearchParams(location.search);
const DEMO = params.get('demo') === '1';
function slugDeUrl() {
  const q = (params.get('s') || '').toLowerCase();
  if (q) return q;
  const partes = location.pathname.split('/').filter(Boolean).filter(p => p !== 'chat' && p !== 'index.html');
  return (partes[0] || '').toLowerCase();
}
const SLUG = DEMO ? 'demo' : slugDeUrl();

const S = {sucursal: null, catalogo: {categorias: [], productos: []}, carrito: [], pedido: null, enviando: false,
  ultimaEntrada: null, datos: {entrega: '', medio_pago: ''}, sondeo: 0, hojaFoco: null, categoria: '',
  ultimoLocal: 0, soportePendiente: false, identificado: false};

// Token anónimo de este teléfono (la base guarda solo su hash).
function token() {
  const clave = 'gestlok-chat:token:' + SLUG;
  try { const t = localStorage.getItem(clave); if (t && /^[A-Za-z0-9_-]{32,64}$/.test(t)) return t; } catch { /* sin almacenamiento */ }
  const b = crypto.getRandomValues(new Uint8Array(32));
  const t = btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  try { localStorage.setItem(clave, t); } catch { /* queda solo en memoria */ }
  return t;
}
const TOKEN = token();

// ---------------------------------------------------------------------------------------------- conexión
async function api(accion, extra = {}) {
  if (DEMO) return demoApi(accion, extra);
  const ctl = new AbortController(); const corte = setTimeout(() => ctl.abort(), 20000);
  try {
    const res = await fetch(CFG.funcion, {method: 'POST', signal: ctl.signal,
      headers: {'content-type': 'application/json', apikey: CFG.key || '', authorization: 'Bearer ' + (CFG.key || '')},
      body: JSON.stringify({slug: SLUG, token: TOKEN, accion, ...extra})});
    let body = null; try { body = await res.json(); } catch { /* respuesta vacía */ }
    if (!body) throw new Error('red');
    return {status: res.status, ...body};
  } finally { clearTimeout(corte); }
}

// ---------------------------------------------------------------------------------------------- mensajes
const lista = $('mensajes');
function bajar() { requestAnimationFrame(() => { lista.scrollTop = lista.scrollHeight; }); }
function burbuja(rol, texto) { lista.append(el('div', {class: 'burbuja ' + rol, text: texto})); bajar(); }
function quitarChips() { lista.querySelectorAll('.chips,.accion').forEach(n => n.remove()); }
function chips(botones) {
  if (!botones?.length) return;
  lista.append(el('div', {class: 'chips'}, botones.map(b => el('button', {type: 'button', class: 'chip', text: b.texto,
    onclick: () => tocarBoton(b)}))));
  bajar();
}
function accion(texto, fn) { lista.append(el('button', {type: 'button', class: 'accion', text: texto, onclick: fn})); bajar(); }
function mensajeAsistente(m, {abrir = true} = {}) {
  burbuja('asistente', m.texto);
  if (m.tipo === 'carta') {
    // Venta sugerida: abre la carta directo en la categoría ofrecida (postres, bebidas…).
    if (m.categoria && S.catalogo.categorias.some(c => c.id === m.categoria)) S.categoria = m.categoria;
    accion('Ver la carta', abrirCarta); if (abrir) abrirCarta();
  }
  else if (m.tipo === 'producto') {
    const p = producto(m.productos?.[0]);
    if (p) { accion('Elegir opciones de ' + p.nombre, () => abrirProducto(p, m)); if (abrir) abrirProducto(p, m); }
  } else if (m.tipo === 'datos') { accion('Completar mis datos', abrirDatos); if (abrir) abrirDatos(); }
  else if (m.tipo === 'carrito') accion('Ver mi pedido', abrirCarrito);
  chips(m.botones);
}
let escribiendo = null;
function mostrarEscribiendo(si) {
  if (si && !escribiendo) { escribiendo = el('div', {class: 'escribiendo', 'aria-label': 'Escribiendo'}, el('i'), el('i'), el('i')); lista.append(escribiendo); bajar(); }
  if (!si && escribiendo) { escribiendo.remove(); escribiendo = null; }
}

const producto = id => S.catalogo.productos.find(p => p.id === id);
const BOTONES_BASE = () => S.carrito.length
  ? [{id: 'finalizar', texto: 'Finalizar pedido'}, {id: 'carta', texto: 'Agregar más'}, {id: 'soporte', texto: 'Ayuda con mi pedido'}]
  : [{id: 'carta', texto: 'Ver menú'}, {id: 'horario', texto: 'Horario y envío'},
      {id: 'pago', texto: 'Medios de pago'}, {id: 'soporte', texto: 'Ayuda con mi pedido'}];

async function enviar(entrada, textoVisible) {
  // Los datos personales no se escriben en el historial del chat. Se adjuntan recién al enviar el pedido.
  if (!S.identificado) { abrirIdentificacion(); return; }
  if (S.enviando) return;
  S.enviando = true; S.ultimaEntrada = {entrada, textoVisible};
  quitarChips();
  if (textoVisible) burbuja('cliente', textoVisible);
  mostrarEscribiendo(true); bloquear(true);
  try {
    const r = await api('mensaje', {entrada});
    mostrarEscribiendo(false);
    if (!r.ok) {
      if (r.motivo === 'pausado') {
        $('titulo').textContent = [r.sucursal?.empresa, r.sucursal?.nombre].filter(Boolean).join(' · ') ||
          $('titulo').textContent;
        pantallaFija('Chat en pausa', r.sucursal?.mensaje || 'El local pausó temporalmente la atención por chat.');
        return;
      }
      lista.querySelectorAll('.burbuja.error').forEach(n => n.remove());
      burbuja('error', r.error || 'No se pudo procesar la consulta. Probá de nuevo.');
      chips([{id: '__reintentar', texto: 'Reintentar'}]); return;
    }
    if (r.atencion && S.sucursal) S.sucursal.atencion = r.atencion;
    actualizarCarrito(r.carrito);
    if (typeof r.soporte_pendiente === 'boolean') {
      S.soportePendiente = r.soporte_pendiente;
      programarSondeo();
    }
    for (const m of r.mensajes || []) mensajeAsistente(m);
    if (r.pedido) mostrarPedido(r.pedido);
  } catch {
    mostrarEscribiendo(false);
    burbuja('error', 'Sin conexión. Revisá tu internet.');
    chips([{id: '__reintentar', texto: 'Reintentar'}]);
  } finally { S.enviando = false; bloquear(false); }
}
function tocarBoton(b) {
  if (b.id === '__reintentar' && S.ultimaEntrada) {
    quitarChips(); lista.querySelectorAll('.burbuja.error').forEach(n => n.remove());
    return enviar(S.ultimaEntrada.entrada, null);
  }
  if (b.id === 'carta') return abrirCarta();
  enviar({boton: b.id}, b.texto);
}
function bloquear(si) { $('btn-enviar').disabled = si || !$('texto').value.trim(); $('btn-finalizar').disabled = si; }

// ---------------------------------------------------------------------------------------------- carrito y pedido
function actualizarCarrito(c) {
  if (Array.isArray(c)) S.carrito = c;
  const n = S.carrito.reduce((s, l) => s + l.cantidad, 0);
  $('barra-pedido').hidden = !S.carrito.length;
  $('barra-texto').textContent = n + (n === 1 ? ' producto' : ' productos') + ' · ' + pesos(totalCarrito(S.catalogo, S.carrito));
}
const TEXTO_ESTADO = {
  pendiente: ['Pendiente de confirmación', 'El gerente debe revisar y confirmar su pedido'],
  confirmado: ['Pedido confirmado', 'El local lo está preparando'],
  terminado: ['¡Pedido listo!', ''],
  rechazado: ['El local no pudo tomarlo', ''],
  cancelado: ['Pedido cancelado', ''],
};
/** Pedido listo o enviado: aviso, invitación a reseñar (si el local cargó su link de Google) y cierre.
 * Una sola vez por pedido en este teléfono, aunque el cliente cierre el chat y vuelva más tarde (hasta 24 h). */
function despedidaPedido(p) {
  if (p.estado !== 'terminado' || Date.now() - new Date(p.creado_at).getTime() > 864e5) return;
  const clave = 'gestlok-chat:cierre:' + (S.sucursal?.slug || '') + ':' + p.creado_at;
  try { if (localStorage.getItem(clave)) return; localStorage.setItem(clave, '1'); } catch { /* sin almacenamiento: se muestra igual */ }
  // Si el cliente acaba de consultar el estado, el aviso ya está en pantalla: no se repite.
  const yaVisto = [...lista.querySelectorAll('.burbuja')].slice(-3).some(b => b.textContent === p.aviso);
  if (p.aviso && !yaVisto) burbuja('asistente', p.aviso);
  const url = urlResena(p.resena?.url);
  if (url) {
    lista.append(el('div', {class: 'burbuja asistente resena'}, String(p.resena.texto || ''),
      el('a', {class: 'boton chico resena-link', href: url, target: '_blank', rel: 'noopener noreferrer', text: 'Dejar mi reseña en Google'})));
  }
  if (p.cierre) burbuja('asistente', p.cierre);
  bajar();
  try { navigator.vibrate?.(120); } catch { /* sin vibración */ }
}
function mostrarPedido(p) {
  const antes = S.pedido;
  S.pedido = p;
  const caja = $('aviso-pedido');
  if (!p) { caja.hidden = true; return; }
  const envio = p.entrega === 'envio';
  const [t, sub] = p.estado === 'terminado' && envio ? ['¡Pedido en camino!', ''] : (TEXTO_ESTADO[p.estado] || [p.estado, '']);
  const resena = p.estado === 'terminado' ? urlResena(p.resena?.url) : '';
  const programado = p.estado === 'pendiente' && p.programado_para && new Date(p.programado_para).getTime()>Date.now();
  const etiqueta = programado ? 'Programado para '+new Date(p.programado_para).toLocaleString('es-AR',{
    timeZone:'America/Argentina/Buenos_Aires',weekday:'short',hour:'2-digit',minute:'2-digit'}) : t;
  caja.className = 'aviso-pedido ' + p.estado;
  caja.replaceChildren(...[el('span', {class: 'punto', 'aria-hidden': 'true'}),
    el('div', {}, el('strong', {text: etiqueta}), (p.estado === 'rechazado' && p.motivo ? p.motivo
      : p.estado === 'terminado' ? (envio ? 'Va en camino a su dirección' : 'Puede pasar a retirar con su nombre') : sub) + ' · ' + pesos(p.total)),
    p.estado === 'pendiente' ? el('button', {type: 'button', text: 'Cancelar', onclick: () => enviar({boton: 'cancelar'}, 'Cancelar pedido')}) : null,
    resena ? el('a', {href: resena, target: '_blank', rel: 'noopener noreferrer', text: 'Dejar reseña'}) : null].filter(Boolean));
  caja.hidden = false;
  const cambio = antes && antes.creado_at === p.creado_at && antes.estado !== p.estado && ['pendiente','confirmado'].includes(antes.estado);
  if (p.estado === 'terminado' && (cambio || !antes)) despedidaPedido(p);
  else if (cambio) {
    // El texto lo arma la función con los mensajes que configuró el local.
    if (p.aviso && ['confirmado', 'rechazado'].includes(p.estado)) burbuja('asistente', p.aviso);
    try { navigator.vibrate?.(120); } catch { /* sin vibración */ }
  }
  programarSondeo();
}
function programarSondeo() {
  clearTimeout(S.sondeo);
  if (!S.soportePendiente && !['pendiente', 'confirmado'].includes(S.pedido?.estado)) return;
  S.sondeo = setTimeout(async () => {
    // Mantener contacto con el gerente durante soporte, aun si el cliente cambia de pestaña.
    if (document.hidden && !S.soportePendiente) return programarSondeo();
    try {
      const r = await api('estado', {desde: S.ultimoLocal});
      if (r.ok) {
        for (const m of r.mensajes_local || []) {
          if (!Number.isSafeInteger(m.id) || m.id <= S.ultimoLocal) continue;
          S.ultimoLocal = m.id;
          burbuja('local', m.texto);
          try { navigator.vibrate?.(100); } catch { /* opcional */ }
        }
        if (typeof r.soporte_pendiente === 'boolean') S.soportePendiente = r.soporte_pendiente;
        if (r.pedidos?.[0]) mostrarPedido(r.pedidos[0]);
        else programarSondeo();
      } else programarSondeo();
    } catch { programarSondeo(); }
  }, 12000);
}
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && (S.soportePendiente || ['pendiente', 'confirmado'].includes(S.pedido?.estado))) programarSondeo();
});

// ---------------------------------------------------------------------------------------------- hojas
function abrirHoja(titulo, contenido) {
  S.hojaFoco = S.hojaFoco || document.activeElement;
  $('hoja-titulo').textContent = titulo;
  $('hoja-cuerpo').replaceChildren(contenido);
  $('hoja').hidden = false; $('fondo-hoja').hidden = false;
  $('hoja-cuerpo').scrollTop = 0;
  const primero = $('hoja').querySelector('input:not([type=hidden]),select,textarea,button.chip,button.producto');
  (primero || $('hoja-cerrar')).focus({preventScroll: true});
}
function cerrarHoja() {
  // Identificación inicial obligatoria: no se puede avanzar sin contacto y modalidad de entrega.
  if (!S.identificado) return;
  $('hoja').hidden = true; $('fondo-hoja').hidden = true;
  const f = S.hojaFoco; S.hojaFoco = null;
  if (f && document.contains(f)) f.focus({preventScroll: true});
}
$('hoja-cerrar').onclick = cerrarHoja;
$('fondo-hoja').onclick = cerrarHoja;
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('hoja').hidden) cerrarHoja(); });

function abrirCarta() {
  if (!S.identificado) { abrirIdentificacion(); return; }
  const cats = S.catalogo.categorias.filter(c => S.catalogo.productos.some(p => p.categoria_id === c.id));
  const cuerpo = el('div');
  const pintar = () => {
    const prods = S.catalogo.productos.filter(p => !S.categoria || p.categoria_id === S.categoria);
    poner(cuerpo,
      cats.length > 1 ? el('div', {class: 'categorias', role: 'toolbar', 'aria-label': 'Categorías'},
        [{id: '', nombre: 'Todo'}, ...cats].map(c => el('button', {type: 'button', class: 'chip', text: c.nombre,
          'aria-pressed': String(S.categoria === c.id), onclick: () => { S.categoria = c.id; pintar(); }}))) : null,
      prods.length ? el('ul', {class: 'lista'}, prods.map(p => el('li', {}, el('button', {type: 'button', class: 'producto',
        disabled: p.disponible === false, onclick: () => abrirProducto(p)},
        el('span', {class: 'producto-texto'}, el('strong', {text: p.nombre}), p.descripcion ? el('small', {text: p.descripcion}) : null),
        p.disponible === false ? el('span', {class: 'agotado', text: 'Agotado'}) : el('span', {class: 'precio', text: pesos(p.precio)}),
        p.disponible === false ? null : el('span', {class: 'mas', 'aria-hidden': 'true', text: '+'})))))
        : el('p', {class: 'nota', text: 'Todavía no hay productos cargados.'}));
  };
  pintar();
  abrirHoja('Carta', cuerpo);
}

function abrirProducto(p, sugerido = {}) {
  let cantidad = Math.min(50, Math.max(1, Number(sugerido.cantidad) || 1));
  const elegidas = {};
  for (const g of p.opciones || []) elegidas[g.id] = esCantidad(g) ? {...(sugerido.opciones?.[g.id] || {})} : [...(sugerido.opciones?.[g.id] || [])];
  const contadores = []; // se actualizan en cada cambio (promos: «4 de 6»)
  const salida = el('output', {'aria-live': 'polite', text: String(cantidad)});
  const nota = el('input', {type: 'text', maxlength: '200', placeholder: 'Ej.: bien cocida, sin cebolla'});
  const error = el('p', {class: 'error-form', role: 'alert', hidden: true});
  const boton = el('button', {type: 'submit', class: 'boton principal ancho'});
  const linea = () => ({producto_id: p.id, cantidad, nota: nota.value.trim(), opciones: Object.fromEntries(Object.entries(elegidas)
    .map(([k, v]) => [k, Array.isArray(v) ? v : Object.fromEntries(Object.entries(v).filter(([, n]) => n > 0))])
    .filter(([, v]) => Array.isArray(v) ? v.length : Object.keys(v).length))});
  const refrescar = () => {
    salida.textContent = String(cantidad);
    for (const c of contadores) c();
    const falta = faltantes(p, linea().opciones).find(esCantidad);
    boton.disabled = !!falta;
    boton.textContent = falta ? 'Elegí ' + (Number(falta.total) - unidades(elegidas[falta.id])) + ' más en ' + falta.nombre.toLowerCase()
      : 'Agregar · ' + pesos(totalCarrito(S.catalogo, [linea()]));
  };
  // Promo o combo: repartir un total exacto entre variedades (se pueden repetir), con botones − y +.
  const grupoCantidad = g => {
    const total = Number(g.total) || 1;
    const resumen = el('small', {'aria-live': 'polite'});
    contadores.push(() => { const u = unidades(elegidas[g.id]); resumen.textContent = u + ' de ' + total; resumen.classList.toggle('completo', u === total); });
    const filas = valoresDisponibles(S.catalogo, g).map(v => {
      const n = el('output', {class: 'n', text: String(elegidas[g.id][v.id] || 0)});
      const menos = el('button', {type: 'button', class: 'paso', 'aria-label': 'Quitar ' + v.nombre, text: '−'});
      const mas = el('button', {type: 'button', class: 'paso', 'aria-label': 'Sumar ' + v.nombre, text: '+'});
      const fila = el('div', {class: 'opcion opcion-cantidad'}, el('span', {text: v.nombre}),
        Number(v.extra) > 0 ? el('em', {text: '+ ' + pesos(v.extra)}) : null, el('div', {class: 'pasos'}, menos, n, mas));
      const cambiar = d => {
        const actual = elegidas[g.id][v.id] || 0, u = unidades(elegidas[g.id]);
        if (d > 0 && u >= total) return;
        elegidas[g.id][v.id] = Math.max(0, actual + d);
        error.hidden = true; refrescar();
      };
      menos.addEventListener('click', () => cambiar(-1));
      mas.addEventListener('click', () => cambiar(1));
      contadores.push(() => {
        const k = elegidas[g.id][v.id] || 0, u = unidades(elegidas[g.id]);
        n.textContent = String(k); menos.disabled = k === 0; mas.disabled = u >= total; fila.classList.toggle('elegida', k > 0);
      });
      return fila;
    });
    return el('fieldset', {class: 'grupo grupo-cantidad'}, el('legend', {}, g.nombre, el('small', {text: 'Elegí ' + total + (total > 1 ? ' · podés repetir' : '')}), resumen),
      filas.length ? filas : el('p', {class: 'nota', text: 'Hoy no hay variedades disponibles.'}));
  };
  const grupos = (p.opciones || []).map(g => esCantidad(g) ? grupoCantidad(g) : el('fieldset', {class: 'grupo'},
    el('legend', {}, g.nombre, el('small', {text: g.tipo === 'una' ? (g.obligatorio ? 'Elegí 1' : 'Opcional') : 'Hasta ' + g.max + (g.obligatorio ? ' · obligatorio' : '')})),
    g.valores.map(v => {
      const input = el('input', {type: g.tipo === 'una' ? 'radio' : 'checkbox', name: 'g-' + g.id, value: v.id, checked: elegidas[g.id].includes(v.id)});
      input.addEventListener('change', () => {
        if (g.tipo === 'una') elegidas[g.id] = [v.id];
        else if (input.checked) {
          if (elegidas[g.id].length >= g.max) { input.checked = false; error.textContent = 'En ' + g.nombre.toLowerCase() + ' podés elegir hasta ' + g.max + '.'; error.hidden = false; return; }
          elegidas[g.id].push(v.id);
        } else elegidas[g.id] = elegidas[g.id].filter(x => x !== v.id);
        error.hidden = true; refrescar();
      });
      return el('label', {class: 'opcion'}, input, el('span', {text: v.nombre}), Number(v.extra) > 0 ? el('em', {text: '+ ' + pesos(v.extra)}) : null);
    })));
  const form = el('form', {onsubmit: e => {
    e.preventDefault();
    const l = linea(); const problema = validarLinea(S.catalogo, l);
    if (problema) { error.textContent = problema; error.hidden = false; return; }
    cerrarHoja();
    enviar({agregar: l}, 'Agregar: ' + describirLinea(S.catalogo, l));
  }},
  p.descripcion ? el('p', {class: 'nota', text: p.descripcion}) : null,
  el('p', {class: 'precio', text: pesos(p.precio)}),
  grupos,
  el('div', {class: 'cantidad'}, el('button', {type: 'button', 'aria-label': 'Menos', text: '−', onclick: () => { cantidad = Math.max(1, cantidad - 1); refrescar(); }}),
    salida, el('button', {type: 'button', 'aria-label': 'Más', text: '+', onclick: () => { cantidad = Math.min(50, cantidad + 1); refrescar(); }})),
  el('label', {class: 'campo'}, el('span', {text: 'Aclaración (opcional)'}), nota),
  error, boton);
  refrescar();
  abrirHoja(p.nombre, form);
}

function abrirCarrito() {
  const cuerpo = el('div',
    S.carrito.length ? S.carrito.map((l, i) => el('div', {class: 'linea'},
      el('div', {}, describirLinea(S.catalogo, l), el('small', {text: pesos(totalCarrito(S.catalogo, [l]))})),
      el('button', {type: 'button', class: 'boton chico', text: 'Quitar', onclick: () => { cerrarHoja(); enviar({quitar: i}, 'Quitar ' + (producto(l.producto_id)?.nombre || 'producto')); }})))
      : el('p', {class: 'nota', text: 'Tu pedido está vacío.'}),
    el('div', {class: 'total'}, el('span', {text: 'Total estimado'}), el('span', {text: pesos(totalCarrito(S.catalogo, S.carrito))})),
    el('p', {class: 'nota', text: 'El total final lo calcula el local con los precios vigentes.'}),
    S.carrito.length ? el('button', {type: 'button', class: 'boton principal ancho', text: 'Finalizar pedido', onclick: () => { cerrarHoja(); enviar({boton: 'finalizar'}, 'Finalizar pedido'); }}) : null);
  abrirHoja('Tu pedido', cuerpo);
}

function abrirIdentificacion() {
  if (!S.sucursal || S.identificado) return;
  const s = S.sucursal, d = S.datos;
  if (!d.entrega) d.entrega = s.acepta_retiro ? 'retiro' : 'envio';
  const campo = (clave, etiqueta, tipo, attrs = {}) => {
    const input = el('input', {type: tipo, name: clave, maxlength: clave === 'nombre' ? '80' : clave === 'telefono' ? '25' : '200', ...attrs});
    input.value = d[clave] || '';
    input.addEventListener('input', () => { d[clave] = input.value; });
    return el('label', {class: 'campo'}, el('span', {text: etiqueta}), input);
  };
  const opciones = [s.acepta_retiro && ['retiro', 'Retiro en el local'], s.acepta_envio && ['envio', 'Envío a domicilio']].filter(Boolean);
  const direccion = campo('direccion', 'Dirección de entrega', 'text', {autocomplete:'street-address', placeholder:'Calle, número y localidad'});
  const error = el('p', {class:'error-form', role:'alert', hidden:true});
  const refrescar = () => { direccion.hidden = d.entrega !== 'envio'; };
  const elegir = el('div', {class:'segmentado', role:'radiogroup', 'aria-label':'Modalidad del pedido'}, opciones.map(([valor, nombre]) => {
    const input = el('input', {type:'radio', name:'identificacion-entrega', value:valor, checked:d.entrega === valor});
    input.addEventListener('change', () => { d.entrega = valor; refrescar(); });
    return el('label', {}, input, nombre);
  }));
  const formulario = el('form', {onsubmit: ev => {
    ev.preventDefault();
    const tel = String(d.telefono || '').replace(/\D/g, '');
    const problema = String(d.nombre || '').trim().length < 2 ? 'Ingrese su nombre.'
      : tel.length < 8 || tel.length > 15 ? 'Ingrese un teléfono válido con código de área.'
      : !opciones.some(([v]) => v === d.entrega) ? 'Seleccione retiro o envío.'
      : d.entrega === 'envio' && String(d.direccion || '').trim().length < 5 ? 'Ingrese la dirección de entrega.' : '';
    if (problema) { error.textContent = problema; error.hidden = false; return; }
    // Datos solo en memoria hasta el envío final: no se agregan a mensajes ni almacenamiento local.
    S.identificado = true;
    $('hoja-cerrar').hidden = false;
    $('fondo-hoja').onclick = cerrarHoja;
    cerrarHoja();
    burbuja('asistente', 'Gracias, ' + String(d.nombre).trim() + '. Ya puede elegir sus productos o consultar nuestra carta.');
    chips(BOTONES_BASE());
    $('texto').disabled = false; $('btn-carta').disabled = false;
    $('texto').focus({preventScroll:true});
  }},
  el('p', {class:'nota', text:'Antes de empezar, necesitamos sus datos de contacto. No se mostrarán en la conversación.'}),
  campo('nombre', 'Nombre y apellido', 'text', {autocomplete:'name', required:true}),
  campo('telefono', 'Teléfono de contacto', 'tel', {autocomplete:'tel', inputmode:'tel', placeholder:'Ej.: 11 5555 1234', required:true}),
  opciones.length > 1 ? elegir : el('p', {class:'nota', text: opciones[0]?.[1] || ''}),
  direccion,
  el('p', {class:'nota', text:'El gerente revisará y confirmará manualmente el pedido. Sus datos se enviarán al local al finalizarlo.'}),
  error,
  el('button', {type:'submit', class:'boton principal ancho', text:'Continuar con mi pedido'}));
  refrescar();
  abrirHoja('Datos para iniciar', formulario);
  $('hoja-cerrar').hidden = true;
  $('fondo-hoja').onclick = () => {};
}

function abrirDatos() {
  const s = S.sucursal; const d = S.datos;
  if (!d.entrega) d.entrega = s.acepta_retiro ? 'retiro' : 'envio';
  const medios = entrega => {
    const lista = entrega === 'envio' ? s.medios_pago_envio : s.medios_pago_retiro;
    return Array.isArray(lista) && lista.length ? lista : (s.medios_pago || ['efectivo']);
  };
  if (!d.medio_pago) d.medio_pago = medios(d.entrega)[0] || 'efectivo';
  const campo = (nombre, etiqueta, attrs) => {
    const i = el(attrs.tag || 'input', {name: nombre, ...attrs, tag: undefined});
    i.value = d[nombre] || ''; i.addEventListener('input', () => { d[nombre] = i.value; });
    return el('label', {class: 'campo'}, el('span', {text: etiqueta}), i);
  };
  const dir = campo('direccion', 'Dirección de entrega', {type: 'text', maxlength: '200', autocomplete: 'street-address', placeholder: 'Calle, número, piso, entre calles'});
  const totalTxt = el('span');
  const refrescar = () => {
    dir.hidden = d.entrega !== 'envio';
    const disponibles = medios(d.entrega);
    pago.replaceChildren(...disponibles.map(m => el('option', {value: m, text: PAGOS[m] || m})));
    if (!disponibles.includes(d.medio_pago)) d.medio_pago = disponibles[0] || 'efectivo';
    pago.value = d.medio_pago;
    const envio = d.entrega === 'envio' ? Number(s.envio_costo) || 0 : 0;
    totalTxt.textContent = pesos(totalCarrito(S.catalogo, S.carrito) + envio);
  };
  const entregas = [s.acepta_retiro && ['retiro', 'Retiro en el local'], s.acepta_envio && ['envio', 'Envío' + (Number(s.envio_costo) > 0 ? ' · ' + pesos(s.envio_costo) : '')]].filter(Boolean);
  const pago = el('select', {name: 'medio_pago'});
  pago.value = d.medio_pago; pago.addEventListener('change', () => { d.medio_pago = pago.value; });
  const error = el('p', {class: 'error-form', role: 'alert', hidden: true});
  const form = el('form', {onsubmit: e => {
    e.preventDefault();
    const tel = String(d.telefono || '').replace(/\D/g, '');
    const problema = String(d.nombre || '').trim().length < 2 ? 'Ingrese su nombre.'
      : tel.length < 8 || tel.length > 15 ? 'Ingrese un teléfono válido (con código de área).'
      : d.entrega === 'envio' && String(d.direccion || '').trim().length < 5 ? 'Ingrese la dirección de entrega.' : '';
    if (problema) { error.textContent = problema; error.hidden = false; return; }
    cerrarHoja();
    enviar({datos: {...d}}, 'Enviar pedido');
  }},
  campo('nombre', 'Nombre', {type: 'text', maxlength: '80', autocomplete: 'name', required: true}),
  campo('telefono', 'Teléfono de contacto', {type: 'tel', maxlength: '25', autocomplete: 'tel', inputmode: 'tel', placeholder: 'Ej.: 11 5555 1234', required: true}),
  entregas.length > 1 ? el('div', {class: 'segmentado', role: 'radiogroup', 'aria-label': 'Entrega'}, entregas.map(([v, t]) => {
    const r = el('input', {type: 'radio', name: 'entrega', value: v, checked: d.entrega === v});
    r.addEventListener('change', () => { d.entrega = v; refrescar(); });
    return el('label', {}, r, t);
  })) : el('p', {class: 'nota', text: entregas[0]?.[1] || ''}),
  dir,
  el('label', {class: 'campo'}, el('span', {text: 'Medio de pago'}), pago),
  s.atencion?.habilitado && !s.atencion.abierto
    ? el('p',{class:'nota',text:'Pedido para la próxima apertura: '+s.atencion.proximo_texto+'. El gerente lo confirmará manualmente.'})
    : campo('horario', '¿Para cuándo? (opcional)', {type: 'text', maxlength: '60', placeholder: 'Lo antes posible'}),
  campo('nota', 'Aclaraciones (opcional)', {tag: 'textarea', maxlength: '500', rows: '2'}),
  el('div', {class: 'total'}, el('span', {text: 'Total estimado'}), totalTxt),
  el('p', {class: 'nota', text: 'El gerente revisará y confirmará su pedido antes de prepararlo. Le informaremos por este chat. Sus datos se usan únicamente para el pedido.'}),
  error,
  el('button', {type: 'submit', class: 'boton principal ancho', text: 'Enviar pedido'}));
  refrescar();
  abrirHoja('Sus datos', form);
}

function abrirInfo() {
  const s = S.sucursal;
  const filas = [['Horario', s.horario || 'Sin cargar'], ['Dirección', s.direccion || 'Sin cargar'],
    ['Entrega', [s.acepta_retiro && 'Retiro en el local', s.acepta_envio && ('Envío' + (s.envio_zona ? ' a ' + s.envio_zona : '') + (Number(s.envio_costo) > 0 ? ' · ' + pesos(s.envio_costo) : ''))].filter(Boolean).join(' · ')],
    s.acepta_retiro ? ['Pago · retiro en local', (s.medios_pago_retiro || s.medios_pago || []).map(m => PAGOS[m] || m).join(', ')] : null,
    s.acepta_envio ? ['Pago · delivery', (s.medios_pago_envio || s.medios_pago || []).map(m => PAGOS[m] || m).join(', ')] : null,
    Number(s.pedido_minimo) > 0 ? ['Pedido mínimo', pesos(s.pedido_minimo)] : null].filter(Boolean);
  abrirHoja(s.empresa + ' · ' + s.nombre, el('div', {}, filas.map(([k, v]) => el('div', {class: 'linea'}, el('div', {}, el('small', {text: k}), v)))));
}

// ---------------------------------------------------------------------------------------------- redactar
const texto = $('texto');
texto.addEventListener('input', () => {
  texto.style.height = 'auto'; texto.style.height = Math.min(120, texto.scrollHeight) + 'px';
  $('btn-enviar').disabled = S.enviando || !texto.value.trim();
});
texto.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('redactar').requestSubmit(); }
});
$('redactar').addEventListener('submit', e => {
  e.preventDefault();
  const t = texto.value.trim();
  if (!t || S.enviando) return;
  texto.value = ''; texto.style.height = 'auto';
  enviar({texto: t}, t);
});
$('btn-carta').onclick = abrirCarta;
$('btn-carrito').onclick = abrirCarrito;
$('btn-finalizar').onclick = () => enviar({boton: 'finalizar'}, 'Finalizar pedido');
$('btn-info').onclick = abrirInfo;

// ---------------------------------------------------------------------------------------------- inicio
function pantallaFija(titulo, detalle) {
  $('app').setAttribute('aria-busy', 'false');
  $('redactar').hidden = true;
  $('barra-pedido').hidden = true;
  $('btn-carta').disabled = true;
  lista.replaceChildren(el('div', {class: 'pausado'}, el('h2', {text: titulo}), el('p', {text: detalle})));
}
async function iniciar() {
  if (!SLUG) return pantallaFija('Chat no encontrado', 'Revisá el enlace que te compartió el local.');
  if (DEMO) $('app').prepend(el('div', {class: 'demo', text: 'Modo demostración: los pedidos no se envían a ningún local.'}));
  let r;
  try { r = await api('abrir'); } catch {
    return pantallaFija('Sin conexión', 'No pudimos abrir el chat. Revisá tu internet y recargá la página.');
  }
  if (!r.ok) {
    if (r.motivo === 'pausado') {
      $('titulo').textContent = [r.sucursal?.empresa, r.sucursal?.nombre].filter(Boolean).join(' · ') || 'Chat en pausa';
      return pantallaFija('Chat en pausa', r.sucursal?.mensaje || 'Ahora no estamos tomando pedidos por chat. Volvé a intentar más tarde.');
    }
    return pantallaFija('Chat no encontrado', r.error && r.status !== 404 ? r.error : 'Revisá el enlace que te compartió el local.');
  }
  S.sucursal = r.sucursal; S.catalogo = r.catalogo || S.catalogo;
  S.soportePendiente = r.soporte_pendiente === true;
  S.ultimoLocal = Math.max(0, ...(r.mensajes || []).filter(m => m.rol === 'local')
    .map(m => Number.isSafeInteger(m.id) ? m.id : 0));
  const nombre = [r.sucursal.empresa, r.sucursal.nombre].filter(Boolean).join(' · ');
  document.title = nombre + ' · Pedidos por chat';
  $('titulo').textContent = nombre;
  $('subtitulo').textContent = r.sucursal.horario || 'Pedidos por chat';
  $('avatar').textContent = (r.sucursal.empresa || r.sucursal.nombre || 'G').trim().charAt(0).toUpperCase();
  $('btn-info').hidden = false;
  for (const [indice, m] of (r.mensajes || []).entries()) {
    const antiguo = indice === 0 && m.rol === 'asistente' && /Podés escribirme tu pedido, por ejemplo/.test(m.texto);
    burbuja(m.rol === 'cliente' ? 'cliente' : m.rol === 'local' ? 'local' : 'asistente',
      antiguo && r.sucursal.bienvenida ? r.sucursal.bienvenida : m.texto);
  }
  for (const m of r.nuevos || []) mensajeAsistente(m, {abrir: false});
  actualizarCarrito(r.carrito);
  if (!(r.nuevos || []).length) chips(BOTONES_BASE());
  if (r.pedidos?.[0]) mostrarPedido(r.pedidos[0]);
  if (S.soportePendiente) programarSondeo();
  $('app').setAttribute('aria-busy', 'false');
  // El saludo se ve primero; antes de usar el pedido se solicitan los datos obligatorios.
  abrirIdentificacion();
}

// ---------------------------------------------------------------------------------------------- demostración
const DEMO_DATOS = {
  sucursal: {slug: 'demo', nombre: 'Sucursal Centro', empresa: 'Tu Comercio', bienvenida: '', horario: 'Todos los días de 11 a 23',
    direccion: 'Av. Siempre Viva 742', acepta_retiro: true, acepta_envio: true, envio_costo: 800, envio_zona: 'hasta 20 cuadras',
    pedido_minimo: 3000, medios_pago: ['efectivo', 'transferencia', 'mercado_pago']},
  catalogo: {categorias: [{id: 'c1', nombre: 'Empanadas'}, {id: 'c2', nombre: 'Pizzas'}, {id: 'c3', nombre: 'Postres'}],
    productos: [
      {id: 'd1', categoria_id: 'c1', nombre: 'Empanada de carne', descripcion: 'Cortada a cuchillo', precio: 1200, activo: true, disponible: true, opciones: []},
      {id: 'd2', categoria_id: 'c1', nombre: 'Empanada de jamón y queso', descripcion: '', precio: 1200, activo: true, disponible: true, opciones: []},
      {id: 'd3', categoria_id: 'c1', nombre: 'Empanada de humita', descripcion: '', precio: 1200, activo: true, disponible: false, opciones: []},
      {id: 'd4', categoria_id: 'c2', nombre: 'Pizza muzzarella', descripcion: 'Salsa de tomate y muzzarella', precio: 7500, activo: true, disponible: true, opciones: [
        {id: 'tam', nombre: 'Tamaño', tipo: 'una', obligatorio: true, valores: [{id: 'chica', nombre: 'Chica'}, {id: 'grande', nombre: 'Grande', extra: 3000}]},
        {id: 'ext', nombre: 'Extras', tipo: 'varias', max: 2, valores: [{id: 'acei', nombre: 'Aceitunas', extra: 500}, {id: 'huevo', nombre: 'Huevo', extra: 600}]}]},
      {id: 'd5', categoria_id: 'c3', nombre: 'Flan casero', descripcion: 'Con dulce de leche', precio: 2500, activo: true, disponible: true, opciones: []},
      // Promo de demostración: repartir 6 unidades entre variedades (la humita está agotada y no se ofrece).
      {id: 'd6', categoria_id: 'c1', nombre: 'Pack 6 empanadas + 2 salsas', descripcion: '6 empanadas a elección y 2 salsas.', precio: 6500, activo: true, disponible: true, opciones: [
        {id: 'emp', nombre: 'Empanadas', tipo: 'cantidad', total: 6, obligatorio: true, valores: [{id: 'carne', nombre: 'Empanada de carne', extra: 0, producto_id: 'd1'},
          {id: 'jyq', nombre: 'Empanada de jamón y queso', extra: 0, producto_id: 'd2'}, {id: 'humita', nombre: 'Empanada de humita', extra: 0, producto_id: 'd3'}]},
        {id: 'sal', nombre: 'Salsas', tipo: 'cantidad', total: 2, obligatorio: true, valores: [{id: 'criolla', nombre: 'Criolla', extra: 0}, {id: 'ajo', nombre: 'Crema de ajo', extra: 0}]}]},
    ]},
};
let demoEstado = null; let demoPedido = null;
async function demoApi(accion, extra) {
  await new Promise(r => setTimeout(r, 250));
  const base = {sucursal: DEMO_DATOS.sucursal, catalogo: DEMO_DATOS.catalogo};
  if (accion === 'abrir') {
    const r = responder({...base, estado: null, entrada: {inicio: true}});
    demoEstado = r.estado;
    return {ok: true, ...base, mensajes: [], nuevos: r.mensajes, carrito: [], pedidos: []};
  }
  if (accion === 'estado') return {ok: true, pedidos: demoPedido ? [demoPedido] : []};
  const r = responder({...base, estado: demoEstado, entrada: extra.entrada});
  demoEstado = r.estado;
  const mensajes = [...r.mensajes]; let pedido = null;
  if (r.accion?.tipo === 'crear_pedido') {
    const sub = totalCarrito(DEMO_DATOS.catalogo, r.estado.carrito);
    const envio = r.accion.pedido.entrega === 'envio' ? DEMO_DATOS.sucursal.envio_costo : 0;
    const conAviso = p => ({...p, aviso: textoEstadoPedido(p, DEMO_DATOS.sucursal, {})});
    demoPedido = pedido = conAviso({creado_at:new Date().toISOString(), estado: 'pendiente', total: sub + envio, medio_pago: r.accion.pedido.medio_pago, motivo: '',
      entrega: r.accion.pedido.entrega, direccion: r.accion.pedido.direccion, nombre: r.accion.pedido.nombre.split(' ')[0]});
    r.estado.carrito = []; r.estado.sugerido = false;
    mensajes.push({texto: pedido.aviso});
    // La demo conserva el pedido pendiente: nunca simula una confirmación automática.
  } else if (r.accion?.tipo === 'estado') {
    mensajes.push({texto: demoPedido ? demoPedido.aviso : 'Todavía no hay pedidos enviados desde este chat.'});
  } else if (r.accion?.tipo === 'cancelar' && demoPedido?.estado === 'pendiente') {
    demoPedido = pedido = {...demoPedido, estado: 'cancelado'};
    mensajes.push({texto: 'Su pedido fue cancelado.'});
  }
  return {ok: true, mensajes, carrito: r.estado.carrito, pedido};
}

iniciar();

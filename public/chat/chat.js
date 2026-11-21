/* GESTLOK Chat · chat público para clientes (celular primero).
 * Habla solo con la función segura «gestlok-chat». Nunca usa innerHTML con datos: todo va por textContent.
 * Modo demostración sin red: ?demo=1 (usa el mismo motor con una carta de ejemplo).
 */
import {botonesBienvenida, carteleraDelDia, describirLinea, detallesLinea, esCantidad, faltantes, pesos, promocionesVigentes, responder, soloEfectivo, textoEstadoPedido, totalCarrito, totalSinDescuento, unidades, urlResena, usaMenuInteractivo, validarLinea, valoresDisponibles, PAGOS} from './motor.js?v=20261121confirmacion3';

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
const SHOWROOM = DEMO && window.GestLokChatShowroom?.enabled ? window.GestLokChatShowroom : null;
function slugDeUrl() {
  const q = (params.get('s') || '').toLowerCase();
  if (q) return q;
  const partes = location.pathname.split('/').filter(Boolean).filter(p => p !== 'chat' && p !== 'index.html');
  return (partes[0] || '').toLowerCase();
}
const SLUG = DEMO ? 'demo' : slugDeUrl();

const S = {sucursal: null, catalogo: {categorias: [], productos: []}, carrito: [], pedido: null, enviando: false,
  ultimaEntrada: null, datos: {entrega: '', medio_pago: ''}, sondeo: 0, hojaFoco: null, categoria: '',
  ultimoLocal: 0, soportePendiente: false, borrador: [], loteId: null, cerrada: false};
/* Contacto opcional, asignado por el servidor a ESTA sucursal; nunca cambia el canal de pedidos. */
function actualizarWhatsApp(sucursal) {
  const link = $('whatsapp-local');
  const telefono = String(sucursal?.whatsapp_local || '').replace(/\D/g, '');
  if (!/^[1-9][0-9]{7,14}$/.test(telefono)) {
    link.hidden = true; link.removeAttribute('href'); return;
  }
  link.href = 'https://wa.me/' + telefono;
  link.hidden = false;
}

// Token anónimo de este teléfono (la base guarda solo su hash).
function token(clave = 'gestlok-chat:token:' + SLUG) {
  try { const t = localStorage.getItem(clave); if (t && /^[A-Za-z0-9_-]{32,64}$/.test(t)) return t; } catch { /* sin almacenamiento */ }
  const b = crypto.getRandomValues(new Uint8Array(32));
  const t = btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  try { localStorage.setItem(clave, t); } catch { /* queda solo en memoria */ }
  return t;
}
const TOKEN = token();
// Esta clave sobrevive al cierre de una conversación: los clientes vuelven sin registrarse.
const CLIENTE_TOKEN = token('gestlok-chat:cliente:' + SLUG);
const CLAVE_DATOS = 'gestlok-chat:datos:' + SLUG;
const CLAVE_TEXTO = 'gestlok-chat:texto:' + SLUG;
const DURACION_BORRADOR = 24 * 60 * 60 * 1000; // solo datos todavía sin enviar
function recuperarLocal(clave) {
  try {
    const x = JSON.parse(localStorage.getItem(clave) || 'null');
    if (x && typeof x === 'object' && Number(x.at) > Date.now()-DURACION_BORRADOR) return x.valor;
    localStorage.removeItem(clave);
  } catch { /* navegación privada o datos inválidos */ }
  return null;
}
function guardarLocal(clave,valor) {
  try { localStorage.setItem(clave,JSON.stringify({at:Date.now(),valor})); }
  catch { /* también funciona sin almacenamiento, mientras la página siga abierta */ }
}
function guardarDatos() {
  if (!S.cerrada) guardarLocal(CLAVE_DATOS,S.datos);
}
function restaurarDatos() {
  const d = recuperarLocal(CLAVE_DATOS);
  if (d && typeof d==='object' && !Array.isArray(d)) {
    for (const campo of ['nombre','telefono','direccion','entre_calles','entrega','medio_pago','efectivo_abona','horario','nota'])
      if (typeof d[campo]==='string') S.datos[campo]=d[campo].slice(0,500);
  }
}
function borrarBorradoresLocales() {
  try { localStorage.removeItem(CLAVE_DATOS);localStorage.removeItem(CLAVE_TEXTO); }
  catch { /* sin almacenamiento */ }
}
// Guardar solamente la selección de productos (sin nombres, teléfono ni dirección).
// La repetición siempre se vuelve a validar contra la carta actual del local.
const CLAVE_ULTIMO_PEDIDO = 'gestlok-chat:ultimo-pedido:' + SLUG;
const REPETIR_VIGENCIA = 30 * 24 * 60 * 60 * 1000;
function guardarUltimoPedido(carrito) {
  const lineas = (Array.isArray(carrito) ? carrito : []).slice(0,30)
    .map(l => ({producto_id:l.producto_id,cantidad:l.cantidad,opciones:l.opciones || {}}))
    .filter(l => !validarLinea(S.catalogo,l));
  if (!lineas.length) return;
  try { localStorage.setItem(CLAVE_ULTIMO_PEDIDO, JSON.stringify({at:Date.now(),lineas})); }
  catch { /* almacenamiento opcional */ }
}
function recuperarUltimoPedido() {
  try {
    const d = JSON.parse(localStorage.getItem(CLAVE_ULTIMO_PEDIDO) || 'null');
    if (!d || !Array.isArray(d.lineas) || d.lineas.length > 30 ||
        Date.now() - Number(d.at) > REPETIR_VIGENCIA || Number(d.at) > Date.now()) return [];
    return d.lineas.filter(l => l && !validarLinea(S.catalogo,l) &&
      producto(l.producto_id)?.activo !== false && producto(l.producto_id)?.disponible !== false);
  } catch { return []; }
}
function repetirUltimoPedido() {
  if (S.pedido && ['pendiente','confirmado'].includes(S.pedido.estado))
    return burbuja('asistente','Primero esperá la resolución de tu pedido actual.');
  if (S.borrador.length || S.carrito.length)
    return burbuja('asistente','Ya estás armando un pedido. Podés terminarlo o modificarlo desde el menú.');
  const lineas=recuperarUltimoPedido();
  if (!lineas.length) return burbuja('asistente','Los productos de tu último pedido ya no están disponibles. Revisá el menú actualizado.');
  S.borrador=lineas.map(l=>({...l}));S.loteId=null;guardarBorrador();actualizarCarrito();
  abrirSeleccion(); // Siempre revisar antes de enviar: jamás confirma ni cobra.
}
const CLAVE_BORRADOR = 'gestlok-chat:menu:' + SLUG;
function guardarBorrador() {
  try {
    if (S.borrador.length) localStorage.setItem(CLAVE_BORRADOR, JSON.stringify({lineas: S.borrador, loteId: S.loteId}));
    else localStorage.removeItem(CLAVE_BORRADOR);
  } catch { /* queda en memoria */ }
}
function restaurarBorrador() {
  try {
    const d = JSON.parse(localStorage.getItem(CLAVE_BORRADOR) || '{}');
    S.borrador = (Array.isArray(d.lineas) ? d.lineas : []).filter(l => !validarLinea(S.catalogo, l)).slice(0, 30);
    S.loteId = typeof d.loteId === 'string' && /^[0-9a-f-]{36}$/.test(d.loteId) ? d.loteId : null;
  } catch { S.borrador = []; S.loteId = null; }
  guardarBorrador();
}
function sumarBorrador(l) {
  const igual = S.borrador.find(x => x.producto_id === l.producto_id &&
    JSON.stringify(x.opciones || {}) === JSON.stringify(l.opciones || {}) && !x.nota && !l.nota);
  if (igual && igual.cantidad + l.cantidad > 50) return 'Podés pedir hasta 50 unidades del mismo producto.';
  if (!igual && S.borrador.length + S.carrito.length >= 30) return 'Llegaste al máximo de productos distintos.';
  if (igual) igual.cantidad += l.cantidad;
  else S.borrador.push(l);
  S.loteId = null; guardarBorrador();
  return '';
}


// ---------------------------------------------------------------------------------------------- conexión
async function api(accion, extra = {}) {
  if (DEMO) return demoApi(accion, extra);
  const ctl = new AbortController(); const corte = setTimeout(() => ctl.abort(), accion === "adjuntar" ? 45000 : 20000);
  try {
    const res = await fetch(CFG.funcion, {method: 'POST', signal: ctl.signal,
      headers: {'content-type': 'application/json', apikey: CFG.key || '', authorization: 'Bearer ' + (CFG.key || '')},
      body: JSON.stringify({slug: SLUG, token: TOKEN, cliente_token:CLIENTE_TOKEN, accion, ...extra})});
    let body = null; try { body = await res.json(); } catch { /* respuesta vacía */ }
    if (!body) throw new Error('red');
    return {status: res.status, ...body};
  } finally { clearTimeout(corte); }
}

// ---------------------------------------------------------------------------------------------- mensajes
const lista = $('mensajes');
function bajar() { requestAnimationFrame(() => { lista.scrollTop = lista.scrollHeight; }); }
function burbuja(rol, texto) { lista.append(el('div', {class: 'burbuja ' + rol, text: texto})); bajar(); }
/* La primera bienvenida es una portada de chat, no un bloque de instrucciones.
 * Los avisos de cierre/programación se conservan como mensajes reales. */
function esSaludoInicial(m) {
  const texto = String(m?.texto || '');
  return !!texto.trim() && !/local est[aá] cerrado|abriremos nuevamente|pedido programado|no estamos tomando pedidos/i.test(texto);
}
function bienvenidaVisual() {
  const marca = S.sucursal?.empresa || S.sucursal?.nombre || 'el local';
  lista.append(el('section', {class: 'burbuja asistente chat-bienvenida', 'aria-label': 'Bienvenida del chat'},
    el('span', {class: 'bienvenida-icono', 'aria-hidden': true, text: '✦'}),
    el('p', {class: 'bienvenida-etiqueta', text: 'CHAT DE ' + marca}),
    el('h2', {class: 'bienvenida-titulo', text: '¡Hola! ¿En qué podemos ayudarte hoy?'})));
  bajar();
}
function burbujaFoto(rol, url, texto = 'Foto enviada') {
  const n=el('div',{class:'burbuja foto '+rol});
  if (typeof url==='string' && /^https:\/\//.test(url)) n.append(el('a',{href:url,target:'_blank',rel:'noopener noreferrer'},
    el('img',{src:url,alt:'Imagen compartida en la conversación',loading:'lazy'})));
  n.append(el('span',{text:texto}));lista.append(n);bajar();
}
/** Cada compra nueva usa otro token secreto y otra conversación.
 * Mantiene CLIENTE_TOKEN, que permite reconocer a un cliente frecuente solo en su sucursal.
 * Nunca reabre ni modifica un pedido que ya fue confirmado o entregado. */
function nuevaConversacion() {
  if (S.enviando) return;
  // Si el último pedido aún está pendiente o en preparación, evitar duplicados.
  if (S.pedido && ['pendiente','confirmado'].includes(S.pedido.estado) && !S.cerrada) return;
  try {
    localStorage.removeItem('gestlok-chat:token:'+SLUG);
    localStorage.removeItem(CLAVE_BORRADOR);
    localStorage.removeItem(CLAVE_TEXTO);
  } catch { /* nueva sesión anónima también funciona en navegación privada */ }
  S.borrador=[]; S.loteId=null;
  // Se crea otra conversación desde el backend; el historial anterior queda conservado.
  location.reload();
}
function mostrarCierre() {
  if (S.cerrada) return;
  S.cerrada=true;clearTimeout(S.sondeo);
  $('redactar').hidden=true;$('barra-pedido').hidden=true;
  const reiniciar=el('button',{type:'button',class:'boton principal',text:'Hacer un nuevo pedido',onclick:nuevaConversacion});
  lista.append(el('div',{class:'chat-cerrado'},
    el('p',{text:'Esta conversación finalizó. Podés volver a comprar en el mismo local.'}),reiniciar));
  bajar();
}
function quitarChips() { lista.querySelectorAll('.chips,.accion').forEach(n => n.remove()); }
// Orden natural: «Pack 2», «Pack 3», «Pack 6», «Pack 12» (no «Pack 12» antes que «Pack 2»).
const NATURAL = new Intl.Collator('es', {numeric: true, sensitivity: 'base'});
const RE_CAT_PROMO = /promo|combo|pack/i;
const ordenProducto = (a, b) => (Number(a.orden) || 0) - (Number(b.orden) || 0) || NATURAL.compare(a.nombre || '', b.nombre || '');
/** Categorías con productos visibles: las de promociones primero (el cliente empieza por la promo que busca). */
function categoriasMenu() {
  const cats = S.catalogo.categorias.filter(c => S.catalogo.productos.some(p => p.categoria_id === c.id && p.activo !== false));
  return [...cats.filter(c => RE_CAT_PROMO.test(c.nombre || '')), ...cats.filter(c => !RE_CAT_PROMO.test(c.nombre || ''))];
}
/** Botones de promociones que manda el asistente: de menor a mayor, igual que en el menú. */
function ordenarBotones(botones) {
  const promos = new Set(promocionesVigentes(S.catalogo || {productos: []}).map(p => p.id));
  const prod = b => String(b.id || '').startsWith('elegir:') ? producto(String(b.id).split(':')[1]) : null;
  const elegir = botones.filter(b => prod(b));
  if (elegir.length < 2 || !elegir.every(b => promos.has(prod(b).id))) return botones;
  const ordenados = [...elegir].sort((a, b) => ordenProducto(prod(a), prod(b)));
  let i = 0;
  return botones.map(b => prod(b) ? ordenados[i++] : b);
}
function chips(botones) {
  if (!botones?.length) return;
  // El acceso principal a la carta debe verse primero aunque el servidor todavía
  // lo envíe como «Ver menú». «Agregar más» mantiene su función en pedidos existentes.
  // «Ver menú completo» (debajo de la lista de promociones) no es la acción de bienvenida: queda al final.
  const principal = b => b.id === 'carta' && /^(ver( el)? men[uú]|ver la carta|hacer un pedido|armar mi pedido)$/i.test(String(b.texto || '').trim());
  const ordenados = [...ordenarBotones(botones)].sort((a, b) => Number(principal(b)) - Number(principal(a)));
  lista.append(el('div', {class: 'chips'}, ordenados.map(b => el('button', {
    type: 'button',
    class: 'chip' + (principal(b) ? ' chip-hacer-pedido' : '') +
      (b.id === 'finalizar' && /^No, gracias/i.test(b.texto || '') ? ' chip-omitir-envio' : ''),
    text: principal(b) ? 'Hacer un pedido' : b.id === 'finalizar'
      ? (/^No, gracias/i.test(b.texto || '') ? 'No, gracias, enviar' : 'Enviar pedido') : b.texto,
    onclick: () => tocarBoton(b)
  }))));
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
  ? [{id: 'finalizar', texto: 'Enviar pedido'}, {id: 'carta', texto: 'Agregar más'}, {id: 'soporte', texto: 'Ayuda con mi pedido'}]
  : [...botonesBienvenida(S.sucursal, S.catalogo),
      ...(recuperarUltimoPedido().length ? [{id:'repetir',texto:'Repetir mi último pedido'}] : [])];


async function enviar(entrada, textoVisible, {cancelacionConfirmada = false} = {}) {
  if (entrada?.boton === 'cancelar' && !cancelacionConfirmada) {
    abrirConfirmacionCancelar();
    return false;
  }
  if (S.enviando) return false;
  S.enviando = true; S.ultimaEntrada = {entrada, textoVisible};
  const carritoAntes = Array.isArray(S.carrito) ? S.carrito.map(l=>({...l})) : [];
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
        return false;
      }
      lista.querySelectorAll('.burbuja.error').forEach(n => n.remove());
      burbuja('error', r.error || 'No se pudo procesar la consulta. Probá de nuevo.');
      if (r.status === 409 && /cerrad|finalizad/i.test(r.error||'')) {mostrarCierre();return false;}
      chips([{id: '__reintentar', texto: 'Reintentar'}]); return false;
    }
    if (r.catalogo && r.sucursal) {
      S.catalogo = r.catalogo; S.sucursal = {...r.sucursal, atencion: r.atencion || r.sucursal.atencion};
      actualizarWhatsApp(S.sucursal);
      S.borrador = S.borrador.filter(l => producto(l.producto_id)); guardarBorrador();
    }
    if (r.atencion && S.sucursal) S.sucursal.atencion = r.atencion;
    // Solo borrar el borrador si el servidor ACEPTÓ el lote; un error de catálogo o
    // de validación puede devolver HTTP 200 con un mensaje, pero sin incorporar productos.
    const loteAceptado = !entrada.agregar_varios || r.lote_aceptado === true;
    if (entrada.agregar_varios && loteAceptado) { S.borrador = []; S.loteId = null; guardarBorrador(); }
    actualizarCarrito(r.carrito);
    if (typeof r.soporte_pendiente === 'boolean') {
      S.soportePendiente = r.soporte_pendiente;
      if (S.pedido && !S.cerrada) $('redactar').hidden = ['pendiente','confirmado','terminado'].includes(S.pedido.estado) && !S.soportePendiente;
      programarSondeo();
    }
    for (const m of r.mensajes || []) mensajeAsistente(m);
    if (r.pedido) {
      if (entrada.datos && r.pedido.estado === 'pendiente') guardarUltimoPedido(carritoAntes);
      mostrarPedido(r.pedido);
      // Los datos ya están guardados de forma privada en el servidor. No dejar
      // un formulario con domicilio/teléfono terminado en un dispositivo compartido.
      S.datos={entrega:'',medio_pago:''};
      try {localStorage.removeItem(CLAVE_DATOS);} catch {}
    }
    return loteAceptado;
  } catch {
    mostrarEscribiendo(false);
    burbuja('error', 'Sin conexión. Revisá tu internet.');
    chips([{id: '__reintentar', texto: 'Reintentar'}]);
    return false;
  } finally { S.enviando = false; bloquear(false); }
}
function tocarBoton(b) {
  if (b.id === '__reintentar' && S.ultimaEntrada) {
    quitarChips(); lista.querySelectorAll('.burbuja.error').forEach(n => n.remove());
    return enviar(S.ultimaEntrada.entrada, null);
  }
  if (b.id === 'repetir') return repetirUltimoPedido();
  if (b.id === 'cancelar') return abrirConfirmacionCancelar();
  if (b.id === 'carta') return abrirCarta();
  if (b.id === 'finalizar' && S.borrador.length) return abrirSeleccion();
  enviar({boton: b.id}, b.id === 'finalizar' ? 'Enviar pedido' : b.texto);
}
function bloquear(si) { $('btn-enviar').disabled = si || !$('texto').value.trim(); $('btn-finalizar').disabled = si; }

// ---------------------------------------------------------------------------------------------- carrito y pedido
function actualizarCarrito(c) {
  if (Array.isArray(c)) S.carrito = c;
  const n = [...S.carrito, ...S.borrador].reduce((s, l) => s + l.cantidad, 0);
  $('barra-pedido').hidden = !n;
  $('barra-texto').textContent = n + (n === 1 ? ' producto' : ' productos') + ' · ' +
    pesos(totalCarrito(S.catalogo, [...S.carrito, ...S.borrador]));
  $('btn-finalizar').textContent = S.borrador.length ? 'Continuar' : 'Enviar pedido';
}
const TEXTO_ESTADO = {
  pendiente: ['Pendiente de confirmación', 'El gerente debe revisar y confirmar su pedido'],
  confirmado: ['Pedido confirmado', 'El local lo está preparando'],
  terminado: ['¡Pedido listo!', ''],
  rechazado: ['El local no pudo tomarlo', ''],
  cancelado: ['Pedido cancelado', ''],
};
/** Pedido listo o enviado: aviso, reseña (si el local cargó su link de Google) y cierre, sin esperar recepción.
 * Una sola vez por pedido en este teléfono, aunque el cliente cierre el chat y vuelva más tarde (hasta 24 h). */
function despedidaPedido(p) {
  const desde = p.decidido_at || p.recibido_at || p.creado_at;
  if (p.estado !== 'terminado' || (desde && Date.now() - new Date(desde).getTime() > 864e5)) return;
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
async function confirmarRecepcion() {
  if (S.enviando || S.cerrada || S.pedido?.estado !== 'terminado' || S.pedido?.recibido_at) return;
  S.enviando = true;
  try {
    const r = await api('recibido');
    if (!r.ok || !r.pedido) {
      burbuja('error', r.error || 'No pudimos confirmar la recepción. Intentá nuevamente.');
      return;
    }
    mostrarPedido(r.pedido); // la recepción se registra por separado; la reseña se ofreció al marcar listo/enviado
  } catch {
    burbuja('error', 'Sin conexión. Intentá nuevamente.');
  } finally { S.enviando = false; }
}
/* Confirmación deliberada: un toque involuntario no cancela una venta.
 * El servidor sigue validando que el pedido esté pendiente cuando recibe la solicitud. */
function abrirConfirmacionCancelar() {
  if (S.enviando || S.cerrada || S.pedido?.estado !== 'pendiente') return;
  abrirHoja('¿Cancelar pedido?', el('div', {class:'confirmar-cancelacion'},
    el('p', {text:'¿Seguro que querés cancelar tu pedido? Todavía podés seguir con tu compra.'}),
    el('button', {type:'button',class:'boton principal ancho',text:'Seguir con mi pedido',onclick:cerrarHoja}),
    el('button', {type:'button',class:'boton ancho cancelar-accion',text:'Sí, cancelar pedido',onclick:()=>{
      cerrarHoja();
      if (/^cancelar/i.test($('texto').value.trim())) { $('texto').value=''; guardarLocal(CLAVE_TEXTO,''); $('texto').dispatchEvent(new Event('input')); }
      enviar({boton:'cancelar'}, 'Cancelar pedido', {cancelacionConfirmada:true});
    }})));
}
function hacerNuevoPedido() {
  S.borrador=[]; S.loteId=null; guardarBorrador(); actualizarCarrito();
  abrirCarta();
}
function mostrarPedido(p) {
  const antes = S.pedido;
  S.pedido = p;
  const caja = $('aviso-pedido');
  if (!p) { caja.hidden = true; return; }
  const envio = p.entrega === 'envio';
  const [t, sub] = p.estado === 'terminado' && envio ? ['¡Pedido en camino!', ''] : (TEXTO_ESTADO[p.estado] || [p.estado, '']);
  const resena = p.estado === 'terminado' ? urlResena(p.resena?.url) : '';
  const promoConfirmada = p.estado !== 'cancelado' && p.estado !== 'rechazado' &&
    Array.isArray(p.items) && p.items.some(item=>
      (producto(item.producto_id)?.opciones || []).some(esCantidad));
  const programado = p.estado === 'pendiente' && p.programado_para && new Date(p.programado_para).getTime()>Date.now();
  const pasoSeguimiento = p.estado === 'pendiente' ? 0 : p.estado === 'confirmado' ? 1 : p.estado === 'terminado' ? 2 : -1;
  const etiqueta = p.recibido_at ? 'Pedido recibido por el cliente' : programado ? 'Programado para '+new Date(p.programado_para).toLocaleString('es-AR',{
    timeZone:'America/Argentina/Buenos_Aires',weekday:'short',hour:'2-digit',minute:'2-digit'}) : t;
  caja.className = 'aviso-pedido ' + p.estado;
  caja.replaceChildren(...[el('span', {class: 'punto', 'aria-hidden': 'true'}),
    el('div', {}, el('strong', {text: etiqueta}), (p.estado === 'rechazado' && p.motivo ? p.motivo
      : p.recibido_at ? 'Recepción confirmada' : p.estado === 'terminado' ? (envio ? 'Va en camino a su dirección' : 'Puede pasar a retirar con su nombre') : sub) + ' · ' + pesos(p.total),
      promoConfirmada ? el('span',{class:'promo-elegida-etiqueta promo-estado-pedido',
        text:'✓ Promoción incluida en tu pedido'}) : null),
    p.estado === 'pendiente' ? el('button', {type: 'button', text: 'Cancelar pedido', onclick: abrirConfirmacionCancelar}) : null,
    ['terminado','rechazado'].includes(p.estado) ? el('button',{
      type:'button',class:'boton nuevo-pedido',text:'Hacer un nuevo pedido',onclick:nuevaConversacion}) : null,
    p.estado === 'cancelado' ? el('div', {class:'pedido-recuperar'},
      recuperarUltimoPedido().length ? el('button',{type:'button',class:'boton',text:'Retomar pedido',onclick:repetirUltimoPedido}) : null,
      el('button',{type:'button',class:'boton',text:'Hacer un nuevo pedido',onclick:nuevaConversacion})) : null,
    p.estado === 'terminado' && !p.recibido_at ? el('button', {type:'button', text:'Ya recibí mi pedido', onclick:confirmarRecepcion}) : null,
    ['pendiente','confirmado','terminado'].includes(p.estado) ? el('button', {type:'button', text:'Necesito ayuda', onclick:()=>enviar({boton:'soporte'},'Necesito ayuda')}) : null,
    resena ? el('a', {href: resena, target: '_blank', rel: 'noopener noreferrer', text: 'Dejar reseña'}) : null,
    pasoSeguimiento >= 0 ? el('ol',{class:'seguimiento-etapas','aria-label':'Seguimiento del pedido'},
      ['Recibido','Confirmado',envio?'En camino':'Listo para retirar'].map((t,i)=>
        el('li',{class:'seguimiento-etapa'+(i<=pasoSeguimiento?' completada':''),
          'aria-current':i===pasoSeguimiento?'step':undefined,text:t}))) : null].filter(Boolean));
  caja.hidden = false;
  // Seguimiento y ayuda por botones: el cliente no necesita volver a escribir.
  if (!S.cerrada) $('redactar').hidden = ['pendiente','confirmado','terminado'].includes(p.estado) && !S.soportePendiente;
  const cambio = antes && antes.creado_at === p.creado_at && antes.estado !== p.estado && ['pendiente','confirmado'].includes(antes.estado);
  if (p.estado === 'terminado' && (!antes || antes.creado_at !== p.creado_at || antes.estado !== 'terminado')) despedidaPedido(p);
  else if (cambio) {
    // El texto lo arma la función con los mensajes que configuró el local.
    if (p.aviso && ['confirmado', 'rechazado'].includes(p.estado)) burbuja('asistente', p.aviso);
    try { navigator.vibrate?.(120); } catch { /* sin vibración */ }
  }
  programarSondeo();
}
function programarSondeo() {
  clearTimeout(S.sondeo);
  if (S.cerrada) return;
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
        if (typeof r.soporte_pendiente === 'boolean') {
          S.soportePendiente = r.soporte_pendiente;
          if (S.pedido && !S.cerrada) $('redactar').hidden = ['pendiente','confirmado','terminado'].includes(S.pedido.estado) && !S.soportePendiente;
        }
        if (r.cerrada) {mostrarCierre();return;}
        if (r.pedidos?.[0]) mostrarPedido(r.pedidos[0]);
        else programarSondeo();
      } else programarSondeo();
    } catch { programarSondeo(); }
  }, 12000);
}
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && !S.cerrada) programarSondeo();
});
// Reflejar de inmediato la respuesta del gerente en la demostración de la
// administradora. En el chat real se conserva el sondeo seguro de 12 segundos.
if (SHOWROOM) window.addEventListener('storage', async event => {
  if(event.key!==SHOWROOM.key || !S.sucursal || S.cerrada)return;
  const r=await api('estado',{desde:S.ultimoLocal}).catch(()=>null);
  if(!r?.ok)return;
  for(const m of r.mensajes_local||[]) {
    if(!Number.isSafeInteger(m.id)||m.id<=S.ultimoLocal)continue;
    S.ultimoLocal=m.id;
    burbuja('local',m.texto);
  }
  if(r.pedidos?.[0])mostrarPedido(r.pedidos[0]);
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
  $('hoja').hidden = true; $('fondo-hoja').hidden = true;
  const f = S.hojaFoco; S.hojaFoco = null;
  if (f && document.contains(f)) f.focus({preventScroll: true});
}
$('hoja-cerrar').onclick = cerrarHoja;
$('fondo-hoja').onclick = cerrarHoja;
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('hoja').hidden) cerrarHoja(); });

function abrirCarta() {
  const cats = categoriasMenu();
  const posCat = new Map(cats.map((c, i) => [c.id, i]));
  const cuerpo = el('div', {class: 'menu-interactivo'});
  let aviso = '';
  let filtroCarta = '';
  const sinAcentos = texto => String(texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

  // El menú sigue abierto al agregar, quitar o personalizar productos.
  // Se preserva la posición para que el cliente no pierda el producto que estaba mirando.
  const pintar = (mantenerPosicion = false) => {
    const scroll = mantenerPosicion ? $('hoja-cuerpo').scrollTop : 0;
    const tabsScroll = cuerpo.querySelector('.categorias')?.scrollLeft || 0;
    const prods = S.catalogo.productos.filter(p => p.activo !== false &&
      (!S.categoria || p.categoria_id === S.categoria) &&
      (!filtroCarta || sinAcentos(p.nombre + ' ' + (p.descripcion || '')).includes(sinAcentos(filtroCarta))))
      .sort((a, b) => (posCat.get(a.categoria_id) ?? 999) - (posCat.get(b.categoria_id) ?? 999) || ordenProducto(a, b));
    const cantidadSeleccionada = S.borrador.reduce((n, l) => n + l.cantidad, 0);
    const mostrarError = texto => { aviso = texto; pintar(true); };
    const lineaSimple = p => S.borrador.find(l => l.producto_id === p.id && !l.nota &&
      Object.keys(l.opciones || {}).length === 0);
    const cambiarSimple = (p, delta) => {
      if (delta > 0) {
        const l = {producto_id: p.id, cantidad: 1, nota: '', opciones: {}};
        const problema = validarLinea(S.catalogo, l) || sumarBorrador(l);
        if (problema) return mostrarError(problema);
      } else {
        const l = lineaSimple(p);
        if (!l) return;
        if (l.cantidad > 1) l.cantidad--;
        else S.borrador.splice(S.borrador.indexOf(l), 1);
        S.loteId = null;
        guardarBorrador();
      }
      aviso = '';
      actualizarCarrito();
      pintar(true);
    };
    const filaProducto = p => {
      const disponible = p.disponible !== false;
      // Solo adicionales opcionales (ej. pizzas con «Jamón adicional»): se suman con + y −, como las empanadas.
      // Tocando el nombre se agrega con adicional. Lo obligatorio (promos, tamaños) sigue con «Elegir».
      const opcionales = (p.opciones || []).filter(g => !esCantidad(g) && !g.obligatorio);
      const requiereOpciones = Array.isArray(p.opciones) && p.opciones.length > opcionales.length;
      const cantidad = S.borrador.filter(l => l.producto_id === p.id).reduce((n, l) => n + l.cantidad, 0);
      const cantidadConfirmada = S.carrito.filter(l => l.producto_id === p.id).reduce((n,l)=>n+l.cantidad,0);
      const promoElegida = (p.opciones || []).some(esCantidad) && cantidad + cantidadConfirmada > 0;
      const simple = lineaSimple(p);
      const detalle = el('div', {class: 'menu-producto-detalle', hidden: true});
      let posicionLista = 0;
      const cerrarDetalle = () => {
        detalle.replaceChildren(); detalle.hidden = true;
        cuerpo.classList.remove('menu-editando');
        detalle.closest('.menu-fila')?.classList.remove('menu-fila-editando');
        $('hoja-cuerpo').scrollTop = posicionLista;
      };
      const mostrarDetalle = () => {
        if (!disponible) return;
        if (!detalle.hidden) return cerrarDetalle();
        posicionLista = $('hoja-cuerpo').scrollTop;
        // Editor de un solo producto: ocultar la lista para no mezclar opciones
        // de un combo con productos que no pertenecen al mismo.
        cuerpo.querySelectorAll('.menu-producto-detalle').forEach(d => {
          d.replaceChildren(); d.hidden = true;
        });
        cuerpo.querySelectorAll('.menu-fila-editando').forEach(f => f.classList.remove('menu-fila-editando'));
        detalle.closest('.menu-fila').classList.add('menu-fila-editando');
        cuerpo.classList.add('menu-editando');
        abrirProducto(p, {}, {slot: detalle, onAdd: () => {
          cuerpo.classList.remove('menu-editando');
          pintar();
          $('hoja-cuerpo').scrollTop = posicionLista;
        }, onCancel: cerrarDetalle});
        $('hoja-cuerpo').scrollTop = 0;
      };
      const botonProducto = el(requiereOpciones ? 'div' : 'button', {
        type: requiereOpciones ? undefined : 'button',
        class: requiereOpciones ? 'producto menu-producto-info' : 'producto',
        disabled: !requiereOpciones && !disponible,
        onclick: requiereOpciones ? undefined : mostrarDetalle,
        'aria-label': requiereOpciones ? undefined : 'Personalizar ' + p.nombre},
        el('span', {class: 'producto-texto'}, el('strong', {text: p.nombre}),
          promoElegida ? el('small', {class: 'promo-elegida-etiqueta', text: '✓ Promoción seleccionada'}) : null,
          p.descripcion ? el('small', {text: p.descripcion}) : null,
          !requiereOpciones && disponible && opcionales.length ? el('small', {class: 'menu-adicional',
            text: 'Opcional: ' + opcionales.flatMap(g => g.valores || []).slice(0, 3)
              .map(v => v.nombre + (Number(v.extra) ? '\u00a0+\u00a0' + pesos(v.extra).replace(' ', '\u00a0') : '')).join(', ') + ' · toque el nombre'}) : null),
        disponible ? el('span', {class: 'precio', text: pesos(p.precio)}) :
          el('span', {class: 'agotado', text: 'Agotado'}));
      const controles = !disponible ? null : el('div', {class: 'menu-pasos'},
        !requiereOpciones && simple ? el('button', {type: 'button', class: 'menu-paso' + (simple.cantidad === 1 ? ' menu-paso-tacho' : ''),
          'aria-label': 'Quitar una unidad de ' + p.nombre, text: simple.cantidad === 1 ? undefined : '−',
          onclick: () => cambiarSimple(p, -1)}, simple.cantidad === 1 ? iconoTacho() : null) : null,
        cantidad ? el('output', {class: 'menu-n', 'aria-label': p.nombre + ': ' + cantidad + ' seleccionados',
          text: String(cantidad)}) : null,
        el('button', {type: 'button', class: 'menu-paso menu-paso-mas' + (requiereOpciones ? ' menu-paso-elegir' : ''),
          'aria-label': requiereOpciones ? 'Elegir opciones de ' + p.nombre : 'Sumar una unidad de ' + p.nombre,
          text: requiereOpciones ? 'Elegir' : '+', onclick: () => requiereOpciones ? mostrarDetalle() : cambiarSimple(p, 1)}));
      return el('li', {class: 'menu-fila' + (promoElegida ? ' menu-fila-promo-elegida' : '')},
        el('div', {class: 'menu-fila-principal'}, botonProducto, controles),
        detalle);
    };
    const busquedaCarta = el('input', {type:'search', class:'menu-filtro-carta',
      'aria-label':'Buscar productos o promociones', placeholder:'Buscar productos o promociones…'});
    busquedaCarta.value = filtroCarta;
    busquedaCarta.addEventListener('input', () => {
      filtroCarta = busquedaCarta.value;
      // No reconstruir el input: conserva teclado, foco y selección mientras filtra.
      cuerpo.querySelectorAll('.menu-fila').forEach(fila => {
        const hay = sinAcentos(fila.querySelector('.producto-texto strong')?.textContent).includes(sinAcentos(filtroCarta));
        fila.hidden = !hay;
      });
      const visibles = [...cuerpo.querySelectorAll('.menu-fila')].filter(f=>!f.hidden).length;
      const avisoVacio = cuerpo.querySelector('.menu-filtro-vacio');
      if(avisoVacio) avisoVacio.hidden = visibles !== 0;
    });
    poner(cuerpo,
      el('div',{class:'menu-filtro-carta-contenedor'},busquedaCarta),
      cats.length > 1 ? el('div', {class: 'categorias', role: 'toolbar', 'aria-label': 'Categorías'},
        [{id: '', nombre: 'Todo'}, ...cats].map(c => el('button', {type: 'button', class: 'chip', text: c.nombre,
          'aria-pressed': String(S.categoria === c.id),
          onclick: () => { S.categoria = c.id; aviso = ''; pintar(); }}))) : null,
      aviso ? el('p', {class: 'error-form menu-aviso', role: 'alert', text: aviso}) : null,
      prods.length ? el('ul', {class: 'lista'}, prods.map(filaProducto))
        : el('p', {class: 'nota', text: filtroCarta ? 'No encontramos resultados.' : 'Todavía no hay productos cargados.'}),
      prods.length ? el('p', {class:'nota menu-filtro-vacio', text:'No encontramos productos con ese nombre.', hidden:true}) : null,
      el('div', {class: 'menu-pie'},
        el('div', {class: 'menu-pie-texto', 'aria-live': 'polite', text: S.borrador.length
          ? cantidadSeleccionada + (cantidadSeleccionada === 1 ? ' producto seleccionado · ' : ' productos seleccionados · ') +
            pesos(totalCarrito(S.catalogo, S.borrador))
          : 'Elegí los productos y cantidades para tu pedido.'}),
        S.borrador.length ? el('button', {type: 'button', class: 'boton principal ancho', text: 'Continuar',
          onclick: abrirSeleccion}) : null));
    if (cuerpo.querySelector('.categorias')) cuerpo.querySelector('.categorias').scrollLeft = tabsScroll;
    $('hoja-cuerpo').scrollTop = scroll;
  };
  pintar();
  abrirHoja('Menú', cuerpo);
}

function iconoTacho() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('width', '18'); svg.setAttribute('height', '18');
  svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('class', 'icono-tacho');
  const d = document.createElementNS(ns, 'path');
  d.setAttribute('d', 'M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3');
  d.setAttribute('fill', 'none'); d.setAttribute('stroke', 'currentColor'); d.setAttribute('stroke-width', '2');
  d.setAttribute('stroke-linecap', 'round'); d.setAttribute('stroke-linejoin', 'round');
  svg.append(d);
  return svg;
}
function abrirProducto(p, sugerido = {}, inline = null) {
  let cantidad = Math.min(50, Math.max(1, Number(sugerido.cantidad) || 1));
  const elegidas = {};
  for (const g of p.opciones || []) elegidas[g.id] = esCantidad(g) ? {...(sugerido.opciones?.[g.id] || {})} : [...(sugerido.opciones?.[g.id] || [])];
  const esPromo = (p.opciones || []).some(esCantidad);
  const contadores = [];
  const salida = el('output', {'aria-live': 'polite', text: String(cantidad)});
  const nota = el('input', {type: 'text', maxlength: '200', placeholder: 'Ej.: bien cocida, sin cebolla'});
  const error = el('p', {class: 'error-form', role: 'alert', hidden: true});
  const boton = el('button', {type: 'submit', class: 'boton principal ancho'});
  const estadoFinal = el('span', {class: 'menu-combo-estado', 'aria-live': 'polite'});
  const linea = () => ({producto_id: p.id, cantidad, nota: nota.value.trim(), opciones: Object.fromEntries(Object.entries(elegidas)
    .map(([k, v]) => [k, Array.isArray(v) ? v : Object.fromEntries(Object.entries(v).filter(([, n]) => n > 0))])
    .filter(([, v]) => Array.isArray(v) ? v.length : Object.keys(v).length))});
  const refrescar = () => {
    salida.textContent = String(cantidad);
    for (const c of contadores) c();
    const falta = faltantes(p, linea().opciones)[0];
    boton.disabled = Boolean(falta);
    const total = pesos(totalCarrito(S.catalogo, [linea()]));
    if (esPromo) {
      boton.textContent = 'Agregar ' + total;
      estadoFinal.textContent = falta ? 'Completá la selección para agregar' : 'Selección completa';
      estadoFinal.classList.toggle('completo', !falta);
    } else {
      boton.textContent = falta ? 'Completar ' + falta.nombre.toLowerCase() : 'Agregar producto';
    }
  };
  // Selector guiado en una sola vista: filas compactas y cantidades en línea.
  const grupoCantidad = g => {
    const total = Number(g.total) || 1;
    const resumen = el('small', {class: 'grupo-estado', 'aria-live': 'polite'});
    contadores.push(() => {
      const elegidasTotal = unidades(elegidas[g.id]);
      const quedan = Math.max(0, total - elegidasTotal);
      resumen.textContent = quedan === 0 ? 'Completo' : elegidasTotal === 0 ? 'Debe elegir ' + total
        : (quedan === 1 ? 'Falta 1' : 'Faltan ' + quedan);
      resumen.classList.toggle('completo', quedan === 0);
      resumen.classList.toggle('pendiente', quedan > 0);
      resumen.setAttribute('aria-label', g.nombre + ': ' + elegidasTotal + ' de ' + total + ' · ' + resumen.textContent);
    });
    const filas = valoresDisponibles(S.catalogo, g).map(v => {
      const n = el('output', {class: 'n', 'aria-live': 'polite', text: String(elegidas[g.id][v.id] || 0)});
      const menos = el('button', {type: 'button', class: 'paso paso-quitar', 'aria-label': 'Quitar ' + v.nombre, text: '−'});
      const mas = el('button', {type: 'button', class: 'paso paso-sumar', 'aria-label': 'Sumar ' + v.nombre, text: '+'});
      const texto = el('span', {class: 'menu-variedad-texto'},
        v.destacado === true ? el('small', {class: 'menu-variedad-destacado', text: '★ Más vendido'}) : null,
        el('strong', {text: v.nombre}),
        Number(v.extra) > 0 ? el('small', {class: 'menu-variedad-extra', text: '+ ' + pesos(v.extra)}) : null);
      const pasos = el('div', {class: 'pasos'}, menos, n, mas);
      const fila = el('div', {class: 'opcion opcion-cantidad menu-variedad-fila'}, texto, pasos);
      const cambiar = d => {
        const actual = elegidas[g.id][v.id] || 0;
        if (d > 0 && unidades(elegidas[g.id]) >= total) return;
        elegidas[g.id][v.id] = Math.max(0, actual + d);
        error.hidden = true;
        refrescar();
      };
      menos.addEventListener('click', () => cambiar(-1));
      mas.addEventListener('click', () => cambiar(1));
      contadores.push(() => {
        const k = elegidas[g.id][v.id] || 0;
        n.textContent = String(k);
        menos.hidden = k === 0;
        n.hidden = k === 0;
        // Con 1 elegida, el botón de quitar es un tacho; con más, «−».
        if (k === 1) menos.replaceChildren(iconoTacho()); else menos.textContent = '−';
        mas.disabled = unidades(elegidas[g.id]) >= total;
        pasos.classList.toggle('activo', k > 0);
        fila.classList.toggle('elegida', k > 0);
      });
      return fila;
    });
    const buscador = el('input', {type:'search', class:'menu-filtro-variedades',
      'aria-label':'Buscar ' + g.nombre.toLowerCase(), placeholder:'Buscar ' + g.nombre.toLowerCase() + '…'});
    const sinResultados = el('p',{class:'nota menu-sin-resultados',text:'No hay coincidencias.',hidden:true});
    buscador.addEventListener('input',()=>{
      const q=buscador.value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
      let encontradas=0;
      for(const fila of filas){
        const nombre=fila.querySelector('.menu-variedad-texto strong')?.textContent || '';
        fila.hidden=!nombre.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(q);
        if(!fila.hidden) encontradas++;
      }
      sinResultados.hidden=encontradas>0;
    });
    return el('fieldset', {class: 'grupo grupo-cantidad menu-grupo-lista'},
      el('legend', {class: 'grupo-encabezado'}, el('strong', {text: g.nombre}), resumen),
      filas.length ? el('label',{class:'menu-busqueda-variedades'},el('span',{text:'Buscar variedad'}),buscador) : null,
      filas.length ? el('div', {class: 'grupo-opciones'}, filas)
        : el('p', {class: 'nota', text: 'Hoy no hay variedades disponibles.'}),
      filas.length ? sinResultados : null);
  };
  const etiquetaGrupo = g => {
    const e = el('small', {class: 'grupo-estado'});
    contadores.push(() => {
      const listo = (elegidas[g.id] || []).length > 0;
      e.textContent = !g.obligatorio ? 'Opcional' : listo ? 'Completo' : 'Debe elegir ' + (g.tipo === 'una' ? '1' : 'al menos 1');
      e.className = 'grupo-estado ' + (!g.obligatorio ? 'opcional' : listo ? 'completo' : 'pendiente');
    });
    return e;
  };
  const grupos = (p.opciones || []).map(g => esCantidad(g) ? grupoCantidad(g) : el('fieldset', {class: 'grupo grupo-opcional' + (esPromo ? ' menu-grupo-lista' : '')},
    el('legend', {class: 'grupo-encabezado'}, el('strong', {text: g.nombre}), etiquetaGrupo(g)),
    el('p', {class: 'grupo-instruccion', text: g.tipo === 'una'
      ? 'Elegí ' + (g.obligatorio ? '1 opción' : 'hasta 1 opción')
      : 'Elegí hasta ' + g.max + ' opciones'}),
    el('div', {class: 'grupo-opciones'}, g.valores.map(v => {
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
    }))));
  const cantidadControl = el('div', {class: 'cantidad-contenedor'},
    el('strong', {class: 'cantidad-etiqueta', text: esPromo ? 'Cantidad de promociones' : 'Cantidad del producto'}),
    el('div', {class: 'cantidad'}, el('button', {type: 'button', 'aria-label': 'Menos', text: '−', onclick: () => { cantidad = Math.max(1, cantidad - 1); refrescar(); }}),
      salida, el('button', {type: 'button', 'aria-label': 'Más', text: '+', onclick: () => { cantidad = Math.min(50, cantidad + 1); refrescar(); }})));
  const form = el('form', {class: esPromo ? 'menu-form-combo' : 'menu-form-simple', onsubmit: e => {
    e.preventDefault();
    const l = linea(); const problema = validarLinea(S.catalogo, l);
    if (problema) { error.textContent = problema; error.hidden = false; return; }
    const fallo = sumarBorrador(l);
    if (fallo) { error.textContent = fallo; error.hidden = false; return; }
    actualizarCarrito();
    if (inline) inline.onAdd();
    else abrirCarta();
  }},
  p.descripcion ? el('p', {class: 'nota', text: p.descripcion}) : null,
  el('p', {class: 'precio', text: pesos(p.precio)}),
  esPromo ? cantidadControl : null,
  esPromo ? null : el('p', {class: 'menu-ayuda', text: 'Elegí las opciones y cantidades. Al agregar, volvés al menú.'}),
  grupos,
  esPromo ? null : cantidadControl,
  el('label', {class: 'campo menu-nota-producto'}, el('span', {text: 'Aclaración (opcional)'}), nota),
  error,
  esPromo
    ? el('div', {class: 'menu-combo-acciones'}, estadoFinal, boton)
    : boton);
  refrescar();
  if (inline) {
    inline.slot.replaceChildren(
      el('div', {class: 'menu-personalizar-titulo'}, el('strong', {text: 'Elegí · ' + p.nombre}),
        el('button', {type: 'button', class: 'boton chico', text: 'Volver al menú',
          onclick: inline.onCancel})),
      form);
    inline.slot.hidden = false;
    // El formulario aparece debajo del producto, sin reemplazar el menú.
    inline.slot.scrollIntoView({block: 'nearest'});
  } else abrirHoja(p.nombre, form);
}

function abrirSeleccion() {
  const subtotal = totalCarrito(S.catalogo, S.borrador);
  const anterior = totalCarrito(S.catalogo, S.carrito);
  const cuerpo = el('div', {class: 'menu-revision'},
    el('ul', {class: 'seleccion-lista'}, S.borrador.map((l, i) => {
      const nombre = producto(l.producto_id)?.nombre || 'Producto que ya no está en el menú';
      const detalles = detallesLinea(S.catalogo, l);
      const esLineaPromo = (producto(l.producto_id)?.opciones || []).some(esCantidad);
      return el('li', {class: 'seleccion-linea' + (esLineaPromo ? ' seleccion-linea-promo' : '')},
        esLineaPromo ? el('span', {class:'promo-elegida-etiqueta',text:'✓ Promoción seleccionada'}) : null,
        el('strong', {class: 'seleccion-nombre', text: l.cantidad + ' × ' + nombre}),
        el('span', {class: 'precio', text: pesos(totalCarrito(S.catalogo, [l]))}),
        detalles.length || l.nota ? el('div', {class: 'seleccion-detalle'},
          detalles.map(d => el('p', {}, el('strong', {text: d.grupo}), ' · ' + d.valores)),
          l.nota ? el('p', {text: l.nota}) : null) : null,
        el('button', {type: 'button', class: 'boton chico', text: 'Quitar', 'aria-label': 'Quitar ' + nombre, onclick: () => {
        S.borrador.splice(i, 1); S.loteId = null; guardarBorrador(); actualizarCarrito();
        S.borrador.length ? abrirSeleccion() : abrirCarta();
        }}));
    })),
    S.carrito.length ? el('div', {class: 'seleccion-subtotales'},
      el('span', {text: 'Esta selección'}), el('span', {class: 'precio', text: pesos(subtotal)}),
      el('span', {text: 'Ya en tu pedido'}), el('span', {class: 'precio', text: pesos(anterior)})) : null,
    el('div', {class: 'total'}, el('span', {text: 'Total estimado'}),
      el('span', {class: 'precio', text: pesos(subtotal + anterior)})),
    el('p', {class: 'nota', text: 'Después de enviar la selección, completá tus datos. El gerente revisará y confirmará el pedido.'}),
    el('button', {type: 'button', class: 'boton ancho', text: 'Agregar más productos', onclick: abrirCarta}),
    el('button', {type: 'button', class: 'boton principal ancho', text: 'Continuar',
      onclick: async () => {
        if (S.enviando || !S.borrador.length) return;
        if (!S.loteId) { S.loteId = crypto.randomUUID(); guardarBorrador(); }
        const entrada = {agregar_varios: S.borrador.map(l => ({...l})), lote_id: S.loteId};
        const textoSeleccion = 'Mi selección del menú:\n' + S.borrador.map(l => '• ' + describirLinea(S.catalogo, l)).join('\n');
        cerrarHoja();
        const ok = await enviar(entrada, textoSeleccion);
        if (!ok) abrirSeleccion();
      }}));
  abrirHoja('Tu selección del menú', cuerpo);
}
function abrirCarrito() {
  if (S.borrador.length) return abrirSeleccion();
  const cuerpo = el('div',
    S.carrito.length ? S.carrito.map((l, i) => el('div', {class: 'linea'},
      el('div', {}, describirLinea(S.catalogo, l), el('small', {text: pesos(totalCarrito(S.catalogo, [l]))})),
      el('button', {type: 'button', class: 'boton chico', text: 'Quitar', onclick: () => { cerrarHoja(); enviar({quitar: i}, 'Quitar ' + (producto(l.producto_id)?.nombre || 'producto')); }})))
      : el('p', {class: 'nota', text: 'Tu pedido está vacío.'}),
    el('div', {class: 'total'}, el('span', {text: 'Total estimado'}), el('span', {text: pesos(totalCarrito(S.catalogo, S.carrito))})),
    el('p', {class: 'nota', text: 'El total final lo calcula el local con los precios vigentes.'}),
    S.carrito.length ? el('button', {type: 'button', class: 'boton principal ancho', text: 'Enviar pedido', onclick: () => { cerrarHoja(); enviar({boton: 'finalizar'}, 'Enviar pedido'); }}) : null);
  abrirHoja('Tu pedido', cuerpo);
}

function abrirDatos() {
  if (S.borrador.length) return abrirSeleccion();
  const s = S.sucursal; const d = S.datos;
  if (!d.entrega) d.entrega = s.acepta_retiro ? 'retiro' : 'envio';
  const medios = entrega => {
    // Promo del local que se paga solo en efectivo (regla del producto): no se ofrecen otros medios.
    if (soloEfectivo(S.catalogo, S.carrito)) return ['efectivo'];
    const lista = entrega === 'envio' ? s.medios_pago_envio : s.medios_pago_retiro;
    return Array.isArray(lista) && lista.length ? lista : (s.medios_pago || ['efectivo']);
  };
  if (!d.medio_pago) d.medio_pago = medios(d.entrega)[0] || 'efectivo';
  // La observación reemplaza al campo confuso «¿Para cuándo?» sin perder un borrador antiguo.
  if (d.horario && !d.nota) d.nota = d.horario;
  d.horario = '';
  const campo = (nombre, etiqueta, attrs) => {
    const i = el(attrs.tag || 'input', {name: nombre, ...attrs, tag: undefined});
    i.value = d[nombre] || ''; i.addEventListener('input', () => { d[nombre] = i.value; guardarDatos(); });
    return el('label', {class: 'campo'}, el('span', {text: etiqueta}), i);
  };
  const dir = campo('direccion', 'Dirección de entrega', {type: 'text', maxlength: '140',
    autocomplete: 'street-address', placeholder: 'Calle, número y piso'});
  const entreCalles = campo('entre_calles', 'Entre calles', {type:'text',maxlength:'90',
    placeholder:'Ej.: Belgrano y San Martín'});
  // GPS únicamente tras un toque voluntario del cliente. No se guarda en localStorage
  // ni se comparte con la API hasta que confirme «Enviar pedido».
  let gpsSeleccionado = null;
  const ubicacionEstado=el('p',{class:'nota ubicacion-estado',role:'status','aria-live':'polite',
    text:'Podés escribir la dirección o elegir tu ubicación actual.'});
  const botonUbicacion=el('button',{type:'button',class:'boton ubicacion-boton',
    text:'Usar mi ubicación',onclick:()=>{
      if (!navigator.geolocation || !window.isSecureContext) {
        ubicacionEstado.textContent='Tu navegador no permite acceder al GPS. Ingresá la dirección manualmente.';
        return;
      }
      botonUbicacion.disabled=true;
      ubicacionEstado.textContent='Buscando tu ubicación…';
      navigator.geolocation.getCurrentPosition(pos=>{
        botonUbicacion.disabled=false;
        const lat=pos.coords.latitude,lng=pos.coords.longitude;
        if (!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180) {
          ubicacionEstado.textContent='No pudimos obtener una ubicación válida. Ingresá la dirección manualmente.';
          return;
        }
        gpsSeleccionado={lat:lat.toFixed(6),lng:lng.toFixed(6)};
        ubicacionEstado.replaceChildren(
          el('strong',{class:'ubicacion-ok',text:'✓ Ubicación obtenida'}),
          ' · Precisión aproximada: '+Math.round(pos.coords.accuracy||0)+' m. ',
          el('a',{href:'https://www.google.com/maps?q='+gpsSeleccionado.lat+','+gpsSeleccionado.lng,
            target:'_blank',rel:'noopener noreferrer',text:'Ver ubicación'}));
        preguntaDeRecuerdo();
      },errorGPS=>{
        botonUbicacion.disabled=false;
        ubicacionEstado.textContent=errorGPS.code===1
          ? 'No se concedió el permiso. Podés cargar la dirección manualmente.'
          : 'No pudimos obtener el GPS. Escribí la dirección manualmente.';
      },{enableHighAccuracy:true,timeout:15000,maximumAge:0});
    }});
  const bloqueUbicacion=el('div',{class:'ubicacion-opciones'},
    el('p',{class:'nota',text:'Usar GPS (opcional)'}),botonUbicacion,ubicacionEstado);
  const notaPedido=campo('nota','Observaciones (opcional)',{tag:'textarea',maxlength:'500',rows:'2',
    placeholder:'Ej.: Portón negro, tocar timbre'});
  const direccionFinal=()=>[
    String(d.direccion||'').trim(),
    d.entre_calles?.trim() ? 'Entre calles: '+d.entre_calles.trim() : '',
    gpsSeleccionado ? 'GPS: https://www.google.com/maps?q='+gpsSeleccionado.lat+','+gpsSeleccionado.lng : ''
  ].filter(Boolean).join(' · ').slice(0,200);
  const notaCostoEnvio=el('p',{class:'nota costo-envio'});
  const totalTxt = el('span');
  const notaPago = el('p', {class:'nota pago-explicacion'});
  const cambioTxt = el('p', {class:'nota cambio-previsto'});
  let importeEstimado = 0;
  const refrescar = () => {
    dir.hidden = d.entrega !== 'envio';
    entreCalles.hidden = d.entrega !== 'envio';
    bloqueUbicacion.hidden = d.entrega !== 'envio';
    notaCostoEnvio.hidden = d.entrega !== 'envio' || Number(s.envio_costo) <= 0;
    notaCostoEnvio.textContent = 'Costo de envío: ' + pesos(s.envio_costo);
    const ordenPagos=['debito','credito','transferencia','efectivo','mercado_pago'];
    const disponibles = [...medios(d.entrega)].sort((a,b)=>ordenPagos.indexOf(a)-ordenPagos.indexOf(b));
    const tarjetas=disponibles.filter(m=>m==='debito'||m==='credito');
    const otros=disponibles.filter(m=>m!=='debito'&&m!=='credito');
    pago.replaceChildren(...[
      tarjetas.length ? el('optgroup',{label:'Tarjeta débito/crédito'},
        tarjetas.map(m=>el('option',{value:m,text:PAGOS[m]||m}))) : null,
      ...otros.map(m=>el('option', {value: m, text: PAGOS[m] || m}))
    ].filter(Boolean));
    if (!disponibles.includes(d.medio_pago)) d.medio_pago = disponibles[0] || 'efectivo';
    pago.value = d.medio_pago;
    const envio = d.entrega === 'envio' ? Number(s.envio_costo) || 0 : 0;
    const subtotal = totalCarrito(S.catalogo, S.carrito);
    const porcentaje = d.entrega === 'envio' && d.medio_pago === 'efectivo'
      ? Number(s.descuento_efectivo_pct) || 0 : 0;
    // Promos a precio final (regla sin_descuento del local) no llevan el descuento por efectivo (igual que en la base).
    const conDescuento = subtotal - totalSinDescuento(S.catalogo, S.carrito);
    const descuento = Math.round(conDescuento * porcentaje) / 100;
    importeEstimado = Math.round((subtotal + envio - descuento) * 100) / 100;
    totalTxt.textContent = pesos(importeEstimado) + (descuento ? ' · Incluye ' + porcentaje + '% de descuento en productos' : '');
    const efectivoDelivery = d.entrega === 'envio' && d.medio_pago === 'efectivo';
    efectivo.hidden = !efectivoDelivery;
    // Validación al enviar: primero dirección y luego importe. Sin bloqueo nativo anticipado.
    cambioTxt.hidden = !efectivoDelivery;
    if (efectivoDelivery) {
      const abona = Number(d.efectivo_abona);
      cambioTxt.textContent = Number.isFinite(abona) && abona >= importeEstimado && abona > 0
        ? 'Cambio a enviar: ' + pesos(abona - importeEstimado)
        : 'Indique con cuánto abonará para preparar el cambio. También puede elegir pago justo.';
    }
    notaPago.hidden = !(d.entrega === 'envio' && d.medio_pago === 'transferencia' && Number(s.descuento_efectivo_pct) > 0);
    notaPago.textContent = 'Si abona en efectivo tiene un ' + (Number(s.descuento_efectivo_pct) || 0) +
      '% de descuento en los productos. Si prefiere transferencia, el gerente le enviará los datos por este chat. Puede adjuntar aquí el comprobante.';
  };
  const entregas = [s.acepta_retiro && ['retiro', 'Retiro en el local'],
    s.acepta_envio && ['envio', 'Envío a domicilio']].filter(Boolean);
  const pago = el('select', {name: 'medio_pago'});
  pago.value = d.medio_pago; pago.addEventListener('change', () => { d.medio_pago = pago.value; guardarDatos();refrescar(); });
  const efectivo = campo('efectivo_abona', '¿Con cuánto va a abonar en efectivo?', {
    type:'number',min:'1',max:'99999999',step:'0.01',inputmode:'decimal',placeholder:'Ej.: 20000'});
  const efectivoInput = efectivo.querySelector('input');
  efectivoInput.addEventListener('input', refrescar);
  const pagoJusto = el('button',{type:'button',class:'boton chico',text:'Pago justo, sin cambio',onclick:()=>{
    d.efectivo_abona=importeEstimado.toFixed(2); efectivoInput.value=d.efectivo_abona; guardarDatos();refrescar();
  }});
  efectivo.append(pagoJusto);
  const campoNombre=campo('nombre','Nombre',{type:'text',maxlength:'80',autocomplete:'name',required:true});
  const campoTelefono=campo('telefono','Teléfono de contacto',{
    type:'tel',maxlength:'25',autocomplete:'tel',inputmode:'tel',placeholder:'Ej.: 11 5555 1234',required:true});
  const inputNombre=campoNombre.querySelector('input');
  const inputTelefono=campoTelefono.querySelector('input');
  const inputDireccion=dir.querySelector('input');
  const avisoRecuerdo=el('div',{class:'recuerdo-cliente',hidden:true});
  let perfil=null;let telefonoConsultado='';let datoConfirmado='';
  const telefonoIdentidad=String(d.telefono||'').replace(/\D/g,'');
  let identidadLimpiada=false;

  function preguntaDeRecuerdo() {
    avisoRecuerdo.replaceChildren();
    if (!perfil?.encontrado || (gpsSeleccionado && d.entrega==='envio')) {avisoRecuerdo.hidden=true;return;}
    const direccion=d.entrega==='envio' && String(perfil.direccion||'').trim().length>=5;
    const tipo=direccion?'direccion':'nombre';
    if (datoConfirmado===tipo) {avisoRecuerdo.hidden=true;return;}
    const pregunta=direccion
      ? '¡Qué bueno volver a atenderlo! ¿El envío sigue siendo a '+perfil.direccion+'?'
      : '¡Qué bueno volver a atenderlo! ¿El pedido es a nombre de '+perfil.nombre+'?';
    const si=el('button',{type:'button',class:'boton chico',text:'Sí, es correcto',onclick:()=>{
      if (perfil.nombre && (!String(d.nombre || '').trim() || d.entrega==='retiro')) {
        d.nombre=perfil.nombre;inputNombre.value=perfil.nombre;
      }
      if (direccion) {d.direccion=perfil.direccion;inputDireccion.value=perfil.direccion;}
      datoConfirmado=tipo;avisoRecuerdo.hidden=true;guardarDatos();
    }});
    const no=el('button',{type:'button',class:'boton chico',text:'No, modificar',onclick:()=>{
      if (direccion) {d.direccion='';inputDireccion.value='';inputDireccion.focus();}
      else {d.nombre='';inputNombre.value='';inputNombre.focus();}
      datoConfirmado=tipo;avisoRecuerdo.hidden=true;guardarDatos();
    }});
    poner(avisoRecuerdo,el('p',{text:pregunta}),el('div',{class:'recuerdo-acciones'},si,no));
    avisoRecuerdo.hidden=false;
  }
  async function consultarRecuerdo() {
    const tel=String(inputTelefono.value||'').replace(/\D/g,'');
    if (!/^[0-9]{8,15}$/.test(tel) || tel===telefonoConsultado) return;
    telefonoConsultado=tel;perfil=null;datoConfirmado='';avisoRecuerdo.hidden=true;
    try {
      const r=await api('recordar',{telefono:tel});
      if (String(inputTelefono.value||'').replace(/\D/g,'')!==tel) return;
      if (r.ok && r.encontrado) {perfil=r;preguntaDeRecuerdo();}
    } catch { /* puede hacer pedido nuevo aunque falle el recuerdo */ }
  }
  inputTelefono.addEventListener('blur',consultarRecuerdo);
  inputTelefono.addEventListener('input',()=>{
    const nuevo=String(inputTelefono.value||'').replace(/\D/g,'');
    const cambioDePersona=(!identidadLimpiada && /^[0-9]{8,15}$/.test(telefonoIdentidad)
      && nuevo!==telefonoIdentidad) || (perfil?.encontrado && nuevo!==telefonoConsultado);
    if (cambioDePersona) {
      // Dispositivo compartido: no se arrastra el nombre o domicilio de otra persona.
      d.nombre='';d.direccion='';inputNombre.value='';inputDireccion.value='';
      identidadLimpiada=true;guardarDatos();
    }
    if (nuevo!==telefonoConsultado) {
      perfil=null;datoConfirmado='';avisoRecuerdo.hidden=true;
    }
  });
  inputNombre.addEventListener('input',()=>{
    if (perfil && d.entrega==='retiro') {datoConfirmado='nombre';avisoRecuerdo.hidden=true;}
  });
  inputDireccion.addEventListener('input',()=>{
    if (perfil && d.entrega==='envio') {datoConfirmado='direccion';avisoRecuerdo.hidden=true;}
  });
  const error = el('p', {class: 'error-form', role: 'alert', hidden: true});
  const form = el('form', {onsubmit: e => {
    e.preventDefault();
    const tel = String(d.telefono || '').replace(/\D/g, '');
    const problema = String(d.nombre || '').trim().length < 2 ? 'Ingrese su nombre.'
      : tel.length < 8 || tel.length > 15 ? 'Ingrese un teléfono válido (con código de área).'
      : d.entrega === 'envio' && String(d.direccion || '').trim().length < 5 && !gpsSeleccionado
        ? 'Ingresá calle y número o utilizá la ubicación GPS.'
      : d.entrega === 'envio' && d.medio_pago === 'efectivo' &&
        (!Number.isFinite(Number(d.efectivo_abona)) || Number(d.efectivo_abona) < importeEstimado)
        ? 'Indique un importe en efectivo igual o superior al total, o seleccione pago justo.' : '';
    const faltaConfirmar=perfil?.encontrado && !datoConfirmado &&
      !(gpsSeleccionado && d.entrega==='envio') &&
      (d.entrega==='retiro' || String(perfil.direccion||'').trim().length>=5);
    if (problema || faltaConfirmar) {
      error.textContent = problema || 'Confirme el nombre o la dirección guardada, o elija modificarla.';
      error.hidden=false;return;
    }
    cerrarHoja();
    enviar({datos: {...d, direccion: d.entrega==='envio' ? direccionFinal() : ''}}, 'Enviar pedido');
  }},
  campoNombre,campoTelefono,avisoRecuerdo,
  el('p',{class:'nota',text:'No hace falta registrarse. Si ya pidió desde este navegador, al ingresar su teléfono podremos recordar sus datos.'}),
  entregas.length > 1 ? el('div', {class: 'segmentado', role: 'radiogroup', 'aria-label': 'Entrega'}, entregas.map(([v, t]) => {
    const r = el('input', {type: 'radio', name: 'entrega', value: v, checked: d.entrega === v});
    r.addEventListener('change', () => { d.entrega=v;datoConfirmado='';guardarDatos();refrescar();preguntaDeRecuerdo(); });
    return el('label', {}, r, t);
  })) : el('p', {class: 'nota', text: entregas[0]?.[1] || ''}),
  dir, entreCalles, bloqueUbicacion, notaCostoEnvio,
  el('label', {class: 'campo'}, el('span', {text: 'Medio de pago'}), pago),
  notaPago, efectivo, cambioTxt,
  s.atencion?.habilitado && !s.atencion.abierto
    ? el('p',{class:'nota',text:'Pedido para la próxima apertura: '+s.atencion.proximo_texto+'. El gerente lo confirmará manualmente.'})
    : null,
  notaPedido,
  el('div', {class: 'total'}, el('span', {text: 'Total estimado'}), totalTxt),
  el('p', {class: 'nota', text: 'El gerente revisará y confirmará su pedido antes de prepararlo. Sus datos de contacto y entrega se conservarán en esta sucursal para facilitar futuros pedidos desde este navegador. Puede corregirlos cuando quiera. No necesita crear una cuenta.'}),
  error,
  el('button', {type: 'submit', class: 'boton principal ancho', text: 'Enviar pedido'}));
  refrescar();
  abrirHoja('Sus datos', form);
  if (/^[0-9]{8,15}$/.test(String(d.telefono||'').replace(/\D/g,''))) consultarRecuerdo();
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
  guardarLocal(CLAVE_TEXTO,texto.value.slice(0,600));
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
  guardarLocal(CLAVE_TEXTO,'');
  if (/^(quiero\s+)?cancelar\s+(mi\s+|el\s+)?pedido[.!?\s]*$/i.test(t) && S.pedido?.estado === 'pendiente') {
    texto.value=t; texto.dispatchEvent(new Event('input'));
    abrirConfirmacionCancelar();
    return;
  }
  enviar({texto: t}, t).then(ok=>{
    if (!ok && !texto.value) {
      texto.value=t; texto.dispatchEvent(new Event('input'));
    }
  });
});
$('btn-carta').onclick = abrirCarta;
$('btn-carrito').onclick = abrirCarrito;
$('btn-finalizar').onclick = () => S.borrador.length ? abrirSeleccion() : enviar({boton: 'finalizar'}, 'Enviar pedido');
$('btn-info').onclick = abrirInfo;

// La foto se redimensiona en el teléfono: reduce uso de datos y elimina metadatos EXIF.
async function imagenComprimida(archivo) {
  if (!archivo || !archivo.type.startsWith('image/')) throw Error('Elegí una imagen.');
  if (archivo.size > 25000000) throw Error('La foto es demasiado grande.');
  let bmp;
  try { bmp=await createImageBitmap(archivo); }
  catch {
    bmp=await new Promise((ok,fail)=>{
      const img=new Image();const url=URL.createObjectURL(archivo);
      img.onload=()=>{URL.revokeObjectURL(url);ok(img);};
      img.onerror=()=>{URL.revokeObjectURL(url);fail(Error('No se pudo abrir la imagen.'));};
      img.src=url;
    });
  }
  const lienzo=document.createElement('canvas');
  const escala=Math.min(1,1600/Math.max(bmp.width,bmp.height));
  lienzo.width=Math.max(1,Math.round(bmp.width*escala));
  lienzo.height=Math.max(1,Math.round(bmp.height*escala));
  lienzo.getContext('2d').drawImage(bmp,0,0,lienzo.width,lienzo.height);
  bmp.close?.();
  let foto=await new Promise(ok=>lienzo.toBlob(ok,'image/jpeg',0.82));
  if (!foto || foto.size>2000000) {
    const escala2=Math.min(1,1100/Math.max(lienzo.width,lienzo.height));
    const reducido=document.createElement('canvas');
    reducido.width=Math.max(1,Math.round(lienzo.width*escala2));
    reducido.height=Math.max(1,Math.round(lienzo.height*escala2));
    reducido.getContext('2d').drawImage(lienzo,0,0,reducido.width,reducido.height);
    foto=await new Promise(ok=>reducido.toBlob(ok,'image/jpeg',0.65));
  }
  if (!foto || foto.size>2000000) throw Error('La imagen sigue siendo demasiado grande. Probá con otra foto.');
  const data=await new Promise((ok,fail)=>{
    const reader=new FileReader();reader.onload=()=>ok(String(reader.result));reader.onerror=()=>fail(Error('No se pudo leer la foto.'));
    reader.readAsDataURL(foto);
  });
  return {mime:'image/jpeg',imagen:data.split(',')[1]};
}
async function enviarFoto(archivo) {
  if (S.enviando || S.cerrada) return;
  S.enviando=true;$('btn-galeria').disabled=true;$('btn-camara').disabled=true;
  try {
    const imagen=await imagenComprimida(archivo);
    const r=await api('adjuntar',imagen);
    if (!r.ok) throw Error(r.error||'No se pudo enviar la foto.');
    burbujaFoto('cliente',r.imagen_url,'Foto enviada al gerente');
    // Si el asistente todavía espera la descripción del reclamo, la pide debajo de la foto.
    for (const m of r.mensajes || []) mensajeAsistente(m, {abrir: false});
    S.soportePendiente=true;programarSondeo();
  } catch(e) {burbuja('error',e.message||'No pudimos enviar la foto.');}
  finally {S.enviando=false;$('btn-galeria').disabled=false;$('btn-camara').disabled=false;}
}
$('btn-galeria').onclick=()=>$('foto-galeria').click();
$('btn-camara').onclick=()=>$('foto-camara').click();
for (const input of [$('foto-galeria'),$('foto-camara')]) {
  input.addEventListener('change',()=>{
    const archivo=input.files?.[0];input.value='';
    if (archivo) enviarFoto(archivo);
  });
}


// ---------------------------------------------------------------------------------------------- inicio
function pantallaFija(titulo, detalle) {
  $('app').setAttribute('aria-busy', 'false');
  $('redactar').hidden = true;
  $('barra-pedido').hidden = true;
  $('whatsapp-local').hidden = true;
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
  actualizarWhatsApp(S.sucursal);
  restaurarDatos(); restaurarBorrador();
  S.soportePendiente = r.soporte_pendiente === true;
  S.ultimoLocal = Math.max(0, ...(r.mensajes || []).filter(m => m.rol === 'local')
    .map(m => Number.isSafeInteger(m.id) ? m.id : 0));
  const nombre = [r.sucursal.empresa, r.sucursal.nombre].filter(Boolean).join(' · ');
  document.title = nombre + ' · Chat';
  $('titulo').textContent = nombre;
  $('subtitulo').textContent = 'Chat de atención y pedidos';
  $('avatar').textContent = (r.sucursal.empresa || r.sucursal.nombre || 'G').trim().charAt(0).toUpperCase();
  $('btn-info').hidden = false;
  const urlsFotos = new Map((r.fotos || []).map(f=>[Number(f.mensaje_id),f.url]));
  let saludoMostrado = false;
  for (const [indice, m] of (r.mensajes || []).entries()) {
    if (indice === 0 && m.rol === 'asistente' && esSaludoInicial(m)) {
      bienvenidaVisual(); saludoMostrado = true; continue;
    }
    if (m.rol === 'cliente' && urlsFotos.has(Number(m.id))) {
      burbujaFoto('cliente',urlsFotos.get(Number(m.id)),'Foto enviada al gerente');continue;
    }
    burbuja(m.rol === 'cliente' ? 'cliente' : m.rol === 'local' ? 'local' : 'asistente', m.texto);
  }
  for (const [indice, m] of (r.nuevos || []).entries()) {
    if (!saludoMostrado && indice === 0 && !(r.mensajes || []).length && esSaludoInicial(m)) {
      bienvenidaVisual(); chips(m.botones); saludoMostrado = true; continue;
    }
    mensajeAsistente(m, {abrir: false});
  }
  actualizarCarrito(r.carrito);
  const pedidoEnCurso=!!(r.pedidos?.[0] && ['pendiente','confirmado','terminado'].includes(r.pedidos[0].estado));
  if (!r.cerrada && !pedidoEnCurso) {
    if (!(r.nuevos || []).length) chips(BOTONES_BASE());
    else if (!S.carrito.length && recuperarUltimoPedido().length)
      chips([{id:'repetir',texto:'Repetir mi último pedido'}]);
  }
  if (r.pedidos?.[0]) mostrarPedido(r.pedidos[0]);
  texto.disabled = false; $('btn-carta').disabled = false;
  if (!r.cerrada) {
    const escrito = recuperarLocal(CLAVE_TEXTO);
    if (typeof escrito==='string' && !texto.value) {
      texto.value=escrito.slice(0,600);
      texto.dispatchEvent(new Event('input'));
    }
    programarSondeo();
  } else mostrarCierre();
  $('app').setAttribute('aria-busy', 'false');
}

// ---------------------------------------------------------------------------------------------- demostración
const DEMO_DATOS = {
  sucursal: {slug: 'demo', nombre: 'Sucursal Centro', empresa: 'Tu Comercio', bienvenida: '', horario: 'Todos los días de 11 a 23',
    direccion: 'Av. Siempre Viva 742', acepta_retiro: true, acepta_envio: true, envio_costo: 800, envio_zona: 'hasta 20 cuadras',
    pedido_minimo: 3000, descuento_efectivo_pct:10, medios_pago: ['efectivo', 'transferencia', 'mercado_pago']},
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
  const ahoraDemo = params.get('ahora') && !Number.isNaN(Date.parse(params.get('ahora'))) ? new Date(params.get('ahora')) : new Date();
  const base = carteleraDelDia(DEMO_DATOS.sucursal, DEMO_DATOS.catalogo, ahoraDemo);
  delete base.clave;
  if (accion === 'abrir') {
    const r = responder({...base, estado: null, entrada: {inicio: true}, ahora: ahoraDemo});
    demoEstado = r.estado;
    const guardado = SHOWROOM?.read();
    if(guardado?.order) demoPedido = {...guardado.order, aviso: textoEstadoPedido(guardado.order, DEMO_DATOS.sucursal, {})};
    return {ok: true, ...base, mensajes: guardado?.messages || [], nuevos: r.mensajes, carrito: [],
      pedidos: demoPedido ? [demoPedido] : []};
  }
  if (accion === 'recibido') {
    if (!demoPedido || demoPedido.estado !== 'terminado') return {ok:false,error:'Todavía no puede confirmar recepción.'};
    demoPedido.recibido_at ||= new Date().toISOString();
    return {ok:true,pedido:demoPedido};
  }
  if (accion === 'estado') {
    const compartido = SHOWROOM?.read();
    if(compartido?.order) demoPedido={...compartido.order, aviso:textoEstadoPedido(compartido.order,DEMO_DATOS.sucursal,{})};
    const nuevosLocales=(compartido?.messages||[]).filter(m=>m.rol==='local'&&m.id>S.ultimoLocal);
    return {ok:true,pedidos:demoPedido?[demoPedido]:[],mensajes_local:nuevosLocales,cerrada:false};
  }
  if (accion === 'recordar') return params.get('frecuente')==='1'
    ? {ok:true,encontrado:true,nombre:'María Pérez',direccion:'Av. Siempre Viva 742',visitas:3}
    : {ok:true,encontrado:false};
  if (accion === 'adjuntar') return {ok:true,imagen_url:null,texto:'Foto enviada al gerente'};
  const r = responder({...base, estado: demoEstado, entrada: extra.entrada});
  demoEstado = r.estado;
  const mensajes = [...r.mensajes]; let pedido = null;
  if(SHOWROOM && extra?.entrada) {
    const t=String(extra.entrada.texto||extra.entrada.boton||'').trim();
    if(t)SHOWROOM.add('cliente',t);
    for(const m of mensajes)if(m.texto)SHOWROOM.add('asistente',m.texto);
  }
  if (r.accion?.tipo === 'crear_pedido') {
    const sub = totalCarrito(DEMO_DATOS.catalogo, r.estado.carrito);
    const envio = r.accion.pedido.entrega === 'envio' ? DEMO_DATOS.sucursal.envio_costo : 0;
    const efectivo = r.accion.pedido.entrega === 'envio' && r.accion.pedido.medio_pago === 'efectivo';
    const conDescuento = sub - totalSinDescuento(DEMO_DATOS.catalogo, r.estado.carrito);
    const descuento = efectivo ? Math.round(conDescuento * Number(DEMO_DATOS.sucursal.descuento_efectivo_pct)) / 100 : 0;
    const total = sub + envio - descuento;
    const abona = efectivo ? Number(r.accion.pedido.efectivo_abona || total) : null;
    const conAviso = p => ({...p, aviso: textoEstadoPedido(p, DEMO_DATOS.sucursal, {})});
    demoPedido = pedido = conAviso({creado_at:new Date().toISOString(), estado: 'pendiente',
      total, subtotal:sub, envio, descuento, efectivo_abona:abona,
      efectivo_cambio:efectivo ? abona-total : null, medio_pago: r.accion.pedido.medio_pago, motivo: '',
      entrega: r.accion.pedido.entrega, direccion: r.accion.pedido.direccion, nombre: r.accion.pedido.nombre.split(' ')[0]});
    if(SHOWROOM) {
      const piezas=(r.estado.carrito||[]).map(l=>{
        const p=DEMO_DATOS.catalogo.productos.find(x=>x.id===l.producto_id);
        return {cantidad:l.cantidad,nombre:p?.nombre||'Producto de prueba',
          opciones:detallesLinea(DEMO_DATOS.catalogo,l).map(o=>({...o,valores:[o.valores]})),
          nota:l.nota||'',importe:totalCarrito(DEMO_DATOS.catalogo,[l])};
      });
      const orden=SHOWROOM.order({...demoPedido,cliente_nombre:r.accion.pedido.nombre,
        cliente_telefono:r.accion.pedido.telefono||'',horario:r.accion.pedido.horario||'',
        nota:r.accion.pedido.nota||'',items:piezas});
      if(orden)demoPedido=pedido=conAviso({...orden,nombre:demoPedido.nombre});
    }
    r.estado.carrito = []; r.estado.sugerido = false;
    mensajes.push({texto: pedido.aviso});
    // La demo conserva el pedido pendiente: nunca simula una confirmación automática.
  } else if (r.accion?.tipo === 'estado') {
    mensajes.push({texto: demoPedido ? demoPedido.aviso : 'Todavía no hay pedidos enviados desde este chat.'});
  } else if (r.accion?.tipo === 'cancelar' && demoPedido?.estado === 'pendiente') {
    if(SHOWROOM)SHOWROOM.decide(demoPedido.id,'cancelado','Cancelado desde la vista cliente');
    demoPedido = pedido = {...demoPedido, estado: 'cancelado'};
    mensajes.push({texto: 'Su pedido fue cancelado.'});
  }
  return {ok: true, mensajes, carrito: r.estado.carrito, pedido,
    lote_aceptado: !!extra.entrada?.agregar_varios && r.estado.ultimo_lote === extra.entrada.lote_id};
}

iniciar();

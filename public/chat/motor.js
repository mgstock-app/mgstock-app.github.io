/* GESTLOK Chat · motor del asistente (sin IA, sin costo, determinístico).
 * Módulo puro: no usa red ni base. Lo usan la función segura «gestlok-chat» (Deno) y el modo demo del chat.
 * Entiende saludos, horario, envío, medios de pago, precios, la carta y pedidos escritos
 * («2 de carne y una pizza grande con aceitunas»). Arma el carrito; NUNCA confirma pedidos ni fija precios:
 * los importes que muestra son orientativos y la base los vuelve a calcular al crear el pedido.
 * La copia de public/chat/motor.js debe ser idéntica (lo controla tests/gestlok-chat-motor.test.mjs).
 */
const NUMEROS = {
  un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
  once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, veinte: 20, veinticuatro: 24, treinta: 30,
};
const VACIAS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'con', 'sin', 'y', 'a', 'al', 'en', 'para', 'por', 'un', 'una',
  'uno', 'unos', 'unas', 'quiero', 'queria', 'quisiera', 'me', 'das', 'das', 'mandame', 'mandas', 'traeme', 'pedir',
  'pido', 'hola', 'porfa', 'por', 'favor', 'gracias', 'tambien', 'mas', 'otra', 'otro', 'que', 'q', 'sea', 'son']);
/** Mantiene un trato respetuoso incluso en los textos del motor de respaldo. */
export function formalizar(texto) {
  return String(texto||'')
    .replace(/\b([Tt])u pedido\b/g,(_m,i)=>i==='T'?'Su pedido':'su pedido')
    .replace(/\b([Tt])us datos\b/g,(_m,i)=>i==='T'?'Sus datos':'sus datos')
    .replace(/\b([Tt])u dirección\b/g,(_m,i)=>i==='T'?'Su dirección':'su dirección')
    .replace(/\b([Tt])e responderá\b/g,(_m,i)=>i==='T'?'Le responderá':'le responderá')
    .replace(/\b([Tt])e avisamos\b/g,(_m,i)=>i==='T'?'Le avisamos':'le avisamos')
    .replace(/\b([Pp])odés\b/g,(_m,i)=>i==='P'?'Puede':'puede')
    .replace(/\b([Qq])uerés\b/g,(_m,i)=>i==='Q'?'Desea':'desea')
    .replace(/\b([Tt])ocá\b/g,(_m,i)=>i==='T'?'Seleccione':'seleccione')
    .replace(/\b([Ee])legí\b/g,(_m,i)=>i==='E'?'Elija':'elija')
    .replace(/\b([Mm])irá\b/g,(_m,i)=>i==='M'?'Consulte':'consulte')
    .replace(/\b([Rr])evisá\b/g,(_m,i)=>i==='R'?'Revise':'revise')
    .replace(/\b([Ee])scribime\b/g,(_m,i)=>i==='E'?'Escríbanos':'escríbanos')
    .replace(/\b([Cc])ompletá\b/g,(_m,i)=>i==='C'?'Complete':'complete')
    .replace(/\b([Aa])gregá\b/g,(_m,i)=>i==='A'?'Agregue':'agregue')
    .replace(/\b([Cc])onsultá\b/g,(_m,i)=>i==='C'?'Consulte':'consulte')
    .replace(/\b([Ss])i necesitás\b/g,(_m,i)=>i==='S'?'Si necesita':'si necesita')
    .replace(/\b([Tt])enés\b/g,(_m,i)=>i==='T'?'Tiene':'tiene')
    .replace(/\b([Pp])robá\b/g,(_m,i)=>i==='P'?'Intente':'intente')
    .replace(/\b([Vv])olvé\b/g,(_m,i)=>i==='V'?'Vuelva':'vuelva')
    .replace(/\b([Dd])ecime\b/g,(_m,i)=>i==='D'?'Indíqueme':'indíqueme')
    .replace(/\b([Hh])acemos\b/g,(_m,i)=>i==='H'?'Realizamos':'realizamos');
}
const MAX_CARRITO = 30;
const MAX_CANTIDAD = 50;

/** Mensajes automáticos sugeridos. El dueño los cambia en el panel (vacío = este texto).
 * Variables: {nombre} {codigo} {total} {direccion} {local} {motivo}. */
export const MENSAJES_BASE = {
  recibido: 'Gracias, {nombre}. Recibimos su pedido. El gerente lo revisará antes de confirmarlo. Total estimado: {total}.',
  terminado_retiro: '{nombre}, su pedido está listo para retirar en {local}. Al acercarse, solo indique su nombre.',
  terminado_envio: '{nombre}, su pedido está listo. El local coordinará la entrega en {direccion}.',
  rechazado: 'Le pedimos disculpas, {nombre}. No pudimos tomar su pedido. Motivo: {motivo}',
  pausado: 'En este momento el chat se encuentra en pausa. Puede volver a contactarnos más tarde.',
  despedida: 'Muchas gracias por comunicarse. Estamos a su disposición.',
};
/** Completa una plantilla con los datos (las variables sin dato quedan vacías). */
export function plantilla(texto, datos) {
  return String(texto ?? '').replace(/\{(nombre|codigo|total|direccion|local|motivo)\}/g, (_, k) => String(datos?.[k] ?? '')).replace(/[ \t]+\n/g, '\n').trim();
}
export function mensajeDe(mensajes, clave) {
  const propio = mensajes && typeof mensajes[clave] === 'string' ? mensajes[clave].trim() : '';
  return propio || MENSAJES_BASE[clave] || '';
}
/** Texto para el cliente según el estado de su pedido. */
export function textoEstadoPedido(pedido, sucursal, mensajes) {
  const s=sucursal||{};
  const nombre=pedido.nombre||'';
  const d={nombre,total:pesos(pedido.total),direccion:pedido.direccion||'su dirección',
    local:s.direccion||('el local de '+(s.nombre||'')).trim(),motivo:pedido.motivo||'',codigo:''};
  const salida = texto => formalizar(plantilla(String(texto||'').replace(/\bpedido\s*\{codigo\}/gi,'pedido').replace(/\{codigo\}/g,''),d)
     .replace(/\b[A-Z]{1,4}-\d{4,}\b/g,'').replace(/\s+([.!?,])/g,'$1'));
  switch(pedido.estado){
    case 'pendiente':
      return pedido.programado_para
        ? 'Gracias, '+nombre+'. Recibimos su pedido programado para '+new Intl.DateTimeFormat('es-AR',
           {timeZone:'America/Argentina/Buenos_Aires',weekday:'long',hour:'2-digit',minute:'2-digit'})
           .format(new Date(pedido.programado_para))+' h. Queda sujeto a revisión y confirmación del gerente antes de prepararlo.'
        : salida(mensajeDe(mensajes,'recibido'));
    case 'confirmado': return 'El gerente confirmó su pedido. El local está preparándolo.';
    case 'terminado': return salida(mensajeDe(mensajes,pedido.entrega==='envio'?'terminado_envio':'terminado_retiro'));
    case 'rechazado': return salida(mensajeDe(mensajes,'rechazado'));
    case 'cancelado': return 'Su pedido fue cancelado.';
    default: return '';
  }
}

export const PAGOS = {
  efectivo: 'Efectivo', transferencia: 'Transferencia', mercado_pago: 'Mercado Pago', debito: 'Tarjeta de débito', credito: 'Tarjeta de crédito',
};

export function normalizar(t) {
  return String(t ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9ñ\s]/g, ' ').replace(/\s+/g, ' ').trim();
}
const raiz = p => p.length > 4 && p.endsWith('es') ? p.slice(0, -2) : p.length > 3 && p.endsWith('s') ? p.slice(0, -1) : p;
const palabras = t => normalizar(t).split(' ').filter(Boolean);
const claves = t => palabras(t).filter(p => !VACIAS.has(p)).map(raiz);

export function pesos(n) {
  const v = Math.round(Number(n) || 0);
  return '$ ' + String(v).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function productoPorId(catalogo, id) { return (catalogo?.productos || []).find(p => p.id === id); }
function disponibles(catalogo) { return (catalogo?.productos || []).filter(p => p.activo !== false); }

/** Precio orientativo de una línea (la base recalcula siempre). */
export function importeLinea(catalogo, linea) {
  const p = productoPorId(catalogo, linea.producto_id);
  if (!p) return 0;
  let extra = 0;
  for (const g of p.opciones || []) {
    for (const vid of linea.opciones?.[g.id] || []) extra += Number(g.valores.find(v => v.id === vid)?.extra || 0);
  }
  return (Number(p.precio) + extra) * linea.cantidad;
}
export function totalCarrito(catalogo, carrito) {
  return (carrito || []).reduce((s, l) => s + importeLinea(catalogo, l), 0);
}
export function describirLinea(catalogo, linea) {
  const p = productoPorId(catalogo, linea.producto_id);
  if (!p) return linea.cantidad + ' × (producto que ya no está)';
  const ops = [];
  for (const g of p.opciones || []) {
    const vals = (linea.opciones?.[g.id] || []).map(id => g.valores.find(v => v.id === id)?.nombre).filter(Boolean);
    if (vals.length) ops.push(vals.join(', '));
  }
  return linea.cantidad + ' × ' + p.nombre + (ops.length ? ' (' + ops.join(' · ') + ')' : '') + (linea.nota ? ' — ' + linea.nota : '');
}

/** Opciones obligatorias que todavía faltan elegir en una línea. */
export function faltantes(producto, opciones) {
  return (producto.opciones || []).filter(g => g.obligatorio && !(opciones?.[g.id] || []).length);
}

/** Valida una línea igual que la base (para avisar antes de enviar). Devuelve '' o el problema. */
export function validarLinea(catalogo, linea) {
  const p = productoPorId(catalogo, linea.producto_id);
  if (!p || p.activo === false) return 'Ese producto ya no está en la carta.';
  if (p.disponible === false) return p.nombre + ' no está disponible ahora.';
  if (!Number.isInteger(linea.cantidad) || linea.cantidad < 1 || linea.cantidad > MAX_CANTIDAD) return 'Cantidad inválida.';
  for (const k of Object.keys(linea.opciones || {})) if (!(p.opciones || []).some(g => g.id === k)) return 'Opción inválida.';
  for (const g of p.opciones || []) {
    const sel = linea.opciones?.[g.id] || [];
    if (new Set(sel).size !== sel.length || sel.some(id => !g.valores.some(v => v.id === id))) return 'Opción inválida.';
    if (g.obligatorio && !sel.length) return 'Elegí ' + g.nombre.toLowerCase() + ' para ' + p.nombre + '.';
    if (g.tipo === 'una' && sel.length > 1) return 'En ' + g.nombre.toLowerCase() + ' elegí una sola opción.';
    if (g.tipo === 'varias' && sel.length > g.max) return 'En ' + g.nombre.toLowerCase() + ' podés elegir hasta ' + g.max + '.';
  }
  return '';
}

/** Busca productos por texto. Devuelve [{producto, puntaje}] ordenado. */
export function buscar(catalogo, texto) {
  const q = claves(texto);
  if (!q.length) return [];
  const res = [];
  for (const p of disponibles(catalogo)) {
    const n = claves(p.nombre);
    if (!n.length) continue;
    const enNombre = n.filter(w => q.includes(w)).length;
    const enTexto = q.filter(w => n.includes(w)).length;
    if (!enNombre) continue;
    // Prioriza que el texto cubra el nombre completo («empanada de carne» > «empanada»).
    const puntaje = enNombre / n.length + 0.15 * (enTexto / q.length);
    res.push({producto: p, puntaje});
  }
  return res.sort((a, b) => b.puntaje - a.puntaje || a.producto.nombre.localeCompare(b.producto.nombre));
}

function cantidadDe(segmento) {
  const t = normalizar(segmento);
  if (/\bmedia docena\b/.test(t)) return 6;
  if (/\bdocena\b/.test(t)) { const m = t.match(/\b(\d{1,2})\s+docenas?\b/); return m ? Number(m[1]) * 12 : 12; }
  const m = t.match(/(?:^|\s)(\d{1,3})(?:\s|$|x)/) || t.match(/^x\s?(\d{1,3})\b/);
  if (m) return Number(m[1]);
  for (const w of t.split(' ')) if (NUMEROS[w]) return NUMEROS[w];
  return 1;
}

/** Elige opciones nombradas en el texto («grande», «con aceitunas»). */
function opcionesDe(producto, segmento) {
  // «sin aceitunas»: lo que sigue a «sin» no se elige.
  const q = new Set(claves(normalizar(segmento).replace(/\bsin\s+[a-z0-9ñ]+/g, ' ')));
  const ops = {};
  for (const g of producto.opciones || []) {
    const elegidas = g.valores.filter(v => {
      const k = claves(v.nombre);
      return k.length && k.every(w => q.has(w));
    }).map(v => v.id);
    if (!elegidas.length) continue;
    ops[g.id] = g.tipo === 'una' ? elegidas.slice(0, 1) : elegidas.slice(0, g.max);
  }
  return ops;
}

/** Interpreta un pedido escrito. Devuelve {lineas, dudas, sinCoincidencia}. */
export function interpretarPedido(catalogo, texto) {
  // Corta por comas, «más» o «+»; «y» solo corta si sigue una cantidad («… y 1 de jamón y queso»).
  const cant = '(?:\\d|media\\b|docena\\b|' + Object.keys(NUMEROS).map(w => w + '\\b').join('|') + ')';
  const segmentos = String(texto ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .split(/,|\n|\s\+\s|\smas\s|;/)
    .flatMap(x => normalizar(x).split(new RegExp('\\sy\\s(?=' + cant + ')')))
    .map(x => x.trim()).filter(Boolean);
  const lineas = []; const dudas = []; const sinCoincidencia = [];
  let ultimo = null;
  for (const seg of segmentos) {
    const encontrados = buscar(catalogo, seg);
    let p = encontrados[0]?.producto;
    const empate = encontrados.filter(e => e.puntaje === encontrados[0]?.puntaje);
    // «2 de carne y 1 de jamón»: si el segmento no nombra el producto, se usa el anterior como contexto.
    if ((!p || empate.length > 1) && ultimo) {
      const ctx = buscar(catalogo, ultimo + ' ' + seg);
      if (ctx[0] && ctx.filter(e => e.puntaje === ctx[0].puntaje).length === 1) { p = ctx[0].producto; empate.length = 1; }
    }
    if (!p) { if (claves(seg).length) sinCoincidencia.push(seg); continue; }
    if (empate.length > 1) { dudas.push({texto: seg, opciones: empate.slice(0, 4).map(e => e.producto)}); continue; }
    ultimo = claves(p.nombre)[0] || ultimo;
    const cantidad = Math.min(MAX_CANTIDAD, Math.max(1, cantidadDe(seg)));
    lineas.push({producto_id: p.id, cantidad, opciones: opcionesDe(p, seg), nota: ''});
  }
  return {lineas, dudas, sinCoincidencia};
}

/** Consultas claramente ajenas a la gastronomía: se deriva en vez de inventar respuestas.
 * Los casos ambiguos se dejan a la IA y a su herramienta de derivación. */
export function consultaAjena(texto='') {
  const n=normalizar(texto);
  if (/\b(pedido|comida|menu|carta|delivery|repart|pizza|empanada|horario|local|envio|retiro|pago|demora|precio)\b/.test(n)) return false;
  return /\b(clima|pronostico|temperatura|presidente|politica|gobierno|elecciones|futbol|partido de futbol|river|boca juniors|medicina|diagnostico|enfermedad|cotizacion dolar|bolsa|criptomoneda|tarea escolar|historia argentina|programacion|codigo fuente|capital de|matematica|geografia|astrologia|horoscopo)\b/.test(n);
}
/** Clasifica reclamos antes de llamar a la IA; consultar tiempos no genera alerta por sí solo. */
export function clasificarSoporte(entrada = {}) {
  const b = String(entrada.boton || '');
  if (b === 'reclamo_demora') return 'demora';
  if (b === 'reclamo_faltante') return 'faltante';
  if (b === 'reclamo_otro' || b === 'hablar_gerente') return 'otro';
  const t = normalizar(String(entrada.texto || ''));
  if (!t) return null;
  if (/\b(faltante|me falta|me falto|faltaron|pedido incompleto|no me trajeron|no vino (la|el|un)|vino incompleto)\b/.test(t)) return 'faltante';
  if (/\b(reclamo|queja|me cobraron mal|cobraron de mas|pedido equivocado|pedido incorrecto|no es lo que pedi|vino frio|mal estado|mal servicio|vino mal|hablar con (un )?(gerente|responsable))\b/.test(t)) return 'otro';
  if (/\b(mi pedido (se )?(demora|esta tardando|tarda mucho|no llega)|no llego mi pedido|pedido no llega|sigo esperando|paso (una|1|dos|2) hora|tardo mucho|viene demorado|se esta demorando)\b/.test(t)) return 'demora';
  if (/\b(cuanto (tarda|demora|falta)|tiempo (de entrega|estimado)|cuanta demora|demora del delivery|demora para retirar)\b/.test(t)) return 'consulta_demora';
  return null;
}
export function textoDemora(s = {}) {
  const r = s.demora_retiro ? 'Retiro en el local: ' + s.demora_retiro + '.' : '';
  const d = s.demora_envio ? 'Delivery: ' + s.demora_envio + '.' : '';
  return [r,d].filter(Boolean).join('\n') ||
    'El tiempo estimado de entrega todavía no está configurado para este local.';
}

function intencion(t) {
  const n = normalizar(t);
  if (!n) return 'vacio';
  if (/\b(cuanto tarda|cuanto demora|cuanta demora|tiempo de entrega|demora del delivery)\b/.test(n)) return 'demora';
  if (/\b(estado|como va|ya esta|confirmaron|cuanto falta|llego)\b/.test(n) ||
      (/\bmi pedido\b/.test(n) && n.split(' ').length <= 5 && !/\d/.test(n))) return 'estado';
  if (/\b(cancel|anula)/.test(n)) return 'cancelar';
  if (/\b(finaliz|terminar|termine|listo|eso es todo|nada mas|confirmar|cerrar pedido|enviar pedido)\b/.test(n)) return 'finalizar';
  if (/\b(carrito|ver pedido|que pedi|resumen)\b/.test(n)) return 'carrito';
  if (/\b(vaciar|borrar todo|empezar de nuevo)\b/.test(n)) return 'vaciar';
  if (/\b(horario|hora|abren|abierto|cierran|atienden)\b/.test(n)) return 'horario';
  if (/\b(envio|envian|delivery|domicilio|zona|llevan|mandan)\b/.test(n)) return 'envio';
  if (/\b(pago|pagar|tarjeta|efectivo|transferencia|mercado ?pago|debito|credito|alias|cbu)\b/.test(n)) return 'pago';
  if (/\b(direccion|donde estan|ubicacion|donde queda)\b/.test(n)) return 'direccion';
  if (/\b(carta|menu|que tienen|que hay|productos|opciones)\b/.test(n)) return 'carta';
  if (/\b(precio|cuanto|sale|cuesta|valor)\b/.test(n)) return 'precio';
  if (/\b(persona|humano|alguien|atencion|hablar)\b/.test(n)) return 'humano';
  if (/^(hola|buenas|buen dia|buenas tardes|buenas noches|holi|hey)\b/.test(n) && n.split(' ').length <= 4) return 'saludo';
  if (/^(gracias|genial|perfecto|dale|ok|joya|buenisimo)\b/.test(n) && n.split(' ').length <= 3) return 'gracias';
  return 'texto';
}

const BOTONES_INICIO = [
  {id: 'carta', texto: 'Ver menú'}, {id: 'horario', texto: 'Horario y envío'},
  {id: 'pago', texto: 'Medios de pago'}, {id: 'soporte', texto: 'Ayuda con mi pedido'},
];
export function botonesCarrito(carrito) {
  return carrito.length
    ? [{id: 'finalizar', texto: 'Finalizar pedido'}, {id: 'carta', texto: 'Agregar más'}, {id: 'carrito', texto: 'Ver mi pedido'}]
    : BOTONES_INICIO;
}

export function textoHorario(s) {
  return (s.horario ? 'Horario: ' + s.horario + '.' : 'El local todavía no cargó su horario.') +
    (s.direccion ? '\nEstamos en ' + s.direccion + '.' : '');
}
export function textoEnvio(s) {
  const partes = [];
  if (s.acepta_retiro) partes.push('Podés retirar en el local' + (s.direccion ? ' (' + s.direccion + ')' : '') + '.');
  if (s.acepta_envio) {
    partes.push('Hacemos envíos' + (s.envio_zona ? ' a ' + s.envio_zona : '') +
      (Number(s.envio_costo) > 0 ? '. Costo de envío: ' + pesos(s.envio_costo) : ' sin cargo') + '.');
  } else partes.push('Por ahora no hacemos envíos.');
  if (Number(s.pedido_minimo) > 0) partes.push('Pedido mínimo: ' + pesos(s.pedido_minimo) + '.');
  return partes.join('\n');
}
export function pagosDe(s, entrega) {
  const personalizados = entrega === 'envio' ? s.medios_pago_envio : s.medios_pago_retiro;
  return Array.isArray(personalizados) && personalizados.length ? personalizados : (s.medios_pago || ['efectivo']);
}
export function textoPago(s) {
  const retiro = s.acepta_retiro ? 'Retiro en el local: ' + pagosDe(s, 'retiro').map(m => PAGOS[m] || m).join(', ') + '.' : '';
  const envio = s.acepta_envio ? 'Delivery: ' + pagosDe(s, 'envio').map(m => PAGOS[m] || m).join(', ') + '.' : '';
  return [retiro, envio].filter(Boolean).join('\n') || 'Consultá los medios de pago con el local.';
}
// Ejemplo de pedido armado con la carta de ESTE local (sirve para cualquier comercio).
export function ejemploPedido(catalogo) {
  const ps = (catalogo?.productos || []).filter(p => p.activo !== false && p.disponible !== false);
  if (!ps.length) return '«2 de tal producto»';
  const nombre = p => String(p.nombre || '').trim().toLowerCase();
  return ps.length > 1 ? '«2 ' + nombre(ps[0]) + ' y 1 ' + nombre(ps[1]) + '»' : '«2 ' + nombre(ps[0]) + '»';
}
export function textoCarrito(catalogo, carrito) {
  if (!carrito.length) return 'Tu pedido está vacío. Tocá «Ver la carta» o escribime qué querés, por ejemplo ' + ejemploPedido(catalogo) + '.';
  return 'Tu pedido:\n' + carrito.map(l => '• ' + describirLinea(catalogo, l)).join('\n') +
    '\nTotal estimado: ' + pesos(totalCarrito(catalogo, carrito));
}

/** Agrega líneas al carrito (sumando cantidades si es igual). Devuelve los avisos. */
export function sumar(catalogo, carrito, lineas) {
  const avisos = [];
  for (const l of lineas) {
    const p = productoPorId(catalogo, l.producto_id);
    if (!p) continue;
    if (p.disponible === false) { avisos.push(p.nombre + ' no está disponible ahora.'); continue; }
    const igual = carrito.find(x => x.producto_id === l.producto_id && JSON.stringify(x.opciones || {}) === JSON.stringify(l.opciones || {}) && !x.nota && !l.nota);
    if (igual) igual.cantidad = Math.min(MAX_CANTIDAD, igual.cantidad + l.cantidad);
    else if (carrito.length < MAX_CARRITO) carrito.push({producto_id: l.producto_id, cantidad: l.cantidad, opciones: l.opciones || {}, nota: String(l.nota || '').slice(0, 200)});
    else avisos.push('Llegaste al máximo de productos distintos por pedido.');
  }
  return avisos;
}

export function estadoInicial() { return {carrito: [], paso: 'inicio', pendientes: [], programado: false}; }

export function limpiarEstado(estado, catalogo) {
  const e = Object.assign(estadoInicial(), estado && typeof estado === 'object' ? estado : {});
  e.carrito = (Array.isArray(e.carrito) ? e.carrito : []).filter(l => productoPorId(catalogo, l.producto_id) && Number.isInteger(l.cantidad)).slice(0, MAX_CARRITO);
  e.pendientes = (Array.isArray(e.pendientes) ? e.pendientes : []).slice(0, 4);
  return e;
}

/**
 * Responde un turno.
 * @param {{sucursal, catalogo, estado, entrada:{texto?:string, boton?:string, agregar?:object, quitar?:number, datos?:object}}} p
 * @returns {{estado, mensajes:Array<{texto:string, botones?:Array, tipo?:string, productos?:Array}>, accion?:object}}
 */
export function responder({sucursal, catalogo, estado, entrada, mensajes}) {
  const s = sucursal || {};
  const e = limpiarEstado(estado, catalogo);
  const out = [];
  const decir = (texto, extra = {}) => out.push({texto:formalizar(texto), ...extra});
  const fin = (accion) => ({estado: e, mensajes: out, ...(accion ? {accion} : {})});
  entrada = entrada || {};

  if (entrada.inicio) {
    if (s.atencion?.habilitado && s.atencion.abierto === false) {
      decir('Buenas tardes. Por el momento nuestro local está cerrado. Abriremos nuevamente '+s.atencion.proximo_texto+
        '. ¿Desea dejar un pedido programado para la próxima apertura? El gerente lo revisará y confirmará cuando corresponda.',{
        botones:[{id:'programar_si',texto:'Sí, dejar pedido programado'},
          {id:'programar_no',texto:'No, gracias'},{id:'soporte',texto:'Consultar al gerente'}]});
      return fin();
    }
    decir(s.bienvenida?.trim() ||
      ('¡Hola! Soy ' + (s.asistente ? s.asistente + ', ' : 'el ') + 'asistente de ' + (s.empresa || 'el local') + ' ' +
       (s.nombre || '') + '. ¿En qué puedo ayudarte? Podés escribirme o pedirme el menú.').trim(),
      {botones: BOTONES_INICIO});
    return fin();
  }
  if (entrada.boton === 'programar_si') {
    if (!s.atencion?.habilitado) {decir('La programación no está habilitada para este local.');return fin();}
    e.programado=true;
    decir('Con gusto. Puede elegir los productos de la carta. Su pedido quedará programado para '+
      s.atencion.proximo_texto+' y será revisado por el gerente antes de su preparación.',{
      botones:[{id:'carta',texto:'Ver menú'},{id:'soporte',texto:'Contactar al gerente'}]});
    return fin();
  }
  if (entrada.boton === 'programar_no') {
    e.programado=false;
    decir('Entendido. Cuando lo desee, puede volver a comunicarse. Muchas gracias.',{botones:BOTONES_INICIO});
    return fin();
  }
  if (entrada.agregar) {
    const l = {producto_id: entrada.agregar.producto_id, cantidad: Number(entrada.agregar.cantidad),
      opciones: entrada.agregar.opciones || {}, nota: String(entrada.agregar.nota || '').slice(0, 200)};
    const problema = validarLinea(catalogo, l);
    if (problema) { decir(problema, {botones: botonesCarrito(e.carrito)}); return fin(); }
    const avisos = sumar(catalogo, e.carrito, [l]);
    decir((avisos.length ? avisos.join('\n') + '\n' : 'Listo, agregué ' + describirLinea(catalogo, l) + '.\n') +
      'Total estimado: ' + pesos(totalCarrito(catalogo, e.carrito)), {botones: botonesCarrito(e.carrito)});
    e.paso = 'pedido';
    return fin();
  }
  if (Number.isInteger(entrada.quitar)) {
    if (e.carrito[entrada.quitar]) e.carrito.splice(entrada.quitar, 1);
    decir(textoCarrito(catalogo, e.carrito), {botones: botonesCarrito(e.carrito)});
    return fin();
  }
  if (entrada.datos) {
    if (s.atencion?.habilitado && !s.atencion.abierto && !e.programado) {
      decir('Por el momento el local está cerrado. ¿Desea dejar este pedido para '+s.atencion.proximo_texto+'?',{
        botones:[{id:'programar_si',texto:'Sí, programar pedido'},{id:'programar_no',texto:'No, gracias'}]});
      return fin();
    }
    // El formulario de cierre envía los datos: la base valida todo y crea el pedido.
    if (!e.carrito.length) { decir('Tu pedido está vacío.', {botones: BOTONES_INICIO}); return fin(); }
    for (const l of e.carrito) {
      const problema = validarLinea(catalogo, l);
      if (problema) { decir(problema, {botones: botonesCarrito(e.carrito)}); return fin(); }
    }
    const d = entrada.datos;
    return fin({tipo: 'crear_pedido', pedido: {
      items: e.carrito.map(l => ({producto_id: l.producto_id, cantidad: l.cantidad, opciones: l.opciones, nota: l.nota})),
      nombre: String(d.nombre || '').slice(0, 80), telefono: String(d.telefono || '').slice(0, 25),
      entrega: d.entrega === 'envio' ? 'envio' : 'retiro', direccion: String(d.direccion || '').slice(0, 200),
      horario: e.programado && !s.atencion?.abierto ? '' : String(d.horario || '').slice(0, 60),
      programar: Boolean(e.programado), medio_pago: String(d.medio_pago || ''), nota: String(d.nota || '').slice(0, 500),
    }});
  }

  const texto = String(entrada.texto || '').slice(0, 600);
  const accion = entrada.boton ? String(entrada.boton) : intencion(texto);

  // Dudas pendientes: «¿Cuál?» → el cliente toca una opción.
  if (accion.startsWith('elegir:')) {
    const [, id, cant] = accion.split(':');
    const p = productoPorId(catalogo, id);
    if (p) {
      const falta = faltantes(p, {});
      if (falta.length) { decir('Elegí las opciones de ' + p.nombre + '.', {tipo: 'producto', productos: [p.id], cantidad: Number(cant) || 1}); return fin(); }
      sumar(catalogo, e.carrito, [{producto_id: p.id, cantidad: Math.min(MAX_CANTIDAD, Number(cant) || 1), opciones: {}}]);
      decir(textoCarrito(catalogo, e.carrito), {botones: botonesCarrito(e.carrito)});
    }
    return fin();
  }

  switch (accion) {
    case 'programar_si': return responder({sucursal:s,catalogo,estado:e,entrada:{boton:'programar_si'},mensajes});
    case 'programar_no': return responder({sucursal:s,catalogo,estado:e,entrada:{boton:'programar_no'},mensajes});
    case 'vacio': decir('Escribime qué necesitás.', {botones: botonesCarrito(e.carrito)}); return fin();
    case 'saludo': decir('¡Hola! ¿Qué te gustaría pedir hoy?', {botones: botonesCarrito(e.carrito)}); return fin();
    case 'gracias': decir(mensajeDe(mensajes, 'despedida'), {botones: botonesCarrito(e.carrito)}); return fin();
    case 'horario': decir(textoHorario(s) + '\n' + textoEnvio(s), {botones: botonesCarrito(e.carrito)}); return fin();
    case 'soporte':
      decir('¿Necesitás consultar una demora o informar un problema con tu pedido? El gerente puede responderte por este mismo chat.', {
        botones: [{id:'demora',texto:'Consultar demora'},{id:'reclamo_faltante',texto:'Faltante en mi pedido'},
          {id:'reclamo_otro',texto:'Otro reclamo'},{id:'hablar_gerente',texto:'Hablar con el gerente'}]});
      return fin();
    case 'demora':
      decir('Los tiempos habituales son estimados:\n' + textoDemora(s) +
        '\nSi tu pedido ya está demorado, puedo avisarle al gerente para que te responda acá.', {
        botones: [{id:'reclamo_demora',texto:'Avisar demora al gerente'},
          {id:'reclamo_faltante',texto:'Reclamar faltante'},{id:'soporte',texto:'Más ayuda'}]});
      return fin();
    case 'envio': decir(textoEnvio(s), {botones: botonesCarrito(e.carrito)}); return fin();
    case 'pago': decir(textoPago(s), {botones: botonesCarrito(e.carrito)}); return fin();
    case 'direccion': decir(s.direccion ? 'Estamos en ' + s.direccion + '.' : 'El local todavía no cargó su dirección.', {botones: botonesCarrito(e.carrito)}); return fin();
    case 'carta': decir('Esta es nuestra carta. Tocá un producto para agregarlo.', {tipo: 'carta'}); return fin();
    case 'carrito': decir(textoCarrito(catalogo, e.carrito), {tipo: e.carrito.length ? 'carrito' : undefined, botones: botonesCarrito(e.carrito)}); return fin();
    case 'vaciar': e.carrito = []; decir('Listo, empezamos de nuevo.', {botones: BOTONES_INICIO}); return fin();
    case 'humano': decir('El gerente puede responderle por este mismo chat. Para pedir atención, seleccione la opción de soporte.',{botones:[{id:'hablar_gerente',texto:'Hablar con el gerente'}]}); return fin();
    case 'estado': decir('Te muestro cómo va tu pedido.'); return fin({tipo: 'estado'});
    case 'cancelar':
      if (e.carrito.length) { e.carrito = []; decir('Listo, vacié tu pedido.', {botones: BOTONES_INICIO}); return fin(); }
      decir('Voy a cancelar tu pedido pendiente.'); return fin({tipo: 'cancelar'});
    case 'finalizar':
      if (!e.carrito.length) { decir(textoCarrito(catalogo, e.carrito), {botones: BOTONES_INICIO}); return fin(); }
      for (const l of e.carrito) {
        const problema = validarLinea(catalogo, l);
        if (problema) { decir(problema, {botones: botonesCarrito(e.carrito)}); return fin(); }
      }
      if (Number(s.pedido_minimo) > 0 && totalCarrito(catalogo, e.carrito) < Number(s.pedido_minimo)) {
        decir('El pedido mínimo es de ' + pesos(s.pedido_minimo) + '. ' + textoCarrito(catalogo, e.carrito), {botones: botonesCarrito(e.carrito)});
        return fin();
      }
      if (s.atencion?.habilitado && !s.atencion.abierto && !e.programado) {
        decir('Estamos cerrados y abriremos nuevamente '+s.atencion.proximo_texto+
          '. ¿Desea programar su pedido?',{botones:[{id:'programar_si',texto:'Sí, programar pedido'},
          {id:'programar_no',texto:'No, gracias'}]}); return fin();
      }
      e.paso = 'datos';
      decir(textoCarrito(catalogo, e.carrito) + '\nComplete sus datos para enviar el pedido al local.', {tipo: 'datos'});
      return fin();
    default: break;
  }

  // Precio de un producto.
  if (accion === 'precio') {
    const r = buscar(catalogo, texto).slice(0, 5);
    if (!r.length) { decir('No encontré ese producto. Mirá la carta completa:', {tipo: 'carta'}); return fin(); }
    decir(r.map(x => x.producto.nombre + ': ' + pesos(x.producto.precio) + (x.producto.disponible === false ? ' (agotado hoy)' : '')).join('\n'),
      {botones: botonesCarrito(e.carrito)});
    return fin();
  }

  // Texto libre: intentar armar el pedido.
  const {lineas, dudas, sinCoincidencia} = interpretarPedido(catalogo, texto);
  if (!lineas.length && !dudas.length && /\b(pedi|pedido|ordenar|encargar)/.test(normalizar(texto))) {
    decir('¡Dale! Mirá la carta y tocá lo que quieras, o escribime por ejemplo ' + ejemploPedido(catalogo) + '.', {tipo: 'carta'});
    return fin();
  }
  if (!lineas.length && !dudas.length) {
    decir('No te entendí bien. Podés escribir algo como ' + ejemploPedido(catalogo) + ' o mirar la carta.', {botones: botonesCarrito(e.carrito)});
    return fin();
  }
  const completas = []; const aElegir = [];
  for (const l of lineas) {
    const p = productoPorId(catalogo, l.producto_id);
    (faltantes(p, l.opciones).length ? aElegir : completas).push(l);
  }
  const avisos = sumar(catalogo, e.carrito, completas);
  if (completas.length) {
    decir('Agregué:\n' + completas.map(l => '• ' + describirLinea(catalogo, l)).join('\n') +
      (avisos.length ? '\n' + avisos.join('\n') : '') + '\nTotal estimado: ' + pesos(totalCarrito(catalogo, e.carrito)),
      {botones: aElegir.length || dudas.length ? undefined : botonesCarrito(e.carrito)});
    e.paso = 'pedido';
  }
  for (const l of aElegir) {
    const p = productoPorId(catalogo, l.producto_id);
    decir('Para ' + p.nombre + ' elegí ' + faltantes(p, l.opciones).map(g => g.nombre.toLowerCase()).join(' y ') + ':',
      {tipo: 'producto', productos: [p.id], cantidad: l.cantidad, opciones: l.opciones});
  }
  for (const d of dudas) {
    const cant = Math.min(MAX_CANTIDAD, Math.max(1, cantidadDe(d.texto)));
    decir('¿Cuál de estos querés para «' + d.texto + '»?', {botones: d.opciones.map(p => ({id: 'elegir:' + p.id + ':' + cant, texto: p.nombre}))});
  }
  if (sinCoincidencia.length && (completas.length || aElegir.length || dudas.length)) {
    decir('No encontré: ' + sinCoincidencia.join(', ') + '. Revisá la carta.', {botones: [{id: 'carta', texto: 'Ver la carta'}]});
  }
  return fin();
}

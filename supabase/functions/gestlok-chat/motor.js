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
    .replace(/\b([Tt])e responderá(?=\s|[.!?,;:]|$)/g,(_m,i)=>i==='T'?'Le responderá':'le responderá')
    .replace(/\b([Tt])e avisamos\b/g,(_m,i)=>i==='T'?'Le avisamos':'le avisamos')
    .replace(/\b([Pp])odés\b/g,(_m,i)=>i==='P'?'Puede':'puede')
    .replace(/\b([Qq])uerés\b/g,(_m,i)=>i==='Q'?'Desea':'desea')
    .replace(/\b([Tt])ocá(?=\s|[.!?,;:]|$)/g,(_m,i)=>i==='T'?'Seleccione':'seleccione')
    .replace(/\b([Ee])legí(?=\s|[.!?,;:]|$)/g,(_m,i)=>i==='E'?'Elija':'elija')
    .replace(/\b([Mm])irá(?=\s|[.!?,;:]|$)/g,(_m,i)=>i==='M'?'Consulte':'consulte')
    .replace(/\b([Rr])evisá(?=\s|[.!?,;:]|$)/g,(_m,i)=>i==='R'?'Revise':'revise')
    .replace(/\b([Ee])scribime\b/g,(_m,i)=>i==='E'?'Escríbanos':'escríbanos')
    .replace(/\b([Cc])ompletá(?=\s|[.!?,;:]|$)/g,(_m,i)=>i==='C'?'Complete':'complete')
    .replace(/\b([Aa])gregá(?=\s|[.!?,;:]|$)/g,(_m,i)=>i==='A'?'Agregue':'agregue')
    .replace(/\b([Cc])onsultá(?=\s|[.!?,;:]|$)/g,(_m,i)=>i==='C'?'Consulte':'consulte')
    .replace(/\b([Ss])i necesitás\b/g,(_m,i)=>i==='S'?'Si necesita':'si necesita')
    .replace(/\b([Tt])enés\b/g,(_m,i)=>i==='T'?'Tiene':'tiene')
    .replace(/\b([Pp])robá(?=\s|[.!?,;:]|$)/g,(_m,i)=>i==='P'?'Intente':'intente')
    .replace(/\b([Vv])olvé\b/g,(_m,i)=>i==='V'?'Vuelva':'vuelva')
    .replace(/\b([Dd])ecime\b/g,(_m,i)=>i==='D'?'Indíqueme':'indíqueme')
    .replace(/\b([Hh])acemos\b/g,(_m,i)=>i==='H'?'Realizamos':'realizamos')
    .replace(/\b([Tt])e\b/g,(_m,i)=>i==='T'?'Le':'le')
    .replace(/\b([Tt])u\b/g,(_m,i)=>i==='T'?'Su':'su')
    .replace(/\b([Tt])us\b/g,(_m,i)=>i==='T'?'Sus':'sus')
    .replace(/ayudarte/gi,'ayudarle')
    .replace(/([Nn])ecesitás/g,(_m,i)=>i==='N'?'Necesita':'necesita')
    .replace(/([Qq])uerías/g,(_m,i)=>i==='Q'?'Desearía':'desearía')
;
}
const MAX_CARRITO = 30;
const MAX_CANTIDAD = 50;

/** Mensajes automáticos sugeridos. El dueño los cambia en el panel (vacío = este texto).
 * Variables: {nombre} {codigo} {total} {direccion} {local} {motivo}. */
export const MENSAJES_BASE = {
  recibido: 'Gracias, {nombre}. Recibimos su pedido, que está pendiente de revisión y confirmación del gerente. Total estimado: {total}.',
  terminado_retiro: '{nombre}, su pedido está listo para retirar en {local}. Al acercarse, solo indique su nombre.',
  terminado_envio: '{nombre}, su pedido está en camino a {direccion}.',
  rechazado: 'Le pedimos disculpas, {nombre}. No pudimos tomar su pedido. Motivo: {motivo}',
  pausado: 'En este momento el chat se encuentra en pausa. Puede volver a contactarnos más tarde.',
  despedida: 'Muchas gracias por comunicarse. Estamos a su disposición.',
  // Al terminar el pedido (listo para retirar o enviado): invitación a reseñar (solo si hay link) y cierre.
  resena: '¿Cómo fue su experiencia? Nos ayudaría mucho que nos la cuente en una reseña.',
  cierre: '¡Gracias por elegirnos!',
  // Venta sugerida: antes de pedir los datos, si el pedido no tiene postre o bebida.
  sugerencia: 'Antes de finalizar, ¿desea agregar un postre o una bebida para acompañar su pedido?',
};
/** Link de reseñas del local: solo https y solo dominios de Google (evita enlaces engañosos). '' si no sirve. */
export function urlResena(u) {
  const t = String(u ?? '').trim();
  if (!t || t.length > 300 || /[\s<>"']/.test(t)) return '';
  let x; try { x = new URL(t); } catch { return ''; }
  const hosts = ['g.page', 'maps.app.goo.gl', 'goo.gl', 'g.co', 'search.google.com', 'maps.google.com',
    'google.com', 'www.google.com', 'google.com.ar', 'www.google.com.ar'];
  return x.protocol === 'https:' && !x.username && !x.password && !x.port && hosts.includes(x.hostname) ? x.href : '';
}
/** Pedido terminado (listo para retirar o enviado) → reseña y cierre sin exigir recepción del cliente. null en otros estados. */
export function cierrePedido(pedido, mensajes) {
  if (pedido?.estado !== 'terminado') return null;
  const d = {nombre: pedido.nombre || ''};
  const url = urlResena(mensajes?.resena_url);
  return {resena: url ? {texto: formalizar(plantilla(mensajeDe(mensajes, 'resena'), d)), url} : null,
    cierre: formalizar(plantilla(mensajeDe(mensajes, 'cierre'), d))};
}
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
        : (() => {
          const t=salida(mensajeDe(mensajes,'recibido'));
          const valido=/(preparando|prepara|preparación|confirmad|listo|en camino|despach|entregad|ya sale)/i.test(t)
            ? 'Gracias, '+(nombre||'')+'. Recibimos su pedido, que está pendiente de revisión y confirmación del gerente.' : t;
          return /pendiente de revisión y confirmación/i.test(valido)
            ? valido : valido+' Su pedido está pendiente de revisión y confirmación del gerente.';
        })();
    case 'confirmado': {
      const plazo=pedido.entrega==='envio'?s.demora_envio:s.demora_retiro;
      const demora=typeof plazo==='string'?plazo.trim().replace(/[.!?]+$/,''):'';
      return 'El gerente confirmó su pedido. El local está preparándolo.'+
        (demora?' Tiempo estimado de '+(pedido.entrega==='envio'?'envío':'retiro')+': '+demora+'.':'');
    }
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

/* Grupo «cantidad» (promos y combos de cualquier rubro): el cliente reparte un total exacto entre variedades,
 * pudiendo repetir. Ej.: «Pack 6 empanadas + 2 salsas» → {empanadas: {carne: 3, pollo: 3}, salsas: {criolla: 2}}.
 * Una variedad puede apuntar a un producto de la carta (producto_id): si ese producto se agota, deja de ofrecerse. */
export function esCantidad(g) { return g?.tipo === 'cantidad'; }
/** Unidades elegidas en un grupo «cantidad» ({id: n} → suma). */
export function unidades(sel) {
  return sel && typeof sel === 'object' && !Array.isArray(sel) ? Object.values(sel).reduce((a, n) => a + (Number.isInteger(n) && n > 0 ? n : 0), 0) : 0;
}
/** Variedades que se pueden elegir hoy (sin las que apuntan a un producto agotado o fuera de la carta). */
export function valoresDisponibles(catalogo, g) {
  return (g?.valores || []).filter(v => {
    if (!v.producto_id) return true;
    const x = productoPorId(catalogo, v.producto_id);
    return !!x && x.activo !== false && x.disponible !== false;
  });
}
/** Lista de ids elegidos (grupos «una»/«varias») o pares [id, n] (grupo «cantidad»). */
function elegidos(g, sel) {
  if (esCantidad(g)) return sel && typeof sel === 'object' && !Array.isArray(sel) ? Object.entries(sel).filter(([, n]) => Number.isInteger(n) && n > 0) : [];
  return Array.isArray(sel) ? sel.map(id => [id, 1]) : [];
}

/** Precio orientativo de una línea (la base recalcula siempre). */
export function importeLinea(catalogo, linea) {
  const p = productoPorId(catalogo, linea.producto_id);
  if (!p) return 0;
  let extra = 0;
  for (const g of p.opciones || []) {
    for (const [vid, n] of elegidos(g, linea.opciones?.[g.id])) extra += n * Number(g.valores.find(v => v.id === vid)?.extra || 0);
  }
  return (Number(p.precio) + extra) * linea.cantidad;
}
export function totalCarrito(catalogo, carrito) {
  return (carrito || []).reduce((s, l) => s + importeLinea(catalogo, l), 0);
}
export function detallesLinea(catalogo, linea) {
  const p = productoPorId(catalogo, linea.producto_id);
  const ops = [];
  for (const g of p?.opciones || []) {
    const vals = elegidos(g, linea.opciones?.[g.id]).map(([id, n]) => {
      const nombre = g.valores.find(v => v.id === id)?.nombre;
      return nombre && (esCantidad(g) ? n + ' ' + nombre : nombre);
    }).filter(Boolean);
    if (vals.length) ops.push({grupo: g.nombre, valores: vals.join(', ')});
  }
  return ops;
}
export function describirLinea(catalogo, linea) {
  const p = productoPorId(catalogo, linea.producto_id);
  if (!p) return linea.cantidad + ' × (producto que ya no está)';
  const ops = detallesLinea(catalogo, linea).map(o => o.valores);
  return linea.cantidad + ' × ' + p.nombre + (ops.length ? ' (' + ops.join(' · ') + ')' : '') + (linea.nota ? ' — ' + linea.nota : '');
}

/* GLOBAL vs. LOCAL. El motor es el mismo para todos los comercios. Lo propio de cada local es configuración:
 * - sucursal.menu_interactivo: pedidos por el menú interactivo (promos con selector, sin texto libre al carrito).
 * - producto.reglas (cada promo o producto): {cuando: {dia_semana 1-7 (4 = jueves), semana: 'todas'|'ultima',
 *   desde 'HH:MM', hasta 'HH:MM'}, nombre, aviso, exclusiva, solo_efectivo, sin_descuento, compartir}.
 *   Ej. Mi Gusto «Jueves On Fire»: último jueves desde las 18:00, exclusiva, solo efectivo y sin descuento. */
export function usaMenuInteractivo(sucursal) {
  return sucursal?.menu_interactivo === true;
}
const reglasDe = p => (p?.reglas && typeof p.reglas === 'object' && !Array.isArray(p.reglas)) ? p.reglas : {};

export function promocionesVigentes(catalogo) {
  const categorias = new Set((catalogo?.categorias || [])
    .filter(c => /\b(promocion\w*|combos?|packs?)\b/.test(normalizar(c.nombre))).map(c => c.id));
  return disponibles(catalogo).filter(p => p.disponible !== false &&
    (categorias.has(p.categoria_id) || /\b(promocion\w*|promos?|combos?|packs?)\b/.test(normalizar(p.nombre))) &&
    (p.opciones || []).every(g => !esCantidad(g) || valoresDisponibles(catalogo, g).length > 0));
}

/* Promos «para compartir» (regla compartir del producto, ej. pizza + empanadas): llevan productos fijos además de
 * las unidades a elección, así que no se ofrecen para empanadas sueltas; sí cuando el cliente menciona pizza. */
export function promoParaCompartir(catalogo, p) {
  return reglasDe(p).compartir === true;
}

/* ------------------------------------------------------------- Promos programadas (configuración de cada local)
 * Un producto con reglas.cuando solo se ofrece en su día y horario (hora de Argentina). Si además es «exclusiva»,
 * mientras rige es lo único que se ofrece. La función del servidor aplica esta cartelera ANTES de responder y la base
 * vuelve a controlar día, horario y pago al crear el pedido. */
const TZ_AR = 'America/Argentina/Buenos_Aires';
function horaAR(ahora) {
  const f = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {timeZone: TZ_AR, year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23'}).formatToParts(ahora).map(x => [x.type, x.value]));
  return {anio: Number(f.year), mes: Number(f.month), dia: Number(f.day), minutos: Number(f.hour) * 60 + Number(f.minute),
    semana: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(f.weekday) + 1, fecha: f.year + '-' + f.month + '-' + f.day};
}
const minutosDe = (hhmm, def) => /^\d{1,2}:\d{2}$/.test(String(hhmm || '')) ? Number(hhmm.split(':')[0]) * 60 + Number(hhmm.split(':')[1]) : def;
/** ¿Rige ahora la regla «cuando» de un producto? Sin «cuando», siempre. */
export function reglaVigente(reglas, ahora = new Date()) {
  const c = reglas?.cuando;
  if (!c || typeof c !== 'object') return true;
  const a = horaAR(ahora);
  if (c.dia_semana && Number(c.dia_semana) !== a.semana) return false;
  if (c.semana === 'ultima' && a.dia + 7 <= new Date(Date.UTC(a.anio, a.mes, 0)).getUTCDate()) return false;
  return a.minutos >= minutosDe(c.desde, 0) && a.minutos <= minutosDe(c.hasta, 24 * 60 - 1);
}
export const esProgramado = p => !!reglasDe(p).cuando;
/** Carta y medios de pago que rigen ahora. Devuelve {sucursal, catalogo, clave}. */
export function carteleraDelDia(sucursal, catalogo, ahora = new Date()) {
  const base = {sucursal, catalogo, clave: 'normal'};
  const programados = (catalogo?.productos || []).filter(esProgramado);
  if (!programados.length) return base;
  const at = sucursal?.atencion;
  // Con el local cerrado hasta otro día (pedido programado), la promo del día no se ofrece.
  const otroDia = at?.habilitado && at.abierto === false && at.proxima_apertura &&
    horaAR(new Date(at.proxima_apertura)).fecha !== horaAR(ahora).fecha;
  const vigentes = otroDia ? [] : programados.filter(p => p.activo !== false && p.disponible !== false && reglaVigente(reglasDe(p), ahora));
  const fuera = new Set(programados.filter(p => !vigentes.includes(p)).map(p => p.id));
  const exclusivas = vigentes.filter(p => reglasDe(p).exclusiva === true);
  if (!exclusivas.length) {
    if (!fuera.size) return {...base, clave: vigentes.length ? 'programada:' + vigentes.map(p => p.id).join(',') : 'normal'};
    return {...base, clave: vigentes.length ? 'programada:' + vigentes.map(p => p.id).join(',') : 'normal',
      catalogo: {...catalogo, productos: catalogo.productos.filter(p => !fuera.has(p.id))}};
  }
  // Promo exclusiva: solo ella; sus variedades agotadas quedan afuera y dejan de apuntar a productos que no se muestran.
  const productos = exclusivas.map(p => ({...p, opciones: (p.opciones || []).map(g => esCantidad(g)
    ? {...g, valores: valoresDisponibles(catalogo, g).map(v => Object.fromEntries(Object.entries(v).filter(([k]) => k !== 'producto_id')))} : g)}));
  const cats = new Set(productos.map(p => p.categoria_id));
  const promo = productos[0]; const r = reglasDe(promo);
  const nombre = String(r.nombre || promo.nombre);
  const aElegir = (promo.opciones || []).filter(esCantidad).map(g => String(g.nombre).toLowerCase());
  const efectivo = ['efectivo'];
  const soloEfectivo = productos.every(p => reglasDe(p).solo_efectivo === true);
  return {
    sucursal: {...sucursal, ...(soloEfectivo ? {medios_pago: efectivo, medios_pago_retiro: efectivo, medios_pago_envio: efectivo} : {}),
      especial: {nombre, texto: (r.aviso ? String(r.aviso) : 'Hoy rige ' + nombre) + ': ' +
        promo.nombre.replace(new RegExp('^' + nombre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*[·:-]?\\s*', 'i'), '') +
        ' a ' + pesos(promo.precio) + (r.sin_descuento ? ' (precio final)' : '') +
        (aElegir.length ? ', ' + aElegir.join(' y ') + ' a elección' : '') + '. ' +
        (sucursal?.acepta_envio ? 'Envío a domicilio con costo adicional. ' : '') + (soloEfectivo ? 'Pago solo en efectivo.' : '')}},
    catalogo: {...catalogo, categorias: (catalogo.categorias || []).filter(c => cats.has(c.id)), productos},
    clave: 'exclusiva:' + productos.map(p => p.id).join(',') + ':' + horaAR(ahora).fecha,
  };
}
/** Productos del carrito que se pagan solo en efectivo (regla del local). */
export function soloEfectivo(catalogo, carrito) {
  return (carrito || []).some(l => reglasDe(productoPorId(catalogo, l.producto_id)).solo_efectivo === true);
}
/** Parte del total que no lleva el descuento por efectivo (promos a precio final). */
export function totalSinDescuento(catalogo, carrito) {
  return totalCarrito(catalogo, (carrito || []).filter(l => reglasDe(productoPorId(catalogo, l.producto_id)).sin_descuento === true));
}

function promocionesParaTexto(promos, texto, catalogo) {
  const n = normalizar(texto);
  const pidePromo = /\b(promocion\w*|promos?|combos?|packs?|ofertas?)\b/.test(n);
  const mencionaEmpanadas = /\b(empanadas?|docenas?)\b/.test(n);
  if (!pidePromo && !mencionaEmpanadas) return null;
  const compartir = promos.filter(p => promoParaCompartir(catalogo, p));
  if (compartir.length && /\b(pizzas?|muzzas?|muzzarella|mozzarella|compartir)\b/.test(n)) return compartir;
  const cantidadExplicita = /\b(\d+|media|docenas?)\b/.test(n) || palabras(n).some(p => NUMEROS[p] > 1);
  if (!cantidadExplicita) return pidePromo ? promos : null;
  const cantidad = cantidadDe(n);
  const conBebida = /\b(lata|bebida|gaseosa)\b/.test(n) && !/\bsin (lata|bebida|gaseosa)\b/.test(n);
  const candidatos = promos.filter(p => !promoParaCompartir(catalogo, p) && (p.opciones || []).some(g => esCantidad(g) &&
    /empanad/i.test(g.nombre) && Number(g.total) === cantidad) &&
    (!conBebida || (p.opciones || []).some(g => /bebida|lata/i.test(g.nombre))));
  return pidePromo || candidatos.length ? candidatos : null;
}

/* Promoción que conviene: el cliente eligió unidades sueltas (ej. 3 empanadas) que también entran en una promo vigente
 * (ej. «Pack 3 empanadas + 1 salsa»). El asistente se la ofrece; si la arma en el menú, las sueltas pasan a la promo. */
function grupoEnlazado(p) {
  return (p?.opciones || []).find(g => esCantidad(g) && (g.valores || []).some(v => v.producto_id)) || null;
}
/** Línea suelta que puede pasar a una promo: producto simple, sin adicionales elegidos ni aclaración. */
function lineaSuelta(catalogo, l) {
  const p = productoPorId(catalogo, l?.producto_id);
  if (!p || grupoEnlazado(p) || String(l.nota || '').trim()) return false;
  return !Object.values(l.opciones || {}).some(v => Array.isArray(v) ? v.length : v && Object.keys(v).length);
}
/** Cuántas unidades sueltas del carrito entran en la promo y cómo quedan cargadas en su selector. */
export function candidatoPromo(catalogo, carrito, promoId) {
  const p = productoPorId(catalogo, promoId);
  const g = grupoEnlazado(p);
  const total = Number(g?.total) || 0;
  if (!p || !g || !total || (carrito || []).some(l => l.producto_id === p.id)) return null;
  const porProducto = new Map(valoresDisponibles(catalogo, g).filter(v => v.producto_id).map(v => [v.producto_id, v.id]));
  let unidades = 0; let cargadas = 0; const elegidas = {};
  for (const l of carrito || []) {
    if (!lineaSuelta(catalogo, l) || !porProducto.has(l.producto_id)) continue;
    unidades += l.cantidad;
    const n = Math.min(l.cantidad, total - cargadas);
    if (n > 0) { const id = porProducto.get(l.producto_id); elegidas[id] = (elegidas[id] || 0) + n; cargadas += n; }
  }
  return unidades ? {promo: p, grupo: g, total, unidades, elegidas} : null;
}
/** Promos para ofrecer: las del mismo tamaño que lo elegido; si no hay, la más cercana para arriba (máximo 3). */
export function promosParaCarrito(catalogo, carrito) {
  const cands = promocionesVigentes(catalogo).filter(p => !promoParaCompartir(catalogo, p))
    .map(p => candidatoPromo(catalogo, carrito, p.id)).filter(Boolean);
  if (!cands.length) return [];
  const nivel = c => c.total === c.unidades ? [0, 0] : c.total > c.unidades ? [1, c.total - c.unidades] : [2, c.unidades - c.total];
  const extras = c => (c.promo.opciones || []).filter(g => g !== c.grupo && esCantidad(g)).length;
  cands.sort((a, b) => nivel(a)[0] - nivel(b)[0] || nivel(a)[1] - nivel(b)[1] || extras(a) - extras(b) || Number(a.promo.precio) - Number(b.promo.precio));
  const mejor = nivel(cands[0]).join(':');
  return cands.filter(c => nivel(c).join(':') === mejor).slice(0, 3);
}
const claveOferta = cands => cands.length ? cands[0].unidades + ':' + cands.map(c => c.promo.id).join(',') : '';
function nombreCantidad(nombre, n) {
  const t = String(nombre || '').trim().toLowerCase();
  if (n === 1) return t.endsWith('s') ? t.slice(0, -1) : t;
  return t.endsWith('s') ? t : t + (/[aeiou]$/.test(t) ? 's' : 'es');
}
function textoOfertaPromo(cands) {
  const c = cands[0];
  const unidad = nombreCantidad(c.grupo.nombre, c.unidades);
  const incluye = (c.promo.opciones || []).filter(g => g !== c.grupo && esCantidad(g))
    .map(g => Number(g.total) + ' ' + nombreCantidad(g.nombre, Number(g.total)));
  const lineas = [cands.length > 1 ? '¡Tenemos promociones para usted!' : '¡Tenemos una promoción para usted!'];
  lineas.push(cands.length > 1
    ? 'Con sus ' + c.unidades + ' ' + unidad + ' puede armar una de estas promociones' + (incluye.length ? ', que incluyen ' + incluye.join(' y ') + ' a elección' : '') + '.'
    : 'Con sus ' + c.unidades + ' ' + unidad + ' puede armar la ' + c.promo.nombre + ' por ' + pesos(c.promo.precio) +
      (incluye.length ? ', que incluye ' + incluye.join(' y ') + ' a elección' : '') + '.');
  if (c.total > c.unidades) lineas.push('En el menú completa ' + (c.total - c.unidades === 1 ? 'la ' : 'las ') + (c.total - c.unidades) + ' ' + nombreCantidad(c.grupo.nombre, c.total - c.unidades) + ' que faltan.');
  if (c.total < c.unidades) lineas.push((c.unidades - c.total === 1 ? 'La que sobra queda suelta.' : 'Las ' + (c.unidades - c.total) + ' que sobran quedan sueltas.'));
  lineas.push('Si la arma, sus ' + nombreCantidad(c.grupo.nombre, 2) + ' sueltas pasan a la promoción y no se cobran aparte.');
  return lineas.join('\n');
}
const botonesOfertaPromo = (cands, alFinalizar) => [
  ...cands.map(c => ({id: 'promo:' + c.promo.id, texto: 'Armar ' + c.promo.nombre + ' · ' + pesos(c.promo.precio)})),
  alFinalizar ? {id: 'finalizar', texto: 'No, gracias. Finalizar'} : {id: 'promo_no', texto: 'No, seguir sin promoción'}];

/* Venta sugerida (cualquier rubro gastronómico): categorías de postres y de bebidas, reconocidas por su nombre. */
const RE_POSTRE = /postre|helado|dulce|torta/i;
const RE_BEBIDA = /bebida|gaseosa|cerveza|vino|agua|jugo|refresco/i;
/** Categorías para ofrecer antes de finalizar: postres y bebidas con algo disponible, si el pedido todavía no tiene. */
export function categoriasSugeridas(catalogo, carrito) {
  const cats = catalogo?.categorias || [];
  const tipoCat = c => RE_POSTRE.test(c?.nombre || '') ? 'postre' : RE_BEBIDA.test(c?.nombre || '') ? 'bebida' : '';
  const tipoDe = p => tipoCat(cats.find(c => c.id === p?.categoria_id));
  const tiene = {postre: false, bebida: false};
  for (const l of carrito || []) {
    const p = productoPorId(catalogo, l.producto_id);
    const t = tipoDe(p);
    if (t) tiene[t] = true;
    // Promos que ya traen bebida (ej. «+ lata»): no se ofrece otra.
    if ((p?.opciones || []).some(g => RE_BEBIDA.test(g.nombre) || /lata/i.test(g.nombre))) tiene.bebida = true;
  }
  return cats.filter(c => { const t = tipoCat(c); return t && !tiene[t]; })
    .filter(c => disponibles(catalogo).some(p => p.categoria_id === c.id && p.disponible !== false))
    .slice(0, 3).map(c => ({id: c.id, nombre: c.nombre, tipo: tipoCat(c)}));
}

/** Productos a ofrecer según la carta vigente y disponibilidad. */
export function productosSugeridos(catalogo, categorias) {
  const out = [];
  for (const c of categorias || []) {
    const ps = disponibles(catalogo).filter(p => p.categoria_id === c.id && p.disponible !== false);
    if (!ps.length) continue;
    const caro = ps.reduce((a, p) => Number(p.precio) > Number(a.precio) ? p : a, ps[0]);
    const resto = ps.filter(p => p !== caro);
    const barato = resto.length ? resto.reduce((a, p) => Number(p.precio) < Number(a.precio) ? p : a, resto[0]) : null;
    out.push({categoria: c, productos: [caro, barato].filter(Boolean), total: ps.length});
  }
  return out;
}

/** Opciones obligatorias que todavía faltan elegir en una línea. */
export function faltantes(producto, opciones) {
  return (producto.opciones || []).filter(g => esCantidad(g) ? unidades(opciones?.[g.id]) !== Number(g.total)
    : g.obligatorio && !(opciones?.[g.id] || []).length);
}

/** Valida una línea igual que la base (para avisar antes de enviar). Devuelve '' o el problema. */
export function validarLinea(catalogo, linea) {
  const p = productoPorId(catalogo, linea.producto_id);
  if (!p || p.activo === false) return 'Ese producto ya no está en la carta.';
  if (p.disponible === false) return p.nombre + ' no está disponible ahora.';
  if (!Number.isInteger(linea.cantidad) || linea.cantidad < 1 || linea.cantidad > MAX_CANTIDAD) return 'Cantidad inválida.';
  for (const k of Object.keys(linea.opciones || {})) if (!(p.opciones || []).some(g => g.id === k)) return 'Opción inválida.';
  for (const g of p.opciones || []) {
    if (esCantidad(g)) {
      const sel = linea.opciones?.[g.id] || {};
      if (typeof sel !== 'object' || Array.isArray(sel)) return 'Opción inválida.';
      for (const [id, n] of Object.entries(sel)) {
        if (!Number.isInteger(n) || n < 0 || !g.valores.some(v => v.id === id)) return 'Opción inválida.';
        if (n > 0 && !valoresDisponibles(catalogo, g).some(v => v.id === id)) return (g.valores.find(v => v.id === id)?.nombre || 'Una variedad') + ' no está disponible ahora.';
      }
      const u = unidades(sel), total = Number(g.total);
      if (u !== total) return 'En ' + g.nombre.toLowerCase() + ' de ' + p.nombre + ' elegí ' + total + (u ? ' (llevás ' + u + ')' : '') + '.';
      continue;
    }
    const sel = linea.opciones?.[g.id] || [];
    if (new Set(sel).size !== sel.length || sel.some(id => !g.valores.some(v => v.id === id))) return 'Opción inválida.';
    if (g.obligatorio && !sel.length) return 'Elegí ' + g.nombre.toLowerCase() + ' para ' + p.nombre + '.';
    if (g.tipo === 'una' && sel.length > 1) return 'En ' + g.nombre.toLowerCase() + ' elegí una sola opción.';
    if (g.tipo === 'varias' && sel.length > g.max) return 'En ' + g.nombre.toLowerCase() + ' podés elegir hasta ' + g.max + '.';
  }
  return '';
}

/** Busca productos por texto. Devuelve [{producto, puntaje}] ordenado. */
export const RE_PORCIONES = /\b(\d{1,2}) porcion(?:es)?\b/;
const RE_CHICA = /\b(individual|individuales|indi|chica|chicas|chico|chicos|chiquita|chiquitas|chiquito|personal|personales|mini)\b/;
const RE_GRANDE = /\b(grande|grandes|entera|enteras|entero|familiar|familiares)\b/;
export function tamanoDe(texto) {
  const n = normalizar(texto);
  const m = n.match(RE_PORCIONES);
  if (m) return Number(m[1]) <= 4 ? 'chica' : 'grande';
  if (RE_CHICA.test(n)) return 'chica';
  if (RE_GRANDE.test(n)) return 'grande';
  return null;
}
// Para comparar sabores sin que el tamaño cuente como palabra («Pizza 8 porciones · Muzzarella» ≈ «pizza de muzzarella»).
const sinTamano = t => normalizar(t).replace(/\b\d{1,2} porcion(?:es)?\b/g, ' ')
  .replace(new RegExp(RE_CHICA.source + '|' + RE_GRANDE.source, 'g'), ' ');
const decimales = t => String(t ?? '').replace(/(\d)[.,](\d)/g, '$1d$2'); // «2,25 L» → «2d25 L»: medida, no dos números
const clavesSinTamano = t => { const k = claves(sinTamano(decimales(t))); return k.length ? k : claves(decimales(t)); };
// «Pack 12 empanadas»: el número va pegado a lo que cuenta. Si el cliente escribe «12 empanadas», ese pack gana.
function numerosDelNombre(nombre, texto) {
  const n = palabras(decimales(nombre)).map(raiz), q = palabras(decimales(texto)).map(raiz);
  let extra = 0;
  for (let i = 0; i < n.length - 1; i++) {
    if (/^\d+$/.test(n[i]) && q.some((w, j) => w === n[i] && q[j + 1] === n[i + 1])) extra += 0.25;
  }
  return extra;
}
// «muzza» = «muzzarella», «napo» = «napolitana»: una palabra de 4 letras o más que empieza igual que la otra.
const coincide = (a, b) => a === b || (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a)));

/** Busca productos por texto. Devuelve [{producto, puntaje}] ordenado. */
export function buscar(catalogo, texto) {
  const q = clavesSinTamano(texto);
  if (!q.length) return [];
  const pedido = tamanoDe(texto);
  let res = [];
  for (const p of disponibles(catalogo)) {
    const n = clavesSinTamano(p.nombre);
    if (!n.length) continue;
    const enNombre = n.filter(w => q.some(x => coincide(w, x))).length;
    const enTexto = q.filter(w => n.some(x => coincide(w, x))).length;
    if (!enNombre) continue;
    // Prioriza que el texto cubra el nombre completo («empanada de carne» > «empanada»).
    const bonus = numerosDelNombre(p.nombre, texto);
    const puntaje = enNombre / n.length + 0.15 * (enTexto / q.length) + bonus;
    res.push({producto: p, puntaje, bonus, cubre: enTexto, completo: enNombre === n.length, tamano: tamanoDe(p.nombre + ' ' + (p.descripcion || ''))});
  }
  // Si el cliente dijo el tamaño y la carta lo tiene, se ofrecen solo los de ese tamaño.
  if (pedido && res.some(r => r.tamano === pedido)) res = res.filter(r => r.tamano === pedido);
  return res.sort((a, b) => b.puntaje - a.puntaje || a.producto.nombre.localeCompare(b.producto.nombre))
    .map(({producto, puntaje, bonus, cubre, completo}) => ({producto, puntaje, bonus, cubre, completo}));
}

/** Cantidad pedida en un segmento. Las medidas no son cantidades: «de 8 porciones», «2,25 L», «354 ml», ni los números
 * que forman parte del nombre del producto («Pack 6 empanadas», «Pizza 8 porciones»). */
function cantidadDe(segmento, producto) {
  let t = normalizar(String(segmento ?? '').replace(/\d+[.,]\d+|\d+d\d+/g, ' '))
    .replace(/\b\d{1,4} ?(porcion|porciones|ml|cc|l|lt|lts|litro|litros|kg|kilo|kilos|g|gr|grs|gramo|gramos|cm)\b/g, ' ');
  const nombre = producto ? palabras(decimales(producto.nombre)) : [];
  for (let i = 0; i < nombre.length - 1; i++) {
    if (!/^\d+$/.test(nombre[i])) continue;
    const sigue = raiz(nombre[i + 1]);
    t = t.split(' ').filter((w, j, todas) => !(w === nombre[i] && todas[j + 1] && raiz(todas[j + 1]) === sigue)).join(' ');
  }
  t = t.replace(/\s+/g, ' ').trim();
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
    if (esCantidad(g)) continue; // las promos se arman en su selector (cantidades por variedad)
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
  const segmentos = decimales(texto).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .split(/,|\n|\s\+\s|\smas\s|;/)
    .flatMap(x => normalizar(x).split(new RegExp('\\sy\\s(?=' + cant + ')')))
    .map(x => x.trim()).filter(Boolean);
  const lineas = []; const dudas = []; const sinCoincidencia = [];
  let ultimo = null;
  for (const seg of segmentos) {
    const encontrados = buscar(catalogo, seg);
    let p = encontrados[0]?.producto;
    let empate = encontrados.filter(e => e.puntaje === encontrados[0]?.puntaje);
    // Si el cliente no nombró un producto completo, son opciones todos los que coinciden en las mismas palabras
    // («una pizza chica» → todas las pizzas individuales de la carta, no solo la de nombre más corto).
    const mejor = encontrados[0];
    if (mejor && !mejor.completo) empate = encontrados.filter(e => e.puntaje === mejor.puntaje || (!e.completo && e.cubre === mejor.cubre && e.bonus === mejor.bonus));
    // Lo que el cliente no nombró no se agrega: «una coca 1,75» es Coca-Cola, no Coca-Cola Zero.
    if (empate.length > 1) {
      const k = empate.map(e => clavesSinTamano(e.producto.nombre));
      const base = empate.filter((e, i) => !k.some((o, j) => j !== i && o.length < k[i].length && o.every(w => k[i].includes(w))));
      if (base.length) empate = base;
      p = empate[0].producto;
    }
    // «2 de carne y 1 de jamón»: si el segmento no nombra el producto, se usa el anterior como contexto.
    if ((!p || empate.length > 1) && ultimo) {
      const ctx = buscar(catalogo, ultimo + ' ' + seg);
      if (ctx[0] && ctx.filter(e => e.puntaje === ctx[0].puntaje).length === 1) { p = ctx[0].producto; empate.length = 1; }
    }
    if (!p) { if (claves(seg).length) sinCoincidencia.push(seg); continue; }
    if (empate.length > 1) { dudas.push({texto: seg, opciones: empate.map(e => e.producto)}); continue; }
    ultimo = claves(p.nombre)[0] || ultimo;
    const cantidad = Math.min(MAX_CANTIDAD, Math.max(1, cantidadDe(seg, p)));
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
/** Reclamos que necesitan detalle: antes de avisar al gerente, el asistente pide qué pasó (y una foto).
 * «Avisar demora» y «Hablar con el gerente» siguen avisando en el acto. */
export const RECLAMO_ESPERA_MS = 30 * 60 * 1000;
export function reclamoConDetalle(boton = '') {
  return boton === 'reclamo_faltante' ? 'faltante' : boton === 'reclamo_otro' ? 'otro' : null;
}
/** Tipo de reclamo que espera la descripción del cliente (vence a los 30 minutos). */
export function reclamoEnEspera(estado, ahora = Date.now()) {
  const r = estado && typeof estado === 'object' ? estado.reclamo_espera : null;
  if (!r || typeof r !== 'object' || !['faltante', 'otro'].includes(r.tipo)) return null;
  const desde = Number(r.desde);
  if (!Number.isFinite(desde) || ahora - desde > RECLAMO_ESPERA_MS || desde - ahora > 60000) return null;
  return r.tipo;
}
export function sinReclamoEnEspera(estado) {
  const e = estado && typeof estado === 'object' ? {...estado} : {};
  delete e.reclamo_espera;
  return e;
}
export function textoPedirDetalle(tipo) {
  return tipo === 'faltante'
    ? 'Lamentamos lo sucedido. Para que el gerente pueda revisarlo y darle una solución rápida:\n' +
      '1. Escriba aquí abajo qué producto le faltó (por ejemplo: «faltó 1 empanada de carne»).\n' +
      '2. Adjunte una foto del pedido que recibió con el botón 📷 (cámara) o 📎 (galería).'
    : 'Lamentamos el inconveniente. Para que el gerente sepa qué sucedió, escriba aquí abajo su reclamo con el mayor detalle posible.\n' +
      'Si le sirve, también puede adjuntar una foto con el botón 📷 (cámara) o 📎 (galería).';
}
export const TEXTO_FOTO_FALTANTE = 'Si todavía no envió la foto del pedido, puede adjuntarla ahora con 📷 o 📎.';
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
  {id: 'carta', texto: 'Hacer un pedido'}, {id: 'horario', texto: 'Horario y envío'},
  {id: 'pago', texto: 'Medios de pago'}, {id: 'soporte', texto: 'Ayuda con mi pedido'},
];
/** Botones del saludo: «Hacer un pedido» primero y, con menú interactivo y promos vigentes, «Ver promociones». */
export function botonesBienvenida(sucursal, catalogo) {
  return usaMenuInteractivo(sucursal) && promocionesVigentes(catalogo).length
    ? [BOTONES_INICIO[0], {id: 'promociones', texto: 'Ver promociones'}, ...BOTONES_INICIO.slice(1)]
    : BOTONES_INICIO;
}

/** Saludo según la hora de Argentina (lo usan la bienvenida guiada y la de la IA). */
export function momentoDelDia(ahora = new Date()) {
  const h = Number(new Intl.DateTimeFormat('en-GB', {timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', hourCycle: 'h23'}).format(ahora));
  return h >= 6 && h < 13 ? 'Buenos días' : h >= 13 && h < 20 ? 'Buenas tardes' : 'Buenas noches';
}

/** Le indica al cliente los botones que tiene justo debajo del saludo, con sus nombres exactos. */
export function guiaBotones(botones) {
  const lista = (botones || []).filter(b => b && b.texto);
  const nombre = b => '«' + b.texto + '»';
  const pedir = lista.find(b => b.id === 'carta');
  const otros = lista.filter(b => b !== pedir).map(nombre);
  const unir = xs => xs.length > 1 ? xs.slice(0, -1).join(', ') + ' o ' + xs[xs.length - 1] : xs[0];
  return [pedir ? 'Para hacer su pedido, toque ' + nombre(pedir) + ' aquí abajo.' : '',
    otros.length ? (pedir ? 'También puede tocar ' : 'Puede tocar ') + unir(otros) + '.' : ''].filter(Boolean).join(' ');
}

// «¡Hola!», «Buenas», «Buen día»… al comienzo del texto del dueño: lo reemplaza el saludo según la hora.
const SALUDO_SUELTO = /^[\s¡!]*(hola|buenas|buen d[ií]a|buenos d[ií]as|buenas tardes|buenas noches)\s*[!.,;:]*\s*/i;
/** Bienvenida guiada (sin IA): saludo según la hora + texto del dueño + guía de los botones de abajo. */
export function bienvenidaGuiada(sucursal, botones, ahora) {
  const s = sucursal || {};
  const local = [s.empresa, s.nombre].filter(Boolean).join(' ') || 'el local';
  let cuerpo = String(s.bienvenida || '').trim().replace(SALUDO_SUELTO, '');
  cuerpo = cuerpo ? cuerpo.charAt(0).toUpperCase() + cuerpo.slice(1)
    : (s.asistente ? 'Soy ' + s.asistente + ', la asistente virtual de ' + local + '.' : 'Le damos la bienvenida a ' + local + '.');
  return ['¡' + momentoDelDia(ahora) + '! ' + cuerpo, s.especial?.texto, guiaBotones(botones)].filter(Boolean).join('\n');
}
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
  if (!carrito.length) return 'Tu pedido está vacío. Tocá «Hacer un pedido» o escribime qué querés, por ejemplo ' + ejemploPedido(catalogo) + '.';
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

export function estadoInicial() { return {carrito: [], paso: 'inicio', pendientes: [], programado: false, sugerido: false}; }

export function limpiarEstado(estado, catalogo) {
  const e = Object.assign(estadoInicial(), estado && typeof estado === 'object' ? estado : {});
  e.carrito = (Array.isArray(e.carrito) ? e.carrito : []).filter(l => productoPorId(catalogo, l.producto_id) && Number.isInteger(l.cantidad)).slice(0, MAX_CARRITO);
  e.pendientes = (Array.isArray(e.pendientes) ? e.pendientes : []).slice(0, 4);
  return e;
}

/**
 * Responde un turno.
 * @param {{sucursal, catalogo, estado, entrada:{texto?:string, boton?:string, agregar?:object, agregar_varios?:object[], quitar?:number, datos?:object}}} p
 * @returns {{estado, mensajes:Array<{texto:string, botones?:Array, tipo?:string, productos?:Array}>, accion?:object}}
 */
export function responder({sucursal, catalogo, estado, entrada, mensajes, ahora}) {
  const s = sucursal || {};
  const e = limpiarEstado(estado, catalogo);
  const out = [];
  const decir = (texto, extra = {}) => out.push({texto:formalizar(texto), ...extra});
  const fin = (accion) => ({estado: e, mensajes: out, ...(accion ? {accion} : {})});
  entrada = entrada || {};
  const menuInteractivo = usaMenuInteractivo(s);
  // Productos que dejaron de ofrecerse mientras estaban en el carrito (ej. empieza el Jueves On Fire): se avisa una vez.
  const quitados = (Array.isArray(estado?.carrito) ? estado.carrito.length : 0) - e.carrito.length;
  if (quitados > 0 && !entrada.inicio) {
    decir(s.especial ? 'Ahora rige ' + s.especial.nombre + ': quitamos de su pedido lo que no forma parte de la promo.'
      : quitados === 1 ? 'Un producto de su pedido ya no está disponible y lo quitamos.'
      : 'Algunos productos de su pedido ya no están disponibles y los quitamos.');
  }

  if (entrada.inicio) {
    if (s.atencion?.habilitado && s.atencion.abierto === false) {
      decir('Gracias por comunicarse. Por el momento nuestro local está cerrado. Abriremos nuevamente '+s.atencion.proximo_texto+
        '. ¿Desea dejar un pedido programado para la próxima apertura? El gerente lo revisará y confirmará cuando corresponda.'+
        (s.especial?.texto ? '\n' + s.especial.texto : ''),{
        botones:[{id:'programar_si',texto:'Sí, dejar pedido programado'},
          {id:'programar_no',texto:'No, gracias'},{id:'soporte',texto:'Consultar al gerente'}]});
      return fin();
    }
    // Saludo según la hora, bienvenida del dueño y, en el mismo mensaje, qué hace cada botón de abajo.
    const botones = botonesBienvenida(s, catalogo);
    const guia = [s.especial?.texto, guiaBotones(botones)].filter(Boolean).join('\n');
    decir(bienvenidaGuiada(s, botones, ahora), {botones, guia});
    return fin();
  }
  if (entrada.boton === 'programar_si') {
    if (!s.atencion?.habilitado || s.atencion.abierto) {
      e.programado=false;
      decir(s.atencion?.abierto
        ? 'El local ya está abierto. Puede realizar su pedido normalmente.'
        : 'La programación no está habilitada para este local.',{botones:botonesCarrito(e.carrito)});
      return fin();
    }
    e.programado=true;
    decir('Con gusto. '+(e.carrito.length
      ? 'Conservamos los productos que ya eligió. Puede finalizar el pedido cuando lo desee. '
      : 'Puede elegir los productos de la carta. ')+'Su pedido quedará programado para '+
      s.atencion.proximo_texto+' y será revisado por el gerente antes de su preparación.',{
      botones:[...botonesCarrito(e.carrito),{id:'soporte',texto:'Contactar al gerente'}]});
    return fin();
  }
  if (entrada.boton === 'programar_no') {
    e.programado=false;
    decir('Entendido. Cuando lo desee, puede volver a comunicarse. Muchas gracias.',{botones:BOTONES_INICIO});
    return fin();
  }
  // La carta interactiva envía todas las selecciones juntas. Se validan ANTES de guardar nada.
  if (entrada.agregar_varios) {
    const lineas = entrada.agregar_varios;
    if (!Array.isArray(lineas) || !lineas.length || lineas.length > MAX_CARRITO) {
      decir('La selección del menú es inválida. Volvé a revisar tu carrito.');
      return fin();
    }
    if (entrada.lote_id && e.ultimo_lote === entrada.lote_id) {
      decir('Esta selección del menú ya fue recibida.\n' + textoCarrito(catalogo, e.carrito), {botones: botonesCarrito(e.carrito)});
      return fin();
    }
    const siguiente = e.carrito.map(l => ({...l, opciones: {...(l.opciones || {})}}));
    for (const entradaLinea of lineas) {
      const l = {producto_id: entradaLinea.producto_id, cantidad: Number(entradaLinea.cantidad),
        opciones: entradaLinea.opciones || {}, nota: String(entradaLinea.nota || '').slice(0, 200)};
      const problema = validarLinea(catalogo, l);
      if (problema) { decir(problema + ' No se agregó ningún producto de esta selección.'); return fin(); }
      const igual = siguiente.find(x => x.producto_id === l.producto_id &&
        JSON.stringify(x.opciones || {}) === JSON.stringify(l.opciones || {}) && !x.nota && !l.nota);
      if (igual && igual.cantidad + l.cantidad > MAX_CANTIDAD) {
        decir('Superaste la cantidad máxima para ' + productoPorId(catalogo, l.producto_id).nombre + '. No se agregó la selección.');
        return fin();
      }
      const aviso = sumar(catalogo, siguiente, [l]);
      if (aviso.length) { decir(aviso.join(' ') + ' No se agregó la selección.'); return fin(); }
    }
    // Promo ofrecida por el asistente: las unidades sueltas que ya estaban en el carrito pasan a la promo.
    let absorbidas = 0; let unidadAbs = '';
    const promoPedida = e.promo_reemplazo && lineas.filter(l => l.producto_id === e.promo_reemplazo);
    if (promoPedida?.length) {
      const g = grupoEnlazado(productoPorId(catalogo, e.promo_reemplazo));
      if (g) {
        const antes = {};
        for (const l of e.carrito) if (lineaSuelta(catalogo, l)) antes[l.producto_id] = (antes[l.producto_id] || 0) + l.cantidad;
        const enPromo = {};
        for (const l of promoPedida) for (const [vid, n] of Object.entries(l.opciones?.[g.id] || {})) {
          const v = (g.valores || []).find(x => x.id === vid);
          if (v?.producto_id && Number.isInteger(n) && n > 0) enPromo[v.producto_id] = (enPromo[v.producto_id] || 0) + n * (Number(l.cantidad) || 1);
        }
        for (const [pid, n] of Object.entries(enPromo)) {
          let quitar = Math.min(n, antes[pid] || 0);
          for (const l of siguiente) {
            if (quitar <= 0) break;
            if (l.producto_id !== pid || !lineaSuelta(catalogo, l)) continue;
            const k = Math.min(quitar, l.cantidad); l.cantidad -= k; quitar -= k; absorbidas += k;
          }
        }
        for (let i = siguiente.length - 1; i >= 0; i--) if (siguiente[i].cantidad <= 0) siguiente.splice(i, 1);
        unidadAbs = nombreCantidad(g.nombre, absorbidas);
      }
      delete e.promo_reemplazo;
    }
    e.carrito = siguiente;
    if (entrada.lote_id) e.ultimo_lote = entrada.lote_id;
    e.paso = 'pedido';
    const ofertas = promosParaCarrito(catalogo, e.carrito);
    // No se ofrece otra promo en el mismo turno en que el cliente armó una.
    const ofrecer = ofertas.length && !promoPedida?.length && e.promo_ofrecida !== claveOferta(ofertas);
    decir('Recibí tu selección del menú:\n' + lineas.map(l => '• ' + describirLinea(catalogo, l)).join('\n') +
      (absorbidas ? '\n' + (absorbidas === 1 ? 'Su ' + unidadAbs + ' suelta pasó' : 'Sus ' + absorbidas + ' ' + unidadAbs + ' sueltas pasaron') + ' a la promoción.' : '') +
      '\nTotal estimado: ' + pesos(totalCarrito(catalogo, e.carrito)) +
      (ofrecer ? '' : '\nPodés agregar más o finalizar para completar tus datos.'), ofrecer ? {} : {botones: botonesCarrito(e.carrito)});
    if (ofrecer) {
      e.promo_ofrecida = claveOferta(ofertas);
      decir(textoOfertaPromo(ofertas), {botones: botonesOfertaPromo(ofertas, false)});
    }
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
    if ((soloEfectivo(catalogo, e.carrito) || s.especial) && String(d.medio_pago || '') !== 'efectivo' &&
        !(s.especial && pagosDe(s, d.entrega === 'envio' ? 'envio' : 'retiro').includes(String(d.medio_pago || '')))) {
      decir((s.especial ? 'Hoy, por ' + s.especial.nombre + ', el pago' : 'Su pedido tiene una promo que') +
        ' es solo en efectivo. Elija «Efectivo» para enviar su pedido.', {tipo: 'datos'});
      return fin();
    }
    if (d.entrega === 'envio' && d.medio_pago === 'transferencia' && Number(s.descuento_efectivo_pct) > 0) {
      decir('Puede abonar por transferencia. Si prefiere efectivo, tiene un ' + Number(s.descuento_efectivo_pct) + '% de descuento en los productos. El gerente le enviará los datos para transferir por este chat y podrá adjuntar aquí el comprobante.');
    }
    return fin({tipo: 'crear_pedido', pedido: {
      items: e.carrito.map(l => ({producto_id: l.producto_id, cantidad: l.cantidad, opciones: l.opciones, nota: l.nota})),
      nombre: String(d.nombre || '').slice(0, 80), telefono: String(d.telefono || '').slice(0, 25),
      entrega: d.entrega === 'envio' ? 'envio' : 'retiro', direccion: String(d.direccion || '').slice(0, 200),
      horario: e.programado && !s.atencion?.abierto ? '' : String(d.horario || '').slice(0, 60),
      programar: Boolean(e.programado), medio_pago: String(d.medio_pago || ''),
      efectivo_abona: String(d.efectivo_abona || '').slice(0,16), nota: String(d.nota || '').slice(0, 500),
    }});
  }

  const texto = String(entrada.texto || '').slice(0, 600);
  const accion = entrada.boton ? String(entrada.boton) : intencion(texto);

  // Oferta de promoción: abre el selector de la promo con las unidades sueltas ya cargadas.
  if (accion.startsWith('promo:')) {
    const p = productoPorId(catalogo, accion.slice(6));
    if (!p || p.activo === false || p.disponible === false || !promocionesVigentes(catalogo).some(x => x.id === p.id)) {
      decir('Esa promoción ya no está disponible. Puede elegir otra en el menú.', {tipo: 'carta'});
      return fin();
    }
    const c = candidatoPromo(catalogo, e.carrito, p.id);
    e.promo_reemplazo = p.id;
    decir(c ? 'Complete su ' + p.nombre + ' en el menú. Ya cargamos sus ' + nombreCantidad(c.grupo.nombre, 2) + '; elija lo que falta.'
      : 'Complete su ' + p.nombre + ' en el menú.',
    {tipo: 'producto', productos: [p.id], cantidad: 1, opciones: c ? {[c.grupo.id]: c.elegidas} : {}});
    return fin();
  }
  if (accion === 'promo_no') {
    decir('De acuerdo, seguimos con su selección.\n' + textoCarrito(catalogo, e.carrito), {botones: botonesCarrito(e.carrito)});
    return fin();
  }

  if (menuInteractivo && (accion === 'promociones' || (!entrada.boton && ['texto', 'precio', 'carta'].includes(accion)))) {
    const promos = promocionesVigentes(catalogo);
    const candidatas = accion === 'promociones' ? promos : promocionesParaTexto(promos, texto, catalogo);
    if (candidatas) {
      const botones = candidatas.map(p => ({id: 'elegir:' + p.id + ':1', texto: p.nombre + ' · ' + pesos(p.precio)}));
      decir(botones.length ? 'Estas son las promociones disponibles en este local. Elija una para completar su selección.'
        : 'No hay una promoción disponible para esa selección. Puede consultar el menú del local.',
      {botones: [...botones, {id: 'carta', texto: 'Ver menú completo'}]});
      return fin();
    }
  }

  // Venta sugerida: «Ver postres» / «Ver bebidas» abre la carta en esa categoría.
  if (accion.startsWith('carta:')) {
    const c = (catalogo?.categorias || []).find(x => x.id === accion.slice(6));
    decir(c ? 'Estas son las opciones de ' + c.nombre.toLowerCase() + '. Toque una para agregarla.' : 'Esta es nuestra carta.',
      {tipo: 'carta', ...(c ? {categoria: c.id} : {})});
    return fin();
  }
  // Dudas pendientes: «¿Cuál?» → el cliente toca una opción.
  if (accion.startsWith('elegir:')) {
    const [, id, cant] = accion.split(':');
    const p = productoPorId(catalogo, id);
    if (menuInteractivo) {
      if (p && p.activo !== false && p.disponible !== false) {
        decir('Complete su selección de ' + p.nombre + ' en el menú.',
          {tipo: 'producto', productos: [p.id], cantidad: Math.min(MAX_CANTIDAD, Math.max(1, Number(cant) || 1))});
      } else {
        decir('Ese producto ya no está disponible. Puede elegir otro en el menú.', {tipo: 'carta'});
      }
      return fin();
    }
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
    case 'vaciar': e.carrito = []; e.sugerido = false; delete e.promo_ofrecida; delete e.promo_reemplazo; decir('Listo, empezamos de nuevo.', {botones: BOTONES_INICIO}); return fin();
    case 'humano': decir('El gerente puede responderle por este mismo chat. Para pedir atención, seleccione la opción de soporte.',{botones:[{id:'hablar_gerente',texto:'Hablar con el gerente'}]}); return fin();
    case 'estado': decir('Te muestro cómo va tu pedido.'); return fin({tipo: 'estado'});
    case 'cancelar':
      if (e.carrito.length) { e.carrito = []; e.sugerido = false; decir('Listo, vacié tu pedido.', {botones: BOTONES_INICIO}); return fin(); }
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
      // Promoción que conviene con lo elegido: una vez por combinación, antes de la venta sugerida.
      {
        const ofertas = promosParaCarrito(catalogo, e.carrito);
        if (ofertas.length && e.promo_ofrecida !== claveOferta(ofertas)) {
          e.promo_ofrecida = claveOferta(ofertas);
          decir(textoOfertaPromo(ofertas), {botones: botonesOfertaPromo(ofertas, true)});
          return fin();
        }
      }
      // Venta sugerida: una sola vez por pedido, antes de pedir los datos.
      if (!e.sugerido) {
        const cats = categoriasSugeridas(catalogo, e.carrito);
        if (cats.length) {
          e.sugerido = true;
          // Oferta concreta: precio y un toque para agregar. El total se valida en la base.
          const grupos = productosSugeridos(catalogo, cats);
          decir(mensajeDe(mensajes, 'sugerencia'), {sugerencia: true, botones: [
            ...grupos.flatMap(g => g.productos.map(p => ({id: 'elegir:' + p.id + ':1', texto: p.nombre + ' · ' + pesos(p.precio)}))),
            ...grupos.filter(g => g.total > g.productos.length).map(g => ({id: 'carta:' + g.categoria.id, texto: 'Ver más ' + g.categoria.nombre.toLowerCase()})),
            {id: 'finalizar', texto: 'No, gracias. Finalizar'}]});
          return fin();
        }
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
  if (menuInteractivo && (lineas.length || dudas.length)) {
    if (lineas.length === 1 && !dudas.length && !sinCoincidencia.length) {
      const l = lineas[0];
      const p = productoPorId(catalogo, l.producto_id);
      if (p.disponible !== false) {
        decir('Revise la cantidad y complete su selección de ' + p.nombre + ' en el menú.',
          {tipo: 'producto', productos: [p.id], cantidad: l.cantidad, opciones: l.opciones});
        return fin();
      }
    }
    // «Quiero una pizza»: el menú abre en la categoría de la mayoría de lo que coincide (ej. Pizzas, con + y −).
    const cats = [...lineas.map(l => productoPorId(catalogo, l.producto_id)?.categoria_id),
      ...dudas.flatMap(d => d.opciones.map(p => p.categoria_id))].filter(Boolean);
    const cuenta = new Map(); for (const c of cats) cuenta.set(c, (cuenta.get(c) || 0) + 1);
    const [mayor, veces] = [...cuenta].sort((a, b) => b[1] - a[1])[0] || [];
    const categoria = veces > cats.length / 2 ? mayor : null;
    decir('Elija los productos y las cantidades de su pedido en el menú interactivo.', {tipo: 'carta', ...(categoria ? {categoria} : {})});
    return fin();
  }
  if (!lineas.length && !dudas.length && /\b(pedi|pedido|ordenar|encargar)/.test(normalizar(texto))) {
    decir(menuInteractivo ? 'Elija los productos y las cantidades de su pedido en el menú interactivo.'
      : '¡Dale! Mirá la carta y tocá lo que quieras, o escribime por ejemplo ' + ejemploPedido(catalogo) + '.', {tipo: 'carta'});
    return fin();
  }
  if (!lineas.length && !dudas.length) {
    decir('No te entendí bien. Podés escribir algo como ' + ejemploPedido(catalogo) + ' o mirar la carta.', {botones: botonesCarrito(e.carrito)});
    return fin();
  }
  // Cantidad exacta de empanadas: ofrecer primero el pack con sus salsas incluidas.
  // No sumar unidades sueltas cuando el cliente eligió una promoción disponible.
  if (lineas.length === 1 && !dudas.length && !sinCoincidencia.length) {
    const l = lineas[0], individual = productoPorId(catalogo, l.producto_id);
    const promo = disponibles(catalogo).find(p => {
      if (p.disponible === false || !/\b(pack|promo|promoción)\b/i.test(p.nombre || '')) return false;
      const grupos = (p.opciones || []).filter(esCantidad);
      const emp = grupos.find(g => /empanad/i.test(g.nombre) && Number(g.total) === l.cantidad);
      const salsa = grupos.find(g => /salsa/i.test(g.nombre) && Number(g.total) > 0);
      return individual && /empanad/i.test(individual.nombre) && emp && salsa &&
        valoresDisponibles(catalogo, emp).some(v => v.producto_id === individual.id);
    });
    if (promo) {
      const emp = promo.opciones.find(g => esCantidad(g) && /empanad/i.test(g.nombre) && Number(g.total) === l.cantidad);
      const salsa = promo.opciones.find(g => esCantidad(g) && /salsa/i.test(g.nombre));
      const variedad = valoresDisponibles(catalogo, emp).find(v => v.producto_id === individual.id);
      if (variedad && salsa) {
        decir('Tenemos una promoción de ' + l.cantidad + ' empanadas que incluye ' + salsa.total +
          ' salsas a elección. Seleccione las salsas que prefiera para agregar el pack completo.',
          {tipo:'producto', productos:[promo.id], cantidad:1, opciones:{[emp.id]:{[variedad.id]:l.cantidad}}});
        return fin();
      }
    }
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
    // Muchas opciones de una misma categoría («una pizza grande»): se abre la carta en esa categoría.
    const cat = (catalogo?.categorias || []).find(c => c.id === d.opciones[0]?.categoria_id);
    if (d.opciones.length > 4 && cat && d.opciones.every(p => p.categoria_id === cat.id)) {
      decir('Estas son nuestras opciones de ' + cat.nombre.toLowerCase() + '. Seleccione la que prefiera.', {tipo: 'carta', categoria: cat.id});
      continue;
    }
    decir('¿Cuál de estos querés para «' + d.texto.replace(/(\d)d(\d)/g, '$1,$2') + '»?', {botones: d.opciones.slice(0, 4).map(p => ({id: 'elegir:' + p.id + ':' + cant, texto: p.nombre}))});
  }

  if (sinCoincidencia.length && (completas.length || aElegir.length || dudas.length)) {
    decir('No encontré: ' + sinCoincidencia.join(', ') + '. Revisá la carta.', {botones: [{id: 'carta', texto: 'Ver la carta'}]});
  }
  return fin();
}

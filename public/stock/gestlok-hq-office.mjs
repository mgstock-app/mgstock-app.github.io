// GESTLOK HQ · La Oficina (pixel art en Canvas 2D, sin dependencias).
// Las caminatas, descansos, cafés, charlas y reuniones son animación. Lo que dicen los empleados sale de
// datos reales (pulso de GESTLOK Chat y del Conteo, controles de Facundo, tareas e informes de HQ) o de
// informes de IA ya registrados. Este módulo no llama a la IA, no escribe en la base y no modifica nada:
// toda acción pasa por los handlers del panel de la creadora, que piden confirmación.

const T = 16, COLS = 30, ROWS = 18, W = COLS * T, H = ROWS * T, SCALE = 3;
const TZ = 'America/Argentina/Buenos_Aires';
const IDEAS_KEY = 'gestlok:hq-office-ideas:v1';

// ---------- Equipo: mismos identificadores que la base, nuevos puestos y avatares ----------
export const TEAM = Object.freeze([
  {id: 'lider', name: 'Alex', animal: 'Búho', kind: 'owl', puesto: 'Directora de la oficina', foco: 'Coordina al equipo, junta las ideas y prioriza lo importante.', seat: [24, 12], body: '#7b5ea7', belly: '#d9c6f0', accent: '#f2b134', extra: '#45325f'},
  {id: 'atencion', name: 'Renata', animal: 'Gata', kind: 'cat', puesto: 'Mesa de pedidos · GESTLOK Chat', foco: 'Pedidos sin abrir, reclamos y conversaciones de cada local.', seat: [3, 3], body: '#f0a04b', belly: '#fde2bf', accent: '#2f3b52', extra: '#e46a6a'},
  {id: 'marketing', name: 'Martina', animal: 'Zorra', kind: 'fox', puesto: 'Promos y ventas', foco: 'Promos del día, venta sugerida, reseñas y difusión del QR.', seat: [3, 6], body: '#e8692c', belly: '#fff4e6', accent: '#3b2418', extra: '#ffffff'},
  {id: 'calidad', name: 'Camila', animal: 'Coneja', kind: 'bunny', puesto: 'Calidad de la carta', foco: 'Productos agotados, precios y descripciones claras.', seat: [7, 3], body: '#f4f1ee', belly: '#ffd6e0', accent: '#e889a6', extra: '#b9b2ab'},
  {id: 'datos', name: 'Santiago', animal: 'Pulpo', kind: 'octo', puesto: 'Métricas de los locales', foco: 'Conversión, ticket promedio y tiempos de cada local.', seat: [22, 3], body: '#3fb7b0', belly: '#9fe3dc', accent: '#1d4f63', extra: '#2a8f89'},
  {id: 'soporte', name: 'Facundo', animal: 'Robot', kind: 'robot', puesto: 'Guardia técnica de los locales', foco: 'Sitio, pruebas, Conteo y cierres automáticos. Solo lectura.', seat: [27, 3], body: '#a3b1bf', belly: '#64748a', accent: '#38e0ff', extra: '#5c6b7a'},
  {id: 'desarrollo', name: 'Nicolás', animal: 'Castor', kind: 'beaver', puesto: 'Producto GESTLOK Chat', foco: 'Mejoras y nuevas funciones del chat.', seat: [3, 12], body: '#9a6a43', belly: '#dcb58e', accent: '#f6c232', extra: '#5e3d22'},
  {id: 'testing', name: 'Tomás', animal: 'Rana', kind: 'frog', puesto: 'Pruebas del chat', foco: 'Recorridos de prueba y CI en verde antes de publicar.', seat: [7, 12], body: '#58b368', belly: '#c9eebd', accent: '#ffffff', extra: '#2f6b3a'},
  {id: 'difusion', name: 'Valentina', animal: 'Lora', kind: 'parrot', puesto: 'Marketing de GESTLOK Chat', foco: 'Dónde publicitar la micro app gratis y con qué texto.', seat: [7, 6], body: '#2fb24c', belly: '#ffd23f', accent: '#e5484d', extra: '#2766c9'},
  {id: 'soporte_general', name: 'Lucas', animal: 'Perro', kind: 'dog', puesto: 'Soporte general', foco: 'Altas de comercios, gerentes, mensajes de la web y suscripciones.', seat: [26, 6], body: '#c98b4f', belly: '#f3dcc0', accent: '#2766c9', extra: '#7a4b26'}
]);
const BY_ID = Object.fromEntries(TEAM.map(p => [p.id, p]));

// ---------- Plano ----------
// # pared · | y - mampara de vidrio · . madera · , alfombra del chat · : sala de reuniones
// ; locales · ~ café · _ dirección · o pasillo
const MAP = [
  '##############################',
  '##############################',
  '#,,,,,,,,,|::::::::|;;;;;;;;;#',
  '#,,,,,,,,,|::::::::|;;;;;;;;;#',
  '#,,,,,,,,,|::::::::|;;;;;;;;;#',
  '#,,,,,,,,,|::::::::|;;;;;;;;;#',
  '#,,,,,,,,,|::::::::|;;;;;;;;;#',
  '#,,,,,,,,,|::::::::|;;;;;;;;;#',
  '#----,----#---::---#----;----#',
  '#oooooooooooooooooooooooooooo#',
  '#----.----#---~~---#----_----#',
  '#.........|~~~~~~~~|_________#',
  '#.........|~~~~~~~~|_________#',
  '#.........|~~~~~~~~|_________#',
  '#.........|~~~~~~~~|_________#',
  '#.........|~~~~~~~~|_________#',
  '#.........|~~~~~~~~|_________#',
  '##############################'
];
const ROOMS = [
  {id: 'chat', label: 'GESTLOK Chat · Pedidos y difusión', x: 1, y: 2},
  {id: 'meet', label: 'Sala de reuniones', x: 11, y: 2},
  {id: 'locales', label: 'Locales y soporte', x: 20, y: 2},
  {id: 'taller', label: 'Taller de producto', x: 1, y: 11},
  {id: 'cafe', label: 'Café y descanso', x: 11, y: 11},
  {id: 'dir', label: 'Dirección', x: 20, y: 11}
];
// Muebles: [tipo, x, y, ancho, alto, bloquea]
const FURNITURE = [
  ['screen-chat', 2, 1, 6, 1, false], ['window', 8, 1, 2, 1, false],
  ['board', 12, 1, 6, 1, false],
  ['screen-local-0', 20, 1, 4, 1, false], ['screen-local-1', 24, 1, 4, 1, false],
  ['desk', 2, 4, 2, 1, true], ['desk', 6, 4, 2, 1, true], ['desk', 2, 7, 2, 1, true], ['desk', 6, 7, 2, 1, true],
  ['plant', 8, 7, 1, 1, true], ['plant', 1, 2, 1, 1, true],
  ['table', 12, 4, 6, 2, true],
  ['plant', 18, 7, 1, 1, true],
  ['desk', 21, 4, 2, 1, true], ['desk', 26, 4, 2, 1, true],
  ['rack', 28, 6, 1, 2, true], ['map', 21, 6, 3, 2, true], ['desk', 25, 7, 2, 1, true],
  ['desk', 2, 13, 2, 1, true], ['desk', 6, 13, 2, 1, true],
  ['kanban', 8, 15, 2, 1, true], ['shelf', 1, 16, 3, 1, true], ['plant', 9, 11, 1, 1, true],
  ['counter', 11, 11, 4, 1, true], ['cooler', 16, 11, 1, 1, true], ['fridge', 17, 11, 2, 1, true],
  ['pingpong', 14, 13, 3, 2, true], ['sofa', 11, 16, 3, 1, false], ['armchair', 17, 16, 2, 1, false],
  ['shelf', 20, 11, 2, 1, true], ['bigdesk', 23, 13, 3, 1, true], ['plant', 28, 11, 1, 1, true],
  ['sofa', 26, 16, 3, 1, false], ['rug', 21, 14, 7, 2, false],
  ['plant', 1, 9, 1, 1, true], ['plant', 28, 9, 1, 1, true]
];
const MEETING_SEATS = [[12, 3], [13, 3], [15, 3], [16, 3], [17, 3], [12, 6], [14, 6], [16, 6], [11, 4], [18, 5]];
const SPOTS = {
  coffee: [[12, 12], [13, 12]], cooler: [[16, 12]], fridge: [[17, 12]],
  sofa: [[11, 16], [12, 16], [13, 16], [26, 16], [27, 16], [28, 16], [17, 16], [18, 16]],
  pingpong: [[13, 13], [17, 14]], board: [[12, 2], [14, 2], [16, 2], [17, 2]],
  stroll: [[3, 9], [9, 9], [15, 9], [21, 9], [26, 9], [5, 15], [25, 15], [15, 16]],
  window: [[8, 2], [9, 2]]
};

const grid = MAP.map(r => r.split(''));
const blocked = grid.map(r => r.map(c => c === '#' || c === '|' || c === '-'));
for (const [, x, y, w, h, b] of FURNITURE) if (b) for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) blocked[y + j][x + i] = true;
for (const p of TEAM) blocked[p.seat[1]][p.seat[0]] = false;

function findPath(from, to) {
  const key = (x, y) => y * COLS + x, start = key(from[0], from[1]), goal = key(to[0], to[1]);
  if (start === goal) return [];
  const prev = new Map([[start, -1]]), q = [start];
  while (q.length) {
    const cur = q.shift();
    if (cur === goal) break;
    const cx = cur % COLS, cy = (cur / COLS) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy, k = key(nx, ny);
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS || prev.has(k)) continue;
      if (blocked[ny][nx] && k !== goal) continue;
      prev.set(k, cur); q.push(k);
    }
  }
  if (!prev.has(goal)) return null;
  const path = [];
  for (let c = goal; c !== start; c = prev.get(c)) path.unshift([c % COLS, (c / COLS) | 0]);
  return path;
}

// ---------- Utilidades ----------
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const plural = (n, a, b) => n + ' ' + (n === 1 ? a : b);
const money = n => '$ ' + Math.round(Number(n) || 0).toLocaleString('es-AR');
function baDate(d = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false}).formatToParts(d).map(p => [p.type, p.value]));
  const wd = {Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6}[parts.weekday];
  return {y: +parts.year, m: +parts.month, d: +parts.day, h: +parts.hour % 24, min: +parts.minute, wd};
}
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
function ruleDayMatch(cuando, y, m, d) {
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  if (Number(cuando?.dia_semana) !== wd) return false;
  if (cuando?.semana === 'ultima') { const last = new Date(Date.UTC(y, m, 0)).getUTCDate(); return d + 7 > last; }
  return true;
}
const ago = iso => { const t = Date.parse(iso); if (!Number.isFinite(t)) return null; return Math.max(0, Math.round((Date.now() - t) / 60000)); };
const agoText = min => min == null ? '' : min < 2 ? 'recién' : min < 60 ? 'hace ' + min + ' min' : min < 1440 ? 'hace ' + Math.round(min / 60) + ' h' : 'hace ' + Math.round(min / 1440) + ' días';

// ---------- Ideas y comentarios con datos reales (sin IA) ----------
const REPLIES = {
  pendientes: [['lider', 'Es prioridad: hay que avisarle al gerente ya.'], ['soporte', 'Reviso que los avisos con sonido estén activos en ese local.']],
  reclamos: [['lider', 'Un reclamo sin respuesta pesa más que un pedido nuevo.'], ['calidad', 'Después veamos si viene de la carta o de la entrega.']],
  conversion: [['marketing', 'Puedo armar una bienvenida con la promo más pedida.'], ['desarrollo', 'Lo prototipo en Prueba antes de tocar producción.']],
  quieto: [['marketing', 'Propongo difundir el QR en el mostrador y en las bolsas.'], ['datos', 'Si se mueve, en una semana lo vemos en los números.']],
  tiempo: [['desarrollo', 'Podemos sumar un aviso más insistente para pedidos sin abrir.'], ['atencion', 'Un pedido que espera mucho es un cliente que se va.']],
  rapido: [['lider', '¡Excelente! Eso es lo que buscamos.'], ['marketing', 'Eso se puede contar en la publicidad.']],
  agotados: [['atencion', 'Así el asistente no ofrece lo que no hay.'], ['marketing', 'Si vuelven hoy, aviso para promocionarlos.']],
  rechazos: [['calidad', 'Revisemos los motivos para ajustar carta u horarios.'], ['lider', 'Lo llevo a la próxima reunión.']],
  promo: [['datos', 'Mañana comparo los pedidos contra un jueves común.'], ['atencion', 'Estoy atenta a la mesa de pedidos ese turno.']],
  ticket: [['marketing', 'Con la venta sugerida lo podemos subir.'], ['datos', 'Lo sigo de cerca esta semana.']],
  conteo: [['lider', 'Bien, el respaldo de las 00:50 nos cubre.'], ['testing', 'Lo tengo en mi lista de recorridos.']],
  conteo_falta: [['lider', 'Hay que preguntarle al gerente si necesita ayuda.'], ['atencion', 'Le puedo preparar una guía cortita.']],
  sitio: [['testing', 'Perfecto, sigo con las pruebas.'], ['lider', 'Gracias, Facundo.']],
  alerta: [['lider', 'Todos atentos: esto va primero.'], ['desarrollo', 'Lo miro con Facundo, sin tocar nada hasta que lo apruebe la jefa.']],
  ci: [['desarrollo', 'Nada se publica hasta que esté en verde.'], ['soporte', 'Lo anoto en el control.']],
  ci_ok: [['desarrollo', '¡Bien! Podemos seguir.'], ['lider', 'Así me gusta.']],
  tareas: [['lider', 'La jefa decide cuándo arrancamos.'], ['testing', 'Después lo pruebo.']],
  informe: [['lider', 'Lo sumo a la bandeja ejecutiva.'], ['datos', 'Si necesita números, los tengo.']],
  error: [['soporte', 'Reviso el motivo antes de repetir.'], ['lider', 'Sin apuro: no se gastan consultas de más.']],
  ia: [['lider', 'Mientras tanto trabajamos con datos reales.'], ['soporte', 'Puedo revisar la conexión cuando la jefa quiera.']],
  propuesta: [['lider', 'Buena idea, la anoto para la reunión.'], ['datos', 'Me gusta: se puede medir.'], ['testing', 'Si se hace, la pruebo en los dos locales.']],
  general: [['lider', 'Gracias, lo tengo en cuenta.'], ['datos', 'Buen dato.']],
  plataforma: [['lider', 'Bien, Lucas: eso lo decide la jefa, dejale la respuesta lista.'], ['atencion', 'Si es de un local, te paso cómo vienen los pedidos.']],
  difusion: [['marketing', 'Te paso las promos de los locales para los ejemplos.'], ['lider', 'Solo canales gratis y con el local de ejemplo, ¿sí?'], ['desarrollo', 'Si piden algo nuevo en esos sitios, lo anoto para el chat.']]
};
const TEAM_PROPOSALS = [
  ['desarrollo', 'prop-carrito', 'Recordatorio al cliente que dejó el carrito sin enviar en el chat.'],
  ['marketing', 'prop-regreso', 'Cupón de regreso para clientes que no piden hace 30 días.'],
  ['testing', 'prop-recorrido', 'Recorrido de prueba semanal: un pedido completo en cada local del chat.'],
  ['calidad', 'prop-fotos', 'Revisar que cada producto de la carta tenga descripción clara.'],
  ['datos', 'prop-reporte', 'Reporte semanal automático por local con conversión y ticket promedio.'],
  ['atencion', 'prop-faq', 'Respuestas rápidas para las preguntas más comunes de los clientes.'],
  ['difusion', 'prop-ficha', 'Ficha única de GESTLOK Chat (descripción corta, larga y capturas) para copiar en cada directorio.'],
  ['soporte_general', 'prop-guia', 'Guía de primeros pasos para el dueño de un comercio nuevo: carta, horarios, QR y gerente.']
];

function localLabel(x) { return [x.empresa, x.nombre].filter(Boolean).join(' '); }

export function buildInsights(model = {}) {
  const out = [], push = (o) => out.push({level: 1, local: '', basis: 'dato', ...o});
  const pulse = model.pulse && Array.isArray(model.pulse.sucursales) ? model.pulse : null;
  const now = baDate(model.now ? new Date(model.now) : new Date());
  if (pulse) {
    const activos = pulse.sucursales.filter(x => x.activa && x.habilitada !== false);
    const promos = new Map();
    for (const x of activos) {
      const L = localLabel(x), id = x.slug || L;
      if (x.pendientes > 0) push({id: 'pend-' + id, agent: 'atencion', level: 3, tag: 'pendientes', local: L,
        text: L + ' tiene ' + plural(x.pendientes, 'pedido sin abrir', 'pedidos sin abrir') + (x.pendiente_max_min != null ? ' (el más viejo, hace ' + x.pendiente_max_min + ' min).' : '.')});
      if (x.reclamos_pendientes > 0) push({id: 'recl-' + id, agent: 'atencion', level: 3, tag: 'reclamos', local: L,
        text: L + ': ' + plural(x.reclamos_pendientes, 'reclamo sin responder', 'reclamos sin responder') + '.'});
      if (x.en_preparacion > 0) push({id: 'prep-' + id, agent: 'atencion', tag: 'general', local: L, text: L + ': ' + plural(x.en_preparacion, 'pedido', 'pedidos') + ' en preparación ahora.'});
      const conv = Number(x.conv_7d) || 0, ped = Number(x.ped_7d) || 0;
      if (conv > 0) {
        const pct = Math.round(Math.min(ped, conv) / conv * 100), low = conv >= 5 && pct < 30;
        push({id: 'conv-' + id, agent: 'datos', level: low ? 2 : 1, tag: 'conversion', local: L,
          text: L + ': ' + plural(conv, 'conversación', 'conversaciones') + ' y ' + plural(ped, 'pedido', 'pedidos') + ' en 7 días (' + pct + '% termina en pedido).',
          idea: low ? {agent: 'desarrollo', text: 'Muchos clientes de ' + L + ' miran y no piden: probar un botón con la promo más pedida en la bienvenida del chat.'} : null});
      } else if (!ped) {
        push({id: 'quieto-' + id, agent: 'marketing', level: 2, tag: 'quieto', local: L, text: L + ' no tuvo movimiento en el chat esta semana.',
          idea: {agent: 'marketing', text: 'Difundir el QR del chat de ' + L + ' en el mostrador, las bolsas y el estado de WhatsApp.'}});
      }
      const last = ago(x.ultimo_pedido_at);
      if (last != null && last > 3 * 1440 && conv > 0) push({id: 'ult-' + id, agent: 'marketing', level: 2, tag: 'quieto', local: L,
        text: 'El último pedido por chat de ' + L + ' fue ' + agoText(last) + '.',
        idea: {agent: 'marketing', text: 'Mensaje para clientes de ' + L + ' con la promo de la semana y el link del chat.'}});
      const conf = x.min_confirmacion_7d == null ? null : Number(x.min_confirmacion_7d);
      const confText = conf == null ? '' : conf < 1 ? 'menos de 1 min' : Math.round(conf) + ' min';
      if (conf != null && conf > 10) push({id: 'conf-' + id, agent: 'calidad', level: 2, tag: 'tiempo', local: L,
        text: 'En ' + L + ' el gerente tarda ' + confText + ' (mediana) en confirmar los pedidos.',
        idea: {agent: 'desarrollo', text: 'Aviso más insistente en el celular del gerente de ' + L + ' para pedidos sin abrir.'}});
      else if (conf != null) push({id: 'conf-' + id, agent: 'atencion', tag: 'rapido', local: L, text: L + ' confirma rápido: ' + confText + ' de mediana esta semana.'});
      if (Number(x.aceptados_7d) > 0 && x.ticket_7d) push({id: 'tick-' + id, agent: 'datos', tag: 'ticket', local: L, text: 'Ticket promedio en ' + L + ': ' + money(x.ticket_7d) + ' (7 días).'});
      if (x.productos_agotados > 0) push({id: 'agot-' + id, agent: 'calidad', level: 2, tag: 'agotados', local: L,
        text: L + ' tiene ' + plural(x.productos_agotados, 'producto agotado', 'productos agotados') + ' en la carta.',
        idea: {agent: 'calidad', text: 'Confirmar con el gerente de ' + L + ' si los agotados vuelven hoy o conviene ocultarlos.'}});
      const bad = (Number(x.rechazados_7d) || 0) + (Number(x.cancelados_7d) || 0);
      if (bad > 0) push({id: 'rech-' + id, agent: 'atencion', level: 2, tag: 'rechazos', local: L,
        text: L + ': ' + plural(Number(x.rechazados_7d) || 0, 'pedido rechazado', 'pedidos rechazados') + ' y ' + plural(Number(x.cancelados_7d) || 0, 'cancelado', 'cancelados') + ' en 7 días.',
        idea: {agent: 'calidad', text: 'Revisar los motivos de rechazo de ' + L + ' para ajustar carta u horarios.'}});
      if (x.ia_activa === false) push({id: 'ia-' + id, agent: 'desarrollo', tag: 'general', local: L, text: 'La IA del chat está apagada en ' + L + '.'});
      for (const pr of Array.isArray(x.promos_dia) ? x.promos_dia : []) {
        const c = pr?.cuando; if (!c || typeof c !== 'object') continue;
        const tomorrow = new Date(Date.UTC(now.y, now.m - 1, now.d + 1));
        const when = ruleDayMatch(c, now.y, now.m, now.d) ? 'hoy' : ruleDayMatch(c, tomorrow.getUTCFullYear(), tomorrow.getUTCMonth() + 1, tomorrow.getUTCDate()) ? 'mañana' : '';
        if (!when) continue;
        const k = when + '|' + pr.nombre + '|' + (c.desde || '');
        if (!promos.has(k)) promos.set(k, {when, nombre: String(pr.nombre || 'Promo'), desde: c.desde || '', dia: DIAS[Number(c.dia_semana)] || '', locales: []});
        promos.get(k).locales.push(x.nombre || L);
      }
    }
    for (const [k, pr] of promos) {
      const locs = pr.locales.length > 1 ? pr.locales.slice(0, -1).join(', ') + ' y ' + pr.locales.at(-1) : pr.locales[0];
      push({id: 'promo-' + k, agent: 'marketing', level: 2, tag: 'promo', local: locs,
        text: (pr.when === 'hoy' ? 'Hoy' : 'Mañana (' + pr.dia + ')') + ' se activa «' + pr.nombre + '» en ' + locs + (pr.desde ? ' desde las ' + pr.desde : '') + '.',
        idea: {agent: 'marketing', text: 'Preparar un aviso para redes y estados de WhatsApp de ' + locs + ' con «' + pr.nombre + '».'}});
    }
    const conteo = pulse.conteo && typeof pulse.conteo === 'object' ? pulse.conteo : {};
    for (const [key, name] of [['munro', 'Munro'], ['torcuato', 'Don Torcuato']]) {
      const c = conteo[key]; if (!c) continue;
      if (!Number(c.turnos_7d)) push({id: 'conteo-' + key, agent: 'soporte', level: 2, tag: 'conteo_falta', local: name,
        text: name + ' no cargó turnos de Conteo en los últimos 7 días.',
        idea: {agent: 'atencion', text: 'Preguntar al gerente de ' + name + ' si necesita ayuda con el Conteo.'}});
      else if (c.ultimo_cerrado) {
        const [, mm, dd] = String(c.ultimo_cerrado).split('-');
        push({id: 'conteo-' + key, agent: 'soporte', tag: 'conteo', local: name,
          text: 'Conteo de ' + name + ': último turno cerrado el ' + dd + '/' + mm + (c.borrador_hoy ? '; hoy hay un turno en curso.' : '.')});
      }
    }
  } else if (model.pulseError) {
    push({id: 'pulso-off', agent: 'soporte', level: 2, tag: 'general', text: model.pulseError});
  }
  const plat = pulse && pulse.plataforma && typeof pulse.plataforma === 'object' ? pulse.plataforma : null;
  if (plat) {
    const n = k => Number(plat[k]) || 0;
    if (n('altas_pendientes')) push({id: 'plat-altas', agent: 'soporte_general', level: 3, tag: 'plataforma', basis: 'dato', text: plural(n('altas_pendientes'), 'comercio espera', 'comercios esperan') + ' el alta en GESTLOK. Dejo la respuesta lista para que la apruebes.'});
    if (n('gerentes_pendientes')) push({id: 'plat-gerentes', agent: 'soporte_general', level: 2, tag: 'plataforma', text: plural(n('gerentes_pendientes'), 'gerente espera', 'gerentes esperan') + ' aprobación para entrar a su local.'});
    if (n('mensajes_web_sin_leer')) push({id: 'plat-msj', agent: 'soporte_general', level: 3, tag: 'plataforma', text: 'Hay ' + plural(n('mensajes_web_sin_leer'), 'mensaje', 'mensajes') + ' del formulario de gestlok.com.ar sin leer en «Mensajes web».',
      idea: {agent: 'soporte_general', text: 'Respuesta modelo para los mensajes de la web: qué es GESTLOK Chat, el link a la demo y cómo seguir.'}});
    if (n('suscripciones_en_mora')) push({id: 'plat-mora', agent: 'soporte_general', level: 3, tag: 'plataforma', text: plural(n('suscripciones_en_mora'), 'suscripción está', 'suscripciones están') + ' en mora.'});
    if (n('suscripciones_pendientes')) push({id: 'plat-susp', agent: 'soporte_general', level: 2, tag: 'plataforma', text: plural(n('suscripciones_pendientes'), 'suscripción espera', 'suscripciones esperan') + ' el primer pago.'});
    if (n('locales_sin_carta')) push({id: 'plat-carta', agent: 'soporte_general', level: 2, tag: 'plataforma', text: plural(n('locales_sin_carta'), 'local de GESTLOK Chat no tiene', 'locales de GESTLOK Chat no tienen') + ' productos activos en la carta.',
      idea: {agent: 'soporte_general', text: 'Guía corta para cargar la carta, con un ejemplo, para el local que todavía no tiene productos.'}});
    if (!n('altas_pendientes') && !n('gerentes_pendientes') && !n('mensajes_web_sin_leer') && !n('suscripciones_en_mora'))
      push({id: 'plat-ok', agent: 'soporte_general', tag: 'plataforma', text: 'Soporte general al día: sin altas, gerentes ni mensajes de la web pendientes. ' + plural(n('empresas_chat'), 'empresa usa', 'empresas usan') + ' GESTLOK Chat.'});
  }
  const canales = pulse && Array.isArray(pulse.difusion) ? pulse.difusion : [];
  if (canales.length) {
    const pend = canales.filter(c => c && c.estado === 'pendiente'), pub = canales.filter(c => c && c.estado === 'publicado');
    const next = pend.slice().sort((a, b) => (Number(a.prioridad) || 3) - (Number(b.prioridad) || 3))[0];
    push({id: 'dif-estado', agent: 'difusion', level: pub.length ? 1 : 2, tag: 'difusion', text: 'Mapa de difusión de GESTLOK Chat: ' + plural(pub.length, 'sitio publicado', 'sitios publicados') + ' y ' + plural(pend.length, 'pendiente', 'pendientes') + ', todos gratis.'});
    if (next) push({id: 'dif-next', agent: 'difusion', level: 2, tag: 'difusion', text: 'Próximo sitio para publicar GESTLOK Chat: ' + String(next.nombre).slice(0, 60) + '.',
      idea: {agent: 'difusion', text: 'Publicar GESTLOK Chat en ' + String(next.nombre).slice(0, 60) + ': ' + String(next.como || '').slice(0, 150)}});
  }
  const support = model.support;
  const check = Array.isArray(support?.checks) ? support.checks[0] : null;
  if (check) {
    const min = ago(check.checked_at), concl = String(check.conclusion || ''), alert = /^ALERTA/i.test(concl), review = /^(REVISAR|VERIFICACI)/i.test(concl);
    push({id: 'sitio', agent: 'soporte', level: alert ? 3 : review ? 2 : 1, tag: alert ? 'alerta' : review ? 'ci' : 'sitio', text: (alert ? '¡Atención! ' : 'Control del sitio: ') + String(check.conclusion || 'sin conclusión') + (min != null ? ' (' + agoText(min) + ').' : '.')});
    let detail = null; try { detail = typeof check.detail === 'string' ? JSON.parse(check.detail) : check.detail; } catch { detail = null; }
    const wf = Array.isArray(detail?.workflows) ? detail.workflows : [];
    const failed = wf.find(w => w && w.conclusion === 'failure');
    if (failed) push({id: 'ci-' + (failed.id || failed.name), agent: 'testing', level: 2, tag: 'ci', text: 'En GitHub falló «' + String(failed.name || 'una prueba').slice(0, 60) + '». Nada se publica hasta revisarlo.'});
    else if (wf.length && wf.every(w => w?.conclusion === 'success')) push({id: 'ci-ok', agent: 'testing', tag: 'ci_ok', text: wf.length === 1 ? 'La última corrida de GitHub está en verde.' : 'Las últimas ' + wf.length + ' corridas de GitHub están en verde.'});
  }
  const tick = support?.worker?.last_tick ? ago(support.worker.last_tick) : null;
  if (tick != null && tick > 180) push({id: 'worker', agent: 'soporte', level: 2, tag: 'general', text: 'El control automático no corre desde ' + agoText(tick) + '.'});
  const tasks = Array.isArray(model.tasks) ? model.tasks : [], runs = Array.isArray(model.runs) ? model.runs : [];
  const runOf = id => runs.find(r => r.task_id === id);
  let pendingTotal = 0, reviewTotal = 0;
  for (const p of TEAM) {
    const mine = tasks.filter(t => t.agent === p.id && t.status === 'pendiente');
    const waiting = mine.filter(t => !runOf(t.id)), review = mine.filter(t => runOf(t.id)?.state === 'review'), errors = mine.filter(t => runOf(t.id)?.state === 'error');
    pendingTotal += waiting.length; reviewTotal += review.length;
    if (waiting.length) push({id: 'wait-' + p.id, agent: p.id, level: 2, tag: 'tareas', basis: 'tarea', text: 'Tengo ' + plural(waiting.length, 'tarea guardada', 'tareas guardadas') + ' esperando que la inicies.'});
    if (review.length) push({id: 'rev-' + p.id, agent: p.id, level: 2, tag: 'informe', basis: 'ia', text: 'Mi informe está listo para que lo revises en la bandeja.'});
    if (errors.length) push({id: 'err-' + p.id, agent: p.id, level: 2, tag: 'error', basis: 'ia', text: 'Mi última ejecución terminó con error; está el motivo en la bandeja.'});
  }
  const jor = model.pulse?.jornada;
  if (jor && jor.activa) {
    const hoyIso = now.y + '-' + String(now.m).padStart(2, '0') + '-' + String(now.d).padStart(2, '0');
    push({id: 'jornada', agent: 'lider', tag: 'general', basis: 'sistema', text: jor.ultima === hoyIso ? 'La jornada de hoy ya arrancó: cada sector trabaja con el pulso del día y después preparo el informe.' : now.h < 8 ? 'La jornada diaria arranca a las 08:00.' : 'La jornada de hoy arranca cuando termine la misión en curso.'});
  }
  if (model.aiReady === false) push({id: 'ia-off', agent: 'desarrollo', tag: 'ia', text: 'La IA de HQ todavía no responde; seguimos trabajando con datos reales.'});
  if (model.quota && Number.isFinite(model.quota.remaining)) {
    const tk = model.quota.tokens;
    push({id: 'cuota', agent: 'lider', tag: 'general', text: 'Plan gratuito: quedan ' + model.quota.remaining + ' de ' + (model.quota.limit || 30) + ' consultas de IA del equipo hoy' + (tk ? ' y ' + Math.max(0, tk.limit - tk.used).toLocaleString('es-AR') + ' tokens' : '') + '.'});
    for (const p of TEAM) { const used = model.quota.perAgent?.[p.id] || 0, cap = model.quota.caps?.[p.id]; if (cap && used >= cap) push({id: 'tope-' + p.id, agent: p.id, level: 2, tag: 'general', basis: 'sistema', text: 'Llegué a mi límite diario de IA (' + cap + ' consultas). Sigo con datos reales y mañana retomo.'}); }
  }
  const alerts = out.filter(i => i.level >= 3).length;
  push({id: 'resumen', agent: 'lider', level: alerts ? 3 : 1, tag: 'general', basis: 'resumen',
    text: 'Resumen: ' + plural(alerts, 'alerta', 'alertas') + ' en los locales, ' + plural(pendingTotal, 'tarea sin iniciar', 'tareas sin iniciar') + ' y ' + plural(reviewTotal, 'informe', 'informes') + ' para revisar.'});
  return out.sort((a, b) => b.level - a.level);
}

export function buildIdeas(insights, model = {}) {
  const ideas = [];
  for (const i of insights) if (i.idea) ideas.push({id: 'idea-' + i.id, agent: i.idea.agent || i.agent, text: i.idea.text, basis: i.text, source: 'dato'});
  for (const run of Array.isArray(model.runs) ? model.runs : []) {
    if (run.state !== 'review' || !run.result) continue;
    const task = (model.tasks || []).find(t => t.id === run.task_id);
    if (!task || task.status !== 'pendiente') continue;
    const first = String(run.result).split(/\n+/).map(s => s.trim()).find(s => s.length > 20 && !/^INFORME/.test(s));
    if (first) ideas.push({id: 'idea-run-' + run.task_id, agent: task.agent, text: first.slice(0, 220), basis: 'Informe de IA registrado', source: 'ia'});
  }
  for (const [agent, id, text] of TEAM_PROPOSALS) ideas.push({id: 'idea-' + id, agent, text, basis: 'Propuesta del equipo (sin datos)', source: 'propuesta'});
  return ideas;
}

// ---------- Dibujo pixel art ----------
function makePainter(c) {
  const r = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), w, h); };
  return r;
}

function drawCreature(c, p, o) {
  const r = makePainter(c);
  const bob = o.walking ? (o.frame % 2) : (o.sit ? 0 : (Math.floor(o.t * 1.6 + o.seed) % 2 === 0 ? 0 : 1) * 0);
  const X = Math.round(o.x) - 8, Y = Math.round(o.y) - 16 - (o.walking && o.frame % 2 ? 1 : 0) + (o.sit ? 2 : 0) + (o.jump ? -Math.round(Math.abs(Math.sin(o.t * 9)) * 3) : 0);
  const R = (x, y, w, h, col) => r(X + x, Y + y, w, h, col);
  const dark = '#1b1b2a', back = o.dir === 'up', side = o.dir === 'left' ? -1 : o.dir === 'right' ? 1 : 0;
  const blink = !o.sleep && (Math.floor(o.t * 10 + o.seed * 7) % 37 === 0);
  // sombra
  c.fillStyle = 'rgba(20,24,40,.22)'; c.fillRect(X + 3, Y + 15 - (o.sit ? 2 : 0) + (o.jump ? 0 : 0), 10, 2);
  const step = o.walking ? (o.frame % 2) : 0;
  const eyes = (lx, rx, y, col = dark) => {
    if (back) return;
    if (o.sleep || blink) { R(lx + side, y + 1, 2, 1, col); R(rx + side, y + 1, 2, 1, col); return; }
    R(lx + side, y, 2, 2, col); R(rx + side, y, 2, 2, col); R(lx + side, y, 1, 1, '#ffffff'); R(rx + side, y, 1, 1, '#ffffff');
  };
  const arms = (col) => {
    const ty = o.typing ? (Math.floor(o.t * 8) % 2) : 0;
    R(3, 10 - ty, 1, 3, col); R(12, 10 - (o.typing ? 1 - ty : 0), 1, 3, col);
  };
  const feet = (col) => { if (o.sit) return; R(5, 14 - step, 2, 2, col); R(9, 13 + step, 2, 2, col); };
  switch (p.kind) {
    case 'owl': {
      R(3, 2, 10, 12, p.body); R(4, 1, 8, 1, p.body); R(2, 8, 1, 4, p.extra); R(13, 8, 1, 4, p.extra);
      R(3, 0, 2, 2, p.extra); R(11, 0, 2, 2, p.extra);
      if (!back) { R(5, 8, 6, 5, p.belly); R(6, 9, 1, 1, p.body); R(9, 10, 1, 1, p.body); R(7, 11, 1, 1, p.body);
        R(4, 3, 3, 3, '#ffffff'); R(9, 3, 3, 3, '#ffffff');
        if (o.sleep || blink) { R(4, 4, 3, 1, dark); R(9, 4, 3, 1, dark); } else { R(5 + side, 4, 1, 1, dark); R(10 + side, 4, 1, 1, dark); }
        R(3, 3, 4, 1, p.accent); R(9, 3, 4, 1, p.accent); R(7, 4, 2, 1, p.accent);
        R(7, 6, 2, 2, '#f08a24'); R(4, 7, 8, 1, '#e24b5b'); }
      else { R(5, 5, 6, 6, p.extra); }
      feet('#f08a24'); break;
    }
    case 'octo': {
      R(3, 1, 10, 8, p.body); R(4, 0, 8, 1, p.body); R(2, 3, 1, 4, p.body); R(13, 3, 1, 4, p.body);
      if (!back) { eyes(5, 9, 4); R(4, 3, 4, 1, p.accent); R(8, 3, 4, 1, p.accent); R(7, 7, 2, 1, p.accent); R(4, 1, 1, 1, p.belly); R(11, 2, 1, 1, p.belly); }
      for (let i = 0; i < 4; i++) { const wig = o.sit ? 0 : Math.round(Math.sin(o.t * 6 + i * 1.7)); R(3 + i * 3, 9, 2, 4 + (i % 2), p.body); R(3 + i * 3 + wig, 13 + (i % 2), 2, 1, p.extra); }
      if (o.typing) { const ty = Math.floor(o.t * 8) % 2; R(1, 9 - ty, 2, 1, p.body); R(13, 8 + ty, 2, 1, p.body); }
      break;
    }
    case 'robot': {
      R(7, -1, 2, 1, Math.floor(o.t * 2) % 2 ? '#ff5d5d' : '#7dff8a'); R(7, 0, 2, 2, p.extra);
      R(3, 2, 10, 7, p.body); R(3, 8, 10, 1, p.extra); R(2, 4, 1, 3, p.extra); R(13, 4, 1, 3, p.extra);
      if (!back) { R(4, 4, 8, 3, '#1c2b3a'); const on = o.sleep ? '#2b4a5a' : p.accent; R(5 + side, 5, 2, 1, on); R(9 + side, 5, 2, 1, on); }
      R(4, 9, 8, 5, p.belly); R(6, 10, 4, 2, Math.floor(o.t * 3) % 2 ? p.accent : '#1f8fb0'); arms(p.extra);
      if (!o.sit) { R(4, 14, 3, 2, '#2c3846'); R(9, 14, 3, 2, '#2c3846'); R(5 + step, 15, 1, 1, '#7d8c9b'); }
      break;
    }
    case 'frog': {
      R(4, 9, 8, 5, p.body); if (!back) R(6, 10, 4, 4, p.belly); arms(p.body);
      R(2, 3, 12, 6, p.body); R(3, 0, 4, 4, p.body); R(9, 0, 4, 4, p.body);
      if (!back) { R(4, 1, 2, 2, '#ffffff'); R(10, 1, 2, 2, '#ffffff');
        if (o.sleep || blink) { R(4, 2, 2, 1, dark); R(10, 2, 2, 1, dark); } else { R(5 + Math.max(0, side), 1, 1, 2, dark); R(10 + Math.max(0, side), 1, 1, 2, dark); }
        R(5, 7, 6, 1, p.extra); R(3, 6, 1, 1, '#f7a1a1'); R(12, 6, 1, 1, '#f7a1a1'); }
      feet(p.extra); break;
    }
    case 'parrot': {
      R(5, 9, 6, 5, p.body); if (!back) R(6, 10, 4, 3, p.belly);
      const flap = o.walking || o.typing ? (Math.floor(o.t * 8) % 2) : 0;
      R(3, 8 - flap, 2, 5, p.extra); R(11, 8 - flap, 2, 5, p.extra); R(3, 12 - flap, 2, 1, p.accent); R(11, 12 - flap, 2, 1, p.accent);
      R(4, 2, 8, 7, p.body); R(5, 1, 6, 1, p.body); R(6, -1, 2, 2, p.accent); R(8, 0, 2, 1, p.accent);
      if (!back) { R(5, 4, 2, 2, '#ffffff'); R(9, 4, 2, 2, '#ffffff'); eyes(5, 9, 4); R(7, 6, 2, 2, '#f2b134'); R(7, 8, 2, 1, '#c98a1d'); }
      else R(6, 9, 4, 4, p.extra);
      R(7, 14, 2, 2, p.extra); R(5, 14 - step, 1, 2, '#f2b134'); R(10, 14 + step, 1, 2, '#f2b134');
      break;
    }
    case 'dog': {
      R(12, 9, 2, 2, p.body); R(14, 8 - (Math.floor(o.t * 6) % 2), 1, 2, p.body);
      R(4, 9, 8, 5, p.body); if (!back) R(6, 10, 4, 4, p.belly); arms(p.body);
      R(3, 2, 10, 7, p.body); R(4, 1, 8, 1, p.body);
      R(1, 2, 3, 6, p.extra); R(12, 2, 3, 6, p.extra);
      if (!back) { eyes(5, 9, 4); R(6, 6, 4, 2, p.belly); R(7, 6, 2, 1, dark); R(7, 8, 2, 1, '#e46a6a'); R(4, 9, 8, 1, p.accent); R(7, 10, 2, 1, '#ffd23f'); }
      feet(p.extra); break;
    }
    default: {
      // gata, zorra, coneja y castor comparten cuerpo
      if (p.kind === 'fox') { R(12, 10, 3, 3, p.body); R(14, 9, 2, 2, '#ffffff'); }
      if (p.kind === 'cat') { R(13, 8, 1, 4, p.body); R(12, 11, 1, 1, p.body); }
      if (p.kind === 'beaver') { R(11, 12, 4, 2, p.extra); }
      R(4, 9, 8, 5, p.body); if (!back) R(6, 10, 4, 4, p.belly); arms(p.body);
      R(3, 2, 10, 7, p.body); R(4, 1, 8, 1, p.body);
      if (p.kind === 'cat') { R(3, 0, 2, 2, p.body); R(11, 0, 2, 2, p.body); R(4, 1, 1, 1, '#f7b5b5'); R(11, 1, 1, 1, '#f7b5b5'); }
      if (p.kind === 'fox') { R(3, 0, 2, 2, p.body); R(11, 0, 2, 2, p.body); R(3, 0, 1, 1, p.accent); R(12, 0, 1, 1, p.accent); }
      if (p.kind === 'bunny') { R(4, -4, 2, 6, p.body); R(10, -4, 2, 6, p.body); R(5, -3, 1, 4, p.accent); R(10, -3, 1, 4, p.accent); }
      if (!back) {
        if (p.kind === 'fox') R(5, 6, 6, 3, p.belly);
        eyes(5, 9, 4);
        R(4, 6, 1, 1, '#f7a1a1'); R(11, 6, 1, 1, '#f7a1a1');
        if (p.kind === 'cat') { R(7, 6, 2, 1, p.extra); R(1, 6, 2, 1, '#e9d6c0'); R(13, 6, 2, 1, '#e9d6c0'); }
        if (p.kind === 'fox') R(7, 6, 2, 1, p.accent);
        if (p.kind === 'bunny') { R(7, 6, 2, 1, p.accent); R(4, 3, 3, 1, '#7c8597'); R(9, 3, 3, 1, '#7c8597'); R(7, 3, 2, 1, '#7c8597'); }
        if (p.kind === 'beaver') { R(7, 6, 2, 1, p.extra); R(7, 7, 2, 2, '#ffffff'); }
      }
      if (p.kind === 'cat') { R(2, 1, 12, 1, p.accent); R(2, 2, 1, 4, p.accent); R(13, 2, 1, 4, p.accent); if (!back) R(3, 7, 3, 1, p.accent); }
      if (p.kind === 'beaver') { R(3, 0, 10, 3, p.accent); R(2, 2, 12, 1, '#d9a400'); R(7, 0, 2, 1, '#fff2a8'); }
      feet(p.kind === 'bunny' ? '#d8d2cc' : p.kind === 'beaver' ? p.extra : '#3a2a22');
    }
  }
  if (o.hold === 'mug') { R(13, 9, 3, 3, '#ffffff'); R(16, 10, 1, 1, '#ffffff'); if (Math.floor(o.t * 3) % 2) R(14, 7, 1, 1, '#d7dbe3'); else R(15, 6, 1, 1, '#d7dbe3'); }
  if (o.hold === 'paddle') { R(13, 8, 3, 3, '#d33b3b'); R(14, 11, 1, 2, '#7a4a2a'); }
  if (o.hold === 'marker') { R(13, 7, 1, 3, '#2766c9'); }
}

function drawIcon(c, kind, x, y, t) {
  const r = makePainter(c), X = Math.round(x), Y = Math.round(y) + Math.round(Math.sin(t * 3) * 1);
  if (kind === 'alert') { r(X - 3, Y - 7, 6, 8, '#ffd23f'); r(X - 1, Y - 6, 2, 4, '#3b2a00'); r(X - 1, Y - 1, 2, 1, '#3b2a00'); }
  else if (kind === 'work') { r(X - 6, Y - 6, 12, 6, '#ffffff'); for (let i = 0; i < 3; i++) r(X - 4 + i * 3, Y - 4, 2, 2, Math.floor(t * 4) % 3 === i ? '#2766c9' : '#9db3cf'); }
  else if (kind === 'doc') { r(X - 3, Y - 8, 7, 9, '#ffffff'); r(X - 2, Y - 6, 5, 1, '#2766c9'); r(X - 2, Y - 4, 4, 1, '#9db3cf'); r(X - 2, Y - 2, 5, 1, '#9db3cf'); r(X + 2, Y - 8, 2, 2, '#ffd23f'); }
  else if (kind === 'error') { r(X - 3, Y - 7, 6, 7, '#e5484d'); r(X - 1, Y - 6, 2, 3, '#ffffff'); r(X - 1, Y - 2, 2, 1, '#ffffff'); }
  else if (kind === 'idea') { r(X - 2, Y - 8, 5, 5, '#ffe066'); r(X - 1, Y - 3, 3, 2, '#b8b8b8'); if (Math.floor(t * 4) % 2) { r(X - 5, Y - 7, 1, 1, '#ffe066'); r(X + 5, Y - 7, 1, 1, '#ffe066'); } }
  else if (kind === 'zzz') { const k = Math.floor(t * 1.5) % 3; for (let i = 0; i <= k; i++) { r(X + i * 3, Y - 4 - i * 4, 3, 1, '#ffffff'); r(X + 2 + i * 3, Y - 3 - i * 4, 1, 1, '#ffffff'); r(X + i * 3, Y - 2 - i * 4, 3, 1, '#ffffff'); } }
  else if (kind === 'heart') { r(X - 3, Y - 6, 2, 2, '#ff6b8b'); r(X + 1, Y - 6, 2, 2, '#ff6b8b'); r(X - 3, Y - 5, 6, 2, '#ff6b8b'); r(X - 2, Y - 3, 4, 1, '#ff6b8b'); r(X - 1, Y - 2, 2, 1, '#ff6b8b'); }
}

function drawFloor(c, night) {
  const r = makePainter(c);
  const floors = {
    '.': ['#d9b98f', '#cfac80'], 'o': ['#e2c79f', '#d6b98d'], ',': ['#4f7fa8', '#4a77a0'], ':': ['#7b6f9e', '#746897'],
    ';': ['#cf8455', '#c77b4c'], '~': ['#efe6d6', '#e3d6c1'], '_': ['#2f6a6e', '#2b6266']
  };
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    const ch = grid[y][x], X = x * T, Y = y * T;
    if (ch === '#') {
      if (y <= 1) { r(X, Y, T, T, y === 0 ? '#2b3445' : '#e9e3d8'); if (y === 1) { r(X, Y + 13, T, 3, '#b9ad9a'); } }
      else if (y === ROWS - 1) { r(X, Y, T, T, '#2b3445'); r(X, Y, T, 3, '#3d4a60'); }
      else { r(X, Y, T, T, '#2b3445'); r(x === 0 ? X + 12 : X, Y, 4, T, '#3d4a60'); }
      continue;
    }
    const base = ch === '|' || ch === '-' ? (y === 8 || y === 10 ? floors.o : floors[grid[y][x > 15 ? x - 1 : x + 1]] || floors.o) : floors[ch] || floors['.'];
    r(X, Y, T, T, base[0]);
    if (ch === '.' || ch === 'o') { r(X, Y + ((x % 2) ? 7 : 3), T, 1, base[1]); r(X + ((y % 2) ? 5 : 11), Y, 1, T, base[1]); }
    else if (ch === '~') { if ((x + y) % 2) r(X, Y, T, T, base[1]); }
    else { r(X + 3, Y + 3, 1, 1, base[1]); r(X + 11, Y + 10, 1, 1, base[1]); r(X + 7, Y + 13, 1, 1, base[1]); }
    if (ch === '|') { r(X + 6, Y, 4, T, 'rgba(173,216,236,.55)'); r(X + 6, Y, 1, T, '#8fb3c4'); r(X + 9, Y, 1, T, '#8fb3c4'); }
    if (ch === '-') { r(X, Y + 6, T, 4, 'rgba(173,216,236,.55)'); r(X, Y + 6, T, 1, '#8fb3c4'); r(X, Y + 9, T, 1, '#8fb3c4'); }
  }
  // Logo en el pasillo
  r(14 * T + 2, 9 * T + 4, 2 * T - 4, 8, '#1a5b83'); r(14 * T + 5, 9 * T + 6, 2 * T - 10, 4, '#d6ecfa');
  if (night) { c.fillStyle = 'rgba(10,18,40,.18)'; c.fillRect(0, 0, W, H); }
}

function drawFurniture(c, scene, t) {
  const r = makePainter(c), pulse = scene.pulse, h = baDate().h, night = h >= 21 || h < 7;
  for (const [type, x, y, w, hh] of FURNITURE) {
    const X = x * T, Y = y * T, PW = w * T, PH = hh * T;
    switch (type) {
      case 'window': {
        const sky = night ? ['#16213e', '#1f2c52'] : h < 9 || h >= 19 ? ['#f4a259', '#f7c59f'] : ['#8ecae6', '#bde0f6'];
        r(X + 2, Y + 1, PW - 4, 11, '#7a8899'); r(X + 3, Y + 2, PW - 6, 9, sky[0]); r(X + 3, Y + 7, PW - 6, 4, sky[1]);
        if (night) { r(X + 8, Y + 4, 1, 1, '#ffffff'); r(X + 20, Y + 3, 1, 1, '#ffffff'); r(X + 24, Y + 5, 2, 2, '#f1f1c8'); }
        else r(X + 22, Y + 3, 3, 3, '#fff3b0');
        r(X + PW / 2 - 1, Y + 2, 1, 9, '#7a8899'); break;
      }
      case 'screen-chat': case 'screen-local-0': case 'screen-local-1': {
        r(X + 1, Y + 1, PW - 2, 12, '#1d2633'); r(X + 2, Y + 2, PW - 4, 10, '#0f2a3f');
        const live = Math.floor(t * 2) % 2;
        if (type === 'screen-chat') {
          const locs = scene.locales; const max = Math.max(1, ...locs.map(l => Number(l.conv_7d) || 0));
          locs.slice(0, 4).forEach((l, i) => { const bh = Math.max(1, Math.round((Number(l.conv_7d) || 0) / max * 7)); r(X + 6 + i * 10, Y + 11 - bh, 6, bh, ['#5fd0ff', '#ffb35c', '#9be38f', '#d99bff'][i]); const ph = Math.min(7, Number(l.ped_7d) || 0); if (ph) r(X + 6 + i * 10, Y + 11 - ph, 6, 1, '#ffffff'); });
          r(X + PW - 10, Y + 3, 3, 3, live ? '#ff4d4d' : '#7a1f1f');
        } else {
          const l = scene.locales[type.endsWith('0') ? 0 : 1];
          if (l) {
            const bad = (l.pendientes > 0 || l.reclamos_pendientes > 0);
            r(X + 4, Y + 4, 4, 4, bad ? (live ? '#ff4d4d' : '#ffb3b3') : '#43d17a');
            for (let i = 0; i < 7; i++) r(X + 11 + i * 6, Y + 9 - ((i * 7 + Math.floor(t)) % 4), 4, 2, '#5fd0ff');
          } else { r(X + 6, Y + 6, PW - 12, 1, '#29465e'); }
        }
        break;
      }
      case 'board': {
        r(X + 2, Y + 1, PW - 4, 12, '#9aa4b1'); r(X + 3, Y + 2, PW - 6, 10, '#fbfbf7');
        const colors = ['#ffe066', '#ffb3c6', '#a5f3c4', '#a5d8ff', '#ffd8a8'];
        const n = Math.min(14, scene.ideasOnBoard);
        for (let i = 0; i < n; i++) r(X + 5 + (i % 7) * 12, Y + 3 + Math.floor(i / 7) * 5, 7, 4, colors[i % colors.length]);
        r(X + PW - 12, Y + 12, 8, 2, '#6b7280'); break;
      }
      case 'desk': case 'bigdesk': {
        r(X, Y + 1, PW, 9, type === 'bigdesk' ? '#8b5e3c' : '#c8a27a'); r(X, Y + 10, PW, 3, type === 'bigdesk' ? '#6c452a' : '#9b7653');
        r(X + 1, Y + 13, 2, 3, '#7b5c3f'); r(X + PW - 3, Y + 13, 2, 3, '#7b5c3f');
        // monitor del lado izquierdo y teclado del lado del empleado
        const mx = type === 'bigdesk' ? X + 4 : X + 2;
        r(mx, Y - 6, 12, 9, '#22303f'); r(mx + 1, Y - 5, 10, 6, scene.screenGlow(x, y, t)); r(mx + 5, Y + 3, 2, 2, '#22303f');
        r(mx + 2, Y - 4, 6, 1, 'rgba(255,255,255,.55)'); r(mx + 2, Y - 2, 4, 1, 'rgba(255,255,255,.35)');
        r(X + (type === 'bigdesk' ? 22 : 18), Y + 4, 10, 3, '#e8edf2'); r(X + (type === 'bigdesk' ? 23 : 19), Y + 5, 8, 1, '#b7c1cc');
        if (type === 'bigdesk') { r(X + 38, Y + 2, 5, 6, '#3c7a4a'); r(X + 39, Y + 1, 3, 2, '#5aa86a'); }
        else r(X + PW - 6, Y + 3, 3, 4, '#ffffff');
        break;
      }
      case 'table': {
        r(X + 2, Y + 2, PW - 4, PH - 6, '#b98a5b'); r(X + 2, Y + PH - 4, PW - 4, 3, '#8f6640'); r(X + 4, Y + 4, PW - 8, 1, '#d1a676');
        if (scene.meeting) { r(X + PW / 2 - 8, Y + 8, 16, 9, '#22303f'); r(X + PW / 2 - 7, Y + 9, 14, 6, '#5fd0ff'); }
        else { r(X + 20, Y + 10, 6, 4, '#ffffff'); r(X + 60, Y + 12, 5, 4, '#ffe066'); }
        break;
      }
      case 'plant': { r(X + 4, Y + 9, 8, 6, '#c0703a'); r(X + 5, Y + 9, 6, 1, '#d98b52'); r(X + 3, Y + 2, 10, 8, '#3f8f50'); r(X + 6, Y, 4, 4, '#55a865'); r(X + 2, Y + 5, 3, 3, '#55a865'); r(X + 11, Y + 4, 3, 3, '#2f7a40'); break; }
      case 'rack': { r(X + 1, Y - 4, 14, PH + 2, '#2a3340'); for (let i = 0; i < 6; i++) { r(X + 3, Y - 2 + i * 5, 10, 3, '#3b4757'); r(X + 4, Y - 1 + i * 5, 1, 1, Math.floor(t * 5 + i) % 3 ? '#43d17a' : '#9cff9c'); r(X + 6, Y - 1 + i * 5, 1, 1, Math.floor(t * 3 + i * 2) % 4 ? '#2a3340' : '#ffd23f'); } break; }
      case 'map': { r(X + 2, Y + 2, PW - 4, PH - 6, '#7c5a3c'); r(X + 4, Y + 4, PW - 8, PH - 10, '#e9e1c8'); r(X + 10, Y + 8, 12, 6, '#b7d6a6'); r(X + 24, Y + 12, 10, 8, '#b7d6a6'); scene.locales.slice(0, 2).forEach((l, i) => { r(X + 14 + i * 14, Y + 10 + i * 5, 3, 3, l.pendientes > 0 ? '#ff4d4d' : '#e5484d'); r(X + 15 + i * 14, Y + 13 + i * 5, 1, 2, '#7a1f1f'); }); break; }
      case 'kanban': { r(X + 1, Y - 6, PW - 2, PH + 4, '#e9edf2'); r(X + 1, Y - 6, PW - 2, 2, '#1a5b83'); const cols = ['#ffe066', '#a5d8ff', '#a5f3c4']; for (let i = 0; i < 3; i++) for (let j = 0; j < Math.min(3, scene.kanban[i] || 0); j++) r(X + 3 + i * 9, Y - 2 + j * 4, 7, 3, cols[i]); break; }
      case 'shelf': { r(X, Y - 6, PW, PH + 6, '#7b5236'); for (let i = 0; i < w * 3; i++) r(X + 2 + i * 5, Y - 4, 3, 7, ['#e5484d', '#2766c9', '#ffd23f', '#43a35b', '#8e6cc4'][i % 5]); r(X, Y + 4, PW, 2, '#5e3d22'); for (let i = 0; i < w * 3; i++) r(X + 2 + i * 5, Y + 7, 3, 6, ['#ff9f43', '#5fd0ff', '#e5484d'][i % 3]); break; }
      case 'counter': { r(X, Y, PW, PH, '#c9ced6'); r(X, Y + 11, PW, 5, '#8b95a3'); r(X + 4, Y - 6, 12, 14, '#3d3d46'); r(X + 6, Y - 4, 8, 4, '#20202a'); r(X + 9, Y + 2, 2, 3, '#ffffff'); if (scene.coffeeBusy) { r(X + 9, Y - 9 + (Math.floor(t * 3) % 2), 1, 2, '#e3e6ea'); } r(X + 24, Y + 2, 12, 6, '#a7b4c2'); r(X + 26, Y + 3, 8, 3, '#d4e6f1'); r(X + 44, Y + 1, 6, 6, '#ffffff'); r(X + 52, Y + 2, 4, 5, '#ffd8a8'); break; }
      case 'cooler': { r(X + 4, Y - 6, 8, 8, '#a5d8ff'); r(X + 5, Y - 5, 6, 3, '#d0ebff'); r(X + 3, Y + 2, 10, 13, '#e9edf2'); r(X + 6, Y + 6, 4, 2, '#2766c9'); break; }
      case 'fridge': { r(X + 1, Y - 8, PW - 2, PH + 7, '#dfe5ec'); r(X + 1, Y + 2, PW - 2, 1, '#aab4c0'); r(X + PW - 6, Y - 4, 2, 4, '#8b95a3'); r(X + PW - 6, Y + 5, 2, 5, '#8b95a3'); r(X + 4, Y - 5, 6, 4, '#ffd8a8'); break; }
      case 'pingpong': { r(X, Y + 2, PW, PH - 6, '#2f7d5b'); r(X, Y + PH - 4, PW, 2, '#245f45'); r(X + PW / 2, Y + 2, 1, PH - 6, '#ffffff'); r(X, Y + PH / 2 - 1, PW, 1, 'rgba(255,255,255,.5)');
        if (scene.pingpong) { const k = (Math.sin(t * 4) + 1) / 2; r(X + 4 + k * (PW - 10), Y + 8 + Math.round(Math.abs(Math.sin(t * 8)) * -4) + 6, 2, 2, '#ffffff'); }
        break; }
      case 'sofa': { r(X, Y - 3, PW, 6, '#c2554d'); r(X, Y + 3, PW, 9, '#d8675f'); r(X - 2, Y, 3, 12, '#a8433c'); r(X + PW - 1, Y, 3, 12, '#a8433c'); for (let i = 1; i < w; i++) r(X + i * T, Y + 4, 1, 7, '#b84f48'); break; }
      case 'armchair': { r(X + 2, Y - 3, PW - 4, 6, '#3f6fb0'); r(X + 2, Y + 3, PW - 4, 9, '#5585c8'); r(X, Y, 3, 12, '#345d95'); r(X + PW - 3, Y, 3, 12, '#345d95'); break; }
      case 'rug': { r(X + 4, Y + 2, PW - 8, PH - 4, '#d9c08f'); r(X + 6, Y + 4, PW - 12, PH - 8, '#c9a96e'); r(X + 8, Y + 6, PW - 16, 1, '#e9d6ad'); break; }
    }
  }
  // Lámparas encendidas de noche
  if (night) for (const [lx, ly] of [[5, 5], [15, 5], [24, 5], [5, 14], [15, 14], [24, 14]]) { const g = c.createRadialGradient(lx * T, ly * T, 2, lx * T, ly * T, 70); g.addColorStop(0, 'rgba(255,214,140,.22)'); g.addColorStop(1, 'rgba(255,214,140,0)'); c.fillStyle = g; c.fillRect(lx * T - 70, ly * T - 70, 140, 140); }
}

function drawChair(c, x, y) { const r = makePainter(c), X = x * T, Y = y * T; r(X + 3, Y + 2, 10, 3, '#2f3f52'); r(X + 4, Y + 5, 8, 6, '#6d86a1'); r(X + 5, Y + 6, 6, 1, '#88a0bb'); r(X + 7, Y + 11, 2, 2, '#2b3a4a'); r(X + 4, Y + 13, 8, 1, '#2b3a4a'); }

// ---------- Simulación ----------
const reduceMotion = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
const tileCenter = ([x, y]) => ({x: x * T + 8, y: y * T + 15});

function createSim() {
  const agents = TEAM.map((p, i) => ({
    p, id: p.id, seed: i * 1.37, tile: [...p.seat], pos: tileCenter(p.seat), path: [], dir: 'down',
    act: 'desk', until: 0, label: 'Trabajando en su puesto', bubble: null, energy: 70 + i * 3, frame: 0, frameT: 0,
    hold: null, sit: true, sleep: false, typing: true, partner: null, reserve: null, jumpUntil: 0
  }));
  return {agents, reserved: new Map(), meeting: null, nextMeeting: 0, lastInsight: new Map(), speech: [], t: 0, said: new Set()};
}

// ---------- Interfaz ----------
const CSS = `
.hqo{--ink:#10243a;--muted:#5b6f84;--line:#d6e0ea;--soft:#f3f7fb;--brand:#1a5b83;--navy:#0f2236;font:14px/1.4 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:var(--ink);border:1px solid var(--line);border-radius:16px;overflow:hidden;background:#fff}
.hqo *{box-sizing:border-box}
.hqo-top{display:flex;flex-wrap:wrap;align-items:center;gap:10px 14px;padding:12px 14px;background:linear-gradient(135deg,#0f2236,#173f5f);color:#eef6fd}
.hqo-brand{display:flex;align-items:baseline;gap:8px;font-weight:800;letter-spacing:.02em;font-size:16px}
.hqo-brand small{font-weight:600;color:#9cc7e6;font-size:12px;letter-spacing:0}
.hqo-live{display:inline-block;width:8px;height:8px;border-radius:50%;background:#43d17a;box-shadow:0 0 0 3px rgba(67,209,122,.25);margin-right:2px;animation:hqoLive 1.6s ease-in-out infinite}
@keyframes hqoLive{50%{opacity:.35}}
.hqo-chips{display:flex;flex-wrap:wrap;gap:6px;margin-left:auto}
.hqo-chip{display:inline-flex;align-items:center;gap:5px;padding:4px 9px;border-radius:999px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.18);font-size:12px;font-weight:600;white-space:nowrap}
.hqo-chip i{width:7px;height:7px;border-radius:50%;background:#9cc7e6;display:inline-block}
.hqo-chip.ok i{background:#43d17a}.hqo-chip.warn i{background:#ffd23f}.hqo-chip.bad i{background:#ff5d5d}
.hqo-tabs{display:flex;gap:2px;padding:0 8px;background:#0f2236;overflow-x:auto;scrollbar-width:none}
.hqo-tabs button{appearance:none;border:0;background:none;color:#a9c3d8;font:inherit;font-weight:700;padding:10px 12px;border-bottom:3px solid transparent;cursor:pointer;white-space:nowrap}
.hqo-tabs button[aria-selected="true"]{color:#fff;border-bottom-color:#5fd0ff}
.hqo-tabs b[hidden]{display:none}
.hqo-tabs b{display:inline-grid;place-items:center;min-width:18px;height:18px;padding:0 5px;margin-left:5px;border-radius:9px;background:#5fd0ff;color:#0f2236;font-size:11px}
.hqo-panel{padding:12px}
.hqo-office{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:12px}
@media (max-width:900px){.hqo-office{grid-template-columns:1fr}}
.hqo-stagewrap{min-width:0}
.hqo-scroll{overflow:hidden;border-radius:12px;background:#2b3445}
.hqo.zoom .hqo-scroll{overflow:auto;-webkit-overflow-scrolling:touch}
.hqo-stage{position:relative;width:100%;aspect-ratio:${W}/${H};touch-action:manipulation}
.hqo.zoom .hqo-stage{width:max(100%,960px)}
.hqo-stage canvas{position:absolute;inset:0;width:100%;height:100%;image-rendering:pixelated;image-rendering:crisp-edges;cursor:pointer}
.hqo-ov{position:absolute;inset:0;pointer-events:none;overflow:hidden}
.hqo-room{position:absolute;font-size:clamp(7px,1.05vw,11px);font-weight:800;color:rgba(255,255,255,.92);background:rgba(15,34,54,.55);padding:1px 6px;border-radius:5px;letter-spacing:.02em;transform:translate(2px,3px);white-space:nowrap}
.hqo-scr{position:absolute;font-size:clamp(6px,.9vw,10px);font-weight:700;color:#d6ecfa;transform:translate(-50%,-115%);white-space:nowrap;background:rgba(15,34,54,.8);padding:1px 5px;border-radius:4px}
.hqo-name{position:absolute;transform:translate(-50%,4px);font-size:clamp(7px,.95vw,11px);font-weight:800;color:#10243a;background:rgba(255,255,255,.92);padding:0 5px;border-radius:6px;white-space:nowrap;box-shadow:0 1px 2px rgba(0,0,0,.25);display:flex;align-items:center;gap:3px}
.hqo-name i{width:6px;height:6px;border-radius:50%;display:inline-block}
.hqo-name.sel{outline:2px solid #5fd0ff}
.hqo-bubble{position:absolute;transform:translate(-50%,calc(-100% - 30px));max-width:min(46%,250px);text-align:left;width:max-content;font-size:clamp(9px,1.15vw,12.5px);line-height:1.3;color:#10243a;background:#fff;border:2px solid #10243a;border-radius:10px;padding:5px 8px;box-shadow:0 2px 0 #10243a;animation:hqoPop .18s ease-out}
.hqo-bubble:after{content:'';position:absolute;left:50%;bottom:-7px;width:10px;height:10px;background:#fff;border-right:2px solid #10243a;border-bottom:2px solid #10243a;transform:translateX(-50%) rotate(45deg)}
.hqo-bubble b{display:block;font-size:.85em;color:var(--brand)}
.hqo-bubble.alerta{border-color:#b42318;box-shadow:0 2px 0 #b42318}.hqo-bubble.alerta:after{border-color:#b42318}
@keyframes hqoPop{from{transform:translate(-50%,calc(-100% - 22px)) scale(.85);opacity:0}}
.hqo-card{position:absolute;pointer-events:auto;right:8px;bottom:8px;width:min(270px,70%);background:#fff;border-radius:12px;border:1px solid var(--line);box-shadow:0 8px 24px rgba(15,34,54,.25);padding:10px;font-size:12.5px}
.hqo-card h4{margin:0 0 2px;font-size:14px}.hqo-card p{margin:4px 0;color:var(--muted)}
.hqo-card .row{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
.hqo-btn{appearance:none;border:1px solid #b9c9d8;background:#fff;color:var(--ink);font:inherit;font-weight:700;font-size:12.5px;padding:6px 10px;border-radius:9px;cursor:pointer}
.hqo-btn.primary{background:var(--brand);border-color:var(--brand);color:#fff}
.hqo-btn:disabled{opacity:.5;cursor:default}
.hqo-canal{flex-wrap:wrap;align-items:flex-start}.hqo-canal-txt{flex:1 1 240px;min-width:0}.hqo-canal-act{display:flex;gap:4px;flex-wrap:wrap;margin-left:auto}
.hqo-controls{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:8px}
.hqo-controls small{color:var(--muted);margin-left:auto;font-size:11.5px}
.hqo-feed{background:var(--soft);border:1px solid var(--line);border-radius:12px;padding:10px;min-width:0;max-height:560px;display:flex;flex-direction:column}
.hqo-feed h3{margin:0 0 8px;font-size:14px;display:flex;align-items:center;gap:6px}
.hqo-feed ol{list-style:none;margin:0;padding:0;overflow:auto;display:grid;gap:6px}
.hqo-ev{display:grid;grid-template-columns:28px 1fr;gap:7px;padding:7px;background:#fff;border-radius:9px;border:1px solid #e3ebf2;font-size:12.5px}
.hqo-ev canvas,.hqo-mini{width:28px;height:28px;image-rendering:pixelated;border-radius:7px;background:#eaf1f7}
.hqo-ev small{display:block;color:var(--muted);font-size:11px}
.hqo-tag{display:inline-block;font-size:10px;font-weight:800;padding:0 5px;border-radius:4px;margin-left:4px;vertical-align:1px;background:#e7eef6;color:#36506a}
.hqo-tag.dato{background:#e3f6ea;color:#1d6b3a}.hqo-tag.ia{background:#ece6fb;color:#5a3fa0}.hqo-tag.anim{background:#f1f1f1;color:#666}.hqo-tag.alerta{background:#fde7e5;color:#b42318}.hqo-tag.tarea{background:#fff4d6;color:#8a5a00}
.hqo-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:10px}
.hqo-grid.wide{grid-template-columns:repeat(auto-fill,minmax(min(100%,360px),1fr))}
.hqo-box{border:1px solid var(--line);border-radius:12px;padding:12px;background:#fff;min-width:0}
.hqo-box h3{margin:0 0 6px;font-size:15px}.hqo-box h4{margin:10px 0 4px;font-size:13px}
.hqo-kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:8px 0}
.hqo-kpi{background:var(--soft);border-radius:9px;padding:7px;text-align:center}
.hqo-kpi strong{display:block;font-size:18px;white-space:nowrap}.hqo-kpi span{font-size:11px;color:var(--muted)}
.hqo-kpi.bad strong{color:#b42318}.hqo-kpi.good strong{color:#1d6b3a}
.hqo-line{display:flex;gap:8px;align-items:flex-start;padding:6px 0;border-top:1px solid #edf2f7;font-size:13px}
.hqo-line:first-of-type{border-top:0}
.hqo-note{position:relative;background:#fff7c2;border-radius:4px 4px 12px 4px;padding:10px 10px 8px;box-shadow:0 2px 0 rgba(0,0,0,.08);min-width:0}
.hqo-note.ia{background:#ece6fb}.hqo-note.propuesta{background:#e3f1ff}
.hqo-note p{margin:6px 0;font-weight:600}
.hqo-note small{color:#6b6b55;display:block}
.hqo-votes{display:flex;gap:2px;margin-top:6px}
.hqo-kanban{display:grid;grid-template-columns:repeat(4,minmax(200px,1fr));gap:10px;overflow-x:auto}
.hqo-col{background:var(--soft);border-radius:12px;padding:8px;min-width:0}
.hqo-col h3{margin:2px 4px 8px;font-size:13px;display:flex;justify-content:space-between}
.hqo-task{background:#fff;border:1px solid #e3ebf2;border-radius:9px;padding:8px;margin-bottom:6px;font-size:12.5px;overflow-wrap:anywhere}
.hqo-task small{display:block;color:var(--muted);margin-top:4px}
.hqo-member{display:grid;grid-template-columns:72px 1fr;gap:10px;align-items:center}
.hqo-member canvas{width:72px;height:72px;image-rendering:pixelated;background:#eaf1f7;border-radius:12px}
.hqo-bar{height:7px;border-radius:4px;background:#e7eef6;overflow:hidden;margin-top:4px}.hqo-bar span{display:block;height:100%;background:#43d17a}
.hqo-honest{margin:0;padding:10px 14px;background:#f7fafc;border-top:1px solid var(--line);color:var(--muted);font-size:12px}
.hqo-empty{color:var(--muted);font-size:13px}
@media (max-width:560px){.hqo-panel{padding:8px}.hqo-kpis{grid-template-columns:repeat(2,1fr)}.hqo-chips{margin-left:0}}
`;

let ROOT = null, STATE = null;

function miniAvatar(p, size = 28, scale = 2) {
  const cv = document.createElement('canvas'); cv.width = 20 * scale; cv.height = 20 * scale;
  const c = cv.getContext('2d'); c.imageSmoothingEnabled = false; c.scale(scale, scale);
  drawCreature(c, p, {x: 10, y: 19, t: 0, seed: 0, dir: 'down'});
  cv.setAttribute('aria-hidden', 'true'); cv.style.width = size + 'px'; cv.style.height = size + 'px';
  return cv;
}
function avatarURL(p) { if (!STATE.avatarCache[p.id]) STATE.avatarCache[p.id] = miniAvatar(p, 28, 3).toDataURL(); return STATE.avatarCache[p.id]; }
const img = (p, size = 28) => '<img class="hqo-mini" alt="" src="' + avatarURL(p) + '" style="width:' + size + 'px;height:' + size + 'px">';

function realState(id, model) {
  const tasks = (model.tasks || []).filter(t => t.agent === id && t.status === 'pendiente');
  const runs = model.runs || [];
  const runFor = t => runs.find(r => r.task_id === t.id);
  if (tasks.some(t => runFor(t)?.state === 'working')) return {key: 'working', text: 'Trabajando con IA en tu tarea', color: '#b7791f'};
  if (tasks.some(t => runFor(t)?.state === 'review')) return {key: 'review', text: 'Informe listo para revisar', color: '#2765a8'};
  if (tasks.some(t => runFor(t)?.state === 'error')) return {key: 'error', text: 'Última ejecución con error', color: '#ac4141'};
  if (tasks.some(t => !runFor(t))) return {key: 'pending', text: 'Tarea guardada · sin iniciar', color: '#87621c'};
  return {key: 'free', text: model.aiReady ? 'Disponible' : 'Disponible · IA sin verificar', color: '#28765a'};
}

function loadIdeaPrefs() { try { const v = JSON.parse(localStorage.getItem(IDEAS_KEY) || '{}'); return {dismissed: new Set(v.dismissed || []), sent: new Set(v.sent || [])}; } catch { return {dismissed: new Set(), sent: new Set()}; } }
function saveIdeaPrefs() { try { localStorage.setItem(IDEAS_KEY, JSON.stringify({dismissed: [...STATE.prefs.dismissed].slice(-200), sent: [...STATE.prefs.sent].slice(-200)})); } catch { /* preferencia del dispositivo */ } }

function build() {
  const root = document.createElement('div');
  root.className = 'hqo'; root.dataset.hqOffice = 'ready';
  root.innerHTML = '<style>' + CSS + '</style>' +
    '<header class="hqo-top"><div class="hqo-brand"><span class="hqo-live" aria-hidden="true"></span>GESTLOK HQ <small>Oficina en vivo</small></div><div class="hqo-chips" data-hqo-chips></div></header>' +
    '<nav class="hqo-tabs" role="tablist" aria-label="Secciones de la oficina">' +
    [['oficina', 'Oficina'], ['reportes', 'Reportes'], ['ideas', 'Ideas'], ['proyectos', 'Proyectos'], ['equipo', 'Equipo']].map(([k, v], i) => '<button type="button" role="tab" data-hqo-tab="' + k + '" aria-selected="' + (i === 0) + '">' + v + '<b data-hqo-count="' + k + '" hidden></b></button>').join('') + '</nav>' +
    '<section class="hqo-panel" data-hqo-panel="oficina"><div class="hqo-office"><div class="hqo-stagewrap"><div class="hqo-scroll"><div class="hqo-stage"><canvas width="' + W * SCALE + '" height="' + H * SCALE + '" role="img" aria-label="Oficina animada de GESTLOK HQ con el equipo trabajando"></canvas><div class="hqo-ov" data-hqo-ov></div></div></div>' +
    '<div class="hqo-controls"><button type="button" class="hqo-btn" data-hqo-act="pause">Pausar</button><button type="button" class="hqo-btn" data-hqo-act="zoom">Ampliar</button><button type="button" class="hqo-btn" data-hqo-act="meeting">Llamar a reunión</button><small data-hqo-clock></small></div></div>' +
    '<aside class="hqo-feed" aria-label="Lo que pasa en la oficina"><h3><span class="hqo-live" aria-hidden="true"></span>Qué pasa ahora</h3><ol data-hqo-feed aria-live="polite"></ol></aside></div></section>' +
    '<section class="hqo-panel" data-hqo-panel="reportes" hidden></section><section class="hqo-panel" data-hqo-panel="ideas" hidden></section>' +
    '<section class="hqo-panel" data-hqo-panel="proyectos" hidden></section><section class="hqo-panel" data-hqo-panel="equipo" hidden></section>' +
    '<p class="hqo-honest">Los paseos, cafés, descansos y reuniones son animación. Lo que dicen sale de datos reales de GESTLOK (sin IA) o de informes de IA ya registrados. La IA solo trabaja cuando vos iniciás una tarea, y ningún empleado cambia nada sin tu aprobación.</p>';
  const canvas = root.querySelector('canvas'), ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  STATE = {root, canvas, ctx, ov: root.querySelector('[data-hqo-ov]'), sim: createSim(), model: {}, handlers: {}, insights: [], ideas: [],
    tab: 'oficina', paused: false, selected: null, feed: [], raf: 0, last: 0, lastDraw: 0, avatarCache: {}, prefs: loadIdeaPrefs(), queue: [], focus: null};
  root.addEventListener('click', onClick);
  canvas.addEventListener('click', onCanvasClick);
  addFeed('lider', '¡Buen día, equipo! Arrancamos.', 'anim');
  return root;
}

function addFeed(agent, text, kind = 'dato') {
  const now = new Date();
  STATE.feed.unshift({agent, text, kind, at: now});
  STATE.feed = STATE.feed.slice(0, 40);
  if (STATE.tab === 'oficina') renderFeed();
}
const KIND_LABEL = {dato: 'Dato real', ia: 'IA', anim: 'Animación', alerta: 'Alerta', tarea: 'Tu tarea', resumen: 'Resumen', propuesta: 'Propuesta'};
function renderFeed() {
  const ol = STATE.root.querySelector('[data-hqo-feed]'); if (!ol) return;
  ol.innerHTML = STATE.feed.slice(0, 25).map(e => { const p = BY_ID[e.agent] || TEAM[0]; return '<li class="hqo-ev">' + img(p) + '<div><strong>' + esc(p.name) + '</strong><span class="hqo-tag ' + esc(e.kind) + '">' + esc(KIND_LABEL[e.kind] || e.kind) + '</span><br>' + esc(e.text) + '<small>' + e.at.toLocaleTimeString('es-AR', {hour: '2-digit', minute: '2-digit', timeZone: TZ}) + '</small></div></li>'; }).join('');
}

function setTab(tab) {
  STATE.tab = tab;
  STATE.root.querySelectorAll('[data-hqo-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.hqoTab === tab)));
  STATE.root.querySelectorAll('[data-hqo-panel]').forEach(s => { s.hidden = s.dataset.hqoPanel !== tab; });
  renderPanels();
}

function onClick(ev) {
  const t = ev.target.closest?.('[data-hqo-tab],[data-hqo-act],[data-hqo-assign],[data-hqo-private],[data-hqo-idea],[data-hqo-dismiss],[data-hqo-close-card],[data-hqo-pick],[data-hqo-canal]');
  if (!t) return;
  if (t.dataset.hqoTab) return setTab(t.dataset.hqoTab);
  if (t.dataset.hqoAct === 'pause') { STATE.paused = !STATE.paused; t.textContent = STATE.paused ? 'Reanudar' : 'Pausar'; return; }
  if (t.dataset.hqoAct === 'zoom') { const z = STATE.root.classList.toggle('zoom'); t.textContent = z ? 'Achicar' : 'Ampliar'; return; }
  if (t.dataset.hqoAct === 'meeting') { startMeeting('manual'); return; }
  if (t.dataset.hqoAssign) { STATE.handlers.onAssign?.(t.dataset.hqoAssign); return; }
  if (t.dataset.hqoPrivate) { STATE.handlers.onPrivate?.(t.dataset.hqoPrivate); return; }
  if (t.dataset.hqoCanal) { t.disabled = true; STATE.handlers.onCanal?.(t.dataset.hqoCanal, t.dataset.hqoEstado); return; }
  if (t.dataset.hqoPick) { STATE.selected = t.dataset.hqoPick; setTab('oficina'); return; }
  if (t.dataset.hqoCloseCard) { STATE.selected = null; return; }
  if (t.dataset.hqoIdea) {
    const idea = STATE.ideas.find(i => i.id === t.dataset.hqoIdea); if (!idea) return;
    STATE.prefs.sent.add(idea.id); saveIdeaPrefs();
    STATE.handlers.onIdea?.(idea.agent, 'Idea de la pizarra: ' + idea.text + '\nBase: ' + idea.basis + '\nAnalizá si conviene, cómo se haría, riesgos y cómo validarlo en los dos locales.');
    renderPanels(); return;
  }
  if (t.dataset.hqoDismiss) { STATE.prefs.dismissed.add(t.dataset.hqoDismiss); saveIdeaPrefs(); renderPanels(); }
}

function onCanvasClick(ev) {
  const rect = STATE.canvas.getBoundingClientRect();
  const x = (ev.clientX - rect.left) / rect.width * W, y = (ev.clientY - rect.top) / rect.height * H;
  let best = null, bd = 14;
  for (const a of STATE.sim.agents) { const d = Math.hypot(a.pos.x - x, a.pos.y - 8 - y); if (d < bd) { bd = d; best = a; } }
  STATE.selected = best ? best.id : null;
  if (best) STATE.handlers.onSelect?.(best.id);
}

// ---------- Comportamiento ----------
function reserve(sim, key, id) { if (sim.reserved.has(key) && sim.reserved.get(key) !== id) return false; sim.reserved.set(key, id); return true; }
function release(sim, a) { for (const [k, v] of sim.reserved) if (v === a.id) sim.reserved.delete(k); }
function freeSpot(sim, list, id) { const free = list.filter(s => !sim.reserved.has(s.join(',')) || sim.reserved.get(s.join(',')) === id); if (!free.length) return null; const s = free[Math.floor(Math.random() * free.length)]; reserve(sim, s.join(','), id); return s; }

function goTo(a, tile) {
  const path = findPath(a.tile, tile);
  if (path === null) return false;
  a.path = path; a.sit = false; a.typing = false; a.sleep = false;
  if (reduceMotion()) { a.tile = [...tile]; a.pos = tileCenter(tile); a.path = []; }
  return true;
}
function say(a, text, kind = 'dato', ms = 5200) {
  a.bubble = {text, kind, until: performance.now() + ms};
  addFeed(a.id, text, kind);
}

function pickInsight(agentId) {
  const sim = STATE.sim, list = STATE.insights.filter(i => i.agent === agentId);
  if (!list.length) return null;
  list.sort((x, y) => (sim.lastInsight.get(x.id) || 0) - (sim.lastInsight.get(y.id) || 0) || y.level - x.level);
  const i = list[0]; sim.lastInsight.set(i.id, performance.now()); return i;
}
function replyFor(ins, from) {
  const opts = (REPLIES[ins.tag] || REPLIES.general).filter(([who]) => who !== from);
  return opts.length ? opts[Math.floor(Math.random() * opts.length)] : null;
}

function decide(a, now) {
  const sim = STATE.sim, model = STATE.model, real = realState(a.id, model);
  release(sim, a); a.hold = null; a.partner = null;
  const h = baDate().h, night = h >= 1 && h < 7;
  if (real.key === 'working' || real.key === 'pending' && Math.random() < .6) {
    a.act = 'desk'; a.label = real.key === 'working' ? 'Trabajando con IA en tu tarea' : 'Esperando que inicies la tarea'; goTo(a, a.p.seat); a.until = now + 20000 + Math.random() * 15000; return;
  }
  const r = Math.random(), tired = a.energy < 30;
  const w = night && a.id !== 'soporte' ? {desk: .15, sofa: .55, coffee: .1, chat: .1, board: .02, ping: 0, stroll: .08}
    : {desk: tired ? .25 : .42, coffee: tired ? .2 : .1, chat: .2, board: .08, sofa: tired ? .15 : .05, ping: .06, stroll: .06};
  let acc = 0, choice = 'desk';
  for (const [k, v] of Object.entries(w)) { acc += v; if (r < acc) { choice = k; break; } }
  if (choice === 'chat') {
    const ins = pickInsight(a.id);
    const partners = sim.agents.filter(b => b !== a && b.act !== 'meeting' && b.act !== 'visit' && !b.partner);
    if (ins && partners.length) {
      const rep = replyFor(ins, a.id);
      const b = (rep && partners.find(x => x.id === rep[0])) || partners[Math.floor(Math.random() * partners.length)];
      const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [b.tile[0] + dx, b.tile[1] + dy]).filter(([x, y]) => x > 0 && y > 0 && x < COLS && y < ROWS && !blocked[y][x]);
      const spot = near[0];
      if (spot && goTo(a, spot)) {
        a.act = 'visit'; a.partner = b.id; a.label = 'Charlando con ' + b.p.name; a.until = now + 40000; a.pending = {ins, rep: rep && rep[0] === b.id ? rep : [b.id, (REPLIES.general.find(x => x[0] === b.id) || [b.id, '¡Buen dato!'])[1]]};
        b.partner = a.id; return;
      }
    }
    choice = 'desk';
  }
  if (choice === 'coffee') { const s = freeSpot(sim, SPOTS.coffee, a.id) || freeSpot(sim, SPOTS.cooler, a.id); if (s && goTo(a, s)) { a.act = 'coffee'; a.label = 'Tomando un café'; a.until = now + 9000 + Math.random() * 6000; return; } }
  if (choice === 'sofa') { const s = freeSpot(sim, SPOTS.sofa, a.id); if (s && goTo(a, s)) { a.act = 'sofa'; a.label = night ? 'Descansando (turno noche)' : 'Descansando un rato'; a.until = now + 16000 + Math.random() * 16000; return; } }
  if (choice === 'board') { const s = freeSpot(sim, SPOTS.board, a.id); const idea = STATE.ideas.find(i => i.agent === a.id && !STATE.prefs.dismissed.has(i.id)); if (s && idea && goTo(a, s)) { a.act = 'board'; a.label = 'Anotando una idea en la pizarra'; a.until = now + 9000; a.pendingIdea = idea; return; } }
  if (choice === 'ping') {
    const b = sim.agents.find(x => x !== a && ['desk', 'coffee', 'stroll'].includes(x.act) && realState(x.id, model).key === 'free' && !x.partner);
    if (b && reserve(sim, 'ping0', a.id) && reserve(sim, 'ping1', b.id) && goTo(a, SPOTS.pingpong[0]) && goTo(b, SPOTS.pingpong[1])) {
      a.act = b.act = 'ping'; a.label = 'Jugando al ping-pong con ' + b.p.name; b.label = 'Jugando al ping-pong con ' + a.p.name;
      a.until = b.until = now + 16000; a.partner = b.id; b.partner = a.id; a.hold = b.hold = 'paddle'; return;
    }
  }
  if (choice === 'stroll') { const s = SPOTS.stroll[Math.floor(Math.random() * SPOTS.stroll.length)]; if (goTo(a, s)) { a.act = 'stroll'; a.label = 'Estirando las patas'; a.until = now + 6000; return; } }
  a.act = 'desk'; a.label = 'Trabajando: ' + a.p.foco.split(',')[0].toLowerCase(); goTo(a, a.p.seat); a.until = now + 14000 + Math.random() * 16000;
}

function startMeeting(reason) {
  const sim = STATE.sim; if (sim.meeting) return;
  const now = performance.now();
  sim.meeting = {reason, start: now, phase: 'gather', lines: [], idx: 0, next: 0};
  const order = ['lider', ...TEAM.filter(p => p.id !== 'lider').map(p => p.id)];
  order.forEach((id, i) => { const a = sim.agents.find(x => x.id === id); release(sim, a); a.partner = null; a.hold = null; a.act = 'meeting'; a.label = 'En la reunión de equipo'; goTo(a, MEETING_SEATS[i]); a.until = now + 120000; });
  const tops = STATE.insights.filter(i => i.basis !== 'resumen').slice(0, 5);
  const lines = [['lider', reason === 'ia' ? 'Reunión de IA en curso: cada sector prepara su propuesta.' : 'Reunión rápida: ¿cómo vienen los locales y el chat?', 'anim']];
  if (reason !== 'ia') {
    for (const i of tops) { lines.push([i.agent, i.text, i.level >= 3 ? 'alerta' : i.basis === 'ia' ? 'ia' : 'dato']); const rep = replyFor(i, i.agent); if (rep && Math.random() < .6) lines.push([rep[0], rep[1], 'anim']); }
    const idea = STATE.ideas.find(x => !STATE.prefs.dismissed.has(x.id) && x.source === 'dato') || STATE.ideas.find(x => !STATE.prefs.dismissed.has(x.id));
    if (idea) lines.push(['lider', 'Propuesta para la jefa: ' + idea.text, 'propuesta']);
    lines.push(['lider', '¡Gracias, equipo! Cada uno a su puesto.', 'anim']);
  }
  sim.meeting.lines = lines;
  addFeed('lider', reason === 'manual' ? 'La jefa llamó a reunión.' : reason === 'ia' ? 'Empieza una reunión de IA registrada.' : 'Reunión de equipo de rutina.', 'anim');
}

function stepMeeting(now) {
  const sim = STATE.sim, m = sim.meeting; if (!m) return;
  const iaMeeting = STATE.model.meeting;
  const arrived = sim.agents.every(a => !a.path.length);
  if (m.phase === 'gather' && (arrived || now - m.start > 25000)) { m.phase = 'talk'; m.next = now + 600; }
  if (m.phase === 'talk' && now >= m.next) {
    if (m.idx < m.lines.length) { const [id, text, kind] = m.lines[m.idx++]; const a = sim.agents.find(x => x.id === id); say(a, text, kind, 4800); m.next = now + 5200; }
    else if (!(m.reason === 'ia' && iaMeeting)) { sim.meeting = null; sim.nextMeeting = now + 300000; sim.agents.forEach(a => { a.until = now + Math.random() * 2500; }); }
  }
}

function stepAgent(a, dt, now) {
  const sim = STATE.sim;
  a.frameT += dt; if (a.frameT > .18) { a.frameT = 0; a.frame++; }
  if (a.path.length) {
    const next = tileCenter(a.path[0]), dx = next.x - a.pos.x, dy = next.y - a.pos.y, d = Math.hypot(dx, dy), sp = 38 * dt;
    a.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
    if (d <= sp) { a.pos = next; a.tile = a.path.shift(); } else { a.pos.x += dx / d * sp; a.pos.y += dy / d * sp; }
    a.energy = Math.max(0, a.energy - dt * .4);
    return;
  }
  // llegó a destino
  a.dir = 'down';
  const atSeat = a.tile[0] === a.p.seat[0] && a.tile[1] === a.p.seat[1];
  if (a.act === 'desk') { a.sit = atSeat; a.typing = atSeat; a.energy = Math.max(0, a.energy - dt * .5); }
  if (a.act === 'meeting') { a.sit = true; a.typing = false; }
  if (a.act === 'coffee') { a.hold = 'mug'; a.energy = Math.min(100, a.energy + dt * 6); if (!a.saidCoffee) { a.saidCoffee = true; if (Math.random() < .35) a.bubble = {text: ['¡Qué rico este café!', 'Un cafecito y sigo.', '¿Alguien quiere uno?'][Math.floor(Math.random() * 3)], kind: 'anim', until: now + 3000}; } }
  if (a.act === 'sofa') { a.sit = true; a.sleep = baDate().h < 7 || a.energy < 15; a.energy = Math.min(100, a.energy + dt * 5); }
  if (a.act === 'ping') { a.jumpUntil = now + 100; a.energy = Math.min(100, a.energy + dt * 2); }
  if (a.act === 'board' && a.pendingIdea) { a.hold = 'marker'; a.dir = 'up'; if (!a.wrote && now > a.until - 6000) { a.wrote = true; say(a, 'Idea para la pizarra: ' + a.pendingIdea.text, a.pendingIdea.source === 'ia' ? 'ia' : 'propuesta', 5000); STATE.sim.board = Math.min(14, (STATE.sim.board || 0) + 1); } }
  if (a.act === 'visit' && a.pending) {
    const b = sim.agents.find(x => x.id === a.partner);
    if (b && Math.hypot(b.pos.x - a.pos.x, b.pos.y - a.pos.y) < 24) {
      a.dir = b.pos.x > a.pos.x ? 'right' : 'left';
      const {ins, rep} = a.pending; a.pending = null;
      say(a, ins.text, ins.level >= 3 ? 'alerta' : ins.basis === 'ia' ? 'ia' : ins.basis === 'tarea' ? 'tarea' : 'dato', 5200);
      setTimeout(() => { if (!STATE) return; const rb = sim.agents.find(x => x.id === rep[0]) || b; rb.bubble = {text: rep[1], kind: 'anim', until: performance.now() + 4200}; addFeed(rb.id, rep[1], 'anim'); }, 4200);
      a.until = now + 9500; b.until = Math.max(b.until, now + 9500);
    } else if (!b || now > a.until) a.until = now;
  }
  if (now >= a.until && a.act !== 'meeting') {
    a.saidCoffee = false; a.wrote = false; a.pendingIdea = null;
    const p = a.partner && sim.agents.find(x => x.id === a.partner); if (p && p.partner === a.id) p.partner = null;
    decide(a, now);
  }
}

// ---------- Render ----------
function screenGlowFor(x, y, t) {
  const owner = TEAM.find(p => p.seat[0] === x + 1 && p.seat[1] === y - 1) || (x === 23 && y === 13 ? BY_ID.lider : null);
  const a = owner && STATE.sim.agents.find(q => q.id === owner.id);
  if (a && a.typing) return ['#5fd0ff', '#7fe0ff', '#4fc0ef'][Math.floor(t * 6 + x) % 3];
  return '#29465e';
}

function draw(now) {
  const {ctx: c, sim, model} = STATE;
  c.setTransform(SCALE, 0, 0, SCALE, 0, 0); c.imageSmoothingEnabled = false;
  const h = baDate().h, night = h >= 21 || h < 7, t = sim.t;
  const scene = {pulse: model.pulse, locales: STATE.locales, ideasOnBoard: Math.min(14, (STATE.ideas.length ? 3 : 0) + (sim.board || 0)), meeting: !!sim.meeting,
    kanban: STATE.kanbanCounts, coffeeBusy: sim.agents.some(a => a.act === 'coffee' && !a.path.length), pingpong: sim.agents.filter(a => a.act === 'ping' && !a.path.length).length === 2, screenGlow: screenGlowFor};
  drawFloor(c, night);
  for (const p of TEAM) drawChair(c, p.seat[0], p.seat[1]);
  for (const [x, y] of MEETING_SEATS.slice(0, 8)) drawChair(c, x, y);
  // los muebles altos (pantallas y pizarra) van atrás; personajes ordenados por y
  drawFurniture(c, scene, t);
  const order = [...sim.agents].sort((a, b) => a.pos.y - b.pos.y);
  for (const a of order) {
    const focusDim = STATE.focus && STATE.focus !== a.id;
    if (focusDim) c.globalAlpha = .45;
    drawCreature(c, a.p, {x: a.pos.x, y: a.pos.y, t, seed: a.seed, dir: a.dir, walking: a.path.length > 0, frame: a.frame, sit: a.sit, typing: a.typing, sleep: a.sleep, hold: a.hold, jump: a.act === 'ping' && !a.path.length && Math.sin(t * 8 + a.seed) > .7});
    c.globalAlpha = 1;
    // escritorio delante del que está sentado en su puesto
    if (a.sit && a.tile[0] === a.p.seat[0] && a.tile[1] === a.p.seat[1]) {
      const d = FURNITURE.find(f => (f[0] === 'desk' || f[0] === 'bigdesk') && f[2] === a.p.seat[1] + 1 && a.p.seat[0] >= f[1] && a.p.seat[0] < f[1] + f[3]);
      if (d) { const r = makePainter(c), X = d[1] * T, Y = d[2] * T; r(X, Y + 1, d[3] * T, 9, d[0] === 'bigdesk' ? '#8b5e3c' : '#c8a27a'); r(X, Y + 10, d[3] * T, 3, d[0] === 'bigdesk' ? '#6c452a' : '#9b7653');
        const mx = d[0] === 'bigdesk' ? X + 4 : X + 2; r(mx, Y - 6, 12, 9, '#22303f'); r(mx + 1, Y - 5, 10, 6, screenGlowFor(d[1], d[2], t)); r(mx + 5, Y + 3, 2, 2, '#22303f');
        r(X + (d[0] === 'bigdesk' ? 22 : 18), Y + 4, 10, 3, '#e8edf2'); }
    }
    const rs = realState(a.id, model);
    const icon = rs.key === 'working' ? 'work' : rs.key === 'review' ? 'doc' : rs.key === 'error' ? 'error' : rs.key === 'pending' ? 'alert' : a.sleep ? 'zzz' : a.act === 'board' ? 'idea' : a.act === 'coffee' && Math.floor(t) % 6 === 0 ? 'heart' : null;
    if (icon) drawIcon(c, icon, a.pos.x + (icon === 'zzz' ? 4 : 0), a.pos.y - 20 + (a.sit ? 2 : 0), t);
    if (STATE.selected === a.id) { c.strokeStyle = '#5fd0ff'; c.lineWidth = 1; c.strokeRect(Math.round(a.pos.x) - 9.5, Math.round(a.pos.y) - 19.5, 19, 21); }
  }
  if (night) { c.fillStyle = 'rgba(8,14,34,.22)'; c.fillRect(0, 0, W, H); }
  drawOverlay(now);
}

function pct(v, total) { return (v / total * 100).toFixed(3) + '%'; }
function drawOverlay(now) {
  const {ov, sim} = STATE, wide = STATE.canvas.getBoundingClientRect().width;
  const parts = [];
  if (wide > 420) for (const r of ROOMS) parts.push('<span class="hqo-room" style="left:' + pct(r.x * T, W) + ';top:' + pct(r.y * T, H) + '">' + esc(r.id === 'locales' && STATE.locales[0] ? 'Locales y soporte · ' + (STATE.locales[0].empresa || STATE.locales[0].nombre) : r.label) + '</span>');
  if (wide > 520) {
    const tot = STATE.locales.reduce((s, l) => s + (Number(l.ped_hoy) || 0), 0), pend = STATE.locales.reduce((s, l) => s + (Number(l.pendientes) || 0), 0);
    parts.push('<span class="hqo-scr" style="left:' + pct(5 * T, W) + ';top:' + pct(1 * T + 2, H) + '">EN VIVO · ' + plural(tot, 'pedido hoy', 'pedidos hoy') + ' · ' + pend + ' sin abrir</span>');
    STATE.locales.slice(0, 2).forEach((l, i) => parts.push('<span class="hqo-scr" style="left:' + pct((22 + i * 4) * T, W) + ';top:' + pct(1 * T + 2, H) + '">' + esc(l.nombre) + ' · ' + (Number(l.pendientes) || 0) + ' sin abrir</span>'));
  }
  for (const a of sim.agents) {
    const talking = a.bubble && a.bubble.until > now, rs = realState(a.id, STATE.model), showName = STATE.selected === a.id || talking || (wide > 640 && !(sim.meeting && a.act === 'meeting'));
    if (showName) parts.push('<span class="hqo-name' + (STATE.selected === a.id ? ' sel' : '') + '" style="left:' + pct(a.pos.x, W) + ';top:' + pct(a.pos.y, H) + '"><i style="background:' + rs.color + '"></i>' + esc(a.p.name) + '</span>');
    if (a.bubble && a.bubble.until > now) {
      const maxw = Math.min(wide * .46, 250), cx = Math.min(wide - maxw / 2 - 4, Math.max(maxw / 2 + 4, a.pos.x / W * wide));
      parts.push('<div class="hqo-bubble' + (a.bubble.kind === 'alerta' ? ' alerta' : '') + '" style="left:' + Math.round(cx) + 'px;top:' + pct(Math.max(56, a.pos.y), H) + '"><b>' + esc(a.p.name) + '</b>' + esc(a.bubble.text) + '</div>');
    }
  }
  if (STATE.selected) {
    const a = sim.agents.find(x => x.id === STATE.selected), rs = realState(a.id, STATE.model);
    parts.push('<div class="hqo-card" role="dialog" aria-label="Ficha de ' + esc(a.p.name) + '"><h4>' + esc(a.p.name) + ' · ' + esc(a.p.animal) + '</h4><p><strong>' + esc(a.p.puesto) + '</strong></p><p>' + esc(a.p.foco) + '</p><p>Ahora: ' + esc(a.label) + '</p><p style="color:' + rs.color + '">● ' + esc(rs.text) + '</p><div class="row"><button type="button" class="hqo-btn primary" data-hqo-assign="' + a.id + '">Asignar tarea</button><button type="button" class="hqo-btn" data-hqo-private="' + a.id + '">Su oficina</button><button type="button" class="hqo-btn" data-hqo-close-card="1">Cerrar</button></div></div>');
  }
  const html = parts.join('');
  if (html !== STATE.ovHTML) { ov.innerHTML = html; STATE.ovHTML = html; }
}

function tickClock() {
  const el = STATE.root.querySelector('[data-hqo-clock]'); if (!el) return;
  const txt = new Date().toLocaleTimeString('es-AR', {hour: '2-digit', minute: '2-digit', timeZone: TZ}) + ' · hora de Buenos Aires';
  if (el.textContent !== txt) el.textContent = txt;
}
function loop(ts) {
  STATE.raf = 0;
  if (!STATE.root.isConnected) return;
  const dt = Math.min(.1, Math.max(0, (ts - (STATE.last || ts)) / 1000)); STATE.last = ts;
  const visible = document.visibilityState !== 'hidden';
  if (!STATE.paused && visible) {
    const sim = STATE.sim; sim.t += dt;
    if (STATE.model.meeting && (!sim.meeting || sim.meeting.reason !== 'ia')) { sim.meeting = null; startMeeting('ia'); }
    if (!sim.meeting && sim.nextMeeting && ts > sim.nextMeeting) startMeeting('rutina');
    if (!sim.nextMeeting) sim.nextMeeting = ts + 150000;
    stepMeeting(ts);
    for (const a of sim.agents) stepAgent(a, dt, ts);
  }
  if (visible && ts - STATE.lastDraw > 40) { draw(ts); STATE.lastDraw = ts; tickClock(); }
  STATE.raf = requestAnimationFrame(loop);
}

// ---------- Paneles ----------
function chips() {
  const m = STATE.model, el = STATE.root.querySelector('[data-hqo-chips]'); if (!el) return;
  const list = [];
  for (const l of STATE.locales.slice(0, 4)) { const bad = l.pendientes > 0 || l.reclamos_pendientes > 0; list.push(['<i></i>' + esc(l.nombre) + ': ' + (bad ? plural(l.pendientes, 'sin abrir', 'sin abrir') + (l.reclamos_pendientes ? ' · ' + l.reclamos_pendientes + ' reclamo' : '') : 'al día'), bad ? 'bad' : 'ok']); }
  if (!STATE.locales.length) list.push(['<i></i>' + (m.pulseError ? 'Pulso sin conectar' : 'Consultando locales'), 'warn']);
  const check = m.support?.checks?.[0];
  if (check) { const al = /^ALERTA/i.test(String(check.conclusion || '')), rv = /^(REVISAR|VERIFICACI)/i.test(String(check.conclusion || '')); list.push(['<i></i>Sitio: ' + (al ? 'alerta' : rv ? 'revisar' : 'en línea'), al ? 'bad' : rv ? 'warn' : 'ok']); }
  const jor = m.pulse?.jornada; if (jor) list.push(['<i></i>Jornada diaria: ' + (jor.activa ? 'activa' : 'pausada'), jor.activa ? 'ok' : 'warn']);
  list.push(['<i></i>IA: ' + (m.aiReady === true ? 'lista' : m.aiReady === false ? 'no disponible' : 'sin verificar') + (m.quota ? ' · ' + m.quota.remaining + '/' + (m.quota.limit || 30) + ' hoy' : ''), m.aiReady === true ? 'ok' : 'warn']);
  el.innerHTML = list.map(([t, k]) => '<span class="hqo-chip ' + k + '">' + t + '</span>').join('');
}

function kpi(v, label, cls = '') { return '<div class="hqo-kpi ' + cls + '"><strong>' + esc(v) + '</strong><span>' + esc(label) + '</span></div>'; }

function renderPanels() {
  if (!STATE) return;
  chips();
  const m = STATE.model, ideas = STATE.ideas.filter(i => !STATE.prefs.dismissed.has(i.id));
  const tasks = Array.isArray(m.tasks) ? m.tasks : [], runs = Array.isArray(m.runs) ? m.runs : [];
  const runOf = id => runs.find(r => r.task_id === id);
  const cols = {pend: [], work: [], review: [], done: []};
  for (const t of tasks) { const r = runOf(t.id); if (t.status !== 'pendiente') cols.done.push(t); else if (r?.state === 'working') cols.work.push(t); else if (r?.state === 'review' || r?.state === 'error') cols.review.push(t); else cols.pend.push(t); }
  STATE.kanbanCounts = [cols.pend.length, cols.work.length + cols.review.length, cols.done.length];
  const count = (k, n) => { const b = STATE.root.querySelector('[data-hqo-count="' + k + '"]'); if (b) { b.hidden = !n; b.textContent = n; } };
  count('ideas', ideas.length); count('proyectos', cols.pend.length + cols.work.length + cols.review.length);
  count('reportes', STATE.insights.filter(i => i.level >= 3).length);
  const panel = STATE.root.querySelector('[data-hqo-panel="' + STATE.tab + '"]');
  if (STATE.tab === 'oficina') { renderFeed(); return; }
  let html = '';
  if (STATE.tab === 'reportes') {
    html += '<div class="hqo-grid wide">';
    if (!STATE.locales.length) html += '<div class="hqo-box"><h3>Locales</h3><p class="hqo-empty">' + esc(m.pulseError || 'Consultando el pulso de los locales…') + '</p></div>';
    for (const l of STATE.locales) {
      const conv = Number(l.conv_7d) || 0, ped = Number(l.ped_7d) || 0, rate = conv ? Math.round(Math.min(ped, conv) / conv * 100) + '%' : '—';
      const own = STATE.insights.filter(i => i.local && (i.local === localLabel(l) || i.local.includes(l.nombre)));
      html += '<div class="hqo-box"><h3>' + esc(localLabel(l)) + '</h3><small class="hqo-empty">GESTLOK Chat · ' + (l.ia_activa ? 'IA activa' : 'IA apagada') + '</small><div class="hqo-kpis">' +
        kpi(l.pendientes || 0, 'sin abrir', l.pendientes ? 'bad' : 'good') + kpi(l.ped_hoy || 0, 'pedidos hoy') + kpi(l.conv_hoy || 0, 'charlas hoy') +
        kpi(ped, 'pedidos 7 d') + kpi(rate, 'conversión 7 d') + kpi(l.ticket_7d ? money(l.ticket_7d) : '—', 'ticket 7 d') +
        kpi(l.min_confirmacion_7d == null ? '—' : Number(l.min_confirmacion_7d) < 1 ? '<1 min' : Math.round(l.min_confirmacion_7d) + ' min', 'confirmación') + kpi(l.reclamos_pendientes || 0, 'reclamos', l.reclamos_pendientes ? 'bad' : '') + kpi(l.productos_agotados || 0, 'agotados', l.productos_agotados ? 'bad' : '') + '</div>' +
        (own.length ? own.map(i => '<div class="hqo-line">' + img(BY_ID[i.agent], 22) + '<span>' + esc(i.text) + '</span></div>').join('') : '<p class="hqo-empty">Sin novedades para este local.</p>') + '</div>';
    }
    const plat = m.pulse && typeof m.pulse.plataforma === 'object' ? m.pulse.plataforma : null;
    if (plat) {
      const n = k => Number(plat[k]) || 0;
      html += '<div class="hqo-box" data-hqo-soporte-general><h3>Soporte general · GESTLOK</h3><small class="hqo-empty">Lucas revisa la plataforma: solo cantidades, sin datos personales.</small><div class="hqo-kpis">' +
        kpi(n('altas_pendientes'), 'altas pendientes', n('altas_pendientes') ? 'bad' : 'good') + kpi(n('gerentes_pendientes'), 'gerentes esperando', n('gerentes_pendientes') ? 'bad' : '') +
        kpi(n('mensajes_web_sin_leer'), 'mensajes web sin leer', n('mensajes_web_sin_leer') ? 'bad' : 'good') + kpi(n('suscripciones_en_mora'), 'suscripciones en mora', n('suscripciones_en_mora') ? 'bad' : '') +
        kpi(n('empresas_chat'), 'empresas con Chat') + kpi(n('locales_activos'), 'locales activos') + kpi(n('locales_sin_carta'), 'locales sin carta', n('locales_sin_carta') ? 'bad' : '') + '</div></div>';
    }
    html += '</div>';
    const canales = Array.isArray(m.pulse?.difusion) ? m.pulse.difusion : [];
    if (canales.length) {
      const label = {pendiente: 'Pendiente', publicado: 'Publicado', descartado: 'Descartado'};
      html += '<h3 style="margin:16px 0 8px">Difusión de GESTLOK Chat · dónde publicar</h3><p class="hqo-empty" style="margin:0 0 8px">Mapa de Valentina: sitios verificados y gratuitos. Publicar lo hacés vos; acá marcás cómo va.</p><div class="hqo-box" data-hqo-difusion>';
      for (const c of canales) {
        const url = /^https:\/\//.test(String(c.url || '')) ? String(c.url) : '';
        const st = label[c.estado] ? c.estado : 'pendiente';
        html += '<div class="hqo-line hqo-canal"><span class="hqo-tag ' + (st === 'publicado' ? 'dato' : st === 'descartado' ? 'anim' : 'tarea') + '">' + label[st] + '</span><span class="hqo-canal-txt"><strong>' +
          (url ? '<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + esc(c.nombre) + '</a>' : esc(c.nombre)) + '</strong> · ' + esc(c.tipo || '') + ' · ' + esc(c.costo || 'Gratis') +
          (Number(c.prioridad) === 1 ? ' · <b>prioridad alta</b>' : '') + '<br>' + esc(c.como || '') + '</span><span class="hqo-canal-act">' +
          (st !== 'publicado' ? '<button type="button" class="hqo-btn" data-hqo-canal="' + esc(c.id) + '" data-hqo-estado="publicado">Marcar publicado</button>' : '') +
          (st !== 'descartado' ? '<button type="button" class="hqo-btn" data-hqo-canal="' + esc(c.id) + '" data-hqo-estado="descartado">Descartar</button>' : '') +
          (st !== 'pendiente' ? '<button type="button" class="hqo-btn" data-hqo-canal="' + esc(c.id) + '" data-hqo-estado="pendiente">Volver a pendiente</button>' : '') + '</span></div>';
      }
      html += '</div>';
    }
    html += '<h3 style="margin:16px 0 8px">Informe de cada sector</h3><div class="hqo-grid">';
    for (const p of TEAM) {
      const own = STATE.insights.filter(i => i.agent === p.id), rs = realState(p.id, m);
      const lastRun = runs.filter(r => tasks.some(t => t.id === r.task_id && t.agent === p.id) && r.state === 'review' && r.result)[0];
      html += '<div class="hqo-box"><div class="hqo-member" style="grid-template-columns:44px 1fr">' + img(p, 44) + '<div><h3 style="margin:0">' + esc(p.name) + '</h3><small class="hqo-empty">' + esc(p.puesto) + '</small></div></div>' +
        '<p style="color:' + rs.color + ';font-weight:700;margin:8px 0 4px">● ' + esc(rs.text) + '</p>' +
        (own.length ? own.map(i => '<div class="hqo-line"><span class="hqo-tag ' + (i.level >= 3 ? 'alerta' : i.basis === 'ia' ? 'ia' : i.basis === 'tarea' ? 'tarea' : 'dato') + '">' + (i.level >= 3 ? 'Alerta' : i.basis === 'ia' ? 'IA' : i.basis === 'tarea' ? 'Tarea' : 'Dato') + '</span><span>' + esc(i.text) + '</span></div>').join('') : '<p class="hqo-empty">Sin novedades en su área.</p>') +
        (lastRun ? '<h4>Último informe de IA</h4><p style="white-space:pre-wrap;margin:0;font-size:12.5px">' + esc(String(lastRun.result).slice(0, 420)) + (String(lastRun.result).length > 420 ? '…' : '') + '</p>' : '') + '</div>';
    }
    html += '</div>';
  } else if (STATE.tab === 'ideas') {
    html += '<p class="hqo-empty" style="margin:0 0 10px">Pizarra del equipo. <span class="hqo-tag dato">Dato real</span> sale de los números de los locales, <span class="hqo-tag ia">IA</span> de un informe registrado y <span class="hqo-tag">Propuesta</span> es una idea del equipo para evaluar. Al convertirla en tarea, se carga en el formulario para que la revises antes de guardarla.</p><div class="hqo-grid">';
    if (!ideas.length) html += '<p class="hqo-empty">La pizarra está vacía.</p>';
    for (const i of ideas) {
      const p = BY_ID[i.agent] || TEAM[0], sent = STATE.prefs.sent.has(i.id);
      const voters = TEAM.filter((q, k) => q.id !== p.id && ((i.id.length + k * 7) % 3 === 0)).slice(0, 4);
      html += '<div class="hqo-note ' + esc(i.source) + '"><div style="display:flex;gap:6px;align-items:center">' + img(p, 24) + '<strong>' + esc(p.name) + '</strong><span class="hqo-tag ' + (i.source === 'dato' ? 'dato' : i.source === 'ia' ? 'ia' : '') + '">' + (i.source === 'dato' ? 'Dato real' : i.source === 'ia' ? 'IA' : 'Propuesta') + '</span></div><p>' + esc(i.text) + '</p><small>Base: ' + esc(i.basis) + '</small>' +
        (voters.length ? '<div class="hqo-votes" title="Compañeros que la apoyan (animación)">' + voters.map(v => img(v, 18)).join('') + '<small style="margin-left:4px">la apoyan</small></div>' : '') +
        '<div class="row" style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap"><button type="button" class="hqo-btn primary" data-hqo-idea="' + esc(i.id) + '">' + (sent ? 'Volver a cargar' : 'Convertir en tarea') + '</button><button type="button" class="hqo-btn" data-hqo-dismiss="' + esc(i.id) + '">Descartar</button></div></div>';
    }
    html += '</div>';
  } else if (STATE.tab === 'proyectos') {
    const card = t => { const p = BY_ID[t.agent] || TEAM[0], r = runOf(t.id); return '<div class="hqo-task"><div style="display:flex;gap:6px;align-items:center">' + img(p, 20) + '<strong>' + esc(p.name) + '</strong>' + (r?.state === 'error' ? '<span class="hqo-tag alerta">Error</span>' : '') + '</div>' + esc(String(t.instruction || '').replace(/^Alcance: [^\n]*\n/, '').slice(0, 160)) + '<small>' + new Date(t.created_at).toLocaleDateString('es-AR', {timeZone: TZ}) + (t.parent_task_id ? ' · misión de Alex' : '') + '</small></div>'; };
    html += '<div class="hqo-kanban">' + [['pend', 'Por iniciar'], ['work', 'En curso'], ['review', 'Para revisar'], ['done', 'Cerrados']].map(([k, label]) => '<div class="hqo-col"><h3>' + label + '<span>' + cols[k].length + '</span></h3>' + (cols[k].slice(0, 12).map(card).join('') || '<p class="hqo-empty" style="margin:4px">Nada por acá.</p>') + '</div>').join('') + '</div><p class="hqo-empty">Las tareas se inician y aprueban en el Centro de control, más abajo. Nada se ejecuta solo.</p>';
  } else if (STATE.tab === 'equipo') {
    html += '<div class="hqo-grid">';
    for (const p of TEAM) {
      const a = STATE.sim.agents.find(x => x.id === p.id), rs = realState(p.id, m);
      const mine = tasks.filter(t => t.agent === p.id), done = mine.filter(t => t.status === 'cerrada').length, reports = runs.filter(r => r.state === 'review' && mine.some(t => t.id === r.task_id)).length;
      const xp = done * 25 + reports * 15, level = 1 + Math.floor(xp / 60);
      html += '<div class="hqo-box"><div class="hqo-member"><canvas data-hqo-portrait="' + p.id + '" width="60" height="60"></canvas><div><h3 style="margin:0">' + esc(p.name) + ' <small class="hqo-empty">· ' + esc(p.animal) + '</small></h3><strong style="font-size:13px">' + esc(p.puesto) + '</strong><p style="margin:4px 0;color:#5b6f84;font-size:12.5px">' + esc(p.foco) + '</p></div></div>' +
        '<p style="margin:8px 0 2px;color:' + rs.color + ';font-weight:700">● ' + esc(rs.text) + '</p><p style="margin:0;font-size:12.5px">Ahora: ' + esc(a?.label || '') + '</p>' +
        '<p style="margin:8px 0 0;font-size:12px">Nivel ' + level + ' · ' + xp + ' XP <small class="hqo-empty">(tareas reales cerradas e informes)</small></p><div class="hqo-bar"><span style="width:' + (xp % 60) / 60 * 100 + '%"></span></div>' +
        (m.quota?.caps ? '<p style="margin:6px 0 0;font-size:12px">IA hoy: ' + (m.quota.perAgent?.[p.id] || 0) + ' de ' + m.quota.caps[p.id] + ' consultas <small class="hqo-empty">(límite diario del plan gratuito)</small></p><div class="hqo-bar"><span style="width:' + Math.min(100, (m.quota.perAgent?.[p.id] || 0) / m.quota.caps[p.id] * 100) + '%;background:#5fa8e8"></span></div>' : '') +
        '<p style="margin:6px 0 0;font-size:12px">Energía (animación)</p><div class="hqo-bar"><span style="width:' + Math.round(a?.energy || 0) + '%;background:#ffb35c"></span></div>' +
        '<div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap"><button type="button" class="hqo-btn primary" data-hqo-assign="' + p.id + '">Asignar tarea</button><button type="button" class="hqo-btn" data-hqo-pick="' + p.id + '">Ver en la oficina</button><button type="button" class="hqo-btn" data-hqo-private="' + p.id + '">Su oficina</button></div></div>';
    }
    html += '</div>';
  }
  panel.innerHTML = html;
  panel.querySelectorAll('canvas[data-hqo-portrait]').forEach(cv => { const p = BY_ID[cv.dataset.hqoPortrait]; const c = cv.getContext('2d'); c.imageSmoothingEnabled = false; c.clearRect(0, 0, 60, 60); c.save(); c.scale(3, 3); drawCreature(c, p, {x: 10, y: 19, t: STATE.sim.t, seed: 0, dir: 'down'}); c.restore(); });
}

// ---------- API pública ----------
export function update(model = {}) {
  if (!STATE) return;
  const prevAlerts = new Set(STATE.insights.filter(i => i.level >= 3).map(i => i.id));
  STATE.model = model; STATE.focus = model.focus || null;
  STATE.locales = (model.pulse?.sucursales || []).filter(l => l.activa && l.habilitada !== false)
    .sort((a, b) => (Number(b.conv_7d) || 0) + (Number(b.ped_7d) || 0) * 3 - (Number(a.conv_7d) || 0) - (Number(a.ped_7d) || 0) * 3);
  STATE.insights = buildInsights(model);
  STATE.ideas = buildIdeas(STATE.insights, model);
  for (const i of STATE.insights) if (i.level >= 3 && i.basis !== 'resumen' && !prevAlerts.has(i.id) && !STATE.sim.said.has(i.id)) {
    STATE.sim.said.add(i.id);
    const a = STATE.sim.agents.find(x => x.id === i.agent);
    if (a) say(a, i.text, 'alerta', 6500);
  }
  for (const r of model.runs || []) {
    const key = 'run-' + r.task_id + '-' + r.state; if (STATE.sim.said.has(key)) continue; STATE.sim.said.add(key);
    if (!STATE.booted) continue;
    const task = (model.tasks || []).find(t => t.id === r.task_id); const a = task && STATE.sim.agents.find(x => x.id === task.agent);
    if (a && r.state === 'review') { say(a, '¡Listo! Mi informe ya está en tu bandeja.', 'ia', 6000); a.jumpUntil = performance.now() + 3000; }
    if (a && r.state === 'error') say(a, 'Uy, la ejecución terminó con error. Te dejé el motivo.', 'ia', 6000);
    if (a && r.state === 'working') say(a, 'Arranco con tu tarea usando la IA.', 'ia', 5000);
  }
  STATE.booted = true;
  renderPanels();
}

export function attach(slot, model, handlers = {}) {
  if (!slot) return null;
  if (!ROOT) ROOT = build();
  STATE.handlers = handlers;
  if (ROOT.parentNode !== slot) { slot.replaceChildren(ROOT); }
  update(model);
  if (!STATE.raf) { STATE.last = 0; STATE.raf = requestAnimationFrame(loop); }
  return ROOT;
}

export function select(id) { if (STATE && BY_ID[id]) STATE.selected = id; }
export const __test = {MAP, blocked, findPath, FURNITURE, MEETING_SEATS, SPOTS, ruleDayMatch};

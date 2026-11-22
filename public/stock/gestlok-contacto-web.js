/* Mensajes web: bandeja de la creadora con los mensajes del formulario de Contacto de
   gestlok.com.ar. Solo la creadora: las funciones gestlok_contacto_* del servidor rechazan
   cualquier otra cuenta (verifican administradora, email kmu15lopez@gmail.com y confirmación). */
(() => {
  'use strict';
  let api = null, filas = null, cargando = false, error = '', filtro = 'todos', borrando = '', ocupado = '';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const sb = () => window.GestLokSupabase;
  const permitido = () => !!(api?.isCreadora?.() && sb());
  const fecha = iso => {
    const d = new Date(iso);
    return Number.isFinite(d.getTime()) ? d.toLocaleString('es-AR', {day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'}) : '';
  };
  const ico = (p, s = 18) => '<svg aria-hidden="true" width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + p + '</svg>';

  function estilos() {
    if (document.getElementById('gl-cw-estilos')) return;
    const st = document.createElement('style');
    st.id = 'gl-cw-estilos';
    st.textContent =
      '.gl-cw-head{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px}' +
      '.gl-cw-head h2{margin:0}.gl-cw-head p{margin:4px 0 0;color:#4a6073}' +
      '.gl-cw-tools{display:flex;flex-wrap:wrap;gap:8px;margin:16px 0}' +
      '.gl-cw-chip{min-height:40px;padding:0 14px;border:1px solid #c9d6e1;border-radius:999px;background:#fff;color:#102a3e;font-weight:600;cursor:pointer}' +
      '.gl-cw-chip[aria-pressed="true"]{background:#102a3e;border-color:#102a3e;color:#fff}' +
      '.gl-cw-list{display:flex;flex-direction:column;gap:12px}' +
      '.gl-cw-msg{border:1px solid #dce6ee;border-radius:14px;padding:16px;background:#fff;display:flex;flex-direction:column;gap:10px}' +
      '.gl-cw-msg.gl-cw-nuevo{border-color:#3cc8bd;box-shadow:inset 4px 0 0 #3cc8bd}' +
      '.gl-cw-top{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:6px 12px}' +
      '.gl-cw-top b{font-size:16px;color:#102a3e}.gl-cw-top time{font-size:13px;color:#4a6073}' +
      '.gl-cw-badge{display:inline-block;margin-left:8px;padding:2px 8px;border-radius:999px;background:#e5f4f4;color:#0a5f62;font-size:12px;font-weight:700;vertical-align:middle}' +
      '.gl-cw-datos{display:flex;flex-wrap:wrap;gap:6px 16px;font-size:14px}.gl-cw-datos a{color:#0e7c80;overflow-wrap:anywhere}' +
      '.gl-cw-texto{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;color:#1d3a52;line-height:1.5}' +
      '.gl-cw-acc{display:flex;flex-wrap:wrap;gap:8px}' +
      '.gl-cw-acc a,.gl-cw-acc button{display:inline-flex;align-items:center;gap:6px;min-height:40px;padding:0 12px;border-radius:10px;border:1px solid #c9d6e1;background:#fff;color:#102a3e;font-weight:600;font-size:14px;text-decoration:none;cursor:pointer}' +
      '.gl-cw-acc .gl-cw-resp{background:#0e7c80;border-color:#0e7c80;color:#fff}' +
      '.gl-cw-acc .gl-cw-peligro{color:#9b1c2c;border-color:#e2b4bb}' +
      '.gl-cw-acc button:disabled{opacity:.6;cursor:progress}' +
      '.gl-cw-vacio{padding:24px;border:1px dashed #c9d6e1;border-radius:14px;color:#4a6073;text-align:center}' +
      '.gl-cw-error{padding:12px;border-radius:10px;background:#fdecee;color:#7a1a26}';
    document.head.appendChild(st);
  }

  async function cargar(forzar) {
    if (!permitido() || cargando || (filas && !forzar)) return;
    cargando = true; error = '';
    try {
      const {data, error: e} = await sb().rpc('gestlok_contacto_listar', {p_limite: 300});
      if (e) throw e;
      filas = Array.isArray(data) ? data : [];
    } catch {
      error = 'No se pudieron cargar los mensajes. Revisá la conexión y probá de nuevo.';
      if (!filas) filas = [];
    } finally { cargando = false; api?.render?.(); }
  }

  async function marcar(id, leido) {
    ocupado = id; api?.render?.();
    try {
      const {error: e} = await sb().rpc('gestlok_contacto_marcar', {p_id: id, p_leido: leido});
      if (e) throw e;
      filas = (filas || []).map(f => f.id === id ? {...f, leido} : f);
    } catch { api?.toast?.('No se pudo actualizar el mensaje.'); }
    finally { ocupado = ''; api?.render?.(); }
  }

  async function borrar(id) {
    ocupado = id; api?.render?.();
    try {
      const {error: e} = await sb().rpc('gestlok_contacto_borrar', {p_id: id});
      if (e) throw e;
      filas = (filas || []).filter(f => f.id !== id);
      api?.toast?.('Mensaje borrado.');
    } catch { api?.toast?.('No se pudo borrar el mensaje.'); }
    finally { ocupado = ''; borrando = ''; api?.render?.(); }
  }

  const noLeidos = () => (filas || []).filter(f => !f.leido).length;

  function tarjeta(f) {
    const asunto = encodeURIComponent('GESTLOK · Respuesta a tu consulta');
    const cuerpo = encodeURIComponent('Hola ' + String(f.nombre || '').split(' ')[0] + ':\n\n\n\n— Tu mensaje del ' + fecha(f.creado) + ':\n' + String(f.mensaje || '').slice(0, 600));
    const tel = String(f.telefono || '').replace(/[^0-9+]/g, '');
    const busy = ocupado === f.id ? ' disabled' : '';
    const acciones = borrando === f.id
      ? '<span>¿Borrar este mensaje?</span><button type="button" class="gl-cw-peligro" data-cw-act="borrar-si" data-cw-id="' + esc(f.id) + '"' + busy + '>Sí, borrar</button>' +
        '<button type="button" data-cw-act="borrar-no">Cancelar</button>'
      : '<a class="gl-cw-resp" href="mailto:' + esc(f.email) + '?subject=' + asunto + '&amp;body=' + cuerpo + '">' + ico('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>') + 'Responder por email</a>' +
        '<button type="button" data-cw-act="' + (f.leido ? 'no-leido' : 'leido') + '" data-cw-id="' + esc(f.id) + '"' + busy + '>' + (f.leido ? 'Marcar como no leído' : 'Marcar como leído') + '</button>' +
        '<button type="button" class="gl-cw-peligro" data-cw-act="borrar" data-cw-id="' + esc(f.id) + '">Borrar</button>';
    return '<article class="gl-cw-msg' + (f.leido ? '' : ' gl-cw-nuevo') + '">' +
      '<div class="gl-cw-top"><b>' + esc(f.nombre) + (f.leido ? '' : '<span class="gl-cw-badge">Nuevo</span>') + '</b><time>' + esc(fecha(f.creado)) + '</time></div>' +
      '<div class="gl-cw-datos"><a href="mailto:' + esc(f.email) + '">' + esc(f.email) + '</a>' +
      (tel ? '<a href="tel:' + esc(tel) + '">' + esc(f.telefono) + '</a>' : '') + '</div>' +
      '<p class="gl-cw-texto">' + esc(f.mensaje) + '</p>' +
      '<div class="gl-cw-acc">' + acciones + '</div></article>';
  }

  function view() {
    if (!permitido()) return '<section class="gl-admin-card"><p role="status">Solo la creadora puede ver los mensajes de la web.</p></section>';
    estilos();
    if (!filas && !cargando) queueMicrotask(() => cargar());
    const lista = (filas || []).filter(f => filtro === 'todos' || !f.leido);
    const n = noLeidos();
    const cuerpo = !filas ? '<p role="status">Cargando mensajes…</p>'
      : lista.length ? '<div class="gl-cw-list">' + lista.map(tarjeta).join('') + '</div>'
      : '<p class="gl-cw-vacio">' + (filtro === 'todos' ? 'Todavía no llegaron mensajes desde gestlok.com.ar.' : 'No hay mensajes sin leer.') + '</p>';
    return '<section class="gl-admin-card" aria-label="Mensajes web">' +
      '<header class="gl-cw-head"><div><h2>Mensajes de la web</h2><p>Lo que escriben en Contacto de gestlok.com.ar. ' +
      (filas ? (n ? n + (n === 1 ? ' sin leer.' : ' sin leer.') : 'Todo leído.') : '') + '</p></div>' +
      '<button type="button" class="gl-cw-chip" data-cw-act="actualizar"' + (cargando ? ' disabled' : '') + '>' + (cargando ? 'Actualizando…' : 'Actualizar') + '</button></header>' +
      (error ? '<p class="gl-cw-error" role="alert">' + esc(error) + '</p>' : '') +
      '<div class="gl-cw-tools" role="group" aria-label="Filtrar mensajes">' +
      '<button type="button" class="gl-cw-chip" data-cw-act="filtro" data-cw-f="todos" aria-pressed="' + (filtro === 'todos') + '">Todos (' + (filas || []).length + ')</button>' +
      '<button type="button" class="gl-cw-chip" data-cw-act="filtro" data-cw-f="sin-leer" aria-pressed="' + (filtro === 'sin-leer') + '">Sin leer (' + n + ')</button></div>' +
      cuerpo + '</section>';
  }

  document.addEventListener('click', ev => {
    const b = ev.target.closest?.('[data-cw-act]');
    if (!b || !permitido()) return;
    const act = b.dataset.cwAct, id = b.dataset.cwId || '';
    if (act === 'actualizar') void cargar(true);
    else if (act === 'filtro') { filtro = b.dataset.cwF === 'sin-leer' ? 'sin-leer' : 'todos'; api?.render?.(); }
    else if (act === 'leido' || act === 'no-leido') void marcar(id, act === 'leido');
    else if (act === 'borrar') { borrando = id; api?.render?.(); }
    else if (act === 'borrar-no') { borrando = ''; api?.render?.(); }
    else if (act === 'borrar-si') void borrar(id);
  });

  window.GestLokContactoWeb = Object.freeze({
    attach(ctx) { api = ctx; },
    view,
    refresh: () => cargar(true),
    prefetch: () => cargar(false),
    unread: () => (filas ? noLeidos() : 0)
  });
})();

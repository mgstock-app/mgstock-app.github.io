/* NFC y QR · panel exclusivo de la creadora (pestaña «NFC y QR» de su inicio).
   Cada placa tiene un link fijo (https://gestlok.com.ar/r/?CODIGO) que va impreso en el QR y grabado en el chip NFC.
   El destino se cambia desde acá sin volver a imprimir ni a grabar la placa.
   Los datos los entregan las funciones gestlok_nfc_*, que el servidor limita a la creadora verificada.
   No pertenece a ninguna empresa ni local: no toca datos de Mi Gusto, Munro ni Torcuato. */
(() => {
  'use strict';
  const LINK = 'https://gestlok.com.ar/r/?';
  const URL_RE = /^https?:\/\/[^\s<>"]+$/i;
  let api = null, data = null, status = 'idle', busy = false, loadError = '';
  let filter = 'todas', query = '', editing = '', draft = null, saving = false, creating = false;
  let openQr = '', fbOpen = false, fbDraft = '', fbSaving = false, nfcBusy = '';
  const qrCache = new Map();

  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const pad = n => String(Math.trunc(num(n))).padStart(3, '0');
  const link = code => LINK + code;
  const creator = () => { try { return !!api?.isCreadora?.(); } catch { return false; } };
  const sb = () => window.GestLokSupabase;
  const toast = m => { try { api?.toast?.(m); } catch { /* sin aviso visual */ } };
  const render = () => { try { api?.render?.(); } catch { /* el panel se vuelve a dibujar en la próxima acción */ } };
  const canNfc = () => typeof window.NDEFReader === 'function';
  const plural = (n, a, b) => num(n) + ' ' + (num(n) === 1 ? a : b);
  function ago(iso) {
    const t = Date.parse(iso); if (!Number.isFinite(t)) return '';
    const m = Math.max(0, Math.round((Date.now() - t) / 60000));
    if (m < 2) return 'recién';
    if (m < 60) return 'hace ' + m + ' min';
    const h = Math.round(m / 60); if (h < 24) return 'hace ' + h + ' h';
    const d = Math.round(h / 24); return 'hace ' + d + (d === 1 ? ' día' : ' días');
  }
  function errText(e, fallback) {
    const m = String(e?.message || '');
    if (/Acceso exclusivo|42501|permission denied/i.test(m) || e?.code === '42501') return 'Solo la cuenta creadora puede usar NFC y QR.';
    if (!m || /fetch|network|Failed|load/i.test(m)) return fallback;
    return m;
  }
  // Acepta «instagram.com/tu-local» y le agrega https:// para no rechazar links pegados sin el comienzo.
  function cleanUrl(v) {
    let s = String(v || '').trim();
    if (s && !/^[a-z][a-z0-9+.-]*:/i.test(s) && /^[\w-]+(\.[\w-]+)+([/?#].*)?$/i.test(s)) s = 'https://' + s;
    return s;
  }

  async function load(force = false) {
    if (!creator() || busy || !sb()?.rpc) return;
    if (!force && status === 'ready') return;
    busy = true;
    if (status !== 'ready') status = 'loading';
    try {
      const {data: d, error} = await sb().rpc('gestlok_nfc_list');
      if (error) throw error;
      if (!d || d.scope !== 'nfc_list' || !Array.isArray(d.placas)) throw Error('');
      data = d; status = 'ready'; loadError = '';
    } catch (e) {
      loadError = errText(e, 'No se pudieron cargar las placas. Revisá la conexión.');
      if (!data) status = 'error';
    } finally { busy = false; render(); }
  }

  function qrSvg(text, px, label) {
    const key = text + '|' + px;
    if (qrCache.has(key)) return qrCache.get(key);
    let out = '';
    try {
      const q = window.qrcode(0, 'M'); q.addData(text); q.make();
      const n = q.getModuleCount(), m = 4, s = n + m * 2;
      let d = '';
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += 'M' + (c + m) + ' ' + (r + m) + 'h1v1h-1z';
      out = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + s + ' ' + s + '" width="' + px + '" height="' + px + '" shape-rendering="crispEdges" role="img" aria-label="' + esc(label || 'Código QR') + '">' +
        '<rect width="' + s + '" height="' + s + '" fill="#fff"/><path d="' + d + '" fill="#111"/></svg>';
    } catch { out = ''; }
    qrCache.set(key, out);
    return out;
  }
  function download(name, content, type) {
    try {
      const url = URL.createObjectURL(new Blob([content], {type}));
      const a = document.createElement('a');
      a.href = url; a.download = name; a.rel = 'noopener';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch { toast('No se pudo descargar el archivo.'); }
  }
  const byCode = code => data?.placas?.find(p => p.code === code) || null;
  function filtered() {
    const all = data?.placas || [];
    return filter === 'activas' ? all.filter(p => p.activa) : filter === 'sin' ? all.filter(p => !p.activa) : all;
  }
  const searchText = p => [pad(p.numero), p.numero, p.code, p.cliente, p.destino, p.nota].join(' ').toLowerCase();
  const matches = p => { const q = query.trim().toLowerCase(); return !q || searchText(p).includes(q); };

  function downloadCsv() {
    const list = filtered();
    if (!list.length) { toast('No hay placas en esta lista.'); return; }
    const cell = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const rows = [['Número', 'Código', 'Link para QR y NFC', 'Cliente', 'Destino', 'Estado', 'Escaneos']]
      .concat(list.map(p => [pad(p.numero), p.code, link(p.code), p.cliente, p.destino || '', p.activa ? 'Activa' : 'Sin activar', num(p.escaneos)]));
    download('placas-nfc-qr.csv', '﻿' + rows.map(r => r.map(cell).join(';')).join('\r\n'), 'text/csv;charset=utf-8');
  }
  function downloadQr(code) {
    const p = byCode(code); if (!p) return;
    const svg = qrSvg(link(code), 1024, 'QR placa ' + pad(p.numero));
    if (!svg) { toast('No se pudo generar el QR.'); return; }
    download('qr-placa-' + pad(p.numero) + '-' + code + '.svg', '<?xml version="1.0" encoding="UTF-8"?>\n' + svg, 'image/svg+xml');
  }
  function printSheet() {
    const list = filtered().filter(matches);
    if (!list.length) { toast('No hay placas para imprimir.'); return; }
    const cells = list.map(p => '<figure>' + qrSvg(link(p.code), 144, 'QR placa ' + pad(p.numero)) + '<figcaption>N° ' + esc(pad(p.numero)) + ' · ' + esc(p.code) + '</figcaption></figure>').join('');
    const html = '<!doctype html><html lang="es"><head><meta charset="utf-8"><title>QR de placas</title><style>@page{size:A4;margin:12mm}' +
      'body{margin:0;font:11pt system-ui,sans-serif;color:#111}main{display:grid;grid-template-columns:repeat(4,1fr);gap:8mm}' +
      'figure{margin:0;text-align:center;break-inside:avoid}svg{width:38mm;height:38mm}figcaption{margin-top:2mm;letter-spacing:.04em}</style></head>' +
      '<body><main>' + cells + '</main></body></html>';
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true'); frame.tabIndex = -1;
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    document.body.appendChild(frame);
    try {
      const doc = frame.contentDocument; doc.open(); doc.write(html); doc.close();
      setTimeout(() => { try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch { toast('No se pudo abrir la impresión. Descargá los QR de a uno.'); } }, 300);
    } catch { toast('No se pudo abrir la impresión. Descargá los QR de a uno.'); }
    setTimeout(() => frame.remove(), 60000);
  }
  async function copy(code) {
    const t = link(code);
    try { await navigator.clipboard.writeText(t); toast('Link copiado: ' + t); }
    catch { try { window.prompt('Copiá el link de la placa', t); } catch { toast(t); } }
  }
  async function writeNfc(code) {
    if (!canNfc() || nfcBusy) return;
    nfcBusy = code; render();
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = setTimeout(() => ctrl?.abort(), 30000);
    try {
      const writer = new window.NDEFReader();
      await writer.write({records: [{recordType: 'url', data: link(code)}]}, ctrl ? {signal: ctrl.signal, overwrite: true} : {overwrite: true});
      toast('Placa ' + code + ' grabada. Probala acercando un celular.');
    } catch (e) {
      toast(e?.name === 'AbortError' ? 'Pasaron 30 segundos sin detectar la placa. Probá de nuevo.'
        : e?.name === 'NotAllowedError' ? 'El celular no dio permiso para usar NFC. Revisá que esté activado.'
          : 'No se pudo grabar. Apoyá la placa en el centro de la parte de atrás del celular y probá de nuevo.');
    } finally { clearTimeout(timer); nfcBusy = ''; render(); }
  }
  async function create(value) {
    if (creating || !creator()) return;
    const k = Math.trunc(num(value));
    if (k < 1 || k > 200) { toast('Elegí entre 1 y 200 placas.'); return; }
    creating = true; render();
    try {
      const {data: d, error} = await sb().rpc('gestlok_nfc_create', {p_cantidad: k});
      if (error) throw error;
      toast(k === 1 ? 'Placa N° ' + pad(d?.desde) + ' creada.' : 'Placas N° ' + pad(d?.desde) + ' a ' + pad(d?.hasta) + ' creadas.');
      filter = 'todas';
    } catch (e) { toast(errText(e, 'No se pudieron crear las placas.')); }
    finally { creating = false; await load(true); }
  }
  function startEdit(code) {
    const p = byCode(code); if (!p) return;
    editing = code; openQr = '';
    draft = {cliente: p.cliente || '', destino: p.destino || '', nota: p.nota || '', activa: !!p.activa};
    render();
  }
  async function save() {
    if (!editing || saving || !draft) return;
    const dest = cleanUrl(draft.destino);
    draft.destino = dest;
    if (dest && !URL_RE.test(dest)) { toast('El link de destino tiene que empezar con https://'); render(); return; }
    if (draft.activa && !dest) { toast('Para activar la placa cargá el link de destino.'); return; }
    saving = true; render();
    try {
      const {data: row, error} = await sb().rpc('gestlok_nfc_update', {p_code: editing, p_cliente: draft.cliente, p_destino: dest, p_nota: draft.nota, p_activa: !!draft.activa});
      if (error) throw error;
      const i = data.placas.findIndex(p => p.code === row?.code);
      if (i >= 0) data.placas[i] = row;
      toast('Placa N° ' + pad(row?.numero) + (row?.activa ? ' activa: ya lleva a su nuevo destino.' : ' guardada sin activar.'));
      editing = ''; draft = null;
    } catch (e) { toast(errText(e, 'No se pudo guardar la placa.')); }
    finally { saving = false; render(); }
  }
  async function saveFallback() {
    if (fbSaving) return;
    const dest = cleanUrl(fbDraft);
    fbDraft = dest;
    if (!URL_RE.test(dest)) { toast('Cargá un link completo que empiece con https://'); render(); return; }
    fbSaving = true; render();
    try {
      const {data: d, error} = await sb().rpc('gestlok_nfc_set_fallback', {p_destino: dest});
      if (error) throw error;
      data.destino_sin_activar = d; fbOpen = false;
      toast('Listo: las placas sin activar llevan a ' + d);
    } catch (e) { toast(errText(e, 'No se pudo guardar el link.')); }
    finally { fbSaving = false; render(); }
  }

  const ICON = {
    nfc: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="5" y="3" width="10" height="18" rx="2"/><path d="M9 18h2M18 9a4 4 0 0 1 0 6M20.5 7a7.5 7.5 0 0 1 0 10"/></svg>'
  };
  function editForm(p) {
    const d = draft || {};
    return '<form class="gl-nfc-form" data-nfc-form="edit" data-code="' + esc(p.code) + '" novalidate>' +
      '<label>Cliente<input name="cliente" maxlength="120" autocomplete="off" value="' + esc(d.cliente) + '" placeholder="Nombre del local o cliente"></label>' +
      '<label>Link de destino<input name="destino" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="1000" value="' + esc(d.destino) + '" placeholder="https://…"></label>' +
      '<small>Reseñas de Google, Instagram, WhatsApp, menú o tienda: pegá el link completo.</small>' +
      '<label>Nota (solo la ves vos)<input name="nota" maxlength="300" autocomplete="off" value="' + esc(d.nota) + '" placeholder="Ej.: vendida el 31/10, pagó por transferencia"></label>' +
      '<label class="gl-nfc-check"><input type="checkbox" name="activa"' + (d.activa ? ' checked' : '') + '> Placa activa (si no, lleva al link de placas sin activar)</label>' +
      '<div class="gl-nfc-actions"><button type="submit" class="btn primary"' + (saving ? ' disabled' : '') + '>' + (saving ? 'Guardando…' : 'Guardar') + '</button>' +
      '<button type="button" class="btn" data-nfc-act="cancel">Cancelar</button></div></form>';
  }
  function item(p) {
    const dest = p.activa && p.destino
      ? '<a href="' + esc(p.destino) + '" target="_blank" rel="noopener noreferrer">' + esc(p.destino) + '</a>'
      : '<span>Link de placas sin activar</span>' + (p.destino ? ' <em>(guardado: ' + esc(p.destino) + ')</em>' : '');
    const meta = plural(p.escaneos, 'escaneo', 'escaneos') + ' · ' + num(p.escaneos_30d) + ' en 30 días' + (p.ultimo_escaneo ? ' · último ' + ago(p.ultimo_escaneo) : '');
    const writing = nfcBusy === p.code;
    return '<article class="gl-nfc-item' + (p.activa ? ' on' : '') + '" data-nfc-item data-nfc-text="' + esc(searchText(p)) + '"' + (matches(p) ? '' : ' hidden') + '>' +
      '<header><div class="gl-nfc-id"><b>N° ' + esc(pad(p.numero)) + '</b><code>' + esc(p.code) + '</code></div>' +
      '<span class="gl-nfc-pill ' + (p.activa ? 'on' : 'off') + '">' + (p.activa ? 'Activa' : 'Sin activar') + '</span></header>' +
      '<p class="gl-nfc-client">' + (p.cliente ? esc(p.cliente) : '<span>Sin cliente</span>') + '</p>' +
      '<p class="gl-nfc-dest"><small>Lleva a</small> ' + dest + '</p>' +
      (p.nota ? '<p class="gl-nfc-note">' + esc(p.nota) + '</p>' : '') +
      '<p class="gl-nfc-meta">' + esc(meta) + '</p>' +
      (editing === p.code ? editForm(p) :
        '<div class="gl-nfc-actions">' +
        '<button type="button" class="btn primary" data-nfc-act="edit" data-code="' + esc(p.code) + '">' + (p.activa ? 'Cambiar destino' : 'Activar') + '</button>' +
        '<button type="button" class="btn" data-nfc-act="copy" data-code="' + esc(p.code) + '">Copiar link</button>' +
        '<button type="button" class="btn" data-nfc-act="qr" data-code="' + esc(p.code) + '" aria-expanded="' + (openQr === p.code) + '">QR</button>' +
        (canNfc() ? '<button type="button" class="btn" data-nfc-act="nfc" data-code="' + esc(p.code) + '"' + (nfcBusy ? ' disabled' : '') + '>' + ICON.nfc + (writing ? 'Acercá la placa…' : 'Grabar NFC') + '</button>' : '') +
        '</div>') +
      (openQr === p.code && editing !== p.code ? '<div class="gl-nfc-qrbox">' + qrSvg(link(p.code), 168, 'QR de la placa N° ' + pad(p.numero)) +
        '<div><p><code>' + esc(link(p.code)) + '</code></p><p>Este QR no cambia nunca: si cambiás el destino, la placa impresa sigue sirviendo.</p>' +
        '<button type="button" class="btn" data-nfc-act="qr-download" data-code="' + esc(p.code) + '">Descargar QR (SVG)</button></div></div>' : '') +
      '</article>';
  }
  function view() {
    if (!creator()) return '';
    if (status === 'idle') queueMicrotask(() => load());
    if (!data) {
      return '<section class="gl-admin-card gl-nfc" aria-label="NFC y QR">' + (status === 'error'
        ? '<p role="alert">' + esc(loadError) + '</p><p><button type="button" class="btn" data-nfc-act="reload">Volver a intentar</button></p>'
        : '<p role="status">Cargando placas…</p>') + '</section>';
    }
    const all = data.placas, act = all.filter(p => p.activa).length;
    const scans30 = all.reduce((n, p) => n + num(p.escaneos_30d), 0);
    const list = filtered();
    const shown = list.filter(matches).length;
    const chip = (k, label, n) => '<button type="button" data-nfc-act="filter" data-filter="' + k + '" aria-pressed="' + (filter === k) + '"' + (filter === k ? ' class="on"' : '') + '>' + label + ' <b>' + n + '</b></button>';
    const fb = data.destino_sin_activar || '';
    const intro = '<section class="gl-admin-card gl-nfc" aria-label="NFC y QR">' +
      '<header><h2>NFC y QR</h2><small>Solo la creadora</small></header>' +
      '<p>Cada placa tiene un link fijo. El QR y el chip NFC se graban una sola vez; después elegís acá a dónde lleva, cuantas veces quieras.</p>' +
      '<div class="gl-nfc-stats"><div><b>' + all.length + '</b><small>Placas</small></div><div><b>' + act + '</b><small>Activas</small></div>' +
      '<div><b>' + (all.length - act) + '</b><small>Sin activar</small></div><div><b>' + scans30 + '</b><small>Escaneos en 30 días</small></div></div>' +
      (loadError ? '<p role="alert">' + esc(loadError) + '</p>' : '') + '</section>';
    const tools = '<section class="gl-admin-card gl-nfc" aria-label="Crear placas">' +
      '<header><h2>Crear placas</h2></header>' +
      '<form class="gl-nfc-create" data-nfc-form="create" novalidate><label>Cantidad<input name="cantidad" type="number" inputmode="numeric" min="1" max="200" value="10"></label>' +
      '<button type="submit" class="btn primary"' + (creating ? ' disabled' : '') + '>' + (creating ? 'Creando…' : 'Crear placas') + '</button></form>' +
      '<p><small>Se numeran solas y cada una recibe un código único de 6 letras y números.</small></p>' +
      '<div class="gl-nfc-fallback"><p><b>Placas sin activar llevan a:</b> <a href="' + esc(fb) + '" target="_blank" rel="noopener noreferrer">' + esc(fb) + '</a></p>' +
      (fbOpen ? '<form class="gl-nfc-form" data-nfc-form="fallback" novalidate><label>Link para placas sin activar<input name="destino" inputmode="url" autocapitalize="off" spellcheck="false" maxlength="1000" value="' + esc(fbDraft) + '"></label>' +
        '<div class="gl-nfc-actions"><button type="submit" class="btn primary"' + (fbSaving ? ' disabled' : '') + '>' + (fbSaving ? 'Guardando…' : 'Guardar') + '</button><button type="button" class="btn" data-nfc-act="fb-cancel">Cancelar</button></div></form>'
        : '<button type="button" class="btn" data-nfc-act="fb-edit">Cambiar</button>') + '</div></section>';
    const help = '<details class="gl-admin-card gl-nfc gl-nfc-help"><summary>Cómo grabar el chip NFC</summary><ol>' +
      '<li>En un Android con Chrome, tocá «Grabar NFC» en la placa y apoyala en la parte de atrás del celular.</li>' +
      '<li>En iPhone, o si no ves el botón, tocá «Copiar link» y grabalo con la app NFC Tools: Escribir → Añadir un registro → URL.</li>' +
      '<li>Probala acercando otro celular: tiene que abrir el destino o, si está sin activar, el link de placas sin activar.</li></ol></details>';
    const listCard = '<section class="gl-admin-card gl-nfc" aria-label="Placas">' +
      '<header><h2>Placas</h2><div class="gl-nfc-tools"><button type="button" class="btn" data-nfc-act="csv">Descargar lista</button><button type="button" class="btn" data-nfc-act="print">Imprimir QR</button></div></header>' +
      '<div class="gl-nfc-filters" role="group" aria-label="Filtrar placas">' + chip('todas', 'Todas', all.length) + chip('activas', 'Activas', act) + chip('sin', 'Sin activar', all.length - act) + '</div>' +
      '<label class="gl-nfc-search"><span class="sr-only">Buscar placa</span><input type="search" data-nfc-q value="' + esc(query) + '" placeholder="Buscar por número, código o cliente" autocomplete="off"></label>' +
      '<div class="gl-nfc-list">' + list.map(item).join('') + '</div>' +
      '<p class="gl-nfc-empty" data-nfc-empty' + (shown ? ' hidden' : '') + '>' + (all.length ? 'No hay placas que coincidan.' : 'Todavía no creaste placas. Empezá con «Crear placas».') + '</p></section>';
    return intro + tools + listCard + help;
  }
  function applySearch() {
    let shown = 0;
    document.querySelectorAll('[data-nfc-item]').forEach(el => {
      const q = query.trim().toLowerCase();
      const ok = !q || String(el.dataset.nfcText || '').includes(q);
      el.hidden = !ok; if (ok) shown++;
    });
    const empty = document.querySelector('[data-nfc-empty]');
    if (empty) empty.hidden = shown > 0;
  }

  document.addEventListener('click', ev => {
    const b = ev.target.closest?.('[data-nfc-act]');
    if (!b || !creator()) return;
    ev.preventDefault();
    const code = b.dataset.code || '';
    switch (b.dataset.nfcAct) {
      case 'reload': status = 'idle'; loadError = ''; render(); break;
      case 'filter': filter = ['todas', 'activas', 'sin'].includes(b.dataset.filter) ? b.dataset.filter : 'todas'; render(); break;
      case 'edit': startEdit(code); break;
      case 'cancel': editing = ''; draft = null; render(); break;
      case 'copy': void copy(code); break;
      case 'qr': openQr = openQr === code ? '' : code; render(); break;
      case 'qr-download': downloadQr(code); break;
      case 'nfc': void writeNfc(code); break;
      case 'csv': downloadCsv(); break;
      case 'print': printSheet(); break;
      case 'fb-edit': fbOpen = true; fbDraft = data?.destino_sin_activar || ''; render(); break;
      case 'fb-cancel': fbOpen = false; render(); break;
    }
  });
  document.addEventListener('submit', ev => {
    const f = ev.target.closest?.('form[data-nfc-form]');
    if (!f || !creator()) return;
    ev.preventDefault();
    const kind = f.dataset.nfcForm;
    if (kind === 'create') void create(f.elements.cantidad?.value);
    else if (kind === 'edit') void save();
    else if (kind === 'fallback') void saveFallback();
  });
  function track(ev) {
    const t = ev.target;
    if (t?.matches?.('[data-nfc-q]')) { query = t.value; applySearch(); return; }
    if (draft && t?.closest?.('form[data-nfc-form="edit"]')) {
      if (t.name === 'activa') draft.activa = !!t.checked;
      else if (t.name in draft) draft[t.name] = t.value;
      return;
    }
    if (t?.closest?.('form[data-nfc-form="fallback"]') && t.name === 'destino') fbDraft = t.value;
  }
  document.addEventListener('input', track);
  document.addEventListener('change', track);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && status === 'ready' && !editing && window.GestLokCreatorHome?.tab?.() === 'nfc') void load(true);
  });

  window.GestLokNfcQr = Object.freeze({
    attach(ctx) { api = ctx; },
    view, link, refresh: () => load(true),
    state: () => ({status, placas: data?.placas?.length || 0})
  });
})();

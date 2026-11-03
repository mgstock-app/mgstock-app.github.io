/* NFC y QR · panel exclusivo de la creadora (pestaña «NFC y QR» de su inicio).
   Cada placa tiene un link fijo (https://gestlok.com.ar/r/?CODIGO) que va impreso en el QR y grabado en el chip NFC.
   Comercios y sucursales tienen su propio link: una placa usa su link propio, el de su sucursal o el de su comercio.
   Así el destino se cambia desde acá sin volver a imprimir ni a grabar la placa (de a una o toda una sucursal).
   Las placas de un comercio nunca van al link de Belisa: desactivadas muestran «placa no activa».
   Los datos los entregan las funciones gestlok_nfc_*, que el servidor limita a la creadora verificada.
   No pertenece a ninguna empresa ni local de GESTLOK: no toca datos de Mi Gusto, Munro ni Torcuato. */
(() => {
  'use strict';
  const LINK = 'https://gestlok.com.ar/r/?';
  const URL_RE = /^https?:\/\/[^\s<>"]+$/i;
  const NONE = '__sin__';
  const ORIGEN = {placa: 'link propio', sucursal: 'link de la sucursal', comercio: 'link del comercio'};
  let api = null, data = null, status = 'idle', busy = false, loadError = '';
  let fCom = '', fSuc = '', filter = 'todas', query = '';
  let editing = '', draft = null, saving = false;
  let comForm = null, sucForm = null, formSaving = false;
  let mkCom = '', mkSuc = '', mkAct = false, mkCant = '10', creating = false;
  let reasign = null, actBusy = false;
  let openQr = '', openHist = '', comHist = '';
  let fbOpen = false, fbDraft = '', fbSaving = false, nfcBusy = '';
  const hist = new Map();
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
  const norm = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const ask = m => { try { return typeof window.confirm === 'function' ? window.confirm(m) : true; } catch { return true; } };
  function ago(iso) {
    const t = Date.parse(iso); if (!Number.isFinite(t)) return '';
    const m = Math.max(0, Math.round((Date.now() - t) / 60000));
    if (m < 2) return 'recién';
    if (m < 60) return 'hace ' + m + ' min';
    const h = Math.round(m / 60); if (h < 24) return 'hace ' + h + ' h';
    const d = Math.round(h / 24); return 'hace ' + d + (d === 1 ? ' día' : ' días');
  }
  function fecha(iso) {
    const t = Date.parse(iso); if (!Number.isFinite(t)) return '';
    try {
      return new Date(t).toLocaleString('es-AR', {timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'});
    } catch { return new Date(t).toISOString().slice(0, 16).replace('T', ' '); }
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
  const badUrl = s => !!s && !URL_RE.test(s);

  // ---------- Datos ----------
  const comercios = () => (Array.isArray(data?.comercios) ? data.comercios : []);
  const placas = () => (Array.isArray(data?.placas) ? data.placas : []);
  const comById = id => comercios().find(c => c.id === id) || null;
  const sucById = id => { for (const c of comercios()) { const s = (c.sucursales || []).find(x => x.id === id); if (s) return s; } return null; };
  const byCode = code => placas().find(p => p.code === code) || null;
  const etiqueta = p => p.etiqueta ?? p.cliente ?? '';
  const destEf = p => (p.destino_efectivo !== undefined ? p.destino_efectivo : p.destino) || '';
  const origen = p => p.origen || (p.destino ? 'placa' : '');
  function lugar(p) {
    if (!p.comercio_id) return 'Sin comercio';
    return (comById(p.comercio_id)?.nombre || 'Comercio') + (p.sucursal_id ? ' · ' + (sucById(p.sucursal_id)?.nombre || 'Sucursal') : '');
  }
  function inScope(p) {
    if (fCom === NONE) return !p.comercio_id;
    if (fCom && p.comercio_id !== fCom) return false;
    if (fCom && fSuc && p.sucursal_id !== fSuc) return false;
    return true;
  }
  const scoped = () => placas().filter(inScope);
  function filtered() {
    const l = scoped();
    return filter === 'activas' ? l.filter(p => p.activa) : filter === 'sin' ? l.filter(p => !p.activa) : l;
  }
  const searchText = p => norm([pad(p.numero), p.numero, p.code, lugar(p), etiqueta(p), destEf(p), p.nota].join(' '));
  const matches = p => { const q = norm(query.trim()); return !q || searchText(p).includes(q); };
  const visible = () => filtered().filter(matches);
  const counts = list => ({total: list.length, act: list.filter(p => p.activa).length});

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
      if (fCom && fCom !== NONE && !comById(fCom)) { fCom = ''; fSuc = ''; }
      if (fSuc && !sucById(fSuc)) fSuc = '';
    } catch (e) {
      loadError = errText(e, 'No se pudieron cargar las placas. Revisá la conexión.');
      if (!data) status = 'error';
    } finally { busy = false; render(); }
  }
  async function call(fn, args) {
    const {data: d, error} = await sb().rpc(fn, args);
    if (error) throw error;
    return d;
  }

  // ---------- QR y descargas ----------
  function qrMatrix(text) {
    const q = window.qrcode(0, 'M'); q.addData(text); q.make();
    const n = q.getModuleCount();
    let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += 'M' + c + ' ' + r + 'h1v1h-1z';
    return {q, n, d};
  }
  function qrSvg(text, px, label) {
    const key = text + '|' + px;
    if (qrCache.has(key)) return qrCache.get(key);
    let out = '';
    try {
      const {n, d} = qrMatrix(text), m = 4, s = n + m * 2;
      out = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + s + ' ' + s + '" width="' + px + '" height="' + px + '" shape-rendering="crispEdges" role="img" aria-label="' + esc(label || 'Código QR') + '">' +
        '<rect width="' + s + '" height="' + s + '" fill="#fff"/><path transform="translate(' + m + ' ' + m + ')" d="' + d + '" fill="#111"/></svg>';
    } catch { out = ''; }
    qrCache.set(key, out);
    return out;
  }
  function download(name, content, type) {
    try {
      const blob = content instanceof Blob ? content : new Blob([content], {type});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = name; a.rel = 'noopener';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch { toast('No se pudo descargar el archivo.'); }
  }
  const slug = s => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'placas';
  function scopeName() {
    if (fCom === NONE) return 'sin-comercio';
    const c = comById(fCom); if (!c) return 'todas';
    const s = fSuc ? sucById(fSuc) : null;
    return slug(c.nombre + (s ? ' ' + s.nombre : ''));
  }
  function downloadCsv() {
    const list = visible();
    if (!list.length) { toast('No hay placas en esta lista.'); return; }
    const cell = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const rows = [['Número', 'Código', 'Link para QR y NFC', 'Comercio', 'Sucursal', 'Etiqueta', 'Lleva a', 'Origen del link', 'Estado', 'Escaneos', 'Escaneos en 30 días']]
      .concat(list.map(p => [pad(p.numero), p.code, link(p.code), p.comercio_id ? comById(p.comercio_id)?.nombre || '' : 'Sin comercio',
        p.sucursal_id ? sucById(p.sucursal_id)?.nombre || '' : '', etiqueta(p), p.activa ? destEf(p) : '', p.activa ? ORIGEN[origen(p)] || '' : '',
        p.activa ? 'Activa' : 'Sin activar', num(p.escaneos), num(p.escaneos_30d)]));
    download('placas-' + scopeName() + '.csv', '﻿' + rows.map(r => r.map(cell).join(';')).join('\r\n'), 'text/csv;charset=utf-8');
  }
  function downloadQr(code) {
    const p = byCode(code); if (!p) return;
    const svg = qrSvg(link(code), 1024, 'QR placa ' + pad(p.numero));
    if (!svg) { toast('No se pudo generar el QR.'); return; }
    download('qr-placa-' + pad(p.numero) + '-' + code + '.svg', '<?xml version="1.0" encoding="UTF-8"?>\n' + svg, 'image/svg+xml');
  }
  function downloadPng(code) {
    const p = byCode(code); if (!p) return;
    try {
      const {q, n} = qrMatrix(link(code)), m = 4, s = n + m * 2, px = Math.max(4, Math.floor(1024 / s));
      const cv = document.createElement('canvas'); cv.width = cv.height = s * px;
      const g = cv.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.fillStyle = '#111';
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) g.fillRect((c + m) * px, (r + m) * px, px, px);
      cv.toBlob(b => { if (b) download('qr-placa-' + pad(p.numero) + '-' + code + '.png', b); else toast('No se pudo generar el QR.'); }, 'image/png');
    } catch { toast('No se pudo generar el QR.'); }
  }
  // Una sola imagen SVG con todos los QR de la lista (4 por fila, con número, código y lugar debajo).
  function downloadSheet() {
    const list = visible();
    if (!list.length) { toast('No hay placas en esta lista.'); return; }
    try {
      const cols = Math.min(4, list.length), cw = 300, ch = 330, qs = 240;
      const W = cols * cw, H = Math.ceil(list.length / cols) * ch;
      const cells = list.map((p, i) => {
        const {n, d} = qrMatrix(link(p.code)), m = 4, s = n + m * 2, k = qs / s;
        const x = (i % cols) * cw, y = Math.floor(i / cols) * ch;
        const where = lugar(p) + (etiqueta(p) ? ' · ' + etiqueta(p) : '');
        return '<g transform="translate(' + (x + 30) + ' ' + (y + 16) + ') scale(' + k.toFixed(4) + ')"><rect width="' + s + '" height="' + s + '" fill="#fff"/>' +
          '<path transform="translate(' + m + ' ' + m + ')" d="' + d + '" fill="#111"/></g>' +
          '<text x="' + (x + cw / 2) + '" y="' + (y + qs + 44) + '" font-size="20" font-weight="700" text-anchor="middle">N° ' + esc(pad(p.numero)) + ' · ' + esc(p.code) + '</text>' +
          '<text x="' + (x + cw / 2) + '" y="' + (y + qs + 68) + '" font-size="14" fill="#444" text-anchor="middle">' + esc(where.length > 38 ? where.slice(0, 37) + '…' : where) + '</text>';
      }).join('');
      const svg = '<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" font-family="Arial, Helvetica, sans-serif" shape-rendering="crispEdges">' +
        '<rect width="' + W + '" height="' + H + '" fill="#fff"/>' + cells + '</svg>';
      download('qr-' + scopeName() + '.svg', svg, 'image/svg+xml');
      toast(plural(list.length, 'QR descargado', 'QR descargados') + ' en una sola hoja.');
    } catch { toast('No se pudo generar la hoja de QR.'); }
  }
  function printSheet() {
    const list = visible();
    if (!list.length) { toast('No hay placas para imprimir.'); return; }
    const cells = list.map(p => '<figure>' + qrSvg(link(p.code), 144, 'QR placa ' + pad(p.numero)) + '<figcaption>N° ' + esc(pad(p.numero)) + ' · ' + esc(p.code) +
      '<br><small>' + esc(lugar(p)) + '</small></figcaption></figure>').join('');
    const html = '<!doctype html><html lang="es"><head><meta charset="utf-8"><title>QR de placas</title><style>@page{size:A4;margin:12mm}' +
      'body{margin:0;font:11pt system-ui,sans-serif;color:#111}main{display:grid;grid-template-columns:repeat(4,1fr);gap:8mm}' +
      'figure{margin:0;text-align:center;break-inside:avoid}svg{width:38mm;height:38mm}figcaption{margin-top:2mm;letter-spacing:.04em}small{color:#444;letter-spacing:0}</style></head>' +
      '<body><main>' + cells + '</main></body></html>';
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true'); frame.tabIndex = -1;
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    document.body.appendChild(frame);
    try {
      const doc = frame.contentDocument; doc.open(); doc.write(html); doc.close();
      setTimeout(() => { try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch { toast('No se pudo abrir la impresión. Descargá la hoja de QR.'); } }, 300);
    } catch { toast('No se pudo abrir la impresión. Descargá la hoja de QR.'); }
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

  // ---------- Acciones ----------
  async function create() {
    if (creating || !creator()) return;
    const k = Math.trunc(num(mkCant));
    if (k < 1 || k > 200) { toast('Elegí entre 1 y 200 placas.'); return; }
    creating = true; render();
    try {
      const d = await call('gestlok_nfc_crear_placas', {p_cantidad: k, p_comercio: mkCom || null, p_sucursal: (mkCom && mkSuc) || null, p_activar: !!(mkCom && mkAct)});
      toast((k === 1 ? 'Placa N° ' + pad(d?.desde) + ' creada' : 'Placas N° ' + pad(d?.desde) + ' a ' + pad(d?.hasta) + ' creadas') +
        (mkCom ? ' en ' + (comById(mkCom)?.nombre || 'el comercio') : ' sin comercio') + '.');
      fCom = mkCom || NONE; fSuc = mkCom ? mkSuc : ''; filter = 'todas'; query = '';
    } catch (e) { toast(errText(e, 'No se pudieron crear las placas.')); }
    finally { creating = false; await load(true); }
  }
  function startEdit(code, activar = false) {
    const p = byCode(code); if (!p) return;
    editing = code; openQr = ''; reasign = null; openHist = '';
    draft = {etiqueta: etiqueta(p), destino: p.destino || '', nota: p.nota || '', activa: activar || !!p.activa};
    render();
  }
  async function save() {
    if (!editing || saving || !draft) return;
    const p = byCode(editing); if (!p) return;
    const dest = cleanUrl(draft.destino);
    draft.destino = dest;
    if (badUrl(dest)) { toast('El link tiene que empezar con https://'); render(); return; }
    const heredado = p.comercio_id ? (p.sucursal_id ? sucById(p.sucursal_id)?.destino : null) || comById(p.comercio_id)?.destino : null;
    if (draft.activa && !dest && !heredado) { toast('Para activar la placa cargá un link (o cargalo en su sucursal o comercio).'); return; }
    saving = true; render();
    try {
      const row = await call('gestlok_nfc_update', {p_code: editing, p_cliente: draft.etiqueta, p_destino: dest || null, p_nota: draft.nota, p_activa: !!draft.activa});
      const i = data.placas.findIndex(x => x.code === row?.code);
      if (i >= 0) data.placas[i] = row;
      hist.delete('p:' + editing);
      toast('Placa N° ' + pad(row?.numero) + (row?.activa ? ' activa: ya lleva a su destino.' : ' guardada sin activar.'));
      editing = ''; draft = null;
    } catch (e) { toast(errText(e, 'No se pudo guardar la placa.')); }
    finally { saving = false; render(); }
  }
  async function setActiva(codes, on) {
    if (actBusy || !codes.length) return;
    if (on && codes.length === 1) {
      const p = byCode(codes[0]);
      if (p && !destEf(p)) { startEdit(p.code, true); toast('Cargá el link de destino para activarla.'); return; }
    }
    if (!on && codes.length > 1 && !ask('¿Desactivar ' + codes.length + ' placas? Van a mostrar «placa no activa» hasta que las vuelvas a activar.')) return;
    actBusy = true; render();
    try {
      const d = await call('gestlok_nfc_activar', {p_codes: codes, p_activa: !!on});
      const sin = Array.isArray(d?.sin_link) ? d.sin_link.length : 0;
      toast((on ? plural(d?.cambiadas, 'placa activada', 'placas activadas') : plural(d?.cambiadas, 'placa desactivada', 'placas desactivadas')) +
        (sin ? '. ' + plural(sin, 'placa no tiene', 'placas no tienen') + ' link: cargalo en la placa, su sucursal o su comercio.' : '.'));
      codes.forEach(c => hist.delete('p:' + c));
    } catch (e) { toast(errText(e, 'No se pudo cambiar el estado.')); }
    finally { actBusy = false; await load(true); }
  }
  function startReasign(codes, key) {
    const first = byCode(codes[0]);
    reasign = {codes, key, comercio: (key === 'bulk' ? (fCom !== NONE && fCom) || '' : first?.comercio_id || ''), sucursal: key === 'bulk' ? '' : first?.sucursal_id || ''};
    editing = ''; draft = null; openQr = ''; openHist = '';
    render();
  }
  async function saveReasign() {
    if (!reasign || actBusy) return;
    actBusy = true; render();
    try {
      const d = await call('gestlok_nfc_reasignar', {p_codes: reasign.codes, p_comercio: reasign.comercio || null, p_sucursal: (reasign.comercio && reasign.sucursal) || null});
      const dest = reasign.comercio ? (comById(reasign.comercio)?.nombre || 'el comercio') + (reasign.sucursal ? ' · ' + (sucById(reasign.sucursal)?.nombre || '') : '') : 'Sin comercio';
      toast(plural(d?.movidas, 'placa reasignada', 'placas reasignadas') + ' a ' + dest +
        (num(d?.desactivadas) ? '. ' + plural(d.desactivadas, 'quedó desactivada', 'quedaron desactivadas') + ' porque ahí no hay link.' : '.'));
      reasign.codes.forEach(c => hist.delete('p:' + c));
      reasign = null;
    } catch (e) { toast(errText(e, 'No se pudieron reasignar las placas.')); }
    finally { actBusy = false; await load(true); }
  }
  async function saveCom() {
    if (!comForm || formSaving) return;
    const f = comForm, dest = cleanUrl(f.destino);
    f.destino = dest;
    if (!f.nombre.trim()) { toast('Escribí el nombre del comercio.'); return; }
    if (badUrl(dest)) { toast('El link tiene que empezar con https://'); render(); return; }
    formSaving = true; render();
    try {
      const row = await call('gestlok_nfc_comercio_guardar', {p_id: f.id || null, p_nombre: f.nombre, p_destino: dest || null, p_nota: f.nota || ''});
      toast(f.id ? 'Comercio guardado. Sus placas ya usan los cambios.' : 'Comercio «' + (row?.nombre || f.nombre) + '» creado.');
      if (!f.id && row?.id) { fCom = row.id; fSuc = ''; mkCom = row.id; mkSuc = ''; }
      hist.delete('c:' + (f.id || ''));
      comForm = null;
    } catch (e) { toast(errText(e, 'No se pudo guardar el comercio.')); }
    finally { formSaving = false; await load(true); }
  }
  async function saveSuc() {
    if (!sucForm || formSaving) return;
    const f = sucForm, dest = cleanUrl(f.destino);
    f.destino = dest;
    if (!f.nombre.trim()) { toast('Escribí el nombre de la sucursal.'); return; }
    if (badUrl(dest)) { toast('El link tiene que empezar con https://'); render(); return; }
    formSaving = true; render();
    try {
      const row = await call('gestlok_nfc_sucursal_guardar', {p_id: f.id || null, p_comercio: f.comercio, p_nombre: f.nombre, p_destino: dest || null});
      toast(f.id ? 'Sucursal guardada. Sus placas ya usan el link nuevo.' : 'Sucursal «' + (row?.nombre || f.nombre) + '» creada.');
      hist.delete('c:' + f.comercio);
      sucForm = null;
    } catch (e) { toast(errText(e, 'No se pudo guardar la sucursal.')); }
    finally { formSaving = false; await load(true); }
  }
  async function saveFallback(clear = false) {
    if (fbSaving) return;
    const dest = clear ? '' : cleanUrl(fbDraft);
    fbDraft = dest;
    if (!clear && !URL_RE.test(dest)) { toast('Cargá un link completo que empiece con https://, o tocá «Quitar».'); render(); return; }
    if (clear && !ask('¿Quitar el link general? Las placas sin comercio y sin activar van a mostrar «placa no activa».')) return;
    fbSaving = true; render();
    try {
      const d = await call('gestlok_nfc_set_fallback', {p_destino: dest || null});
      data.destino_sin_activar = d || null; fbOpen = false;
      toast(d ? 'Listo: las placas sin comercio y sin activar llevan a ' + d : 'Listo: las placas sin comercio y sin activar muestran «placa no activa».');
    } catch (e) { toast(errText(e, 'No se pudo guardar el link.')); }
    finally { fbSaving = false; render(); }
  }
  async function loadHist(key, args) {
    hist.set(key, {status: 'loading', items: []}); render();
    try {
      const d = await call('gestlok_nfc_historial', args);
      hist.set(key, {status: 'ready', items: Array.isArray(d) ? d : []});
    } catch (e) { hist.set(key, {status: 'error', error: errText(e, 'No se pudo cargar el historial.'), items: []}); }
    render();
  }

  // ---------- Vista ----------
  const ICON = {
    nfc: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="5" y="3" width="10" height="18" rx="2"/><path d="M9 18h2M18 9a4 4 0 0 1 0 6M20.5 7a7.5 7.5 0 0 1 0 10"/></svg>'
  };
  const btn = (act, label, attrs = '', cls = 'btn') => '<button type="button" class="' + cls + '" data-nfc-act="' + act + '"' + attrs + '>' + label + '</button>';
  const at = (k, v) => ' data-' + k + '="' + esc(v) + '"';
  const extLink = u => '<a href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">' + esc(u) + '</a>';
  function comSelect(name, value, first) {
    return '<select name="' + name + '" data-nfc-sel="' + name + '">' + first +
      comercios().map(c => '<option value="' + esc(c.id) + '"' + (value === c.id ? ' selected' : '') + '>' + esc(c.nombre) + '</option>').join('') + '</select>';
  }
  function sucSelect(name, comId, value, first) {
    const c = comById(comId);
    return '<select name="' + name + '" data-nfc-sel="' + name + '"' + (c ? '' : ' disabled') + '>' + first +
      (c?.sucursales || []).map(s => '<option value="' + esc(s.id) + '"' + (value === s.id ? ' selected' : '') + '>' + esc(s.nombre) + '</option>').join('') + '</select>';
  }
  function histBox(key) {
    const h = hist.get(key);
    if (!h || h.status === 'loading') return '<div class="gl-nfc-hist" role="status">Cargando historial…</div>';
    if (h.status === 'error') return '<div class="gl-nfc-hist" role="alert">' + esc(h.error) + '</div>';
    if (!h.items.length) return '<div class="gl-nfc-hist"><p>Todavía no hay movimientos.</p></div>';
    return '<div class="gl-nfc-hist"><ol>' + h.items.map(x => '<li><time>' + esc(fecha(x.at)) + '</time> ' +
      (x.numero ? '<b>N° ' + esc(pad(x.numero)) + '</b> ' : '') + '<span>' + esc(x.detalle) + '</span></li>').join('') + '</ol></div>';
  }
  function comFormHtml() {
    const f = comForm;
    return '<form class="gl-nfc-form gl-nfc-box" data-nfc-form="com" novalidate>' +
      '<h3>' + (f.id ? 'Editar comercio' : 'Nuevo comercio') + '</h3>' +
      '<label>Nombre<input name="nombre" maxlength="80" autocomplete="off" value="' + esc(f.nombre) + '" placeholder="Ej.: Café del Centro"></label>' +
      '<label>Link del comercio (opcional)<input name="destino" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="1000" value="' + esc(f.destino) + '" placeholder="https://…"></label>' +
      '<small>Lo usan sus placas que no tienen link propio ni de sucursal. Si lo dejás vacío, no se inventa ninguno.</small>' +
      '<label>Nota (solo la ves vos)<input name="nota" maxlength="300" autocomplete="off" value="' + esc(f.nota) + '"></label>' +
      '<div class="gl-nfc-actions"><button type="submit" class="btn primary"' + (formSaving ? ' disabled' : '') + '>' + (formSaving ? 'Guardando…' : 'Guardar comercio') + '</button>' +
      btn('com-cancel', 'Cancelar') + '</div></form>';
  }
  function sucFormHtml() {
    const f = sucForm;
    return '<form class="gl-nfc-form gl-nfc-box" data-nfc-form="suc" novalidate>' +
      '<h3>' + (f.id ? 'Editar sucursal' : 'Nueva sucursal de ' + esc(comById(f.comercio)?.nombre || 'este comercio')) + '</h3>' +
      '<label>Nombre<input name="nombre" maxlength="80" autocomplete="off" value="' + esc(f.nombre) + '" placeholder="Ej.: Centro"></label>' +
      '<label>Link de la sucursal (opcional)<input name="destino" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="1000" value="' + esc(f.destino) + '" placeholder="https://…"></label>' +
      '<small>Cada sucursal tiene su propio link (por ejemplo, sus reseñas de Google). Si lo cambiás, todas sus placas cambian juntas.</small>' +
      '<div class="gl-nfc-actions"><button type="submit" class="btn primary"' + (formSaving ? ' disabled' : '') + '>' + (formSaving ? 'Guardando…' : 'Guardar sucursal') + '</button>' +
      btn('suc-cancel', 'Cancelar') + '</div></form>';
  }
  function comCard(c) {
    const mine = placas().filter(p => p.comercio_id === c.id), k = counts(mine);
    const sucs = (c.sucursales || []).map(s => {
      const ks = counts(mine.filter(p => p.sucursal_id === s.id));
      return sucForm?.id === s.id ? '<li>' + sucFormHtml() + '</li>' :
        '<li><div><b>' + esc(s.nombre) + '</b><small>' + plural(ks.total, 'placa', 'placas') + ' · ' + ks.act + ' activas</small></div>' +
        '<p>' + (s.destino ? extLink(s.destino) : '<span>Sin link: usa el del comercio</span>') + '</p>' +
        '<div class="gl-nfc-actions">' + btn('ver', 'Ver placas', at('com', c.id) + at('suc', s.id)) + btn('suc-edit', 'Editar', at('id', s.id) + at('com', c.id)) + '</div></li>';
    }).join('');
    if (comForm?.id === c.id) return '<article class="gl-nfc-com">' + comFormHtml() + '</article>';
    return '<article class="gl-nfc-com' + (fCom === c.id ? ' sel' : '') + '"><header><div><h3>' + esc(c.nombre) + '</h3>' +
      '<small>' + plural(k.total, 'placa', 'placas') + ' · ' + k.act + ' activas · ' + plural((c.sucursales || []).length, 'sucursal', 'sucursales') + '</small></div></header>' +
      '<p class="gl-nfc-dest"><small>Link del comercio</small> ' + (c.destino ? extLink(c.destino) : '<span>Sin link</span>') + '</p>' +
      (c.nota ? '<p class="gl-nfc-note">' + esc(c.nota) + '</p>' : '') +
      (sucs ? '<ul class="gl-nfc-sucs">' + sucs + '</ul>' : '') +
      (sucForm && !sucForm.id && sucForm.comercio === c.id ? sucFormHtml() : '') +
      '<div class="gl-nfc-actions">' + btn('ver', 'Ver placas', at('com', c.id), 'btn primary') + btn('suc-new', 'Nueva sucursal', at('com', c.id)) +
      btn('com-edit', 'Editar', at('id', c.id)) + btn('com-hist', 'Historial', at('id', c.id) + ' aria-expanded="' + (comHist === c.id) + '"') + '</div>' +
      (comHist === c.id ? histBox('c:' + c.id) : '') + '</article>';
  }
  function editForm(p) {
    const d = draft || {};
    const her = p.comercio_id ? (p.sucursal_id ? sucById(p.sucursal_id)?.destino : null) || comById(p.comercio_id)?.destino : null;
    return '<form class="gl-nfc-form" data-nfc-form="edit"' + at('code', p.code) + ' novalidate>' +
      '<label>Etiqueta<input name="etiqueta" maxlength="120" autocomplete="off" value="' + esc(d.etiqueta) + '" placeholder="Ej.: Mesa 4, mostrador, nombre del cliente"></label>' +
      '<label>Link propio (opcional)<input name="destino" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="1000" value="' + esc(d.destino) + '" placeholder="https://…"></label>' +
      '<small>' + (her ? 'Si lo dejás vacío, usa el link de su ' + (p.sucursal_id && sucById(p.sucursal_id)?.destino ? 'sucursal' : 'comercio') + ': ' + esc(her) : 'Reseñas de Google, Instagram, WhatsApp, menú o tienda: pegá el link completo.') + '</small>' +
      '<label>Nota (solo la ves vos)<input name="nota" maxlength="300" autocomplete="off" value="' + esc(d.nota) + '" placeholder="Ej.: vendida el 31/10"></label>' +
      '<label class="gl-nfc-check"><input type="checkbox" name="activa"' + (d.activa ? ' checked' : '') + '> Placa activa</label>' +
      '<div class="gl-nfc-actions"><button type="submit" class="btn primary"' + (saving ? ' disabled' : '') + '>' + (saving ? 'Guardando…' : 'Guardar') + '</button>' +
      btn('cancel', 'Cancelar') + '</div></form>';
  }
  function reasignForm() {
    const r = reasign, n = r.codes.length;
    return '<form class="gl-nfc-form gl-nfc-box" data-nfc-form="reasign" novalidate>' +
      (r.key === 'bulk' ? '<h3>Reasignar ' + plural(n, 'placa', 'placas') + '</h3>' : '') +
      '<label>Comercio' + comSelect('rcom', r.comercio, '<option value="">Sin comercio (stock)</option>') + '</label>' +
      '<label>Sucursal' + sucSelect('rsuc', r.comercio, r.sucursal, '<option value="">Todo el comercio (sin sucursal)</option>') + '</label>' +
      '<small>El QR y el chip no cambian. La placa deja su link propio y usa el del lugar nuevo; si ahí no hay link, queda desactivada.</small>' +
      '<div class="gl-nfc-actions"><button type="submit" class="btn primary"' + (actBusy ? ' disabled' : '') + '>' + (actBusy ? 'Reasignando…' : 'Reasignar') + '</button>' +
      btn('reasign-cancel', 'Cancelar') + '</div></form>';
  }
  function destHtml(p) {
    const u = destEf(p);
    if (p.activa && u) return extLink(u) + ' <em>(' + esc(ORIGEN[origen(p)] || 'link') + ')</em>';
    if (!p.comercio_id && data.destino_sin_activar) return '<span>Sin activar: link general</span> ' + extLink(data.destino_sin_activar);
    return '<span>Sin activar: muestra «placa no activa»</span>' + (u ? ' <em>(al activarla irá a ' + esc(u) + ')</em>' : '');
  }
  function item(p) {
    const meta = plural(p.escaneos, 'escaneo', 'escaneos') + ' · ' + num(p.escaneos_30d) + ' en 30 días' + (p.ultimo_escaneo ? ' · último ' + ago(p.ultimo_escaneo) : '');
    const writing = nfcBusy === p.code, c = at('code', p.code);
    const panel = editing === p.code ? editForm(p) : reasign?.key === p.code ? reasignForm() :
      '<div class="gl-nfc-actions">' +
      btn('edit', 'Editar', c, 'btn primary') +
      (p.activa ? btn('off', 'Desactivar', c + (actBusy ? ' disabled' : '')) : btn('on', 'Activar', c + (actBusy ? ' disabled' : ''))) +
      btn('reasign', 'Reasignar', c) + btn('copy', 'Copiar link', c) +
      btn('qr', 'QR', c + ' aria-expanded="' + (openQr === p.code) + '"') +
      btn('hist', 'Historial', c + ' aria-expanded="' + (openHist === p.code) + '"') +
      (canNfc() ? btn('nfc', ICON.nfc + (writing ? 'Acercá la placa…' : 'Grabar NFC'), c + (nfcBusy ? ' disabled' : '')) : '') + '</div>';
    return '<article class="gl-nfc-item' + (p.activa ? ' on' : '') + '" data-nfc-item' + at('nfc-text', searchText(p)) + (matches(p) ? '' : ' hidden') + '>' +
      '<header><div class="gl-nfc-id"><b>N° ' + esc(pad(p.numero)) + '</b><code>' + esc(p.code) + '</code></div>' +
      '<span class="gl-nfc-pill ' + (p.activa ? 'on' : 'off') + '">' + (p.activa ? 'Activa' : 'Sin activar') + '</span></header>' +
      '<p class="gl-nfc-place">' + esc(lugar(p)) + '</p>' +
      (etiqueta(p) ? '<p class="gl-nfc-client">' + esc(etiqueta(p)) + '</p>' : '') +
      '<p class="gl-nfc-dest"><small>Lleva a</small> ' + destHtml(p) + '</p>' +
      (p.nota ? '<p class="gl-nfc-note">' + esc(p.nota) + '</p>' : '') +
      '<p class="gl-nfc-meta">' + esc(meta) + '</p>' + panel +
      (openQr === p.code && !editing && reasign?.key !== p.code ? '<div class="gl-nfc-qrbox">' + qrSvg(link(p.code), 168, 'QR de la placa N° ' + pad(p.numero)) +
        '<div><p><code>' + esc(link(p.code)) + '</code></p><p>Este QR no cambia nunca: si cambiás el destino o el comercio, la placa impresa sigue sirviendo.</p>' +
        '<div class="gl-nfc-actions">' + btn('qr-svg', 'Descargar SVG', c) + btn('qr-png', 'Descargar PNG', c) + '</div></div></div>' : '') +
      (openHist === p.code ? histBox('p:' + p.code) : '') + '</article>';
  }
  function view() {
    if (!creator()) return '';
    if (status === 'idle') queueMicrotask(() => load());
    if (!data) {
      return '<section class="gl-admin-card gl-nfc" aria-label="NFC y QR">' + (status === 'error'
        ? '<p role="alert">' + esc(loadError) + '</p><p>' + btn('reload', 'Volver a intentar') + '</p>'
        : '<p role="status">Cargando placas…</p>') + '</section>';
    }
    const all = placas(), kAll = counts(all);
    const scans30 = all.reduce((n, p) => n + num(p.escaneos_30d), 0);
    const intro = '<section class="gl-admin-card gl-nfc" aria-label="NFC y QR">' +
      '<header><h2>NFC y QR</h2><small>Solo la creadora</small></header>' +
      '<p>Cada placa tiene un link fijo. El QR y el chip NFC se graban una sola vez; después elegís acá a dónde lleva, por placa, por sucursal o por comercio.</p>' +
      '<div class="gl-nfc-stats"><div><b>' + comercios().length + '</b><small>Comercios</small></div><div><b>' + kAll.total + '</b><small>Placas</small></div>' +
      '<div><b>' + kAll.act + '</b><small>Activas</small></div><div><b>' + (kAll.total - kAll.act) + '</b><small>Sin activar</small></div>' +
      '<div><b>' + scans30 + '</b><small>Escaneos en 30 días</small></div></div>' +
      (loadError ? '<p role="alert">' + esc(loadError) + '</p>' : '') + '</section>';

    const coms = '<section class="gl-admin-card gl-nfc" aria-label="Comercios">' +
      '<header><h2>Comercios y sucursales</h2>' + (comForm && !comForm.id ? '' : btn('com-new', 'Nuevo comercio', '', 'btn primary')) + '</header>' +
      (comForm && !comForm.id ? comFormHtml() : '') +
      (comercios().length ? '<div class="gl-nfc-coms">' + comercios().map(comCard).join('') + '</div>'
        : '<p class="gl-nfc-empty">Todavía no hay comercios. Creá uno para organizar sus placas y darle su propio link.</p>') + '</section>';

    const mk = '<section class="gl-admin-card gl-nfc" aria-label="Crear placas">' +
      '<header><h2>Crear placas</h2></header>' +
      '<form class="gl-nfc-create" data-nfc-form="create" novalidate>' +
      '<label>Cantidad<input name="cantidad" type="number" inputmode="numeric" min="1" max="200" value="' + esc(mkCant) + '"></label>' +
      '<label>Comercio' + comSelect('mkcom', mkCom, '<option value="">Sin comercio (stock)</option>') + '</label>' +
      '<label>Sucursal' + sucSelect('mksuc', mkCom, mkSuc, '<option value="">Todo el comercio</option>') + '</label>' +
      (mkCom ? '<label class="gl-nfc-check"><input type="checkbox" name="activar" data-nfc-sel="mkact"' + (mkAct ? ' checked' : '') + '> Crearlas activas</label>' : '') +
      '<button type="submit" class="btn primary"' + (creating ? ' disabled' : '') + '>' + (creating ? 'Creando…' : 'Crear placas') + '</button></form>' +
      '<p><small>Se numeran solas y cada una recibe un código único de 6 letras y números. Activas usan el link de la sucursal o del comercio.</small></p></section>';

    const scope = filtered(), shown = scope.filter(matches);
    const kScope = counts(scoped());
    const chip = (k, label, n) => '<button type="button" data-nfc-act="filter" data-filter="' + k + '" aria-pressed="' + (filter === k) + '"' + (filter === k ? ' class="on"' : '') + '>' + label + ' <b>' + n + '</b></button>';
    const fComSel = '<select name="fcom" data-nfc-sel="fcom" aria-label="Comercio"><option value="">Todos los comercios</option>' +
      '<option value="' + NONE + '"' + (fCom === NONE ? ' selected' : '') + '>Sin comercio</option>' +
      comercios().map(c => '<option value="' + esc(c.id) + '"' + (fCom === c.id ? ' selected' : '') + '>' + esc(c.nombre) + '</option>').join('') + '</select>';
    const fSucSel = fCom && fCom !== NONE && (comById(fCom)?.sucursales || []).length
      ? sucSelect('fsuc', fCom, fSuc, '<option value="">Todas las sucursales</option>').replace('<select ', '<select aria-label="Sucursal" ') : '';
    const bulk = reasign?.key === 'bulk' ? reasignForm() :
      '<div class="gl-nfc-bulk"><span>Con las <b data-nfc-count>' + shown.length + '</b> placas de la lista:</span>' +
      btn('bulk-on', 'Activar', actBusy ? ' disabled' : '') + btn('bulk-off', 'Desactivar', actBusy ? ' disabled' : '') + btn('bulk-reasign', 'Reasignar') + '</div>';
    const listCard = '<section class="gl-admin-card gl-nfc" aria-label="Placas">' +
      '<header><h2>Placas</h2><div class="gl-nfc-tools">' + btn('csv', 'Descargar lista') + btn('sheet', 'Descargar QR') + btn('print', 'Imprimir QR') + '</div></header>' +
      '<div class="gl-nfc-scope">' + fComSel + fSucSel + '</div>' +
      '<div class="gl-nfc-filters" role="group" aria-label="Filtrar placas">' + chip('todas', 'Todas', kScope.total) + chip('activas', 'Activas', kScope.act) + chip('sin', 'Sin activar', kScope.total - kScope.act) + '</div>' +
      '<label class="gl-nfc-search"><span class="sr-only">Buscar placa</span><input type="search" data-nfc-q value="' + esc(query) + '" placeholder="Buscar por número, código, comercio, sucursal, etiqueta o link" autocomplete="off"></label>' +
      (scope.length ? bulk : '') +
      '<div class="gl-nfc-list">' + scope.map(item).join('') + '</div>' +
      '<p class="gl-nfc-empty" data-nfc-empty' + (shown.length ? ' hidden' : '') + '>' + (all.length ? 'No hay placas que coincidan.' : 'Todavía no creaste placas. Empezá con «Crear placas».') + '</p></section>';

    const fb = data.destino_sin_activar || '';
    const fbCard = '<section class="gl-admin-card gl-nfc" aria-label="Placas sin comercio"><header><h2>Placas sin comercio</h2></header>' +
      '<p>Las placas de un comercio nunca usan este link: si están sin activar, muestran «placa no activa».</p>' +
      '<div class="gl-nfc-fallback"><p><b>Placas sin comercio y sin activar llevan a:</b> ' + (fb ? extLink(fb) : '<span>Ningún link: muestran «placa no activa»</span>') + '</p>' +
      (fbOpen ? '<form class="gl-nfc-form" data-nfc-form="fallback" novalidate><label>Link para placas sin comercio<input name="destino" inputmode="url" autocapitalize="off" spellcheck="false" maxlength="1000" value="' + esc(fbDraft) + '"></label>' +
        '<div class="gl-nfc-actions"><button type="submit" class="btn primary"' + (fbSaving ? ' disabled' : '') + '>' + (fbSaving ? 'Guardando…' : 'Guardar') + '</button>' + btn('fb-cancel', 'Cancelar') + '</div></form>'
        : '<div class="gl-nfc-actions">' + btn('fb-edit', fb ? 'Cambiar' : 'Cargar un link') + (fb ? btn('fb-clear', 'Quitar', fbSaving ? ' disabled' : '') : '') + '</div>') + '</div></section>';
    const help = '<details class="gl-admin-card gl-nfc gl-nfc-help"><summary>Cómo grabar el chip NFC</summary><ol>' +
      '<li>En un Android con Chrome, tocá «Grabar NFC» en la placa y apoyala en la parte de atrás del celular.</li>' +
      '<li>En iPhone, o si no ves el botón, tocá «Copiar link» y grabalo con la app NFC Tools: Escribir → Añadir un registro → URL.</li>' +
      '<li>Probala acercando otro celular: tiene que abrir su destino o, si está sin activar, el aviso «placa no activa».</li></ol></details>';
    return intro + coms + mk + listCard + fbCard + help;
  }
  function applySearch() {
    let shown = 0;
    const q = norm(query.trim());
    document.querySelectorAll('[data-nfc-item]').forEach(el => {
      const ok = !q || String(el.dataset.nfcText || '').includes(q);
      el.hidden = !ok; if (ok) shown++;
    });
    const empty = document.querySelector('[data-nfc-empty]');
    if (empty) empty.hidden = shown > 0;
    const count = document.querySelector('[data-nfc-count]');
    if (count) count.textContent = String(shown);
  }

  // ---------- Eventos ----------
  document.addEventListener('click', ev => {
    const b = ev.target.closest?.('[data-nfc-act]');
    if (!b || !creator()) return;
    ev.preventDefault();
    const ds = b.dataset, code = ds.code || '';
    switch (ds.nfcAct) {
      case 'reload': status = 'idle'; loadError = ''; render(); break;
      case 'filter': filter = ['todas', 'activas', 'sin'].includes(ds.filter) ? ds.filter : 'todas'; render(); break;
      case 'ver': fCom = comById(ds.com) ? ds.com : ''; fSuc = ds.suc && sucById(ds.suc) ? ds.suc : ''; filter = 'todas'; query = ''; render();
        try { document.querySelector('[aria-label="Placas"]')?.scrollIntoView?.({behavior: 'smooth', block: 'start'}); } catch { /* sin desplazamiento */ }
        break;
      case 'edit': startEdit(code); break;
      case 'cancel': editing = ''; draft = null; render(); break;
      case 'on': void setActiva([code], true); break;
      case 'off': void setActiva([code], false); break;
      case 'reasign': startReasign([code], code); break;
      case 'reasign-cancel': reasign = null; render(); break;
      case 'bulk-on': void setActiva(visible().map(p => p.code), true); break;
      case 'bulk-off': void setActiva(visible().map(p => p.code), false); break;
      case 'bulk-reasign': { const l = visible().map(p => p.code); if (l.length) startReasign(l, 'bulk'); else toast('No hay placas en esta lista.'); break; }
      case 'copy': void copy(code); break;
      case 'qr': openQr = openQr === code ? '' : code; render(); break;
      case 'qr-svg': downloadQr(code); break;
      case 'qr-png': downloadPng(code); break;
      case 'hist': openHist = openHist === code ? '' : code; if (openHist) void loadHist('p:' + code, {p_code: code, p_comercio: null, p_limit: 100}); else render(); break;
      case 'nfc': void writeNfc(code); break;
      case 'csv': downloadCsv(); break;
      case 'sheet': downloadSheet(); break;
      case 'print': printSheet(); break;
      case 'com-new': comForm = {id: '', nombre: '', destino: '', nota: ''}; sucForm = null; render(); break;
      case 'com-edit': { const c = comById(ds.id); if (c) { comForm = {id: c.id, nombre: c.nombre || '', destino: c.destino || '', nota: c.nota || ''}; sucForm = null; render(); } break; }
      case 'com-cancel': comForm = null; render(); break;
      case 'com-hist': comHist = comHist === ds.id ? '' : ds.id; if (comHist) void loadHist('c:' + comHist, {p_code: null, p_comercio: comHist, p_limit: 200}); else render(); break;
      case 'suc-new': if (comById(ds.com)) { sucForm = {id: '', comercio: ds.com, nombre: '', destino: ''}; comForm = null; render(); } break;
      case 'suc-edit': { const s = sucById(ds.id); if (s) { sucForm = {id: s.id, comercio: ds.com, nombre: s.nombre || '', destino: s.destino || ''}; comForm = null; render(); } break; }
      case 'suc-cancel': sucForm = null; render(); break;
      case 'fb-edit': fbOpen = true; fbDraft = data?.destino_sin_activar || ''; render(); break;
      case 'fb-cancel': fbOpen = false; render(); break;
      case 'fb-clear': void saveFallback(true); break;
    }
  });
  document.addEventListener('submit', ev => {
    const f = ev.target.closest?.('form[data-nfc-form]');
    if (!f || !creator()) return;
    ev.preventDefault();
    const kind = f.dataset.nfcForm;
    if (kind === 'create') { mkCant = String(f.elements?.cantidad?.value ?? mkCant); void create(); }
    else if (kind === 'edit') void save();
    else if (kind === 'com') void saveCom();
    else if (kind === 'suc') void saveSuc();
    else if (kind === 'reasign') void saveReasign();
    else if (kind === 'fallback') void saveFallback();
  });
  function track(ev) {
    const t = ev.target;
    if (t?.matches?.('[data-nfc-q]')) { query = t.value; applySearch(); return; }
    const sel = t?.dataset?.nfcSel;
    if (sel && ev.type === 'change') {
      const v = String(t.value || '');
      if (sel === 'fcom') { fCom = v; fSuc = ''; }
      else if (sel === 'fsuc') fSuc = v;
      else if (sel === 'mkcom') { mkCom = v; mkSuc = ''; if (!v) mkAct = false; }
      else if (sel === 'mksuc') mkSuc = v;
      else if (sel === 'mkact') { mkAct = !!t.checked; return; }
      else if (sel === 'rcom' && reasign) { reasign.comercio = v; reasign.sucursal = ''; }
      else if (sel === 'rsuc' && reasign) reasign.sucursal = v;
      render();
      return;
    }
    const form = t?.closest?.('form[data-nfc-form]');
    const kind = form?.dataset?.nfcForm;
    if (kind === 'edit' && draft) {
      if (t.name === 'activa') draft.activa = !!t.checked;
      else if (t.name in draft) draft[t.name] = t.value;
    } else if (kind === 'com' && comForm && t.name in comForm) comForm[t.name] = t.value;
    else if (kind === 'suc' && sucForm && t.name in sucForm) sucForm[t.name] = t.value;
    else if (kind === 'fallback' && t.name === 'destino') fbDraft = t.value;
    else if (kind === 'create' && t.name === 'cantidad') mkCant = t.value;
  }
  document.addEventListener('input', track);
  document.addEventListener('change', track);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && status === 'ready' && !editing && !comForm && !sucForm && !reasign && window.GestLokCreatorHome?.tab?.() === 'nfc') void load(true);
  });

  window.GestLokNfcQr = Object.freeze({
    attach(ctx) { api = ctx; },
    view, link, refresh: () => load(true),
    state: () => ({status, placas: placas().length, comercios: comercios().length})
  });
})();

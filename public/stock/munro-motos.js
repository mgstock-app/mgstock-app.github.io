/* GestLok · Agencia Motos, exclusiva de Mi Gusto – Munro.
   Planilla semanal (lunes a domingo) con entrada y salida de dos turnos por moto.
   - Cada celda (semana, moto, día) es un documento propio en «munro/agencia_motos»:
     dos personas cargando a la vez no se pisan y sin conexión queda en la cola local.
   - El cierre es automático: la semana se calcula con la hora de Buenos Aires, así que
     cada lunes la planilla arranca vacía y la anterior pasa al historial sin borrar nada.
   - Dueños (y la creadora): planilla, valores por hora, importes e historial.
     Gerentes de Munro: cargan y corrigen la semana en curso; no ven importes ni historial.
   - El servidor repite estas reglas (política gestlok_munro_motos_*). */
(() => {
  'use strict';

  const TENANT = 'cb0dc04a-9a13-434f-a3d0-47f1d8f39670';
  const TZ = 'America/Argentina/Buenos_Aires';
  const FIJAS = [
    {id:'lucas', nombre:'Lucas', moto:'Moto 1'},
    {id:'alex', nombre:'Alex', moto:'Moto 2'},
    {id:'aye', nombre:'Aye', moto:'Moto 3'}
  ];
  const CAMPOS = [['tm_e','Entrada TM'],['tm_s','Salida TM'],['tt_e','Entrada T.T'],['tt_s','Salida T.T']];
  const DIAS = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
  const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

  let api = null, docs = [], semanaVista = '', diaMovil = -1, verTodo = false, agregando = false, tarifasAbiertas = false;
  const pendientes = new Map();
  const $ = sel => document.querySelector(sel);
  const E = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  /* ---------- Fechas (siempre en hora de Buenos Aires) ---------- */
  const iso = d => d.toISOString().slice(0,10);
  const utc = s => { const [y,m,d] = s.split('-').map(Number); return new Date(Date.UTC(y,m-1,d)); };
  const sumar = (s, dias) => { const d = utc(s); d.setUTCDate(d.getUTCDate() + dias); return iso(d); };
  function hoyAR(now = new Date()){
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'})
      .formatToParts(now).filter(x => x.type !== 'literal').map(x => [x.type, x.value]));
    return p.year + '-' + p.month + '-' + p.day;
  }
  /* Lunes de la semana que contiene la fecha dada. */
  const lunesDe = s => sumar(s, -((utc(s).getUTCDay() + 6) % 7));
  const semanaActual = (now = new Date()) => lunesDe(hoyAR(now));
  const diasDe = semana => DIAS.map((_, i) => sumar(semana, i));
  const corta = s => { const [, m, d] = s.split('-'); return Number(d) + '/' + Number(m); };
  const larga = s => { const [y, m, d] = s.split('-'); return d + '/' + m + '/' + y; };
  function numeroSemana(semana){
    const d = utc(sumar(semana, 3));
    const ene4 = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
    return 1 + Math.round(((d - ene4) / 864e5 - 3 + ((ene4.getUTCDay() + 6) % 7)) / 7);
  }

  /* ---------- Horas ---------- */
  const aMin = h => HORA.test(h || '') ? Number(h.slice(0,2)) * 60 + Number(h.slice(3)) : null;
  /* Un turno cuenta solo con entrada y salida. Si la salida es menor, cruzó la medianoche. */
  function turno(e, s){
    const a = aMin(e), b = aMin(s);
    if (a == null || b == null) return 0;
    return b >= a ? b - a : b + 1440 - a;
  }
  const minutosDia = c => c ? turno(c.tm_e, c.tm_s) + turno(c.tt_e, c.tt_s) : 0;
  const fmtH = min => Math.floor(min / 60) + ':' + String(min % 60).padStart(2, '0');
  const fmt$ = v => '$' + (Math.round(v * 100) / 100).toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2});
  const importe = (min, valor) => Math.round(min / 60 * (Number(valor) || 0) * 100) / 100;

  /* ---------- Permisos ---------- */
  const rol = () => api?.miRol();
  const esDueno = () => ['creadora','dueno'].includes(rol());
  const permitido = () => !!api && api.S.me?.tenant_id === TENANT && api.S.local === 'munro' &&
    (esDueno() || (rol() === 'gerente' && api.misLocales().includes('munro')));
  const editable = semana => permitido() && api.canW() && (esDueno() || semana === semanaActual());

  /* ---------- Datos ---------- */
  const col = () => api.C('agencia_motos');
  const idCelda = (semana, moto, dia) => 'd-' + semana + '-' + moto + '-' + dia;
  const leer = id => pendientes.get(id) || docs.find(d => d.id === id)?.data || null;
  const tarifas = () => docs.find(d => d.id === 'tarifas')?.data?.valores || {};
  /* Valor vigente para la semana: el último cargado desde esa semana o antes. */
  function tarifaEn(valores, clave, semana){
    const lista = Array.isArray(valores?.[clave]) ? valores[clave] : [];
    const vig = lista.filter(t => t && t.desde <= semana).sort((a, b) => a.desde < b.desde ? -1 : 1).pop();
    return vig ? Number(vig.valor) || 0 : 0;
  }
  const refuerzos = semana => docs.filter(d => d.data?.tipo === 'refuerzo' && d.data.semana === semana)
    .map(d => ({id:d.data.moto, nombre:d.data.nombre, moto:d.data.etiqueta || 'Refuerzo', refuerzo:true, doc:d.id, creado:d.data.creado || 0}))
    .sort((a, b) => a.creado - b.creado);
  const motosDe = semana => [...FIJAS, ...refuerzos(semana)];
  function resumen(semana){
    const dias = diasDe(semana), val = tarifas();
    const filas = motosDe(semana).map(m => {
      const porDia = dias.map(dia => minutosDia(leer(idCelda(semana, m.id, dia))));
      const min = porDia.reduce((a, b) => a + b, 0);
      const valor = tarifaEn(val, m.refuerzo ? 'refuerzo' : m.id, semana);
      return {...m, porDia, min, valor, pago:importe(min, valor)};
    });
    const porDia = dias.map((_, i) => filas.reduce((a, f) => a + f.porDia[i], 0));
    return {semana, dias, filas, porDia, min:porDia.reduce((a, b) => a + b, 0), pago:filas.reduce((a, f) => a + f.pago, 0)};
  }
  const semanasConDatos = () => [...new Set(docs.map(d => d.data?.semana).filter(Boolean))]
    .filter(s => s < semanaActual()).sort().reverse();

  async function guardarCelda(input){
    const semana = semanaVista, {moto, dia, campo} = input.dataset;
    if (!editable(semana)) { api.toast('Solo podés cargar la semana en curso.', true); return; }
    const valor = input.value;
    if (valor && !HORA.test(valor)) { api.toast('Usá el formato de hora HH:MM.', true); return; }
    const id = idCelda(semana, moto, dia);
    const previo = leer(id) || {};
    const data = {...previo, semana, moto, dia, [campo]:valor || '', autor:api.S.uid, actualizado:Date.now()};
    pendientes.set(id, data); refrescar();
    try {
      await api.w(() => col().doc(id).set(data));
      if (!navigator.onLine) api.toast('Sin internet: el horario quedó en este equipo y se envía solo al volver la conexión.');
    } catch (e) { pendientes.delete(id); api.fail(e); api.render(); }
  }
  async function agregarRefuerzo(form){
    const semana = semanaVista;
    if (!editable(semana)) return;
    const nombre = form.elements.namedItem('nombre').value.trim().slice(0, 40);
    if (!nombre) return;
    const moto = 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    const id = 'm-' + semana + '-' + moto;
    const data = {tipo:'refuerzo', semana, moto, nombre, etiqueta:'Refuerzo ' + (refuerzos(semana).length + 1), autor:api.S.uid, creado:Date.now()};
    pendientes.set(id, data); docs.push({id, data}); agregando = false; api.render();
    try { await api.w(() => col().doc(id).set(data)); api.toast('Moto de refuerzo agregada a esta semana.'); }
    catch (e) { pendientes.delete(id); docs = docs.filter(d => d.id !== id); api.fail(e); api.render(); }
  }
  async function quitarRefuerzo(doc){
    const semana = semanaVista, r = refuerzos(semana).find(x => x.doc === doc);
    if (!r || !editable(semana)) return;
    if (diasDe(semana).some(dia => minutosDia(leer(idCelda(semana, r.id, dia))) > 0)) {
      api.toast('Primero borrá los horarios cargados de esta moto.', true); return;
    }
    if (!confirm('¿Quitar «' + r.nombre + '» de esta semana?')) return;
    try { await api.w(() => col().doc(doc).delete()); docs = docs.filter(d => d.id !== doc); api.render(); }
    catch (e) { api.fail(e); }
  }
  async function guardarTarifas(form){
    if (!esDueno() || !api.canW()) return;
    const semana = semanaActual(), actual = tarifas(), valores = {};
    for (const clave of [...FIJAS.map(m => m.id), 'refuerzo']) {
      const lista = Array.isArray(actual[clave]) ? actual[clave].filter(t => t.desde !== semana) : [];
      const raw = form.elements.namedItem('t-' + clave).value;
      const v = raw === '' ? null : Number(raw);
      if (v != null && (!Number.isFinite(v) || v < 0 || v > 10000000)) { api.toast('Revisá los valores por hora.', true); return; }
      if (v != null && v !== tarifaEn(actual, clave, semana)) lista.push({desde:semana, valor:v});
      valores[clave] = lista;
    }
    const data = {valores, autor:api.S.uid, actualizado:Date.now()};
    try {
      await api.w(() => col().doc('tarifas').set(data));
      const previo = docs.find(d => d.id === 'tarifas');
      if (previo) previo.data = data; else docs.push({id:'tarifas', data});
      tarifasAbiertas = false; document.activeElement?.blur?.(); api.render(); api.toast('Valores por hora guardados desde esta semana. Las semanas anteriores conservan los suyos.');
    } catch (e) { api.fail(e); }
  }

  /* ---------- Vista ---------- */
  const ICONO = '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="12" cy="34" r="7"/><circle cx="37" cy="34" r="7"/>' +
    '<path d="M12 34h10l6-12h7l2 12M26 16h7l2 6M7 26h13l4 8"/><path d="M29 12h5"/></svg>';
  const mobile = () => !!window.matchMedia?.('(max-width: 760px)').matches;
  const celda = (semana, m, dia, campo, label, puede) => {
    const c = leer(idCelda(semana, m.id, dia)), v = c?.[campo] || '';
    return '<input class="mo-time" type="time" step="60" value="' + E(v) + '"' + (puede ? '' : ' disabled') +
      ' data-moto="' + E(m.id) + '" data-dia="' + dia + '" data-campo="' + campo + '" aria-label="' + E(label + ' de ' + m.nombre + ' el ' + corta(dia)) + '">';
  };
  const tarjetaMoto = m => '<div class="mo-who"><span class="mo-ico">' + ICONO + '</span><div><b>' + E(m.nombre) + '</b><small>' + E(m.moto) + '</small></div>' +
    (m.refuerzo && editable(semanaVista) ? '<button class="mo-x" data-mo-act="quitar" data-doc="' + E(m.doc) + '" aria-label="Quitar ' + E(m.nombre) + '">×</button>' : '') + '</div>';
  const totalMoto = (f, dueno) => '<div class="mo-total"><small>Total</small><b data-mo-tot="' + E(f.id) + '">' + fmtH(f.min) + '</b>' +
    (dueno ? '<span data-mo-pago="' + E(f.id) + '">' + fmt$(f.pago) + '</span>' : '') + '</div>';
  const formRefuerzo = () => agregando
    ? '<form id="mo-ref-form" class="mo-ref-form"><label>Nombre del refuerzo<input name="nombre" maxlength="40" required placeholder="Ej.: Nico" autocomplete="off"></label>' +
      '<div><button class="btn primary" type="submit">Agregar</button><button class="btn" type="button" data-mo-act="cancelar-ref">Cancelar</button></div></form>'
    : '<button class="mo-add" data-mo-act="agregar"><span>+</span>Agregar moto de refuerzo</button>';

  function tablaPC(r, puede, dueno){
    const cab = '<div class="mo-row mo-head"><div>Empleado / Moto</div><div></div>' +
      r.dias.map((d, i) => '<div><b>' + DIAS[i] + '</b><small>' + corta(d) + '</small></div>').join('') + '<div>Total semanal</div></div>';
    const filas = r.filas.map(f => '<div class="mo-row mo-moto">' + tarjetaMoto(f) +
      '<div class="mo-labels">' + CAMPOS.map(([, l]) => '<span>' + l + '</span>').join('') + '<span class="mo-hd">Horas del día</span></div>' +
      r.dias.map((dia, i) => '<div class="mo-day">' + CAMPOS.map(([k, l]) => celda(r.semana, f, dia, k, l, puede)).join('') +
        '<span class="mo-hd" data-mo-dia="' + E(f.id) + '-' + i + '">' + fmtH(f.porDia[i]) + '</span></div>').join('') +
      totalMoto(f, dueno) + '</div>').join('');
    const agregar = puede ? '<div class="mo-row mo-moto mo-add-row">' + formRefuerzo() + '</div>' : '';
    const tot = '<div class="mo-row mo-foot"><div class="mo-foot-label"><b>Totales por día</b><small>(todas las motos)</small></div>' +
      r.porDia.map((m, i) => '<div data-mo-col="' + i + '">' + fmtH(m) + '</div>').join('') +
      '<div class="mo-week"><small>Total semanal</small><b data-mo-sem>' + fmtH(r.min) + '</b>' + (dueno ? '<span data-mo-sem-pago>' + fmt$(r.pago) + '</span>' : '') + '</div></div>';
    return '<div class="mo-scroll"><div class="mo-grid" style="--mo-cols:' + r.dias.length + '">' + cab + filas + agregar + tot + '</div></div>';
  }
  function tablaMovil(r, puede, dueno){
    if (diaMovil < 0) diaMovil = Math.max(0, r.dias.indexOf(hoyAR()));
    const i = diaMovil, dia = r.dias[i];
    const tabs = '<div class="mo-tabs" role="tablist">' + r.dias.map((d, j) => '<button role="tab" aria-selected="' + (j === i) + '" class="mo-tab' + (j === i ? ' on' : '') +
      '" data-mo-act="dia" data-i="' + j + '"><b>' + DIAS[j] + '</b><small>' + corta(d) + '</small></button>').join('') + '</div>';
    const cards = r.filas.map(f => '<article class="mo-card">' + tarjetaMoto(f) + '<div class="mo-card-grid">' +
      CAMPOS.map(([k, l]) => '<label><span>' + l + '</span>' + celda(r.semana, f, dia, k, l, puede) + '</label>').join('') + '</div>' +
      '<footer><span>Horas del día <b data-mo-dia="' + E(f.id) + '-' + i + '">' + fmtH(f.porDia[i]) + '</b></span>' +
      '<span>Semana <b data-mo-tot="' + E(f.id) + '">' + fmtH(f.min) + '</b>' + (dueno ? ' · <b data-mo-pago="' + E(f.id) + '">' + fmt$(f.pago) + '</b>' : '') + '</span></footer></article>').join('');
    return tabs + '<div class="mo-cards">' + cards + (puede ? '<div class="mo-card mo-add-row">' + formRefuerzo() + '</div>' : '') + '</div>' +
      '<div class="mo-foot-m"><span>Total del ' + DIAS[i] + ' <b data-mo-col="' + i + '">' + fmtH(r.porDia[i]) + '</b></span>' +
      '<span class="mo-week">Total semanal <b data-mo-sem>' + fmtH(r.min) + '</b>' + (dueno ? ' <span data-mo-sem-pago>' + fmt$(r.pago) + '</span>' : '') + '</span></div>';
  }
  function tarifasHTML(){
    if (!esDueno()) return '';
    const val = tarifas(), s = semanaActual();
    const items = [...FIJAS.map(m => [m.id, m.nombre]), ['refuerzo', 'Motos de refuerzo']];
    const resumenT = items.map(([k, n]) => E(n) + ': ' + (tarifaEn(val, k, s) ? fmt$(tarifaEn(val, k, s)) : 'sin valor')).join(' · ');
    return '<section class="mo-rates"><div><b>Valor por hora</b><small>' + resumenT + '</small></div>' +
      (api.canW() ? (tarifasAbiertas
        ? '<form id="mo-rates-form" class="mo-rates-form">' + items.map(([k, n]) => '<label>' + E(n) +
          '<input name="t-' + k + '" type="number" min="0" step="0.01" inputmode="decimal" value="' + (tarifaEn(val, k, s) || '') + '"></label>').join('') +
          '<div><button class="btn primary" type="submit">Guardar valores</button><button class="btn" type="button" data-mo-act="tarifas">Cancelar</button></div>' +
          '<small>Rigen desde la semana en curso; el historial conserva los valores anteriores.</small></form>'
        : '<button class="btn" data-mo-act="tarifas">Editar valores</button>') : '') + '</section>';
  }
  function historialHTML(){
    if (!esDueno()) return '';
    const semanas = semanasConDatos(), lista = verTodo ? semanas : semanas.slice(0, 8);
    const filas = lista.map(s => {
      const r = resumen(s), ref = r.filas.filter(f => f.refuerzo).reduce((a, f) => a + f.min, 0);
      return '<tr><td>Semana ' + numeroSemana(s) + '</td><td>' + larga(s) + '</td><td>' + larga(sumar(s, 6)) + '</td>' +
        FIJAS.map(m => '<td>' + fmtH(r.filas.find(f => f.id === m.id).min) + '</td>').join('') +
        '<td>' + fmtH(ref) + '</td><td><b>' + fmtH(r.min) + '</b></td><td><b>' + fmt$(r.pago) + '</b></td>' +
        '<td><button class="mo-link" data-mo-act="ver" data-semana="' + s + '">Ver detalle</button></td></tr>';
    }).join('');
    return '<section class="mo-hist"><div class="mo-hist-top"><div><b>Historial de semanas</b><small>(visible solo para los dueños)</small></div>' +
      (semanas.length > 8 ? '<button class="mo-link" data-mo-act="todo">' + (verTodo ? 'Ver menos' : 'Ver historial completo (' + semanas.length + ')') + '</button>' : '') + '</div>' +
      (semanas.length ? '<div class="mo-scroll"><table><thead><tr><th>Semana</th><th>Desde</th><th>Hasta</th>' + FIJAS.map(m => '<th>' + E(m.nombre) + '</th>').join('') +
        '<th>Refuerzo</th><th>Total horas</th><th>Total pago</th><th>Acciones</th></tr></thead><tbody>' + filas + '</tbody></table></div>'
        : '<p>Todavía no hay semanas cerradas. El lunes la semana en curso pasa sola al historial.</p>') + '</section>';
  }
  function view(){
    if (!permitido()) return '<section class="sheet"><p>No tenés acceso a este módulo.</p></section>';
    const actual = semanaActual();
    if (!semanaVista || (!esDueno() && semanaVista !== actual)) semanaVista = actual;
    const r = resumen(semanaVista), dueno = esDueno(), puede = editable(semanaVista), enCurso = semanaVista === actual;
    const flechas = dueno
      ? '<div class="mo-nav"><button data-mo-act="prev" aria-label="Semana anterior">‹</button><button data-mo-act="next" aria-label="Semana siguiente"' + (enCurso ? ' disabled' : '') + '>›</button></div>' : '';
    const estado = api.S.offline || navigator.onLine === false ? 'Sin conexión · lo que cargues se guarda en este equipo y se envía solo al volver internet'
      : !api.canW() ? 'Solo lectura' : enCurso ? 'Se guarda al completar cada horario' : 'Semana cerrada · se ve tal como quedó';
    return '<section class="sheet mo-page"><header class="mo-top"><span class="mo-hero">' + ICONO + '</span>' +
      '<div class="mo-title"><p class="eyebrow">Munro · Administración de local</p><h1>Agencia Motos</h1><h2>Control horario semanal</h2>' +
      '<p>Registrá la entrada y salida de cada moto. Al finalizar la semana, los datos se guardan automáticamente en el historial y se reinicia la planilla.</p></div>' +
      '<div class="mo-semana"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>' +
      '<div><small>' + (enCurso ? 'Semana actual' : 'Semana ' + numeroSemana(semanaVista)) + '</small><b>' + DIAS[0] + ' ' + corta(r.dias[0]) + ' – ' + DIAS[6] + ' ' + corta(r.dias[6]) + '</b></div>' + flechas + '</div></header>' +
      (enCurso ? '' : '<p class="mo-aviso">Estás viendo una semana cerrada. <button class="mo-link" data-mo-act="hoy">Volver a la semana actual</button></p>') +
      tarifasHTML() +
      '<section class="mo-sheet">' + (mobile() ? tablaMovil(r, puede, dueno) : tablaPC(r, puede, dueno)) + '</section>' +
      '<p class="mo-estado">' + E(estado) + '</p>' + historialHTML() + '</section>';
  }
  /* Actualiza totales sin redibujar, para no perder el foco mientras se carga. */
  function refrescar(){
    if (api.S.view !== 'motos') return;
    const r = resumen(semanaVista), dueno = esDueno();
    const set = (sel, txt) => document.querySelectorAll(sel).forEach(el => { el.textContent = txt; });
    for (const f of r.filas) {
      f.porDia.forEach((m, i) => set('[data-mo-dia="' + CSS.escape(f.id + '-' + i) + '"]', fmtH(m)));
      set('[data-mo-tot="' + CSS.escape(f.id) + '"]', fmtH(f.min));
      if (dueno) set('[data-mo-pago="' + CSS.escape(f.id) + '"]', fmt$(f.pago));
    }
    r.porDia.forEach((m, i) => set('[data-mo-col="' + i + '"]', fmtH(m)));
    set('[data-mo-sem]', fmtH(r.min));
    if (dueno) set('[data-mo-sem-pago]', fmt$(r.pago));
  }
  function reset(){ docs = []; pendientes.clear(); semanaVista = ''; diaMovil = -1; verTodo = false; agregando = false; tarifasAbiertas = false; }
  function subscribe(loc, push){
    if (loc !== 'munro' || !permitido()) return;
    push(col().onSnapshot(snap => {
      if (api.S.local !== loc) return;
      docs = snap.docs.map(d => ({id:d.id, data:d.data()}));
      // Lo guardado en este equipo se sigue viendo hasta que el servidor lo confirma.
      for (const [id, data] of pendientes) {
        const srv = docs.find(d => d.id === id);
        if (!srv) docs.push({id, data});
        else if ((srv.data.actualizado || 0) >= (data.actualizado || 0)) pendientes.delete(id);
      }
      const activo = document.activeElement;
      if (api.S.view === 'motos' && !(activo && activo.matches?.('.mo-time, #mo-ref-form input, #mo-rates-form input'))) api.render();
      else refrescar();
    }, api.fail));
  }
  function attach(h){
    api = h;
    document.addEventListener('click', event => {
      const btn = event.target.closest('[data-mo-act]'); if (!btn || !permitido()) return;
      const act = btn.dataset.moAct;
      if (act === 'prev' && esDueno()) { semanaVista = sumar(semanaVista, -7); diaMovil = -1; }
      else if (act === 'next' && esDueno() && semanaVista < semanaActual()) { semanaVista = sumar(semanaVista, 7); diaMovil = -1; }
      else if (act === 'hoy') { semanaVista = semanaActual(); diaMovil = -1; }
      else if (act === 'ver' && esDueno()) { semanaVista = btn.dataset.semana; diaMovil = -1; window.scrollTo?.({top:0, behavior:'smooth'}); }
      else if (act === 'dia') diaMovil = Number(btn.dataset.i);
      else if (act === 'agregar') agregando = true;
      else if (act === 'cancelar-ref') agregando = false;
      else if (act === 'quitar') { quitarRefuerzo(btn.dataset.doc); return; }
      else if (act === 'tarifas') tarifasAbiertas = !tarifasAbiertas;
      else if (act === 'todo') verTodo = !verTodo;
      else return;
      api.render();
      if (act === 'agregar') setTimeout(() => $('#mo-ref-form input')?.focus(), 0);
    });
    document.addEventListener('change', event => {
      const el = event.target;
      if (el.matches?.('.mo-time') && permitido()) guardarCelda(el);
    });
    document.addEventListener('submit', event => {
      if (event.target.id === 'mo-ref-form') { event.preventDefault(); agregarRefuerzo(event.target); }
      if (event.target.id === 'mo-rates-form') { event.preventDefault(); guardarTarifas(event.target); }
    });
    let antes = mobile();
    window.matchMedia?.('(max-width: 760px)').addEventListener?.('change', () => {
      if (mobile() !== antes && api.S.view === 'motos') { antes = mobile(); api.render(); }
    });
  }
  window.GestLokMunroMotos = {attach, view, reset, subscribe, permitido,
    _t:{hoyAR, lunesDe, semanaActual, diasDe, numeroSemana, turno, minutosDia, fmtH, importe, tarifaEn}};
})();

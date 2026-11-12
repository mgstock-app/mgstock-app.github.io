/* GestLok · Motos Agencia, exclusiva de Mi Gusto – Munro.
   Planilla semanal (lunes a domingo) con entrada y salida de dos turnos por moto.
   - Cada celda (semana, moto, día) es un documento propio en «munro/agencia_motos»:
     dos personas cargando a la vez no se pisan y sin conexión queda en la cola local.
   - El cierre es automático: la semana se calcula con la hora de Buenos Aires, así que
     cada lunes la planilla arranca vacía y la anterior pasa al historial sin borrar nada.
   - Dueños (y la creadora): planilla, valores por hora, importes e historial.
     Gerentes de Munro: cargan y corrigen horarios de la semana actual y de semanas
     cerradas; no ven importes ni valores por hora.
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
  /* «Modificar» habilita la planilla; los cambios quedan en el borrador hasta «Guardar». */
  let edicion = false, editNombre = '', guardando = false;
  /* Pestañas: «Semana» (planilla) o «Historial» (semanas cerradas; importes solo para los dueños). */
  let pestana = 'semana';
  const pendientes = new Map(), borrador = new Map();
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
  /* Turno mañana: entrada y salida deben ser del mismo día. Turno tarde:
     puede terminar de madrugada, pero nunca calcular una jornada absurda de 20 h.
     Un turno no puede superar 16 h; no se suman ni guardan horarios inválidos. */
  const MAX_MINUTOS_TURNO = 16 * 60;
  function validarDia(c){
    const errores = [], campos = new Set(), turnos = [];
    const error = (mensaje, claves) => { errores.push(mensaje); claves.forEach(k => campos.add(k)); };
    if (!c) return {minutos:0, errores, campos:[]};
    for (const [entradaKey, salidaKey, nombre] of [
      ['tm_e','tm_s','turno mañana'], ['tt_e','tt_s','turno tarde']
    ]) {
      const entrada = c[entradaKey] || '', salida = c[salidaKey] || '';
      if (!entrada && !salida) continue;
      if (!entrada || !salida) {
        error('Completá la entrada y la salida del ' + nombre + '.', [entradaKey, salidaKey]);
        continue;
      }
      if (!HORA.test(entrada) || !HORA.test(salida)) {
        error('Ingresá horarios de 00:00 a 23:59 (' + nombre + ').', [entradaKey, salidaKey]);
        continue;
      }
      const inicio = aMin(entrada), fin = aMin(salida);
      if (inicio === fin) {
        error('La entrada y la salida del ' + nombre + ' no pueden ser iguales.', [entradaKey, salidaKey]);
        continue;
      }
      // La mañana no cruza la medianoche. Evita contar 19:00 a 15:00 como 20 horas.
      if (entradaKey === 'tm_e' && fin < inicio) {
        error('La salida del turno mañana debe ser posterior a la entrada del mismo día.', [entradaKey, salidaKey]);
        continue;
      }
      // La tarde sí puede cerrar después de medianoche (ej. 19:33 a 00:00).
      const duracion = fin < inicio ? fin + 1440 - inicio : fin - inicio;
      if (duracion > MAX_MINUTOS_TURNO) {
        error('El ' + nombre + ' supera 16 horas. Revisá la entrada y la salida.', [entradaKey, salidaKey]);
        continue;
      }
      turnos.push({inicio, fin:inicio + duracion, entradaKey, salidaKey});
    }
    if (turnos.length === 2) {
      const [primero, segundo] = turnos;
      if (segundo.inicio < primero.fin) {
        error('Los turnos se superponen o están fuera de orden. El turno tarde debe comenzar después de la salida del turno mañana.',
          [primero.salidaKey, segundo.entradaKey]);
      }
      if (segundo.fin > primero.inicio + 1440) {
        error('La jornada supera las 24 horas desde la primera entrada.',
          [primero.entradaKey, segundo.salidaKey]);
      }
    }
    const minutos = turnos.reduce((s, t) => s + t.fin - t.inicio, 0);
    if (minutos > 1440) error('La suma de turnos no puede superar 24 horas.', turnos.flatMap(t => [t.entradaKey, t.salidaKey]));
    return {minutos:errores.length ? 0 : minutos, errores, campos:[...campos]};
  }
  const minutosDia = c => validarDia(c).minutos;
  const fmtH = min => Math.floor(min / 60) + ':' + String(min % 60).padStart(2, '0');
  const fmt$ = v => '$' + (Math.round(v * 100) / 100).toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2});
  const importe = (min, valor) => Math.round(min / 60 * (Number(valor) || 0) * 100) / 100;

  /* ---------- Permisos ---------- */
  const rol = () => api?.miRol();
  const esDueno = () => ['creadora','dueno'].includes(rol());
  const permitido = () => !!api && api.S.me?.tenant_id === TENANT && api.S.local === 'munro' &&
    (esDueno() || (rol() === 'gerente' && api.misLocales().includes('munro')));
  const editable = semana => permitido() && api.canW() && semana <= semanaActual();

  /* ---------- Datos ---------- */
  const col = () => api.C('agencia_motos');
  const idCelda = (semana, moto, dia) => 'd-' + semana + '-' + moto + '-' + dia;
  const leer = id => borrador.get(id) || pendientes.get(id) || docs.find(d => d.id === id)?.data || null;
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
  const NUEVO = {id:'nuevo', nombre:'Agregar moto de refuerzo', moto:'', nuevo:true};
  /* Nombres de las motos fijas: cada cambio rige desde su semana; el historial conserva los anteriores. */
  const nombres = () => docs.find(d => d.id === 'motos')?.data?.valores || {};
  function nombreEn(valores, clave, semana){
    const lista = Array.isArray(valores?.[clave]) ? valores[clave] : [];
    return lista.filter(t => t && t.desde <= semana).sort((a, b) => a.desde < b.desde ? -1 : 1).pop() || null;
  }
  const fijasDe = semana => FIJAS.map(m => { const n = nombreEn(nombres(), m.id, semana); return n ? {...m, nombre:n.nombre || m.nombre, moto:n.etiqueta || m.moto} : m; });
  const motosDe = semana => [...fijasDe(semana), ...refuerzos(semana)];
  function resumen(semana){
    const dias = diasDe(semana), val = tarifas();
    const filas = motosDe(semana).map(m => {
      const validaciones = dias.map(dia => validarDia(leer(idCelda(semana, m.id, dia))));
      const porDia = validaciones.map(v => v.minutos);
      const min = porDia.reduce((a, b) => a + b, 0);
      const valor = tarifaEn(val, m.refuerzo ? 'refuerzo' : m.id, semana);
      return {...m, validaciones, porDia, min, valor, pago:importe(min, valor)};
    });
    const errores = filas.flatMap(f => f.validaciones.flatMap((v, i) =>
      v.errores.map(mensaje => ({moto:f.nombre, dia:dias[i], mensaje}))));
    const porDia = dias.map((_, i) => filas.reduce((a, f) => a + f.porDia[i], 0));
    return {semana, dias, filas, errores, porDia, min:porDia.reduce((a, b) => a + b, 0), pago:filas.reduce((a, f) => a + f.pago, 0)};
  }
  const semanasConDatos = () => [...new Set(docs.map(d => d.data?.semana).filter(Boolean))]
    .filter(s => s < semanaActual()).sort().reverse();

  /* Cada horario cargado va al borrador; recién «Guardar» lo envía (o lo deja en la cola sin conexión). */
  async function cargarCelda(input){
    const semana = semanaVista, {dia, campo} = input.dataset;
    let moto = input.dataset.moto, creado = false;
    if (!edicion || !editable(semana)) return;
    const valor = input.value;
    if (valor && !HORA.test(valor)) { api.toast('Usá el formato de hora HH:MM.', true); return; }
    // Cargar un horario en la fila vacía crea la moto de refuerzo de esta semana.
    if (moto === NUEVO.id) {
      if (!valor || input.dataset.creando) return;
      input.dataset.creando = '1';
      moto = await crearRefuerzo(semana, 'Refuerzo ' + (refuerzos(semana).length + 1));
      delete input.dataset.creando;
      if (!moto) return;
      input.dataset.moto = moto;
      creado = true;
    }
    const id = idCelda(semana, moto, dia);
    const previo = leer(id) || {};
    borrador.set(id, {...previo, semana, moto, dia, [campo]:valor || ''});
    if (creado) api.render(); else refrescar();
  }
  async function guardarTodo(){
    if (guardando || !editable(semanaVista)) return;
    for (const data of borrador.values()) {
      const validacion = validarDia(data);
      if (validacion.errores.length) {
        api.toast('No se guardó: ' + validacion.errores[0], true);
        refrescar();
        return;
      }
    }
    if (!borrador.size) { edicion = false; api.render(); return; }
    guardando = true; api.render();
    let ok = 0;
    try {
      for (const [id, d] of [...borrador]) {
        const data = {...d, autor:api.S.uid, actualizado:Date.now()};
        await api.w(() => col().doc(id).set(data));
        pendientes.set(id, data); borrador.delete(id); ok++;
      }
      edicion = false;
      api.toast(navigator.onLine === false || api.S.offline
        ? 'Sin internet: ' + ok + (ok === 1 ? ' horario quedó' : ' horarios quedaron') + ' en este equipo y se envían solos al volver la conexión.'
        : 'Horarios guardados (' + ok + ').');
    } catch (e) { api.fail(e); }
    finally { guardando = false; api.render(); }
  }
  async function guardarNombre(form){
    const semana = semanaVista, clave = form.dataset.moto;
    if (!editable(semana)) return;
    const nombre = form.elements.namedItem('nombre').value.trim().slice(0, 40);
    const etiqueta = form.elements.namedItem('etiqueta').value.trim().slice(0, 30);
    if (!nombre) { api.toast('Escribí el nombre del colaborador.', true); return; }
    const ref = refuerzos(semana).find(r => r.id === clave);
    try {
      if (ref) {
        const doc = docs.find(d => d.id === ref.doc), data = {...doc.data, nombre, etiqueta:etiqueta || ref.moto, actualizado:Date.now()};
        await api.w(() => col().doc(ref.doc).set(data)); doc.data = data;
      } else if (FIJAS.some(m => m.id === clave)) {
        const actual = nombres(), valores = {...actual};
        valores[clave] = [...(Array.isArray(actual[clave]) ? actual[clave].filter(t => t.desde !== semana) : []), {desde:semana, nombre, etiqueta}];
        const data = {valores, autor:api.S.uid, actualizado:Date.now()};
        await api.w(() => col().doc('motos').set(data));
        const previo = docs.find(d => d.id === 'motos');
        if (previo) previo.data = data; else docs.push({id:'motos', data});
      } else return;
      editNombre = ''; document.activeElement?.blur?.(); api.render();
      api.toast('Nombre guardado. Rige desde esta semana; el historial conserva los anteriores.');
    } catch (e) { api.fail(e); }
  }
  async function crearRefuerzo(semana, nombre){
    const moto = 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    const id = 'm-' + semana + '-' + moto;
    const data = {tipo:'refuerzo', semana, moto, nombre, etiqueta:'Refuerzo ' + (refuerzos(semana).length + 1), autor:api.S.uid, creado:Date.now()};
    pendientes.set(id, data); docs.push({id, data});
    try { await api.w(() => col().doc(id).set(data)); return moto; }
    catch (e) { pendientes.delete(id); docs = docs.filter(d => d.id !== id); api.fail(e); api.render(); return null; }
  }
  async function agregarRefuerzo(form){
    const semana = semanaVista;
    if (!editable(semana)) return;
    const nombre = form.elements.namedItem('nombre').value.trim().slice(0, 40);
    if (!nombre) return;
    agregando = false;
    const moto = crearRefuerzo(semana, nombre);
    api.render();
    if (await moto) api.toast('Moto de refuerzo agregada a esta semana.');
  }
  async function quitarRefuerzo(doc){
    const semana = semanaVista, r = refuerzos(semana).find(x => x.doc === doc);
    if (!r || !editable(semana)) return;
    if (diasDe(semana).some(dia => CAMPOS.some(([k]) => !!leer(idCelda(semana, r.id, dia))?.[k]))) {
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
    const validacion = validarDia(c), mal = validacion.campos.includes(campo);
    return '<input class="mo-time' + (mal ? ' mo-time-error' : '') + '" type="time" lang="es-AR" step="60" value="' + E(v) + '"' + (puede && edicion ? '' : ' disabled') +
      (mal ? ' aria-invalid="true" title="' + E(validacion.errores.join(' ')) + '"' : ' aria-invalid="false"') +
      ' data-moto="' + E(m.id) + '" data-dia="' + dia + '" data-campo="' + campo + '" aria-label="' + E(label + ' de ' + m.nombre + ' el ' + corta(dia)) + '">';
  };
  const tieneError = f => !!f.validaciones?.some(v => v.errores.length);
  const horasDia = (f, i) => f.validaciones?.[i]?.errores.length ? '⚠ Revisar' : fmtH(f.porDia[i]);
  const horasSemana = f => tieneError(f) ? '⚠ Revisar' : fmtH(f.min);
  function avisoErrores(r){
    if (!r.errores.length) return '';
    return '<b>⚠ ' + r.errores.length + (r.errores.length === 1 ? ' error de horario' : ' errores de horario') +
      ' · Revisá los campos en rojo</b><ul>' +
      r.errores.slice(0, 5).map(p => '<li>' + E(p.moto + ' · ' + larga(p.dia) + ': ' + p.mensaje) + '</li>').join('') +
      (r.errores.length > 5 ? '<li>Y ' + (r.errores.length - 5) + ' más…</li>' : '') +
      '</ul><small>Usá el formato de 24 horas (00:00–23:59). Los errores no se incluyen en los totales ni se pueden guardar.</small>';
  }
  const tarjetaMoto = m => m.nuevo ? (agregando
    ? '<form id="mo-ref-form" class="mo-who mo-ref-form"><input name="nombre" maxlength="40" required placeholder="Nombre del refuerzo" autocomplete="off" aria-label="Nombre del refuerzo">' +
      '<div><button class="btn sm primary" type="submit">Agregar</button><button class="btn sm" type="button" data-mo-act="cancelar-ref">Cancelar</button></div></form>'
    : '<button class="mo-add" data-mo-act="agregar"><span>+</span>Agregar moto de refuerzo</button>') :
    editNombre === m.id && editable(semanaVista)
    ? '<form id="mo-name-form" class="mo-who mo-name-form" data-moto="' + E(m.id) + '">' +
      '<label>Colaborador<input name="nombre" maxlength="40" required value="' + E(m.nombre) + '" autocomplete="off"></label>' +
      '<label>Moto<input name="etiqueta" maxlength="30" value="' + E(m.moto) + '" autocomplete="off"></label>' +
      '<div><button class="btn sm primary" type="submit">Guardar</button><button class="btn sm" type="button" data-mo-act="cancelar-nombre">Cancelar</button></div></form>'
    : '<div class="mo-who"><span class="mo-ico">' + ICONO + '</span><div><b>' + E(m.nombre) + '</b><small>' + E(m.moto) + '</small>' +
      (editable(semanaVista) ? '<button class="mo-edit" data-mo-act="nombre" data-moto="' + E(m.id) + '" aria-label="Modificar ' + E(m.nombre) + '">✎ Modificar</button>' : '') + '</div>' +
      (m.refuerzo && editable(semanaVista) ? '<button class="mo-x" data-mo-act="quitar" data-doc="' + E(m.doc) + '" aria-label="Quitar ' + E(m.nombre) + '">×</button>' : '') + '</div>';
  const totalMoto = (f, dueno) => '<div class="mo-total' + (tieneError(f) ? ' mo-total-error' : '') + '"><small>Total</small><b data-mo-tot="' + E(f.id) + '">' + horasSemana(f) + '</b>' +
    (dueno ? '<span data-mo-pago="' + E(f.id) + '">' + (tieneError(f) ? '—' : fmt$(f.pago)) + '</span>' : '') + '</div>';

  const vacia = r => ({...NUEVO, porDia:r.dias.map(() => 0), min:0, pago:0});
  function tablaPC(r, puede, dueno){
    const cab = '<div class="mo-row mo-head"><div>Empleado / Moto</div><div></div>' +
      r.dias.map((d, i) => '<div><b>' + DIAS[i] + '</b><small>' + corta(d) + '</small></div>').join('') + '<div>Total semanal</div></div>';
    const filas = [...r.filas, ...(puede ? [vacia(r)] : [])].map(f => '<div class="mo-row mo-moto' + (f.nuevo ? ' mo-nueva' : '') + '">' + tarjetaMoto(f) +
      '<div class="mo-labels">' + CAMPOS.map(([, l]) => '<span>' + l + '</span>').join('') + '<span class="mo-hd">Horas del día</span></div>' +
      r.dias.map((dia, i) => '<div class="mo-day">' + CAMPOS.map(([k, l]) => celda(r.semana, f, dia, k, l, puede)).join('') +
        '<span class="mo-hd' + (f.validaciones?.[i]?.errores.length ? ' mo-hd-error' : '') + '" data-mo-dia="' + E(f.id) + '-' + i + '">' + horasDia(f, i) + '</span></div>').join('') +
      totalMoto(f, dueno) + '</div>').join('');
    const tot = '<div class="mo-row mo-foot"><div class="mo-foot-label"><b>Totales por día</b><small>(todas las motos)</small></div>' +
      r.porDia.map((m, i) => '<div data-mo-col="' + i + '">' + (r.filas.some(f => f.validaciones?.[i]?.errores.length) ? '⚠ Revisar' : fmtH(m)) + '</div>').join('') +
      '<div class="mo-week' + (r.errores.length ? ' mo-week-error' : '') + '"><small>Total semanal</small><b data-mo-sem>' + (r.errores.length ? '⚠ Revisar' : fmtH(r.min)) + '</b>' + (dueno ? '<span data-mo-sem-pago>' + (r.errores.length ? '—' : fmt$(r.pago)) + '</span>' : '') + '</div></div>';
    return '<div class="mo-scroll"><div class="mo-grid" style="--mo-cols:' + r.dias.length + '">' + cab + filas + tot + '</div></div>';
  }
  function tablaMovil(r, puede, dueno){
    if (diaMovil < 0) diaMovil = Math.max(0, r.dias.indexOf(hoyAR()));
    const i = diaMovil, dia = r.dias[i];
    const tabs = '<div class="mo-tabs" role="tablist">' + r.dias.map((d, j) => '<button role="tab" aria-selected="' + (j === i) + '" class="mo-tab' + (j === i ? ' on' : '') +
      (r.filas.some(f => f.validaciones?.[j]?.errores.length) ? ' mo-tab-error' : '') +
      '" data-mo-act="dia" data-i="' + j + '"><b>' + DIAS[j] + '</b><small>' + corta(d) + '</small></button>').join('') + '</div>';
    const cards = [...r.filas, ...(puede ? [vacia(r)] : [])].map(f => '<article class="mo-card' + (f.nuevo ? ' mo-nueva' : '') + (f.validaciones?.[i]?.errores.length ? ' mo-card-error' : '') + '">' + tarjetaMoto(f) + '<div class="mo-card-grid">' +
      CAMPOS.map(([k, l]) => '<label><span>' + l + '</span>' + celda(r.semana, f, dia, k, l, puede) + '</label>').join('') + '</div>' +
      '<p class="mo-error-msg" data-mo-error="' + E(f.id + '-' + i) + '"' + (f.validaciones?.[i]?.errores.length ? '' : ' hidden') + '>' + E(f.validaciones?.[i]?.errores.join(' ') || '') + '</p>' +
      '<footer><span>Horas del día <b data-mo-dia="' + E(f.id) + '-' + i + '">' + horasDia(f, i) + '</b></span>' +
      '<span>Semana <b data-mo-tot="' + E(f.id) + '">' + horasSemana(f) + '</b>' + (dueno ? ' · <b data-mo-pago="' + E(f.id) + '">' + (tieneError(f) ? '—' : fmt$(f.pago)) + '</b>' : '') + '</span></footer></article>').join('');
    return tabs + '<div class="mo-cards">' + cards + '</div>' +
      '<div class="mo-foot-m"><span>Total del ' + DIAS[i] + ' <b data-mo-col="' + i + '">' + (r.filas.some(f => f.validaciones?.[i]?.errores.length) ? '⚠ Revisar' : fmtH(r.porDia[i])) + '</b></span>' +
      '<span class="mo-week' + (r.errores.length ? ' mo-week-error' : '') + '">Total semanal <b data-mo-sem>' + (r.errores.length ? '⚠ Revisar' : fmtH(r.min)) + '</b>' + (dueno ? ' <span data-mo-sem-pago>' + (r.errores.length ? '—' : fmt$(r.pago)) + '</span>' : '') + '</span></div>';
  }
  /* Valor por hora: botón discreto junto al historial (solo dueños y creadora). */
  function tarifasForm(){
    if (!esDueno() || !api.canW() || !tarifasAbiertas) return '';
    const val = tarifas(), s = semanaActual();
    const items = [...FIJAS.map(m => [m.id, m.nombre]), ['refuerzo', 'Motos de refuerzo']];
    return '<form id="mo-rates-form" class="mo-rates-form">' + items.map(([k, n]) => '<label>' + E(n) +
      '<input name="t-' + k + '" type="number" min="0" step="0.01" inputmode="decimal" value="' + (tarifaEn(val, k, s) || '') + '"></label>').join('') +
      '<div><button class="btn primary" type="submit">Guardar valores</button><button class="btn" type="button" data-mo-act="tarifas">Cancelar</button></div>' +
      '<small>Rigen desde la semana en curso; el historial conserva los valores anteriores.</small></form>';
  }
  function historialHTML(){
    if (!permitido()) return '';
    const dueno = esDueno();
    const semanas = semanasConDatos(), lista = verTodo ? semanas : semanas.slice(0, 8);
    const filas = lista.map(s => {
      const r = resumen(s), ref = r.filas.filter(f => f.refuerzo).reduce((a, f) => a + f.min, 0);
      return '<tr><td>Semana ' + numeroSemana(s) + '</td><td>' + larga(s) + '</td><td>' + larga(sumar(s, 6)) + '</td>' +
        FIJAS.map(m => '<td>' + horasSemana(r.filas.find(f => f.id === m.id)) + '</td>').join('') +
        '<td>' + (r.filas.some(f => f.refuerzo && tieneError(f)) ? '⚠ Revisar' : fmtH(ref)) + '</td><td><b class="' + (r.errores.length ? 'mo-hist-error' : '') + '">' + (r.errores.length ? '⚠ Revisar' : fmtH(r.min)) + '</b></td>' + (dueno ? '<td><b>' + (r.errores.length ? '—' : fmt$(r.pago)) + '</b></td>' : '') +
        '<td><button class="mo-link" data-mo-act="ver" data-semana="' + s + '">' + (editable(s) ? 'Ver y editar' : 'Ver detalle') + '</button></td></tr>';
    }).join('');
    const val = tarifas(), s = semanaActual();
    const resumenT = [...FIJAS.map(m => [m.id, m.nombre]), ['refuerzo', 'Refuerzo']]
      .map(([k, n]) => E(n) + ' ' + (tarifaEn(val, k, s) ? fmt$(tarifaEn(val, k, s)) : 'sin valor')).join(' · ');
    return '<section class="mo-hist"><div class="mo-hist-top"><span class="mo-hist-ico"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg></span>' +
      '<div><b>Historial de semanas</b><small>' + (dueno ? '(dueños y gerentes de Munro; los importes solo los ven los dueños)' : '(podés corregir semanas anteriores · sin acceso a importes)') + '</small></div><div class="mo-hist-acts">' +
      (dueno && api.canW() ? '<button class="mo-pill" data-mo-act="tarifas" title="' + resumenT + '">Valor por hora</button>' : '') +
      (semanas.length > 8 ? '<button class="mo-pill" data-mo-act="todo">' + (verTodo ? 'Ver menos' : 'Ver historial completo →') + '</button>' : '') + '</div></div>' +
      tarifasForm() +
      (semanas.length ? '<div class="mo-scroll"><table><thead><tr><th>Semana</th><th>Desde</th><th>Hasta</th>' + fijasDe(semanaActual()).map(m => '<th>' + E(m.nombre) + '</th>').join('') +
        '<th>Refuerzo</th><th>Total horas</th>' + (dueno ? '<th>Total pago</th>' : '') + '<th>Acciones</th></tr></thead><tbody>' + filas + '</tbody></table></div>'
        : '<p>Todavía no hay semanas cerradas. El lunes la semana en curso pasa sola al historial.</p>') + '</section>';
  }
  const textoPendientes = () => edicion
    ? (borrador.size ? borrador.size + (borrador.size === 1 ? ' cambio sin guardar' : ' cambios sin guardar') : 'Modo edición')
    : 'Planilla guardada';
  function view(){
    if (!permitido()) return '<section class="sheet"><p>No tenés acceso a este módulo.</p></section>';
    const actual = semanaActual();
    if (!semanaVista) semanaVista = actual;
    const r = resumen(semanaVista), dueno = esDueno(), puede = editable(semanaVista), enCurso = semanaVista === actual;
    const cerradas = semanasConDatos().length;
    const pestanas = '<nav class="mo-pestanas" role="tablist" aria-label="Motos Agencia">' +
      '<button role="tab" data-mo-act="pestana" data-p="semana" aria-selected="' + (pestana === 'semana') + '">' + (enCurso ? 'Semana actual' : 'Semana ' + numeroSemana(semanaVista)) + '</button>' +
      '<button role="tab" data-mo-act="pestana" data-p="historial" aria-selected="' + (pestana === 'historial') + '">Historial' +
      (cerradas ? ' <span class="mo-cuenta">' + cerradas + '</span>' : '') + '</button></nav>';
    const flechas = '<div class="mo-nav"><button data-mo-act="prev" aria-label="Semana anterior">‹</button><button data-mo-act="next" aria-label="Semana siguiente"' + (enCurso ? ' disabled' : '') + '>›</button></div>';
    const estado = api.S.offline || navigator.onLine === false ? 'Sin conexión · lo que cargues se guarda en este equipo y se envía solo al volver internet'
      : !api.canW() ? 'Solo lectura' : !enCurso ? 'Semana cerrada' + (puede ? ' · podés corregir horarios con «Modificar» y guardar los cambios.' : ' (solo lectura)')
      : edicion ? 'Cargá los horarios y tocá «Guardar». Hasta guardar, los cambios no se envían.' : 'Tocá «Modificar» para cargar o corregir horarios.';
    const barra = puede ? '<div class="mo-toolbar"><span class="mo-pend">' + textoPendientes() + '</span>' +
      (edicion ? '<button class="btn" data-mo-act="cancelar"' + (guardando ? ' disabled' : '') + '>Cancelar</button><button class="btn primary" data-mo-act="guardar"' + (guardando ? ' disabled' : '') + '>' + (guardando ? 'Guardando…' : 'Guardar') + '</button>'
        : '<button class="btn primary" data-mo-act="modificar">✎ Modificar</button>') + '</div>' : '';
    return '<section class="sheet mo-page"><header class="mo-top"><span class="mo-hero">' + ICONO + '</span>' +
      '<div class="mo-title"><h1>Motos Agencia</h1><h2>Control horario semanal</h2>' +
      '<p>Registrá la entrada y salida de cada moto. Al finalizar la semana, los datos se guardan automáticamente en el historial y se reinicia la planilla. Usá formato de 24 horas (ej.: 19:30), sin superponer turnos.</p></div>' +
      '<div class="mo-semana"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>' +
      '<div><small>' + (enCurso ? 'Semana actual' : 'Semana ' + numeroSemana(semanaVista)) + '</small><b>' + DIAS[0] + ' ' + corta(r.dias[0]) + ' – ' + DIAS[6] + ' ' + corta(r.dias[6]) + '</b></div>' + flechas + '</div></header>' +
      pestanas + (pestana === 'historial' ? historialHTML() :
      (enCurso ? '' : '<p class="mo-aviso">Estás viendo una semana cerrada. <button class="mo-link" data-mo-act="hoy">Volver a la semana actual</button></p>') +
      '<section class="mo-sheet' + (edicion ? ' editando' : '') + '">' + barra +
      '<div class="mo-error-summary" role="alert"' + (r.errores.length ? '' : ' hidden') + '>' + avisoErrores(r) + '</div>' +
      (mobile() ? tablaMovil(r, puede, dueno) : tablaPC(r, puede, dueno)) + '</section>' +
      '<p class="mo-estado">' + E(estado) + '</p>') + '</section>';
  }
  /* Actualiza totales sin redibujar, para no perder el foco mientras se carga. */
  function refrescar(){
    if (api.S.view !== 'motos') return;
    const r = resumen(semanaVista), dueno = esDueno();
    const set = (sel, txt) => document.querySelectorAll(sel).forEach(el => { el.textContent = txt; });
    for (const f of r.filas) {
      f.validaciones.forEach((v, i) => {
        set('[data-mo-dia="' + CSS.escape(f.id + '-' + i) + '"]', horasDia(f, i));
        document.querySelectorAll('[data-mo-dia="' + CSS.escape(f.id + '-' + i) + '"]').forEach(el => {
          el.classList.toggle('mo-hd-error', !!v.errores.length);
          el.closest('.mo-card')?.classList.toggle('mo-card-error', !!v.errores.length);
        });
        const nota = document.querySelector('[data-mo-error="' + CSS.escape(f.id + '-' + i) + '"]');
        if (nota) { nota.hidden = !v.errores.length; nota.textContent = v.errores.join(' '); }
        for (const [k] of CAMPOS) document.querySelectorAll('.mo-time[data-moto="' + CSS.escape(f.id) +
          '"][data-dia="' + r.dias[i] + '"][data-campo="' + k + '"]').forEach(el => {
          const mal = v.campos.includes(k);
          el.classList.toggle('mo-time-error', mal);
          el.setAttribute('aria-invalid', String(mal));
          el.title = mal ? v.errores.join(' ') : '';
        });
      });
      set('[data-mo-tot="' + CSS.escape(f.id) + '"]', horasSemana(f));
      if (dueno) set('[data-mo-pago="' + CSS.escape(f.id) + '"]', tieneError(f) ? '—' : fmt$(f.pago));
      document.querySelectorAll('[data-mo-tot="' + CSS.escape(f.id) + '"]').forEach(el =>
        el.closest('.mo-total')?.classList.toggle('mo-total-error', tieneError(f)));
    }
    r.porDia.forEach((m, i) => {
      const hayError = r.filas.some(f => f.validaciones[i].errores.length);
      set('[data-mo-col="' + i + '"]', hayError ? '⚠ Revisar' : fmtH(m));
      document.querySelectorAll('.mo-tab[data-i="' + i + '"]').forEach(el => el.classList.toggle('mo-tab-error', hayError));
    });
    set('[data-mo-sem]', r.errores.length ? '⚠ Revisar' : fmtH(r.min));
    set('.mo-pend', textoPendientes());
    if (dueno) set('[data-mo-sem-pago]', r.errores.length ? '—' : fmt$(r.pago));
    document.querySelectorAll('.mo-week').forEach(el => el.classList.toggle('mo-week-error', !!r.errores.length));
    const resumenErrores = $('.mo-error-summary');
    if (resumenErrores) { resumenErrores.hidden = !r.errores.length; resumenErrores.innerHTML = avisoErrores(r); }
  }
  function reset(){ docs = []; pendientes.clear(); borrador.clear(); semanaVista = ''; diaMovil = -1; verTodo = false; agregando = false; tarifasAbiertas = false; edicion = false; editNombre = ''; guardando = false; }
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
      if (api.S.view === 'motos' && !(activo && activo.matches?.('.mo-time, #mo-ref-form input, #mo-rates-form input, #mo-name-form input'))) api.render();
      else refrescar();
    }, api.fail));
  }
  function attach(h){
    api = h;
    document.addEventListener('click', event => {
      const btn = event.target.closest('[data-mo-act]'); if (!btn || !permitido()) return;
      const act = btn.dataset.moAct;
      if (['prev','next','hoy','ver','pestana'].includes(act) && borrador.size) { api.toast('Guardá o cancelá los cambios antes de cambiar de semana.', true); return; }
      if (['prev','next','hoy','ver'].includes(act)) { edicion = false; editNombre = ''; }
      if (act === 'prev') { semanaVista = sumar(semanaVista, -7); diaMovil = -1; }
      else if (act === 'next' && semanaVista < semanaActual()) { semanaVista = sumar(semanaVista, 7); diaMovil = -1; }
      else if (act === 'hoy') { semanaVista = semanaActual(); diaMovil = -1; }
      else if (act === 'ver') { semanaVista = btn.dataset.semana; diaMovil = -1; pestana = 'semana'; window.scrollTo?.({top:0, behavior:'smooth'}); }
      else if (act === 'pestana') { pestana = btn.dataset.p === 'historial' ? 'historial' : 'semana'; edicion = false; }
      else if (act === 'dia') diaMovil = Number(btn.dataset.i);
      else if (act === 'agregar') agregando = true;
      else if (act === 'cancelar-ref') agregando = false;
      else if (act === 'quitar') { quitarRefuerzo(btn.dataset.doc); return; }
      else if (act === 'tarifas') tarifasAbiertas = !tarifasAbiertas;
      else if (act === 'modificar' && editable(semanaVista)) edicion = true;
      else if (act === 'cancelar') { if (borrador.size && !confirm('¿Descartar los cambios sin guardar?')) return; borrador.clear(); edicion = false; }
      else if (act === 'guardar') { guardarTodo(); return; }
      else if (act === 'nombre') editNombre = btn.dataset.moto;
      else if (act === 'cancelar-nombre') editNombre = '';
      else if (act === 'todo') verTodo = !verTodo;
      else return;
      api.render();
      if (act === 'agregar') setTimeout(() => $('#mo-ref-form input')?.focus(), 0);
      if (act === 'nombre') setTimeout(() => $('#mo-name-form input')?.focus(), 0);
    });
    document.addEventListener('change', event => {
      const el = event.target;
      if (el.matches?.('.mo-time') && permitido()) cargarCelda(el);
    });
    // El horario entra al borrador apenas queda completo: un redibujo antes de salir del campo no lo pierde.
    document.addEventListener('input', event => {
      const el = event.target;
      if (el.matches?.('.mo-time') && permitido() && (el.value === '' || HORA.test(el.value))) cargarCelda(el);
    });
    document.addEventListener('submit', event => {
      if (event.target.id === 'mo-ref-form') { event.preventDefault(); agregarRefuerzo(event.target); }
      if (event.target.id === 'mo-rates-form') { event.preventDefault(); guardarTarifas(event.target); }
      if (event.target.id === 'mo-name-form') { event.preventDefault(); guardarNombre(event.target); }
    });
    // Avisar antes de cerrar o recargar con horarios sin guardar.
    window.addEventListener('beforeunload', event => { if (borrador.size) { event.preventDefault(); event.returnValue = ''; } });
    let antes = mobile();
    window.matchMedia?.('(max-width: 760px)').addEventListener?.('change', () => {
      if (mobile() !== antes && api.S.view === 'motos') { antes = mobile(); api.render(); }
    });
  }
  window.GestLokMunroMotos = {attach, view, reset, subscribe, permitido,
    _t:{hoyAR, lunesDe, semanaActual, diasDe, numeroSemana, turno, minutosDia, validarDia, fmtH, importe, tarifaEn, nombreEn}};
})();

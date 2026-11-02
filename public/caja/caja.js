/* Caja · control de medios de pago (nombre provisorio).
   App del comercio para TELÉFONO y PC: detecta desde dónde se abre y adapta la interfaz (<html data-medio>).
   Todos los cálculos y permisos los hace la base (funciones public.caja_app_*): la pantalla solo muestra y envía. */
(function () {
  'use strict';

  const CFG = window.CAJA_CONFIG || {};
  const TZ = 'America/Argentina/Buenos_Aires';
  const SITE = location.origin + location.pathname.replace(/[^/]*$/, '');
  const app = document.getElementById('app');
  const hoja = document.getElementById('hoja');
  const aviso = document.getElementById('aviso');

  // ---------------- utilidades ----------------
  const h = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const leer = (k) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } };
  const guardar = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sin almacenamiento */ } };
  const NUM = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const plata = (n) => (n == null || n === '' || isNaN(Number(n))) ? '—' : (Number(n) < 0 ? '−$ ' : '$ ') + NUM.format(Math.abs(Number(n)));
  const redondo = (n) => Math.round(Number(n) * 100) / 100;
  const hora = (iso) => iso ? new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ }) : '';
  const fecha = (d, largo) => {
    if (!d) return '';
    const p = String(d).slice(0, 10).split('-').map(Number);
    const dt = new Date(Date.UTC(p[0], p[1] - 1, p[2], 12));
    return dt.toLocaleDateString('es-AR', largo ? { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' } : { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
  };
  const diaAR = (desplazo) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(Date.now() + (desplazo || 0) * 864e5));
  const uuid = () => (window.crypto && crypto.randomUUID) ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = crypto.getRandomValues(new Uint8Array(1))[0] & 15; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });
  const inicial = (n) => h(String(n || '?').trim().charAt(0).toUpperCase());
  const ROL = { dueno: 'Dueño/a', encargado: 'Encargado/a', cajero: 'Cajero/a' };
  const TIPO = { cobro: { t: 'Cobro', s: 1 }, gasto: { t: 'Gasto', s: -1 }, ingreso: { t: 'Ingreso', s: 1 }, retiro: { t: 'Retiro', s: -1 } };
  const MOTIVOS_ANULAR = ['Error de carga', 'Cargado dos veces', 'Devolución al cliente', 'Otro'];
  const MOTIVOS_CORREGIR = ['Importe equivocado', 'Medio equivocado', 'Otro'];

  // Montos como se escriben en Argentina: 1.500 · 1.500,50 · 1500.5
  function parseMonto(txt) {
    let s = String(txt == null ? '' : txt).replace(/[\s$]/g, '');
    if (!s) return NaN;
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    else if ((s.match(/\./g) || []).length > 1 || /^\d{1,3}\.\d{3}$/.test(s)) s = s.replace(/\./g, '');
    if (!/^\d+(\.\d{1,2})?$/.test(s)) return NaN;
    return redondo(s);
  }
  const montoTexto = (n) => (n == null || n === '') ? '' : NUM.format(Number(n));

  // ---------------- teléfono o PC ----------------
  // La app decide sola según el dispositivo (y se puede cambiar a mano desde el menú).
  function detectarMedio() {
    const forzado = leer('caja.vista');
    if (forzado === 'telefono' || forzado === 'pc') return forzado;
    const uad = navigator.userAgentData;
    const movilUA = uad && typeof uad.mobile === 'boolean' ? uad.mobile
      : /Android.+Mobile|iPhone|iPod|Windows Phone|IEMobile|Opera Mini|Mobile Safari/i.test(navigator.userAgent);
    const tactil = window.matchMedia && matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches;
    const ancho = Math.min(window.innerWidth || 0, (screen && screen.width) || window.innerWidth || 0);
    if (movilUA || ancho < 760 || (tactil && ancho < 900)) return 'telefono';
    return 'pc';
  }
  function aplicarMedio() {
    const m = detectarMedio();
    const cambio = m !== S.medio;
    S.medio = m;
    document.documentElement.dataset.medio = m;
    return cambio;
  }
  const esPC = () => S.medio === 'pc';
  const nombreMedio = (m) => (m === 'pc' ? 'PC' : 'teléfono');

  // ---------------- llegada desde GESTLOK ----------------
  // GESTLOK abre /caja/?desde=gestlok&comercio=…&local=…&yo=… para precargar el alta. Se guarda en la pestaña
  // para que no se pierda si la persona entra con Google (vuelve a /caja/ sin esos datos).
  const PRE = (() => {
    const q = new URLSearchParams(location.search), limpio = (v, n) => String(v || '').trim().slice(0, n);
    let p = null;
    if (q.get('desde') === 'gestlok') {
      p = { comercio: limpio(q.get('comercio'), 80), local: limpio(q.get('local'), 60), yo: limpio(q.get('yo'), 60) };
      try { sessionStorage.setItem('caja.desde', JSON.stringify(p)); } catch (e) { /* sin almacenamiento */ }
    } else {
      try { p = JSON.parse(sessionStorage.getItem('caja.desde') || 'null'); } catch (e) { p = null; }
    }
    return p;
  })();
  const volverGestlok = (clase) => PRE ? '<a class="' + (clase || 'btn texto chico') + '" href="../">← Volver a GESTLOK</a>' : '';

  // ---------------- estado ----------------
  const S = {
    medio: null, user: null, comercios: [], comercio: null, local: null,
    op: leer('caja.op'), estado: null, personas: null, pinPersona: null, pin: '', pinModo: 'caja',
    vista: 'caja', panel: null, cfg: null, hoy: null, hist: null, histFiltro: null,
    acceso: 'entrar', recuperar: false, cierre: null, listaCompleta: false, ocupado: false,
  };

  // ---------------- Supabase ----------------
  let sb = null;
  try {
    sb = window.supabase.createClient(CFG.url, CFG.key, {
      auth: { storageKey: 'caja-app-auth', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  } catch (e) {
    app.innerHTML = '<div class="centro"><p class="error">No se pudo iniciar la conexión. Recargá la página.</p></div>';
    return;
  }

  async function rpc(fn, args) {
    let r;
    try { r = await sb.rpc('caja_app_' + fn, args || {}); } catch (e) { throw Object.assign(new Error('Sin conexión. Revisá internet y probá de nuevo.'), { red: true }); }
    if (r.error) {
      const msg = String(r.error.message || '');
      if (!r.error.code && /fetch|network|conex/i.test(msg)) throw Object.assign(new Error('Sin conexión. Revisá internet y probá de nuevo.'), { red: true });
      const err = new Error(/function .* does not exist|Could not find the function/i.test(msg)
        ? 'Esta parte de la caja todavía no está activada en el servidor.' : (msg || 'No se pudo completar.'));
      err.code = r.error.code;
      if (/sesión de caja venció/i.test(msg)) err.sesion = true;
      if (/JWT|not authenticated|Iniciá sesión/i.test(msg)) err.cuenta = true;
      throw err;
    }
    return r.data;
  }

  // ---------------- avisos, hojas ----------------
  let avisoT = 0;
  function avisar(msg) {
    aviso.textContent = msg; aviso.hidden = false;
    clearTimeout(avisoT); avisoT = setTimeout(() => { aviso.hidden = true; }, 2600);
  }
  function abrirHoja(titulo, cuerpo) {
    hoja.innerHTML = '<div class="hoja-fondo" data-act="cerrarHoja"></div>' +
      '<div class="hoja-caja" role="dialog" aria-modal="true" aria-label="' + h(titulo) + '"><div class="tirador"></div>' +
      '<div class="hoja-cab"><h2>' + h(titulo) + '</h2><button class="cerrar-x" data-act="cerrarHoja" aria-label="Cerrar">×</button></div>' + cuerpo + '</div>';
    hoja.hidden = false;
    document.body.classList.add('con-hoja');
    const foco = hoja.querySelector('[autofocus]') || hoja.querySelector('input:not([type=checkbox]):not([type=hidden]), select, textarea');
    if (foco) setTimeout(() => { try { foco.focus(); } catch (e) { /* nada */ } }, 60);
  }
  function cerrarHoja() {
    hoja.hidden = true; hoja.innerHTML = '';
    document.body.classList.remove('con-hoja');
    if (S.pinModo === 'panel') { S.pinModo = 'caja'; S.pin = ''; S.pinPersona = null; }
  }
  const hojaAbierta = () => !hoja.hidden;

  // ---------------- arranque ----------------
  async function arrancar() {
    const { data } = await sb.auth.getSession();
    S.user = data && data.session ? data.session.user : null;
    if (S.recuperar) return pintar();
    if (!S.user) { S.comercios = []; S.comercio = null; S.local = null; return pintar(); }
    try { S.comercios = (await rpc('mis_comercios')) || []; }
    catch (e) { return pintarFalla(e); }
    const disp = leer('caja.dispositivo') || {};
    S.comercio = S.comercios.find((c) => c.id === disp.comercio_id) || (S.comercios.length === 1 ? S.comercios[0] : null);
    S.local = S.comercio ? (S.comercio.locales.find((l) => l.id === disp.local_id) || (S.comercio.locales.length === 1 ? S.comercio.locales[0] : null)) : null;
    if (S.comercio && S.local) guardar('caja.dispositivo', { comercio_id: S.comercio.id, local_id: S.local.id });
    if (S.op && (!S.local || S.op.local_id !== S.local.id || S.op.user_id !== S.user.id || Date.now() > S.op.hasta)) olvidarOp();
    if (S.op) { try { await cargarEstado(); } catch (e) { /* se ve en pintar */ } }
    pintar();
  }
  function pintarFalla(e) {
    app.innerHTML = '<div class="centro"><div class="panel-acceso">' + marca() +
      '<p class="error">' + h(e.message) + '</p><button class="btn ancho" data-act="reintentar">Probar de nuevo</button>' +
      '<p class="enlaces"><button class="btn texto" data-act="salirCuenta">Cerrar sesión</button></p></div></div>';
  }
  async function cargarEstado() {
    if (!S.op) return;
    try { S.estado = await rpc('estado', { p_token: S.op.token }); }
    catch (e) { if (e.sesion) { olvidarOp(); S.estado = null; } throw e; }
  }
  function olvidarOp() { S.op = null; S.estado = null; S.cierre = null; guardar('caja.op', null); }
  async function salirOp() {
    const t = S.op && S.op.token;
    olvidarOp();
    if (t) rpc('salir', { p_token: t }).catch(() => {});
  }

  // ---------------- enrutado ----------------
  const esDuenoCuenta = () => S.comercio && S.comercio.rol === 'dueno';
  function panelHabilitado() {
    if (!esDuenoCuenta()) return false;
    if (S.op && S.op.persona && S.op.persona.rol === 'dueno') return true;
    return !!(S.panel && Date.now() < S.panel.hasta);
  }
  function tocarPanel() { if (S.panel) S.panel.hasta = Date.now() + 15 * 60e3; }

  function pintar() {
    if (S.recuperar) return pantallaNuevaClave();
    if (!S.user) return pantallaAcceso();
    if (!S.comercios.length || S.creando) return pantallaCrearComercio();
    if (!S.comercio || !S.local) return pantallaElegir();
    if (S.vista !== 'caja') {
      if (panelHabilitado()) { tocarPanel(); return pantallaPanel(); }
      S.vista = 'caja';
    }
    if (!S.op) return pantallaPin();
    return pantallaCaja();
  }

  function marca(sub) {
    return '<div class="marca"><img class="logo" src="../icons/gestlok.svg" alt="" width="36" height="36"><div><b>GESTLOK Caja</b><small>' + h(sub || 'Control de medios de pago') + '</small></div></div>';
  }

  // Marco común: en PC barra lateral; en teléfono barra arriba (+ pestañas del panel).
  function marco(cuerpo) {
    const p = S.op && S.op.persona;
    const navItems = [['caja', 'Caja de hoy', 'C']];
    if (esDuenoCuenta()) navItems.push(['hoy', 'Hoy en los locales', ''], ['historial', 'Historial', ''], ['config', 'Configuración', '']);
    const nav = navItems.map((n) => '<button data-act="ir" data-vista="' + n[0] + '"' + (S.vista === n[0] ? ' aria-current="page"' : '') + '>' + h(n[1]) +
      (n[0] !== 'caja' && !panelHabilitado() ? '<small>PIN dueño</small>' : '') + '</button>').join('');
    const lateral = '<aside class="lateral">' + marca(S.comercio.nombre) + '<nav aria-label="Secciones">' + nav + '</nav>' +
      '<div class="bloque"><small>Local de este equipo</small><b>' + h(S.local.nombre) + '</b></div>' +
      '<div class="abajo">' + (PRE ? '<div class="bloque">' + volverGestlok() + '</div>' : '') +
      (p ? '<div class="bloque"><small>Cargando como</small><b>' + h(p.nombre) + '</b> · ' + h(ROL[p.rol] || '') +
        '<div class="fila" style="margin-top:8px"><button class="btn chico" data-act="cambiarPersona">Cambiar de persona</button></div></div>' : '') +
      '<div class="bloque"><small>Abierta en ' + nombreMedio(S.medio) + (leer('caja.vista') ? ' (elegido a mano)' : ' (detectado)') + '</small>' +
      '<button class="btn texto chico" data-act="menuVista">Cambiar vista</button></div></div></aside>';
    const barra = '<header class="barra"><div class="donde"><b>' + h(S.comercio.nombre) + '</b><small>' + h(S.local.nombre) + '</small></div>' +
      '<button class="quien" data-act="menu">' + (p ? '<span class="inicial">' + inicial(p.nombre) + '</span>' + h(p.nombre.split(' ')[0]) : '<span class="inicial">☰</span>Menú') + '</button></header>';
    let pest = '';
    if (S.vista !== 'caja') {
      pest = '<div class="pestanas">' + [['caja', '← Caja'], ['hoy', 'Hoy'], ['historial', 'Historial'], ['config', 'Configuración']]
        .map((n) => '<button data-act="ir" data-vista="' + n[0] + '"' + (S.vista === n[0] ? ' aria-current="page"' : '') + '>' + n[1] + '</button>').join('') + '</div>';
    }
    return '<div class="marco">' + lateral + '<div>' + barra + '<main class="contenido">' + pest + cuerpo +
      '<p class="vista-medio">Vista para ' + nombreMedio(S.medio) + ' · <button class="btn texto chico" data-act="menuVista">cambiar</button></p></main></div></div>';
  }

  // ---------------- acceso con la cuenta ----------------
  function pantallaAcceso() {
    const m = S.acceso;
    let f = '';
    if (m === 'entrar') {
      f = '<form data-form="entrar"><h1>Entrar</h1><p class="sub" style="margin:6px 0 18px">Con la cuenta del comercio (la misma de GESTLOK). En el local, la abre el dueño o el encargado una vez y después cada persona entra con su PIN.</p>' +
        '<div class="error"></div>' +
        '<label class="campo"><span>Email</span><input name="email" type="email" autocomplete="username" required></label>' +
        '<label class="campo"><span>Contraseña</span><input name="clave" type="password" autocomplete="current-password" required></label>' +
        '<button class="btn prim ancho">Entrar</button></form>' +
        '<div class="separador">o</div><button class="btn ancho" data-act="google">Entrar con Google</button>' +
        '<div class="enlaces"><button class="btn texto" data-act="acceso" data-modo="crear">Crear una cuenta</button><button class="btn texto" data-act="acceso" data-modo="olvide">Olvidé mi contraseña</button></div>';
    } else if (m === 'crear') {
      f = '<form data-form="crearCuenta"><h1>Crear cuenta</h1><p class="sub" style="margin:6px 0 18px">Es la cuenta del dueño del comercio.</p><div class="error"></div>' +
        '<label class="campo"><span>Email</span><input name="email" type="email" autocomplete="username" required></label>' +
        '<label class="campo"><span>Contraseña</span><input name="clave" type="password" minlength="8" autocomplete="new-password" required><small>Mínimo 8 caracteres.</small></label>' +
        '<button class="btn prim ancho">Crear cuenta</button></form>' +
        '<div class="enlaces"><button class="btn texto" data-act="acceso" data-modo="entrar">Ya tengo cuenta</button></div>';
    } else if (m === 'olvide') {
      f = '<form data-form="olvide"><h1>Recuperar contraseña</h1><p class="sub" style="margin:6px 0 18px">Te mandamos un email con un enlace para elegir una nueva.</p><div class="error"></div>' +
        '<label class="campo"><span>Email</span><input name="email" type="email" autocomplete="username" required></label>' +
        '<button class="btn prim ancho">Enviar enlace</button></form>' +
        '<div class="enlaces"><button class="btn texto" data-act="acceso" data-modo="entrar">Volver</button></div>';
    } else {
      f = '<div class="ok-msg">' + h(m) + '</div><button class="btn ancho" data-act="acceso" data-modo="entrar">Volver a entrar</button>';
    }
    app.innerHTML = '<div class="centro"><div class="panel-acceso">' + marca() + f + (PRE ? '<p class="enlaces">' + volverGestlok() + '</p>' : '') + '</div></div>';
  }
  function pantallaNuevaClave() {
    app.innerHTML = '<div class="centro"><div class="panel-acceso">' + marca() +
      '<form data-form="nuevaClave"><h1>Nueva contraseña</h1><div class="error" style="margin-top:12px"></div>' +
      '<label class="campo"><span>Contraseña nueva</span><input name="clave" type="password" minlength="8" autocomplete="new-password" required></label>' +
      '<button class="btn prim ancho">Guardar</button></form></div></div>';
  }

  // ---------------- alta del comercio ----------------
  function pantallaCrearComercio() {
    app.innerHTML = '<div class="centro"><div class="panel-acceso">' + marca() +
      '<form data-form="crearComercio"><h1>' + (S.comercios.length ? 'Otro comercio' : 'Tu comercio') + '</h1>' +
      '<p class="sub" style="margin:6px 0 18px">Lo podés cambiar después en Configuración.</p><div class="error"></div>' +
      '<label class="campo"><span>Nombre del comercio</span><input name="nombre" maxlength="80" required placeholder="Ej.: Almacén La Esquina" value="' + h(PRE && !S.comercios.length ? PRE.comercio : '') + '"></label>' +
      '<label class="campo"><span>Primer local</span><input name="local" maxlength="60" required placeholder="Ej.: Centro" value="' + h(PRE && !S.comercios.length ? PRE.local : '') + '"></label>' +
      '<label class="campo"><span>Tu nombre</span><input name="yo" maxlength="60" required placeholder="Como te van a ver en la caja" value="' + h(PRE && !S.comercios.length ? PRE.yo : '') + '"></label>' +
      '<div class="dos"><label class="campo"><span>Tu PIN (4 números)</span><input name="pin" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="off" required></label>' +
      '<label class="campo"><span>Repetí el PIN</span><input name="pin2" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="off" required></label></div>' +
      '<button class="btn prim ancho">Crear y empezar</button></form>' +
      '<div class="enlaces">' + volverGestlok() + (S.comercios.length ? '<button class="btn texto" data-act="cancelarCrear">Volver</button>' : '') +
      '<button class="btn texto" data-act="salirCuenta">Cerrar sesión (' + h(S.user.email || '') + ')</button></div></div></div>';
  }

  function pantallaElegir() {
    let cuerpo;
    if (!S.comercio) {
      cuerpo = '<h1>¿Qué comercio?</h1><p class="sub" style="margin:6px 0 16px">Elegí cuál se maneja en este equipo.</p>' +
        S.comercios.map((c) => '<button class="opcion" data-act="elegirComercio" data-id="' + h(c.id) + '"><span><b>' + h(c.nombre) + '</b><small>' + h(ROL[c.rol] || '') + ' · ' + c.locales.length + ' local(es)</small></span><span>›</span></button>').join('') +
        (S.comercios.filter((c) => c.rol === 'dueno').length < 3 ? '<button class="btn texto" data-act="nuevoComercio">+ Crear otro comercio</button>' : '');
    } else {
      cuerpo = '<h1>¿Qué local es este equipo?</h1><p class="sub" style="margin:6px 0 16px">' + h(S.comercio.nombre) + '. Queda guardado en este ' + nombreMedio(S.medio) + '.</p>' +
        (S.comercio.locales.length ? S.comercio.locales.map((l) => '<button class="opcion" data-act="elegirLocal" data-id="' + h(l.id) + '"><b>' + h(l.nombre) + '</b><span>›</span></button>').join('')
          : '<p class="vacio">No hay locales activos. El dueño los activa en Configuración.</p>') +
        (S.comercios.length > 1 ? '<button class="btn texto" data-act="elegirComercio" data-id="">← Otro comercio</button>' : '');
    }
    app.innerHTML = '<div class="centro"><div class="panel-acceso">' + marca() + cuerpo +
      '<div class="enlaces">' + volverGestlok() + '<button class="btn texto" data-act="salirCuenta">Cerrar sesión</button></div></div></div>';
  }

  // ---------------- PIN ----------------
  async function cargarPersonas() {
    S.personas = await rpc('personas_local', { p_local: S.local.id });
    return S.personas;
  }
  function teclado() {
    const t = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];
    return '<div class="puntos" id="puntos">' + [0, 1, 2, 3].map((i) => '<i class="' + (i < S.pin.length ? 'lleno' : '') + '"></i>').join('') + '</div>' +
      '<div class="teclado">' + t.map((k) => k === '' ? '<button class="vacia" tabindex="-1" aria-hidden="true"></button>'
        : '<button type="button" data-act="tecla" data-k="' + k + '" aria-label="' + (k === '⌫' ? 'Borrar' : k) + '">' + k + '</button>').join('') + '</div>' +
      '<p class="error" id="error-pin" style="margin-top:14px"></p>' + (esPC() ? '<p class="ayuda" style="text-align:center">También podés escribir el PIN con el teclado.</p>' : '');
  }
  function personasHtml(lista) {
    return '<div class="personas">' + lista.map((p) => '<button class="persona" data-act="elegirPersona" data-id="' + h(p.id) + '" aria-pressed="' + (S.pinPersona && S.pinPersona.id === p.id) + '">' +
      '<span class="inicial">' + inicial(p.nombre) + '</span><b>' + h(p.nombre) + '</b><small>' + h(ROL[p.rol] || '') + '</small></button>').join('') + '</div>';
  }
  async function pantallaPin() {
    S.pinModo = 'caja';
    if (!S.personas) {
      app.innerHTML = marco('<p class="cargando">Cargando personas…</p>');
      try { await cargarPersonas(); } catch (e) { app.innerHTML = marco('<p class="error">' + h(e.message) + '</p><button class="btn" data-act="reintentar">Probar de nuevo</button>'); return; }
    }
    const lista = S.personas || [];
    let cuerpo = '<div class="encabezado"><div><h1>¿Quién está en la caja?</h1><p class="sub">' + h(S.local.nombre) + ' · ' + h(fecha(diaAR(), true)) + '</p></div></div>';
    if (!lista.length) cuerpo += '<p class="vacio">No hay personas habilitadas para este local. El dueño las agrega en Configuración.</p>';
    else if (!S.pinPersona) cuerpo += personasHtml(lista);
    else cuerpo += '<div class="tarjeta" style="max-width:420px;margin:0 auto"><div class="fila entre"><div class="fila"><span class="inicial">' + inicial(S.pinPersona.nombre) + '</span><div><b>' + h(S.pinPersona.nombre) + '</b><div class="sub">Ingresá tu PIN</div></div></div>' +
      '<button class="btn chico" data-act="otraPersona">Cambiar</button></div>' + teclado() + '</div>';
    app.innerHTML = marco(cuerpo);
  }
  // El teclado activo es el de la hoja (PIN del dueño) si está abierta; si no, el de la pantalla.
  const raizPin = () => (hojaAbierta() ? hoja : app);
  function pintarPuntos(error) {
    const pts = raizPin().querySelector('#puntos');
    if (!pts) return;
    pts.innerHTML = [0, 1, 2, 3].map((i) => '<i class="' + (i < S.pin.length ? 'lleno' : '') + '"></i>').join('');
    pts.classList.toggle('error-pin', !!error);
    const e = raizPin().querySelector('#error-pin');
    if (e) e.textContent = error || '';
  }
  async function tecla(k) {
    if (S.ocupado || !S.pinPersona) return;
    if (k === '⌫') { S.pin = S.pin.slice(0, -1); return pintarPuntos(); }
    if (!/^[0-9]$/.test(k) || S.pin.length >= 4) return;
    S.pin += k; pintarPuntos();
    if (S.pin.length < 4) return;
    S.ocupado = true;
    const pin = S.pin;
    try {
      const r = await rpc('entrar', { p_local: S.local.id, p_persona: S.pinPersona.id, p_pin: pin });
      if (!r || !r.ok) { S.pin = ''; pintarPuntos((r && r.mensaje) || 'PIN incorrecto'); return; }
      if (S.pinModo === 'panel') {
        if (r.persona.rol !== 'dueno') { S.pin = ''; pintarPuntos('Ese PIN no es de un dueño'); rpc('salir', { p_token: r.token }).catch(() => {}); return; }
        S.panel = { persona: r.persona, hasta: Date.now() + 15 * 60e3 };
        rpc('salir', { p_token: r.token }).catch(() => {});
        const destino = S.panelDestino || 'hoy';
        cerrarHoja(); S.vista = destino; pintar();
        return;
      }
      S.op = { token: r.token, persona: r.persona, local_id: S.local.id, comercio_id: S.comercio.id, user_id: S.user.id, hasta: Date.now() + 13.5 * 3600e3 };
      guardar('caja.op', S.op);
      S.pin = ''; S.pinPersona = null;
      await cargarEstado();
      pintar();
    } catch (e) {
      S.pin = ''; pintarPuntos(e.message);
    } finally { S.ocupado = false; }
  }
  async function pedirPinDueno(destino) {
    S.panelDestino = destino;
    try { if (!S.personas) await cargarPersonas(); } catch (e) { return avisar(e.message); }
    const duenos = (S.personas || []).filter((p) => p.rol === 'dueno');
    S.pinModo = 'panel'; S.pin = '';
    S.pinPersona = duenos.length === 1 ? duenos[0] : null;
    pintarHojaPin(duenos);
  }
  function pintarHojaPin(duenos) {
    const cuerpo = '<p class="sub" style="margin-bottom:14px">El panel muestra los números de todos los locales: lo abre solo un dueño con su PIN.</p>' +
      (!duenos.length ? '<p class="vacio">No hay dueños con PIN en este local.</p>'
        : !S.pinPersona ? personasHtml(duenos) : '<p style="text-align:center"><b>' + h(S.pinPersona.nombre) + '</b></p>' + teclado());
    abrirHoja('PIN del dueño', cuerpo);
    S.pinModo = 'panel';
  }

  // ---------------- caja del día ----------------
  function pantallaCaja() {
    const e = S.estado;
    if (!e) { app.innerHTML = marco('<p class="cargando">Cargando la caja…</p>'); cargarEstado().then(pintar, (x) => { if (!S.op) pintar(); else app.innerHTML = marco('<p class="error">' + h(x.message) + '</p><button class="btn" data-act="reintentar">Probar de nuevo</button>'); }); return; }
    if (S.cierre && e.caja && e.caja.estado === 'abierta') return pantallaCierre();
    S.cierre = null;
    if (!e.caja) return app.innerHTML = marco(e.puede_abrir ? vistaAbrir(e) : vistaFueraDeHora(e));
    if (e.caja.estado === 'cerrada') return app.innerHTML = marco(vistaCerrada(e.caja, true));
    app.innerHTML = marco(vistaAbierta(e));
  }
  function vistaAbrir(e) {
    const s = e.sugerida || { monto: 0, origen: 'habitual' };
    const origen = s.origen === 'cierre' ? 'Es lo que quedó al cierre del ' + fecha(s.dia, true) + '.' : 'Es la caja inicial habitual del comercio.';
    return '<div class="encabezado"><div><h1>Abrir la caja de hoy</h1><p class="sub">' + h(fecha(e.hoy, true)) + ' · ' + h(e.local.nombre) + '</p></div></div>' +
      '<div class="tarjeta" style="max-width:520px"><div class="sub">Caja inicial sugerida</div><div class="cifra">' + plata(s.monto) + '</div><p class="sub" style="margin:4px 0 16px">' + h(origen) + '</p>' +
      '<form data-form="abrir" data-monto="' + h(s.monto) + '"><div class="error"></div><p style="margin-bottom:12px"><b>Contá el efectivo de la caja.</b> ¿Coincide?</p>' +
      '<div class="pila"><button class="btn prim ancho">Sí, hay ' + plata(s.monto) + '</button>' +
      '<button type="button" class="btn ancho" data-act="abrirOtro">No, hay otro monto</button></div></form>' +
      '<form data-form="abrirOtro" id="abrir-otro" class="oculto" style="margin-top:14px"><div class="error"></div><label class="campo"><span>Efectivo que hay en la caja</span><input class="entrada grande" name="monto" inputmode="decimal" autocomplete="off" placeholder="0" required></label>' +
      '<button class="btn prim ancho">Abrir con este monto</button><p class="ayuda" style="margin-top:8px">Queda registrado que no coincidió con lo sugerido.</p></form></div>' +
      '<p class="sub" style="margin-top:14px">Se cierra sola a las ' + h(e.config.hora_cierre) + ' si nadie la cierra.</p>';
  }
  function vistaFueraDeHora(e) {
    return '<h1>La caja de hoy ya cerró</h1><p class="sub" style="margin:8px 0 16px">Pasó el horario de cierre (' + h(e.config.hora_cierre) + '). Podés abrir la de mañana desde las 00:00.</p>' +
      '<button class="btn" data-act="reintentar">Actualizar</button>';
  }
  function cuentaPorMedio(caja) {
    const r = {};
    (caja.movimientos || []).forEach((m) => { if (m.tipo === 'cobro' && !m.anulado) { r[m.medio] = (r[m.medio] || 0) + 1; } });
    return r;
  }
  function filaMov(m, editable) {
    const t = TIPO[m.tipo] || { t: m.tipo, s: 1 };
    const titulo = m.tipo === 'cobro' ? t.t + ' · ' + m.medio : t.t + (m.categoria ? ' · ' + m.categoria : '');
    const partes = m.anulado
      ? ['Anulado: ' + (m.motivo_anulacion || '') + (m.anulado_por ? ' (' + m.anulado_por + ')' : '')]
      : [m.tipo === 'cobro' ? '' : m.medio, m.detalle, m.registrado_por];
    return '<button class="mov' + (m.anulado ? ' anulado' : '') + '"' + (editable ? ' data-act="verMov" data-id="' + h(m.id) + '"' : ' tabindex="-1"') + '>' +
      '<span class="hora">' + hora(m.registrado_at) + '</span><span class="que"><b>' + h(titulo) + '</b><small>' + h(partes.filter(Boolean).join(' · ')) + '</small></span>' +
      '<span class="monto' + (t.s < 0 ? ' neg' : '') + '">' + plata(t.s * m.monto) + '</span></button>';
  }
  function vistaAbierta(e) {
    const c = e.caja, t = c.totales || {}, cfg = e.config;
    const porCobro = c.modo_carga === 'cobro';
    const cuenta = cuentaPorMedio(c);
    const medios = porCobro ? (cfg.medios || []).map((m) => '<li><span>' + h(m) + ' <span class="sub">' + (cuenta[m] || 0) + '</span></span><span class="der monto">' + plata((t.por_medio || {})[m] || 0) + '</span></li>').join('') : '';
    const movs = (c.movimientos || []);
    const visibles = S.listaCompleta || esPC() ? movs : movs.slice(0, 8);
    const acciones = '<div class="acciones-caja' + (porCobro ? '' : ' sin-cobro') + '">' +
      (porCobro ? '<button class="btn prim" data-act="nuevoMov" data-tipo="cobro">+ Cobro <kbd>C</kbd></button>' : '') +
      '<button class="btn" data-act="nuevoMov" data-tipo="gasto">Gasto <kbd>G</kbd></button>' +
      '<button class="btn" data-act="nuevoMov" data-tipo="ingreso">Ingreso <kbd>I</kbd></button>' +
      '<button class="btn" data-act="nuevoMov" data-tipo="retiro">Retiro <kbd>R</kbd></button>' +
      (esPC() ? '<button class="btn prim" data-act="iniciarCierre" style="margin-left:auto">Cerrar caja</button>' : '') + '</div>';
    const cabecera = '<div class="encabezado"><div><h1>Caja de hoy</h1><p class="sub"><span class="estado abierta">Abierta · ' + hora(c.abierta_at) + '</span> ' +
      h(fecha(c.dia, true)) + ' · abrió ' + h(c.abierta_por || '') + '</p></div>' +
      (esPC() ? '<div class="sub" style="text-align:right">Se cierra sola a las ' + h(cfg.hora_cierre) + '</div>' : '') + '</div>';
    const principal = porCobro
      ? '<div class="tarjeta"><div class="sub">Cobrado hoy</div><div class="cifra">' + plata(t.total_cobrado) + '</div><div class="sub">' + (t.cobros || 0) + ' cobros · Caja inicial ' + plata(c.caja_inicial) + '</div></div>'
      : '<div class="tarjeta"><div class="sub">Ventas</div><div class="cifra media">Se cargan al cerrar</div><div class="sub">Con la venta total del sistema y los otros medios · Caja inicial ' + plata(c.caja_inicial) + '</div></div>';
    const efectivo = '<div class="resumen-grid">' +
      '<div class="tarjeta"><span class="sub">Ingresos</span><b class="monto">' + plata(t.ingresos) + '</b></div>' +
      '<div class="tarjeta"><span class="sub">Gastos</span><b class="monto">' + plata(-(t.gastos || 0)) + '</b></div>' +
      '<div class="tarjeta"><span class="sub">Retiros</span><b class="monto">' + plata(-(t.retiros || 0)) + '</b></div>' +
      '<div class="tarjeta"><span class="sub">' + (porCobro ? 'Efectivo que debería haber' : 'Efectivo sin contar ventas') + '</span><b class="monto">' + plata(porCobro ? t.saldo_teorico : t.en_caja_sin_ventas) + '</b></div></div>';
    const resumen = principal + (porCobro ? '<p class="titulo-seccion">Por medio de pago</p><div class="tarjeta" style="padding:4px 16px"><ul class="lista">' + medios + '</ul></div>' : '') + efectivo;
    const lista = '<p class="titulo-seccion">Movimientos' + (movs.length ? ' · tocá uno para corregir o anular' : '') + '</p>' +
      '<div class="tarjeta" style="padding:2px 16px">' + (movs.length ? visibles.map((m) => filaMov(m, true)).join('') : '<p class="vacio">Todavía no hay movimientos.</p>') + '</div>' +
      (!esPC() && movs.length > visibles.length ? '<button class="btn texto" data-act="verTodos">Ver todos (' + movs.length + ')</button>' : '');
    const cerrar = '<button class="btn prim ancho cerrar-caja" data-act="iniciarCierre">Cerrar caja</button><p class="sub" style="margin-top:8px;text-align:center">Se cierra sola a las ' + h(cfg.hora_cierre) + ' si nadie la cierra.</p>';
    if (esPC()) return cabecera + acciones + '<div class="caja-pc"><div>' + resumen + '</div><div>' + lista + '</div></div>';
    return cabecera + resumen + lista + cerrar + acciones;
  }
  function vistaCerrada(c, conLista, enHoja) {
    const d = c.diferencia;
    const clase = d == null ? '' : d < 0 ? 'faltante' : d > 0 ? 'sobrante' : 'justo';
    const etiqueta = d == null ? 'Sin arqueo' : d < 0 ? 'Faltante' : d > 0 ? 'Sobrante' : 'Justo';
    const t = c.totales || {};
    const auto = c.tipo_cierre === 'automatico';
    return '<div class="encabezado"><div><h1>Caja cerrada</h1><p class="sub"><span class="estado' + (auto && c.arqueo == null ? ' alerta' : '') + '">' +
      (auto ? 'Se cerró sola · ' + hora(c.cerrada_at) : 'Cerró ' + h(c.cerrada_por || '') + ' · ' + hora(c.cerrada_at)) + '</span> ' + h(fecha(c.dia, true)) + '</p></div></div>' +
      '<div class="' + (esPC() && !enHoja ? 'caja-pc' : '') + '"><div>' +
      '<div class="caja-dif ' + clase + '"><div class="sub">Diferencia</div><div class="cifra dif-' + (clase || 'x') + '">' + (d == null ? '—' : plata(d)) + '</div><b>' + etiqueta + '</b>' +
      (auto && c.arqueo == null ? '<p class="sub" style="margin-top:6px">Nadie contó el efectivo. El dueño puede cargar el arqueo desde «Hoy».</p>' : '') + '</div>' +
      '<div class="tarjeta" style="margin-top:12px">' +
      renglon('Caja inicial', c.caja_inicial) + renglon(c.modo_carga === 'totales' ? 'Venta total del sistema' : 'Cobrado', t.total_cobrado) +
      renglon('Ventas en efectivo', t.efectivo_ventas) + renglon('Ingresos en efectivo', t.ingresos_efectivo) +
      renglon('Gastos en efectivo', t.gastos_efectivo == null ? null : -t.gastos_efectivo) + renglon('Retiros en efectivo', t.retiros_efectivo == null ? null : -t.retiros_efectivo) +
      renglon('Saldo teórico', saldoDe(c), true) + renglon('Arqueo (contado)', c.arqueo) +
      (c.arqueo != null ? renglon('Retiro al cierre' + (c.retiro_destino ? ' · ' + c.retiro_destino : ''), c.retiro_cierre == null ? null : -c.retiro_cierre) + renglon('Queda para mañana', c.queda_para_manana, true) : '') +
      '</div>' + (c.observacion ? '<p class="sub" style="margin-top:10px">Observación: ' + h(c.observacion) + '</p>' : '') +
      (c.arqueo_tardio ? '<p class="sub" style="margin-top:6px">Arqueo cargado después por ' + h(c.arqueo_por || 'el dueño') + '.</p>' : '') + '</div>' +
      (conLista && c.movimientos ? '<div><p class="titulo-seccion">Movimientos del día</p><div class="tarjeta" style="padding:2px 16px">' + (c.movimientos.length ? c.movimientos.map((m) => filaMov(m, false)).join('') : '<p class="vacio">Sin movimientos.</p>') + '</div></div>' : '') +
      '</div>';
  }
  const saldoDe = (c) => (c.saldo_teorico != null ? c.saldo_teorico : (c.totales || {}).saldo_teorico);
  function renglon(txt, v, total) { return '<div class="renglon' + (total ? ' total' : '') + '"><span>' + h(txt) + '</span><span class="monto">' + plata(v) + '</span></div>'; }

  // ---------------- movimientos ----------------
  function hojaMovimiento(tipo) {
    const cfg = S.estado.config;
    const op = uuid();
    const cats = tipo === 'gasto' ? cfg.categorias_gasto : tipo === 'retiro' ? cfg.tipos_retiro : tipo === 'ingreso' ? cfg.categorias_ingreso : [];
    const titulo = { cobro: 'Nuevo cobro', gasto: 'Nuevo gasto', ingreso: 'Nuevo ingreso', retiro: 'Nuevo retiro' }[tipo];
    const etiquetaMedio = tipo === 'cobro' ? 'Medio de pago' : tipo === 'gasto' ? '¿De dónde sale la plata?' : tipo === 'ingreso' ? '¿Cómo entra?' : '¿De dónde sale?';
    const persona = S.op.persona;
    const tope = tipo === 'gasto' && persona.rol === 'cajero' && persona.gasto_maximo != null ? '<p class="ayuda" style="margin:-6px 0 12px">Tu límite por gasto: ' + plata(persona.gasto_maximo) + '.</p>' : '';
    abrirHoja(titulo, '<form data-form="movimiento" data-tipo="' + tipo + '" data-op="' + op + '"><div class="error"></div>' +
      '<label class="campo"><span>Importe</span><input class="entrada grande" name="monto" inputmode="decimal" autocomplete="off" placeholder="0" autofocus required></label>' + tope +
      (cats.length ? '<span class="etiqueta">' + (tipo === 'retiro' ? 'Tipo de retiro' : 'Categoría') + '</span><div class="chips" data-grupo="categoria">' + cats.map((x) => '<button type="button" class="chip" data-act="chip" aria-pressed="false" data-valor="' + h(x) + '">' + h(x) + '</button>').join('') + '</div>' : '') +
      '<span class="etiqueta">' + etiquetaMedio + '</span><div class="chips" data-grupo="medio">' + cfg.medios.map((x) => '<button type="button" class="chip" data-act="chip" aria-pressed="' + (x === 'Efectivo') + '" data-valor="' + h(x) + '">' + h(x) + '</button>').join('') + '</div>' +
      '<label class="campo"><span>Detalle <small>(opcional)</small></span><input name="detalle" maxlength="120" autocomplete="off" placeholder="' + (tipo === 'gasto' ? 'Ej.: proveedor, factura' : tipo === 'retiro' ? 'Ej.: para quién' : 'Opcional') + '"></label>' +
      '<button class="btn prim ancho">Guardar ' + h(TIPO[tipo].t.toLowerCase()) + '</button></form>');
  }
  const elegido = (form, grupo) => { const b = form.querySelector('[data-grupo="' + grupo + '"] [aria-pressed="true"]'); return b ? b.dataset.valor : null; };

  function hojaVerMov(id) {
    const c = S.estado.caja;
    const m = (c.movimientos || []).find((x) => x.id === id);
    if (!m) return;
    const t = TIPO[m.tipo];
    let cuerpo = '<div class="tarjeta suave"><div class="cifra media">' + plata(t.s * m.monto) + '</div><div>' + h(t.t) + ' · ' + h(m.medio) + (m.categoria ? ' · ' + h(m.categoria) : '') + '</div>' +
      (m.detalle ? '<div class="sub">' + h(m.detalle) + '</div>' : '') + '<div class="sub">' + hora(m.registrado_at) + ' · ' + h(m.registrado_por || '') + '</div>' +
      (m.anulado ? '<p class="error" style="margin:10px 0 0">Anulado por ' + h(m.anulado_por || '') + ' · ' + h(m.motivo_anulacion || '') + (m.comentario_anulacion ? ' — ' + h(m.comentario_anulacion) : '') + '</p>' : '') + '</div>';
    if (!m.anulado && c.estado === 'abierta') {
      cuerpo += '<div class="pila" style="margin-top:14px"><button class="btn ancho" data-act="corregirMov" data-id="' + h(m.id) + '">Corregir importe o medio</button>' +
        '<button class="btn peligro ancho" data-act="anularMov" data-id="' + h(m.id) + '">Anular</button></div><p class="ayuda" style="margin-top:10px">Nada se borra: queda tachado con quién, cuándo y por qué.</p>';
    }
    abrirHoja('Movimiento', cuerpo);
  }
  function hojaAnular(id) {
    abrirHoja('Anular movimiento', '<form data-form="anular" data-id="' + h(id) + '"><div class="error"></div><span class="etiqueta">Motivo</span>' +
      '<div class="chips" data-grupo="motivo">' + MOTIVOS_ANULAR.map((x) => '<button type="button" class="chip" data-act="chip" aria-pressed="false" data-valor="' + h(x) + '">' + h(x) + '</button>').join('') + '</div>' +
      '<label class="campo"><span>Comentario <small>(opcional)</small></span><input name="comentario" maxlength="200" autocomplete="off"></label>' +
      '<button class="btn peligro ancho">Anular</button></form>');
  }
  function hojaCorregir(id) {
    const m = (S.estado.caja.movimientos || []).find((x) => x.id === id);
    if (!m) return;
    abrirHoja('Corregir ' + TIPO[m.tipo].t.toLowerCase(), '<form data-form="corregir" data-id="' + h(id) + '" data-op="' + uuid() + '"><div class="error"></div>' +
      '<label class="campo"><span>Importe correcto</span><input class="entrada grande" name="monto" inputmode="decimal" autocomplete="off" value="' + h(montoTexto(m.monto)) + '" autofocus required></label>' +
      '<span class="etiqueta">Medio</span><div class="chips" data-grupo="medio">' + S.estado.config.medios.map((x) => '<button type="button" class="chip" data-act="chip" aria-pressed="' + (x === m.medio) + '" data-valor="' + h(x) + '">' + h(x) + '</button>').join('') + '</div>' +
      '<span class="etiqueta">Motivo</span><div class="chips" data-grupo="motivo">' + MOTIVOS_CORREGIR.map((x) => '<button type="button" class="chip" data-act="chip" aria-pressed="false" data-valor="' + h(x) + '">' + h(x) + '</button>').join('') + '</div>' +
      '<button class="btn prim ancho">Guardar corrección</button><p class="ayuda" style="margin-top:8px">El original queda tachado y se carga el nuevo.</p></form>');
  }

  // ---------------- cierre ----------------
  function iniciarCierre() {
    const c = S.estado.caja;
    S.cierre = { paso: 1, venta: '', otros: {}, verif: {}, arqueo: '', retiro: '', destino: '', obs: '', modo: c.modo_carga };
    (S.estado.config.medios || []).forEach((m) => { if (m !== 'Efectivo') S.cierre.otros[m] = ''; S.cierre.verif[m] = false; });
    window.scrollTo(0, 0);
    pintar();
  }
  function calcCierre() {
    const c = S.estado.caja, t = c.totales || {}, C = S.cierre;
    let venta, otros = 0, ventasEf;
    if (C.modo === 'totales') {
      venta = parseMonto(C.venta);
      Object.keys(C.otros).forEach((k) => { const v = parseMonto(C.otros[k]); if (!isNaN(v)) otros += v; });
      otros = redondo(otros);
      ventasEf = isNaN(venta) ? null : redondo(venta - otros);
    } else { venta = Number(t.total_cobrado || 0); ventasEf = Number(t.efectivo_ventas || 0); }
    const saldo = ventasEf == null ? null : redondo(Number(t.en_caja_sin_ventas || 0) + ventasEf);
    const arqueo = parseMonto(C.arqueo);
    const dif = saldo == null || isNaN(arqueo) ? null : redondo(arqueo - saldo);
    const retiro = String(C.retiro).trim() === '' ? 0 : parseMonto(C.retiro);
    const queda = isNaN(arqueo) || isNaN(retiro) ? null : redondo(arqueo - retiro);
    return { venta, otros, ventasEf, saldo, arqueo, dif, retiro, queda };
  }
  function difHtml(dif) {
    const clase = dif == null ? '' : dif < 0 ? 'faltante' : dif > 0 ? 'sobrante' : 'justo';
    return '<div class="caja-dif ' + clase + '" id="cierre-dif"><div class="sub">Diferencia</div><div class="cifra dif-' + (clase || 'x') + '">' + (dif == null ? '—' : plata(dif)) + '</div><b>' +
      (dif == null ? 'Cargá lo contado' : dif < 0 ? 'Faltante' : dif > 0 ? 'Sobrante' : 'Justo, no hay diferencia') + '</b></div>';
  }
  function pantallaCierre() {
    const e = S.estado, c = e.caja, t = c.totales || {}, C = S.cierre, k = calcCierre();
    const total = 4, cfg = e.config;
    let cuerpo = '';
    if (C.paso === 1 && C.modo === 'totales') {
      cuerpo = '<h2>Totales del sistema</h2><p class="sub" style="margin:4px 0 16px">Copiá la venta total y lo cobrado por cada medio que no es efectivo.</p>' +
        '<label class="campo"><span>Venta total del sistema</span><input class="entrada grande" data-cierre="venta" inputmode="decimal" autocomplete="off" value="' + h(C.venta) + '" placeholder="0" autofocus></label>' +
        Object.keys(C.otros).map((m) => '<label class="campo"><span>' + h(m) + '</span><input class="entrada" data-cierre="otros" data-medio="' + h(m) + '" inputmode="decimal" autocomplete="off" value="' + h(C.otros[m]) + '" placeholder="0"></label>').join('') +
        '<div class="tarjeta suave">' + renglon('Otros medios', k.otros) + '<div id="cierre-ef">' + renglon('Ventas en efectivo', k.ventasEf, true) + '</div></div>';
    } else if (C.paso === 1) {
      const cuenta = cuentaPorMedio(c);
      cuerpo = '<h2>Revisá los cobros por medio</h2><p class="sub" style="margin:4px 0 16px">Compará con el posnet, Mercado Pago y las transferencias. Marcá los que coinciden.</p>' +
        '<div class="tarjeta" style="padding:4px 16px"><ul class="lista">' + (cfg.medios || []).map((m) => '<li><label class="check"><input type="checkbox" data-cierre="verif" data-medio="' + h(m) + '"' + (C.verif[m] ? ' checked' : '') + '><span>' + h(m) + ' <span class="sub">' + (cuenta[m] || 0) + ' cobros</span></span></label><span class="der monto">' + plata((t.por_medio || {})[m] || 0) + '</span></li>').join('') + '</ul></div>' +
        '<div class="tarjeta suave" style="margin-top:12px">' + renglon('Cobrado total', t.total_cobrado, true) + '</div><p class="ayuda" style="margin-top:8px">Si algo no coincide, corregilo antes desde la lista de movimientos.</p>';
    } else if (C.paso === 2) {
      cuerpo = '<h2>Arqueo: contá el efectivo</h2><p class="sub" style="margin:4px 0 16px">Todo el efectivo que hay en la caja ahora.</p>' +
        '<label class="campo"><span>Efectivo contado</span><input class="entrada grande" data-cierre="arqueo" inputmode="decimal" autocomplete="off" value="' + h(C.arqueo) + '" placeholder="0" autofocus></label>' +
        '<div class="tarjeta suave">' + renglon('Caja inicial', c.caja_inicial) + renglon('Ventas en efectivo', k.ventasEf) + renglon('Ingresos en efectivo', t.ingresos_efectivo) +
        renglon('Gastos en efectivo', -(t.gastos_efectivo || 0)) + renglon('Retiros en efectivo', -(t.retiros_efectivo || 0)) + renglon('Saldo teórico (debería haber)', k.saldo, true) + '</div>' +
        '<div style="margin-top:12px">' + difHtml(k.dif) + '</div>';
    } else if (C.paso === 3) {
      cuerpo = '<h2>Retiro y caja para mañana</h2><p class="sub" style="margin:4px 0 16px">Si sacás plata al cerrar, indicá cuánto y a dónde va. Lo que queda es la caja inicial de mañana.</p>' +
        '<label class="campo"><span>Retiro al cierre</span><input class="entrada grande" data-cierre="retiro" inputmode="decimal" autocomplete="off" value="' + h(C.retiro) + '" placeholder="0" autofocus></label>' +
        '<span class="etiqueta">¿A dónde va?</span><div class="chips" data-grupo="destino">' + (cfg.tipos_retiro || []).map((x) => '<button type="button" class="chip" data-act="chipDestino" aria-pressed="' + (C.destino === x) + '" data-valor="' + h(x) + '">' + h(x) + '</button>').join('') + '</div>' +
        '<div class="tarjeta suave" id="cierre-queda">' + renglon('Contado', k.arqueo) + renglon('Retiro', isNaN(k.retiro) ? null : -k.retiro) + renglon('Queda para mañana', k.queda, true) + '</div>' +
        '<label class="campo" style="margin-top:14px"><span>Observación <small>(opcional)</small></span><textarea data-cierre="obs" maxlength="300">' + h(C.obs) + '</textarea></label>';
    } else {
      cuerpo = '<h2>Confirmá el cierre</h2><p class="sub" style="margin:4px 0 16px">Después de cerrar no se puede modificar.</p>' + difHtml(k.dif) +
        '<div class="tarjeta" style="margin-top:12px">' + (C.modo === 'totales' ? renglon('Venta total del sistema', k.venta) + renglon('Otros medios', k.otros) : renglon('Cobrado', t.total_cobrado)) +
        renglon('Saldo teórico', k.saldo) + renglon('Arqueo (contado)', k.arqueo) + renglon('Retiro' + (C.destino ? ' · ' + C.destino : ''), -(k.retiro || 0)) + renglon('Queda para mañana', k.queda, true) + '</div>';
    }
    const pasos = '<div class="pasos">' + [1, 2, 3, 4].map((i) => '<i class="' + (i <= C.paso ? 'hecho' : '') + '"></i>').join('') + '</div>';
    app.innerHTML = marco('<div class="cierre-pc"><div class="encabezado"><div><h1>Cerrar caja</h1><p class="sub">Paso ' + C.paso + ' de ' + total + ' · ' + h(e.local.nombre) + ' · ' + h(fecha(c.dia, true)) + '</p></div></div>' + pasos +
      '<p class="error" id="error-cierre"></p>' + cuerpo +
      '<div class="pie-cierre"><button class="btn" data-act="cierreAtras">' + (C.paso === 1 ? 'Cancelar' : 'Atrás') + '</button>' +
      '<button class="btn prim" data-act="cierreSigue">' + (C.paso === 4 ? 'Cerrar caja definitivamente' : 'Siguiente') + '</button></div></div>');
    const f = app.querySelector('[autofocus]');
    if (f && esPC()) f.focus();
  }
  function actualizarCierreVivo() {
    const k = calcCierre();
    const ef = document.getElementById('cierre-ef');
    if (ef) ef.innerHTML = renglon('Ventas en efectivo', k.ventasEf, true);
    const dif = document.getElementById('cierre-dif');
    if (dif) dif.outerHTML = difHtml(k.dif);
    const q = document.getElementById('cierre-queda');
    if (q) q.innerHTML = renglon('Contado', k.arqueo) + renglon('Retiro', isNaN(k.retiro) ? null : -k.retiro) + renglon('Queda para mañana', k.queda, true);
  }
  async function cierreSigue() {
    const C = S.cierre, k = calcCierre(), err = document.getElementById('error-cierre');
    const falla = (m) => { if (err) { err.textContent = m; window.scrollTo(0, 0); } };
    if (C.paso === 1 && C.modo === 'totales') {
      if (isNaN(k.venta)) return falla('Cargá la venta total del sistema.');
      for (const m of Object.keys(C.otros)) if (String(C.otros[m]).trim() !== '' && isNaN(parseMonto(C.otros[m]))) return falla('Revisá el importe de ' + m + '.');
      if (k.otros > k.venta) return falla('Los otros medios suman más que la venta total.');
    }
    if (C.paso === 2 && isNaN(k.arqueo)) return falla('Cargá el efectivo contado.');
    if (C.paso === 3) {
      if (isNaN(k.retiro) || k.retiro < 0) return falla('Revisá el retiro.');
      if (k.retiro > k.arqueo) return falla('El retiro no puede ser mayor que lo contado.');
      if (k.retiro > 0 && !C.destino) return falla('Elegí a dónde va el retiro.');
    }
    if (C.paso < 4) { C.paso += 1; window.scrollTo(0, 0); return pantallaCierre(); }
    if (S.ocupado) return;
    S.ocupado = true;
    const btn = app.querySelector('[data-act="cierreSigue"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Cerrando…'; }
    try {
      const otros = {};
      if (C.modo === 'totales') Object.keys(C.otros).forEach((m) => { const v = parseMonto(C.otros[m]); if (!isNaN(v) && v > 0) otros[m] = v; });
      const r = await rpc('cerrar', {
        p_token: S.op.token, p_caja: S.estado.caja.id, p_arqueo: k.arqueo,
        p_venta_total: C.modo === 'totales' ? k.venta : null, p_otros: C.modo === 'totales' ? otros : null,
        p_verificados: C.modo === 'cobro' ? C.verif : null, p_retiro: k.retiro || 0,
        p_destino: k.retiro > 0 ? C.destino : null, p_observacion: C.obs.trim() || null,
      });
      S.cierre = null; S.estado.caja = r.caja;
      avisar(r.ya_cerrada ? 'La caja ya estaba cerrada.' : 'Caja cerrada.');
      pintar();
    } catch (e) {
      if (btn) { btn.disabled = false; btn.textContent = 'Cerrar caja definitivamente'; }
      if (e.sesion) { pintar(); return; }
      falla(e.message);
    } finally { S.ocupado = false; }
  }

  // ---------------- panel del dueño ----------------
  async function pantallaPanel() {
    const v = S.vista;
    try {
      if (v === 'hoy') { app.innerHTML = marco('<p class="cargando">Cargando…</p>'); S.hoy = await rpc('hoy', { p_comercio: S.comercio.id }); return (app.innerHTML = marco(vistaHoy(S.hoy))); }
      if (v === 'historial') {
        if (!S.histFiltro) S.histFiltro = { desde: diaAR(-30), hasta: diaAR(), local: '' };
        if (!S.cfg) S.cfg = await rpc('config', { p_comercio: S.comercio.id });
        app.innerHTML = marco(vistaHistorial(null));
        S.hist = await rpc('historial', { p_comercio: S.comercio.id, p_local: S.histFiltro.local || null, p_desde: S.histFiltro.desde, p_hasta: S.histFiltro.hasta });
        return (app.innerHTML = marco(vistaHistorial(S.hist)));
      }
      if (v === 'config') { if (!S.cfg) { app.innerHTML = marco('<p class="cargando">Cargando…</p>'); S.cfg = await rpc('config', { p_comercio: S.comercio.id }); } return (app.innerHTML = marco(vistaConfig(S.cfg))); }
    } catch (e) {
      app.innerHTML = marco('<p class="error">' + h(e.message) + '</p><button class="btn" data-act="reintentar">Probar de nuevo</button>');
    }
  }
  function vistaHoy(d) {
    const cards = d.locales.map((l) => {
      const c = l.caja;
      let est = '<span class="estado">Sin abrir</span>', cuerpo = '<p class="sub" style="margin-top:8px">Todavía no abrieron la caja.</p>';
      if (c && c.estado === 'abierta') {
        est = '<span class="estado abierta">Abierta · ' + hora(c.abierta_at) + '</span>';
        cuerpo = renglon(c.modo_carga === 'totales' ? 'Ventas' : 'Cobrado', c.modo_carga === 'totales' ? null : (c.totales || {}).total_cobrado) +
          renglon('Efectivo que debería haber', c.modo_carga === 'totales' ? (c.totales || {}).en_caja_sin_ventas : (c.totales || {}).saldo_teorico) + '<p class="sub">Abrió ' + h(c.abierta_por || '') + '</p>';
      } else if (c) {
        const dd = c.diferencia;
        est = '<span class="estado' + (c.arqueo == null ? ' alerta' : '') + '">' + (c.tipo_cierre === 'automatico' ? 'Se cerró sola' : 'Cerrada') + ' · ' + hora(c.cerrada_at) + '</span>';
        cuerpo = renglon('Saldo teórico', saldoDe(c)) + renglon('Arqueo', c.arqueo) +
          '<div class="renglon total"><span>Diferencia</span><span class="monto ' + (dd == null ? '' : dd < 0 ? 'dif-faltante' : dd > 0 ? 'dif-sobrante' : 'dif-justo') + '">' + (dd == null ? '—' : plata(dd)) + '</span></div>' +
          '<button class="btn chico" data-act="verCaja" data-id="' + h(c.id) + '" style="margin-top:8px">Ver detalle</button>';
      }
      return '<div class="tarjeta"><div class="fila entre"><h3>' + h(l.nombre) + '</h3>' + est + '</div>' + cuerpo + '</div>';
    }).join('');
    const pend = d.pendientes.length ? '<p class="titulo-seccion">Para revisar</p>' + d.pendientes.map((p) => '<div class="tarjeta"><div class="fila entre envuelve"><div><b>' + h(p.local) + ' · ' + h(fecha(p.dia, true)) + '</b><p class="sub">Se cerró sola y nadie contó el efectivo.</p></div>' +
      '<button class="btn chico prim" data-act="arqueoTardio" data-id="' + h(p.caja_id) + '">Cargar arqueo</button></div></div>').join('') : '';
    const movs = '<p class="titulo-seccion">Últimos movimientos de hoy</p><div class="tarjeta" style="padding:2px 16px">' +
      (d.movimientos.length ? d.movimientos.map((m) => { const t = TIPO[m.tipo]; return '<div class="mov' + (m.anulado ? ' anulado' : '') + '"><span class="hora">' + hora(m.registrado_at) + '</span><span class="que"><b>' + h(m.tipo === 'cobro' ? t.t + ' · ' + m.medio : t.t + (m.categoria ? ' · ' + m.categoria : '')) + '</b><small>' + h([m.local, m.tipo === 'cobro' ? '' : m.medio, m.registrado_por].filter(Boolean).join(' · ')) + '</small></span><span class="monto">' + plata(t.s * m.monto) + '</span></div>'; }).join('') : '<p class="vacio">Sin movimientos hoy.</p>') + '</div>';
    return '<div class="encabezado"><div><h1>Hoy en los locales</h1><p class="sub">' + h(fecha(d.hoy, true)) + ' · actualizado ' + hora(d.ahora) + '</p></div><button class="btn chico" data-act="reintentar">Actualizar</button></div>' +
      '<div class="panel-grid">' + cards + '</div>' + pend + movs;
  }
  function vistaHistorial(lista) {
    const f = S.histFiltro, locales = (S.cfg && S.cfg.locales) || [];
    const filtros = '<form data-form="filtroHist" class="fila envuelve" style="align-items:flex-end;margin-bottom:14px">' +
      '<label class="campo" style="margin:0"><span>Desde</span><input type="date" name="desde" value="' + h(f.desde) + '" required></label>' +
      '<label class="campo" style="margin:0"><span>Hasta</span><input type="date" name="hasta" value="' + h(f.hasta) + '" required></label>' +
      '<label class="campo" style="margin:0"><span>Local</span><select name="local"><option value="">Todos</option>' + locales.map((l) => '<option value="' + h(l.id) + '"' + (f.local === l.id ? ' selected' : '') + '>' + h(l.nombre) + '</option>').join('') + '</select></label>' +
      '<button class="btn">Ver</button>' + (lista && lista.length ? '<button type="button" class="btn" data-act="exportar">Descargar para Excel</button>' : '') + '</form>';
    let cuerpo;
    if (!lista) cuerpo = '<p class="cargando">Cargando…</p>';
    else if (!lista.length) cuerpo = '<p class="vacio">No hay cajas cerradas en ese período.</p>';
    else {
      const suma = lista.reduce((a, c) => a + Number(c.diferencia || 0), 0);
      cuerpo = '<div class="tabla-env"><table><thead><tr><th>Día</th><th>Local</th><th class="n">Venta</th><th class="n">Saldo teórico</th><th class="n">Arqueo</th><th class="n">Diferencia</th><th>Cerró</th></tr></thead><tbody>' +
        lista.map((c) => { const d = c.diferencia; return '<tr class="clic" data-act="verCaja" data-id="' + h(c.id) + '"><td>' + h(fecha(c.dia)) + '</td><td>' + h(c.local) + '</td><td class="n">' + plata((c.totales || {}).total_cobrado) + '</td><td class="n">' + plata(saldoDe(c)) + '</td><td class="n">' + plata(c.arqueo) + '</td>' +
          '<td class="n ' + (d == null ? '' : d < 0 ? 'dif-faltante' : d > 0 ? 'dif-sobrante' : 'dif-justo') + '">' + (d == null ? 'Sin arqueo' : plata(d)) + '</td><td>' + h(c.tipo_cierre === 'automatico' ? 'Automático' : (c.cerrada_por || '')) + '</td></tr>'; }).join('') +
        '</tbody></table></div><p class="sub" style="margin-top:10px">' + lista.length + ' cierres · diferencia acumulada <b class="' + (suma < 0 ? 'dif-faltante' : suma > 0 ? 'dif-sobrante' : '') + '">' + plata(redondo(suma)) + '</b></p>';
    }
    return '<div class="encabezado"><div><h1>Historial</h1><p class="sub">Cajas cerradas. Tocá una para ver el detalle.</p></div></div>' + filtros + cuerpo;
  }
  function exportarCSV() {
    const lista = S.hist || [];
    const n = (v) => (v == null || v === '' ? '' : String(v).replace('.', ','));
    const q = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const filas = [['Día', 'Local', 'Forma de carga', 'Caja inicial', 'Venta / cobrado', 'Ventas en efectivo', 'Ingresos efectivo', 'Gastos efectivo', 'Retiros efectivo', 'Saldo teórico', 'Arqueo', 'Diferencia', 'Retiro al cierre', 'Destino', 'Queda para mañana', 'Cerró', 'Tipo de cierre', 'Observación']];
    lista.forEach((c) => { const t = c.totales || {}; filas.push([c.dia, c.local, c.modo_carga === 'totales' ? 'Totales al cierre' : 'Cobro por cobro', n(c.caja_inicial), n(t.total_cobrado), n(t.efectivo_ventas), n(t.ingresos_efectivo), n(t.gastos_efectivo), n(t.retiros_efectivo), n(saldoDe(c)), n(c.arqueo), n(c.diferencia), n(c.retiro_cierre), c.retiro_destino || '', n(c.queda_para_manana), c.cerrada_por || '', c.tipo_cierre === 'automatico' ? 'Automático' : 'Manual', c.observacion || '']); });
    const csv = '﻿' + filas.map((f) => f.map(q).join(';')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = 'caja-' + S.histFiltro.desde + '-a-' + S.histFiltro.hasta + '.csv';
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  async function verCaja(id) {
    try {
      const c = await rpc('detalle', { p_comercio: S.comercio.id, p_caja: id });
      abrirHoja((c.local || '') + ' · ' + fecha(c.dia, true), c.estado === 'cerrada' ? vistaCerrada(c, true, true) : '<div class="tarjeta">' + renglon('Cobrado', (c.totales || {}).total_cobrado) + renglon('Efectivo que debería haber', (c.totales || {}).saldo_teorico) + '</div>' + (c.movimientos || []).map((m) => filaMov(m, false)).join(''));
    } catch (e) { avisar(e.message); }
  }
  async function hojaArqueoTardio(id) {
    try {
      const c = await rpc('detalle', { p_comercio: S.comercio.id, p_caja: id });
      if (!S.cfg) S.cfg = await rpc('config', { p_comercio: S.comercio.id });
      const totales = c.modo_carga === 'totales';
      abrirHoja('Arqueo de ' + (c.local || '') + ' · ' + fecha(c.dia, true), '<form data-form="arqueoTardio" data-id="' + h(id) + '" data-modo="' + h(c.modo_carga) + '"><div class="error"></div>' +
        '<p class="sub" style="margin-bottom:14px">La caja se cerró sola a las ' + hora(c.cerrada_at) + '. Se puede cargar el conteo una sola vez.</p>' +
        (totales ? '<label class="campo"><span>Venta total del sistema</span><input class="entrada" name="venta" inputmode="decimal" required></label>' +
          S.cfg.medios.filter((m) => m !== 'Efectivo').map((m) => '<label class="campo"><span>' + h(m) + '</span><input class="entrada" name="otro" data-medio="' + h(m) + '" inputmode="decimal" placeholder="0"></label>').join('') : '') +
        '<label class="campo"><span>Efectivo contado</span><input class="entrada grande" name="arqueo" inputmode="decimal" required></label>' +
        '<label class="campo"><span>Queda en la caja para el día siguiente</span><input class="entrada" name="queda" inputmode="decimal" required></label>' +
        '<button class="btn prim ancho">Guardar arqueo</button></form>');
    } catch (e) { avisar(e.message); }
  }

  // ---------------- configuración ----------------
  function editorLista(clave, valores, fijo) {
    return '<div class="chips" data-lista="' + clave + '">' + valores.map((v) => (fijo && v === fijo)
      ? '<span class="chip fijo">' + h(v) + ' · siempre</span>'
      : '<span class="chip quitable" data-valor="' + h(v) + '">' + h(v) + '<button type="button" data-act="quitarItem" aria-label="Quitar ' + h(v) + '">×</button></span>').join('') + '</div>' +
      '<div class="fila" style="margin:-4px 0 14px"><input class="entrada" data-nuevo="' + clave + '" maxlength="40" placeholder="Agregar…" style="min-height:40px"><button type="button" class="btn chico" data-act="agregarItem" data-lista="' + clave + '">Agregar</button></div>';
  }
  function vistaConfig(c) {
    const disp = '<div class="tarjeta"><h2>Este equipo</h2><p class="sub" style="margin:4px 0 12px">Se guarda solo en este ' + nombreMedio(S.medio) + '.</p>' +
      '<label class="campo"><span>Local</span><select data-act-change="cambiarLocal">' + c.locales.filter((l) => l.activo).map((l) => '<option value="' + h(l.id) + '"' + (l.id === S.local.id ? ' selected' : '') + '>' + h(l.nombre) + '</option>').join('') + '</select></label>' +
      '<span class="etiqueta">Vista</span><div class="chips">' + [['', 'Automática'], ['telefono', 'Teléfono'], ['pc', 'PC']].map((o) => '<button type="button" class="chip" data-act="fijarVista" data-valor="' + o[0] + '" aria-pressed="' + ((leer('caja.vista') || '') === o[0]) + '">' + o[1] + '</button>').join('') + '</div>' +
      '<p class="ayuda" style="margin:-6px 0 12px">Ahora: ' + nombreMedio(S.medio) + (leer('caja.vista') ? ' (elegido a mano)' : ' (detectado solo)') + '.</p>' +
      '<button class="btn chico" data-act="salirCuenta">Cerrar sesión de la cuenta</button></div>';
    const general = '<form class="tarjeta" data-form="configGeneral"><h2>Comercio</h2><div class="error" style="margin-top:10px"></div>' +
      '<label class="campo" style="margin-top:12px"><span>Nombre</span><input name="nombre" maxlength="80" value="' + h(c.nombre) + '" required></label>' +
      '<span class="etiqueta">¿Cómo se cargan las ventas?</span><div class="pila" style="margin:6px 0 14px">' +
      '<label class="check"><input type="radio" name="modo" value="cobro"' + (c.modo_carga === 'cobro' ? ' checked' : '') + '><span><b>Cobro por cobro</b> — cada venta con su medio de pago</span></label>' +
      '<label class="check"><input type="radio" name="modo" value="totales"' + (c.modo_carga === 'totales' ? ' checked' : '') + '><span><b>Totales al cierre</b> — venta total del sistema y otros medios</span></label></div>' +
      '<div class="dos"><label class="campo"><span>Cierre automático</span><input type="time" name="hora" value="' + h(c.hora_cierre) + '" required></label>' +
      '<label class="campo"><span>Caja inicial habitual</span><input name="habitual" inputmode="decimal" value="' + h(montoTexto(c.caja_inicial_habitual)) + '"></label></div>' +
      '<label class="check" style="margin-bottom:14px"><input type="checkbox" name="desdeCierre"' + (c.inicial_desde_cierre ? ' checked' : '') + '><span>Sugerir como caja inicial lo que quedó en el último cierre</span></label>' +
      '<button class="btn prim">Guardar</button><p class="ayuda" style="margin-top:8px">La forma de carga nueva se usa desde la próxima caja que se abra.</p></form>';
    const listas = '<form class="tarjeta" data-form="configListas"><h2>Medios y categorías</h2><div class="error" style="margin-top:10px"></div>' +
      '<p class="etiqueta" style="margin-top:12px">Medios de pago</p>' + editorLista('medios', c.medios, 'Efectivo') +
      '<p class="etiqueta">Categorías de gasto</p>' + editorLista('categorias_gasto', c.categorias_gasto) +
      '<p class="etiqueta">Tipos de retiro</p>' + editorLista('tipos_retiro', c.tipos_retiro) +
      '<p class="etiqueta">Tipos de ingreso</p>' + editorLista('categorias_ingreso', c.categorias_ingreso) +
      '<button class="btn prim">Guardar listas</button></form>';
    const locales = '<div class="tarjeta"><div class="fila entre"><h2>Locales</h2><button class="btn chico" data-act="editarLocal" data-id="">+ Agregar</button></div><ul class="lista" style="margin-top:6px">' +
      c.locales.map((l) => '<li><span><b>' + h(l.nombre) + '</b>' + (l.activo ? '' : ' <span class="estado">Inactivo</span>') + '</span><button class="btn chico" data-act="editarLocal" data-id="' + h(l.id) + '">Editar</button></li>').join('') + '</ul></div>';
    const nombresLocal = (ids) => !ids || !ids.length ? 'Todos los locales' : ids.map((id) => (c.locales.find((l) => l.id === id) || {}).nombre).filter(Boolean).join(', ');
    const personas = '<div class="tarjeta"><div class="fila entre"><h2>Personas y PIN</h2><button class="btn chico" data-act="editarPersona" data-id="">+ Agregar</button></div><ul class="lista" style="margin-top:6px">' +
      c.personas.map((p) => '<li><span><b>' + h(p.nombre) + '</b>' + (p.activo ? '' : ' <span class="estado">Inactiva</span>') + '<br><span class="sub">' + h(ROL[p.rol] || '') + ' · ' + h(nombresLocal(p.locales)) + (p.gasto_maximo != null ? ' · tope ' + plata(p.gasto_maximo) : '') + '</span></span><button class="btn chico" data-act="editarPersona" data-id="' + h(p.id) + '">Editar</button></li>').join('') + '</ul></div>';
    const fotos = '<div class="tarjeta suave"><h2>Fotos antes del cierre</h2><p class="sub" style="margin-top:6px">Próximamente: pedir fotos del efectivo contado y de los comprobantes, y bloquear el cierre si faltan.</p></div>';
    return '<div class="encabezado"><div><h1>Configuración</h1><p class="sub">' + h(c.nombre) + '</p></div></div><div class="config-grid"><div>' + general + listas + '</div><div>' + personas + locales + disp + fotos + '</div></div>';
  }
  function hojaLocal(id) {
    const l = id ? S.cfg.locales.find((x) => x.id === id) : null;
    abrirHoja(l ? 'Editar local' : 'Nuevo local', '<form data-form="local" data-id="' + h(id || '') + '"><div class="error"></div>' +
      '<label class="campo"><span>Nombre</span><input name="nombre" maxlength="60" value="' + h(l ? l.nombre : '') + '" required autofocus></label>' +
      (l ? '<label class="check" style="margin-bottom:14px"><input type="checkbox" name="activo"' + (l.activo ? ' checked' : '') + '><span>Activo (se puede abrir caja)</span></label>' : '') +
      '<button class="btn prim ancho">Guardar</button></form>');
  }
  function hojaPersona(id) {
    const p = id ? S.cfg.personas.find((x) => x.id === id) : null;
    const locs = S.cfg.locales.filter((l) => l.activo);
    abrirHoja(p ? 'Editar persona' : 'Nueva persona', '<form data-form="persona" data-id="' + h(id || '') + '"><div class="error"></div>' +
      '<label class="campo"><span>Nombre</span><input name="nombre" maxlength="60" value="' + h(p ? p.nombre : '') + '" required autofocus></label>' +
      '<label class="campo"><span>Rol</span><select name="rol">' + ['cajero', 'encargado', 'dueno'].map((r) => '<option value="' + r + '"' + ((p ? p.rol : 'cajero') === r ? ' selected' : '') + '>' + ROL[r] + '</option>').join('') + '</select></label>' +
      '<span class="etiqueta">Locales donde trabaja</span><p class="ayuda">Sin marcar ninguno = todos.</p><div class="pila" style="margin:6px 0 14px">' +
      locs.map((l) => '<label class="check"><input type="checkbox" name="loc" value="' + h(l.id) + '"' + (p && p.locales.indexOf(l.id) >= 0 ? ' checked' : '') + '><span>' + h(l.nombre) + '</span></label>').join('') + '</div>' +
      '<div class="dos"><label class="campo"><span>' + (p ? 'PIN nuevo' : 'PIN') + ' (4 números)</span><input name="pin" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="off"' + (p ? ' placeholder="Sin cambios"' : ' required') + '></label>' +
      '<label class="campo"><span>Tope por gasto</span><input name="tope" inputmode="decimal" value="' + h(p && p.gasto_maximo != null ? montoTexto(p.gasto_maximo) : '') + '" placeholder="Sin tope"><small>Solo para cajeros.</small></label></div>' +
      (p ? '<label class="check" style="margin-bottom:14px"><input type="checkbox" name="activo"' + (p.activo ? ' checked' : '') + '><span>Activa (puede entrar con su PIN)</span></label>' : '') +
      '<button class="btn prim ancho">Guardar</button></form>');
  }

  // ---------------- menús ----------------
  function hojaMenu() {
    const p = S.op && S.op.persona;
    const items = [];
    if (p) items.push('<button class="opcion" data-act="cambiarPersona"><span><b>Cambiar de persona</b><small>Ahora: ' + h(p.nombre) + '</small></span><span>›</span></button>');
    if (esDuenoCuenta()) {
      items.push('<button class="opcion" data-act="ir" data-vista="hoy"><span><b>Hoy en los locales</b><small>Panel del dueño' + (panelHabilitado() ? '' : ' · pide PIN') + '</small></span><span>›</span></button>');
      items.push('<button class="opcion" data-act="ir" data-vista="historial"><span><b>Historial</b><small>Cierres anteriores y descarga para Excel</small></span><span>›</span></button>');
      items.push('<button class="opcion" data-act="ir" data-vista="config"><span><b>Configuración</b><small>Medios, personas, locales</small></span><span>›</span></button>');
    }
    if (PRE) items.push('<a class="opcion" href="../"><span><b>Volver a GESTLOK</b><small>El inicio de tu empresa</small></span><span>›</span></a>');
    items.push('<button class="opcion" data-act="menuVista"><span><b>Vista</b><small>' + h(nombreMedio(S.medio)) + (leer('caja.vista') ? ' (elegida a mano)' : ' (detectada sola)') + '</small></span><span>›</span></button>');
    abrirHoja('Menú', items.join(''));
  }
  function hojaVista() {
    const actual = leer('caja.vista') || '';
    abrirHoja('Vista', '<p class="sub" style="margin-bottom:12px">La caja detecta sola si se abrió en un teléfono o en una PC. Si querés, elegila a mano para este equipo.</p>' +
      [['', 'Automática', 'Detectada: ' + nombreMedio(detectarMedioAuto())], ['telefono', 'Teléfono', 'Botones grandes y todo en una columna'], ['pc', 'PC', 'Menú lateral, dos columnas y atajos de teclado']]
        .map((o) => '<button class="opcion" data-act="fijarVista" data-valor="' + o[0] + '"><span><b>' + o[1] + (actual === o[0] ? ' ✓' : '') + '</b><small>' + h(o[2]) + '</small></span></button>').join(''));
  }
  function detectarMedioAuto() { const f = leer('caja.vista'); guardar('caja.vista', null); const m = detectarMedio(); guardar('caja.vista', f); return m; }

  // ---------------- acciones (clics) ----------------
  const A = {
    cerrarHoja: () => cerrarHoja(),
    reintentar: () => { S.personas = null; if (S.vista === 'config') S.cfg = null; arrancar(); },
    acceso: (b) => { S.acceso = b.dataset.modo; pintar(); },
    google: async () => {
      const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: SITE, queryParams: { prompt: 'select_account' } } });
      if (error) avisar(/not enabled/i.test(error.message) ? 'El ingreso con Google no está activado. Entrá con email y contraseña.' : 'No se pudo entrar con Google.');
    },
    salirCuenta: async () => { await salirOp(); S.panel = null; S.personas = null; S.cfg = null; guardar('caja.dispositivo', null); await sb.auth.signOut(); cerrarHoja(); S.acceso = 'entrar'; arrancar(); },
    nuevoComercio: () => { S.creando = true; pintar(); },
    cancelarCrear: () => { S.creando = false; pintar(); },
    elegirComercio: (b) => { S.comercio = S.comercios.find((c) => c.id === b.dataset.id) || null; S.local = S.comercio && S.comercio.locales.length === 1 ? S.comercio.locales[0] : null; if (S.comercio && S.local) guardar('caja.dispositivo', { comercio_id: S.comercio.id, local_id: S.local.id }); S.personas = null; pintar(); },
    elegirLocal: (b) => { S.local = S.comercio.locales.find((l) => l.id === b.dataset.id); guardar('caja.dispositivo', { comercio_id: S.comercio.id, local_id: S.local.id }); S.personas = null; pintar(); },
    elegirPersona: (b) => {
      S.pinPersona = (S.personas || []).find((p) => p.id === b.dataset.id); S.pin = '';
      if (S.pinModo === 'panel') pintarHojaPin((S.personas || []).filter((p) => p.rol === 'dueno')); else pintar();
    },
    otraPersona: () => { S.pinPersona = null; S.pin = ''; pintar(); },
    tecla: (b) => tecla(b.dataset.k),
    cambiarPersona: async () => { cerrarHoja(); await salirOp(); S.personas = null; S.vista = 'caja'; pintar(); },
    menu: () => hojaMenu(),
    menuVista: () => hojaVista(),
    fijarVista: (b) => { guardar('caja.vista', b.dataset.valor || null); cerrarHoja(); aplicarMedio(); pintar(); avisar('Vista: ' + nombreMedio(S.medio)); },
    ir: (b) => {
      const v = b.dataset.vista;
      cerrarHoja();
      if (v === 'caja') { S.vista = 'caja'; if (S.op) cargarEstado().then(pintar, pintar); return pintar(); }
      if (!panelHabilitado()) return pedirPinDueno(v);
      S.vista = v; window.scrollTo(0, 0); pintar();
    },
    abrirOtro: () => { const d = document.getElementById('abrir-otro'); d.classList.remove('oculto'); d.querySelector('input').focus(); },
    nuevoMov: (b) => hojaMovimiento(b.dataset.tipo),
    chip: (b) => { const g = b.closest('[data-grupo]'); g.querySelectorAll('.chip').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); },
    chipDestino: (b) => { S.cierre.destino = b.dataset.valor; b.closest('[data-grupo]').querySelectorAll('.chip').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); },
    verMov: (b) => hojaVerMov(b.dataset.id),
    anularMov: (b) => hojaAnular(b.dataset.id),
    corregirMov: (b) => hojaCorregir(b.dataset.id),
    verTodos: () => { S.listaCompleta = true; pintar(); },
    iniciarCierre: () => iniciarCierre(),
    cierreAtras: () => { if (S.cierre.paso === 1) { S.cierre = null; } else { S.cierre.paso -= 1; } pintar(); },
    cierreSigue: () => cierreSigue(),
    verCaja: (b) => verCaja(b.dataset.id),
    arqueoTardio: (b) => hojaArqueoTardio(b.dataset.id),
    exportar: () => exportarCSV(),
    quitarItem: (b) => b.closest('.chip').remove(),
    agregarItem: (b) => {
      const clave = b.dataset.lista, inp = app.querySelector('[data-nuevo="' + clave + '"]'), v = inp.value.trim();
      if (v.length < 2) return;
      const cont = app.querySelector('[data-lista="' + clave + '"]');
      if ([...cont.querySelectorAll('[data-valor]')].some((x) => x.dataset.valor.toLowerCase() === v.toLowerCase()) || (clave === 'medios' && v.toLowerCase() === 'efectivo')) { inp.value = ''; return; }
      cont.insertAdjacentHTML('beforeend', '<span class="chip quitable" data-valor="' + h(v) + '">' + h(v) + '<button type="button" data-act="quitarItem" aria-label="Quitar ' + h(v) + '">×</button></span>');
      inp.value = ''; inp.focus();
    },
    editarLocal: (b) => hojaLocal(b.dataset.id),
    editarPersona: (b) => hojaPersona(b.dataset.id),
  };

  // ---------------- formularios ----------------
  const F = {
    entrar: async (f) => {
      const { error } = await sb.auth.signInWithPassword({ email: f.email.value.trim().toLowerCase(), password: f.clave.value });
      if (error) throw new Error(/Invalid login/i.test(error.message) ? 'Email o contraseña incorrectos.' : /not confirmed/i.test(error.message) ? 'Confirmá tu email con el enlace que te mandamos.' : 'No se pudo entrar. Probá de nuevo.');
      await arrancar();
    },
    crearCuenta: async (f) => {
      const { data, error } = await sb.auth.signUp({ email: f.email.value.trim().toLowerCase(), password: f.clave.value, options: { emailRedirectTo: SITE } });
      if (error) throw new Error(/registered|already/i.test(error.message) ? 'Ese email ya tiene cuenta. Entrá o recuperá la contraseña.' : /password/i.test(error.message) ? 'Elegí una contraseña más segura (mínimo 8 caracteres).' : 'No se pudo crear la cuenta.');
      if (data && data.session) return arrancar();
      S.acceso = 'Listo. Te mandamos un email para confirmar la cuenta: abrí el enlace y después entrá.'; pintar();
    },
    olvide: async (f) => {
      const { error } = await sb.auth.resetPasswordForEmail(f.email.value.trim().toLowerCase(), { redirectTo: SITE });
      if (error) throw new Error('No se pudo enviar el email. Probá en unos minutos.');
      S.acceso = 'Si el email tiene cuenta, te llega un enlace para elegir una contraseña nueva.'; pintar();
    },
    nuevaClave: async (f) => {
      const { error } = await sb.auth.updateUser({ password: f.clave.value });
      if (error) throw new Error('No se pudo guardar. Elegí otra contraseña (mínimo 8 caracteres).');
      S.recuperar = false; avisar('Contraseña actualizada.'); await arrancar();
    },
    crearComercio: async (f) => {
      if (f.pin.value !== f.pin2.value) throw new Error('Los dos PIN no coinciden.');
      const r = await rpc('crear_comercio', { p_nombre: f.nombre.value.trim(), p_local: f.local.value.trim(), p_mi_nombre: f.yo.value.trim(), p_mi_pin: f.pin.value });
      guardar('caja.dispositivo', { comercio_id: r.comercio_id, local_id: r.local_id });
      S.creando = false; S.personas = null;
      const pin = f.pin.value;
      await arrancar();
      try {
        const e = await rpc('entrar', { p_local: r.local_id, p_persona: r.persona_id, p_pin: pin });
        if (e && e.ok) { S.op = { token: e.token, persona: e.persona, local_id: r.local_id, comercio_id: r.comercio_id, user_id: S.user.id, hasta: Date.now() + 13.5 * 3600e3 }; guardar('caja.op', S.op); await cargarEstado(); pintar(); }
      } catch (x) { /* entra con el PIN desde la pantalla */ }
    },
    abrir: async (f) => abrirCaja(Number(f.dataset.monto || 0), true),
    abrirOtro: async (f) => {
      const monto = parseMonto(f.monto.value);
      if (isNaN(monto)) throw new Error('Escribí el efectivo que hay en la caja.');
      await abrirCaja(monto, false);
    },
    movimiento: async (f) => {
      const tipo = f.dataset.tipo, monto = parseMonto(f.monto.value);
      if (isNaN(monto) || monto <= 0) throw new Error('Escribí el importe.');
      const categoria = elegido(f, 'categoria'), medio = elegido(f, 'medio');
      if (tipo !== 'cobro' && !categoria) throw new Error(tipo === 'retiro' ? 'Elegí el tipo de retiro.' : 'Elegí la categoría.');
      if (!medio) throw new Error('Elegí el medio.');
      const r = await rpc('registrar', { p_token: S.op.token, p_caja: S.estado.caja.id, p_operacion: f.dataset.op, p_tipo: tipo, p_medio: medio, p_monto: monto, p_categoria: categoria, p_detalle: f.detalle.value.trim() });
      S.estado.caja = r.caja; cerrarHoja(); pintar();
      avisar((r.repetida ? 'Ya estaba guardado: ' : TIPO[tipo].t + ' guardado: ') + plata(monto));
    },
    anular: async (f) => {
      const motivo = elegido(f, 'motivo');
      if (!motivo) throw new Error('Elegí el motivo.');
      const r = await rpc('anular', { p_token: S.op.token, p_caja: S.estado.caja.id, p_movimiento: f.dataset.id, p_motivo: motivo, p_comentario: f.comentario.value.trim() || null });
      S.estado.caja = r.caja; cerrarHoja(); pintar(); avisar('Movimiento anulado.');
    },
    corregir: async (f) => {
      const monto = parseMonto(f.monto.value), medio = elegido(f, 'medio'), motivo = elegido(f, 'motivo');
      if (isNaN(monto) || monto <= 0) throw new Error('Escribí el importe correcto.');
      if (!motivo) throw new Error('Elegí el motivo.');
      const r = await rpc('corregir', { p_token: S.op.token, p_caja: S.estado.caja.id, p_movimiento: f.dataset.id, p_operacion: f.dataset.op, p_medio: medio, p_monto: monto, p_motivo: motivo });
      S.estado.caja = r.caja; cerrarHoja(); pintar(); avisar('Corrección guardada.');
    },
    filtroHist: async (f) => {
      if (f.hasta.value < f.desde.value) throw new Error('La fecha «hasta» es anterior a «desde».');
      S.histFiltro = { desde: f.desde.value, hasta: f.hasta.value, local: f.local.value };
      tocarPanel(); await pantallaPanel();
    },
    arqueoTardio: async (f) => {
      const arqueo = parseMonto(f.arqueo.value), queda = parseMonto(f.queda.value);
      if (isNaN(arqueo) || isNaN(queda)) throw new Error('Revisá los importes.');
      let venta = null, otros = null;
      if (f.dataset.modo === 'totales') {
        venta = parseMonto(f.venta.value); otros = {};
        if (isNaN(venta)) throw new Error('Cargá la venta total del sistema.');
        f.querySelectorAll('[name="otro"]').forEach((i) => { const v = parseMonto(i.value); if (!isNaN(v) && v > 0) otros[i.dataset.medio] = v; });
      }
      await rpc('completar_arqueo', { p_comercio: S.comercio.id, p_caja: f.dataset.id, p_arqueo: arqueo, p_venta_total: venta, p_otros: otros, p_queda: queda });
      cerrarHoja(); avisar('Arqueo guardado.'); tocarPanel(); await pantallaPanel();
    },
    configGeneral: async (f) => {
      const habitual = f.habitual.value.trim() === '' ? 0 : parseMonto(f.habitual.value);
      if (isNaN(habitual)) throw new Error('Revisá la caja inicial habitual.');
      S.cfg = await rpc('guardar_config', { p_comercio: S.comercio.id, p_config: { nombre: f.nombre.value.trim(), modo_carga: f.modo.value, hora_cierre: f.hora.value.slice(0, 5), caja_inicial_habitual: habitual, inicial_desde_cierre: f.desdeCierre.checked } });
      S.comercio.nombre = S.cfg.nombre; tocarPanel(); app.innerHTML = marco(vistaConfig(S.cfg)); avisar('Guardado.');
    },
    configListas: async (f) => {
      const lista = (k) => [...f.querySelectorAll('[data-lista="' + k + '"] [data-valor]')].map((x) => x.dataset.valor);
      S.cfg = await rpc('guardar_config', { p_comercio: S.comercio.id, p_config: { medios: ['Efectivo'].concat(lista('medios')), categorias_gasto: lista('categorias_gasto'), tipos_retiro: lista('tipos_retiro'), categorias_ingreso: lista('categorias_ingreso') } });
      tocarPanel(); app.innerHTML = marco(vistaConfig(S.cfg)); avisar('Listas guardadas.');
    },
    local: async (f) => {
      S.cfg = await rpc('guardar_local', { p_comercio: S.comercio.id, p_id: f.dataset.id || null, p_nombre: f.nombre.value.trim(), p_activo: f.activo ? f.activo.checked : true });
      S.comercios = (await rpc('mis_comercios')) || S.comercios; S.comercio = S.comercios.find((c) => c.id === S.comercio.id) || S.comercio;
      cerrarHoja(); tocarPanel(); app.innerHTML = marco(vistaConfig(S.cfg)); avisar('Local guardado.');
    },
    persona: async (f) => {
      const pin = f.pin.value.trim(), tope = f.tope.value.trim() === '' ? null : parseMonto(f.tope.value);
      if (pin && !/^[0-9]{4}$/.test(pin)) throw new Error('El PIN tiene que tener 4 números.');
      if (tope != null && isNaN(tope)) throw new Error('Revisá el tope de gasto.');
      S.cfg = await rpc('guardar_persona', { p_comercio: S.comercio.id, p_id: f.dataset.id || null, p_nombre: f.nombre.value.trim(), p_rol: f.rol.value,
        p_locales: [...f.querySelectorAll('[name="loc"]:checked')].map((x) => x.value), p_pin: pin || null, p_activo: f.activo ? f.activo.checked : true, p_gasto_maximo: tope });
      S.personas = null; cerrarHoja(); tocarPanel(); app.innerHTML = marco(vistaConfig(S.cfg)); avisar('Persona guardada.');
    },
  };
  async function abrirCaja(monto, coincide) {
    const r = await rpc('abrir', { p_token: S.op.token, p_caja_inicial: monto, p_coincide: coincide });
    S.estado.caja = r.caja;
    if (!r.nueva) avisar('La caja ya la había abierto otra persona.');
    pintar();
  }
  async function enviar(form, fn, ev) {
    if (form.dataset.enviando) return;
    form.dataset.enviando = '1';
    const btns = form.querySelectorAll('button:not([type=button])');
    btns.forEach((b) => { b.disabled = true; });
    const err = form.querySelector('.error');
    if (err) err.textContent = '';
    try { await fn(form, ev); }
    catch (e) {
      if (e.sesion) { cerrarHoja(); pintar(); avisar(e.message); return; }
      if (err) err.textContent = e.message || 'No se pudo completar.'; else avisar(e.message);
    } finally { delete form.dataset.enviando; btns.forEach((b) => { b.disabled = false; }); }
  }

  // ---------------- eventos ----------------
  document.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-act]');
    if (!b || b.disabled) return;
    const fn = A[b.dataset.act];
    if (!fn) return;
    ev.preventDefault();
    Promise.resolve(fn(b, ev)).catch((e) => avisar(e.message || 'No se pudo completar.'));
  });
  document.addEventListener('submit', (ev) => {
    const f = ev.target.closest('form[data-form]');
    if (!f) return;
    ev.preventDefault();
    const fn = F[f.dataset.form];
    if (fn) enviar(f, fn, ev);
  });
  document.addEventListener('input', (ev) => {
    const t = ev.target;
    if (t.dataset && t.dataset.cierre && S.cierre) {
      const k = t.dataset.cierre;
      if (k === 'otros') S.cierre.otros[t.dataset.medio] = t.value;
      else if (k === 'verif') S.cierre.verif[t.dataset.medio] = t.checked;
      else S.cierre[k] = t.value;
      actualizarCierreVivo();
    }
  });
  document.addEventListener('change', (ev) => {
    const t = ev.target;
    if (t.dataset && t.dataset.cierre === 'verif' && S.cierre) S.cierre.verif[t.dataset.medio] = t.checked;
    if (t.dataset && t.dataset.actChange === 'cambiarLocal') {
      const l = S.comercio.locales.find((x) => x.id === t.value);
      if (!l) return;
      S.local = l; guardar('caja.dispositivo', { comercio_id: S.comercio.id, local_id: l.id });
      salirOp(); S.personas = null; avisar('Este equipo ahora es del local ' + l.nombre + '.');
    }
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && hojaAbierta()) { cerrarHoja(); return; }
    const enCampo = /^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName || '');
    // PIN con el teclado físico (pantalla o hoja de PIN del dueño)
    if (!enCampo && S.pinPersona && raizPin().querySelector('#puntos')) {
      if (/^[0-9]$/.test(ev.key)) { ev.preventDefault(); tecla(ev.key); return; }
      if (ev.key === 'Backspace') { ev.preventDefault(); tecla('⌫'); return; }
    }
    if (enCampo && ev.key === 'Enter' && S.cierre && document.activeElement.dataset.cierre && document.activeElement.tagName === 'INPUT') { ev.preventDefault(); cierreSigue(); return; }
    // Atajos en PC con la caja abierta
    if (enCampo || hojaAbierta() || ev.ctrlKey || ev.metaKey || ev.altKey || S.cierre || S.vista !== 'caja') return;
    const c = S.estado && S.estado.caja;
    if (!c || c.estado !== 'abierta') return;
    const tipo = { c: 'cobro', g: 'gasto', i: 'ingreso', r: 'retiro' }[ev.key.toLowerCase()];
    if (!tipo || (tipo === 'cobro' && c.modo_carga !== 'cobro')) return;
    ev.preventDefault(); hojaMovimiento(tipo);
  });
  let rz = 0;
  window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (aplicarMedio() && !S.cierre) pintar(); else if (S.cierre) aplicarMedio(); }, 200); });
  // Mantener la caja al día si hay otro equipo cargando (cada minuto y al volver a la app).
  function refrescar() {
    const enCampo = /^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName || '');
    if (document.visibilityState !== 'visible' || !S.op || hojaAbierta() || S.cierre || S.vista !== 'caja' || enCampo || S.ocupado) return;
    if (Date.now() > S.op.hasta) { olvidarOp(); pintar(); return; }
    cargarEstado().then(pintar, () => { if (!S.op) pintar(); });
  }
  setInterval(refrescar, 60e3);
  document.addEventListener('visibilitychange', refrescar);

  sb.auth.onAuthStateChange((evento, sesion) => {
    if (evento === 'PASSWORD_RECOVERY') { S.recuperar = true; setTimeout(pintar, 0); return; }
    const nuevo = sesion ? sesion.user.id : null, antes = S.user ? S.user.id : null;
    if (evento !== 'INITIAL_SESSION' && nuevo !== antes) setTimeout(arrancar, 0);
  });

  aplicarMedio();
  arrancar().catch((e) => pintarFalla(e));
  window.__caja = { S, detectarMedio, parseMonto };
})();

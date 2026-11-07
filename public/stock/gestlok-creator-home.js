/* Inicio de la creadora: panel prolijo con el resumen de toda la plataforma.
   Es de SOLO LECTURA y exclusivo de la administradora: los datos los entrega la función
   gestlok_creator_dashboard, que el servidor limita a la cuenta kmu15lopez@gmail.com verificada.
   Si la función no responde o rechaza el acceso, app.js muestra el panel anterior (falla cerrada). */
(() => {
  'use strict';
  const TAB_KEY = 'gestlok-admin-tab';
  const TABS = Object.freeze([
    ['inicio', 'Inicio', '<path d="m4 11 8-7 8 7v9H4z"/><path d="M10 20v-6h4v6"/>'],
    ['empresas', 'Empresas', '<path d="M4 20V8l8-4 8 4v12"/><path d="M9 20v-6h6v6M9 10h.01M15 10h.01"/>'],
    ['usuarios', 'Usuarios', '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>'],
    ['empleados', 'Empleados', '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.6 2.7-6 6-6s6 2.4 6 6"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.2c3 .1 5 2 5 5.3"/>'],
    ['locales', 'Locales', '<path d="M5 9l1.5-5h11L19 9z"/><path d="M6 9v11h12V9M10 20v-5h4v5"/>'],
    ['resenas', 'Reseñas GESTLOK', '<path d="M4 5h16v14H4z"/><path d="M8 10h8M8 14h5"/>'],
    ['nfc', 'NFC y QR', '<rect x="5" y="3" width="10" height="18" rx="2"/><path d="M9 18h2M18 9a4 4 0 0 1 0 6M20.5 7a7.5 7.5 0 0 1 0 10"/>'],
    ['herramientas', 'Herramientas', '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>']
  ]);
  const ACTIONS = Object.freeze({
    module_enabled: ['Empleados habilitado', 'ok'], module_disabled: ['Empleados deshabilitado', 'warn'],
    recibonet_linked: ['Empresa vinculada con Empleados', 'ok'], employee_space_created: ['Espacio de empleados creado', 'ok'],
    editing_enabled: ['Edición habilitada', 'warn'], editing_disabled: ['Edición cerrada', 'ok'],
    support_view_opened: ['Consulta de empresa abierta', 'info'], support_view_closed: ['Consulta de empresa cerrada', 'info'],
    login: ['Ingreso', 'user']
  });
  let api, data = null, status = 'idle', busy = false, timer = 0, tab = 'inicio';
  let couponRows = {munro:null,torcuato:null}, couponBusy=false, couponError='', couponAttempted=false;
  // Preferencia global, persistida en base y controlada por la creadora.
  // Predeterminado: oculto. Nunca se guarda como una preferencia de navegador.
  let diarioVisible=false, diarioLoaded=false, diarioLoading=false, diarioBusy=false;
  let diarioError='', diarioUser='';
  function dailyVisible(){return diarioLoaded && diarioVisible;}
  async function refreshDaily(force=false){
    const id=String(api?.S?.uid||api?.S?.me?.id||'');
    if(!id || !window.GestLokSupabase?.rpc)return;
    if(id!==diarioUser){
      diarioUser=id;diarioVisible=false;diarioLoaded=false;
    }
    if(diarioLoading||diarioBusy||(!force&&diarioLoaded))return;
    diarioLoading=true;
    try {
      const res=await window.GestLokSupabase.rpc('gestlok_mi_gusto_daily_visibility');
      if(res.error)throw res.error;
      if(diarioUser!==id)return;
      diarioVisible=res.data===true;diarioLoaded=true;diarioError='';
    } catch(e){
      if(diarioUser!==id)return;
      diarioVisible=false;diarioLoaded=true;
      diarioError='No se pudo consultar el estado. Conteo diario continúa oculto.';
    } finally {
      diarioLoading=false;
      if(diarioUser===id){api?.renderLocal?.();api?.render?.();}
    }
  }
  function dailySettingsView(){
    if(!api?.isCreadora?.())return '';
    if(!diarioLoaded&&!diarioLoading)queueMicrotask(()=>refreshDaily());
    return '<section class="gl-admin-card gl-daily-visibility" aria-label="Visibilidad del Conteo diario de Mi Gusto">'+
      '<header><h2>Mi Gusto · Conteo diario</h2><small>Solo la creadora</small></header>'+
      '<p>La planilla y su historial se conservan. Mientras permanezca oculto, no aparece en el menú ni en el inicio de Munro.</p>'+
      '<div class="gl-daily-visibility-row"><span>Mostrar Conteo diario en Munro</span>'+
      '<button type="button" role="switch" data-ch-diario-visibility aria-label="Mostrar Conteo diario en Munro" aria-checked="'+dailyVisible()+'" '+
        ((!diarioLoaded||diarioBusy||diarioLoading)?'disabled':'')+
        '><span aria-hidden="true"></span><b>'+(dailyVisible()?'Visible':'Oculto')+'</b></button></div>'+
      (diarioLoading?'<p role="status">Consultando configuración…</p>':'')+
      (diarioError?'<p role="alert">'+esc(diarioError)+'</p>':'')+
      '<small>La restauración de la pestaña solo puede autorizarse desde esta cuenta de Creadora.</small></section>';
  }
  async function toggleDailyVisibility(){
    if(!api?.isCreadora?.()||!diarioLoaded||diarioBusy)return;
    const next=!diarioVisible;
    if(!window.confirm(next?'¿Restablecer la visualización de Conteo diario en Mi Gusto Munro?':'¿Ocultar Conteo diario sin borrar ningún dato?'))return;
    diarioBusy=true;diarioError='';api?.render?.();
    try {
      const {data,error}=await window.GestLokSupabase.rpc('gestlok_creator_set_mi_gusto_daily_visibility',{p_visible:next});
      if(error)throw error;
      diarioVisible=data===true;
      diarioLoaded=true;
      api?.toast?.(diarioVisible?'Conteo diario visible nuevamente.':'Conteo diario oculto. Los datos se conservaron.');
    } catch(e){
      diarioError='No se pudo actualizar la visibilidad. '+String(e?.message||'');
    } finally {diarioBusy=false;api?.renderLocal?.();api?.render?.();}
  }
  async function loadCoupons(){if(!api?.isCreadora?.()||couponBusy||!window.GestLokSupabase)return;couponBusy=true;couponAttempted=true;couponError='';try{for(const loc of ['munro','torcuato']){const {data,error}=await window.GestLokSupabase.rpc('gestlok_resenas_list',{p_local:loc});if(error)throw error;couponRows[loc]=Array.isArray(data)?data:[];}}catch{couponError='No se pudieron consultar los cupones. Revisá permisos y conexión.';}finally{couponBusy=false;if(api?.isCreadora?.())api.render();}}
  function couponView(){if(!couponAttempted&&!couponBusy)queueMicrotask(loadCoupons);return '<section class="gl-admin-card" aria-label="Cupones de Mi Gusto"><header><h2>Cupones de Mi Gusto</h2><button type="button" data-ch-coupons-refresh>Actualizar</button></header><p>Munro y Torcuato por separado. Beneficio del 10% independiente de publicar reseñas. La emisión y utilización se realizan desde la sección Reseñas de cada sucursal.</p>'+(couponError?'<p role="alert">'+esc(couponError)+'</p>':'')+['munro','torcuato'].map(loc=>{const a=couponRows[loc]||[];const counts={pending:0,used:0,expired:0};a.forEach(r=>{if(r.status in counts)counts[r.status]++;});return '<article style="border-top:1px solid #ddd;padding:12px 0"><h3>'+ (loc==='munro'?'Munro':'Torcuato') +'</h3><p>Total: '+a.length+' · Pendientes: '+counts.pending+' · Usados: '+counts.used+' · Vencidos: '+counts.expired+'</p><div style="overflow-x:auto"><table><thead><tr><th>Cupón</th><th>Cliente</th><th>Estado</th><th>Fecha</th></tr></thead><tbody>'+a.slice(0,50).map(r=>'<tr><td>'+esc(r.code)+'</td><td>'+esc(r.customer_name)+'</td><td>'+esc(r.status)+'</td><td>'+esc(String(r.created_at||'').slice(0,10))+'</td></tr>').join('')+'</tbody></table></div></article>';}).join('')+'</section>';}

  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const svg = (d, w = 22) => '<svg viewBox="0 0 24 24" width="' + w + '" height="' + w + '" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + d + '</svg>';
  const store = {
    get() { try { return window.sessionStorage.getItem(TAB_KEY) || ''; } catch { return ''; } },
    set(v) { try { window.sessionStorage.setItem(TAB_KEY, v); } catch { /* sin almacenamiento: queda en memoria */ } }
  };
  const validTab = v => TABS.some(t => t[0] === v);
  function ago(iso) {
    const t = Date.parse(iso); if (!Number.isFinite(t)) return '';
    const m = Math.max(0, Math.round((Date.now() - t) / 60000));
    if (m < 2) return 'Ahora';
    if (m < 60) return 'Hace ' + m + ' min';
    const h = Math.round(m / 60); if (h < 24) return 'Hace ' + h + ' h';
    const d = Math.round(h / 24); return 'Hace ' + d + (d === 1 ? ' día' : ' días');
  }
  const ago2 = iso => { const a = ago(iso); return a ? a.replace(/^Hace /, 'hace ').replace(/^Ahora$/, 'recién') : ''; };
  // Fechas «AAAA-MM-DD» (sin hora) se leen tal cual, sin corrimiento de zona horaria.
  const dmy = iso => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    if (m) return m[3] + '/' + m[2];
    try { return new Date(iso).toLocaleDateString('es-AR', {day: '2-digit', month: '2-digit'}); } catch { return ''; }
  };
  const maskMail = v => { const m = String(v || '').toLowerCase().split('@'); return m.length === 2 ? m[0].slice(0, 3) + '***@' + m[1] : ''; };
  function today() {
    const d = new Date();
    return {
      date: d.toLocaleDateString('es-AR', {weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'}).replace(/^./, c => c.toUpperCase()),
      time: d.toLocaleTimeString('es-AR', {hour: '2-digit', minute: '2-digit'})
    };
  }
  async function load() {
    if (!api || busy || !window.GestLokSupabase) return;
    busy = true;
    try {
      const {data: d, error} = await window.GestLokSupabase.rpc('gestlok_creator_dashboard');
      if (error || !d || d.scope !== 'creator_dashboard' || !d.totals || !Array.isArray(d.series)) throw Error('Sin autorización');
      const changed = JSON.stringify(d) !== JSON.stringify(data) || status !== 'ready';
      data = d; status = 'ready';
      if (changed) api.render();
    } catch {
      const changed = status !== 'off';
      data = null; status = 'off';
      if (changed) api.render();
    } finally { busy = false; }
  }
  // Estado visible para app.js: 'ready' | 'loading' | 'off'. La primera consulta se dispara sola.
  function mode() {
    if (!api?.isCreadora?.()) return 'off';
    if (status === 'idle') { status = 'loading'; load(); clearInterval(timer); timer = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 60000); }
    return status === 'ready' ? 'ready' : status === 'off' ? 'off' : 'loading';
  }
  function chart(series) {
    const W = 560, H = 250, L = 40, R = 14, T = 12, B = 30, iw = W - L - R, ih = H - T - B;
    const keys = [['empresas', '#7c4dff'], ['usuarios', '#2f7bf5'], ['empleados', '#27ae60']];
    const max = Math.max(4, ...series.flatMap(p => keys.map(k => num(p[k[0]]))));
    const step = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500].find(s => max / s <= 4) || 1000, top = Math.ceil(max / step) * step;
    const x = i => L + (series.length > 1 ? i * iw / (series.length - 1) : iw / 2), y = v => T + ih - (num(v) / top) * ih;
    let g = '';
    for (let v = 0; v <= top; v += step) g += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="#e7e9f5"/><text x="' + (L - 8) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + v + '</text>';
    series.forEach((p, i) => { g += '<text x="' + x(i) + '" y="' + (H - 8) + '" text-anchor="middle">' + esc(dmy(p.d)) + '</text>'; });
    let lines = '';
    keys.forEach(([k, color], n) => {
      const pts = series.map((p, i) => x(i).toFixed(1) + ',' + y(p[k]).toFixed(1));
      lines += '<defs><linearGradient id="gl-ch-g' + n + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + color + '" stop-opacity=".22"/><stop offset="1" stop-color="' + color + '" stop-opacity="0"/></linearGradient></defs>' +
        '<polygon points="' + x(0).toFixed(1) + ',' + y(0) + ' ' + pts.join(' ') + ' ' + x(series.length - 1).toFixed(1) + ',' + y(0) + '" fill="url(#gl-ch-g' + n + ')"/>' +
        '<polyline points="' + pts.join(' ') + '" fill="none" stroke="' + color + '" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>' +
        series.map((p, i) => '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(p[k]).toFixed(1) + '" r="3.4" fill="#fff" stroke="' + color + '" stroke-width="2"/>').join('');
    });
    const last = series[series.length - 1] || {};
    return '<svg class="gl-ch-chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Crecimiento de la plataforma en los últimos 30 días: ' +
      num(last.empresas) + ' empresas, ' + num(last.usuarios) + ' usuarios y ' + num(last.empleados) + ' personas en Empleados">' + g + lines + '</svg>';
  }
  function donut(parts, total) {
    const R = 52, C = 2 * Math.PI * R; let off = 0, arcs = '';
    parts.forEach(p => {
      if (!p.n || !total) return;
      const len = C * p.n / total;
      arcs += '<circle cx="70" cy="70" r="' + R + '" fill="none" stroke="' + p.c + '" stroke-width="18" stroke-dasharray="' + (len - 2).toFixed(2) + ' ' + (C - len + 2).toFixed(2) + '" stroke-dashoffset="' + (-off).toFixed(2) + '" transform="rotate(-90 70 70)"/>';
      off += len;
    });
    return '<svg class="gl-ch-donut" viewBox="0 0 140 140" role="img" aria-label="' + total + ' personas con acceso"><circle cx="70" cy="70" r="' + R + '" fill="none" stroke="#eceefa" stroke-width="18"/>' + arcs +
      '<text x="70" y="68" text-anchor="middle" class="d1">' + total + '</text><text x="70" y="86" text-anchor="middle" class="d2">personas</text></svg>';
  }
  const kpi = (icon, cls, label, value, foot) => '<article class="gl-ch-kpi"><span class="gl-ch-ico ' + cls + '">' + svg(icon, 26) + '</span><div><small>' + esc(label) + '</small><b>' + esc(value) + '</b><em>' + foot + '</em></div></article>';
  const up = t => '<i aria-hidden="true">↑</i> ' + esc(t);
  // Inicio independiente de la cuenta creadora: accesos reales, sin métricas invasivas.
  // Las operaciones siguen delegadas a los módulos existentes y a sus permisos.
  function home(p) {
    const indexed=Array.isArray(p.companies)?p.companies:(window.GestLokOwnerAreas?.creatorCompanies?.()||[]);
    const companyRows=indexed.length?indexed:(data.recent_companies||[]);
    // Un registro crea una tarjeta independiente, también para empresas futuras.
    // Los locales se agrupan dentro de su empresa y conservan la apertura autorizada.
    const companies=companyRows.map(c=>{
      const own=c.tenant_id===api.S?.me?.tenant_id;
      const localRows=Array.isArray(c.locals)?c.locals:[];
      const n=Array.isArray(c.locals)?localRows.length:num(c.locals);
      const localCards=localRows.map(l=>{
        const attrs=own?'data-act="local" data-id="'+esc(l.id)+'"':
          'data-company-local="'+esc(l.id)+'" data-company-tenant="'+esc(c.tenant_id)+'" data-company-name="'+esc(c.name)+'"';
        return '<button type="button" class="gl-ch-quick-local gl-ch-company-local" '+attrs+
          ' aria-label="Abrir el local '+esc(l.name||l.id)+' de '+esc(c.name)+'">'+
          '<span class="gl-ch-quick-icon">'+svg('<path d="M5 9l1.5-5h11L19 9z"/><path d="M6 9v11h12V9M10 20v-5h4v5"/>',22)+
          '</span><span><b>'+esc(l.name||l.id)+'</b><small>Ingresar al local</small></span>'+
          '<span aria-hidden="true">→</span></button>';
      }).join('');
      const access=localRows.length?'<details class="gl-ch-company-locals"><summary>Ver locales'+
        '<span aria-hidden="true">⌄</span></summary><div class="gl-ch-company-local-grid">'+localCards+'</div></details>':
        n===0?'<span class="gl-ch-company-empty">Sin locales registrados</span>':
        '<button type="button" class="gl-ch-company-open" data-ch-tab="locales">Ver locales →</button>';
      const support=own?'':(window.GestLokCreatorSupport?.openButton?.(c.tenant_id,c.name)||'');
      return '<article class="gl-ch-company-card" data-creator-company="'+esc(c.tenant_id)+'">'+
        '<div class="gl-ch-company-top"><span class="gl-ch-ico p" aria-hidden="true">'+
        svg('<path d="M4 20V8l8-4 8 4v12"/><path d="M9 20v-6h6v6"/>',24)+
        '</span><div class="gl-ch-company-info"><h3>'+esc(c.name)+'</h3><p>'+
        n+(n===1?' local':' locales')+'</p></div></div>'+
        '<div class="gl-ch-company-actions">'+access+support+'</div></article>';
    }).join('');
    // Una microapp se abre DENTRO de un local autorizado. El acceso empieza por su selector.
    const microapps = [
      ['Caja', 'Caja y movimientos diarios'],
      ['Stock Local', 'Productos y existencias'],
      ['Precios', 'Costos, márgenes y precios de venta'],
      ['Sistema de Ventas', 'Escáner y registro de cobros'],
      ['Horarios', 'Turnos y planillas'],
      ['Empleados', 'Legajos y recibos autorizados']
    ].map(([name,detail]) => '<button type="button" class="gl-ch-microapp" data-ch-tab="locales" aria-label="Elegir local para ' + name + '">' +
      '<b>' + name + '</b><small>' + detail + '</small><span>Elegir local →</span></button>').join('');
    const shortcuts = [
      ['Empresas y locales', 'empresas', '<path d="M4 20V8l8-4 8 4v12"/><path d="M9 20v-6h6v6"/>'],
      ['Usuarios y accesos', 'usuarios', '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>'],
      ['Empleados y horarios', 'empleados', '<path d="M3 20c0-4 4-7 9-7s9 3 9 7"/><circle cx="12" cy="7" r="4"/>'],
      ['Locales', 'locales', '<path d="M5 9l1.5-5h11L19 9z"/><path d="M6 9v11h12V9"/>'],
      ['Herramientas', 'herramientas', '<circle cx="12" cy="12" r="9"/><path d="M12 8v4l3 2"/>'],
      ['Reseñas', 'resenas', '<path d="M4 5h16v14H4z"/><path d="M8 10h8M8 14h5"/>']
    ].map(([name,id,icon]) => '<button type="button" class="gl-ch-shortcut" data-ch-tab="' + id + '">' +
      '<span class="gl-ch-ico b">' + svg(icon, 22) + '</span><b>' + name + '</b><span aria-hidden="true">›</span></button>').join('');
    return '<div class="gl-ch-creator-start">' +
      '<section class="gl-ch-company-area" aria-label="Empresas activas">' +
      '<header class="gl-ch-company-area-head"><h2>Empresas activas</h2>' +
      '<button type="button" class="gl-ch-link" data-ch-tab="empresas">Ver todas →</button></header>' +
      '<p class="gl-ch-company-intro">Elegí una empresa para consultar sus locales.</p>' +
      '<div class="gl-ch-company-grid">' + (companies || '<p class="gl-ch-company-empty">No hay empresas disponibles.</p>') + '</div></section>' +
      '<section class="gl-ch-card" aria-label="Mis microapps"><header><h2>Mis microapps</h2></header>' +
      '<p>Primero elegí la empresa y el local. Cada herramienta respeta sus permisos.</p>' +
      '<div class="gl-ch-microapps">' + microapps + '</div></section>' +
      '<section class="gl-ch-card"><header><h2>Administración y herramientas</h2></header>' +
      '<p>Accesos rápidos a los módulos existentes. Cada empresa conserva sus propios datos y permisos.</p>' +
      '<div class="gl-ch-shortcuts">' + shortcuts + '</div></section></div>';
  }
  // La preferencia visual es del dispositivo; nunca modifica roles ni alcance.
  const navPrefKey = 'gestlok:creator-menu-collapsed:v1';
  let navCollapsed = false;
  try { navCollapsed = localStorage.getItem(navPrefKey) === 'yes'; } catch {}
  function view(p) {
    if (!data) return '<div class="gl-ch"><main class="gl-ch-main"><p role="status" class="gl-ch-loading">Preparando tu panel…</p></main></div>';
    const cur = validTab(tab) ? tab : 'inicio';
    const parts = p.parts || {};
    const nav = TABS.map(t => '<button type="button" title="' + t[1] + '" aria-label="' + t[1] + '" data-ch-tab="' + t[0] + '"' + (t[0] === cur ? ' aria-current="page" class="on"' : '') + '>' + svg(t[2], 20) + '<span>' + t[1] + '</span>' +
      (t[0] === 'usuarios' && p.pending ? '<b>' + esc(p.pending) + '</b>' : '') + '</button>').join('');
    const d = today();
    let body;
    if (cur === 'inicio') body = home(p);
    else if (cur === 'empresas') body = '<div class="gl-ch-stack">' + (parts.companies || '') + (parts.prepare || '') + '</div>';
    else if (cur === 'usuarios') body = '<div class="gl-ch-stack">' + (parts.users || '') + '</div>';
    else if (cur === 'locales') body = '<div class="gl-ch-stack">' + (window.GestLokOwnerAreas?.companyFolders?.() || parts.locales || '') + '</div>';
    else if (cur === 'resenas') body = '<div class="gl-ch-stack">' + (window.GestLokDemoMetrics?.view?.() || '') + '</div>';
    else if (cur === 'nfc') body = '<div class="gl-ch-stack">' + (window.GestLokNfcQr?.view?.() || '<section class="gl-admin-card"><p role="status">NFC y QR se está actualizando. Cerrá y volvé a abrir GESTLOK.</p></section>') + '</div>';
    else if (cur === 'herramientas') body = '<div class="gl-ch-stack">' + dailySettingsView() + (parts.tools || '') + '</div>';
    else body = '<div class="gl-ch-stack">' + empleados(p) + '</div>';
    const title = cur === 'inicio' ? '¡Hola!' : (TABS.find(t => t[0] === cur) || [])[1];
    const sub = cur === 'inicio' ? 'Aquí podés gestionar todo el ecosistema de GESTLOK.' : 'Administración de GESTLOK';
    const initial = esc(String(api.S?.me?.email || 'A').trim().charAt(0).toUpperCase());
    return '<div class="gl-ch' + (navCollapsed ? ' gl-ch-collapsed' : '') + '">' +
      '<aside class="gl-ch-side" aria-label="Administración GESTLOK"><div class="gl-ch-logo"><img src="icons/gestlok-wordmark.svg" alt="GESTLOK" width="170" height="48"><small>CREADORA · ADMIN</small></div>' +
      '<button type="button" class="gl-ch-collapse" data-ch-collapse aria-controls="gl-ch-navigation" aria-expanded="' + (!navCollapsed) + '" title="' + (navCollapsed ? 'Expandir menú' : 'Contraer menú') + '" aria-label="' + (navCollapsed ? 'Expandir menú lateral' : 'Contraer menú lateral') + '">' + svg('<path d="M4 5h16v14H4zM9 5v14M13 9l-3 3 3 3"/>', 20) + '<span>' + (navCollapsed ? 'Expandir menú' : 'Contraer menú') + '</span></button>' +
      '<nav class="gl-ch-nav" id="gl-ch-navigation">' + nav + '</nav>' +
      '<div class="gl-ch-me"><span class="gl-ch-av">' + initial + '</span><div><b>Creadora</b><small>' + esc(api.S?.me?.email || '') + '</small><em>ADMINISTRADORA</em></div></div>' +
      '<button type="button" class="gl-ch-logout" data-au="out" aria-label="Cerrar sesión" title="Cerrar sesión">' +
      svg('<path d="M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4M16 17l5-5-5-5M21 12H9"/>', 20) +
      '<span>Cerrar sesión</span></button>' +
      '<p class="gl-ch-quote">Gestión simple<br>para negocios reales</p></aside>' +
      '<main class="gl-ch-main"><header class="gl-ch-top"><div><h1>' + esc(title) + (cur === 'inicio' ? ' <span aria-hidden="true">👋</span>' : '') + '</h1><p>' + esc(sub) + '</p></div>' +
      '<div class="gl-ch-topr"><div class="gl-ch-date"><span>' + esc(d.date) + '</span><span>' + esc(d.time) + '</span></div>' +
      '<button type="button" class="gl-ch-bell" data-act="share" aria-label="Solicitudes pendientes: ' + num(p.pending) + '">' + svg('<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9z"/><path d="M10 21h4"/>', 22) + (p.pending ? '<b>' + esc(p.pending) + '</b>' : '') + '</button>' +
      '<button type="button" class="gl-ch-out" data-au="out">Salir</button></div></header>' + body +
      '<footer class="gl-ch-foot">GESTLOK · Panel privado de la creadora · Accesos protegidos · Datos al ' + esc(dmy(data.generated_at)) + ' ' + esc(new Date(data.generated_at).toLocaleTimeString('es-AR', {hour: '2-digit', minute: '2-digit'})) + '</footer></main></div>';
  }
  function empleados(p) {
    const t = data.totals, e = data.employees_roles;
    return '<section class="gl-admin-card" aria-label="Administración de empleados"><header><h2>Administración de empleados</h2><small>Resumen general · Sin recibos ni sueldos</small></header>' +
      '<div class="gl-ch-bigstats"><div><b>' + num(t.employees) + '</b><small>Personas en Empleados</small></div><div><b>' + num(e.owner) + '</b><small>Titulares</small></div><div><b>' + num(e.manager) + '</b><small>Encargados</small></div><div><b>' + num(e.gestlok_gerentes) + '</b><small>Gerentes y editores con Horarios</small></div></div>' +
      '<p class="lead">Habilitar o deshabilitar el módulo por empresa se hace en «Empresas». Los recibos y planillas siguen protegidos por los permisos de cada empresa.</p>' +
      '<p><a class="btn primary" href="empleados/">Abrir Administración de empleados →</a></p></section>';
  }
  function goTab(v) {
    if (!validTab(v)) return;
    tab = v; store.set(v);
    api?.render();
    try { window.scrollTo({top: 0}); } catch { /* sin scroll */ }
  }
  document.addEventListener('click', ev => {
    const collapse = ev.target.closest?.('[data-ch-collapse]');
    if (collapse && api?.isCreadora?.()) {
      ev.preventDefault();
      navCollapsed = !navCollapsed;
      try {localStorage.setItem(navPrefKey, navCollapsed ? 'yes' : 'no');} catch {}
      api.render();
      return;
    }
    const dailyToggle=ev.target.closest?.('[data-ch-diario-visibility]');
    if(dailyToggle&&api?.isCreadora?.()){ev.preventDefault();void toggleDailyVisibility();return;}
    const refresh = ev.target.closest?.('[data-ch-coupons-refresh]');if(refresh && api?.isCreadora?.()){ev.preventDefault();loadCoupons();return;}
    const b = ev.target.closest && ev.target.closest('[data-ch-tab]');
    if (b) { ev.preventDefault(); goTab(b.dataset.chTab); }
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && status === 'ready') {load();void refreshDaily(true);} });
  window.GestLokCreatorHome = Object.freeze({
    attach(ctx) { api = ctx; window.GestLokNfcQr?.attach?.(ctx); const s = store.get(); tab = validTab(s) ? s : 'inicio'; },
    mode, view, refresh: load, tab: () => tab, setTab: goTab,
    dailyVisible, refreshDaily, dailySettingsView
  });
})();

/* GestLok · conexión con Supabase
   Inicio de sesión con email y contraseña, y la base compartida en tiempo real.
   La app usa window.claude.use('db' | 'user' | 'downloads'); acá se arma eso sobre Supabase. */
(() => {
  'use strict';
  const CFG = window.SPM_CONFIG || {};
  const $ = s => document.querySelector(s);
  const SITE = location.origin + location.pathname;

  let sb = null;
  /* Modo sin conexión (gestlok-offline.js): lecturas desde este equipo y cambios en cola que se envían solos. */
  const OFF = window.GestLokOffline || null;
  try { sb = window.supabase.createClient(CFG.url, CFG.key, {auth:{persistSession:true, autoRefreshToken:true, detectSessionInUrl:true},
    ...(OFF ? {global:{fetch:window.GestLokOffline.transport(CFG.url, CFG.key)}} : {})}); }
  catch (e) { console.error('Supabase no configurado', e); }
  if (sb && OFF) window.GestLokOffline.attach(sb, CFG.url, SITE);

  // Misma sesión de usuario para el catálogo comercial; RLS sigue siendo la autoridad.
  if (sb) window.GestLokSupabase = sb;

  let resolveAuth; const authReady = new Promise(r => { resolveAuth = r; });
  let email = null, rol = null, locales = [], tenantId = null, support = false, started = false;
  const LAST_EMAIL = 'gestlok:ultimo-email';
  const EDITA = ['creadora', 'dueno', 'gerente', 'editor'];

  /* ---------- Pantalla de ingreso ---------- */
  function show(mode, msg, err){
    const box = $('#auth'); if (!box) return;
    if (mode === 'up') window.GestLokRegistration?.mountSignup();
    box.hidden = false; document.documentElement.classList.add('auth-on');
    const m = $('#au-msg'); m.textContent = msg || ''; m.className = 'au-msg' + (err ? ' err' : '') + (msg ? '' : ' empty');
    box.querySelectorAll('[data-mode]').forEach(el => { el.hidden = el.dataset.mode !== mode; });
    if (mode === 'in'){
      // Completa el email de la última sesión: solo falta la contraseña.
      let last = ''; try { last = localStorage.getItem(LAST_EMAIL) || ''; } catch {}
      const mail = $('#au-email'), pass = $('#au-pass');
      if (last && mail && !mail.value) mail.value = last;
    }
    // Visible solo para visitantes que todavía no tienen sesión activa.
    // No pide correo ni contraseña y nunca se conecta a datos empresariales.
    if(mode==='in' && !$('#au-demo-link')){
      const form=$('#au-in');
      if(form){
        const link=document.createElement('a');
        link.id='au-demo-link'; link.className='gl-visitor-entry';
        link.href=location.pathname+'?demo=1';
        link.textContent='Explorar demo interactiva · Sin registrarme';
        const info=document.createElement('small');
        info.className='gl-visitor-entry-info';
        info.textContent='Probá Dueña y Gerente en dos tiendas ficticias. Sin modificar datos reales.';
        form.append(link,info);
      }
    }
    const f = box.querySelector(`[data-mode="${mode}"] input`); if (f && mode !== "in") setTimeout(() => f.focus(), 30);
  }
  function hide(){ const box = $('#auth'); if (box){ box.hidden = true; } document.documentElement.classList.remove('auth-on'); }
  function busy(form, on, label){ const b = form.querySelector('button[type="submit"]'); if (!b) return; if (on){ b.dataset.l = b.textContent; b.textContent = label || 'Un momento…'; b.disabled = true; } else { b.textContent = b.dataset.l || b.textContent; b.disabled = false; } }
  const errTxt = e => {
    const m = String((e && (e.message || e.error_description)) || '').toLowerCase();
    if (m.includes('invalid login')) return 'Email o contraseña incorrectos.';
    if (m.includes('email not confirmed')) return 'Todavía no confirmaste tu email. Abrí el mail que te mandamos y tocá el enlace.';
    if (m.includes('already registered') || m.includes('already been registered')) return 'Ese email ya tiene cuenta. Entrá con tu contraseña o usá "Olvidé mi contraseña".';
    if (m.includes('password') && m.includes('6')) return 'La contraseña tiene que tener al menos 6 caracteres.';
    if (m.includes('rate limit') || m.includes('too many')) return 'Se pidieron demasiados emails seguidos. Esperá unos minutos y probá de nuevo.';
    if (m.includes('fetch') || m.includes('network')) return 'No hay conexión. Revisá internet y probá de nuevo.';
    return 'No se pudo completar. Probá de nuevo en un momento.';
  };

  document.addEventListener('submit', async e => {
    const f = e.target; if (!f.closest || !f.closest('#auth')) return;
    e.preventDefault(); e.stopPropagation();
    if (!sb){ show('in', 'Falta configurar la conexión con Supabase.', true); return; }
    const v = id => (f.querySelector(id) || {}).value || '';
    try {
      if (f.id === 'au-in'){
        busy(f, true, 'Entrando…');
        const { error } = await sb.auth.signInWithPassword({ email: v('#au-email').trim().toLowerCase(), password: v('#au-pass') });
        busy(f, false); if (error) show('in', errTxt(error), true);
      } else if (f.id === 'au-up'){
        if (v('#au-pass2') !== v('#au-pass3')){ show('up', 'Las dos contraseñas no coinciden.', true); return; }
        let intent;
        try { intent = window.GestLokRegistration?.read(f); }
        catch (e) { show('up', e.message, true); return; }
        if (!intent){ show('up', 'No se pudo cargar la selección de cuenta. Reabrí la aplicación.', true); return; }
        busy(f, true, 'Creando…');
        const { data, error } = await sb.auth.signUp({ email: v('#au-email2').trim().toLowerCase(), password: v('#au-pass2'), options: { emailRedirectTo: SITE, data: { gestlok_registration: {kind:intent.kind,choice:intent.choice} } } });
        busy(f, false);
        if (error) show('up', errTxt(error), true);
        else if (!data.session) show('in', 'Listo. Te mandamos un email para confirmar la cuenta: abrilo, tocá el enlace y después entrá acá con tu contraseña.');
      } else if (f.id === 'au-fg'){
        busy(f, true, 'Enviando…');
        const { error } = await sb.auth.resetPasswordForEmail(v('#au-email3').trim().toLowerCase(), { redirectTo: SITE });
        busy(f, false);
        show(error ? 'fg' : 'in', error ? errTxt(error) : 'Te mandamos un email para elegir una contraseña nueva.', !!error);
      } else if (f.id === 'au-np'){
        busy(f, true, 'Guardando…');
        const { error } = await sb.auth.updateUser({ password: v('#au-pass4') });
        busy(f, false);
        if (error) show('np', errTxt(error), true); else { recovering = false; show('in', 'Contraseña cambiada.'); const s = await sb.auth.getSession(); if (s.data.session) entered(s.data.session); }
      }
    } catch (err) { busy(f, false); show('in', errTxt(err), true); }
  }, true);
  document.addEventListener('click', e => {
    const toggle = e.target.closest('[data-au-password-toggle]');
    if (toggle){
      e.preventDefault();
      const input = $('#au-pass');
      if (input){
        const visible = input.type === 'password';
        input.type = visible ? 'text' : 'password';
        toggle.setAttribute('aria-pressed', String(visible));
        toggle.setAttribute('aria-label', visible ? 'Ocultar contraseña' : 'Mostrar contraseña');
      }
      return;
    }
    const t = e.target.closest('[data-au]'); if (!t) return;
    e.preventDefault();
    // «Salir» cierra solo este equipo: con el alcance global de Supabase se cerraba la sesión
    // de la misma cuenta en todos los teléfonos y computadoras (cuentas compartidas incluidas).
    if (t.dataset.au === 'out'){ Promise.resolve(window.GestLokPush?.onLogout?.()).catch(()=>{}).finally(()=>{ sb && sb.auth.signOut({ scope: 'local' }).finally(() => location.reload()); }); return; }
    if (t.dataset.au === 'google'){ google(t); return; }
    if (t.dataset.au === 'retry'){ location.reload(); return; }
    show(t.dataset.au, '');
  });

  let googleOn = null;
  async function googleEnabled(){
    if (googleOn !== null) return googleOn;
    try { const r = await fetch(CFG.url.replace(/\/$/, '') + '/auth/v1/settings', { headers: { apikey: CFG.key } }); const j = await r.json(); googleOn = !!(j && j.external && j.external.google); }
    catch { googleOn = true; }
    return googleOn;
  }
  async function google(btn){
    if (!sb){ show('in', 'Falta configurar la conexión con Supabase.', true); return; }
    btn.disabled = true;
    if (!(await googleEnabled())){ btn.disabled = false; show('in', 'El ingreso con Google todavía no está activado. Mientras tanto, entrá con tu email y contraseña.', true); return; }
    const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: SITE, queryParams: { prompt: 'select_account' } } });
    if (error){ btn.disabled = false; show('in', errTxt(error), true); }
  }
  function urlError(){
    const q = new URLSearchParams(location.search + '&' + location.hash.replace(/^#/, ''));
    const d = q.get('error_description') || q.get('error');
    if (!d) return '';
    history.replaceState(null, '', SITE);
    return /provider is not enabled/i.test(d) ? 'El ingreso con Google todavía no está activado. Mientras tanto, entrá con tu email y contraseña.' : 'No se pudo entrar con Google. Probá de nuevo o entrá con tu email y contraseña.';
  }

  async function entered(session){
    const attempt = authGeneration;
    email = String(session.user.email || '').toLowerCase();
    // Recordar solo el email de la última sesión en este equipo (nunca la contraseña).
    try { if (email) localStorage.setItem(LAST_EMAIL, email); } catch {}
    let r = null, ls = [], sinRed = false;
    try { const { data, error } = await sb.rpc('mi_acceso'); if (!error && data){ r = data.rol || null; ls = Array.isArray(data.locales) ? data.locales : []; tenantId = data.tenant_id || null; support = data.support === true; } else throw error; }
    catch (e) { sinRed = navigator.onLine === false || /conexi|fetch|network|GL_OFFLINE/i.test(String((e && (e.message || e.code)) || '')); try { const { data, error } = await sb.rpc('mi_rol'); if (!error) r = data || null; } catch {} }
    if (attempt !== authGeneration) return;
    rol = r; locales = ls;
    /* Sin internet y sin una copia de esta cuenta en el equipo: no es un «ingreso pendiente». */
    if (!rol && sinRed){
      show('in', 'Sin conexión. Para usar GESTLOK sin internet, abrilo una vez con conexión en este equipo. Se reintenta solo al volver internet.', true);
      window.addEventListener('online', () => location.reload(), { once: true });
      return;
    }
    if (!rol){
      const meta = session.user.user_metadata || {}, prov = (session.user.app_metadata || {}).provider || 'email';
      if (!window.GestLokRegistration){
        try { await sb.rpc('pedir_acceso', { p_nombre: meta.full_name || meta.name || '', p_proveedor: prov }); } catch {}
      }
      show('pend', ''); window.GestLokRegistration?.pending(session); const n = $('#au-pend-email'); if (n) n.textContent = email;
      clearInterval(window.__spmPoll);
      window.__spmPoll = setInterval(async () => { try { const { data } = await sb.rpc('mi_rol'); if (data){ clearInterval(window.__spmPoll); location.reload(); } } catch {} }, 10000);
      return;
    }
    hide();
    const me = $('#logout-wrap'); if (me) me.hidden = false;
    if (!started){ started = true; resolveAuth(true); }
  }

  // Bootstrap authentication once: INITIAL_SESSION and getSession can both resolve
  // during PWA startup. Never replace a recovered session with the login screen.
  let entering = false, authGeneration = 0, recovering = false;
  function resume(session){
    if (!session || started || entering || recovering || /type=recovery/.test(location.hash)) return;
    entering = true;
    const attempt = authGeneration;
    Promise.resolve().then(() => { if (attempt === authGeneration) return entered(session); }).catch(() => {
      if (attempt !== authGeneration) return;
      show('in', 'No se pudo recuperar tu sesión. Revisá la conexión e intentá nuevamente.', true);
    }).finally(() => { if (attempt === authGeneration) entering = false; });
  }
  function init(){
    if (!sb){ show('in', 'Falta configurar la conexión con Supabase.', true); return; }
    const uErr = urlError(), bootstrapGeneration = authGeneration;
    sb.auth.onAuthStateChange((ev, session) => {
      if (ev === 'PASSWORD_RECOVERY'){ ++authGeneration; entering = false; recovering = true; show('np', 'Elegí tu contraseña nueva.'); return; }
      if (session && ['SIGNED_IN','INITIAL_SESSION','TOKEN_REFRESHED','USER_UPDATED'].includes(ev)) resume(session);
      if (ev === 'SIGNED_OUT'){
        ++authGeneration; entering = false; recovering = false;
        for (const id of ['#app', '#hub', '#logout-wrap']) { const el = $(id); if (el) el.hidden = true; }
        if (started) location.reload(); else show('in', '');
      }
    });
    sb.auth.getSession().then(({data,error}) => {
      if (bootstrapGeneration !== authGeneration) return;
      if (data?.session) resume(data.session);
      else if (error && !started && !entering && !recovering) show('in', 'No se pudo recuperar la sesión. Revisá tu conexión.', true);
      else if (!started && !entering && !recovering) show('in', uErr, !!uErr);
    }).catch(() => { if (bootstrapGeneration === authGeneration && !started && !entering && !recovering) show('in', 'No se pudo comprobar la sesión. Revisá tu conexión.', true); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  /* ---------- Base de datos (misma forma que usa la app) ---------- */
  const toErr = e => {
    const c = String((e && e.code) || ''), m = String((e && e.message) || '').toLowerCase();
    if (c === '42501' || m.includes('row-level security') || m.includes('permission')) return { code: 'invalid_argument', message: 'Sin permiso para guardar' };
    if (m.includes('fetch') || m.includes('network') || m.includes('timeout')) return { code: 'unavailable', message: 'Sin conexión' };
    return { code: 'unavailable', message: (e && e.message) || 'Error' };
  };
  const refreshers = new Map();
  const bump = col => { const s = refreshers.get(col); if (s) s.forEach(fn => fn()); };
  /* Al enviarse los cambios guardados sin conexión, todas las planillas abiertas se actualizan. */
  window.addEventListener?.('gestlok-sync-complete', () => { for (const s of refreshers.values()) s.forEach(fn => fn()); });
  const snap = rows => ({ docs: rows, size: rows.length, empty: !rows.length, docChanges: () => [], metadata: { fromCache: false, hasPendingWrites: false } });
  const docSnap = r => ({ id: r.id, exists: true, data: () => r.data || {}, metadata: { fromCache: false, hasPendingWrites: false } });
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

  function docRef(col, id){
    return {
      id, path: col + '/' + id,
      async get(){ const { data, error } = await sb.from('docs').select('id,data').eq('col', col).eq('id', id).maybeSingle(); if (error) throw toErr(error); return data ? docSnap(data) : { id, exists: false, data: () => undefined, metadata: {} }; },
      async set(d){ const { error } = await sb.from('docs').upsert({ col, id, data: d, updated_at: new Date().toISOString(), updated_by: email }); if (error) throw toErr(error); bump(col); },
      async update(d){ const { data, error } = await sb.rpc('doc_update', { p_col: col, p_id: id, p_patch: d }); if (error) throw toErr(error); if (!data) throw { code: 'invalid_argument', message: 'Sin permiso o documento inexistente' }; bump(col); },
      async delete(){ const { error } = await sb.from('docs').delete().eq('col', col).eq('id', id); if (error) throw toErr(error); bump(col); }
    };
  }
  function query(col, opts){
    const q = {
      where(){ return q; },
      orderBy(f, d){ return query(col, { ...opts, o: f, d: d || 'asc' }); },
      limit(n){ return query(col, { ...opts, l: n }); },
      async get(){ return snap(shape(await fetchCol(col))); },
      onSnapshot(next, onErr){
        let alive = true, t = null, generation = 0;
        // Ignorar respuestas anteriores para no reemplazar datos nuevos del chat o stock.
        const refresh = async () => {
          const current = ++generation;
          try { const rows = await fetchCol(col); if (alive && current === generation) next(snap(shape(rows))); }
          catch (e) { if (alive && current === generation && e && e.code === 'invalid_argument' && onErr) onErr(e); }
        };
        const later = () => { clearTimeout(t); t = setTimeout(refresh, 120); };
        if (!refreshers.has(col)) refreshers.set(col, new Set());
        refreshers.get(col).add(later);
        refresh();
        const ch = sb.channel('spm-' + col + '-' + uid())
          .on('postgres_changes', { event: '*', schema: 'public', table: 'docs', filter: 'col=eq.' + col }, later)
          .subscribe();
        const poll = setInterval(refresh, 30000);
        const vis = () => { if (document.visibilityState === 'visible') refresh(); };
        document.addEventListener('visibilitychange', vis);
        return () => { alive = false; clearInterval(poll); refreshers.get(col).delete(later); document.removeEventListener('visibilitychange', vis); sb.removeChannel(ch); };
      }
    };
    function shape(rows){
      let docs = rows.map(docSnap);
      if (opts.o){ const f = opts.o, s = opts.d === 'desc' ? -1 : 1; docs.sort((a, b) => { const x = a.data()[f], y = b.data()[f]; if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1; return x < y ? -s : x > y ? s : 0; }); }
      if (opts.l) docs = docs.slice(0, opts.l);
      return docs;
    }
    return q;
  }
  async function fetchCol(col){
    const out = []; let from = 0;
    for (;;){
      const { data, error } = await sb.from('docs').select('id,data').eq('col', col).range(from, from + 999);
      if (error) throw toErr(error);
      out.push(...data); if (data.length < 1000) break; from += 1000;
    }
    return out;
  }
  const db = Object.freeze({
    collection(col){ const q = query(col, {}); return Object.assign(Object.create(q), q, { path: col, doc: id => docRef(col, id || uid()), async add(d){ const r = docRef(col, uid()); await r.set(d); return r; } }); },
    doc(path){ const i = path.lastIndexOf('/'); return docRef(path.slice(0, i), path.slice(i + 1)); },
    /* Operaciones del servidor permitidas desde la app (la base vuelve a verificar el rol) */
    async rpc(name, args){
      if (name !== 'importar_mercaderia') throw { code: 'invalid_argument', message: 'Operación no permitida' };
      let res;
      try { res = await sb.rpc(name, args); } catch (e) { throw { code: 'unavailable', message: 'Sin conexión' }; }
      const { data, error } = res;
      if (error){ const m = String(error.message || ''); if (/^MGS:/.test(m)) throw { code: m.slice(4), message: m }; throw toErr(error); }
      if (data && data.gl_pending) throw { code: 'pending', message: data.message || 'Guardado en este equipo; se enviará al volver la conexión.' };
      return data;
    }
  });

  /* ---------- Persona conectada ---------- */
  const avatar = (txt, bg) => 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" rx="32" fill="${bg}"/><text x="32" y="41" font-family="Arial" font-size="26" font-weight="700" text-anchor="middle" fill="#fff">${String(txt || '?').charAt(0).toUpperCase()}</text></svg>`);
  const nameOf = e => String(e || '').split('@')[0];
  const user = Object.freeze({
    async me(){ return { id: email, name: nameOf(email), avatarUrl: avatar(email, '#1F3A5F'), color: '#1F3A5F', email, rol, locales: [...locales], tenant_id: tenantId, support, isOwner: rol === 'creadora', canEdit: EDITA.includes(rol) }; },
    async id(){ return email; },
    async isOwner(){ return rol === 'creadora'; },
    async canEdit(){ return EDITA.includes(rol); },
    async can(k){ return k === 'data.write' ? EDITA.includes(rol) : false; },
    async profiles(ids){ const o = {}; for (const id of [].concat(ids)) o[id] = { id, name: nameOf(id), avatarUrl: avatar(id, '#5D697B'), color: '#5D697B', email: id, isMe: id === email, guest: false }; return o; },
    async name(){ return nameOf(email); },
    async email(){ return email; },
    async search(){ return []; }
  });

  /* ---------- Descargas ---------- */
  const downloads = Object.freeze({
    async save({ filename, data }){
      const blob = data instanceof Blob ? data : new Blob([data], { type: /\.csv$/i.test(filename) ? 'text/csv;charset=utf-8' : 'application/octet-stream' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    }
  });

  window.claude = Object.freeze({
    async use(name){
      if (!sb) return null;
      await authReady;
      if (name === 'db') return db;
      if (name === 'user') return user;
      if (name === 'downloads') return downloads;
      return null;
    }
  });
})();

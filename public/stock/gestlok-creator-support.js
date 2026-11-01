/* Creadora: recorrer otras empresas en SOLO LECTURA (sesión de soporte) y revisar cada pantalla
   «como» un rol (vista previa visual). Nada de esto concede permisos: la sesión de soporte la
   valida y la registra el backend (gestlok_creator_open_company) y la vista previa por rol es solo
   de pantalla; la creadora sigue sin poder escribir salvo que habilite la edición. */
(() => {
  'use strict';
  const PREVIEW_KEY = 'gestlok-preview-rol';
  const PREVIEW_ROLES = Object.freeze({dueno:'Dueña', gerente:'Gerente', lectura:'Solo ver'});
  let api, support = {active:false, name:'', expires:0}, busy = false, timer = 0;
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const hora = t => { try { return new Date(t).toLocaleTimeString('es-AR', {hour:'2-digit', minute:'2-digit'}); } catch { return ''; } };
  const store = {
    get(){ try { return window.sessionStorage.getItem(PREVIEW_KEY) || ''; } catch { return ''; } },
    set(v){ try { if (v) window.sessionStorage.setItem(PREVIEW_KEY, v); else window.sessionStorage.removeItem(PREVIEW_KEY); } catch {} }
  };
  // Solo la creadora real puede tener una vista previa; nunca eleva permisos (solo muestra menos).
  function previewRol(){
    const v = store.get();
    return Object.prototype.hasOwnProperty.call(PREVIEW_ROLES, v) && api?.isCreadora?.() ? v : '';
  }
  function bar(){
    let el = document.getElementById('gl-support-bar');
    const pv = previewRol();
    let html = '';
    if (support.active) html = `<b>Modo soporte · ${esc(support.name)}</b> · Acceso de Administradora General hasta las ${esc(hora(support.expires))} <button type="button" class="btn sm" data-support-close>Salir</button>`;
    else if (pv) html = `<b>Vista previa como ${esc(PREVIEW_ROLES[pv])}</b> · Solo para revisar el diseño; no cambia permisos <button type="button" class="btn sm" data-preview-rol="">Salir de la vista previa</button>`;
    if (!html){ if (el) el.remove(); return; }
    if (!el){
      el = document.createElement('div'); el.id = 'gl-support-bar'; el.setAttribute('role', 'status');
      el.style.cssText = 'position:sticky;top:0;z-index:9999;display:flex;gap:10px;align-items:center;justify-content:center;flex-wrap:wrap;padding:8px 12px;background:#1F3A5F;color:#fff;font-size:14px;text-align:center';
      document.body.prepend(el);
    }
    el.innerHTML = html;
  }
  function setSupport(active, name, expiresAt){
    const exp = active && expiresAt ? Date.parse(expiresAt) : 0;
    support = {active: !!active && exp > Date.now(), name: name || 'Empresa', expires: exp};
    clearTimeout(timer);
    if (support.active) timer = setTimeout(() => location.reload(), Math.min(support.expires - Date.now() + 500, 2147483000));
    bar();
  }
  async function refresh(){
    bar();
    if (!api || !window.GestLokSupabase) return;
    // Solo quien está (o puede estar) en soporte consulta el estado: evita llamadas innecesarias.
    if (!(api.S?.me?.support || api.isCreadora?.())) return;
    try {
      const {data, error} = await window.GestLokSupabase.rpc('gestlok_creator_support_state');
      if (error) throw error;
      setSupport(!!data?.active, data?.name, data?.expires_at);
    } catch { setSupport(false, '', null); }
  }
  async function open(tenant, name){
    if (!api || busy || !api.isCreadora?.()) return;
    const reason = String(window.prompt('Motivo de la consulta de «' + (name || 'la empresa') + '» (queda registrado en la auditoría):', '') || '').trim();
    if (reason.length < 3){ if (reason) api.toast('Escribí un motivo de al menos 3 letras.', true); return; }
    busy = true;
    try {
      const {data, error} = await window.GestLokSupabase.rpc('gestlok_creator_open_company', {p_tenant:tenant, p_reason:reason.slice(0, 200), p_minutes:30});
      if (error) throw error;
      store.set('');
      setSupport(true, data?.name, data?.expires_at);
      location.reload();
    } catch (e) { api.toast((e && e.message) || 'No se pudo abrir la empresa.', true); busy = false; }
  }
  async function openLocal(tenant, local, name){
    if(!api?.isCreadora?.() || busy || !tenant || !local)return;
    busy=true;
    try{
      const {error}=await window.GestLokSupabase.rpc('gestlok_creator_open_company',{p_tenant:tenant,p_reason:'Administración de local desde Locales',p_minutes:60});
      if(error)throw error;
      store.set('');
      window.sessionStorage.setItem('gestlok-admin-tab','locales');
      window.sessionStorage.setItem('gestlok:profile-next-local',JSON.stringify({email:String(api.S.me.email||'').toLowerCase(),tenant_id:tenant,local_id:local}));
      location.reload();
    }catch(e){api.toast(e?.message||'No se pudo abrir el local.',true);busy=false;}
  }
  async function close(){
    if (busy) return;
    busy = true;
    try { await window.GestLokSupabase.rpc('gestlok_creator_close_company'); } catch {}
    location.reload();
  }
  function setPreview(rol){ store.set(Object.prototype.hasOwnProperty.call(PREVIEW_ROLES, rol) ? rol : ''); location.reload(); }
  // Botón por empresa en la tabla de empresas registradas.
  function openButton(tenantId, name){
    if (!api || tenantId === api.S?.me?.tenant_id) return '<small>Tu empresa</small>';
    return '<button type="button" class="btn sm" data-support-open="' + esc(tenantId) + '" data-support-name="' + esc(name) + '">Abrir empresa</button>';
  }
  function previewCard(){
    if (!api?.isCreadora?.() || support.active) return '';
    const cur = store.get();
    return '<section class="gl-admin-card" aria-label="Vista previa por rol"><header><h2>Vista previa por rol</h2><small>Solo para revisar el diseño</small></header><div class="gl-home-essential-tools">' +
      Object.entries(PREVIEW_ROLES).map(([k, label]) => '<button type="button" class="btn sm' + (cur === k ? ' primary' : '') + '" data-preview-rol="' + k + '">Ver como ' + esc(label) + '</button>').join('') +
      '</div><p class="lead">No cambia permisos ni datos: tu cuenta conserva sus permisos. Para operar otra empresa, elegí su carpeta en «Locales».</p></section>';
  }
  document.addEventListener('click', e => {
    const local=e.target.closest('[data-company-local]');
    if(local){e.preventDefault();openLocal(local.dataset.companyTenant,local.dataset.companyLocal,local.dataset.companyName);return;}
    const o = e.target.closest('[data-support-open]');
    if (o){ e.preventDefault(); open(o.dataset.supportOpen, o.dataset.supportName); return; }
    if (e.target.closest('[data-support-close]')){ e.preventDefault(); close(); return; }
    const p = e.target.closest('[data-preview-rol]');
    if (p){ e.preventDefault(); setPreview(p.dataset.previewRol); }
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(); });
  window.GestLokCreatorSupport = Object.freeze({attach(ctx){ api = ctx; }, refresh, previewRol, previewCard, openButton, state: () => ({...support})});
})();

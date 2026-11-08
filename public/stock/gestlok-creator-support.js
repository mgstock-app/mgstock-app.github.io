/* Creadora: cambio auditado de empresa y sucursal. La identidad y permisos
   operativos los confirma el backend; no se impone un rol visual de menor acceso. */
(() => {
  'use strict';
  const PREVIEW_KEY = 'gestlok-preview-rol';
  // El Molino tiene membresía propia: no usar soporte para abrir sus sucursales.
  const MOLINO_TENANT = '6c8717ea-5f78-426b-9458-74a5dcac6e4e';
  // Sin perfiles de vista previa: la administradora conserva el rol autenticado.
  const PREVIEW_ROLES = Object.freeze({});
  let api, support = {active:false, name:'', expires:0}, busy = false, timer = 0;
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const hora = t => { try { return new Date(t).toLocaleTimeString('es-AR', {hour:'2-digit', minute:'2-digit'}); } catch { return ''; } };
  const store = {
    get(){ try { return window.sessionStorage.getItem(PREVIEW_KEY) || ''; } catch { return ''; } },
    set(v){ try { if (v) window.sessionStorage.setItem(PREVIEW_KEY, v); else window.sessionStorage.removeItem(PREVIEW_KEY); } catch {} }
  };
  // Solo la creadora real puede tener una vista previa; nunca eleva permisos (solo muestra menos).
  function previewRol(){ return ''; }
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
  // Abrir una empresa y, si corresponde, una sucursal. No depende de un
  // prompt bloqueado por navegadores móviles o la PWA instalada.
  // Toda transición se valida por RPC. Las consultas a empresas ajenas
  // conservan la auditoría obligatoria del servidor.
  async function switchCompany(tenant, local, name){
    if (!api?.isCreadora?.() || busy || !tenant) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false){
      api.toast?.('Conectate a internet para cambiar de empresa.', true); return;
    }
    busy = true;
    try {
      const pending = await window.GestLokOffline?.pending?.().catch(() => 0);
      if (pending) throw Error('Tenés cambios pendientes de sincronizar. Guardalos antes de cambiar de empresa.');
      const sb = window.GestLokSupabase;
      if (!sb?.rpc) throw Error('No se pudo conectar con el sistema de permisos. Actualizá la sesión.');
      const {data:contexts,error:contextError} = await sb.rpc('gestlok_my_role_contexts');
      if (contextError || !Array.isArray(contexts))
        throw contextError || Error('No pudimos verificar tus permisos de acceso.');
      const direct = contexts.some(c => c?.tenant_id === tenant && c.role === 'creadora' &&
        (!local || (Array.isArray(c.local_names) && c.local_names.some(l => l.id === local))));
      if (direct){
        // Consultar la sesión ACTUAL del servidor: el estado local puede ser
        // antiguo después de recargar o cambiar de empresa.
        const {data:session,error:stateError}=await sb.rpc('gestlok_creator_support_state');
        if(stateError)throw stateError;
        if(session?.active){
          const {error:closedError}=await sb.rpc('gestlok_creator_close_company');
          if(closedError)throw closedError;
          setSupport(false,'',null);
        }
        const {data,error}=await sb.rpc('gestlok_choose_role_context',{p_tenant:tenant});
        if(error || data?.tenant_id!==tenant || data?.role!=='creadora')
          throw error || Error('No estás autorizada a administrar esta empresa.');
      }else{
        // El Molino siempre exige membresía directa (sin modo soporte).
        if(tenant===MOLINO_TENANT)
          throw Error('No se pudo validar tu acceso directo a El Molino Café. Actualizá la sesión.');
        const {data,error}=await sb.rpc('gestlok_creator_open_company',{
          p_tenant:tenant,
          p_reason:local?'Ingreso administrativo al local desde Empresas activas':
            'Revisión administrativa desde Empresas activas',
          p_minutes:60
        });
        if(error || data?.tenant_id!==tenant || data?.active!==true)
          throw error || Error('El servidor no autorizó el acceso a esta empresa.');
      }
      // Nunca reutilizar documentos ni borradores de otra empresa. Un fallo
      // de caché no bloquea el cambio ya confirmado en el servidor.
      try { await window.GestLokOffline?.invalidateContext?.(); } catch {}
      store.set('');
      try {
        window.sessionStorage.setItem('gestlok-admin-tab','locales');
        if(local){
          window.sessionStorage.setItem('gestlok:profile-next-local',JSON.stringify({
            email:String(api.S?.me?.email||'').toLowerCase(),
            tenant_id:tenant,local_id:local,created_at:Date.now()
          }));
        }else{
          window.sessionStorage.removeItem('gestlok:profile-next-local');
        }
      }catch{}
      location.reload();
    }catch(e){
      api.toast?.(e?.message||'No se pudo abrir la empresa.',true);
      busy=false;
    }
  }
  function open(tenant,name){
    // El Molino conserva su entrada por membresía y tarjeta de sucursal.
    // No habilitar un atajo de soporte hacia esa empresa.
    if(tenant===MOLINO_TENANT){
      api?.toast?.('Para ingresar a El Molino Café, elegí Acassuso o San Isidro desde Ver locales.',true);
      return;
    }
    // El botón de empresa abre directamente; no se pierde por ventanas
    // emergentes canceladas. El backend sigue registrando el acceso.
    return switchCompany(tenant,'',name);
  }
  function openLocal(tenant,local,name){
    if(!local)return;
    return switchCompany(tenant,local,name);
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
    // El Molino abre sus dos locales desde las tarjetas, nunca por sesión de soporte.
    if (tenantId === MOLINO_TENANT) return '';
    return '<button type="button" class="btn sm" data-support-open="' + esc(tenantId) + '" data-support-name="' + esc(name) + '">Abrir empresa</button>';
  }
  function previewCard(){ return ''; }
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

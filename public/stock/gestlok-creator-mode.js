/* Panel de creadora: la consulta de los datos de una empresa es de SOLO LECTURA por defecto.
   La edición se habilita en forma explícita, por 30 minutos y con un motivo; el backend
   (gestlok_creator_enable_editing + disparadores de solo lectura) la hace valer y la registra. */
(() => {
  'use strict';
  let api, state = {active:false, expires:0, loaded:false}, busy = false, timer = 0;
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const hora = t => { try { return new Date(t).toLocaleTimeString('es-AR', {hour:'2-digit', minute:'2-digit'}); } catch { return ''; } };
  function set(active, expiresAt){
    const exp = active && expiresAt ? Date.parse(expiresAt) : 0;
    const next = {active: !!active && exp > Date.now(), expires: exp, loaded: true};
    const changed = next.active !== state.active || next.expires !== state.expires || !state.loaded;
    state = next; clearTimeout(timer);
    if (state.active) timer = setTimeout(() => set(false, null), Math.min(state.expires - Date.now() + 500, 2147483000));
    if (changed && api) api.onChange();
  }
  async function refresh(){
    if (!api || !api.isCreadora() || !window.GestLokSupabase) return;
    try {
      const {data, error} = await window.GestLokSupabase.rpc('gestlok_creator_editing_state');
      if (error) throw error;
      set(!!data?.active, data?.expires_at);
    } catch { set(false, null); }
  }
  async function enable(){
    if (!api || !api.isCreadora() || busy) return;
    const reason = String(window.prompt('Motivo de la edición (queda registrado en la auditoría):', '') || '').trim();
    if (reason.length < 3){ if (reason) api.toast('Escribí un motivo de al menos 3 letras.', true); return; }
    busy = true;
    try {
      const {data, error} = await window.GestLokSupabase.rpc('gestlok_creator_enable_editing', {p_minutes:30, p_reason:reason.slice(0, 200)});
      if (error) throw error;
      set(true, data?.expires_at); api.toast('Edición habilitada por 30 minutos. Queda registrado.');
    } catch (e) { api.toast((e && e.message) || 'No se pudo habilitar la edición.', true); }
    finally { busy = false; }
  }
  async function disable(){
    if (!api || busy) return;
    busy = true;
    try { await window.GestLokSupabase.rpc('gestlok_creator_disable_editing'); } catch {}
    finally { busy = false; set(false, null); api.toast('Volviste a modo consulta (solo lectura).'); }
  }
  // Falla cerrado: sin respuesta del backend, la creadora queda en solo lectura.
  const readOnly = () => !state.active;
  function banner(){
    if (!api || !api.isCreadora()) return '';
    return state.active
      ? `<p class="note gl-creator-mode gl-creator-mode-on" role="status"><b>Edición habilitada hasta las ${esc(hora(state.expires))}</b> · Cada cambio queda registrado. <button class="btn sm" data-creator-mode="off">Volver a solo lectura</button></p>`
      : `<p class="note warn gl-creator-mode" role="status"><b>Modo consulta: solo lectura.</b> Podés revisar todo sin modificar los datos de la empresa. <button class="btn sm" data-creator-mode="on">Habilitar edición 30 min</button></p>`;
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-creator-mode]'); if (!b) return;
    e.preventDefault(); if (b.dataset.creatorMode === 'on') enable(); else disable();
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(); });
  window.GestLokCreatorMode = Object.freeze({attach(ctx){ api = ctx; }, refresh, readOnly, banner, state: () => ({...state})});
})();

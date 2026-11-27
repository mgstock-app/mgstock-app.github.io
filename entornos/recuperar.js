// Recuperación exclusivamente para Prueba y Testing; Supabase verifica el enlace.
(() => {
  'use strict';
  const el = id => document.getElementById(id);
  const status = msg => { el('m').textContent = msg; };
  const cfg = window.GESTLOK_CHAT_CONFIG;
  const hosts = { prueba: 'gestlok-prueba.vercel.app', testing: 'gestlok-testing.vercel.app' };
  if (!cfg || !hosts[cfg.entorno] || location.hostname !== hosts[cfg.entorno] || !window.supabase) {
    status('La recuperación no está disponible en este entorno.');
    return;
  }
  let recovery = false, busy = false;
  const params = new URLSearchParams(location.hash.slice(1));
  if (params.has('error') || params.has('error_code')) status('El enlace no es válido o venció. Solicitá uno nuevo.');
  const sb = window.supabase.createClient(cfg.url, cfg.key, {
    auth: { persistSession: true, detectSessionInUrl: true, flowType: 'implicit' }
  });
  sb.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY' && session?.user) {
      recovery = true;
      el('solicitar').hidden = true;
      el('cambiar').hidden = false;
      status('Elegí una contraseña nueva para tu cuenta de pruebas.');
    }
    if (event === 'SIGNED_OUT') recovery = false;
  });
  async function request(kind) {
    if (busy || !el('correo').reportValidity()) return;
    busy = true;
    el('enviar').disabled = el('confirmar').disabled = true;
    try {
      const email = el('correo').value.trim();
      const r = kind === 'confirmar'
        ? await sb.auth.resend({ type: 'signup', email, options: { emailRedirectTo: location.origin + '/ingresar/' } })
        : await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + '/chat/recuperar/' });
      if (r.error) {
        status(r.error.status === 429 ? 'Esperá unos minutos antes de solicitar otro enlace.' : 'No se pudo solicitar el enlace. Reintentá más tarde.');
      } else {
        status('Si corresponde, recibirás un correo. Revisá también spam. No compartas el enlace.');
      }
    } catch {
      status('No se pudo conectar. Reintentá más tarde.');
    } finally {
      busy = false;
      el('enviar').disabled = el('confirmar').disabled = false;
    }
  }
  el('confirmar').addEventListener('click', () => request('confirmar'));
  el('solicitar').addEventListener('submit', ev => {
    ev.preventDefault();
    void request('recuperar');
  });
  el('cambiar').addEventListener('submit', async ev => {
    ev.preventDefault();
    if (!recovery || busy) return;
    const password = el('clave').value;
    if (password.length < 8 || password !== el('repetir').value) {
      status('Usá al menos 8 caracteres y verificá que ambas contraseñas coincidan.');
      return;
    }
    busy = true;
    el('guardar').disabled = true;
    try {
      const r = await sb.auth.updateUser({ password });
      if (r.error) {
        status('No se pudo cambiar la contraseña. Revisá los requisitos o solicitá otro enlace.');
        return;
      }
      recovery = false;
      el('clave').value = el('repetir').value = '';
      el('cambiar').hidden = true;
      await sb.auth.signOut({ scope: 'local' });
      status('¡Contraseña actualizada! Volvé a Ingresar con tu nueva contraseña.');
    } catch {
      status('No se pudo completar la operación. Reintentá.');
    } finally {
      busy = false;
      el('guardar').disabled = false;
    }
  });
})();

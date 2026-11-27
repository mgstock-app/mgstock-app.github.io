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
  const query = new URLSearchParams(location.search);
  const type = params.get('type');
  const callbackError = ['error', 'error_code'].some(k => params.has(k) || query.has(k));
  const confirmationLink = !callbackError && params.has('access_token') &&
    (type === 'signup' || type === 'email' || (query.get('modo') === 'confirmacion' && type !== 'recovery'));
  if (callbackError) status('No se pudo validar el enlace. Solicitá uno nuevo desde esta pantalla.');
  const sb = window.supabase.createClient(cfg.url, cfg.key, {
    auth: { persistSession: true, detectSessionInUrl: true, flowType: 'implicit' }
  });
  sb.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY' && session?.user) {
      recovery = true;
      el('solicitar').hidden = true;
      el('cambiar').hidden = false;
      el('titulo').textContent = 'Nueva contraseña';
      el('intro').textContent = 'Estás cambiando únicamente la contraseña de GESTLOK Prueba.';
      status(session.user.email_confirmed_at ? 'Email verificado. Elegí tu nueva contraseña.' : 'Elegí una contraseña nueva para tu cuenta de pruebas.');
    }
    if (confirmationLink && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session?.user && !recovery) {
      // No declarar el email verificado tomando solo parámetros de la URL.
      // La sesión debe ser validada por Auth; fuera del callback, para no bloquearlo.
      setTimeout(async () => {
        try {
          const { data, error } = await sb.auth.getUser();
          const user = data?.user;
          if (!error && user?.id === session.user.id && user.email_confirmed_at && !recovery) {
            el('titulo').textContent = 'Email verificado';
            el('intro').textContent = 'Tu correo está confirmado. Ahora podés solicitar el enlace para elegir una contraseña nueva.';
            el('correo').value = user.email || '';
            el('confirmar').hidden = true;
            status('¡Tu correo ya está confirmado!');
          }
        } catch { status('No se pudo comprobar el enlace. Solicitá uno nuevo.'); }
      }, 0);
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
        ? await sb.auth.resend({ type: 'signup', email, options: { emailRedirectTo: location.origin + '/chat/recuperar/?modo=confirmacion' } })
        : await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + '/chat/recuperar/?modo=recuperacion' });
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
      el('titulo').textContent = 'Contraseña actualizada';
      el('intro').textContent = 'Ya podés ingresar con tu nueva contraseña.';
      status('¡Contraseña actualizada! Volvé a Ingresar.');
      try { await sb.auth.signOut({ scope: 'local' }); } catch { /* La contraseña ya se guardó. */ }
    } catch {
      status('No se pudo completar la operación. Reintentá.');
    } finally {
      busy = false;
      el('guardar').disabled = false;
    }
  });
})();

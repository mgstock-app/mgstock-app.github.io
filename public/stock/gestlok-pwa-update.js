/* Updates never clear storage or reload an open editing session automatically. */
(() => {
  'use strict';
  if (!('serviceWorker' in navigator)) return;
  // El HTML puede llegar actualizado al abrir de nuevo la PC, incluso antes de activarse el SW.
  // Nunca anunciar que esa misma versión necesita otra recarga.
  const pageRelease = String(document.documentElement?.dataset?.gestlokBuild || '');
  const dismissedKey = 'gestlok:pwa-dismissed-release';
  let notifiedRelease = '';
  let controlled = !!navigator.serviceWorker.controller;
  let lastNotifiedController = null;
  let pending = () => true;
  let banner;
  let audience = null;
  let retries = 0, retryQueued = false, bannerTimer = null, dismissed = false;
  function dismissCurrentRelease() {
    dismissed = true;
    if (notifiedRelease) {
      try { localStorage.setItem(dismissedKey, notifiedRelease); }
      catch { /* Privacidad o almacenamiento deshabilitado: descartar al menos en esta sesión. */ }
    }
    hideBanner();
  }

  // Un nuevo SW NO significa que todos los locales tengan novedades.
  // Audiencias: ['*'] = cambios compartidos; ['tenant'] = toda la empresa;
  // ['tenant:munro'] = solo Munro, NO Don Torcuato del mismo tenant.
  function isAffected() {
    if (!audience || !audience.length) return false;
    if (audience.includes('*')) return true;
    const context = window.GestLokNavContext?.();
    const tenant = typeof context?.tenant === 'string' ? context.tenant : '';
    const local = typeof context?.local === 'string' ? context.local : '';
    return !!tenant && (audience.includes(tenant) || (!!local && audience.includes(tenant+':'+local)));
  }
  function hideBanner() {
    if (bannerTimer!==null && typeof clearInterval==='function') clearInterval(bannerTimer);
    bannerTimer=null;
    if (!banner) return;
    banner.remove();
    banner = null;
  }
  function checkAudience() {
    if (audience === null) return;
    if (isAffected()) {
      // No ocupar ni redibujar Conteo durante una carga.
      if (document.querySelector?.('.gcm-count-screen')) { hideBanner(); return; }
      showBanner(); return;
    }
    // Si se cambia de local o empresa, quitar cualquier cartel del local anterior.
    hideBanner();
    const context=window.GestLokNavContext?.();
    const tenant=context?.tenant,local=context?.local;
    const awaitsContext=!tenant ||
      (audience.some(x => typeof x==='string' && x.startsWith(tenant+':')) && !local);
    if (audience.length && awaitsContext && retries < 8 && !retryQueued) {
      retries++;
      retryQueued = true;
      setTimeout(() => { retryQueued = false; checkAudience(); }, 1800);
    }
  }
  window.GestLokPWAUpdate = {
    attach(check) { pending = check; checkAudience(); },
    refresh: checkAudience
  };
  function showBanner() {
    if (banner || dismissed) return;
    banner = document.createElement('aside');
    banner.id = 'gl-pwa-update';
    banner.setAttribute('role', 'status');
    banner.style.cssText = 'position:fixed;bottom:20px;left:16px;right:16px;max-width:460px;margin:auto;z-index:10000;padding:16px 16px 16px 58px;background:#171717;color:white;border-radius:12px;box-shadow:0 4px 24px #0004';
    const message = document.createElement('p');
    message.textContent = 'Hay una actualización de GestLok disponible.';
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Actualizar ahora';
    button.style.cssText = 'padding:10px 16px;border:0;border-radius:8px;background:white;color:#171717;cursor:pointer';
    button.addEventListener('click', () => {
      if (navigator.onLine === false) {
        message.textContent = 'Conectate a internet para actualizar.';
        return;
      }
      if (pending()) {
        message.textContent = 'Guardá los cambios y cerrá los formularios abiertos antes de actualizar.';
        return;
      }
      // Si la persona decidió actualizar, no insistir con esta misma publicación tras reiniciar.
      dismissCurrentRelease();
      window.location.reload();
    });
    // Cerrar siempre es posible, incluso cuando hay formularios pendientes.
    // La acción no recarga, no descarta datos y no toca el service worker.
    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.setAttribute('aria-label', 'Cerrar aviso de actualización');
    closeButton.textContent = '×';
    closeButton.style.cssText = 'position:absolute;top:9px;left:9px;display:grid;place-items:center;width:44px;height:44px;padding:0;border:1px solid #ffffff55;border-radius:10px;background:#ffffff15;color:#fff;font-size:26px;line-height:1;cursor:pointer';
    closeButton.addEventListener('click', () => {
      dismissCurrentRelease();
    });
    // Descartar con gesto horizontal sin instalar ni perder cambios abiertos.
    banner.style.touchAction = 'pan-y';
    let startX = null, startY = null;
    banner.addEventListener('touchstart', event => {
      if (event.touches.length !== 1) return;
      startX = event.touches[0].clientX;
      startY = event.touches[0].clientY;
    }, { passive: true });
    banner.addEventListener('touchend', event => {
      if (startX === null || !event.changedTouches.length) return;
      const dx = event.changedTouches[0].clientX - startX;
      const dy = event.changedTouches[0].clientY - startY;
      startX = startY = null;
      if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.4) {
        dismissCurrentRelease();
      }
    }, { passive: true });
    banner.append(message, button, closeButton);
    document.body.appendChild(banner);
    // Mientras el aviso esté visible, verificar el local con poca frecuencia.
    // Se detiene en cuanto el usuario entra en un local sin cambios.
    if (typeof setInterval==='function') bannerTimer=setInterval(checkAudience,1500);
  }
  // El cambio de cuenta o el regreso a la app también pueden aportar un tenant válido.
  window.addEventListener?.('focus', checkAudience);
  window.addEventListener?.('popstate', checkAudience);
  window.addEventListener?.('hashchange', checkAudience);
  document.addEventListener?.('visibilitychange', checkAudience);
  // El cambio entre Munro/Torcuato puede hacerse sin refrescar ni cambiar URL.
  // Verificamos después del clic para retirar el cartel si cambió el local.
  document.addEventListener?.('click', () => setTimeout(checkAudience, 180), true);
  const safeSilence = () => { audience=[]; checkAudience(); };
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    const replacing = controlled;
    controlled = true;
    const worker = navigator.serviceWorker.controller;
    if (!replacing) return;
    // A veces el navegador re-emite controllerchange del MISMO worker.
    // No convertir un evento duplicado en un aviso nuevo.
    if (worker && worker === lastNotifiedController) return;
    lastNotifiedController=worker;
    audience=null; dismissed=false; notifiedRelease=''; hideBanner(); retries=0; retryQueued=false;
    // Worker anterior o sin MessageChannel: no sabemos qué local cambió.
    // Mostrar un aviso global sería falso; se actualiza silenciosamente al reabrir.
    if (!worker?.postMessage || typeof MessageChannel !== 'function') { safeSilence(); return; }
    const channel = new MessageChannel();
    let answered = false;
    const timeout = setTimeout(() => {
      if (!answered) { answered = true; safeSilence(); channel.port1.close?.(); }
    }, 2500);
    channel.port1.onmessage = ({data}) => {
      if (answered) return;
      answered = true;
      clearTimeout(timeout);
      channel.port1.close?.();
      if (data?.type !== 'gestlok-update-audience' || !Array.isArray(data.audience) ||
          typeof data.release !== 'string' || !/^\d{5,24}-\d{1,6}$/.test(data.release) ||
          !data.audience.every(value => value==='*' ||
            (typeof value === 'string' && /^[0-9a-f-]{36}(?::[a-z0-9_-]{1,60})?$/.test(value)))) {
        safeSilence(); return;
      }
      // El controlador puede actualizarse durante la apertura de la PC aunque el HTML ya sea
      // el último. Solo existe una actualización REAL si el código de esta pestaña es anterior.
      if (!pageRelease || data.release === pageRelease) { safeSilence(); return; }
      notifiedRelease = data.release;
      try { dismissed = localStorage.getItem(dismissedKey) === notifiedRelease; }
      catch { dismissed = false; }
      audience = data.audience;
      checkAudience();
    };
    try {
      worker.postMessage({type:'gestlok-update-audience'}, [channel.port2]);
    } catch {
      if (!answered) { answered = true; clearTimeout(timeout); safeSilence(); }
    }
  });
})();

/* Updates never clear storage or reload an open editing session automatically. */
(() => {
  'use strict';
  if (!('serviceWorker' in navigator)) return;
  let controlled = !!navigator.serviceWorker.controller;
  let pending = () => true;
  let banner;
  let audience = null;

  // Un cambio del service worker no implica que todas las empresas se actualizaron.
  // Si el cambio afecta scripts compartidos, el worker devuelve ['*'] y todos reciben aviso.
  function checkAudience() {
    if (!audience || banner) return;
    if (audience.includes('*')) { showBanner(); return; }
    const tenant = window.GestLokNavContext?.()?.tenant;
    if (tenant && audience.includes(tenant)) showBanner();
    // Sin identidad cargada, esperar al inicio de sesión o cambio de empresa.
  }
  window.GestLokPWAUpdate = {
    attach(check) { pending = check; checkAudience(); },
    refresh: checkAudience
  };
  function showBanner() {
    if (banner) return;
    banner = document.createElement('aside');
    banner.id = 'gl-pwa-update';
    banner.setAttribute('role', 'status');
    banner.style.cssText = 'position:fixed;bottom:20px;left:16px;right:16px;max-width:460px;margin:auto;z-index:10000;padding:16px;background:#171717;color:white;border-radius:12px;box-shadow:0 4px 24px #0004';
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
      window.location.reload();
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
        banner.remove();
        banner = null;
      }
    }, { passive: true });
    banner.append(message, button);
    document.body.appendChild(banner);
  }
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    const replacing = controlled;
    controlled = true;
    if (!replacing || banner) return;
    const worker = navigator.serviceWorker.controller;
    // Un worker anterior o un navegador sin MessageChannel puede no comunicar el alcance:
    // en ese caso conservamos el comportamiento seguro (mostrar el aviso).
    if (!worker?.postMessage || typeof MessageChannel !== 'function') { showBanner(); return; }
    const channel = new MessageChannel();
    let answered = false;
    const timeout = setTimeout(() => {
      if (!answered) { answered = true; showBanner(); channel.port1.close?.(); }
    }, 2500);
    channel.port1.onmessage = ({data}) => {
      if (answered) return;
      answered = true;
      clearTimeout(timeout);
      channel.port1.close?.();
      if (data?.type !== 'gestlok-update-audience' || !Array.isArray(data.audience) ||
          !data.audience.every(value => typeof value === 'string')) {
        showBanner(); return;
      }
      audience = data.audience;
      checkAudience();
    };
    try {
      worker.postMessage({type:'gestlok-update-audience'}, [channel.port2]);
    } catch {
      if (!answered) { answered = true; clearTimeout(timeout); showBanner(); }
    }
  });
})();

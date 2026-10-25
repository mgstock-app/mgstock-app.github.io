/* Updates never clear storage or reload an open editing session automatically. */
(() => {
  'use strict';
  if (!('serviceWorker' in navigator)) return;
  let controlled = !!navigator.serviceWorker.controller;
  let pending = () => true;
  let banner;
  window.GestLokPWAUpdate = { attach(check) { pending = check; } };
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    const replacing = controlled;
    controlled = true;
    if (!replacing || banner) return;
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
    banner.append(message, button);
    document.body.appendChild(banner);
  });
})();

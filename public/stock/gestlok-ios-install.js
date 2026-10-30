/* Instalación iPhone/iPad: guía accesible en el inicio de sesión, sin descargar apps ni abrir permisos. */
(() => {
  'use strict';
  if (window.GestLokIOSInstall) return;
  const isAppleMobile = () => /iPhone|iPad|iPod/i.test(navigator.userAgent||'') ||
    (navigator.platform==='MacIntel' && navigator.maxTouchPoints>1);
  const isStandalone = () => navigator.standalone===true ||
    window.matchMedia?.('(display-mode: standalone)').matches===true;
  function mount() {
    if (!isAppleMobile() || isStandalone() || document.getElementById('gl-ios-install-guide')) return;
    const container = document.querySelector('#auth .au-card');
    if (!container) return;
    const details = document.createElement('details');
    details.id='gl-ios-install-guide';
    details.className='gl-ios-install-guide';
    details.innerHTML='<summary><span aria-hidden="true">📱</span> Instalar GESTLOK en iPhone o iPad <span class="gl-ios-chevron" aria-hidden="true">⌄</span></summary>'+
      '<div class="gl-ios-install-body">'+
      '<p>Gratis, sin App Store. Una vez instalada, se abre como una app desde tu pantalla de inicio.</p>'+
      '<ol><li>Abrí <strong>gestlok.com.ar</strong> desde <strong>Safari</strong>.</li>'+
      '<li>Tocá <strong>Compartir</strong> (cuadrado con flecha hacia arriba). En algunas versiones, primero tocá el menú de la página.</li>'+
      '<li>Elegí <strong>Agregar a pantalla de inicio</strong>.</li>'+
      '<li>Si aparece, dejá activado <strong>Abrir como app</strong> y tocá <strong>Agregar</strong>.</li></ol>'+
      '<p>Después abrí GESTLOK desde el nuevo ícono e ingresá con tu cuenta habitual.</p>'+
      '<small>Las notificaciones en iPhone requieren la app en la pantalla de inicio y que autorices los avisos.</small>'+
      '</div>';
    container.appendChild(details);
  }
  window.GestLokIOSInstall=Object.freeze({mount,isAppleMobile,isStandalone});
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',mount,{once:true});
  else mount();
})();
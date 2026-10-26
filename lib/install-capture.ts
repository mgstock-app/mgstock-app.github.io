// Se ejecuta apenas abre la página, antes que el resto de los archivos de GestLok: Chrome, Samsung Internet y
// Edge avisan muy temprano que la app se puede instalar, y si nadie guarda ese aviso el botón
// «Instalar en el celular» no puede abrir la ventana de instalación con un toque.
// public/stock/gestlok-install.js usa lo que queda en window.__glInstall.
export const INSTALL_CAPTURE =
  "(function(w){var c=w.__glInstall=w.__glInstall||{evt:null,installed:false};if(c.listening)return;c.listening=true;" +
  "function f(n){try{w.dispatchEvent(new Event(n))}catch(_){}}" +
  "w.addEventListener('beforeinstallprompt',function(e){e.preventDefault();c.evt=e;f('gestlok-install-ready')});" +
  "w.addEventListener('appinstalled',function(){c.evt=null;c.installed=true;f('gestlok-install-done')})})(window);";

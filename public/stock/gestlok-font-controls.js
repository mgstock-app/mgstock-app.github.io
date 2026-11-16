/* GESTLOK: control global de escalado retirado. No modifica tamaño ni DOM salvo retirar controles antiguos. */
(()=>{'use strict';const clean=()=>{document.querySelectorAll?.('#glk-font-widget,#glk-font-style,.glk-font-card-buttons').forEach(el=>el.remove());};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',clean,{once:true});else clean();})();

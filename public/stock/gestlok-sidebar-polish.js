/* GESTLOK · Barra lateral adaptable para creadora, dueños, gerentes y colaboradores.
   No cambia rutas, permisos, roles ni datos. */
(()=>{
  'use strict';
  if(window.GestLokSidebarPolish) return;
  const app=document.getElementById('app');
  const side=document.getElementById('side');
  const top=side?.querySelector('.side-top');
  const nav=document.getElementById('snav');
  if(!app||!side||!top||!nav)return;

  const stylesheet=document.createElement('link');
  stylesheet.rel='stylesheet';
  stylesheet.href=new URL('stock/gestlok-sidebar-polish.css?rev=20261028-white-v2',document.baseURI).href;
  document.head.appendChild(stylesheet);

  const media=window.matchMedia('(max-width:899px)');
  const key='gestlok:sidebar-preference:v1';
  let collapsed=false;
  try {collapsed=window.localStorage.getItem(key)==='collapsed';}catch{}
  const button=document.createElement('button');
  button.type='button';
  button.className='gl-sidebar-collapse-button';
  button.setAttribute('aria-controls','snav');
  top.appendChild(button);

  const icon=collapse=>'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5 15 12 8 19"/></svg>'.replace(
    collapse?'M8 5 15 12 8 19':'M8 5 15 12 8 19',
    collapse?'M15 5 8 12 15 19':'M8 5 15 12 8 19'
  );
  function labels(){
    for(const element of nav.querySelectorAll('button,.snav-folder>summary')){
      const own=element.querySelector('.nl')?.textContent?.trim();
      const label=own||element.textContent?.replace(/\s+/g,' ').trim();
      if(label&&!element.hasAttribute('title'))element.setAttribute('title',label);
      if(own&&!element.hasAttribute('aria-label'))element.setAttribute('aria-label',own);
    }
  }
  function paint(){
    const desktop=!media.matches;
    app.classList.toggle('gl-sidebar-collapsed',desktop&&collapsed);
    button.hidden=!desktop;
    button.setAttribute('aria-label',collapsed?'Expandir menú lateral':'Contraer menú lateral');
    button.setAttribute('aria-expanded',String(!collapsed));
    button.title=collapsed?'Mostrar menú completo':'Ocultar etiquetas del menú';
    button.innerHTML=icon(!collapsed);
    labels();
  }
  button.addEventListener('click',()=>{
    collapsed=!collapsed;
    try{window.localStorage.setItem(key,collapsed?'collapsed':'expanded');}catch{}
    paint();
  });
  const observer=new MutationObserver(labels);
  observer.observe(nav,{childList:true,subtree:true});
  media.addEventListener?.('change',paint);
  paint();
  window.GestLokSidebarPolish={collapsed:()=>!media.matches&&collapsed,expand:()=>{collapsed=false;paint();}};
})();

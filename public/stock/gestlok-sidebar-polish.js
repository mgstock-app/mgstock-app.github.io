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
  // Portada administrativa clásica: usa el mismo patrón que el panel
  // moderno de la creadora, sin modificar app.js ni los permisos.
  const hub=document.getElementById('hub');
  const adminKey='gestlok:creator-legacy-menu-collapsed:v1';
  let adminCollapsed=false;
  try{adminCollapsed=localStorage.getItem(adminKey)==='yes';}catch{}
  function mountAdminMenu(){
    const panel=hub?.querySelector('.gl-admin');
    const sidebar=panel?.querySelector('.gl-admin-sidebar');
    if(!sidebar)return;
    panel.classList.toggle('gl-admin-collapsed',adminCollapsed);
    if(sidebar.querySelector('.gl-admin-collapse'))return;
    const toggle=document.createElement('button');
    toggle.type='button';
    toggle.className='gl-admin-collapse';
    toggle.setAttribute('aria-controls','gl-admin-nav');
    const navigation=sidebar.querySelector('.gl-admin-nav');
    if(navigation)navigation.id='gl-admin-nav';
    const draw=()=>{
      toggle.setAttribute('aria-expanded',String(!adminCollapsed));
      toggle.setAttribute('aria-label',adminCollapsed?'Expandir menú lateral':'Contraer menú lateral');
      toggle.title=adminCollapsed?'Expandir menú':'Contraer menú';
      toggle.textContent=adminCollapsed?'⇥  Expandir menú':'⇤  Contraer menú';
      panel.classList.toggle('gl-admin-collapsed',adminCollapsed);
    };
    toggle.addEventListener('click',()=>{
      adminCollapsed=!adminCollapsed;
      try{localStorage.setItem(adminKey,adminCollapsed?'yes':'no');}catch{}
      draw();
    });
    sidebar.querySelector('.gl-admin-logo')?.after(toggle);
    navigation?.querySelectorAll('button,span').forEach(item=>{
      const label=item.textContent?.replace(/\\s+/g,' ').trim();
      if(label && !item.hasAttribute('title'))item.title=label;
      if(label && !item.hasAttribute('aria-label'))item.setAttribute('aria-label',label);
    });
    draw();
  }
  if(hub){
    const adminObserver=new MutationObserver(mountAdminMenu);
    adminObserver.observe(hub,{childList:true});
    mountAdminMenu();
  }
  window.GestLokSidebarPolish={collapsed:()=>!media.matches&&collapsed,expand:()=>{collapsed=false;paint();}};
})();

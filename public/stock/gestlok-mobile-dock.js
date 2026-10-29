/* GESTLOK · Navegación inferior para celulares. Reutiliza acciones autorizadas:
   nunca crea rutas nuevas ni evita validaciones por rol/RLS. */
(()=>{
  'use strict';
  if(window.GestLokMobileDock) return;
  const hub=document.getElementById('hub'), app=document.getElementById('app');
  if(!hub || !app) return;
  const max=window.matchMedia('(max-width:899px)');
  const glyphs={
    home:'<path d="m3 10 9-7 9 7v10H3z"/><path d="M10 20v-7h4v7"/>',
    shop:'<path d="M4 10 6 4h12l2 6M4 10v10h16V10M9 20v-7h6v7"/>',
    people:'<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2"/><circle cx="18" cy="9" r="2"/><path d="M17 15c2.3 0 4 1.5 4 4"/>',
    clock:'<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M4 10h16M8 3v4M16 3v4M8 15h3"/>',
    bell:'<path d="M18 8a6 6 0 0 0-12 0c0 6-3 7-3 9h18c0-2-3-3-3-9M10 21h4"/>',
    chat:'<path d="M4 4h16v13H8l-4 3zM8 9h8M8 13h5"/>',
    more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>'
  };
  const icon=k=>'<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">'+glyphs[k]+'</svg>';
  const dock=document.createElement('nav');
  dock.id='gestlok-mobile-dock';dock.className='gl-mobile-dock';dock.setAttribute('aria-label','Navegación principal móvil');dock.hidden=true;
  const sheet=document.createElement('div');
  sheet.id='gestlok-mobile-sheet';sheet.className='gl-mobile-sheet';sheet.hidden=true;
  document.body.append(dock,sheet);
  const visible=()=>!app.hidden;
  const actionable=sel=>{
    // El hub puede conservar tarjetas desmontadas durante el ingreso a un local.
    const container=visible()?app:hub;
    return container.querySelector(sel) || (!visible()?app.querySelector(sel):hub.querySelector(sel));
  };
  const localNav=k=>visible()?app.querySelector('#snav button[data-go="'+k+'"]'):null;
  const staff=()=>actionable('[data-gerente-empleados], [data-owner-area-staff], [data-owner-nav="staff"]');
  const business=()=>actionable('[data-gerente-business], [data-owner-nav="business"], [data-owner-go="business"]');
  const bell=()=>localNav('avisos') || actionable('[data-owner-nav="bell"]');
  const current=()=>app.querySelector('#snav button[aria-current="page"]')?.dataset.go || '';
  let last='',open=false;
  const read=()=>{
    const inLocal=visible();
    const tabs=[
      ['home','Inicio','home',true],
      ['business','Empresa','shop',!!(business()||inLocal)],
      ['staff','Colaboradores','people',!!staff()],
      ...(inLocal?[
        ['vencimientos','Vencimientos','clock',!!localNav('vencimientos')]
      ]:[
        ['avisos','Avisos','bell',!!bell()]
      ]),
      ['more','Más','more',true]
    ].filter(t=>t[3]);
    // Evitar que un botón no autorizado aparezca o se vuelva un enlace público.
    return tabs;
  };
  function closeSheet(){
    open=false; sheet.hidden=true; sheet.innerHTML='';
    dock.querySelector('[data-dock="more"]')?.setAttribute('aria-expanded','false');
  }
  function act(k){
    if(k==='more'){open?closeSheet():openSheet();return;}
    closeSheet();
    if(k==='home'){
      if(visible()){
        const back=app.querySelector('[data-act="locales"]');
        if(back){back.click();return;}
      }
      window.scrollTo({top:0,behavior:'smooth'});return;
    }
    if(k==='business'){
      if(visible() && localNav('inicio')){localNav('inicio').click();return;}
      const control=business();if(control)control.click();return;
    }
    if(k==='staff'){staff()?.click();return;}
    if(k==='avisos'){bell()?.click();return;}
    if(k==='vencimientos'){localNav('vencimientos')?.click();}
  }
  function openSheet(){
    const entries=[
      ['home','Inicio'],
      ['business','Administración de la empresa'],
      ['staff','Colaboradores'],
      ['avisos','Avisos'],
      ['vencimientos','Vencimientos']
    ].filter(([k])=>k==='home'||(k==='business'&&business())||(k==='staff'&&staff())||(k==='avisos'&&bell())||(k==='vencimientos'&&localNav(k)));
    const extra=visible()?[...app.querySelectorAll('#snav button[data-go]')].filter(b=>!['inicio','avisos','vencimientos'].includes(b.dataset.go)).slice(0,16):[];
    sheet.innerHTML='<button type="button" class="gl-mobile-sheet__scrim" data-close-sheet aria-label="Cerrar más opciones"></button><section class="gl-mobile-sheet__panel" role="dialog" aria-modal="true" aria-label="Más opciones de GESTLOK"><header><strong>Más opciones</strong><button type="button" data-close-sheet aria-label="Cerrar">×</button></header><div class="gl-mobile-sheet__links">'+entries.map(([k,t])=>'<button type="button" data-sheet-action="'+k+'">'+t+'</button>').join('')+extra.map(b=>'<button type="button" data-sheet-go="'+String(b.dataset.go).replace(/&/g,'&amp;').replace(/"/g,'&quot;')+'">'+(b.querySelector('.nl')?.textContent||b.textContent||'Opción').trim().replace(/&/g,'&amp;').replace(/</g,'&lt;')+'</button>').join('')+'</div></section>';
    sheet.hidden=false;open=true;
    dock.querySelector('[data-dock="more"]')?.setAttribute('aria-expanded','true');
    sheet.querySelector('.gl-mobile-sheet__panel button')?.focus();
  }
  function sync(){
    const show=(max.matches || document.documentElement.classList.contains('gl-visitor-mode')) && !document.documentElement.classList.contains('auth-on') && (!hub.hidden || !app.hidden);
    dock.hidden=!show;
    document.documentElement.classList.toggle('gl-mobile-dock-present',show);
    if(!show){closeSheet();return;}
    const tabs=read(),signature=tabs.map(t=>t[0]+':'+t[1]).join('|');
    if(signature!==last){
      last=signature;
      dock.innerHTML=tabs.map(([key,label,ico])=>'<button type="button" data-dock="'+key+'" aria-label="'+label+'"'+(key==='more'?' aria-haspopup="dialog" aria-expanded="false"':'')+'>'+icon(ico)+'<span>'+label+'</span></button>').join('');
    }
    const active=visible()?(app.querySelector('#view .gl-manager-landing')?'home':({'inicio':'business','vencimientos':'vencimientos','avisos':'avisos'}[current()]||'business')):'home';
    dock.querySelectorAll('button[data-dock]').forEach(b=>{
      if(b.dataset.dock===active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');
    });
  }
  dock.addEventListener('click',e=>{
    const k=e.target.closest('[data-dock]')?.dataset.dock;if(k)act(k);
  });
  sheet.addEventListener('click',e=>{
    if(e.target.closest('[data-close-sheet]')){closeSheet();return;}
    const action=e.target.closest('[data-sheet-action]')?.dataset.sheetAction;
    if(action){act(action);return;}
    const go=e.target.closest('[data-sheet-go]')?.dataset.sheetGo;
    if(go){closeSheet();localNav(go)?.click();}
  });
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&open)closeSheet();});
  let frame=0;
  const requestSync=()=>{if(frame)return;frame=requestAnimationFrame(()=>{frame=0;sync();});};
  const observer=new MutationObserver(requestSync);
  observer.observe(hub,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden']});
  observer.observe(app,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','aria-current']});
  max.addEventListener?.('change',requestSync);
  window.addEventListener('pageshow',requestSync);
  window.GestLokMobileDock={refresh:requestSync};
  requestSync();
})();
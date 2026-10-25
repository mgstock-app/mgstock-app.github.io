/* Owner entry: capabilities come from the authenticated backend, never signup metadata. */
(() => {
  'use strict';
  let api,state={status:'loading',data:null},busy=false,admin={status:'loading',companies:[]},adminBusy=false;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  async function refresh(){
    if(!api||api.role()!=='dueno'||!api.S.loaded.e||busy)return;
    if(api.S.offline&&state.status==='ready')return;
    busy=true;
    try{
      const {data,error}=await window.GestLokSupabase.rpc('gestlok_owner_area_context');
      if(error||!data||data.role!=='dueno'||data.tenant_id!==api.S.me?.tenant_id)throw Error('Contexto no autorizado');
      const next={status:'ready',data};
      if(JSON.stringify(next)!==JSON.stringify(state)){state=next;api.render();}
    }catch{
      const changed=state.status!=='error';state={status:'error',data:null};
      if(changed)api.render();
    }finally{busy=false;}
  }
  async function refreshAdmin(){
    if(!api||api.role()!=='creadora'||!api.S.loaded.e||adminBusy)return;
    if(api.S.offline&&admin.status==='ready')return;
    adminBusy=true;
    try{
      const {data,error}=await window.GestLokSupabase.rpc('gestlok_creator_companies_index');
      if(error||data?.scope!=='metadata_only'||!Array.isArray(data.companies))throw Error('Sin autorización');
      const next={status:'ready',companies:data.companies};
      if(JSON.stringify(next)!==JSON.stringify(admin)){admin=next;if(!api.S.creatorSetup&&!api.S.panel)api.render();}
    }catch{const changed=admin.status!=='error';admin={status:'error',companies:[]};if(changed&&!api.S.creatorSetup&&!api.S.panel)api.render();}
    finally{adminBusy=false;}
  }
  function adminView(){
    if(api?.role()!=='creadora')return '';
    return '<section class="gl-admin-card" aria-label="Empresas registradas"><header><h2>Empresas registradas</h2><small>Consulta de información general · Solo lectura</small></header>'+
      (admin.status==='ready'?'<div class="gl-admin-tablewrap"><table><thead><tr><th>Empresa</th><th>Locales</th><th>Dueños asignados</th></tr></thead><tbody>'+admin.companies.map(c=>'<tr><td>'+esc(c.name)+'</td><td>'+esc((c.locals||[]).map(l=>l.name).join(' · '))+'</td><td>'+esc(c.owners)+'</td></tr>').join('')+'</tbody></table></div>':
       '<p role="status">'+(admin.status==='error'?'No pudimos consultar el registro autorizado.':'Consultando empresas autorizadas…')+'</p>')+
      '<p class="lead">Este registro no concede acceso a datos privados de las empresas.</p></section>';
  }
  function allowed(name){
    const m=state.data?.modules?.[name];
    return state.status==='ready'&&m?.authorized===true&&m?.operational===true;
  }
  function view(locals,card){
    if(state.status==='loading')return '<section class="gl-owner-modules"><p role="status">Comprobando tus áreas autorizadas…</p></section>';
    if(state.status==='error')return '<section class="gl-owner-modules"><p role="alert">No pudimos verificar tus permisos. Revisá la conexión.</p><button class="btn" data-owner-area-retry>Reintentar</button></section>';
    const commerce=allowed('comercial'),staff=allowed('recibos_personal')&&typeof window.GestLokEmployees?.open==='function';
    const visible=locals.filter(l=>state.data.local_ids?.includes(l.id));
    const settings=commerce&&window.GestLokCommerce?.card?.();
    const brand=state.data.logo_id==='mi-gusto'?'<img class="gl-owner-company-logo" src="img/mi-gusto-negro.png" alt="Mi Gusto">':'';
    return '<section class="gl-owner-modules" aria-label="Áreas de administración"><header>'+brand+
      '<p class="eyebrow">GESTLOK / '+esc(state.data.company_name||'Mi empresa')+'</p><h1>¿Qué querés administrar?</h1><p>Elegí un área para continuar.</p></header><div class="gl-owner-modules-grid">'+
      (commerce?'<article class="gl-owner-module gl-owner-module-commerce"><span aria-hidden="true">🏬</span><h2>Administrar mi empresa</h2><p>Productos, stock, proveedores, pedidos y reportes.</p><div class="gl-owner-module-locations">'+visible.map(card).join('')+'</div>'+(settings?'<details class="gl-owner-business-settings"><summary data-owner-settings>Configurar modalidad de empresa</summary>'+settings+'</details>':'')+'</article>':'')+
      (staff?'<article class="gl-owner-module gl-owner-module-staff"><span aria-hidden="true">👥</span><h2>Administrar empleados</h2><p>Horarios, planillas, recibos, locales y personal.</p><button class="btn primary" data-owner-area-staff>Abrir administración de empleados</button></article>':'')+
      (!commerce&&!staff?'<p class="note">Todavía no hay áreas habilitadas para esta cuenta.</p>':'')+'</div></section>';
  }
  document.addEventListener('click',e=>{
    if(e.target.closest('[data-owner-area-retry]')){e.preventDefault();refresh();}
    if(e.target.closest('[data-owner-area-staff]')&&allowed('recibos_personal')){e.preventDefault();window.GestLokEmployees?.open?.();}
  });
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){refresh();refreshAdmin();}});
  window.addEventListener('online',()=>{refresh();refreshAdmin();});
  window.GestLokOwnerAreas=Object.freeze({attach(ctx){api=ctx;},refresh,view,allowed,refreshAdmin,adminView});
})();

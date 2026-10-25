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
      // El registro de acciones es complementario: si no responde, el registro de empresas sigue visible.
      let audit=[];
      try{const r=await window.GestLokSupabase.rpc('gestlok_creator_audit');if(!r.error&&Array.isArray(r.data))audit=r.data.slice(0,8);}catch{}
      const next={status:'ready',companies:data.companies,audit};
      if(JSON.stringify(next)!==JSON.stringify(admin)){admin=next;if(!api.S.creatorSetup&&!api.S.panel)api.render();}
    }catch{const changed=admin.status!=='error';admin={status:'error',companies:[],audit:[]};if(changed&&!api.S.creatorSetup&&!api.S.panel)api.render();}
    finally{adminBusy=false;}
  }
  const ACTIONS={module_enabled:'Empleados habilitado',module_disabled:'Empleados deshabilitado',recibonet_linked:'Empresa vinculada con ReciboNet',editing_enabled:'Edición habilitada',editing_disabled:'Edición cerrada'};
  const when=v=>{try{return new Date(v).toLocaleString('es-AR',{dateStyle:'short',timeStyle:'short'});}catch{return '';}};
  function adminView(){
    if(api?.role()!=='creadora')return '';
    const ready=admin.status==='ready',names=new Map(admin.companies.map(c=>[c.tenant_id,c.name]));
    const registry='<section class="gl-admin-card" aria-label="Empresas registradas"><header><h2>Empresas registradas</h2><small>Consulta de información general · Solo lectura</small></header>'+
      (ready?'<div class="gl-admin-tablewrap"><table><thead><tr><th>Empresa</th><th>Locales</th><th>Dueños asignados</th></tr></thead><tbody>'+admin.companies.map(c=>'<tr><td>'+esc(c.name)+'</td><td>'+esc((c.locals||[]).map(l=>l.name).join(' · '))+'</td><td>'+esc(c.owners)+'</td></tr>').join('')+'</tbody></table></div>':
       '<p role="status">'+(admin.status==='error'?'No pudimos consultar el registro autorizado.':'Consultando empresas autorizadas…')+'</p>')+
      '<p class="lead">Este registro no concede acceso a datos privados de las empresas.</p></section>';
    if(!ready)return registry;
    // Asignación de módulos: acción explícita, confirmada y auditada en el backend.
    const modules='<section class="gl-admin-card gl-admin-modules" aria-label="Módulos autorizados"><header><h2>Módulos autorizados</h2><small>Administrar mi empresa · Administrar a los empleados</small></header>'+
      '<div class="gl-admin-tablewrap"><table><thead><tr><th>Empresa</th><th>Administrar mi empresa</th><th>Administrar a los empleados</th></tr></thead><tbody>'+
      admin.companies.map(c=>{const on=c.modules?.recibos_personal===true,link=c.recibonet?.organization_number;
        return '<tr><td>'+esc(c.name)+'</td><td><span class="pill ok">Habilitado</span></td><td>'+
          (link?'<span class="pill '+(on?'ok':'')+'">'+(on?'Habilitado':'Deshabilitado')+'</span> <small>ReciboNet '+esc(link)+'</small> <button class="btn sm" data-owner-module="'+esc(c.tenant_id)+'" data-enable="'+(on?'false':'true')+'">'+(on?'Deshabilitar':'Habilitar')+'</button>'
              :'<small>Sin organización de ReciboNet vinculada y verificada</small>')+'</td></tr>';}).join('')+
      '</tbody></table></div><p class="lead">Habilitar no crea ni copia datos: los recibos y planillas siguen protegidos por los permisos de ReciboNet. <a href="empleados/">Abrir empleados en modo consulta →</a></p>'+
      ((admin.audit||[]).length?'<h3>Últimas acciones administrativas</h3><ul class="gl-admin-audit">'+admin.audit.map(a=>'<li><b>'+esc(ACTIONS[a.action]||a.action)+'</b> · '+esc(names.get(a.tenant_id)||'Plataforma')+' · <small>'+esc(when(a.at))+'</small></li>').join('')+'</ul>':'')+
      '</section>';
    return registry+modules;
  }
  async function setModule(tenant,enable){
    if(!api||api.role()!=='creadora'||adminBusy)return;
    const name=admin.companies.find(c=>c.tenant_id===tenant)?.name||'esta empresa';
    if(!window.confirm((enable?'¿Habilitar':'¿Deshabilitar')+' «Administrar a los empleados» para '+name+'? Queda registrado.'))return;
    const {error}=await window.GestLokSupabase.rpc('gestlok_creator_set_module',{p_tenant:tenant,p_module:'recibos_personal',p_enabled:enable});
    if(error)window.alert(error.message||'No se pudo guardar el cambio.');
    await refreshAdmin();
  }
  function allowed(name){
    const m=state.data?.modules?.[name];
    return state.status==='ready'&&m?.authorized===true&&m?.operational===true;
  }
  const ICON_STORE='<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false"><path d="M8 20 11 9h26l3 11" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M8 20c0 3 2.4 5 5.3 5S18.7 23 18.7 20c0 3 2.4 5 5.3 5s5.3-2 5.3-5c0 3 2.4 5 5.4 5S40 23 40 20" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M11 25v14h26V25M20 39v-9h8v9" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/></svg>';
  const ICON_TEAM='<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false"><circle cx="18" cy="16" r="6.5" fill="none" stroke="currentColor" stroke-width="3"/><path d="M6 38c0-7 5.4-12 12-12s12 5 12 12" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><circle cx="33" cy="18" r="5" fill="none" stroke="currentColor" stroke-width="3"/><path d="M31 27.4c6 .2 10.6 4.6 10.6 10.6" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>';
  const list=items=>'<ul class="gl-owner-area-list">'+items.map(i=>'<li>'+i+'</li>').join('')+'</ul>';
  function view(locals,card){
    if(state.status==='loading')return '<section class="gl-owner-landing gl-owner-landing-wait"><p role="status">Comprobando tus áreas autorizadas…</p></section>';
    if(state.status==='error')return '<section class="gl-owner-landing gl-owner-landing-wait"><p role="alert">No pudimos verificar tus permisos. Revisá la conexión.</p><button class="btn" data-owner-area-retry>Reintentar</button></section>';
    const commerce=allowed('comercial'),staff=allowed('recibos_personal');
    const visible=locals.filter(l=>state.data.local_ids?.includes(l.id));
    const settings=commerce&&window.GestLokCommerce?.card?.();
    const name=esc(state.data.company_name||'Mi empresa');
    // El logo de Mi Gusto solo se muestra cuando el backend lo asigna a esta empresa.
    const company=state.data.logo_id==='mi-gusto'
      ?'<img class="gl-owner-company-logo" src="img/mi-gusto-blanco.png" alt="Mi Gusto" width="562" height="278">'
      :'<b class="gl-owner-company-name">'+name+'</b>';
    return '<section class="gl-owner-landing" aria-label="Inicio de GESTLOK · '+name+'">'+
      '<header class="gl-owner-welcome"><div><p>Bienvenido/a a</p><h1><span>GEST</span><span>LOK</span></h1><p class="gl-owner-tagline">Todo lo que necesitás, en un solo lugar.</p></div>'+
      '<div class="gl-owner-company" aria-label="Empresa">'+company+'</div></header>'+
      '<div class="gl-owner-areas'+(commerce&&staff?'':' gl-owner-areas-one')+'">'+
      (commerce?'<article class="gl-owner-area gl-owner-business" aria-labelledby="gl-owner-business-t"><div class="gl-owner-area-icon">'+ICON_STORE+'</div>'+
        '<h2 id="gl-owner-business-t">Administrar <span>mi empresa</span></h2><p>Productos, stock, proveedores, pedidos y reportes.</p>'+
        list(['Productos y stock','Proveedores y pedidos','Tienda física, online o mixta','Reportes e historial','Locales y configuración'])+
        '<h3>Elegí un local para ingresar</h3><div class="gl-owner-module-locations">'+visible.map(card).join('')+'</div>'+
        (settings?'<details class="gl-owner-business-settings"><summary data-owner-settings>Configurar modalidad de empresa</summary>'+settings+'</details>':'')+'</article>':'')+
      (staff?'<article class="gl-owner-area gl-owner-employees" aria-labelledby="gl-owner-staff-t"><div class="gl-owner-area-icon">'+ICON_TEAM+'</div>'+
        '<h2 id="gl-owner-staff-t">Administrar <span>a los empleados</span></h2><p>Horarios, planillas, recibos y gestión del personal.</p>'+
        list(['Empleados y roles','Horarios semanales y mensuales','Planillas, liquidaciones y cálculos','Recibos de sueldo','Enlaces a Google Sheets y Excel','Historial, PDF y WhatsApp'])+
        '<button class="btn primary gl-owner-area-go" data-owner-area-staff>Ingresar a empleados</button></article>':'')+
      (!commerce&&!staff?'<p class="note gl-owner-none">Todavía no hay áreas habilitadas para esta cuenta.</p>':'')+'</div></section>';
  }
  // El módulo de empleados vive en la misma aplicación (misma dirección e instalación).
  const employees=Object.freeze({open(){location.assign(new URL('empleados/',document.baseURI).href);}});
  document.addEventListener('click',e=>{
    if(e.target.closest('[data-owner-area-retry]')){e.preventDefault();refresh();}
    if(e.target.closest('[data-owner-area-staff]')&&allowed('recibos_personal')){e.preventDefault();employees.open();}
    const mod=e.target.closest('[data-owner-module]');
    if(mod){e.preventDefault();setModule(mod.dataset.ownerModule,mod.dataset.enable==='true');}
  });
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){refresh();refreshAdmin();}});
  window.addEventListener('online',()=>{refresh();refreshAdmin();});
  window.GestLokOwnerAreas=Object.freeze({attach(ctx){api=ctx;},refresh,view,allowed,refreshAdmin,adminView});
})();

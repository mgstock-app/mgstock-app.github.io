/* Owner entry: capabilities come from the authenticated backend, never signup metadata. */
(() => {
  'use strict';
  let api,state={status:'loading',data:null},gerente={status:'loading',locals:[]},gerenteBusy=false,busy=false,admin={status:'loading',companies:[]},adminBusy=false;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  /* Vista previa visual de la creadora como Dueña: arma el contexto con los datos que ya puede consultar.
     No concede permisos; el backend sigue tratándola como creadora de solo lectura. */
  async function previewOwner(){
    const r=await window.GestLokSupabase.rpc('gestlok_creator_companies_index');
    if(r.error)return {error:r.error};
    const co=(r.data?.companies||[]).find(c=>c.tenant_id===api.S.me?.tenant_id);
    if(!co)return {error:Error('Sin empresa')};
    const branded=(api.S.equipo||[]).some(e=>e.rol==='dueno'&&e.logoId==='mi-gusto');
    const staff=co.modules?.recibos_personal===true&&!!co.recibonet;
    return {data:{role:'dueno',tenant_id:co.tenant_id,company_name:co.name||'Mi empresa',logo_id:branded?'mi-gusto':null,
      local_ids:(co.locals||[]).map(l=>l.id),
      recibonet:staff?{organization_number:co.recibonet.organization_number,internal_name:''}:null,
      modules:{comercial:{authorized:true,operational:true},
        recibos_personal:staff?{authorized:true,operational:true}:{authorized:false,operational:!!co.recibonet,reason:co.recibonet?'module_not_enabled':'company_not_linked'}}}};
  }
  /* Gerente: colaboradores y horarios se habilitan únicamente con permisos del servidor. */
  async function refreshGerente(){
    if(!api||api.role()!=='gerente'||!api.S.loaded.e||gerenteBusy)return;
    if(api.S.offline&&gerente.status==='ready')return;
    if(window.GestLokCreatorSupport?.previewRol?.()==='gerente'){
      const next={status:'ready',locals:(api.S.me?.locales||[]).slice()};
      if(JSON.stringify(next)!==JSON.stringify(gerente)){gerente=next;api.render();}
      return;
    }
    gerenteBusy=true;
    try{
      const {data,error}=await window.GestLokSupabase.rpc('gestlok_gerente_area_context');
      if(error||!data||data.role!=='gerente'||data.tenant_id!==api.S.me?.tenant_id||!Array.isArray(data.local_ids)||!data.local_ids.length)throw Error('Sin autorización');
      const locals=data.local_ids.map(id=>id==='dt'&&data.tenant_id==='cb0dc04a-9a13-434f-a3d0-47f1d8f39670'?'torcuato':id);
      const next={status:'ready',locals};
      if(JSON.stringify(next)!==JSON.stringify(gerente)){gerente=next;api.render();}
    }catch{
      const changed=gerente.status!=='none';gerente={status:'none',locals:[]};
      if(changed)api.render();
    }finally{gerenteBusy=false;}
  }
  function gerenteCard(){
    if(gerente.status!=='ready')return '';
    return '<section class="gl-home-essential-actions" aria-label="Administración de empleados"><h2>Administración de empleados</h2><div class="gl-home-essential-links"><button type="button" data-gerente-empleados>'+
      '<span aria-hidden="true">'+svg('<path d="M4 6h16v13H4zM8 3v6M16 3v6M4 11h16"/>',20)+'</span><b>Colaboradores</b>'+svg('<path d="m9 6 6 6-6 6"/>',18)+'</button><button type="button" data-gerente-horarios>'+svg(I.calendar,20)+'<b>Horarios y Google Sheets</b>'+svg(I.right,18)+'</button></div><p class="lead">Legajos de tu local y horarios con la misma cuenta de GESTLOK.</p></section>';
  }
  function gerenteHome(){
    if(api?.role?.()!=='gerente'||!api.S.local)return '';
    const local=api.S.local, name=(api.S.localesDB||[]).find(l=>l.id===local)?.nombre||'Tu local';
    const brand=(api.S.equipo||[]).some(e=>e.rol==='dueno'&&e.logoId==='mi-gusto');
    const staff=gerente.status==='ready'&&gerente.locals.includes(local);
    const pending=gerente.status==='loading';
    return '<section class="gl-owner-landing gl-manager-landing" aria-label="Inicio del gerente"><header class="gl-owner-welcome"><div><p>Bienvenido/a · '+esc(name)+'</p>'+
      (brand?'<h1 class="gl-owner-welcome-logo"><img src="img/mi-gusto-blanco.png" alt="Mi Gusto"></h1><p>Empanadas de Verdad</p>':'<h1><span>GEST</span><span>LOK</span></h1>')+
      '<p class="gl-owner-tagline">Todo lo que necesitás para tu local.</p></div></header><div class="gl-owner-areas">'+
      '<article class="gl-owner-area gl-owner-business" data-gerente-area="business"><div class="gl-owner-area-icon">'+ICON_STORE+'</div><div class="gl-owner-area-title"><h2>Administrar <span>mi empresa</span></h2><button class="gl-owner-arrow" data-gerente-business aria-label="Abrir tareas de mi local">'+svg(I.right,26)+'</button></div><p>Productos, stock, proveedores y tareas de tu local.</p>'+
      list([['box','Productos y stock'],['truck','Proveedores y pedidos'],['calendar','Vencimientos y avisos'],['team','Chat del local']])+'</article>'+
      '<article class="gl-owner-area gl-owner-employees'+(staff?'':' gl-owner-employees-locked')+'"'+(staff?' data-gerente-area="staff"':' aria-disabled="true"')+'><div class="gl-owner-area-icon">'+ICON_TEAM+'</div><div class="gl-owner-area-title"><h2>Administrar <span>a los empleados</span></h2>'+
      (staff?'<button class="gl-owner-arrow" data-gerente-empleados aria-label="Abrir colaboradores de mi local">'+svg(I.right,26)+'</button>':'<small role="status">'+(pending?'Comprobando acceso…':'Horarios no habilitados')+'</small>')+'</div><p>Colaboradores, legajos y turnos de tu propio local.</p>'+list([['team','Colaboradores y fichas'],['calendar','Horarios'],['link','Enlaces a Google Sheets']])+'</article></div>'+ (staff ? '<nav class="gl-manager-quick" aria-label="Accesos rápidos del gerente">'+[['proveedores','box','Proveedores'],['vencimientos','calendar','Vencimientos'],['chat','file','Chat del local'],['avisos','bell','Avisos']].map(([k,i,t])=>'<button type="button" data-gerente-quick="'+k+'">'+svg(I[i],23)+'<span>'+t+'</span></button>').join('')+'</nav>' : '')+'</section>'+
      (window.GestLokUpdates?.homeDue?.()||'');
  }
  async function refresh(){
    refreshGerente();
    if(!api||!['dueno','creadora'].includes(api.role())||!api.S.loaded.e||busy)return;
    if(api.S.offline&&state.status==='ready')return;
    busy=true;
    try{
      const inSupport=window.GestLokCreatorSupport?.state?.()?.active===true;
      const {data,error}=inSupport
        ? await window.GestLokSupabase.rpc('gestlok_owner_area_context')
        : (api.role()==='creadora'||window.GestLokCreatorSupport?.previewRol?.()==='dueno')
          ? await previewOwner()
          : await window.GestLokSupabase.rpc('gestlok_owner_area_context');
      if(error||!data||data.role!=='dueno'||data.tenant_id!==api.S.me?.tenant_id)throw Error('Contexto no autorizado');
      window.GestLokPilot?.refresh?.(data,api);
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
  const ACTIONS={module_enabled:'Empleados habilitado',module_disabled:'Empleados deshabilitado',recibonet_linked:'Empresa vinculada con ReciboNet',editing_enabled:'Edición habilitada',editing_disabled:'Edición cerrada',support_view_opened:'Consulta de empresa abierta (solo lectura)',support_view_closed:'Consulta de empresa cerrada'};
  const when=v=>{try{return new Date(v).toLocaleString('es-AR',{dateStyle:'short',timeStyle:'short'});}catch{return '';}};
  function adminView(){
    if(api?.role()!=='creadora')return '';
    const ready=admin.status==='ready',names=new Map(admin.companies.map(c=>[c.tenant_id,c.name]));
    const registry='<section class="gl-admin-card" aria-label="Empresas registradas"><header><h2>Empresas registradas</h2><small>Consulta de información general · Solo lectura</small></header>'+
      (ready?'<div class="gl-admin-tablewrap"><table><thead><tr><th>Empresa</th><th>Locales</th><th>Dueños asignados</th><th>Consultar</th></tr></thead><tbody>'+admin.companies.map(c=>'<tr><td>'+esc(c.name)+'</td><td>'+esc((c.locals||[]).map(l=>l.name).join(' · '))+'</td><td>'+esc(c.owners)+'</td><td>'+(window.GestLokCreatorSupport?.openButton?.(c.tenant_id,c.name)||'')+'</td></tr>').join('')+'</tbody></table></div>':
       '<p role="status">'+(admin.status==='error'?'No pudimos consultar el registro autorizado.':'Consultando empresas autorizadas…')+'</p>')+
      '<p class="lead">Para revisar otra empresa usá «Ver en solo lectura»: pide un motivo, dura 30 minutos, no permite cambiar nada y queda registrado.</p></section>';
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
    return registry+modules+(window.GestLokCreatorSupport?.previewCard?.()||'');
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
  /* ---------- Inicio del dueño: cabecera, carpetas, accesos generales y paneles ---------- */
  const svg=(d,w=24)=>'<svg viewBox="0 0 24 24" width="'+w+'" height="'+w+'" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'+d+'</svg>';
  const I={
    menu:'<path d="M4 7h16M4 12h16M4 17h16"/>',
    bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9z"/><path d="M10 21h4"/>',
    down:'<path d="m6 9 6 6 6-6"/>', right:'<path d="m9 6 6 6-6 6"/>',
    box:'<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/>',
    truck:'<path d="M3 6h11v10H3zM14 10h4l3 3v3h-7z"/><circle cx="7" cy="18" r="1.8"/><circle cx="17" cy="18" r="1.8"/>',
    bars:'<path d="M5 20V10M12 20V4M19 20v-7"/>',
    cart:'<path d="M3 4h2.5l2 11h10l2-8H7"/><circle cx="9" cy="19" r="1.6"/><circle cx="17" cy="19" r="1.6"/>',
    gear:'<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>',
    calendar:'<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
    sheet:'<path d="M7 3h8l4 4v14H7z"/><path d="M15 3v4h4M10 12h6M10 16h6"/>',
    receipt:'<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M12 7v10M14.5 9.5c-.5-1-4-1.2-4 .8 0 2 4.5 1 4.5 3.2 0 1.8-3.8 1.8-4.5.4"/>',
    team:'<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.6 2.7-6 6-6s6 2.4 6 6"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.2c3 .1 5 2 5 5.3"/>',
    link:'<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    pie:'<path d="M12 3a9 9 0 1 0 9 9h-9z"/><path d="M15 3.5A9 9 0 0 1 20.5 9H15z"/>',
    user:'<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>',
    file:'<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/>',
    help:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 1-1 1.7M12 17h.01"/>',
    out:'<path d="M9 4H5v16h4M16 8l4 4-4 4M20 12H9"/>', home:'<path d="m4 11 8-7 8 7v9H4z"/><path d="M10 20v-6h4v6"/>'
  };
  const ICON_STORE='<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false"><path d="M8 20 11 9h26l3 11" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M8 20c0 3 2.4 5 5.3 5S18.7 23 18.7 20c0 3 2.4 5 5.3 5s5.3-2 5.3-5c0 3 2.4 5 5.4 5S40 23 40 20" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M11 25v14h26V25M20 39v-9h8v9" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/></svg>';
  const ICON_TEAM='<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false"><circle cx="18" cy="16" r="6.5" fill="none" stroke="currentColor" stroke-width="3"/><path d="M6 38c0-7 5.4-12 12-12s12 5 12 12" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><circle cx="33" cy="18" r="5" fill="none" stroke="currentColor" stroke-width="3"/><path d="M31 27.4c6 .2 10.6 4.6 10.6 10.6" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>';
  const list=items=>'<ul class="gl-owner-area-list">'+items.map(([ic,t])=>'<li><span class="gl-owner-li-ic">'+svg(I[ic],22)+'</span>'+t+'</li>').join('')+'</ul>';
  let menuOpen=false,panelKind='',panelHtml='',shown={locals:[],card:()=>''};
  const visibleLocals=()=>shown.locals.filter(l=>state.data?.local_ids?.includes(l.id));
  const stats=l=>{try{return api?.hubStats?api.hubStats(l.id):null;}catch{return null;}};
  const toOrder=()=>visibleLocals().reduce((n,l)=>n+((stats(l)?.ped)||0),0);
  function firstName(){
    const me=api?.S?.me||{},eq=(api?.S?.equipo||[]).find(e=>String(e.email||'').toLowerCase()===String(me.email||'').toLowerCase());
    const raw=String(eq?.nombre||eq?.name||me.name||String(me.email||'').split('@')[0]||'').trim();
    const w=raw.split(/[\s._-]+/).filter(Boolean)[0]||'';
    return w?w.charAt(0).toUpperCase()+w.slice(1).toLowerCase():'';
  }
  const roleName=()=>api?.rolLabel?api.rolLabel(api.role()==='creadora'?'creadora':'dueno'):'Dueño';
  const supportLink=()=>{try{return window.GestLokSupport?.link?.()||'';}catch{return '';}};
  function header(){
    if(api?.role?.()!=='dueno')return '';
    const n=firstName(),dot=toOrder()>0;
    return '<header class="gl-oh-top"><button class="gl-oh-icon" data-owner-nav="menu" aria-label="Abrir menú" aria-haspopup="dialog">'+svg(I.menu,26)+'</button>'+
      (state.status==='ready'&&state.data?.logo_id==='mi-gusto' ? '<div class="gl-oh-brand gl-oh-brand-company"><img src="img/mi-gusto-blanco.png" alt="Mi Gusto"><small>Empanadas de Verdad</small></div>' : '<div class="gl-oh-brand"><img src="icons/gestlok.svg" alt="" width="50" height="50"><div><b class="gl-oh-word"><span>GEST</span><span>LOK</span></b><small>ORGANIZA · CONTROLA · HACE CRECER</small></div></div>')+
      '<div class="gl-oh-actions"><button class="gl-oh-icon gl-oh-bell" data-owner-nav="bell" aria-label="Notificaciones y avisos'+(dot?' (hay avisos de stock)':'')+'" aria-haspopup="dialog">'+svg(I.bell,26)+(dot?'<i class="gl-oh-dot" aria-hidden="true"></i>':'')+'</button>'+
      '<div class="gl-oh-userwrap"><button class="gl-oh-user" data-owner-nav="user" aria-haspopup="menu" aria-expanded="'+menuOpen+'"><span class="gl-oh-avatar" aria-hidden="true">'+esc((n||'?').charAt(0).toUpperCase())+'</span><span class="gl-oh-who"><b>Hola'+(n?', '+esc(n):'')+'</b><small>'+esc(roleName())+'</small></span>'+svg(I.down,18)+'</button>'+
      (menuOpen?'<div class="gl-oh-menu" role="menu"><button role="menuitem" data-owner-nav="account">'+svg(I.file,18)+'Mi cuenta</button><button role="menuitem" data-owner-nav="settings">'+svg(I.gear,18)+'Ajustes</button><button role="menuitem" data-owner-nav="team">'+svg(I.team,18)+'Equipo y accesos</button><button role="menuitem" data-au="out">'+svg(I.out,18)+'Salir</button></div>':'')+'</div></div></header>';
  }
  function view(locals,card){
    shown={locals:locals||[],card:card||(()=>'')};
    if(state.status==='loading')return '<section class="gl-owner-landing gl-owner-landing-wait"><p role="status">Comprobando tus áreas autorizadas…</p></section>';
    if(state.status==='error')return '<section class="gl-owner-landing gl-owner-landing-wait"><p role="alert">No pudimos verificar tus permisos. Revisá la conexión.</p><button class="btn" data-owner-area-retry>Reintentar</button></section>';
    const commerce=allowed('comercial'),staff=allowed('recibos_personal');
    const name=esc(state.data.company_name||'Mi empresa');
    // El logo de Mi Gusto solo se muestra cuando el backend lo asigna a esta empresa.
    const branded=state.data.logo_id==='mi-gusto';
    const company=branded
      ?'<img class="gl-owner-company-logo" src="img/mi-gusto-blanco.png" alt="Mi Gusto" width="562" height="278">'
      :'<b class="gl-owner-company-name">'+name+'</b>';
    const tile=(k,ic,t)=>'<button class="gl-owner-tile" data-owner-nav="'+k+'"><span>'+svg(I[ic],28)+'</span>'+t+'</button>';
    const pilot=window.GestLokPilot?.homeTile?.(state.data,api)||'';
    const sup=supportLink();
    const support=sup?'<a class="gl-owner-tile" href="'+esc(sup)+'" target="_blank" rel="noopener noreferrer"><span>'+svg(I.help,28)+'</span>Soporte</a>':tile('support','help','Soporte');
    return '<section class="gl-owner-landing" aria-label="Inicio de GESTLOK · '+name+'">'+
      '<header class="gl-owner-welcome">'+(branded
        ?'<div><p>Bienvenido/a a</p><h1 class="gl-owner-welcome-logo"><img src="img/mi-gusto-blanco.png" alt="Mi Gusto"></h1><p class="gl-owner-tagline">Todo lo que necesitás, en un solo lugar.</p></div>'
        :'<div><p>Bienvenido/a a</p><h1><span>GEST</span><span>LOK</span></h1><p class="gl-owner-tagline">Todo lo que necesitás, en un solo lugar.</p></div><div class="gl-owner-company" aria-label="Empresa">'+company+'</div>')+'</header>'+
      '<div class="gl-owner-areas'+(commerce?'':' gl-owner-areas-one')+'">'+
      (commerce?'<article class="gl-owner-area gl-owner-business" data-owner-go="business" aria-labelledby="gl-owner-business-t"><div class="gl-owner-area-icon">'+ICON_STORE+'</div>'+
        '<div class="gl-owner-area-title"><h2 id="gl-owner-business-t">Administrar <span>mi empresa</span></h2><button class="gl-owner-arrow" data-owner-nav="business" aria-label="Abrir Administrar mi empresa">'+svg(I.right,26)+'</button></div>'+
        '<p>Productos, stock, proveedores, pedidos y más.</p>'+
        list([['box','Productos y stock'],['truck','Proveedores y pedidos'],['bars','Reportes e historial'],['cart','Tienda online / mixta / física'],['gear','Ajustes de la empresa']])+'</article>':'')+
      (staff?'<article class="gl-owner-area gl-owner-employees" data-owner-go="staff" aria-labelledby="gl-owner-staff-t"><div class="gl-owner-area-icon">'+ICON_TEAM+'</div>'+
        '<div class="gl-owner-area-title"><h2 id="gl-owner-staff-t">Administrar <span>a los empleados</span></h2><button class="gl-owner-arrow" data-owner-area-staff aria-label="Ingresar a empleados">'+svg(I.right,26)+'</button></div>'+
        '<p>Horarios, planillas, recibos y gestión del personal.</p>'+
        list([['calendar','Horarios'],['sheet','Planillas'],['receipt','Recibos de sueldo'],['team','Empleados y roles'],['link','Enlaces a Excel y Google Sheets'],['bars','Reportes']])+'</article>':
        commerce?'<article class="gl-owner-area gl-owner-employees gl-owner-employees-locked" aria-disabled="true" aria-labelledby="gl-owner-staff-t" style="cursor:default">'+
        '<div class="gl-owner-area-icon">'+ICON_TEAM+'</div>'+
        '<div class="gl-owner-area-title"><h2 id="gl-owner-staff-t">Administrar <span>a los empleados</span></h2><span style="border-radius:999px;background:#d6e3f6;color:#123462;padding:8px 12px;font-size:13px;font-weight:700;white-space:nowrap">Sin habilitar</span></div>'+
        '<p>Horarios, planillas, recibos y gestión del personal.</p>'+
        list([['calendar','Horarios'],['sheet','Planillas'],['receipt','Recibos de sueldo'],['team','Empleados y roles'],['link','Enlaces a Excel y Google Sheets'],['bars','Reportes']])+
        '<p style="margin:16px 0 0;font-size:14px"><strong>Este módulo aún no está habilitado para tu empresa.</strong> Solicitá su activación a la administración de GESTLOK.</p></article>':'')+
      (!commerce&&!staff?'<p class="note gl-owner-none">Todavía no hay áreas habilitadas para esta cuenta.</p>':'')+'</div>'+pilot+
      '<nav class="gl-owner-quick" aria-label="Accesos generales">'+tile('reports','pie','Reportes generales')+tile('account','file','Mi cuenta')+tile('settings','gear','Ajustes')+support+'</nav></section>';
  }
  // El módulo de empleados vive en la misma aplicación (misma dirección e instalación).
  const employees=Object.freeze({open(section){
    // Demo pública: Administración de empleados ficticia (Horarios con un Excel de ejemplo), sin datos reales.
    if(window.GestLokVisitorDemo?.active&&window.GestLokDemoHorarios){window.GestLokDemoHorarios.open();return;}
    location.assign(new URL(section==='horarios'?'empleados/?seccion=horarios':'empleados/',document.baseURI).href);}});
  /* Paneles: todo el contenido sale de datos que la app ya cargó (nada nuevo se pide ni se guarda). */
  const head=(small,title,id)=>'<div class="pn-h"><div><small>'+esc(small)+'</small><h3 id="'+id+'">'+title+'</h3></div><button class="ib" data-act="close" aria-label="Cerrar">'+(api?.ic?api.ic('x'):'×')+'</button></div>';
  const co=()=>esc(state.data?.company_name||'Mi empresa');
  function statLine(l){
    const s=stats(l);if(!s||!s.loaded)return '<p class="lead">Cargando información de '+esc(l.nombre)+'…</p>';
    return '<tr><th scope="row">'+esc(l.nombre)+'</th><td>'+s.n+'</td><td>'+s.sin+'</td><td>'+s.bajo+'</td><td>'+s.nc+'</td><td><b>'+s.ped+'</b></td><td>'+(s.last?esc(when(s.last.fecha)):'Sin conteos')+'</td></tr>';
  }
  const PANELS={
    'owner-picker':()=>({kind:'dlg',html:head(co(),'Elegí un local','gl-op-t')+'<div class="pn-b"><p class="lead">Entrá al local que querés administrar.</p><div class="lcards">'+visibleLocals().map(shown.card).join('')+'</div></div>'}),
    'owner-reports':()=>{
      const ls=visibleLocals(),rows=ls.map(statLine);
      const table=rows.every(r=>r.startsWith('<tr'))&&rows.length
        ?'<div class="gl-admin-tablewrap"><table><thead><tr><th>Local</th><th>Productos</th><th>Sin stock</th><th>Stock bajo</th><th>Sin contar</th><th>A pedir</th><th>Último conteo</th></tr></thead><tbody>'+rows.join('')+'</tbody></table></div>'
        :(rows.length?rows.filter(r=>!r.startsWith('<tr')).join(''):'<p class="lead">No hay locales para mostrar.</p>');
      return {kind:'dlg',html:head(co(),'Reportes generales','gl-or-t')+'<div class="pn-b"><p class="lead">Resumen de todos tus locales con los datos guardados. El detalle de cada producto está dentro de cada local.</p>'+table+
        '<div class="gl-owner-panel-actions">'+ls.map(l=>'<button class="btn" data-act="local" data-id="'+esc(l.id)+'">Abrir '+esc(l.nombre)+' →</button>').join('')+(allowed('recibos_personal')?'<button class="btn primary" data-owner-area-staff>Reportes del personal →</button>':'')+'</div></div>'};
    },
    'owner-account':()=>{
      const me=api?.S?.me||{},ls=visibleLocals().map(l=>esc(l.nombre)).join(' · ')||'Sin locales';
      return {kind:'dlg',html:head(co(),'Mi cuenta','gl-oa-t')+'<div class="pn-b"><dl class="gl-owner-dl"><div><dt>Nombre</dt><dd>'+esc(firstName()||'—')+'</dd></div><div><dt>Correo</dt><dd>'+esc(me.email||'—')+'</dd></div><div><dt>Rol</dt><dd>'+esc(roleName())+'</dd></div><div><dt>Empresa</dt><dd>'+co()+'</dd></div><div><dt>Locales</dt><dd>'+ls+'</dd></div><div><dt>Áreas habilitadas</dt><dd>'+[allowed('comercial')?'Administrar mi empresa':'',allowed('recibos_personal')?'Administrar a los empleados':''].filter(Boolean).map(esc).join(' · ')+'</dd></div></dl>'+
        '<div class="gl-owner-panel-actions"><button class="btn" data-owner-nav="team">Equipo y accesos</button><button class="btn" data-au="out">Salir</button></div></div>'};
    },
    'owner-settings':()=>({kind:'dlg',html:head(co(),'Ajustes','gl-os-t')+'<div class="pn-b gl-owner-settings"><section><h4>Equipo y accesos</h4><p class="lead">Quién puede entrar y a qué locales.</p><button class="btn" data-owner-nav="team">Administrar equipo</button></section>'+
      (allowed('comercial')?'<section><h4>Modalidad de la empresa</h4>'+(window.GestLokCommerce?.card?.()||'<p class="lead">No disponible sin conexión.</p>')+'</section>':'')+
      '<section><h4>Notificaciones</h4><p class="lead">Elegí qué avisos recibís en tu celular.</p><button class="btn" data-owner-nav="bell">Configurar notificaciones</button></section></div>'}),
    'owner-bell':()=>{
      const ls=visibleLocals(),lines=ls.map(l=>{const s=stats(l);return s&&s.loaded?'<li><b>'+esc(l.nombre)+'</b>: '+(s.ped?s.sin+' sin stock · '+s.bajo+' con stock bajo':'sin productos para pedir')+(s.nc?' · '+s.nc+' sin contar':'')+'</li>':'<li><b>'+esc(l.nombre)+'</b>: cargando…</li>';}).join('');
      return {kind:'drawer',html:head(co(),'Avisos y notificaciones','gl-ob-t')+'<div class="pn-b"><section class="gl-owner-alerts"><h4>Stock de tus locales</h4><ul>'+(lines||'<li>No hay locales para mostrar.</li>')+'</ul></section>'+(window.GestLokPush?.drawerContent?.()||'')+'</div>'};
    },
    'owner-menu':()=>{
      const sup=supportLink(),b=(k,ic,t)=>'<button data-owner-nav="'+k+'">'+svg(I[ic],20)+'<span>'+t+'</span></button>';
      return {kind:'drawer',html:head(co(),'Menú','gl-om-t')+'<nav class="pn-b gl-owner-navlist" aria-label="Menú principal">'+b('home','home','Inicio')+(allowed('comercial')?b('business','box','Administrar mi empresa'):'')+(allowed('recibos_personal')?b('staff','team','Administrar a los empleados'):'')+b('reports','pie','Reportes generales')+b('account','file','Mi cuenta')+b('settings','gear','Ajustes')+
        (sup?'<a href="'+esc(sup)+'" target="_blank" rel="noopener noreferrer">'+svg(I.help,20)+'<span>Soporte</span></a>':b('support','help','Soporte'))+b('team','team','Equipo y accesos')+'<button data-au="out">'+svg(I.out,20)+'<span>Salir</span></button></nav>'};
    }
  };
  function paint(kind,reopen){
    if(!api?.openPanel||state.status!=='ready')return;
    const p=PANELS[kind]();
    if(reopen){
      const pn=document.getElementById('pn'),ae=document.activeElement;
      if(!pn||(ae&&pn.contains(ae)&&ae.matches('input,select,textarea'))||p.html===panelHtml)return;
      panelHtml=p.html;pn.innerHTML=p.html;return;
    }
    api.S.panel=kind;panelKind=kind;panelHtml=p.html;api.openPanel(p.html,p.kind);
    const pn=document.getElementById('pn');pn?.setAttribute('aria-labelledby',p.html.match(/<h3 id="([^"]+)"/)?.[1]||'');
    if(kind==='owner-bell')window.GestLokPush?.onOpen?.();
    pn?.querySelector('[data-act="close"]')?.focus({preventScroll:true});
  }
  // Mantiene el panel abierto al día cuando la app vuelve a dibujar el inicio (datos que llegan después).
  function sync(){
    if(panelKind&&api?.S?.panel===panelKind)paint(panelKind,true);else panelKind='';
  }
  function goBusiness(){
    const ls=visibleLocals();
    if(!allowed('comercial')||!ls.length)return;
    if(api.role()==='creadora'&&api.S.local&&api.openBusiness){api.openBusiness();return;}
    if(ls.length===1&&api?.openLocal){api.openLocal(ls[0].id);return;}
    paint('owner-picker');
  }
  function nav(k){
    menuOpen=false;
    const close=()=>{if(api?.S?.panel&&api.closePanel)api.closePanel();};
    switch(k){
      case 'menu':paint('owner-menu');;break;
      case 'bell':paint('owner-bell');;break;
      case 'reports':paint('owner-reports');;break;
      case 'account':paint('owner-account');;break;
      case 'settings':paint('owner-settings');;break;
      case 'home':close();break;
      case 'business':close();goBusiness();break;
      case 'staff':if(allowed('recibos_personal'))employees.open();return;
      case 'team':close();api?.openShare?.();break;
      case 'support':close();api?.toast?.('El soporte todavía no está configurado. Pedile a la administración que cargue el número de WhatsApp.',true);break;
    }
    api?.render?.();
  }
  document.addEventListener('click',e=>{
    if(e.target.closest('[data-owner-area-retry]')){e.preventDefault();refresh();}
    const managerArea=e.target.closest('[data-gerente-area]');
    if(managerArea&&!e.target.closest('button,a,input')&&api?.role?.()==='gerente'){
      if(managerArea.dataset.gerenteArea==='business')api.openBusiness?.();
      else if(gerente.status==='ready'&&gerente.locals.includes(api.S.local))employees.open();
      return;
    }
    if(e.target.closest('[data-gerente-business]')&&api?.role?.()==='gerente'&&api.S.local){e.preventDefault();api.openBusiness?.();return;}
    if(e.target.closest('[data-gerente-empleados]')&&gerente.status==='ready'&&api?.role?.()==='gerente'){e.preventDefault();employees.open();return;}
    if(e.target.closest('[data-gerente-horarios]')&&gerente.status==='ready'&&api?.role?.()==='gerente'){e.preventDefault();employees.open('horarios');return;}
    const managerQuick=e.target.closest('[data-gerente-quick]');
    if(managerQuick&&api?.role?.()==='gerente'&&gerente.status==='ready'&&gerente.locals.includes(api.S.local)){
      e.preventDefault();const destination=managerQuick.dataset.gerenteQuick;
      if(!['proveedores','vencimientos','chat','avisos'].includes(destination))return;
      api.openBusiness?.();
      queueMicrotask(()=>document.querySelector('#app #snav button[data-go="'+destination+'"]')?.click());
      return;
    }
    if(e.target.closest('[data-owner-area-staff]')&&allowed('recibos_personal')){e.preventDefault();employees.open();return;}
    const mod=e.target.closest('[data-owner-module]');
    if(mod){e.preventDefault();setModule(mod.dataset.ownerModule,mod.dataset.enable==='true');return;}
    const n=e.target.closest('[data-owner-nav]');
    if(n&&['dueno','creadora'].includes(api?.role?.())){
      e.preventDefault();
      if(n.dataset.ownerNav==='user'){menuOpen=!menuOpen;api.render();return;}
      nav(n.dataset.ownerNav);return;
    }
    // La tarjeta completa también abre su área (la flecha es el control accesible).
    const go=e.target.closest('[data-owner-go]');
    if(go&&!e.target.closest('a,button,input,select,summary')&&['dueno','creadora'].includes(api?.role?.())){
      if(go.dataset.ownerGo==='business')goBusiness();else if(allowed('recibos_personal'))employees.open();
      return;
    }
    // Elegir un local desde el selector cierra el panel.
    if(e.target.closest('#pn [data-act="local"]')&&PANELS[panelKind])panelKind='';
    if(menuOpen&&!e.target.closest('.gl-oh-userwrap')){menuOpen=false;api?.render?.();}
  });
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&menuOpen){menuOpen=false;api?.render?.();}});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){refresh();refreshAdmin();}});
  window.addEventListener('online',()=>{refresh();refreshAdmin();});
  window.GestLokOwnerAreas=Object.freeze({attach(ctx){api=ctx;},refresh,gerenteCard,gerenteHome,view,header,sync,allowed,refreshAdmin,adminView});
})();

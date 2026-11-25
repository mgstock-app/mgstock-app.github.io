/* Inicio de la creadora: panel prolijo con el resumen de toda la plataforma.
   Es de SOLO LECTURA y exclusivo de la administradora: los datos los entrega la función
   gestlok_creator_dashboard, que el servidor limita a la cuenta kmu15lopez@gmail.com verificada.
   Si la función no responde o rechaza el acceso, app.js muestra el panel anterior (falla cerrada). */
(() => {
  'use strict';
  const TAB_KEY = 'gestlok-admin-tab';
  const PREMIUM_ADMIN_EMAIL = 'kmu15lopez@gmail.com';
  const TABS = Object.freeze([
    ['inicio', 'Inicio', '<path d="m4 11 8-7 8 7v9H4z"/><path d="M10 20v-6h4v6"/>'],
    ['empresas', 'Empresas', '<path d="M4 20V8l8-4 8 4v12"/><path d="M9 20v-6h6v6M9 10h.01M15 10h.01"/>'],
    ['usuarios', 'Usuarios', '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>'],
    ['empleados', 'Empleados', '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.6 2.7-6 6-6s6 2.4 6 6"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.2c3 .1 5 2 5 5.3"/>'],
    ['locales', 'Locales', '<path d="M5 9l1.5-5h11L19 9z"/><path d="M6 9v11h12V9M10 20v-5h4v5"/>'],
    ['gestlok-chat', 'GESTLOK Chat', '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M7 9h10M7 13h6"/>'],
    ['hq', 'GESTLOK HQ', '<path d="M3 20V5h18v15zM3 12h18M12 5v15"/>'],
    ['chat-prueba', 'Prueba GESTLOK Chat', '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M7 9h10M7 13h6M9 20l-3 2"/>'],
    ['resenas', 'Reseñas GESTLOK', '<path d="M4 5h16v14H4z"/><path d="M8 10h8M8 14h5"/>'],
    ['nfc', 'NFC y QR', '<rect x="5" y="3" width="10" height="18" rx="2"/><path d="M9 18h2M18 9a4 4 0 0 1 0 6M20.5 7a7.5 7.5 0 0 1 0 10"/>'],
    ['herramientas', 'Herramientas', '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>'],
    // Mensajes del formulario de Contacto de gestlok.com.ar (gestlok-contacto-web.js).
    ['contacto', 'Mensajes web', '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>']
  ]);
  const MOLINO_TENANT = '6c8717ea-5f78-426b-9458-74a5dcac6e4e';
  const MOLINO_NEXT = 'gestlok:creator-molino-microapp:v1';
  const MOLINO_TOOLS = Object.freeze([
    ['precios', 'Precios', 'Valores compartidos entre las dos sucursales'],
    ['pedidos', 'Pedidos', 'Acassuso realiza pedidos y San Isidro confirma con OK'],
    ['envios', 'Productos enviados', 'Envíos de San Isidro a Acassuso'],
    ['devoluciones', 'Devoluciones', 'Productos devueltos y confirmación de recepción'],
    ['historial', 'Historial', 'Archivo diario de movimientos y precios']
  ]);
  const ACTIONS = Object.freeze({
    module_enabled: ['Empleados habilitado', 'ok'], module_disabled: ['Empleados deshabilitado', 'warn'],
    recibonet_linked: ['Empresa vinculada con Empleados', 'ok'], employee_space_created: ['Espacio de empleados creado', 'ok'],
    editing_enabled: ['Edición habilitada', 'warn'], editing_disabled: ['Edición cerrada', 'ok'],
    support_view_opened: ['Consulta de empresa abierta', 'info'], support_view_closed: ['Consulta de empresa cerrada', 'info'],
    login: ['Ingreso', 'user']
  });
  let api, data = null, status = 'idle', busy = false, timer = 0, tab = 'inicio', molinoBusy = false;
  let showroomPerfil = 'local', showroomExpandido = !!window.matchMedia?.('(max-width: 620px)')?.matches;
  let couponRows = {munro:null,torcuato:null}, couponBusy=false, couponError='', couponAttempted=false;
  // Preferencia global, persistida en base y controlada por la creadora.
  // Predeterminado: oculto. Nunca se guarda como una preferencia de navegador.
  let diarioVisible=false, diarioLoaded=false, diarioLoading=false, diarioBusy=false;
  let diarioError='', diarioUser='';
  function dailyVisible(){return diarioLoaded && diarioVisible;}
  async function refreshDaily(force=false){
    const id=String(api?.S?.uid||api?.S?.me?.id||'');
    if(!id || !window.GestLokSupabase?.rpc)return;
    if(id!==diarioUser){
      diarioUser=id;diarioVisible=false;diarioLoaded=false;
    }
    if(diarioLoading||diarioBusy||(!force&&diarioLoaded))return;
    diarioLoading=true;
    try {
      const res=await window.GestLokSupabase.rpc('gestlok_mi_gusto_daily_visibility');
      if(res.error)throw res.error;
      if(diarioUser!==id)return;
      diarioVisible=res.data===true;diarioLoaded=true;diarioError='';
    } catch(e){
      if(diarioUser!==id)return;
      diarioVisible=false;diarioLoaded=true;
      diarioError='No se pudo consultar el estado. Conteo diario continúa oculto.';
    } finally {
      diarioLoading=false;
      if(diarioUser===id && tab!=='chat-prueba'){api?.renderLocal?.();api?.render?.();}
    }
  }
  function dailySettingsView(){
    if(!api?.isCreadora?.())return '';
    if(!diarioLoaded&&!diarioLoading)queueMicrotask(()=>refreshDaily());
    return '<section class="gl-admin-card gl-daily-visibility" aria-label="Visibilidad del Conteo diario de Mi Gusto">'+
      '<header><h2>Mi Gusto · Conteo diario</h2><small>Solo la creadora</small></header>'+
      '<p>La planilla y su historial se conservan. Mientras permanezca oculto, no aparece en el menú ni en el inicio de Munro.</p>'+
      '<div class="gl-daily-visibility-row"><span>Mostrar Conteo diario en Munro</span>'+
      '<button type="button" role="switch" data-ch-diario-visibility aria-label="Mostrar Conteo diario en Munro" aria-checked="'+dailyVisible()+'" '+
        ((!diarioLoaded||diarioBusy||diarioLoading)?'disabled':'')+
        '><span aria-hidden="true"></span><b>'+(dailyVisible()?'Visible':'Oculto')+'</b></button></div>'+
      (diarioLoading?'<p role="status">Consultando configuración…</p>':'')+
      (diarioError?'<p role="alert">'+esc(diarioError)+'</p>':'')+
      '<small>La restauración de la pestaña solo puede autorizarse desde esta cuenta de Creadora.</small></section>';
  }
  async function toggleDailyVisibility(){
    if(!api?.isCreadora?.()||!diarioLoaded||diarioBusy)return;
    const next=!diarioVisible;
    if(!window.confirm(next?'¿Restablecer la visualización de Conteo diario en Mi Gusto Munro?':'¿Ocultar Conteo diario sin borrar ningún dato?'))return;
    diarioBusy=true;diarioError='';api?.render?.();
    try {
      const {data,error}=await window.GestLokSupabase.rpc('gestlok_creator_set_mi_gusto_daily_visibility',{p_visible:next});
      if(error)throw error;
      diarioVisible=data===true;
      diarioLoaded=true;
      api?.toast?.(diarioVisible?'Conteo diario visible nuevamente.':'Conteo diario oculto. Los datos se conservaron.');
    } catch(e){
      diarioError='No se pudo actualizar la visibilidad. '+String(e?.message||'');
    } finally {diarioBusy=false;api?.renderLocal?.();api?.render?.();}
  }
  // GESTLOK Chat · micro app general: la administradora la enciende por empresa. El servidor (require_admin)
  // valida cada acción; cada local queda con su chat apagado hasta que el dueño o el gerente lo configure.
  let chatAdmin=null, chatBusy=false, chatError='', chatTried=false;
  // Altas propias de GESTLOK Chat: comercios que crearon su cuenta y esperan aprobación (solo la administradora).
  let altasChat=[], altasBusy=false, altasTried=false, altasError='';
  async function loadAltasChat(){
    if(!premiumAdmin()||altasBusy||!window.GestLokSupabase?.rpc)return;
    altasBusy=true;altasTried=true;altasError='';
    try{
      const {data,error}=await window.GestLokSupabase.rpc('gestlok_creator_registration_requests');if(error)throw error;
      altasChat=(Array.isArray(data)?data:[]).filter(r=>JSON.stringify(r.modulosSolicitados)==='["gestlok_chat"]');
    }catch{altasError='No se pudieron consultar las solicitudes de comercios.';}
    finally{altasBusy=false;api?.render?.();}
  }
  function altasChatView(){
    if(!premiumAdmin())return '';
    if(!altasTried&&!altasBusy)queueMicrotask(loadAltasChat);
    const rubros=window.GestLokRegistration?.rubros||{};
    const filas=altasChat.map(r=>{const n=r.negocio||{};
      return '<article class="gl-ch-chat-row gl-ch-chat-alta" data-ch-chat-alta-row="'+esc(r.registrationUserId)+'"><div><h3>'+esc(n.nombre||'Comercio sin nombre')+'</h3><small>'+
        esc([rubros[n.rubro]||n.rubro,n.localidad,r.email].filter(Boolean).join(' · '))+
        (r.fecha?' · '+esc(new Date(r.fecha).toLocaleDateString('es-AR',{timeZone:'America/Argentina/Buenos_Aires'})):'')+'</small></div>'+
        '<div class="gl-ch-chat-actions"><button type="button" class="btn primary" data-ch-chat-alta="'+esc(r.registrationUserId)+'" data-v="si"'+(altasBusy?' disabled':'')+'>Aprobar y crear</button>'+
        '<button type="button" class="btn" data-ch-chat-alta="'+esc(r.registrationUserId)+'" data-v="no"'+(altasBusy?' disabled':'')+'>Rechazar</button></div></article>';}).join('');
    if(!filas&&!altasError)return '';
    return '<div class="gl-ch-chat-altas" aria-label="Comercios que pidieron GESTLOK Chat"><h3>Comercios que pidieron GESTLOK Chat</h3>'+
      '<p>Al aprobar se crea la empresa con su local, el dueño queda vinculado y su chat queda apagado hasta que cargue la carta.</p>'+
      (altasError?'<p role="alert">'+esc(altasError)+'</p>':'')+filas+'</div>';
  }
  async function altaChatAction(user,aprobar){
    const r=altasChat.find(x=>x.registrationUserId===user);if(!r||altasBusy)return;
    const nombre=r.negocio?.nombre||r.email;
    if(!window.confirm(aprobar?'¿Aprobar a '+nombre+' ('+r.email+')? Se crea su empresa con GESTLOK Chat. No modifica otros comercios.'
      :'¿Rechazar la solicitud de '+nombre+'? Podrá corregirla y volver a enviarla.'))return;
    altasBusy=true;api?.render?.();
    try{
      const {data,error}=aprobar?await window.GestLokSupabase.rpc('gestlok_creator_aprobar_chat',{p_user:user})
        :await window.GestLokSupabase.rpc('gestlok_review_registration',{p_user:user,p_status:'rejected'});
      if(error)throw error;
      api?.toast?.(aprobar?nombre+' aprobado. Su chat: gestlok.com.ar/chat/?s='+(data?.slug||'')+' (apagado hasta que lo configure).':'Solicitud de '+nombre+' rechazada.');
      if(aprobar)await window.GestLokOwnerAreas?.refreshAdmin?.();
    }catch(e){api?.toast?.((aprobar?'No se pudo aprobar: ':'No se pudo rechazar: ')+String(e?.message||''),true);}
    finally{altasBusy=false;altasTried=false;chatTried=false;void loadAltasChat();void loadChatAdmin();}
  }
  // Cobros con Mercado Pago por empresa (solo la administradora): estado, links de cuota y adaptación.
  let cobros=null;
  const ESTADO_COBRO={sin_suscripcion:'sin suscribirse',pendiente:'esperando el pago',activa:'suscripción activa',en_mora:'pago rechazado',cancelada:'suscripción cancelada'};
  const pesosAR=n=>'$ '+String(Math.round(Number(n)||0)).replace(/\B(?=(\d{3})+(?!\d))/g,'.');
  async function loadCobros(){
    if(!premiumAdmin())return;
    try{const {data,error}=await window.GestLokSupabase.rpc('gestlok_chat_admin_cobros');if(error)throw error;cobros=data||null;}
    catch{cobros=null;}
  }
  function cobroFila(tenant){
    const c=(cobros?.empresas||[]).find(x=>x.tenant_id===tenant);if(!premiumAdmin()||!c)return '';
    if(!c.requiere_cobro)return '<p class="gl-ch-cobro"><small>Cobro: no se le cobra</small> <button type="button" class="btn" data-ch-cobro-req="'+esc(tenant)+'" data-v="si">Cobrar cuota</button></p>';
    const fecha=v=>v?new Date(v).toLocaleDateString('es-AR',{timeZone:'America/Argentina/Buenos_Aires'}):'';
    const estado=c.pausada?'chat pausado por falta de pago':(ESTADO_COBRO[c.estado]||c.estado);
    return '<p class="gl-ch-cobro"><small>Cobro: '+esc(estado)+' · '+esc(pesosAR(c.cuota))+'/mes'+(c.proximo_cobro&&c.estado==='activa'?' · próximo '+esc(fecha(c.proximo_cobro)):'')+
      (c.vence?' · vence el plazo el '+esc(fecha(c.vence)):'')+(c.adaptacion_pagada?' · adaptación pagada':'')+'</small> '+
      (c.estado==='activa'?'':'<button type="button" class="btn" data-ch-cobro-link="'+esc(tenant)+'" data-t="cuota">Copiar link de cuota</button>')+
      (c.adaptacion_pagada?'':'<button type="button" class="btn" data-ch-cobro-link="'+esc(tenant)+'" data-t="adaptacion">Link de adaptación '+esc(pesosAR(c.adaptacion))+'</button>')+
      '<button type="button" class="btn" data-ch-cobro-req="'+esc(tenant)+'" data-v="no">No cobrar</button></p>';
  }
  async function cobroAccion(btn){
    const tenant=btn.dataset.chCobroLink||btn.dataset.chCobroReq;if(!tenant||chatBusy)return;
    chatBusy=true;api?.render?.();
    try{
      if(btn.dataset.chCobroReq){
        const si=btn.dataset.v==='si';
        if(!window.confirm(si?'¿Cobrarle la cuota mensual a esta empresa? Al activar su chat tiene '+(cobros?.ajustes?.gracia_dias??3)+' días para suscribirse.':'¿Dejar de cobrarle a esta empresa? Si su chat estaba pausado por falta de pago, se vuelve a encender.'))return;
        const {error}=await window.GestLokSupabase.rpc('gestlok_chat_admin_cobro_requerir',{p_tenant:tenant,p_requiere:si});if(error)throw error;
        api?.toast?.(si?'Listo: esta empresa tiene cobro de cuota.':'Listo: a esta empresa no se le cobra.');
      }else{
        const {data,error}=await window.GestLokSupabase.functions.invoke('gestlok-cobros',{body:{accion:'link',tenant,tipo:btn.dataset.t}});
        let m=data?.error||'';
        if(error||!data?.link){try{m=m||(await error?.context?.json?.())?.error||'';}catch{}throw new Error(m||'No se pudo crear el link de Mercado Pago.');}
        try{await navigator.clipboard.writeText(data.link);api?.toast?.('Link de Mercado Pago copiado. Mandáselo al dueño.');}
        catch{window.prompt('Copiá el link de Mercado Pago y mandáselo al dueño:',data.link);}
      }
    }catch(e){api?.toast?.(String(e?.message||'No se pudo completar.'),true);}
    finally{chatBusy=false;await loadCobros();api?.render?.();}
  }
  async function loadChatAdmin(){
    if(!api?.isCreadora?.()||chatBusy||!window.GestLokSupabase?.rpc)return;
    chatBusy=true;chatTried=true;chatError='';
    try{const {data,error}=await window.GestLokSupabase.rpc('gestlok_chat_admin_empresas');if(error)throw error;chatAdmin=Array.isArray(data)?data:[];await loadCobros();}
    catch{chatError='No se pudo consultar GESTLOK Chat. Revisá la conexión.';}
    finally{chatBusy=false;api?.render?.();}
  }
  function chatResumen(){
    if(!chatTried&&!chatBusy&&api?.isCreadora?.())queueMicrotask(loadChatAdmin);
    const on=(chatAdmin||[]).filter(e=>e.habilitada).map(e=>e.nombre);
    return on.length?'Activa en '+on.join(', '):'Se activa por empresa';
  }
  function chatAdminView(){
    if(!api?.isCreadora?.())return '';
    if(!chatTried&&!chatBusy)queueMicrotask(loadChatAdmin);
    const companies=window.GestLokOwnerAreas?.creatorCompanies?.()||[];
    const porId=new Map((chatAdmin||[]).map(e=>[e.tenant_id,e]));
    const filas=companies.map(c=>{
      const e=porId.get(c.tenant_id), n=Array.isArray(c.locals)?c.locals.length:0;
      const sucs=(e?.sucursales||[]).map(x=>'<li><b>'+esc(x.nombre)+'</b> · '+(x.activa?'chat abierto':'chat apagado')+' · '+num(x.productos)+' productos'+
        (x.pendientes?' · '+num(x.pendientes)+' en preparación':'')+' · <a href="/chat/?s='+encodeURIComponent(x.slug)+'" target="_blank" rel="noopener">enlace</a></li>').join('');
      const estado=!e?'No activa':e.habilitada?'Activa · '+(e.sucursales||[]).length+' chat'+((e.sucursales||[]).length===1?'':'s'):'Pausada';
      const boton=!e?'<button type="button" class="btn primary" data-ch-chat-on="'+esc(c.tenant_id)+'"'+(n&&!chatBusy?'':' disabled')+'>Activar GESTLOK Chat</button>':
        e.habilitada?'<button type="button" class="btn" data-ch-chat-estado="'+esc(c.tenant_id)+'" data-v="no"'+(chatBusy?' disabled':'')+'>Pausar</button>'+
          '<button type="button" class="btn" data-ch-chat-on="'+esc(c.tenant_id)+'"'+(chatBusy?' disabled':'')+'>Sumar locales nuevos</button>':
        '<button type="button" class="btn primary" data-ch-chat-estado="'+esc(c.tenant_id)+'" data-v="si"'+(chatBusy?' disabled':'')+'>Reactivar</button>';
      return '<article class="gl-ch-chat-row" data-ch-chat-company="'+esc(c.tenant_id)+'"><div><h3>'+esc(c.name)+'</h3><small>'+esc(estado)+
        (n?'':' · sin locales cargados')+'</small>'+(sucs?'<ul>'+sucs+'</ul>':'')+(e?cobroFila(c.tenant_id):'')+'</div><div class="gl-ch-chat-actions">'+boton+'</div></article>';
    }).join('');
    return '<section class="gl-admin-card gl-ch-chat-admin" aria-label="GESTLOK Chat por empresa">'+
      '<header><h2>GESTLOK Chat</h2><small>Atención y pedidos por chat · un chat por local</small></header>'+
      '<p>Encendela para cada comercio. Cada local queda con su propio chat y su enlace, apagado hasta que el dueño o el gerente carguen la carta, los mensajes y los ajustes en su Central de mensajes.</p>'+
      altasChatView()+
      (chatBusy&&!chatAdmin?'<p role="status">Consultando…</p>':'')+(chatError?'<p role="alert">'+esc(chatError)+'</p>':'')+
      '<div class="gl-ch-chat-list">'+(filas||'<p>No hay empresas cargadas.</p>')+'</div></section>';
  }
  async function chatAdminAction(tenant, encender){
    const c=(window.GestLokOwnerAreas?.creatorCompanies?.()||[]).find(x=>x.tenant_id===tenant);
    if(!c||chatBusy||!window.GestLokSupabase?.rpc)return;
    const existe=(chatAdmin||[]).some(e=>e.tenant_id===tenant);
    const pregunta=encender===null?(existe?'¿Sumar a GESTLOK Chat los locales nuevos de '+c.name+'?':'¿Activar GESTLOK Chat en '+c.name+'? Cada local queda con su chat apagado hasta que lo configuren.')
      :encender?'¿Reactivar GESTLOK Chat en '+c.name+'?':'¿Pausar GESTLOK Chat en '+c.name+'? Los clientes no van a poder escribir; los datos se conservan.';
    if(!window.confirm(pregunta))return;
    chatBusy=true;chatError='';api?.render?.();
    try{
      const {error}=encender===null?await window.GestLokSupabase.rpc('gestlok_chat_admin_habilitar',{p_tenant:tenant,p_nombre:c.name,p_sucursales:null})
        :await window.GestLokSupabase.rpc('gestlok_chat_admin_estado',{p_tenant:tenant,p_habilitada:encender});
      if(error)throw error;
      api?.toast?.(encender===false?'GESTLOK Chat pausado en '+c.name+'.':'GESTLOK Chat activo en '+c.name+'.');
    }catch(e){chatError='No se pudo actualizar GESTLOK Chat. '+String(e?.message||'');}
    finally{chatBusy=false;chatTried=false;void loadChatAdmin();}
  }

  // Catálogo y asignación por empresa: las operaciones son RPC con identidad de creadora validada.
  let microapps=[],microappsLoaded=false,microappsBusy=false,microappsTried=false,microappsError='',companyBusy=false;
  const premiumAdmin=()=>api?.isCreadora?.() &&
    String(api?.S?.me?.email||'').trim().toLowerCase()===PREMIUM_ADMIN_EMAIL;
  async function loadMicroapps(force=false){
    if(!premiumAdmin()||!window.GestLokSupabase?.rpc||microappsBusy||(!force&&(microappsLoaded||microappsTried)))return;
    microappsBusy=true;microappsTried=true;microappsError='';
    try{
      const r=await window.GestLokSupabase.rpc('gestlok_creator_microapps');
      if(r.error||!Array.isArray(r.data))throw (r.error||Error('Respuesta inválida'));
      microapps=r.data;microappsLoaded=true;
    }catch(e){microappsError='No se pudieron consultar las apps asignadas. '+String(e?.message||'');}
    finally{microappsBusy=false;if(tab==='locales')api?.render?.();}
  }
  function microappsEmpresa(tenant,empresa){
    if(!premiumAdmin())return '';
    const apps=microapps.filter(a=>a.tenant_id===tenant);
    const activas=apps.filter(a=>a.habilitada);
    const asignadas=activas.map(a=>'<div class="gl-ch-app-row"><span><b>'+esc(a.nombre)+'</b><small>'+
      (a.estado==='activa'?'Activa':a.estado==='esperando_configuracion'?'Configuración pendiente':a.app_code==='sistema_ventas'?'Pendiente: registro del dueño':'Pendiente')+
      '</small></span><button type="button" class="btn sm" data-ch-app-remove="'+esc(tenant)+'" data-app="'+esc(a.app_code)+'"'+
      (microappsBusy?' disabled':'')+'>Desactivar</button></div>').join('');
    const disponibles=apps.filter(a=>!a.habilitada);
    return '<section class="gl-ch-company-apps" aria-label="Aplicaciones de '+esc(empresa)+'">'+
      '<h4>Apps asignadas</h4>'+
      (microappsError?'<p role="alert">'+esc(microappsError)+'</p><button type="button" class="btn" data-ch-app-refresh>Reintentar consulta</button>':'')+
      (!microappsLoaded?'<p role="status">Cargando aplicaciones…</p>':(asignadas||'<p>Sin aplicaciones asignadas.</p>'))+
      (disponibles.length?'<div class="gl-ch-app-picker"><label>Asignar app<select data-ch-app-select="'+esc(tenant)+'">'+
        disponibles.map(a=>'<option value="'+esc(a.app_code)+'">'+esc(a.nombre)+'</option>').join('')+
        '</select></label><button type="button" class="btn primary" data-ch-app-add="'+esc(tenant)+'"'+(microappsBusy?' disabled':'')+'>+ Apps</button></div>':
        (microappsLoaded?'<small>Ya se asignaron todas las apps disponibles.</small>':''))+
      '<p class="gl-ch-app-tip">El diseño y las reglas de permisos vienen de la microapp. La empresa configura su catálogo, productos y ajustes por local.</p>'+
      '</section>';
  }
  function crearEmpresaForm(){
    return '<details class="gl-ch-add-company"><summary>+ Agregar empresa</summary>'+
      '<form data-ch-create-business class="gl-ch-add-company-form">'+
      '<p>Creá un espacio independiente con su primer local. Solo se habilitan las apps que asignes después.</p>'+
      '<label>Nombre de la tienda<input name="nombre" required minlength="2" maxlength="100" autocomplete="organization" placeholder="Ej. Tienda Central"></label>'+
      '<label>Email del dueño<input name="dueno" type="email" required maxlength="254" autocomplete="off" placeholder="dueno@tienda.com"></label>'+
      '<label>Email del gerente (opcional)<input name="gerente" type="email" maxlength="254" autocomplete="off" placeholder="gerente@tienda.com"></label>'+
      '<button type="submit" class="btn primary"'+(companyBusy?' disabled':'')+'>Crear empresa</button>'+
      '<small>Se prepara «Local principal». Nadie recibe una contraseña automáticamente. Los accesos se autorizan por email y por empresa.</small>'+
      '</form></details>';
  }
  async function crearEmpresa(form){
    if(!premiumAdmin()||companyBusy||!form.reportValidity())return;
    const d=new FormData(form),nombre=String(d.get('nombre')||'').trim(),
      dueno=String(d.get('dueno')||'').trim().toLowerCase(),
      gerente=String(d.get('gerente')||'').trim().toLowerCase();
    if(!nombre||!dueno)return;
    if(!window.confirm('¿Crear la empresa '+nombre+' con dueño '+dueno+(gerente?' y gerente '+gerente:'')+'? No modifica otros comercios.'))return;
    companyBusy=true;const button=form.querySelector('[type="submit"]');if(button)button.disabled=true;
    try{
      const {data,error}=await window.GestLokSupabase.rpc('gestlok_creator_crear_empresa_microapps',
        {p_nombre:nombre,p_dueno_email:dueno,p_gerente_email:gerente||null});
      if(error||!data?.tenant_id)throw (error||Error('No se pudo confirmar el alta.'));
      api.toast?.('Empresa creada. Ahora podés asignarle sus microapps desde Locales.');
      form.reset();
      await Promise.all([window.GestLokOwnerAreas?.refreshAdmin?.(),loadMicroapps(true)]);
    }catch(e){api.toast?.('No se creó la empresa: '+String(e?.message||'Error de permisos.'),true);}
    finally{companyBusy=false;if(button?.isConnected)button.disabled=false;api?.render?.();}
  }
  async function asignarMicroapp(tenant,app,habilitar){
    if(!premiumAdmin()||microappsBusy)return;
    const company=(window.GestLokOwnerAreas?.creatorCompanies?.()||[]).find(c=>c.tenant_id===tenant);
    const selected=microapps.find(a=>a.tenant_id===tenant&&a.app_code===app);
    if(!company||!selected||selected.habilitada===habilitar)return;
    if(!window.confirm((habilitar?'¿Asignar ':'¿Desactivar ')+selected.nombre+' en '+company.name+
      '? Los datos de las demás empresas y sus apps no se modifican.'))return;
    microappsBusy=true;
    try{
      const {data,error}=await window.GestLokSupabase.rpc('gestlok_creator_asignar_microapp',
        {p_tenant:tenant,p_app:app,p_habilitar:habilitar});
      if(error||!data?.ok)throw (error||Error('No se pudo guardar.'));
      api.toast?.(habilitar?selected.nombre+' asignada a '+company.name+'.':'Microapp desactivada sin borrar sus datos.');
      microappsLoaded=false;chatTried=false;void loadChatAdmin();
    }catch(e){api.toast?.('No se pudo asignar la app: '+String(e?.message||''),true);}
    finally{microappsBusy=false;void loadMicroapps(true);api?.render?.();}
  }
  function linksChatView(){
    if(!premiumAdmin())return '';
    return '<section class="gl-admin-card gl-ch-links" aria-label="Enlaces GESTLOK Chat">'+
      '<header><h2>GESTLOK Chat</h2><small>Accesos rápidos de administradora</small></header>'+
      '<p>Producción y entornos de prueba separados. Las pruebas no deben ingresar pedidos reales.</p>'+
      '<div class="gl-ch-links-grid">'+
      '<a class="btn" href="https://gestlok.com.ar/chat/panel/" target="_blank" rel="noopener noreferrer">GESTLOK Chat · Panel</a>'+
      '<a class="btn" href="https://gestlok-prueba.vercel.app/" target="_blank" rel="noopener noreferrer">Abrir GESTLOK Prueba</a>'+
      '<a class="btn" href="https://gestlok-testing.vercel.app/" target="_blank" rel="noopener noreferrer">Abrir GESTLOK Testing</a>'+
      '</div><p class="gl-ch-app-tip">Para habilitar GESTLOK Chat en una nueva empresa, ingresá a «Locales» → «+ Apps».</p></section>';
  }

  async function loadCoupons(){if(!api?.isCreadora?.()||couponBusy||!window.GestLokSupabase)return;couponBusy=true;couponAttempted=true;couponError='';try{for(const loc of ['munro','torcuato']){const {data,error}=await window.GestLokSupabase.rpc('gestlok_resenas_list',{p_local:loc});if(error)throw error;couponRows[loc]=Array.isArray(data)?data:[];}}catch{couponError='No se pudieron consultar los cupones. Revisá permisos y conexión.';}finally{couponBusy=false;if(api?.isCreadora?.())api.render();}}
  function couponView(){if(!couponAttempted&&!couponBusy)queueMicrotask(loadCoupons);return '<section class="gl-admin-card" aria-label="Cupones de Mi Gusto"><header><h2>Cupones de Mi Gusto</h2><button type="button" data-ch-coupons-refresh>Actualizar</button></header><p>Munro y Torcuato por separado. Beneficio del 10% independiente de publicar reseñas. La emisión y utilización se realizan desde la sección Reseñas de cada sucursal.</p>'+(couponError?'<p role="alert">'+esc(couponError)+'</p>':'')+['munro','torcuato'].map(loc=>{const a=couponRows[loc]||[];const counts={pending:0,used:0,expired:0};a.forEach(r=>{if(r.status in counts)counts[r.status]++;});return '<article style="border-top:1px solid #ddd;padding:12px 0"><h3>'+ (loc==='munro'?'Munro':'Torcuato') +'</h3><p>Total: '+a.length+' · Pendientes: '+counts.pending+' · Usados: '+counts.used+' · Vencidos: '+counts.expired+'</p><div style="overflow-x:auto"><table><thead><tr><th>Cupón</th><th>Cliente</th><th>Estado</th><th>Fecha</th></tr></thead><tbody>'+a.slice(0,50).map(r=>'<tr><td>'+esc(r.code)+'</td><td>'+esc(r.customer_name)+'</td><td>'+esc(r.status)+'</td><td>'+esc(String(r.created_at||'').slice(0,10))+'</td></tr>').join('')+'</tbody></table></div></article>';}).join('')+'</section>';}

  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const svg = (d, w = 22) => '<svg viewBox="0 0 24 24" width="' + w + '" height="' + w + '" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + d + '</svg>';
  const store = {
    get() { try { return window.sessionStorage.getItem(TAB_KEY) || ''; } catch { return ''; } },
    set(v) { try { window.sessionStorage.setItem(TAB_KEY, v); } catch { /* sin almacenamiento: queda en memoria */ } }
  };
  const validTab = v => TABS.some(t => t[0] === v);
  function ago(iso) {
    const t = Date.parse(iso); if (!Number.isFinite(t)) return '';
    const m = Math.max(0, Math.round((Date.now() - t) / 60000));
    if (m < 2) return 'Ahora';
    if (m < 60) return 'Hace ' + m + ' min';
    const h = Math.round(m / 60); if (h < 24) return 'Hace ' + h + ' h';
    const d = Math.round(h / 24); return 'Hace ' + d + (d === 1 ? ' día' : ' días');
  }
  const ago2 = iso => { const a = ago(iso); return a ? a.replace(/^Hace /, 'hace ').replace(/^Ahora$/, 'recién') : ''; };
  // Fechas «AAAA-MM-DD» (sin hora) se leen tal cual, sin corrimiento de zona horaria.
  const dmy = iso => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    if (m) return m[3] + '/' + m[2];
    try { return new Date(iso).toLocaleDateString('es-AR', {day: '2-digit', month: '2-digit'}); } catch { return ''; }
  };
  const maskMail = v => { const m = String(v || '').toLowerCase().split('@'); return m.length === 2 ? m[0].slice(0, 3) + '***@' + m[1] : ''; };
  function today() {
    const d = new Date();
    return {
      date: d.toLocaleDateString('es-AR', {weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'}).replace(/^./, c => c.toUpperCase()),
      time: d.toLocaleTimeString('es-AR', {hour: '2-digit', minute: '2-digit'})
    };
  }
  async function load() {
    if (!api || busy || !window.GestLokSupabase) return;
    busy = true;
    try {
      const {data: d, error} = await window.GestLokSupabase.rpc('gestlok_creator_dashboard');
      if (error || !d || d.scope !== 'creator_dashboard' || !d.totals || !Array.isArray(d.series)) throw Error('Sin autorización');
      const estabaListo = status === 'ready';
      const changed = JSON.stringify(d) !== JSON.stringify(data) || !estabaListo;
      data = d; status = 'ready';
      // No reconstruir los iframes en mitad de una demostración al actualizar
      // estadísticas en segundo plano. El primer ingreso sí debe renderizar.
      if (changed && (!estabaListo || tab !== 'chat-prueba')) api.render();
    } catch {
      const changed = status !== 'off';
      data = null; status = 'off'; hqReset();
      if (changed) api.render();
    } finally { busy = false; }
  }
  // Estado visible para app.js: 'ready' | 'loading' | 'off'. La primera consulta se dispara sola.
  function mode() {
    if (!api?.isCreadora?.()) return 'off';
    if (status === 'idle') { status = 'loading'; load(); clearInterval(timer); timer = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 60000); }
    return status === 'ready' ? 'ready' : status === 'off' ? 'off' : 'loading';
  }
  function chart(series) {
    const W = 560, H = 250, L = 40, R = 14, T = 12, B = 30, iw = W - L - R, ih = H - T - B;
    const keys = [['empresas', '#7c4dff'], ['usuarios', '#2f7bf5'], ['empleados', '#27ae60']];
    const max = Math.max(4, ...series.flatMap(p => keys.map(k => num(p[k[0]]))));
    const step = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500].find(s => max / s <= 4) || 1000, top = Math.ceil(max / step) * step;
    const x = i => L + (series.length > 1 ? i * iw / (series.length - 1) : iw / 2), y = v => T + ih - (num(v) / top) * ih;
    let g = '';
    for (let v = 0; v <= top; v += step) g += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="#e7e9f5"/><text x="' + (L - 8) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + v + '</text>';
    series.forEach((p, i) => { g += '<text x="' + x(i) + '" y="' + (H - 8) + '" text-anchor="middle">' + esc(dmy(p.d)) + '</text>'; });
    let lines = '';
    keys.forEach(([k, color], n) => {
      const pts = series.map((p, i) => x(i).toFixed(1) + ',' + y(p[k]).toFixed(1));
      lines += '<defs><linearGradient id="gl-ch-g' + n + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + color + '" stop-opacity=".22"/><stop offset="1" stop-color="' + color + '" stop-opacity="0"/></linearGradient></defs>' +
        '<polygon points="' + x(0).toFixed(1) + ',' + y(0) + ' ' + pts.join(' ') + ' ' + x(series.length - 1).toFixed(1) + ',' + y(0) + '" fill="url(#gl-ch-g' + n + ')"/>' +
        '<polyline points="' + pts.join(' ') + '" fill="none" stroke="' + color + '" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>' +
        series.map((p, i) => '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(p[k]).toFixed(1) + '" r="3.4" fill="#fff" stroke="' + color + '" stroke-width="2"/>').join('');
    });
    const last = series[series.length - 1] || {};
    return '<svg class="gl-ch-chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Crecimiento de la plataforma en los últimos 30 días: ' +
      num(last.empresas) + ' empresas, ' + num(last.usuarios) + ' usuarios y ' + num(last.empleados) + ' personas en Empleados">' + g + lines + '</svg>';
  }
  function donut(parts, total) {
    const R = 52, C = 2 * Math.PI * R; let off = 0, arcs = '';
    parts.forEach(p => {
      if (!p.n || !total) return;
      const len = C * p.n / total;
      arcs += '<circle cx="70" cy="70" r="' + R + '" fill="none" stroke="' + p.c + '" stroke-width="18" stroke-dasharray="' + (len - 2).toFixed(2) + ' ' + (C - len + 2).toFixed(2) + '" stroke-dashoffset="' + (-off).toFixed(2) + '" transform="rotate(-90 70 70)"/>';
      off += len;
    });
    return '<svg class="gl-ch-donut" viewBox="0 0 140 140" role="img" aria-label="' + total + ' personas con acceso"><circle cx="70" cy="70" r="' + R + '" fill="none" stroke="#eceefa" stroke-width="18"/>' + arcs +
      '<text x="70" y="68" text-anchor="middle" class="d1">' + total + '</text><text x="70" y="86" text-anchor="middle" class="d2">personas</text></svg>';
  }
  const kpi = (icon, cls, label, value, foot) => '<article class="gl-ch-kpi"><span class="gl-ch-ico ' + cls + '">' + svg(icon, 26) + '</span><div><small>' + esc(label) + '</small><b>' + esc(value) + '</b><em>' + foot + '</em></div></article>';
  const up = t => '<i aria-hidden="true">↑</i> ' + esc(t);
  // Inicio independiente de la cuenta creadora: accesos reales, sin métricas invasivas.
  // Las operaciones siguen delegadas a los módulos existentes y a sus permisos.
  function home(p) {
    if(!microappsLoaded&&!microappsBusy&&!microappsTried)queueMicrotask(()=>loadMicroapps());
    const grouped=window.GestLokOwnerAreas?.creatorBrands?.()||[];
    const indexed=grouped.length?grouped:(Array.isArray(p.companies)?p.companies:(window.GestLokOwnerAreas?.creatorCompanies?.()||[]));
    const companyRows=indexed.length?indexed:(data.recent_companies||[]);
    // Un registro crea una tarjeta independiente, también para empresas futuras.
    // Los locales se agrupan dentro de su empresa y conservan la apertura autorizada.
    const companies=companyRows.map(c=>{
      const own=c.tenant_id===api.S?.me?.tenant_id;
      const localRows=Array.isArray(c.locals)?c.locals:[];
      const n=Array.isArray(c.locals)?localRows.length:num(c.locals);
      const localCards=localRows.map(l=>{
        const molinoBrand=(l.tenant_id||c.tenant_id)===MOLINO_TENANT?
          (window.GestLokMolino?.logoHTML?.(l.id,'card',l.tenant_id||c.tenant_id)||''):'';
        const attrs=(l.tenant_id||c.tenant_id)===api.S?.me?.tenant_id?'data-act="local" data-id="'+esc(l.id)+'"':
          'data-company-local="'+esc(l.id)+'" data-company-tenant="'+esc(l.tenant_id||c.tenant_id)+'" data-company-name="'+esc(c.name)+'"';
        return '<button type="button" class="gl-ch-quick-local gl-ch-company-local" '+attrs+
          ' aria-label="Abrir el local '+esc(l.name||l.id)+' de '+esc(c.name)+'">'+
          (molinoBrand?molinoBrand:'<span class="gl-ch-quick-icon">'+svg('<path d="M5 9l1.5-5h11L19 9z"/><path d="M6 9v11h12V9M10 20v-5h4v5"/>',22)+'</span>')+
          '<span><b>'+esc(l.name||l.id)+'</b><small>Ingresar al local</small></span>'+
          '<span aria-hidden="true">→</span></button>';
      }).join('');
      const access=localRows.length?'<details class="gl-ch-company-locals"><summary>Ver locales'+
        '<span aria-hidden="true">⌄</span></summary><div class="gl-ch-company-local-grid">'+localCards+'</div></details>':
        n===0?'<span class="gl-ch-company-empty">Sin locales registrados</span>':
        '<button type="button" class="gl-ch-company-open" data-ch-tab="locales">Ver locales →</button>';
      const support=own?'':(window.GestLokCreatorSupport?.openButton?.(c.tenant_id,c.name)||'');
      return '<article class="gl-ch-company-card" data-creator-company="'+esc(c.tenant_id)+'">'+
        '<div class="gl-ch-company-top"><span class="gl-ch-ico p" aria-hidden="true">'+
        svg('<path d="M4 20V8l8-4 8 4v12"/><path d="M9 20v-6h6v6"/>',24)+
        '</span><div class="gl-ch-company-info"><h3>'+esc(c.name)+'</h3><p>'+
        n+(n===1?' local':' locales')+'</p></div></div>'+
        '<div class="gl-ch-company-actions">'+access+(window.GestLokOwnerAreas?.creatorAddLocalForm?.(c.tenant_id)||'')+support+'</div></article>';
    }).join('');
    // Una microapp se abre DENTRO de un local autorizado. El acceso empieza por su selector.
    const microapps = [
      ['Caja', 'Caja y movimientos diarios'],
      ['Stock Local', 'Productos y existencias'],
      ['Precios', 'Costos, márgenes y precios de venta'],
      ['Sistema de Ventas', 'Escáner y registro de cobros'],
      ['Plan Scanner', 'Escaneo con cámara, ventas y control de stock'],
      ['Horarios', 'Turnos y planillas'],
      ['Empleados', 'Legajos y recibos autorizados'],
      // GESTLOK Chat: se enciende empresa por empresa en Herramientas (gestlok_chat_admin_*).
      ['GESTLOK Chat', 'Atención y pedidos por chat, un chat por local']
    ].map(([name,detail]) => name === 'GESTLOK Chat'
      ? '<button type="button" class="gl-ch-microapp" data-ch-tab="herramientas" aria-label="Activar GESTLOK Chat por empresa">' +
        '<b>' + name + '</b><small>' + detail + ' · ' + esc(chatResumen()) + '</small><span>Activar por empresa →</span></button>'
      : '<button type="button" class="gl-ch-microapp" data-ch-tab="locales" aria-label="Elegir local para ' + name + '">' +
      '<b>' + name + '</b><small>' + detail + '</small><span>Elegir local →</span></button>').join('');
    // Catálogo de herramientas compartidas de El Molino Café. No habilita estas
    // funciones para otras empresas: el servidor comprueba cada acceso.
    const molinoTools = MOLINO_TOOLS.map(([id,name,detail]) =>
      '<button type="button" class="gl-ch-microapp" data-ch-molino="'+id+'"'+
      ' aria-label="Abrir '+esc(name)+' de El Molino Café">'+
      '<b>'+esc(name)+'</b><small>'+esc(detail)+'</small><span>Abrir El Molino Café →</span></button>'
    ).join('');
    const shortcuts = [
      ['Empresas y locales', 'empresas', '<path d="M4 20V8l8-4 8 4v12"/><path d="M9 20v-6h6v6"/>'],
      ['Usuarios y accesos', 'usuarios', '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>'],
      ['Empleados y horarios', 'empleados', '<path d="M3 20c0-4 4-7 9-7s9 3 9 7"/><circle cx="12" cy="7" r="4"/>'],
      ['Locales', 'locales', '<path d="M5 9l1.5-5h11L19 9z"/><path d="M6 9v11h12V9"/>'],
      ['Herramientas', 'herramientas', '<circle cx="12" cy="12" r="9"/><path d="M12 8v4l3 2"/>'],
      ['Prueba GESTLOK Chat', 'chat-prueba', '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M7 9h10M7 13h6"/>'],
      ['Reseñas', 'resenas', '<path d="M4 5h16v14H4z"/><path d="M8 10h8M8 14h5"/>'],
      ['Mensajes web', 'contacto', '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>']
    ].map(([name,id,icon]) => '<button type="button" class="gl-ch-shortcut" data-ch-tab="' + id + '">' +
      '<span class="gl-ch-ico b">' + svg(icon, 22) + '</span><b>' + name + '</b><span aria-hidden="true">›</span></button>').join('');
    return '<div class="gl-ch-creator-start">' +
      '<section class="gl-ch-company-area" aria-label="Empresas activas">' +
      '<header class="gl-ch-company-area-head"><h2>Empresas activas</h2>' +
      '<button type="button" class="gl-ch-link" data-ch-tab="empresas">Ver todas →</button></header>' +
      '<p class="gl-ch-company-intro">Elegí una empresa para consultar sus locales.</p>' +
      '<div class="gl-ch-company-grid">' + (companies || '<p class="gl-ch-company-empty">No hay empresas disponibles.</p>') + '</div></section>' +
      '<section class="gl-ch-card" aria-label="Mis microapps"><header><h2>Mis microapps</h2></header>' +
      '<p>Primero elegí la empresa y el local. Cada herramienta respeta sus permisos.</p>' +
      '<div class="gl-ch-microapps">' + microapps + '</div></section>' +
      '<section class="gl-ch-card gl-ch-branch-tools" aria-label="Operaciones entre sucursales">' +
      '<header><h2>Operaciones entre sucursales</h2></header>' +
      '<p><b>El Molino Café</b> · San Isidro y Acassuso. Las funciones están protegidas por los permisos de cada local.</p>' +
      '<div class="gl-ch-microapps">' + molinoTools + '</div></section>' +
      '<section class="gl-ch-card gl-ch-showroom-teaser"><header><h2>Prueba GESTLOK Chat</h2></header>' +
      '<p>Mostrá las vistas de cliente y gerente con pedidos ficticios. Probá nuevas funciones sin afectar a ninguna tienda.</p>' +
      '<button type="button" class="gl-ch-showroom-open" data-ch-tab="chat-prueba">Abrir demostración →</button></section>' +
      '<section class="gl-ch-card"><header><h2>Administración y herramientas</h2></header>' +
      '<p>Accesos rápidos a los módulos existentes. Cada empresa conserva sus propios datos y permisos.</p>' +
      '<div class="gl-ch-shortcuts">' + shortcuts + '</div></section></div>';
  }

  // Vista exclusiva de la cuenta administradora aprobada. Solo cambia presentación.
  // La lista de empresas/locales y la autorización de ingreso siguen viniendo del servidor.
  function premiumLocales(p) {
    const grouped=window.GestLokOwnerAreas?.creatorBrands?.()||[];
    const companies=grouped.length?grouped:(window.GestLokOwnerAreas?.creatorCompanies?.()||[]);
    const currentTenant=api.S?.me?.tenant_id;
    const fallback=window.GestLokOwnerAreas?.companyFolders?.()||p.parts?.locales||'';
    const loading=!companies.length&&/Cargando empresas|No pudimos cargar/.test(fallback);
    const totalLocals=companies.reduce((sum,c)=>sum+(Array.isArray(c.locals)?c.locals.length:0),0);
    const storeIcon='<path d="M5 9l1.5-5h11L19 9z"/><path d="M6 9v11h12V9M10 20v-5h4v5"/>';
    const businessIcon='<path d="M4 20V8l8-4 8 4v12"/><path d="M9 20v-6h6v6M9 10h.01M15 10h.01"/>';
    const lockIcon='<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/><path d="M12 14v3"/>';
    const showCount=n=>loading?'—':String(n);
    const stats='<div class="gl-ch-premium-stats" aria-label="Resumen de empresas y locales">'+
      '<article class="gl-ch-premium-stat"><span class="gl-ch-premium-stat-icon">'+svg(businessIcon,25)+'</span><div><span>Empresas activas</span><strong>'+showCount(companies.length)+'</strong></div></article>'+
      '<article class="gl-ch-premium-stat"><span class="gl-ch-premium-stat-icon">'+svg(storeIcon,25)+'</span><div><span>Locales totales</span><strong>'+showCount(totalLocals)+'</strong></div></article>'+
      '<article class="gl-ch-premium-stat"><span class="gl-ch-premium-stat-icon">'+svg(lockIcon,25)+'</span><div><span>Acceso de administradora</span><strong class="gl-ch-premium-verified"><span aria-hidden="true">✓</span> Verificado</strong></div></article>'+
      '</div>';
    const cards=companies.map(c=>{
      const locals=Array.isArray(c.locals)?c.locals:[];
      const n=locals.length;
      const attrs=l=>(l.tenant_id||c.tenant_id)===currentTenant
        ?'data-act="local" data-id="'+esc(l.id)+'"'
        :'data-company-local="'+esc(l.id)+'" data-company-tenant="'+esc(l.tenant_id||c.tenant_id)+'" data-company-name="'+esc(c.name)+'"';
      const appTenantIds=Array.isArray(c.tenant_ids)&&c.tenant_ids.length?c.tenant_ids:[c.tenant_id];
      const appsHTML=appTenantIds.map(t=>microappsEmpresa(t,c.name)).join('');
      const localCards=locals.map(l=>'<button type="button" class="gl-ch-premium-local" '+attrs(l)+
        ' aria-label="Ingresar a '+esc(l.name||l.id)+' de '+esc(c.name)+'">'+
        '<span class="gl-ch-premium-local-icon">'+svg(storeIcon,19)+'</span><span>'+esc(l.name||l.id)+'</span>'+
        '<span aria-hidden="true">→</span></button>').join('');
      return '<details class="gl-ch-premium-company gl-company-folder" data-creator-company="'+esc(c.tenant_id)+'">'+
        '<summary aria-label="Seleccionar empresa '+esc(c.name)+'">'+
        '<span class="gl-ch-premium-company-icon">'+svg(businessIcon,27)+'</span>'+
        '<span class="gl-ch-premium-company-title"><b>'+esc(c.name)+'</b><small>Empresa · Sucursales</small></span>'+
        '<span class="gl-ch-premium-count">'+n+(n===1?' local':' locales')+'</span>'+
        '<span class="gl-ch-premium-select">Seleccionar empresa <span aria-hidden="true">→</span></span>'+
        '</summary><div class="gl-ch-premium-company-locals">'+
        (localCards||'<p>Esta empresa todavía no tiene locales creados.</p>')+
        (window.GestLokOwnerAreas?.creatorAddLocalForm?.(c.tenant_id)||'')+
        appsHTML+'</div></details>';
    }).join('');
    return '<div class="gl-ch-premium-locales">'+stats+
      '<section class="gl-ch-premium-directory" aria-label="Empresas y locales">'+
      '<header><div><h2>Locales</h2><p>Elegí una empresa y después un local.</p></div></header>'+crearEmpresaForm()+
      (loading?fallback:'<div class="gl-ch-premium-company-grid">'+
        (cards||'<p class="gl-ch-premium-empty">No hay empresas disponibles.</p>')+'</div>')+
      '</section></div>';
  }
  // No inventar permisos: solo gestlok_my_role_contexts + elección autorizada
  // permiten pasar al tenant de El Molino Café. Los movimientos siguen por RPC/RLS.
  async function openMolinoTool(id) {
    if (!api?.isCreadora?.() || molinoBusy || !MOLINO_TOOLS.some(x => x[0] === id)) return;
    if (api.S?.me?.tenant_id === MOLINO_TENANT) {
      if (window.GestLokMolino?.open) window.GestLokMolino.open(id);
      else api.toast?.('No se pudo abrir la herramienta. Volvé a cargar GESTLOK.', true);
      return;
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      api.toast?.('Necesitás internet para ingresar a El Molino Café.', true); return;
    }
    molinoBusy = true;
    try {
      const pending = await window.GestLokOffline?.pending?.();
      if (pending) throw Error('Tenés cambios pendientes de sincronizar. Guardalos antes de cambiar de empresa.');
      const sb = window.GestLokSupabase;
      if (!sb?.rpc) throw Error('No hay conexión con el sistema de permisos.');
      const contexts = await sb.rpc('gestlok_my_role_contexts');
      if (contexts.error || !Array.isArray(contexts.data) ||
          !contexts.data.some(c => c?.tenant_id === MOLINO_TENANT && c.role === 'creadora'))
        throw Error('Tu cuenta no tiene habilitado el acceso a El Molino Café.');
      if (window.GestLokCreatorSupport?.state?.().active) {
        const close = await sb.rpc('gestlok_creator_close_company');
        if (close.error) throw close.error;
      }
      const result = await sb.rpc('gestlok_choose_role_context', {p_tenant:MOLINO_TENANT});
      if (result.error || result.data?.tenant_id !== MOLINO_TENANT ||
          result.data?.role !== 'creadora') throw Error('El servidor no autorizó el cambio de empresa.');
      await window.GestLokOffline?.invalidateContext?.();
      window.sessionStorage.setItem(MOLINO_NEXT, JSON.stringify({
        email:String(api.S.me.email || '').toLowerCase(),tenant_id:MOLINO_TENANT,
        section:id,created_at:Date.now()
      }));
      window.sessionStorage.setItem(TAB_KEY, 'inicio');
      window.location.reload();
    } catch (e) {
      api.toast?.(String(e?.message || 'No se pudo abrir El Molino Café.'), true);
    } finally { molinoBusy = false; }
  }
  function resumeMolinoTool() {
    if (!api?.isCreadora?.() || api.S?.me?.tenant_id !== MOLINO_TENANT) return;
    let next;
    try {
      const raw = window.sessionStorage.getItem(MOLINO_NEXT);
      if (!raw) return;
      window.sessionStorage.removeItem(MOLINO_NEXT);
      next = JSON.parse(raw);
    } catch { return; }
    if (next?.tenant_id !== MOLINO_TENANT ||
        next.email !== String(api.S?.me?.email || '').toLowerCase() ||
        !MOLINO_TOOLS.some(x => x[0] === next.section) ||
        !Number.isFinite(next.created_at) || Date.now() - next.created_at > 300000 ||
        Date.now() < next.created_at) return;
    queueMicrotask(() => {
      if (api?.isCreadora?.() && api.S?.me?.tenant_id === MOLINO_TENANT)
        window.GestLokMolino?.open?.(next.section);
    });
  }
  // Ensayo aislado: dos iframes con los modos de prueba ya existentes.
  // Ambos se comunican SOLO por sessionStorage del mismo navegador y pestaña.
  function chatShowroomView() {
    if (!api?.isCreadora?.()) return '';
    const active = showroomPerfil === 'cliente' ? 'cliente' : 'local';
    const frame = (perfil, url, titulo) =>
      '<div class="gl-ch-showroom-pane" id="gl-ch-showroom-' + perfil + '" data-showroom-pane="' + perfil + '"' +
      (perfil !== active ? ' hidden' : '') + '>' +
      '<iframe title="' + titulo + '" src="' + url + '" loading="eager" ' +
      'referrerpolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-forms" ></iframe></div>';
    return '<section class="gl-ch-showroom' + (showroomExpandido ? ' gl-ch-showroom-expanded' : '') + '" aria-label="Prueba GESTLOK Chat">' +
      '<header class="gl-ch-showroom-header"><div><h2>Prueba GESTLOK Chat</h2>' +
      '<p>Demostración para presentar a comerciantes y comprobar funciones nuevas.</p></div>' +
      '<div class="gl-ch-showroom-actions"><button type="button" data-ch-showroom-expand class="gl-ch-showroom-expand" aria-pressed="' + showroomExpandido + '">' +
      (showroomExpandido ? 'Salir de pantalla completa' : 'Pantalla completa') + '</button>' +
      '<button type="button" data-ch-showroom-reset class="gl-ch-showroom-reset">Reiniciar demostración</button></div></header>' +
      '<p class="gl-ch-showroom-note" role="status"><strong>Datos ficticios · Modo seguro.</strong> Los pedidos, mensajes y cambios solo existen ' +
      'en esta prueba. No llegan a Supabase, a Mi Gusto ni a otras empresas. ' +
      'Usá Perfil de cliente para crear un pedido y Perfil de local para revisarlo y confirmarlo manualmente.</p>' +
      '<div class="gl-ch-showroom-tabs" role="tablist" aria-label="Elegir perfil de prueba">' +
      [['local', 'Perfil de local · Gerente'], ['cliente', 'Perfil de cliente']].map(([id, text]) =>
        '<button type="button" role="tab" data-ch-showroom="' + id + '" aria-selected="' +
        (id === active) + '" aria-controls="gl-ch-showroom-' + id + '"' +
        (id === active ? ' class="on"' : '') + '>' + text + '</button>').join('') + '</div>' +
      '<div class="gl-ch-showroom-stage">' +
      frame('local', '/chat/panel/?demo=1&showroom=1', 'GESTLOK Chat · Panel del gerente (demostración)') +
      frame('cliente', '/chat/?demo=1&showroom=1', 'GESTLOK Chat · Vista del cliente (demostración)') + '</div>' +
      '<p class="gl-ch-showroom-foot">El perfil de local incluye Pedidos, Soporte, Historial, Stock, Carta, Mensajes, Ajustes, Conversaciones y Clientes frecuentes. ' +
      'Los pedidos de esta prueba nunca se confirman automáticamente.</p></section>';
  }
  // La preferencia visual es del dispositivo; nunca modifica roles ni alcance.
  const navPrefKey = 'gestlok:creator-menu-collapsed:v1';
  let navCollapsed = false;
  try { navCollapsed = localStorage.getItem(navPrefKey) === 'yes'; } catch {}

  // HQ: private workspace shell. No agent runs or tenant data are simulated.
  const HQ_AGENTS = Object.freeze([
    ['desarrollo','Desarrollo','Programación y nuevas funciones','#dce9f8','<path d="m9 7-5 5 5 5m6-10 5 5-5 5m-2-12-2 14"/>'],
    ['calidad','Control de calidad','Revisión, seguridad y criterios de aceptación','#dcece7','<path d="m12 3 8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6zM8 12l3 3 5-6"/>'],
    ['testing','Testing','Cypress, pruebas funcionales y regresiones','#e5eef0','<path d="M9 3h6m-5 0v7l-5 8a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-8V3M8 15h8"/>'],
    ['atencion','Atención al cliente','Chats y pedidos · sin acceso a conversaciones','#e3e9f3','<path d="M4 4h16v13H9l-5 4zM8 9h8m-8 4h5"/>'],
    ['marketing','Marketing','Publicidad y comunicación','#f3e9d8','<path d="M3 10h5l12-5v14l-12-5H3zM8 14l2 6h3"/>'],
    ['datos','Data Analytics','Indicadores y análisis','#e8e2f3','<path d="M4 4v16h16M8 16v-4m4 4V8m4 8V5"/>']
  ]);
  let hqAgent = 'desarrollo';
  const HQ_PEOPLE=Object.freeze({
    desarrollo:{name:'Mateo',role:'Ingeniero de software',skills:'Arquitectura, automatización y nuevas funciones.'},
    calidad:{name:'Valentina',role:'Especialista en calidad y seguridad',skills:'Auditoría, permisos y criterios de aceptación.'},
    testing:{name:'Julián',role:'Analista QA / Testing',skills:'Cypress, casos funcionales y regresiones.'},
    atencion:{name:'Sofía',role:'Especialista en experiencia del cliente',skills:'Atención, reclamos y experiencia de compra.'},
    marketing:{name:'Lucía',role:'Estratega de marketing',skills:'Comunicación, posicionamiento y crecimiento.'},
    datos:{name:'Bruno',role:'Analista de datos',skills:'Indicadores, hipótesis y oportunidades comerciales.'},
    lider:{name:'Alex',role:'Directora Ejecutiva de IA',skills:'Estrategia, coordinación, evaluación de propuestas y planificación de incorporaciones.'}
  });
  let hqRoom=false;
  const HQ_LEADER=['lider','Dirección de IA','Coordina las seis áreas, evalúa propuestas y solicita nuevas especialidades justificadas a la administradora.'];
  const hqArea=id=>id==='lider'?HQ_LEADER:HQ_AGENTS.find(a=>a[0]===id);
  let hqScope='GESTLOK · empresa y nuevas microapps';
  let hqAIReady=null, hqAIBusy=false, hqAIError='', hqRuns=[], hqRunsLoaded=false, hqRunsError='';
  async function hqAI(action,taskId){
    if(!hqAllowed()||hqAIBusy||hqBusy)return;
    if(action==='run' && (!hqAIReady||!hqTasks.some(t=>t.id===taskId&&t.status==='pendiente')||hqRuns.some(r=>r.task_id===taskId)))return;
    if(action==='run' && !window.confirm(hqTasks.find(t=>t.id===taskId)?.agent==='lider'?'¿Iniciar la reunión? Consume hasta 7 consultas de IA. No incluyas datos personales ni secretos.':'¿Enviar esta instrucción al proveedor de IA? No incluyas datos personales ni secretos. Puede generar consumo de API.'))return;
    const epoch=hqEpoch;hqAIBusy=true;hqAIError='';api?.render();
    try{
      const sb=window.GestLokSupabase;
      if(!sb?.functions?.invoke)throw Error('Sin conexión');
      const res=await sb.functions.invoke('gestlok-hq-agent',{body:{action,task_id:taskId}});
      if(epoch!==hqEpoch||!hqAllowed())return;
      if(action==='status')hqAIReady=res.error?null:res.data?.configured===true;
      if(res.error)hqAIError='No se pudo confirmar la conexión o ejecución. Consultá los resultados antes de repetir.';
      const runs=await sb.rpc('gestlok_hq_list_runs');
      if(epoch!==hqEpoch||!hqAllowed())return;
      if(runs.error||!Array.isArray(runs.data))throw Error('Sin resultados');
      hqRuns=runs.data;hqRunsLoaded=true;hqRunsError='';
    }catch{if(epoch===hqEpoch)hqAIError='No se pudo consultar el motor de IA o sus resultados.';}
    finally{if(epoch===hqEpoch){hqAIBusy=false;if(hqAllowed())api?.render();}}
  }
  function hqAIView(){
    return '<section aria-label="Motor de agentes" style="padding:12px;border:1px solid #dce3eb;border-radius:9px;margin-top:16px"><h3>Motor de agentes</h3><p>Ejecutá una tarea guardada y recibí un informe para revisar. No modifica código ni ejecuta pruebas o publicaciones. Límite: 10 consultas de IA cada 24 horas; una reunión reserva 7.</p><button type="button" class="btn" data-ch-hq-ai-status '+(hqAIBusy?'disabled':'')+'>Comprobar conexión y resultados</button><p role="status">'+esc(hqAIError||(hqAIBusy?'Consultando…':hqAIReady===true?'Proveedor configurado':hqAIReady===false?'Falta configurar la clave independiente de HQ':'Sin conexión a IA: no verificada'))+'</p></section>';
  }
  async function hqDecideHire(id,decision){
    if(!hqAllowed()||hqAIBusy||hqBusy||!['approved','rejected'].includes(decision)||!hqRuns.some(r=>r.id===id&&r.hire_request&&!r.hire_decision))return;
    if(!window.confirm(decision==='approved'?'¿Autorizar la incorporación propuesta? Se registrará tu aprobación; el nuevo agente todavía requiere configuración.':'¿Rechazar esta solicitud de incorporación?'))return;
    const epoch=hqEpoch;hqAIBusy=true;hqAIError='';api?.render();
    try{
      const sb=window.GestLokSupabase;
      const res=await sb.rpc('gestlok_hq_decide_hire',{p_run:id,p_decision:decision});
      if(res.error||res.data!==true)throw Error('Decisión no registrada');
      const runs=await sb.rpc('gestlok_hq_list_runs');
      if(epoch!==hqEpoch||!hqAllowed())return;
      if(runs.error||!Array.isArray(runs.data))throw Error('Sin resultados');
      hqRuns=runs.data;hqRunsLoaded=true;hqRunsError='';
    }catch{if(epoch===hqEpoch)hqAIError='No se confirmó el registro. Consultá los resultados antes de repetir.';}
    finally{if(epoch===hqEpoch){hqAIBusy=false;if(hqAllowed())api?.render();}}
  }
  function hqExecutiveInbox(){
    const pending=hqTasks.filter(t=>t.agent==='lider'&&t.status==='pendiente').map(t=>({t,r:hqRuns.find(r=>r.task_id===t.id&&r.state==='review')})).filter(x=>x.r);
    const hires=hqRuns.filter(r=>r.state==='review'&&r.hire_request&&!r.hire_decision);
    return '<section aria-label="Bandeja ejecutiva de Alex" style="margin:14px 0;padding:14px;border:1px solid #cbd8e2;background:#f3f7fa;border-radius:12px"><header style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px"><strong>Dirección ejecutiva · Alex</strong><button type="button" class="btn" data-ch-hq-refresh '+(hqBusy||hqAIBusy?'disabled':'')+'>Actualizar bandeja</button></header>'+
      '<p role="status">'+esc(hqRunsError||(hqBusy?'Consultando informes…':!hqLoaded||!hqRunsLoaded?'Informes aún sin consultar':pending.length+' informes para aprobar · '+hires.length+' incorporaciones para decidir'))+'</p>'+
      pending.map(({t,r})=>'<details style="background:white;padding:12px;margin:8px 0;border:1px solid #dce3eb;border-radius:8px"><summary style="cursor:pointer;font-weight:650;overflow-wrap:anywhere">'+esc(t.instruction.slice(0,120))+'</summary><p style="white-space:pre-wrap;overflow-wrap:anywhere">'+esc(r.result||'')+'</p><button type="button" class="btn primary" data-ch-hq-close="'+esc(t.id)+'" data-status="cerrada" '+(hqBusy||hqAIBusy?'disabled':'')+'>Aprobar informe</button> <button type="button" class="btn" data-ch-hq-close="'+esc(t.id)+'" data-status="cancelada" '+(hqBusy||hqAIBusy?'disabled':'')+'>Descartar informe</button></details>').join('')+
      (hires.length?'<p>Tenés solicitudes de incorporación para revisar en la sección inferior. Aprobar una propuesta no activa un agente.</p>':'')+'</section>';
  }
  function hqHiringView(){
    const requests=hqRuns.filter(r=>r.state==='review'&&r.hire_request);
    const fields=[['reason','Por qué hace falta'],['benefit','Beneficio esperado'],['cost','Costo estimado'],['permissions','Permisos mínimos'],['alternative','Alternativa sin incorporar']];
    return '<section aria-label="Solicitudes de incorporación" style="margin-top:16px;padding:12px;border:1px solid #cbd8e2;border-radius:10px"><h3>Solicitudes de incorporación</h3><p>Alex puede proponerte nuevas especialidades. Solo la administradora decide. Aprobar registra la autorización, no activa un agente ni concede permisos.</p>'+
    (requests.length?requests.map(r=>{const h=r.hire_request;return '<article style="margin:10px 0;padding:12px;background:#f3f7fa;border-radius:8px;overflow-wrap:anywhere"><strong>'+esc(h.name+' · '+h.specialty)+'</strong>'+fields.map(([key,label])=>'<p><strong>'+label+':</strong> '+esc(h[key]||'No especificado')+'</p>').join('')+
      '<p><strong>'+esc(r.hire_decision==='approved'?'Autorizada · pendiente de configuración':r.hire_decision==='rejected'?'Rechazada':'Pendiente de tu decisión')+'</strong></p>'+
      (!r.hire_decision?'<div style="display:flex;flex-wrap:wrap;gap:8px"><button type="button" class="btn primary" data-ch-hq-hire="'+esc(r.id)+'" data-decision="approved" '+(hqAIBusy?'disabled':'')+'>Autorizar incorporación</button><button type="button" class="btn" data-ch-hq-hire="'+esc(r.id)+'" data-decision="rejected" '+(hqAIBusy?'disabled':'')+'>Rechazar solicitud</button></div>':'')+'</article>';}).join(''):'<p>Sin solicitudes consultadas o registradas.</p>')+'</section>';
  }
  function hqRunView(t){
    const r=hqRuns.find(r=>r.task_id===t.id);
    if(r)return '<div style="padding:10px;background:#f0f3f7;border-radius:8px;margin:8px 0"><strong>'+esc(({working:'Trabajando · consulta en curso',review:'Informe para revisar',error:'Error de ejecución'})[r.state]||'Estado desconocido')+'</strong>'+(r.result?'<p style="white-space:pre-wrap;overflow-wrap:anywhere">'+esc(r.result)+'</p>':'')+'</div>';
    return t.status==='pendiente'&&hqAIReady===true?'<button type="button" class="btn primary" data-ch-hq-ai-run="'+esc(t.id)+'" '+(hqAIBusy?'disabled':'')+'>'+(t.agent==='lider'?'Iniciar reunión de IA':'Ejecutar con IA')+'</button>':'';
  }
  let hqGithub = null, hqGithubBusy = false, hqGithubError = '';
  const hqTech=()=>['desarrollo','calidad','testing'].includes(hqAgent);
  async function hqCheckGithub(){
    if(!hqAllowed()||!hqTech()||hqGithubBusy)return;
    const epoch=hqEpoch;hqGithubBusy=true;hqGithubError='';hqGithub=null;api?.render();
    try{
      const response=await fetch('https://api.github.com/repos/mgstock-app/mgstock-app.github.io/actions/runs?per_page=15',{headers:{Accept:'application/vnd.github+json'},credentials:'omit',cache:'no-store'});
      if(!response.ok)throw Error('HTTP '+response.status);
      const d=await response.json();if(!Array.isArray(d.workflow_runs))throw Error('Respuesta inválida');
      if(epoch!==hqEpoch||!hqAllowed())return;
      hqGithub={checked:new Date().toISOString(),runs:d.workflow_runs.slice(0,10).map(x=>({id:Number(x.id),name:String(x.name||''),status:String(x.status||''),conclusion:String(x.conclusion||''),sha:String(x.head_sha||'').slice(0,7),branch:String(x.head_branch||''),event:String(x.event||'')}))};
    }catch{if(epoch===hqEpoch)hqGithubError='No se pudo consultar GitHub. Abrí Actions o intentá nuevamente.';}
    finally{if(epoch===hqEpoch){hqGithubBusy=false;if(hqAllowed())api?.render();}}
  }
  function hqGithubView(){
    if(!hqTech())return '';
    const labels={success:'Aprobado',failure:'Falló',cancelled:'Cancelado',skipped:'Omitido',in_progress:'En curso',queued:'En cola'};
    return '<section aria-label="Actividad real de GitHub" style="margin-top:16px;padding:12px;border:1px solid #dce3eb;border-radius:10px"><h3>Actividad real de GitHub</h3><p>Consulta de solo lectura. No ejecuta pruebas ni modifica el repositorio.</p><button type="button" class="btn" data-ch-hq-github '+(hqGithubBusy?'disabled':'')+'>'+(hqGithubBusy?'Consultando…':'Consultar ejecuciones')+'</button> <a href="https://github.com/mgstock-app/mgstock-app.github.io/actions" target="_blank" rel="noopener noreferrer">Abrir Actions</a><p role="status">'+esc(hqGithubError||(hqGithub?'Última consulta: '+new Date(hqGithub.checked).toLocaleString('es-AR') : 'Sin consultar'))+'</p>'+(hqGithub?hqGithub.runs.map(x=>'<article style="border-top:1px solid #dce3eb;padding:8px 0;overflow-wrap:anywhere"><a href="https://github.com/mgstock-app/mgstock-app.github.io/actions/runs/'+x.id+'" target="_blank" rel="noopener noreferrer">'+esc(x.name)+'</a> · <strong>'+esc(labels[x.conclusion||x.status]||x.conclusion||x.status)+'</strong><small style="display:block">'+esc(x.branch)+' · '+esc(x.sha)+' · '+esc(x.event)+'</small></article>').join(''):'')+'</section>';
  }
  let hqDraft = '', hqTasks = [], hqBusy = false, hqLoaded = false, hqAttempted = false, hqError = '', hqEpoch = 0;
  const hqAllowed=()=>premiumAdmin() && status==='ready' && tab==='hq';
  function hqReset(){hqEpoch++;hqDraft='';hqTasks=[];hqBusy=false;hqLoaded=false;hqAttempted=false;hqError='';hqGithub=null;hqGithubBusy=false;hqGithubError='';hqAIReady=null;hqAIBusy=false;hqAIError='';hqRuns=[];hqRunsLoaded=false;hqRunsError='';hqRoom=false;}
  async function hqRequest(fn,args){
    if(!hqAllowed()||hqBusy||hqAIBusy)return;
    const epoch=hqEpoch; hqBusy=true;hqAttempted=true;hqError='';
    api?.render();
    try{
      const sb=window.GestLokSupabase;
      if(!sb?.rpc)throw Error('sin conexión');
      if(fn){
        const res=await sb.rpc(fn,args);
        if(res.error||!res.data)throw Error('No se confirmó el cambio');
        if(epoch!==hqEpoch||!hqAllowed())return;
        if(fn==='gestlok_hq_add_task')hqDraft='';
      }
      const res=await sb.rpc('gestlok_hq_list_tasks');
      if(res.error||!Array.isArray(res.data))throw Error('No se pudo consultar');
      if(epoch!==hqEpoch||!hqAllowed())return;
      hqTasks=res.data;hqLoaded=true;
      try{const runs=await sb.rpc('gestlok_hq_list_runs');if(epoch!==hqEpoch||!hqAllowed())return;if(runs.error||!Array.isArray(runs.data))throw Error('Sin resultados');hqRuns=runs.data;hqRunsLoaded=true;hqRunsError='';}catch{if(epoch===hqEpoch)hqRunsError='No se pudieron consultar los informes. Actualizá la bandeja.';}
    }catch{if(epoch===hqEpoch){hqError='No se pudo confirmar la operación. Actualizá la bandeja antes de volver a intentar.';}}
    finally{if(epoch===hqEpoch){hqBusy=false;if(hqAllowed())api?.render();}}
  }
  function hqTaskList(){
    if(!hqAllowed())return '';
    const renderTask=t=>'<article style="padding:12px;border:1px solid #dce3eb;border-radius:8px;margin:8px 0;overflow-wrap:anywhere"><strong>'+esc(hqArea(t.agent)?.[1]||'Área')+'</strong> · '+esc(t.status)+'<p style="white-space:pre-wrap">'+esc(t.instruction)+'</p><small>'+esc(dmy(t.created_at))+'</small>'+hqRunView(t)+
      (t.status==='pendiente'?'<div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="btn" data-ch-hq-close="'+esc(t.id)+'" data-status="cerrada" '+(hqBusy||(t.agent==='lider'&&!hqRuns.some(r=>r.task_id===t.id&&r.state==='review'))?'disabled':'')+'>'+(t.agent==='lider'?'Aprobar informe':'Marcar cerrada')+'</button><button type="button" class="btn" data-ch-hq-close="'+esc(t.id)+'" data-status="cancelada" '+(hqBusy?'disabled':'')+'>'+(t.agent==='lider'?'Descartar informe':'Cancelar tarea')+'</button></div>':'')+'</article>';
    return '<section aria-label="Bandeja privada de tareas" style="margin-top:20px"><h3>Bandeja de tareas</h3><button class="btn" type="button" data-ch-hq-refresh '+(hqBusy?'disabled':'')+'>Actualizar</button><p role="status">'+esc(hqError||(hqBusy?'Consultando…':!hqLoaded?'Bandeja sin consultar':'Guardado privado · sin ejecución automática'))+'</p>'+
      (hqLoaded?'<h4>Pendientes</h4>'+(hqTasks.filter(t=>t.status==='pendiente').map(renderTask).join('')||'<p>No hay tareas pendientes.</p>')+'<h4>Historial</h4>'+(hqTasks.filter(t=>t.status!=='pendiente').map(renderTask).join('')||'<p>No hay tareas cerradas.</p>'):'')+'</section>';
  }
  function hqView(){
    if(!premiumAdmin() || status!=='ready')return '';
    if(!hqAttempted&&!hqBusy)queueMicrotask(()=>{if(!hqAttempted&&hqAllowed())void hqRequest();});
    const selected=hqArea(hqAgent)||HQ_AGENTS[0];
    const positions=[[22,31],[50,23],[78,31],[22,67],[50,57],[78,67]];
    const states=a=>{
      const runs=hqRuns.filter(r=>hqTasks.some(t=>t.id===r.task_id&&t.agent===a[0]));
      if(runs.some(r=>r.state==='working'))return ['En ejecución','#b7791f'];
      if(runs.some(r=>r.state==='review'&&hqTasks.some(t=>t.id===r.task_id&&t.status==='pendiente')))return ['Por revisar','#2765a8'];
      if(runs[0]?.state==='error')return ['Último: error','#ac4141'];
      if(hqAIReady===true)return ['Conexión configurada','#28765a'];
      return ['Sin conexión a IA','#68798b'];
    };
    const missionBoard='<div style="display:flex;flex-wrap:wrap;justify-content:space-between;gap:6px;padding:12px 14px;background:#112c43;color:#f3f8fc;border-radius:12px 12px 0 0"><strong>GESTLOK HQ · Centro de misiones</strong><small>'+esc(hqLoaded?hqTasks.filter(t=>t.status==='pendiente').length+' pendientes · '+hqRuns.filter(r=>r.state==='working').length+' en ejecución':'Tareas sin consultar')+'</small></div>';
    const officeFloor='<svg viewBox="0 0 600 430" width="100%" height="100%" preserveAspectRatio="none" aria-hidden="true" style="position:absolute;inset:0;pointer-events:none"><defs><pattern id="hq-floor-grid" width="40" height="40" patternUnits="userSpaceOnUse" patternTransform="matrix(1 .35 -1 .35 0 0)"><path d="M0 0H40V40" fill="none" stroke="#b5c8d3" stroke-width="1"/></pattern></defs><path d="M25 132L300 25L575 132V300L300 410L25 300Z" fill="#d1dce5"/><path d="M25 105L300 10L575 105V260L300 372L25 260Z" fill="#f6f8f9"/><path d="M25 105L300 10L575 105V260L300 372L25 260Z" fill="url(#hq-floor-grid)" opacity=".5"/><path d="M25 105V45L300 0V10L575 45V105L300 10Z" fill="#c9e1e9" opacity=".8"/><path d="M25 105V45L300 0L575 45V105M80 86V36M135 67V27M190 48V18M245 29V9M355 29V9M410 48V18M465 67V27M520 86V36" stroke="#96b6c5" stroke-width="2" fill="none"/><path d="M25 105L300 10L575 105M25 260L300 372L575 260" stroke="#9bb1bf" stroke-width="2" fill="none"/><path d="M112 195L388 98M212 294L488 197" stroke="#b9cbd4" stroke-width="2" stroke-dasharray="6 6"/><g fill="#c3d5df"><path d="M40 220l27-11 28 11-28 13z"/><path d="M505 216l27-11 28 11-28 13z"/></g><g fill="#d6e2df"><path d="M46 218v-15l18-8 20 8v15l-19 8z"/><path d="M512 213v-15l18-8 20 8v15l-19 8z"/></g><g fill="#549778"><circle cx="65" cy="195" r="13"/><circle cx="530" cy="191" r="13"/></g><g fill="#9eb2bd"><path d="M255 324l45-17 45 17-45 18z"/><path d="M255 324v14l45 18v-14zM345 324v14l-45 18v-14z"/></g></svg>';
    // Visual animation only: execution indicators still come exclusively from recorded runs.
    const hqMotion='<style>.gl-hq-avatar .hq-walk{opacity:0;animation:hqWalk 16s var(--hq-delay) linear infinite both}.gl-hq-avatar .hq-seat{opacity:1;animation:hqSit 16s var(--hq-delay) linear infinite both}.gl-hq-avatar .hq-leg{transform-box:fill-box;transform-origin:center top;animation:hqStride .48s ease-in-out infinite alternate}.gl-hq-avatar .hq-leg-back{animation-direction:alternate-reverse}.gl-hq-avatar.hq-working .hq-walk,.gl-hq-avatar.hq-working .hq-seat{animation-iteration-count:1}.gl-hq-avatar.hq-working .hq-hand{transform-box:fill-box;transform-origin:center;animation:hqType .65s ease-in-out infinite alternate}.gl-hq-avatar.hq-working .hq-monitor{animation:hqScreen 2s ease-in-out infinite alternate}@keyframes hqWalk{0%{opacity:1;transform:translate(25px,17px)}12%{opacity:1;transform:translate(0,0)}14%,100%{opacity:0;transform:translate(0,0)}}@keyframes hqSit{0%,12%{opacity:0;transform:translateY(-4px)}14%,100%{opacity:1;transform:translateY(0)}}@keyframes hqStride{from{transform:rotate(-18deg)}to{transform:rotate(18deg)}}@keyframes hqType{from{transform:translate(0,0)}to{transform:translate(-2px,2px)}}@keyframes hqScreen{from{opacity:.65}to{opacity:1}}@media(prefers-reduced-motion:reduce){.gl-hq-avatar *{animation:none!important}.gl-hq-avatar .hq-walk{opacity:0}.gl-hq-avatar .hq-seat{opacity:1}}</style>';
    const character=(a,i,privateRoom=false)=>{
      const shirt=['#386c9d','#4c8b79','#a77d44','#7865a4','#aa6574','#407e91','#34536f'][i]||'#34536f';
      const hair=['#493b35','#3a302b','#75523f','#282e35','#855e45','#51443d','#342b29'][i]||'#342b29';
      const working=states(a)[0]==='En ejecución';
      const head='<circle cx="77" cy="32" r="9" fill="#dfb89a"/><path d="M68 30q0-12 11-11 9 1 8 12l-6-5-10 2z" fill="'+hair+'"/>';
      const torso='<path d="M66 43q11-8 22 0l-3 15q-9 5-17-1z" fill="'+shirt+'"/>';
      const roomBackdrop=privateRoom?'<path d="M3 28L55 4L112 28V83L55 104L3 83Z" fill="#e1ebf0"/><path d="M3 28V7L55 0L112 7V28L55 4Z" fill="#bad3df"/><path d="M23 9v12m17-14v7m32-7v7m19-5v12" stroke="#8faebc" stroke-width="1"/><path d="M8 71l9-4 9 4-9 5z" fill="#b7c8ce"/><circle cx="17" cy="66" r="6" fill="#549778"/>':'';
      return '<svg class="gl-hq-avatar'+(working?' hq-working':'')+'" viewBox="0 0 115 108" width="100%" aria-hidden="true" style="display:block;max-width:'+(privateRoom?'260':'112')+'px;margin:auto;overflow:visible;--hq-delay:'+(-i*2.1)+'s">'+roomBackdrop+
        '<ellipse cx="55" cy="74" rx="42" ry="8" fill="#879ca9" opacity=".22"/>'+
        '<g class="hq-desk"><path d="M13 39l46-19 37 16-45 20z" fill="#eaf0f4"/><path d="M13 39v6l38 17v-6z" fill="#99afbd"/><path d="M51 56v6l45-20V36z" fill="#8198a8"/><path d="M16 45v23m35-6v13m42-33v17" stroke="#8198a8" stroke-width="4" stroke-linecap="round"/><path d="M27 27l25-11v19L27 46z" fill="#263e50"/><path class="hq-monitor" d="M31 29l17-7v10l-17 8z" fill="#a5d9df"/><path d="M39 40v7l-7 3 15-3" fill="none" stroke="#456173" stroke-width="2"/><path d="M52 43l13-5 11 5-13 6z" fill="#8ca2b2"/></g>'+
        '<g class="hq-chair"><path d="M80 44l11-4v22l-11 5z" fill="#456173"/><path d="M71 61l11-5 9 5-11 6z" fill="#5c788c"/><path d="M80 67v9m-7 2 7-3 8 3" fill="none" stroke="#456173" stroke-width="2.5" stroke-linecap="round"/></g>'+
        '<g class="hq-walk"><ellipse cx="77" cy="70" rx="10" ry="3" fill="#5e7281" opacity=".25"/><path class="hq-leg" d="M72 55v14" stroke="#263e50" stroke-width="6" stroke-linecap="round"/><path class="hq-leg hq-leg-back" d="M82 55v14" stroke="#263e50" stroke-width="6" stroke-linecap="round"/>'+torso+head+'<path d="M67 45l-5 8m26-8 5 8" stroke="#dfb89a" stroke-width="4" stroke-linecap="round"/></g>'+
        '<g class="hq-seat"><path d="M75 57l-9 7v10m16-15-9 9v7" stroke="#263e50" stroke-width="5" stroke-linecap="round" fill="none"/><g transform="translate(0 5)">'+torso+head+'<path class="hq-hand" d="M68 45l-8 4-6-3m32-2-8 8-9-3" stroke="#dfb89a" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none"/></g></g></svg>';
    };
    const office='<div aria-label="Plano interactivo de la oficina" style="border:1px solid #cbd8e2;border-radius:12px;overflow:hidden">'+missionBoard+
      '<div style="position:relative;aspect-ratio:1.02;min-height:330px;max-height:690px;isolation:isolate;background:#e7eef3">'+officeFloor+
      HQ_AGENTS.map((a,i)=>{const st=states(a);return '<button type="button" data-ch-hq-agent="'+a[0]+'" aria-pressed="'+(a[0]===selected[0])+'" aria-label="'+esc(HQ_PEOPLE[a[0]].name+' · '+a[1]+' · '+st[0])+'" style="position:absolute;z-index:2;left:'+positions[i][0]+'%;top:'+positions[i][1]+'%;transform:translate(-50%,-50%);width:29%;max-width:160px;min-width:0;padding:3px 1px;border:1px solid '+(a[0]===selected[0]?'#1a5b83':'transparent')+';border-radius:9px;background:'+(a[0]===selected[0]?'#e9f6ffb8':'transparent')+';cursor:pointer;color:#173449;line-height:1.15">'+
        '<span style="display:inline-flex;align-items:center;gap:3px;max-width:100%;box-sizing:border-box;padding:4px 5px;border-radius:8px;background:#fff;box-shadow:0 1px 4px #28475d30;font-size:clamp(9px,2.3vw,13px);font-weight:700;overflow-wrap:anywhere"><span aria-hidden="true" style="flex:none;width:7px;height:7px;border-radius:50%;background:'+st[1]+'"></span>'+esc(HQ_PEOPLE[a[0]].name)+'</span>'+character(a,i)+'<span style="display:block;font-size:clamp(9px,2.1vw,12px);font-weight:600;background:#f7fafbd9;border-radius:4px;padding:2px;overflow-wrap:anywhere">'+esc(a[1])+'</span></button>';}).join('')+
      '<button type="button" data-ch-hq-leader aria-pressed="'+(hqAgent==='lider')+'" style="position:absolute;z-index:3;bottom:3%;left:50%;transform:translateX(-50%);font-size:11px;font-weight:700;padding:6px 10px;color:#173449;background:#fff;border:1px solid #8ba5b8;border-radius:9px;white-space:nowrap">Alex · Directora Ejecutiva</button></div>'+
      '<div style="display:flex;flex-wrap:wrap;gap:10px;padding:10px;background:#fff;font-size:11px;color:#425970"><span>● Sin conexión</span><span style="color:#b7791f">● En ejecución</span><span style="color:#2765a8">● Por revisar</span><span style="color:#ac4141">● Error</span></div></div>';
    const person=HQ_PEOPLE[selected[0]];
    const roomTasks=hqTasks.filter(t=>t.agent===selected[0]);
    const room='<section aria-label="Oficina privada del empleado" style="border:1px solid #cbd8e2;border-radius:12px;overflow:hidden;background:#f3f7fa">'+
      '<header style="padding:12px;background:#112c43;color:#fff"><strong>Oficina privada · '+esc(person.name)+'</strong><small style="display:block">'+esc(person.role)+'</small></header>'+
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:14px;align-items:center">'+character(selected,selected[0]==='lider'?6:HQ_AGENTS.findIndex(a=>a[0]===selected[0]),true)+
      '<div><strong>'+esc(person.name)+'</strong><p>'+esc(person.skills)+'</p><small>'+esc(states(selected)[0])+'</small></div></div>'+
      '<div style="padding:12px;border-top:1px solid #cbd8e2"><strong>Proyectos del sector</strong><p>'+esc(hqLoaded?roomTasks.length+' registrados · '+roomTasks.filter(t=>t.status==='pendiente').length+' pendientes':'Sin consultar')+'</p>'+roomTasks.slice(0,5).map(t=>'<p style="overflow-wrap:anywhere;margin:6px 0">'+esc(t.status+' · '+t.instruction.slice(0,100))+'</p>').join('')+'</div></section>';
    const navigation='<div role="group" aria-label="Ambientes de GESTLOK HQ" style="display:flex;flex-wrap:wrap;gap:8px;margin:10px 0"><button type="button" class="btn" data-ch-hq-room="general" aria-pressed="'+!hqRoom+'">Oficina general</button><button type="button" class="btn" data-ch-hq-room="private" aria-pressed="'+hqRoom+'">Oficina privada de '+esc(person.name)+'</button></div>';
    return '<section class="gl-admin-card" aria-label="Oficina virtual GESTLOK HQ"><header><h2>Centro de operaciones</h2><small>Privado · Dirección general</small></header>'+
      '<p>Tocá un empleado para abrir su ficha y asignarle una misión. Las animaciones de la oficina son visuales; los estados de ejecución corresponden únicamente a tareas reales.</p>'+hqMotion+hqExecutiveInbox()+navigation+(hqRoom?room:office)+
      '<div aria-label="Ficha del empleado" style="margin-top:16px;padding:12px;border:1px solid #dce3eb;border-radius:9px"><strong>'+esc(person.name+' · '+selected[1])+'</strong><p>'+esc(person.role+' · '+selected[2])+'</p><button type="button" class="btn" data-ch-hq-room="private">Entrar a oficina privada</button><small>'+esc(states(selected)[0])+' · Dirección general · Creadora. Las tareas guardadas no se ejecutan automáticamente.</small></div>'+
      '<form data-ch-hq-form style="display:grid;gap:10px;margin-top:16px"><h3>Preparar tarea · '+esc(selected[1])+'</h3>'+(hqAgent==='lider'?'<label for="gl-hq-scope">Alcance de la reunión</label><select id="gl-hq-scope">'+['GESTLOK · empresa y nuevas microapps','GESTLOK Chat · producto general','GESTLOK Chat · local específico'].map(v=>'<option '+(hqScope===v?'selected':'')+'>'+esc(v)+'</option>').join('')+'</select><p>Los seis sectores propondrán ideas y el líder preparará un informe. Indicá el local y el contexto si corresponde. Sin cambios automáticos.</p>':'')+'<label for="gl-hq-task">Objetivo y detalles</label><textarea id="gl-hq-task" name="task" maxlength="4000" rows="5" required style="width:100%;box-sizing:border-box;padding:10px;border:1px solid #aab9cc;border-radius:8px;color:#17283b;background:white" placeholder="¿Qué necesitás que haga esta área?">'+esc(hqDraft)+'</textarea><button class="btn primary" type="submit" data-hq-action="save" '+(hqBusy?'disabled':'')+'>'+(hqAgent==='lider'?'Guardar reunión privada':'Guardar tarea privada')+'</button><button class="btn" type="submit" data-hq-action="copy">Copiar instrucción para delegar</button><p role="status" data-ch-hq-feedback></p></form>'+
      hqAIView()+hqHiringView()+hqGithubView()+hqTaskList()+'<p><a href="https://github.com/mgstock-app/mgstock-app.github.io/issues" target="_blank" rel="noopener noreferrer">Abrir tareas reales en GitHub</a></p></section>';
  }

  function view(p) {
    if (!data) return '<div class="gl-ch"><main class="gl-ch-main"><p role="status" class="gl-ch-loading">Preparando tu panel…</p></main></div>';
    const cur = validTab(tab) && (!['gestlok-chat','hq'].includes(tab)||premiumAdmin()) ? tab : 'inicio';
    void window.GestLokContactoWeb?.prefetch?.();
    resumeMolinoTool();
    const parts = p.parts || {};
    const premium=api?.isCreadora?.()&&String(api.S?.me?.email||'').trim().toLowerCase()===PREMIUM_ADMIN_EMAIL;
    const nav = TABS.filter(t=>!['gestlok-chat','hq'].includes(t[0])||premium).map(t => '<button type="button" title="' + t[1] + '" aria-label="' + t[1] + '" data-ch-tab="' + t[0] + '"' + (t[0] === cur ? ' aria-current="page" class="on"' : '') + '>' + svg(t[2], 20) + '<span>' + t[1] + '</span>' +
      (t[0] === 'usuarios' && p.pending ? '<b>' + esc(p.pending) + '</b>' : '') +
      (t[0] === 'contacto' && window.GestLokContactoWeb?.unread?.() ? '<b>' + esc(window.GestLokContactoWeb.unread()) + '</b>' : '') + '</button>').join('');
    const d = today();
    let body;
    if (cur === 'inicio') body = home(p);
    else if (cur === 'empresas') body = '<div class="gl-ch-stack">' + (parts.companies || '') + (parts.prepare || '') + '</div>';
    else if (cur === 'usuarios') body = '<div class="gl-ch-stack">' + (parts.users || '') + '</div>';
    else if (cur === 'locales') body = premium?premiumLocales(p):'<div class="gl-ch-stack">' + (window.GestLokOwnerAreas?.companyFolders?.() || parts.locales || '') + '</div>';
    else if (cur === 'gestlok-chat') body = '<div class="gl-ch-stack">'+linksChatView()+chatAdminView()+'</div>';
    else if (cur === 'hq') body = hqView();
    else if (cur === 'chat-prueba') body = chatShowroomView();
    else if (cur === 'resenas') body = '<div class="gl-ch-stack">' + (window.GestLokDemoMetrics?.view?.() || '') + '</div>';
    else if (cur === 'nfc') body = '<div class="gl-ch-stack">' + (window.GestLokNfcQr?.view?.() || '<section class="gl-admin-card"><p role="status">NFC y QR se está actualizando. Cerrá y volvé a abrir GESTLOK.</p></section>') + '</div>';
    else if (cur === 'contacto') body = '<div class="gl-ch-stack">' + (window.GestLokContactoWeb?.view?.() || '<section class="gl-admin-card"><p role="status">Mensajes web se está actualizando. Cerrá y volvé a abrir GESTLOK.</p></section>') + '</div>';
    else if (cur === 'herramientas') body = '<div class="gl-ch-stack">' + chatAdminView() + dailySettingsView() + (parts.tools || '') + '</div>';
    else body = '<div class="gl-ch-stack">' + empleados(p) + '</div>';
    const title = cur === 'inicio' ? '¡Hola!' : (TABS.find(t => t[0] === cur) || [])[1];
    const sub = cur === 'inicio' ? 'Aquí podés gestionar todo el ecosistema de GESTLOK.' :
      cur === 'hq' ? 'Tu oficina virtual · Áreas de trabajo y delegación.' :
      cur === 'chat-prueba' ? 'Dos perfiles conectados, con datos exclusivamente de demostración.' :
      cur === 'gestlok-chat' ? 'Accedé a producción, Prueba y Testing.' :
      cur === 'contacto' ? 'Mensajes del formulario de Contacto de gestlok.com.ar.' : 'Administración de GESTLOK';
    const initial = esc(String(api.S?.me?.email || 'A').trim().charAt(0).toUpperCase());
    return '<div class="gl-ch' + (premium ? ' gl-ch-premium' : '') + (navCollapsed ? ' gl-ch-collapsed' : '') + '">' +
      '<aside class="gl-ch-side" aria-label="Administración GESTLOK"><div class="gl-ch-logo"><img src="icons/gestlok-wordmark.svg" alt="GESTLOK" width="170" height="48"><small>CREADORA · ADMIN</small></div>' +
      '<button type="button" class="gl-ch-collapse" data-ch-collapse aria-controls="gl-ch-navigation" aria-expanded="' + (!navCollapsed) + '" title="' + (navCollapsed ? 'Expandir menú' : 'Contraer menú') + '" aria-label="' + (navCollapsed ? 'Expandir menú lateral' : 'Contraer menú lateral') + '">' + svg('<path d="M4 5h16v14H4zM9 5v14M13 9l-3 3 3 3"/>', 20) + '<span>' + (navCollapsed ? 'Expandir menú' : 'Contraer menú') + '</span></button>' +
      '<nav class="gl-ch-nav" id="gl-ch-navigation">' + nav + '</nav>' +
      '<div class="gl-ch-me"><span class="gl-ch-av">' + initial + '</span><div><b>Creadora</b><small>' + esc(api.S?.me?.email || '') + '</small><em>ADMINISTRADORA</em></div></div>' +
      '<p class="gl-ch-quote">Gestión simple<br>para negocios reales</p></aside>' +
      '<main class="gl-ch-main"><header class="gl-ch-top"><div><h1>' + esc(title) + (cur === 'inicio' && !premium ? ' <span aria-hidden="true">👋</span>' : '') + '</h1><p>' + esc(sub) + '</p></div>' +
      '<div class="gl-ch-topr"><div class="gl-ch-date"><span>' + esc(d.date) + '</span><span>' + esc(d.time) + '</span></div>' +
      '<button type="button" class="gl-ch-bell" data-act="share" aria-label="Solicitudes pendientes: ' + num(p.pending) + '">' + svg('<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9z"/><path d="M10 21h4"/>', 22) + (p.pending ? '<b>' + esc(p.pending) + '</b>' : '') + '</button>' +
      '</div></header>' + body +
      '<footer class="gl-ch-foot">GESTLOK · Panel privado de la creadora · Accesos protegidos · Datos al ' + esc(dmy(data.generated_at)) + ' ' + esc(new Date(data.generated_at).toLocaleTimeString('es-AR', {hour: '2-digit', minute: '2-digit'})) + '</footer></main></div>';
  }
  function empleados(p) {
    const t = data.totals, e = data.employees_roles;
    return '<section class="gl-admin-card" aria-label="Administración de empleados"><header><h2>Administración de empleados</h2><small>Resumen general · Sin recibos ni sueldos</small></header>' +
      '<div class="gl-ch-bigstats"><div><b>' + num(t.employees) + '</b><small>Personas en Empleados</small></div><div><b>' + num(e.owner) + '</b><small>Titulares</small></div><div><b>' + num(e.manager) + '</b><small>Encargados</small></div><div><b>' + num(e.gestlok_gerentes) + '</b><small>Gerentes y editores con Horarios</small></div></div>' +
      '<p class="lead">Habilitar o deshabilitar el módulo por empresa se hace en «Empresas». Los recibos y planillas siguen protegidos por los permisos de cada empresa.</p>' +
      '<p><a class="btn primary" href="empleados/">Abrir Administración de empleados →</a></p></section>';
  }
  function goTab(v) {
    if (!validTab(v) || (['gestlok-chat','hq'].includes(v)&&!premiumAdmin())) return;
    if(v !== 'hq') hqReset();
    if(v !== 'chat-prueba') showroomExpandido = false;
    if(v==='locales')void loadMicroapps(true);
    if(v==='contacto')void window.GestLokContactoWeb?.refresh?.();
    tab = v; store.set(v);
    api?.render();
    if(v==='hq'&&!hqLoaded&&!hqBusy)void hqRequest();
    try { window.scrollTo({top: 0}); } catch { /* sin scroll */ }
  }
  document.addEventListener('input',ev=>{if(hqAllowed()&&ev.target?.id==='gl-hq-task')hqDraft=String(ev.target.value||'').slice(0,4000);});
  document.addEventListener('submit',ev=>{
    if(ev.target?.matches?.('[data-ch-hq-form]')){
      ev.preventDefault();if(!premiumAdmin()||tab!=='hq'||status!=='ready')return;
      const input=ev.target.querySelector('textarea');const feedback=ev.target.querySelector('[data-ch-hq-feedback]');
      hqDraft=String(input?.value||'').trim().slice(0,4000);if(!hqDraft)return;
      if(ev.submitter?.dataset?.hqAction!=='copy'){if(hqAgent==='lider')hqScope=ev.target.querySelector('#gl-hq-scope')?.value||hqScope;void hqRequest('gestlok_hq_add_task',{p_agent:hqAgent,p_instruction:hqAgent==='lider'?('Alcance: '+hqScope+'\nContexto y objetivo: '+hqDraft).slice(0,4000):hqDraft});return;}
      const agent=hqArea(hqAgent);const prompt='GESTLOK HQ · '+agent[1]+'\\nTarea: '+hqDraft+'\\nNo modificar producción ni datos de clientes sin autorización. Informar resultados y pruebas reales.';
      if(!window.navigator?.clipboard?.writeText){feedback.textContent='No se pudo acceder al portapapeles. Copiá el texto manualmente.';return;}
      window.navigator.clipboard.writeText(prompt).then(()=>{feedback.textContent='Instrucción copiada. Todavía no se ejecutó la tarea.';},()=>{feedback.textContent='No se pudo copiar. Copiá el texto manualmente.';});return;
    }
    if(!ev.target?.matches?.('[data-ch-create-business]'))return;
    ev.preventDefault();void crearEmpresa(ev.target);
  });
  document.addEventListener('click', ev => {
    const hire=ev.target.closest?.('[data-ch-hq-hire]');if(hire){ev.preventDefault();void hqDecideHire(hire.dataset.chHqHire,hire.dataset.decision);return;}
    const hqAIStatus=ev.target.closest?.('[data-ch-hq-ai-status]');if(hqAIStatus){ev.preventDefault();void hqAI('status');return;}
    const hqAIRun=ev.target.closest?.('[data-ch-hq-ai-run]');if(hqAIRun){ev.preventDefault();void hqAI('run',hqAIRun.dataset.chHqAiRun);return;}
    const hqGit=ev.target.closest?.('[data-ch-hq-github]');if(hqGit){ev.preventDefault();void hqCheckGithub();return;}
    const hqRefresh=ev.target.closest?.('[data-ch-hq-refresh]');if(hqRefresh){ev.preventDefault();void hqRequest();return;}
    const hqClose=ev.target.closest?.('[data-ch-hq-close]');if(hqClose){ev.preventDefault();if(hqAllowed()&&['cerrada','cancelada'].includes(hqClose.dataset.status)&&!(hqTasks.some(t=>t.id===hqClose.dataset.chHqClose&&t.agent==='lider')&&hqClose.dataset.status==='cerrada'&&!hqRuns.some(r=>r.task_id===hqClose.dataset.chHqClose&&r.state==='review')))void hqRequest('gestlok_hq_close_task',{p_id:hqClose.dataset.chHqClose,p_status:hqClose.dataset.status});return;}
    const hqRoomLink=ev.target.closest?.('[data-ch-hq-room]');if(hqRoomLink){ev.preventDefault();if(hqAllowed()){hqRoom=hqRoomLink.dataset.chHqRoom==='private';api?.render();}return;}
    const leader=ev.target.closest?.('[data-ch-hq-leader]');if(leader){ev.preventDefault();if(hqAllowed()){hqDraft='';hqAgent='lider';hqRoom=true;api?.render();}return;}
    const hq=ev.target.closest?.('[data-ch-hq-agent]');
    if(hq){ev.preventDefault();if(!premiumAdmin()||tab!=='hq'||status!=='ready'||!HQ_AGENTS.some(a=>a[0]===hq.dataset.chHqAgent))return;
      hqDraft='';hqAgent=hq.dataset.chHqAgent;api?.render();return;}
    const refreshApps=ev.target.closest?.('[data-ch-app-refresh]');
    if(refreshApps&&premiumAdmin()){ev.preventDefault();void loadMicroapps(true);return;}
    const appAdd=ev.target.closest?.('[data-ch-app-add]');
    if(appAdd&&premiumAdmin()){
      ev.preventDefault();const tenant=appAdd.dataset.chAppAdd;
      const select=document.querySelector('[data-ch-app-select="'+tenant+'"]');
      if(select?.value)void asignarMicroapp(tenant,select.value,true);return;
    }
    const appRemove=ev.target.closest?.('[data-ch-app-remove]');
    if(appRemove&&premiumAdmin()){
      ev.preventDefault();void asignarMicroapp(appRemove.dataset.chAppRemove,appRemove.dataset.app,false);return;
    }
    const collapse = ev.target.closest?.('[data-ch-collapse]');
    if (collapse && api?.isCreadora?.()) {
      ev.preventDefault();
      navCollapsed = !navCollapsed;
      try {localStorage.setItem(navPrefKey, navCollapsed ? 'yes' : 'no');} catch {}
      api.render();
      return;
    }
    const cobroBtn=ev.target.closest?.('[data-ch-cobro-link],[data-ch-cobro-req]');
    if(cobroBtn&&api?.isCreadora?.()){ev.preventDefault();void cobroAccion(cobroBtn);return;}
    const altaChat=ev.target.closest?.('[data-ch-chat-alta]');
    if(altaChat&&api?.isCreadora?.()){ev.preventDefault();void altaChatAction(altaChat.dataset.chChatAlta,altaChat.dataset.v==='si');return;}
    const chatOn=ev.target.closest?.('[data-ch-chat-on]');
    if(chatOn&&api?.isCreadora?.()){ev.preventDefault();void chatAdminAction(chatOn.dataset.chChatOn,null);return;}
    const chatEstado=ev.target.closest?.('[data-ch-chat-estado]');
    if(chatEstado&&api?.isCreadora?.()){ev.preventDefault();void chatAdminAction(chatEstado.dataset.chChatEstado,chatEstado.dataset.v==='si');return;}
    const dailyToggle=ev.target.closest?.('[data-ch-diario-visibility]');
    if(dailyToggle&&api?.isCreadora?.()){ev.preventDefault();void toggleDailyVisibility();return;}
    const refresh = ev.target.closest?.('[data-ch-coupons-refresh]');if(refresh && api?.isCreadora?.()){ev.preventDefault();loadCoupons();return;}
    const molino = ev.target.closest?.('[data-ch-molino]');
    if (molino && api?.isCreadora?.()) {
      ev.preventDefault(); void openMolinoTool(molino.dataset.chMolino); return;
    }
    const expandir = ev.target.closest?.('[data-ch-showroom-expand]');
    if (expandir && api?.isCreadora?.() && tab === 'chat-prueba') {
      ev.preventDefault();
      showroomExpandido = !showroomExpandido;
      document.querySelector('#hub .gl-ch-showroom')?.classList.toggle('gl-ch-showroom-expanded', showroomExpandido);
      expandir.setAttribute('aria-pressed', String(showroomExpandido));
      expandir.textContent = showroomExpandido ? 'Salir de pantalla completa' : 'Pantalla completa';
      return;
    }
    const perfil = ev.target.closest?.('[data-ch-showroom]');
    if (perfil && api?.isCreadora?.() && tab === 'chat-prueba') {
      ev.preventDefault();
      showroomPerfil = perfil.dataset.chShowroom === 'cliente' ? 'cliente' : 'local';
      document.querySelectorAll('.gl-ch-showroom [data-ch-showroom]').forEach(btn => {
        const on = btn.dataset.chShowroom === showroomPerfil;
        btn.setAttribute('aria-selected', String(on)); btn.classList.toggle('on',on);
      });
      document.querySelectorAll('.gl-ch-showroom [data-showroom-pane]').forEach(p =>
        {p.hidden=p.dataset.showroomPane!==showroomPerfil;});
      return;
    }
    const resetShowroom = ev.target.closest?.('[data-ch-showroom-reset]');
    if (resetShowroom && api?.isCreadora?.() && tab === 'chat-prueba') {
      ev.preventDefault();
      try { sessionStorage.removeItem('gestlok:chat-showroom:v1'); } catch {}
      // Solo llaves del chat ficticio «demo». No tocar sesiones, clientes
      // ni borradores de ningún local real.
      try {for(const t of ['token','cliente','datos','texto','menu'])
        localStorage.removeItem('gestlok-chat:'+t+':demo');} catch {}
      document.querySelectorAll('.gl-ch-showroom iframe').forEach(iframe => {
        try { iframe.contentWindow.location.reload(); } catch { iframe.src = iframe.getAttribute('src'); }
      });
      api.toast?.('Demostración reiniciada. No se alteraron datos reales.');
      return;
    }
    const b = ev.target.closest && ev.target.closest('[data-ch-tab]');
    if (b) { ev.preventDefault(); goTab(b.dataset.chTab); }
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && status === 'ready') {load();void refreshDaily(true);} });
  window.GestLokCreatorHome = Object.freeze({
    attach(ctx) { api = ctx; if(!premiumAdmin()){hqReset();hqAgent='desarrollo';} window.GestLokNfcQr?.attach?.(ctx); window.GestLokContactoWeb?.attach?.(ctx); const s = store.get(); tab = validTab(s) ? s : 'inicio'; },
    mode, view, refresh: load, tab: () => tab, setTab: goTab,
    dailyVisible, refreshDaily, dailySettingsView
  });
})();

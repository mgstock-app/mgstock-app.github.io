/* GESTLOK · Inicio y menú dedicados al Plan Scanner de Camila.
 * El backend autoriza los módulos. La creadora solo observa el mismo diseño:
 * ningún botón de edición se habilita al cambiar de rol visualmente. */
(() => {
  'use strict';
  if(window.GestLokScannerMenu)return;
  const TENANT='2a97bf8d-7d08-4aa7-b051-5d1a4dc80103';
  const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const isCompany=host=>host?.S?.me?.tenant_id===TENANT;
  const isCreator=host=>host?.isCreadora?.()===true;
  const ownerReady=host=>isCompany(host)&&!isCreator(host)&&host?.role?.()==='dueno'&&
    window.GestLokPilot?.authorized?.()===true;
  const viewing=host=>isCompany(host)&&(isCreator(host)||ownerReady(host));
  const actions=Object.freeze([
    ['Caja','caja','data-pilot-caja','credit-card'],
    ['Sistema de ventas','ventas','data-pilot-pos','scan-line'],
    ['Stock de productos','stock','data-pilot-stock','package'],
    ['Precios','precios','data-pilot-prices','tag'],
    ['Pedidos','pedidos','data-scanner-menu-orders','clipboard-list'],
    ['Dispositivos','dispositivos','data-pilot-devices','printer']
  ]);
  function loadStyle(){
    if(!document.head||document.getElementById('gl-scanner-business-style'))return;
    const link=document.createElement('link');
    link.id='gl-scanner-business-style';
    link.rel='stylesheet';
    link.href='/stock/gestlok-scanner-menu.css?rev=scanner-business-20261108';
    document.head.appendChild(link);
  }
  function navHTML(host){
    if(!isCompany(host)||!['dueno','creadora'].includes(host?.role?.())&&!isCreator(host))return '';
    loadStyle();
    const preview=isCreator(host);
    if(!viewing(host))return '<div class="gl-scanner-menu-wait" role="status">Verificando Plan Scanner…</div>';
    return actions.map(([label,key,attr])=>
      '<button type="button" '+(preview?'disabled title="Vista previa de creadora: solo lectura"':attr)+
      ' class="gl-scanner-nav" data-scanner-section="'+key+'"><span class="nl">'+escape(label)+'</span></button>'
    ).join('')+
    (preview?'<span class="gl-scanner-menu-preview">Vista de creadora · Solo lectura</span>':
      '<button type="button" class="gl-scanner-nav" data-zayro-open><span class="nl">Tienda Online · ZAYRO</span></button>');
  }
  function home(context,host,shown){
    if(context?.tenant_id!==TENANT)return null;
    loadStyle();
    // Al entrar a GESTLOK todavía no hay sucursal activa: ofrecer acceso
    // al local sin abrir Caja o Ventas fuera de su contexto.
    if(!host?.S?.local){
      const locals=(shown?.locals||[]).filter(l=>l?.id);
      return '<section class="gl-scanner-private-home" aria-label="Locales de Plan Scanner">'+
        '<header class="gl-scanner-private-header"><small>PLAN SCANNER · PERFUMERÍA</small>'+
        '<h1>ZAYRO <span>Elegí tu local</span></h1>'+
        '<p>Ingresá a tu sucursal para usar Caja, Ventas, Stock y Tienda Online.</p></header>'+
        '<div class="gl-scanner-local-grid">'+(locals.map(l=>shown.card(l)).join('')||
        '<p role="status">Todavía no hay locales habilitados.</p>')+'</div></section>';
    }
    if(!isCompany(host)||!['dueno','creadora'].includes(host?.role?.())&&!isCreator(host))
      return '<section class="gl-scanner-private-home"><p role="alert">No hay acceso autorizado a este local.</p></section>';
    const preview=isCreator(host);
    if(!viewing(host)){
      return '<section class="gl-scanner-private-home"><h1>Plan Scanner</h1>'+
        '<p role="status">Comprobando el acceso al Plan Scanner. No se mostrarán categorías de otras microapps.</p></section>';
    }
    const cards=actions.map(([label,key,attr])=>
      '<button type="button" class="gl-scanner-private-card" data-scanner-card="'+key+'" '+
      (preview?'disabled title="Vista previa: edición restringida a cuentas autorizadas"':attr)+
      '><span class="gl-scanner-card-icon" aria-hidden="true">▣</span><b>'+escape(label)+
      '</b><span aria-hidden="true">↗</span></button>'
    ).join('');
    const ownerZayro=window.GestLokZayroAdmin?.homeTile?.(host)||'';
    const zayro=ownerZayro||'<section class="gl-scanner-zayro-preview"><h2>Tienda Online · ZAYRO</h2>'+
      '<p>Vidriera pública del local. Para administrar productos se requiere la sesión de su dueña autorizada.</p>'+
      '<a href="/zayro/" target="_blank" rel="noopener noreferrer">Ver tienda pública ↗</a></section>';
    const extras=preview?'':(window.GestLokMisProductos?.homeTile?.()||'')+
      (window.GestLokCamiMonthly?.homeTile?.()||'');
    return '<section class="gl-scanner-private-home" aria-label="Inicio del Plan Scanner">'+
      '<header class="gl-scanner-private-header"><small>MI NEGOCIO · PERFUMERÍA</small>'+
        '<h1>ZAYRO <span>Plan Scanner</span></h1>'+
        '<p>Ventas, productos, precios y pedidos de tu local, en un solo lugar.</p>'+
        (preview?'<p class="gl-scanner-readonly">Vista de creadora · Se muestran las mismas microapps del local, sin conceder permisos de edición.</p>':'')+
      '</header>'+
      '<div class="gl-scanner-private-section"><h2>Herramientas de tu negocio</h2>'+
      '<div class="gl-scanner-private-grid">'+cards+'</div></div>'+
      zayro+extras+
      '</section>';
  }
  document.addEventListener('click',event=>{
    const btn=event.target.closest?.('[data-scanner-menu-orders]');
    if(!btn||btn.disabled)return;
    event.preventDefault();
    // La verificación del backend también se repite dentro de Pedidos.open.
    if(window.GestLokPilot?.authorized?.()!==true)return;
    void window.GestLokPedidos?.open?.();
  });
  window.GestLokScannerMenu=Object.freeze({navHTML,home,tenantId:()=>TENANT});
})();

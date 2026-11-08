/* GESTLOK | Navegación compartida del Plan Scanner, habilitada por registro privado.
 * Todas las lecturas/escrituras están protegidas adicionalmente por RLS en Supabase.
 * No es un sistema de facturación, un conector externo ni una copia de seguridad real. */
(() => {
 'use strict';
 let TENANT='';
 const SCANNER_MODULES=['tablero','sistema_venta','stock','precios','dispositivos'];
 const MODULES=[
  ['tablero','Panel del dueño','Resumen de los registros cargados en el piloto.','general'],
  ['sistema_venta','🛒 Sistema de Ventas','Escanear productos, cobrar y generar tickets.','general'],
  ['dispositivos','Dispositivos','Lectores USB/Bluetooth e impresoras térmicas para este equipo.','sistema'],
  ['pedidos','Pedidos','Preparar, controlar y cerrar pedidos de Cami por día.','general'],
  ['precios','Precios','Calcular precios de venta y ganancias por producto.','economia'],
  ['stock','Stock','Registrar unidades actuales y faltantes de cada producto.','operaciones'],
  ['finanzas','Ingresos y egresos','Movimientos manuales de dinero, pendientes y saldos.','economia'],
  ['ventas','Ventas y resultados','Registrar ventas y analizar ingresos registrados.','economia'],
  ['compras','Compras y proveedores','Seguir órdenes, entregas y pagos de proveedores.','operaciones'],
  ['movimientos','Movimientos de stock','Anotar entradas, salidas, ajustes y sus motivos.','operaciones'],
  ['costos','Costos adicionales','Registrar gastos asociados al negocio que no son costo unitario de catálogo.','economia'],
  ['apertura_cierre','Controles diarios','Seguimiento de apertura, cierre y checklist del local.','operaciones'],
  ['personal','Gestión del personal','Novedades y seguimiento interno; sin reemplazar legajos.','equipo'],
  ['tareas','Tareas y responsables','Asignar pendientes y confirmar su cumplimiento.','equipo'],
  ['alertas','Alertas y problemas','Registrar incidencias que requieren atención.','operaciones'],
  ['transferencias','Transferencias','Seguimiento manual de movimientos entre locales.','operaciones'],
  ['mermas','Pérdidas y desperdicios','Anotar desperdicios, roturas y costo estimado.','economia'],
  ['reposicion','Reposición sugerida','Preparar propuestas de compra y revisarlas.','operaciones'],
  ['comparativas','Comparar sucursales','Registrar indicadores por local y período.','economia'],
  ['integraciones','Integraciones','Llevar un listado de conexiones por configurar.','sistema'],
  ['documentos','Documentación','Controlar documentos, responsables y vencimientos.','sistema'],
  ['clientes','Clientes y seguimiento','Registrar seguimientos con consentimiento y privacidad.','equipo'],
  ['auditoria','Historial de acciones','Ver cambios efectuados en este centro piloto.','sistema'],
  ['resguardos','Plan de respaldos','Checklist y registro de verificaciones; no ejecuta backups.','sistema'],
  ['metas','Objetivos y planificación','Registrar metas y revisar su progreso.','economia']
 ];
 const HOME_MODULES=['sistema_venta','stock','precios','dispositivos'];
 const HOME_LABELS={apertura_cierre:['Caja y Finanzas','Caja, movimientos y ganancias en un mismo lugar.'],sistema_venta:['Sistema de ventas','Escanear productos, cobrar y emitir tickets térmicos.'],finanzas:['Movimientos y ganancias','Registrar ingresos, gastos y reposición; consultar el saldo manual.'],stock:['Stock','Cantidades, códigos de barras y etiquetas para imprimir.'],precios:['Precios','Costos, recargos y precios de venta.'],dispositivos:['Dispositivos','Lector USB/Bluetooth e impresora 58/80 mm.']};
 const DICTIONARY=Object.fromEntries(MODULES.map(([id,title,detail,group])=>[id,{title,detail,group}]));
 const fmtMoney=v=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:2}).format(Number(v||0));
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const attr=esc;
 const today=()=>new Date().toLocaleDateString('en-CA');
 let enabled=false,checking=false,verified=false,busy=false,displayed=false,active='tablero',records=[],audit=[],error='',editing='',api=null,loading=false,ownerUid='',accessEpoch=0,accessMode='';
 const CREATOR_TENANT='2a97bf8d-7d08-4aa7-b051-5d1a4dc80103';
 function creatorContext(context,host){
  return context?.tenant_id===CREATOR_TENANT && host?.S?.me?.tenant_id===CREATOR_TENANT &&
    ['dueno','creadora'].includes(context.role) && host?.role?.()==='creadora' &&
    host?.isCreadora?.()===true;
 }
 function eligible(context,host){
  return !!context && context.tenant_id===TENANT && host?.S?.me?.tenant_id===TENANT &&
    ((context.role==='dueno' && host?.role?.()==='dueno') || creatorContext(context,host));
 }
 function reset(){accessEpoch++;enabled=false;verified=false;checking=false;api=null;ownerUid='';accessMode='';records=[];audit=[];window.GestLokPreciosStock?.reset?.();close();}
 async function refresh(context,host){
  const creator=creatorContext(context,host);
  const owner=context?.tenant_id===host?.S?.me?.tenant_id &&
    context?.role==='dueno' && host?.role?.()==='dueno';
  if(!context?.tenant_id||(!owner&&!creator)||context.logo_id==='mi-gusto'||
     context.tenant_id==='cb0dc04a-9a13-434f-a3d0-47f1d8f39670'){reset();return;}
  const nextMode=creator?'creadora':'dueno';
  if(TENANT!==context.tenant_id||accessMode!==nextMode){reset();TENANT=context.tenant_id;accessMode=nextMode;}
  api=host;
  if(verified||checking)return;
  checking=true;
  const epoch=accessEpoch;
  try{
   const {data,error:err}=await window.GestLokSupabase.from('gestlok_pilot_access')
    .select('enabled,owner_uid,plan_code').eq('tenant_id',TENANT).maybeSingle();
   if(err)throw err;
   const {data:identity,error:authError}=await window.GestLokSupabase.auth.getUser();
   if(authError||!identity?.user?.id)throw Error('Sesión no válida');
   if(epoch!==accessEpoch)return;
   const planReady=data?.plan_code==='scanner'&&data?.enabled===true&&!!data?.owner_uid;
   if(!planReady)throw Error('Plan Scanner no habilitado');
   if(creator){
    const {data:editing,error:editingError}=await window.GestLokSupabase.rpc('gestlok_creator_editing_state');
    if(editingError||editing?.active!==true||editing?.permanent!==true ||
       identity.user.id===data.owner_uid)throw Error('Administración no autorizada');
   }else if(data.owner_uid!==identity.user.id)throw Error('Dueña no autorizada');
   if(epoch!==accessEpoch)return;
   enabled=true;
   ownerUid=data.owner_uid;
  }catch{if(epoch===accessEpoch){enabled=false;ownerUid='';}}
  finally{
   if(epoch!==accessEpoch)return;
   checking=false;verified=true;
   if(api?.S?.me?.tenant_id===TENANT)api.render?.();
  }
 }
 function homeTile(context,host){
  if(!enabled||!eligible(context,host))return '';
  return '<section class="gl-pilot-entry" aria-label="Herramientas comerciales"><div class="gl-pilot-entry-info"><small>OPERACIONES</small><h2>Accesos rápidos</h2></div>'+ 
   '<div class="gl-pilot-entry-actions"><button type="button" data-pilot-caja>Caja</button><button type="button" data-pilot-pos>Ventas</button><button type="button" data-pilot-stock>Stock</button><button type="button" data-pilot-prices>Precios</button></div></section>';
 }
 async function assertAccess(){
  if(!authorized())throw Error('No se pudo verificar tu permiso en este local.');
  const db=window.GestLokSupabase;
  const {data:identity,error:authError}=await db.auth.getUser();
  if(authError||!identity?.user?.id)throw Error('Tu sesión necesita volver a iniciarse.');
  const {data:plan,error:planError}=await db.from('gestlok_pilot_access')
    .select('enabled,owner_uid,plan_code').eq('tenant_id',TENANT).maybeSingle();
  if(planError||plan?.enabled!==true||plan?.plan_code!=='scanner'||plan?.owner_uid!==ownerUid)
    throw Error('El plan no está autorizado para esta empresa.');
  if(accessMode==='dueno'&&identity.user.id===ownerUid)return true;
  if(accessMode==='creadora'&&TENANT===CREATOR_TENANT&&
     identity.user.id!==ownerUid&&api?.role?.()==='creadora'&&api?.isCreadora?.()===true){
    const {data:state,error}=await db.rpc('gestlok_creator_editing_state');
    if(!error&&state?.active===true&&state?.permanent===true)return true;
  }
  throw Error('La identidad o los permisos no se pudieron validar.');
 }
 function authorized(){
  return !!enabled&&!!ownerUid&&api?.S?.me?.tenant_id===TENANT&&
    ((accessMode==='dueno'&&api?.role?.()==='dueno')||
     (accessMode==='creadora'&&TENANT===CREATOR_TENANT&&api?.role?.()==='creadora'&&api?.isCreadora?.()===true));
 }
 async function load(){
  const epoch=accessEpoch;
  await assertAccess();
  const db=window.GestLokSupabase;
  const [r,a]=await Promise.all([
   db.from('gestlok_pilot_records').select('id,module,title,note,amount,direction,status,occurred_on,due_on,responsible,created_at')
     .eq('tenant_id',TENANT).order('created_at',{ascending:false}).limit(300),
   db.from('gestlok_pilot_audit').select('id,module,action,at').eq('tenant_id',TENANT).order('at',{ascending:false}).limit(70)
  ]);
  if(r.error)throw r.error;
  if(a.error)throw a.error;
  if(epoch!==accessEpoch)return;
  records=r.data||[];audit=a.data||[];
 }
 function close(back=true){
  window.GestLokPosPreview?.dispose?.();
  const p=document.querySelector('#gl-pilot-panel');p?.remove();document.body.classList.remove('gl-pilot-open');
  displayed=false;active='tablero';error='';editing='';
  if(window.history?.state?.glPilot){if(back)window.history.back();else window.history.replaceState({...window.history.state,glPilot:false},'');}
 }
 function sectionTitle(key){return DICTIONARY[key]?.title||'Gestión';}
 function card(key){const v=DICTIONARY[key],total=records.filter(x=>x.module===key).length;
  return '<button class="gl-pilot-module" type="button" data-pilot-tab="'+attr(key)+'">'+
    '<span class="gl-pilot-module-name">'+esc(v.title)+'</span><span>'+esc(v.detail)+'</span>'+
    (key==='tablero'||key==='auditoria'?'<small>Consulta</small>':['pedidos','precios','stock'].includes(key)?'<small>Gestión integrada con tu catálogo</small>':'<small>'+total+' registros · Carga manual</small>')+'</button>';
 }
 function sidebar(){
  return '<nav class="gl-pilot-nav" aria-label="Secciones de tu negocio"><div><span class="gl-pilot-group">Mi local</span>'+
   '<button type="button" data-pilot-tab="tablero" class="'+(active==='tablero'?'is-active':'')+'">Inicio</button>'+
   '<button type="button" data-pilot-caja>Caja</button>'+
   HOME_MODULES.map(id=>'<button type="button" data-pilot-tab="'+id+'" class="'+(active===id?'is-active':'')+'">'+esc(HOME_LABELS[id][0])+'</button>').join('')+'</div></nav>';
 }
 function dashboard(){
  const fin=records.filter(r=>r.module==='finanzas');
  const entradas=fin.filter(x=>x.direction==='ingreso').reduce((v,x)=>v+Number(x.amount||0),0);
  const salidas=fin.filter(x=>x.direction==='egreso').reduce((v,x)=>v+Number(x.amount||0),0);
  return '<div class="gl-pilot-hero"><small>RESUMEN DEL LOCAL</small><h2>Tu negocio, en una sola vista</h2>'+
   '<p>Resumen basado únicamente en movimientos manuales registrados. No representa ventas cobradas ni ganancia neta real.</p></div>'+
   '<div class="gl-pilot-kpis">'+[['Ingresos registrados',fmtMoney(entradas)],['Gastos registrados',fmtMoney(salidas)],['Saldo de movimientos',fmtMoney(entradas-salidas)]].map(([a,b])=>'<div><span>'+esc(a)+'</span><strong>'+esc(b)+'</strong></div>').join('')+'</div>'+
   '<h3>Administrar mi local</h3><div class="gl-pilot-grid">'+HOME_MODULES.map(id=>'<button class="gl-pilot-module" type="button" data-pilot-tab="'+id+'"><span class="gl-pilot-module-name">'+esc(HOME_LABELS[id][0])+'</span><span>'+esc(HOME_LABELS[id][1])+'</span></button>').join('')+'</div>';
 }
 function tableRows(key){
  const list=records.filter(x=>x.module===key);
  if(!list.length)return '<div class="gl-pilot-empty">Todavía no registraste información. Podés empezar cuando quieras.</div>';
  return '<div class="gl-pilot-table-scroll"><table><thead><tr><th>Registro</th><th>Fecha</th><th>Importe</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>'+
   list.map(r=>'<tr><td><b>'+esc(r.title)+'</b><small>'+esc(r.note)+'</small><small>'+esc(r.responsible)+'</small></td><td>'+esc(r.occurred_on)+'</td>'+
    '<td>'+ (r.amount==null?'—':fmtMoney(r.amount))+'</td><td>'+esc(({pendiente:'Pendiente',en_curso:'En curso',completado:'Completado',cancelado:'Cancelado'})[r.status]||r.status)+'</td>'+
    '<td><button type="button" data-pilot-edit="'+attr(r.id)+'">Editar</button><button type="button" data-pilot-delete="'+attr(r.id)+'">Eliminar</button></td></tr>').join('')+
   '</tbody></table></div>';
 }
 function form(key){
  const item=records.find(x=>x.id===editing&&x.module===key);
  if(editing&&!item)editing='';
  const value=(name)=>attr(item?.[name]??'');
  return '<form class="gl-pilot-form" id="gl-pilot-form"><input type="hidden" name="module" value="'+attr(key)+'"/>'+
   '<h3>'+(item?'Editar registro':'Nuevo registro')+'</h3>'+
   '<label>Título o descripción breve<input required maxlength="160" minlength="2" name="title" value="'+value('title')+'" placeholder="Ej.: Pedido pendiente de revisar"></label>'+
   '<div class="gl-pilot-form-grid"><label>Fecha<input type="date" required name="occurred_on" value="'+(item?.occurred_on||today())+'"></label>'+
   '<label>Fecha límite (opcional)<input type="date" name="due_on" value="'+value('due_on')+'"></label></div>'+
   '<div class="gl-pilot-form-grid"><label>Importe en ARS (opcional)<input type="number" min="0" max="999999999999" step="0.01" name="amount" value="'+value('amount')+'" placeholder="0,00"></label>'+
   '<label>Responsable (opcional)<input name="responsible" maxlength="100" value="'+value('responsible')+'" placeholder="Persona o sector"></label></div>'+
   (key==='finanzas'?'<label>Tipo de movimiento<select name="direction"><option value="otro">Sin clasificar</option><option value="ingreso" '+(item?.direction==='ingreso'?'selected':'')+'>Ingreso</option><option value="egreso" '+(item?.direction==='egreso'?'selected':'')+'>Egreso</option></select></label>':'')+
   '<label>Estado<select name="status">'+[['pendiente','Pendiente'],['en_curso','En curso'],['completado','Completado'],['cancelado','Cancelado']].map(([key,title])=>
     '<option value="'+key+'" '+((item?.status||'pendiente')===key?'selected':'')+'>'+title+'</option>').join('')+'</select></label>'+
   '<label>Observaciones<textarea name="note" maxlength="2000" rows="3" placeholder="Detalles, referencia o pasos siguientes">'+esc(item?.note||'')+'</textarea></label>'+
   '<div class="gl-pilot-actions"><button type="submit" '+(busy?'disabled':'')+'>'+(busy?'Guardando…':item?'Guardar cambios':'Guardar registro')+'</button>'+
   (item?'<button type="button" data-pilot-cancel>Cancelar edición</button>':'')+'</div></form>';
 }
 function activity(){
  if(!audit.length)return '<div class="gl-pilot-empty">Todavía no hay movimientos registrados.</div>';
  return '<div class="gl-pilot-activity">'+audit.map(x=>
    '<div><strong>'+esc(({creado:'Creación',actualizado:'Modificación',eliminado:'Eliminación'})[x.action]||x.action)+'</strong> · '+
    esc(sectionTitle(x.module))+'<small>'+esc(new Date(x.at).toLocaleString('es-AR'))+'</small></div>').join('')+'</div>';
 }
 function current(){
  if(active==='tablero')return dashboard();
  if(active==='sistema_venta')return '<div id="gl-pos-preview-mount"><p>Cargando escáner…</p></div>';
  if(active==='dispositivos')return window.GestLokPosDevices?.renderSettings?.(TENANT)||'<p>Cargando configuración de dispositivos…</p>';
  if(active==='pedidos')return window.GestLokPedidos?.render?.()||'<p>No se pudo cargar el módulo Pedidos.</p>';
  if(active==='precios'||active==='stock')return window.GestLokPreciosStock?.render?.()||'<p>No se pudo cargar Precios y Stock.</p>';
  if(active==='auditoria')return '<h2>Auditoría de este piloto</h2><p>Registro automático de altas, cambios y eliminaciones realizados acá. No reemplaza la auditoría completa de GESTLOK.</p>'+activity();
  const m=DICTIONARY[active];
  const financeNav=(active==='apertura_cierre'||active==='finanzas')
   ?'<nav class="gl-pilot-finance-tabs" aria-label="Caja y Finanzas" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px"><button type="button" data-pilot-tab="apertura_cierre" aria-current="'+(active==='apertura_cierre'?'page':'false')+'">Caja</button><button type="button" data-pilot-tab="finanzas" aria-current="'+(active==='finanzas'?'page':'false')+'">Movimientos y ganancias</button></nav>'
   :'';
  return financeNav+'<header class="gl-pilot-section-head"><div><h2>'+esc(m.title)+'</h2><p>'+esc(m.detail)+'</p>'+
   '<small>Registro manual privado · Sin movimientos automáticos en sistemas externos.</small></div>'+
   '<button type="button" data-pilot-new>Nuevo registro</button></header>'+
   (editing?'': '<div class="gl-pilot-form-slot" hidden></div>')+
   '<div class="gl-pilot-data">'+tableRows(active)+'</div>'+
   (editing?form(active):'<div class="gl-pilot-form-slot"></div>');
 }
 function render(){
  if(!displayed)return;
  window.GestLokPosPreview?.dispose?.();
  let root=document.querySelector('#gl-pilot-panel');
  if(!root){root=document.createElement('div');root.id='gl-pilot-panel';document.body.append(root);}
  root.innerHTML='<div class="gl-pilot-shell" role="dialog" aria-modal="true" aria-labelledby="gl-pilot-title">'+
    '<header class="gl-pilot-top"><div><small>GESTLOK · PRUEBA PRIVADA</small><h1 id="gl-pilot-title">Mi local</h1>'+
    '<span>Caja, ventas, stock y precios</span></div><button type="button" data-pilot-close aria-label="Volver a Mi local">← Volver a Mi local</button></header>'+
    '<div class="gl-pilot-main">'+sidebar()+'<main class="gl-pilot-content" id="gl-pilot-content">'+
    (error?'<p class="gl-pilot-error" role="alert">'+esc(error)+'</p>':'')+
    (loading?'<p role="status">Consultando registros privados…</p>':current())+'</main></div>'+
    '<footer class="gl-pilot-footer">Plan Scanner privado: las ventas requieren un plan habilitado y un usuario autorizado. Los datos permanecen separados por empresa.</footer></div>';
  document.body.classList.add('gl-pilot-open');
  if(active==='dispositivos')window.GestLokPosDevices?.mountSettings?.(root.querySelector('#gl-pilot-content'),TENANT);
 }
 async function open(){
  if(displayed||!enabled)return;
  displayed=true;active='tablero';loading=true;
  window.history?.pushState({...window.history.state,glPilot:true},'');
  render();
  try{await load();error='';}catch(e){error=e.message||'No se pudo cargar';}
  finally{loading=false;render();}
 }
 async function openOrders(){return;}
 const POS_SCRIPTS=['catalog-adapter.js','barcode-scanner.js','payment-split.js','checkout-client.js','pos-devices.js','pos-preview.js'];
 async function loadPosScripts(){
  for(const file of POS_SCRIPTS){
   const src='/stock/sistema-venta/'+file+'?rev=scanner-camera-premium-20261107';
   if(document.querySelector('script[data-pos-src="'+file+'"]'))continue;
   await new Promise((resolve,reject)=>{
    const el=document.createElement('script');
    el.src=src;el.dataset.posSrc=file;
    el.onload=resolve;el.onerror=()=>{el.remove();reject(Error('No se pudo cargar '+file));};
    document.head.append(el);
   });
  }
 }
 async function openPosPreview(){
  try{
   await assertAccess();
   await loadPosScripts();
   const db=window.GestLokSupabase;
   const [result,plan,methodResult]=await Promise.all([
    db.from('gestlok_pilot_products').select('id,name,sku,unit_price,stock_quantity,active')
     .eq('tenant_id',TENANT).eq('active',true).order('name').limit(500),
    db.from('gestlok_pilot_access').select('pos_live_enabled,enabled,plan_code')
     .eq('tenant_id',TENANT).maybeSingle(),
    db.from('gestlok_scanner_payment_methods').select('method_id,label,enabled')
     .eq('tenant_id',TENANT).eq('enabled',true)
   ]);
   if(result.error)throw result.error;
   if(plan.error)throw plan.error;
   if(methodResult.error)throw methodResult.error;
   const checkoutEnabled=plan.data?.enabled===true&&plan.data?.plan_code==='scanner'&&plan.data?.pos_live_enabled===true;
   const sales=checkoutEnabled
    ?await db.from('gestlok_pilot_pos_sales').select('id,total,payment_method,created_at')
     .eq('tenant_id',TENANT).order('created_at',{ascending:false}).limit(8)
    :{data:[],error:null};
   const scannerDay=()=>{
    const parts=new Intl.DateTimeFormat('en-US',{
     timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'
    }).formatToParts(new Date());
    const value=type=>parts.find(p=>p.type===type)?.value||'';
    return value('year')+'-'+value('month')+'-'+value('day');
   };
   const day=scannerDay();
   const report=checkoutEnabled
    ?await db.rpc('gestlok_scanner_pos_resumen',{p_tenant:TENANT,p_day:day})
    :{data:null,error:null};
   if(sales.error)throw sales.error;
   if(report.error)throw report.error;
   if(!displayed||active!=='sistema_venta'||!enabled||api?.S?.me?.tenant_id!==TENANT)return;
   const mount=document.querySelector('#gl-pos-preview-mount');
   if(mount)window.GestLokPosPreview.render(mount,result.data||[],{
    checkoutEnabled,
    paymentMethods:(methodResult.data||[]).map(m=>({id:m.method_id,label:m.label,enabled:m.enabled})),
    recentSales:sales.data||[],
    report:report.data||null,
    onReportDay:async selectedDay=>{
     if(!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(selectedDay)||!enabled||api?.S?.me?.tenant_id!==TENANT)
      throw Error('Fecha o local inválido.');
     await assertAccess();
     const res=await window.GestLokSupabase.rpc('gestlok_scanner_pos_resumen',{
      p_tenant:TENANT,p_day:selectedDay
     });
     if(res.error)throw res.error;
     return res.data;
    },
    onSale:async()=>{
     window.GestLokPreciosStock?.reset?.();
     if(!displayed||active!=='sistema_venta'||api?.S?.me?.tenant_id!==TENANT)return;
     await assertAccess();
     const [freshProducts,freshSales,freshReport]=await Promise.all([
      db.from('gestlok_pilot_products').select('id,name,sku,unit_price,stock_quantity,active')
       .eq('tenant_id',TENANT).eq('active',true).order('name').limit(500),
      db.from('gestlok_pilot_pos_sales').select('id,total,payment_method,created_at')
       .eq('tenant_id',TENANT).order('created_at',{ascending:false}).limit(8),
      db.rpc('gestlok_scanner_pos_resumen',{p_tenant:TENANT,p_day:scannerDay()})
     ]);
     if(freshProducts.error||freshSales.error||freshReport.error)throw freshProducts.error||freshSales.error||freshReport.error;
     if(displayed&&active==='sistema_venta'&&api?.S?.me?.tenant_id===TENANT){
      window.GestLokPosPreview?.update?.({
       products:freshProducts.data||[],recentSales:freshSales.data||[],
       report:freshReport.data||null,reportDay:scannerDay()
      });
     }
    }
   });
  }catch(e){
   const mount=document.querySelector('#gl-pos-preview-mount');
   if(mount)mount.textContent=e.message||'No se pudo iniciar el escáner.';
  }
 }
 async function switchSection(section){
  if(!SCANNER_MODULES.includes(section)||!enabled)return;
  if(!displayed)await open();
  if(!displayed)return;
  if(section==='dispositivos'){
   try{await assertAccess();await loadPosScripts();}catch(e){error=e.message||'No se pudieron cargar los dispositivos.';}
  }
  active=section;editing='';render();
  if(section==='sistema_venta')await openPosPreview();
  if(section==='pedidos')await window.GestLokPedidos?.open?.();
  if(section==='precios'||section==='stock')await window.GestLokPreciosStock?.open?.(section);
 }
 async function save(form){
  if(busy)return;
  busy=true;error='';
  const data=Object.fromEntries(new FormData(form).entries());
  if(!DICTIONARY[data.module]||['tablero','auditoria'].includes(data.module)||data.module!==active){busy=false;return;}
  const title=String(data.title||'').trim(), note=String(data.note||'').trim();
  const amount=String(data.amount||'').trim()?Number(data.amount):null;
  if(title.length<2||title.length>160||note.length>2000||amount!==null&&(!Number.isFinite(amount)||amount<0||amount>999999999999)){
    error='Revisá los datos ingresados.';busy=false;render();return;
  }
  try{
   await assertAccess();
   const values={tenant_id:TENANT,module:active,title,note,amount,
     occurred_on:String(data.occurred_on||today()),due_on:String(data.due_on||'')||null,
     responsible:String(data.responsible||'').trim(),direction:active==='finanzas'?String(data.direction||'otro'):'otro',
     status:String(data.status||'pendiente')};
   const db=window.GestLokSupabase;
   const result=editing
    ? await db.from('gestlok_pilot_records').update(values).eq('tenant_id',TENANT).eq('id',editing).select('id').single()
    : await db.from('gestlok_pilot_records').insert(values).select('id').single();
   if(result.error)throw result.error;
   editing='';await load();render();
  }catch(e){error=e.message||'No se pudo guardar.';render();}
  finally{busy=false;render();}
 }
 async function remove(id){
  const item=records.find(x=>x.id===id&&x.module===active);
  if(!item||!confirm('¿Eliminar este registro de prueba? Quedará constancia en el historial.'))return;
  busy=true;
  try{
   await assertAccess();
   const {error:err}=await window.GestLokSupabase.from('gestlok_pilot_records').delete()
     .eq('id',id).eq('tenant_id',TENANT);
   if(err)throw err;
   editing='';await load();error='';
  }catch(e){error=e.message||'No se pudo eliminar.';}
  finally{busy=false;render();}
 }
 document.addEventListener('click',e=>{
  if(e.target.closest('#gl-pilot-panel [data-owner-nav]')){close(false);return;}
  if(e.target.closest('[data-pilot-open]')){e.preventDefault();void open();return;}
  if(e.target.closest('[data-pilot-caja]')){e.preventDefault();if(displayed)close(false);const opened=window.GestLokCajaDiaria?.openApp?.();if(!opened){api?.toast?.('No pudimos abrir la Caja. Revisá la conexión y volvé a intentarlo.',true);}return;}
  if(e.target.closest('[data-pilot-pos]')){e.preventDefault();void switchSection('sistema_venta');return;}
  if(e.target.closest('[data-pilot-devices]')){e.preventDefault();void switchSection('dispositivos');return;}
  if(e.target.closest('[data-pilot-orders]')){e.preventDefault();void openOrders();return;}
  if(e.target.closest('[data-pilot-prices]')){e.preventDefault();void switchSection('precios');return;}
  if(e.target.closest('[data-pilot-stock]')){e.preventDefault();void switchSection('stock');return;}
  const homeTab=e.target.closest('.gl-pilot-entry [data-pilot-tab]');
  if(homeTab){e.preventDefault();void switchSection(homeTab.dataset.pilotTab);return;}
  if(!displayed)return;
  if(e.target.closest('[data-pilot-close]')){close();document.body.classList.remove('gl-pilot-open');return;}
  const t=e.target.closest('[data-pilot-tab]');
  if(t){void switchSection(t.dataset.pilotTab);return;}
  if(e.target.closest('[data-pilot-new]')){
   editing='';render();
   const slot=document.querySelector('#gl-pilot-content .gl-pilot-form-slot:not([hidden])');
   if(slot){
    slot.insertAdjacentHTML('afterbegin',form(active));
    slot.scrollIntoView({behavior:'smooth',block:'start'});
    document.querySelector('#gl-pilot-form input[name="title"]')?.focus({preventScroll:true});
   }
  }
  const edit=e.target.closest('[data-pilot-edit]');
  if(edit){editing=edit.dataset.pilotEdit;error='';render();document.querySelector('#gl-pilot-form')?.scrollIntoView({behavior:'smooth',block:'nearest'});}
  const del=e.target.closest('[data-pilot-delete]');if(del)remove(del.dataset.pilotDelete);
  if(e.target.closest('[data-pilot-cancel]')){editing='';render();}
 });
 document.addEventListener('submit',e=>{
  if(e.target.id!=='gl-pilot-form')return;e.preventDefault();void save(e.target);
 });
 window.addEventListener?.('popstate',()=>{if(displayed&&!window.history?.state?.glPilot)close(false);});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&displayed){close();document.body.classList.remove('gl-pilot-open');}});
 window.GestLokPilot=Object.freeze({refresh,homeTile,open,openOrders,reset,
  authorized,
  creatorMode:()=>authorized()&&accessMode==='creadora',
  tenantId:()=>TENANT,scanner:()=>enabled&&api?.role?.()==='dueno'&&api?.S?.me?.tenant_id===TENANT,switchSection,rerender:render,modules:MODULES.map(([id])=>id)});
})();

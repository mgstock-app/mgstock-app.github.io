/* GESTLOK | Centro de control piloto exclusivo de la empresa Perfumes.
 * Todas las lecturas/escrituras están protegidas adicionalmente por RLS en Supabase.
 * No es un sistema de facturación, un conector externo ni una copia de seguridad real. */
(() => {
 'use strict';
 const TENANT='2a97bf8d-7d08-4aa7-b051-5d1a4dc80103';
 const MODULES=[
  ['tablero','Panel del dueño','Resumen de los registros cargados en el piloto.','general'],
  ['finanzas','Ingresos y egresos','Movimientos manuales de dinero, pendientes y saldos.','economia'],
  ['ventas','Ventas y resultados','Registrar ventas y analizar ingresos registrados.','economia'],
  ['compras','Compras y proveedores','Seguir órdenes, entregas y pagos de proveedores.','operaciones'],
  ['movimientos','Movimientos de stock','Anotar entradas, salidas, ajustes y sus motivos.','operaciones'],
  ['costos','Costos y precios','Registrar costos de productos y revisiones de precios.','economia'],
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
 const DICTIONARY=Object.fromEntries(MODULES.map(([id,title,detail,group])=>[id,{title,detail,group}]));
 const fmtMoney=v=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:2}).format(Number(v||0));
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const attr=esc;
 const today=()=>new Date().toLocaleDateString('en-CA');
 let enabled=false,checking=false,verified=false,busy=false,displayed=false,active='tablero',records=[],audit=[],error='',editing='',api=null,loading=false,ownerUid='';
 function eligible(context,host){
  return !!context && context.tenant_id===TENANT && context.role==='dueno'
    && host?.role?.()==='dueno' && host?.S?.me?.tenant_id===TENANT;
 }
 function reset(){enabled=false;verified=false;checking=false;api=null;ownerUid='';close();}
 async function refresh(context,host){
  if(!eligible(context,host)){reset();return;}
  api=host;
  if(verified||checking)return;
  checking=true;
  try{
   const {data,error:err}=await window.GestLokSupabase.from('gestlok_pilot_access')
    .select('enabled,owner_uid').eq('tenant_id',TENANT).maybeSingle();
   if(err)throw err;
   const identity=await window.GestLokSupabase.auth.getUser();
   enabled=!!data?.enabled&&!!identity.data?.user&&data.owner_uid===identity.data.user.id;
   ownerUid=enabled?identity.data.user.id:'';
  }catch{enabled=false;}
  finally{
   checking=false;verified=true;
   if(api?.S?.me?.tenant_id===TENANT)api.render?.();
  }
 }
 function homeTile(context,host){
  if(!enabled||!eligible(context,host))return '';
  return '<div class="gl-pilot-entry"><div><small>PILOTO PRIVADO · SOLO TU EMPRESA</small><h2>Centro de control total</h2>'+
   '<p>20 áreas para evaluar tu negocio. Los nuevos registros son privados y no modifican las planillas existentes.</p></div>'+
   '<button type="button" data-pilot-open>Explorar los 20 módulos <span aria-hidden="true">→</span></button></div>';
 }
 async function assertAccess(){
  if(!enabled||!api?.S?.me||api.S.me.tenant_id!==TENANT||api.role()!=='dueno')throw Error('Sin autorización para el piloto.');
  const {data,error:err}=await window.GestLokSupabase.auth.getUser();
  if(err||!data.user||!ownerUid||data.user.id!==ownerUid)throw Error('Iniciá sesión con la cuenta dueña autorizada.');
  return true;
 }
 async function load(){
  await assertAccess();
  const db=window.GestLokSupabase;
  const [r,a]=await Promise.all([
   db.from('gestlok_pilot_records').select('id,module,title,note,amount,direction,status,occurred_on,due_on,responsible,created_at')
     .eq('tenant_id',TENANT).order('created_at',{ascending:false}).limit(300),
   db.from('gestlok_pilot_audit').select('id,module,action,at').eq('tenant_id',TENANT).order('at',{ascending:false}).limit(70)
  ]);
  if(r.error)throw r.error;
  if(a.error)throw a.error;
  records=r.data||[];audit=a.data||[];
 }
 function close(){
  const p=document.querySelector('#gl-pilot-panel');p?.remove();document.body.classList.remove('gl-pilot-open');
  displayed=false;active='tablero';error='';editing='';
 }
 function sectionTitle(key){return DICTIONARY[key]?.title||'Gestión';}
 function card(key){const v=DICTIONARY[key],total=records.filter(x=>x.module===key).length;
  return '<button class="gl-pilot-module" type="button" data-pilot-tab="'+attr(key)+'">'+
    '<span class="gl-pilot-module-name">'+esc(v.title)+'</span><span>'+esc(v.detail)+'</span>'+
    (key==='tablero'||key==='auditoria'?'<small>Consulta</small>':'<small>'+total+' registros · Carga manual</small>')+'</button>';
 }
 function sidebar(){
  const groups=[['general','Resumen'],['economia','Economía'],['operaciones','Operaciones'],['equipo','Personas'],['sistema','Herramientas']];
  return '<nav class="gl-pilot-nav" aria-label="Módulos del piloto">'+groups.map(([group,label])=>
    '<div><span class="gl-pilot-group">'+label+'</span>'+
    MODULES.filter(([, , ,g])=>g===group).map(([id,title])=>
      '<button type="button" data-pilot-tab="'+id+'" class="'+(active===id?'is-active':'')+'">'+esc(title)+'</button>').join('')+'</div>').join('')+'</nav>';
 }
 function dashboard(){
  const by=m=>records.filter(r=>r.module===m);
  const fin=by('finanzas');
  const entradas=fin.filter(x=>x.direction==='ingreso').reduce((v,x)=>v+Number(x.amount||0),0);
  const salidas=fin.filter(x=>x.direction==='egreso').reduce((v,x)=>v+Number(x.amount||0),0);
  const task=by('tareas').filter(x=>x.status!=='completado'&&x.status!=='cancelado');
  const alerts=by('alertas').filter(x=>x.status!=='completado'&&x.status!=='cancelado');
  return '<div class="gl-pilot-hero"><small>INFORMACIÓN DEL PILOTO</small><h2>Tu negocio, en una sola vista</h2>'+
   '<p>Los valores se calculan únicamente con registros cargados en este centro. No son ventas o movimientos contables sincronizados.</p></div>'+
   '<div class="gl-pilot-kpis">'+[
     ['Ingresos registrados',fmtMoney(entradas)],
     ['Egresos registrados',fmtMoney(salidas)],
     ['Saldo de registros',fmtMoney(entradas-salidas)],
     ['Tareas pendientes',task.length],
     ['Alertas abiertas',alerts.length],
     ['Registros de prueba',records.length]
   ].map(([a,b])=>'<div><span>'+esc(a)+'</span><strong>'+esc(b)+'</strong></div>').join('')+'</div>'+
   '<h3>Tus áreas de gestión</h3><div class="gl-pilot-grid">'+MODULES.filter(([k])=>k!=='tablero').map(([k])=>card(k)).join('')+'</div>';
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
  if(active==='auditoria')return '<h2>Auditoría de este piloto</h2><p>Registro automático de altas, cambios y eliminaciones realizados acá. No reemplaza la auditoría completa de GESTLOK.</p>'+activity();
  const m=DICTIONARY[active];
  return '<header class="gl-pilot-section-head"><div><h2>'+esc(m.title)+'</h2><p>'+esc(m.detail)+'</p>'+
   '<small>Registro manual privado · Sin movimientos automáticos en sistemas externos.</small></div>'+
   '<button type="button" data-pilot-new>Nuevo registro</button></header>'+
   (editing?'': '<div class="gl-pilot-form-slot" hidden></div>')+
   '<div class="gl-pilot-data">'+tableRows(active)+'</div>'+
   (editing?form(active):'<div class="gl-pilot-form-slot"></div>');
 }
 function render(){
  if(!displayed)return;
  let root=document.querySelector('#gl-pilot-panel');
  if(!root){root=document.createElement('div');root.id='gl-pilot-panel';document.body.append(root);}
  root.innerHTML='<div class="gl-pilot-shell" role="dialog" aria-modal="true" aria-labelledby="gl-pilot-title">'+
    '<header class="gl-pilot-top"><div><small>GESTLOK · PRUEBA PRIVADA</small><h1 id="gl-pilot-title">Centro de control total</h1>'+
    '<span>Empresa Perfumes · 20 áreas de gestión</span></div><button type="button" data-pilot-close aria-label="Cerrar centro piloto">Cerrar ×</button></header>'+
    '<div class="gl-pilot-main">'+sidebar()+'<main class="gl-pilot-content" id="gl-pilot-content">'+
    (error?'<p class="gl-pilot-error" role="alert">'+esc(error)+'</p>':'')+
    (loading?'<p role="status">Consultando registros privados…</p>':current())+'</main></div>'+
    '<footer class="gl-pilot-footer">Piloto exclusivo. Tus registros no modifican Mi Gusto ni están conectados con ventas, pagos o respaldos reales.</footer></div>';
  document.body.classList.add('gl-pilot-open');
 }
 async function open(){
  if(displayed||!enabled)return;
  displayed=true;active='tablero';loading=true;render();
  try{await load();error='';}catch(e){error=e.message||'No se pudo cargar';}
  finally{loading=false;render();}
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
  if(e.target.closest('[data-pilot-open]')){e.preventDefault();open();return;}
  if(!displayed)return;
  if(e.target.closest('[data-pilot-close]')){close();document.body.classList.remove('gl-pilot-open');return;}
  const t=e.target.closest('[data-pilot-tab]');
  if(t){active=t.dataset.pilotTab;editing='';error='';render();return;}
  if(e.target.closest('[data-pilot-new]')){
   editing='';render();
   document.querySelector('#gl-pilot-content .gl-pilot-form-slot')?.insertAdjacentHTML('afterbegin',form(active));
   document.querySelector('#gl-pilot-form input[name="title"]')?.focus();
  }
  const edit=e.target.closest('[data-pilot-edit]');
  if(edit){editing=edit.dataset.pilotEdit;error='';render();document.querySelector('#gl-pilot-form')?.scrollIntoView({behavior:'smooth',block:'nearest'});}
  const del=e.target.closest('[data-pilot-delete]');if(del)remove(del.dataset.pilotDelete);
  if(e.target.closest('[data-pilot-cancel]')){editing='';render();}
 });
 document.addEventListener('submit',e=>{
  if(e.target.id!=='gl-pilot-form')return;e.preventDefault();void save(e.target);
 });
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&displayed){close();document.body.classList.remove('gl-pilot-open');}});
 window.GestLokPilot=Object.freeze({refresh,homeTile,open,reset,modules:MODULES.map(([id])=>id)});
})();

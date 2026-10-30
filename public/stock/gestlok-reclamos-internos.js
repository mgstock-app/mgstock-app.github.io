/* GESTLOK · Reclamos Internos, multiempresa y multilocal.
   MG-000..MG-999: el código, fecha, gerente y estado son autoridad de Supabase.
   Reseñas de Mi Gusto y GESTLOK mantienen tablas y cupones independientes. */
(()=>{
 'use strict';
 let api=null,rows=[],term='',error='',notice='',modal=null,busy=false,loading=false,serial=0,scope='';
 const E=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
 const normalizePhone=x=>String(x||'').replace(/[^0-9]/g,'');
 const percent=x=>new Intl.NumberFormat('es-AR',{maximumFractionDigits:2}).format(Number(x)||0)+'%';
 const arDate=x=>x?new Intl.DateTimeFormat('es-AR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Argentina/Buenos_Aires'}).format(new Date(x)):'—';
 const local=()=>api?.S?.local||'';
 const canSee=()=>{
  if(!api||!api.S?.me?.tenant_id||!local())return false;
  const rol=api.miRol?.();
  return ['creadora','dueno'].includes(rol)||(['gerente','editor','lectura'].includes(rol)&&api.misLocales?.().includes(local()));
 };
 const connected=()=>!api?.S?.offline&&navigator.onLine!==false;
 const canEdit=()=>canSee()&&!api.S.ro&&['creadora','dueno','gerente','editor'].includes(api.miRol?.())&&connected()&&!busy;
 const apiCall=async(name,args={})=>{
  if(!canSee()||!window.GestLokSupabase)throw Error('No tenés acceso a Reclamos Internos.');
  if(name!=='gestlok_reclamos_list'&&!connected())throw Error('Para emitir o utilizar cupones necesitás conexión.');
  const result=await window.GestLokSupabase.rpc(name,{p_local:local(),...args});
  if(result.error)throw Error(result.error.message||'No se pudo guardar. Revisá conexión y permisos.');
  return result.data;
 };
 const filtered=()=>rows.filter(r=>{
  const q=term.toLocaleLowerCase('es-AR'), digits=normalizePhone(term);
  return !q||[r.customer_name,r.phone,r.code,r.manager_name].some(v=>String(v||'').toLocaleLowerCase('es-AR').includes(q))||
   (digits.length>=3&&r.phone.includes(digits));
 });
 async function refresh(){
  if(!canSee()||busy||modal||loading)return;
  const id=serial,loc=local(),tenant=api.S.me.tenant_id;
  if(!connected())return;
  loading=true;
  try{
   const data=await apiCall('gestlok_reclamos_list');
   if(id!==serial||loc!==local()||tenant!==api.S.me?.tenant_id)return;
   rows=Array.isArray(data)?data:[];error='';
  }catch(e){if(id===serial)error=e.message;}
  finally{
   loading=false;
   if(id===serial&&api?.S?.view==='reclamos-internos'){
    const box=document.querySelector('#ri-list');
    if(document.activeElement?.id==='ri-search'&&box)box.innerHTML=table();else api.render();
   }
  }
 }
 const tag=r=>'<span class="ri-state '+(r.status==='used'?'used':'pending')+'">'+(r.status==='used'?'Usado':'Pendiente')+'</span>';
 const actions=r=>'<button type="button" data-ri="open" data-id="'+E(r.id)+'">'+(r.status==='used'?'Ver cupón':'Ver / Editar')+'</button>';
 const table=()=>{
  const data=filtered();
  const cols='<thead><tr><th>Cliente</th><th>Teléfono</th><th>Cupón</th><th>Descuento</th><th>Fecha y gerente</th><th>Estado</th><th>Acción</th></tr></thead>';
  const trs=data.map(r=>'<tr><td><strong>'+E(r.customer_name)+'</strong></td><td>'+E(r.phone)+'</td><td><strong>'+E(r.code)+'</strong></td>'+
   '<td>'+E(percent(r.discount_percent))+'</td><td>'+E(arDate(r.created_at))+'<small>'+E(r.manager_name)+'</small></td><td>'+tag(r)+'</td><td>'+actions(r)+'</td></tr>').join('');
  const cards=data.map(r=>'<article class="ri-item"><div class="ri-item-top"><div><strong>'+E(r.customer_name)+'</strong><small>'+E(r.phone)+'</small></div>'+tag(r)+'</div>'+
   '<div class="ri-coupon"><b>'+E(r.code)+'</b><strong>'+E(percent(r.discount_percent))+'</strong></div><small>'+E(arDate(r.created_at))+' · '+E(r.manager_name)+'</small>'+actions(r)+'</article>').join('');
  return data.length?'<div class="ri-tablewrap"><table>'+cols+'<tbody>'+trs+'</tbody></table></div><div class="ri-cards">'+cards+'</div>':'<p class="ri-empty">No hay reclamos para esta búsqueda.</p>';
 };
 function dialog(){
  const original=modal?.id?rows.find(r=>r.id===modal.id):null;
  const editing=!original||modal.editing;
  const isUsed=original?.status==='used';
  const value=(field)=>modal?.draft?.[field]??original?.[field]??'';
  const read=editing?'':'readonly';
  return '<div class="ri-overlay"><section class="ri-dialog" role="dialog" aria-modal="true" aria-labelledby="ri-dialog-title">'+
    '<header><div><small>'+E(original?.code||'RECLAMO INTERNO')+'</small><h3 id="ri-dialog-title">'+(isUsed?'Cupón utilizado':!original?'Nuevo cupón':editing?'Editar reclamo':'Detalle del cupón')+'</h3></div>'+
    '<button type="button" data-ri="close" aria-label="Cerrar" '+(busy?'disabled':'')+'>×</button></header>'+
    '<form id="ri-form">'+
    '<div class="ri-fields"><label>Nombre del cliente<input name="name" required maxlength="100" value="'+E(value('customer_name'))+'" '+read+'></label>'+
    '<label>Teléfono del cliente<input type="tel" name="phone" required maxlength="25" value="'+E(value('phone'))+'" '+read+'></label>'+
    '<label>Descuento (%)<input type="text" inputmode="decimal" name="discount" required value="'+E(value('discount_percent'))+'" placeholder="Ej. 15" '+read+'></label>'+
    '<label>Gerente responsable <span class="ri-required">obligatorio</span><input name="manager" required maxlength="100" value="'+E(value('manager_name'))+'" placeholder="Nombre de quien autoriza" '+read+'></label></div>'+
    '<label>Observación <small>(opcional · motivo del descuento)</small><textarea name="observation" maxlength="500" rows="3" '+read+' placeholder="Ej. Reclamo por demora en el pedido">'+E(value('observation'))+'</textarea></label>'+
    '<div class="ri-result"><span>Código único</span><b>'+E(original?.code||'MG-### · al guardar')+'</b>'+
    '<span>Fecha de creación: '+E(original?arDate(original.created_at):'se registra automáticamente en Argentina')+'</span>'+
    (original?.used_at?'<small>Utilizado: '+E(arDate(original.used_at))+'</small>':'')+'</div>'+
    (original?tag(original):'')+
    (modal?.error?'<p role="alert" class="ri-error">'+E(modal.error)+'</p>':'')+
    (modal?.success?'<p role="status" class="ri-success">✓ '+E(modal.success)+'</p>':'')+
    (editing?'<div class="ri-buttons">'+(original?'<button type="button" data-ri="cancel-edit" '+(busy?'disabled':'')+'>Cancelar</button>':'')+
       '<button type="submit" class="ri-primary" '+(canEdit()?'':'disabled')+'>'+(busy?'Guardando…':original?'Guardar cambios':'Generar cupón')+'</button></div>':
      '<div class="ri-buttons">'+(!isUsed?'<button type="button" data-ri="edit" '+(canEdit()?'':'disabled')+'>Editar descuento y datos</button>':'')+'</div>'+
      (!isUsed?'<div class="ri-use"><label><input type="checkbox" name="confirm-used"> Confirmo que el cliente utilizó este descuento</label>'+
       '<button type="button" data-ri="use" class="ri-primary" '+(canEdit()?'':'disabled')+'>Marcar como usado</button></div>':'')
    )+'</form></section></div>';
 }
 function view(){
  if(!canSee()){rows=[];modal=null;scope='';return '';}
  const activeScope=String(api.S.me.tenant_id)+'/'+local();
  if(scope!==activeScope){
   serial++;rows=[];term='';error='';notice='';modal=null;busy=false;loading=false;scope=activeScope;
  }
  const pending=rows.filter(r=>r.status==='pending').length,used=rows.length-pending;
  return '<section class="ri-page" aria-label="Reclamos Internos">'+
   '<header class="ri-head"><div><small>GESTLOK · GESTIÓN INTERNA</small><h2>Reclamos Internos</h2>'+
   '<p>Registrá descuentos por reclamos del cliente. Los cupones no vencen y solo se usan una vez.</p></div></header>'+
   '<button type="button" class="ri-primary ri-add" data-ri="new" '+(canEdit()?'':'disabled')+'>＋ Nuevo reclamo</button>'+
   '<div class="ri-stats"><article><small>Total</small><strong>'+rows.length+'</strong></article>'+
   '<article><small>Pendientes</small><strong>'+pending+'</strong></article>'+
   '<article><small>Usados</small><strong>'+used+'</strong></article></div>'+
   '<label class="ri-search">Buscar cliente, teléfono, gerente o código<input id="ri-search" type="search" value="'+E(term)+'" placeholder="Buscar reclamos…"></label>'+
   (!connected()?'<p role="status" class="ri-notice">Sin conexión: podés consultar la última lista cargada. Para guardar o usar cupones necesitás internet.</p>':'')+
   (notice?'<p role="status" class="ri-success">✓ '+E(notice)+'</p>':'')+
   (error?'<p role="alert" class="ri-error">'+E(error)+'</p><button type="button" data-ri="reload">Reintentar</button>':'')+
   (loading&&!rows.length?'<p role="status">Cargando reclamos…</p>':'')+
   '<div id="ri-list">'+table()+'</div>'+
   '<p class="ri-footnote">Código MG de tres números, exclusivo e irrepetible. Cada local conserva su propio historial. Los usados no pueden reutilizarse.</p>'+
   (modal?dialog():'')+'</section>';
 }
 async function save(form){
  if(!canEdit()||!modal)return;
  const fields=new FormData(form),name=String(fields.get('name')||'').trim(),
   phone=normalizePhone(fields.get('phone')),manager=String(fields.get('manager')||'').trim(),
   observation=String(fields.get('observation')||'').trim(),
   pctString=String(fields.get('discount')||'').trim().replace(',','.'),
   pct=Number(pctString);
  modal.draft={customer_name:name,phone,manager_name:manager,observation,discount_percent:pctString};
  if(name.length<2||name.length>100||!(/^\d{7,18}$/.test(phone))||manager.length<2||manager.length>100||
   !/^\d+(?:\.\d{1,2})?$/.test(pctString)||!Number.isFinite(pct)||pct<=0||pct>100||observation.length>500){
    modal.error='Completá cliente, teléfono, descuento entre 0,01% y 100%, y nombre del gerente.';api.render();return;
  }
  busy=true;modal.error='';api.render();
  try{
   const nameRpc=modal.id?'gestlok_reclamos_update':'gestlok_reclamos_create';
   const data=await apiCall(nameRpc,{...(modal.id?{p_id:modal.id}:{}),p_name:name,p_phone:phone,p_discount:pct,p_manager:manager,p_observation:observation});
   rows=[data,...rows.filter(r=>r.id!==data.id)];
   modal={id:data.id,success:modal.id?'Reclamo actualizado correctamente.':'¡Cupón generado correctamente!'};
   notice='Reclamo guardado correctamente.';
  }catch(e){modal.error=e.message;}finally{busy=false;api.render();}
 }
 async function use(){
  if(!canEdit()||!modal?.id)return;
  if(!document.querySelector('#ri-form [name="confirm-used"]')?.checked){
   modal.error='Confirmá que el descuento fue utilizado antes de guardar.';api.render();return;
  }
  busy=true;modal.error='';api.render();
  try{
   const data=await apiCall('gestlok_reclamos_redeem',{p_id:modal.id});
   rows=[data,...rows.filter(r=>r.id!==data.id)];
   modal={id:data.id,success:'Cupón marcado como usado. No se puede volver a usar.'};notice='Estado actualizado: Usado.';
  }catch(e){modal.error=e.message;}finally{busy=false;api.render();}
 }
 function attach(h){
  api=h;
  document.addEventListener('click',e=>{
   const button=e.target.closest?.('[data-ri]');
   if(!button||!canSee()||busy)return;
   const a=button.dataset.ri;
   if(a==='new'){modal={};notice='';}
   else if(a==='open'){modal={id:button.dataset.id};notice='';}
   else if(a==='close'){modal=null;api.render();return;}
   else if(a==='edit'&&modal?.id){modal={id:modal.id,editing:true};}
   else if(a==='cancel-edit'&&modal?.id){modal={id:modal.id};}
   else if(a==='use'){void use();return;}
   else if(a==='reload'){void refresh();return;}
   api.render();
   if(a==='new'||a==='edit')document.querySelector('#ri-form input')?.focus();
  });
  document.addEventListener('submit',e=>{if(e.target?.id==='ri-form'){e.preventDefault();void save(e.target);}});
  document.addEventListener('input',e=>{
   if(e.target?.id!=='ri-search'||!canSee())return;
   term=e.target.value;const box=document.querySelector('#ri-list');
   if(box)box.innerHTML=table();else api.render();
  });
  document.addEventListener('keydown',e=>{
   if(e.key==='Escape'&&modal&&!busy){modal=null;api.render();}
  });
 }
 function subscribe(loc,push){
  if(!canSee()||local()!==loc)return;
  void refresh();
  const interval=setInterval(()=>{
   if(api?.S?.view==='reclamos-internos'&&!document.hidden)void refresh();
  },20000);
  const focus=()=>{if(api?.S?.view==='reclamos-internos')void refresh();};
  window.addEventListener('focus',focus);
  push(()=>{clearInterval(interval);window.removeEventListener('focus',focus);});
 }
 function reset(){serial++;rows=[];term='';error='';notice='';modal=null;busy=false;loading=false;scope='';}
 window.GestLokReclamosInternos={attach,view,subscribe,reset,permitido:canSee,
  _test:{normalizePhone,percent,arDate}};
})();

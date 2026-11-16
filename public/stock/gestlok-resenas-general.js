/* Reseñas con cupón · versión GENERAL para empresas nuevas.
 * No reemplaza ni comparte nada con las Reseñas de Mi Gusto (mi-gusto-resenas.js): otro archivo, otras funciones
 * del servidor (gestlok_resenas_gen_*) y otras tablas. Solo aparece si el servidor la habilitó para la empresa de
 * la sesión; los permisos, los códigos, el único uso y los vencimientos los decide siempre el servidor.
 */
(()=>{
 'use strict';
 if(window.GestLokResenasGeneral)return;
 const MENSAJE='Hola {nombre}: gracias por tu visita a {local}. Tenés {descuento}% de descuento con el código {codigo}, válido hasta el {vence}.';
 const ex=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const $=s=>document.querySelector(s);
 const db=()=>window.GestLokSupabase;
 const phone=v=>{
  let p=String(v||'').replace(/\D/g,'');
  if(p.startsWith('0054'))p=p.slice(4);else if(p.startsWith('54')&&p.length>11)p=p.slice(2);
  if(p.length===11&&p.startsWith('9'))p=p.slice(1);
  if(p.startsWith('0'))p=p.slice(1);
  return p;
 };
 const day=v=>{const [y,m,d]=String(v||'').slice(0,10).split('-');return y&&m&&d?d+'/'+m+'/'+y:'';};
 const when=v=>v?new Date(v).toLocaleString('es-AR',{timeZone:'America/Argentina/Buenos_Aires',dateStyle:'short',timeStyle:'short'}):'';
 const LABEL={pending:'Pendiente',used:'Usado',expired:'Vencido'};
 const message=(tpl,r,localName)=>String(tpl||MENSAJE).replace(/\{(nombre|local|descuento|codigo|vence)\}/g,(_,k)=>(
  {nombre:r.customer_name,local:localName,descuento:r.discount,codigo:r.code,vence:day(r.valid_until)}[k]));
 const filter=(items,term)=>{
  const q=String(term||'').trim().toLocaleLowerCase('es-AR'),digits=q.replace(/\D/g,'');
  return items.filter(r=>!q||r.customer_name.toLocaleLowerCase('es-AR').includes(q)||r.code.toLowerCase().includes(q)||(digits.length>=3&&r.phone.includes(digits)));
 };
 let host=null,scope=null,signature='',checking=false,open=false,local='',rows=[],settings=null,loading=false,busy=false,
  error='',notice='',query='',modal=null,last=null,nonce=0;

 const locals=()=>Array.isArray(scope?.locals)?scope.locals:[];
 const allowed=()=>!!scope?.enabled&&!!host&&scope.tenant_id===host.S?.me?.tenant_id&&locals().length>0;
 const localName=()=>locals().find(l=>l.id===local)?.nombre||local;
 const online=()=>!host?.S?.offline&&navigator.onLine!==false;
 function reset(){scope=null;signature='';close();}
 async function refresh(api){
  if(!api?.S?.me||!db()){if(scope){reset();}return;}
  const sig=JSON.stringify([api.S.me.tenant_id,api.S.me.email,api.role?.()]);
  if(checking||(sig===signature&&host===api))return;
  checking=true;host=api;signature=sig;
  const before=allowed();
  try{
   const {data,error:e}=await db().rpc('gestlok_resenas_gen_scope');
   scope=!e&&data?.enabled&&data.tenant_id===api.S.me.tenant_id?data:null;
  }catch{scope=null;signature='';}
  finally{checking=false;}
  if(!allowed())close();
  if(before!==allowed())host?.render?.();
 }
 function homeTile(){
  if(!allowed())return '';
  return '<section class="gl-pilot-entry gl-rg-entry" aria-label="Reseñas con cupón"><div><small>CLIENTES</small><h2>Reseñas con cupón</h2>'+
   '<p>Registrá al cliente que deja su reseña, entregale un cupón de descuento y marcá cuando lo usa.</p></div>'+
   '<button type="button" data-rg-open>Abrir</button></section>';
 }
 const fail=e=>{
  const t=String(e?.message||'');
  if(/pendiente en este local/i.test(t))return 'Este teléfono ya tiene un cupón pendiente en este local.';
  if(/inválido/i.test(t))return 'Revisá el nombre y el teléfono (10 dígitos: código de área + número, sin 0 ni 15).';
  if(/utilizado|vencido|otro local|inexistente|pendientes de este local/i.test(t))return 'El cupón ya se usó, venció o es de otro local.';
  if(/Solo el dueño/i.test(t))return 'Solo el dueño cambia los ajustes.';
  if(/Revisá el descuento/i.test(t))return t;
  if(/denegado|42501/i.test(t+String(e?.code||'')))return 'No tenés acceso a las reseñas de este local.';
  return 'No se pudo completar. Revisá la conexión y probá de nuevo.';
 };
 async function call(name,params){
  if(!allowed()||!locals().some(l=>l.id===local))throw Error('Acceso denegado');
  if(name!=='gestlok_resenas_gen_list'&&!online())throw Object.assign(Error('offline'),{offline:true});
  const {data,error:e}=await db().rpc(name,{p_local:local,...params});
  if(e)throw e;
  return data;
 }
 async function load(){
  const n=++nonce;loading=true;error='';render();
  try{
   const data=await call('gestlok_resenas_gen_list',{});
   if(n!==nonce)return;
   rows=data?.coupons||[];settings=data?.settings||{discount:10,valid_days:30,message:''};
  }catch(e){if(n===nonce){rows=[];error=fail(e);}}
  finally{if(n===nonce){loading=false;render();}}
 }
 function start(){
  if(!allowed())return;
  if(!locals().some(l=>l.id===local))local=locals().some(l=>l.id===host.S.local)?host.S.local:locals()[0].id;
  open=true;query='';notice='';error='';modal=null;last=null;render();void load();
 }
 function close(){
  open=false;nonce++;rows=[];modal=null;last=null;
  $('#gl-rg-panel')?.remove();document.body.classList.remove('gl-rg-open');
 }
 async function act(fn,done){
  if(busy)return;
  busy=true;error='';notice='';render();
  try{await fn();if(done)notice=done;}
  catch(e){error=e?.offline?'Sin conexión: para emitir, corregir o marcar un cupón como usado hace falta internet.':fail(e);}
  finally{busy=false;render();}
 }
 const waLink=r=>'https://wa.me/54'+encodeURIComponent(r.phone)+'?text='+encodeURIComponent(message(settings?.message,r,localName()));
 function row(r){
  return '<tr data-rg-row><td>'+ex(r.customer_name)+'</td><td>'+ex(r.phone)+'</td><td><b>'+ex(r.code)+'</b><small>'+ex(r.discount)+'% OFF</small></td>'+
   '<td><span class="gl-rg-badge '+ex(r.status)+'">'+ex(LABEL[r.status]||'')+'</span><small>'+(r.status==='used'?'Usado '+ex(when(r.used_at)):'Vence '+ex(day(r.valid_until)))+'</small></td>'+
   '<td class="gl-rg-actions">'+(r.status==='pending'?'<button type="button" data-rg-redeem="'+ex(r.id)+'">Marcar usado</button>'+
     '<a target="_blank" rel="noopener" href="'+ex(waLink(r))+'">WhatsApp</a><button type="button" class="gl-rg-link" data-rg-edit="'+ex(r.id)+'">Corregir</button>':'')+'</td></tr>';
 }
 function dialog(){
  if(modal?.type==='edit'){
   const r=rows.find(x=>x.id===modal.id);if(!r)return '';
   return '<div class="gl-rg-modal" role="dialog" aria-modal="true" aria-label="Corregir cupón"><form id="gl-rg-edit"><h3>Corregir datos · '+ex(r.code)+'</h3>'+
    '<label>Nombre<input name="name" required minlength="2" maxlength="100" value="'+ex(r.customer_name)+'"></label>'+
    '<label>Teléfono<input name="phone" required inputmode="tel" maxlength="20" value="'+ex(r.phone)+'"></label>'+
    '<p>El código y el vencimiento no cambian.</p><div><button type="button" data-rg-cancel>Cancelar</button><button>Guardar</button></div></form></div>';
  }
  if(modal?.type==='settings'){
   const s=settings||{};
   return '<div class="gl-rg-modal" role="dialog" aria-modal="true" aria-label="Ajustes de reseñas"><form id="gl-rg-settings"><h3>Ajustes · '+ex(localName())+'</h3>'+
    '<label>Descuento del cupón (%)<input name="discount" required type="number" inputmode="numeric" min="1" max="100" step="1" value="'+ex(s.discount??10)+'"></label>'+
    '<label>Días de validez<input name="valid_days" required type="number" inputmode="numeric" min="1" max="365" step="1" value="'+ex(s.valid_days??30)+'"></label>'+
    '<label>Mensaje de WhatsApp<textarea name="message" maxlength="600" rows="5" placeholder="'+ex(MENSAJE)+'">'+ex(s.message||'')+'</textarea></label>'+
    '<p>Podés usar {nombre}, {local}, {descuento}, {codigo} y {vence}. Vacío: se usa el mensaje sugerido. Los cupones ya entregados conservan su descuento y su vencimiento.</p>'+
    '<div><button type="button" data-rg-cancel>Cancelar</button><button>Guardar ajustes</button></div></form></div>';
  }
  return '';
 }
 function render(){
  if(!open||!allowed()){close();return;}
  const sel=filter(rows,query),count={pending:0,used:0,expired:0};
  rows.forEach(r=>{if(r.status in count)count[r.status]++;});
  const s=settings||{discount:10,valid_days:30};
  const typing=document.activeElement?.id==='gl-rg-search';
  const html='<div class="gl-rg-shell"><header class="gl-rg-top"><div><small>RESEÑAS CON CUPÓN</small><h1>'+ex(localName())+'</h1>'+
    '<span>'+ex(s.discount)+'% de descuento · válido '+ex(s.valid_days)+' días</span></div><div>'+
    (locals().length>1?'<select data-rg-local aria-label="Local">'+locals().map(l=>'<option value="'+ex(l.id)+'"'+(l.id===local?' selected':'')+'>'+ex(l.nombre)+'</option>').join('')+'</select>':'')+
    (scope.can_config?'<button type="button" data-rg-settings>Ajustes</button>':'')+'<button type="button" data-rg-close>Cerrar ×</button></div></header>'+
   '<main class="gl-rg-main">'+
    (error?'<p class="gl-rg-error" role="alert">'+ex(error)+'</p>':'')+(notice?'<p class="gl-rg-ok" role="status">'+ex(notice)+'</p>':'')+
    (last?'<section class="gl-rg-last" aria-label="Cupón recién entregado"><div><small>Cupón de '+ex(last.customer_name)+'</small><strong>'+ex(last.code)+'</strong><span>'+ex(last.discount)+'% OFF · vence el '+ex(day(last.valid_until))+'</span></div>'+
      '<a target="_blank" rel="noopener" href="'+ex(waLink(last))+'">Enviar por WhatsApp</a></section>':'')+
    '<form id="gl-rg-new" class="gl-rg-new"><h2>Nuevo cupón</h2><label>Nombre del cliente<input name="name" required minlength="2" maxlength="100" autocomplete="off"></label>'+
     '<label>Teléfono (código de área + número)<input name="phone" required inputmode="tel" maxlength="20" autocomplete="off" placeholder="11 2345 6789"></label>'+
     '<button'+(busy?' disabled':'')+'>Entregar cupón</button></form>'+
    '<section class="gl-rg-stats" aria-label="Resumen"><div><small>Pendientes</small><strong>'+count.pending+'</strong></div><div><small>Usados</small><strong>'+count.used+'</strong></div><div><small>Vencidos</small><strong>'+count.expired+'</strong></div></section>'+
    '<label class="gl-rg-search">Buscar por nombre, teléfono o código<input id="gl-rg-search" type="search" value="'+ex(query)+'" autocomplete="off"></label>'+
    '<div class="gl-rg-table" id="gl-rg-history">'+table(sel)+'</div></main>'+dialog()+'</div>';
  let panel=$('#gl-rg-panel');
  if(!panel){panel=document.createElement('div');panel.id='gl-rg-panel';document.body.appendChild(panel);document.body.classList.add('gl-rg-open');}
  // Mientras se escribe en el buscador solo se actualiza la tabla, para no perder el foco.
  if(typing&&!modal&&$('#gl-rg-history'))$('#gl-rg-history').innerHTML=table(sel);else panel.innerHTML=html;
 }
 function table(sel){
  if(loading)return '<p class="gl-rg-empty">Cargando cupones…</p>';
  if(!rows.length)return '<p class="gl-rg-empty">Todavía no hay cupones en este local. Cargá el primero arriba.</p>';
  if(!sel.length)return '<p class="gl-rg-empty">Ningún cupón coincide con la búsqueda.</p>';
  return '<table><thead><tr><th>Cliente</th><th>Teléfono</th><th>Cupón</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>'+sel.map(row).join('')+'</tbody></table>';
 }
 const put=r=>{rows=[r,...rows.filter(x=>x.id!==r.id)].sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));};

 document.addEventListener('click',e=>{
  const t=e.target;
  if(t.closest?.('[data-rg-open]')){e.preventDefault();start();return;}
  if(!open)return;
  if(t.closest('[data-rg-close]')){close();return;}
  if(t.closest('[data-rg-cancel]')){modal=null;render();return;}
  if(t.closest('[data-rg-settings]')&&scope?.can_config){modal={type:'settings'};error='';notice='';render();return;}
  const edit=t.closest('[data-rg-edit]');
  if(edit){modal={type:'edit',id:edit.dataset.rgEdit};error='';notice='';render();return;}
  const redeem=t.closest('[data-rg-redeem]');
  if(redeem){
   const r=rows.find(x=>x.id===redeem.dataset.rgRedeem);
   if(!r||!window.confirm('¿Marcar como usado el cupón '+r.code+' de '+r.customer_name+'? No se puede deshacer.'))return;
   void act(async()=>{put(await call('gestlok_resenas_gen_redeem',{p_id:r.id}));if(last?.id===r.id)last=null;},'Cupón marcado como usado.');
  }
 });
 document.addEventListener('submit',e=>{
  if(!open)return;
  const f=e.target;
  if(f.id==='gl-rg-new'){
   e.preventDefault();
   const name=f.elements.namedItem('name').value.trim(),p=phone(f.elements.namedItem('phone').value);
   if(name.length<2||!/^\d{10}$/.test(p)){error='Revisá el nombre y el teléfono (10 dígitos: código de área + número, sin 0 ni 15).';notice='';render();return;}
   void act(async()=>{const r=await call('gestlok_resenas_gen_create',{p_name:name,p_phone:p});put(r);last=r;},'Cupón entregado.');
  }else if(f.id==='gl-rg-edit'&&modal?.type==='edit'){
   e.preventDefault();
   const id=modal.id,name=f.elements.namedItem('name').value.trim(),p=phone(f.elements.namedItem('phone').value);
   void act(async()=>{const r=await call('gestlok_resenas_gen_update',{p_id:id,p_name:name,p_phone:p});put(r);if(last?.id===r.id)last=r;modal=null;},'Datos corregidos.');
  }else if(f.id==='gl-rg-settings'&&modal?.type==='settings'&&scope?.can_config){
   e.preventDefault();
   const n=k=>Number(f.elements.namedItem(k).value);
   void act(async()=>{settings=await call('gestlok_resenas_gen_settings_save',{p_discount:Math.round(n('discount')),p_valid_days:Math.round(n('valid_days')),p_message:f.elements.namedItem('message').value});modal=null;},'Ajustes guardados. Valen para los cupones nuevos.');
  }
 });
 document.addEventListener('input',e=>{if(open&&e.target.id==='gl-rg-search'){query=e.target.value;render();}});
 document.addEventListener('change',e=>{
  if(!open||!e.target.matches?.('[data-rg-local]'))return;
  if(!locals().some(l=>l.id===e.target.value))return;
  local=e.target.value;rows=[];settings=null;query='';notice='';error='';last=null;modal=null;void load();
 });
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&open){if(modal){modal=null;render();}else close();}});
 window.GestLokResenasGeneral=Object.freeze({refresh,homeTile,start,reset,allowed,_t:{phone,message,filter,MENSAJE}});
})();

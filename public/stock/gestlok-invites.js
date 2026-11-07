/* GESTLOK: invitación permanente por local (nuevos locales).
 * El enlace no asigna roles: Google, legajo y aprobación explícita.
 * Ningún dato del legajo se expone al gerente ni al público.
 */
(()=>{
'use strict';
const KEY='gestlok:local-invite-pending';
const TOKEN_RE=/^[a-f0-9]{64}$/;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const waIcon='<svg aria-hidden="true" viewBox="0 0 24 24" width="21" height="21" fill="currentColor"><path d="M20.52 3.48A11.87 11.87 0 0 0 12.06 0C5.45 0 .08 5.35.07 11.96c0 2.1.55 4.17 1.6 6L0 24l6.21-1.63c1.77.97 3.76 1.48 5.8 1.49h.05c6.61 0 12-5.37 12-11.98a11.87 11.87 0 0 0-3.54-8.4Zm-8.46 18.3a9.84 9.84 0 0 1-5-1.37l-.36-.21-3.69.97.99-3.6-.24-.37a9.89 9.89 0 0 1-1.51-5.24c.01-5.47 4.46-9.92 9.93-9.92a9.89 9.89 0 0 1 7.03 2.91 9.84 9.84 0 0 1 2.89 7.02c0 5.47-4.46 9.92-9.94 9.92Zm5.45-7.44c-.3-.15-1.75-.87-2.02-.97-.27-.1-.46-.15-.66.15-.2.3-.76.97-.93 1.17-.17.2-.34.22-.64.07-.3-.15-1.26-.46-2.39-1.48-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.61.14-.13.3-.34.45-.51.15-.17.2-.3.3-.5.1-.19.05-.37-.03-.51-.07-.15-.66-1.58-.91-2.16-.24-.57-.48-.49-.66-.5h-.56c-.2 0-.52.07-.79.37s-1.04 1.02-1.04 2.49 1.07 2.89 1.22 3.09c.15.2 2.11 3.22 5.11 4.52.71.31 1.27.5 1.71.63.72.23 1.37.2 1.89.12.57-.09 1.75-.72 1.99-1.42.25-.7.25-1.3.17-1.43-.08-.13-.27-.2-.57-.35Z"/></svg>';
const db=()=>window.GestLokSupabase;
const $=s=>document.querySelector(s);
let api=null, currentKey='',eligibility=new Map(),busy=false,panel=null,activeInvite=false,lastPending=false;
function savePending(token){
 try{if(token)sessionStorage.setItem(KEY,token);else sessionStorage.removeItem(KEY);}catch{}
}
function pendingToken(){try{return sessionStorage.getItem(KEY)||'';}catch{return '';}}
function capture(){
 try{
  const url=new URL(location.href);
  const value=url.searchParams.get('invitar');
  if(value!==null){
    if(TOKEN_RE.test(value))savePending(value);
    url.searchParams.delete('invitar');
    history.replaceState(history.state,'',url.pathname+url.search+url.hash);
  }
 }catch{}
}
capture();
function css(){
 if(document.getElementById('gl-invite-css'))return;
 const l=document.createElement('link');l.id='gl-invite-css';l.rel='stylesheet';
 l.href='/stock/gestlok-invites.css?rev=invitar-google-20261107';document.head.appendChild(l);
}
async function rpc(name,args={}){
 if(!db())throw Error('Ingresá con Google para continuar.');
 const {data,error}=await db().rpc('gestlok_newlocal_'+name,args);
 if(error)throw error;
 return data;
}
function context(){
 const me=api?.S?.me,local=api?.S?.local;
 return {tenant:me?.tenant_id||'',local:local||'',role:api?.role?.()||''};
}
function isEligible(){
 const c=context();if(!c.tenant||!c.local||!['creadora','dueno','gerente'].includes(c.role))return false;
 return eligibility.get(c.tenant+'|'+c.local)===true;
}
function homeTile(){
 if(!isEligible())return '';
 return '<section class="gl-invite-home" aria-label="Invitaciones de GESTLOK"><div class="gl-invite-home-intro">'+
   '<span class="gl-invite-whatsapp">'+waIcon+'</span><div><h2>Invitar a GESTLOK</h2>'+
   '<p>Compartí el acceso por WhatsApp. El invitado completa sus datos y queda pendiente de aprobación.</p></div></div>'+
   '<button type="button" data-gl-invite-open class="gl-invite-cta">'+waIcon+'<span>Invitar a GESTLOK</span></button></section>';
}
async function refresh(){
 const c=context();if(!c.tenant||!c.local||!['creadora','dueno','gerente'].includes(c.role))return;
 const key=c.tenant+'|'+c.local;
 if(eligibility.has(key)||currentKey===key)return;
 currentKey=key;
 try{
  const data=await rpc('invite_scope',{p_tenant:c.tenant,p_local:c.local});
  eligibility.set(key,data?.enabled===true);
  if(key===context().tenant+'|'+context().local)api?.render?.();
 }catch{eligibility.delete(key);}
 finally{if(currentKey===key)currentKey='';}
}
function modal(content,title='Invitar a GESTLOK'){
 css();closeModal();
 const d=document.createElement('dialog');d.className='gl-invite-modal';
 d.setAttribute('aria-label',title);
 d.innerHTML='<div class="gl-invite-modal-head"><h2>'+esc(title)+'</h2><button type="button" data-gl-invite-close aria-label="Cerrar">×</button></div>'+
  '<div class="gl-invite-modal-body">'+content+'</div>';
 document.body.append(d);panel=d;
 d.addEventListener('close',()=>{if(panel===d){panel=null;busy=false;}d.remove();},{once:true});
 d.showModal();
 return d;
}
function closeModal(){
 if(panel){const d=panel;panel=null;try{d.close()}catch{}d.remove();}busy=false;
}
function update(content){if(!panel)return;const p=panel.querySelector('.gl-invite-modal-body');if(p)p.innerHTML=content;}
function alert(text,error=false){
 if(!panel)return;
 let p=panel.querySelector('[data-gl-invite-alert]');
 if(!p){p=document.createElement('p');p.dataset.glInviteAlert='';panel.querySelector('.gl-invite-modal-body')?.prepend(p);}
 p.className=error?'gl-invite-error':'gl-invite-success';p.textContent=text;
}
function buildUrl(token){
 const url=new URL('/',location.origin);url.searchParams.set('invitar',token);return url.href;
}
function whatsappUrl(link,company,local){
 const url=new URL('https://wa.me/');
 url.searchParams.set('text','¡Hola! Te invitaron a GESTLOK para '+company+' · '+local+'. Ingresá con Google, completá nombre, apellido y teléfono y enviá tu solicitud. El dueño te habilitará el rol y los locales. Enlace sin vencimiento: '+link);
 return url.href;
}
function localOption(l,selected){return '<label class="gl-invite-choice"><input type="checkbox" name="local" value="'+esc(l.id)+'" '+(selected===l.id?'checked':'')+'> '+esc(l.name)+'</label>';}
function requestCard(r,locals){
 const label=locals.find(x=>x.id===r.local_id)?.name||'Sucursal';
 const pending=r.status==='pending';
 return '<article class="gl-invite-request"><header><div><strong>'+esc(r.first_name)+' '+esc(r.last_name)+'</strong><small>'+esc(label)+' · '+esc(r.email)+'</small></div>'+
 '<span class="gl-invite-status '+(pending?'pending':r.status==='approved'?'approved':'rejected')+'">'+
  (pending?'Pendiente':r.status==='approved'?'Aprobado':'Rechazado')+'</span></header>'+
 '<dl><div><dt>Nombre</dt><dd>'+esc(r.first_name)+'</dd></div><div><dt>Apellido</dt><dd>'+esc(r.last_name)+'</dd></div>'+
 '<div><dt>Teléfono</dt><dd>'+esc(r.phone)+'</dd></div><div><dt>Rol</dt><dd>'+esc(r.assigned_role==='dueno'?'Dueño':r.assigned_role==='gerente'?'Gerente':'Sin asignar')+'</dd></div></dl>'+
 (pending?'<form data-gl-invite-review="'+esc(r.id)+'"><div class="gl-invite-choices"><label>Asignar rol<select name="role" required>'+
 '<option value="gerente" selected>Gerente</option><option value="dueno">Dueño</option></select></label></div>'+
 '<fieldset><legend>Locales permitidos para Gerente</legend>'+locals.map(l=>localOption(l,r.local_id)).join('')+'</fieldset>'+
 '<div class="gl-invite-review-actions"><button type="submit" class="primary" value="approved">Aprobar y dar acceso</button>'+
 '<button type="submit" value="rejected" formnovalidate>Rechazar</button></div></form>':
 '<p class="gl-invite-approved-note">'+(r.status==='approved'?'Legajo visible para responsables autorizados.':'Solicitud archivada.')+'</p>')+'</article>';
}
async function renderRequests(){
 const c=context();if(!panel||!c.tenant)return;
 const holder=panel.querySelector('[data-gl-invite-request-list]');if(!holder)return;
 try{
  const data=await rpc('requests',{p_tenant:c.tenant});
  if(!panel||!holder.isConnected)return;
  const list=Array.isArray(data?.requests)?data.requests:[];
  const locals=Array.isArray(data?.locals)?data.locals:[];
  const pending=list.filter(r=>r.status==='pending'),other=list.filter(r=>r.status!=='pending');
  holder.innerHTML='<div class="gl-invite-counters"><strong>'+pending.length+' pendientes</strong><span>'+other.filter(r=>r.status==='approved').length+' legajos aprobados</span></div>'+
   '<h3>Solicitudes pendientes</h3>'+(pending.length?pending.map(r=>requestCard(r,locals)).join(''):'<p class="gl-invite-note">No hay solicitudes pendientes.</p>')+
   '<details class="gl-invite-history"><summary>Ver legajos e historial ('+other.length+')</summary>'+
   (other.length?other.map(r=>requestCard(r,locals)).join(''):'<p class="gl-invite-note">Todavía no hay legajos anteriores.</p>')+'</details>';
 }catch(e){holder.textContent=e?.message||'No pudimos consultar las solicitudes.';}
}
async function openShare(){
 if(!isEligible()||busy)return;
 const c=context();
 modal('<p class="gl-invite-note">Preparando el enlace seguro del local…</p>');
 busy=true;
 try{
  const link=await rpc('invite_link',{p_tenant:c.tenant,p_local:c.local,p_rotate:false});
  if(!panel)return;
  const url=buildUrl(link.token);
  update('<p class="gl-invite-note">Enlace de invitación para <strong>'+esc(link.empresa)+' · '+esc(link.local)+'</strong>. No vence; el acceso solo se habilita después de aprobar la solicitud.</p>'+
    '<label class="gl-invite-link-label">Enlace sin vencimiento<input aria-label="Enlace de invitación" value="'+esc(url)+'" readonly></label>'+
    '<div class="gl-invite-actions"><a class="gl-invite-whatsapp-button" href="'+esc(whatsappUrl(url,link.empresa,link.local))+'" target="_blank" rel="noopener noreferrer">'+waIcon+' Abrir WhatsApp para enviar</a>'+
    '<button type="button" data-gl-invite-copy>Copiar enlace</button></div>'+
    (link.can_review?'<details class="gl-invite-rotate"><summary>Seguridad del enlace</summary><p>Podés regenerarlo si se compartió por error. El anterior dejará de funcionar.</p>'+
    '<button type="button" data-gl-invite-rotate>Regenerar enlace</button></details>'+
    '<section class="gl-invite-reviews" aria-label="Solicitudes y legajos"><h3>Solicitudes y legajos</h3>'+
    '<p>Asigná Dueño o Gerente y los locales correspondientes. Nadie ingresa hasta tu aprobación.</p>'+
    '<div data-gl-invite-request-list><p>Consultando solicitudes…</p></div></section>':'<p class="gl-invite-note">El dueño revisa las solicitudes y asigna los permisos de acceso.</p>'));
  if(link.can_review)await renderRequests();
 }catch(e){update('<p class="gl-invite-error" role="alert">'+esc(e?.message||'No pudimos generar el enlace.')+'</p>');}
 finally{busy=false;}
}
async function openInviteForSession(session){
 const token=pendingToken();
 if(!TOKEN_RE.test(token))return false;
 css();
 activeInvite=true;
 const s=session?.user||{};
 modal('<p class="gl-invite-note">Verificando el enlace y tu cuenta Google…</p>','Solicitud de acceso a GESTLOK');
 try{
  const info=await rpc('invite_preview',{p_token:token});
  if(!panel)return true;
  const google=(s.app_metadata?.provider==='google'||(s.app_metadata?.providers||[]).includes('google'));
  update('<p class="gl-invite-note">Te invitaron a <strong>'+esc(info.empresa)+' · '+esc(info.local)+'</strong>. Completá tu legajo para que el dueño revise la solicitud.</p>'+
    (!google?'<p class="gl-invite-error">Ingresá con tu cuenta de Google para continuar. No se aceptan cuentas con contraseña para invitaciones nuevas.</p><button type="button" data-gl-invite-google>Continuar con Google</button>':
    '<form id="gl-invite-join-form"><label>Nombre<input name="first" maxlength="80" minlength="2" required autocomplete="given-name"></label>'+
    '<label>Apellido<input name="last" maxlength="80" minlength="2" required autocomplete="family-name"></label>'+
    '<label>Número de teléfono<input type="tel" name="phone" maxlength="25" minlength="7" required autocomplete="tel" placeholder="+54 11 1234 5678"></label>'+
    '<p class="gl-invite-note">Tu legajo será visible únicamente para quienes autorizan el acceso. La solicitud quedará pendiente.</p>'+
    '<button class="gl-invite-submit" type="submit">Enviar solicitud</button></form>'));
 }catch(e){update('<p class="gl-invite-error" role="alert">'+esc(e?.message||'La invitación no está disponible.')+'</p>'+
  '<button type="button" data-gl-invite-discard>Descartar enlace</button>');}
 return true;
}
async function hasPendingMyRequest(){
 try{
  const list=await rpc('my_requests');
  lastPending=Array.isArray(list)&&list.some(x=>x.status==='pending');
  return lastPending;
 }catch{return false;}
}
async function afterLogin(session){
 if(pendingToken())return openInviteForSession(session);
 return hasPendingMyRequest();
}
function hasPendingToken(){return TOKEN_RE.test(pendingToken());}
function pendingRegistration(){return activeInvite||lastPending||hasPendingToken();}
document.addEventListener('click',e=>{
 if(e.target.closest('[data-gl-invite-open]')){e.preventDefault();void openShare();return;}
 if(e.target.closest('[data-gl-invite-close]')){e.preventDefault();closeModal();return;}
 const copy=e.target.closest('[data-gl-invite-copy]');
 if(copy&&panel){const link=panel.querySelector('.gl-invite-link-label input')?.value||'';if(!link)return;
   navigator.clipboard?.writeText(link).then(()=>alert('Enlace copiado.'),()=>alert('No pudimos copiar. Seleccioná el enlace y copialo manualmente.',true));return;
 }
 if(e.target.closest('[data-gl-invite-rotate]')){
   if(!panel||busy||!window.confirm('¿Regenerar el enlace? El anterior dejará de funcionar.'))return;
   const c=context();busy=true;
   rpc('invite_link',{p_tenant:c.tenant,p_local:c.local,p_rotate:true})
    .then(link=>{
     const url=buildUrl(link.token),field=panel?.querySelector('.gl-invite-link-label input');
     if(field)field.value=url;
     const wa=panel?.querySelector('.gl-invite-whatsapp-button');
     if(wa)wa.href=whatsappUrl(url,link.empresa,link.local);
     alert('Enlace anterior revocado. Compartí el nuevo.');
    }).catch(e=>alert(e.message||'No se pudo renovar.',true)).finally(()=>busy=false);
   return;
 }
 if(e.target.closest('[data-gl-invite-discard]')){savePending('');activeInvite=false;closeModal();return;}
 if(e.target.closest('[data-gl-invite-google]')){
   // Conservar token en esta pestaña a través de OAuth.
   void db()?.auth?.signInWithOAuth({provider:'google',options:{redirectTo:location.origin+'/',queryParams:{prompt:'select_account'}}});
 }
});
document.addEventListener('submit',e=>{
 const form=e.target;
 if(form?.id==='gl-invite-join-form'&&panel?.contains(form)){
  e.preventDefault();
  if(busy)return;
  const fields=new FormData(form),token=pendingToken();
  busy=true;
  rpc('join',{p_token:token,p_first:String(fields.get('first')||'').trim(),
    p_last:String(fields.get('last')||'').trim(),
    p_phone:String(fields.get('phone')||'').trim()})
    .then(()=>{
      savePending('');activeInvite=false;lastPending=true;
      update('<div class="gl-invite-done"><strong>Solicitud enviada</strong>'+
       '<p>Tu legajo quedó guardado y estás en espera de aprobación. El dueño te asignará el rol y los locales permitidos.</p>'+
       '<button type="button" data-gl-invite-close>Entendido</button></div>');
    }).catch(err=>alert(err.message||'No se pudo guardar el legajo.',true)).finally(()=>busy=false);
  return;
 }
 const req=form?.closest?.('[data-gl-invite-review]');
 if(req&&panel?.contains(req)){
  e.preventDefault();if(busy)return;
  const id=req.dataset.glInviteReview;
  const decision=e.submitter?.value==='rejected'?'rejected':'approved';
  const d=new FormData(req);
  const role=String(d.get('role')||'gerente');
  const locals=d.getAll('local').map(String);
  if(decision==='approved'&&role==='gerente'&&!locals.length){alert('Seleccioná al menos una sucursal.',true);return;}
  busy=true;
  rpc('review',{p_request:id,p_decision:decision,p_role:decision==='approved'?role:null,
     p_local_ids:decision==='approved'&&role==='gerente'?locals:null})
    .then(()=>{alert(decision==='approved'?'Solicitud aprobada y permisos asignados.':'Solicitud rechazada.');return renderRequests();})
    .catch(err=>alert(err?.message||'No se pudo revisar.',true)).finally(()=>busy=false);
 }
});
window.GestLokInvites=Object.freeze({
 attach(ctx){api=ctx;css();},refresh,homeTile,
 hasPendingToken,afterLogin,pendingRegistration,
 // Sólo pruebas de presentación. Los permisos nunca se calculan aquí.
 _test:{buildUrl,whatsappUrl,eligible:()=>isEligible()}
});
})();
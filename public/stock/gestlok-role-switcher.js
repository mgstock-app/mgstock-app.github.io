/* Perfil multiempresa de GESTLOK. Los permisos proceden de RPC del servidor:
 * la UI no modifica roles ni locales del usuario. */
(() => {
 'use strict';
 let api = null, contexts = [], loading = false, error = '', open = false, fetchedFor = '', busy = false;
 const $ = q => document.querySelector(q);
 const labels = {dueno:'Dueño/a',gerente:'Gerente',creadora:'Administración',lectura:'Colaborador/a',colaborador:'Colaborador/a'};
 const current = () => api?.S?.me?.tenant_id || null;
 const authenticated = () => !!(api?.S?.me?.email && api?.S?.db);
 async function load(force=false){
   if(!authenticated() || loading || (!force && fetchedFor===String(api.S.me.email)+'|'+String(current())))return;
   if(typeof navigator!=='undefined' && !navigator.onLine){
     error='Conectate a internet para consultar tus roles.'; render(); return;
   }
   loading=true;error='';render();
   try{
     const {data,error:problem} = await window.GestLokSupabase.rpc('gestlok_my_role_contexts');
     if(problem || !Array.isArray(data))throw problem || Error('No se pudieron consultar los roles.');
     contexts = data.filter(x=>x && typeof x.tenant_id==='string' &&
       typeof x.company_name==='string' && ['dueno','gerente','creadora','lectura','colaborador'].includes(x.role));
     fetchedFor = String(api.S.me.email)+'|'+String(current());
   }catch{contexts=[];error='No pudimos comprobar tus empresas. Actualizá para reintentar.';}
   finally{loading=false;render();}
 }
 function trigger(){
   let el=$('#gl-profile-switch-trigger');
   if(!authenticated()){
     el?.remove();$('#gl-profile-switch-modal')?.remove();return;
   }
   if(!el){
     el=document.createElement('button');el.type='button';el.id='gl-profile-switch-trigger';el.className='gl-profile-switch-trigger';
     el.setAttribute('aria-label','Mi perfil: cambiar empresa y rol');
     el.textContent='◉ Mi perfil';
     el.addEventListener('click',()=>{open=!open;render();if(open)void load();});
     document.body.appendChild(el);
   }
   const hub=$('#hub'),hubOn=hub&&!hub.hidden;
   el.classList.toggle('gl-profile-switch-trigger--hub',!!hubOn);
   el.setAttribute('aria-expanded',String(open));
 }
 function modal(){
   let el=$('#gl-profile-switch-modal');
   if(!open || !authenticated()){el?.remove();return;}
   if(!el){
     el=document.createElement('div');el.id='gl-profile-switch-modal';el.className='gl-profile-switch-overlay';
     el.innerHTML='<section class="gl-profile-switch-dialog" role="dialog" aria-modal="true" aria-label="Mi perfil y roles"><header><div><small>GESTLOK · MI PERFIL</small><h2>Empresas y roles</h2></div><button type="button" data-roles-close aria-label="Cerrar perfil">✕</button></header><p class="gl-profile-switch-explain">Elegí la empresa en la que vas a trabajar. GESTLOK verifica tus permisos de forma independiente en cada negocio.</p><div class="gl-profile-switch-list" role="list"></div><p class="gl-profile-switch-state" role="status"></p><button type="button" class="gl-profile-switch-refresh">Actualizar empresas</button></section>';
     el.addEventListener('click',event=>{if(event.target===el || event.target.closest('[data-roles-close]')){open=false;render();}});
     el.querySelector('.gl-profile-switch-refresh').addEventListener('click',()=>void load(true));
     document.body.appendChild(el);
   }
   const list=el.querySelector('.gl-profile-switch-list');list.replaceChildren();
   const status=el.querySelector('.gl-profile-switch-state');
   status.textContent=loading?'Comprobando roles…':error || (!contexts.length?'No aparecen empresas autorizadas para esta cuenta.':'');
   if(!loading)for(const c of contexts){
     const active=c.tenant_id===current();
     const card=document.createElement('button');card.type='button';card.className='gl-profile-switch-card';
     card.disabled=busy || active;card.setAttribute('role','listitem');card.setAttribute('aria-current',String(active));
     const title=document.createElement('strong');title.textContent=c.company_name;
     const role=document.createElement('span');role.textContent=labels[c.role]||'Acceso';
     const locals=document.createElement('small');
     const names=Array.isArray(c.local_names)?c.local_names.map(l=>l.name).filter(x=>typeof x==='string'):[];
     locals.textContent=names.length?names.join(' · '):'Locales autorizados';
     const state=document.createElement('em');state.textContent=active?'Actual':'Elegir';
     card.append(title,role,locals,state);
     card.addEventListener('click',()=>void switchTo(c));
     list.append(card);
   }
 }
 async function switchTo(choice){
   if(busy || choice.tenant_id===current())return;
   if(typeof navigator!=='undefined' && !navigator.onLine){
     error='Para cambiar de empresa necesitás internet.';render();return;
   }
   const pending=await window.GestLokOffline?.pending?.().catch(()=>0);
   if(pending){
     error='Tenés '+pending+' cambios sin sincronizar. Guardalos o sincronizalos antes de cambiar de empresa.';
     render();return;
   }
   if(api.S.local && !window.confirm('¿Cambiar de empresa y rol? Guardá primero cualquier cambio de la planilla.'))return;
   busy=true;error='';render();
   try{
     const {data,error:failure}=await window.GestLokSupabase.rpc('gestlok_choose_role_context',{p_tenant:choice.tenant_id});
     if(failure||data?.tenant_id!==choice.tenant_id)throw failure||Error('Selección no autorizada');
     await window.GestLokOffline?.invalidateContext?.();
     // Todas las suscripciones y borradores de la vista antigua se descartan del DOM.
     // Las copias sin conexión siguen separadas por tenant en IndexedDB.
     location.reload();
   }catch{
     error='No se pudo cambiar de empresa. Tus permisos anteriores no se alteraron.';
     busy=false;render();
   }
 }
 function render(){trigger();modal();}
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&open){open=false;render();}});
 window.GestLokRoleSwitcher=Object.freeze({
   attach(context){api=context;},render,load,labels
 });
})();

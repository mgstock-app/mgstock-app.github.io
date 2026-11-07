/* GESTLOK | Cerrar sesión dentro de Mi perfil.
 * Para cuentas aprobadas se usa la opción de salida del perfil multiempresa.
 * Cuentas pendientes conservan acceso mediante un menú Mi perfil propio.
 * La salida sigue a cargo de auth.js con scope: 'local'.
 */
(()=>{
'use strict';
if(window.GestLokLogout)return;
const sb=window.GestLokSupabase;
if(!sb?.auth)return;
let revision=0,visible=false,expanded=false,wrap=null,trigger=null,menu=null;
function ensureStyles(){
 if(document.getElementById('gl-universal-logout-style'))return;
 const style=document.createElement('link');
 style.id='gl-universal-logout-style';
 style.rel='stylesheet';
 style.href='/stock/gestlok-logout.css?rev=logout-profile-menu-20261107';
 document.head.appendChild(style);
}
function showMenu(next){
 expanded=Boolean(next);
 if(menu)menu.hidden=!expanded;
 if(trigger)trigger.setAttribute('aria-expanded',String(expanded));
}
function ensureFallback(){
 if(wrap?.isConnected)return;
 wrap=document.createElement('div');
 wrap.id='gl-session-profile';
 wrap.className='gl-session-profile';
 trigger=document.createElement('button');
 trigger.id='gl-universal-profile-trigger';
 trigger.className='gl-universal-profile-trigger';
 trigger.type='button';
 trigger.textContent='◉ Mi perfil';
 trigger.setAttribute('aria-label','Mi perfil: opciones de cuenta');
 trigger.setAttribute('aria-expanded','false');
 trigger.setAttribute('aria-controls','gl-universal-profile-menu');
 menu=document.createElement('div');
 menu.id='gl-universal-profile-menu';
 menu.className='gl-universal-profile-menu';
 menu.hidden=true;
 const logout=document.createElement('button');
 logout.id='gl-universal-logout';
 logout.className='gl-universal-logout';
 logout.type='button';
 logout.dataset.au='out';
 logout.textContent='Cerrar sesión';
 logout.setAttribute('aria-label','Cerrar sesión de GESTLOK en este dispositivo');
 logout.setAttribute('title','Cerrar sesión solo en este dispositivo');
 menu.appendChild(logout);
 wrap.append(trigger,menu);
 document.body.appendChild(wrap);
 trigger.addEventListener('click',()=>showMenu(!expanded));
}
function syncProfile(){
 if(!visible){if(wrap)wrap.hidden=true;showMenu(false);return;}
 ensureStyles();ensureFallback();
 // La opción de salida aprobada está dentro del diálogo de Mi perfil.
 const profilePresent=Boolean(document.getElementById('gl-profile-switch-trigger'));
 wrap.hidden=profilePresent;
 if(profilePresent)showMenu(false);
}
function update(session){
 visible=Boolean(session?.user?.id);
 document.documentElement.classList.toggle('gl-universal-logout-ready',visible);
 syncProfile();
}
sb.auth.onAuthStateChange((event,session)=>{
 revision++;
 if(event==='SIGNED_OUT'){update(null);return;}
 if(['INITIAL_SESSION','SIGNED_IN','TOKEN_REFRESHED','USER_UPDATED'].includes(event))update(session);
});
const initialRevision=revision;
Promise.resolve(sb.auth.getSession()).then(({data})=>{
 if(revision===initialRevision)update(data?.session||null);
}).catch(()=>{if(revision===initialRevision)update(null);});
document.addEventListener('keydown',event=>{
 if(event.key==='Escape'&&expanded)showMenu(false);
});
document.addEventListener('click',event=>{
 if(expanded&&wrap&&!wrap.contains(event.target))showMenu(false);
});
window.GestLokLogout=Object.freeze({isVisible:()=>visible,syncProfile,selector:'#gl-universal-logout'});
})();

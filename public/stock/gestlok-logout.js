/* GESTLOK | Salida visible para cualquier cuenta autenticada.
 * Independiente de rol, tenant, local y estado de aprobación.
 * Reutiliza el handler de auth.js: signOut({scope:'local'}), nunca global.
 */
(()=>{
'use strict';
if(window.GestLokLogout)return;
const sb=window.GestLokSupabase;
if(!sb?.auth)return;
let button=null,revision=0,visible=false;
const ID='gl-universal-logout';
function ensureStyles(){
 if(document.getElementById('gl-universal-logout-style'))return;
 const style=document.createElement('link');
 style.id='gl-universal-logout-style';
 style.rel='stylesheet';
 style.href='/stock/gestlok-logout.css?rev=logout-for-all-20261107';
 document.head.appendChild(style);
}
function ensureButton(){
 if(button?.isConnected)return button;
 button=document.getElementById(ID);
 if(!button){
  button=document.createElement('button');
  button.id=ID;
  button.type='button';
  button.className='gl-universal-logout';
  button.dataset.au='out';
  button.setAttribute('aria-label','Cerrar sesión de GESTLOK en este dispositivo');
  button.setAttribute('title','Cerrar sesión solo en este dispositivo');
  button.innerHTML='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/></svg><span>Cerrar sesión</span>';
  button.hidden=true;
  document.body.appendChild(button);
 }
 return button;
}
function update(session){
 visible=Boolean(session?.user?.id);
 if(visible)ensureStyles();
 const node=ensureButton();
 node.hidden=!visible;
 node.disabled=false;
 node.removeAttribute('aria-busy');
 document.documentElement.classList.toggle('gl-universal-logout-ready',visible);
}
sb.auth.onAuthStateChange((event,session)=>{
 // La consulta inicial no puede restaurar el botón tras una salida posterior.
 revision++;
 if(event==='SIGNED_OUT'){update(null);return;}
 if(['INITIAL_SESSION','SIGNED_IN','TOKEN_REFRESHED','USER_UPDATED'].includes(event)){
  update(session);
 }
});
const initialRevision=revision;
Promise.resolve(sb.auth.getSession()).then(({data})=>{
 if(revision===initialRevision)update(data?.session||null);
}).catch(()=>{
 if(revision===initialRevision)update(null);
});
// El handler existente recibe data-au=out y ejecuta la salida local.
// Solo actualizamos el estado visual una vez despachado el click.
document.addEventListener('click',event=>{
 const target=event.target?.closest?.('#'+ID);
 if(!target||!visible)return;
 Promise.resolve().then(()=>{
  if(visible&&button===target){
   button.disabled=true;
   button.setAttribute('aria-busy','true');
   const label=button.querySelector('span');
   if(label)label.textContent='Cerrando sesión…';
  }
 });
},true);
window.GestLokLogout=Object.freeze({isVisible:()=>visible,selector:'#'+ID});
})();
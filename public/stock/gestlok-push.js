/* GestLok · consentimiento push exclusivamente para Dueña. No envía alertas. */
(()=>{
'use strict';
let ctx=null,shownFor='',visible=false,busy=false,registered=false,message='';
let keyPromise=null;
const conf=()=>window.SPM_CONFIG||{};
const supa=()=>window.GestLokSupabase;
const owner=()=>!!ctx && ctx.miRol()==='dueno' && !!ctx.S.local && !!ctx.S.me?.email;
const identity=()=>String(ctx?.S.me?.email||'').trim().toLowerCase();
const memoKey=()=> 'gestlok:push-question:v1:'+encodeURIComponent(identity());
const storage={get(){try{return localStorage.getItem(memoKey())}catch{return null}},
  set(){try{localStorage.setItem(memoKey(),'consultado')}catch{}}};
const supports=()=>location.protocol==='https:' && 'Notification' in window &&
  'serviceWorker' in navigator && 'PushManager' in window;
const isAppleMobile=()=>/iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform==='MacIntel' && navigator.maxTouchPoints>1);
const isStandalone=()=>window.matchMedia?.('(display-mode: standalone)').matches ||
  navigator.standalone===true;
const canPrompt=()=>supports() && (!isAppleMobile()||isStandalone());
const h=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const api=()=>conf().url?.replace(/\/$/,'')+'/functions/v1/gestlok-push';
function publicKey(){
  keyPromise ||= fetch(api()+'?op=config',{headers:{apikey:conf().key},cache:'no-store'})
    .then(async res=>{const out=await res.json();if(!res.ok||!out?.publicKey)throw Error('El servicio push no está disponible.');return out.publicKey;})
    .catch(err=>{keyPromise=null;throw err;});
  return keyPromise;
}
function b64array(base64){
  const pad='='.repeat((4-base64.length%4)%4);
  const raw=atob(base64.replace(/-/g,'+').replace(/_/g,'/')+pad);
  return Uint8Array.from(raw,c=>c.charCodeAt(0));
}
async function endpoint(op,subscription){
  const {data}=await supa().auth.getSession();
  const token=data?.session?.access_token;
  if(!token)throw Error('Iniciá sesión para registrar este dispositivo.');
  const res=await fetch(api(),{method:'POST',headers:{
    apikey:conf().key,'Content-Type':'application/json',Authorization:'Bearer '+token
  },body:JSON.stringify({op,subscription})});
  const body=await res.json();
  if(!res.ok||!body?.ok)throw Error(body?.error||'No se pudo registrar el dispositivo.');
}
async function register(){
  if(!owner()||!canPrompt()||Notification.permission!=='granted')return;
  if(busy)return;busy=true;message='Vinculando dispositivo…';ctx.render();
  try{
    const key=await publicKey();
    const worker=await navigator.serviceWorker.ready;
    let subscription=await worker.pushManager.getSubscription();
    if(!subscription)subscription=await worker.pushManager.subscribe({
      userVisibleOnly:true,applicationServerKey:b64array(key)
    });
    const info=subscription.toJSON();
    if(!info.endpoint||!info.keys?.p256dh||!info.keys?.auth)throw Error('La suscripción del navegador no está completa.');
    await endpoint('subscribe',info);
    registered=true;message='Dispositivo vinculado. Los avisos se definirán próximamente.';
  }catch(e){registered=false;message=String(e?.message||'No se pudo vincular. Probá más adelante.').slice(0,150)}
  finally{busy=false;ctx.render();}
}
function homePrompt(){
  if(!owner())return '';
  const account=identity();
  if(account!==shownFor){shownFor=account;visible=false;registered=false;message='';keyPromise=null;}
  if(!canPrompt() || Notification.permission!=='default')return '';
  if(!visible && !storage.get()){
    // El aviso interno también aparece una sola vez en este dispositivo/cuenta.
    storage.set();visible=true;
    publicKey().catch(()=>{}); // precarga: nunca abre el permiso nativo sin tocar el botón
  }
  if(!visible)return '';
  return '<section class="gl-push-permission" role="region" aria-label="Permiso para notificaciones">'+
   '<div><strong>¿Querés recibir notificaciones de GestLok?</strong>'+
   '<p>Podés autorizar los avisos para este dispositivo. Te lo consultaremos una sola vez. Todavía no se enviarán alertas.</p></div>'+
   '<div class="gl-push-actions"><button type="button" class="btn sm" data-gl-push="later">Ahora no</button>'+
   '<button type="button" class="btn primary sm" data-gl-push="allow">Permitir notificaciones</button></div></section>';
}
function drawerContent(){
  if(!owner())return '';
  const permission=typeof Notification==='undefined'?'unsupported':Notification.permission;
  let detail='';
  if(!canPrompt())detail=isAppleMobile() && !isStandalone()?
    'En iPhone o iPad, instalá GestLok en la pantalla de inicio para habilitar las notificaciones.':
    'Este navegador no admite notificaciones push.';
  else if(permission==='granted')detail=message||
    'El permiso está concedido. Podés vincular este dispositivo para futuras notificaciones.';
  else if(permission==='denied')detail='Bloqueaste las notificaciones. Podés cambiarlo desde la configuración del navegador o dispositivo. No volveremos a pedir permiso.';
  else detail=visible?'Respondé al cartel del Inicio.':'La consulta ya fue presentada. Si querés cambiar el permiso, hacelo desde los ajustes del navegador.';
  return '<div class="gl-push-drawer"><p>'+h(detail)+'</p>'+
   (permission==='granted' && canPrompt() && !registered?
     '<button class="btn primary sm" data-gl-push="retry" '+(busy?'disabled':'')+'>Vincular dispositivo</button>':'')+
   (registered?'<span class="gl-push-ready">Permiso y dispositivo registrados</span>':'')+
   '<small>El envío automático seguirá desactivado hasta definir sus condiciones.</small></div>';
}
document.addEventListener('click',e=>{
  const button=e.target.closest?.('[data-gl-push]');
  if(!button || !owner())return;
  e.preventDefault();
  const action=button.dataset.glPush;
  if(action==='later'){visible=false;ctx.render();return;}
  if(action==='retry'){if(Notification.permission==='granted')register();return;}
  if(action!=='allow'||!visible||busy)return;
  visible=false;storage.set();
  if(!canPrompt()||Notification.permission!=='default'){ctx.render();return;}
  // Requisito del navegador: se llama sin awaits, en el gesto real del usuario.
  let grant;
  try{grant=Notification.requestPermission()}catch(e){
    message='No se pudo consultar el permiso.';ctx.render();return;
  }
  Promise.resolve(grant).then(permission=>{
    if(permission==='granted')return register();
    message=permission==='denied'?'Permiso rechazado. Podés cambiarlo desde Ajustes.':
      'No se concedió el permiso. No volveremos a consultarlo.';
    ctx.render();
  }).catch(()=>{message='No se pudo consultar el permiso.';ctx.render()});
  ctx.render();
});
window.GestLokPush=Object.freeze({attach:x=>{ctx=x;},homePrompt,drawerContent});
})();

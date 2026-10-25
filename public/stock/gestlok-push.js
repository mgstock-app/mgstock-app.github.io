/* GestLok · consentimiento push exclusivamente para Dueña. No envía alertas. */
(()=>{
'use strict';
let ctx=null,shownFor='',visible=false,busy=false,registered=false,message='';
let keyPromise=null;
let prefAccount='',preferences=null,prefLoading=false,prefSaving='',prefError='';
const categories=[['order_ready','Pedido de proveedor preparado','Cuando un gerente finaliza un pedido.'],['due_soon','Vencimiento próximo','Un aviso diario a las 08:00 si vence en 1 a 3 días.'],['due_today','Vencimiento hoy','Un aviso a las 08:00 por servicios que vencen hoy.'],['urgent_chat','Mensaje urgente del gerente','Aviso inmediato por mensaje marcado urgente.'],['important_changes','Cambios importantes','Eliminaciones o correcciones grandes, agrupadas cada 30 min.']];
const defaultPrefs={master:true,order_ready:true,due_soon:true,due_today:true,urgent_chat:true,important_changes:true};
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
    registered=true;message='Dispositivo vinculado. Recibirás las categorías que tengas activadas.';
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
   '<p>Podés autorizar los avisos para este dispositivo. Te lo consultaremos una sola vez. Podés activar o desactivar cada tipo de aviso desde Notificaciones.</p></div>'+
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
   '<small>Solo recibirás avisos si autorizaste el permiso, vinculaste este dispositivo y tenés su interruptor activado.</small></div>'+settingsHTML();
}

function settingsHTML(){
 if(!owner())return '';
 const pref=preferences||defaultPrefs;
 const yes=(key)=>pref[key]!==false;
 const switchRow=(key,label,detail)=>{
  const active=yes(key),disabled=prefLoading||!!prefSaving||(key!=='master'&&!yes('master'));
  return '<div class="gl-push-pref-row"><div><b>'+h(label)+'</b><small>'+h(detail)+'</small></div>'+
   '<button type="button" class="gl-push-switch '+(active?'on':'')+'" data-gl-push-pref="'+h(key)+
   '" role="switch" aria-label="'+h(label)+'" aria-checked="'+active+'" '+(disabled?'disabled':'')+'>'+
   '<span aria-hidden="true"></span></button></div>';
 };
 return '<section id="gl-push-settings" class="gl-push-settings" aria-label="Preferencias de notificaciones">'+
   '<h4>Elegí tus notificaciones</h4><p class="gl-push-pref-description">Configuración personal, válida para tus locales y dispositivos.</p>'+
   (prefError?'<p class="note warn" role="alert">'+h(prefError)+'</p>':'')+
   (prefLoading?'<p class="lead">Cargando preferencias…</p>':'')+
   switchRow('master','Recibir notificaciones push','Interruptor general para todos los avisos.')+
   categories.map(x=>switchRow(...x)).join('')+
   '<small class="gl-push-pref-foot">Verde: activada · Gris: desactivada. Los cambios se guardan automáticamente.</small></section>';
}
function redrawPrefs(focusKey=''){
 const target=document.querySelector('#gl-push-settings');
 if(target && owner()){
   const old=target.parentElement;
   if(old){target.outerHTML=settingsHTML();if(focusKey)old.querySelector('[data-gl-push-pref="'+focusKey+'"]')?.focus({preventScroll:true});}
 }
}
async function loadPreferences(){
 if(!owner())return;
 const account=identity()+'|'+String(ctx.S.me?.tenant_id||'');
 if(prefAccount!==account){prefAccount=account;preferences=null;prefError='';}
 if(preferences||prefLoading)return;
 prefLoading=true;redrawPrefs();
 try{
  const {data}=await supa().auth.getSession();
  if(!data?.session?.access_token)throw Error('Iniciá sesión.');
  const res=await fetch(api()+'?op=preferences',{headers:{
   apikey:conf().key,Authorization:'Bearer '+data.session.access_token
  },cache:'no-store'});
  const body=await res.json();
  if(!res.ok||!body?.ok)throw Error(body?.error||'No se pudieron cargar las preferencias.');
  if(prefAccount===account){preferences={...defaultPrefs,...body.preferences};prefError='';}
 }catch(e){if(prefAccount===account)prefError=String(e?.message||'Error de conexión.');}
 finally{prefLoading=false;redrawPrefs();}
}
async function setPreference(key){
 if(!owner()||prefLoading||prefSaving||!Object.hasOwn(defaultPrefs,key))return;
 if(!preferences){await loadPreferences();if(!preferences)return;}
 const before={...preferences},next=!before[key],account=prefAccount;
 prefSaving=key;prefError='';preferences[key]=next;redrawPrefs(key);
 try{
  const {data}=await supa().auth.getSession();
  if(!data?.session?.access_token)throw Error('Iniciá sesión.');
  const res=await fetch(api(),{method:'POST',headers:{
    apikey:conf().key,'Content-Type':'application/json',Authorization:'Bearer '+data.session.access_token
  },body:JSON.stringify({op:'set-preference',key,value:next})});
  const response=await res.json();
  if(!res.ok||!response?.ok)throw Error(response?.error||'No se guardó la preferencia.');
  if(account===prefAccount)preferences={...defaultPrefs,...response.preferences};
 }catch(e){if(account===prefAccount){preferences=before;prefError=String(e?.message||'No se pudo guardar.');}}
 finally{prefSaving='';redrawPrefs(key);}
}

document.addEventListener('click',e=>{
  const toggle=e.target.closest?.('[data-gl-push-pref]');
  if(toggle){e.preventDefault();setPreference(toggle.dataset.glPushPref);return;}

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
async function onLogout(){
 if(!owner()||!canPrompt())return;
 try{
  const registration=await navigator.serviceWorker.getRegistration();
  if(!registration)return;
  const sub=await registration.pushManager.getSubscription();
  if(!sub)return;
  try{await endpoint('unsubscribe',sub.toJSON());}catch{}
  await sub.unsubscribe();
 }catch{}
}
window.GestLokPush=Object.freeze({attach:x=>{ctx=x;},homePrompt,drawerContent,onOpen:loadPreferences,onLogout});
})();

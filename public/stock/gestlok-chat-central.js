/* GESTLOK Chat · Central de mensajes dentro de GESTLOK. Micro app GENERAL: aparece en cualquier empresa y local
 * que tenga GESTLOK Chat encendido en el servidor (gestlok_chat_private), cada local con su propio chat.
 * No hay empresas ni locales fijos en el código: los dice gestlok_chat_panel_inicio según la sesión.
 * En Mi Gusto reemplaza a «Pedidos WhatsApp». Mantiene la interfaz que usa app.js (window.GestLokMiGustoOrders):
 * menú, atajo del Inicio, contador, aviso flotante de pedidos nuevos y la sección.
 * La sección monta el panel de GESTLOK Chat (/chat/panel/panel.js) dentro de un shadow DOM que se conserva entre
 * redibujos de GESTLOK: no se recarga ni pierde lo que se está escribiendo. Los permisos los decide la base.
 */
(()=>{
'use strict';
const PAUSA_MS=15000;
let audioCtx=null,soundReady=false;
function activarSonido(){
 try{const C=window.AudioContext||window.webkitAudioContext;
  if(!C)return false;
  audioCtx ||= new C();
  void audioCtx.resume().then(()=>{soundReady=true;}).catch(()=>{soundReady=false;});
  soundReady=audioCtx.state==='running';return true;
 }catch{return false;}
}
function sonar(){
 if(!soundReady||audioCtx?.state!=='running')return;
 try{[0,.2,.4].forEach((delay,i)=>{
  const t=audioCtx.currentTime+delay,o=audioCtx.createOscillator(),g=audioCtx.createGain();
  o.type='sine';o.frequency.value=i===2?890:740;
  g.gain.setValueAtTime(.0001,t);
  g.gain.exponentialRampToValueAtTime(.14,t+.03);
  g.gain.exponentialRampToValueAtTime(.0001,t+.16);
  o.connect(g);g.connect(audioCtx.destination);o.start(t);o.stop(t+.17);
 });}catch{/* audio no compatible */}
}
document.addEventListener('pointerdown',()=>{if(!soundReady||audioCtx?.state!=='running')activarSonido();},{capture:true});

const VERSION_PANEL='20261120pizzassafe1';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const chatIcon='<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16v11H9l-5 4z"/><path d="M8 9.5h8M8 12.5h5"/></svg>';
let api=null,pendientes=0,vistos=null,reclamos=0,reclamosVistos=null,anfitrion=null,panel=null,panelLocal='',cargaPanel=null,epoca=0;
// Locales con GESTLOK Chat encendido para esta sesión: {tenant, locales: Map(local_id → nombre)}. Lo dice el servidor.
let servidor={tenant:'',locales:new Map()},buscando='',fallo={tenant:'',at:0};
let idsSucursal=new Map(), ultimoAvisoId='', ultimoAvisoAt=0, avisoEtapa=0, avisoAbierto=false, idConsulta=0;
async function detalleNuevo(){
 const localActual=local(),suc=idsSucursal.get(localActual),turno=++idConsulta;
 if(!suc||!online()||!allowed())return;
 try{
  const {data,error}=await window.GestLokSupabase.rpc('gestlok_chat_panel_pedidos',
    {p_sucursal:suc.id,p_estado:'pendiente',p_limite:50});
  if(error||turno!==idConsulta||localActual!==local())return;
  const pedido=(data?.pedidos||[]).filter(p=>!p.es_prueba)
    .sort((a,b)=>Date.parse(b.creado_at)-Date.parse(a.creado_at))[0];
  if(!pedido)return;
  ultimoAvisoId=pedido.id;ultimoAvisoAt=Date.now();avisoEtapa=0;avisoAbierto=false;
  const a=document.getElementById('mgp-global-alert');
  const detalle=a?.querySelector('[data-gcc-preview]');
  if(detalle)detalle.textContent=[pedido.codigo,pedido.cliente_nombre,pedido.entrega==='envio'?'Delivery':'Retiro',
    pedido.medio_pago,'$ '+Number(pedido.total||0).toLocaleString('es-AR'),
    (pedido.items||[]).slice(0,2).map(i=>(i.cantidad||1)+'× '+i.nombre).join(' · ')].filter(Boolean).join(' · ');
 }catch{/* la alerta simple sigue visible */}
}
function recordarPedido(){
 if(!ultimoAvisoId||!ultimoAvisoAt||!pendientes||avisoAbierto||document.hidden)return;
 const mins=(Date.now()-ultimoAvisoAt)/60000,etapa=mins>=5?2:mins>=2?1:0;
 if(etapa>avisoEtapa){avisoEtapa=etapa;avisoNuevo('pedido',true);}
}
document.addEventListener('click',e=>{
 if(e.target.closest?.('[data-gcc-close]')){e.preventDefault();ocultarAviso();return;}
 if(e.target.closest?.('.mgp-alert-open'))avisoAbierto=true;
});


const local=()=>api?.S?.local;
const tenant=()=>String(api?.S?.me?.tenant_id||'');
const localName=()=>servidor.locales.get(local())||'';
// Dueño, gerente de ese local o creadora con escritura (el servidor vuelve a validar cada acción).
const rolOk=()=>!!api && !window.GestLokCreatorSupport?.previewRol?.() &&
  (api.miRol()==='dueno'||(api.miRol()==='gerente'&&api.misLocales().includes(local()))||
   (api.miRol()==='creadora'&&!api.S?.ro));
const allowed=()=>{
 if(!rolOk()||!tenant()||!local())return false;
 if(servidor.tenant!==tenant()){void descubrir();return false;}
 return servidor.locales.has(local());
};
const online=()=>!!api&&!api.S?.offline&&navigator.onLine!==false;
const leer=(data,t)=>{
 const locales=new Map((data?.habilitado?data.sucursales||[]:[]).filter(x=>x?.nivel&&x.local_id).map(x=>[String(x.local_id),String(x.nombre||x.local_id)]));
 servidor={tenant:t,locales};
  idsSucursal=new Map((data?.sucursales||[]).filter(x=>x?.local_id&&x?.id).map(x=>[String(x.local_id),x]));
};
// Pregunta una vez por empresa qué locales tienen el chat. Si cambia algo, GESTLOK redibuja el menú.
async function descubrir(){
 const t=tenant();
 if(!t||buscando===t||!window.GestLokSupabase||!online())return;
 if(fallo.tenant===t&&Date.now()-fallo.at<60000)return; // tras un error, se reintenta en un minuto
 buscando=t;
 try{
  const {data,error}=await window.GestLokSupabase.rpc('gestlok_chat_panel_inicio');
  if(error){fallo={tenant:t,at:Date.now()};return;}
  if(t!==tenant())return;
  const antes=servidor.locales.has(local());
  leer(data,t);
  const suc=(data?.sucursales||[]).find(x=>x.local_id===local());
  if(suc&&servidor.locales.has(local()))actualizar(suc.pendientes,suc.reclamos);
  if(servidor.locales.has(local())!==antes)api?.render?.();
 }catch{fallo={tenant:t,at:Date.now()};/* sin conexión: se vuelve a preguntar más tarde */}
 finally{if(buscando===t)buscando='';}
}

function quickAccess(){
 if(!allowed())return '';
 // «Pagos Online» solo donde esa micro app existe (hoy Mi Gusto).
 const pagos=window.GestLokMiGustoOnline?.permitido?.()?'<button type="button" data-go="cierre-online" class="mgp-shift-button"><span class="mgp-shift-symbol" aria-hidden="true">▤</span><span><strong>Pagos Online</strong><small>Movimientos y cierre</small></span></button>':'';
 return '<nav class="mgp-shift-quick" aria-label="Atajos del turno">'+pagos+
  '<button type="button" data-go="pedidos-clientes" class="mgp-shift-button">'+chatIcon+'<span><strong>Central de mensajes</strong><small><span data-gcc-quick-count>'+(pendientes+reclamos)+'</span> pedidos y reclamos pendientes</small></span></button>'+
 '</nav>';
}
function navBadge(){
 return allowed()&&(pendientes+reclamos)?'<span class="mgp-nav-count" data-gcc-nav-count aria-label="'+(pendientes+reclamos)+' pedidos y reclamos pendientes">'+Math.min(99,pendientes+reclamos)+'</span>':'';
}
const pendingCount=()=>allowed()?pendientes+reclamos:0;

function indicadores(){
 if(!allowed())return ocultarAviso();
 const nav=document.querySelector('#snav button[data-go="pedidos-clientes"]');
 if(nav){
  let b=nav.querySelector('[data-gcc-nav-count]');
  if(pendientes+reclamos){
   if(!b){b=document.createElement('span');b.className='mgp-nav-count';b.dataset.gccNavCount='';nav.appendChild(b);}
   b.textContent=String(Math.min(99,pendientes+reclamos));b.setAttribute('aria-label',(pendientes+reclamos)+' pedidos y reclamos pendientes');
  }else b?.remove();
 }
 document.querySelectorAll('[data-gcc-quick-count]').forEach(e=>{e.textContent=String(pendientes+reclamos);});
 window.GestLokMobileDock?.refresh?.();
}
function avisoNuevo(tipo='pedido',recordatorio=false){
 // Aviso flotante en cualquier pantalla de GESTLOK (no se muestra si ya se está en la Central).
 // Mostrar aviso también en la propia Central para no perder pedidos.
 let a=document.getElementById('mgp-global-alert');
 if(!a){a=document.createElement('aside');a.id='mgp-global-alert';a.className='mgp-global-alert mgp-global-alert-new';
  a.setAttribute('role','status');a.setAttribute('aria-live','polite');document.body.appendChild(a);}
 a.innerHTML='<span class="mgp-alert-icon">'+chatIcon+'</span><div class="mgp-alert-copy"><strong>'+
   (tipo==='prueba'?'Aviso de prueba · sin pedido real':tipo==='reclamo'?'¡Reclamo de cliente!':recordatorio?'Pedido sin abrir · recordatorio':'¡Pedido nuevo por chat!')+
   '</strong><small data-gcc-preview>'+
  esc(localName())+' · '+(tipo==='reclamo'?reclamos+' reclamo'+(reclamos===1?'':'s')+' pendiente'+(reclamos===1?'':'s'):pendientes+' pedido'+(pendientes===1?'':'s')+' por confirmar')+'</small></div>'+
  '<button type="button" data-go="pedidos-clientes" class="mgp-alert-open">Ver pedido</button>'+
   '<button type="button" class="mgp-alert-close" data-gcc-close aria-label="Cerrar aviso">×</button>';
 sonar();
  try{navigator.vibrate?.([120,80,120]);}catch{/* sin vibración */}
}
document.addEventListener('click',ev=>{
  const b=ev.target.closest?.('[data-gcc-alert]');if(!b||!allowed())return;
  ev.preventDefault();activarSonido();
  if(b.dataset.gccAlert==='probar'){void Promise.resolve(audioCtx?.resume()).then(()=>{soundReady=true;avisoNuevo('prueba');});return;}
  // Solicitar permiso dentro del gesto real, antes de cualquier operación asíncrona.
  const permiso='Notification' in window?
    (Notification.permission==='default'?Notification.requestPermission():
      Promise.resolve(Notification.permission)):Promise.resolve('unsupported');
  Promise.resolve(permiso).then(async value=>{
    if(value==='granted'){await registrarPush();b.textContent='Notificaciones activadas';}
    else b.textContent='Sonido activado · Push sin permiso';
  }).catch(err=>{b.textContent='Sonido activado · Revisar avisos';b.title=String(err?.message||'Error de notificaciones');});
  const estado=document.querySelector('[data-gcc-alert-estado]');
  if(estado)estado.textContent=soundReady?'Sonido activado en esta sesión.':
    'En algunos celulares necesitás tocar nuevamente para activar sonido.';
});
async function registrarPush(){
 const c=window.SPM_CONFIG||{};
 if(!c.url||!c.key||!navigator.serviceWorker||!window.PushManager)
   throw Error('El dispositivo no admite notificaciones push.');
 const apiUrl=c.url.replace(/\/$/,'')+'/functions/v1/gestlok-push';
 const {data}=await window.GestLokSupabase.auth.getSession();
 const token=data?.session?.access_token;
 if(!token)throw Error('Iniciá sesión.');
 const headers={apikey:c.key,Authorization:'Bearer '+token};
 const response=await fetch(apiUrl+'?op=config',{headers,cache:'no-store'});
 const conf=await response.json();
 if(!response.ok||!conf.publicKey)throw Error('Las notificaciones no están disponibles.');
 const k=conf.publicKey.replace(/-/g,'+').replace(/_/g,'/');
 const bytes=atob(k+'='.repeat((4-k.length%4)%4));
 const worker=await navigator.serviceWorker.ready;
 let subscription=await worker.pushManager.getSubscription();
 if(!subscription)subscription=await worker.pushManager.subscribe({
   userVisibleOnly:true,applicationServerKey:Uint8Array.from(bytes,ch=>ch.charCodeAt(0))});
 const saved=await fetch(apiUrl,{method:'POST',
   headers:{...headers,'Content-Type':'application/json'},
   body:JSON.stringify({op:'subscribe',subscription:subscription.toJSON()})});
 const result=await saved.json();
 if(!saved.ok||!result.ok)throw Error(result.error||'No se pudo vincular el dispositivo.');
}
function ocultarAviso(){document.getElementById('mgp-global-alert')?.remove();}

function actualizar(n,r=reclamos){
 const antes=vistos,antesReclamos=reclamosVistos;
 pendientes=Math.max(0,Number(n)||0);vistos=pendientes;
 reclamos=Math.max(0,Number(r)||0);reclamosVistos=reclamos;
 indicadores();
 if(antesReclamos!==null&&reclamos>antesReclamos)avisoNuevo('reclamo');
 else if(antes!==null&&pendientes>antes){avisoNuevo('pedido');void detalleNuevo();}
 if(!pendientes&&!reclamos){ocultarAviso();ultimoAvisoId='';ultimoAvisoAt=0;}
  recordarPedido();
}
async function consultar(){
 if(!rolOk()||!online()||!window.GestLokSupabase)return;
 // Empresas o locales sin GESTLOK Chat: no se consulta cada 15 segundos.
 if(servidor.tenant===tenant()&&!servidor.locales.has(local()))return;
 if(servidor.tenant!==tenant())return void descubrir();
 const loc=local(),e=epoca;
 try{
  const {data,error}=await window.GestLokSupabase.rpc('gestlok_chat_panel_inicio');
  if(error||e!==epoca||loc!==local())return;
  const t=tenant(),antes=servidor.locales.has(loc);
  leer(data,t);
  if(!servidor.locales.has(loc)){if(antes)api?.render?.();return;}
  const s=(data?.sucursales||[]).find(x=>x.local_id===loc);
  actualizar(s?s.pendientes:0,s?s.reclamos:0);
 }catch{/* sin conexión: se reintenta en el próximo ciclo */}
}

function cargarPanel(){
 if(window.GestLokChatPanel)return Promise.resolve();
 if(cargaPanel)return cargaPanel;
 cargaPanel=new Promise((ok,mal)=>{
  const s=document.createElement('script');s.src='/chat/panel/panel.js?v='+VERSION_PANEL;s.async=true;
  s.onload=()=>ok();s.onerror=()=>{cargaPanel=null;mal(new Error('No se pudo cargar la Central'));};
  document.head.appendChild(s);
 });
 return cargaPanel;
}
// Después de cada redibujo de GESTLOK se vuelve a colocar el mismo panel (no se recarga).
function colocar(){
 const lugar=document.querySelector('#view [data-gcc-lugar]');
 if(!lugar||!allowed())return;
 if(panel&&panelLocal!==local()){panel.destruir();anfitrion=null;panel=null;}
 if(!anfitrion){anfitrion=document.createElement('div');anfitrion.className='gcc-panel';}
 if(anfitrion.parentNode!==lugar)lugar.replaceChildren(anfitrion);
 if(panel)return;
 const loc=local();
 cargarPanel().then(()=>{
  if(panel||loc!==local()||!anfitrion)return;
  panelLocal=loc;
  panel=window.GestLokChatPanel.montar(anfitrion,{sb:window.GestLokSupabase,local:loc,embebido:true,
   alCambiarPendientes:(l,n)=>{if(l===local())actualizar(n);}});
 }).catch(()=>{lugar.innerHTML='<p class="gcc-aviso">No se pudo abrir la Central de mensajes. Revisá tu conexión y volvé a entrar.</p>';});
}
function view(){
 if(!allowed())return '';
 queueMicrotask(colocar);
 const l=local();
 return '<section class="gcc" aria-label="Central de mensajes de '+esc(localName())+'">'+
  '<div class="gcc-cab"><h2>Central de mensajes</h2><small>GESTLOK Chat · '+esc(localName())+' · asistente y pedidos por chat</small>'+
  '<a href="/chat/panel/?local='+encodeURIComponent(l)+'" target="_blank" rel="noopener">Abrir aparte</a></div>'+
  (online()?'':'<p class="gcc-aviso">Sin conexión: la Central se actualiza cuando vuelva internet.</p>')+
  '<div class="gcc-alert-controls"><button type="button" data-gcc-alert="activar">Activar sonido y notificaciones</button>'+
   '<button type="button" data-gcc-alert="probar">Probar aviso</button><span data-gcc-alert-estado role="status"></span></div>'+
   '<div data-gcc-lugar></div></section>';
}
function subscribe(loc,push){
 if(!rolOk()||!loc)return;
 void consultar();
 const t=setInterval(()=>{if(!document.hidden)void consultar();},PAUSA_MS);
 const foco=()=>{void consultar();};
 window.addEventListener('focus',foco);
 push(()=>{clearInterval(t);window.removeEventListener('focus',foco);ocultarAviso();});
}
function reset(){
 epoca++;pendientes=0;vistos=null;reclamos=0;reclamosVistos=null;ocultarAviso();idsSucursal.clear();ultimoAvisoId='';ultimoAvisoAt=0;avisoAbierto=false;servidor={tenant:'',locales:new Map()};buscando='';
 if(panel){panel.destruir();panel=null;}anfitrion=null;panelLocal='';
}
function attach(h){if(!api)api=h;}

window.GestLokMiGustoOrders=Object.freeze({attach,subscribe,reset,view,permitido:allowed,pendingCount,navBadge,quickAccess,
 _test:{actualizar,consultar,colocar,descubrir,estado:()=>({pendientes,vistos,montado:!!panel,locales:[...servidor.locales.keys()]})}});
})();

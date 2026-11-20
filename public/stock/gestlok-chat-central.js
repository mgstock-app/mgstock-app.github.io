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
const VERSION_PANEL='20261120abrir1';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const chatIcon='<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16v11H9l-5 4z"/><path d="M8 9.5h8M8 12.5h5"/></svg>';
let api=null,pendientes=0,vistos=null,reclamos=0,reclamosVistos=null,anfitrion=null,panel=null,panelLocal='',cargaPanel=null,epoca=0;
// Locales con GESTLOK Chat encendido para esta sesión: {tenant, locales: Map(local_id → nombre)}. Lo dice el servidor.
let servidor={tenant:'',locales:new Map(),ids:new Map()},buscando='',fallo={tenant:'',at:0};

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
 const ids=new Map((data?.habilitado?data.sucursales||[]:[]).filter(x=>x?.nivel&&x.local_id&&x.id).map(x=>[String(x.local_id),String(x.id)]));
 servidor={tenant:t,locales,ids};
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
  if(suc&&servidor.locales.has(local())){const previos=vistos;actualizar(suc.pendientes,suc.reclamos);await seguir(local(),epoca,previos);}
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
const pesos=n=>'$ '+String(Math.round(Number(n)||0)).replace(/\B(?=(\d{3})+(?!\d))/g,'.');
const PAGOS={efectivo:'Efectivo',transferencia:'Transferencia',mercado_pago:'Mercado Pago',debito:'Débito',credito:'Crédito'};
const MIN=60000;
// Avisos al gerente por pedido sin abrir: 0 = llegó, 1 = 2 minutos, 2 = 5 minutos (el cliente ya recibió «alta demanda»).
const ETAPAS=[{min:0,titulo:'¡Pedido nuevo por chat!'},{min:2,titulo:'Pedido sin abrir · hace 2 minutos'},
 {min:5,titulo:'Pedido sin abrir · hace 5 minutos'}];
let seguimiento=new Map(),segClave='',porAbrir='',ultimaConsulta=0;

// ---------------------------------------------------------------- sonido (Web Audio, sin archivos) y notificación
let audioCtx=null;
const audio=()=>{try{audioCtx=audioCtx||new (window.AudioContext||window.webkitAudioContext)();}catch{audioCtx=null;}return audioCtx;};
// Los navegadores habilitan el sonido después de un toque: el primero en GESTLOK lo deja listo.
const desbloquear=()=>{const c=audio();if(c&&c.state==='suspended')c.resume().catch(()=>{});};
['pointerdown','keydown','touchend'].forEach(ev=>document.addEventListener(ev,desbloquear,{capture:true,passive:true}));
function sonar(etapa=0){
 const c=audio();if(!c)return;
 if(c.state==='suspended')c.resume().catch(()=>{});
 const notas=etapa>=2?[988,784,988,784,988,784]:etapa===1?[880,660,880,660,880,660]:[880,660,880,660];
 const t0=c.currentTime+.05;
 notas.forEach((f,i)=>{
  const o=c.createOscillator(),g=c.createGain(),t=t0+i*.3;
  o.type=etapa>=2?'triangle':'sine';o.frequency.value=f;
  g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.5,t+.02);g.gain.exponentialRampToValueAtTime(.0001,t+.28);
  o.connect(g);g.connect(c.destination);o.start(t);o.stop(t+.3);
 });
}
const permiso=()=>typeof Notification==='undefined'?'sin-soporte':Notification.permission;
async function notificar(titulo,cuerpo,{tag='gestlok-chat',pedido='',urgente=false}={}){
 if(permiso()!=='granted')return;
 const loc=local()||'';
 const op={body:cuerpo,tag,renotify:true,requireInteraction:urgente,vibrate:[200,100,200],
  icon:'/icons/gestlok-app-v2-192.png',badge:'/icons/gestlok-favicon-v2-32.png',
  data:{url:'/',local:loc,view:'pedidos-clientes',pedido}};
 try{
  const reg=await navigator.serviceWorker?.getRegistration?.();
  if(reg?.showNotification){await reg.showNotification(titulo,op);return;}
 }catch{/* se prueba la notificación simple */}
 try{
  const n=new Notification(titulo,op);
  n.onclick=()=>{try{window.focus();}catch{/* nada */}n.close();irACentral(pedido);};
 }catch{/* el navegador no permite notificaciones acá: queda el aviso en pantalla con sonido */}
}
function irACentral(pedido=''){
 porAbrir=String(pedido||'');
 if(api?.S?.view==='pedidos-clientes'){abrirPendiente();return;}
 const b=document.createElement('button');b.type='button';b.hidden=true;b.dataset.go='pedidos-clientes';
 document.body.appendChild(b);b.click();b.remove();
}
function abrirPendiente(){
 if(!porAbrir||!panel?.abrir)return;
 const id=porAbrir;porAbrir='';void panel.abrir(id);
}
// Toque en una notificación del sistema (la recibe el service worker y se la pasa a esta pestaña).
navigator.serviceWorker?.addEventListener?.('message',e=>{
 if(e.data?.type!=='gestlok-push-open'||e.data.view!=='pedidos-clientes')return;
 // Sin identificador (worker viejo): si hay un solo pedido sin abrir, es ese.
 porAbrir=String(e.data.pedido||'')||(seguimiento.size===1?[...seguimiento.keys()][0]:'');
 setTimeout(()=>{if(api?.S?.view!=='pedidos-clientes')irACentral(porAbrir);else abrirPendiente();},0);
});

// ---------------------------------------------------------------- vista previa y aviso flotante
const desdePedido=p=>Math.max(new Date(p.creado_at).getTime()||0,p.programado_para?new Date(p.programado_para).getTime()||0:0);
const futuro=p=>!!p.programado_para&&new Date(p.programado_para).getTime()>Date.now();
const productos=p=>{const items=(p.items||[]).map(i=>(Number(i.cantidad)||1)+' × '+String(i.nombre||''));
 return items.slice(0,2).join(' · ')+(items.length>2?' · +'+(items.length-2)+' más':'');};
const lineaPedido=p=>(p.entrega==='envio'?'Envío':'Retiro en el local')+' · '+(PAGOS[p.medio_pago]||p.medio_pago||'')+' · Total '+pesos(p.total);
const cabecera=p=>String(p.codigo||'Pedido')+(String(p.cliente_nombre||'').trim()?' · '+String(p.cliente_nombre).trim():'');
const previaPedido=p=>'<span class="mgp-alert-preview"><b>'+esc(cabecera(p))+'</b><span>'+esc(lineaPedido(p))+'</span>'+
 (productos(p)?'<span>'+esc(productos(p))+'</span>':'')+'</span>';
async function previaReclamo(){
 const suc=servidor.ids.get(local());
 if(!suc||!window.GestLokSupabase||!online())return null;
 try{
  const {data,error}=await window.GestLokSupabase.rpc('gestlok_chat_panel_soporte',{p_sucursal:suc});
  const r=!error&&Array.isArray(data)?[...data].sort((a,b)=>String(b.creado_at).localeCompare(String(a.creado_at)))[0]:null;
  if(!r)return null;
  const det=String(r.detalle||''),tipo=({demora:'Demora',faltante:'Producto faltante',otro:'Otro reclamo',consulta:'Consulta para el gerente'})[r.tipo]||'Reclamo';
  return {texto:tipo+(r.pedido?' · '+r.pedido:'')+' · «'+(det.length>110?det.slice(0,107)+'…':det)+'»',
   html:'<span class="mgp-alert-preview"><b>'+esc(tipo)+(r.pedido?' · '+esc(r.pedido):'')+'</b><span>«'+esc(det.length>110?det.slice(0,107)+'…':det)+'»</span></span>'};
 }catch{return null;}
}
// Aviso flotante en cualquier pantalla de GESTLOK (Pagos Online, Stock, Inicio…), por encima de las ventanas abiertas.
// En la Central no se muestra (los pedidos ya están en pantalla), pero el sonido y la notificación sí.
function avisoFlotante({tipo='pedido',titulo,resumen,previa='',pedido=''}){
 if(api?.S?.view==='pedidos-clientes')return;
 let a=document.getElementById('mgp-global-alert');
 if(!a){a=document.createElement('aside');a.id='mgp-global-alert';a.className='mgp-global-alert mgp-global-alert-new';
  a.setAttribute('role','status');a.setAttribute('aria-live','polite');document.body.appendChild(a);}
 const activar=permiso()==='default'?'<button type="button" class="mgp-alert-permiso" data-gcc-permiso>🔔 Activar notificaciones</button>':'';
 a.innerHTML='<span class="mgp-alert-icon">'+chatIcon+'</span><div class="mgp-alert-copy"><strong>'+esc(titulo)+'</strong><small>'+esc(resumen)+'</small>'+previa+activar+'</div>'+
  '<button type="button" data-go="pedidos-clientes"'+(pedido?' data-gcc-pedido="'+esc(pedido)+'"':'')+' class="mgp-alert-open">'+(tipo==='reclamo'?'Responder':'Abrir pedido')+'</button>'+
  '<button type="button" class="mgp-alert-close" aria-label="Cerrar aviso" data-gcc-cerrar>×</button>';
 a.classList.remove('mgp-global-alert-new');void a.offsetWidth;a.classList.add('mgp-global-alert-new');
 try{navigator.vibrate?.([120,80,120]);}catch{/* sin vibración */}
}
// Capturado antes que la navegación de GESTLOK: así la Central sabe qué pedido abrir.
document.addEventListener('click',e=>{
 const t=e.target;if(!t?.closest)return;
 if(t.closest('[data-gcc-cerrar]')){ocultarAviso();return;}
 const abrir=t.closest('[data-gcc-pedido]');if(abrir)porAbrir=abrir.dataset.gccPedido||'';
 if(t.closest('#mgp-global-alert .mgp-alert-open'))setTimeout(ocultarAviso,0);
 if(t.closest('[data-gcc-permiso]')){e.preventDefault();void pedirPermiso();}
 if(t.closest('[data-gcc-probar]')){e.preventDefault();probarAviso();}
},true);
function ocultarAviso(){document.getElementById('mgp-global-alert')?.remove();}
async function pedirPermiso(){
 desbloquear();
 if(permiso()!=='default'){api?.render?.();return;}
 try{await Notification.requestPermission();}catch{/* navegador viejo */}
 document.querySelector('[data-gcc-permiso]')?.closest('.mgp-alert-permiso')?.remove();
 if(permiso()==='granted')probarAviso();
 if(api?.S?.view==='pedidos-clientes')api?.render?.();
}
function probarAviso(){
 desbloquear();sonar(0);
 void notificar('Así le van a llegar los pedidos','GESTLOK Chat · '+localName()+': aviso con sonido al llegar, a los 2 y a los 5 minutos sin abrir.',{tag:'gestlok-chat-prueba'});
 api?.toast?.('Sonido de prueba'+(permiso()==='granted'?' y notificación enviados':''));
}

// ---------------------------------------------------------------- seguimiento de pedidos sin abrir
const claveSeguimiento=()=>'gcc-avisos:'+tenant()+':'+local();
function cargarSeguimiento(){
 const k=claveSeguimiento();
 if(segClave===k)return true;
 segClave=k;seguimiento=new Map();
 try{const g=JSON.parse(sessionStorage.getItem(k)||'null');if(g&&typeof g==='object'){for(const [id,e] of Object.entries(g))seguimiento.set(id,Number(e)||0);return true;}}catch{/* sin almacenamiento */}
 return false; // primera vez en esta pestaña: los pedidos que ya estaban no suenan, sí sus próximos recordatorios
}
function guardarSeguimiento(){try{sessionStorage.setItem(segClave,JSON.stringify(Object.fromEntries(seguimiento)));}catch{/* nada */}}
const etapaDe=p=>{if(futuro(p))return 0;const m=(Date.now()-desdePedido(p))/MIN;return m>=ETAPAS[2].min?2:m>=ETAPAS[1].min?1:0;};
async function revisarPedidos(loc,e,antes,conocido){
 const suc=servidor.ids.get(loc);
 if(!suc)return;
 let lista=null;
 try{
  const {data,error}=await window.GestLokSupabase.rpc('gestlok_chat_panel_pedidos',{p_sucursal:suc,p_estado:'pendiente',p_limite:30});
  if(!error&&Array.isArray(data?.pedidos))lista=data.pedidos.filter(p=>p&&p.id&&p.estado==='pendiente');
 }catch{/* sin conexión */}
 if(e!==epoca||loc!==local())return;
 if(!lista){
  // Sin detalle: igual suena y avisa con la cantidad.
  if(antes!==null&&pendientes>antes)alertar([{etapa:0,p:null}]);
  return;
 }
 const eventos=[],ids=new Set();
 for(const p of lista){
  const id=String(p.id),etapa=etapaDe(p),previa=seguimiento.get(id);ids.add(id);
  if(previa===undefined){seguimiento.set(id,etapa);if(conocido)eventos.push({etapa,p});}
  else if(etapa>previa){seguimiento.set(id,etapa);eventos.push({etapa,p});}
 }
 for(const id of [...seguimiento.keys()])if(!ids.has(id))seguimiento.delete(id);
 guardarSeguimiento();
 if(eventos.length)alertar(eventos);
}
function alertar(eventos){
 const nivel=Math.max(...eventos.map(x=>x.etapa));
 sonar(nivel);
 const top=[...eventos].sort((a,b)=>b.etapa-a.etapa||(b.p?desdePedido(b.p):0)-(a.p?desdePedido(a.p):0))[0];
 for(const {etapa,p} of eventos){
  const titulo=ETAPAS[etapa].titulo+(localName()?' · '+localName():'');
  const cuerpo=p?cabecera(p)+'\n'+lineaPedido(p)+(productos(p)?'\n'+productos(p):'')+(etapa===2?'\nEl cliente ya recibió el aviso de alta demanda.':'')
   :pendientes+' pedido'+(pendientes===1?'':'s')+' por confirmar';
  void notificar(titulo,cuerpo,{tag:'gestlok-chat-'+(p?.id||'pedido'),pedido:p?.id||'',urgente:etapa>0});
 }
 const {etapa,p}=top;
 const resumen=localName()+' · '+(etapa===2?'el cliente ya recibió el aviso de alta demanda':etapa===1?'el cliente está esperando'
  :pendientes+' pedido'+(pendientes===1?'':'s')+' por confirmar');
 avisoFlotante({tipo:'pedido',titulo:ETAPAS[etapa].titulo,resumen,previa:p?previaPedido(p):'',pedido:p?.id||''});
}
async function alertarReclamo(){
 sonar(0);
 const resumen=localName()+' · '+reclamos+' pendiente'+(reclamos===1?'':'s')+' de respuesta';
 avisoFlotante({tipo:'reclamo',titulo:'¡Consulta o reclamo de cliente!',resumen});
 const mia=epoca,loc=local(),r=await previaReclamo();
 void notificar('¡Consulta o reclamo de cliente!'+(localName()?' · '+localName():''),r?r.texto:resumen,{tag:'gestlok-chat-reclamo'});
 const a=document.getElementById('mgp-global-alert');
 if(r&&a&&mia===epoca&&loc===local()&&a.querySelector('.mgp-alert-open')?.textContent==='Responder')
  a.querySelector('.mgp-alert-copy small')?.insertAdjacentHTML('afterend',r.html);
}

// La primera vez en esta pestaña no suenan los pedidos que ya estaban; sí lo que llegue después y sus recordatorios.
async function seguir(loc,e,previos){
 const conocido=cargarSeguimiento();
 if(pendientes||seguimiento.size)await revisarPedidos(loc,e,previos,conocido);
 else if(!conocido)guardarSeguimiento();
}
function actualizar(n,r=reclamos){
 const antesReclamos=reclamosVistos;
 pendientes=Math.max(0,Number(n)||0);vistos=pendientes;
 reclamos=Math.max(0,Number(r)||0);reclamosVistos=reclamos;
 indicadores();
 if(antesReclamos!==null&&reclamos>antesReclamos)void alertarReclamo();
 if(!pendientes&&!reclamos)ocultarAviso();
}
async function consultar(){
 if(!rolOk()||!online()||!window.GestLokSupabase)return;
 // Empresas o locales sin GESTLOK Chat: no se consulta cada 15 segundos.
 if(servidor.tenant===tenant()&&!servidor.locales.has(local()))return;
 if(servidor.tenant!==tenant())return void descubrir();
 const loc=local(),e=epoca;ultimaConsulta=Date.now();
 try{
  const {data,error}=await window.GestLokSupabase.rpc('gestlok_chat_panel_inicio');
  if(error||e!==epoca||loc!==local())return;
  const t=tenant(),antes=servidor.locales.has(loc);
  leer(data,t);
  if(!servidor.locales.has(loc)){if(antes)api?.render?.();return;}
  const s=(data?.sucursales||[]).find(x=>x.local_id===loc);
  const previos=vistos;
  actualizar(s?s.pendientes:0,s?s.reclamos:0);
  await seguir(loc,e,previos);
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
 if(panel){abrirPendiente();return;}
 const loc=local();
 cargarPanel().then(()=>{
  if(panel||loc!==local()||!anfitrion)return;
  panelLocal=loc;
  const abrir=porAbrir;porAbrir='';
  panel=window.GestLokChatPanel.montar(anfitrion,{sb:window.GestLokSupabase,local:loc,embebido:true,abrir,
   alCambiarPendientes:(l,n)=>{if(l===local())actualizar(n);}});
 }).catch(()=>{lugar.innerHTML='<p class="gcc-aviso">No se pudo abrir la Central de mensajes. Revisá tu conexión y volvé a entrar.</p>';});
}
// Sonido y notificaciones del gerente: activar, estado y prueba.
function barraAvisos(){
 const p=permiso();
 const texto=p==='granted'?'🔔 Sonido y notificaciones activados: al llegar cada pedido y a los 2 y 5 minutos si sigue sin abrir.'
  :p==='denied'?'🔕 Las notificaciones están bloqueadas en este navegador. Habilitalas desde el candado junto a la dirección; mientras tanto suena y aparece el aviso en pantalla.'
  :p==='sin-soporte'?'🔔 Este navegador no muestra notificaciones: los pedidos llegan con sonido y aviso en pantalla.'
  :'🔔 Activá el sonido y las notificaciones para enterarte de cada pedido aunque estés en otra sección de GESTLOK.';
 return '<div class="gcc-avisos'+(p==='granted'?' activos':'')+'" role="note"><span>'+texto+'</span>'+
  (p==='default'?'<button type="button" class="gcc-avisos-boton principal" data-gcc-permiso>Activar</button>':'')+
  '<button type="button" class="gcc-avisos-boton" data-gcc-probar>Probar aviso</button></div>';
}
function view(){
 if(!allowed())return '';
 queueMicrotask(colocar);
 const l=local();
 return '<section class="gcc" aria-label="Central de mensajes de '+esc(localName())+'">'+
  '<div class="gcc-cab"><h2>Central de mensajes</h2><small>GESTLOK Chat · '+esc(localName())+' · asistente y pedidos por chat</small>'+
  '<a href="/chat/panel/?local='+encodeURIComponent(l)+'" target="_blank" rel="noopener">Abrir aparte</a></div>'+
  (online()?'':'<p class="gcc-aviso">Sin conexión: la Central se actualiza cuando vuelva internet.</p>')+barraAvisos()+
  '<div data-gcc-lugar></div></section>';
}
function subscribe(loc,push){
 if(!rolOk()||!loc)return;
 void consultar();
 // Con GESTLOK en segundo plano también se revisa (cada 45 s como máximo) para que suenen y lleguen las notificaciones.
 const t=setInterval(()=>{if(!document.hidden||Date.now()-ultimaConsulta>=45000)void consultar();},PAUSA_MS);
 const foco=()=>{void consultar();};
 window.addEventListener('focus',foco);
 push(()=>{clearInterval(t);window.removeEventListener('focus',foco);ocultarAviso();});
}
function reset(){
 epoca++;pendientes=0;vistos=null;reclamos=0;reclamosVistos=null;ocultarAviso();servidor={tenant:'',locales:new Map(),ids:new Map()};buscando='';
 seguimiento=new Map();segClave='';porAbrir='';
 if(panel){panel.destruir();panel=null;}anfitrion=null;panelLocal='';
}
function attach(h){if(!api)api=h;}

window.GestLokMiGustoOrders=Object.freeze({attach,subscribe,reset,view,permitido:allowed,pendingCount,navBadge,quickAccess,
 _test:{actualizar,consultar,colocar,descubrir,sonar,estado:()=>({pendientes,vistos,montado:!!panel,locales:[...servidor.locales.keys()],seguimiento:Object.fromEntries(seguimiento)})}});
})();

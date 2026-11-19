/* GESTLOK Chat · Central de mensajes dentro de GESTLOK (Mi Gusto: Munro y Don Torcuato, cada local por separado).
 * Reemplaza a «Pedidos WhatsApp». Mantiene la misma interfaz que usa app.js (window.GestLokMiGustoOrders):
 * menú, atajo del Inicio, contador, aviso flotante de pedidos nuevos y la sección.
 * La sección monta el panel de GESTLOK Chat (/chat/panel/panel.js) dentro de un shadow DOM que se conserva entre
 * redibujos de GESTLOK: no se recarga ni pierde lo que se está escribiendo. Los permisos los decide la base.
 */
(()=>{
'use strict';
const TENANT='cb0dc04a-9a13-434f-a3d0-47f1d8f39670';
const LOCALS={munro:'Munro',torcuato:'Don Torcuato'};
const PAUSA_MS=15000;
const VERSION_PANEL='20261119d';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const chatIcon='<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16v11H9l-5 4z"/><path d="M8 9.5h8M8 12.5h5"/></svg>';
let api=null,pendientes=0,vistos=null,anfitrion=null,panel=null,panelLocal='',cargaPanel=null,epoca=0;

const local=()=>api?.S?.local;
const localName=()=>LOCALS[local()]||'';
// Mismas reglas que tenía «Pedidos WhatsApp»: dueño, gerente de ese local o creadora con escritura.
const allowed=()=>!!api && api.S?.me?.tenant_id===TENANT && local() in LOCALS &&
  !window.GestLokCreatorSupport?.previewRol?.() &&
  (api.miRol()==='dueno'||(api.miRol()==='gerente'&&api.misLocales().includes(local()))||
   (api.miRol()==='creadora'&&!api.S?.ro));
const online=()=>!!api&&!api.S?.offline&&navigator.onLine!==false;

function quickAccess(){
 if(!allowed())return '';
 return '<nav class="mgp-shift-quick" aria-label="Atajos de turno de Mi Gusto">'+
  '<button type="button" data-go="cierre-online" class="mgp-shift-button"><span class="mgp-shift-symbol" aria-hidden="true">▤</span><span><strong>Pagos Online</strong><small>Movimientos y cierre</small></span></button>'+
  '<button type="button" data-go="pedidos-clientes" class="mgp-shift-button">'+chatIcon+'<span><strong>Central de mensajes</strong><small><span data-gcc-quick-count>'+pendientes+'</span> pedidos en preparación</small></span></button>'+
 '</nav>';
}
function navBadge(){
 return allowed()&&pendientes?'<span class="mgp-nav-count" data-gcc-nav-count aria-label="'+pendientes+' pedidos en preparación">'+Math.min(99,pendientes)+'</span>':'';
}
const pendingCount=()=>allowed()?pendientes:0;

function indicadores(){
 if(!allowed())return ocultarAviso();
 const nav=document.querySelector('#snav button[data-go="pedidos-clientes"]');
 if(nav){
  let b=nav.querySelector('[data-gcc-nav-count]');
  if(pendientes){
   if(!b){b=document.createElement('span');b.className='mgp-nav-count';b.dataset.gccNavCount='';nav.appendChild(b);}
   b.textContent=String(Math.min(99,pendientes));b.setAttribute('aria-label',pendientes+' pedidos en preparación');
  }else b?.remove();
 }
 document.querySelectorAll('[data-gcc-quick-count]').forEach(e=>{e.textContent=String(pendientes);});
 window.GestLokMobileDock?.refresh?.();
}
function avisoNuevo(){
 // Aviso flotante en cualquier pantalla de GESTLOK (no se muestra si ya se está en la Central).
 if(api?.S?.view==='pedidos-clientes')return;
 let a=document.getElementById('mgp-global-alert');
 if(!a){a=document.createElement('aside');a.id='mgp-global-alert';a.className='mgp-global-alert mgp-global-alert-new';
  a.setAttribute('role','status');a.setAttribute('aria-live','polite');document.body.appendChild(a);}
 a.innerHTML='<span class="mgp-alert-icon">'+chatIcon+'</span><div class="mgp-alert-copy"><strong>¡Pedido nuevo por chat!</strong><small>'+
  esc(localName())+' · '+pendientes+' pedido'+(pendientes===1?'':'s')+' en preparación</small></div>'+
  '<button type="button" data-go="pedidos-clientes" class="mgp-alert-open">Ver pedidos</button>';
 try{navigator.vibrate?.([120,80,120]);}catch{/* sin vibración */}
}
function ocultarAviso(){document.getElementById('mgp-global-alert')?.remove();}

function actualizar(n){
 const antes=vistos;
 pendientes=Math.max(0,Number(n)||0);vistos=pendientes;
 indicadores();
 if(antes!==null&&pendientes>antes)avisoNuevo();
 if(!pendientes)ocultarAviso();
}
async function consultar(){
 if(!allowed()||!online()||!window.GestLokSupabase)return;
 const loc=local(),e=epoca;
 try{
  const {data,error}=await window.GestLokSupabase.rpc('gestlok_chat_panel_inicio');
  if(error||e!==epoca||loc!==local())return;
  const s=(data?.sucursales||[]).find(x=>x.local_id===loc);
  actualizar(s?s.pendientes:0);
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
  '<div data-gcc-lugar></div></section>';
}
function subscribe(loc,push){
 if(!allowed()||!(loc in LOCALS))return;
 void consultar();
 const t=setInterval(()=>{if(!document.hidden)void consultar();},PAUSA_MS);
 const foco=()=>{void consultar();};
 window.addEventListener('focus',foco);
 push(()=>{clearInterval(t);window.removeEventListener('focus',foco);ocultarAviso();});
}
function reset(){
 epoca++;pendientes=0;vistos=null;ocultarAviso();
 if(panel){panel.destruir();panel=null;}anfitrion=null;panelLocal='';
}
function attach(h){if(!api)api=h;}

window.GestLokMiGustoOrders=Object.freeze({attach,subscribe,reset,view,permitido:allowed,pendingCount,navBadge,quickAccess,
 _test:{actualizar,consultar,colocar,estado:()=>({pendientes,vistos,montado:!!panel})}});
})();

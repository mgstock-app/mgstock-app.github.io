/* GESTLOK WAI: private operator workspace; the URL is never an access token. */
(() => {
'use strict';
const root=document.getElementById('wai-root');
const valid=s=>typeof s==='string'&&s.length>=3&&s.length<=60&&/^[a-z0-9]+(-[a-z0-9]+)*$/.test(s);
const direct=/^\/gestlok-wai-([a-z0-9-]+)\/?$/.exec(location.pathname)?.[1];
const query=new URLSearchParams(location.search).get('local');
const slug=direct||query||null;
const node=(tag,attrs={},...children)=>{
 const e=document.createElement(tag);
 for(const [k,v] of Object.entries(attrs)){if(v==null||v===false)continue;if(k==='class')e.className=v;else if(k==='text')e.textContent=v;else if(k.startsWith('on'))e.addEventListener(k.slice(2),v);else e.setAttribute(k,v===true?'':String(v));}
 for(const c of children.flat())if(c!=null&&c!==false)e.append(c instanceof Node?c:document.createTextNode(String(c)));
 return e;
};
const button=(text,fn,cls='btn',attrs={})=>node('button',{type:'button',class:cls,onclick:fn,...attrs},text);
const brand=subtitle=>node('div',{class:'brand'},node('img',{src:'/chat/gestlok-monograma.svg',alt:''}),node('div',{},node('strong',{},'GESTLOK ',node('span',{},'WAI')),node('small',{},subtitle||'Espacio de atención')));
const time=t=>new Date(t).toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'});
const labels={sin_conector:'Conector pendiente',sin_senal:'Sin señal',conectado:'WhatsApp · señal comprobada',verificando:'Vinculación sin verificar',reconectando:'Reconectando',qr:'Esperando escaneo del QR',qr_vencido:'QR vencido',desconectado:'Desconectado',pausado:'Pausado'};
const access=(title,msg,...extra)=>root.replaceChildren(node('section',{class:'access'},brand(),node('h1',{},title),node('p',{},msg),...extra));
if(slug&&!valid(slug)){access('Enlace inválido','Revisá el enlace del local.');return;}
let sb;
try{const C=window.GESTLOK_CHAT_CONFIG;sb=window.supabase.createClient(C.url,C.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});}
catch{access('Sin conexión','No se pudo iniciar el servicio. Recargá la página.');return;}
async function rpc(name,args={}){const r=await sb.rpc('gestlok_chat_'+name,args);if(r.error)throw Error(r.error.message||'No se pudo completar la consulta');return r.data;}
let sessionLocal=null,portal=null,rows=[],chats=[],selected=null,claimed=false,running=false,destroyed=false,navigatorTimer=0,settingsPanel=null,drawerKind='',lastSignature='',lastThreadSignature='',drafts=new Map(),pendingUnknown=new Map(),generation=0;
const readBusy=new Set();
let messageActionHost,actionDraft=null,actionBusy=false,orderHost,orderStatus,orderBusy=false,orderSignature="",orderMenuOpen=false;
let shell,notice,list,search,unreadSummary,thread,head,historyNotice,compose,textarea,send,overlay,drawerBody,drawerTitle,drawerStatus;
let connectionList=null,authorizationHost=null,authorizationDraft=null;
const trialEnvironment=()=>window.GESTLOK_CHAT_CONFIG?.entorno==='prueba'||window.GESTLOK_CHAT_CONFIG?.entorno==='testing';
const portalHref=s=>location.hostname.endsWith('.vercel.app')?'/chat/wai/?local='+encodeURIComponent(s):'/gestlok-wai-'+encodeURIComponent(s)+'/';
function login(){
 const email=node('input',{type:'email',autocomplete:'email',required:true}),password=node('input',{type:'password',autocomplete:'current-password',required:true}),status=node('p',{role:'status',class:'hint'});
 const form=node('form',{onsubmit:async e=>{e.preventDefault();status.textContent='Ingresando…';submit.disabled=true;try{const r=await sb.auth.signInWithPassword({email:email.value.trim(),password:password.value});password.value='';if(r.error)throw Error(r.error.code==='email_not_confirmed'?'Confirmá tu correo o solicitá un nuevo enlace.':'Revisá el email y la contraseña.');await init();}catch(x){status.textContent=x.message;}finally{submit.disabled=false;}}});
 const submit=node('button',{class:'btn primary',type:'submit'},'Ingresar');
 form.append(node('label',{},'Email',email),node('label',{},'Contraseña',password),submit);
 const google=button('Ingresar con Google',async()=>{try{const r=await sb.auth.signInWithOAuth({provider:'google',options:{redirectTo:location.origin+'/chat/wai/'+(slug?'?local='+encodeURIComponent(slug):'')}});if(r.error)throw r.error;}catch{status.textContent='No se pudo iniciar con Google. Ingresá desde GESTLOK.';}});
 const resend=button('Reenviar confirmación de correo',async()=>{
  if(!email.value.trim()||!email.checkValidity()){status.textContent='Escribí el email de tu cuenta.';return;}
  resend.disabled=true;try{await sb.auth.resend({type:'signup',email:email.value.trim(),options:{emailRedirectTo:location.origin+'/chat/wai/'}});status.textContent='Si la confirmación está pendiente, revisá tu correo y spam. No compartas el enlace.';}catch{status.textContent='No se pudo solicitar. Reintentá más tarde.';}finally{setTimeout(()=>resend.disabled=false,60000);}
 });
 access('Ingresá al espacio del local',trialEnvironment()?'Usá tu cuenta de prueba. El acceso se comprueba para esta sucursal.':'Usá tu cuenta de GESTLOK. El acceso se comprueba para esta sucursal.',google,form,resend,status,node('a',{href:'/'},'Volver a GESTLOK'));
}
async function init(){
 const mine=++generation;destroyed=false;
 try{
  const {data,error}=await sb.auth.getUser();
  if(mine!==generation)return;
  if(error||!data?.user)return login();
  const result=await rpc('wai_portal_inicio',{p_slug:slug});
  if(mine!==generation)return;
  portal=result;const locals=Array.isArray(result?.locales)?result.locales:[];
  if(!slug){
   const links=locals.map(s=>node('p',{},node('a',{class:'btn',href:portalHref(s.slug)},s.empresa+' · '+s.nombre)));
   const setupBox=trialEnvironment()&&result.administradora===true?node('section',{class:'connection-card'},node('h2',{},'Configurar línea de ensayo'),node('p',{class:'hint'},'Solo números de prueba, nunca los números comerciales.'),button('Registrar número de ensayo',()=>void registerTrial(setupBox),'btn primary')):null;
   access('Elegí tu local',links.length?'Tus espacios WAI autorizados.':'No tenés un espacio WAI habilitado en la empresa activa.',...links,setupBox,button('Cerrar sesión',()=>void logout()),node('a',{href:'/'},'Volver a GESTLOK'));return;
  }
  sessionLocal=locals.find(s=>s.slug===slug&&['gestionar','configurar'].includes(s.nivel));
  if(!sessionLocal){access('Sin acceso a este local','Tu cuenta no tiene un espacio WAI autorizado aquí. Pedile acceso a la administración.',node('a',{href:'/chat/wai/'},'Mis locales'));return;}
  if(location.pathname==='/chat/wai/'&&query===slug){history.replaceState(null,'',portalHref(slug));}
  renderShell();await refresh();
  clearInterval(navigatorTimer);navigatorTimer=setInterval(()=>{if(!document.hidden)void refresh();},5000);
 }catch{if(mine===generation)access('No pudimos abrir WAI','Revisá la conexión o volvé a ingresar. Este espacio puede estar pendiente de publicación.',button('Reintentar',()=>void init()));}
}
async function registerTrial(box){
 if(!trialEnvironment()||portal?.administradora!==true)return;
 const generationAtStart=generation;
 box.replaceChildren(node('p',{class:'hint'},'Consultando tus sucursales de prueba…'));
 try{
  const info=await rpc('admin_whatsapp_premium',{p_accion:'listar'});
  if(generationAtStart!==generation||!box.isConnected)return;
  const locals=(info?.locales||[]).filter(l=>typeof l.empresa==='string'&&/\(prueba\)/i.test(l.empresa));
  const select=node('select',{'aria-label':'Local de ensayo',required:true},...locals.map((l,i)=>node('option',{value:i},l.empresa+' · '+l.nombre)));
  const tel=node('input',{type:'tel',placeholder:'+54911…',required:true,autocomplete:'off'});
  const status=node('p',{role:'status',class:'hint'});
  const submit=node('button',{type:'submit',class:'btn primary',disabled:!locals.length},'Registrar y abrir local');
  const form=node('form',{onsubmit:async e=>{
   e.preventDefault();const local=locals[Number(select.value)],number=tel.value.trim();
   if(!local||!/^\+[1-9]\d{7,14}$/.test(number)){status.textContent='Ingresá el número de ensayo en formato internacional.';return;}
   if(!confirm('¿Registrar una línea de ensayo autorizada? No uses el número comercial de ningún local.'))return;
   submit.disabled=true;
   try{await rpc('admin_whatsapp_premium',{p_accion:'agregar',p_tenant:local.tenant_id,p_local:local.local_id,p_numeros:[number]});await init();}
   catch(e){status.textContent=e.message;submit.disabled=false;}
  }},node('label',{},'Sucursal de prueba',select),node('label',{},'Número personal de ensayo',tel),submit,status);
  box.replaceChildren(node('h2',{},'Registrar línea de ensayo'),form);
 }catch(e){box.replaceChildren(node('p',{class:'error'},e.message),button('Reintentar',()=>void registerTrial(box)));}
}
function clearPrivate(){
 generation++;destroyed=true;clearInterval(navigatorTimer);settingsPanel?.destruir();settingsPanel=null;sessionLocal=null;rows=[];chats=[];drafts.clear();pendingUnknown.clear();readBusy.clear();actionDraft=null;actionBusy=false;orderBusy=false;orderSignature='';lastSignature='';lastThreadSignature='';selected=null;root.replaceChildren();
}
async function logout(){clearPrivate();await sb.auth.signOut();login();}
function renderShell(){
 const label=sessionLocal.empresa+' · '+sessionLocal.nombre;
 document.title=label+' · GESTLOK WAI';
 notice=node('div',{class:'notice',role:'status'},'Verificando WhatsApp…');
 search=node('input',{class:'search',type:'search',placeholder:'Buscar conversación', 'aria-label':'Buscar conversación',oninput:()=>renderList()});
 list=node('div',{class:'chat-list','aria-label':'Conversaciones'});
 unreadSummary=node('span',{class:'unread-summary','aria-live':'polite',hidden:true});
 head=node('div',{class:'chat-head'});historyNotice=node('div',{class:'history-notice',role:'status',hidden:true});thread=node('div',{class:'thread',role:'log','aria-label':'Mensajes',onscroll:()=>void markVisibleRead()});
 textarea=node('textarea',{placeholder:'Escribí un mensaje',rows:'1',maxlength:'1000','aria-label':'Escribí un mensaje',oninput:()=>{if(selected)drafts.set(selected,textarea.value);updateComposer();},onkeydown:composerKey});
 send=node('button',{type:'submit',class:'btn primary',disabled:true},'Enviar');
 messageActionHost=node('div',{class:'message-action-host'});
 orderHost=node('div',{class:'order-host',hidden:true});orderStatus=node('p',{class:'hint order-status',role:'status',hidden:true});
 compose=node('form',{class:'compose',hidden:true,onsubmit:async e=>{e.preventDefault();await respond();}},textarea,send);
 drawerBody=node('div',{class:'drawer-body'});drawerTitle=node('h2');drawerStatus=node('p',{role:'status',class:'hint'});
 overlay=node('div',{class:'overlay',hidden:true},node('section',{class:'drawer',role:'dialog','aria-modal':'true','aria-label':'Herramientas del local'},node('header',{class:'drawer-head'},drawerTitle,button('×',closeDrawer,'icon-btn',{'aria-label':'Cerrar'})),drawerBody));
 shell=node('main',{class:'shell'},node('header',{class:'topbar'},brand(label),node('div',{class:'top-actions'},
  button('📱 Vincular',()=>openDrawer('conexion'),'toolbar-btn',{'aria-label':'Vincular WhatsApp'}),
  button('⚙',()=>openDrawer('config'),'icon-btn',{'aria-label':'Configuración del local',title:'Configuración'}),
  button('Salir',()=>void logout(),'toolbar-btn',{'aria-label':'Cerrar sesión'}))),notice,
  node('div',{class:'workspace'},node('aside',{class:'inbox'},node('div',{class:'inbox-head'},node('p',{class:'eyebrow'},'Bandeja del local'),node('h2',{class:'inbox-title'},'Conversaciones',unreadSummary),search),list),
   node('section',{class:'chat','aria-label':'Conversación seleccionada'},head,historyNotice,thread,messageActionHost,orderHost,orderStatus,compose)),overlay);
 root.replaceChildren(shell);renderList();renderThread(true);
}
function selection(id){
 cancelMessageAction();
 if(selected&&textarea)drafts.set(selected,textarea.value);
 selected=id;orderSignature='';orderMenuOpen=false;if(orderStatus){orderStatus.hidden=true;orderStatus.textContent='';}shell.classList.toggle('selected',!!id);textarea.value=drafts.get(id)||'';lastThreadSignature='';renderList();renderThread(true);void markVisibleRead();
}
function displayName(c){return c?.alias||c?.nombre_agenda||c?.cliente||'';}
function unreadIds(c){return (c?.mensajes||[]).filter(m=>m.direccion==='entrada'&&m.leido===false).map(m=>m.id);}
function renderList(){
 if(!list)return;
 const total=chats.reduce((n,c)=>n+unreadIds(c).length,0);
 if(unreadSummary){unreadSummary.hidden=!total;unreadSummary.textContent=total?total+' sin leer':'';}
 const value=search.value.trim().toLowerCase();const matching=chats.filter(c=>[c.cliente,c.alias,c.nombre_agenda].some(n=>String(n||'').toLowerCase().includes(value))||c.mensajes?.some(m=>String(m.texto).toLowerCase().includes(value)));
 list.replaceChildren(...(matching.length?matching.slice().sort((a,b)=>Number(!!b.reclamo_pendiente)-Number(!!a.reclamo_pendiente)||Number(!!b.pedido_pendiente)-Number(!!a.pedido_pendiente)||Number(!!b.atencion_pendiente)-Number(!!a.atencion_pendiente)).map(c=>{
  const count=unreadIds(c).length;
  return node('button',{class:'chat-row'+(count?' unread':'')+(c.reclamo_pendiente?' complaint':c.pedido_pendiente?' order-pending':c.atencion_pendiente?' needs-human':''),type:'button','aria-current':String(c.id===selected),'aria-label':displayName(c)+(displayName(c)!==c.cliente?' · '+c.cliente:'')+(count?' · '+count+' mensaje(s) sin leer':'')+(c.reclamo_pendiente?' · Reclamo pendiente':''),onclick:()=>selection(c.id)},node('span',{class:'avatar'},'WA'),node('div',{class:'preview'},node('strong',{},displayName(c)),displayName(c)!==c.cliente?node('span',{class:'contact-number'},c.cliente):null,node('small',{},c.mensajes?.at(-1)?.texto||'Esperando primer mensaje de prueba'),c.reclamo_pendiente?node('span',{class:'complaint-label'},'⚠ Reclamo pendiente'):c.pedido_pendiente?node('span',{class:'pending-order-label'},'Pedido para confirmar'):c.atencion_pendiente?node('span',{class:'human-label'},'Solicita atención humana'):null,c.cerrado_at?node('span',{class:'history-label'},'Finalizado · historial guardado'):c.archivado?node('span',{class:'history-label'},'Historial guardado'):c.conexion_activa===false?node('span',{class:'history-label'},'Sin conexión · historial guardado'):null),count?node('span',{class:'unread-badge',title:count+' mensaje(s) sin leer','aria-hidden':'true'},count):null);
 }):[node('p',{class:'hint',style:'padding:12px'},value?'No hay coincidencias.':'Todavía no hay conversaciones autorizadas.')]));
}
async function markVisibleRead(){
 // Merely polling or opening the connection/configuration drawer is not reading.
 if(!selected||document.hidden||drawerKind||!sessionLocal||destroyed||!thread||!thread.isConnected||thread.scrollHeight-thread.scrollTop-thread.clientHeight>100||readBusy.has(selected))return;
 const c=chats.find(x=>x.id===selected),ids=unreadIds(c).slice(0,100);
 if(!ids.length)return;
 const id=c.id,mine=generation,local=sessionLocal.id;
 readBusy.add(id);
 try{
  const n=await rpc('wai_marcar_leidos',{p_sucursal:local,p_piloto:id,p_mensajes:ids});
  if(mine!==generation||destroyed||n!==ids.length)return;
  const latest=chats.find(x=>x.id===id),seen=new Set(ids);
  if(latest)for(const m of latest.mensajes||[])if(seen.has(m.id))m.leido=true;
  renderList();
 }catch{/* Keep the unread indicator if the server could not confirm it. */}
 finally{if(mine===generation)readBusy.delete(id);}
}
function empty(title,txt){return node('div',{class:'empty'},node('div',{class:'mark','aria-hidden':'true'},'✉'),node('h2',{},title),node('p',{},txt));}
function composerKey(e){
 if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&e.keyCode!==229){e.preventDefault();if(!send.disabled)void respond();}
}
function messageStatus(m){
 if(m.direccion==='entrada')return 'Recibido';
 if(m.estado==='aceptado')return m.entregado?'✓✓ Entregado':'✓ Enviado';
 return {pendiente:'En cola',cancelado:'Cancelado por atención manual',reservado:'Enviando',incierto:'Envío incierto · no repetir'}[m.estado]||'Sin confirmar';
}
function actionStatus(m){
 if(m.accion_estado==='pendiente'||m.accion_estado==='reservado')return m.accion_tipo==='editar'?'Editando…':'Eliminando…';
 if(m.accion_estado==='incierto')return 'Cambio no confirmado · no repetir';
 if(m.accion_estado==='enviado'&&!m.accion_entregada)return m.accion_tipo==='editar'?'Edición enviada':'Eliminación enviada';
 if(m.eliminado)return 'Eliminado';
 if(m.editado)return 'Editado';
 return '';
}
function messageTime(t){
 const d=new Date(t),now=new Date();
 return d.toLocaleDateString('es-AR')===now.toLocaleDateString('es-AR')?time(t):d.toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit',year:'2-digit'})+' · '+time(t);
}
function historyLabel(c){
 if(c.archivado)return 'Historial guardado · ensayo finalizado. Autorizá nuevamente el contacto para responder.';
 if(c.cerrado_at)return 'Conversación finalizada · el próximo mensaje abrirá una atención nueva. Historial conservado.';
 if(c.conexion_activa===false)return 'Historial guardado · WhatsApp sin conexión verificada. Podés leer los mensajes.';
 return '';
}
function renderMessage(c,m){
 const outgoing=m.direccion==='salida',status=messageStatus(m),change=actionStatus(m);
 const actions=[];
 if(m.puede_editar)actions.push(button('Editar',()=>openMessageAction(c.id,m,'editar'),'msg-action',{'aria-label':'Editar mensaje',title:'Editar mensaje'}));
 if(m.puede_eliminar)actions.push(button('Eliminar',()=>openMessageAction(c.id,m,'eliminar'),'msg-action danger',{'aria-label':'Eliminar mensaje',title:'Eliminar mensaje'}));
 return node('div',{class:'bubble'+(outgoing?' out':'')+(m.eliminado?' deleted':'' )},
   !m.eliminado&&m.imagen_url?node('a',{href:m.imagen_url,target:'_blank',rel:'noopener noreferrer','aria-label':'Ampliar foto de la carta'},node('img',{class:'wai-menu-photo',src:m.imagen_url,alt:'Foto de la carta',loading:'lazy',referrerpolicy:'no-referrer'})):null,
   m.imagen_url&&!m.eliminado?null:node('span',{class:'message-text'},m.eliminado?'Mensaje eliminado':m.interaccion?.pregunta||m.texto),
   !m.eliminado&&m.interaccion?node('div',{class:'wai-option-list'},...(m.interaccion.opciones||[]).map(o=>node('span',{class:'wai-option'+(m.interaccion.seleccion===o.id?' chosen':'')},(m.interaccion.seleccion===o.id?'✓ ':'○ ')+o.label))):null,
   node('small',{class:'message-meta'},messageTime(m.fecha),' · ',node('span',{class:m.entregado?'delivery-confirmed':'','aria-label':status},status),m.origen==='telefono'?' · Teléfono':m.origen==='valoracion'?' · Encuesta':m.origen==='opcion'?' · Opción de WhatsApp':null,change?' · '+change:null),
   actions.length?node('div',{class:'message-actions'},...actions):null);
}
function cancelMessageAction(){
 actionDraft=null;messageActionHost?.replaceChildren();
}
function openMessageAction(chat,m,kind){
 if(actionBusy||selected!==chat||kind==='editar'&&!m.puede_editar||kind==='eliminar'&&!m.puede_eliminar)return;
 const status=node('p',{class:'hint',role:'status'});
 const input=kind==='editar'?node('textarea',{rows:2,maxlength:1000,'aria-label':'Mensaje corregido'}):null;
 if(input)input.value=m.texto;
 const submit=node('button',{type:'submit',class:'btn '+(kind==='editar'?'primary':'danger')},kind==='editar'?'Guardar edición':'Eliminar para todos');
 const form=node('form',{class:'message-action-form',onsubmit:async e=>{
  e.preventDefault();if(actionBusy||actionDraft?.id!==m.id||selected!==chat)return;
  const text=input?.value.trim()||null;if(kind==='editar'&&(!text||text.length>1000)){status.textContent='Escribí el mensaje corregido.';return;}
  const mine=generation;actionBusy=true;submit.disabled=true;
  try{
   const ok=await rpc('wai_mensaje_accion',{p_sucursal:sessionLocal.id,p_piloto:m.piloto||chat,p_mensaje:m.id,p_accion:kind,p_texto:text});
   if(ok!==true)throw Error('No se confirmó la solicitud.');
   if(mine===generation){cancelMessageAction();await refresh();}
  }catch(e){if(mine===generation&&form.isConnected)status.textContent=e.message;}
  finally{if(mine===generation){actionBusy=false;submit.disabled=false;}}
 }},node('strong',{},kind==='editar'?'Editar mensaje':'Eliminar mensaje'),input||node('p',{class:'hint'},'Se solicitará la eliminación para todos en WhatsApp. La otra persona puede haber leído el mensaje.'),status,node('div',{class:'message-action-buttons'},submit,button('Cancelar',()=>cancelMessageAction(),'btn')));
 actionDraft={id:m.id,chat,kind};messageActionHost.replaceChildren(form);if(input)input.focus();else submit.focus();
}
function openAlias(c){
 if(actionBusy||selected!==c.id||!messageActionHost)return;
 const input=node('input',{type:'text',maxlength:100,placeholder:'Ej.: Cliente frecuente','aria-label':'Alias del contacto',autocomplete:'off'});
 input.value=c.alias||'';
 const status=node('p',{class:'hint',role:'status'});
 const submit=node('button',{type:'submit',class:'btn primary'},'Guardar alias');
 const save=async value=>{
  if(actionBusy||selected!==c.id||actionDraft?.id!=='alias:'+c.id)return;
  const mine=generation;actionBusy=true;submit.disabled=true;
  try{
   const ok=await rpc('wai_contacto_alias',{p_sucursal:sessionLocal.id,p_piloto:c.id,p_alias:value});
   if(ok!==true)throw Error('No se confirmó el alias.');
   if(mine!==generation)return;
   const current=chats.find(x=>x.id===c.id);if(current)current.alias=value||null;
   cancelMessageAction();renderList();renderThread(true);await refresh();
  }catch(e){if(mine===generation&&status.isConnected)status.textContent=e.message;}
  finally{if(mine===generation){actionBusy=false;submit.disabled=false;}}
 };
 const form=node('form',{class:'message-action-form alias-form',onsubmit:e=>{e.preventDefault();void save(input.value.trim()||null);}},
  node('strong',{},'Alias del contacto'),node('p',{class:'hint'},'Número: '+c.cliente),
  c.nombre_agenda?node('p',{class:'hint'},'Nombre sincronizado de WhatsApp: '+c.nombre_agenda):node('p',{class:'hint'},'WhatsApp todavía no compartió un nombre agendado.'),
  node('label',{},'Alias dentro de GESTLOK WAI',input),status,
  node('div',{class:'message-action-buttons'},submit,c.alias?button('Quitar alias',()=>void save(null),'btn'):null,button('Cancelar',()=>cancelMessageAction(),'btn')));
 actionDraft={id:'alias:'+c.id,chat:c.id,kind:'alias'};messageActionHost.replaceChildren(form);input.focus();
}
const orderLabels={preparacion:'Recibido · en preparación',listo:'Listo para retirar',en_camino:'En camino',entregado:'Entregado al cliente'};
function orderReady(c){return c?.puede_responder===true&&rows.some(r=>r.id===c.linea&&r.estado==='conectado')&&Date.parse(c.vence_at)>Date.now();}
function orderMessage(text){if(orderStatus){orderStatus.hidden=!text;orderStatus.textContent=text;}}
async function orderAction(c,accion,pedido=null,extra={}){
 if(orderBusy||selected!==c.id||!sessionLocal)return;
 if(accion!=='resolver'&&!orderReady(c)){orderMessage('Esperá una conexión activa y un mensaje autorizado.');return;}
 const mine=generation,chat=c.id;orderBusy=true;orderSignature='';renderOrder(c);orderMessage('Guardando…');
 try{
  const ok=await rpc('wai_pedido',{p_sucursal:sessionLocal.id,p_hilo:chat,p_accion:accion,p_pedido:pedido?.id||null,p_evento:crypto.randomUUID(),...extra});
  if(ok!==true)throw Error('No se confirmó la solicitud.');
  if(mine===generation&&selected===chat)orderMessage(accion==='resolver'?'Reclamo resuelto.':'Solicitud registrada. El aviso figurará en el chat.');
  if(mine===generation)await refresh();
 }catch(e){if(mine===generation&&selected===chat)orderMessage(e.message||'No se confirmó la solicitud. Actualizá el chat antes de repetir.');}
 finally{if(mine===generation){orderBusy=false;orderSignature='';const x=chats.find(v=>v.id===selected);if(x)renderOrder(x);}}
}
async function showOrderPhoto(c,o){
 if(selected!==c.id||!sessionLocal)return;
 const mine=generation;
 try{
  const photo=await rpc('wai_pedido_foto',{p_sucursal:sessionLocal.id,p_pedido:o.id});
  if(mine!==generation||selected!==c.id)return;
  if(typeof photo!=='string'||photo.length>400000||!/^\/9j\/[A-Za-z0-9+/]+={0,2}$/.test(photo))throw Error('Foto no disponible.');
  cancelMessageAction();
  messageActionHost.replaceChildren(node('div',{class:'order-photo'},node('strong',{},'Foto enviada por el cliente'),node('img',{alt:'Foto adjunta al reclamo',src:'data:image/jpeg;base64,'+photo}),button('Cerrar foto',cancelMessageAction)));
 }catch(e){if(mine===generation&&selected===c.id)orderMessage(e.message);}
}
async function attentionAction(c,a){
 if(orderBusy||selected!==c.id||!sessionLocal)return;
 const me=generation,chat=c.id;orderBusy=true;orderSignature='';renderOrder(c);
 try{const ok=await rpc('wai_atencion_accion',{p_sucursal:sessionLocal.id,p_hilo:chat,p_accion:a,p_evento:crypto.randomUUID()});if(ok!==true)throw Error('No se confirmó la solicitud.');if(me===generation){if(selected===chat)orderMessage(a==='sync_revisado'?'Incidencia marcada como revisada.':a==='finalizar'?'Conversación finalizada. Verificá el estado del aviso al cliente.':a==='descartar_pedido'?'Pedido pendiente descartado. El historial se conserva.':a==='enviar'?'Opciones en cola para WhatsApp.':a==='manual'?'Atención manual. Respuestas del menú pausadas.':a==='asistido'?'Atención asistida reactivada.':'Solicitud atendida.');await refresh();}}
 catch(e){if(me===generation&&selected===chat)orderMessage(e.message);}
 finally{if(me===generation){orderBusy=false;orderSignature='';const x=chats.find(v=>v.id===selected);if(x)renderOrder(x);}}
}
const orderMoney=n=>n==null?'—':new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:2,minimumFractionDigits:0}).format(n);
function privateOrderSheet(c,f){
 const row=(label,value)=>node('div',{class:'wai-sheet-row'},node('span',{},label),node('strong',{},value||'Pendiente'));
 const choiceLines=(f.selecciones||[]).map(g=>node('div',{class:'wai-sheet-group'},node('strong',{},g.grupo),...g.valores.map(v=>node('small',{},v.cantidad+' × '+v.nombre))));
 const extras=(f.extras||[]).map(v=>v.nombre+' · '+orderMoney(v.precio));
 const detail=node('details',{class:'wai-order-menu wai-sheet-menu'});
 detail.append(node('summary',{class:'btn order-btn wai-sheet-summary','aria-label':'Ver ficha privada del pedido'},'Ver pedido'),node('div',{class:'wai-order-popover wai-sheet'},
  node('strong',{class:'wai-sheet-title'},'Ficha privada del pedido'),
  node('small',{class:'hint'},'Solo el equipo autorizado del local puede verla.'),
  row('Cliente',f.nombre),row('WhatsApp',c.cliente),row('Pedido',f.producto),...choiceLines,
  row('Adicionales (bebidas, postres, salsas)',extras.length?extras.join(' · '):'Sin adicionales'),
  row('Modalidad',f.modalidad==='delivery'?'Delivery':f.modalidad==='retiro'?'Retiro en el local':'Pendiente'),
  f.modalidad==='delivery'?row('Dirección',f.direccion):null,row('Forma de pago',f.pago?.replaceAll('_',' ')),
  row('Subtotal',orderMoney(f.subtotal)),row('Envío',orderMoney(f.envio)),row('Demora',f.demora),
  row('Total',orderMoney(f.total)),node('span',{class:'order-state'},f.estado==='pendiente'?'Esperando confirmación':f.estado==='confirmado'||f===c.pedidos?.[0]?.ficha?'Confirmado':'Completando datos')));
 return detail;
}
function renderOrder(c){
 if(!orderHost)return;
 orderHost.hidden=false;
 const ready=orderReady(c),orders=c.pedidos||[],last=orders[0],issues=orders.filter(o=>o.valoracion==='problema'&&!o.resuelto);
 const sig=JSON.stringify([c.id,ready,c.transferencia_configurada,c.resena_configurada,orders,c.ficha,orderBusy,c.opciones_activas,c.imagenes_activas,c.atencion_manual,c.atencion_pendiente,c.pedido_pendiente,c.pedido_texto,c.pedidos_habilitados,c.modalidad_detectada,c.seguimiento_min,c.agente_activo,c.ciclo_activo,c.cerrado_at,c.aviso_cierre,c.aviso_cierre_estado,c.alerta_sync,c.alerta_sync_at]);
 if(sig===orderSignature)return;orderSignature=sig;
 const disabled=orderBusy||!ready||!!c.cerrado_at;
 const activeOrder=last&&last.estado!=='entregado',ficha=activeOrder?last.ficha:c.ficha||last?.ficha,collecting=!!c.ficha&&!['pendiente','confirmado'].includes(c.ficha.estado),modeKey=activeOrder?last.modalidad:c.modalidad_detectada;
 const mode=modeKey==='retiro'?'Retiro':modeKey==='delivery'?'Delivery':null;
 const status=c.cerrado_at?'Finalizada':c.atencion_manual?'Manual':c.agente_activo?'Asistente activo':'Asistente apagado';
 const closeDisabled=orderBusy||!c.ciclo_activo||!!c.cerrado_at||!!c.atencion_pendiente||!!c.pedido_pendiente||orders.some(o=>o.estado!=='entregado'||o.valoracion==='problema'&&!o.resuelto);
 const menu=node('details',{class:'wai-order-menu',open:orderMenuOpen,ontoggle:e=>{if(e.currentTarget.isConnected)orderMenuOpen=e.currentTarget.open;}});
 const options=node('div',{class:'wai-order-popover'},node('strong',{},'Gestionar conversación'),
   node('span',{class:'order-state'+(c.atencion_manual?' human-mode':'')},status),
   button('Enviar opciones',()=>{menu.open=false;void attentionAction(c,'enviar');},'btn order-btn',{disabled:disabled||!c.opciones_activas}),
   button('Enviar datos de transferencia',()=>{menu.open=false;void orderAction(c,'transferencia');},'btn order-btn',{disabled:disabled||!c.transferencia_configurada}),
   button(c.atencion_manual?'Reactivar asistente':'Tomar atención manual',()=>{menu.open=false;void attentionAction(c,c.atencion_manual?'asistido':'manual');},'btn order-btn',{disabled:orderBusy||!!c.cerrado_at||!c.agente_activo}),
   c.atencion_pendiente?button('Marcar atendido',()=>{menu.open=false;void attentionAction(c,'atendido');},'btn order-btn',{disabled:orderBusy}):null,
   (c.pedido_pendiente||collecting)?button('Descartar pedido pendiente',()=>{if(confirm('¿Descartar esta solicitud sin borrar sus mensajes?')){menu.open=false;void attentionAction(c,'descartar_pedido');}},'btn order-btn danger',{disabled:orderBusy}):null,
   button('Finalizar chat',()=>{if(confirm('¿Finalizar esta atención? Un mensaje nuevo reabrirá el chat con su historial.')){menu.open=false;void attentionAction(c,'finalizar');}},'btn order-btn',{disabled:closeDisabled}),
   c.aviso_cierre?node('small',{class:'hint'},c.aviso_cierre==='sin_autorizacion'?'Cierre guardado; no se pudo avisar al cliente (ensayo no autorizado).':c.aviso_cierre==='limite'?'Cierre guardado; no se pudo enviar el aviso por el límite de prueba.':'Aviso de cierre: '+({entregado:'Entregado',aceptado:'Enviado',pendiente:'En cola',reservado:'Enviando',incierto:'No confirmado'}[c.aviso_cierre_estado]||'En cola')):null,
   node('small',{class:'hint'},'Consulta de satisfacción: '+(c.seguimiento_min||2)+' min · Ajustes WAI.'),
   !c.transferencia_configurada?node('small',{class:'hint'},'Transferencia: completá los datos en Ajustes.'):null,
   ready&&!c.imagenes_activas?node('small',{class:'hint'},'Fotos de carta: actualizá el conector privado para enviarlas como imagen.'):null,
   c.archivado?node('small',{class:'hint'},'Ensayo vencido. Autorizá el contacto en Vincular.'):null,
   last?.consulta_at?node('small',{class:'hint'},last.valoracion?'Respuesta: '+(last.valoracion==='bien'?'Recibió bien su pedido':'Tuvo un problema con el pedido'):last.consulta_cancelada?'Consulta anterior omitida por nueva atención.':last.consulta_vencida?'Consulta fuera del ensayo.':last.consulta_encolada?'Consulta registrada en el chat.':'Consulta de satisfacción desde '+time(last.consulta_at)):null);
 menu.append(node('summary',{class:'wai-manage','aria-label':'Más opciones de la conversación',title:'Gestionar conversación'},'⋯'),options);
 const info=node('div',{class:'wai-order-info'},node('strong',{},activeOrder?orderLabels[last.estado]||last.estado:c.pedido_pendiente?'Pedido para confirmar':collecting?'Completando pedido':last?.estado==='entregado'?'Pedido entregado':'Atención al cliente'),
   mode?node('span',{class:'order-detected confirmed'},mode):null,
   !mode&&c.pedido_pendiente?node('small',{class:'hint'},'Esperando modalidad'):null,
   c.pedido_pendiente&&c.pedido_texto?node('small',{class:'wai-order-draft',title:c.pedido_texto},c.pedido_texto):null);
 let next=null;
 if(c.pedidos_habilitados!==false&&(!last||last.estado==='entregado'&&!issues.length)&&c.pedido_pendiente===true&&mode&&!c.cerrado_at&&!collecting&&(!c.ficha||c.ficha.estado==='pendiente')){
   next=button('Recibido y en preparación',()=>void orderAction(c,'aceptar'),'btn primary order-btn order-main',{disabled});
 }else if(last?.estado==='preparacion'){
   next=button(last.modalidad==='retiro'?'Listo para retirar':'En camino',()=>void orderAction(c,'listo',last),'btn primary order-btn order-main',{disabled});
 }else if(['listo','en_camino'].includes(last?.estado)){
   next=button('Pedido recibido por el cliente',()=>void orderAction(c,'entregado',last),'btn primary order-btn order-main',{disabled});
 }
 const panel=node('div',{class:'wai-order-strip'+(c.pedido_pendiente&&!activeOrder?' wai-order-alert':'')},info,ficha?privateOrderSheet(c,ficha):null,next,menu);
 const content=[panel];
 if(c.alerta_sync&&c.alerta_sync_at)content.unshift(node('div',{class:'order-complaint compact'},node('strong',{},'⚠ Incidencia de sincronización · '+time(c.alerta_sync_at)),node('small',{},c.alerta_sync.startsWith('voto_')?'Una selección no se confirmó. Pedile al cliente que escriba su respuesta.':'Revisá la conexión y los mensajes recibidos.'),button('Marcar revisado',()=>void attentionAction(c,'sync_revisado'),'btn order-btn',{disabled:orderBusy})));
 if(c.cerrado_at&&c.aviso_cierre)content.unshift(node('div',{class:'wai-close-status'},c.aviso_cierre==='sin_autorizacion'?'⚠ Chat cerrado. No se pudo avisar al cliente: ensayo vencido o sin autorización.':c.aviso_cierre==='limite'?'⚠ Chat cerrado. Se alcanzó el límite de envíos.':'Aviso de cierre: '+({entregado:'entregado',aceptado:'enviado',pendiente:'en cola',reservado:'enviando',incierto:'sin confirmación'}[c.aviso_cierre_estado]||'en cola')));
 for(const issue of issues){
  content.unshift(node('div',{class:'order-complaint compact'},node('strong',{},'⚠ Problema con el pedido'),issue.detalle?node('p',{},issue.detalle):null,node('div',{class:'order-actions'},issue.tiene_foto?button('Ver foto',()=>void showOrderPhoto(c,issue),'btn order-btn'):null,button('Resolver reclamo',()=>{if(confirm('¿El reclamo ya fue atendido?'))void orderAction(c,'resolver',issue);},'btn order-btn',{disabled:orderBusy}))));
 }
 orderHost.replaceChildren(...content);
}
function renderThread(force=false){
 const c=chats.find(x=>x.id===selected);
 if(!c){cancelMessageAction();if(orderHost)orderHost.hidden=true;if(orderStatus)orderStatus.hidden=true;if(historyNotice)historyNotice.hidden=true;selected=null;shell.classList.remove('selected');head.replaceChildren(node('strong',{},'Atención por WhatsApp'));thread.replaceChildren(empty('Tu espacio de atención','Seleccioná una conversación o vinculá el WhatsApp del local. Los clientes siguen escribiendo desde su WhatsApp.'));compose.hidden=true;return;}
 renderOrder(c);
 const saved=historyLabel(c);if(historyNotice){historyNotice.hidden=!saved;historyNotice.textContent=saved;}
 const sig=JSON.stringify([c.mensajes,c.alias,c.nombre_agenda,c.cliente,c.archivado,c.conexion_activa,c.vence_at,c.ciclos,c.cerrado_at]);
 if(force||sig!==lastThreadSignature){
   const nearBottom=thread.scrollHeight-thread.scrollTop-thread.clientHeight<100;lastThreadSignature=sig;
   head.replaceChildren(button('‹',()=>selection(null),'icon-btn back-mobile',{'aria-label':'Volver a chats'}),node('span',{class:'avatar'},'WA'),node('div',{class:'contact-heading'},node('strong',{},displayName(c)),node('small',{},(displayName(c)!==c.cliente?c.cliente+' · ':'')+(c.alias?'Alias de WAI'+(c.nombre_agenda?' · Agenda: '+c.nombre_agenda:''):c.nombre_agenda?'Nombre sincronizado de WhatsApp':'Contacto de ensayo')+(c.vence_at?' · ensayo hasta '+time(c.vence_at):' · historial'))),button(c.alias?'Editar alias':'Asignar alias',()=>openAlias(c),'btn alias-btn',{'aria-label':c.alias?'Editar alias del contacto':'Asignar alias al contacto'}));
   const elements=[];let cycle=null;
   for(const m of c.mensajes||[]){
    if(m.ciclo_id&&m.ciclo_id!==cycle){cycle=m.ciclo_id;const info=(c.ciclos||[]).find(x=>x.id===cycle);elements.push(node('div',{class:'cycle-divider'},'Nueva atención'+(info?' · '+time(info.inicio_at):'')));}
    elements.push(renderMessage(c,m));
   }
   if(c.cerrado_at)elements.push(node('div',{class:'cycle-divider'},'Atención finalizada · '+time(c.cerrado_at)));
   thread.replaceChildren(...(elements.length?elements:[empty('Esperando mensaje','El contacto de prueba debe escribir primero desde WhatsApp.')]));
   if(force||nearBottom)thread.scrollTop=thread.scrollHeight;
 }
 compose.hidden=false;updateComposer();
}
function updateComposer(){const c=chats.find(x=>x.id===selected);const ready=c?.puede_responder===true&&rows.some(r=>r.id===c.linea&&r.estado==='conectado')&&Date.parse(c.vence_at)>Date.now();const unknown=pendingUnknown.get(selected);textarea.placeholder=c?.cerrado_at?'Conversación finalizada · esperá un nuevo mensaje':c&&c.archivado?'Historial guardado · autorizá para responder':c&&c.conexion_activa===false?'Historial guardado · esperando conexión':'Escribí un mensaje';textarea.disabled=!ready||claimed||!!unknown;send.disabled=!ready||claimed||!!unknown||!textarea.value.trim();}
async function respond(){
 const id=selected,txt=textarea.value.trim();
 if(claimed||!id||!txt||send.disabled)return;
 claimed=true;updateComposer();const event=crypto.randomUUID();const mine=generation;
 try{await rpc('wai_bandeja',{p_sucursal:sessionLocal.id,p_accion:'responder',p_piloto:id,p_texto:txt,p_evento:event});if(mine!==generation)return;drafts.delete(id);if(selected===id)textarea.value='';await refresh();}
 catch{if(mine===generation){pendingUnknown.set(id,event);notice.className='notice bad';notice.textContent='No se confirmó la respuesta. El envío queda bloqueado hasta que se verifique en la bandeja.';}}
 finally{claimed=false;if(!destroyed)updateComposer();}
}
function showNotice(error){
 if(error){notice.className='notice bad';notice.textContent='Sin acceso o sin señal verificable. No se pueden enviar respuestas.';return;}
 if(selected&&pendingUnknown.has(selected)){notice.className='notice bad';notice.textContent='Verificando una respuesta incierta. No la repitas hasta comprobar el estado.';return;}
 const disconnected=rows.filter(r=>r.habilitada&&r.estado!=='conectado');
 if(disconnected.length){notice.className='notice bad';notice.textContent='⚠ WhatsApp sin señal verificada en '+disconnected.length+' número(s). Revisá Vincular; pueden quedar mensajes o selecciones sin sincronizar.';return;}
 const warning=chats.filter(c=>c.alerta_sync&&c.alerta_sync_at).sort((a,b)=>Date.parse(b.alerta_sync_at)-Date.parse(a.alerta_sync_at))[0];
 if(warning){notice.className='notice bad';notice.textContent='⚠ Incidencia de sincronización a las '+time(warning.alerta_sync_at)+'. '+(warning.alerta_sync.startsWith('voto_')?'Una selección de WhatsApp no pudo registrarse. Pedile al cliente que escriba su respuesta.':'Se detectó un problema al sincronizar mensajes. Revisá el chat y la conexión.');return;}
 const live=rows.filter(r=>r.estado==='conectado').length;
 notice.className='notice'+(live?' good':'');
 notice.replaceChildren(node('span',{class:'status-dot'}),node('strong',{},live?live+' número(s) con señal de WhatsApp comprobada':rows.length?rows.map(r=>labels[r.estado]||'Estado no verificado').join(' · '):'Sin número autorizado'),node('span',{},'· '+(portal.piloto_disponible?'Bandeja de prueba · atención asistida y manual':'Mensajería comercial todavía no habilitada')));
}
async function refresh(){
 if(running||destroyed||!sessionLocal)return;running=true;const mine=generation,id=sessionLocal.id;
 try{
  const [r,b]=await Promise.all([rpc('wai_conexiones',{p_sucursal:id}),rpc('wai_bandeja',{p_sucursal:id})]);
  if(mine!==generation||destroyed)return;
  rows=Array.isArray(r)?r:[];chats=Array.isArray(b?.chats)?b.chats:[];
  for(const [id,event] of pendingUnknown){const c=chats.find(x=>x.id===id);if(c?.mensajes?.some(m=>m.evento===event)){pendingUnknown.delete(id);drafts.delete(id);if(selected===id)textarea.value='';}}
  const sig=JSON.stringify(chats);if(lastSignature!==sig){lastSignature=sig;renderList();}
  renderThread();void markVisibleRead();showNotice(false);if(drawerKind==='conexion')renderConnection();
 }catch{if(mine===generation&&!destroyed){rows=[];chats=[];lastSignature='';renderList();renderThread();showNotice(true);if(drawerKind==='conexion')renderConnection();}}
 finally{running=false;}
}
function openDrawer(kind){
 settingsPanel?.destruir();settingsPanel=null;drawerBody.replaceChildren();connectionList=null;authorizationHost=null;authorizationDraft=null;drawerKind=kind;overlay.hidden=false;
 drawerTitle.textContent=kind==='config'?'Configuración del local':'Vinculación de WhatsApp';
 if(kind==='config'){
  const host=node('div'),tabs=node('div',{class:'wai-config-tabs'});
  const local=button('Datos del local',()=>{settingsPanel?.destruir();host.waiSettings=null;host.replaceChildren();settingsPanel=window.GestLokChatPanel.montar(host,{sb,embebido:true,waiSlug:slug});},'btn');
  const attention=button('Atención WAI',()=>{settingsPanel?.destruir();settingsPanel=null;void renderAttentionSettings(host);},'btn primary');
  tabs.append(local,attention);drawerBody.append(tabs,host);
  void renderAttentionSettings(host);
 }
 else{renderConnection();void refresh();}
}
async function renderAttentionSettings(host){
 const me=generation,local=sessionLocal?.id,identity=Symbol();host.waiSettings=identity;
 host.replaceChildren(node('p',{class:'hint',style:'padding:18px'},'Cargando configuración de atención…'));
 try{
  const data=await rpc('wai_atencion_config',{p_sucursal:local});
  if(me!==generation||drawerKind!=='config'||!host.isConnected||host.waiSettings!==identity)return;
  const title=node('input',{type:'text',maxlength:120,value:data.pregunta||'',required:true});
  const auto=node('input',{type:'checkbox',checked:data.bienvenida_auto===true});
  const orders=node('input',{type:'checkbox',checked:data.pedidos!==false});
  const agent=node('input',{type:'checkbox',checked:data.agente_activo===true});
  const follow=node('input',{type:'number',min:1,max:20,required:true,value:data.seguimiento_min||2});
  const closeAuto=node('input',{type:'checkbox',checked:data.cierre_auto===true});
  const closeMinutes=node('input',{type:'number',min:1,max:1440,required:true,value:data.cierre_min||15});
  const items=node('div',{class:'wai-setting-options'}),fields=[],status=node('p',{class:'hint',role:'status'});
  const add=()=>{
   if(fields.length>=6)return;row({label:'',respuesta:'',humano:true});
  };
  const row=(o)=>{
   const label=node('input',{type:'text',maxlength:60,required:true,value:o.label||''});
   const answer=node('textarea',{rows:2,maxlength:400,placeholder:'Respuesta configurada para esta opción'});answer.value=o.respuesta||'';
   const person=node('input',{type:'checkbox',checked:o.humano!==false});
   const box=node('div',{class:'wai-setting-card'});
   const f={label,answer,person,box};fields.push(f);
   const remove=button('Quitar',()=>{if(fields.length<=2){status.textContent='Mantené al menos dos opciones.';return;}fields.splice(fields.indexOf(f),1);box.remove();},'btn');
   const sync=()=>{answer.disabled=person.checked;};person.addEventListener('change',sync);sync();
   box.append(node('label',{},'Texto de opción',label),node('label',{class:'wai-check'},person,'Derivar a una persona'),node('label',{},'Respuesta automática',answer),remove);items.append(box);
  };
  for(const o of data.opciones||[])row(o);
  const submit=node('button',{class:'btn primary',type:'submit'},'Guardar atención');
  const form=node('form',{class:'wai-settings',onsubmit:async e=>{
   e.preventDefault();submit.disabled=true;status.textContent='Guardando…';
   try{
    const config={pregunta:title.value.trim(),bienvenida_auto:auto.checked,pedidos:orders.checked,agente_activo:agent.checked,seguimiento_min:Number(follow.value),cierre_auto:closeAuto.checked,cierre_min:Number(closeMinutes.value),opciones:fields.map(f=>({label:f.label.value.trim(),respuesta:f.answer.value.trim(),humano:f.person.checked}))};
    await rpc('wai_atencion_config',{p_sucursal:local,p_config:config});if(me===generation&&host.waiSettings===identity){status.textContent='Configuración guardada para este local.';void refresh();}
   }catch(e){status.textContent=e.message;}finally{submit.disabled=false;}
  }},node('h2',{},'Atención del comercio'),node('p',{class:'hint'},'Estas opciones sirven para productos, servicios, reservas o consultas. Cada local define su propia atención.'),node('label',{},'Pregunta o bienvenida',title),node('label',{class:'wai-check'},agent,'Activar asistente de atención (sin API paga)'),node('p',{class:'hint'},'El asistente interpreta consultas habituales y la modalidad de entrega; si no entiende, deriva a una persona. Envía opciones seleccionables dentro de WhatsApp.'),node('label',{class:'wai-check'},orders,'Habilitar seguimiento de pedidos y entregas'),node('label',{},'Minutos hasta consultar si recibió bien el pedido (1–20 en prueba)',follow),node('h3',{},'Finalización de chats'),node('label',{class:'wai-check'},closeAuto,'Finalizar automáticamente por inactividad'),node('label',{},'Minutos de inactividad',closeMinutes),node('p',{class:'hint'},'Se conserva el historial. Un mensaje nuevo inicia otra atención; no se cierran pedidos, reclamos o solicitudes pendientes.'),node('h3',{},'Opciones personalizadas de WhatsApp'),node('label',{class:'wai-check'},auto,'Enviar menú personalizado al inicio si el asistente está desactivado'),node('p',{class:'hint'},'Prueba con selección nativa por encuesta. Elegí respuesta automática configurada o atención humana. No requiere IA paga.'),items,button('+ Agregar opción',add,'btn'),submit,status);
  host.replaceChildren(form);
 }catch(e){if(host.isConnected)host.replaceChildren(node('p',{class:'error'},e.message));}
}
function closeDrawer(){settingsPanel?.destruir();settingsPanel=null;drawerKind='';authorizationDraft=null;authorizationHost=null;connectionList=null;drawerBody.replaceChildren();overlay.hidden=true;void markVisibleRead();}
let connectionBusy=false;
async function connectionAction(action,id){
 if(connectionBusy)return;connectionBusy=true;
 try{const r=await rpc('wai_conexiones',{p_sucursal:sessionLocal.id,p_accion:action,p_id:id});if(Array.isArray(r))rows=r;drawerStatus.textContent='Solicitud registrada. Esperando señal real.';}
 catch(e){drawerStatus.textContent=e.message;}
 finally{connectionBusy=false;if(drawerKind==='conexion')renderConnection();}
}
async function prepareTrial(row,rotate=false){
 if(!trialEnvironment()||!portal?.administradora||connectionBusy||!row.habilitada)return;
 if(!confirm(rotate?'¿Rotar la clave? El dispositivo anterior dejará de funcionar y deberás importar la nueva configuración.':'¿Preparar esta línea de ensayo? El archivo privado se descarga una sola vez. Solo el contacto que autorices podrá recibir avisos de ensayo.'))return;
 connectionBusy=true;const current=generation;
 try{
  const r=await rpc('wai_conexiones',{p_sucursal:sessionLocal.id,p_accion:rotate?'rotar_clave':'preparar',p_id:row.id});
  if(current!==generation||r?.id!==row.id||typeof r?.clave!=='string'||!/^[a-f0-9]{64}$/.test(r.clave||''))throw Error('No se recibió una configuración válida.');
  const C=window.GESTLOK_CHAT_CONFIG;
  const config={url:C.url,anonKey:C.key,testOnly:true,enableTestMessages:true,sessions:[{id:row.id,number:row.numero,key:r.clave}]};
  const href=URL.createObjectURL(new Blob([JSON.stringify(config,null,2)],{type:'application/json'}));
  const a=node('a',{href,download:'gestlok-wai-config.json'});document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(href),1000);
  drawerStatus.textContent='Configuración privada descargada. Importala en la computadora que ejecutará Node.js. No la compartas.';
  await refresh();
 }catch(e){if(current===generation)drawerStatus.textContent=e.message;}
 finally{connectionBusy=false;if(drawerKind==='conexion')renderConnection();}
}
function renderConnection(){
 if(drawerKind!=='conexion')return;
 // Keep the contact form mounted while the status polls every five seconds.
 if(!connectionList||!connectionList.isConnected){
   authorizationHost=node('div',{class:'authorization-host'});
   connectionList=node('div',{class:'connection-cards'});
   drawerBody.replaceChildren(node('div',{class:'connection-grid'},node('p',{class:'hint'},'Cada comercio vincula su propio número. Un corte de internet se intenta recuperar automáticamente. Si WhatsApp revoca la sesión, el titular deberá escanear un QR nuevo.'),drawerStatus,authorizationHost,connectionList,button('Actualizar señal',()=>void refresh())));
 }
 const cards=rows.map(r=>{
  const box=node('article',{class:'connection-card'},node('h3',{},r.numero),node('strong',{},labels[r.estado]||'Sin estado comprobado'),node('p',{class:'hint'},'Última señal de Node.js: '+(r.senal_at?time(r.senal_at):'Nunca')));
  if(r.estado==='conectado'&&r.wa_verificada_at)box.append(node('p',{class:'hint'},'Última respuesta de WhatsApp: '+time(r.wa_verificada_at)));
  if(r.estado==='verificando')box.append(node('p',{class:'hint'},'El servicio informa conexión, pero WhatsApp todavía no la confirmó. Actualizá el conector y escaneá un QR nuevo.'));
  if(trialEnvironment()&&r.habilitada&&r.preparada&&['conectado','verificando','desconectado','qr_vencido'].includes(r.estado))box.append(button('Volver a vincular (nuevo QR)',()=>openRelink(r.id),'btn primary',{disabled:connectionBusy}));
  if(r.estado==='qr'&&typeof r.qr==='string'&&r.qr.length<=2048&&Date.parse(r.qr_vence)>Date.now()){
   try{const q=window.qrcode(0,'M');q.addData(r.qr);q.make();box.append(node('img',{src:q.createDataURL(5,4),alt:'QR privado de WhatsApp', 'data-expira':r.qr_vence}),node('p',{},'Desde el WhatsApp del local: Dispositivos vinculados → Vincular un dispositivo. Escaneá este código, válido hasta '+time(r.qr_vence)+'.'));}catch{/* No QR simulado */}
  }
  if(r.habilitada&&r.preparada&&['qr','qr_vencido','desconectado'].includes(r.estado))box.append(node('div',{class:'actions'},button('Restablecer señal',()=>void connectionAction('reconectar',r.id),'btn',{disabled:connectionBusy}),button('Generar nuevo QR',()=>void connectionAction('qr',r.id),'btn primary',{disabled:connectionBusy})));
  if(['sin_senal','sin_conector'].includes(r.estado))box.append(node('p',{class:'hint'},'El servicio de conexión debe estar en línea. Contactá a soporte GESTLOK; no hace falta que el cliente te entregue su teléfono.'));
  if(trialEnvironment()&&portal.administradora&&r.habilitada&&!r.preparada)box.append(button('Preparar y descargar configuración',()=>void prepareTrial(r),'btn primary',{disabled:connectionBusy}));
  if(trialEnvironment()&&portal.administradora&&r.habilitada&&r.preparada&&r.estado==='sin_senal')box.append(button('Reemplazar configuración privada',()=>void prepareTrial(r,true),'btn',{disabled:connectionBusy}));
  if(portal.administradora&&portal.piloto_disponible&&r.estado==='conectado'){
    const active=chats.some(c=>c.linea===r.id&&c.piloto_activo);
    box.append(active?node('p',{class:'hint'},'Ensayo autorizado. Pedile al contacto que envíe un mensaje desde su WhatsApp.'):button('Autorizar contacto de ensayo',()=>openAuthorization(r.id),'btn primary',{disabled:connectionBusy}));
    if(active)box.append(button('Cancelar ensayo',()=>void authorize(r.id,true),'btn danger',{disabled:connectionBusy}));
  }
  return box;
 });
 connectionList.replaceChildren(...(cards.length?cards:[node('p',{},'No hay números disponibles.')]));
 if(authorizationDraft){
   const online=rows.some(r=>r.id===authorizationDraft.id&&r.estado==='conectado'&&r.habilitada);
   authorizationDraft.submit.disabled=connectionBusy||!online;
   authorizationDraft.signal.textContent=online?'':'Esperando que vuelva la señal de WhatsApp.';
 }
}
function openRelink(id){
 if(connectionBusy||!authorizationHost||!rows.some(r=>r.id===id&&r.habilitada&&r.preparada))return;
 authorizationDraft=null;
 authorizationHost.replaceChildren(node('article',{class:'connection-card'},node('h3',{},'Volver a vincular este número'),node('p',{class:'hint'},'Se reemplaza únicamente la sesión de este número. Escaneá el QR desde su WhatsApp. El ensayo anterior se cierra; no se cambian otros locales ni sus ajustes.'),node('div',{class:'actions'},button('Confirmar nuevo QR',()=>{authorizationHost.replaceChildren();void connectionAction('revalidar',id);},'btn primary'),button('Volver',()=>authorizationHost.replaceChildren(),'btn'))));
}
function openAuthorization(id){
 if(!portal?.administradora||!portal.piloto_disponible||connectionBusy||!authorizationHost)return;
 if(authorizationDraft?.id===id){authorizationDraft.input.focus();return;}
 const row=rows.find(r=>r.id===id&&r.estado==='conectado'&&r.habilitada);
 if(!row)return;
 const input=node('input',{type:'tel',placeholder:'+54911…',autocomplete:'off',required:true,'aria-label':'Número del contacto de ensayo'});
 const consent=node('input',{type:'checkbox',required:true});
 const signal=node('p',{class:'hint',role:'status'});
 const formStatus=node('p',{class:'hint',role:'status'});
 const submit=node('button',{type:'submit',class:'btn primary'},'Iniciar ensayo');
 const form=node('form',{class:'authorization-form connection-card',onsubmit:async ev=>{
   ev.preventDefault();
   const tester=input.value.trim();
   if(!/^\+[1-9]\d{7,14}$/.test(tester)){formStatus.textContent='Ingresá un número en formato internacional, incluyendo + y código de país.';return;}
   if(!consent.checked){formStatus.textContent='Confirmá que el contacto aceptó participar.';return;}
   await authorize(id,false,tester);
 }},node('h3',{},'Autorizar contacto de ensayo'),node('p',{class:'hint'},'Ingresá el número de OTRO teléfono autorizado. La prueba dura 25 minutos; solo al contacto que aceptó participar. Los estados del pedido y la encuesta pueden enviar avisos automáticos.'),node('label',{},'Número del contacto',input),node('label',{class:'consent-line'},consent,node('span',{},'Este contacto aceptó participar en la prueba.')),signal,formStatus,node('div',{class:'actions'},submit,button('Volver',()=>{if(!connectionBusy){authorizationDraft=null;authorizationHost.replaceChildren();}},'btn')));
 authorizationDraft={id,input,submit,signal,status:formStatus};
 authorizationHost.replaceChildren(form);
 input.focus();
}
async function authorize(id,cancel=false,tester=null){
 if(!portal?.administradora||!portal.piloto_disponible||connectionBusy)return;
 if(!cancel&&(!authorizationDraft||authorizationDraft.id!==id||!/^\+[1-9]\d{7,14}$/.test(tester||'')||!rows.some(r=>r.id===id&&r.estado==='conectado'&&r.habilitada)))return;
 const mine=generation;
 connectionBusy=true;
 if(authorizationDraft)authorizationDraft.submit.disabled=true;
 try{
   await rpc('wai_piloto_autorizar',{p_sucursal:sessionLocal.id,p_id:id,p_tester:tester,p_accion:cancel?'cancelar':'autorizar'});
   if(mine!==generation)return;
   drawerStatus.textContent=cancel?'Ensayo cancelado.':'Ensayo autorizado. Pedile al contacto que envíe un Hola al WhatsApp vinculado.';
   authorizationDraft=null;authorizationHost?.replaceChildren();await refresh();
 }catch(e){if(mine===generation){if(authorizationDraft)authorizationDraft.status.textContent=e.message;else drawerStatus.textContent=e.message;}}
 finally{connectionBusy=false;if(mine===generation&&drawerKind==='conexion')renderConnection();}
}
document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(drawerKind){e.preventDefault();closeDrawer();}else if(actionDraft){e.preventDefault();cancelMessageAction();}else if(selected){e.preventDefault();selection(null);}}});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh();});
setInterval(()=>{for(const im of root.querySelectorAll('[data-expira]'))if(Date.parse(im.dataset.expira)<=Date.now())im.remove();},1000);
sb.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT')setTimeout(()=>{clearPrivate();login();},0);});
void init();
})();

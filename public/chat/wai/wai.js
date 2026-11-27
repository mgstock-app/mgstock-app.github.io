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
let shell,notice,list,search,unreadSummary,thread,head,compose,textarea,send,overlay,drawerBody,drawerTitle,drawerStatus;
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
 generation++;destroyed=true;clearInterval(navigatorTimer);settingsPanel?.destruir();settingsPanel=null;sessionLocal=null;rows=[];chats=[];drafts.clear();pendingUnknown.clear();readBusy.clear();lastSignature='';lastThreadSignature='';selected=null;root.replaceChildren();
}
async function logout(){clearPrivate();await sb.auth.signOut();login();}
function renderShell(){
 const label=sessionLocal.empresa+' · '+sessionLocal.nombre;
 document.title=label+' · GESTLOK WAI';
 notice=node('div',{class:'notice',role:'status'},'Verificando WhatsApp…');
 search=node('input',{class:'search',type:'search',placeholder:'Buscar conversación', 'aria-label':'Buscar conversación',oninput:()=>renderList()});
 list=node('div',{class:'chat-list','aria-label':'Conversaciones'});
 unreadSummary=node('span',{class:'unread-summary','aria-live':'polite',hidden:true});
 head=node('div',{class:'chat-head'});thread=node('div',{class:'thread',role:'log','aria-label':'Mensajes',onscroll:()=>void markVisibleRead()});
 textarea=node('textarea',{placeholder:'Escribí un mensaje',rows:'1',maxlength:'1000','aria-label':'Escribí un mensaje',oninput:()=>{if(selected)drafts.set(selected,textarea.value);updateComposer();}});
 send=node('button',{type:'submit',class:'btn primary',disabled:true},'Enviar');
 compose=node('form',{class:'compose',hidden:true,onsubmit:async e=>{e.preventDefault();await respond();}},textarea,send);
 drawerBody=node('div',{class:'drawer-body'});drawerTitle=node('h2');drawerStatus=node('p',{role:'status',class:'hint'});
 overlay=node('div',{class:'overlay',hidden:true},node('section',{class:'drawer',role:'dialog','aria-modal':'true','aria-label':'Herramientas del local'},node('header',{class:'drawer-head'},drawerTitle,button('×',closeDrawer,'icon-btn',{'aria-label':'Cerrar'})),drawerBody));
 shell=node('main',{class:'shell'},node('header',{class:'topbar'},brand(label),node('div',{class:'top-actions'},
  button('📱 Vincular',()=>openDrawer('conexion'),'toolbar-btn',{'aria-label':'Vincular WhatsApp'}),
  button('⚙',()=>openDrawer('config'),'icon-btn',{'aria-label':'Configuración del local',title:'Configuración'}),
  button('Salir',()=>void logout(),'toolbar-btn',{'aria-label':'Cerrar sesión'}))),notice,
  node('div',{class:'workspace'},node('aside',{class:'inbox'},node('div',{class:'inbox-head'},node('p',{class:'eyebrow'},'Bandeja del local'),node('h2',{class:'inbox-title'},'Conversaciones',unreadSummary),search),list),
   node('section',{class:'chat','aria-label':'Conversación seleccionada'},head,thread,compose)),overlay);
 root.replaceChildren(shell);renderList();renderThread(true);
}
function selection(id){
 if(selected&&textarea)drafts.set(selected,textarea.value);
 selected=id;shell.classList.toggle('selected',!!id);textarea.value=drafts.get(id)||'';lastThreadSignature='';renderList();renderThread(true);void markVisibleRead();
}
function unreadIds(c){return (c?.mensajes||[]).filter(m=>m.direccion==='entrada'&&m.leido===false).map(m=>m.id);}
function renderList(){
 if(!list)return;
 const total=chats.reduce((n,c)=>n+unreadIds(c).length,0);
 if(unreadSummary){unreadSummary.hidden=!total;unreadSummary.textContent=total?total+' sin leer':'';}
 const value=search.value.trim().toLowerCase();const matching=chats.filter(c=>String(c.cliente).includes(value)||c.mensajes?.some(m=>String(m.texto).toLowerCase().includes(value)));
 list.replaceChildren(...(matching.length?matching.map(c=>{
  const count=unreadIds(c).length;
  return node('button',{class:'chat-row'+(count?' unread':''),type:'button','aria-current':String(c.id===selected),'aria-label':c.cliente+(count?' · '+count+' mensaje(s) sin leer':''),onclick:()=>selection(c.id)},node('span',{class:'avatar'},'WA'),node('div',{class:'preview'},node('strong',{},c.cliente),node('small',{},c.mensajes?.at(-1)?.texto||'Esperando primer mensaje de prueba')),count?node('span',{class:'unread-badge',title:count+' mensaje(s) sin leer','aria-hidden':'true'},count):null);
 }):[node('p',{class:'hint',style:'padding:12px'},value?'No hay coincidencias.':'Todavía no hay conversaciones autorizadas.')]));
}
async function markVisibleRead(){
 // Merely polling or opening the connection/configuration drawer is not reading.
 if(!selected||document.hidden||drawerKind||!sessionLocal||destroyed||!thread||!thread.isConnected||thread.scrollHeight-thread.scrollTop-thread.clientHeight>100||readBusy.has(selected))return;
 const c=chats.find(x=>x.id===selected),ids=unreadIds(c);
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
function renderThread(force=false){
 const c=chats.find(x=>x.id===selected);
 if(!c){selected=null;shell.classList.remove('selected');head.replaceChildren(node('strong',{},'Atención por WhatsApp'));thread.replaceChildren(empty('Tu espacio de atención','Seleccioná una conversación o vinculá el WhatsApp del local. Los clientes siguen escribiendo desde su WhatsApp.'));compose.hidden=true;return;}
 const sig=JSON.stringify(c.mensajes);
 if(force||sig!==lastThreadSignature){
   const nearBottom=thread.scrollHeight-thread.scrollTop-thread.clientHeight<100;lastThreadSignature=sig;
   head.replaceChildren(button('‹',()=>selection(null),'icon-btn back-mobile',{'aria-label':'Volver a chats'}),node('span',{class:'avatar'},'WA'),node('div',{},node('strong',{},c.cliente),node('small',{},'Contacto de ensayo · vence '+time(c.vence_at))));
   const states={pendiente:'En cola',reservado:'Procesando',aceptado:'Aceptado por transporte',incierto:'Resultado incierto; no repetir',recibido:'Recibido'};
   thread.replaceChildren(...(c.mensajes?.length?c.mensajes.map(m=>node('div',{class:'bubble'+(m.direccion==='salida'?' out':'')},m.texto,node('small',{},time(m.fecha)+' · '+(states[m.estado]||'Estado sin verificar')))):[empty('Esperando mensaje','El contacto de prueba debe escribir primero desde WhatsApp.')]));
   if(force||nearBottom)thread.scrollTop=thread.scrollHeight;
 }
 compose.hidden=false;updateComposer();
}
function updateComposer(){const c=chats.find(x=>x.id===selected);const ready=c?.puede_responder===true&&rows.some(r=>r.id===c.linea&&r.estado==='conectado')&&Date.parse(c.vence_at)>Date.now();const unknown=pendingUnknown.get(selected);textarea.disabled=!ready||claimed||!!unknown;send.disabled=!ready||claimed||!!unknown||!textarea.value.trim();}
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
 const live=rows.filter(r=>r.estado==='conectado').length;
 notice.className='notice'+(live?' good':'');
 notice.replaceChildren(node('span',{class:'status-dot'}),node('strong',{},live?live+' número(s) con señal de WhatsApp comprobada':rows.length?rows.map(r=>labels[r.estado]||'Estado no verificado').join(' · '):'Sin número autorizado'),node('span',{},'· '+(portal.piloto_disponible?'Bandeja de prueba, sin IA automática':'Mensajería comercial todavía no habilitada')));
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
 if(kind==='config'){const host=node('div');drawerBody.append(host);settingsPanel=window.GestLokChatPanel.montar(host,{sb,embebido:true,waiSlug:slug});}
 else{renderConnection();void refresh();}
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
 if(!confirm(rotate?'¿Rotar la clave? El dispositivo anterior dejará de funcionar y deberás importar la nueva configuración.':'¿Preparar esta línea de ensayo? El archivo privado se descarga una sola vez. No se envían mensajes automáticos.'))return;
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
    const active=chats.some(c=>c.linea===r.id);
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
 }},node('h3',{},'Autorizar contacto de ensayo'),node('p',{class:'hint'},'Ingresá el número de OTRO teléfono autorizado. La prueba dura 25 minutos; solo se permiten mensajes manuales.'),node('label',{},'Número del contacto',input),node('label',{class:'consent-line'},consent,node('span',{},'Este contacto aceptó participar en la prueba.')),signal,formStatus,node('div',{class:'actions'},submit,button('Volver',()=>{if(!connectionBusy){authorizationDraft=null;authorizationHost.replaceChildren();}},'btn')));
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
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&drawerKind)closeDrawer();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh();});
setInterval(()=>{for(const im of root.querySelectorAll('[data-expira]'))if(Date.parse(im.dataset.expira)<=Date.now())im.remove();},1000);
sb.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT')setTimeout(()=>{clearPrivate();login();},0);});
void init();
})();

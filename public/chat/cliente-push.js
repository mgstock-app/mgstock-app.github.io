/* Consentimiento Web Push de clientes, distinto al de dueños y gerentes.
 * Nunca solicita permiso automáticamente ni registra el dispositivo sin una elección. */
(()=>{
 'use strict';
 let slug='',token='',busy=false;
 const cfg=()=>window.GESTLOK_CHAT_CONFIG||{};
 const api=()=>cfg().url.replace(/\/$/,'')+'/functions/v1/gestlok-chat-push';
 const key=()=> 'gestlok-chat:push:v1:'+slug;
 const supports=()=>location.protocol==='https:'&&'Notification' in window&&'serviceWorker' in navigator&&'PushManager' in window;
 const isIOS=()=>/iPad|iPhone|iPod/.test(navigator.userAgent)||
   navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1;
 const installed=()=>window.matchMedia?.('(display-mode:standalone)').matches||navigator.standalone===true;
 const prefs=()=>{try{return JSON.parse(localStorage.getItem(key())||'null')}catch{return null}};
 const save=p=>{try{if(p)localStorage.setItem(key(),JSON.stringify(p));
   else localStorage.removeItem(key())}catch{}};
 const b64array=str=>{
  const pad='='.repeat((4-str.length%4)%4);
  return Uint8Array.from(atob(str.replace(/-/g,'+').replace(/_/g,'/')+pad),c=>c.charCodeAt(0));
 };
 const el=(tag,props={},...children)=>{
   const n=document.createElement(tag);
   for(const [k,v] of Object.entries(props)){
    if(k==='text')n.textContent=v;
    else if(k==='class')n.className=v;
    else if(k==='onclick')n.addEventListener('click',v);
    else if(k==='onchange')n.addEventListener('change',v);
    else if(v!==undefined&&v!==null&&v!==false)n.setAttribute(k,v===true?'':v);
   }
   for(const ch of children.flat())if(ch!=null)n.append(ch instanceof Node?ch:document.createTextNode(String(ch)));
   return n;
 };
 async function configuration(){
   const res=await fetch(api()+'?op=config&slug='+encodeURIComponent(slug),
    {headers:{apikey:cfg().key},cache:'no-store'});
   const data=await res.json();
   if(!res.ok||!data?.ok||!data.publicKey)throw Error('Las notificaciones todavía no están disponibles.');
   return data;
 }
 async function endpoint(op,subscription,p){
  const res=await fetch(api(),{method:'POST',headers:{
    apikey:cfg().key,'content-type':'application/json'
   },body:JSON.stringify({op,slug,token,subscription:subscription.toJSON(),pedidos:!!p?.pedidos,promos:!!p?.promos})});
  const data=await res.json();
  if(!res.ok||!data?.ok)throw Error(data?.error||'No se pudo registrar este dispositivo.');
 }
 async function refresh(){
  if(!supports()||Notification.permission!=='granted'||!prefs()||!slug||!token)return;
  try{
   const reg=await navigator.serviceWorker.getRegistration('/chat/');
   const subscription=await reg?.pushManager.getSubscription();
   if(subscription)await endpoint('subscribe',subscription,prefs());
  }catch{/* La persona puede modificar el permiso desde el menú. */}
 }
 function setup(newSlug,newToken){
   if(!newSlug||!newToken)return;
   slug=newSlug;token=newToken;
   // Reasocia la suscripción existente a una nueva conversación SOLO si ya se autorizó.
   void refresh();
 }
 async function open(){
  if(!slug||!token||busy)return;
  const existing=document.getElementById('gchat-push-modal');
  if(existing){existing.querySelector('button')?.focus();return}
  const overlay=el('div',{id:'gchat-push-modal',class:'gchat-push-fondo'});
  const title=el('h2',{id:'gchat-push-titulo',text:'Notificaciones del local'});
  const description=el('p',{text:'Elegí qué avisos recibir en este dispositivo. Podés desactivarlos cuando quieras.'});
  const state=el('p',{class:'gchat-push-estado',role:'status','aria-live':'polite',text:'Comprobando disponibilidad…'});
  const row=(label,sub,checked)=>{
    const input=el('input',{type:'checkbox'});
    input.checked=checked;
    const wrap=el('label',{class:'gchat-push-opcion'},input,el('span',{},
      el('strong',{text:label}),el('small',{text:sub})));
    return {wrap,input};
  };
  const stored=prefs();
  const pedidos=row('Estado de mi pedido','Confirmación, preparación y listo para retirar o envío.',stored?.pedidos===true);
  const promos=row('Promociones del local','Solo si el comercio habilita campañas y vos las aceptás.',stored?.promos===true);
  const close=()=>{overlay.remove();document.getElementById('btn-notificaciones')?.focus()};
  const cancel=el('button',{type:'button',class:'boton',text:'Cerrar',onclick:close});
  const saveBtn=el('button',{type:'button',class:'boton principal',text:'Guardar y activar',onclick:()=>{
    if(busy)return;
    const p={pedidos:pedidos.input.checked,promos:promos.input.checked};
    if(!p.pedidos&&!p.promos){
      void(async()=>{
        busy=true;saveBtn.disabled=true;
        try{
          const reg=await navigator.serviceWorker.getRegistration('/chat/');
          const sub=await reg?.pushManager.getSubscription();
          if(sub){try{await endpoint('unsubscribe',sub,p)}finally{await sub.unsubscribe()}}
          save(null);state.textContent='Avisos desactivados en este dispositivo.';
          saveBtn.textContent='Avisos desactivados';
        }catch(e){state.textContent=String(e.message||e)}
        finally{busy=false;saveBtn.disabled=false}
      })();
      return;
    }
    // El permiso se solicita durante el gesto del usuario, antes de esperar cualquier red.
    let permission;
    try{permission=Notification.permission==='default'?Notification.requestPermission():Promise.resolve(Notification.permission)}
    catch{state.textContent='Tu navegador no permitió consultar el permiso.';return}
    busy=true;saveBtn.disabled=true;state.textContent='Vinculando dispositivo…';
    Promise.resolve(permission).then(async result=>{
      if(result!=='granted')throw Error('No concediste permiso. Podés activarlo desde la configuración del dispositivo.');
      const c=await configuration();
      const reg=await navigator.serviceWorker.register('/chat/sw.js',{scope:'/chat/',updateViaCache:'none'});
      let sub=await reg.pushManager.getSubscription();
      if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64array(c.publicKey)});
      await endpoint('subscribe',sub,p);
      save(p);state.textContent='Listo. Recibirás solo los avisos que elegiste.';
      saveBtn.textContent='Preferencias guardadas';
    }).catch(e=>{state.textContent=String(e.message||'No pudimos activar los avisos.');})
      .finally(()=>{busy=false;saveBtn.disabled=false});
  }});
  const content=el('section',{class:'gchat-push-dialog',role:'dialog','aria-modal':'true',
    'aria-labelledby':'gchat-push-titulo'},
    title,description,pedidos.wrap,promos.wrap,state,
    el('div',{class:'gchat-push-actions'},cancel,saveBtn));
  overlay.append(content);document.body.append(overlay);
  overlay.addEventListener('click',e=>{if(e.target===overlay)close()});
  overlay.addEventListener('keydown',e=>{if(e.key==='Escape')close()});
  cancel.focus();
  if(!supports()){
    state.textContent='Este navegador no admite notificaciones push. Podés seguir viendo el pedido por chat.';
    saveBtn.disabled=true;return;
  }
  if(isIOS()&&!installed()){
    state.textContent='En iPhone, primero agregá GESTLOK Chat a la pantalla de inicio y abrilo desde el ícono.';
    saveBtn.disabled=true;return;
  }
  if(Notification.permission==='denied'){
    state.textContent='Las notificaciones están bloqueadas. Podés habilitarlas desde los ajustes del navegador.';
    saveBtn.disabled=true;return;
  }
  try {
    const c=await configuration();
    promos.input.disabled=!c.promocionesHabilitadas;
    if(!c.promocionesHabilitadas){
      promos.input.checked=false;
      promos.wrap.querySelector('small').textContent='Este local todavía no habilitó promociones.';
    }
    state.textContent=stored?'Podés actualizar tus preferencias.':'Todavía no diste permiso. Elegí tus avisos y activalos.';
  }catch(e){
    state.textContent=String(e.message||'No se pudo cargar el servicio.');
    saveBtn.disabled=true;
  }
 }
 window.GestLokChatPush=Object.freeze({setup,open,refresh});
})();

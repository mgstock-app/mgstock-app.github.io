/* GestLok · Soporte por WhatsApp para dueños, gerentes y colaboradores.
 * La configuración es global, editada solo por la creadora.
 * No envía mensajes, no escribe chats ni comparte datos de inventario. */
(() => {
  'use strict';
  const SUPPORT_PHONE='5491144715168';
  const BUBBLE_POSITION_KEY='gestlok:support-bubble-position-v1';
  let cleanupBubble=()=>{};
  let api=null, phone=SUPPORT_PHONE, loaded=true, loading=false, failure='', busy=false, fetchVersion=0;
  const $=q=>document.querySelector(q);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const allowed=()=>!!(api?.S?.db&&api?.S?.me);
  const creator=()=>!!(api?.isCreadora?.()&&api?.S?.me&&api?.S?.db);
  const client=()=>window.GestLokSupabase;
  const valid=s=>/^[1-9][0-9]{7,14}$/.test(s);
  function normalized(value){
    let digits=String(value??'').replace(/[\s()+.-]/g,'');
    if(/^0?11\d{8}$/.test(digits))digits='549'+digits.replace(/^0/,'');
    else if(/^5411\d{8}$/.test(digits))digits='549'+digits.slice(2);
    else if(/^54011\d{8}$/.test(digits))digits='549'+digits.slice(3);
    return valid(digits)?digits:'';
  }
  function ownerName(){
    // Mi Gusto tiene varios dueños autorizados; el nombre comercial de referencia es Gisela.
    // No depende del orden de integrantes del equipo ni altera sus permisos.
    const company=String(api?.S?.companyName||api?.S?.company_name||'').trim();
    if(company.toLocaleLowerCase('es-AR')==='mi gusto')return 'Gisela';
    const own=api?.S?.equipo?.find(e=>e.rol==='dueno');
    const value=String(own?.nombre||own?.name||
      (api?.miRol?.()==='dueno'?api?.S?.me?.name:'')||'').trim();
    return value.slice(0,100)||'dueño';
  }
  function sector(){
    const s=api?.S||{};
    const names={
      inicio:'Inicio',proveedores:'Proveedores',chat:'Chat del local',
      'pedidos-online':'Pedidos online','tienda-online':'Mi tienda',
      diario:'Conteo Diario',vencimientos:'Vencimientos',avisos:'Avisos',
      ingreso:'Ingreso de mercadería'
    };
    const molino=window.GestLokMolino?.sectionName?.();
    if(molino)return ('Vínculo entre sucursales / '+molino).slice(0,140);
    if(s.view==='proveedores'&&s.provOpen)
      return ('Proveedores / '+s.provOpen).slice(0,140);
    const name=s.local ? names[s.view]||api?.nombreHoja?.(s.view)||'Inicio' : 'Inicio';
    return String(name).trim().slice(0,140)||'Inicio';
  }
  function message(){
    const local=String(api?.localNombre?.()||api?.S?.localName||api?.S?.local||'Local').trim().slice(0,100);
    let authorized='';try{authorized=window.GestLokOwnerAreas?.companyName?.()||'';}catch{}
    const company=String(api?.S?.companyName||api?.S?.company_name||authorized||'Empresa').trim().slice(0,100);
    return 'Hola, soy de '+company+' - '+local+'. Necesito soporte en '+sector()+'.';
  }
  function link(){
    return 'https://wa.me/'+SUPPORT_PHONE+'?text='+encodeURIComponent(message());
  }
  // Una sola burbuja para todos los locales. Arrastrar no abre WhatsApp;
  // tocar o usar Enter sigue abriendo el enlace de soporte contextual.
  function installBubble(el){
    const margin=12;
    let active=null, blockClick=false, placed=false;
    const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
    const bounds=()=>{
      const rect=el.getBoundingClientRect();
      const width=window.innerWidth||document.documentElement?.clientWidth||360;
      const height=window.innerHeight||document.documentElement?.clientHeight||640;
      return {minX:margin,minY:margin,
        maxX:Math.max(margin,width-rect.width-margin),
        maxY:Math.max(margin,height-rect.height-margin)};
    };
    const place=(x,y)=>{
      const b=bounds(),left=clamp(x,b.minX,b.maxX),top=clamp(y,b.minY,b.maxY);
      el.style.left=left+'px';el.style.top=top+'px';
      el.style.right='auto';el.style.bottom='auto';placed=true;
      return {left,top,b};
    };
    const save=()=>{
      if(!placed)return;
      const r=el.getBoundingClientRect(),b=bounds();
      const x=(r.left-b.minX)/Math.max(1,b.maxX-b.minX);
      const y=(r.top-b.minY)/Math.max(1,b.maxY-b.minY);
      try{window.localStorage?.setItem(BUBBLE_POSITION_KEY,JSON.stringify({v:1,x:clamp(x,0,1),y:clamp(y,0,1)}));}catch{}
    };
    const restore=()=>{
      try{
        const p=JSON.parse(window.localStorage?.getItem(BUBBLE_POSITION_KEY)||'null');
        if(p?.v!==1||!Number.isFinite(p.x)||!Number.isFinite(p.y)||
           p.x<0||p.x>1||p.y<0||p.y>1)return;
        const b=bounds();
        place(b.minX+p.x*(b.maxX-b.minX),b.minY+p.y*(b.maxY-b.minY));
      }catch{}
    };
    const down=e=>{
      if(e.pointerType==='mouse'&&e.button!==0)return;
      const r=el.getBoundingClientRect();
      active={id:e.pointerId,x:e.clientX,y:e.clientY,left:r.left,top:r.top,moved:false};
      blockClick=false;
      try{el.setPointerCapture?.(e.pointerId);}catch{}
    };
    const move=e=>{
      if(!active||active.id!==e.pointerId)return;
      const dx=e.clientX-active.x,dy=e.clientY-active.y;
      if(!active.moved&&Math.hypot(dx,dy)<7)return;
      active.moved=true;blockClick=true;
      el.classList?.add('gl-soporte-is-dragging');
      place(active.left+dx,active.top+dy);
      e.preventDefault?.();
    };
    const up=e=>{
      if(!active||active.id!==e.pointerId)return;
      if(active.moved)save();
      el.classList?.remove('gl-soporte-is-dragging');
      if(el.hasPointerCapture?.(e.pointerId))el.releasePointerCapture?.(e.pointerId);
      active=null;
    };
    const click=e=>{
      if(blockClick){e.preventDefault();e.stopImmediatePropagation?.();blockClick=false;return;}
      el.href=link();
    };
    const keyboard=e=>{
      const step=24,delta={ArrowLeft:[-step,0],ArrowRight:[step,0],ArrowUp:[0,-step],ArrowDown:[0,step]}[e.key];
      if(!delta)return;
      e.preventDefault();
      const r=el.getBoundingClientRect();
      place(r.left+delta[0],r.top+delta[1]);save();
    };
    el.addEventListener('pointerdown',down);
    el.addEventListener('pointermove',move);
    el.addEventListener('pointerup',up);
    el.addEventListener('pointercancel',up);
    el.addEventListener('click',click,true);
    el.addEventListener('keydown',keyboard);
    const resize=()=>{
      if(!placed)return;
      // La ubicación guardada se reacomoda al rotar el celular o redimensionar la ventana.
      restore();
      const r=el.getBoundingClientRect();place(r.left,r.top);
    };
    window.addEventListener?.('resize',resize);
    restore();
    return ()=>window.removeEventListener?.('resize',resize);
  }
  function widget(){
    let el=$('#gl-soporte-whatsapp');
    const visible=allowed();
    if(!visible){
      cleanupBubble();cleanupBubble=()=>{};
      el?.remove();
      return;
    }
    const url=link();
    if(!el){
      el=document.createElement('a');
      el.id='gl-soporte-whatsapp';
      el.className='gl-soporte-float';
      el.target='_blank';
      el.rel='noopener noreferrer';
      el.setAttribute('aria-label','Soporte por WhatsApp. Arrastrá para mover');
      el.title='Soporte por WhatsApp · arrastrá para mover';
      el.innerHTML='<span class="gl-soporte-icon" aria-hidden="true">'+
        '<svg viewBox="0 0 32 32" fill="currentColor" aria-hidden="true" focusable="false">'+
        '<path d="M16.01 2.4A13.55 13.55 0 0 0 4.35 22.9L2.5 29.5l6.77-1.79A13.62 13.62 0 1 0 16.01 2.4Zm0 24.8c-2.1 0-4.18-.57-5.97-1.66l-.43-.25-4.02 1.06 1.07-3.91-.28-.45a11.06 11.06 0 1 1 9.63 5.21Zm6.08-8.27c-.33-.16-1.95-.96-2.25-1.07-.3-.11-.52-.16-.74.16-.22.33-.86 1.07-1.05 1.29-.19.22-.38.25-.71.08-.33-.16-1.39-.51-2.65-1.64-.98-.87-1.64-1.94-1.83-2.27-.19-.33-.02-.5.14-.66.14-.15.33-.39.49-.58.16-.19.22-.33.33-.55.11-.22.05-.41-.03-.58-.08-.16-.74-1.78-1.01-2.44-.27-.64-.54-.55-.74-.56h-.63c-.22 0-.58.08-.88.41-.3.33-1.15 1.13-1.15 2.76s1.18 3.2 1.34 3.43c.16.22 2.32 3.54 5.62 4.97.78.34 1.4.54 1.88.69.79.25 1.51.21 2.08.13.63-.09 1.95-.8 2.22-1.57.27-.77.27-1.44.19-1.57-.08-.14-.3-.22-.63-.39Z"/></svg></span>'+
        '<span class="gl-soporte-name">Soporte</span>';
      document.body.appendChild(el);
      cleanupBubble=installBubble(el);
    }
    el.href=url;
  }
  function adminCard(){
    if(!creator())return '';
    return '<section class="gl-admin-card gl-support-settings" aria-label="Número de WhatsApp de soporte">'+
      '<header><h2>Soporte por WhatsApp</h2><small>Solo la creadora puede editarlo</small></header>'+
      '<p>El botón Soporte de dueños, gerentes y colaboradores abre un chat con el número configurado y escribe automáticamente su local, dueño y sector.</p>'+
      '<form id="gl-support-form" class="gl-support-form">'+
      '<label for="gl-support-phone">Número de WhatsApp (con código de país)</label>'+
      '<div class="gl-support-fields"><input id="gl-support-phone" name="telefono" type="tel" inputmode="tel" autocomplete="tel" maxlength="25" value="'+esc(phone?('+'+phone):'')+'" placeholder="+54 9 11 4471 5168" required '+(!loaded||busy?'disabled':'')+'>'+
      '<button class="btn primary" type="submit" '+(!loaded||busy?'disabled':'')+'>Guardar número</button></div>'+
      '<small id="gl-support-current" aria-live="polite">'+(failure?esc(failure):loaded?'Número activo: +'+esc(phone):'Cargando número de soporte…')+'</small>'+
      '</form></section>';
  }
  function syncCard(){
    const msg=$('#gl-support-current');
    if(msg)msg.textContent=failure||(!loaded?'Cargando número de soporte…':'Número activo: +'+phone);
    const input=$('#gl-support-phone');
    if(input){
      input.disabled=!loaded||busy;
      if(document.activeElement!==input)input.value=phone?'+'+phone:'';
    }
    const submit=$('#gl-support-form button[type="submit"]');
    if(submit)submit.disabled=!loaded||busy;
  }
  async function load(){phone=SUPPORT_PHONE;loaded=true;loading=false;failure='';widget();syncCard();}
  async function save(form){
    if(!creator()||busy||!loaded)return;
    const num=normalized(new FormData(form).get('telefono'));
    if(!num){api.toast('Ingresá un número válido con código internacional.',true);return;}
    api.toast('El número de soporte es fijo para todos los locales.',true);return;
    busy=true;syncCard();
    try{
      const {data,error}=await client().rpc('gestlok_support_set_phone',{p_phone:num});
      if(error)throw error;
      if(data!==num)throw Error('No se confirmó la actualización.');
      phone=data;failure='';loaded=true;api.toast('Número de soporte actualizado.');
      widget();
    }catch(e){
      api.toast('No se pudo actualizar el número. Revisá tu permiso y conexión.',true);
      await load(true);
    }finally{busy=false;syncCard();}
  }
  document.addEventListener('submit',e=>{
    if(e.target.id==='gl-support-form'){
      e.preventDefault();save(e.target);
    }
  });
  // Vuelve a verificar el número si la aplicación permanece abierta.
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='visible'&&api?.S?.me)load(true);
  });
  window.setInterval?.(()=>{if(api?.S?.me&&!document.hidden)load(true);},120000);
  window.GestLokSupport=Object.freeze({
    attach(ctx){api=ctx;},
    render(){widget();syncCard();if(!loaded&&!loading)Promise.resolve().then(()=>load());},
    adminCard,link,message,sector,normalized,load
  });
})();
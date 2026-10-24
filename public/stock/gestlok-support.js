/* GestLok · Soporte por WhatsApp para Dueño/Gerente.
 * La configuración es global, editada solo por la creadora.
 * No envía mensajes, no escribe chats ni comparte datos de inventario. */
(() => {
  'use strict';
  let api=null, phone='', loaded=false, loading=false, failure='', busy=false, fetchVersion=0;
  const $=q=>document.querySelector(q);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const allowed=()=>!!(api?.S?.db&&api?.S?.me&&['dueno','gerente'].includes(api.miRol?.()));
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
    if(s.view==='proveedores'&&s.provOpen)
      return ('Proveedores / '+s.provOpen).slice(0,140);
    const name=names[s.view]||api?.nombreHoja?.(s.view)||'Inicio';
    return String(name).trim().slice(0,140)||'Inicio';
  }
  function message(){
    return 'Hola soy de '+String(api?.localNombre?.()||'mi local').trim().slice(0,100)+
      ' de la empresa de '+ownerName()+
      ' necesito ayuda en el sector de '+sector();
  }
  function link(){
    return valid(phone)?'https://wa.me/'+phone+'?text='+encodeURIComponent(message()):'';
  }
  function widget(){
    let el=$('#gl-soporte-whatsapp');
    const visible=allowed()&&!!api?.S?.local&&valid(phone);
    if(!visible){
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
      el.setAttribute('aria-label','Soporte por WhatsApp');
      el.title='Soporte: abrir conversación en WhatsApp';
      el.innerHTML='<span class="gl-soporte-icon" aria-hidden="true">'+
        '<svg viewBox="0 0 32 32" fill="currentColor" aria-hidden="true" focusable="false">'+
        '<path d="M16.01 2.4A13.55 13.55 0 0 0 4.35 22.9L2.5 29.5l6.77-1.79A13.62 13.62 0 1 0 16.01 2.4Zm0 24.8c-2.1 0-4.18-.57-5.97-1.66l-.43-.25-4.02 1.06 1.07-3.91-.28-.45a11.06 11.06 0 1 1 9.63 5.21Zm6.08-8.27c-.33-.16-1.95-.96-2.25-1.07-.3-.11-.52-.16-.74.16-.22.33-.86 1.07-1.05 1.29-.19.22-.38.25-.71.08-.33-.16-1.39-.51-2.65-1.64-.98-.87-1.64-1.94-1.83-2.27-.19-.33-.02-.5.14-.66.14-.15.33-.39.49-.58.16-.19.22-.33.33-.55.11-.22.05-.41-.03-.58-.08-.16-.74-1.78-1.01-2.44-.27-.64-.54-.55-.74-.56h-.63c-.22 0-.58.08-.88.41-.3.33-1.15 1.13-1.15 2.76s1.18 3.2 1.34 3.43c.16.22 2.32 3.54 5.62 4.97.78.34 1.4.54 1.88.69.79.25 1.51.21 2.08.13.63-.09 1.95-.8 2.22-1.57.27-.77.27-1.44.19-1.57-.08-.14-.3-.22-.63-.39Z"/></svg></span>'+
        '<span class="gl-soporte-name">Soporte</span>';
      el.addEventListener('click',()=>{el.href=link();});
      document.body.appendChild(el);
    }
    el.href=url;
  }
  function adminCard(){
    if(!creator())return '';
    return '<section class="gl-admin-card gl-support-settings" aria-label="Número de WhatsApp de soporte">'+
      '<header><h2>Soporte por WhatsApp</h2><small>Solo la creadora puede editarlo</small></header>'+
      '<p>El botón Soporte de Dueños y Gerentes abre un chat con el número configurado y escribe automáticamente su local, dueño y sector.</p>'+
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
  async function load(force=false){
    if(loading||(!force&&loaded)||!client()||!api?.S?.me||!api?.S?.db)return;
    if(!creator()&&!allowed())return;
    const account=String(api.S.me.email||'');
    const version=++fetchVersion;
    loading=true;failure='';
    try{
      const {data,error}=await client().from('gestlok_support_settings')
        .select('whatsapp').eq('id','global').single();
      if(error)throw error;
      if(account!==String(api?.S?.me?.email||'')||version!==fetchVersion)return;
      if(!valid(String(data?.whatsapp||'')))throw Error('Número no configurado.');
      phone=data.whatsapp;loaded=true;failure='';
    }catch(e){
      if(account===String(api?.S?.me?.email||'')){
        failure='No se pudo cargar el número de soporte. Revisá la conexión.';
        // No usar un destinatario antiguo si no se verificó la configuración.
        phone='';loaded=false;
      }
    }finally{
      if(version===fetchVersion){loading=false;widget();syncCard();}
    }
  }
  async function save(form){
    if(!creator()||busy||!loaded)return;
    const num=normalized(new FormData(form).get('telefono'));
    if(!num){api.toast('Ingresá un número válido con código internacional.',true);return;}
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
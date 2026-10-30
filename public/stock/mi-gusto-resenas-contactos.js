/* Mi Gusto · Mensaje guardado por sucursal, portapapeles y WhatsApp.
   Complemento visual: no toca la autoridad de cupones ni vincula descuentos con reseñas.
   Los permisos de las plantillas se validan en Supabase, no en esta pantalla. */
(() => {
  'use strict';
  const original=window.GestLokResenas;
  if(!original || original.__communications) return;
  const E=original._t.E;
  const LOC={munro:'Munro',torcuato:'Torcuato'};
  const DEFAULT={
    munro:'🥟 ¡Gracias por elegir Mi Gusto! 🖤\n\nNos encanta saber qué te pareció tu experiencia. Si tenés un minutito, nos ayudaría mucho que nos dejes tu opinión en Google. ⭐\n\n🔗 https://g.page/r/CZKKTkNsZpoiEBM/review\n\n¡Y si querés compartirnos una captura por acá, nos encantaría leerte! 😊\n\n¡Gracias por acompañarnos!',
    torcuato:'🥟 ¡Gracias por elegir Mi Gusto! 🖤\n\nNos encanta saber qué te pareció tu experiencia. Si tenés un minutito, nos ayudaría mucho que nos dejes tu opinión en Google. ⭐\n\n¡Y si querés compartirnos una captura por acá, nos encantaría leerte! 😊\n\n¡Gracias por acompañarnos!'
  };
  let api=null, messages=Object.create(null),loaded=Object.create(null),generation=0;
  let editing=false,draft=null,busy=false,error='',notice='',lastLocal='';
  const local=()=>api?.S?.local;
  const allowed=()=>original.permitido?.()===true && local() in LOC;
  const editable=()=>allowed() && !api.S.offline && navigator.onLine!==false && !busy;
  const current=()=>messages[local()]||DEFAULT[local()]||'';
  const redraw=()=>api?.render?.();
  const clipboardIcon='<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="7" width="12" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h2"/></svg>';
  const whatsappIcon='<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="#25D366"/><path d="M7.5 7.6c.6-.5 1.4-.3 1.7.4l.9 1.7c.2.5 0 .9-.4 1.2l-.5.5c.8 1.3 1.9 2.4 3.4 3.1l.5-.5c.3-.5.8-.6 1.3-.4l1.7.8c.7.3.8 1 .3 1.7-.7.8-1.4 1-2.4.8-3.5-.7-6.1-3.3-6.9-6.7-.2-1 .1-1.9.4-2.6Z" fill="#fff"/></svg>';
  const phoneNumber=(v)=>{
    const n=original._t.normalizePhone(v);
    return /^\d{10}$/.test(n)?'549'+n:'';
  };
  async function copy(text,label){
    try{
      if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(text);
      else {
        const area=document.createElement('textarea');
        area.value=text;area.style.position='fixed';area.style.left='-9999px';
        document.body.appendChild(area);area.select();
        const ok=document.execCommand?.('copy');area.remove();
        if(!ok)throw Error('Portapapeles no disponible');
      }
      api.toast?.(label||'Texto copiado.');
    }catch{api.toast?.('No se pudo copiar. Revisá los permisos del portapapeles.',true);}
  }
  async function loadMessage(){
    const loc=local(),g=generation;
    if(!allowed()||!editable()||loaded[loc])return;
    loaded[loc]=true;
    try{
      const {data,error:e}=await window.GestLokSupabase.rpc('gestlok_resenas_message_get',{p_local:loc});
      if(e)throw e;
      if(g!==generation||loc!==local()||!allowed())return;
      if(data?.body) messages[loc]=data.body;
      error='';
    }catch{
      if(g===generation) {loaded[loc]=false;error='No se pudo consultar el mensaje. Se muestra la versión sugerida.';}
    }finally{
      if(g===generation&&api?.S?.view==='resenas'&&!editing&&document.activeElement?.id!=='rv-search')redraw();
    }
  }
  function panel(){
    if(!allowed())return '';
    const edit=editing;
    return '<section class="rv-message-panel" aria-label="Mensaje para clientes">'+
      '<div class="rv-message-head"><div><h3>Mensaje para clientes</h3><small>'+E(LOC[local()])+' · Invitación voluntaria, sin condición de cupón</small></div>'+
      (!edit?'<button type="button" data-gl-rv="edit-message" '+(editable()?'':'disabled')+'>✎ Editar mensaje</button>':'')+'</div>'+
      (error?'<p role="alert">'+E(error)+'</p>':'')+
      (notice?'<p role="status">'+E(notice)+'</p>':'')+
      (edit?'<form id="rv-message-template-form"><label>Texto guardado para '+E(LOC[local()])+
        '<textarea name="message" minlength="30" maxlength="2000" required rows="7">'+E(draft===null?current():draft)+'</textarea></label>'+
        '<div class="rv-message-controls"><button class="rv-message-save" type="submit" '+(busy?'disabled':'')+'>Guardar mensaje</button>'+
        '<button type="button" data-gl-rv="cancel-message" '+(busy?'disabled':'')+'>Cancelar</button></div></form>':
        '<p class="rv-message-preview">'+E(current())+'</p>'+
        '<p class="rv-message-info">Copiá este mensaje con el ícono de portapapeles junto al cliente. Después abrí su WhatsApp. El cupón es independiente de publicar reseñas.</p>')+
      '</section>';
  }
  function couponRule(){
    return '<div class="rv-benefit-terms"><strong>10% OFF · Mi Gusto '+E(LOC[local()])+'</strong>'+
      '<p>Válido de lunes a jueves, en compras de <b>más de 6 unidades</b> (7 o más).</p>'+
      '<p>Uso exclusivo en la sucursal '+E(LOC[local()])+'. No acumulable con otras promociones de la marca.</p></div>';
  }
  function rowButtons(html){
    return html.replace(/<tr><td>([^<]*)<\/td><td>([^<]*)<\/td><td><b>([^<]*)<\/b><\/td>([\s\S]*?)<\/tr>/g,
      (whole,name,phone)=>{
        const number=phoneNumber(phone);
        const m=whole.match(/data-rv="edit" data-id="([^"]+)"/);
        if(!m)return whole;
        const invite='<button type="button" data-gl-rv="copy-message" title="Copiar mensaje para '+E(name)+'" aria-label="Copiar mensaje para '+E(name)+'" class="rv-clip">'+clipboardIcon+'</button>';
        const wa=number?
          '<a href="https://wa.me/'+number+'" target="_blank" rel="noopener noreferrer" class="rv-whatsapp" title="Abrir WhatsApp de '+E(name)+'" aria-label="Abrir WhatsApp de '+E(name)+'">'+whatsappIcon+'</a>':
          '<span class="rv-no-whatsapp" title="Número inválido">WA</span>';
        return whole.replace(/(<button data-rv="edit" data-id="[^"]+">[^<]*<\/button>)(<\/td><\/tr>)/,
          (match,button,end)=>'<span class="rv-row-actions">'+button+invite+wa+'</span>'+end);
      });
  }
  function couponText(code,valid){
    return '🥟 MI GUSTO · '+LOC[local()]+'\n🎟️ CUPÓN '+code+' · 10% OFF\n'+
      '📅 '+(valid||'Válido del 1 al 12 del mes indicado')+' · Lunes a jueves.\n'+
      '🛍️ En compras de más de 6 unidades (7 o más).\n'+
      '📍 Exclusivo para Mi Gusto '+LOC[local()]+'.\n'+
      '🚫 No acumulable con otras promociones de la marca.\n'+
      '🔒 De un solo uso.\n\n¡Te esperamos! 🖤';
  }
  const viewOriginal=original.view;
  original.view=function(){
    let html=viewOriginal();
    if(local()!==lastLocal){lastLocal=local();editing=false;draft=null;error='';notice='';}
    if(!allowed()||!html)return html;
    html=html.replace('<button class="rv-new" data-rv="new"',panel()+'<button class="rv-new" data-rv="new"');
    html=rowButtons(html);
    html=html.replace(/(<div class="rv-code">[\s\S]*?<\/div>)/,(block)=>{
      const code=block.match(/<strong>([^<]+)<\/strong>/)?.[1]||'';
      const valid=html.match(/<p>▣ Válido ([^<]+)<\/p>/)?.[1]||'';
      return block+couponRule()+(code&&code!=='Al guardar'?
        '<button class="rv-copy-coupon" type="button" data-gl-rv="copy-coupon" data-code="'+E(code)+'" data-valid="'+E(valid)+'">'+clipboardIcon+' Copiar cupón con condiciones</button>':'');
    });
    return html;
  };
  const attachOriginal=original.attach;
  original.attach=function(ctx){api=ctx;attachOriginal(ctx);};
  const subscribeOriginal=original.subscribe;
  original.subscribe=function(loc,push){subscribeOriginal(loc,push);void loadMessage();};
  const resetOriginal=original.reset;
  original.reset=function(){
    generation++;messages=Object.create(null);loaded=Object.create(null);
    editing=false;draft=null;busy=false;error='';notice='';lastLocal='';resetOriginal();
  };
  async function saveMessage(form){
    if(!editable())return;
    const next=String(new FormData(form).get('message')||'').trim();
    draft=next;
    if(next.length<30||next.length>2000){error='El mensaje debe tener entre 30 y 2000 caracteres.';redraw();return;}
    busy=true;error='';notice='';
    const loc=local(),g=generation;
    try{
      const {data,error:e}=await window.GestLokSupabase.rpc('gestlok_resenas_message_save',{p_local:loc,p_body:next});
      if(e)throw e;
      if(g!==generation||loc!==local()||!allowed())return;
      if(data?.local!==loc||data?.body!==next)throw Error('Error de guardado');
      messages[loc]=data.body;loaded[loc]=true;
      editing=false;draft=null;notice='Mensaje guardado correctamente para '+LOC[loc]+'.';
      api.toast?.(notice);
    }catch{if(g===generation)error='No se pudo guardar. El texto permanece en el editor para reintentar.';}
    finally{if(g===generation){busy=false;redraw();}}
  }
  document.addEventListener('click',e=>{
    const el=e.target.closest?.('[data-gl-rv]');
    if(!el)return;
    e.preventDefault();e.stopImmediatePropagation();
    if(!allowed())return;
    const action=el.dataset.glRv;
    if(action==='copy-message') {void copy(current(),'Invitación copiada.');return;}
    if(action==='copy-coupon'){void copy(couponText(el.dataset.code,el.dataset.valid),'Cupón y condiciones copiados.');return;}
    if(action==='edit-message'&&editable()){editing=true;draft=current();notice='';error='';redraw();return;}
    if(action==='cancel-message'&&!busy){editing=false;draft=null;error='';redraw();}
  },true);
  document.addEventListener('input',e=>{if(e.target?.name==='message'&&e.target?.form?.id==='rv-message-template-form')draft=e.target.value;},true);
  document.addEventListener('submit',e=>{
    if(e.target?.id!=='rv-message-template-form')return;
    e.preventDefault();e.stopImmediatePropagation();
    if(allowed())void saveMessage(e.target);
  },true);
  window.GestLokResenasComunicaciones=Object.freeze({
    permitted:allowed,phoneNumber,couponText,defaultMessage:loc=>DEFAULT[loc],reset:()=>original.reset()
  });
  original.__communications=true;
})();
